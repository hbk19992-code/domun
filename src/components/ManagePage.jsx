import { useState, useMemo } from 'react'
import { answerLabel, answerPlaceholder, cardKindLabel, getCardKind, isAnswerCard } from '../utils/cardType'
import { DEFAULT_TOP_CATEGORY, getTopCategory, matchesTopCategory } from '../utils/classification'

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

function formatBatchDate(value) {
  if (!value) return '날짜 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '날짜 없음'
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function summarizeLabels(values, fallback) {
  const labels = [...new Set((values || []).filter(Boolean))]
  if (labels.length === 0) return fallback
  if (labels.length <= 2) return labels.join(', ')
  return `${labels.slice(0, 2).join(', ')} 외 ${labels.length - 2}`
}

export default function ManagePage({ cards }) {
  const {
    allCards, userCards, duplicateCount, isAnonymous, userEmail, loginWithGoogle, handleLogout,
    exportJSON, exportX4TXT, exportX4EPUB, importJSON, deduplicateSelf, deleteBy, countBy, renameFolder, updateCardsByIds,
    topCategories, subjects, subjectsForTop, parts
  } = cards

  // ── [상태] 선별 삭제 및 폴더 관리 관련 ──
  const [delTop, setDelTop] = useState('전체')
  const [delSub, setDelSub] = useState('전체')
  const [delPart, setDelPart] = useState('전체')
  const [editOldTop, setEditOldTop] = useState('전체')
  const [editOldSub, setEditOldSub] = useState('전체')
  const [editOldPart, setEditOldPart] = useState('전체')
  const [editNewTop, setEditNewTop] = useState('')
  const [editNewSub, setEditNewSub] = useState('')
  const [editNewPart, setEditNewPart] = useState('')
  const [batchId, setBatchId] = useState('')
  const [batchNewTop, setBatchNewTop] = useState('')
  const [batchNewSub, setBatchNewSub] = useState('')
  const [batchNewPart, setBatchNewPart] = useState('')

  // ── [상태] 새 카드 직접 추가 관련 ──
  const [newTop, setNewTop] = useState(DEFAULT_TOP_CATEGORY)
  const [newSub, setNewSub] = useState('')
  const [newPart, setNewPart] = useState('')
  const [newQ, setNewQ] = useState('')
  const [newType, setNewType] = useState('mnemonic')
  const [newMnemonic, setNewMnemonic] = useState('')
  const [newDetail, setNewDetail] = useState('')
  const [newAnswer, setNewAnswer] = useState('')

  // ── [상태] 개별 카드 목록 조회 및 수정 관련 ──
  const [searchKeyword, setSearchKeyword] = useState('')
  const [listTop, setListTop] = useState('전체')
  const [listSub, setListSub] = useState('전체')
  const [listPart, setListPart] = useState('전체')
  const [editingCardId, setEditingCardId] = useState(null)
  const [editCardDraft, setEditCardDraft] = useState(null)

  // ── [상태] X4 내보내기 범위 선택 관련 ──
  const [x4Top, setX4Top] = useState('전체')
  const [x4Sub, setX4Sub] = useState('전체')
  const [x4Part, setX4Part] = useState('전체')

  // ── 옵션 메모이제이션 ──
  const safeTopCategories = useMemo(
    () => [...new Set([DEFAULT_TOP_CATEGORY, ...(Array.isArray(topCategories) ? topCategories : [])].filter(Boolean))],
    [topCategories]
  )

  const getSubjectOptions = (topCategory) => {
    if (typeof subjectsForTop === 'function') return subjectsForTop(topCategory)
    return subjects
  }

  const delSubjectOptions = useMemo(() => {
    return [...new Set(userCards.filter((c) => matchesTopCategory(c, delTop)).map((c) => c.subject).filter(Boolean))]
  }, [userCards, delTop])

  const delOptions = useMemo(() => {
    const topBase = userCards.filter((c) => matchesTopCategory(c, delTop))
    const base = delSub === '전체' ? topBase : topBase.filter((c) => c.subject === delSub)
    return [...new Set(base.map((c) => c.part))]
  }, [userCards, delTop, delSub])

  const editSubjectOptions = useMemo(() => {
    return [...new Set(userCards.filter((c) => matchesTopCategory(c, editOldTop)).map((c) => c.subject).filter(Boolean))]
  }, [userCards, editOldTop])

  const editOptions = useMemo(() => {
    const topBase = userCards.filter((c) => matchesTopCategory(c, editOldTop))
    const base = editOldSub === '전체' ? topBase : topBase.filter((c) => c.subject === editOldSub)
    return [...new Set(base.map((c) => c.part))]
  }, [userCards, editOldTop, editOldSub])

  const listSubjectOptions = useMemo(() => {
    return [...new Set(userCards.filter((c) => matchesTopCategory(c, listTop)).map((c) => c.subject).filter(Boolean))]
  }, [userCards, listTop])

  const listPartOptions = useMemo(() => {
    const topBase = userCards.filter((c) => matchesTopCategory(c, listTop))
    const base = listSub === '전체' ? topBase : topBase.filter((c) => c.subject === listSub)
    return [...new Set(base.map((c) => c.part))]
  }, [userCards, listTop, listSub])

  const x4SubjectOptions = useMemo(() => {
    return [...new Set(allCards.filter((c) => matchesTopCategory(c, x4Top)).map((c) => c.subject).filter(Boolean))]
  }, [allCards, x4Top])

  const x4PartOptions = useMemo(() => {
    const topBase = allCards.filter((c) => matchesTopCategory(c, x4Top))
    const base = x4Sub === '전체' ? topBase : topBase.filter((c) => c.subject === x4Sub)
    return [...new Set(base.map((c) => c.part).filter(Boolean))]
  }, [allCards, x4Top, x4Sub])

  const x4Cards = useMemo(() => {
    return allCards.filter((c) => {
      const matchTop = matchesTopCategory(c, x4Top)
      const matchSub = x4Sub === '전체' || c.subject === x4Sub
      const matchPart = x4Part === '전체' || c.part === x4Part
      return matchTop && matchSub && matchPart
    })
  }, [allCards, x4Top, x4Sub, x4Part])

  const x4Label = useMemo(() => {
    return [x4Top, x4Sub, x4Part].filter((value) => value && value !== '전체').join('_') || '전체'
  }, [x4Top, x4Sub, x4Part])

  const extractionBatches = useMemo(() => {
    const timeOf = (value) => {
      const date = new Date(value || 0)
      return Number.isNaN(date.getTime()) ? 0 : date.getTime()
    }
    const map = new Map()
    userCards.forEach((card) => {
      const id = card.extractionBatchId
      if (!id) return
      if (!map.has(id)) {
        map.set(id, {
          id,
          count: 0,
          source: card.extractionSource || 'AI 추출',
          extractedAt: card.extractedAt || '',
          topCategories: new Set(),
          subjects: new Set(),
          parts: new Set(),
        })
      }
      const batch = map.get(id)
      batch.count += 1
      if (card.extractionSource && batch.source === 'AI 추출') batch.source = card.extractionSource
      if (timeOf(card.extractedAt) > timeOf(batch.extractedAt)) batch.extractedAt = card.extractedAt
      batch.topCategories.add(getTopCategory(card))
      if (card.subject) batch.subjects.add(card.subject)
      if (card.part) batch.parts.add(card.part)
    })

    return Array.from(map.values())
      .map((batch) => ({
        ...batch,
        topCategories: Array.from(batch.topCategories),
        subjects: Array.from(batch.subjects),
        parts: Array.from(batch.parts),
      }))
      .sort((a, b) => timeOf(b.extractedAt) - timeOf(a.extractedAt))
  }, [userCards])

  const activeBatchId = extractionBatches.some((batch) => batch.id === batchId)
    ? batchId
    : (extractionBatches[0]?.id || '')
  const activeBatch = extractionBatches.find((batch) => batch.id === activeBatchId)
  const activeBatchCards = useMemo(
    () => activeBatchId ? userCards.filter((card) => card.extractionBatchId === activeBatchId) : [],
    [activeBatchId, userCards]
  )

  const targetCount = countBy({ topCategory: delTop, subject: delSub, part: delPart })
  const targetEditCount = countBy({ topCategory: editOldTop, subject: editOldSub, part: editOldPart })
  const canBatchRename = activeBatchCards.length > 0 && (!!batchNewTop.trim() || !!batchNewSub.trim() || !!batchNewPart.trim())

  // 새 카드 추가용 자식 파트 옵션 추출
  const newSubjectOptions = useMemo(() => getSubjectOptions(newTop), [newTop, subjects, subjectsForTop])
  const newPartOptions = useMemo(() => parts(newSub, newTop), [newSub, newTop, parts])
  // 인라인 수정 드래프트용 자식 파트 옵션 추출
  const draftPartOptions = useMemo(() => parts(editCardDraft?.subject || '', getTopCategory(editCardDraft || {})), [editCardDraft?.subject, editCardDraft?.topCategory, editCardDraft?.category, editCardDraft?.collection, editCardDraft?.deck, editCardDraft?.group, parts])
  const batchPartOptions = useMemo(() => {
    const targetSubject = batchNewSub.trim()
    const targetTop = batchNewTop.trim()
    if (targetSubject) return parts(targetSubject, targetTop || '전체')
    return [...new Set(activeBatchCards.map((card) => card.part).filter(Boolean))]
  }, [activeBatchCards, batchNewTop, batchNewSub, parts])

  // 필터링된 실시간 유저 카드 목록 계산
  const filteredUserCards = useMemo(() => {
    return userCards.filter(c => {
      const matchTop = matchesTopCategory(c, listTop);
      const matchSub = listSub === '전체' || c.subject === listSub;
      const matchPart = listPart === '전체' || c.part === listPart;
      const text = (getTopCategory(c) + (c.question || '') + (c.mnemonic || '') + (c.detail || '') + (c.answer || '')).toLowerCase();
      const matchKey = !searchKeyword || text.includes(searchKeyword.toLowerCase());
      return matchTop && matchSub && matchPart && matchKey;
    });
  }, [userCards, listTop, listSub, listPart, searchKeyword]);

  // ── 핸들러 동작 정의 ──
  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    importJSON(file)
      .then((res) => alert(`성공: ${res.added}개 추가됨${res.updated ? `, ${res.updated}개 대분류 보강` : ''} (중복 패스: ${res.skipped}개)`))
      .catch((err) => alert(err.message))
    e.target.value = ''
  }

  const handleDeduplicate = () => {
    if (duplicateCount === 0) return
    deduplicateSelf().then((removed) => alert(`${removed}개의 중복 카드가 삭제되었습니다.`))
  }

  const handleDelete = () => {
    if (targetCount === 0) return
    if (window.confirm(`정말 [${delTop} > ${delSub} > ${delPart}] 카드를 전부 삭제하시겠습니까?\n총 ${targetCount}개의 카드가 영구 삭제됩니다.`)) {
      deleteBy({ topCategory: delTop, subject: delSub, part: delPart }).then((removed) => alert(`${removed}개의 카드가 삭제되었습니다.`))
    }
  }

  const handleRename = () => {
    if (targetEditCount === 0 || (!editNewTop.trim() && !editNewSub.trim() && !editNewPart.trim())) return
    if (window.confirm(`[${editOldTop} > ${editOldSub} > ${editOldPart}] 폴더 범위의 카드 ${targetEditCount}개를 일괄 변경하시겠습니까?`)) {
      renameFolder({
        oldTopCategory: editOldTop,
        oldSubject: editOldSub,
        oldPart: editOldPart,
        newTopCategory: editNewTop.trim(),
        newSubject: editNewSub.trim(),   // 빈 값이면 renameFolder가 기존 과목명 유지
        newPart: editNewPart.trim()      // 빈 값이면 renameFolder가 기존 단원명 유지
      }).then((count) => {
        alert(`${count}개의 카드가 성공적으로 이동 및 수정되었습니다.`);
        setEditNewTop('');
        setEditNewSub('');
        setEditNewPart('');
      });
    }
  }

  const handleBatchRename = () => {
    const nextTop = batchNewTop.trim()
    const nextSubject = batchNewSub.trim()
    const nextPart = batchNewPart.trim()
    if (!activeBatchCards.length || (!nextTop && !nextSubject && !nextPart)) return

    const patch = {}
    if (nextTop) patch.topCategory = nextTop
    if (nextSubject) patch.subject = nextSubject
    if (nextPart) patch.part = nextPart

    const preview = activeBatchCards.slice(0, 3)
      .map((card) => `- ${getTopCategory(card)} > ${card.subject || '미분류'} > ${card.part || '미분류'}: ${card.question || '질문 없음'}`)
      .join('\n')

    if (window.confirm(`[${activeBatch?.source || 'AI 추출'}] 묶음의 카드 ${activeBatchCards.length}개를 일괄 변경하시겠습니까?\n\n${preview}`)) {
      updateCardsByIds(activeBatchCards.map((card) => card.id), patch).then((count) => {
        alert(`${count}개의 최근 추출 카드가 성공적으로 수정되었습니다.`)
        setBatchNewTop('')
        setBatchNewSub('')
        setBatchNewPart('')
      })
    }
  }

  const handleAddCardSubmit = async () => {
    if (!newTop.trim() || !newSub.trim() || !newPart.trim() || !newQ.trim()) {
      alert('대분류, 과목, 단원, 질문은 필수 입력 사항입니다.');
      return;
    }
    if (newType === 'mnemonic' && !newMnemonic.trim()) {
      alert('두문자를 입력해 주세요.');
      return;
    }
    if (newType !== 'mnemonic' && !newAnswer.trim()) {
      alert(`${answerLabel(newType)}을 입력해 주세요.`);
      return;
    }

    const cardData = {
      cardType: newType,
      topCategory: newTop.trim() || DEFAULT_TOP_CATEGORY,
      subject: newSub.trim(),
      part: newPart.trim(),
      question: newQ.trim(),
      mnemonic: newType === 'mnemonic' ? newMnemonic.trim() : '',
      detail: newType === 'mnemonic' ? newDetail.trim() : '',
      answer: newType !== 'mnemonic' ? newAnswer.trim() : null,
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
            <DataListInput id="add-top-dl" value={newTop} onChange={e => setNewTop(e.target.value)} placeholder="대분류 입력 (예: 변호사시험)" style={S.input} options={safeTopCategories} />
            <DataListInput id="add-sub-dl" value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="과목 입력 (예: 민법)" style={S.input} options={newSubjectOptions} />
            <DataListInput id="add-part-dl" value={newPart} onChange={e => setNewPart(e.target.value)} placeholder="단원 입력 (예: 물권법)" style={S.input} options={newPartOptions} />
          </div>
          <input style={{...S.input, width: '100%'} } placeholder="질문 내용을 입력하세요" value={newQ} onChange={e => setNewQ(e.target.value)} />
          
          <div style={{ display: 'flex', gap: 10, margin: '4px 0' }}>
            {[
              ['mnemonic', '두문자'],
              ['qa', 'Q&A'],
              ['record', '민사기록형'],
              ['case', '판례'],
              ['statute', '조문'],
            ].map(([type, label]) => (
              <label key={type} style={{ color: '#e2e8f0', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="radio" checked={newType === type} onChange={() => setNewType(type)} /> {label}
              </label>
            ))}
          </div>

          {newType === 'mnemonic' ? (
            <>
              <input style={{...S.input, color: '#818cf8', fontWeight: 700}} placeholder="두문자 기입 (예: 이.가.게.귀.위)" value={newMnemonic} onChange={e => setNewMnemonic(e.target.value)} />
              <textarea style={{...S.input, minHeight: 55, resize: 'vertical'}} placeholder="각 두문자의 상세 설명을 입력하세요 (①이행기 / ②가능...)" value={newDetail} onChange={e => setNewDetail(e.target.value)} />
            </>
          ) : (
            <textarea style={{...S.input, minHeight: 80, resize: 'vertical'}} placeholder={answerPlaceholder(newType)} value={newAnswer} onChange={e => setNewAnswer(e.target.value)} />
          )}

          <button style={{...S.btn(false), background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', marginTop: 4}} onClick={handleAddCardSubmit}>
            ✨ 새 카드 생성 및 저장
          </button>
        </div>
      </div>

      {/* 최근 AI 추출 묶음 정리 섹션 */}
      <div style={S.section}>
        <div style={S.title}>최근 AI 추출 묶음 정리</div>
        <div style={S.sub}>AI 추출 화면에서 저장한 카드 묶음만 골라 과목과 단원을 한 번에 다시 맞춥니다.</div>
        {extractionBatches.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 13, background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10, padding: 12 }}>
            아직 저장된 AI 추출 묶음이 없습니다. 추출 결과를 내 카드 서재에 추가하면 여기에 표시됩니다.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
            <select style={{ ...S.select, width: '100%' }} value={activeBatchId} onChange={(e) => setBatchId(e.target.value)}>
              {extractionBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {formatBatchDate(batch.extractedAt)} · {batch.source} · {batch.count}장
                </option>
              ))}
            </select>
            <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.55 }}>
              현재 분류: {summarizeLabels(activeBatch?.topCategories, '대분류 없음')} / {summarizeLabels(activeBatch?.subjects, '과목 없음')} / {summarizeLabels(activeBatch?.parts, '단원 없음')} · 대상 {activeBatchCards.length}개
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: '#818cf8', fontSize: 12, width: 45, fontWeight: 700 }}>변경 후</span>
              <DataListInput id="batch-top-dl" value={batchNewTop} onChange={e => setBatchNewTop(e.target.value)} placeholder="새 대분류 (공백 시 유지)" style={S.input} options={safeTopCategories} />
              <DataListInput id="batch-sub-dl" value={batchNewSub} onChange={e => setBatchNewSub(e.target.value)} placeholder="새 과목명 (공백 시 유지)" style={S.input} options={subjects} />
              <DataListInput id="batch-part-dl" value={batchNewPart} onChange={e => setBatchNewPart(e.target.value)} placeholder="새 단원명 (공백 시 유지)" style={S.input} options={batchPartOptions} />
            </div>
            <button
              style={{ ...S.btn(false), background: canBatchRename ? 'rgba(14,165,233,0.16)' : '#1e293b', color: canBatchRename ? '#7dd3fc' : '#64748b', border: canBatchRename ? '1px solid rgba(14,165,233,0.45)' : '1px solid #334155' }}
              disabled={!canBatchRename}
              onClick={handleBatchRename}
            >
              최근 추출 카드 {activeBatchCards.length}개 일괄 변경
            </button>
          </div>
        )}
      </div>

      {/* 📁 폴더(과목/단원) 이름 일괄 변경 섹션 */}
      <div style={S.section}>
        <div style={S.title}>📁 폴더(대분류/과목/단원) 구조 일괄 변경</div>
        <div style={S.sub}>기존 카드들의 대분류, 과목명, 단원명을 일괄 수정하여 다른 카테고리로 통합/이동시킵니다.</div>
        <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: 12, width: 45 }}>대상 폴더</span>
            <select style={{ ...S.select, flex: 1 }} value={editOldTop} onChange={(e) => { setEditOldTop(e.target.value); setEditOldSub('전체'); setEditOldPart('전체'); }}>
              <option>전체</option>{safeTopCategories.map(s => <option key={s}>{s}</option>)}
            </select>
            <select style={{ ...S.select, flex: 1 }} value={editOldSub} onChange={(e) => { setEditOldSub(e.target.value); setEditOldPart('전체'); }}>
              <option>전체</option>{editSubjectOptions.map(s => <option key={s}>{s}</option>)}
            </select>
            <select style={{ ...S.select, flex: 1 }} value={editOldPart} onChange={(e) => setEditOldPart(e.target.value)}>
              <option>전체</option>{editOptions.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: '#818cf8', fontSize: 12, width: 45, fontWeight: 700 }}>변경 후</span>
            <input style={S.input} placeholder="새 대분류 (공백 시 유지)" value={editNewTop} onChange={e => setEditNewTop(e.target.value)} />
            <input style={S.input} placeholder="새 과목명 (공백 시 유지)" value={editNewSub} onChange={e => setEditNewSub(e.target.value)} />
            <input style={S.input} placeholder="새 단원명 (공백 시 유지)" value={editNewPart} onChange={e => setEditNewPart(e.target.value)} />
          </div>
          <button 
            style={{ ...S.btn(false), background: targetEditCount > 0 ? 'rgba(99,102,241,0.2)' : '#1e293b', color: targetEditCount > 0 ? '#818cf8' : '#64748b', border: targetEditCount > 0 ? '1px solid #6366f1' : '1px solid #334155' }} 
            disabled={targetEditCount === 0 || (!editNewTop.trim() && !editNewSub.trim() && !editNewPart.trim())} 
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
          <select style={{ ...S.select, flex: 1 }} value={listTop} onChange={(e) => { setListTop(e.target.value); setListSub('전체'); setListPart('전체'); }}>
            <option value="전체">전체 대분류</option>{safeTopCategories.map(s => <option key={s}>{s}</option>)}
          </select>
          <select style={{ ...S.select, flex: 1 }} value={listSub} onChange={(e) => { setListSub(e.target.value); setListPart('전체'); }}>
            <option value="전체">전체 과목</option>{listSubjectOptions.map(s => <option key={s}>{s}</option>)}
          </select>
          <select style={{ ...S.select, flex: 1 }} value={listPart} onChange={(e) => setListPart(e.target.value)}>
            <option value="전체">전체 단원</option>{listPartOptions.map(p => <option key={p}>{p}</option>)}
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
              const kind = getCardKind(c);
              const isAnswer = isAnswerCard(c);

              if (isEditing) {
                const editKind = getCardKind(editCardDraft || c);
                return (
                  <div key={c.id} style={{ border: '1px solid #6366f1', background: '#0f172a', padding: 12, borderRadius: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <DataListInput id={`edit-top-dl-${c.id}`} value={getTopCategory(editCardDraft)} onChange={e => setEditCardDraft({...editCardDraft, topCategory: e.target.value})} placeholder="대분류" style={S.input} options={safeTopCategories} />
                      <DataListInput id={`edit-sub-dl-${c.id}`} value={editCardDraft.subject} onChange={e => setEditCardDraft({...editCardDraft, subject: e.target.value})} placeholder="과목" style={S.input} options={subjects} />
                      <DataListInput id={`edit-part-dl-${c.id}`} value={editCardDraft.part} onChange={e => setEditCardDraft({...editCardDraft, part: e.target.value})} placeholder="단원" style={S.input} options={draftPartOptions} />
                    </div>
                    <input style={{...S.input, width: '100%', marginBottom: 6}} value={editCardDraft.sourceNumber || ''} onChange={e => setEditCardDraft({...editCardDraft, sourceNumber: e.target.value})} placeholder="원문 번호" />
                    <input style={{...S.input, width: '100%', marginBottom: 6}} value={editCardDraft.question} onChange={e => setEditCardDraft({...editCardDraft, question: e.target.value})} placeholder="질문" />
                    {isAnswer ? (
                      <textarea style={{...S.input, width: '100%', marginBottom: 6, minHeight: 50, resize: 'vertical'}} value={editCardDraft.answer} onChange={e => setEditCardDraft({...editCardDraft, answer: e.target.value})} placeholder={answerLabel(editKind)} />
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
                      <span style={{ fontSize: 10, background: 'rgba(14,165,233,0.12)', color: '#7dd3fc', border: '1px solid rgba(14,165,233,0.28)', padding: '1px 6px', borderRadius: 4 }}>{getTopCategory(c)}</span>
                      <span style={{ fontSize: 10, background: '#1e293b', color: '#94a3b8', padding: '1px 6px', borderRadius: 4 }}>{c.subject}</span>
                      <span style={{ fontSize: 10, background: '#1e293b', color: '#64748b', padding: '1px 6px', borderRadius: 4 }}>{c.part}</span>
                      {c.sourceNumber && <span style={{ fontSize: 10, background: 'rgba(14,165,233,0.12)', color: '#7dd3fc', border: '1px solid rgba(14,165,233,0.28)', padding: '1px 6px', borderRadius: 4 }}>원문 {c.sourceNumber}</span>}
                      <span style={{ fontSize: 10, background: isAnswer ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)', color: isAnswer ? '#f59e0b' : '#818cf8', padding: '1px 6px', borderRadius: 4 }}>{cardKindLabel(kind)}</span>
                    </div>
                    <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.question}</div>
                    <div style={{ color: isAnswer ? '#94a3b8' : '#818cf8', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isAnswer ? c.answer : `${c.mnemonic} - ${c.detail}`}
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

      {/* X4 리더용 파일 생성 섹션 */}
      <div style={S.section}>
        <div style={S.title}>Xteink X4용 내보내기</div>
        <div style={S.sub}>대분류, 과목, 단원을 골라 X4 기본 리더에서 읽기 좋은 UTF-8 TXT 또는 작은 화면용 EPUB 파일을 만듭니다.</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <select style={{ ...S.select, flex: 1, minWidth: 120 }} value={x4Top}
            onChange={(e) => { setX4Top(e.target.value); setX4Sub('전체'); setX4Part('전체') }}>
            <option>전체</option>{safeTopCategories.map(s => <option key={s}>{s}</option>)}
          </select>
          <select style={{ ...S.select, flex: 1, minWidth: 120 }} value={x4Sub}
            onChange={(e) => { setX4Sub(e.target.value); setX4Part('전체') }}>
            <option>전체</option>{x4SubjectOptions.map(s => <option key={s}>{s}</option>)}
          </select>
          <select style={{ ...S.select, flex: 1, minWidth: 120 }} value={x4Part}
            onChange={(e) => setX4Part(e.target.value)}>
            <option>전체</option>{x4PartOptions.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ ...S.sub, marginBottom: 12 }}>
          선택 범위: {x4Label} · {x4Cards.length}개 카드
        </div>
        <div style={S.grid}>
          <button style={S.btn(false)} onClick={() => exportX4TXT(x4Cards, x4Label)}>TXT 만들기</button>
          <button style={S.btn(false)} onClick={() => exportX4EPUB(x4Cards, x4Label)}>EPUB 만들기</button>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.title}>데이터 백업 및 백업 파일 로드</div>
        <div style={S.sub}>Firestore에 저장된 내 카드 데이터를 백업하거나 가져옵니다. 공개 배포본에는 기본 카드가 포함되지 않습니다.</div>
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
            <select style={{ ...S.select, flex: 1 }} value={delTop} onChange={(e) => { setDelTop(e.target.value); setDelSub('전체'); setDelPart('전체'); }}>
              <option>전체</option>{safeTopCategories.map(s => <option key={s}>{s}</option>)}
            </select>
            <select style={{ ...S.select, flex: 1 }} value={delSub} onChange={(e) => { setDelSub(e.target.value); setDelPart('전체'); }}>
              <option>전체</option>{delSubjectOptions.map(s => <option key={s}>{s}</option>)}
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
