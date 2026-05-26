import { useState, useEffect } from 'react'
import { useCards } from './hooks/useCards'
import StudyPage from './components/StudyPage'
import RecordPage from './components/RecordPage'
import ExtractPage from './components/ExtractPage'
import ManagePage from './components/ManagePage'
import { ThemeSelectInline } from './components/ThemePicker'
import { getShareParam, decodeCards, clearShareParam } from './utils/share'

const TABS = [
  { id: 'study', label: '📚 학습' },
  { id: 'record', label: '✎ 기록형' },
  { id: 'extract', label: '✦ AI 추출' },
  { id: 'manage', label: '⚙ 관리' },
]

const UPDATE_NOTICE_KEY = 'domun_update_notice_hidden_until_20260526'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function shouldShowUpdateNotice() {
  try {
    const hiddenUntil = Number(localStorage.getItem(UPDATE_NOTICE_KEY) || 0)
    return !hiddenUntil || Date.now() > hiddenUntil
  } catch {
    return true
  }
}

const S = {
  wrap: { minHeight: '100vh', background: 'var(--theme-bg, #0a0f1e)', display: 'flex', flexDirection: 'column', overflowX: 'hidden' },
  header: {
    borderBottom: '1px solid var(--theme-border, #1e293b)', padding: '0 16px',
    display: 'flex', alignItems: 'center', gap: 16,
    position: 'sticky', top: 0, zIndex: 100,
    background: 'var(--theme-headerBg, rgba(10,15,30,0.95))', backdropFilter: 'blur(12px)',
  },
  logo: { fontSize: 17, fontWeight: 800, color: 'var(--theme-text, #e2e8f0)', padding: '16px 0', whiteSpace: 'nowrap' },
  tabs: { display: 'flex', gap: 2, overflowX: 'auto' },
  tab: (active) => ({
    padding: '16px 10px', border: 'none', background: 'none',
    color: active ? 'var(--theme-accent, #818cf8)' : 'var(--theme-textDim, #475569)',
    borderBottom: active ? '2px solid var(--theme-accentStrong, #6366f1)' : '2px solid transparent',
    cursor: 'pointer', fontSize: 14, fontWeight: active ? 700 : 400,
    whiteSpace: 'nowrap',
  }),
  content: (tab) => ({
    flex: 1,
    padding: '24px 16px',
    maxWidth: tab === 'manage' ? 1360 : tab === 'record' ? 1180 : 760,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
  }),
  overlay: {
    position: 'fixed', inset: 0, background: 'var(--theme-overlay, rgba(0,0,0,0.7))',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, padding: 24,
  },
  modal: {
    background: 'var(--theme-elevated, #0f172a)', border: '1px solid var(--theme-border, #1e293b)', borderRadius: 20,
    padding: 32, width: '100%', maxWidth: 480,
  },
  updateModal: {
    background: 'var(--theme-elevated, #0f172a)',
    border: '1px solid var(--theme-border, #1e293b)',
    borderRadius: 20,
    padding: 0,
    width: '100%',
    maxWidth: 720,
    maxHeight: 'min(82vh, 760px)',
    overflow: 'hidden',
    boxShadow: 'var(--theme-shadow, 0 10px 30px rgba(0,0,0,0.35))',
  },
  modalTitle: { color: 'var(--theme-text, #e2e8f0)', fontSize: 18, fontWeight: 800, marginBottom: 8 },
  modalSub: { color: 'var(--theme-textDim, #64748b)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 },
  modalRow: { display: 'flex', gap: 10 },
  modalBtn: (primary) => ({
    flex: 1, padding: '12px', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer',
    background: primary ? 'var(--theme-accentGradient, linear-gradient(135deg,#6366f1,#8b5cf6))' : 'var(--theme-button, #1e293b)',
    color: primary ? 'var(--theme-onAccent, #fff)' : 'var(--theme-textMuted, #94a3b8)', border: 'none',
  }),
  syncBanner: (error) => ({
    background: error ? 'var(--theme-warningSoft, rgba(245,158,11,0.14))' : 'var(--theme-accentSoft, rgba(99,102,241,0.15))',
    border: `1px solid ${error ? 'var(--theme-warningSoft, rgba(245,158,11,0.14))' : 'var(--theme-accentSoft, rgba(99,102,241,0.15))'}`,
    color: error ? 'var(--theme-warningText, #fbbf24)' : 'var(--theme-textMuted, #94a3b8)',
    borderRadius: 12,
    padding: '9px 12px',
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 1.5,
  }),
}

const UPDATE_FEATURES = [
  ['학습', '두문자·Q&A·판례·조문 카드를 과목과 단원별로 보고, 모름·헷갈림·앎 상태를 기록합니다.'],
  ['복습', '클라우드 진행률과 복습 시점에 맞춰 오늘 볼 카드를 따로 모아 학습합니다.'],
  ['음성', '질문을 읽고 자동으로 카드를 뒤집은 뒤 정답까지 이어 읽습니다. 상태 버튼을 누르면 자연스럽게 다음 카드로 넘어갑니다.'],
  ['즐겨찾기·별점', '중요 카드를 별표와 별점으로 표시하고, 학습 화면에서 필터링합니다.'],
  ['기록형', '민사기록형 카드는 전용 화면에서 답안을 먼저 쓰고, 채점 후 키워드와 모범답안을 확인합니다.'],
  ['AI 추출', 'PDF·TXT에서 카드 후보를 뽑고, 기존 카드와 중복·보강 여부를 비교합니다.'],
  ['누락 점검', '번호가 있는 원문은 추출 결과와 대조해 누락 의심 번호를 따로 보여줍니다.'],
  ['관리', '카드 추가·수정·삭제, 대분류·과목·단원 일괄 정리, 분류별 표시 순서 설정을 제공합니다.'],
  ['테마', '다크·라이트·세피아·OLED·고대비 테마가 학습, 기록형, 추출, 관리 화면에 함께 적용됩니다.'],
  ['X4 내보내기', '과목·단원 단위로 TXT와 EPUB을 만들어 e-ink 리더에서 보기 쉽게 내보냅니다.'],
  ['백업·공유', 'Firestore 저장 구조를 유지하면서 JSON 백업, 가져오기, 공유 링크 가져오기를 지원합니다.'],
]

const UPDATE_SHORTCUTS = [
  ['1', '모름'],
  ['2', '헷갈림'],
  ['3', '앎'],
  ['Space', '카드 뒤집기'],
  ['← / →', '이전·다음'],
  ['p / n', '이전·다음'],
  ['s', '섞기'],
  ['?', '단축키 안내'],
]

function UpdateNoticeModal({ onClose, onHideWeek }) {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.updateModal} role="dialog" aria-label="업데이트 안내" onClick={(e) => e.stopPropagation()}>
        <div style={{
          padding: '24px 26px 18px',
          borderBottom: '1px solid var(--theme-border, #1e293b)',
          background: 'var(--theme-panelSoft, rgba(15,23,42,0.6))',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
            <div>
              <div style={{
                display: 'inline-flex',
                gap: 8,
                alignItems: 'center',
                color: 'var(--theme-accentText, #e0e7ff)',
                background: 'var(--theme-accentSoft, rgba(99,102,241,0.15))',
                border: '1px solid var(--theme-accentSoft, rgba(99,102,241,0.15))',
                borderRadius: 999,
                padding: '5px 10px',
                fontSize: 12,
                fontWeight: 900,
                marginBottom: 10,
              }}>
                업데이트 안내 · 제작자 owb
              </div>
              <div style={{ color: 'var(--theme-text, #e2e8f0)', fontSize: 22, fontWeight: 900, lineHeight: 1.25 }}>
                두문자 카드 기능 정리
              </div>
              <div style={{ color: 'var(--theme-textDim, #64748b)', fontSize: 13, lineHeight: 1.6, marginTop: 7 }}>
                이번 버전은 테마 일관성, 기록형 전용 학습, 음성 학습, 추출 검수, 관리 편의 기능을 한 화면 흐름으로 정리했습니다.
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="업데이트 안내 닫기"
              style={{
                background: 'var(--theme-button, #1e293b)',
                border: '1px solid var(--theme-borderStrong, #334155)',
                color: 'var(--theme-textMuted, #94a3b8)',
                borderRadius: 10,
                width: 36,
                height: 36,
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >×</button>
          </div>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', maxHeight: 'calc(min(82vh, 760px) - 178px)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginBottom: 20 }}>
            {UPDATE_FEATURES.map(([title, body]) => (
              <div key={title} style={{
                background: 'var(--theme-panelSoft, rgba(15,23,42,0.6))',
                border: '1px solid var(--theme-border, #1e293b)',
                borderRadius: 12,
                padding: '12px 13px',
              }}>
                <div style={{ color: 'var(--theme-text, #e2e8f0)', fontSize: 13, fontWeight: 900, marginBottom: 5 }}>{title}</div>
                <div style={{ color: 'var(--theme-textMuted, #94a3b8)', fontSize: 12, lineHeight: 1.55, wordBreak: 'keep-all' }}>{body}</div>
              </div>
            ))}
          </div>

          <div style={{
            background: 'var(--theme-input, #0a0f1e)',
            border: '1px solid var(--theme-border, #1e293b)',
            borderRadius: 14,
            padding: 16,
          }}>
            <div style={{ color: 'var(--theme-text, #e2e8f0)', fontSize: 14, fontWeight: 900, marginBottom: 10 }}>학습 단축키</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              {UPDATE_SHORTCUTS.map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{
                    minWidth: 54,
                    textAlign: 'center',
                    background: 'var(--theme-codeBg, #0a0f1e)',
                    border: '1px solid var(--theme-borderStrong, #334155)',
                    borderRadius: 7,
                    padding: '3px 7px',
                    color: 'var(--theme-accent, #818cf8)',
                    fontSize: 11,
                    fontFamily: 'ui-monospace, monospace',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}>{key}</code>
                  <span style={{ color: 'var(--theme-textMuted, #94a3b8)', fontSize: 12 }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: 10,
          padding: '16px 24px 22px',
          borderTop: '1px solid var(--theme-border, #1e293b)',
          background: 'var(--theme-elevated, #0f172a)',
          flexWrap: 'wrap',
        }}>
          <button style={{ ...S.modalBtn(false), minWidth: 170 }} onClick={onHideWeek}>일주일간 보지 않기</button>
          <button style={{ ...S.modalBtn(true), minWidth: 160 }} onClick={onClose}>확인</button>
        </div>
      </div>
    </div>
  )
}

function ShareImportModal({ sharedCards, onImport, onClose }) {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔗</div>
        <div style={S.modalTitle}>공유된 카드셋</div>
        <div style={S.modalSub}>
          <span style={{ color: 'var(--theme-accent, #818cf8)', fontWeight: 700 }}>{sharedCards.length}개</span>의 카드가 공유되었습니다.<br />
          {sharedCards[0] && `"${sharedCards[0].subject}" 등`} — 지금 가져오시겠어요?
        </div>
        <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sharedCards.slice(0, 5).map((c, i) => (
            <div key={i} style={{ background: 'var(--theme-button, #1e293b)', borderRadius: 8, padding: '8px 12px' }}>
              <span style={{ color: 'var(--theme-accent, #818cf8)', fontWeight: 700, fontSize: 13 }}>{c.mnemonic || c.answer}</span>
              <span style={{ color: 'var(--theme-textDim, #64748b)', fontSize: 12, marginLeft: 8 }}>{c.question}</span>
            </div>
          ))}
          {sharedCards.length > 5 && (
            <div style={{ color: 'var(--theme-borderStrong, #334155)', fontSize: 12, textAlign: 'center', padding: '4px 0' }}>
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
  const [updateNoticeOpen, setUpdateNoticeOpen] = useState(() => shouldShowUpdateNotice())

  useEffect(() => {
    const param = getShareParam()
    if (!param) return
    decodeCards(param)
      .then((decoded) => {
        if (Array.isArray(decoded) && decoded.length > 0) setSharedCards(decoded)
        else throw new Error('empty')
      })
      .catch(() => {
        // 손상되거나 잘린 공유 링크 — 앱이 멈추지 않도록 안전하게 처리
        clearShareParam()
        setImportToast('공유 링크가 손상되어 카드를 불러올 수 없습니다')
        setTimeout(() => setImportToast(''), 4000)
      })
  }, [])

  const handleShareImport = async () => {
    const result = await cards.addCards(sharedCards)
    const added = typeof result === 'number' ? result : result.added
    const updated = typeof result === 'number' ? 0 : result.updated
    const skipped = sharedCards.length - added - updated
    setSharedCards(null)
    clearShareParam()
    const updateText = updated > 0 ? ` · 대분류 ${updated}개 보강` : ''
    setImportToast(skipped > 0 ? `✓ ${added}개 추가${updateText} (중복 ${skipped}개 제외)` : `✓ ${added}개 추가됨${updateText}`)
    setTimeout(() => setImportToast(''), 3000)
    setTab('study')
  }

  const hideUpdateNoticeForWeek = () => {
    try {
      localStorage.setItem(UPDATE_NOTICE_KEY, String(Date.now() + WEEK_MS))
    } catch {}
    setUpdateNoticeOpen(false)
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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <ThemeSelectInline />
        </div>
      </header>
      <main style={S.content(tab)}>
        {(cards.loading || cards.syncing || cards.syncError) && (
          <div style={S.syncBanner(cards.syncError)}>
            {cards.syncError || (cards.loading ? '앱을 여는 중입니다. 오래 걸리면 로컬 카드로 먼저 시작합니다.' : '클라우드 동기화 중입니다. 학습은 바로 진행할 수 있습니다.')}
          </div>
        )}
        {tab === 'study'   && <StudyPage   cards={cards} />}
        {tab === 'record'  && <RecordPage  cards={cards} />}
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

      {updateNoticeOpen && !sharedCards && (
        <UpdateNoticeModal
          onClose={() => setUpdateNoticeOpen(false)}
          onHideWeek={hideUpdateNoticeForWeek}
        />
      )}

      {importToast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--theme-accentStrong, #6366f1)', color: 'var(--theme-onAccent, #fff)', borderRadius: 10,
          padding: '10px 24px', fontSize: 14, fontWeight: 600, zIndex: 300, whiteSpace: 'nowrap',
        }}>{importToast}</div>
      )}
    </div>
  )
}
