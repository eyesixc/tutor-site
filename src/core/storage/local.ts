import { fromB64, newId, toB64 } from '../crypto'
import { ConflictError, type DataStore } from './types'

// Хранилище в localStorage с тем же поведением, что и у GitHub (версии, конфликты).
// Используется только при локальной разработке, чтобы проверять сценарии без токенов.

export const LOCAL_REPO_PREFIX = 'local/'

interface Entry {
  text: string
  sha: string
}

export function createLocalStore(repo: string): DataStore {
  const prefix = `tutor:fs:${repo}:`
  const get = (path: string): Entry | null => {
    const raw = localStorage.getItem(prefix + path)
    return raw ? (JSON.parse(raw) as Entry) : null
  }

  return {
    async read(path) {
      return get(path)
    },
    async write(path, text, { sha }) {
      const current = get(path)
      if ((current?.sha ?? undefined) !== sha) throw new ConflictError(path)
      const next = { text, sha: newId(16) }
      localStorage.setItem(prefix + path, JSON.stringify(next))
      return next.sha
    },
    async remove(path) {
      localStorage.removeItem(prefix + path)
    },
    async readBytes(path) {
      const entry = get(path)
      return entry ? fromB64(entry.text) : null
    },
    async writeBytes(path, bytes) {
      if (get(path)) throw new ConflictError(path)
      localStorage.setItem(prefix + path, JSON.stringify({ text: toB64(bytes), sha: newId(16) }))
    },
    async list(dir) {
      const base = prefix + dir.replace(/\/$/, '') + '/'
      const names: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(base) && !key.slice(base.length).includes('/')) names.push(key.slice(base.length))
      }
      return names
    },
  }
}
