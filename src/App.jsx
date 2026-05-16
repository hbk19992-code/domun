import { useState, useEffect } from 'react'
import { useCards } from './hooks/useCards'
import StudyPage from './components/StudyPage'
import ExtractPage from './components/ExtractPage'
import ManagePage from './components/ManagePage'
import { getShareParam, decodeCards, clearShareParam } from './utils/share'

const TABS = [
  { id: 'study', label: '📚 학습' },
  { id: 'extract', label: '✦ AI 추출' },
  { id: 'manage', label: '⚙ 관리' },
]

const S = {
  wrap: { minHeight: '100vh', background: '#0a0f1e', display: 'flex', flexDirection: 'column', width: '100%', overflowX: 'hidden' },
  header: {
    borderBottom: '1px solid #1e293b', padding: '0 16px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky', top: 0, zIndex: 100,
    background: 'rgba(10,15,30,0.95)', backdropFilter: 'blur(12px)',
    width: '100%', boxSizing: 'border-box'
  },
  logo: { fontSize: 16, fontWeight: 800, color: '#e2e8f0', padding: '16px 0', whiteSpace: 'nowrap', flexShrink: 0 },
  tabs: { display: 'flex', gap: 4, overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  tab: (active) => ({
    padding: '16px 10px', border: 'none', background: 'none',
    color: active ? '#818cf8' : '#475569',
    borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
    cursor: 'pointer', fontSize: 14, fontWeight: active ? 700 : 400,
    transition: 'all 0.15s', whiteSpace: 'nowrap'
  }),
  content: { flex: 1, padding: '24px 16px', maxWidth: 760, width: '100%', margin: '0 auto', boxSizing: 'border-box', overflowX: 'hidden' },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, padding: 24, boxSizing: 'border-box'
  },
  modal: {
    background: '#0f172a', border: '1px solid #1e293b', borderRadius: 20,
    padding: 24, width: '100%', maxWidth: 480, boxSizing: 'border-box'
  },
  modalTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: 800, marginBottom: 8 },
  modalSub: { color: '#64748b', fontSize: 13, marginBottom: 24, lineHeight: 1.6 },
  modalRow: { display: 'flex', gap: 10 },
  modalBtn: (primary) => ({
    flex: 1, padding: '12px', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer',
    background: primary ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#1e293b',
    color: primary ? '#fff' : '#94a3b8', border: 'none',
  }),
}

function ShareImportModal({ sharedCards, onImport, onClose }) {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔗</div>
        <div style={S.modalTitle}>공유된 카드셋</div>
        <div style={S.modalSub}>
          <span style={{ color: '#818cf8', fontWeight: 700 }}>{sharedCards.length}개</span>의 카드가 공유되었습니다.<br />
          {sharedCards[0] && `"${sharedCards[0].subject}" 등`} — 지금 가져오시겠어요?
        </div>
        <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sharedCards.slice(0, 5).map((c, i) => (
            <div key={i} style={{ background: '#1e293b', borderRadius: 8, padding: '8px 12px' }}>
              <span style={{ color: '#818cf8', fontWeight: 700, fontSize: 13 }}>{c.mnemonic}</span>
              <span style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>{c.question}</span>
            </div>
          ))}
          {sharedCards.length > 5 && (
            <div style={{ color: '#334155', fontSize: 12, textAlign: 'center', padding: '4px 0' }}>
              외 {sharedCards.length - 5}개 더...
            </div>
          )}
        </div>
        <div style={S.modalRow}>
          <button style={S.modalBtn(true)} onClick={onImport}>가져오기</button>
          <button style={S.modalBtn(false)} onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('study')
  const cards = useCards()
  const [sharedCards, setSharedCards] = useState(null)
  const [importToast, setImportToast] = useState('')

  useEffect(() => {
    const param = getShareParam()
    if (!param) return
    decodeCards(param)
      .then((decoded) => { if (Array.isArray(decoded) && decoded.length > 0) setSharedCards(decoded) })
      .catch(() => {})
  }, [])

  const handleShareImport = () => {
    const added = cards.addCards(sharedCards)
    const skipped = sharedCards.length - added
    setSharedCards(null)
    clearShareParam()
    setImportToast(skipped > 0 ? `✓ ${added}개 추가 (중복 ${skipped}개 제외)` : `✓ ${added}개 추가됨`)
    setTimeout(() => setImportToast(''), 3000)
    setTab('study')
  }

  return (
    <div style={S.wrap}>
      <header style={S.header}>
        <span style={S.logo}>두문자 카드</span>
        <nav style={S.tabs}>
          {TABS.map((t) => (
            <button key={t.id} style={S.tab(tab === t.id)} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main style={S.content}>
        {tab === 'study'   && <StudyPage   cards={cards} />}
        {tab === 'extract' && <ExtractPage cards={cards} onImport={() => setTab('study')} />}
        {tab === 'manage'  && <ManagePage  cards={cards} />}
      </main>

      {sharedCards && (
        <ShareImportModal
          sharedCards={sharedCards}
          onImport={handleShareImport}
          onClose={() => { setSharedCards(null); clearShareParam() }}
        />
      )}

      {importToast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#6366f1', color: '#fff', borderRadius: 10,
          padding: '10px 24px', fontSize: 14, fontWeight: 600, zIndex: 300,
          whiteSpace: 'nowrap',
        }}>{importToast}</div>
      )}
    </div>
  )
}
