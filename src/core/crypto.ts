// Шифрование в браузере: AES-256-GCM, ключ из пароля через PBKDF2-SHA256.
// Сервера нет, поэтому это единственная граница между данными учеников.

export type Bytes = Uint8Array<ArrayBuffer>

export const PBKDF2_ITERATIONS = 600_000
const IV_LENGTH = 12

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

export function fromB64(b64: string): Bytes {
  const s = atob(b64.replace(/\s/g, ''))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export function utf8ToB64(text: string): string {
  return toB64(encoder.encode(text))
}

export function b64ToUtf8(b64: string): string {
  return decoder.decode(fromB64(b64))
}

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length))
}

export function generateKey(): Bytes {
  return randomBytes(32)
}

export async function deriveKeyFromPassword(
  password: string,
  salt: Bytes,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<Bytes> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    256,
  )
  return new Uint8Array(bits)
}

async function importAesKey(raw: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** Результат: 12 байт IV, затем шифртекст с меткой подлинности. */
export async function encryptBytes(key: Bytes, data: Bytes): Promise<Bytes> {
  const iv = randomBytes(IV_LENGTH)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importAesKey(key), data)
  const out = new Uint8Array(IV_LENGTH + ct.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(ct), IV_LENGTH)
  return out
}

/** Бросает исключение, если ключ неверный или данные изменены. */
export async function decryptBytes(key: Bytes, payload: Bytes): Promise<Bytes> {
  const iv = payload.slice(0, IV_LENGTH)
  const ct = payload.slice(IV_LENGTH)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await importAesKey(key), ct)
  return new Uint8Array(pt)
}

export async function encryptJson(key: Bytes, value: unknown): Promise<string> {
  return toB64(await encryptBytes(key, encoder.encode(JSON.stringify(value))))
}

export async function decryptJson<T>(key: Bytes, b64: string): Promise<T> {
  return JSON.parse(decoder.decode(await decryptBytes(key, fromB64(b64)))) as T
}

export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase()
}

/** Имя файла входа. По нему нельзя восстановить логин простым просмотром репозитория. */
export async function hashLogin(login: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode('tutor-auth:' + normalizeLogin(login)),
  )
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Без похожих символов (0/O, 1/l/I), чтобы пароль можно было продиктовать или переписать.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function generatePassword(length = 20): string {
  const n = PASSWORD_ALPHABET.length
  const limit = 256 - (256 % n) // отбрасываем хвост, чтобы символы были равновероятны
  let out = ''
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < limit && out.length < length) out += PASSWORD_ALPHABET[b % n]
    }
  }
  return out
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function newId(length = 12): string {
  let out = ''
  for (const b of randomBytes(length)) out += ID_ALPHABET[b % ID_ALPHABET.length]
  return out
}
