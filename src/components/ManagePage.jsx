import { useState, useMemo } from 'react'

const S = {
  section: { background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b', borderRadius: 16, padding: 20, marginBottom: 16 },
  title: { color: '#e2e8f0', fontSize: 15, fontWeight: 700, marginBottom: 4 },
  sub: { color: '#64748b', fontSize: 12, marginBottom: 16, lineHeight: 1.5 },
  authCard: {
    background: 'linear-gradient(135deg, #1e1b4b, #0f172a)',
    border: '1px solid #312e81', borderRadius: 16, padding: 20, marginBottom: 20,
    display: 'flex', flexDirection: 'column', gap: 14
  },
  authFlex: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  googleBtn: {
    background: '#ffffff', color: '#0f172a', border: 'none', borderRadius: 10,
    padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.2s'
  },
  logoutBtn: {
    background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 },
  btn: (danger) => ({
    background: danger ? 'rgba(239,68,68,0.1)' : '#1e293b',
    border: `1px solid ${danger ? 'rgba(239,68,68,0.2)' : '#334155'}`,
    borderRadius: 10, color: danger ? '#ef4444' : '#94a3b8',
    padding: '12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center'
  }),
  row: { display: 'flex', gap: 8, marginTop: 10 },
  input: { flex: 1, background: '#0a0f1e', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none' },
  select: { background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', padding: '8px', fontSize: 13, cursor: 'pointer' },
  badge: { background: '#1e293b', color: '#64748b', fontSize: 11, borderRadius: 6, padding: '2px 8px' },
}

export default function ManagePage({ cards }) {
  const {
    userCards, duplicateCount, isAnonymous, userEmail, loginWithGoogle, handleLogout,
    exportJSON, importJSON, deduplicateSelf, deleteBy, countBy, subjects, parts
  } = cards

  const [delSub, setDelSub] = useState('전체')
  const [delPart, setDelPart] = useState('전체')

  const delOptions = useMemo(() => {
    const base = delSub === '전체' ? userCards : userCards.filter((c) => c.subject === delSub)
    return [...new Set(base.map((c) => c.part))]
  }, [userCards, delSub])

  const targetCount = countBy({ subject: delSub, part: delPart })

  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    importJSON(file)
      .then((res) => alert(`성공: ${res.added}개 추가됨 (중복 패스: ${res.skipped}개)`))
      .catch((err) => alert(err.message))
    e.target.value = ''
  }

  const handleDeduplicate = () => {
    if (duplicateCount === 0) return
    deduplicateSelf().then((removed) => alert(`${removed}개의 중복 카드가 삭제되었습니다.`))
  }

  const handleDelete = () => {
    if (targetCount === 0) return
    if (window.confirm(`정말 [${delSub} > ${delPart}] 카드를 전부 삭제하시겠습니까?\n총 ${targetCount}개의 카드가 영구 삭제됩니다.`)) {
      deleteBy({ subject: delSub, part: delPart }).then((removed) => alert(`${removed}개의 카드가 삭제되었습니다.`))
    }
  }

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      
      {/* ☁️ 클라우드 계정 관리 섹션 */}
      <div style={S.authCard}>
        <div style={S.authFlex}>
          <div>
            <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              {isAnonymous ? '☁️ 임시 클라우드 보관함' : '🔒 안전한 계정 동기화 완료'}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
              {isAnonymous 
                ? '구글 계정을 연동하면 스마트폰, 태블릿 등 다른 기기에서도 진도를 이어갈 수 있습니다.'
                : `${userEmail} 계정으로 로그인되어 실시간 클라우드 백업이 유지됩니다.`
              }
            </div>
          </div>
          {isAnonymous ? (
            <button style={S.googleBtn} onClick={loginWithGoogle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              Google 계정 연동
            </button>
          ) : (
            <button style={S.logoutBtn} onClick={handleLogout}>로그아웃</button>
          )}
        </div>
      </div>

      {/* 데이터 백업 / 복원 섹션 */}
      <div style={S.section}>
        <div style={S.title}>데이터 백업 및 백업 파일 로드</div>
        <div style={S.sub}>내장 기본 카드와 직접 만든 유저 카드를 모두 백업하거나 가져옵니다.</div>
        <div style={S.grid}>
          <button style={S.btn(false)} onClick={exportJSON}>📤 전체 내보내기 (.json)</button>
          <label style={{ ...S.btn(false), display: 'block', cursor: 'pointer' }}>
            📥 백업 파일 가져오기
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </label>
        </div>
      </div>

      {/* 데이터 정리 섹션 */}
      <div style={S.section}>
        <div style={S.title}>데이터 정리</div>
        <div style={S.sub}>중복 생성된 카드를 일괄 제거합니다.</div>
        <div style={S.grid}>
          <button style={S.btn(duplicateCount > 0)} disabled={duplicateCount === 0} onClick={handleDeduplicate}>
            ✨ 중복 제거 ({duplicateCount}개 발견)
          </button>
        </div>
      </div>

      {/* 카드 삭제 섹션 */}
      <div style={S.section}>
        <div style={S.title}>유저 카드 선별 삭제</div>
        <div style={S.sub}>내가 임포트하거나 생성한 카드만 대상을 지정해 지울 수 있습니다. (기본 내장 카드는 제외)</div>
        <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <select style={{ ...S.select, flex: 1 }} value={delSub} onChange={(e) => { setDelSub(e.target.value); setDelPart('전체'); }}>
              <option>전체</option>{subjects.map(s => <option key={s}>{s}</option>)}
            </select>
            <select style={{ ...S.select, flex: 1 }} value={delPart} onChange={(e) => setDelPart(e.target.value)}>
              <option>전체</option>{delOptions.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div style={S.row}>
            <button style={{ ...S.btn(targetCount > 0), flex: 1, padding: '10px' }} disabled={targetCount === 0} onClick={handleDelete}>
              🗑 선택한 카드 {targetCount}개 일괄 삭제
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
