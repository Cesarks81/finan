import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginScreen({ onSuccess }) {
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api.login(password)
      onSuccess()
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
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
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting && <LoaderCircle className="animate-spin" />}
          Entrar
        </Button>
      </form>
    </main>
  )
}
