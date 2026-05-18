import { useState, useCallback, useEffect, useRef } from 'react'

export function useTTS() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)
  const cancelledRef = useRef(false)

  const speak = useCallback((segments, { rate = 1, onDone } = {}) => {
    if (!supported) { onDone?.(); return }
    window.speechSynthesis.cancel()
    cancelledRef.current = false
    setSpeaking(true)
    let i = 0
    const next = () => {
      if (cancelledRef.current) return
      if (i >= segments.length) { setSpeaking(false); onDone?.(); return }
      const seg = segments[i++]
      seg.before?.()
      const text = (seg.text || '').trim()
      if (!text) { next(); return }
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'ko-KR'
      u.rate = rate
      u.onend = () => { if (cancelledRef.current) return; seg.pauseAfter ? setTimeout(next, seg.pauseAfter) : next() }
      u.onerror = () => { if (!cancelledRef.current) next() }
      window.speechSynthesis.speak(u)
    }
    next()
  }, [supported])

  const stop = useCallback(() => {
    cancelledRef.current = true
    if (supported) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  useEffect(() => () => { if (supported) window.speechSynthesis.cancel() }, [supported])
  return { speak, stop, speaking, supported }
}
export function ttsMnemonic(s = '') {
  return s.replace(/[.·・\u30FB\-]/g, ' ').replace(/\s+/g, ' ').trim()
}
export function ttsDetail(s = '') {
  return s.replace(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫]/g, ', ').replace(/[\/]/g, ', ').replace(/\s+/g, ' ').trim()
}
