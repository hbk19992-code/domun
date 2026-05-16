import { useRef, useState, useMemo } from 'react'
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
    borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 600,
    zIndex: 9999, pointerEvents: 'none', whiteSpace: 'nowrap', color: '#fff',
  },
  empty: { color: '#475569', textAlign: 'center', padding: '60px 0', fontSize: 14, background: 'rgba(15,23,42,0.4)', borderRadius: 16, border: '1px dashed #334155' },
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
  shareBox: {
    background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
    borderRadius: 12, padding: 20, marginBottom: 20,
  },
  linkRow: { display: 'flex', gap: 8, marginTop: 12 },
  linkInput: {
    flex: 1, background: '#0f172a', border: '1px solid #334155',
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 12,
    marginBottom: 20
  },
  folderCard: {
    background: 'linear-gradient(145deg, rgba(30,41,59,0.8), rgba(15,23,42,0.8))',
    borderRadius: 16,
    padding: '16px 14px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    transition: 'all 0.2s ease',
  },
  folderIcon: { fontSize: 36, marginBottom: 10, lineHeight: 1 },
  folderTitle: { color: '#f8fafc', fontSize: 14, fontWeight: 700, marginBottom: 4, overflowWrap: 'break-word', lineHeight: 1.3 },
  folderCount: { color: '#64748b', fontSize: 11, fontWeight: 500 },
  folderActions: {
    display: 'flex', gap: 6, marginTop: 14, paddingTop: 14,
    borderTop: '1px solid rgba(255,255,255,0.05)'
  },
  actionBtn: (type) => ({
    flex: 1, 
    background: type === 'delete' ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)',
    color: type === 'delete' ? '#f87171' : '#818cf8', 
    border: 'none', borderRadius: 8,
    padding: '7px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer'
  })
}

function DataListInput({ id, value, onChange, placeholder, style, options }) {
  const safeOptions = Array.isArray(options) ? options : [];
  return (
    <div style={{ flex: 1, width: '100%', minWidth: 0 }}>
      <input
        style={style}
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        list={id}
      />
      <datalist id={id}>
        {safeOptions.map((opt, i) => (
          <option key={i} value={opt != null ? String(opt) : ''} />
        ))}
      </datalist>
    </div>
  )
}

function RenameModal({ oldName, type, onSave, onClose, isSubject }) {
  const [newName, setNewName] = useState(oldName)
  const displayOld = (!oldName || oldName === '') ? '미분류' : oldName;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20
    }} onClick={onClose}>
      <div style={{
        background: '#0f172a', border: '1px solid #334155', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          {isSubject ? '과목명 수정' : '단원명 수정'}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 12 }}>
          기존: <span style={{ color: '#f87171' }}>{displayOld}</span>
        </div>
        <input 
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box', background: '#0a0f1e',
            border: '1px solid #6366f1', borderRadius: 8, padding: '12px 14px',
            color: '#e2e8f0', fontSize: 14, outline: 'none', marginBottom: 20
          }}
          value={newName} onChange={e => setNewName(e.target.value)}
          placeholder="새로운 이름 입력"
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...S.btn('primary'), flex: 1 }} onClick={() => onSave(newName)} disabled={!newName.trim() || newName === oldName}>
            변경하기
          </button>
          <button style={{ ...S.btn('default'), flex: 1 }} onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}

function DeleteModal({ target, count, onConfirm, onClose }) {
  const isSubj = target.part === null;
  const name = isSubj ? target.subject : target.part;
  const displayName = (!name || name === '') ? '미분류' : name;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20
    }} onClick={onClose}>
      <div style={{
        background: '#0f172a', border: '1px solid #ef4444', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340,
        boxShadow: '0 10px 25px -5px rgba(239, 68, 68, 0.2)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
          {isSubj ? '과목 삭제' : '단원 삭제'}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
          <strong style={{color: '#fca5a5'}}>{displayName}</strong> {isSubj ? '과목' : '단원'}에 포함된 <br/>
          <strong style={{color: '#fff'}}>카드 {count}장</strong>이 모두 삭제됩니다. <br/>
          삭제한 카드는 복구할 수 없습니다. 계속하시겠습니까?
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
  const { allCards, userCards, builtinCards, deleteCard, updateCard, moveCard, exportJSON, importJSON, deduplicateSelf, duplicateCount } = cards
  const fileRef = useRef(null)
  const [toast, setToast] = useState(null)
  const [shareUrl, setShareUrl] = useState('')
  const [shareScope, setShareScope] = useState('all') 
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)
  
  // 탐색기 상태 (Breadcrumbs)
  const [navPath, setNavPath] = useState([]) 
  const currentSubject = navPath[0] ?? null
  const currentPart = navPath[1] ?? null

  // 폴더 정렬/저장 상태
  const [customSubjOrder, setCustomSubjOrder] = useState(() => JSON.parse(localStorage.getItem('domun_subj_order') || '[]'))
  const [customPartOrder, setCustomPartOrder] = useState(() => JSON.parse(localStorage.getItem('domun_part_order') || '{}'))

  // Drag & Drop State
  const [dragItem, setDragItem] = useState(null)
  const [dragOverTarget, setDragOverTarget] = useState(null)

  // 모달 상태
  const [renameTarget, setRenameTarget] = useState(null) 
  const [delTarget, setDelTarget] = useState(null)

  const showToast = (msg, color = '#6366f1') => {
    setToast({ msg, color })
    setTimeout(() => setToast(null), 2500)
  }

  const safeStr = (s) => (s || '').trim()
  const displayStr = (s) => (!s || s.trim() === '') ? '미분류' : s

  // 📂 데이터 정제 및 폴더 렌더링 로직
  const derivedSubjects = userCards.map(c => safeStr(c.subject));
  const allSubjects = [...new Set([...customSubjOrder, ...derivedSubjects])].filter(Boolean);
  const sortedSubjects = useMemo(() => {
      const arr = [...allSubjects];
      return arr.sort((a, b) => {
          const ia = customSubjOrder.indexOf(a);
          const ib = customSubjOrder.indexOf(b);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
          return a.localeCompare(b);
      });
  }, [allSubjects, customSubjOrder]);

  const currentSubjectCards = useMemo(() => userCards.filter(c => safeStr(c.subject) === safeStr(currentSubject)), [userCards, currentSubject])
  
  const derivedParts = currentSubjectCards.map(c => safeStr(c.part));
  const savedParts = customPartOrder[currentSubject] || [];
  const allParts = [...new Set([...savedParts, ...derivedParts])].filter(Boolean);
  const sortedParts = useMemo(() => {
      const arr = [...allParts];
      return arr.sort((a, b) => {
          const ia = savedParts.indexOf(a);
          const ib = savedParts.indexOf(b);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
          return a.localeCompare(b);
      });
  }, [allParts, savedParts]);

  const looseCardsInSubject = useMemo(() => currentSubjectCards.filter(c => safeStr(c.part) === ''), [currentSubjectCards])
  const partCards = useMemo(() => currentSubjectCards.filter(c => safeStr(c.part) === safeStr(currentPart)), [currentSubjectCards, currentPart])

  // --- 동작 핸들러 ---
  const handleCreateSubject = () => {
    const name = prompt("새 과목(상위 폴더) 이름을 입력하세요:\n(입력 후 드래그 앤 드롭으로 카드를 넣을 수 있습니다)");
    if (name && name.trim()) {
        setCustomSubjOrder(prev => {
            const next = [...prev, name.trim()];
            localStorage.setItem('domun_subj_order', JSON.stringify(next));
            return next;
        });
    }
  }

  const handleCreatePart = () => {
    const name = prompt(`새 단원(하위 폴더) 이름을 입력하세요:\n[${currentSubject} 과목 내 생성]`);
    if (name && name.trim()) {
        setCustomPartOrder(prev => {
            const arr = prev[currentSubject] || [];
            const next = { ...prev, [currentSubject]: [...arr, name.trim()] };
            localStorage.setItem('domun_part_order', JSON.stringify(next));
            return next;
        });
    }
  }

  // --- 🚀 Drag and Drop 핸들러 ---
  const handleDragStart = (e, type, id, payload) => {
      e.stopPropagation();
      setDragItem({ type, id, payload });
      e.dataTransfer.effectAllowed = 'move';
      // 투명한 더미 이미지 (깔끔한 UI 위함)
      const img = new Image(); img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      e.dataTransfer.setDragImage(img, 0, 0);
  }

  const handleDragOver = (e, type, id) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      if (dragOverTarget?.id !== id) setDragOverTarget({ type, id });
  }

  const handleDragLeave = (e) => {
      e.preventDefault();
      setDragOverTarget(null);
  }

  const handleDrop = (e, targetType, targetId, targetPayload) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverTarget(null);
      if (!dragItem) return;

      const { type: dType, id: dId, payload: dPayload } = dragItem;
      if (dId === targetId && dType === targetType) return; // 제자리 드롭 무시

      // 1. 카드 정렬 (카드 -> 카드)
      if (dType === 'card' && targetType === 'card') {
          if (moveCard) moveCard(dId, targetId);
      }
      // 2. 카드 이동 (카드 -> 단원 폴더)
      else if (dType === 'card' && targetType === 'part') {
          updateCard(dId, { part: targetId, subject: currentSubject });
          showToast(`✓ 카드가 '${targetId}' 단원으로 쏙 들어갔습니다.`, '#22c55e');
      }
      // 3. 카드 이동 (카드 -> 과목 폴더)
      else if (dType === 'card' && targetType === 'subject') {
          updateCard(dId, { subject: targetId, part: '' });
          showToast(`✓ 카드가 '${targetId}' 과목으로 쏙 들어갔습니다.`, '#22c55e');
      }
      // 4. 단원 정렬 (단원 -> 단원)
      else if (dType === 'part' && targetType === 'part') {
          setCustomPartOrder(prev => {
              const arr = [...sortedParts];
              const dIdx = arr.indexOf(dId);
              const tIdx = arr.indexOf(targetId);
              arr.splice(dIdx, 1);
              arr.splice(tIdx, 0, dId);
              const next = { ...prev, [currentSubject]: arr };
              localStorage.setItem('domun_part_order', JSON.stringify(next));
              return next;
          });
      }
      // 5. 과목 정렬 (과목 -> 과목)
      else if (dType === 'subject' && targetType === 'subject') {
          setCustomSubjOrder(prev => {
              const arr = [...sortedSubjects];
              const dIdx = arr.indexOf(dId);
              const tIdx = arr.indexOf(targetId);
              arr.splice(dIdx, 1);
              arr.splice(tIdx, 0, dId);
              localStorage.setItem('domun_subj_order', JSON.stringify(arr));
              return arr;
          });
      }
      // 6. 단원 전체 이동 (단원 -> 과목 폴더)
      else if (dType === 'part' && targetType === 'subject') {
          if (currentSubject === targetId) return;
          let count = 0;
          userCards.forEach(c => {
              if (safeStr(c.subject) === safeStr(currentSubject) && safeStr(c.part) === safeStr(dId)) {
                  updateCard(c.id, { subject: targetId });
                  count++;
              }
          });
          // 이동 후 기존 과목의 custom order에서 단원 제거, 새 과목에 추가
          setCustomPartOrder(prev => {
              const oldArr = (prev[currentSubject] || []).filter(p => p !== dId);
              const newArr = [...(prev[targetId] || []), dId];
              const next = { ...prev, [currentSubject]: oldArr, [targetId]: newArr };
              localStorage.setItem('domun_part_order', JSON.stringify(next));
              return next;
          });
          showToast(`✓ '${dId}' 단원이 '${targetId}' 과목으로 통째로 이사했습니다.`, '#22c55e');
      }

      setDragItem(null);
  }

  const handleDragEnd = () => {
      setDragItem(null);
      setDragOverTarget(null);
  }


  // --- 기타 기능 핸들러 ---
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

  const handleShare = async () => {
    const target = shareScope === 'user' ? userCards : allCards
    if (target.length === 0) return showToast('공유할 카드가 없습니다', '#ef4444')
    setSharing(true)
    try {
      const encoded = await encodeCards(target)
      const url = buildShareUrl(encoded)
      if (url.length > 15000) {
        showToast(`카드가 너무 많습니다. "내 카드만"으로 시도해보세요.`, '#f59e0b')
        setSharing(false)
        return
      }
      setShareUrl(url)
    } catch {
      showToast('링크 생성 실패', '#ef4444')
    }
    setSharing(false)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('복사 실패 — 직접 선택해서 복사하세요')
    }
  }

  const handleRename = (newName) => {
    if (!renameTarget || !newName.trim()) return
    const { type, oldName, subjectContext } = renameTarget
    let updatedCount = 0

    userCards.forEach(card => {
      let shouldUpdate = false;
      const updates = {}
      
      if (type === 'subject' && safeStr(card.subject) === safeStr(oldName)) {
        updates.subject = newName.trim()
        shouldUpdate = true
      } else if (type === 'part' && safeStr(card.part) === safeStr(oldName)) {
        if (subjectContext !== undefined) {
            if (safeStr(card.subject) === safeStr(subjectContext)) {
                 updates.part = newName.trim()
                 shouldUpdate = true
            }
        } else {
             updates.part = newName.trim()
             shouldUpdate = true
        }
      }

      if (shouldUpdate) {
        updateCard(card.id, updates)
        updatedCount++
      }
    })

    // Custom Order 배열에서도 이름 변경
    if (type === 'subject') {
        setCustomSubjOrder(prev => prev.map(s => s === oldName ? newName.trim() : s));
        if (navPath.length > 0 && safeStr(navPath[0]) === safeStr(oldName)) {
           setNavPath([newName.trim(), navPath[1]].filter(Boolean))
        }
    } else if (type === 'part') {
        setCustomPartOrder(prev => {
            const arr = prev[subjectContext] || [];
            return { ...prev, [subjectContext]: arr.map(p => p === oldName ? newName.trim() : p) };
        });
        if (navPath.length > 1 && safeStr(navPath[1]) === safeStr(oldName)) {
           setNavPath([navPath[0], newName.trim()])
        }
    }

    setRenameTarget(null)
    showToast(`✓ ${updatedCount}개 항목 이름 변경됨`, '#22c55e')
  }

  const confirmDelete = () => {
    if (!delTarget) return;
    const { subject, part } = delTarget;
    
    if (part === null) {
        const targetCards = userCards.filter(c => safeStr(c.subject) === safeStr(subject));
        targetCards.forEach(c => deleteCard(c.id));
        setCustomSubjOrder(prev => {
            const next = prev.filter(s => s !== subject);
            localStorage.setItem('domun_subj_order', JSON.stringify(next));
            return next;
        });
    } else {
        const targetCards = userCards.filter(c => safeStr(c.subject) === safeStr(subject) && safeStr(c.part) === safeStr(part));
        targetCards.forEach(c => deleteCard(c.id));
        setCustomPartOrder(prev => {
            const arr = prev[subject] || [];
            const nextArr = arr.filter(p => p !== part);
            const next = { ...prev, [subject]: nextArr };
            localStorage.setItem('domun_part_order', JSON.stringify(next));
            return next;
        });
    }
    
    showToast(`✓ 폴더와 카드가 깔끔하게 삭제되었습니다.`, '#ef4444');
    setDelTarget(null);

    if (part !== null && safeStr(navPath[1]) === safeStr(part)) {
      setNavPath([currentSubject]);
    } else if (part === null && safeStr(navPath[0]) === safeStr(subject)) {
      setNavPath([]);
    }
  }

  // 📂 렌더링 헬퍼
  const renderFolder = (type, title, count, onOpen, onRename, onDelete) => {
      const isDragOver = dragOverTarget?.id === title && dragOverTarget?.type === type;
      const isDragged = dragItem?.id === title && dragItem?.type === type;

      return (
        <div
            key={title}
            draggable
            onDragStart={(e) => handleDragStart(e, type, title, title)}
            onDragOver={(e) => handleDragOver(e, type, title)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, type, title, title)}
            onDragEnd={handleDragEnd}
            style={{
                ...S.folderCard,
                opacity: isDragged ? 0.4 : 1,
                border: isDragOver ? '2px dashed #38bdf8' : '1px solid #334155',
                transform: isDragOver ? 'scale(1.03)' : 'scale(1)',
                cursor: 'grab'
            }}
        >
          <div onClick={onOpen} style={{ cursor: 'pointer', flex: 1, pointerEvents: isDragged ? 'none' : 'auto' }}>
            <div style={{...S.folderIcon, opacity: count===0 ? 0.4 : 1}}>{type === 'subject' ? '📁' : '📂'}</div>
            <div style={S.folderTitle}>{displayStr(title)}</div>
            <div style={S.folderCount}>카드 {count}장</div>
          </div>
          <div style={S.folderActions}>
            <button onClick={(e) => { e.stopPropagation(); onRename(); }} style={S.actionBtn('edit')}>✎ 이름</button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={S.actionBtn('delete')}>🗑 삭제</button>
          </div>
        </div>
      )
  }

  const navCrumbStyle = (isActive) => ({
    cursor: 'pointer',
    color: isActive ? '#e2e8f0' : '#64748b',
    fontWeight: isActive ? 800 : 600,
    fontSize: 15,
    display: 'flex', alignItems: 'center', gap: 6,
    transition: 'color 0.2s',
  })

  // 📝 개별 카드 렌더링 래퍼 (드래그 앤 드롭 지원)
  const renderCardWrapper = (card) => {
    const isDragOver = dragOverTarget?.id === card.id && dragOverTarget?.type === 'card';
    const isDragged = dragItem?.id === card.id && dragItem?.type === 'card';
    
    return (
        <div
            key={card.id}
            draggable
            onDragStart={(e) => handleDragStart(e, 'card', card.id, card)}
            onDragOver={(e) => handleDragOver(e, 'card', card.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, 'card', card.id, card)}
            onDragEnd={handleDragEnd}
            style={{
                opacity: isDragged ? 0.3 : 1,
                boxShadow: isDragOver ? '0 0 0 2px #38bdf8' : 'none',
                borderRadius: 12,
                transition: 'all 0.2s ease',
                cursor: 'grab'
            }}
        >
            <EditableCard
              card={card}
              onSave={(updated) => { updateCard(card.id, updated); showToast('✓ 수정됨', '#22c55e') }}
              onDelete={() => deleteCard(card.id)}
              subjects={cards?.subjects || []} getParts={cards?.parts}
            />
        </div>
    )
  }

  return (
    <div>
      <h2 style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 800, marginBottom: 4 }}>카드 관리</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>카드를 내보내거나 가져오고, 링크로 공유할 수 있습니다</p>

      {/* 모달 렌더링 */}
      {renameTarget && (
        <RenameModal 
          oldName={renameTarget.oldName} 
          isSubject={renameTarget.type === 'subject'}
          onSave={handleRename} 
          onClose={() => setRenameTarget(null)} 
        />
      )}
      {delTarget && (
        <DeleteModal 
          target={delTarget}
          count={userCards.filter(c => safeStr(c.subject) === safeStr(delTarget.subject) && (delTarget.part === null || safeStr(c.part) === safeStr(delTarget.part))).length}
          onConfirm={confirmDelete}
          onClose={() => setDelTarget(null)}
        />
      )}

      {/* 통계 및 유틸리티 영역 */}
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

      <div style={S.shareBox}>
        <div style={{ color: '#94a3b8', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>🔗 공유 링크 만들기</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={shareScope}
            onChange={(e) => { setShareScope(e.target.value); setShareUrl('') }}
            style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}
          >
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
            <button style={S.copyBtn(copied)} onClick={handleCopy}>
              {copied ? '✓ 복사됨' : '복사'}
            </button>
          </div>
        )}
      </div>

      <div style={S.row}>
        <button style={S.btn('primary', allCards.length === 0)} onClick={exportJSON} disabled={allCards.length === 0}>↓ JSON 내보내기</button>
        <button style={S.btn('default')} onClick={() => fileRef.current?.click()}>↑ JSON 가져오기</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
      </div>

      <hr style={{ border: 0, borderTop: '1px dashed #1e293b', margin: '32px 0 24px' }} />

      {/* 📁 폴더 탐색기 UI + Drag and Drop */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 800 }}>내 저장소</div>
            {navPath.length === 0 && <button onClick={handleCreateSubject} style={S.btn('primary')}>+ 새 과목 만들기</button>}
            {navPath.length === 1 && <button onClick={handleCreatePart} style={S.btn('primary')}>+ 새 단원 만들기</button>}
        </div>

        {/* 안내 문구 */}
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 16, background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.2)', padding: '10px 14px', borderRadius: 10 }}>
            💡 <b>Drag & Drop:</b> 폴더나 카드를 길게 꾹 눌러서 끌어다 놓으세요! 순서 정렬과 폴더 이동이 모두 가능합니다.
        </div>

        {/* 상단 경로 (Breadcrumbs) */}
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap',
          background: 'rgba(15,23,42,0.6)', padding: '12px 18px', borderRadius: 12, border: '1px solid #1e293b' 
        }}>
          <div onClick={() => setNavPath([])} style={navCrumbStyle(navPath.length === 0)}>
            <span style={{fontSize:18, marginBottom: 2}}>🏠</span> <span style={{paddingTop: 1}}>전체 과목</span>
          </div>

          {navPath.length > 0 && (
            <>
              <div style={{ color: '#334155', fontWeight: 800 }}>›</div>
              <div onClick={() => setNavPath([currentSubject])} style={navCrumbStyle(navPath.length === 1)}>
                <span style={{fontSize:18, marginBottom: 2}}>📁</span> <span style={{paddingTop: 1}}>{displayStr(currentSubject)}</span>
              </div>
            </>
          )}

          {navPath.length > 1 && (
            <>
              <div style={{ color: '#334155', fontWeight: 800 }}>›</div>
              <div style={navCrumbStyle(true)}>
                <span style={{fontSize:18, marginBottom: 2}}>📂</span> <span style={{paddingTop: 1}}>{displayStr(currentPart)}</span>
              </div>
            </>
          )}
        </div>

        {/* 루트 레벨 (전체 과목 목록) */}
        {navPath.length === 0 && (
          sortedSubjects.length === 0 ? <div style={S.empty}>저장소에 생성된 과목이 없습니다.</div> :
          <div style={S.folderGrid}>
            {sortedSubjects.map(subj => {
              const count = userCards.filter(c => safeStr(c.subject) === subj).length;
              return renderFolder('subject', subj, count,
                () => setNavPath([subj]),
                () => setRenameTarget({ type: 'subject', oldName: subj }),
                () => setDelTarget({ subject: subj, part: null })
              )
            })}
          </div>
        )}

        {/* 과목 레벨 (단원 목록 및 소속 카드) */}
        {navPath.length === 1 && (
          <div>
            {sortedParts.length > 0 && (
              <div style={S.folderGrid}>
                {sortedParts.map(part => {
                  const count = currentSubjectCards.filter(c => safeStr(c.part) === part).length;
                  return renderFolder('part', part, count,
                    () => setNavPath([currentSubject, part]),
                    () => setRenameTarget({ type: 'part', oldName: part, subjectContext: currentSubject }),
                    () => setDelTarget({ subject: currentSubject, part: part })
                  )
                })}
              </div>
            )}
            
            {/* 단원이 없는 카드들 (과목 직속) */}
            {looseCardsInSubject.length > 0 && (
              <div style={{ marginTop: sortedParts.length > 0 ? 32 : 0 }}>
                <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12, fontWeight: 600 }}>단원 미지정 카드 ({looseCardsInSubject.length}장)</div>
                <div style={S.list}>
                  {looseCardsInSubject.map(renderCardWrapper)}
                </div>
              </div>
            )}
            
            {sortedParts.length === 0 && looseCardsInSubject.length === 0 && (
              <div style={S.empty}>이 과목에는 데이터가 없습니다</div>
            )}
          </div>
        )}

        {/* 단원 레벨 (카드 목록) */}
        {navPath.length === 2 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}>카드 목록 ({partCards.length}장)</div>
            </div>
            {partCards.length === 0 ? <div style={S.empty}>카드가 없습니다</div> : 
              <div style={S.list}>
                {partCards.map(renderCardWrapper)}
              </div>
            }
          </div>
        )}

      </div>

      {toast && <div style={{ ...S.toast, background: toast.color }}>{toast.msg}</div>}
    </div>
  )
}

function EditableCard({ card, onSave, onDelete, subjects = [], getParts }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card)
  const isQA = !card.mnemonic && card.answer != null

  let safeParts = []
  try {
    if (typeof getParts === 'function') {
      const partsResult = getParts(draft?.subject || '')
      if (Array.isArray(partsResult)) safeParts = partsResult
    }
  } catch(e) { console.warn(e) }

  const safeSubjects = Array.isArray(subjects) ? subjects : []

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: '#0a0f1e', border: '1px solid #334155',
    borderRadius: 6, padding: '6px 9px', color: '#e2e8f0',
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
    marginBottom: 5, resize: 'vertical',
  }

  if (editing) {
    return (
      <div style={{ ...S.item, flexDirection: 'column', alignItems: 'stretch', gap: 0, cursor: 'default' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 6 }}>
          <DataListInput
            id={`manage-sub-${card.id || Math.random().toString(36)}`}
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            placeholder="과목" style={inputStyle} options={safeSubjects}
          />
          <DataListInput
            id={`manage-part-${card.id || Math.random().toString(36)}`}
            value={draft.part}
            onChange={(e) => setDraft({ ...draft, part: e.target.value })}
            placeholder="단원" style={inputStyle} options={safeParts}
          />
        </div>
        <input style={inputStyle} value={draft.question || ''}
          onChange={(e) => setDraft({ ...draft, question: e.target.value })} placeholder="질문" />
        {isQA ? (
          <textarea style={{ ...inputStyle, minHeight: 60 }} value={draft.answer || ''}
            onChange={(e) => setDraft({ ...draft, answer: e.target.value })} placeholder="답" />
        ) : (
          <>
            <input style={{ ...inputStyle, color: '#818cf8', fontWeight: 700 }} value={draft.mnemonic || ''}
              onChange={(e) => setDraft({ ...draft, mnemonic: e.target.value })} placeholder="두문자" />
            <textarea style={{ ...inputStyle, minHeight: 60, fontSize: 12 }} value={draft.detail || ''}
              onChange={(e) => setDraft({ ...draft, detail: e.target.value })} placeholder="설명" />
          </>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button
            onClick={() => { onSave(draft); setEditing(false) }}
            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
          >저장</button>
          <button
            onClick={() => { setDraft(card); setEditing(false) }}
            style={{ background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}
          >취소</button>
        </div>
      </div>
    )
  }

  return (
    <div style={S.item}>
      <div style={{ display: 'flex', alignItems: 'center', justify-content: 'center', cursor: 'grab', marginRight: 4, color: '#475569' }}>
          ⠿
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
          <span style={{ background: '#1e293b', color: '#94a3b8', fontSize: 10, borderRadius: 4, padding: '2px 7px' }}>{card.subject || '미분류'}</span>
          <span style={{ background: '#1e293b', color: '#64748b', fontSize: 10, borderRadius: 4, padding: '2px 7px' }}>{card.part || '미분류'}</span>
        </div>
        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginBottom: 2, overflowWrap: 'break-word' }}>{card.question}</div>
        {isQA
          ? <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.5, overflowWrap: 'break-word' }}>{card.answer}</div>
          : <div style={{ color: '#818cf8', fontSize: 13, fontWeight: 700 }}>{card.mnemonic}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button style={{ ...S.del, color: '#475569', fontSize: 14 }} onClick={(e) => { e.stopPropagation(); setDraft(card); setEditing(true) }} title="편집">✎</button>
        <button style={S.del} onClick={(e) => { e.stopPropagation(); onDelete() }} title="삭제">✕</button>
      </div>
    </div>
  )
}
