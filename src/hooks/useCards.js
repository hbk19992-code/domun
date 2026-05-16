import { useState, useEffect, useCallback } from 'react'
import { builtinCards } from '../data/mnemonics'

const STORAGE_KEY = 'mnemonic_user_cards'

function loadUserCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveUserCards(cards) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards))
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

  const addCards = useCallback((cards) => {
    setUserCards((prev) => {
      const next = [
        ...prev,
        ...cards.map((c) => ({ ...c, id: `user-${Date.now()}-${Math.random().toString(36).slice(2,6)}` }))
      ]
      saveUserCards(next)
      return next
    })
  }, [])

  const deleteCard = useCallback((id) => {
    setUserCards((prev) => {
      const next = prev.filter((c) => c.id !== id)
      saveUserCards(next)
      return next
    })
  }, [])

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(allCards, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `mnemonic_cards_${new Date().toISOString().slice(0,10)}.json`
    a.click()
  }, [allCards])

  const importJSON = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result)
          if (!Array.isArray(data)) throw new Error('올바른 JSON 형식이 아닙니다')
          addCards(data)
          resolve(data.length)
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error('파일 읽기 실패'))
      reader.readAsText(file)
    })
  }, [addCards])

  const subjects = [...new Set(allCards.map((c) => c.subject))]
  const parts = (subject) => [...new Set(allCards.filter((c) => c.subject === subject).map((c) => c.part))]

  return { allCards, userCards, builtinCards, addCard, addCards, deleteCard, exportJSON, importJSON, subjects, parts }
}
