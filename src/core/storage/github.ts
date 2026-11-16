import { b64ToUtf8, utf8ToB64 } from '../crypto'
import { ConflictError, StorageError, type DataStore, type StoredFile } from './types'

const API = 'https://api.github.com'

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function describe(status: number, fallback: string, apiMessage = ''): string {
  if (status === 401) return 'Токен GitHub недействителен или истёк. Замените его в настройках.'
  if (status === 429 || (status === 403 && /rate limit/i.test(apiMessage))) {
    return 'GitHub временно ограничил запросы. Повторите через минуту.'
  }
  if (status === 403) {
    return 'У токена нет права на это действие. Проверьте, что у него Contents: Read and write для нужного репозитория.'
  }
  if (status === 404) return 'Репозиторий не найден или у токена нет к нему доступа.'
  if (status >= 500) return 'GitHub сейчас недоступен. Повторите позже.'
  return fallback
}

async function failure(res: Response, fallback: string): Promise<StorageError> {
  let apiMessage = ''
  try {
    apiMessage = ((await res.json()) as { message?: string }).message ?? ''
  } catch {
    // Тело ответа не JSON: остаёмся с общим текстом.
  }
  return new StorageError(describe(res.status, fallback, apiMessage), res.status)
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

/** Проверяет, что токен видит репозиторий, и сообщает, приватный ли он. */
export async function checkRepoAccess(repo: string, token: string): Promise<{ isPrivate: boolean }> {
  const res = await githubRequest(token, `${API}/repos/${repo}`)
  if (!res.ok) throw await failure(res, `Не удалось открыть ${repo}`)
  const json = (await res.json()) as { private: boolean }
  return { isPrivate: json.private }
}

/**
 * Проверяет право записи на деле: создаёт и сразу удаляет служебный файл.
 * Поле permissions в ответе GitHub описывает права владельца, а не токена, поэтому ему верить нельзя.
 */
export async function canWriteToRepo(repo: string, token: string): Promise<boolean> {
  const url = `${API}/repos/${repo}/contents/.tutor-check-${Date.now().toString(36)}`
  const res = await githubRequest(token, url, {
    method: 'PUT',
    body: JSON.stringify({ message: 'Проверка права записи', content: utf8ToB64('check') }),
  })
  if (res.status === 403 || res.status === 404) return false
  if (!res.ok) throw await failure(res, `Не удалось проверить запись в ${repo}`)
  const json = (await res.json()) as { content: { sha: string } }
  const del = await githubRequest(token, url, {
    method: 'DELETE',
    body: JSON.stringify({ message: 'Проверка права записи: уборка', sha: json.content.sha }),
  })
  if (!del.ok) throw await failure(del, `Не удалось убрать служебный файл из ${repo}`)
  return true
}

export async function getRateLimit(token: string): Promise<{ remaining: number; limit: number }> {
  const res = await githubRequest(token, `${API}/rate_limit`)
  if (!res.ok) throw await failure(res, 'Не удалось получить лимиты GitHub')
  const json = (await res.json()) as { rate: { remaining: number; limit: number } }
  return json.rate
}

export function createGitHubStore(repo: string, token: string): DataStore {
  const url = (path: string) => `${API}/repos/${repo}/contents/${encodePath(path)}`

  async function read(path: string): Promise<StoredFile | null> {
    const res = await githubRequest(token, url(path))
    if (res.status === 404) return null
    if (!res.ok) throw await failure(res, `Не удалось прочитать ${path}`)
    const json = (await res.json()) as { content?: string; sha: string; size: number } | unknown[]
    if (Array.isArray(json)) throw new StorageError(`${path} — папка, а не файл`)
    if (json.content || json.size === 0) return { text: b64ToUtf8(json.content ?? ''), sha: json.sha }
    // Файлы больше 1 МБ GitHub отдаёт без содержимого: запрашиваем его отдельно.
    const raw = await githubRequest(token, url(path), { headers: { Accept: 'application/vnd.github.raw+json' } })
    if (!raw.ok) throw await failure(raw, `Не удалось прочитать ${path}`)
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
      if (!res.ok) throw await failure(res, `Не удалось сохранить ${path}`)
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
        throw await failure(res, `Не удалось удалить ${path}`)
      }
    },

    async list(dir) {
      const res = await githubRequest(token, url(dir))
      if (res.status === 404) return []
      if (!res.ok) throw await failure(res, `Не удалось открыть ${dir}`)
      const json = (await res.json()) as { name: string; type: string }[] | unknown
      return Array.isArray(json) ? json.filter((e) => e.type === 'file').map((e) => e.name) : []
    },
  }
}
