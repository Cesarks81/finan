import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { api, UNAUTHORIZED_EVENT } from '@/api/client'
import { LoginScreen } from '@/components/LoginScreen'
import { Button } from '@/components/ui/button'
import { AuthContext } from '@/hooks/useAuth'

function Centered({ children }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">{children}</main>
}

/**
 * Muestra la app solo con una sesión válida. Si el servidor no usa contraseña (desarrollo
 * local) pasa directamente; si la API responde 401 en cualquier momento, vuelve al login.
 */
export function AuthGate({ children }) {
  const [state, setState] = useState({ status: 'checking', required: false, error: null })

  const fetchStatus = useCallback(() => {
    api.authStatus().then(
      ({ required, authenticated }) => setState({ status: authenticated ? 'ready' : 'login', required, error: null }),
      (error) => setState({ status: 'error', required: false, error }),
    )
  }, [])

  useEffect(fetchStatus, [fetchStatus])

  const retry = () => {
    setState((current) => ({ ...current, status: 'checking' }))
    fetchStatus()
  }

  useEffect(() => {
    const showLogin = () => setState((current) => ({ ...current, status: 'login' }))
    window.addEventListener(UNAUTHORIZED_EVENT, showLogin)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, showLogin)
  }, [])

  const logout = useCallback(() => {
    api.logout()
    setState((current) => ({ ...current, status: 'login' }))
  }, [])
  const value = useMemo(() => ({ required: state.required, logout }), [state.required, logout])

  if (state.status === 'checking') {
    return (
      <Centered>
        <LoaderCircle className="text-muted-foreground size-6 animate-spin" aria-label="Cargando" />
      </Centered>
    )
  }
  if (state.status === 'error') {
    return (
      <Centered>
        <p className="text-muted-foreground max-w-xs text-sm">{state.error.message}</p>
        <Button variant="outline" onClick={retry}>
          Reintentar
        </Button>
      </Centered>
    )
  }
  if (state.status === 'login') {
    return <LoginScreen onSuccess={() => setState((current) => ({ ...current, status: 'ready', required: true }))} />
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
