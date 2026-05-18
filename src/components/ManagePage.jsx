import { useRef, useState, useMemo, useEffect } from 'react'
import { encodeCards, buildShareUrl } from '../utils/share'

const S = {
  row: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  btn: (variant, disabled) => ({
    background: disabled ? '#0f172a' : variant === 'primary' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
      : variant === 'danger' ? 'rgba(239,68,68,0.1)' : variant === 'warn' ? 'rgba(245,158,11,0.1)'
      : variant === 'share' ? 'rgba(99,102,241,0.15)' : '#1e293b',
    color: disabled ? '#334155' : variant === 'primary' ? '#fff' : variant === 'danger' ? '#f87171'
      : variant === 'warn' ? '#fbbf24' : variant === 'share' ? '#818cf8' : '#94a3b8',
    border: variant === 'danger' ? '1px solid rgba(239,68,68,0.3)'
      : variant === 'warn' ? '1px solid rgba(245,158,11,0.3)'
      : variant === 'share' ? '1px solid #6366f1' : 'none',
    borderRadius: 10, padding: '10px 18px', fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600,
  }),
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: {
    background: 'rgba(15,23,42,0.7)', border: '1px solid #1e293b',
    borderRadius: 12, padding: '14px 16px',
    display: 'flex', alignItems: 'flex-start', gap: 12,
  },
  del: {
    background: 'none', border: 'none', color: '#334155',
    cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0, padding: 4,
  },
  toast: {
    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 600,
    zIndex: 9999, pointerEvents: 'none', whiteSpace: 'nowrap', color: '#fff',
  },
  empty: { color: '#475569', textAlign: 'center', padding: '50px 0', fontSize: 14, background: 'rgba(15,23,42,0.4)', borderRadius: 16, border: '1px dashed #334155' },
  stat: {
    background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
    borderRadius: 12, padding: '16px 20px', marginBottom: 24,
    display: 'flex', gap: 24, flexWrap: 'wrap',
  },
  statItem: { textAlign: 'center' },
  statNum: (color) => ({ color: color || '#818cf8', fontSize: 24, fontWeight: 800 }),
  statLabel: { color: '#475569', fontSize: 11, marginTop: 2 },
  dupBanner: {
    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
    borderRadius: 10, padding: '12px 16px', marginBottom: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  shareBox: {
    background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
    borderRadius: 12, padding: 20, marginBottom: 20,
  },
  linkRow: { display: 'flex', gap: 8, marginTop: 12 },
  linkInput: {
    flex: 1, minWidth: 0, background: '#0f172a', border: '1px solid #334155',
    borderRadius: 8, padding: '9px 12px', color: '#818cf8',
    fontSize: 12, fontFamily: 'monospace', outline: 'none',
  },
  copyBtn: (copied) => ({
    background: copied ? 'rgba(34,197,94,0.15)' : '#1e293b',
    border: `1px solid ${copied ? '#22c55e' : '#334155'}`,
    color: copied ? '#22c55e' : '#94a3b8',
    borderRadius: 8, padding: '9px 16px', fontSize: 13,
    cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
  }),
  folderGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 12, marginBottom: 20,
  },
  folderCard: {
    background: 'linear-gradient(145deg, rgba(30,41,59,0.8), rgba(15,23,42,0.8))',
    borderRadius: 16, padding: '16px 14px',
    display: 'flex', flexDirection: 'column', minWidth: 0,
  },
  folderIcon: { fontSize: 34, marginBottom: 8, lineHeight: 1 },
  folderTitle: { color: '#f8fafc', fontSize: 14, fontWeight: 700, marginBottom: 4, wordBreak: 'keep-all', lineHeight: 1.3 },
  folderCount: { color: '#64748b', fontSize: 11, fontWeight: 500 },
  folderActions: {
    display: 'flex', gap: 5, marginTop: 14, paddingTop: 12,
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  fBtn: (kind) => ({
    flex: 1, minWidth: 0,
    background: kind === 'delete' ? 'rgba(239,68,68,0.1)' : kind === 'move' ? 'rgba(56,189,248,0.1)'
      : kind === 'order' ? 'rgba(148,163,184,0.12)' : 'rgba(99,102,241,0.1)',
    color: kind === 'delete' ? '#f87171' : kind === 'move' ? '#38bdf8'
      : kind === 'order' ? '#cbd5e1' : '#818cf8',
    border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  }),
  reBtn: (disabled, kind) => ({
    flex: 1,
    background: disabled ? 'rgba(15,23,42,0.6)' : kind === 'done' ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.15)',
    color: disabled ? '#334155' : kind === 'done' ? '#22c55e' : '#818cf8',
    border: `1px solid ${disabled ? '#1e293b' : kind === 'done' ? '#22c55e' : '#6366f1'}`,
    borderRadius: 8, padding: '7px 0', fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
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

function CreateFolderModal({ type, onSave, onClose }) {
  const [name, setName] = useState('')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: 20 }} onClick={onClose}>
      <div style={{ background: '#0f172a', border: '1px solid #38bdf8', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
          {type === 'subject' ? '📁 새 과목 만들기' : '📂 새 단원 만들기'}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
          새로 만들 폴더의 이름을 입력해주세요.
        </div>
        <input autoFocus style={{ width: '100%', boxSizing: 'border-box', background: '#0a0f1e', border: '1px solid #6366f1', borderRadius: 8, padding: '12px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', marginBottom: 20 }}
          value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 입력" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...S.btn('primary'), flex: 1 }} onClick={() => onSave(name)} disabled={!name.trim()}>생성하기</button>
          <button style={{ ...S.btn('default'), flex: 1 }} onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}

function MoveModal({ target, onSave, onClose, subjects, getParts }) {
  const isCard = target.type === 'card'
  const isMulti = target.type === 'multi'
  const initialSubj = isCard ? target.card.subject : (isMulti ? '' : target.subject)
  const initialPart = isCard ? target.card.part : (isMulti ? '' : target.part)
  const [newSubj, setNewSubj] = useState(initialSubj || '')
  const [newPart, setNewPart] = useState(initialPart || '')
  const safeSubjects = Array.isArray(subjects) ? subjects : []
  let safeParts = []
  try { if (typeof getParts === 'function') { const r = getParts(newSubj); if (Array.isArray(r)) safeParts = r } } catch(e) {}
  const inputStyle = { width: '100%', boxSizing: 'border-box', background: '#0a0f1e', border: '1px solid #38bdf8', borderRadius: 8, padding: '12px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none' }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 }} onClick={onClose}>
      <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 800, marginBottom: 12 }}>🚀 위치 이동</div>
        <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
          {isMulti
            ? <span>선택한 <strong style={{ color: '#38bdf8' }}>{target.count}장</strong>을 어디로 이동할까요?</span>
            : isCard ? '이 카드를 어디로 이동할까요?'
            : <span><strong style={{ color: '#38bdf8' }}>{initialPart}</strong> 단원 전체를 어디로 이동할까요?</span>}<br />
          (목록에 없는 새 이름을 입력하면 폴더가 생성됩니다.)
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#64748b', fontSize: 12, marginBottom: 6 }}>이동할 과목</div>
          <DataListInput id="move-modal-subj" value={newSubj} onChange={(e) => setNewSubj(e.target.value)} placeholder="과목명 입력" style={inputStyle} options={safeSubjects} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ color: '#64748b', fontSize: 12, marginBottom: 6 }}>이동할 단원</div>
          <DataListInput id="move-modal-part" value={newPart} onChange={(e) => setNewPart(e.target.value)} placeholder="단원명 입력" style={inputStyle} options={safeParts} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...S.btn('primary'), flex: 1, background: 'linear-gradient(135deg,#0284c7,#38bdf8)' }} onClick={() => onSave(newSubj.trim(), newPart.trim())}>이동하기</button>
          <button style={{ ...S.btn('default'), flex: 1 }} onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}

function RenameModal({ oldName, onSave, onClose, isSubject }) {
  const [newName, setNewName] = useState(oldName)
  const displayOld = (!oldName || oldName === '') ? '미분류' : oldName
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 }} onClick={onClose}>
      <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          {isSubject ? '과목명 수정' : '단원명 수정'}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 12 }}>
          기존: <span style={{ color: '#f87171' }}>{displayOld}</span>
        </div>
        <input autoFocus style={{ width: '100%', boxSizing: 'border-box', background: '#0a0f1e', border: '1px solid #6366f1', borderRadius: 8, padding: '12px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', marginBottom: 20 }}
          value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="새로운 이름 입력" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...S.btn('primary'), flex: 1 }} onClick={() => onSave(newName)} disabled={!newName.trim() || newName === oldName}>변경하기</button>
          <button style={{ ...S.btn('default'), flex: 1 }} onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}

function DeleteModal({ target, count, onConfirm, onClose }) {
  const isSubj = target.part === null
  const name = isSubj ? target.subject : target.part
  const displayName = (!name || name === '') ? '미분류' : name
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 }} onClick={onClose}>
      <div style={{ background: '#0f172a', border: '1px solid #ef4444', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
          {isSubj ? '과목 삭제' : '단원 삭제'}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
          <strong style={{ color: '#fca5a5' }}>{displayName}</strong> {isSubj ? '과목' : '단원'}에 포함된<br />
          <strong style={{ color: '#fff' }}>카드 {count}장</strong>이 모두 삭제됩니다.<br />
          삭제한 카드는 복구할 수 없습니다.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onConfirm} style={{ ...S.btn('danger'), flex: 1 }}>삭제하기</button>
          <button onClick={onClose} style={{ ...S.btn('default'), flex: 1 }}>취소</button>
        </div>
      </div>
    </div>
  )
}

export default function ManagePage({ cards }) {
  const { allCards, userCards, builtinCards, deleteCard, updateCard, reorderCard, exportJSON, importJSON, deduplicateSelf, duplicateCount } = cards
  const fileRef = useRef(null)
  const [toast, setToast] = useState(null)
  const [shareUrl, setShareUrl] = useState('')
  const [shareScope, setShareScope] = useState('all')
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)

  const [navPath, setNavPath] = useState([])
  const currentSubject = navPath[0] ?? null
  const currentPart = navPath[1] ?? null

  const [customSubjOrder, setCustomSubjOrder] = useState(() => { try { return JSON.parse(localStorage.getItem('domun_subj_order') || '[]') } catch { return [] } })
  const [customPartOrder, setCustomPartOrder] = useState(() => { try { return JSON.parse(localStorage.getItem('domun_part_order') || '{}') } catch { return {} } })

  // 순서 이동 모드: { type:'subject'|'part'|'card', id }
  const [reorderTarget, setReorderTarget] = useState(null)

  // 다중 선택 (selectMode: null | 'subject' | 'part' | 'card')
  const [selectMode, setSelectMode] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [confirmMultiDel, setConfirmMultiDel] = useState(false)

  // 폴더 이동 시 선택 모드 해제
  useEffect(() => {
    setSelectMode(null); setSelectedIds(new Set()); setConfirmMultiDel(false)
    setReorderTarget(null)
  }, [currentSubject, currentPart])

  const [renameTarget, setRenameTarget] = useState(null)
  const [delTarget, setDelTarget] = useState(null)
  const [moveTarget, setMoveTarget] = useState(null)
  const [createModalTarget, setCreateModalTarget] = useState(null)

  const showToast = (msg, color = '#6366f1') => {
    setToast({ msg, color })
    setTimeout(() => setToast(null), 2500)
  }
  const safeStr = (s) => (s || '').trim()
  const displayStr = (s) => (!s || s.trim() === '') ? '미분류' : s

  // ── 폴더 목록 정렬 ──
  const derivedSubjects = userCards.map((c) => safeStr(c.subject))
  const allSubjects = [...new Set([...customSubjOrder, ...derivedSubjects])].filter(Boolean)
  const sortedSubjects = useMemo(() => {
    const arr = [...allSubjects]
    return arr.sort((a, b) => {
      const ia = customSubjOrder.indexOf(a), ib = customSubjOrder.indexOf(b)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.localeCompare(b)
    })
  }, [allSubjects, customSubjOrder])

  const currentSubjectCards = useMemo(() => userCards.filter((c) => safeStr(c.subject) === safeStr(currentSubject)), [userCards, currentSubject])
  const derivedParts = currentSubjectCards.map((c) => safeStr(c.part))
  const savedParts = customPartOrder[currentSubject] || []
  const allParts = [...new Set([...savedParts, ...derivedParts])].filter(Boolean)
  const sortedParts = useMemo(() => {
    const arr = [...allParts]
    return arr.sort((a, b) => {
      const ia = savedParts.indexOf(a), ib = savedParts.indexOf(b)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.localeCompare(b)
    })
  }, [allParts, savedParts])

  const looseCardsInSubject = useMemo(() => currentSubjectCards.filter((c) => safeStr(c.part) === ''), [currentSubjectCards])
  const partCards = useMemo(() => currentSubjectCards.filter((c) => safeStr(c.part) === safeStr(currentPart)), [currentSubjectCards, currentPart])

  // ── 순서 이동 함수 ──
  const moveSubject = (subj, dir) => {
    const arr = [...sortedSubjects]
    const i = arr.indexOf(subj), j = i + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setCustomSubjOrder(arr)
    localStorage.setItem('domun_subj_order', JSON.stringify(arr))
  }
  const movePart = (part, dir) => {
    const arr = [...sortedParts]
    const i = arr.indexOf(part), j = i + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    const next = { ...customPartOrder, [currentSubject]: arr }
    setCustomPartOrder(next)
    localStorage.setItem('domun_part_order', JSON.stringify(next))
  }
  const moveCardInList = (card, dir, list) => {
    const i = list.findIndex((c) => c.id === card.id), j = i + dir
    if (j < 0 || j >= list.length) return
    reorderCard(card.id, list[j].id)
  }

  // ── 다중 선택 ──
  const toggleSelect = (id) => setSelectedIds((prev) => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const exitSelectMode = () => { setSelectMode(null); setSelectedIds(new Set()); setConfirmMultiDel(false) }
  const startSelect = (kind) => { setSelectMode(kind); setSelectedIds(new Set()); setConfirmMultiDel(false) }
  // ids: 문자열(폴더명) 또는 카드 id 배열
  const selectAllOf = (ids) => {
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id))
    setSelectedIds(allSelected ? new Set() : new Set(ids))
  }

  // 카드 배열을 JSON 파일로 다운로드
  const downloadJSON = (cardList, filename) => {
    const blob = new Blob([JSON.stringify(cardList, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // 선택한 과목/단원/카드를 JSON으로 내보내기
  const handleMultiExport = () => {
    let list = []
    let label = '선택'
    if (selectMode === 'card') {
      list = userCards.filter((c) => selectedIds.has(c.id))
    } else if (selectMode === 'part') {
      list = userCards.filter((c) => safeStr(c.subject) === safeStr(currentSubject) && selectedIds.has(safeStr(c.part)))
      label = selectedIds.size === 1 ? [...selectedIds][0] : (currentSubject || '단원')
    } else if (selectMode === 'subject') {
      list = userCards.filter((c) => selectedIds.has(safeStr(c.subject)))
      label = selectedIds.size === 1 ? [...selectedIds][0] : '과목'
    }
    if (list.length === 0) { showToast('내보낼 카드가 없습니다', '#ef4444'); return }
    const safe = (label || 'export').replace(/[\\/:*?"<>|]/g, '_')
    downloadJSON(list, `domun_${safe}_${new Date().toISOString().slice(0, 10)}.json`)
    showToast(`✓ ${list.length}장 내보냄`, '#22c55e')
    exitSelectMode()
  }

  const handleMultiDelete = () => {
    if (!confirmMultiDel) { setConfirmMultiDel(true); return }
    const n = selectedIds.size
    if (selectMode === 'card') {
      selectedIds.forEach((id) => deleteCard(id))
    } else if (selectMode === 'part') {
      selectedIds.forEach((partName) => {
        userCards.filter((c) => safeStr(c.subject) === safeStr(currentSubject) && safeStr(c.part) === safeStr(partName))
          .forEach((c) => deleteCard(c.id))
      })
      setCustomPartOrder((prev) => {
        const arr = (prev[currentSubject] || []).filter((p) => !selectedIds.has(p))
        const next = { ...prev, [currentSubject]: arr }
        localStorage.setItem('domun_part_order', JSON.stringify(next))
        return next
      })
    } else if (selectMode === 'subject') {
      selectedIds.forEach((subjName) => {
        userCards.filter((c) => safeStr(c.subject) === safeStr(subjName)).forEach((c) => deleteCard(c.id))
      })
      setCustomSubjOrder((prev) => {
        const next = prev.filter((s) => !selectedIds.has(s))
        localStorage.setItem('domun_subj_order', JSON.stringify(next))
        return next
      })
    }
    showToast(`✓ ${n}개 삭제됨`, '#ef4444')
    exitSelectMode()
  }

  // ── 폴더 생성 ──
  const handleCreateFolder = (name) => {
    if (!name || !name.trim()) return
    const cleanName = name.trim()
    if (createModalTarget === 'subject') {
      setCustomSubjOrder((prev) => {
        const next = [...prev, cleanName]
        localStorage.setItem('domun_subj_order', JSON.stringify(next))
        return next
      })
      showToast(`✓ '${cleanName}' 과목 생성됨`, '#22c55e')
    } else if (createModalTarget === 'part') {
      setCustomPartOrder((prev) => {
        const arr = prev[currentSubject] || []
        const next = { ...prev, [currentSubject]: [...arr, cleanName] }
        localStorage.setItem('domun_part_order', JSON.stringify(next))
        return next
      })
      showToast(`✓ '${cleanName}' 단원 생성됨`, '#22c55e')
    }
    setCreateModalTarget(null)
  }

  // ── 기타 핸들러 ──
  const handleImport = async (e) => {
    const f = e.target.files[0]
    if (!f) return
    try {
      const { added, skipped } = await importJSON(f)
      showToast(skipped > 0 ? `✓ ${added}개 추가 (중복 ${skipped}개 제외)` : `✓ ${added}개 추가됨`)
    } catch (err) { showToast(`⚠ ${err.message}`, '#ef4444') }
    e.target.value = ''
  }
  const handleDedup = () => {
    const removed = deduplicateSelf()
    showToast(removed > 0 ? `✓ 중복 ${removed}개 제거 완료` : '중복 카드가 없습니다', removed > 0 ? '#22c55e' : '#6366f1')
  }
  const handleShare = async () => {
    const target = shareScope === 'user' ? userCards : allCards
    if (target.length === 0) return showToast('공유할 카드가 없습니다', '#ef4444')
    setSharing(true)
    try {
      const encoded = await encodeCards(target)
      const url = buildShareUrl(encoded)
      if (url.length > 15000) { showToast('카드가 너무 많습니다. "내 카드만"으로 시도해보세요.', '#f59e0b'); setSharing(false); return }
      setShareUrl(url)
    } catch { showToast('링크 생성 실패', '#ef4444') }
    setSharing(false)
  }
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { showToast('복사 실패 — 직접 선택해서 복사하세요') }
  }

  const handleRename = (newName) => {
    if (!renameTarget || !newName.trim()) return
    const { type, oldName, subjectContext } = renameTarget
    let updatedCount = 0
    userCards.forEach((card) => {
      let shouldUpdate = false
      const updates = {}
      if (type === 'subject' && safeStr(card.subject) === safeStr(oldName)) {
        updates.subject = newName.trim(); shouldUpdate = true
      } else if (type === 'part' && safeStr(card.part) === safeStr(oldName)) {
        if (subjectContext !== undefined) {
          if (safeStr(card.subject) === safeStr(subjectContext)) { updates.part = newName.trim(); shouldUpdate = true }
        } else { updates.part = newName.trim(); shouldUpdate = true }
      }
      if (shouldUpdate) { updateCard(card.id, updates); updatedCount++ }
    })
    if (type === 'subject') {
      setCustomSubjOrder((prev) => {
        const next = prev.map((s) => (s === oldName ? newName.trim() : s))
        localStorage.setItem('domun_subj_order', JSON.stringify(next))
        return next
      })
      if (navPath.length > 0 && safeStr(navPath[0]) === safeStr(oldName)) setNavPath([newName.trim(), navPath[1]].filter(Boolean))
    } else if (type === 'part') {
      setCustomPartOrder((prev) => {
        const arr = prev[subjectContext] || []
        const next = { ...prev, [subjectContext]: arr.map((p) => (p === oldName ? newName.trim() : p)) }
        localStorage.setItem('domun_part_order', JSON.stringify(next))
        return next
      })
      if (navPath.length > 1 && safeStr(navPath[1]) === safeStr(oldName)) setNavPath([navPath[0], newName.trim()])
    }
    setRenameTarget(null)
    showToast(`✓ ${updatedCount}개 항목 이름 변경됨`, '#22c55e')
  }

  const handleMoveAction = (newSubj, newPart) => {
    if (!moveTarget) return
    if (moveTarget.type === 'card') {
      updateCard(moveTarget.card.id, { subject: newSubj, part: newPart })
      showToast('✓ 카드 이동 완료', '#22c55e')
    } else if (moveTarget.type === 'multi') {
      const n = selectedIds.size
      selectedIds.forEach((id) => updateCard(id, { subject: newSubj, part: newPart }))
      showToast(`✓ ${n}장 이동 완료`, '#22c55e')
      exitSelectMode()
    } else if (moveTarget.type === 'multi-part') {
      const n = selectedIds.size
      let moved = 0
      selectedIds.forEach((partName) => {
        userCards.filter((c) => safeStr(c.subject) === safeStr(currentSubject) && safeStr(c.part) === safeStr(partName))
          .forEach((c) => { updateCard(c.id, { subject: newSubj }); moved++ })
      })
      showToast(`✓ 단원 ${n}개(카드 ${moved}장) 이동 완료`, '#22c55e')
      exitSelectMode()
    } else if (moveTarget.type === 'part') {
      let count = 0
      userCards.forEach((c) => {
        if (safeStr(c.subject) === safeStr(moveTarget.subject) && safeStr(c.part) === safeStr(moveTarget.part)) {
          updateCard(c.id, { subject: newSubj, part: newPart }); count++
        }
      })
      showToast(`✓ 단원 내 ${count}장 이동 완료`, '#22c55e')
      if (navPath.length === 2 && safeStr(navPath[0]) === safeStr(moveTarget.subject) && safeStr(navPath[1]) === safeStr(moveTarget.part))
        setNavPath([newSubj, newPart].filter(Boolean))
    }
    setMoveTarget(null)
  }

  const confirmDelete = () => {
    if (!delTarget) return
    const { subject, part } = delTarget
    if (part === null) {
      userCards.filter((c) => safeStr(c.subject) === safeStr(subject)).forEach((c) => deleteCard(c.id))
      setCustomSubjOrder((prev) => {
        const next = prev.filter((s) => s !== subject)
        localStorage.setItem('domun_subj_order', JSON.stringify(next))
        return next
      })
    } else {
      userCards.filter((c) => safeStr(c.subject) === safeStr(subject) && safeStr(c.part) === safeStr(part)).forEach((c) => deleteCard(c.id))
      setCustomPartOrder((prev) => {
        const arr = prev[subject] || []
        const next = { ...prev, [subject]: arr.filter((p) => p !== part) }
        localStorage.setItem('domun_part_order', JSON.stringify(next))
        return next
      })
    }
    showToast('✓ 폴더와 카드가 삭제되었습니다', '#ef4444')
    setDelTarget(null)
    if (part !== null && safeStr(navPath[1]) === safeStr(part)) setNavPath([currentSubject])
    else if (part === null && safeStr(navPath[0]) === safeStr(subject)) setNavPath([])
  }

  // ── 폴더 카드 렌더링 ──
  const renderFolder = (type, title, count, pos, total, handlers) => {
    const isReordering = reorderTarget?.type === type && reorderTarget?.id === title
    const isSelecting = selectMode === type
    const isSelected = selectedIds.has(title)

    // 다중 선택 모드
    if (isSelecting) {
      return (
        <div key={title} style={{
          ...S.folderCard, cursor: 'pointer',
          border: `1.5px solid ${isSelected ? '#6366f1' : '#334155'}`,
          background: isSelected ? 'rgba(99,102,241,0.12)' : S.folderCard.background,
        }} onClick={() => toggleSelect(title)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ ...S.folderIcon, opacity: count === 0 ? 0.4 : 1, marginBottom: 4 }}>{type === 'subject' ? '📁' : '📂'}</div>
            <div style={{
              width: 22, height: 22, borderRadius: 6, marginTop: 4,
              border: `2px solid ${isSelected ? '#6366f1' : '#334155'}`,
              background: isSelected ? '#6366f1' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isSelected && <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>✓</span>}
            </div>
          </div>
          <div style={S.folderTitle}>{displayStr(title)}</div>
          <div style={S.folderCount}>카드 {count}장</div>
        </div>
      )
    }

    return (
      <div key={title} style={{
        ...S.folderCard,
        border: isReordering ? '1.5px solid #818cf8' : '1px solid #334155',
      }}>
        <div onClick={() => !isReordering && handlers.open()} style={{ cursor: isReordering ? 'default' : 'pointer', flex: 1 }}>
          <div style={{ ...S.folderIcon, opacity: count === 0 ? 0.4 : 1 }}>{type === 'subject' ? '📁' : '📂'}</div>
          <div style={S.folderTitle}>{displayStr(title)}</div>
          <div style={S.folderCount}>카드 {count}장</div>
        </div>
        <div style={S.folderActions}>
          {isReordering ? (
            <>
              <button style={S.reBtn(pos === 0)} disabled={pos === 0} onClick={() => handlers.move(-1)}>▲</button>
              <button style={S.reBtn(pos === total - 1)} disabled={pos === total - 1} onClick={() => handlers.move(1)}>▼</button>
              <button style={S.reBtn(false, 'done')} onClick={() => setReorderTarget(null)}>✓</button>
            </>
          ) : (
            <>
              <button style={S.fBtn('order')} onClick={(e) => { e.stopPropagation(); setReorderTarget({ type, id: title }) }} title="순서 이동">⠿</button>
              <button style={S.fBtn('edit')} onClick={(e) => { e.stopPropagation(); handlers.rename() }} title="이름">✎</button>
              {type === 'part' && (
                <button style={S.fBtn('move')} onClick={(e) => { e.stopPropagation(); handlers.moveFolder() }} title="이동">🚀</button>
              )}
              <button style={S.fBtn('delete')} onClick={(e) => { e.stopPropagation(); handlers.del() }} title="삭제">🗑</button>
            </>
          )}
        </div>
      </div>
    )
  }

  const navCrumb = (isActive) => ({
    cursor: 'pointer', color: isActive ? '#e2e8f0' : '#64748b',
    fontWeight: isActive ? 800 : 600, fontSize: 15,
    display: 'flex', alignItems: 'center', gap: 6,
  })

  const renderCard = (card, list) => {
    const isReordering = reorderTarget?.type === 'card' && reorderTarget?.id === card.id
    const idx = list.findIndex((c) => c.id === card.id)
    return (
      <EditableCard
        key={card.id}
        card={card}
        onSave={(updated) => { updateCard(card.id, updated); showToast('✓ 수정됨', '#22c55e') }}
        onDelete={() => deleteCard(card.id)}
        onMove={() => setMoveTarget({ type: 'card', card })}
        subjects={cards?.subjects || []} getParts={cards?.parts}
        reordering={isReordering}
        onReorderStart={() => setReorderTarget({ type: 'card', id: card.id })}
        onReorderDone={() => setReorderTarget(null)}
        onMoveUp={() => moveCardInList(card, -1, list)}
        onMoveDown={() => moveCardInList(card, 1, list)}
        canUp={idx > 0}
        canDown={idx < list.length - 1}
        selectMode={selectMode === 'card'}
        selected={selectedIds.has(card.id)}
        onToggleSelect={() => toggleSelect(card.id)}
      />
    )
  }

  return (
    <div>
      <h2 style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 800, marginBottom: 4 }}>카드 관리</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>카드를 내보내거나 가져오고, 링크로 공유할 수 있습니다</p>

      {createModalTarget && <CreateFolderModal type={createModalTarget} onSave={handleCreateFolder} onClose={() => setCreateModalTarget(null)} />}
      {renameTarget && <RenameModal oldName={renameTarget.oldName} isSubject={renameTarget.type === 'subject'} onSave={handleRename} onClose={() => setRenameTarget(null)} />}
      {delTarget && (
        <DeleteModal target={delTarget}
          count={userCards.filter((c) => safeStr(c.subject) === safeStr(delTarget.subject) && (delTarget.part === null || safeStr(c.part) === safeStr(delTarget.part))).length}
          onConfirm={confirmDelete} onClose={() => setDelTarget(null)} />
      )}
      {moveTarget && <MoveModal target={moveTarget} onSave={handleMoveAction} onClose={() => setMoveTarget(null)} subjects={cards?.subjects || []} getParts={cards?.parts} />}

      {/* 통계 */}
      <div style={S.stat}>
        <div style={S.statItem}><div style={S.statNum()}>{allCards.length}</div><div style={S.statLabel}>전체 카드</div></div>
        <div style={S.statItem}><div style={S.statNum()}>{builtinCards.length}</div><div style={S.statLabel}>기본 카드</div></div>
        <div style={S.statItem}><div style={S.statNum()}>{userCards.length}</div><div style={S.statLabel}>내 카드</div></div>
        <div style={S.statItem}><div style={S.statNum('#f59e0b')}>{duplicateCount}</div><div style={S.statLabel}>중복</div></div>
      </div>

      {duplicateCount > 0 && (
        <div style={S.dupBanner}>
          <span style={{ color: '#fbbf24', fontSize: 13 }}>⚠ 중복 카드 {duplicateCount}개</span>
          <button style={S.btn('warn')} onClick={handleDedup}>중복 제거</button>
        </div>
      )}

      {/* 공유 링크 */}
      <div style={S.shareBox}>
        <div style={{ color: '#94a3b8', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>🔗 공유 링크 만들기</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={shareScope} onChange={(e) => { setShareScope(e.target.value); setShareUrl('') }}
            style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}>
            <option value="all">전체 카드 ({allCards.length}개)</option>
            <option value="user">내 카드만 ({userCards.length}개)</option>
          </select>
          <button style={S.btn('share', sharing || allCards.length === 0)} onClick={handleShare} disabled={sharing || allCards.length === 0}>
            {sharing ? '생성 중...' : '링크 생성'}
          </button>
        </div>
        {shareUrl && (
          <div style={S.linkRow}>
            <input style={S.linkInput} value={shareUrl} readOnly onClick={(e) => e.target.select()} />
            <button style={S.copyBtn(copied)} onClick={handleCopy}>{copied ? '✓ 복사됨' : '복사'}</button>
          </div>
        )}
      </div>

      {/* JSON */}
      <div style={S.row}>
        <button style={S.btn('primary', allCards.length === 0)} onClick={exportJSON} disabled={allCards.length === 0}>↓ JSON 내보내기</button>
        <button style={S.btn('default')} onClick={() => fileRef.current?.click()}>↑ JSON 가져오기</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
      </div>

      <hr style={{ border: 0, borderTop: '1px dashed #1e293b', margin: '32px 0 24px' }} />

      {/* 폴더 탐색기 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 800 }}>내 저장소</div>
          {navPath.length === 0 && <button onClick={() => setCreateModalTarget('subject')} style={{ ...S.btn('primary'), flexShrink: 0 }}>+ 새 과목 만들기</button>}
          {navPath.length === 1 && <button onClick={() => setCreateModalTarget('part')} style={{ ...S.btn('primary'), flexShrink: 0 }}>+ 새 단원 만들기</button>}
        </div>

        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 16, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', padding: '10px 14px', borderRadius: 10, lineHeight: 1.6 }}>
          💡 폴더·카드의 <b style={{ color: '#818cf8' }}>⠿ 버튼</b>을 누르면 ▲▼로 순서를 옮길 수 있습니다. 다른 폴더로 옮기려면 <b style={{ color: '#38bdf8' }}>🚀 이동</b>을 쓰세요.
        </div>

        {/* 경로 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap', background: 'rgba(15,23,42,0.6)', padding: '12px 18px', borderRadius: 12, border: '1px solid #1e293b' }}>
          <div onClick={() => { setNavPath([]); setReorderTarget(null) }} style={navCrumb(navPath.length === 0)}>
            <span style={{ fontSize: 18 }}>🏠</span> <span>전체 과목</span>
          </div>
          {navPath.length > 0 && (
            <>
              <div style={{ color: '#334155', fontWeight: 800 }}>›</div>
              <div onClick={() => { setNavPath([currentSubject]); setReorderTarget(null) }} style={navCrumb(navPath.length === 1)}>
                <span style={{ fontSize: 18 }}>📁</span> <span>{displayStr(currentSubject)}</span>
              </div>
            </>
          )}
          {navPath.length > 1 && (
            <>
              <div style={{ color: '#334155', fontWeight: 800 }}>›</div>
              <div style={navCrumb(true)}>
                <span style={{ fontSize: 18 }}>📂</span> <span>{displayStr(currentPart)}</span>
              </div>
            </>
          )}
        </div>

        {/* 루트: 과목 목록 */}
        {navPath.length === 0 && (
          sortedSubjects.length === 0
            ? <div style={S.empty}>저장소에 생성된 과목이 없습니다.</div>
            : <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <SelectToggle count={sortedSubjects.length} active={selectMode === 'subject'}
                    allSelected={sortedSubjects.length > 0 && sortedSubjects.every((s) => selectedIds.has(s))}
                    onToggle={() => selectMode === 'subject' ? exitSelectMode() : startSelect('subject')}
                    onSelectAll={() => selectAllOf(sortedSubjects)} />
                </div>
                <div style={S.folderGrid}>
                  {sortedSubjects.map((subj, i) => {
                    const count = userCards.filter((c) => safeStr(c.subject) === subj).length
                    return renderFolder('subject', subj, count, i, sortedSubjects.length, {
                      open: () => setNavPath([subj]),
                      rename: () => setRenameTarget({ type: 'subject', oldName: subj }),
                      del: () => setDelTarget({ subject: subj, part: null }),
                      move: (dir) => moveSubject(subj, dir),
                    })
                  })}
                </div>
              </div>
        )}

        {/* 과목: 단원 목록 + 미지정 카드 */}
        {navPath.length === 1 && (
          <div>
            {sortedParts.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <SelectToggle count={sortedParts.length} active={selectMode === 'part'}
                    allSelected={sortedParts.length > 0 && sortedParts.every((p) => selectedIds.has(p))}
                    onToggle={() => selectMode === 'part' ? exitSelectMode() : startSelect('part')}
                    onSelectAll={() => selectAllOf(sortedParts)} />
                </div>
                <div style={S.folderGrid}>
                  {sortedParts.map((part, i) => {
                    const count = currentSubjectCards.filter((c) => safeStr(c.part) === part).length
                    return renderFolder('part', part, count, i, sortedParts.length, {
                      open: () => setNavPath([currentSubject, part]),
                      rename: () => setRenameTarget({ type: 'part', oldName: part, subjectContext: currentSubject }),
                      del: () => setDelTarget({ subject: currentSubject, part }),
                      move: (dir) => movePart(part, dir),
                      moveFolder: () => setMoveTarget({ type: 'part', subject: currentSubject, part }),
                    })
                  })}
                </div>
              </div>
            )}
            {looseCardsInSubject.length > 0 && (
              <div style={{ marginTop: sortedParts.length > 0 ? 32 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>단원 미지정 카드 ({looseCardsInSubject.length}장)</div>
                  <SelectToggle count={looseCardsInSubject.length} active={selectMode === 'card'}
                    allSelected={looseCardsInSubject.length > 0 && looseCardsInSubject.every((c) => selectedIds.has(c.id))}
                    onToggle={() => selectMode === 'card' ? exitSelectMode() : startSelect('card')}
                    onSelectAll={() => selectAllOf(looseCardsInSubject.map((c) => c.id))} />
                </div>
                <div style={S.list}>{looseCardsInSubject.map((c) => renderCard(c, looseCardsInSubject))}</div>
              </div>
            )}
            {sortedParts.length === 0 && looseCardsInSubject.length === 0 && <div style={S.empty}>이 과목에는 데이터가 없습니다</div>}
          </div>
        )}

        {/* 단원: 카드 목록 */}
        {navPath.length === 2 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}>카드 목록 ({partCards.length}장)</div>
              <SelectToggle count={partCards.length} active={selectMode === 'card'}
                allSelected={partCards.length > 0 && partCards.every((c) => selectedIds.has(c.id))}
                onToggle={() => selectMode === 'card' ? exitSelectMode() : startSelect('card')}
                onSelectAll={() => selectAllOf(partCards.map((c) => c.id))} />
            </div>
            {partCards.length === 0 ? <div style={S.empty}>카드가 없습니다</div>
              : <div style={S.list}>{partCards.map((c) => renderCard(c, partCards))}</div>}
          </div>
        )}
      </div>

      {/* 다중 선택 액션 바 */}
      {selectMode && selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', border: '1px solid #334155', borderRadius: 14,
          padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 7,
          zIndex: 400, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxWidth: '94vw', flexWrap: 'wrap', justifyContent: 'center',
        }}>
          <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700, padding: '0 4px', whiteSpace: 'nowrap' }}>
            {selectedIds.size}개 선택
          </span>
          {selectMode !== 'subject' && (
            <button onClick={() => setMoveTarget(selectMode === 'part'
              ? { type: 'multi-part', count: selectedIds.size }
              : { type: 'multi', count: selectedIds.size })}
              style={{ background: 'linear-gradient(135deg,#0284c7,#38bdf8)', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              🚀 이동
            </button>
          )}
          <button onClick={handleMultiExport}
            style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 9, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            📤 내보내기
          </button>
          <button onClick={handleMultiDelete}
            style={{ background: confirmMultiDel ? '#ef4444' : 'rgba(239,68,68,0.15)', color: confirmMultiDel ? '#fff' : '#f87171', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 9, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {confirmMultiDel ? '정말 삭제?' : '🗑 삭제'}
          </button>
          <button onClick={exitSelectMode}
            style={{ background: 'none', color: '#64748b', border: 'none', fontSize: 13, cursor: 'pointer', padding: '0 4px' }}>
            취소
          </button>
        </div>
      )}

      {toast && <div style={{ ...S.toast, background: toast.color }}>{toast.msg}</div>}
    </div>
  )
}

function SelectToggle({ count, active, allSelected, onToggle, onSelectAll }) {
  if (count === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {active && (
        <button onClick={onSelectAll} style={{ background: 'none', border: '1px solid #334155', borderRadius: 8, padding: '5px 10px', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
          {allSelected ? '전체 해제' : '전체 선택'}
        </button>
      )}
      <button onClick={onToggle} style={{
        background: active ? 'rgba(99,102,241,0.15)' : 'none',
        border: `1px solid ${active ? '#6366f1' : '#334155'}`, borderRadius: 8,
        padding: '5px 10px', color: active ? '#818cf8' : '#94a3b8', fontSize: 12, cursor: 'pointer', fontWeight: 600,
      }}>
        {active ? '선택 종료' : '☑ 선택'}
      </button>
    </div>
  )
}

function EditableCard({ card, onSave, onDelete, onMove, subjects = [], getParts, reordering, onReorderStart, onReorderDone, onMoveUp, onMoveDown, canUp, canDown, selectMode, selected, onToggleSelect }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card)
  const isQA = !card.mnemonic && card.answer != null

  let safeParts = []
  try { if (typeof getParts === 'function') { const r = getParts(draft?.subject || ''); if (Array.isArray(r)) safeParts = r } } catch(e) {}
  const safeSubjects = Array.isArray(subjects) ? subjects : []

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', background: '#0a0f1e',
    border: '1px solid #334155', borderRadius: 6, padding: '6px 9px',
    color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none',
    marginBottom: 5, resize: 'vertical',
  }

  // 편집 모드
  if (editing) {
    return (
      <div style={{ ...S.item, flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <DataListInput id={`m-sub-${card.id}`} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="과목" style={inputStyle} options={safeSubjects} />
          <DataListInput id={`m-part-${card.id}`} value={draft.part} onChange={(e) => setDraft({ ...draft, part: e.target.value })} placeholder="단원" style={inputStyle} options={safeParts} />
        </div>
        <input style={inputStyle} value={draft.question || ''} onChange={(e) => setDraft({ ...draft, question: e.target.value })} placeholder="질문" />
        {isQA ? (
          <textarea style={{ ...inputStyle, minHeight: 60 }} value={draft.answer || ''} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} placeholder="답" />
        ) : (
          <>
            <input style={{ ...inputStyle, color: '#818cf8', fontWeight: 700 }} value={draft.mnemonic || ''} onChange={(e) => setDraft({ ...draft, mnemonic: e.target.value })} placeholder="두문자" />
            <textarea style={{ ...inputStyle, minHeight: 60, fontSize: 12 }} value={draft.detail || ''} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} placeholder="설명" />
          </>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button onClick={() => { onSave(draft); setEditing(false) }} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>저장</button>
          <button onClick={() => { setDraft(card); setEditing(false) }} style={{ background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>취소</button>
        </div>
      </div>
    )
  }

  // 순서 이동 모드
  if (reordering) {
    return (
      <div style={{ ...S.item, border: '1.5px solid #818cf8', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{card.question}</div>
          <div style={{ color: '#818cf8', fontSize: 12, fontWeight: 700, marginTop: 2 }}>{card.mnemonic || card.answer}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={S.reBtn(!canUp)} disabled={!canUp} onClick={onMoveUp}>▲</button>
          <button style={S.reBtn(!canDown)} disabled={!canDown} onClick={onMoveDown}>▼</button>
          <button style={S.reBtn(false, 'done')} onClick={onReorderDone}>✓</button>
        </div>
      </div>
    )
  }

  // 다중 선택 모드
  if (selectMode) {
    return (
      <div style={{ ...S.item, alignItems: 'center', cursor: 'pointer', background: selected ? 'rgba(99,102,241,0.12)' : 'rgba(15,23,42,0.7)', border: `1px solid ${selected ? '#6366f1' : '#1e293b'}` }}
        onClick={onToggleSelect}>
        <div style={{
          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
          border: `2px solid ${selected ? '#6366f1' : '#334155'}`,
          background: selected ? '#6366f1' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {selected && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
            <span style={{ background: '#1e293b', color: '#94a3b8', fontSize: 10, borderRadius: 4, padding: '2px 7px' }}>{card.subject || '미분류'}</span>
            <span style={{ background: '#1e293b', color: '#64748b', fontSize: 10, borderRadius: 4, padding: '2px 7px' }}>{card.part || '미분류'}</span>
          </div>
          <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{card.question}</div>
          {isQA
            ? <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.5 }}>{card.answer}</div>
            : <div style={{ color: '#818cf8', fontSize: 13, fontWeight: 700 }}>{card.mnemonic}</div>}
        </div>
      </div>
    )
  }

  // 일반 모드
  return (
    <div style={S.item}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
          <span style={{ background: '#1e293b', color: '#94a3b8', fontSize: 10, borderRadius: 4, padding: '2px 7px' }}>{card.subject || '미분류'}</span>
          <span style={{ background: '#1e293b', color: '#64748b', fontSize: 10, borderRadius: 4, padding: '2px 7px' }}>{card.part || '미분류'}</span>
        </div>
        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{card.question}</div>
        {isQA
          ? <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.5 }}>{card.answer}</div>
          : <div style={{ color: '#818cf8', fontSize: 13, fontWeight: 700 }}>{card.mnemonic}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button style={{ ...S.del, color: '#cbd5e1', fontSize: 15 }} onClick={onReorderStart} title="순서 이동">⠿</button>
        <button style={{ ...S.del, color: '#475569', fontSize: 14 }} onClick={() => { setDraft(card); setEditing(true) }} title="편집">✎</button>
        <button style={{ ...S.del, color: '#38bdf8', fontSize: 14 }} onClick={onMove} title="이동">🚀</button>
        <button style={S.del} onClick={onDelete} title="삭제">✕</button>
      </div>
    </div>
  )
}
