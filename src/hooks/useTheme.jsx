import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { THEMES, DEFAULT_THEME, THEME_KEYS } from '../styles/themes'

const STORAGE_KEY = 'app_theme'

const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  themeOptions: [],
})

function readSavedTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && THEME_KEYS.includes(saved)) return saved
  } catch {}

  // 사용자 시스템 환경설정 존중
  if (typeof window !== 'undefined' && window.matchMedia) {
    if (window.matchMedia('(prefers-contrast: more)').matches) return 'highContrast'
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  }
  return DEFAULT_THEME
}

function applyThemeToDom(themeKey) {
  if (typeof document === 'undefined') return
  const theme = THEMES[themeKey] || THEMES[DEFAULT_THEME]
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
  // body 배경/텍스트 색은 즉시 반영되도록 강제
  document.body.style.background = theme.vars['--theme-bg']
  document.body.style.color = theme.vars['--theme-text']
  // 상태 표시용 data 속성 - CSS에서 [data-theme="light"] 같은 셀렉터 사용 가능
  root.setAttribute('data-theme', themeKey)
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readSavedTheme())

  useEffect(() => {
    applyThemeToDom(theme)
  }, [theme])

  const setTheme = useCallback((next) => {
    if (!THEME_KEYS.includes(next)) return
    setThemeState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch {}
  }, [])

  const value = {
    theme,
    setTheme,
    themeOptions: THEME_KEYS.map((key) => ({
      key,
      label: THEMES[key].label,
      description: THEMES[key].description,
    })),
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
