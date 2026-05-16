import { useRef, useState } from 'react'

const S = {
  row: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  btn: (variant, disabled) => ({
    background: disabled ? '#0f172a' : variant === 'primary' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
      : variant === 'danger' ? 'rgba(239,68,68,0.1)' : variant === 'warn' ? 'rgba(245,158,11,0.1)' : '#1e293b',
    color: disabled ? '#334155' : variant === 'primary' ? '#fff' : variant === 'danger' ? '#f87171' : variant === 'warn' ? '#fbbf24' : '#94a3b8',
    border: variant === 'danger' ? '1px solid rgba(239,68,68,0.3)' : variant === 'warn' ? '1px solid rgba(245,158,11,0.3)' : 'none',
    borderRadius: 10, padding: '10px 20px', fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600,
  }),
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: {
    background: 'rgba(15,23,42,0.7)', border: '1px solid #1e293b',
    borderRadius: 12, padding: '14px 16px',
    display: 'flex', alignItems: 'flex-start', gap: 14,
  },
  del: {
    background: 'none', border: 'none', color: '#334155',
    cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0, padding: 4,
  },
  toast: {
    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: '#1e293b', color: '#e2e8f0', borderRadius: 10,
    padding: '10px 24px', fontSize: 14, fontWeight: 600, zIndex: 9999,
    pointerEvents: 'none', whiteSpace: 'nowrap',
  },
  empty: { color: '#334155', textAlign: 'center', padding: '40px 0', fontSize: 14 },
  stat: {
    background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
    borderRadius: 12, padding: '16px 20px', marginBottom: 24,
    display: 'flex', gap: 32, flexWrap: 'wrap',
  },
  statItem: { textAlign: 'center' },
  statNum: (color) => ({ color: color || '#818cf8', fontSize: 24, fontWeight: 800 }),
  statLabel: { color: '#475569', fontSize: 11, marginTop: 2 },
  dupBanner: {
    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
    borderRadius: 10, padding: '12px 16px', marginBottom: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
}

export default function ManagePage({ cards }) {
  const { allCards, userCards, builtinCards, deleteCard, exportJSON, importJSON, deduplicateSelf, duplicateCount } = cards
  const fileRef = useRef(null)
  const [toast, setToast] = useState('')

  const showToast = (msg, color = '#6366f1') => {
    setToast({ msg, color })
    setTimeout(() => setToast(''), 2500)
  }

  const handleImport = async (e) => {
    const f = e.target.files[0]
    if (!f) return
    try {
      const { added, skipped } = await importJSON(f)
      if (skipped > 0) showToast(`✓ ${added}개 추가 (중복 ${skipped}개 제외)`)
      else showToast(`✓ ${added}개 추가됨`)
    } catch (err) {
      showToast(`⚠ ${err.message}`, '#ef4444')
    }
    e.target.value = ''
  }

  const handleDedup = () => {
    const removed = deduplicateSelf()
    if (removed > 0) showToast(`✓ 중복 ${removed}개 제거 완료`, '#22c55e')
    else showToast('중복 카드가 없습니다')
  }

  return (
    <div>
      <h2 style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 800, marginBottom: 4 }}>카드 관리</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>JSON으로 내보내거나 가져올 수 있습니다</p>

      {/* 통계 */}
      <div style={S.stat}>
        <div style={S.statItem}><div style={S.statNum()}>{allCards.length}</div><div style={S.statLabel}>전체 카드</div></div>
        <div style={S.statItem}><div style={S.statNum()}>{builtinCards.length}</div><div style={S.statLabel}>기본 카드</div></div>
        <div style={S.statItem}><div style={S.statNum()}>{userCards.length}</div><div style={S.statLabel}>내 카드</div></div>
        <div style={S.statItem}><div style={S.statNum('#f59e0b')}>{duplicateCount}</div><div style={S.statLabel}>중복</div></div>
      </div>

      {/* 중복 경고 배너 */}
      {duplicateCount > 0 && (
        <div style={S.dupBanner}>
          <span style={{ color: '#fbbf24', fontSize: 13 }}>
            ⚠ 중복 카드 {duplicateCount}개가 있습니다
          </span>
          <button style={S.btn('warn')} onClick={handleDedup}>
            중복 제거
          </button>
        </div>
      )}

      {/* 액션 */}
      <div style={S.row}>
        <button style={S.btn('primary', allCards.length === 0)} onClick={exportJSON} disabled={allCards.length === 0}>
          ↓ JSON 내보내기
        </button>
        <button style={S.btn('default')} onClick={() => fileRef.current?.click()}>
          ↑ JSON 가져오기
        </button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
      </div>

      {/* 내 카드 목록 */}
      <div style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>내 카드 ({userCards.length}개)</div>
      {userCards.length === 0
        ? <div style={S.empty}>추가한 카드가 없습니다</div>
        : (
          <div style={S.list}>
            {userCards.map((card) => (
              <div key={card.id} style={S.item}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                    <span style={{ background: '#1e293b', color: '#94a3b8', fontSize: 10, borderRadius: 4, padding: '2px 7px' }}>{card.subject}</span>
                    <span style={{ background: '#1e293b', color: '#64748b', fontSize: 10, borderRadius: 4, padding: '2px 7px' }}>{card.part}</span>
                  </div>
                  <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{card.question}</div>
                  <div style={{ color: '#818cf8', fontSize: 13, fontWeight: 700 }}>{card.mnemonic}</div>
                </div>
                <button style={S.del} onClick={() => deleteCard(card.id)} title="삭제">✕</button>
              </div>
            ))}
          </div>
        )
      }

      {toast && (
        <div style={{ ...S.toast, background: toast.color || '#1e293b' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
