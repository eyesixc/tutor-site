import { decryptJson, encryptJson, type Bytes } from '../crypto'
import { createGitHubStore } from './github'
import { createLocalStore, LOCAL_REPO_PREFIX } from './local'
import { ConflictError, type DataStore } from './types'

export * from './types'

export function isLocalRepo(repo: string): boolean {
  return repo.startsWith(LOCAL_REPO_PREFIX)
}

export function createStore(repo: string, token: string): DataStore {
  return isLocalRepo(repo) ? createLocalStore(repo) : createGitHubStore(repo, token)
}

export interface Loaded<T> {
  value: T
  sha: string
}

/** Чтение и запись JSON-файла: открытого или зашифрованного ключом. */
export interface JsonFile<T> {
  load(): Promise<Loaded<T> | null>
  save(value: T, message: string, sha?: string): Promise<string>
  /**
   * Прочитать, изменить, записать. Если файл успели изменить, операция повторяется
   * на свежей версии, поэтому `change` не должна иметь побочных эффектов.
   */
  update(change: (current: T | null) => T, message: string): Promise<T>
}

const MAX_ATTEMPTS = 4

export function jsonFile<T>(store: DataStore, path: string, key?: Bytes): JsonFile<T> {
  const decode = async (text: string): Promise<T> =>
    key ? decryptJson<T>(key, text) : (JSON.parse(text) as T)
  const encode = async (value: T): Promise<string> =>
    key ? encryptJson(key, value) : JSON.stringify(value, null, 2)

  async function load(): Promise<Loaded<T> | null> {
    const file = await store.read(path)
    return file ? { value: await decode(file.text), sha: file.sha } : null
  }

  async function save(value: T, message: string, sha?: string): Promise<string> {
    return store.write(path, await encode(value), { sha, message })
  }

  async function update(change: (current: T | null) => T, message: string): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const current = await load()
      const next = change(current?.value ?? null)
      try {
        await save(next, message, current?.sha)
        return next
      } catch (error) {
        if (!(error instanceof ConflictError) || attempt >= MAX_ATTEMPTS) throw error
      }
    }
  }

  return { load, save, update }
}
