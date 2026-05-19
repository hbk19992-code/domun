import { useState, useRef, useCallback, useMemo, useEffect, useId } from 'react'
import { isDuplicate, normQuestion } from '../utils/dedup'

function classifyCard(card, allCards) {
  if (!allCards || !Array.isArray(allCards)) return { type: 'new' };
  const isDup = allCards.some(c => isDuplicate(c, card));
  if (isDup) return { type: 'existing' };

  const qNorm = normQuestion(card.question);
  if (qNorm && allCards.some(c => normQuestion(c.question) === qNorm)) {
    return { type: 'upgrade' };
  }
  return { type: 'new' };
}

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']

// Groq 프로덕션 모델 — 앞쪽이 우선, 실패 시 뒤로 폴백.
// (llama-3.1-70b-versatile 는 Groq에서 폐기됨 → 3.3 계열 사용)
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']

const MAX_FILE_MB = 15

const MNEMONIC_PROMPT = `당신은 법학 시험 두문자(두문자어) 카드를 빠짐없이 추출하는 전문가입니다.

【절대 규칙】
- 문서에 실제로 있는 두문자는 단 하나도 놓치지 말 것.
- 문서에 없는 내용을 지어내지 말 것.

【두문자 인식 기준】
1. 점(.) 구분형: "이.가.게.귀.위"
2. 괄호 설명형: "준.통.수 [준비완료·통지·수령]"
3. 한글 약어 나열: "모.사.실"

【출력 형식 — 순수 JSON 배열만】
[{"subject":"과목명","part":"단원명","question":"질문","mnemonic":"두문자","detail":"① 의미1 / ② 의미2 ..."}]`

const QA_PROMPT = `당신은 법학 시험 학습 카드를 만드는 전문가입니다.
질문-답 형태의 학습 카드를 순수 JSON 배열로만 추출하세요.

【출력 형식 — 순수 JSON 배열만】
[{"subject":"과목명","part":"파트명","question":"질문","answer":"답"}]`

// Groq REST 호출 (1회).
// 프롬프트가 "JSON 배열"을 요구하므로 response_format(json_object: 객체 강제)은 쓰지 않는다.
async function callGroq(apiKey, model, text, systemPrompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
    }),
  })

  let data = {}
  try { data = await res.json() } catch {}

  if (!res.ok) {
    const msg = data.error?.message || ''
    if (res.status === 401 || res.status === 403) throw new Error('__AUTH__')
    if (res.status === 413) throw new Error('__GROQ_TOO_LONG__')
    if (res.status === 429 || res.status === 503) throw new Error('__BUSY__')
    throw new Error(msg || `Groq 오류 (${res.status})`)
  }
  return data.choices?.[0]?.message?.content || '[]'
}

// Groq 추출 래퍼 — 모델 순회 + 재시도 (extractWithGemini 와 동일 구조)
async function extractWithGroq(apiKey, text, systemPrompt, setProgress) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (let m = 0; m < GROQ_MODELS.length; m++) {
    const model = GROQ_MODELS[m]
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        setProgress(`⚡ Groq 고속 분석 중... (${model}${attempt > 1 ? ` 재시도 ${attempt}` : ''})`)
        return await callGroq(apiKey, model, text, systemPrompt)
      } catch (e) {
        if (e.message === '__AUTH__') throw new Error('Groq API 키가 올바르지 않습니다.')
        if (e.message === '__GROQ_TOO_LONG__') throw e // 413 — 상위(runExtraction)에서 처리
        if (e.message === '__BUSY__') {
          if (attempt < 3) { await sleep(attempt * 4000); continue }
          if (m < GROQ_MODELS.length - 1) break
          throw new Error('Groq 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.')
        }
        // 모델 폐기 / 네트워크 오류 등 — 다음 모델로 폴백
        if (m < GROQ_MODELS.length - 1) break
        throw e
      }
    }
  }
  throw new Error('Groq 서버 응답 실패')
}

// Gemini 규격 전용 REST API 송신 함수 (1회)
async function callGemini(apiKey, model, parts, systemPrompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.1 },
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) {
    const msg = data.error?.message || ''
    if (res.status === 401 || res.status === 403) throw new Error('__AUTH__')
    if (res.status === 503 || msg.toLowerCase().includes('high demand'))
      throw new Error('__BUSY__')
    throw new Error(msg || `Gemini API 오류 (${res.status})`)
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
}

async function extractWithGemini(apiKey, parts, systemPrompt, setProgress) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (let m = 0; m < GEMINI_MODELS.length; m++) {
    const model = GEMINI_MODELS[m]
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        setProgress(`☁️ Gemini 심층 분석 중... (${model}${attempt > 1 ? ` 재시도 ${attempt}` : ''})`)
        return await callGemini(apiKey, model, parts, systemPrompt)
      } catch (e) {
        if (e.message === '__AUTH__') throw new Error('Gemini API 키가 올바르지 않습니다.')
        if (e.message === '__BUSY__') {
          if (attempt < 3) { await sleep(attempt * 5000); continue }
          if (m < GEMINI_MODELS.length - 1) break
          throw new Error('Gemini 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.')
        }
        throw e
      }
    }
  }
  throw new Error('Gemini 서버 응답 실패');
}

function repairJSON(str) {
  try { return { data: JSON.parse(str), truncated: false } } catch {}
  const last = str.lastIndexOf('},')
  if (last > 0) try { return { data: JSON.parse(str.slice(0, last + 1) + ']'), truncated: true } } catch {}
  const brace = str.lastIndexOf('}')
  if (brace > 0) try { return { data: JSON.parse(str.slice(0, brace + 1) + ']'), truncated: true } } catch {}
  throw new Error('JSON 파싱 실패')
}

const TYPE_META = {
  new:      { label: '새 카드',     color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: '#22c55e' },
  upgrade:  { label: '내용 보강',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: '#f59e0b' },
  existing: { label: '이미 보유',   color: '#475569', bg: 'rgba(71,85,105,0.1)',  border: '#334155' },
}

function DataListInput({ id, value, onChange, placeholder, style, options }) {
  const safeOptions = Array.isArray(options) ? options : [];
  return (
    <div style={{ flex: 1, width: '100%', minWidth: 0 }}>
      <input style={{ ...style, minWidth: 0 }} value={value || ''} onChange={onChange} placeholder={placeholder} list={id} />
      <datalist id={id}>
        {safeOptions.map((opt, i) => <option key={i} value={opt != null ? String(opt) : ''} />)}
      </datalist>
    </div>
  )
}

function GroupRow({ group, onApply, subjects, getParts }) {
  const uid = useId()
  const [draftSubj, setDraftSubj] = useState(group.subject === '미분류' ? '' : group.subject)
  const [draftPart, setDraftPart] = useState(group.part === '미분류' ? '' : group.part)

  useEffect(() => {
    setDraftSubj(group.subject === '미분류' ? '' : group.subject)
    setDraftPart(group.part === '미분류' ? '' : group.part)
  }, [group])

  const changed = draftSubj !== (group.subject === '미분류' ? '' : group.subject) ||
                  draftPart !== (group.part === '미분류' ? '' : group.part)

  const safeParts = typeof getParts === 'function' ? (getParts(draftSubj) || []) : []
  const inputStyle = { width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', minWidth: 0 }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(15,23,42,0.6)', padding: '12px 16px', borderRadius: 12, marginBottom: 8, border: '1px solid #1e293b' }}>
      <div style={{ flex: 1, display: 'flex', gap: 8, flexWrap: 'nowrap' }}>
        <DataListInput id={`ge-sub-${uid}`} value={draftSubj} onChange={e => setDraftSubj(e.target.value)} placeholder="과목" style={inputStyle} options={subjects} />
        <DataListInput id={`ge-part-${uid}`} value={draftPart} onChange={e => setDraftPart(e.target.value)} placeholder="단원" style={inputStyle} options={safeParts} />
      </div>
      <div style={{ width: 44, textAlign: 'center', color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>{group.count}장</div>
      <button onClick={() => { if (changed) onApply(group.subject, group.part, draftSubj, draftPart) }} disabled={!changed} style={{ background: changed ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#1e293b', color: changed ? '#fff' : '#64748b', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: changed ? 'pointer' : 'not-allowed', fontWeight: 700, flexShrink: 0 }}>적용</button>
    </div>
  )
}

function GroupEditorPanel({ extracted, onUpdateGroup, subjects, getParts }) {
  const [open, setOpen] = useState(true)

  const groups = useMemo(() => {
    const map = new Map()
    extracted.forEach(c => {
      const subj = c.subject || '미분류'
      const pt = c.part || '미분류'
      const key = `${subj}|||${pt}`
      if (!map.has(key)) map.set(key, { subject: subj, part: pt, count: 0 })
      map.get(key).count++
    })
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [extracted])

  if (groups.length === 0) return null

  return (
    <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 16, padding: '20px', marginBottom: 24, width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 800, marginBottom: 6 }}>📁 감지된 폴더 일괄 정리</div>
          <div style={{ color: '#94a3b8', fontSize: 13, wordBreak: 'keep-all' }}>AI가 분류한 {groups.length}개의 폴더 그룹을 한 번에 수정할 수 있습니다.</div>
        </div>
        <div style={{ color: '#818cf8', fontSize: 13, fontWeight: 700, background: 'rgba(99,102,241,0.1)', padding: '8px 14px', borderRadius: 10, whiteSpace: 'nowrap' }}>{open ? '접기 ▲' : '펼치기 ▼'}</div>
      </div>
      {open && (
        <div style={{ marginTop: 20 }}>
          <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
            {groups.map(g => (
              <GroupRow key={`${g.subject}|||${g.part}`} group={g} onApply={onUpdateGroup} subjects={subjects} getParts={getParts} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CardItem({ card, type, checked, onToggle, onChange, subjects = [], getParts }) {
  const uid = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card)
  const meta = TYPE_META[type] || TYPE_META.new
  const isQA = !card.mnemonic && card.answer != null

  let safeParts = []
  try { if (typeof getParts === 'function') { const partsResult = getParts(draft?.subject || ''); if (Array.isArray(partsResult)) safeParts = partsResult } } catch(e) {}
  const safeSubjects = Array.isArray(subjects) ? subjects : []

  const commitEdit = () => { onChange(draft); setEditing(false) }

  const inputStyle = { width: '100%', boxSizing: 'border-box', minWidth: 0, background: '#0a0f1e', border: '1px solid #334155', borderRadius: 6, padding: '6px 9px', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 5, resize: 'vertical' }

  if (editing) {
    return (
      <div style={{ background: checked ? 'rgba(99,102,241,0.1)' : 'rgba(15,23,42,0.7)', border: `1px solid ${checked ? '#6366f1' : '#1e293b'}`, borderRadius: 12, padding: '11px 13px', display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box', cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 6, width: '100%' }}>
          <DataListInput id={`ext-sub-${uid}`} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="과목" style={inputStyle} options={safeSubjects} />
          <DataListInput id={`ext-part-${uid}`} value={draft.part} onChange={(e) => setDraft({ ...draft, part: e.target.value })} placeholder="단원" style={inputStyle} options={safeParts} />
        </div>
        <input style={inputStyle} value={draft.question || ''} onChange={(e) => setDraft({ ...draft, question: e.target.value })} placeholder="질문" />
        {isQA ? (
          <textarea style={{ ...inputStyle, minHeight: 60 }} value={draft.answer || ''} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} placeholder="답" />
        ) : (
          <>
            <input style={{ ...inputStyle, color: '#818cf8', fontWeight: 700 }} value={draft.mnemonic || ''} onChange={(e) => setDraft({ ...draft, mnemonic: e.target.value })} placeholder="두문자" />
            <textarea style={{ ...inputStyle, minHeight: 60, fontSize: 12 }} value={draft.detail || ''} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} placeholder="설명" />
          </>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button onClick={commitEdit} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 600, flex: 1 }}>저장</button>
          <button onClick={() => { setDraft(card); setEditing(false) }} style={{ background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', flex: 1 }}>취소</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: checked ? 'rgba(99,102,241,0.1)' : 'rgba(15,23,42,0.7)', border: `1px solid ${checked ? '#6366f1' : '#1e293b'}`, borderRadius: 12, padding: '11px 13px', display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%', boxSizing: 'border-box' }}>
      <div onClick={onToggle} style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 3, cursor: 'pointer', border: `2px solid ${checked ? '#6366f1' : '#334155'}`, background: checked ? '#6366f1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {checked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
        <div style={{ display: 'flex', gap: 5, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, borderRadius: 4, padding: '2px 7px', fontWeight: 600, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>{meta.label}</span>
          <span style={{ background: '#1e293b', color: '#94a3b8', fontSize: 10, borderRadius: 4, padding: '2px 7px', wordBreak: 'keep-all' }}>{card.subject || '미분류'}</span>
          <span style={{ background: '#1e293b', color: '#64748b', fontSize: 10, borderRadius: 4, padding: '2px 7px', wordBreak: 'keep-all' }}>{card.part || '미분류'}</span>
        </div>
        <div onClick={onToggle} style={{ cursor: 'pointer', wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
          <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{card.question}</div>
          {isQA ? (
            <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.5 }}>{card.answer}</div>
          ) : (
            <>
              <div style={{ color: '#818cf8', fontSize: 14, fontWeight: 700, letterSpacing: 1, marginBottom: type === 'upgrade' ? 4 : 0, overflowWrap: 'anywhere' }}>{card.mnemonic}</div>
              {type === 'upgrade' && <div style={{ color: '#64748b', fontSize: 11, lineHeight: 1.5 }}>{card.detail}</div>}
            </>
          )}
        </div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); setDraft(card); setEditing(true) }} style={{ background: 'none', border: 'none', color: '#334155', cursor: 'pointer', fontSize: 14, padding: '2px 4px', flexShrink: 0 }} title="편집">✎</button>
    </div>
  )
}

export default function ExtractPage({ cards, onImport }) {
  const [geminiKey, setGeminiKey] = useState(() => sessionStorage.getItem('gemini_key') || '')
  const [groqKey, setGroqKey] = useState(() => sessionStorage.getItem('groq_key') || '')

  const [extractType, setExtractType] = useState('mnemonic')
  const [inputMode, setInputMode] = useState('file')
  const [apiEngine, setApiEngine] = useState('auto')

  const [textInput, setTextInput] = useState('')
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [extracted, setExtracted] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [filterTab, setFilterTab] = useState('new')
  const [progress, setProgress] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [importMsg, setImportMsg] = useState('')
  const [loadingPct, setLoadingPct] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (status !== 'loading') {
      if (status === 'done') setLoadingPct(100)
      return
    }
    setLoadingPct(0)
    const iv = setInterval(() => setLoadingPct((p) => Math.min(92, p + Math.max(0.4, (92 - p) * 0.04))), 350)
    return () => clearInterval(iv)
  }, [status])

  const allSubjects = useMemo(() => {
    let existing = []
    try { if (Array.isArray(cards?.subjects)) existing = cards.subjects } catch(e){}
    const newSubjects = Array.isArray(extracted) ? extracted.map(c => c?.subject).filter(Boolean) : []
    return [...new Set([...existing, ...newSubjects])]
  }, [cards?.subjects, extracted])

  const getPartsForSubject = useCallback((subj) => {
    if (!subj) return []
    let existingParts = []
    try { if (typeof cards?.parts === 'function') existingParts = cards.parts(subj) || [] } catch(e){}
    const newParts = Array.isArray(extracted) ? extracted.filter(c => c?.subject === subj).map(c => c?.part).filter(Boolean) : []
    return [...new Set([...existingParts, ...newParts])]
  }, [cards, extracted])

  const updateGroup = useCallback((oldSubj, oldPart, newSubj, newPart) => {
    setExtracted(prev => prev.map(c => {
      const s = c.subject || '미분류'
      const p = c.part || '미분류'
      if (s === oldSubj && p === oldPart) {
        const updated = { ...c, subject: newSubj, part: newPart }
        updated._type = classifyCard(updated, cards.allCards || []).type
        return updated
      }
      return c
    }))
  }, [cards.allCards])

  const saveGeminiKey = (k) => { sessionStorage.setItem('gemini_key', k); setGeminiKey(k) }
  const saveGroqKey = (k) => { sessionStorage.setItem('groq_key', k); setGroqKey(k) }

  const readBase64 = (f) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = () => rej(new Error('파일 읽기 실패')); r.readAsDataURL(f)
  })

  const runExtraction = useCallback(async (geminiPayload, label, sourceText = null) => {
    setStatus('loading'); setExtracted([]); setSelected(new Set()); setErrorMsg(''); setTruncated(false)
    try {
      setProgress(`${label} 분석 준비 중...`)
      const prompt = extractType === 'qa' ? QA_PROMPT : MNEMONIC_PROMPT
      let raw = '';

      let useGroq = false;
      if (apiEngine === 'groq') {
        if (!sourceText) {
          throw new Error("⚠️ Groq 엔진은 파일(PDF) 직접 처리를 설계상 지원하지 않습니다.\n텍스트를 직접 복사해서 붙여넣거나, 파일 분석 시에는 상단 엔진을 'Gemini' 또는 '자동 분기'로 선택해 주세요.");
        }
        if (!groqKey) throw new Error("Groq API 키가 입력되지 않았습니다.");
        useGroq = true;
      } else if (apiEngine === 'gemini') {
        useGroq = false;
      } else {
        useGroq = !!(sourceText && sourceText.length < 12000 && groqKey);
      }

      if (useGroq) {
        try {
          raw = await extractWithGroq(groqKey, sourceText, prompt, setProgress);
        } catch(groqErr) {
          if (apiEngine === 'groq') {
            if (groqErr.message === '__GROQ_TOO_LONG__') {
              throw new Error("⚠️ 텍스트 분량이 Groq 엔진의 단일 제한 범위를 초과했습니다 (413 Payload Too Large).\n분량을 조절하시거나 상단 엔진을 'Gemini'로 변경하여 다시 실행해 주세요.");
            }
            throw groqErr;
          }

          console.warn("Groq 결함으로 인하여 백업망인 Gemini로 긴급 라우팅을 우회합니다.", groqErr);
          if (!geminiKey) throw new Error("용량 범위 이탈로 Gemini 구동이 요구되나, 등록된 Gemini API 키가 없습니다.");
          raw = await extractWithGemini(geminiKey, geminiPayload, prompt, setProgress);
        }
      } else {
        if (!geminiKey) throw new Error("Gemini API 키가 필수입니다.");
        raw = await extractWithGemini(geminiKey, geminiPayload, prompt, setProgress);
      }

      raw = raw.replace(/```json|```/g, '').trim()
      const { data: parsed, truncated: wasTruncated } = repairJSON(raw)

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error(extractType === 'qa' ? '핵심 Q&A 내용을 추출하지 못했습니다.' : '두문자 카드를 추출하지 못했습니다.')
      }

      const normalized = parsed.map((c) =>
        extractType === 'qa'
          ? { subject: c.subject || '', part: c.part || '', question: c.question || '', mnemonic: '', detail: '', answer: c.answer || '' }
          : { ...c, subject: c.subject || '', part: c.part || '' }
      )

      const classified = normalized.map((c) => ({ ...c, _type: classifyCard(c, cards.allCards || []).type }))

      setExtracted(classified)
      setSelected(new Set(classified.map((c, i) => i).filter((i) => classified[i]._type !== 'existing')))
      setTruncated(wasTruncated)
      setFilterTab('new')
      setStatus('done')
    } catch (e) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }, [geminiKey, groqKey, cards.allCards, extractType, apiEngine])

  const handleFile = useCallback(async (f) => {
    if (!geminiKey && !groqKey) return
    setFile(f)
    const sizeMB = f.size / (1024 * 1024)
    if (sizeMB > MAX_FILE_MB) {
      setErrorMsg(`파일이 너무 큽니다 (${sizeMB.toFixed(1)}MB). 최대 ${MAX_FILE_MB}MB까지 업로드할 수 있습니다.`)
      setStatus('error')
      return
    }
    const ext = f.name.split('.').pop().toLowerCase()
    // Gemini inline_data 는 Word(.doc/.docx)를 안정적으로 지원하지 않음 → PDF/TXT 만 허용
    // (드래그&드롭은 accept 속성을 우회하므로 여기서 한 번 더 막는다)
    if (!['pdf', 'txt'].includes(ext)) {
      setErrorMsg('PDF 또는 TXT 파일만 지원합니다.\nWord 문서는 PDF로 변환한 뒤 업로드해 주세요.')
      setStatus('error')
      return
    }
    let geminiPayload;
    let sourceText = null;

    if (ext === 'txt') {
      const text = await new Promise((res) => { const r = new FileReader(); r.onload = (e) => res(e.target.result); r.readAsText(f) })
      geminiPayload = [{ text: `다음 텍스트에서 카드를 빠짐없이 추출해주세요:\n\n${text}` }]
      sourceText = text;
    } else {
      const base64 = await readBase64(f)
      geminiPayload = [
        { inline_data: { mime_type: 'application/pdf', data: base64 } },
        { text: '이 문서의 모든 내용을 분석해 카드를 빠짐없이 추출해주세요.' },
      ]
    }
    await runExtraction(geminiPayload, f.name, sourceText)
  }, [geminiKey, groqKey, runExtraction])

  const handleTextSubmit = useCallback(async () => {
    const trimmed = textInput.trim();
    if ((!geminiKey && !groqKey) || !trimmed) return

    const geminiPayload = [{ text: `다음 텍스트에서 카드를 빠짐없이 추출해주세요:\n\n${trimmed}` }]
    await runExtraction(geminiPayload, '텍스트', trimmed)
  }, [geminiKey, groqKey, textInput, runExtraction])

  const toggle = (i) => setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })

  const updateCard = (i, updated) => {
    setExtracted((prev) => { const next = [...prev]; next[i] = { ...updated, _type: classifyCard(updated, cards.allCards || []).type }; return next })
  }

  const counts = {
    all: extracted.length,
    new: extracted.filter((c) => c._type === 'new').length,
    upgrade: extracted.filter((c) => c._type === 'upgrade').length,
    existing: extracted.filter((c) => c._type === 'existing').length,
  }

  const visible = extracted.map((c, i) => ({ c, i })).filter(({ c }) => filterTab === 'all' || c._type === filterTab)

  const toggleAll = () => {
    const visibleIdxs = visible.map(({ i }) => i)
    const allChecked = visibleIdxs.length > 0 && visibleIdxs.every((i) => selected.has(i))
    setSelected((prev) => {
      const n = new Set(prev)
      visibleIdxs.forEach((i) => allChecked ? n.delete(i) : n.add(i))
      return n
    })
  }

  // addCards 는 async — 반드시 await 해야 added 가 숫자로 들어온다
  const doImport = async () => {
    const toAdd = extracted.filter((c, i) => selected.has(i)).map(({ _type, ...c }) => c)
    if (toAdd.length === 0) return
    const added = await cards.addCards(toAdd)
    const skipped = toAdd.length - added
    setImportMsg(skipped > 0 ? `✓ ${added}개 추가 (중복 ${skipped}개 제외)` : `✓ ${added}개 추가됨`)
    setTimeout(() => { setImportMsg(''); onImport() }, 1500)
  }

  const reset = () => {
    setFile(null); setStatus('idle'); setExtracted([]); setSelected(new Set())
    setErrorMsg(''); setTextInput(''); setTruncated(false)
  }

  const inputStyle = { flex: 1, background: '#0f172a', border: '1px solid #334155', minWidth: 0, borderRadius: 10, padding: '10px 14px', color: '#e2e8f0', fontSize: 14, fontFamily: 'monospace', outline: 'none' }
  const btnStyle = { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', flexShrink: 0, border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, cursor: 'pointer', fontWeight: 700 }

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <h2 style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 800, marginBottom: 4 }}>AI 카드 추출</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24, wordBreak: 'keep-all' }}>
        원하는 AI 엔진을 선택하여 최적의 속도로 시험 암기 노트를 빌드합니다.
      </p>

      {/* 🔑 API 키 패널 */}
      <div style={{ marginBottom: 20, width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14, background: 'rgba(15,23,42,0.4)', padding: 16, borderRadius: 14, border: '1px solid #1e293b' }}>
        <div>
          <span style={{ color: '#94a3b8', fontSize: 13, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span><b>Gemini</b> API 키 <span style={{ color: '#64748b', fontSize: 11 }}>(필수 · 대용량 PDF용)</span></span>
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: '#818cf8', fontSize: 12 }}>발급 링크</a>
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="password" placeholder="AIza..." defaultValue={geminiKey} onBlur={(e) => saveGeminiKey(e.target.value.trim())} style={inputStyle} />
            <button onClick={(e) => saveGeminiKey(e.target.previousSibling.value.trim())} style={btnStyle}>저장</button>
          </div>
        </div>

        <div>
          <span style={{ color: '#94a3b8', fontSize: 13, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span><b>Groq</b> API 키 <span style={{ color: '#64748b', fontSize: 11 }}>(선택 · 초고속 텍스트용)</span></span>
            <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: '#818cf8', fontSize: 12 }}>발급 링크</a>
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="password" placeholder="gsk_..." defaultValue={groqKey} onBlur={(e) => saveGroqKey(e.target.value.trim())} style={inputStyle} />
            <button onClick={(e) => saveGroqKey(e.target.previousSibling.value.trim())} style={btnStyle}>저장</button>
          </div>
        </div>
      </div>

      {(!geminiKey && !groqKey) && (
        <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: 16, color: '#64748b', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
          API 키를 등록해야 플래시카드 자동 추출 시스템을 가동할 수 있습니다.
        </div>
      )}

      {(geminiKey || groqKey) && status === 'idle' && (
        <>
          {/* AI 엔진 선택 인터페이스 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>AI 분석 엔진 선택</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                ['auto', '🤖 자동 분기', '분량에 맞춰 자동 엔진 지정'],
                ['gemini', '☁️ Gemini 전용', '안정적인 텍스트/파일 심층 분석'],
                ['groq', '⚡ Groq 전용', '1초 컷 초고속 텍스트 처리'],
              ].map(([engine, label, desc]) => (
                <button key={engine} onClick={() => setApiEngine(engine)} style={{
                  flex: 1, textAlign: 'left', minWidth: 0,
                  background: apiEngine === engine ? 'rgba(99,102,241,0.12)' : 'rgba(15,23,42,0.6)',
                  border: `1.5px solid ${apiEngine === engine ? '#6366f1' : '#1e293b'}`,
                  borderRadius: 12, padding: '11px 13px', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <div style={{ color: apiEngine === engine ? '#e2e8f0' : '#94a3b8', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</div>
                  <div style={{ color: '#475569', fontSize: 11, marginTop: 2, wordBreak: 'keep-all' }}>{desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>추출 방식</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                ['mnemonic', '🔤 두문자 카드', '두문자(약어)를 매핑하여 추출'],
                ['qa', '💬 질문-답 카드', '주요 쟁점을 Q&A 형태로 추출'],
              ].map(([type, label, desc]) => (
                <button key={type} onClick={() => setExtractType(type)} style={{
                  flex: 1, textAlign: 'left', minWidth: 0,
                  background: extractType === type ? 'rgba(99,102,241,0.12)' : 'rgba(15,23,42,0.6)',
                  border: `1.5px solid ${extractType === type ? '#6366f1' : '#1e293b'}`,
                  borderRadius: 12, padding: '11px 13px', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <div style={{ color: extractType === type ? '#e2e8f0' : '#94a3b8', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</div>
                  <div style={{ color: '#475569', fontSize: 11, marginTop: 2, wordBreak: 'keep-all' }}>{desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 0, marginBottom: 16, background: '#0f172a', borderRadius: 10, padding: 3, width: 'fit-content' }}>
            {[['file', '📄 파일 업로드'], ['text', '✎ 텍스트 붙여넣기']].map(([mode, label]) => (
              <button key={mode} onClick={() => setInputMode(mode)} style={{
                background: inputMode === mode ? '#1e293b' : 'none', color: inputMode === mode ? '#e2e8f0' : '#475569',
                border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, cursor: 'pointer', fontWeight: inputMode === mode ? 600 : 400, transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>

          {inputMode === 'file' ? (
            <div
              style={{
                border: `2px dashed ${dragging ? '#6366f1' : '#334155'}`, borderRadius: 16, padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
                background: dragging ? 'rgba(99,102,241,0.07)' : 'rgba(15,23,42,0.6)', transition: 'all 0.2s', width: '100%', boxSizing: 'border-box'
              }}
              onClick={() => inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              <input ref={inputRef} type="file" accept=".pdf,.txt" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f) }} />
              <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
              <div style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, wordBreak: 'keep-all' }}>PDF, TXT 파일을 드래그하거나<br /><span style={{ color: '#818cf8', fontWeight: 600 }}>클릭하여 탐색기 열기</span></div>
              <div style={{ color: '#475569', fontSize: 11, marginTop: 10, lineHeight: 1.6, wordBreak: 'keep-all' }}>단원 및 테마 단위 분할 업로드 권장 (최대 {MAX_FILE_MB}MB) · Word는 PDF로 변환 후 업로드</div>
            </div>
          ) : (
            <div style={{ width: '100%', boxSizing: 'border-box' }}>
              <textarea
                value={textInput} onChange={(e) => setTextInput(e.target.value)}
                placeholder={'강의 필기, 요약문서 등을 붙여넣으세요.\n\n예시:\n이행지체 요건: 이.가.게.귀.위\n[이행기 도래 / 이행 가능 / 이행 게을리함 / 귀책사유 / 위법성]'}
                style={{
                  width: '100%', boxSizing: 'border-box', minWidth: 0, background: 'rgba(15,23,42,0.8)', border: '1px solid #334155',
                  borderRadius: 14, padding: '16px', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', minHeight: 200, lineHeight: 1.7,
                }}
              />
              <button
                onClick={handleTextSubmit} disabled={!textInput.trim()}
                style={{
                  marginTop: 10, width: '100%', background: textInput.trim() ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#1e293b',
                  color: textInput.trim() ? '#fff' : '#475569', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, cursor: textInput.trim() ? 'pointer' : 'not-allowed', fontWeight: 700,
                }}
              >분석 시작</button>
            </div>
          )}
        </>
      )}

      {status === 'loading' && (
        <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #1e293b', borderRadius: 16, padding: '48px 32px', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ fontSize: 50, fontWeight: 800, color: '#6366f1', marginBottom: 8, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, lineHeight: 1 }}>{Math.round(loadingPct)}%</div>
          <div style={{ background: '#0f172a', borderRadius: 8, height: 6, margin: '0 auto 24px', width: '100%', maxWidth: 300, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', height: '100%', borderRadius: 8, width: `${loadingPct}%`, transition: 'width 0.35s ease' }} />
          </div>
          <div style={{ color: '#94a3b8', fontSize: 14 }}>{progress}</div>
          {file && <div style={{ color: '#475569', fontSize: 12, marginTop: 6, wordBreak: 'break-all' }}>{file.name}</div>}
        </div>
      )}

      {status === 'error' && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: '28px', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
          <div style={{ color: '#fca5a5', fontSize: 14, marginBottom: 16, wordBreak: 'keep-all', whiteSpace: 'pre-wrap' }}>{errorMsg}</div>
          <button onClick={reset} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 24px', fontSize: 13, cursor: 'pointer' }}>다시 시도</button>
        </div>
      )}

      {status === 'done' && (
        <div style={{ width: '100%' }}>
          {truncated && (
            <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, color: '#fbbf24', fontSize: 13, lineHeight: 1.6 }}>
              ⚠️ <b>AI 데이터 처리량 한계 초과:</b> 응답 스크립트가 중간에 누락되었을 수 있으니, 불안정할 경우 <b>문서를 조금 더 작게 분할하여</b> 실행해 주세요.
            </div>
          )}

          <GroupEditorPanel extracted={extracted} onUpdateGroup={updateGroup} subjects={allSubjects} getParts={getPartsForSubject} />

          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              ['all', `전체 ${counts.all}`],
              ['new', `🆕 새 카드 ${counts.new}`],
              ['upgrade', `⬆ 내용 보강 ${counts.upgrade}`],
              ['existing', `✓ 이미 보유 ${counts.existing}`],
            ].map(([tab, label]) => (
              <button key={tab} onClick={() => setFilterTab(tab)} style={{
                background: filterTab === tab ? '#1e293b' : 'none', border: `1px solid ${filterTab === tab ? '#6366f1' : '#1e293b'}`, color: filterTab === tab ? '#e2e8f0' : '#475569', borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: filterTab === tab ? 600 : 400, whiteSpace: 'nowrap'
              }}>{label}</button>
            ))}
            <button onClick={toggleAll} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #1e293b', borderRadius: 8, padding: '5px 12px', color: '#475569', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {visible.length > 0 && visible.every(({ i }) => selected.has(i)) ? '전체 해제' : '전체 선택'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto', overflowX: 'hidden', marginBottom: 14, width: '100%', boxSizing: 'border-box' }}>
            {visible.length === 0 ? <div style={{ color: '#334155', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>조건에 맞는 데이터 카드가 없습니다.</div> : visible.map(({ c, i }) => (
                <CardItem key={i} card={c} type={c._type} checked={selected.has(i)} onToggle={() => toggle(i)} onChange={(updated) => updateCard(i, updated)} subjects={allSubjects} getParts={getPartsForSubject} />
              ))
            }
          </div>

          <div style={{ display: 'flex', gap: 10, width: '100%', flexWrap: 'wrap' }}>
            <button
              style={{ flex: 1, minWidth: '150px', background: selected.size === 0 ? '#1e293b' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: selected.size === 0 ? '#475569' : '#fff', border: 'none', borderRadius: 12, padding: '13px 20px', fontSize: 14, cursor: selected.size === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}
              disabled={selected.size === 0} onClick={doImport}
            >내 카드 서재에 추가 ({selected.size}개)</button>
            <button onClick={reset} style={{ background: '#1e293b', color: '#94a3b8', border: 'none', flex: '0 0 auto', borderRadius: 12, padding: '13px 20px', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>새로 추출</button>
          </div>

          {importMsg && <div style={{ marginTop: 10, textAlign: 'center', color: '#22c55e', fontSize: 13, fontWeight: 600 }}>{importMsg}</div>}
        </div>
      )}
    </div>
  )
}
