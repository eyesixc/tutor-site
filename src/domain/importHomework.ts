import type { Session } from '../core/auth/session'
import { fromB64, newId } from '../core/crypto'
import { jsonFile } from '../core/storage'
import { TUTOR_TIMEZONE, zonedToUtc } from '../core/time'
import { EGE_TASK_COUNT } from './lessons'
import { paths, type Homework, type KeysFile, type TutorFile } from './types'

/** Разбор CSV: запятая-разделитель, кавычки, переносы строк внутри кавычек. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export interface ImportRow {
  title: string
  egeTask: number | null
  topic: string
  links: string[]
  issuedAt: string
  deadline: string
  score: number | null
  maxScore: number | null
  done: boolean
  comment: string
  /** Что в строке выглядит странно. Строка всё равно импортируется как есть. */
  warnings: string[]
}

const HEADERS = {
  title: 'название',
  lesson: 'урок',
  issued: 'дата выдачи',
  score: 'получено',
  category: 'категория',
  status: 'статус',
  max: 'максимум',
  deadline: 'дедлайн',
  comment: 'комментарий преподавателя',
} as const

/** Номер задания ЕГЭ из названия: «4 задание», «Задание 7». */
export function egeTaskFromTitle(title: string): number | null {
  const match = /(\d+)\s*задани/i.exec(title) ?? /задани[ея]\s*(\d+)/i.exec(title)
  const n = match ? Number(match[1]) : NaN
  return n >= 1 && n <= EGE_TASK_COUNT ? n : null
}

/** «2026/09/27 00:00» или «2026/10/26» в московском времени. Без времени берётся конец дня. */
function parseMoment(raw: string, endOfDayIfNoTime: boolean): string | null {
  const m = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(raw.trim())
  if (!m) return null
  const date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  const time = m[4] ? `${m[4].padStart(2, '0')}:${m[5]}` : endOfDayIfNoTime ? '23:59' : '00:00'
  const iso = zonedToUtc(date, time, TUTOR_TIMEZONE)
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (text === '') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

/** «сделано» распознаётся и с латинской «c», и с пробелами по краям. */
function isDone(raw: string): boolean {
  return raw.trim().toLowerCase().replace(/c/g, 'с') === 'сделано'
}

export interface ParsedImport {
  rows: ImportRow[]
  /** Строки, которые импортировать нельзя: нет названия или дат. */
  skipped: string[]
}

export function parseHomeworkCsv(text: string): ParsedImport {
  const table = parseCsv(text)
  if (table.length === 0) throw new Error('Файл пустой')
  const head = table[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => head.indexOf(name)
  for (const required of [HEADERS.title, HEADERS.issued, HEADERS.deadline, HEADERS.status]) {
    if (col(required) < 0) throw new Error(`В файле нет столбца «${required}». Нужен файл выгрузки домашних заданий.`)
  }
  const get = (row: string[], name: string) => (col(name) >= 0 ? (row[col(name)] ?? '').trim() : '')

  const rows: ImportRow[] = []
  const skipped: string[] = []
  for (const [i, raw] of table.slice(1).entries()) {
    const title = get(raw, HEADERS.title)
    const issuedAt = parseMoment(get(raw, HEADERS.issued), false)
    const deadline = parseMoment(get(raw, HEADERS.deadline), true)
    if (!title || !issuedAt || !deadline) {
      skipped.push(`Строка ${i + 2}: ${title || 'без названия'}, не хватает ${!title ? 'названия' : !issuedAt ? 'даты выдачи' : 'дедлайна'}`)
      continue
    }
    const score = parseNumber(get(raw, HEADERS.score))
    const maxScore = parseNumber(get(raw, HEADERS.max))
    const warnings: string[] = []
    if (deadline <= issuedAt) warnings.push('дедлайн раньше даты выдачи')
    if (score !== null && maxScore === null) warnings.push('есть балл, но нет максимума')
    if (score !== null && maxScore !== null && score > maxScore) warnings.push('балл больше максимума')
    rows.push({
      title,
      egeTask: egeTaskFromTitle(title),
      topic: get(raw, HEADERS.category),
      links: get(raw, HEADERS.lesson)
        .split(/[\s,]+/)
        .filter((u) => /^https?:\/\//.test(u)),
      issuedAt,
      deadline,
      score,
      maxScore: maxScore !== null && maxScore > 0 ? maxScore : null,
      done: isDone(get(raw, HEADERS.status)),
      comment: get(raw, HEADERS.comment),
      warnings,
    })
  }
  return { rows, skipped }
}

/** Ключ для поиска повторов: одно и то же задание дважды не добавляется. */
function sameHomework(a: Pick<Homework, 'title' | 'issuedAt'>, b: Pick<Homework, 'title' | 'issuedAt'>): boolean {
  return a.title.trim().toLowerCase() === b.title.trim().toLowerCase() && a.issuedAt === b.issuedAt
}

export function rowToHomework(row: ImportRow): Homework {
  // Максимум может быть без балла (ещё не проверено) и наоборот: берём то, что есть.
  const maxScore = row.maxScore ?? (row.score !== null && row.score > 0 ? row.score : null)
  return {
    id: newId(),
    title: row.title,
    topic: row.topic,
    egeTask: row.egeTask,
    lessonId: null,
    // В выгрузке нет числа заданий: за него принимается максимальный балл.
    taskCount: maxScore !== null && Number.isInteger(maxScore) ? maxScore : 1,
    issuedAt: row.issuedAt,
    deadline: row.deadline,
    instructions: row.links.length > 0 ? `Материалы задания:\n${row.links.join('\n')}` : '',
    fileIds: [],
    maxScore,
    score: row.done && maxScore !== null ? Math.min(row.score ?? 0, maxScore) : null,
    tutorComment: row.comment,
    // «Сделано» в старой таблице значит «проверено»: отметка о проверке ставится на момент дедлайна.
    checkedAt: row.done ? (row.deadline > row.issuedAt ? row.deadline : row.issuedAt) : null,
    doneByTutor: row.done ? true : null,
  }
}

export interface ImportResult {
  added: number
  duplicates: number
}

export async function importHomework(session: Session, studentId: string, rows: ImportRow[]): Promise<ImportResult> {
  if (session.bundle.role !== 'admin') throw new Error('Действие доступно только репетитору')
  const keys = await jsonFile<KeysFile>(session.data, paths.keys, session.key).load()
  const key = keys?.value.keys[studentId]
  if (!key) throw new Error('Ключ ученика не найден')
  const prepared = rows.map(rowToHomework)
  let result: ImportResult = { added: 0, duplicates: 0 }
  await jsonFile<TutorFile>(session.data, paths.tutorFile(studentId), fromB64(key)).update((cur) => {
    if (!cur) throw new Error('Данные ученика не найдены')
    const fresh: Homework[] = []
    for (const hw of prepared) {
      if ([...cur.homework, ...fresh].some((h) => sameHomework(h, hw))) continue
      fresh.push(hw)
    }
    result = { added: fresh.length, duplicates: prepared.length - fresh.length }
    return { ...cur, homework: [...cur.homework, ...fresh] }
  }, 'Импорт домашних заданий')
  return result
}
