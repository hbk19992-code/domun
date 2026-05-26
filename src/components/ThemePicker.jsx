import { useTheme } from '../hooks/useTheme'

export function ThemeSelectInline() {
  const { theme, setTheme, themeOptions } = useTheme()
  return (
    <select
      value={theme}
      onChange={(e) => setTheme(e.target.value)}
      aria-label="화면 테마 선택"
      style={{
        background: 'var(--theme-elevated, #0f172a)',
        border: '1px solid var(--theme-border, #334155)',
        borderRadius: 8,
        color: 'var(--theme-textMuted, #94a3b8)',
        padding: '6px 8px',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {themeOptions.map((opt) => (
        <option key={opt.key} value={opt.key}>{opt.label}</option>
      ))}
    </select>
  )
}

export function ThemePickerCard() {
  const { theme, setTheme, themeOptions } = useTheme()

  return (
    <div style={{
      background: 'var(--theme-panel, rgba(15,23,42,0.6))',
      border: '1px solid var(--theme-border, #1e293b)',
      borderRadius: 16,
      padding: 20,
      gridColumn: '1 / -1',
    }}>
      <div style={{ color: 'var(--theme-text, #e2e8f0)', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        화면 테마
      </div>
      <div style={{ color: 'var(--theme-textDim, #64748b)', fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
        다크, 라이트, 세피아, OLED 절전, 고대비 테마를 선택할 수 있습니다.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        {themeOptions.map((opt) => {
          const active = theme === opt.key
          return (
            <button
              key={opt.key}
              onClick={() => setTheme(opt.key)}
              aria-pressed={active}
              style={{
                background: active ? 'var(--theme-accentSoft, rgba(99,102,241,0.15))' : 'var(--theme-elevated, #0f172a)',
                border: `1.5px solid ${active ? 'var(--theme-accent, #6366f1)' : 'var(--theme-border, #1e293b)'}`,
                borderRadius: 10,
                padding: '10px 12px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ color: active ? 'var(--theme-accent, #818cf8)' : 'var(--theme-text, #e2e8f0)', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {opt.label}
              </div>
              <div style={{ color: 'var(--theme-textDim, #64748b)', fontSize: 11, lineHeight: 1.4, wordBreak: 'keep-all' }}>
                {opt.description}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
