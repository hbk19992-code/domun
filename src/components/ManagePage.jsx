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
  listContainer: { maxHeight: 350, overflowY: 'auto', background: '#0a0f1e', borderRadius: 10, padding: 8, border: '1px solid #1e293b' }
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

export default function ManagePage({ cards }) {
  const {
    userCards, duplicateCount, isAnonymous, userEmail, loginWithGoogle, handleLogout,
    exportJSON, importJSON, deduplicateSelf, deleteBy, countBy, renameFolder, subjects, parts
  } = cards

  // ── [상태] 선별 삭제 및 폴더 관리 관련 ──
  const [delSub, setDelSub] = useState('전체')
  const [delPart, setDelPart] = useState('전체')
  const [editOldSub, setEditOldSub] = useState('전체')
  const [editOldPart, setEditOldPart] = useState('전체')
  const [editNewSub, setEditNewSub] = useState('')
  const [editNewPart, setEditNewPart] = useState('')

  // ── [상태] 새 카드 직접 추가 관련 ──
  const [newSub, setNewSub] = useState('')
  const [newPart, setNewPart] = useState('')
  const [newQ, setNewQ] = useState('')
  const [newType, setNewType] = useState('mnemonic') // 'mnemonic' | 'qa'
  const [newMnemonic, setNewMnemonic] = useState('')
  const [newDetail, setNewDetail] = useState('')
  const [newAnswer, setNewAnswer] = useState('')

  // ── [상태] 개별 카드 목록 조회 및 수정 관련 ──
  const [searchKeyword, setSearchKeyword] = useState('')
  const [listSub, setListSub] = useState('전체')
  const [listPart, setListPart] = useState('전체')
  const [editingCardId, setEditingCardId] = useState(null)
  const [editCardDraft, setEditCardDraft] = useState(null)

  // ── 옵션 메모이제이션 ──
  const delOptions = useMemo(() => {
    const base = delSub === '전체' ? userCards : userCards.filter((c) => c.subject === delSub)
    return [...new Set(base.map((c) => c.part))]
  }, [userCards, delSub])

  const editOptions = useMemo(() => {
    const base = editOldSub === '전체' ? userCards : userCards.filter((c) => c.subject === editOldSub)
    return [...new Set(base.map((c) => c.part))]
  }, [userCards, editOldSub])

  const listPartOptions = useMemo(() => {
    const base = listSub === '전체' ? userCards : userCards.filter((c) => c.subject === listSub)
    return [...new Set(base.map((c) => c.part))]
  }, [userCards, listSub])

  const targetCount = countBy({ subject: delSub, part: delPart })
  const targetEditCount = countBy({ subject: editOldSub, part: editOldPart })

  // 새 카드 추가용 자식 파트 옵션 추출
  const newPartOptions = useMemo(() => parts(newSub), [newSub, parts])
  // 인라인 수정 드래프트용 자식 파트 옵션 추출
  const draftPartOptions = useMemo(() => parts(editCardDraft?.subject || ''), [editCardDraft?.subject])

  // 필터링된 실시간 유저 카드 목록 계산
  const filteredUserCards = useMemo(() => {
    return userCards.filter(c => {
      const matchSub = listSub === '전체' || c.subject === listSub;
      const matchPart = listPart === '전체' || c.part === listPart;
      const text = (c.question + (c.mnemonic || '') + (c.detail || '') + (c.answer || '')).toLowerCase();
      const matchKey = !searchKeyword || text.includes(searchKeyword.toLowerCase());
      return matchSub && matchPart && matchKey;
    });
  }, [userCards, listSub, listPart, searchKeyword]);

  // ── 핸들러 동작 정의 ──
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

  const handleRename = () => {
    if (targetEditCount === 0 || (!editNewSub.trim() && !editNewPart.trim())) return
    if (window.confirm(`[${editOldSub} > ${editOldPart}] 폴더 범위의 카드 ${targetEditCount}개를 일괄 변경하시겠습니까?`)) {
      renameFolder({
        oldSubject: editOldSub,
        oldPart: editOldPart,
        newSubject: editNewSub.trim() || editOldSub,
        newPart: editNewPart.trim() || editOldPart
      }).then((count) => {
        alert(`${count}개의 카드가 성공적으로 이동 및 수정되었습니다.`);
        setEditNewSub('');
        setEditNewPart('');
      });
    }
  }

  const handleAddCardSubmit = async () => {
    if (!newSub.trim() || !newPart.trim() || !newQ.trim()) {
      alert('과목, 단원, 질문은 필수 입력 사항입니다.');
      return;
    }
    if (newType === 'mnemonic' && !newMnemonic.trim()) {
      alert('두문자를 입력해 주세요.');
      return;
    }
    if (newType === 'qa' && !newAnswer.trim()) {
      alert('정답 내용을 입력해 주세요.');
      return;
    }

    const cardData = {
      subject: newSub.trim(),
      part: newPart.trim(),
      question: newQ.trim(),
      mnemonic: newType === 'mnemonic' ? newMnemonic.trim() : '',
      detail: newType === 'mnemonic' ? newDetail.trim() : '',
      answer: newType === 'qa' ? newAnswer.trim() : null,
    };

    await cards.addCard(cardData);
    alert('카드가 정상적으로 추가되었습니다.');
    setNewQ('');
    setNewMnemonic('');
    setNewDetail('');
    setNewAnswer('');
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
              Google 계정 연동
            </button>
          ) : (
            <button style={S.logoutBtn} onClick={handleLogout}>로그아웃</button>
          )}
        </div>
      </div>

      {/* ➕ 개별 카드 추가 생성 섹션 */}
      <div style={S.section}>
        <div style={S.title}>➕ 개별 카드 직접 추가</div>
        <div style={S.sub}>나만의 오답 노트나 수기 두문자 카드를 데이터베이스에 직접 생성합니다.</div>
        <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <DataListInput id="add-sub-dl" value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="과목 입력 (예: 민법)" style={S.input} options={subjects} />
            <DataListInput id="add-part-dl" value={newPart} onChange={e => setNewPart(e.target.value)} placeholder="단원 입력 (예: 물권법)" style={S.input} options={newPartOptions} />
          </div>
          <input style={{...S.input, width: '100%'} } placeholder="질문 내용을 입력하세요" value={newQ} onChange={e => setNewQ(e.target.value)} />
          
          <div style={{ display: 'flex', gap: 10, margin: '4px 0' }}>
            <label style={{ color: '#e2e8f0', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="radio" checked={newType === 'mnemonic'} onChange={() => setNewType('mnemonic')} /> 두문자 플래시카드 형태
            </label>
            <label style={{ color: '#e2e8f0', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="radio" checked={newType === 'qa'} onChange={() => setNewType('qa')} /> 일반 질문-답변(Q&A) 형태
            </label>
          </div>

          {newType === 'mnemonic' ? (
            <>
              <input style={{...S.input, color: '#818cf8', fontWeight: 700}} placeholder="두문자 기입 (예: 이.가.게.귀.위)" value={newMnemonic} onChange={e => setNewMnemonic(e.target.value)} />
              <textarea style={{...S.input, minHeight: 55, resize: 'vertical'}} placeholder="각 두문자의 상세 설명을 입력하세요 (①이행기 / ②가능...)" value={newDetail} onChange={e => setNewDetail(e.target.value)} />
            </>
          ) : (
            <textarea style={{...S.input, minHeight: 80, resize: 'vertical'}} placeholder="뒤집었을 때 보일 정답 해설을 입력하세요" value={newAnswer} onChange={e => setNewAnswer(e.target.value)} />
          )}

          <button style={{...S.btn(false), background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', marginTop: 4}} onClick={handleAddCardSubmit}>
            ✨ 새 카드 생성 및 저장
          </button>
        </div>
      </div>

      {/* 📁 폴더(과목/단원) 이름 일괄 변경 섹션 */}
      <div style={S.section}>
        <div style={S.title}>📁 폴더(과목/단원) 구조 일괄 변경</div>
        <div style={S.sub}>기존 카드들의 과목명이나 단원 소제목을 일괄 수정하여 다른 카테고리로 통합/이동시킵니다.</div>
        <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: 12, width: 45 }}>대상 폴더</span>
            <select style={{ ...S.select, flex: 1 }} value={editOldSub} onChange={(e) => { setEditOldSub(e.target.value); setEditOldPart('전체'); }}>
              <option>전체</option>{subjects.map(s => <option key={s}>{s}</option>)}
            </select>
            <select style={{ ...S.select, flex: 1 }} value={editOldPart} onChange={(e) => setEditOldPart(e.target.value)}>
              <option>전체</option>{editOptions.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: '#818cf8', fontSize: 12, width: 45, fontWeight: 700 }}>변경 후</span>
            <input style={S.input} placeholder="새 과목명 (공백 시 유지)" value={editNewSub} onChange={e => setEditNewSub(e.target.value)} />
            <input style={S.input} placeholder="새 단원명 (공백 시 유지)" value={editNewPart} onChange={e => setEditNewPart(e.target.value)} />
          </div>
          <button 
            style={{ ...S.btn(false), background: targetEditCount > 0 ? 'rgba(99,102,241,0.2)' : '#1e293b', color: targetEditCount > 0 ? '#818cf8' : '#64748b', border: targetEditCount > 0 ? '1px solid #6366f1' : '1px solid #334155' }} 
            disabled={targetEditCount === 0 || (!editNewSub.trim() && !editNewPart.trim())} 
            onClick={handleRename}
          >
            ✏️ 대상 유저 카드 {targetEditCount}개 폴더 구조 변경
          </button>
        </div>
      </div>

      {/* 🔍 개별 카드 수정 및 삭제 목록 관리 섹션 */}
      <div style={S.section}>
        <div style={S.title}>🔍 내가 만든 개별 카드 목록 관리</div>
        <div style={S.sub}>보유 중인 커스텀 카드를 개별 검색하고 자유롭게 수정하거나 영구 삭제할 수 있습니다.</div>
        
        {/* 필터 제어 필드 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <select style={{ ...S.select, flex: 1 }} value={listSub} onChange={(e) => { setListSub(e.target.value); setListPart('전체'); }}>
            <option>전체 과목</option>{subjects.map(s => <option key={s}>{s}</option>)}
          </select>
          <select style={{ ...S.select, flex: 1 }} value={listPart} onChange={(e) => setListPart(e.target.value)}>
            <option>전체 단원</option>{listPartOptions.map(p => <option key={p}>{p}</option>)}
          </select>
          <input style={{...S.input, flex: 2, minWidth: '150px'}} placeholder="키워드 검색 (질문/두문자/내용)" value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} />
        </div>

        {/* 유저 카드 실시간 목록 출력창 */}
        <div style={S.listContainer}>
          {filteredUserCards.length === 0 ? (
            <div style={{ color: '#475569', textAlign: 'center', padding: '30px 0', fontSize: 13 }}>조건에 맞는 유저 카드가 존재하지 않습니다.</div>
          ) : (
            filteredUserCards.map(c => {
              const isEditing = editingCardId === c.id;
              const isQA = !c.mnemonic && c.answer != null;

              if (isEditing) {
                return (
                  <div key={c.id} style={{ border: '1px solid #6366f1', background: '#0f172a', padding: 12, borderRadius: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <DataListInput id={`edit-sub-dl-${c.id}`} value={editCardDraft.subject} onChange={e => setEditCardDraft({...editCardDraft, subject: e.target.value})} placeholder="과목" style={S.input} options={subjects} />
                      <DataListInput id={`edit-part-dl-${c.id}`} value={editCardDraft.part} onChange={e => setEditCardDraft({...editCardDraft, part: e.target.value})} placeholder="단원" style={S.input} options={draftPartOptions} />
                    </div>
                    <input style={{...S.input, width: '100%', marginBottom: 6}} value={editCardDraft.question} onChange={e => setEditCardDraft({...editCardDraft, question: e.target.value})} placeholder="질문" />
                    {isQA ? (
                      <textarea style={{...S.input, width: '100%', marginBottom: 6, minHeight: 50, resize: 'vertical'}} value={editCardDraft.answer} onChange={e => setEditCardDraft({...editCardDraft, answer: e.target.value})} placeholder="답변 내용" />
                    ) : (
                      <>
                        <input style={{...S.input, width: '100%', marginBottom: 6, color: '#818cf8', fontWeight: 700}} value={editCardDraft.mnemonic} onChange={e => setEditCardDraft({...editCardDraft, mnemonic: e.target.value})} placeholder="두문자" />
                        <textarea style={{...S.input, width: '100%', marginBottom: 6, minHeight: 50, resize: 'vertical'}} value={editCardDraft.detail} onChange={e => setEditCardDraft({...editCardDraft, detail: e.target.value})} placeholder="두문자 상세 설명" />
                      </>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button style={{...S.btn(false), flex: 1, padding: '8px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none'}} onClick={async () => {
                        await cards.updateCard(c.id, editCardDraft);
                        setEditingCardId(null);
                      }}>수정 완료</button>
                      <button style={{...S.btn(false), flex: 1, padding: '8px'}} onClick={() => setEditingCardId(null)}>취소</button>
                    </div>
                  </div>
                )
              }

              return (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15,23,42,0.5)', border: '1px solid #1e293b', padding: '10px 14px', borderRadius: 10, marginBottom: 6, gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 5, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, background: '#1e293b', color: '#94a3b8', padding: '1px 6px', borderRadius: 4 }}>{c.subject}</span>
                      <span style={{ fontSize: 10, background: '#1e293b', color: '#64748b', padding: '1px 6px', borderRadius: 4 }}>{c.part}</span>
                      <span style={{ fontSize: 10, background: isQA ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)', color: isQA ? '#f59e0b' : '#818cf8', padding: '1px 6px', borderRadius: 4 }}>{isQA ? 'Q&A' : '두문자'}</span>
                    </div>
                    <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.question}</div>
                    <div style={{ color: isQA ? '#94a3b8' : '#818cf8', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isQA ? c.answer : `${c.mnemonic} - ${c.detail}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                    <button style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }} onClick={() => {
                      setEditingCardId(c.id);
                      setEditCardDraft({...c});
                    }} title="편집">✎</button>
                    <button style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }} onClick={async () => {
                      if (window.confirm('이 카드를 데이터베이스에서 영구 삭제하시겠습니까?')) {
                        await cards.deleteCard(c.id);
                      }
                    }} title="삭제">🗑</button>
                  </div>
                </div>
              )
            })
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

      {/* 카드 선별 삭제 섹션 */}
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
