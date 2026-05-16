import { useState, useRef, useCallback } from 'react'

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']

async function callGemini(apiKey, model, systemPrompt, parts, onProgress) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 65536 },
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) {
    const msg = data.error?.message || ''
    if (res.status === 401 || res.status === 403) throw new Error('__AUTH__')
    if (res.status === 503 || msg.toLowerCase().includes('high demand') || msg.toLowerCase().includes('overloaded'))
      throw new Error('__BUSY__')
    throw new Error(msg || `API 오류 (${res.status})`)
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
}

async function extractWithRetry(apiKey, parts, onProgress) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (let m = 0; m < MODELS.length; m++) {
    const model = MODELS[m]
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        onProgress(`AI 분석 중... (${model}${attempt > 1 ? ` 재시도 ${attempt}/3` : ''})`)
        return await callGemini(apiKey, model, SYSTEM_PROMPT, parts, onProgress)
      } catch (e) {
        if (e.message === '__AUTH__') throw new Error('API 키가 올바르지 않습니다. 다시 확인해주세요.')
        if (e.message === '__BUSY__') {
          if (attempt < 3) {
            await sleep(attempt * 5000)
            continue
          }
          if (m < MODELS.length - 1) break
          throw new Error('Gemini 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.')
        }
        throw e
      }
    }
  }
  throw new Error('모든 모델이 응답하지 않습니다. 잠시 후 다시 시도해주세요.')
}

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
- <요건>, <효과>, <판례>, 조항별로 묶인 세트는 각각 개별 카드로

【출력 형식 — 순수 JSON 배열만, 다른 텍스트 절대 없음】
[
  {
    "subject": "과목명 (예: 민법, 형법, 민사소송법, 행정법)",
    "part": "파트명 (예: 채권총론, 물권법, 총칙)",
    "question": "이 두문자가 답이 되는 질문 (예: '이행지체의 요건은?')",
    "mnemonic": "두문자 원문 그대로 (예: '이.가.게.귀.위')",
    "detail": "① 첫 번째 의미 / ② 두 번째 의미 / ③ 세 번째 의미 ..."
  }
]

【detail 작성 규칙】
- 반드시 ①②③... 번호와 함께
- 원문에 대괄호 [ ] 안에 설명이 있으면 그것을 활용
- 원문에 설명이 없으면 문맥에서 추론하여 작성
- 두문자 각 글자/음절이 무엇을 의미하는지 명확히

【subject/part 추론】
- 문서의 제목, 챕터, 소제목으로 판단
- 불명확하면 "미분류"

최종 점검: 출력 전 문서를 다시 훑어 누락된 두문자 없는지 확인하라.`

const S = {
  section: { marginBottom: 24 },
  label: { color: '#94a3b8', fontSize: 13, marginBottom: 8, display: 'block' },
  keyRow: { display: 'flex', gap: 8 },
  input: {
    flex: 1, background: '#0f172a', border: '1px solid #334155',
    borderRadius: 10, padding: '10px 14px', color: '#e2e8f0',
    fontSize: 14, fontFamily: 'monospace', outline: 'none',
  },
  saveBtn: (ok) => ({
    background: ok ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#1e293b',
    color: ok ? '#fff' : '#475569',
    border: 'none', borderRadius: 10, padding: '10px 20px',
    fontSize: 14, cursor: ok ? 'pointer' : 'not-allowed', fontWeight: 700,
    whiteSpace: 'nowrap',
  }),
  keyNote: { color: '#334155', fontSize: 11, marginTop: 6 },
  dropzone: (dragging) => ({
    border: `2px dashed ${dragging ? '#6366f1' : '#334155'}`,
    borderRadius: 16, padding: '40px 24px', textAlign: 'center',
    cursor: 'pointer',
    background: dragging ? 'rgba(99,102,241,0.07)' : 'rgba(15,23,42,0.6)',
    transition: 'all 0.2s',
  }),
  loading: {
    background: 'rgba(15,23,42,0.8)', border: '1px solid #1e293b',
    borderRadius: 16, padding: '60px 32px', textAlign: 'center',
  },
  spinner: {
    width: 40, height: 40, border: '3px solid #1e293b',
    borderTop: '3px solid #6366f1', borderRadius: '50%',
    margin: '0 auto 20px', animation: 'spin 1s linear infinite',
  },
  error: {
    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 16, padding: '28px', textAlign: 'center',
  },
  cardItem: (checked) => ({
    background: checked ? 'rgba(99,102,241,0.12)' : 'rgba(15,23,42,0.7)',
    border: `1px solid ${checked ? '#6366f1' : '#1e293b'}`,
    borderRadius: 12, padding: '12px 14px',
    cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start',
  }),
  check: (checked) => ({
    width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 2,
    border: `2px solid ${checked ? '#6366f1' : '#334155'}`,
    background: checked ? '#6366f1' : 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }),
  actionBtn: (primary, disabled) => ({
    flex: 1,
    background: disabled ? '#1e293b' : primary ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(99,102,241,0.12)',
    color: disabled ? '#475569' : primary ? '#fff' : '#818cf8',
    border: disabled ? 'none' : primary ? 'none' : '1px solid #6366f1',
    borderRadius: 12, padding: '13px 20px', fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 700,
  }),
}

function KeyInput({ apiKey, onSave }) {
  const [val, setVal] = useState(apiKey)
  return (
    <div style={S.section}>
      <span style={S.label}>
        Gemini API 키{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: '#818cf8', fontSize: 11 }}>
          무료 발급 →
        </a>
      </span>
      <div style={S.keyRow}>
        <input type="password" style={S.input} placeholder="AIza..."
          value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && val.trim() && onSave(val.trim())} />
        <button style={S.saveBtn(val.trim())} onClick={() => val.trim() && onSave(val.trim())}>저장</button>
      </div>
      <div style={S.keyNote}>키는 브라우저 세션에만 저장되며 외부로 전송되지 않습니다</div>
    </div>
  )
}

export default function ExtractPage({ cards, onImport }) {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('gemini_key') || '')
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [extracted, setExtracted] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [progress, setProgress] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef(null)

  const saveKey = (k) => { sessionStorage.setItem('gemini_key', k); setApiKey(k) }

  const readBase64 = (f) => new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.onerror = () => rej(new Error('파일 읽기 실패'))
    r.readAsDataURL(f)
  })
  const readText = (f) => new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = () => rej(new Error('파일 읽기 실패'))
    r.readAsText(f)
  })

  const handleFile = useCallback(async (f) => {
    if (!apiKey) return
    setFile(f); setStatus('loading'); setExtracted([]); setSelected(new Set()); setErrorMsg('')
    try {
      const ext = f.name.split('.').pop().toLowerCase()
      let parts
      if (ext === 'txt') {
        setProgress('텍스트 읽는 중...')
        const text = await readText(f)
        parts = [{ text: `다음 텍스트에서 두문자 카드를 빠짐없이 추출해주세요:\n\n${text}` }]
      } else {
        setProgress('파일 읽는 중...')
        const base64 = await readBase64(f)
        const mimeType = ext === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        parts = [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: '이 문서의 모든 두문자 카드를 빠짐없이 추출해주세요. 한 개도 놓치지 마세요.' },
        ]
      }

      setProgress('AI 분석 중... 꼼꼼하게 전체 스캔 중입니다 (30~90초 소요)')

      const raw = (await extractWithRetry(apiKey, parts, setProgress))
        .replace(/```json|```/g, '').trim()

      // JSON이 잘린 경우 복구: 마지막 완전한 객체까지만 살리기
      const repairJSON = (str) => {
        try { return JSON.parse(str) } catch {}
        // 마지막 완전한 '},' 위치까지 잘라서 배열로 닫기
        const lastComplete = str.lastIndexOf('},')
        if (lastComplete > 0) {
          try { return JSON.parse(str.slice(0, lastComplete + 1) + ']') } catch {}
        }
        const lastBrace = str.lastIndexOf('}')
        if (lastBrace > 0) {
          try { return JSON.parse(str.slice(0, lastBrace + 1) + ']') } catch {}
        }
        throw new Error('JSON Parse error: 응답이 너무 길어 잘렸습니다. 문서를 나눠서 올려보세요.')
      }

      const parsed = repairJSON(raw)
      if (!Array.isArray(parsed) || parsed.length === 0)
        throw new Error('두문자 카드를 찾지 못했습니다. 두문자가 포함된 문서인지 확인해주세요.')

      setExtracted(parsed)
      setSelected(new Set(parsed.map((_, i) => i)))
      setStatus('done')
    } catch (e) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }, [apiKey])

  const toggle = (i) => setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  const toggleAll = () => selected.size === extracted.length ? setSelected(new Set()) : setSelected(new Set(extracted.map((_, i) => i)))

  const [importMsg, setImportMsg] = useState('')

  const doImport = () => {
    const toAdd = extracted.filter((_, i) => selected.has(i))
    const before = cards.allCards.length
    cards.addCards(toAdd)
    // addCards는 중복 제외하므로 실제 추가된 수 계산
    setTimeout(() => {
      const added = cards.allCards.length - before
      const skipped = toAdd.length - added
      if (skipped > 0) setImportMsg(`✓ ${added}개 추가 (중복 ${skipped}개 제외)`)
      else setImportMsg(`✓ ${added}개 추가됨`)
      setTimeout(() => { setImportMsg(''); onImport() }, 1500)
    }, 50)
  }

  const reset = () => { setFile(null); setStatus('idle'); setExtracted([]); setSelected(new Set()); setErrorMsg('') }

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <h2 style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 800, marginBottom: 4 }}>AI 카드 추출</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        교재 PDF를 올리면 Gemini AI가 두문자를 <b style={{ color: '#94a3b8' }}>하나도 빠짐없이</b> 카드로 만들어드립니다
      </p>

      <KeyInput apiKey={apiKey} onSave={saveKey} />

      {!apiKey && (
        <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: 16, color: '#64748b', fontSize: 13, textAlign: 'center' }}>
          API 키를 입력해야 파일을 업로드할 수 있습니다
        </div>
      )}

      {apiKey && status === 'idle' && (
        <div style={S.dropzone(dragging)}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}>
          <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f) }} />
          <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
          <div style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>
            PDF, Word, TXT 파일을 끌어다 놓거나<br />
            <span style={{ color: '#818cf8', fontWeight: 600 }}>클릭하여 선택</span>
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div style={S.loading}>
          <div style={S.spinner} />
          <div style={{ color: '#94a3b8', fontSize: 14 }}>{progress}</div>
          <div style={{ color: '#475569', fontSize: 12, marginTop: 6 }}>{file?.name}</div>
        </div>
      )}

      {status === 'error' && (
        <div style={S.error}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
          <div style={{ color: '#fca5a5', fontSize: 14, marginBottom: 16 }}>{errorMsg}</div>
          <button onClick={reset} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 24px', fontSize: 13, cursor: 'pointer' }}>다시 시도</button>
        </div>
      )}

      {status === 'done' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>
              <span style={{ color: '#22c55e', fontWeight: 700 }}>{extracted.length}개</span> 추출됨 · {selected.size}개 선택
            </span>
            <button onClick={toggleAll} style={{ background: 'none', border: '1px solid #334155', borderRadius: 8, padding: '4px 12px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
              {selected.size === extracted.length ? '전체 해제' : '전체 선택'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto', marginBottom: 16 }}>
            {extracted.map((card, i) => (
              <div key={i} style={S.cardItem(selected.has(i))} onClick={() => toggle(i)}>
                <div style={S.check(selected.has(i))}>
                  {selected.has(i) && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                    <span style={{ background: '#1e293b', color: '#94a3b8', fontSize: 10, borderRadius: 4, padding: '2px 7px' }}>{card.subject}</span>
                    <span style={{ background: '#1e293b', color: '#64748b', fontSize: 10, borderRadius: 4, padding: '2px 7px' }}>{card.part}</span>
                  </div>
                  <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{card.question}</div>
                  <div style={{ color: '#818cf8', fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>{card.mnemonic}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button style={S.actionBtn(true, selected.size === 0)} disabled={selected.size === 0} onClick={doImport}>
              내 카드에 추가 ({selected.size}개)
            </button>
            <button style={S.actionBtn(false, false)} onClick={reset}>새 파일</button>
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
