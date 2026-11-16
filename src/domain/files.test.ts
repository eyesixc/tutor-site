import { describe, expect, it } from 'vitest'
import type { Session } from '../core/auth/session'
import { generateKey } from '../core/crypto'
import { ConflictError, type DataStore } from '../core/storage'
import { canPreview, fileKind, GITHUB_LIMIT, loadBlob, mimeOf, pickFiles, storeFile, validateUpload } from './files'
import type { FileMeta } from './types'

function memoryStore(): DataStore & { files: Map<string, Uint8Array<ArrayBuffer>> } {
  const files = new Map<string, Uint8Array<ArrayBuffer>>()
  return {
    files,
    async read() {
      return null
    },
    async write() {
      return 'sha'
    },
    async remove(path) {
      files.delete(path)
    },
    async list() {
      return []
    },
    async readBytes(path) {
      return files.get(path) ?? null
    },
    async writeBytes(path, bytes) {
      if (files.has(path)) throw new ConflictError(path)
      files.set(path, bytes)
    },
  }
}

function fakeSession(store: DataStore): Session {
  return {
    login: 'x',
    key: generateKey(),
    data: store,
    site: null,
    bundle: { role: 'student', userId: 's1', dataRepo: 'o/d', githubToken: 't', diskToken: '' },
  }
}

const meta = (name: string, store: FileMeta['store'] = 'github'): FileMeta => ({
  id: name,
  name,
  mime: mimeOf(name),
  size: 10,
  store,
  path: 'p',
  uploadedAt: '',
  encrypted: false,
})

describe('проверка загружаемых файлов', () => {
  it('принимает учебные форматы', () => {
    for (const name of ['конспект.pdf', 'задачи.DOCX', 'тренажёр.html', 'разбор.mp4', 'фото.jpg', 'решение.py']) {
      expect(() => validateUpload({ name, size: 1000 })).not.toThrow()
    }
  })

  it('отклоняет исполняемые файлы, пустые и слишком большие', () => {
    expect(() => validateUpload({ name: 'virus.exe', size: 1000 })).toThrow()
    expect(() => validateUpload({ name: 'run.bat', size: 1000 })).toThrow()
    expect(() => validateUpload({ name: 'без_расширения', size: 1000 })).toThrow()
    expect(() => validateUpload({ name: 'a.pdf', size: 0 })).toThrow()
    expect(() => validateUpload({ name: 'a.mp4', size: 600 * 1024 * 1024 })).toThrow()
    expect(() => validateUpload({ name: 'a.pdf', size: 60 * 1024 * 1024 }, 50 * 1024 * 1024)).toThrow()
  })
})

describe('тип и просмотр', () => {
  it('определяет тип по расширению', () => {
    expect(fileKind(meta('a.html'))).toBe('html')
    expect(fileKind(meta('a.pdf'))).toBe('pdf')
    expect(fileKind(meta('a.png'))).toBe('image')
    expect(fileKind(meta('a.mp4'))).toBe('video')
    expect(fileKind(meta('a.py'))).toBe('text')
    expect(fileKind(meta('a.docx'))).toBe('other')
  })

  it('на сайте открывается всё читаемое из репозитория, а с Диска только видео и звук', () => {
    expect(canPreview(meta('a.html'))).toBe(true)
    expect(canPreview(meta('a.docx'))).toBe(false)
    expect(canPreview(meta('a.mp4', 'disk'))).toBe(true)
    expect(canPreview(meta('a.pdf', 'disk'))).toBe(false)
  })

  it('подбирает файлы по идентификаторам в заданном порядке и пропускает удалённые', () => {
    const all = [meta('a.pdf'), meta('b.pdf')]
    expect(pickFiles(all, ['b.pdf', 'нет', 'a.pdf']).map((f) => f.name)).toEqual(['b.pdf', 'a.pdf'])
  })
})

describe('хранение', () => {
  const file = (name: string, text: string) => new File([text], name, { type: '' })

  it('общий файл сохраняется как есть', async () => {
    const store = memoryStore()
    const session = fakeSession(store)
    const saved = await storeFile(session, file('конспект.pdf', 'PDF-данные'), { kind: 'shared' })
    expect(saved.store).toBe('github')
    expect(saved.encrypted).toBe(false)
    expect(saved.path).toMatch(/^files\/.+\.pdf$/)
    expect(await (await loadBlob(session, saved)).text()).toBe('PDF-данные')
  })

  it('личный файл зашифрован: читается только своим ключом', async () => {
    const store = memoryStore()
    const session = fakeSession(store)
    const key = generateKey()
    const saved = await storeFile(session, file('решение.py', 'print(42)'), { kind: 'student', studentId: 's1', key })
    expect(saved.encrypted).toBe(true)
    expect(saved.path).toMatch(/^students\/s1\/files\/.+\.enc$/)
    const raw = new TextDecoder().decode(store.files.get(saved.path))
    expect(raw).not.toContain('print(42)')
    expect(await (await loadBlob(session, saved, key)).text()).toBe('print(42)')
    await expect(loadBlob(session, saved, generateKey())).rejects.toThrow()
    await expect(loadBlob(session, saved)).rejects.toThrow()
  })

  it('файл больше 20 МБ без Диска не принимается', async () => {
    const session = fakeSession(memoryStore())
    const big = new File([new Uint8Array(GITHUB_LIMIT + 1)], 'video.mp4')
    await expect(storeFile(session, big, { kind: 'shared' })).rejects.toThrow(/Яндекс Диск/)
  })
})
