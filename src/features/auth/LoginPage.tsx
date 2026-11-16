import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/session'
import { Button } from '../../ui/Button'
import { Checkbox, TextField } from '../../ui/Field'
import { errorMessage } from '../../ui/bits'
import { AuthLayout } from './AuthLayout'

export function homePath(role: 'admin' | 'student'): string {
  return role === 'admin' ? '/admin' : '/'
}

export function LoginPage() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session) return <Navigate to={homePath(session.bundle.role)} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!login.trim() || !password) {
      setError('Введите логин и пароль')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next = await signIn(login, password, remember)
      navigate(homePath(next.bundle.role), { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl">Вход в кабинет</h1>
      <p className="mt-2 text-muted">Логин и пароль выдаёт репетитор.</p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
        <TextField
          label="Логин"
          value={login}
          onChange={setLogin}
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus
        />
        <TextField
          label="Пароль"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <Checkbox label="Запомнить на этом устройстве" checked={remember} onChange={setRemember} />
        {error && (
          <p role="alert" className="rounded-control bg-red-soft px-3 py-2.5 text-sm text-red">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={busy}>
          {busy ? 'Проверяю пароль' : 'Войти'}
        </Button>
      </form>
    </AuthLayout>
  )
}
