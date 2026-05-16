import { useState, useRef, useCallback } from 'react'

const GEMINI_MODEL = 'gemini-2.5-flash'

const SYSTEM_PROMPT = `당신은 법학 시험 준비용 두문자(두문자어) 카드를 추출하는 전문가입니다.
업로드된 문서에서 두문자 학습 카드를 추출하여 JSON 배열만 반환하세요.
설명·마크다운·코드블록 없이 순수 JSON 배열만 출력합니다.

형식:
[{"subject":"과목명","part":"파트명","question":"질문","mnemonic":"두문자","detail":"① 항목1 / ② 항목2 ..."}]

규칙:
- 두문자가 명확히 있는 항목만 추출
- question은 해당 두문자가 답이 되는 질문 형태로
- detail은 번호(①②③...)와 함께 각 의미 서술
- subject/part는 맥락 추론, 불명확하면 "미분류"
- 중복 제외`

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
  actionBtn: (primary) => ({
    flex: 1,
    background: primary ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(99,102,241,0.12)',
    color: primary ? '#fff' : '#818cf8',
    border: primary ? 'none' : '1px solid #6366f1',
    borderRadius: 12, padding: '13px 20px', fontSize: 14,
    cursor: 'pointer', fontWeight: 700,
  }),
}

function KeyInput({ apiKey, onSave }) {
  const [val, setVal] = useState(apiKey)
  return (
    <div style={S.section}>
      <span style={S.label}>Gemini API 키 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: '#818cf8', fontSize: 11 }}>무료 발급 →</a></span>
      <div style={S.keyRow}>
        <input
          type="password" style={S.input}
          placeholder="AIza..."
          value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && val.trim() && onSave(val.trim())}
        />
        <button style={S.saveBtn(val.trim())} onClick={() => val.trim() && onSave(val.trim())}>
          저장
        </button>
      </div>
      <div style={S.keyNote}>키는 브라우저 세션에만 저장되며 외부로 전송되지 않습니다</div>
    </div>
  )
}

export default function ExtractPage({ cards, onImport }) {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('gemini_key') || '')
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle') // idle|loading|done|error
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
        parts = [{ text: `다음 텍스트에서 두문자 카드를 추출해주세요:\n\n${text}` }]
      } else {
        setProgress('파일 읽는 중...')
        const base64 = await readBase64(f)
        parts = [
          { inline_data: { mime_type: ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: base64 } },
          { text: '이 문서에서 두문자 카드를 추출해주세요.' },
        ]
      }
      setProgress('AI 분석 중... (20~60초 소요)')
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new Error('API 키가 올바르지 않습니다')
        throw new Error(data.error?.message || 'Gemini API 오류')
      }
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('두문자 카드를 찾지 못했습니다')
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

  const doImport = () => {
    const toAdd = extracted.filter((_, i) => selected.has(i))
    cards.addCards(toAdd)
    onImport()
  }

  const reset = () => { setFile(null); setStatus('idle'); setExtracted([]); setSelected(new Set()); setErrorMsg('') }

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <h2 style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 800, marginBottom: 4 }}>AI 카드 추출</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>교재 PDF를 올리면 Gemini AI가 두문자 카드로 만들어드립니다</p>

      <KeyInput apiKey={apiKey} onSave={saveKey} />

      {!apiKey && (
        <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: 16, color: '#64748b', fontSize: 13, textAlign: 'center' }}>
          API 키를 입력해야 파일을 업로드할 수 있습니다
        </div>
      )}

      {apiKey && status === 'idle' && (
        <div
          style={S.dropzone(dragging)}
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
            <span style={{ color: '#94a3b8', fontSize: 13 }}>{extracted.length}개 추출 · {selected.size}개 선택</span>
            <button onClick={toggleAll} style={{ background: 'none', border: '1px solid #334155', borderRadius: 8, padding: '4px 12px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
              {selected.size === extracted.length ? '전체 해제' : '전체 선택'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto', marginBottom: 16 }}>
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
            <button style={S.actionBtn(true)} disabled={selected.size === 0} onClick={doImport}>
              내 카드에 추가 ({selected.size}개)
            </button>
            <button style={S.actionBtn(false)} onClick={reset}>새 파일</button>
          </div>
        </div>
      )}
    </div>
  )
}
