import { useState, useCallback } from 'react'
import { builtinCards } from '../data/mnemonics'
import { isDuplicate } from '../utils/dedup'

const STORAGE_KEY = 'mnemonic_user_cards'

function loadUserCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function saveUserCards(cards) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards))
}

function dedupList(cards) {
  const kept = []
  for (const card of cards) {
    if (!kept.some((k) => isDuplicate(k, card))) kept.push(card)
  }
  return kept
}

function filterNew(incoming, existing) {
  return incoming.filter((c) => !existing.some((e) => isDuplicate(e, c)))
}

export function useCards() {
  const [userCards, setUserCards] = useState(loadUserCards)

  const allCards = [...builtinCards, ...userCards]

  const addCard = useCallback((card) => {
    setUserCards((prev) => {
      const next = [...prev, { ...card, id: `user-${Date.now()}-${Math.random().toString(36).slice(2,6)}` }]
      saveUserCards(next)
      return next
    })
  }, [])

  const addCards = useCallback((incoming) => {
    let added = 0
    setUserCards((prev) => {
      const existing = [...builtinCards, ...prev]
      const newCards = filterNew(incoming, existing)
        .map((c) => ({ ...c, id: `user-${Date.now()}-${Math.random().toString(36).slice(2,6)}` }))
      added = newCards.length
      if (newCards.length === 0) return prev
      const next = [...prev, ...newCards]
      saveUserCards(next)
      return next
    })
    return added
  }, [])

  const deleteCard = useCallback((id) => {
    setUserCards((prev) => {
      const next = prev.filter((c) => c.id !== id)
      saveUserCards(next)
      return next
    })
  }, [])

  const updateCard = useCallback((id, updated) => {
    setUserCards((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...updated } : c))
      saveUserCards(next)
      return next
    })
  }, [])

  // 카드 순서 교환 — ManagePage 드래그 정렬용 (moveCard 별칭 포함)
  const reorderCard = useCallback((sourceId, targetId) => {
    setUserCards((prev) => {
      const srcIdx = prev.findIndex((c) => c.id === sourceId)
      const tgtIdx = prev.findIndex((c) => c.id === targetId)
      if (srcIdx < 0 || tgtIdx < 0 || srcIdx === tgtIdx) return prev
      const next = [...prev]
      const [moved] = next.splice(srcIdx, 1)
      next.splice(tgtIdx, 0, moved)
      saveUserCards(next)
      return next
    })
  }, [])

  const deleteBy = useCallback(({ subject, part }) => {
    let removed = 0
    setUserCards((prev) => {
      const next = prev.filter((c) => {
        const ms = !subject || subject === '전체' || c.subject === subject
        const mp = !part    || part    === '전체' || c.part    === part
        if (ms && mp) { removed++; return false }
        return true
      })
      saveUserCards(next)
      return next
    })
    return removed
  }, [])

  const countBy = useCallback(({ subject, part }) =>
    userCards.filter((c) => {
      const ms = !subject || subject === '전체' || c.subject === subject
      const mp = !part    || part    === '전체' || c.part    === part
      return ms && mp
    }).length
  , [userCards])

  const deduplicateSelf = useCallback(() => {
    let removed = 0
    setUserCards((prev) => {
      const withoutBuiltin = prev.filter((c) => !builtinCards.some((b) => isDuplicate(b, c)))
      const deduped = dedupList(withoutBuiltin)
      removed = prev.length - deduped.length
      if (removed === 0) return prev
      saveUserCards(deduped)
      return deduped
    })
    return removed
  }, [])

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(allCards, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `mnemonic_cards_${new Date().toISOString().slice(0,10)}.json`
    a.click()
  }, [allCards])

  const importJSON = useCallback((file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result)
          if (!Array.isArray(data)) throw new Error('올바른 JSON 형식이 아닙니다')
          const added = addCards(data)
          resolve({ added, skipped: data.length - added })
        } catch (err) { reject(err) }
      }
      reader.onerror = () => reject(new Error('파일 읽기 실패'))
      reader.readAsText(file)
    })
  , [addCards])

  const duplicateCount = (() => {
    const withoutBuiltin = userCards.filter((c) => !builtinCards.some((b) => isDuplicate(b, c)))
    return userCards.length - dedupList(withoutBuiltin).length
  })()

  const subjects = [...new Set(allCards.map((c) => c.subject))]
  const parts = (subject) => [...new Set(allCards.filter((c) => c.subject === subject).map((c) => c.part))]

  return {
    allCards, userCards, builtinCards,
    addCard, addCards,
    deleteCard, updateCard,
    moveCard: reorderCard,   // ManagePage 호환
    reorderCard,             // 동일 함수, 이름만 두 개
    deleteBy, countBy,
    exportJSON, importJSON,
    deduplicateSelf, duplicateCount,
    subjects, parts,
  }
}
