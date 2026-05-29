import { useState, useMemo } from 'react'
import { answerLabel, answerPlaceholder, cardKindLabel, getCardKind, isAnswerCard } from '../utils/cardType'
import { DEFAULT_TOP_CATEGORY, GLOBAL_ORDER_KEY, getTopCategory, matchesTopCategory, normalizeClassificationOrder, partOrderKey, rebuildClassificationOrder, subjectOrderKey, sortLabelsByOrder } from '../utils/classification'
import { ThemePickerCard } from './ThemePicker'

const S = {
  section: { background: 'var(--theme-panelSoft, rgba(15,23,42,0.6))', border: '1px solid var(--theme-border, #1e293b)', borderRadius: 16, padding: 20, marginBottom: 0 },
  wideSection: { background: 'var(--theme-panelSoft, rgba(15,23,42,0.6))', border: '1px solid var(--theme-border, #1e293b)', borderRadius: 16, padding: 20, marginBottom: 0, gridColumn: '1 / -1' },
  title: { color: 'var(--theme-text, #e2e8f0)', fontSize: 15, fontWeight: 700, marginBottom: 4 },
  sub: { color: 'var(--theme-textDim, #64748b)', fontSize: 12, marginBottom: 16, lineHeight: 1.5 },
  authCard: {
    background: 'var(--theme-accentSoft, rgba(99,102,241,0.15))',
    border: '1px solid var(--theme-accentStrong, #6366f1)', borderRadius: 16, padding: 20, marginBottom: 20,
    display: 'flex', flexDirection: 'column', gap: 14
  },
  authFlex: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  googleBtn: {
    background: '#ffffff', color: '#0f172a', border: 'none', borderRadius: 10,
    padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.2s'
  },
  logoutBtn: {
    background: 'var(--theme-dangerSoft, rgba(239,68,68,0.14))', color: 'var(--theme-danger, #ef4444)', border: '1px solid var(--theme-dangerSoft, rgba(239,68,68,0.14))',
    borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
  },
  desktopGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
    gap: 16,
    alignItems: 'start',
  },
  fullRow: { gridColumn: '1 / -1' },
  orderGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 10 },
  orderPanel: { background: 'var(--theme-input, #0a0f1e)', border: '1px solid var(--theme-border, #1e293b)', borderRadius: 12, padding: 12, minWidth: 0 },
  orderListBody: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto', paddingRight: 4 },
  orderItem: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--theme-elevated, #0f172a)', border: '1px solid var(--theme-border, #1e293b)', borderRadius: 10, padding: '7px 8px', minHeight: 44 },
  orderLabel: {
    color: 'var(--theme-text, #e2e8f0)',
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.35,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    wordBreak: 'keep-all',
  },
  orderMoveBtn: (disabled) => ({
    width: 34,
    height: 34,
    minWidth: 34,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--theme-button, #1e293b)',
    border: '1px solid var(--theme-borderStrong, #334155)',
    borderRadius: 10,
    color: disabled ? 'var(--theme-borderStrong, #334155)' : 'var(--theme-textMuted, #94a3b8)',
    fontSize: 18,
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  manageTabs: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    background: 'var(--theme-panelSoft, rgba(15,23,42,0.55))',
    border: '1px solid var(--theme-border, #1e293b)',
    borderRadius: 14,
    padding: 8,
    marginBottom: 16,
  },
  manageTab: (active) => ({
    border: active ? '1px solid var(--theme-accentStrong, #6366f1)' : '1px solid transparent',
    background: active ? 'var(--theme-accentSoft, rgba(99,102,241,0.15))' : 'transparent',
    color: active ? 'var(--theme-accentText, #e0e7ff)' : 'var(--theme-textMuted, #94a3b8)',
    borderRadius: 10,
    padding: '9px 12px',
    fontSize: 13,
    fontWeight: active ? 800 : 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 },
  btn: (danger) => ({
    background: danger ? 'var(--theme-dangerSoft, rgba(239,68,68,0.14))' : 'var(--theme-button, #1e293b)',
    border: `1px solid ${danger ? 'var(--theme-dangerSoft, rgba(239,68,68,0.14))' : 'var(--theme-borderStrong, #334155)'}`,
    borderRadius: 10, color: danger ? 'var(--theme-danger, #ef4444)' : 'var(--theme-textMuted, #94a3b8)',
    padding: '12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center'
  }),
  row: { display: 'flex', gap: 8, marginTop: 10 },
  input: { flex: 1, background: 'var(--theme-input, #0a0f1e)', border: '1px solid var(--theme-borderStrong, #334155)', borderRadius: 8, padding: '8px 12px', color: 'var(--theme-text, #e2e8f0)', fontSize: 13, outline: 'none' },
  select: { background: 'var(--theme-elevated, #0f172a)', border: '1px solid var(--theme-borderStrong, #334155)', borderRadius: 8, color: 'var(--theme-textMuted, #94a3b8)', padding: '8px', fontSize: 13, cursor: 'pointer' },
  badge: { background: 'var(--theme-chip, #1e293b)', color: 'var(--theme-textDim, #64748b)', fontSize: 11, borderRadius: 6, padding: '2px 8px' },
  listContainer: { maxHeight: 520, overflowY: 'auto', background: 'var(--theme-input, #0a0f1e)', borderRadius: 10, padding: 8, border: '1px solid var(--theme-border, #1e293b)' }
}

const MANAGE_SECTIONS = [
  ['cards', '카드 목록'],
  ['order', '분류 순서'],
  ['theme', '화면 테마'],
  ['create', '카드 추가'],
  ['organize', '일괄 정리'],
  ['x4', 'X4 내보내기'],
  ['backup', '백업·삭제'],
]

function DataListInput({ id, value, onChange, placeholder, style, options }) {
  const safeOptions = Array.isArray(options) ? options : []
  return (
    <div style={{ flex: 1, width: '100%', minWidth: 0 }}>
      <input style={{ ...style, width: '100%', boxSizing: 'border-box' }} value={value || ''} onChange={onChange} placeholder={placeholder} list={id} />
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

function folderPath(top, subject, part) {
  return [top || '전체', subject || '전체', part || '전체'].join(' > ')
}

function cardLine(card) {
  const title = card?.question || card?.mnemonic || card?.answer || '내용 없음'
  return `${folderPath(getTopCategory(card), card?.subject || '미분류', card?.part || '미분류')} · ${title}`
}

function countOrderFootprint(order) {
  const normalized = normalizeClassificationOrder(order)
  const subjectLists = Object.values(normalized.subjects)
  const partLists = Object.values(normalized.parts)
  return normalized.topCategories.length
    + Object.keys(normalized.subjects).length
    + Object.keys(normalized.parts).length
    + subjectLists.reduce((sum, list) => sum + list.length, 0)
    + partLists.reduce((sum, list) => sum + list.length, 0)
}

function keyLabel(key) {
  return key === GLOBAL_ORDER_KEY ? '전체' : key
}

function emptyClassificationItems(order, cleanedOrder) {
  const current = normalizeClassificationOrder(order)
  const cleaned = normalizeClassificationOrder(cleanedOrder)
  const items = []
  const cleanedTopSet = new Set(cleaned.topCategories)

  current.topCategories.forEach((label) => {
    if (!cleanedTopSet.has(label)) {
      items.push({ type: 'top', key: label, label, path: label, title: '빈 대분류' })
    }
  })

  Object.entries(current.subjects).forEach(([key, list]) => {
    const cleanedSet = new Set(cleaned.subjects[key] || [])
    list.forEach((label) => {
      if (!cleanedSet.has(label)) {
        items.push({ type: 'subject', key, label, path: `${keyLabel(key)} > ${label}`, title: '빈 과목' })
      }
    })
  })

  Object.entries(current.parts).forEach(([key, list]) => {
    const [topKey, subject = ''] = key.split('\u0000')
    const cleanedSet = new Set(cleaned.parts[key] || [])
    list.forEach((label) => {
      if (!cleanedSet.has(label)) {
        items.push({ type: 'part', key, label, path: `${keyLabel(topKey)} > ${subject || '과목 없음'} > ${label}`, title: '빈 단원' })
      }
    })
  })

  return items
}

function removeEmptyClassificationItem(order, item) {
  const normalized = normalizeClassificationOrder(order)
  if (!item) return normalized

  if (item.type === 'top') {
    const top = item.label
    const subjects = Object.fromEntries(
      Object.entries(normalized.subjects).filter(([key]) => key !== top)
    )
    const parts = Object.fromEntries(
      Object.entries(normalized.parts).filter(([key]) => !key.startsWith(`${top}\u0000`))
    )
    return {
      topCategories: normalized.topCategories.filter((label) => label !== top),
      subjects,
      parts,
    }
  }

  if (item.type === 'subject') {
    const subject = item.label
    const topKey = item.key
    const subjects = {
      ...normalized.subjects,
      [topKey]: (normalized.subjects[topKey] || []).filter((label) => label !== subject),
    }
    if (subjects[topKey].length === 0) delete subjects[topKey]

    const parts = Object.fromEntries(
      Object.entries(normalized.parts).filter(([key]) => key !== `${topKey}\u0000${subject}`)
    )
    return { ...normalized, subjects, parts }
  }

  if (item.type === 'part') {
    const parts = {
      ...normalized.parts,
      [item.key]: (normalized.parts[item.key] || []).filter((label) => label !== item.label),
    }
    if (parts[item.key].length === 0) delete parts[item.key]
    return { ...normalized, parts }
  }

  return normalized
}

function mergeOrder(orderList, labels) {
  return sortLabelsByOrder(labels, orderList)
}

function moveItem(list, index, dir) {
  const next = [...list]
  const target = index + dir
  if (target < 0 || target >= next.length) return next
  const temp = next[index]
  next[index] = next[target]
  next[target] = temp
  return next
}

function OrderList({ title, sub, items, onChange }) {
  const safeItems = Array.isArray(items) ? items : []
  return (
    <div style={S.orderPanel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <div style={{ color: 'var(--theme-text, #e2e8f0)', fontSize: 13, fontWeight: 800 }}>{title}</div>
        <span style={S.badge}>{safeItems.length}개</span>
      </div>
      {sub && <div style={{ color: 'var(--theme-textDim, #64748b)', fontSize: 11, lineHeight: 1.45, marginBottom: 10 }}>{sub}</div>}
      {safeItems.length === 0 ? (
        <div style={{ color: 'var(--theme-textDim, #475569)', fontSize: 12, padding: '14px 0', textAlign: 'center' }}>정렬할 항목이 없습니다.</div>
      ) : (
        <div style={S.orderListBody}>
          {safeItems.map((item, index) => (
            <div key={`${item}-${index}`} style={S.orderItem}>
              <span style={{ color: 'var(--theme-textDim, #475569)', fontSize: 11, width: 24, textAlign: 'right' }}>{index + 1}</span>
              <span title={item} style={S.orderLabel}>{item}</span>
              <button
                disabled={index === 0}
                onClick={() => onChange(moveItem(safeItems, index, -1))}
                style={S.orderMoveBtn(index === 0)}
              >↑</button>
              <button
                disabled={index === safeItems.length - 1}
                onClick={() => onChange(moveItem(safeItems, index, 1))}
                style={S.orderMoveBtn(index === safeItems.length - 1)}
              >↓</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ManagePage({ cards }) {
  const {
    allCards, userCards, duplicateCount, isAnonymous, userEmail, loginWithGoogle, handleLogout,
    exportJSON, exportX4TXT, exportX4EPUB, importJSON, deduplicateSelf, deleteBy, countBy, renameFolder, updateCardsByIds,
    topCategories, subjects, subjectsForTop, parts, classificationOrder, saveClassificationOrder
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

  // ── [상태] 분류 표시 순서 설정 관련 ──
  const [orderSubjectTop, setOrderSubjectTop] = useState('전체')
  const [orderPartTop, setOrderPartTop] = useState('전체')
  const [orderPartSubject, setOrderPartSubject] = useState('')
  const [manageSection, setManageSection] = useState('cards')

  // ── 옵션 메모이제이션 ──
  const safeTopCategories = useMemo(
    () => [...new Set([DEFAULT_TOP_CATEGORY, ...(Array.isArray(topCategories) ? topCategories : [])].filter(Boolean))],
    [topCategories]
  )

  const safeClassificationOrder = useMemo(
    () => normalizeClassificationOrder(classificationOrder),
    [classificationOrder]
  )
  const cleanedClassificationOrder = useMemo(
    () => rebuildClassificationOrder(userCards, safeClassificationOrder),
    [userCards, safeClassificationOrder]
  )
  const classificationResidueCount = useMemo(
    () => Math.max(0, countOrderFootprint(safeClassificationOrder) - countOrderFootprint(cleanedClassificationOrder)),
    [safeClassificationOrder, cleanedClassificationOrder]
  )
  const emptyClassifications = useMemo(
    () => emptyClassificationItems(safeClassificationOrder, cleanedClassificationOrder),
    [safeClassificationOrder, cleanedClassificationOrder]
  )
  const emptyClassificationPreview = useMemo(
    () => emptyClassifications.slice(0, 12),
    [emptyClassifications]
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
    return getSubjectOptions(x4Top)
  }, [x4Top, subjects, subjectsForTop])

  const x4PartOptions = useMemo(() => {
    if (x4Sub !== '전체') return parts(x4Sub, x4Top)
    const topBase = allCards.filter((c) => matchesTopCategory(c, x4Top))
    return [...new Set(topBase.map((c) => c.part).filter(Boolean))]
  }, [allCards, x4Top, x4Sub, parts])

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
  const hasRenameTarget = !!editNewTop.trim() || !!editNewSub.trim() || !!editNewPart.trim()
  const canRenameFolder = targetEditCount > 0 && hasRenameTarget
  const canBatchRename = activeBatchCards.length > 0 && (!!batchNewTop.trim() || !!batchNewSub.trim() || !!batchNewPart.trim())
  const renameTargetTop = editNewTop.trim() || editOldTop
  const renameTargetSubject = editNewSub.trim() || editOldSub
  const renameTargetPart = editNewPart.trim() || editOldPart
  const renameSourcePath = folderPath(editOldTop, editOldSub, editOldPart)
  const renameTargetPath = folderPath(renameTargetTop, renameTargetSubject, renameTargetPart)
  const editTargetCards = useMemo(() => {
    return userCards.filter((card) => {
      const matchTop = matchesTopCategory(card, editOldTop)
      const matchSub = editOldSub === '전체' || card.subject === editOldSub
      const matchPart = editOldPart === '전체' || card.part === editOldPart
      return matchTop && matchSub && matchPart
    })
  }, [userCards, editOldTop, editOldSub, editOldPart])
  const editTargetPreview = useMemo(() => editTargetCards.slice(0, 4), [editTargetCards])
  const editNewSubjectOptions = useMemo(() => {
    const targetTop = editNewTop.trim() || editOldTop
    const scopedSubjects = targetTop === '전체' ? subjects : getSubjectOptions(targetTop)
    return [...new Set([...(scopedSubjects || []), ...(subjects || [])].filter(Boolean))]
  }, [editNewTop, editOldTop, subjects, subjectsForTop])
  const editNewPartOptions = useMemo(() => {
    const targetTop = editNewTop.trim() || editOldTop
    const targetSubject = editNewSub.trim() || editOldSub
    if (targetSubject && targetSubject !== '전체') return parts(targetSubject, targetTop)
    return [...new Set([...editOptions, ...userCards.map((card) => card.part).filter(Boolean)])]
  }, [editNewTop, editNewSub, editOldTop, editOldSub, editOptions, userCards, parts])
  const batchTargetPath = folderPath(
    batchNewTop.trim() || '기존 대분류 유지',
    batchNewSub.trim() || '기존 과목 유지',
    batchNewPart.trim() || '기존 단원 유지'
  )
  const batchSubjectOptions = useMemo(() => {
    const targetTop = batchNewTop.trim()
    return targetTop ? getSubjectOptions(targetTop) : subjects
  }, [batchNewTop, subjects, subjectsForTop])
  const batchPreviewCards = useMemo(() => activeBatchCards.slice(0, 4), [activeBatchCards])

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

  const orderTopItems = useMemo(
    () => mergeOrder(safeClassificationOrder.topCategories, safeTopCategories),
    [safeClassificationOrder, safeTopCategories]
  )
  const orderSubjectItems = useMemo(() => {
    const key = subjectOrderKey(orderSubjectTop)
    return mergeOrder(safeClassificationOrder.subjects?.[key], getSubjectOptions(orderSubjectTop))
  }, [safeClassificationOrder, orderSubjectTop, subjects, subjectsForTop])
  const orderPartSubjectOptions = useMemo(
    () => getSubjectOptions(orderPartTop),
    [orderPartTop, subjects, subjectsForTop]
  )
  const activeOrderPartSubject = orderPartSubjectOptions.includes(orderPartSubject)
    ? orderPartSubject
    : (orderPartSubjectOptions[0] || '')
  const orderPartItems = useMemo(() => {
    if (!activeOrderPartSubject) return []
    const key = partOrderKey(orderPartTop, activeOrderPartSubject)
    return mergeOrder(safeClassificationOrder.parts?.[key], parts(activeOrderPartSubject, orderPartTop))
  }, [activeOrderPartSubject, orderPartTop, parts, safeClassificationOrder])

  const saveOrder = (patch) => {
    if (typeof saveClassificationOrder !== 'function') return
    saveClassificationOrder({
      ...safeClassificationOrder,
      ...patch,
    })
  }
  const saveTopOrder = (next) => saveOrder({ topCategories: next })
  const saveSubjectOrder = (next) => saveOrder({
    subjects: {
      ...safeClassificationOrder.subjects,
      [subjectOrderKey(orderSubjectTop)]: next,
    }
  })
  const savePartOrder = (next) => {
    if (!activeOrderPartSubject) return
    saveOrder({
      parts: {
        ...safeClassificationOrder.parts,
        [partOrderKey(orderPartTop, activeOrderPartSubject)]: next,
      }
    })
  }
  const handleCleanClassificationOrder = () => {
    if (typeof saveClassificationOrder !== 'function') return
    const message = classificationResidueCount > 0
      ? `실제 카드에 없는 분류 순서값 ${classificationResidueCount}개를 정리합니다.\n카드 내용은 바뀌지 않고, 표시 순서 저장값만 정리됩니다.`
      : '현재 카드 기준으로 분류 순서를 다시 저장합니다.\n카드 내용은 바뀌지 않습니다.'

    if (!window.confirm(message)) return
    Promise.resolve(saveClassificationOrder(cleanedClassificationOrder))
      .then(() => alert(classificationResidueCount > 0 ? '남아 있던 분류 순서값을 정리했습니다.' : '분류 순서를 현재 카드 기준으로 다시 저장했습니다.'))
  }
  const handleDeleteEmptyClassification = (item) => {
    if (typeof saveClassificationOrder !== 'function' || !item) return
    if (!window.confirm(`[${item.title}] ${item.path}\n\n이 빈 분류를 삭제합니다. 카드 내용은 삭제되지 않습니다.`)) return
    Promise.resolve(saveClassificationOrder(removeEmptyClassificationItem(safeClassificationOrder, item)))
      .then(() => alert('빈 분류를 삭제했습니다.'))
  }

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
    if (!canRenameFolder) return
    const preview = editTargetPreview.map((card) => `- ${cardLine(card)}`).join('\n')
    const confirmMessage = [
      `[${renameSourcePath}] 범위의 카드 ${targetEditCount}개를 일괄 변경합니다.`,
      '',
      `변경 후: ${renameTargetPath}`,
      '변경 뒤 남는 예전 분류 순서값도 같이 정리합니다.',
      preview ? `\n미리보기\n${preview}` : '',
    ].filter(Boolean).join('\n')

    if (window.confirm(confirmMessage)) {
      renameFolder({
        oldTopCategory: editOldTop,
        oldSubject: editOldSub,
        oldPart: editOldPart,
        newTopCategory: editNewTop.trim(),
        newSubject: editNewSub.trim(),   // 빈 값이면 renameFolder가 기존 과목명 유지
        newPart: editNewPart.trim()      // 빈 값이면 renameFolder가 기존 단원명 유지
      }).then((count) => {
        alert(`${count}개의 카드가 성공적으로 이동 및 수정되었습니다. 남는 분류 순서값도 정리했습니다.`);
        if (renameTargetTop && renameTargetTop !== '전체') setEditOldTop(renameTargetTop);
        if (renameTargetSubject && renameTargetSubject !== '전체') setEditOldSub(renameTargetSubject);
        if (renameTargetPart && renameTargetPart !== '전체') setEditOldPart(renameTargetPart);
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

    const preview = batchPreviewCards
      .map((card) => `- ${cardLine(card)}`)
      .join('\n')

    if (window.confirm(`[${activeBatch?.source || 'AI 추출'}] 묶음의 카드 ${activeBatchCards.length}개를 일괄 변경합니다.\n\n변경 후: ${batchTargetPath}\n변경 뒤 남는 예전 분류 순서값도 같이 정리합니다.\n\n${preview}`)) {
      updateCardsByIds(activeBatchCards.map((card) => card.id), patch).then((count) => {
        alert(`${count}개의 최근 추출 카드가 성공적으로 수정되었습니다. 남는 분류 순서값도 정리했습니다.`)
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
            <div style={{ color: 'var(--theme-onAccent, #fff)', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              {isAnonymous ? '☁️ 임시 클라우드 보관함' : '🔒 안전한 계정 동기화 완료'}
            </div>
            <div style={{ color: 'var(--theme-textMuted, #94a3b8)', fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
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

      <div style={S.manageTabs} role="tablist" aria-label="관리 메뉴">
        {MANAGE_SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={manageSection === id}
            style={S.manageTab(manageSection === id)}
            onClick={() => setManageSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={S.desktopGrid}>
      {manageSection === 'order' && (
      <>
      {/* 분류 표시 순서 설정 섹션 */}
      <div style={S.wideSection}>
        <div style={S.title}>분류 표시 순서 설정</div>
        <div style={S.sub}>학습, 기록형, 관리, X4 내보내기에서 보이는 대분류·과목·단원 순서를 고정합니다. 목록은 각 칸 안에서 스크롤됩니다.</div>
        <div style={{ background: 'var(--theme-input, #0a0f1e)', border: '1px solid var(--theme-border, #1e293b)', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220, flex: 1 }}>
            <div style={{ color: 'var(--theme-text, #e2e8f0)', fontSize: 13, fontWeight: 800 }}>분류 구조 정리</div>
            <div style={{ color: 'var(--theme-textDim, #64748b)', fontSize: 12, lineHeight: 1.5, marginTop: 3 }}>
              실제 카드에 없는 대분류·과목·단원 순서값을 지웁니다. 현재 빈 분류 {emptyClassifications.length}개
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={{ ...S.btn(false), padding: '9px 12px' }} onClick={handleCleanClassificationOrder}>
              빈 분류 전체 삭제
            </button>
            <button type="button" style={{ ...S.btn(false), padding: '9px 12px' }} onClick={() => setManageSection('organize')}>
              폴더 일괄 변경으로 이동
            </button>
          </div>
        </div>
        <div style={{ background: 'var(--theme-input, #0a0f1e)', border: '1px solid var(--theme-border, #1e293b)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div style={{ color: 'var(--theme-text, #e2e8f0)', fontSize: 13, fontWeight: 800 }}>빈껍데기 분류</div>
            <span style={S.badge}>{emptyClassifications.length}개</span>
          </div>
          {emptyClassifications.length === 0 ? (
            <div style={{ color: 'var(--theme-textDim, #64748b)', fontSize: 12, lineHeight: 1.5 }}>
              삭제할 빈 분류가 없습니다.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 8 }}>
              {emptyClassificationPreview.map((item, index) => (
                <div key={`${item.type}-${item.key}-${item.label}-${index}`} style={{ background: 'var(--theme-elevated, #0f172a)', border: '1px solid var(--theme-border, #1e293b)', borderRadius: 10, padding: 10, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: 'var(--theme-accentText, #e0e7ff)', fontSize: 12, fontWeight: 800 }}>{item.title}</div>
                    <div title={item.path} style={{ color: 'var(--theme-textMuted, #94a3b8)', fontSize: 12, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.path}
                    </div>
                  </div>
                  <button type="button" style={{ ...S.btn(true), padding: '8px 10px', fontSize: 12 }} onClick={() => handleDeleteEmptyClassification(item)}>
                    삭제
                  </button>
                </div>
              ))}
              {emptyClassifications.length > emptyClassificationPreview.length && (
                <div style={{ color: 'var(--theme-textDim, #64748b)', fontSize: 12, lineHeight: 1.5, padding: 10 }}>
                  외 {emptyClassifications.length - emptyClassificationPreview.length}개가 더 있습니다. 전체 삭제 버튼으로 한 번에 정리할 수 있습니다.
                </div>
              )}
            </div>
          )}
        </div>
        <div style={S.orderGrid}>
          <OrderList
            title="대분류 순서"
            sub="전체 화면의 가장 바깥 분류 순서입니다."
            items={orderTopItems}
            onChange={saveTopOrder}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={{ ...S.select, flex: 1 }} value={orderSubjectTop} onChange={(e) => setOrderSubjectTop(e.target.value)}>
                <option>전체</option>{safeTopCategories.map((value) => <option key={value}>{value}</option>)}
              </select>
            </div>
            <OrderList
              title="과목 순서"
              sub={`${orderSubjectTop} 대분류 안에서 과목이 보이는 순서입니다.`}
              items={orderSubjectItems}
              onChange={saveSubjectOrder}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={{ ...S.select, flex: 1 }} value={orderPartTop} onChange={(e) => { setOrderPartTop(e.target.value); setOrderPartSubject('') }}>
                <option>전체</option>{safeTopCategories.map((value) => <option key={value}>{value}</option>)}
              </select>
              <select style={{ ...S.select, flex: 1 }} value={activeOrderPartSubject} onChange={(e) => setOrderPartSubject(e.target.value)}>
                {orderPartSubjectOptions.length === 0 && <option value="">과목 없음</option>}
                {orderPartSubjectOptions.map((value) => <option key={value}>{value}</option>)}
              </select>
            </div>
            <OrderList
              title="단원 순서"
              sub={activeOrderPartSubject ? `${orderPartTop} > ${activeOrderPartSubject} 안에서 단원이 보이는 순서입니다.` : '과목이 있어야 단원 순서를 설정할 수 있습니다.'}
              items={orderPartItems}
              onChange={savePartOrder}
            />
          </div>
        </div>
      </div>
      </>
      )}

      {manageSection === 'create' && (
      <>
      {/* ➕ 개별 카드 추가 생성 섹션 */}
      <div style={S.wideSection}>
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
              <label key={type} style={{ color: 'var(--theme-text, #e2e8f0)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="radio" checked={newType === type} onChange={() => setNewType(type)} /> {label}
              </label>
            ))}
          </div>

          {newType === 'mnemonic' ? (
            <>
              <input style={{...S.input, color: 'var(--theme-accent, #818cf8)', fontWeight: 700}} placeholder="두문자 기입 (예: 이.가.게.귀.위)" value={newMnemonic} onChange={e => setNewMnemonic(e.target.value)} />
              <textarea style={{...S.input, minHeight: 55, resize: 'vertical'}} placeholder="각 두문자의 상세 설명을 입력하세요 (①이행기 / ②가능...)" value={newDetail} onChange={e => setNewDetail(e.target.value)} />
            </>
          ) : (
            <textarea style={{...S.input, minHeight: 80, resize: 'vertical'}} placeholder={answerPlaceholder(newType)} value={newAnswer} onChange={e => setNewAnswer(e.target.value)} />
          )}

          <button style={{...S.btn(false), background: 'var(--theme-accentGradient, linear-gradient(135deg,#6366f1,#8b5cf6))', color: 'var(--theme-onAccent, #fff)', marginTop: 4}} onClick={handleAddCardSubmit}>
            ✨ 새 카드 생성 및 저장
          </button>
        </div>
      </div>
      </>
      )}

      {manageSection === 'theme' && (
        <ThemePickerCard />
      )}

      {manageSection === 'organize' && (
      <>
      {/* 최근 AI 추출 묶음 정리 섹션 */}
      <div style={S.wideSection}>
        <div style={S.title}>최근 AI 추출 묶음 정리</div>
        <div style={S.sub}>AI 추출 화면에서 저장한 카드 묶음만 골라 과목과 단원을 한 번에 다시 맞춥니다.</div>
        {extractionBatches.length === 0 ? (
          <div style={{ color: 'var(--theme-textDim, #475569)', fontSize: 13, background: 'var(--theme-input, #0a0f1e)', border: '1px solid var(--theme-border, #1e293b)', borderRadius: 10, padding: 12 }}>
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
            <div style={{ color: 'var(--theme-textDim, #64748b)', fontSize: 12, lineHeight: 1.55 }}>
              현재 분류: {summarizeLabels(activeBatch?.topCategories, '대분류 없음')} / {summarizeLabels(activeBatch?.subjects, '과목 없음')} / {summarizeLabels(activeBatch?.parts, '단원 없음')} · 대상 {activeBatchCards.length}개
            </div>
            <div style={{ background: 'var(--theme-input, #0a0f1e)', border: '1px solid var(--theme-border, #1e293b)', borderRadius: 10, padding: 12, color: 'var(--theme-textMuted, #94a3b8)', fontSize: 12, lineHeight: 1.55 }}>
              <div style={{ color: 'var(--theme-text, #e2e8f0)', fontWeight: 800, marginBottom: 4 }}>변경 미리보기</div>
              <div>{batchTargetPath}</div>
              <div style={{ color: 'var(--theme-infoText, #7dd3fc)', marginTop: 4 }}>저장 시 예전 분류 순서 찌꺼기도 자동 정리됩니다.</div>
              {batchPreviewCards.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {batchPreviewCards.map((card) => (
                    <div key={card.id} style={{ color: 'var(--theme-textDim, #64748b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cardLine(card)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
              <DataListInput id="batch-top-dl" value={batchNewTop} onChange={e => setBatchNewTop(e.target.value)} placeholder="새 대분류 (공백 시 유지)" style={S.input} options={safeTopCategories} />
              <DataListInput id="batch-sub-dl" value={batchNewSub} onChange={e => setBatchNewSub(e.target.value)} placeholder="새 과목명 (공백 시 유지)" style={S.input} options={batchSubjectOptions} />
              <DataListInput id="batch-part-dl" value={batchNewPart} onChange={e => setBatchNewPart(e.target.value)} placeholder="새 단원명 (공백 시 유지)" style={S.input} options={batchPartOptions} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={{ ...S.btn(false), padding: '9px 12px' }} onClick={() => { setBatchNewTop(''); setBatchNewSub(''); setBatchNewPart('') }}>
                입력 초기화
              </button>
            </div>
            <button
              style={{ ...S.btn(false), background: canBatchRename ? 'var(--theme-infoSoft, rgba(14,165,233,0.14))' : 'var(--theme-button, #1e293b)', color: canBatchRename ? 'var(--theme-infoText, #7dd3fc)' : 'var(--theme-textDim, #64748b)', border: canBatchRename ? '1px solid var(--theme-info, #38bdf8)' : '1px solid var(--theme-borderStrong, #334155)' }}
              disabled={!canBatchRename}
              onClick={handleBatchRename}
            >
              최근 추출 카드 {activeBatchCards.length}개 일괄 변경
            </button>
          </div>
        )}
      </div>

      {/* 📁 폴더(과목/단원) 이름 일괄 변경 섹션 */}
      <div style={S.wideSection}>
        <div style={S.title}>📁 폴더(대분류/과목/단원) 구조 일괄 변경</div>
        <div style={S.sub}>기존 카드들의 대분류, 과목명, 단원명을 일괄 수정하여 다른 카테고리로 통합/이동시킵니다. 변경 뒤 실제 카드가 없는 분류 순서값은 자동으로 정리됩니다.</div>
        <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
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
          <div style={{ background: 'var(--theme-input, #0a0f1e)', border: '1px solid var(--theme-border, #1e293b)', borderRadius: 10, padding: 12, color: 'var(--theme-textMuted, #94a3b8)', fontSize: 12, lineHeight: 1.55 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ color: 'var(--theme-text, #e2e8f0)', fontWeight: 800 }}>변경 미리보기</span>
              <span style={S.badge}>대상 {targetEditCount}개</span>
            </div>
            <div>{renameSourcePath}</div>
            <div style={{ color: hasRenameTarget ? 'var(--theme-accentText, #e0e7ff)' : 'var(--theme-textDim, #64748b)', fontWeight: 800 }}>
              → {hasRenameTarget ? renameTargetPath : '아래에 새 분류명을 입력하면 변경 후 경로가 표시됩니다.'}
            </div>
            <div style={{ color: 'var(--theme-infoText, #7dd3fc)', marginTop: 4 }}>저장 시 예전 폴더명, 빈 과목/단원 순서값도 같이 정리됩니다.</div>
            {editTargetPreview.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {editTargetPreview.map((card) => (
                  <div key={card.id} style={{ color: 'var(--theme-textDim, #64748b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cardLine(card)}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
            <DataListInput id="rename-top-dl" value={editNewTop} onChange={e => setEditNewTop(e.target.value)} placeholder="새 대분류 (공백 시 유지)" style={S.input} options={safeTopCategories} />
            <DataListInput id="rename-sub-dl" value={editNewSub} onChange={e => setEditNewSub(e.target.value)} placeholder="새 과목명 (공백 시 유지)" style={S.input} options={editNewSubjectOptions} />
            <DataListInput id="rename-part-dl" value={editNewPart} onChange={e => setEditNewPart(e.target.value)} placeholder="새 단원명 (공백 시 유지)" style={S.input} options={editNewPartOptions} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={{ ...S.btn(false), padding: '9px 12px' }}
              onClick={() => {
                setEditNewTop(editOldTop === '전체' ? '' : editOldTop)
                setEditNewSub(editOldSub === '전체' ? '' : editOldSub)
                setEditNewPart(editOldPart === '전체' ? '' : editOldPart)
              }}
            >
              현재값 불러오기
            </button>
            <button
              type="button"
              style={{ ...S.btn(false), padding: '9px 12px' }}
              onClick={() => { setEditNewTop(''); setEditNewSub(''); setEditNewPart('') }}
            >
              입력 초기화
            </button>
          </div>
          <button 
            style={{ ...S.btn(false), background: canRenameFolder ? 'var(--theme-accentSoft, rgba(99,102,241,0.15))' : 'var(--theme-button, #1e293b)', color: canRenameFolder ? 'var(--theme-accent, #818cf8)' : 'var(--theme-textDim, #64748b)', border: canRenameFolder ? '1px solid var(--theme-accentStrong, #6366f1)' : '1px solid var(--theme-borderStrong, #334155)' }} 
            disabled={!canRenameFolder} 
            onClick={handleRename}
          >
            대상 유저 카드 {targetEditCount}개 폴더 구조 변경
          </button>
        </div>
      </div>
      </>
      )}

      {manageSection === 'cards' && (
      <>
      {/* 🔍 개별 카드 수정 및 삭제 목록 관리 섹션 */}
      <div style={S.wideSection}>
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
            <div style={{ color: 'var(--theme-textDim, #475569)', textAlign: 'center', padding: '30px 0', fontSize: 13 }}>조건에 맞는 유저 카드가 존재하지 않습니다.</div>
          ) : (
            filteredUserCards.map(c => {
              const isEditing = editingCardId === c.id;
              const kind = getCardKind(c);
              const isAnswer = isAnswerCard(c);

              if (isEditing) {
                const editKind = getCardKind(editCardDraft || c);
                return (
                  <div key={c.id} style={{ border: '1px solid var(--theme-accentStrong, #6366f1)', background: 'var(--theme-elevated, #0f172a)', padding: 12, borderRadius: 10, marginBottom: 8 }}>
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
                        <input style={{...S.input, width: '100%', marginBottom: 6, color: 'var(--theme-accent, #818cf8)', fontWeight: 700}} value={editCardDraft.mnemonic} onChange={e => setEditCardDraft({...editCardDraft, mnemonic: e.target.value})} placeholder="두문자" />
                        <textarea style={{...S.input, width: '100%', marginBottom: 6, minHeight: 50, resize: 'vertical'}} value={editCardDraft.detail} onChange={e => setEditCardDraft({...editCardDraft, detail: e.target.value})} placeholder="두문자 상세 설명" />
                      </>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button style={{...S.btn(false), flex: 1, padding: '8px', background: 'var(--theme-accentGradient, linear-gradient(135deg,#6366f1,#8b5cf6))', color: 'var(--theme-onAccent, #fff)', border: 'none'}} onClick={async () => {
                        await cards.updateCard(c.id, editCardDraft);
                        setEditingCardId(null);
                      }}>수정 완료</button>
                      <button style={{...S.btn(false), flex: 1, padding: '8px'}} onClick={() => setEditingCardId(null)}>취소</button>
                    </div>
                  </div>
                )
              }

              return (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--theme-panelSoft, rgba(15,23,42,0.6))', border: '1px solid var(--theme-border, #1e293b)', padding: '10px 14px', borderRadius: 10, marginBottom: 6, gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 5, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, background: 'var(--theme-infoSoft, rgba(14,165,233,0.14))', color: 'var(--theme-infoText, #7dd3fc)', border: '1px solid var(--theme-info, #38bdf8)', padding: '1px 6px', borderRadius: 4 }}>{getTopCategory(c)}</span>
                      <span style={{ fontSize: 10, background: 'var(--theme-button, #1e293b)', color: 'var(--theme-textMuted, #94a3b8)', padding: '1px 6px', borderRadius: 4 }}>{c.subject}</span>
                      <span style={{ fontSize: 10, background: 'var(--theme-button, #1e293b)', color: 'var(--theme-textDim, #64748b)', padding: '1px 6px', borderRadius: 4 }}>{c.part}</span>
                      {c.sourceNumber && <span style={{ fontSize: 10, background: 'var(--theme-infoSoft, rgba(14,165,233,0.14))', color: 'var(--theme-infoText, #7dd3fc)', border: '1px solid var(--theme-info, #38bdf8)', padding: '1px 6px', borderRadius: 4 }}>원문 {c.sourceNumber}</span>}
                      <span style={{ fontSize: 10, background: isAnswer ? 'var(--theme-warningSoft, rgba(245,158,11,0.14))' : 'var(--theme-accentSoft, rgba(99,102,241,0.15))', color: isAnswer ? 'var(--theme-warning, #f59e0b)' : 'var(--theme-accent, #818cf8)', padding: '1px 6px', borderRadius: 4 }}>{cardKindLabel(kind)}</span>
                    </div>
                    <div style={{ color: 'var(--theme-text, #e2e8f0)', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.question}</div>
                    <div style={{ color: isAnswer ? 'var(--theme-textMuted, #94a3b8)' : 'var(--theme-accent, #818cf8)', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isAnswer ? c.answer : `${c.mnemonic} - ${c.detail}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                    <button style={{ background: 'none', border: 'none', color: 'var(--theme-textMuted, #94a3b8)', cursor: 'pointer', fontSize: 14 }} onClick={() => {
                      setEditingCardId(c.id);
                      setEditCardDraft({...c});
                    }} title="편집">✎</button>
                    <button style={{ background: 'none', border: 'none', color: 'var(--theme-danger, #ef4444)', cursor: 'pointer', fontSize: 14 }} onClick={async () => {
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
      </>
      )}

      {manageSection === 'x4' && (
      <>
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
      </>
      )}

      {manageSection === 'backup' && (
      <>
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
      </>
      )}

    </div>
    </div>
  )
}
