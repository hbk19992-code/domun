import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { DEFAULT_THEME, THEME_KEYS, THEMES } from '../styles/themes'

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
  document.body.style.background = theme.vars['--theme-bg']
  document.body.style.color = theme.vars['--theme-text']
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
