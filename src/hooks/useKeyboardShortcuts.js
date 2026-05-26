import { useEffect, useRef } from 'react'

// 입력 포커스 중에는 단축키를 무시한다 (textarea에 1을 입력하려는데 모름 처리되면 안 됨).
function isTypingTarget(el) {
  if (!el) return false
  const tag = (el.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable) return true
  return false
}

/**
 * 단순 키 → 콜백 매핑. 메타키/한글 IME 조합은 무시.
 *
 * @param {Object<string, () => void>} keyMap
 *   예: { '1': () => mark('unknown'), ' ': () => flip(), ArrowRight: () => next() }
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true]  false면 리스너 자체를 안 단다
 * @param {boolean} [options.allowInInputs=false]  입력 포커스 중에도 동작하게 할지
 */
export function useKeyboardShortcuts(keyMap, options = {}) {
  const { enabled = true, allowInInputs = false } = options
  // keyMap이 매 렌더마다 새로 만들어져도 effect 재구독을 피하기 위해 ref로
  const keyMapRef = useRef(keyMap)
  keyMapRef.current = keyMap

  useEffect(() => {
    if (!enabled) return undefined

    const handler = (e) => {
      // 한글 IME 조합 중인 키스트로크는 무시 (조합 도중 1/2/3가 입력되는 사고 방지)
      if (e.isComposing || e.keyCode === 229) return
      // 메타키 조합은 사용자의 다른 단축키(복사, 새 탭 등)일 가능성 → 패스
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (!allowInInputs && isTypingTarget(document.activeElement)) return

      // 키 정규화: 영문 글자는 소문자로, 그 외는 그대로
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const handler = keyMapRef.current[key]
      if (typeof handler === 'function') {
        e.preventDefault()
        handler(e)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, allowInInputs])
}
