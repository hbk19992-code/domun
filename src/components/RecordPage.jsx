import { useEffect, useMemo, useState } from 'react'
import { answerLabel, cardKindLabel, isCivilRecordGradingCard } from '../utils/cardType'
import { gradeAnswer } from '../utils/grading'
import { getTopCategory, matchesTopCategory } from '../utils/classification'

const ATTEMPT_KEY = 'record_answer_attempts_v1'

function getCardKey(card = {}) {
  return card.id || card.question || `${card.subject}-${card.part}-${card.sourceNumber}`
}

function readAttempts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ATTEMPT_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function attemptStatus(attempt) {
  if (!attempt?.checkedAt) return 'notStarted'
  return Number(attempt.accuracy || 0) >= 90 ? 'passed' : 'rewrite'
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const FILTERS = [
  ['all', '전체'],
  ['notStarted', '미작성'],
  ['rewrite', '재작성 필요'],
  ['passed', '통과'],
]

const S = {
  empty: { textAlign: 'center', padding: '72px 0', color: 'var(--theme-textDim, #475569)' },
  titleRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap' },
  h2: { color: 'var(--theme-text, #e2e8f0)', fontSize: 21, fontWeight: 900, margin: 0 },
  sub: { color: 'var(--theme-textDim, #64748b)', fontSize: 13, lineHeight: 1.55, marginTop: 5 },
  filters: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  select: {
    background: 'var(--theme-elevated, #0f172a)', border: '1px solid var(--theme-borderStrong, #334155)', borderRadius: 8,
    color: 'var(--theme-textMuted, #94a3b8)', padding: '8px 10px', fontSize: 13, cursor: 'pointer',
  },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 16 },
  stat: (active, color, bg) => ({
    background: active ? bg : 'var(--theme-panelSoft, rgba(15,23,42,0.56))',
    border: `1px solid ${active ? color : 'var(--theme-border, #1e293b)'}`,
    borderRadius: 12,
    padding: '12px 13px',
    cursor: 'pointer',
    textAlign: 'left',
  }),
  statNum: (color) => ({ color, fontSize: 21, lineHeight: 1, fontWeight: 900 }),
  statLabel: { color: 'var(--theme-textDim, #64748b)', fontSize: 12, marginTop: 6 },
  shell: { display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' },
  list: {
    flex: '0 1 310px',
    minWidth: 260,
    background: 'var(--theme-panelSoft, rgba(15,23,42,0.58))',
    border: '1px solid var(--theme-border, #1e293b)',
    borderRadius: 16,
    padding: 10,
    maxHeight: 640,
    overflowY: 'auto',
    boxSizing: 'border-box',
  },
  listItem: (active) => ({
    background: active ? 'var(--theme-accentSoft, rgba(99,102,241,0.15))' : 'var(--theme-input, rgba(10,15,30,0.46))',
    border: `1px solid ${active ? 'var(--theme-accentStrong, #6366f1)' : 'var(--theme-border, #1e293b)'}`,
    borderRadius: 12,
    padding: 11,
    marginBottom: 8,
    cursor: 'pointer',
  }),
  badge: {
    display: 'inline-block',
    background: 'var(--theme-chip, #1e293b)',
    color: 'var(--theme-textDim, #64748b)',
    borderRadius: 6,
    fontSize: 11,
    padding: '3px 8px',
    marginBottom: 10,
  },
  panel: { flex: '1 1 560px', minWidth: 0, background: 'var(--theme-panel, rgba(15,23,42,0.82))', border: '1px solid var(--theme-border, #1e293b)', borderRadius: 18, overflow: 'hidden' },
  panelHead: { padding: '18px 18px 14px', borderBottom: '1px solid var(--theme-border, #1e293b)' },
  question: { color: 'var(--theme-text, #e2e8f0)', fontSize: 17, fontWeight: 800, lineHeight: 1.55, wordBreak: 'keep-all' },
  body: { padding: 18 },
  textarea: {
    width: '100%', boxSizing: 'border-box', minHeight: 300, resize: 'vertical',
    background: 'var(--theme-input, #0a0f1e)', border: '1.5px solid var(--theme-borderStrong, #334155)', borderRadius: 12,
    color: 'var(--theme-text, #e2e8f0)', padding: '14px 15px', fontSize: 14, lineHeight: 1.7,
    fontFamily: 'inherit', outline: 'none',
  },
  btnRow: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  btn: (primary, disabled) => ({
    background: disabled ? 'var(--theme-button, #1e293b)' : primary ? 'var(--theme-accentGradient, linear-gradient(135deg,#6366f1,#8b5cf6))' : 'var(--theme-button, #1e293b)',
    color: disabled ? 'var(--theme-textDim, #475569)' : primary ? 'var(--theme-onAccent, #fff)' : 'var(--theme-textMuted, #94a3b8)',
    border: 'none',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: primary ? 900 : 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  keyword: {
    background: 'var(--theme-warningSoft, rgba(245,158,11,0.14))',
    border: '1px solid var(--theme-warningSoft, rgba(245,158,11,0.14))',
    borderRadius: 12,
    color: 'var(--theme-warningText, #fbbf24)',
    padding: '10px 12px',
    fontSize: 13,
    lineHeight: 1.55,
    fontWeight: 800,
    marginBottom: 12,
    whiteSpace: 'pre-wrap',
  },
  figure: {
    background: 'var(--theme-figureBg, #fff)',
    color: 'var(--theme-figureText, #0f172a)',
    border: '1px solid var(--theme-figureBorder, #e2e8f0)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    overflowX: 'auto',
    lineHeight: 1.5,
  },
}

function statusLabel(status) {
  if (status === 'passed') return ['통과', 'var(--theme-success, #22c55e)', 'var(--theme-successSoft, rgba(34,197,94,0.14))']
  if (status === 'rewrite') return ['재작성 필요', 'var(--theme-warning, #f59e0b)', 'var(--theme-warningSoft, rgba(245,158,11,0.14))']
  return ['미작성', 'var(--theme-textDim, #64748b)', 'var(--theme-panelSoft, rgba(15,23,42,0.56))']
}

function DiffView({ result }) {
  if (!result) return null
  return (
    <div style={{
      background: 'var(--theme-input, #0a0f1e)',
      border: '1px solid var(--theme-border, #1e293b)',
      borderRadius: 12,
      color: 'var(--theme-textMuted, #cbd5e1)',
      padding: 14,
      fontSize: 13,
      lineHeight: 1.75,
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      marginBottom: 12,
    }}>
      {result.diff.map((part, index) => {
        if (part.type === 'same') return <span key={index}>{part.text}</span>
        if (part.type === 'add') {
          return <span key={index} style={{ background: 'var(--theme-successSoft, rgba(34,197,94,0.14))', color: 'var(--theme-successText, #86efac)', fontWeight: 800 }}>{part.text}</span>
        }
        return <span key={index} style={{ background: 'var(--theme-dangerSoft, rgba(239,68,68,0.14))', color: 'var(--theme-dangerText, #fca5a5)', textDecoration: 'line-through' }}>{part.text}</span>
      })}
    </div>
  )
}

export default function RecordPage({ cards }) {
  const { allCards, topCategories = [], subjects = [] } = cards
  const [attempts, setAttempts] = useState(() => readAttempts())
  const [topCategory, setTopCategory] = useState('전체')
  const [subject, setSubject] = useState('전체')
  const [part, setPart] = useState('전체')
  const [progressFilter, setProgressFilter] = useState('all')
  const [activeKey, setActiveKey] = useState('')
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState(null)
  const [answerVisible, setAnswerVisible] = useState(false)

  useEffect(() => {
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempts))
  }, [attempts])

  const recordCards = useMemo(
    () => allCards.filter((card) => isCivilRecordGradingCard(card)),
    [allCards]
  )

  const subjectOptions = useMemo(() => {
    const base = recordCards.filter((card) => matchesTopCategory(card, topCategory))
    return [...new Set(base.map((card) => card.subject).filter(Boolean))]
  }, [recordCards, topCategory])

  const partOptions = useMemo(() => {
    const base = recordCards
      .filter((card) => matchesTopCategory(card, topCategory))
      .filter((card) => subject === '전체' || card.subject === subject)
    return [...new Set(base.map((card) => card.part).filter(Boolean))]
  }, [recordCards, topCategory, subject])

  const scopedCards = useMemo(() => {
    return recordCards
      .filter((card) => matchesTopCategory(card, topCategory))
      .filter((card) => subject === '전체' || card.subject === subject)
      .filter((card) => part === '전체' || card.part === part)
  }, [recordCards, topCategory, subject, part])

  const stats = useMemo(() => {
    const base = { all: scopedCards.length, notStarted: 0, rewrite: 0, passed: 0 }
    scopedCards.forEach((card) => {
      base[attemptStatus(attempts[getCardKey(card)])] += 1
    })
    return base
  }, [attempts, scopedCards])

  const visibleCards = useMemo(() => {
    if (progressFilter === 'all') return scopedCards
    return scopedCards.filter((card) => attemptStatus(attempts[getCardKey(card)]) === progressFilter)
  }, [attempts, progressFilter, scopedCards])

  const currentCard = useMemo(() => {
    return visibleCards.find((card) => getCardKey(card) === activeKey) || visibleCards[0] || null
  }, [activeKey, visibleCards])

  const currentKey = currentCard ? getCardKey(currentCard) : ''
  const currentAttempt = currentKey ? attempts[currentKey] : null

  useEffect(() => {
    if (!currentCard) {
      setActiveKey('')
      setDraft('')
      setResult(null)
      setAnswerVisible(false)
      return
    }
    const key = getCardKey(currentCard)
    if (activeKey !== key) setActiveKey(key)
  }, [activeKey, currentCard])

  useEffect(() => {
    if (!currentKey) return
    setDraft(attempts[currentKey]?.draft || '')
    setResult(null)
    setAnswerVisible(false)
  }, [currentKey])

  const updateDraft = (value) => {
    setDraft(value)
    if (!currentKey) return
    setAttempts((prev) => ({
      ...prev,
      [currentKey]: {
        ...(prev[currentKey] || {}),
        draft: value,
      },
    }))
  }

  const gradeCurrent = () => {
    if (!currentCard || !String(draft || '').trim()) return
    const nextResult = gradeAnswer(draft, currentCard.answer || '')
    setResult(nextResult)
    setAnswerVisible(true)
    setAttempts((prev) => ({
      ...prev,
      [currentKey]: {
        ...(prev[currentKey] || {}),
        draft,
        accuracy: nextResult.accuracy,
        checkedAt: new Date().toISOString(),
      },
    }))
  }

  const showAnswer = () => {
    setResult(null)
    setAnswerVisible(true)
  }

  const rewrite = () => {
    setDraft('')
    setResult(null)
    setAnswerVisible(false)
    if (!currentKey) return
    setAttempts((prev) => ({
      ...prev,
      [currentKey]: {
        ...(prev[currentKey] || {}),
        draft: '',
      },
    }))
  }

  const goNext = () => {
    if (!currentCard || visibleCards.length === 0) return
    const currentIndex = visibleCards.findIndex((card) => getCardKey(card) === currentKey)
    const next = visibleCards[Math.min(visibleCards.length - 1, currentIndex + 1)]
    if (next) setActiveKey(getCardKey(next))
  }

  if (recordCards.length === 0) {
    return (
      <div style={S.empty}>
        <div style={{ fontSize: 42, marginBottom: 14 }}>✎</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--theme-textDim, #64748b)', marginBottom: 8 }}>기록형 카드가 없습니다</div>
        <div style={{ color: 'var(--theme-borderStrong, #334155)', fontSize: 14 }}>민사기록형 카드가 추가되면 이 화면에서 답안 작성과 채점을 따로 진행할 수 있습니다.</div>
      </div>
    )
  }

  const currentStatus = attemptStatus(currentAttempt)
  const [currentStatusText, currentStatusColor, currentStatusBg] = statusLabel(currentStatus)

  return (
    <div>
      <div style={S.titleRow}>
        <div>
          <h2 style={S.h2}>기록형</h2>
          <div style={S.sub}>답안을 먼저 쓰고, 채점 후에만 키워드와 모범답안을 확인합니다.</div>
        </div>
        <div style={{ color: currentStatusColor, border: `1px solid ${currentStatusColor}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 900, background: currentStatusBg }}>
          {currentStatusText}{currentAttempt?.accuracy != null ? ` · ${currentAttempt.accuracy}%` : ''}
        </div>
      </div>

      <div style={S.filters}>
        <select style={S.select} value={topCategory} onChange={(e) => { setTopCategory(e.target.value); setSubject('전체'); setPart('전체') }}>
          <option>전체</option>
          {[...new Set(topCategories.filter(Boolean))].map((value) => <option key={value}>{value}</option>)}
        </select>
        <select style={S.select} value={subject} onChange={(e) => { setSubject(e.target.value); setPart('전체') }}>
          <option>전체</option>
          {subjectOptions.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select style={S.select} value={part} onChange={(e) => setPart(e.target.value)}>
          <option>전체</option>
          {partOptions.map((value) => <option key={value}>{value}</option>)}
        </select>
      </div>

      <div style={S.statGrid}>
        {FILTERS.map(([key, label]) => {
          const color = key === 'passed' ? 'var(--theme-success, #22c55e)' : key === 'rewrite' ? 'var(--theme-warning, #f59e0b)' : key === 'notStarted' ? 'var(--theme-textDim, #64748b)' : 'var(--theme-accent, #818cf8)'
          const bg = key === 'passed' ? 'var(--theme-successSoft, rgba(34,197,94,0.14))' : key === 'rewrite' ? 'var(--theme-warningSoft, rgba(245,158,11,0.14))' : key === 'notStarted' ? 'var(--theme-panelSoft, rgba(15,23,42,0.56))' : 'var(--theme-accentSoft, rgba(99,102,241,0.15))'
          const active = progressFilter === key
          return (
            <div key={key} style={S.stat(active, color, bg)} onClick={() => setProgressFilter(key)}>
              <div style={S.statNum(color)}>{stats[key]}</div>
              <div style={S.statLabel}>{label}</div>
            </div>
          )
        })}
      </div>

      {visibleCards.length === 0 ? (
        <div style={{ ...S.empty, padding: '42px 0' }}>
          <div style={{ color: 'var(--theme-textDim, #475569)', fontSize: 14 }}>조건에 맞는 기록형 카드가 없습니다.</div>
        </div>
      ) : (
        <div style={S.shell}>
          <div style={S.list}>
            {visibleCards.map((card) => {
              const key = getCardKey(card)
              const attempt = attempts[key]
              const [label, color] = statusLabel(attemptStatus(attempt))
              const active = key === currentKey
              return (
                <div key={key} style={S.listItem(active)} onClick={() => setActiveKey(key)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
                    <span style={{ color, fontSize: 11, fontWeight: 900 }}>{label}</span>
                    {attempt?.accuracy != null && <span style={{ color: 'var(--theme-textDim, #64748b)', fontSize: 11 }}>{attempt.accuracy}%</span>}
                  </div>
                  <div style={{ color: 'var(--theme-text, #e2e8f0)', fontSize: 13, fontWeight: 800, lineHeight: 1.35, marginBottom: 5 }}>{card.question}</div>
                  <div style={{ color: 'var(--theme-textDim, #475569)', fontSize: 11 }}>{card.subject} · {card.part}</div>
                </div>
              )
            })}
          </div>

          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.badge}>{getTopCategory(currentCard)} · {currentCard.subject} · {currentCard.part}{currentCard.sourceNumber ? ` · 원문 ${currentCard.sourceNumber}` : ''} · {cardKindLabel(currentCard)}</div>
              <div style={S.question}>{currentCard.question}</div>
              {currentAttempt?.checkedAt && (
                <div style={{ color: 'var(--theme-textDim, #475569)', fontSize: 11, marginTop: 8 }}>최근 채점: {formatDate(currentAttempt.checkedAt)}</div>
              )}
            </div>

            <div style={S.body}>
              {currentCard.figure && (
                <div
                  style={S.figure}
                  dangerouslySetInnerHTML={{ __html: currentCard.figure }}
                />
              )}

              {!answerVisible && (
                <textarea
                  value={draft}
                  onChange={(event) => updateDraft(event.target.value)}
                  placeholder="여기에 답안을 직접 써보세요. 키워드와 모범답안은 채점 후에만 보입니다."
                  style={S.textarea}
                />
              )}

              {answerVisible && (
                <div>
                  {result && (
                    <div style={{
                      background: result.accuracy >= 90 ? 'var(--theme-successSoft, rgba(34,197,94,0.14))' : result.accuracy >= 70 ? 'var(--theme-warningSoft, rgba(245,158,11,0.14))' : 'var(--theme-dangerSoft, rgba(239,68,68,0.14))',
                      border: `1px solid ${result.accuracy >= 90 ? 'var(--theme-success, #22c55e)' : result.accuracy >= 70 ? 'var(--theme-warning, #f59e0b)' : 'var(--theme-danger, #ef4444)'}`,
                      color: result.accuracy >= 90 ? 'var(--theme-successText, #86efac)' : result.accuracy >= 70 ? 'var(--theme-warningText, #fbbf24)' : 'var(--theme-dangerText, #fca5a5)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      textAlign: 'center',
                      fontSize: 14,
                      fontWeight: 900,
                      marginBottom: 12,
                    }}>
                      정확도 {result.accuracy}% · 차이 {result.errorCount}곳
                    </div>
                  )}

                  {currentCard.mnemonic && <div style={S.keyword}>키워드: {currentCard.mnemonic}</div>}

                  {result && (
                    <>
                      <div style={{ color: 'var(--theme-textDim, #64748b)', fontSize: 12, fontWeight: 800, marginBottom: 7 }}>내 답안과 모범답안 비교</div>
                      <DiffView result={result} />
                    </>
                  )}

                  <details open style={{ background: 'var(--theme-input, #0a0f1e)', border: '1px solid var(--theme-border, #1e293b)', borderRadius: 12, overflow: 'hidden' }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--theme-infoText, #7dd3fc)', fontSize: 12, fontWeight: 900, padding: '10px 12px' }}>
                      {answerLabel(currentCard)}
                    </summary>
                    <div style={{ borderTop: '1px solid var(--theme-border, #1e293b)', color: 'var(--theme-text, #e2e8f0)', padding: 13, fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                      {currentCard.answer}
                    </div>
                  </details>
                </div>
              )}

              <div style={S.btnRow}>
                {!answerVisible ? (
                  <>
                    <button style={S.btn(false)} onClick={rewrite}>지우기</button>
                    <button style={S.btn(false)} onClick={showAnswer}>정답 보기</button>
                    <button style={{ ...S.btn(true, !String(draft || '').trim()), flex: 1 }} disabled={!String(draft || '').trim()} onClick={gradeCurrent}>채점하기</button>
                  </>
                ) : (
                  <>
                    <button style={{ ...S.btn(true), flex: 1 }} onClick={rewrite}>다시 쓰기</button>
                    <button style={S.btn(false, visibleCards.length <= 1)} disabled={visibleCards.length <= 1} onClick={goNext}>다음 기록형</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
