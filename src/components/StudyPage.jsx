import { useState, useMemo } from 'react'

const S = {
  empty: { textAlign: 'center', padding: '80px 0', color: '#475569' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: '#64748b', marginBottom: 8 },
  filters: { display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' },
  select: {
    background: '#0f172a', border: '1px solid #334155', borderRadius: 8,
    color: '#94a3b8', padding: '8px 12px', fontSize: 13, cursor: 'pointer',
  },
  card: (flipped) => ({
    background: flipped ? 'rgba(99,102,241,0.1)' : 'rgba(15,23,42,0.8)',
    border: `1px solid ${flipped ? '#6366f1' : '#1e293b'}`,
    borderRadius: 20, padding: '40px 32px',
    minHeight: 260, cursor: 'pointer',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', transition: 'all 0.25s', userSelect: 'none',
    marginBottom: 20,
  }),
  badge: {
    display: 'inline-block', background: '#1e293b', color: '#64748b',
    fontSize: 11, borderRadius: 6, padding: '3px 10px', marginBottom: 16,
  },
  question: { color: '#e2e8f0', fontSize: 18, fontWeight: 700, marginBottom: 20, lineHeight: 1.5 },
  mnemonic: { color: '#818cf8', fontSize: 28, fontWeight: 800, letterSpacing: 2, marginBottom: 16 },
  detail: { color: '#94a3b8', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-line' },
  hint: { color: '#334155', fontSize: 12, marginTop: 16 },
  nav: { display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' },
  navBtn: (disabled) => ({
    background: disabled ? '#0f172a' : '#1e293b',
    border: '1px solid #334155', borderRadius: 10,
    color: disabled ? '#334155' : '#94a3b8',
    padding: '10px 24px', fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  counter: { color: '#475569', fontSize: 13, minWidth: 80, textAlign: 'center' },
  shuffleBtn: {
    background: 'none', border: '1px solid #334155', borderRadius: 10,
    color: '#64748b', padding: '10px 16px', fontSize: 13, cursor: 'pointer',
  },
}

export default function StudyPage({ cards }) {
  const { allCards, subjects } = cards
  const [subject, setSubject] = useState('전체')
  const [part, setPart] = useState('전체')
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [shuffled, setShuffled] = useState(false)

  const filtered = useMemo(() => {
    let c = allCards
    if (subject !== '전체') c = c.filter((x) => x.subject === subject)
    if (part !== '전체') c = c.filter((x) => x.part === part)
    return c
  }, [allCards, subject, part])

  const partOptions = useMemo(() => {
    const base = subject === '전체' ? allCards : allCards.filter((x) => x.subject === subject)
    return [...new Set(base.map((x) => x.part))]
  }, [allCards, subject])

  const deck = useMemo(() => {
    if (!shuffled) return filtered
    return [...filtered].sort(() => Math.random() - 0.5)
  }, [filtered, shuffled])

  const safeIdx = Math.min(idx, deck.length - 1)
  const card = deck[safeIdx]

  const go = (dir) => {
    setFlipped(false)
    setIdx((i) => Math.max(0, Math.min(deck.length - 1, i + dir)))
  }

  if (allCards.length === 0) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>📭</div>
        <div style={S.emptyTitle}>카드가 없습니다</div>
        <div style={{ color: '#334155', fontSize: 14 }}>
          "AI 추출" 탭에서 교재 PDF를 올려 카드를 만들어보세요
        </div>
      </div>
    )
  }

  return (
    <div>
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

      {/* 카드 */}
      {card && (
        <div style={S.card(flipped)} onClick={() => setFlipped((f) => !f)}>
          <div style={S.badge}>{card.subject} · {card.part}</div>
          <div style={S.question}>{card.question}</div>
          {flipped ? (
            <>
              <div style={S.mnemonic}>{card.mnemonic}</div>
              <div style={S.detail}>{card.detail}</div>
            </>
          ) : (
            <div style={S.hint}>탭하여 두문자 확인</div>
          )}
        </div>
      )}

      {/* 네비게이션 */}
      <div style={S.nav}>
        <button style={S.navBtn(safeIdx === 0)} disabled={safeIdx === 0} onClick={() => go(-1)}>← 이전</button>
        <span style={S.counter}>{safeIdx + 1} / {deck.length}</span>
        <button style={S.navBtn(safeIdx === deck.length - 1)} disabled={safeIdx === deck.length - 1} onClick={() => go(1)}>다음 →</button>
      </div>
    </div>
  )
}
