import {
  decryptBytes,
  decryptJson,
  deriveKeyFromPassword,
  encryptBytes,
  encryptJson,
  fromB64,
  PBKDF2_ITERATIONS,
  randomBytes,
  toB64,
  type Bytes,
} from '../crypto'
import { createLocalStore } from '../storage/local'

/** Публичный файл входа. Всё содержимое, кроме соли, зашифровано. */
export interface AuthFile {
  v: 1
  salt: string
  iterations: number
  /** Ключ пользователя, зашифрованный ключом из пароля. */
  wrappedKey: string
  /** Токены и идентификаторы, зашифрованные ключом пользователя. */
  bundle: string
}

interface BaseBundle {
  userId: string
  dataRepo: string
  githubToken: string
  diskToken: string
}

export interface StudentBundle extends BaseBundle {
  role: 'student'
}

export interface AdminBundle extends BaseBundle {
  role: 'admin'
  name: string
  siteRepo: string
  /** Токен с правом записи только в репозиторий данных: выдаётся ученикам. */
  studentGithubToken: string
}

export type Bundle = StudentBundle | AdminBundle

export class WrongPasswordError extends Error {
  constructor() {
    super('Неверный логин или пароль')
    this.name = 'WrongPasswordError'
  }
}

export const LOCAL_SITE_REPO = 'local/site'
export const LOCAL_MODE_FLAG = 'tutor:local'

export function authFilePath(loginHash: string): string {
  return `public/auth/${loginHash}.json`
}

export async function buildAuthFile(
  password: string,
  key: Bytes,
  bundle: Bundle,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<AuthFile> {
  const salt = randomBytes(16)
  const kek = await deriveKeyFromPassword(password, salt, iterations)
  return {
    v: 1,
    salt: toB64(salt),
    iterations,
    wrappedKey: toB64(await encryptBytes(kek, key)),
    bundle: await encryptJson(key, bundle),
  }
}

export async function openAuthFile(file: AuthFile, password: string): Promise<{ key: Bytes; bundle: Bundle }> {
  const kek = await deriveKeyFromPassword(password, fromB64(file.salt), file.iterations)
  let key: Bytes
  try {
    key = await decryptBytes(kek, fromB64(file.wrappedKey))
  } catch {
    throw new WrongPasswordError()
  }
  return { key, bundle: await decryptJson<Bundle>(key, file.bundle) }
}

/** Заменяет токены в файле входа, не зная пароля: нужен только ключ пользователя. */
export async function rebundle(file: AuthFile, key: Bytes, bundle: Bundle): Promise<AuthFile> {
  return { ...file, bundle: await encryptJson(key, bundle) }
}

function isAuthFile(value: unknown): value is AuthFile {
  const f = value as Partial<AuthFile> | null
  return !!f && f.v === 1 && typeof f.salt === 'string' && typeof f.wrappedKey === 'string' && typeof f.bundle === 'string'
}

export function isLocalMode(): boolean {
  try {
    return import.meta.env.DEV && localStorage.getItem(LOCAL_MODE_FLAG) === '1'
  } catch {
    return false
  }
}

export async function fetchAuthFile(loginHash: string): Promise<AuthFile | null> {
  if (isLocalMode()) {
    const file = await createLocalStore(LOCAL_SITE_REPO).read(authFilePath(loginHash))
    return file ? (JSON.parse(file.text) as AuthFile) : null
  }
  let res: Response
  try {
    res = await fetch(`${import.meta.env.BASE_URL}auth/${loginHash}.json`, { cache: 'no-store' })
  } catch {
    throw new Error('Нет связи с сайтом. Проверьте интернет и повторите.')
  }
  if (!res.ok) return null
  try {
    const json: unknown = await res.json()
    return isAuthFile(json) ? json : null
  } catch {
    return null // сервер разработки отдаёт вместо отсутствующего файла HTML-страницу
  }
}
