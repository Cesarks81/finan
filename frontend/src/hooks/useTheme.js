import { createContext, useContext } from 'react'

export const ThemeContext = createContext(null)

/** Tema actual ('light' | 'dark') y `setTheme` para cambiarlo (se guarda en el navegador). */
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return context
}
