import type { Session } from '../core/auth/session'
import { decryptBytes, encryptBytes, newId, type Bytes } from '../core/crypto'
import { downloadLink, ensureFolder, removeResource, uploadLink } from '../core/disk'
import { jsonFile } from '../core/storage'
import { ValidationError } from './students'
import { paths, type FileMeta, type SharedFilesFile } from './types'

/** До этого размера файл хранится в репозитории и доступен для просмотра на сайте. */
export const GITHUB_LIMIT = 20 * 1024 * 1024
/** Общий потолок размера одного файла. */
export const MAX_FILE_SIZE = 500 * 1024 * 1024
/** Потолок для решений учеников. */
export const MAX_SUBMISSION_SIZE = 50 * 1024 * 1024

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md',
  'xls', 'xlsx', 'ods', 'fods', 'csv', 'ppt', 'pptx', 'odp',
  'html', 'htm',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp',
  'mp4', 'webm', 'mov', 'mkv', 'm4v', 'mp3', 'wav', 'ogg', 'm4a',
  'py', 'pas', 'cpp', 'c', 'h', 'java', 'js', 'ts', 'cs', 'kt', 'json', 'ipynb',
  'zip', 'rar', '7z',
])

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  html: 'text/html',
  htm: 'text/html',
  txt: 'text/plain',
  md: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  py: 'text/plain',
  pas: 'text/plain',
  cpp: 'text/plain',
  c: 'text/plain',
  java: 'text/plain',
  js: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function mimeOf(name: string, reported = ''): string {
  return MIME_BY_EXTENSION[extensionOf(name)] ?? (reported || 'application/octet-stream')
}

export type FileKind = 'html' | 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'other'

export function fileKind(meta: Pick<FileMeta, 'name' | 'mime'>): FileKind {
  const ext = extensionOf(meta.name)
  if (ext === 'html' || ext === 'htm') return 'html'
  if (ext === 'pdf') return 'pdf'
  // SVG может содержать скрипты, поэтому как картинка в <img> он безопасен, а как документ нет.
  if (meta.mime.startsWith('image/')) return 'image'
  if (meta.mime.startsWith('video/')) return 'video'
  if (meta.mime.startsWith('audio/')) return 'audio'
  if (meta.mime.startsWith('text/') || meta.mime === 'application/json') return 'text'
  return 'other'
}

/** Можно ли показать файл прямо на сайте. */
export function canPreview(meta: FileMeta): boolean {
  const kind = fileKind(meta)
  if (meta.store === 'disk') return kind === 'video' || kind === 'audio'
  return kind !== 'other'
}

export function validateUpload(file: { name: string; size: number }, maxSize: number = MAX_FILE_SIZE): void {
  const ext = extensionOf(file.name)
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new ValidationError('file', `«${file.name}»: формат ${ext ? '.' + ext : 'без расширения'} не поддерживается`)
  }
  if (file.size === 0) throw new ValidationError('file', `«${file.name}»: файл пустой`)
  if (file.size > maxSize) {
    throw new ValidationError('file', `«${file.name}»: размер больше ${Math.round(maxSize / 1024 / 1024)} МБ`)
  }
}

/** Куда загружается файл: в общие материалы или в личную папку ученика. */
export type FileScope = { kind: 'shared' } | { kind: 'student'; studentId: string; key: Bytes }

function putToDisk(href: string, file: Blob, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', href)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(xhr.status === 507 ? 'На Яндекс Диске закончилось место.' : `Диск не принял файл (код ${xhr.status}).`))
    xhr.onerror = () => reject(new Error('Загрузка прервалась. Проверьте интернет и повторите.'))
    xhr.send(file)
  })
}

/**
 * Сохраняет содержимое файла и возвращает его описание.
 * Регистрация описания (в уроке, задании, решении) остаётся за вызывающим.
 */
export async function storeFile(
  session: Session,
  file: File,
  scope: FileScope,
  onProgress?: (fraction: number) => void,
  maxSize: number = MAX_FILE_SIZE,
): Promise<FileMeta> {
  validateUpload(file, maxSize)
  const id = newId(16)
  const ext = extensionOf(file.name)
  const base = {
    id,
    name: file.name,
    mime: mimeOf(file.name, file.type),
    size: file.size,
    uploadedAt: new Date().toISOString(),
  }

  if (file.size <= GITHUB_LIMIT) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (scope.kind === 'shared') {
      const path = `${paths.sharedFilesDir}/${id}.${ext}`
      await session.data.writeBytes(path, bytes, 'Загружен файл')
      return { ...base, store: 'github', path, encrypted: false }
    }
    const path = `${paths.studentFilesDir(scope.studentId)}/${id}.enc`
    await session.data.writeBytes(path, await encryptBytes(scope.key, bytes), 'Загружен файл')
    return { ...base, store: 'github', path, encrypted: true }
  }

  const token = session.bundle.diskToken
  if (!token) {
    throw new ValidationError('file', `«${file.name}» больше 20 МБ: для таких файлов нужен Яндекс Диск, а он не подключён`)
  }
  const folder = scope.kind === 'shared' ? 'app:/shared' : `app:/students/${scope.studentId}`
  if (scope.kind === 'student') await ensureFolder(token, 'app:/students')
  await ensureFolder(token, folder)
  const path = `${folder}/${id}.${ext}`
  await putToDisk(await uploadLink(token, path), file, onProgress)
  return { ...base, store: 'disk', path, encrypted: false }
}

/** Содержимое файла из репозитория. Личные файлы расшифровываются ключом ученика. */
export async function loadBlob(session: Session, meta: FileMeta, key?: Bytes): Promise<Blob> {
  if (meta.store !== 'github') throw new Error('Этот файл лежит на Диске и открывается по ссылке')
  let bytes = await session.data.readBytes(meta.path)
  if (!bytes) throw new Error('Файл не найден в хранилище. Возможно, его удалили.')
  if (meta.encrypted) {
    if (!key) throw new Error('Нет ключа для расшифровки файла')
    bytes = await decryptBytes(key, bytes)
  }
  return new Blob([bytes], { type: meta.mime })
}

/** Временная ссылка на файл с Диска: для плеера и скачивания. */
export async function diskUrl(session: Session, meta: FileMeta): Promise<string> {
  if (!session.bundle.diskToken) throw new Error('Яндекс Диск не подключён')
  return downloadLink(session.bundle.diskToken, meta.path)
}

export async function removeStored(session: Session, meta: FileMeta): Promise<void> {
  if (meta.store === 'github') await session.data.remove(meta.path, 'Удалён файл')
  else if (session.bundle.diskToken) await removeResource(session.bundle.diskToken, meta.path)
}

/** Скачивание через сайт: файл из репозитория отдаётся из памяти, файл с Диска по временной ссылке. */
export async function downloadFile(session: Session, meta: FileMeta, key?: Bytes): Promise<void> {
  const a = document.createElement('a')
  if (meta.store === 'github') {
    const url = URL.createObjectURL(await loadBlob(session, meta, key))
    a.href = url
    a.download = meta.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } else {
    a.href = await diskUrl(session, meta)
    a.rel = 'noreferrer'
    a.click()
  }
}

// ── Общий реестр файлов ─────────────────────────────────────────────────────

function sharedRegistry(session: Session) {
  return jsonFile<SharedFilesFile>(session.data, paths.shared.files)
}

export async function listSharedFiles(session: Session): Promise<FileMeta[]> {
  return (await sharedRegistry(session).load())?.value.files ?? []
}

export async function registerSharedFiles(session: Session, metas: FileMeta[]): Promise<void> {
  if (metas.length === 0) return
  await sharedRegistry(session).update((cur) => ({ files: [...(cur?.files ?? []), ...metas] }), 'Добавлены файлы')
}

export async function unregisterSharedFile(session: Session, fileId: string): Promise<void> {
  await sharedRegistry(session).update(
    (cur) => ({ files: (cur?.files ?? []).filter((f) => f.id !== fileId) }),
    'Удалён файл из реестра',
  )
}

/** Что показывать в списках: название от репетитора, а без него имя файла. */
export function fileTitle(meta: Pick<FileMeta, 'name' | 'title'>): string {
  return meta.title?.trim() || meta.name
}

/** Задаёт названия общим файлам. Пустое название возвращает показ имени файла. */
export async function renameSharedFiles(session: Session, titles: Record<string, string>): Promise<void> {
  if (session.bundle.role !== 'admin') throw new Error('Действие доступно только репетитору')
  if (Object.keys(titles).length === 0) return
  await sharedRegistry(session).update(
    (cur) => ({
      files: (cur?.files ?? []).map((f) => (f.id in titles ? { ...f, title: titles[f.id].trim() } : f)),
    }),
    'Изменены названия файлов',
  )
}

export function pickFiles(all: FileMeta[] | undefined, ids: string[]): FileMeta[] {
  const map = new Map((all ?? []).map((f) => [f.id, f]))
  return ids.map((id) => map.get(id)).filter((f): f is FileMeta => !!f)
}
