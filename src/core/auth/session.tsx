import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { fromB64, hashLogin, normalizeLogin, toB64, type Bytes } from '../crypto'
import { createStore, type DataStore } from '../storage'
import { fetchAuthFile, openAuthFile, WrongPasswordError, type Bundle } from './authFile'

const STORAGE_KEY = 'tutor:session'

interface StoredSession {
  login: string
  key: string
  bundle: Bundle
}

export interface Session {
  login: string
  key: Bytes
  bundle: Bundle
  /** Репозиторий с данными. */
  data: DataStore
  /** Репозиторий сайта: только у репетитора, туда пишутся файлы входа. */
  site: DataStore | null
}

interface SessionContextValue {
  session: Session | null
  signIn(login: string, password: string, remember: boolean): Promise<Session>
  /** Вход сразу после установки: пароль уже проверять не нужно. */
  adopt(login: string, key: Bytes, bundle: Bundle): void
  signOut(): void
}

const SessionContext = createContext<SessionContextValue | null>(null)

function hydrate(stored: StoredSession): Session {
  const { bundle } = stored
  return {
    login: stored.login,
    key: fromB64(stored.key),
    bundle,
    data: createStore(bundle.dataRepo, bundle.githubToken),
    site: bundle.role === 'admin' ? createStore(bundle.siteRepo, bundle.githubToken) : null,
  }
}

function readStored(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY)
    return raw ? hydrate(JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

function persist(stored: StoredSession | null, remember: boolean): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_KEY)
    if (stored) (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Хранилище недоступно (приватный режим): сессия проживёт до перезагрузки страницы.
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readStored)

  const adopt = useCallback((login: string, key: Bytes, bundle: Bundle) => {
    const stored: StoredSession = { login, key: toB64(key), bundle }
    persist(stored, false)
    setSession(hydrate(stored))
  }, [])

  const signIn = useCallback(async (login: string, password: string, remember: boolean) => {
    const normalized = normalizeLogin(login)
    const file = await fetchAuthFile(await hashLogin(normalized))
    // Одинаковый ответ на неизвестный логин и на неверный пароль.
    if (!file) throw new WrongPasswordError()
    const { key, bundle } = await openAuthFile(file, password)
    const stored: StoredSession = { login: normalized, key: toB64(key), bundle }
    persist(stored, remember)
    const next = hydrate(stored)
    setSession(next)
    return next
  }, [])

  const signOut = useCallback(() => {
    persist(null, false)
    setSession(null)
  }, [])

  const value = useMemo(() => ({ session, signIn, adopt, signOut }), [session, signIn, adopt, signOut])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useAuth(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useAuth вызван вне SessionProvider')
  return ctx
}

/** Сессия на защищённых страницах: там она гарантированно есть. */
export function useSession(): Session {
  const { session } = useAuth()
  if (!session) throw new Error('Страница открыта без входа')
  return session
}
