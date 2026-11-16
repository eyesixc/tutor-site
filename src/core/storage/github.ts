import { b64ToUtf8, utf8ToB64 } from '../crypto'
import { ConflictError, StorageError, type DataStore, type StoredFile } from './types'

const API = 'https://api.github.com'

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function describe(status: number, fallback: string): string {
  if (status === 401) return 'Токен GitHub недействителен или истёк. Замените его в настройках.'
  if (status === 403 || status === 429) return 'GitHub временно ограничил запросы. Повторите через минуту.'
  if (status === 404) return 'Репозиторий не найден или у токена нет к нему доступа.'
  if (status >= 500) return 'GitHub сейчас недоступен. Повторите позже.'
  return fallback
}

export async function githubRequest(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      // Без этого браузер до минуты отдаёт старую версию файла после записи.
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new StorageError('Нет связи с GitHub. Проверьте интернет и повторите.')
  }
}

/** Проверяет, что токен видит репозиторий и может в него писать. */
export async function checkRepoAccess(repo: string, token: string): Promise<{ canWrite: boolean; isPrivate: boolean }> {
  const res = await githubRequest(token, `${API}/repos/${repo}`)
  if (!res.ok) throw new StorageError(describe(res.status, `Не удалось открыть ${repo}`), res.status)
  const json = (await res.json()) as { private: boolean; permissions?: { push?: boolean } }
  return { canWrite: json.permissions?.push ?? false, isPrivate: json.private }
}

export async function getRateLimit(token: string): Promise<{ remaining: number; limit: number }> {
  const res = await githubRequest(token, `${API}/rate_limit`)
  if (!res.ok) throw new StorageError(describe(res.status, 'Не удалось получить лимиты GitHub'), res.status)
  const json = (await res.json()) as { rate: { remaining: number; limit: number } }
  return json.rate
}

export function createGitHubStore(repo: string, token: string): DataStore {
  const url = (path: string) => `${API}/repos/${repo}/contents/${encodePath(path)}`

  async function read(path: string): Promise<StoredFile | null> {
    const res = await githubRequest(token, url(path))
    if (res.status === 404) return null
    if (!res.ok) throw new StorageError(describe(res.status, `Не удалось прочитать ${path}`), res.status)
    const json = (await res.json()) as { content?: string; sha: string; size: number } | unknown[]
    if (Array.isArray(json)) throw new StorageError(`${path} — папка, а не файл`)
    if (json.content || json.size === 0) return { text: b64ToUtf8(json.content ?? ''), sha: json.sha }
    // Файлы больше 1 МБ GitHub отдаёт без содержимого: запрашиваем его отдельно.
    const raw = await githubRequest(token, url(path), { headers: { Accept: 'application/vnd.github.raw+json' } })
    if (!raw.ok) throw new StorageError(describe(raw.status, `Не удалось прочитать ${path}`), raw.status)
    return { text: await raw.text(), sha: json.sha }
  }

  return {
    read,

    async write(path, text, { sha, message }) {
      const res = await githubRequest(token, url(path), {
        method: 'PUT',
        body: JSON.stringify({ message, content: utf8ToB64(text), ...(sha ? { sha } : {}) }),
      })
      if (res.status === 409 || res.status === 422) throw new ConflictError(path)
      if (!res.ok) throw new StorageError(describe(res.status, `Не удалось сохранить ${path}`), res.status)
      const json = (await res.json()) as { content: { sha: string } }
      return json.content.sha
    },

    async remove(path, message) {
      const current = await read(path)
      if (!current) return
      const res = await githubRequest(token, url(path), {
        method: 'DELETE',
        body: JSON.stringify({ message, sha: current.sha }),
      })
      if (res.status === 409 || res.status === 422) throw new ConflictError(path)
      if (!res.ok && res.status !== 404) {
        throw new StorageError(describe(res.status, `Не удалось удалить ${path}`), res.status)
      }
    },

    async list(dir) {
      const res = await githubRequest(token, url(dir))
      if (res.status === 404) return []
      if (!res.ok) throw new StorageError(describe(res.status, `Не удалось открыть ${dir}`), res.status)
      const json = (await res.json()) as { name: string; type: string }[] | unknown
      return Array.isArray(json) ? json.filter((e) => e.type === 'file').map((e) => e.name) : []
    },
  }
}
