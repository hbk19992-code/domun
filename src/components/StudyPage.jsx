import { useState, useMemo, useCallback, useEffect } from 'react'
import { isDue, dueLabel } from '../utils/srs'
import { useTTS, ttsMnemonic, ttsDetail } from '../hooks/useTTS'
import { useCloudSRS } from '../hooks/useCloudSRS'
import { answerLabel, cardKindLabel, getCardKind, isAnswerCard, isCivilRecordGradingCard } from '../utils/cardType'
import { gradeAnswer } from '../utils/grading'
import { getTopCategory, matchesTopCategory } from '../utils/classification'

const STATUS = {
  unknown: { label: '모름',   emoji: '✗', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  unsure:  { label: '헷갈림', emoji: '△', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  known:   { label: '앎',     emoji: '✓', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
}
const STATUS_KEYS = ['unknown', 'unsure', 'known']
function getCardKey(card) { return card.id ?? card.question }

const S = {
  empty: { textAlign: 'center', padding: '80px 0', color: '#475569' },
  reviewBanner: {
    background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.12))',
    border: '1px solid rgba(99,102,241,0.35)', borderRadius: 14,
    padding: '14px 18px', marginBottom: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  reviewBtn: {
    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
    border: 'none', borderRadius: 10, padding: '9px 18px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  filters: { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' },
  select: {
    background: '#0f172a', border: '1px solid #334155', borderRadius: 8,
    color: '#94a3b8', padding: '7px 10px', fontSize: 13, cursor: 'pointer',
  },
  shuffleBtn: (on) => ({
    background: on ? 'rgba(99,102,241,0.15)' : 'none',
    border: `1px solid ${on ? '#6366f1' : '#334155'}`, borderRadius: 8,
    color: on ? '#818cf8' : '#64748b', padding: '7px 12px', fontSize: 13, cursor: 'pointer',
  }),
  progressRow: { display: 'flex', gap: 8, marginBottom: 16 },
  progItem: (color, active) => ({
    flex: 1, padding: '8px 10px', borderRadius: 10,
    background: active ? `${color}22` : 'rgba(15,23,42,0.5)',
    border: `1px solid ${active ? color : '#1e293b'}`,
    textAlign: 'center', cursor: 'pointer',
  }),
  progNum: (color) => ({ color, fontSize: 18, fontWeight: 800, lineHeight: 1 }),
  progLabel: { color: '#64748b', fontSize: 11, marginTop: 3 },
  card: (flipped, statusKey) => {
    const st = statusKey ? STATUS[statusKey] : null
    return {
      background: st ? st.bg : (flipped ? 'rgba(99,102,241,0.1)' : 'rgba(15,23,42,0.8)'),
      border: `1px solid ${st ? st.color : (flipped ? '#6366f1' : '#1e293b')}`,
      borderRadius: 20, padding: '34px 26px', minHeight: 230, cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', userSelect: 'none', marginBottom: 14,
      transition: 'background 0.22s ease, border-color 0.22s ease, transform 0.22s ease',
      transform: flipped ? 'translateY(-1px)' : 'translateY(0)',
    }
  },
  badge: {
    display: 'inline-block', background: '#1e293b', color: '#64748b',
    fontSize: 11, borderRadius: 6, padding: '3px 10px', marginBottom: 14,
  },
  question: { color: '#e2e8f0', fontSize: 17, fontWeight: 700, marginBottom: 18, lineHeight: 1.5 },
  mnemonic: { color: '#818cf8', fontSize: 26, fontWeight: 800, letterSpacing: 2, marginBottom: 12 },
  detail: { color: '#94a3b8', fontSize: 13, lineHeight: 1.7 },
  hint: { color: '#334155', fontSize: 12, marginTop: 12 },
  dueTag: { color: '#475569', fontSize: 11, marginTop: 10 },
  statusRow: { display: 'flex', gap: 10, marginBottom: 16 },
  statusBtn: (key, current) => {
    const st = STATUS[key]
    const active = current === key
    return {
      flex: 1, padding: '11px 0',
      background: active ? st.bg : 'rgba(15,23,42,0.5)',
      border: `1.5px solid ${active ? st.color : '#1e293b'}`,
      borderRadius: 12, color: active ? st.color : '#475569',
      fontSize: 13, fontWeight: active ? 700 : 400, cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    }
  },
  nav: { display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' },
  navBtn: (disabled) => ({
    background: disabled ? '#0a0f1e' : '#1e293b',
    border: '1px solid #334155', borderRadius: 10,
    color: disabled ? '#1e293b' : '#94a3b8',
    padding: '10px 24px', fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  counter: { color: '#475569', fontSize: 13, minWidth: 80, textAlign: 'center' },
  listenBar: {
    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
    borderRadius: 14, padding: '14px 16px', marginBottom: 16,
  },
  listenTop: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  playBtn: (playing) => ({
    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
    background: playing ? 'rgba(239,68,68,0.15)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    border: playing ? '1.5px solid #ef4444' : 'none',
    color: playing ? '#ef4444' : '#fff', fontSize: 18, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }),
  speedRow: { display: 'flex', gap: 6 },
  speedPill: (active) => ({
    background: active ? '#6366f1' : 'rgba(15,23,42,0.6)',
    border: `1px solid ${active ? '#6366f1' : '#334155'}`,
    color: active ? '#fff' : '#64748b',
    borderRadius: 7, padding: '5px 10px', fontSize: 12,
    cursor: 'pointer', fontWeight: active ? 700 : 400,
  }),
}

function DataListInput({ id, value, onChange, placeholder, style, options }) {
  const safeOptions = Array.isArray(options) ? options : []
  return (
    <div style={{ flex: 1, width: '100%', minWidth: 0 }}>
      <input style={style} value={value || ''} onChange={onChange} placeholder={placeholder} list={id} />
      <datalist id={id}>
        {safeOptions.map((opt, i) => <option key={i} value={opt != null ? String(opt) : ''} />)}
      </datalist>
    </div>
  )
}

export default function StudyPage({ cards }) {
  const { allCards, topCategories = [], subjects, subjectsForTop } = cards
  const [topCategory, setTopCategory] = useState('전체')
  const [subject, setSubject] = useState('전체')
  const [part, setPart] = useState('전체')
  const [cardScope, setCardScope] = useState('all')
  const [statusFilter, setStatusFilter] = useState('전체')
  const [mode, setMode] = useState('all')
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [shuffled, setShuffled] = useState(false)
  const [answerInputs, setAnswerInputs] = useState({})

  // ✨ 클라우드 진행률 동기화 적용
  const { srs, srsLoading, review: cloudReview } = useCloudSRS()

  const [listenMode, setListenMode] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const { speak, stop, supported: ttsSupported } = useTTS()

  // ✨ 클라우드 업데이트 함수 적용
  const review = useCallback((card, result) => {
    cloudReview(card, result, getCardKey)
  }, [cloudReview])

  const entryOf = useCallback((card) => srs[getCardKey(card)], [srs])

  const subjectOptions = useMemo(() => {
    if (typeof subjectsForTop === 'function') return subjectsForTop(topCategory)
    return subjects
  }, [subjects, subjectsForTop, topCategory])

  const partOptions = useMemo(() => {
    const scopedTop = allCards.filter((x) => matchesTopCategory(x, topCategory))
    const base = subject === '전체' ? scopedTop : scopedTop.filter((x) => x.subject === subject)
    return [...new Set(base.map((x) => x.part))]
  }, [allCards, subject, topCategory])

  const scoped = useMemo(() => {
    let c = allCards.filter((x) => matchesTopCategory(x, topCategory))
    if (subject !== '전체') c = c.filter((x) => x.subject === subject)
    if (part !== '전체') c = c.filter((x) => x.part === part)
    if (cardScope === 'record') c = c.filter((x) => isCivilRecordGradingCard(x))
    if (cardScope === 'normal') c = c.filter((x) => !isCivilRecordGradingCard(x))
    return c
  }, [allCards, topCategory, subject, part, cardScope])

  const dueCards = useMemo(() => scoped.filter((c) => isDue(srs[getCardKey(c)])), [scoped, srs])

  const deck = useMemo(() => {
    let base = scoped
    if (mode === 'review') base = dueCards
    else if (statusFilter !== '전체')
      base = base.filter((c) => (srs[getCardKey(c)]?.status || 'unknown') === statusFilter)
    return shuffled ? [...base].sort(() => Math.random() - 0.5) : base
  }, [scoped, dueCards, mode, statusFilter, srs, shuffled])

  const stats = useMemo(() => ({
    unknown: scoped.filter((c) => !srs[getCardKey(c)] || srs[getCardKey(c)].status === 'unknown').length,
    unsure:  scoped.filter((c) => srs[getCardKey(c)]?.status === 'unsure').length,
    known:   scoped.filter((c) => srs[getCardKey(c)]?.status === 'known').length,
    total:   scoped.length,
  }), [scoped, srs])

  const scopeStats = useMemo(() => {
    const base = allCards
      .filter((x) => matchesTopCategory(x, topCategory))
      .filter((x) => subject === '전체' || x.subject === subject)
      .filter((x) => part === '전체' || x.part === part)
    const record = base.filter((x) => isCivilRecordGradingCard(x)).length
    return { all: base.length, normal: base.length - record, record }
  }, [allCards, topCategory, subject, part])

  const safeIdx = Math.min(idx, Math.max(0, deck.length - 1))
  const card = deck[safeIdx] || null
  const resetView = () => { setIdx(0); setFlipped(false) }
  const go = (dir) => { setFlipped(false); setIdx((i) => Math.max(0, Math.min(deck.length - 1, i + dir))) }

  const handleStatus = (result) => {
    if (!card) return
    review(card, result)
    if (listenMode) {
      const keepPlaying = playing && safeIdx < deck.length - 1
      stop()
      setFlipped(false)
      setTimeout(() => {
        setIdx((i) => Math.min(deck.length - 1, i + 1))
        setPlaying(keepPlaying)
      }, 180)
      return
    }
    setTimeout(() => { setFlipped(false); setIdx((i) => Math.min(deck.length - 1, i + 1)) }, 280)
  }

  useEffect(() => {
    if (!listenMode || !playing || !card) return
    setFlipped(false)
    const isLast = safeIdx >= deck.length - 1
    const isAnswer = isAnswerCard(card)
    const label = answerLabel(card)
    const segments = isAnswer
      ? [
          { text: card.question, pauseAfter: 1400 },
          { text: label, before: () => setFlipped(true), pauseAfter: 400 },
          { text: ttsDetail(card.answer), pauseAfter: 1600 },
        ]
      : [
          { text: card.question, pauseAfter: 1400 },
          { text: '정답', before: () => setFlipped(true), pauseAfter: 400 },
          { text: ttsMnemonic(card.mnemonic), pauseAfter: 900 },
          { text: ttsDetail(card.detail), pauseAfter: 1600 },
        ]
    speak(segments, { rate, onDone: () => { if (isLast) { setPlaying(false); return } setFlipped(false); setIdx((i) => i + 1) } })
    return () => stop()
  }, [listenMode, playing, safeIdx, rate, card, deck.length, speak, stop])

  const togglePlay = () => { if (playing) { setPlaying(false); stop() } else setPlaying(true) }
  const exitListen = () => { setPlaying(false); stop(); setListenMode(false) }

  useEffect(() => {
    if (subject !== '전체' && !subjectOptions.includes(subject)) {
      setSubject('전체')
      setPart('전체')
      resetView()
    }
  }, [subject, subjectOptions])

  useEffect(() => {
    if (part !== '전체' && !partOptions.includes(part)) {
      setPart('전체')
      resetView()
    }
  }, [part, partOptions])

  if (allCards.length === 0) {
    return (
      <div style={S.empty}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>📭</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>카드가 없습니다</div>
        <div style={{ color: '#334155', fontSize: 14 }}>"AI 추출" 탭에서 교재 PDF를 올려 카드를 만들어보세요</div>
      </div>
    )
  }

  return (
    <div>
      {srsLoading && (
        <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)', color: '#94a3b8', borderRadius: 12, padding: '9px 12px', fontSize: 12, marginBottom: 14 }}>
          학습 진행률을 동기화 중입니다. 카드는 바로 넘길 수 있습니다.
        </div>
      )}

      {mode === 'all' && dueCards.length > 0 && (
        <div style={S.reviewBanner}>
          <div>
            <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>🔔 오늘 복습할 카드 {dueCards.length}개</div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>복습 시점이 된 카드만 모아서 학습합니다</div>
          </div>
          <button style={S.reviewBtn} onClick={() => { setMode('review'); resetView() }}>복습 시작</button>
        </div>
      )}
      {mode === 'review' && (
        <div style={S.reviewBanner}>
          <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>🔔 복습 모드 — {deck.length}개 남음</div>
          <button style={{ ...S.reviewBtn, background: '#1e293b' }} onClick={() => { setMode('all'); resetView() }}>전체 학습으로</button>
        </div>
      )}

      {mode === 'all' && (
        <div style={S.progressRow}>
          {STATUS_KEYS.map((key) => {
            const st = STATUS[key]
            const active = statusFilter === key
            return (
              <div key={key} style={S.progItem(st.color, active)}
                onClick={() => { setStatusFilter(active ? '전체' : key); resetView() }}>
                <div style={S.progNum(st.color)}>{stats[key]}</div>
                <div style={S.progLabel}>{st.label}</div>
              </div>
            )
          })}
          <div style={{ ...S.progItem('#475569', statusFilter === '전체'), flex: 0.6 }}
            onClick={() => { setStatusFilter('전체'); resetView() }}>
            <div style={{ color: '#475569', fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{stats.total}</div>
            <div style={S.progLabel}>전체</div>
          </div>
        </div>
      )}

      <div style={S.filters}>
        <select style={S.select} value={topCategory}
          onChange={(e) => { setTopCategory(e.target.value); setSubject('전체'); setPart('전체'); resetView() }}>
          <option>전체</option>
          {topCategories.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select style={S.select} value={subject}
          onChange={(e) => { setSubject(e.target.value); setPart('전체'); resetView() }}>
          <option>전체</option>
          {subjectOptions.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select style={S.select} value={part} onChange={(e) => { setPart(e.target.value); resetView() }}>
          <option>전체</option>
          {partOptions.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button style={S.shuffleBtn(shuffled)} onClick={() => { setShuffled((s) => !s); resetView() }}>🔀 섞기</button>
        <select style={S.select} value={cardScope} onChange={(e) => { setCardScope(e.target.value); resetView() }}>
          <option value="all">전체 카드 ({scopeStats.all})</option>
          <option value="normal">일반 카드 ({scopeStats.normal})</option>
          <option value="record">기록형 ({scopeStats.record})</option>
        </select>
        {ttsSupported && (
          <button style={S.shuffleBtn(listenMode)}
            onClick={() => { if (listenMode) exitListen(); else { setListenMode(true); setPlaying(false) } }}>
            🔊 음성
          </button>
        )}
      </div>

      {listenMode && (
        <div style={S.listenBar}>
          <div style={S.listenTop}>
            <button style={S.playBtn(playing)} onClick={togglePlay}>{playing ? '⏸' : '▶'}</button>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>
                {playing ? '재생 중 — 자동으로 뒤집고 이어갑니다' : '음성 학습'}
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>질문을 읽은 뒤 자동으로 뒤집고 정답을 읽습니다. 상태 버튼을 누르면 바로 다음 카드로 이어집니다.</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#64748b', fontSize: 12 }}>속도</span>
            <div style={S.speedRow}>
              {[0.8, 1, 1.2, 1.5].map((r) => (
                <button key={r} style={S.speedPill(rate === r)} onClick={() => setRate(r)}>{r}×</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {deck.length === 0 && (
        <div style={{ ...S.empty, padding: '50px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
          <div style={{ color: '#64748b', fontSize: 15 }}>
            {mode === 'review' ? '복습할 카드를 모두 마쳤습니다!' : '해당하는 카드가 없습니다'}
          </div>
          {mode === 'review' && (
            <button style={{ ...S.reviewBtn, marginTop: 16 }} onClick={() => { setMode('all'); resetView() }}>
              전체 학습으로 돌아가기
            </button>
          )}
        </div>
      )}

      {card && <CardWithEdit card={card} flipped={flipped} setFlipped={setFlipped} entryOf={entryOf}
        handleStatus={handleStatus} updateCard={cards.updateCard}
        topCategories={topCategories} subjects={cards?.subjects || []} getParts={cards?.parts}
        listening={listenMode}
        answerInput={answerInputs[getCardKey(card)] || ''}
        onAnswerInputChange={(value) => {
          const key = getCardKey(card)
          setAnswerInputs((prev) => ({ ...prev, [key]: value }))
        }} />}

      {deck.length > 0 && (
        <div style={S.nav}>
          <button style={S.navBtn(safeIdx === 0)} disabled={safeIdx === 0} onClick={() => go(-1)}>← 이전</button>
          <span style={S.counter}>{safeIdx + 1} / {deck.length}</span>
          <button style={S.navBtn(safeIdx === deck.length - 1)} disabled={safeIdx === deck.length - 1} onClick={() => go(1)}>다음 →</button>
        </div>
      )}
    </div>
  )
}

function CardWithEdit({ card, flipped, setFlipped, entryOf, handleStatus, updateCard, topCategories = [], subjects = [], getParts, listening = false, answerInput = '', onAnswerInputChange }) {
  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState(card)
  const kind = getCardKind(card)
  const isAnswer = isAnswerCard(card)
  const isGrading = isCivilRecordGradingCard(card)
  const showGrading = isGrading && !listening
  const canEdit = !!card.id
  const cardKey = card.id ?? card.question

  let safeParts = []
  try { if (typeof getParts === 'function') { const r = getParts(draft?.subject || ''); if (Array.isArray(r)) safeParts = r } } catch(e) {}
  const safeSubjects = Array.isArray(subjects) ? subjects : []
  const safeTopCategories = Array.isArray(topCategories) ? topCategories : []

  const handleSave = () => { updateCard(card.id, draft); setEditOpen(false) }

  const inp = (key, placeholder, multi) => {
    const style = {
      width: '100%', boxSizing: 'border-box',
      background: '#0a0f1e', border: '1px solid #334155', borderRadius: 7,
      padding: '8px 10px', color: '#e2e8f0', fontSize: 13,
      fontFamily: 'inherit', outline: 'none', marginBottom: 6,
      resize: multi ? 'vertical' : 'none',
    }
    if (!multi && key === 'topCategory') {
      return <DataListInput id={`study-${key}-${cardKey}`} value={getTopCategory(draft)}
        onChange={(e) => setDraft({ ...draft, topCategory: e.target.value })}
        placeholder={placeholder} style={style} options={safeTopCategories} />
    }
    if (!multi && (key === 'subject' || key === 'part')) {
      return <DataListInput id={`study-${key}-${cardKey}`} value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        placeholder={placeholder} style={style} options={key === 'subject' ? safeSubjects : safeParts} />
    }
    return multi
      ? <textarea style={{ ...style, minHeight: 64 }} value={draft[key] || ''}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} placeholder={placeholder} />
      : <input style={style} value={draft[key] || ''}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} placeholder={placeholder} />
  }

  return (
    <>
      {showGrading ? (
        <FillInAnswerCard
          card={card}
          cardKey={cardKey}
          value={answerInput}
          onChange={onAnswerInputChange}
        />
      ) : (
        <div style={S.card(flipped, flipped ? entryOf(card)?.status : null)}
          onClick={() => !editOpen && setFlipped((f) => !f)}>
          <div style={S.badge}>{getTopCategory(card)} · {card.subject} · {card.part}{card.sourceNumber ? ` · 원문 ${card.sourceNumber}` : ''} · {cardKindLabel(kind)}</div>
          <div style={S.question}>{card.question}</div>
          {flipped ? (
            <>
              {isAnswer ? (
                <>
                  {card.mnemonic && <div style={{ ...S.mnemonic, fontSize: 18, letterSpacing: 0 }}>{card.mnemonic}</div>}
                  <div style={{ ...S.detail, fontSize: 15, color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>{card.answer}</div>
                </>
              ) : (
                <>
                  <div style={S.mnemonic}>{card.mnemonic}</div>
                  <div style={S.detail}>{card.detail}</div>
                </>
              )}
              {entryOf(card) && (
                <div style={S.dueTag}>다음 복습: {dueLabel(entryOf(card))} · {entryOf(card).count}회 학습</div>
              )}
            </>
          ) : (
            <div style={S.hint}>탭하여 정답 확인 →</div>
          )}
        </div>
      )}

      <div style={{ ...S.statusRow, alignItems: 'stretch' }}>
        {STATUS_KEYS.map((key) => {
          const st = STATUS[key]
          const current = entryOf(card)?.status
          return (
            <button key={key} style={S.statusBtn(key, current)}
              onClick={(e) => { e.stopPropagation(); handleStatus(key) }}>
              <span style={{ fontSize: 16 }}>{st.emoji}</span>
              <span>{st.label}</span>
            </button>
          )
        })}
        <button onClick={() => { setDraft({ ...card }); setEditOpen((o) => !o) }}
          title={canEdit ? '편집' : '저장된 카드만 편집할 수 있습니다'}
          style={{
            background: editOpen ? 'rgba(99,102,241,0.15)' : 'rgba(15,23,42,0.5)',
            border: `1.5px solid ${editOpen ? '#6366f1' : '#1e293b'}`,
            borderRadius: 12, color: editOpen ? '#818cf8' : (canEdit ? '#475569' : '#1e293b'),
            fontSize: 18, cursor: canEdit ? 'pointer' : 'not-allowed', padding: '0 14px', flexShrink: 0,
          }}>✎</button>
      </div>

      {editOpen && (
        <div style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid #334155', borderRadius: 16, padding: 18, marginBottom: 14 }}>
          <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>카드 편집</div>
          <div style={{ display: 'flex', gap: 6 }}>{inp('topCategory', '대분류')}{inp('subject', '과목')}{inp('part', '단원')}</div>
          {inp('sourceNumber', '원문 번호')}
          {inp('question', '질문')}
          {isAnswer ? inp('answer', answerLabel(kind), true) : <>{inp('mnemonic', '두문자')}{inp('detail', '설명', true)}</>}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={handleSave} style={{
              flex: 1, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
              border: 'none', borderRadius: 10, padding: '10px', fontSize: 13, cursor: 'pointer', fontWeight: 700,
            }}>저장</button>
            <button onClick={() => setEditOpen(false)} style={{
              background: '#1e293b', color: '#94a3b8', border: 'none',
              borderRadius: 10, padding: '10px 18px', fontSize: 13, cursor: 'pointer',
            }}>취소</button>
          </div>
        </div>
      )}
    </>
  )
}

function FillInAnswerCard({ card, cardKey, value, onChange }) {
  const [showResult, setShowResult] = useState(false)
  const [showAnswerOnly, setShowAnswerOnly] = useState(false)

  useEffect(() => {
    setShowResult(false)
    setShowAnswerOnly(false)
  }, [cardKey])

  const result = useMemo(() => {
    if (!showResult) return null
    return gradeAnswer(value, card.answer || '')
  }, [card.answer, showResult, value])

  const resetMode = () => {
    setShowResult(false)
    setShowAnswerOnly(false)
  }

  return (
    <div style={{
      background: 'rgba(15,23,42,0.86)',
      border: '1px solid #1e293b',
      borderRadius: 20,
      minHeight: 280,
      marginBottom: 14,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid #1e293b' }}>
        <div style={S.badge}>{getTopCategory(card)} · {card.subject} · {card.part}{card.sourceNumber ? ` · 원문 ${card.sourceNumber}` : ''} · {cardKindLabel(card)}</div>
        <div style={{ ...S.question, marginBottom: 0 }}>{card.question}</div>
      </div>

      <div style={{ padding: 18 }}>
        {card.figure && (
          <div
            style={{ background: '#fff', color: '#0f172a', borderRadius: 10, padding: 12, marginBottom: 12, overflowX: 'auto' }}
            dangerouslySetInnerHTML={{ __html: card.figure }}
          />
        )}

        {!showResult && !showAnswerOnly && (
          <textarea
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            placeholder="여기에 답안을 직접 써보세요."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              minHeight: 160,
              resize: 'vertical',
              background: '#0a0f1e',
              border: '1.5px solid #334155',
              borderRadius: 12,
              color: '#e2e8f0',
              padding: '13px 14px',
              fontSize: 14,
              lineHeight: 1.65,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
        )}

        {showResult && result && (
          <div>
            <div style={{
              background: result.isPerfect ? 'rgba(34,197,94,0.14)' : result.accuracy >= 90 ? 'rgba(59,130,246,0.14)' : result.accuracy >= 70 ? 'rgba(245,158,11,0.14)' : 'rgba(239,68,68,0.14)',
              border: `1px solid ${result.isPerfect ? '#22c55e' : result.accuracy >= 90 ? '#3b82f6' : result.accuracy >= 70 ? '#f59e0b' : '#ef4444'}`,
              color: result.isPerfect ? '#86efac' : result.accuracy >= 90 ? '#93c5fd' : result.accuracy >= 70 ? '#fbbf24' : '#fca5a5',
              borderRadius: 12,
              padding: '12px 14px',
              textAlign: 'center',
              fontSize: 14,
              fontWeight: 800,
              marginBottom: 12,
            }}>
              {result.isPerfect ? '완벽합니다. 정답과 일치합니다.' : `정확도 ${result.accuracy}% · 차이 ${result.errorCount}곳`}
            </div>

            {card.mnemonic && (
              <div style={{
                background: 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.26)',
                borderRadius: 12,
                color: '#fbbf24',
                padding: '10px 12px',
                fontSize: 13,
                lineHeight: 1.55,
                fontWeight: 800,
                marginBottom: 12,
                whiteSpace: 'pre-wrap',
              }}>
                키워드: {card.mnemonic}
              </div>
            )}

            {!result.isPerfect && (
              <>
                <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  빨간 취소선은 잘못 쓴 부분, 초록 표시는 빠뜨린 정답 부분입니다.
                </div>
                <div style={{
                  background: '#0a0f1e',
                  border: '1px solid #1e293b',
                  borderRadius: 12,
                  color: '#cbd5e1',
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
                      return <span key={index} style={{ background: 'rgba(34,197,94,0.18)', color: '#86efac', fontWeight: 800 }}>{part.text}</span>
                    }
                    return <span key={index} style={{ background: 'rgba(239,68,68,0.16)', color: '#fca5a5', textDecoration: 'line-through' }}>{part.text}</span>
                  })}
                </div>
              </>
            )}

            <details style={{ background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
              <summary style={{ cursor: 'pointer', color: '#94a3b8', fontSize: 12, fontWeight: 700, padding: '10px 12px' }}>
                정답 원문 보기
              </summary>
              <div style={{ borderTop: '1px solid #1e293b', color: '#e2e8f0', padding: 12, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {card.answer}
              </div>
            </details>
          </div>
        )}

        {showAnswerOnly && (
          <div style={{
            background: '#0a0f1e',
            border: '1px solid #1e293b',
            borderRadius: 12,
            color: '#e2e8f0',
            padding: 14,
            fontSize: 13,
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
          }}>
            <div style={{ color: '#93c5fd', fontSize: 12, fontWeight: 800, marginBottom: 8 }}>{answerLabel(card)}</div>
            {card.mnemonic && (
              <div style={{
                background: 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.26)',
                borderRadius: 10,
                color: '#fbbf24',
                padding: '9px 11px',
                fontSize: 13,
                lineHeight: 1.55,
                fontWeight: 800,
                marginBottom: 10,
                whiteSpace: 'pre-wrap',
              }}>
                키워드: {card.mnemonic}
              </div>
            )}
            {card.answer}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {!showResult && !showAnswerOnly ? (
            <>
              <button onClick={() => { onChange?.(''); resetMode() }} style={{ ...S.navBtn(false), padding: '9px 14px' }}>지우기</button>
              <button onClick={() => { setShowAnswerOnly(true); setShowResult(false) }} style={{ ...S.navBtn(false), padding: '9px 14px' }}>정답 보기</button>
              <button
                disabled={!String(value || '').trim()}
                onClick={() => { setShowResult(true); setShowAnswerOnly(false) }}
                style={{
                  flex: 1,
                  minWidth: 130,
                  background: String(value || '').trim() ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#1e293b',
                  color: String(value || '').trim() ? '#fff' : '#475569',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: String(value || '').trim() ? 'pointer' : 'not-allowed',
                }}
              >
                채점하기
              </button>
            </>
          ) : (
            <button onClick={resetMode} style={{
              flex: 1,
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
            }}>
              다시 쓰기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
