import { useCallback, useEffect, useMemo, useState } from 'react'

import { ThemeContext } from '@/hooks/useTheme'

const STORAGE_KEY = 'finan-theme'

export function ThemeProvider({ children }) {
  // index.html ya aplica la clase `dark` antes de pintar (preferencia guardada o del sistema).
  const [theme, setTheme] = useState(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Sin almacenamiento (modo privado): el tema dura lo que la pestaña.
      }
      return next
    })
  }, [])

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
