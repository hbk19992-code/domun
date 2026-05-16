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
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
    }} onClick={onClose}>
      <div style={{
        background: '#0f172a', border: '1px solid #334155', borderRadius: 16, padding: 24, width: 320,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          {isSubject ? '과목명 일괄 변경' : '단원명 일괄 변경'}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 12 }}>
          기존: <span style={{ color: '#f87171' }}>{oldName}</span>
        </div>
        <input 
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box', background: '#0a0f1e',
            border: '1px solid #6366f1', borderRadius: 8, padding: '10px 12px',
            color: '#e2e8f0', fontSize: 14, outline: 'none', marginBottom: 16
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

export default function ManagePage({ cards }) {
  const { allCards, userCards, builtinCards, deleteCard, updateCard, deleteBy, countBy, exportJSON, importJSON, deduplicateSelf, duplicateCount } = cards
  const fileRef = useRef(null)
  const [toast, setToast] = useState(null)
  const [shareUrl, setShareUrl] = useState('')
  const [shareScope, setShareScope] = useState('all') // all | user
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)
  
  // 삭제용 상태
  const [delSubject, setDelSubject] = useState('전체')
  const [delPart, setDelPart] = useState('전체')
  const [confirmDel, setConfirmDel] = useState(false)

  // 이름 일괄 변경용 상태
  const [renameTarget, setRenameTarget] = useState(null) // { type: 'subject' | 'part', oldName: string, subjectContext?: string }
  const [renameSubjFilter, setRenameSubjFilter] = useState('전체')

  const userSubjects = useMemo(() => [...new Set(userCards.map((c) => c.subject))], [userCards])
  const userParts = useMemo(() => delSubject === '전체'
    ? [...new Set(userCards.map((c) => c.part))]
    : [...new Set(userCards.filter((c) => c.subject === delSubject).map((c) => c.part))], [userCards, delSubject])
  const delCount = countBy({ subject: delSubject, part: delPart })

  const renamePartsList = useMemo(() => renameSubjFilter === '전체'
    ? [...new Set(userCards.map((c) => c.part))]
    : [...new Set(userCards.filter((c) => c.subject === renameSubjFilter).map((c) => c.part))], [userCards, renameSubjFilter])

  const showToast = (msg, color = '#6366f1') => {
    setToast({ msg, color })
    setTimeout(() => setToast(null), 2500)
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

  const handleBulkDelete = () => {
    if (!confirmDel) { setConfirmDel(true); return }
    const removed = deleteBy({ subject: delSubject, part: delPart })
    showToast(removed > 0 ? `✓ ${removed}개 삭제됨` : '삭제할 카드가 없습니다', removed > 0 ? '#ef4444' : '#6366f1')
    setConfirmDel(false)
    setDelSubject('전체'); setDelPart('전체')
  }

  const handleRename = (newName) => {
    if (!renameTarget || !newName.trim()) return
    const { type, oldName, subjectContext } = renameTarget
    let updatedCount = 0

    userCards.forEach(card => {
      let shouldUpdate = false;
      const updates = {}
      
      if (type === 'subject' && card.subject === oldName) {
        updates.subject = newName.trim()
        shouldUpdate = true
      } else if (type === 'part' && card.part === oldName) {
        // 과목 필터가 적용되어 있다면 해당 과목의 단원만 수정
        if (subjectContext && subjectContext !== '전체') {
            if (card.subject === subjectContext) {
                 updates.part = newName.trim()
                 shouldUpdate = true
            }
        } else {
             // 과목 무관하게 단원명 수정
             updates.part = newName.trim()
             shouldUpdate = true
        }
      }

      if (shouldUpdate) {
        updateCard(card.id, updates)
        updatedCount++
      }
    })

    setRenameTarget(null)
    showToast(`✓ ${updatedCount}개 항목 이름 변경됨`, '#22c55e')
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

  return (
    <div>
      <h2 style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 800, marginBottom: 4 }}>카드 관리</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>카드를 내보내거나 가져오고, 링크로 공유할 수 있습니다</p>

      {renameTarget && (
        <RenameModal 
          oldName={renameTarget.oldName} 
          isSubject={renameTarget.type === 'subject'}
          onSave={handleRename} 
          onClose={() => setRenameTarget(null)} 
        />
      )}

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
        <div style={{ color: '#334155', fontSize: 11, marginTop: 8 }}>
          링크를 받은 사람이 열면 카드 가져오기 화면이 자동으로 뜹니다
        </div>
      </div>

      <div style={S.row}>
        <button style={S.btn('primary', allCards.length === 0)} onClick={exportJSON} disabled={allCards.length === 0}>↓ JSON 내보내기</button>
        <button style={S.btn('default')} onClick={() => fileRef.current?.click()}>↑ JSON 가져오기</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
      </div>

      {userCards.length > 0 && (
        <div style={{
          background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12, padding: 18, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 16
        }}>
          <div>
              <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>✏ 과목·단원명 일괄 변경</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(15,23,42,0.5)', padding: '6px 12px', borderRadius: 8 }}>
                    <span style={{color: '#94a3b8', fontSize: 12}}>과목</span>
                    {userSubjects.map(s => (
                        <button key={s} onClick={() => setRenameTarget({ type: 'subject', oldName: s })} 
                            style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                            {s} ✎
                        </button>
                    ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(15,23,42,0.5)', padding: '6px 12px', borderRadius: 8 }}>
                      <span style={{color: '#94a3b8', fontSize: 12}}>단원 필터:</span>
                      <select value={renameSubjFilter} onChange={(e) => setRenameSubjFilter(e.target.value)}
                          style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', padding: '4px 8px', fontSize: 12, outline: 'none' }}>
                          <option value="전체">전체 과목</option>
                          {userSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <div style={{ width: 1, height: 16, background: '#334155', margin: '0 4px' }} />
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {renamePartsList.map(p => (
                              <button key={p} onClick={() => setRenameTarget({ type: 'part', oldName: p, subjectContext: renameSubjFilter })} 
                                  style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                                  {p} ✎
                              </button>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
          
          <hr style={{ border: 0, borderTop: '1px solid rgba(255,255,255,0.05)', margin: '0 4px' }} />

          <div>
            <div style={{ color: '#ef4444', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>🗑 과목·단원별 일괄 삭제</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={delSubject}
                onChange={(e) => { setDelSubject(e.target.value); setDelPart('전체'); setConfirmDel(false) }}
                style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}
              >
                <option value="전체">과목 전체</option>
                {userSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={delPart}
                onChange={(e) => { setDelPart(e.target.value); setConfirmDel(false) }}
                style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}
              >
                <option value="전체">단원 전체</option>
                {userParts.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button
                style={S.btn('danger', delCount === 0)}
                disabled={delCount === 0}
                onClick={handleBulkDelete}
              >
                {confirmDel ? `정말 삭제? (${delCount}개)` : `삭제 (${delCount}개)`}
              </button>
              {confirmDel && (
                <button
                  style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer' }}
                  onClick={() => setConfirmDel(false)}
                >취소</button>
              )}
            </div>
            <div style={{ color: '#334155', fontSize: 11, marginTop: 8 }}>
              {delSubject === '전체' && delPart === '전체'
                ? '과목·단원을 선택하면 해당 범위만 삭제됩니다'
                : `삭제 대상: ${delSubject === '전체' ? '전 과목' : delSubject}${delPart !== '전체' ? ` · ${delPart}` : ''}`}
            </div>
          </div>
        </div>
      )}

      <div style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>내 카드 ({userCards.length}개)</div>
      {userCards.length === 0
        ? <div style={S.empty}>추가한 카드가 없습니다</div>
        : (
          <div style={S.list}>
            {userCards.map((card) => (
              <EditableCard
                key={card.id}
                card={card}
                onSave={(updated) => { updateCard(card.id, updated); showToast('✓ 수정됨', '#22c55e') }}
                onDelete={() => deleteCard(card.id)}
                subjects={cards?.subjects || []}
                getParts={cards?.parts}
              />
            ))}
          </div>
        )
      }

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
      <div style={{ ...S.item, flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
          <span style={{ background: '#1e293b', color: '#94a3b8', fontSize: 10, borderRadius: 4, padding: '2px 7px' }}>{card.subject}</span>
          <span style={{ background: '#1e293b', color: '#64748b', fontSize: 10, borderRadius: 4, padding: '2px 7px' }}>{card.part}</span>
        </div>
        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{card.question}</div>
        {isQA
          ? <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.5 }}>{card.answer}</div>
          : <div style={{ color: '#818cf8', fontSize: 13, fontWeight: 700 }}>{card.mnemonic}</div>}
      </div>
      <button
        style={{ ...S.del, color: '#475569', fontSize: 14 }}
        onClick={() => { setDraft(card); setEditing(true) }}
        title="편집"
      >✎</button>
      <button style={S.del} onClick={onDelete} title="삭제">✕</button>
    </div>
  )
}
