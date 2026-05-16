import { useState, useMemo, useCallback, useEffect } from 'react'
import { loadSRS, saveSRS, reviewEntry, isDue, dueLabel } from '../utils/srs'
import { useTTS, ttsMnemonic, ttsDetail } from '../hooks/useTTS'

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
  modePill: (active) => ({
    background: active ? '#6366f1' : 'none',
    border: `1px solid ${active ? '#6366f1' : '#334155'}`, borderRadius: 8,
    color: active ? '#fff' : '#64748b', padding: '7px 12px', fontSize: 13,
    cursor: 'pointer', fontWeight: active ? 700 : 400,
  }),
  progressRow: { display: 'flex', gap: 8, marginBottom: 16 },
  progItem: (color, active) => ({
    flex: 1, padding: '8px 10px', borderRadius: 10,
    background: active ? `${color}22` : 'rgba(15,23,42,0.5)',
    border: `1px solid ${active ? color : '#1e293b'}`,
    textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
  }),
  progNum: (color) => ({ color, fontSize: 18, fontWeight: 800, lineHeight: 1 }),
  progLabel: { color: '#64748b', fontSize: 11, marginTop: 3 },
  card: (flipped, statusKey) => {
    const st = statusKey ? STATUS[statusKey] : null
    return {
      background: st ? st.bg : (flipped ? 'rgba(99,102,241,0.1)' : 'rgba(15,23,42,0.8)'),
      border: `1px solid ${st ? st.color : (flipped ? '#6366f1' : '#1e293b')}`,
      borderRadius: 20, padding: '34px 30px', minHeight: 230, cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', transition: 'all 0.2s', userSelect: 'none', marginBottom: 14,
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
    color: playing ? '#ef4444' : '#fff',
    fontSize: 18, cursor: 'pointer',
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

export default function StudyPage({ cards }) {
  const { allCards, subjects } = cards
  const [subject, setSubject] = useState('전체')
  const [part, setPart] = useState('전체')
  const [statusFilter, setStatusFilter] = useState('전체')
  const [mode, setMode] = useState('all')        // 'all' | 'review'
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [shuffled, setShuffled] = useState(false)
  const [srs, setSrs] = useState(loadSRS)
  const [listenMode, setListenMode] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const { speak, stop, supported: ttsSupported } = useTTS()

  const review = useCallback((card, result) => {
    const key = getCardKey(card)
    setSrs((prev) => {
      const next = { ...prev, [key]: reviewEntry(prev[key], result) }
      saveSRS(next)
      return next
    })
  }, [])

  const entryOf = useCallback((card) => srs[getCardKey(card)], [srs])

  const partOptions = useMemo(() => {
    const base = subject === '전체' ? allCards : allCards.filter((x) => x.subject === subject)
    return [...new Set(base.map((x) => x.part))]
  }, [allCards, subject])

  // 과목/파트 필터 적용된 카드
  const scoped = useMemo(() => {
    let c = allCards
    if (subject !== '전체') c = c.filter((x) => x.subject === subject)
    if (part !== '전체') c = c.filter((x) => x.part === part)
    return c
  }, [allCards, subject, part])

  // 복습 대상(복습 시점 도래)
  const dueCards = useMemo(
    () => scoped.filter((c) => isDue(srs[getCardKey(c)])),
    [scoped, srs]
  )

  // 최종 덱
  const deck = useMemo(() => {
    let base = scoped
    if (mode === 'review') {
      base = dueCards
    } else if (statusFilter !== '전체') {
      base = base.filter((c) => {
        const st = srs[getCardKey(c)]?.status || 'unknown'
        return st === statusFilter
      })
    }
    return shuffled ? [...base].sort(() => Math.random() - 0.5) : base
  }, [scoped, dueCards, mode, statusFilter, srs, shuffled])

  const stats = useMemo(() => ({
    unknown: scoped.filter((c) => !srs[getCardKey(c)] || srs[getCardKey(c)].status === 'unknown').length,
    unsure:  scoped.filter((c) => srs[getCardKey(c)]?.status === 'unsure').length,
    known:   scoped.filter((c) => srs[getCardKey(c)]?.status === 'known').length,
    total:   scoped.length,
  }), [scoped, srs])

  const safeIdx = Math.min(idx, Math.max(0, deck.length - 1))
  const card = deck[safeIdx] || null

  const resetView = () => { setIdx(0); setFlipped(false) }

  const go = (dir) => {
    setFlipped(false)
    setIdx((i) => Math.max(0, Math.min(deck.length - 1, i + dir)))
  }

  const handleStatus = (result) => {
    if (!card) return
    review(card, result)
    setTimeout(() => {
      setFlipped(false)
      setIdx((i) => Math.min(deck.length - 1, i + 1))
    }, 280)
  }

  // ── 음성 학습: 현재 카드를 읽고 자동으로 다음 카드로 ──
  useEffect(() => {
    if (!listenMode || !playing || !card) return
    setFlipped(false)
    const isLast = safeIdx >= deck.length - 1
    const isQA = !card.mnemonic && card.answer != null
    const segments = isQA
      ? [
          { text: card.question, pauseAfter: 1400 },
          { text: '정답', before: () => setFlipped(true), pauseAfter: 400 },
          { text: ttsDetail(card.answer), pauseAfter: 1600 },
        ]
      : [
          { text: card.question, pauseAfter: 1400 },
          { text: '정답', before: () => setFlipped(true), pauseAfter: 400 },
          { text: ttsMnemonic(card.mnemonic), pauseAfter: 900 },
          { text: ttsDetail(card.detail), pauseAfter: 1600 },
        ]
    speak(segments, {
      rate,
      onDone: () => {
        if (isLast) { setPlaying(false); return }
        setIdx((i) => i + 1)
      },
    })
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenMode, playing, safeIdx, rate])

  const togglePlay = () => {
    if (playing) { setPlaying(false); stop() }
    else setPlaying(true)
  }

  const exitListen = () => {
    setPlaying(false); stop(); setListenMode(false)
  }

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
      {/* 오늘 복습 배너 */}
      {mode === 'all' && dueCards.length > 0 && (
        <div style={S.reviewBanner}>
          <div>
            <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>
              🔔 오늘 복습할 카드 {dueCards.length}개
            </div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
              복습 시점이 된 카드만 모아서 학습합니다
            </div>
          </div>
          <button style={S.reviewBtn} onClick={() => { setMode('review'); resetView() }}>
            복습 시작
          </button>
        </div>
      )}

      {/* 복습 모드 표시 */}
      {mode === 'review' && (
        <div style={S.reviewBanner}>
          <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>
            🔔 복습 모드 — {deck.length}개 남음
          </div>
          <button style={{ ...S.reviewBtn, background: '#1e293b' }} onClick={() => { setMode('all'); resetView() }}>
            전체 학습으로
          </button>
        </div>
      )}

      {/* 진행 통계 */}
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

      {/* 필터 */}
      <div style={S.filters}>
        <select style={S.select} value={subject}
          onChange={(e) => { setSubject(e.target.value); setPart('전체'); resetView() }}>
          <option>전체</option>
          {subjects.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select style={S.select} value={part}
          onChange={(e) => { setPart(e.target.value); resetView() }}>
          <option>전체</option>
          {partOptions.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button style={S.shuffleBtn(shuffled)} onClick={() => { setShuffled((s) => !s); resetView() }}>
          🔀 섞기
        </button>
        {ttsSupported && (
          <button
            style={S.shuffleBtn(listenMode)}
            onClick={() => {
              if (listenMode) exitListen()
              else { setListenMode(true); setPlaying(false) }
            }}
          >
            🔊 음성
          </button>
        )}
      </div>

      {/* 음성 학습 패널 */}
      {listenMode && (
        <div style={S.listenBar}>
          <div style={S.listenTop}>
            <button style={S.playBtn(playing)} onClick={togglePlay}>
              {playing ? '⏸' : '▶'}
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>
                {playing ? '재생 중 — 자동으로 넘어갑니다' : '음성 학습'}
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                질문 → 두문자 → 설명 순으로 읽어줍니다
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#64748b', fontSize: 12 }}>속도</span>
            <div style={S.speedRow}>
              {[0.8, 1, 1.2, 1.5].map((r) => (
                <button key={r} style={S.speedPill(rate === r)} onClick={() => setRate(r)}>
                  {r}×
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 덱 비었을 때 */}
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

      {/* 카드 */}
      {card && <CardWithEdit card={card} flipped={flipped} setFlipped={setFlipped} entryOf={entryOf} handleStatus={handleStatus} updateCard={cards.updateCard} subjects={cards.subjects} getParts={cards.parts} />}


      {/* 네비게이션 */}
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

// ── 카드 + 상태버튼 + 즉시편집 ──────────────────────────────
function CardWithEdit({ card, flipped, setFlipped, entryOf, handleStatus, updateCard, subjects, getParts }) {
  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState(card)
  const isQA = !card.mnemonic && card.answer != null
  const canEdit = !!card.id

  // 카드가 바뀌면 편집창 닫기
  const cardKey = card.id ?? card.question
  const prevKey = useCallback(() => cardKey, [cardKey])

  const inp = (key, placeholder, multi) => {
    const style = {
      width: '100%', boxSizing: 'border-box',
      background: '#0a0f1e', border: '1px solid #334155', borderRadius: 7,
      padding: '8px 10px', color: '#e2e8f0', fontSize: 13,
      fontFamily: 'inherit', outline: 'none', marginBottom: 6,
      resize: multi ? 'vertical' : 'none',
    }
    if (!multi && (key === 'subject' || key === 'part')) {
      const listId = key === 'subject' ? `study-sub-${cardKey}` : `study-part-${draft.subject}-${cardKey}`
      return (
        <div style={{ flex: 1, width: '100%' }}>
          <input style={style} value={draft[key] || ''}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} placeholder={placeholder} list={listId} />
          {key === 'subject' && (
            <datalist id={listId}>{subjects?.map(s => <option key={s} value={s} />)}</datalist>
          )}
          {key === 'part' && (
            <datalist id={listId}>{getParts?.(draft.subject || '').map(p => <option key={p} value={p} />)}</datalist>
          )}
        </div>
      )
    }
    return multi
      ? <textarea style={{ ...style, minHeight: 64 }} value={draft[key] || ''}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} placeholder={placeholder} />
      : <input style={style} value={draft[key] || ''}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} placeholder={placeholder} />
  }

  return (
    <>
      {/* 카드 */}
      <div style={S.card(flipped, flipped ? entryOf(card)?.status : null)}
        onClick={() => !editOpen && setFlipped((f) => !f)}>
        <div style={S.badge}>{card.subject} · {card.part}</div>
        <div style={S.question}>{card.question}</div>
        {flipped ? (
          <>
            {isQA ? (
              <div style={{ ...S.detail, fontSize: 15, color: '#e2e8f0' }}>{card.answer}</div>
            ) : (
              <>
                <div style={S.mnemonic}>{card.mnemonic}</div>
                <div style={S.detail}>{card.detail}</div>
              </>
            )}
            {entryOf(card) && (
              <div style={S.dueTag}>
                다음 복습: {dueLabel(entryOf(card))} · {entryOf(card).count}회 학습
              </div>
            )}
          </>
        ) : (
          <div style={S.hint}>탭하여 정답 확인 →</div>
        )}
      </div>

      {/* 상태 버튼 + 편집 버튼 */}
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
        <button
          onClick={() => { setDraft({ ...card }); setEditOpen((o) => !o) }}
          title={canEdit ? '편집' : '기본 카드는 관리 탭에서 편집하세요'}
          style={{
            background: editOpen ? 'rgba(99,102,241,0.15)' : 'rgba(15,23,42,0.5)',
            border: `1.5px solid ${editOpen ? '#6366f1' : '#1e293b'}`,
            borderRadius: 12, color: editOpen ? '#818cf8' : (canEdit ? '#475569' : '#1e293b'),
            fontSize: 18, cursor: canEdit ? 'pointer' : 'not-allowed',
            padding: '0 14px', flexShrink: 0,
          }}
        >✎</button>
      </div>

      {/* 인라인 편집 패널 */}
      {editOpen && (
        <div style={{
          background: 'rgba(15,23,42,0.95)', border: '1px solid #334155',
          borderRadius: 16, padding: 18, marginBottom: 14,
        }}>
          <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>카드 편집</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {inp('subject', '과목')}
            {inp('part', '단원')}
          </div>
          {inp('question', '질문')}
          {isQA
            ? inp('answer', '답', true)
            : <>{inp('mnemonic', '두문자')}{inp('detail', '설명', true)}</>
          }
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={handleSave} style={{
              flex: 1, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: '#fff', border: 'none', borderRadius: 10,
              padding: '10px', fontSize: 13, cursor: 'pointer', fontWeight: 700,
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
