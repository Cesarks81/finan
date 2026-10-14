import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Segundos → "0:59", "12:00" o "1:00:00". */
function formatCountdown(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = String(seconds % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}

export function LoginScreen({ onSuccess }) {
  const inputRef = useRef(null)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  // Bloqueo por intentos fallidos: hora (ms) a la que termina y segundos que quedan.
  const [lockedUntil, setLockedUntil] = useState(null)
  const [remaining, setRemaining] = useState(0)
  const locked = lockedUntil !== null

  useEffect(() => {
    if (lockedUntil === null) return
    const timer = setInterval(() => {
      const left = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (left > 0) {
        setRemaining(left)
      } else {
        setLockedUntil(null)
        inputRef.current?.focus()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [lockedUntil])

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api.login(password)
      onSuccess()
    } catch (err) {
      setPassword('')
      setSubmitting(false)
      if (err.status === 429 && err.retryAfter) {
        setRemaining(err.retryAfter)
        setLockedUntil(Date.now() + err.retryAfter * 1000)
      } else {
        setError(err.message)
        inputRef.current?.focus()
      }
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="grid w-full max-w-xs gap-6">
        <div className="grid gap-1 text-center">
          <h1 className="text-3xl font-bold tracking-tight">finan</h1>
          <p className="text-muted-foreground text-sm">Introduce tu contraseña para ver tu patrimonio.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="login-password">Contraseña</Label>
          <Input
            ref={inputRef}
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={locked}
            required
            autoFocus
          />
        </div>
        {locked ? (
          <p role="alert" className="text-destructive text-sm">
            Demasiados intentos fallidos. Vuelve a intentarlo en{' '}
            <span className="font-medium tabular-nums">{formatCountdown(remaining)}</span>.
          </p>
        ) : (
          error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )
        )}
        <Button type="submit" disabled={submitting || locked} className="w-full">
          {submitting && <LoaderCircle className="animate-spin" />}
          Entrar
        </Button>
      </form>
    </main>
  )
}
