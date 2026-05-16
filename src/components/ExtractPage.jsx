import { useState, useRef, useCallback } from 'react'
import { classifyCard } from '../utils/dedup'

// ── Gemini 호출 ──────────────────────────────────────────────
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']

const SYSTEM_PROMPT = `당신은 법학 시험 두문자(두문자어) 카드를 빠짐없이 추출하는 전문가입니다.

【절대 규칙】 단 하나의 두문자도 놓치지 말 것. 확신이 없어도 추출하고, 나중에 사용자가 판단한다.

【두문자 인식 기준 — 아래 패턴 중 하나라도 해당하면 추출】
1. 점(.) 구분형: "이.가.게.귀.위", "보.필.불.대", "동.매.철"
2. 괄호 설명형: "준.통.수 [준비완료·통지·수령]"
3. 한글 약어 나열: "모.사.실", "강.손.해.책", "변.대.공"
4. 꺽쇠 요건/효과: "<요건>이.가.게.귀.위 <효과>강.손.해.책" → 각각 별도 카드로
5. 비고 설명형: "[의무위반/상당인과관계/손해범위]" 앞에 두문자가 있으면 추출
6. 조항 번호와 결합: "392조 강.손.해.책", "451조 동.기"
7. 단어 축약형: "출.구.정", "항.전", "적.기.해"
8. 영어·숫자 포함: "파.판.5.도", "소.객.도 안.지"
9. 한자 포함: "생.원.유", "묘.지.명.철.귀.무.기.침"
10. 특수 표기: "저+건.동.경", "3아.미안.신변"

【추출 방법】
- 문서를 처음부터 끝까지 한 줄씩 읽으며 위 패턴 탐색
- 두문자 발견 시 → 앞뒤 문맥으로 question(이 두문자가 답이 되는 질문)을 생성
- 같은 주제에 요건/효과가 별도로 있으면 카드 2개로 분리

【출력 형식 — 순수 JSON 배열만】
[{"subject":"과목명","part":"파트명","question":"질문","mnemonic":"두문자","detail":"① 의미1 / ② 의미2 ..."}]

최종 점검: 출력 전 문서를 다시 훑어 누락된 두문자 없는지 확인하라.`

async function callGemini(apiKey, model, parts) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 65536 },
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) {
    const msg = data.error?.message || ''
    if (res.status === 401 || res.status === 403) throw new Error('__AUTH__')
    if (res.status === 503 || msg.toLowerCase().includes('high demand'))
      throw new Error('__BUSY__')
    throw new Error(msg || `API 오류 (${res.status})`)
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
}

async function extractWithRetry(apiKey, parts, setProgress) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (let m = 0; m < MODELS.length; m++) {
    const model = MODELS[m]
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        setProgress(`AI 분석 중... (${model}${attempt > 1 ? ` 재시도 ${attempt}/3` : ''})`)
        return await callGemini(apiKey, model, parts)
      } catch (e) {
        if (e.message === '__AUTH__') throw new Error('API 키가 올바르지 않습니다.')
        if (e.message === '__BUSY__') {
          if (attempt < 3) { await sleep(attempt * 5000); continue }
          if (m < MODELS.length - 1) break
          throw new Error('Gemini 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.')
        }
        throw e
      }
    }
  }
}

function repairJSON(str) {
  try { return JSON.parse(str) } catch {}
  const last = str.lastIndexOf('},')
  if (last > 0) try { return JSON.parse(str.slice(0, last + 1) + ']') } catch {}
  const brace = str.lastIndexOf('}')
  if (brace > 0) try { return JSON.parse(str.slice(0, brace + 1) + ']') } catch {}
  throw new Error('JSON 파싱 실패')
}

// ── 분류 색상 ────────────────────────────────────────────────
const TYPE_META = {
  new:      { label: '새 카드',     color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: '#22c55e' },
  upgrade:  { label: '내용 보강',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: '#f59e0b' },
  existing: { label: '이미 보유',   color: '#475569', bg: 'rgba(71,85,105,0.1)',  border: '#334155' },
}

// ── 인라인 편집 가능한 카드 아이템 ───────────────────────────
function CardItem({ card, type, checked, onToggle, onChange }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card)
  const meta = TYPE_META[type]

  const commitEdit = () => {
    onChange(draft)
    setEditing(false)
  }

  const field = (key, placeholder, multiline) => {
    const style = {
      width: '100%', boxSizing: 'border-box',
      background: '#0a0f1e', border: '1px solid #334155',
      borderRadius: 6, padding: '5px 8px', color: '#e2e8f0',
      fontSize: key === 'mnemonic' ? 14 : 12,
      fontWeight: key === 'mnemonic' ? 700 : 400,
      fontFamily: 'inherit', outline: 'none', resize: 'vertical',
      marginBottom: 4,
    }
    return multiline
      ? <textarea style={{ ...style, minHeight: 56 }} value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          placeholder={placeholder} />
      : <input style={style} value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          placeholder={placeholder} />
  }

  return (
    <div style={{
      background: checked ? 'rgba(99,102,241,0.1)' : 'rgba(15,23,42,0.7)',
      border: `1px solid ${checked ? '#6366f1' : '#1e293b'}`,
      borderRadius: 12, padding: '11px 13px',
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      {/* 체크박스 */}
      <div onClick={onToggle} style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 3, cursor: 'pointer',
        border: `2px solid ${checked ? '#6366f1' : '#334155'}`,
        background: checked ? '#6366f1' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {checked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
      </div>

      {/* 내용 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 분류 뱃지 + 태그 */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            fontSize: 10, borderRadius: 4, padding: '2px 7px', fontWeight: 600,
            background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
          }}>{meta.label}</span>
          {!editing && <>
            <span style={{ background: '#1e293b', color: '#94a3b8', fontSize: 10, borderRadius: 4, padding: '2px 7px' }}>{card.subject}</span>
            <span style={{ background: '#1e293b', color: '#64748b', fontSize: 10, borderRadius: 4, padding: '2px 7px' }}>{card.part}</span>
          </>}
        </div>

        {editing ? (
          <div onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              {field('subject', '과목')}
              {field('part', '파트')}
            </div>
            {field('question', '질문')}
            {field('mnemonic', '두문자')}
            {field('detail', '설명', true)}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button onClick={commitEdit} style={{
                background: '#6366f1', color: '#fff', border: 'none',
                borderRadius: 7, padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
              }}>저장</button>
              <button onClick={() => { setDraft(card); setEditing(false) }} style={{
                background: '#1e293b', color: '#94a3b8', border: 'none',
                borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
              }}>취소</button>
            </div>
          </div>
        ) : (
          <div onClick={onToggle} style={{ cursor: 'pointer' }}>
            <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{card.question}</div>
            <div style={{ color: '#818cf8', fontSize: 14, fontWeight: 700, letterSpacing: 1, marginBottom: type === 'upgrade' ? 4 : 0 }}>{card.mnemonic}</div>
            {type === 'upgrade' && (
              <div style={{ color: '#64748b', fontSize: 11, lineHeight: 1.5 }}>{card.detail}</div>
            )}
          </div>
        )}
      </div>

      {/* 편집 버튼 */}
      {!editing && (
        <button onClick={(e) => { e.stopPropagation(); setDraft(card); setEditing(true) }} style={{
          background: 'none', border: 'none', color: '#334155',
          cursor: 'pointer', fontSize: 14, padding: '2px 4px', flexShrink: 0,
        }} title="편집">✎</button>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────
export default function ExtractPage({ cards, onImport }) {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('gemini_key') || '')
  const [inputMode, setInputMode] = useState('file')   // 'file' | 'text'
  const [textInput, setTextInput] = useState('')
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [extracted, setExtracted] = useState([])       // [{...card, _type}]
  const [selected, setSelected] = useState(new Set())
  const [filterTab, setFilterTab] = useState('new')    // 'all'|'new'|'upgrade'|'existing'
  const [progress, setProgress] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [importMsg, setImportMsg] = useState('')
  const inputRef = useRef(null)

  const saveKey = (k) => { sessionStorage.setItem('gemini_key', k); setApiKey(k) }

  const readBase64 = (f) => new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.onerror = () => rej(new Error('파일 읽기 실패'))
    r.readAsDataURL(f)
  })

  const runExtraction = useCallback(async (parts, label) => {
    setStatus('loading'); setExtracted([]); setSelected(new Set()); setErrorMsg('')
    try {
      setProgress(`${label} 읽는 중...`)
      const raw = (await extractWithRetry(apiKey, parts, setProgress))
        .replace(/```json|```/g, '').trim()
      const parsed = repairJSON(raw)
      if (!Array.isArray(parsed) || parsed.length === 0)
        throw new Error('두문자 카드를 찾지 못했습니다.')

      // 기존 카드와 비교해 분류
      const classified = parsed.map((c) => ({
        ...c,
        _type: classifyCard(c, cards.allCards).type,
      }))

      setExtracted(classified)
      // 기본 선택: 새 카드 + 업그레이드만
      setSelected(new Set(
        classified.map((c, i) => i).filter((i) => classified[i]._type !== 'existing')
      ))
      setFilterTab('new')
      setStatus('done')
    } catch (e) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }, [apiKey, cards.allCards])

  const handleFile = useCallback(async (f) => {
    if (!apiKey) return
    setFile(f)
    const ext = f.name.split('.').pop().toLowerCase()
    let parts
    if (ext === 'txt') {
      const text = await new Promise((res) => {
        const r = new FileReader(); r.onload = (e) => res(e.target.result); r.readAsText(f)
      })
      parts = [{ text: `다음 텍스트에서 두문자 카드를 빠짐없이 추출해주세요:\n\n${text}` }]
    } else {
      const base64 = await readBase64(f)
      parts = [
        { inline_data: { mime_type: ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: base64 } },
        { text: '이 문서의 모든 두문자 카드를 빠짐없이 추출해주세요.' },
      ]
    }
    await runExtraction(parts, f.name)
  }, [apiKey, runExtraction])

  const handleTextSubmit = useCallback(async () => {
    if (!apiKey || !textInput.trim()) return
    const parts = [{ text: `다음 텍스트에서 두문자 카드를 빠짐없이 추출해주세요:\n\n${textInput}` }]
    await runExtraction(parts, '텍스트')
  }, [apiKey, textInput, runExtraction])

  const toggle = (i) => setSelected((prev) => {
    const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n
  })

  const updateCard = (i, updated) => {
    setExtracted((prev) => {
      const next = [...prev]
      next[i] = { ...updated, _type: classifyCard(updated, cards.allCards).type }
      return next
    })
  }

  const counts = {
    all: extracted.length,
    new: extracted.filter((c) => c._type === 'new').length,
    upgrade: extracted.filter((c) => c._type === 'upgrade').length,
    existing: extracted.filter((c) => c._type === 'existing').length,
  }

  const visible = extracted
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => filterTab === 'all' || c._type === filterTab)

  const toggleAll = () => {
    const visibleIdxs = visible.map(({ i }) => i)
    const allChecked = visibleIdxs.every((i) => selected.has(i))
    setSelected((prev) => {
      const n = new Set(prev)
      visibleIdxs.forEach((i) => allChecked ? n.delete(i) : n.add(i))
      return n
    })
  }

  const doImport = () => {
    const toAdd = extracted.filter((c, i) => selected.has(i)).map(({ _type, ...c }) => c)
    const before = cards.allCards.length
    cards.addCards(toAdd)
    setTimeout(() => {
      const added = cards.allCards.length - before
      const skipped = toAdd.length - added
      setImportMsg(skipped > 0 ? `✓ ${added}개 추가 (중복 ${skipped}개 제외)` : `✓ ${added}개 추가됨`)
      setTimeout(() => { setImportMsg(''); onImport() }, 1500)
    }, 50)
  }

  const reset = () => {
    setFile(null); setStatus('idle'); setExtracted([]); setSelected(new Set())
    setErrorMsg(''); setTextInput('')
  }

  const ikey = (
    <div style={{ marginBottom: 20 }}>
      <span style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8, display: 'block' }}>
        Gemini API 키{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: '#818cf8', fontSize: 11 }}>무료 발급 →</a>
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="password" placeholder="AIza..."
          defaultValue={apiKey}
          onBlur={(e) => e.target.value.trim() && saveKey(e.target.value.trim())}
          style={{
            flex: 1, background: '#0f172a', border: '1px solid #334155',
            borderRadius: 10, padding: '10px 14px', color: '#e2e8f0',
            fontSize: 14, fontFamily: 'monospace', outline: 'none',
          }} />
        <button
          onClick={(e) => { const v = e.target.previousSibling.value.trim(); if (v) saveKey(v) }}
          style={{
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
            border: 'none', borderRadius: 10, padding: '10px 20px',
            fontSize: 14, cursor: 'pointer', fontWeight: 700,
          }}>저장</button>
      </div>
      <div style={{ color: '#334155', fontSize: 11, marginTop: 6 }}>키는 브라우저 세션에만 저장됩니다</div>
    </div>
  )

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <h2 style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 800, marginBottom: 4 }}>AI 카드 추출</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        PDF 업로드 또는 텍스트 붙여넣기 — Gemini AI가 두문자를 <b style={{ color: '#94a3b8' }}>빠짐없이</b> 추출합니다
      </p>

      {ikey}

      {!apiKey && (
        <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: 16, color: '#64748b', fontSize: 13, textAlign: 'center' }}>
          API 키를 입력해야 사용할 수 있습니다
        </div>
      )}

      {apiKey && status === 'idle' && (
        <>
          {/* 입력 모드 토글 */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, background: '#0f172a', borderRadius: 10, padding: 3, width: 'fit-content' }}>
            {[['file', '📄 파일 업로드'], ['text', '✎ 텍스트 붙여넣기']].map(([mode, label]) => (
              <button key={mode} onClick={() => setInputMode(mode)} style={{
                background: inputMode === mode ? '#1e293b' : 'none',
                color: inputMode === mode ? '#e2e8f0' : '#475569',
                border: 'none', borderRadius: 8, padding: '7px 16px',
                fontSize: 13, cursor: 'pointer', fontWeight: inputMode === mode ? 600 : 400,
                transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>

          {inputMode === 'file' ? (
            <div
              style={{
                border: `2px dashed ${dragging ? '#6366f1' : '#334155'}`,
                borderRadius: 16, padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
                background: dragging ? 'rgba(99,102,241,0.07)' : 'rgba(15,23,42,0.6)',
                transition: 'all 0.2s',
              }}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f) }} />
              <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
              <div style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>
                PDF, Word, TXT 파일을 끌어다 놓거나<br />
                <span style={{ color: '#818cf8', fontWeight: 600 }}>클릭하여 선택</span>
              </div>
            </div>
          ) : (
            <div>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={'강의 필기, 카카오톡 정리본, 웹페이지 내용 등을 여기에 붙여넣으세요.\n\n예시:\n이행지체의 요건: 이.가.게.귀.위\n[이행기/이행 가능함에도/이행 게을리/귀책사유/위법성]'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(15,23,42,0.8)', border: '1px solid #334155',
                  borderRadius: 14, padding: '16px', color: '#e2e8f0',
                  fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  resize: 'vertical', minHeight: 200, lineHeight: 1.7,
                }}
              />
              <button
                onClick={handleTextSubmit}
                disabled={!textInput.trim()}
                style={{
                  marginTop: 10, width: '100%',
                  background: textInput.trim() ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#1e293b',
                  color: textInput.trim() ? '#fff' : '#475569',
                  border: 'none', borderRadius: 12, padding: '13px',
                  fontSize: 14, cursor: textInput.trim() ? 'pointer' : 'not-allowed', fontWeight: 700,
                }}
              >두문자 추출</button>
            </div>
          )}
        </>
      )}

      {status === 'loading' && (
        <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #1e293b', borderRadius: 16, padding: '60px 32px', textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #1e293b', borderTop: '3px solid #6366f1', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 1s linear infinite' }} />
          <div style={{ color: '#94a3b8', fontSize: 14 }}>{progress}</div>
          {file && <div style={{ color: '#475569', fontSize: 12, marginTop: 6 }}>{file.name}</div>}
        </div>
      )}

      {status === 'error' && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: '28px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
          <div style={{ color: '#fca5a5', fontSize: 14, marginBottom: 16 }}>{errorMsg}</div>
          <button onClick={reset} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 24px', fontSize: 13, cursor: 'pointer' }}>다시 시도</button>
        </div>
      )}

      {status === 'done' && (
        <div>
          {/* 분류 탭 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              ['all', `전체 ${counts.all}`],
              ['new', `🆕 새 카드 ${counts.new}`],
              ['upgrade', `⬆ 내용 보강 ${counts.upgrade}`],
              ['existing', `✓ 이미 보유 ${counts.existing}`],
            ].map(([tab, label]) => (
              <button key={tab} onClick={() => setFilterTab(tab)} style={{
                background: filterTab === tab ? '#1e293b' : 'none',
                border: `1px solid ${filterTab === tab ? '#6366f1' : '#1e293b'}`,
                color: filterTab === tab ? '#e2e8f0' : '#475569',
                borderRadius: 8, padding: '5px 12px', fontSize: 12,
                cursor: 'pointer', fontWeight: filterTab === tab ? 600 : 400,
              }}>{label}</button>
            ))}
            <button onClick={toggleAll} style={{
              marginLeft: 'auto', background: 'none', border: '1px solid #1e293b',
              borderRadius: 8, padding: '5px 12px', color: '#475569', fontSize: 12, cursor: 'pointer',
            }}>
              {visible.every(({ i }) => selected.has(i)) ? '전체 해제' : '전체 선택'}
            </button>
          </div>

          {/* 카드 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto', marginBottom: 14 }}>
            {visible.length === 0
              ? <div style={{ color: '#334155', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>해당 카드가 없습니다</div>
              : visible.map(({ c, i }) => (
                <CardItem
                  key={i} card={c} type={c._type}
                  checked={selected.has(i)}
                  onToggle={() => toggle(i)}
                  onChange={(updated) => updateCard(i, updated)}
                />
              ))
            }
          </div>

          {/* 액션 */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              style={{
                flex: 1,
                background: selected.size === 0 ? '#1e293b' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                color: selected.size === 0 ? '#475569' : '#fff',
                border: 'none', borderRadius: 12, padding: '13px 20px',
                fontSize: 14, cursor: selected.size === 0 ? 'not-allowed' : 'pointer', fontWeight: 700,
              }}
              disabled={selected.size === 0} onClick={doImport}
            >
              내 카드에 추가 ({selected.size}개)
            </button>
            <button onClick={reset} style={{
              background: '#1e293b', color: '#94a3b8', border: 'none',
              borderRadius: 12, padding: '13px 20px', fontSize: 14, cursor: 'pointer',
            }}>새로 추출</button>
          </div>

          {importMsg && (
            <div style={{ marginTop: 10, textAlign: 'center', color: '#22c55e', fontSize: 13, fontWeight: 600 }}>
              {importMsg}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
