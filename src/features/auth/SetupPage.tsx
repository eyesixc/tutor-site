import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LOCAL_MODE_FLAG } from '../../core/auth/authFile'
import { useAuth } from '../../core/auth/session'
import { LOCAL_SETUP, runSetup, type SetupInput, type SetupResult } from '../../domain/setup'
import { ValidationError } from '../../domain/students'
import { Button } from '../../ui/Button'
import { Checkbox, TextField } from '../../ui/Field'
import { CopyValue, errorMessage } from '../../ui/bits'
import { AuthLayout } from './AuthLayout'

const EMPTY: SetupInput = {
  name: '',
  login: '',
  dataRepo: '',
  siteRepo: '',
  adminToken: '',
  studentToken: '',
  diskToken: '',
}

export function SetupPage() {
  const { adopt } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<SetupInput>(EMPTY)
  const [local, setLocal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('')
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SetupResult | null>(null)
  const [saved, setSaved] = useState(false)

  const set = (field: keyof SetupInput) => (value: string) => setForm((f) => ({ ...f, [field]: value }))
  const err = (field: string) => (fieldError?.field === field ? fieldError.message : null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setFieldError(null)
    try {
      if (local) localStorage.setItem(LOCAL_MODE_FLAG, '1')
      else localStorage.removeItem(LOCAL_MODE_FLAG)
      setResult(await runSetup(local ? { ...form, ...LOCAL_SETUP } : form, setStep))
    } catch (cause) {
      if (cause instanceof ValidationError) setFieldError({ field: cause.field, message: cause.message })
      else setError(errorMessage(cause))
    } finally {
      setBusy(false)
      setStep('')
    }
  }

  if (result) {
    return (
      <AuthLayout wide>
        <h1 className="text-2xl">Платформа установлена</h1>
        <p className="mt-2 max-w-[60ch] text-muted">
          Сохраните пароль сейчас: он показывается один раз и нигде не хранится. Если он потеряется, восстановить
          доступ к данным учеников будет невозможно.
        </p>
        <div className="mt-6 flex flex-col gap-4">
          <CopyValue label="Логин" value={result.login} />
          <CopyValue label="Пароль" value={result.password} />
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <Checkbox label="Пароль сохранён в надёжном месте" checked={saved} onChange={setSaved} />
          <Button
            variant="primary"
            disabled={!saved}
            onClick={() => {
              adopt(result.login, result.key, result.bundle)
              navigate('/admin', { replace: true })
            }}
          >
            Открыть панель репетитора
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout wide>
      <h1 className="text-2xl">Первичная установка</h1>
      <p className="mt-2 max-w-[60ch] text-muted">
        Выполняется один раз. Токены шифруются вашим паролем прямо в браузере и никуда, кроме GitHub и Яндекс
        Диска, не передаются.
      </p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-8" noValidate>
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-lg font-semibold">Репетитор</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Имя" value={form.name} onChange={set('name')} error={err('name')} autoComplete="name" />
            <TextField
              label="Логин"
              value={form.login}
              onChange={set('login')}
              error={err('login')}
              autoCapitalize="off"
              spellCheck={false}
              autoComplete="off"
              mono
            />
          </div>
        </fieldset>

        {import.meta.env.DEV && (
          <Checkbox
            label="Локальный режим разработки: данные в этом браузере, без GitHub"
            checked={local}
            onChange={setLocal}
          />
        )}

        {!local && (
          <>
            <fieldset className="flex flex-col gap-4">
              <legend className="mb-3 text-lg font-semibold">GitHub</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Репозиторий данных"
                  hint="Приватный. Формат: логин/репозиторий"
                  value={form.dataRepo}
                  onChange={set('dataRepo')}
                  error={err('dataRepo')}
                  placeholder="ivanov/tutor-data"
                  autoCapitalize="off"
                  spellCheck={false}
                  mono
                />
                <TextField
                  label="Репозиторий сайта"
                  hint="Публичный, из него работает сайт"
                  value={form.siteRepo}
                  onChange={set('siteRepo')}
                  error={err('siteRepo')}
                  placeholder="ivanov/tutor-site"
                  autoCapitalize="off"
                  spellCheck={false}
                  mono
                />
              </div>
              <TextField
                label="Токен репетитора"
                hint="Запись в оба репозитория"
                type="password"
                value={form.adminToken}
                onChange={set('adminToken')}
                error={err('adminToken')}
                autoComplete="off"
                mono
              />
              <TextField
                label="Токен учеников"
                hint="Запись только в репозиторий данных"
                type="password"
                value={form.studentToken}
                onChange={set('studentToken')}
                error={err('studentToken')}
                autoComplete="off"
                mono
              />
            </fieldset>

            <fieldset className="flex flex-col gap-4">
              <legend className="mb-3 text-lg font-semibold">Яндекс Диск</legend>
              <TextField
                label="Токен Диска"
                hint="Можно оставить пустым и добавить позже в настройках"
                type="password"
                value={form.diskToken}
                onChange={set('diskToken')}
                error={err('diskToken')}
                autoComplete="off"
                mono
              />
            </fieldset>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-control bg-red-soft px-3 py-2.5 text-sm text-red">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="primary" loading={busy}>
            {busy ? step || 'Устанавливаю' : 'Установить платформу'}
          </Button>
          <Link to="/login" className="text-pen underline">
            Платформа уже установлена, войти
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
