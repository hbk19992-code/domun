import { useEffect, useState } from 'react'

const ITEMS = [
  ['1', '모름 처리'],
  ['2', '헷갈림 처리'],
  ['3', '앎 처리'],
  ['Space', '카드 뒤집기'],
  ['→ / n', '다음 카드'],
  ['← / p', '이전 카드'],
  ['s', '섞기 토글'],
  ['?', '이 안내 열고 닫기'],
]

function isCoarsePointer() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches
}

export default function KeyboardHelp({ open, onClose }) {
  const [touchOnly, setTouchOnly] = useState(false)

  useEffect(() => { setTouchOnly(isCoarsePointer()) }, [])

  if (touchOnly || !open) return null

  return (
    <div
      role="dialog"
      aria-label="키보드 단축키"
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 250,
        background: 'var(--theme-panel, rgba(15,23,42,0.96))',
        border: '1px solid var(--theme-border, #1e293b)',
        borderRadius: 14,
        padding: '14px 16px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        minWidth: 240,
        maxWidth: 320,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: 'var(--theme-text, #e2e8f0)', fontSize: 13, fontWeight: 800 }}>단축키</span>
        <button
          onClick={onClose}
          aria-label="단축키 안내 닫기"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--theme-textMuted, #64748b)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >×</button>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ITEMS.map(([key, desc]) => (
          <li key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <code style={{
              background: 'var(--theme-codeBg, #0a0f1e)',
              border: '1px solid var(--theme-border, #1e293b)',
              borderRadius: 6,
              padding: '1px 8px',
              fontSize: 11,
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--theme-accent, #818cf8)',
              whiteSpace: 'nowrap',
            }}>{key}</code>
            <span style={{ color: 'var(--theme-textMuted, #94a3b8)', fontSize: 12 }}>{desc}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
