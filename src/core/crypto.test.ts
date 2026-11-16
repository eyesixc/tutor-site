import { describe, expect, it } from 'vitest'
import { buildAuthFile, openAuthFile, rebundle, WrongPasswordError, type StudentBundle } from './auth/authFile'
import {
  decryptJson,
  encryptJson,
  fromB64,
  generateKey,
  generatePassword,
  hashLogin,
  toB64,
  utf8ToB64,
  b64ToUtf8,
} from './crypto'

const bundle: StudentBundle = {
  role: 'student',
  userId: 'abc',
  dataRepo: 'o/data',
  githubToken: 'gh-secret',
  diskToken: 'disk-secret',
}

describe('шифрование', () => {
  it('расшифровывает то, что зашифровало', async () => {
    const key = generateKey()
    const value = { оценка: 5, комментарий: 'Отлично 👍' }
    expect(await decryptJson(key, await encryptJson(key, value))).toEqual(value)
  })

  it('не расшифровывает чужим ключом', async () => {
    const secret = await encryptJson(generateKey(), { score: 10 })
    await expect(decryptJson(generateKey(), secret)).rejects.toThrow()
  })

  it('замечает подмену данных', async () => {
    const key = generateKey()
    const bytes = fromB64(await encryptJson(key, { score: 10 }))
    bytes[bytes.length - 1] ^= 1
    await expect(decryptJson(key, toB64(bytes))).rejects.toThrow()
  })

  it('каждый раз даёт разный шифртекст', async () => {
    const key = generateKey()
    expect(await encryptJson(key, 'x')).not.toBe(await encryptJson(key, 'x'))
  })

  it('кодирует кириллицу в base64 и обратно', () => {
    expect(b64ToUtf8(utf8ToB64('Привет, мир'))).toBe('Привет, мир')
  })
})

describe('файл входа', () => {
  it('открывается верным паролем и отдаёт ключ и токены', async () => {
    const key = generateKey()
    const file = await buildAuthFile('pass-123', key, bundle, 1000)
    const opened = await openAuthFile(file, 'pass-123')
    expect(toB64(opened.key)).toBe(toB64(key))
    expect(opened.bundle).toEqual(bundle)
  })

  it('отклоняет неверный пароль', async () => {
    const file = await buildAuthFile('pass-123', generateKey(), bundle, 1000)
    await expect(openAuthFile(file, 'pass-124')).rejects.toBeInstanceOf(WrongPasswordError)
  })

  it('не содержит токенов и ключа в открытом виде', async () => {
    const key = generateKey()
    const text = JSON.stringify(await buildAuthFile('pass-123', key, bundle, 1000))
    expect(text).not.toContain('gh-secret')
    expect(text).not.toContain('disk-secret')
    expect(text).not.toContain(toB64(key))
  })

  it('позволяет заменить токены без пароля, пароль продолжает работать', async () => {
    const key = generateKey()
    const file = await buildAuthFile('pass-123', key, bundle, 1000)
    const next = await rebundle(file, key, { ...bundle, githubToken: 'new-token' })
    expect((await openAuthFile(next, 'pass-123')).bundle.githubToken).toBe('new-token')
  })
})

describe('логины и пароли', () => {
  it('хеш логина не зависит от регистра и пробелов', async () => {
    expect(await hashLogin('  Petya ')).toBe(await hashLogin('petya'))
    expect(await hashLogin('petya')).not.toBe(await hashLogin('petya2'))
  })

  it('генерирует пароли нужной длины без похожих символов', () => {
    const passwords = Array.from({ length: 200 }, () => generatePassword())
    for (const p of passwords) {
      expect(p).toHaveLength(20)
      expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/)
    }
    expect(new Set(passwords).size).toBe(200)
  })
})
