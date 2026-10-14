import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

/** `required` indica si la app usa contraseña; `logout` cierra la sesión en este dispositivo. */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthGate>')
  return context
}
