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
const GROQ_MODELS = ['llama3-70b-8192', 'llama3-8b-8192']

const MAX_FILE_MB = 15

const MNEMONIC_PROMPT = `당신은 법학 시험 두문자(두문자어) 카드를 빠짐없이 추출하는 전문가입니다.

【절대 규칙】
- 문서에 실제로 있는 두문자는 단 하나도 놓치지 말 것.
- 단, 문서에 없는 두문자나 의미를 지어내지 말 것. (날조 금지)
- 패턴에 해당하면 추출하되, 근거는 항상 문서 내용이어야 한다.

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
- detail: 두문자의 각 글자가 무엇의 약자인지 풀어쓴 것 (문서에 있는 의미 그대로)

【과목·단원 분류 — subject / part】
- subject: 법 과목명 (예: 민법, 형법, 헌법, 행정법, 민사소송법, 상법)
- part: 장·절·주제 단위 (예: 채권총론, 물권법, 법률행위, 소송요건)
- 문서 전체에서 같은 단원은 반드시 같은 이름으로 통일할 것.
- 판단이 어려우면 해당 값을 "미분류"로 둘 것 (빈 문자열 대신 "미분류")

【출력 형식 — 순수 JSON 배열만】
[{"subject":"과목명","part":"단원명","question":"질문","mnemonic":"두문자","detail":"① 의미1 / ② 의미2 ..."}]
- 큰따옴표·줄바꿈 등 특수문자는 JSON 규칙에 맞게 이스케이프하여 항상 유효한 JSON을 출력할 것.

최종 점검: 출력 전 문서를 다시 훑어 (1) 누락된 두문자가 없는지, (2) subject/part 이름이 일관적인지 확인하라.`

const QA_PROMPT = `당신은 법학 시험 학습 카드를 만드는 전문가입니다.
업로드된 문서에서 시험에 나올 핵심 내용을 질문-답 형태의 학습 카드로 빠짐없이 추출하세요.

【추출 방법】
- 문서 전체를 읽으며 시험에 나올 만한 핵심 개념·요건·효과·판례·정의를 찾는다
- 각 핵심 내용을 질문(question)과 답(answer) 한 쌍으로 만든다
- 한 카드에는 하나의 개념만 담는다
- 두문자가 있든 없든 상관없이, 내용 자체를 질문-답으로 만든다
- answer는 간결하면서도 정확하게, 핵심을 빠뜨리지 말 것

【출력 형식 — 순수 JSON 배열만】
[{"subject":"과목명","part":"파트명","question":"질문","answer":"답"}]

최종 점검: 출력 전 문서를 다시 훑어 누락된 핵심 내용이 없는지 확인하라.`

async function callGroq(apiKey, model, text, systemPrompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `다음 텍스트에서 카드를 추출해줘:\n\n${text}` }
      ],
      temperature: 0.1,
    })
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('__GROQ_AUTH__');
    if (res.status === 429) throw new Error('__GROQ_BUSY__');
    if (data.error?.message?.includes('Context length')) throw new Error('__GROQ_TOO_LONG__');
    throw new Error(data.error?.message || `Groq API 오류 (${res.status})`);
  }
  return data.choices?.[0]?.message?.content || '[]';
}

async function extractWithGroq(apiKey, text, systemPrompt, setProgress) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let m = 0; m < GROQ_MODELS.length; m++) {
    const model = GROQ_MODELS[m];
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        setProgress(`⚡ Groq 초고속 분석 중... (${model})`);
        return await callGroq(apiKey, model, text, systemPrompt);
      } catch (e) {
        if (e.message === '__GROQ_AUTH__') throw new Error('Groq API 키가 올바르지 않습니다.');
        if (e.message === '__GROQ_TOO_LONG__') throw e;
        if (e.message === '__GROQ_BUSY__') {
          if (attempt < 2) { await sleep(1500); continue; }
          if (m < GROQ_MODELS.length - 1) break;
        }
        throw e;
      }
    }
  }
  throw new Error('Groq 서버 응답 실패');
}

async function callGemini(apiKey, model, parts, systemPrompt) {
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
  // 🟢 [추가됨] 사용자가 직접 AI 엔진을 선택할 수 있는 상태 수립
  const [apiEngine, setApiEngine] = useState('auto') // 'auto' | 'gemini' | 'groq'

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

  // 🟢 [수정됨] 사용자가 지정한 엔진 선택 규칙을 반영하도록 고도화
  const runExtraction = useCallback(async (parts, label, sourceText = null) => {
    setStatus('loading'); setExtracted([]); setSelected(new Set()); setErrorMsg(''); setTruncated(false)
    try {
      setProgress(`${label} 준비 중...`)
      const prompt = extractType === 'qa' ? QA_PROMPT : MNEMONIC_PROMPT
      let raw = '';

      // 수동 지정 상태 및 예외 상황 검증
      let useGroq = false;
      if (apiEngine === 'groq') {
        if (!sourceText) {
          throw new Error("⚠️ Groq 엔진은 기술 특성상 PDF/Word 파일 분석을 직접 수행하지 못합니다.\n텍스트를 직접 복사해서 붙여넣거나, 파일 분석 시에는 상단 엔진을 'Gemini' 또는 '자동 분기'로 선택해 주세요.");
        }
        if (!groqKey) throw new Error("Groq API 키가 입력되지 않았습니다.");
        useGroq = true;
      } else if (apiEngine === 'gemini') {
        useGroq = false;
      } else {
        // 'auto' 모드일 때는 분량 계산 및 키 존재 유무 확인 후 분기
        useGroq = sourceText && sourceText.length < 15000 && groqKey;
      }

      if (useGroq) {
        try {
          raw = await extractWithGroq(groqKey, sourceText, prompt, setProgress);
        } catch(groqErr) {
          // 사용자가 수동으로 Groq을 선택한 경우라면 임의로 Gemini로 안 넘기고 에러 표시
          if (apiEngine === 'groq') throw groqErr;
          
          console.warn("Groq 실패, Gemini로 전환:", groqErr);
          if (!geminiKey) throw new Error(groqErr.message + "\n(대체할 Gemini 키가 없습니다)");
          raw = await extractWithGemini(geminiKey, parts, prompt, setProgress);
        }
      } else {
        if (!geminiKey) throw new Error("Gemini API 키가 필수입니다.");
        raw = await extractWithGemini(geminiKey, parts, prompt, setProgress);
      }

      raw = raw.replace(/```json|```/g, '').trim()
      const { data: parsed, truncated: wasTruncated } = repairJSON(raw)
      
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error(extractType === 'qa' ? '핵심 내용을 찾지 못했습니다.' : '두문자 카드를 찾지 못했습니다.')
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
  }, [geminiKey, groqKey, cards.allCards, extractType, apiEngine]) // apiEngine 의존성 주입

  const handleFile = useCallback(async (f) => {
    if (!geminiKey && !groqKey) return
    setFile(f)
    const sizeMB = f.size / (1024 * 1024)
    if (sizeMB > MAX_FILE_MB) {
      setErrorMsg(`파일이 너무 큽니다 (${sizeMB.toFixed(1)}MB). 최대 ${MAX_FILE_MB}MB까지 업로드할 수 있습니다.\n교재를 단원별로 나눠서 올려주세요.`)
      setStatus('error')
      return
    }
    const ext = f.name.split('.').pop().toLowerCase()
    let parts;
    let sourceText = null;

    if (ext === 'txt') {
      const text = await new Promise((res) => { const r = new FileReader(); r.onload = (e) => res(e.target.result); r.readAsText(f) })
      parts = [{ text: `다음 텍스트에서 카드를 빠짐없이 추출해주세요:\n\n${text}` }]
      sourceText = text;
    } else {
      const base64 = await readBase64(f)
      parts = [
        { inline_data: { mime_type: ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: base64 } },
        { text: '이 문서의 모든 내용을 분석해 카드를 빠짐없이 추출해주세요.' },
      ]
    }
    await runExtraction(parts, f.name, sourceText)
  }, [geminiKey, groqKey, runExtraction])

  const handleTextSubmit = useCallback(async () => {
    if ((!geminiKey && !groqKey) || !textInput.trim()) return
    const parts = [{ text: `다음 텍스트에서 카드를 빠짐없이 추출해주세요:\n\n${textInput}` }]
    await runExtraction(parts, '텍스트', textInput)
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

  const doImport = () => {
    const toAdd = extracted.filter((c, i) => selected.has(i)).map(({ _type, ...c }) => c)
    if (toAdd.length === 0) return
    const added = cards.addCards(toAdd)
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
        원하는 AI 엔진을 직접 고르거나 자동 분기로 최적의 결과를 얻을 수 있습니다.
      </p>

      {/* 🔑 API 키 입력 패널 */}
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
            <span><b>Groq</b> API 키 <span style={{ color: '#64748b', fontSize: 11 }}>(선택 · 단문 초고속용)</span></span>
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
          API 키를 최소 하나 이상 입력해야 사용할 수 있습니다.
        </div>
      )}

      {(geminiKey || groqKey) && status === 'idle' && (
        <>
          {/* 🟢 [추가됨] AI 엔진 수동 선택 토글 패널 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>AI 분석 엔진 선택</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                ['auto', '🤖 자동 분기', '분량에 맞춰 자동 토스'],
                ['gemini', '☁️ Gemini 전용', '안정적인 심층 분석 (PDF 필수)'],
                ['groq', '⚡ Groq 전용', '1초 컷 초고속 처리 (단문 전용)'],
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
                ['mnemonic', '🔤 두문자 카드', '두문자(약어)를 뽑아 카드로'],
                ['qa', '💬 질문-답 카드', '핵심 내용을 Q&A로'],
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
              <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f) }} />
              <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
              <div style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, wordBreak: 'keep-all' }}>PDF, Word, TXT 파일을 끌어다 놓거나<br /><span style={{ color: '#818cf8', fontWeight: 600 }}>클릭하여 선택</span></div>
              <div style={{ color: '#475569', fontSize: 11, marginTop: 10, lineHeight: 1.6, wordBreak: 'keep-all' }}>교재 전체보다 <b style={{ color: '#64748b' }}>단원·절 단위</b>로 나눠 올리면 누락 없이 정확합니다 (최대 {MAX_FILE_MB}MB)</div>
            </div>
          ) : (
            <div style={{ width: '100%', boxSizing: 'border-box' }}>
              <textarea
                value={textInput} onChange={(e) => setTextInput(e.target.value)}
                placeholder={'강의 필기, 카카오톡 정리본, 웹페이지 내용 등을 여기에 붙여넣으세요.\n\n예시:\n이행지체의 요건: 이.가.게.귀.위\n[이행기/이행 가능함에도/이행 게을리/귀책사유/위법성]'}
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
              ⚠️ <b>AI 응답이 중간에 잘렸습니다.</b> 문서 뒷부분의 카드가 누락됐을 수 있습니다. 누락이 의심되면 교재를 <b>단원(절) 단위로 나눠서</b> 다시 추출해 주세요.
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
            {visible.length === 0 ? <div style={{ color: '#334155', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>해당 카드가 없습니다</div> : visible.map(({ c, i }) => (
                <CardItem key={i} card={c} type={c._type} checked={selected.has(i)} onToggle={() => toggle(i)} onChange={(updated) => updateCard(i, updated)} subjects={allSubjects} getParts={getPartsForSubject} />
              ))
            }
          </div>

          <div style={{ display: 'flex', gap: 10, width: '100%', flexWrap: 'wrap' }}>
            <button
              style={{ flex: 1, minWidth: '150px', background: selected.size === 0 ? '#1e293b' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: selected.size === 0 ? '#475569' : '#fff', border: 'none', borderRadius: 12, padding: '13px 20px', fontSize: 14, cursor: selected.size === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}
              disabled={selected.size === 0} onClick={doImport}
            >내 카드에 추가 ({selected.size}개)</button>
            <button onClick={reset} style={{ background: '#1e293b', color: '#94a3b8', border: 'none', flex: '0 0 auto', borderRadius: 12, padding: '13px 20px', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>새로 추출</button>
          </div>

          {importMsg && <div style={{ marginTop: 10, textAlign: 'center', color: '#22c55e', fontSize: 13, fontWeight: 600 }}>{importMsg}</div>}
        </div>
      )}
    </div>
  )
}