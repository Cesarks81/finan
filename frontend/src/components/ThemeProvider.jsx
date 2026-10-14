import { useCallback, useEffect, useMemo, useState } from 'react'

import { ThemeContext } from '@/hooks/useTheme'

const STORAGE_KEY = 'finan-theme'
// Mismo color que --background en index.css: tiñe la barra de estado/título en móvil.
const THEME_COLORS = { light: '#fafafa', dark: '#0a0a0a' }

export function ThemeProvider({ children }) {
  // index.html ya aplica la clase `dark` antes de pintar (preferencia guardada o del sistema).
  const [theme, setThemeState] = useState(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
  }, [theme])

  const setTheme = useCallback((next) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Sin almacenamiento (modo privado): el tema dura lo que la pestaña.
    }
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
