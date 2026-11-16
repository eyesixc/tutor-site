import type { Session } from '../core/auth/session'
import { newId } from '../core/crypto'
import { jsonFile } from '../core/storage'
import { listSharedFiles, removeStored, unregisterSharedFile } from './files'
import { EGE_TASK_COUNT } from './lessons'
import { ValidationError } from './students'
import {
  paths,
  type MaterialLink,
  type MethodicalFile,
  type MethodicalItem,
  type UsefulFile,
  type UsefulItem,
} from './types'

function requireAdmin(session: Session): void {
  if (session.bundle.role !== 'admin') throw new Error('Действие доступно только репетитору')
}

function cleanLinks(links: MaterialLink[]): MaterialLink[] {
  const out = links.map((l) => ({ title: l.title.trim(), url: l.url.trim() })).filter((l) => l.title || l.url)
  for (const link of out) {
    if (!/^https?:\/\/\S+$/.test(link.url)) throw new ValidationError('links', 'Ссылка должна начинаться с https://')
    if (!link.title) link.title = link.url
  }
  return out
}

/** Удаляет файлы материала из хранилища и из общего реестра. */
async function dropFiles(session: Session, fileIds: string[]): Promise<void> {
  const all = await listSharedFiles(session)
  for (const id of fileIds) {
    const meta = all.find((f) => f.id === id)
    if (meta) await removeStored(session, meta)
    await unregisterSharedFile(session, id)
  }
}

// ── Полезные материалы ──────────────────────────────────────────────────────

export interface UsefulInput {
  title: string
  description: string
  topic: string
  links: MaterialLink[]
}

const usefulFile = (session: Session) => jsonFile<UsefulFile>(session.data, paths.shared.useful)

export async function listUseful(session: Session): Promise<UsefulItem[]> {
  return (await usefulFile(session).load())?.value.items ?? []
}

export async function saveUseful(session: Session, raw: UsefulInput, fileIds: string[], id?: string): Promise<void> {
  requireAdmin(session)
  const title = raw.title.trim()
  if (title.length < 2) throw new ValidationError('title', 'Введите название')
  const input = { title, description: raw.description.trim(), topic: raw.topic.trim(), links: cleanLinks(raw.links) }
  await usefulFile(session).update((cur) => {
    const items = cur?.items ?? []
    if (id) return { items: items.map((i) => (i.id === id ? { ...i, ...input, fileIds } : i)) }
    return { items: [...items, { id: newId(), ...input, fileIds, createdAt: new Date().toISOString() }] }
  }, id ? 'Изменён полезный материал' : 'Добавлен полезный материал')
}

export async function deleteUseful(session: Session, id: string): Promise<void> {
  requireAdmin(session)
  const item = (await listUseful(session)).find((i) => i.id === id)
  if (!item) return
  await usefulFile(session).update((cur) => ({ items: (cur?.items ?? []).filter((i) => i.id !== id) }), 'Удалён полезный материал')
  await dropFiles(session, item.fileIds)
}

// ── Методички ───────────────────────────────────────────────────────────────

export interface MethodicalInput {
  title: string
  description: string
  topic: string
  egeTask: number | null
}

const methodicalFile = (session: Session) => jsonFile<MethodicalFile>(session.data, paths.shared.methodical)

export async function listMethodical(session: Session): Promise<MethodicalItem[]> {
  return (await methodicalFile(session).load())?.value.items ?? []
}

export async function saveMethodical(session: Session, raw: MethodicalInput, fileIds: string[], id?: string): Promise<void> {
  requireAdmin(session)
  const title = raw.title.trim()
  if (title.length < 2) throw new ValidationError('title', 'Введите название')
  if (raw.egeTask !== null && (!Number.isInteger(raw.egeTask) || raw.egeTask < 1 || raw.egeTask > EGE_TASK_COUNT)) {
    throw new ValidationError('egeTask', `Номер задания: от 1 до ${EGE_TASK_COUNT}`)
  }
  if (fileIds.length === 0) throw new ValidationError('file', 'Прикрепите хотя бы один файл')
  const input = { title, description: raw.description.trim(), topic: raw.topic.trim(), egeTask: raw.egeTask }
  await methodicalFile(session).update((cur) => {
    const items = cur?.items ?? []
    if (id) return { items: items.map((i) => (i.id === id ? { ...i, ...input, fileIds } : i)) }
    return { items: [...items, { id: newId(), ...input, fileIds, createdAt: new Date().toISOString() }] }
  }, id ? 'Изменена методичка' : 'Добавлена методичка')
}

export async function deleteMethodical(session: Session, id: string): Promise<void> {
  requireAdmin(session)
  const item = (await listMethodical(session)).find((i) => i.id === id)
  if (!item) return
  await methodicalFile(session).update((cur) => ({ items: (cur?.items ?? []).filter((i) => i.id !== id) }), 'Удалена методичка')
  await dropFiles(session, item.fileIds)
}

/** Убирает из материала один файл: вызывается при правке, когда файл открепили. */
export async function dropSharedFiles(session: Session, fileIds: string[]): Promise<void> {
  requireAdmin(session)
  await dropFiles(session, fileIds)
}
