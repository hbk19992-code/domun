import { useEffect, useRef } from 'react'

function isTypingTarget(el) {
  if (!el) return false
  const tag = (el.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable) return true
  return false
}

export function useKeyboardShortcuts(keyMap, options = {}) {
  const { enabled = true, allowInInputs = false } = options
  const keyMapRef = useRef(keyMap)
  keyMapRef.current = keyMap

  useEffect(() => {
    if (!enabled) return undefined

    const handler = (e) => {
      if (e.isComposing || e.keyCode === 229) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (!allowInInputs && isTypingTarget(document.activeElement)) return

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const action = keyMapRef.current[key]
      if (typeof action === 'function') {
        e.preventDefault()
        action(e)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, allowInInputs])
}
