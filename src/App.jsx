import { useState } from 'react'
import { useCards } from './hooks/useCards'
import StudyPage from './components/StudyPage'
import ExtractPage from './components/ExtractPage'
import ManagePage from './components/ManagePage'

const TABS = [
  { id: 'study', label: '📚 학습' },
  { id: 'extract', label: '✦ AI 추출' },
  { id: 'manage', label: '⚙ 관리' },
]

const S = {
  wrap: { minHeight: '100vh', background: '#0a0f1e', display: 'flex', flexDirection: 'column' },
  header: {
    borderBottom: '1px solid #1e293b',
    padding: '0 24px',
    display: 'flex', alignItems: 'center', gap: 32,
    position: 'sticky', top: 0, zIndex: 100,
    background: 'rgba(10,15,30,0.95)', backdropFilter: 'blur(12px)',
  },
  logo: { fontSize: 18, fontWeight: 800, color: '#e2e8f0', padding: '16px 0', whiteSpace: 'nowrap' },
  tabs: { display: 'flex', gap: 4 },
  tab: (active) => ({
    padding: '16px 16px',
    border: 'none', background: 'none',
    color: active ? '#818cf8' : '#475569',
    borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
    cursor: 'pointer', fontSize: 14, fontWeight: active ? 700 : 400,
    transition: 'all 0.15s',
  }),
  content: { flex: 1, padding: '32px 24px', maxWidth: 760, width: '100%', margin: '0 auto' },
}

export default function App() {
  const [tab, setTab] = useState('study')
  const cards = useCards()

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
    </div>
  )
}
