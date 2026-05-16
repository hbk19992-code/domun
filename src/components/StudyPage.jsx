import { useState, useMemo, useCallback } from 'react'

const STATUS = {
  unknown:  { label: '모름',   emoji: '✗', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: '#ef4444' },
  unsure:   { label: '헷갈림', emoji: '△', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: '#f59e0b' },
  known:    { label: '앎',     emoji: '✓', color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: '#22c55e' },
}
const STATUS_KEYS = ['unknown', 'unsure', 'known']

function getCardKey(card) { return card.id ?? card.question }
function loadStatuses() {
  try { return JSON.parse(localStorage.getItem('card_statuses') || '{}') } catch { return {} }
}
function saveStatuses(s) { localStorage.setItem('card_statuses', JSON.stringify(s)) }

const S = {
  empty: { textAlign: 'center', padding: '80px 0', color: '#475569' },
  filters: { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' },
  select: {
    background: '#0f172a', border: '1px solid #334155', borderRadius: 8,
    color: '#94a3b8', padding: '7px 10px', fontSize: 13, cursor: 'pointer',
  },
  shuffleBtn: {
    background: 'none', border: '1px solid #334155', borderRadius: 8,
    color: '#64748b', padding: '7px 12px', fontSize: 13, cursor: 'pointer',
  },
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
      border: `1px solid ${st ? st.border : (flipped ? '#6366f1' : '#1e293b')}`,
      borderRadius: 20, padding: '36px 32px', minHeight: 240, cursor: 'pointer',
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
  statusRow: { display: 'flex', gap: 10, marginBottom: 16 },
  statusBtn: (key, current) => {
    const st = STATUS[key]
    const active = current === key
    return {
      flex: 1, padding: '11px 0',
      background: active ? st.bg : 'rgba(15,23,42,0.5)',
      border: `1.5px solid ${active ? st.border : '#1e293b'}`,
      borderRadius: 12, color: active ? st.color : '#475569',
      fontSize: 13, fontWeight: active ? 700 : 400,
      cursor: 'pointer', transition: 'all 0.15s',
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
}

export default function StudyPage({ cards }) {
  const { allCards, subjects } = cards
  const [subject, setSubject] = useState('전체')
  const [part, setPart] = useState('전체')
  const [statusFilter, setStatusFilter] = useState('전체')
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [shuffled, setShuffled] = useState(false)
  const [statuses, setStatuses] = useState(loadStatuses)

  const setStatus = useCallback((card, key) => {
    const cardKey = getCardKey(card)
    setStatuses((prev) => {
      const next = { ...prev, [cardKey]: key }
      saveStatuses(next)
      return next
    })
  }, [])
  const getStatus = useCallback((card) => statuses[getCardKey(card)] || null, [statuses])

  const partOptions = useMemo(() => {
    const base = subject === '전체' ? allCards : allCards.filter((x) => x.subject === subject)
    return [...new Set(base.map((x) => x.part))]
  }, [allCards, subject])

  const filtered = useMemo(() => {
    let c = allCards
    if (subject !== '전체') c = c.filter((x) => x.subject === subject)
    if (part !== '전체') c = c.filter((x) => x.part === part)
    if (statusFilter !== '전체') {
      c = c.filter((x) => {
        const s = statuses[getCardKey(x)] || 'unknown'
        return s === statusFilter
      })
    }
    return c
  }, [allCards, subject, part, statusFilter, statuses])

  const deck = useMemo(() => {
    return shuffled ? [...filtered].sort(() => Math.random() - 0.5) : filtered
  }, [filtered, shuffled])

  const stats = useMemo(() => {
    const base = allCards.filter((c) => {
      if (subject !== '전체' && c.subject !== subject) return false
      if (part !== '전체' && c.part !== part) return false
      return true
    })
    return {
      unknown: base.filter((c) => !statuses[getCardKey(c)] || statuses[getCardKey(c)] === 'unknown').length,
      unsure:  base.filter((c) => statuses[getCardKey(c)] === 'unsure').length,
      known:   base.filter((c) => statuses[getCardKey(c)] === 'known').length,
      total:   base.length,
    }
  }, [allCards, subject, part, statuses])

  const safeIdx = Math.min(idx, Math.max(0, deck.length - 1))
  const card = deck[safeIdx] || null

  const go = (dir) => {
    setFlipped(false)
    setIdx((i) => Math.max(0, Math.min(deck.length - 1, i + dir)))
  }

  const handleStatus = (key) => {
    if (!card) return
    setStatus(card, key)
    setTimeout(() => {
      setFlipped(false)
      setIdx((i) => Math.min(deck.length - 1, i + 1))
    }, 280)
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
      {/* 진행 통계 */}
      <div style={S.progressRow}>
        {STATUS_KEYS.map((key) => {
          const st = STATUS[key]
          const active = statusFilter === key
          return (
            <div key={key} style={S.progItem(st.color, active)}
              onClick={() => { setStatusFilter(active ? '전체' : key); setIdx(0); setFlipped(false) }}
              title={`${st.label}만 보기`}>
              <div style={S.progNum(st.color)}>{stats[key]}</div>
              <div style={S.progLabel}>{st.label}</div>
            </div>
          )
        })}
        <div style={{ ...S.progItem('#475569', statusFilter === '전체'), flex: 0.6 }}
          onClick={() => { setStatusFilter('전체'); setIdx(0); setFlipped(false) }}>
          <div style={{ color: '#475569', fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{stats.total}</div>
          <div style={S.progLabel}>전체</div>
        </div>
      </div>

      {/* 필터 */}
      <div style={S.filters}>
        <select style={S.select} value={subject} onChange={(e) => { setSubject(e.target.value); setPart('전체'); setIdx(0); setFlipped(false) }}>
          <option>전체</option>
          {subjects.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select style={S.select} value={part} onChange={(e) => { setPart(e.target.value); setIdx(0); setFlipped(false) }}>
          <option>전체</option>
          {partOptions.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button style={S.shuffleBtn} onClick={() => { setShuffled((s) => !s); setIdx(0); setFlipped(false) }}>
          {shuffled ? '🔀 섞기 중' : '🔀 섞기'}
        </button>
      </div>

      {deck.length === 0 && (
        <div style={{ ...S.empty, padding: '40px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🎉</div>
          <div style={{ color: '#64748b', fontSize: 15 }}>
            {statusFilter !== '전체' ? `"${STATUS[statusFilter]?.label}" 카드가 없습니다` : '카드가 없습니다'}
          </div>
        </div>
      )}

      {card && (
        <>
          <div style={S.card(flipped, flipped ? getStatus(card) : null)} onClick={() => setFlipped((f) => !f)}>
            <div style={S.badge}>{card.subject} · {card.part}</div>
            <div style={S.question}>{card.question}</div>
            {flipped ? (
              <>
                <div style={S.mnemonic}>{card.mnemonic}</div>
                <div style={S.detail}>{card.detail}</div>
              </>
            ) : (
              <div style={S.hint}>탭하여 두문자 확인 →</div>
            )}
          </div>

          {/* 암기 상태 버튼 */}
          <div style={S.statusRow}>
            {STATUS_KEYS.map((key) => {
              const st = STATUS[key]
              const current = getStatus(card)
              return (
                <button key={key} style={S.statusBtn(key, current)}
                  onClick={(e) => { e.stopPropagation(); handleStatus(key) }}>
                  <span style={{ fontSize: 16 }}>{st.emoji}</span>
                  <span>{st.label}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

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
