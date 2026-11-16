import type { Session } from '../core/auth/session'
import { fromB64, newId } from '../core/crypto'
import { jsonFile } from '../core/storage'
import { ValidationError } from './students'
import { paths, type KeysFile, type MockExam, type MockExamTask, type TutorFile } from './types'

// ── Справочник заданий ──────────────────────────────────────────────────────

export interface CatalogVersion {
  id: string
  title: string
  tasks: { number: number; topic: string; maxScore: number }[]
}

const EGE_TOPICS = [
  'Графы и таблицы',
  'Таблицы истинности',
  'Базы данных',
  'Кодирование, условие Фано',
  'Анализ алгоритмов',
  'Исполнитель Черепаха',
  'Кодирование изображений и звука',
  'Комбинаторика',
  'Электронные таблицы',
  'Поиск в тексте',
  'Количество информации',
  'Исполнитель Редактор',
  'IP-адреса и маски',
  'Системы счисления',
  'Логические выражения',
  'Рекурсия',
  'Обработка последовательностей',
  'Динамика в таблицах',
  'Теория игр: выигрышная стратегия',
  'Теория игр: два хода',
  'Теория игр: дерево игры',
  'Параллельные процессы',
  'Динамическое программирование',
  'Обработка строк',
  'Делители и маски чисел',
  'Сортировка',
  'Кластеризация',
]

/** Встроенные версии справочника. Задания 26 и 27 оцениваются в 2 первичных балла. */
export const CATALOGS: CatalogVersion[] = [
  {
    id: 'ege-2027',
    title: 'ЕГЭ 2027',
    tasks: EGE_TOPICS.map((topic, i) => ({ number: i + 1, topic, maxScore: i >= 25 ? 2 : 1 })),
  },
]

// ── Подсчёты ────────────────────────────────────────────────────────────────

export type TaskKind = 'full' | 'partial' | 'zero' | 'unscored'

export function taskKind(task: MockExamTask): TaskKind {
  if (task.score === null) return 'unscored'
  if (task.score >= task.maxScore) return 'full'
  return task.score <= 0 ? 'zero' : 'partial'
}

export interface MockTotals {
  score: number
  max: number
  /** Процент от максимума; null, пока не выставлен ни один балл. */
  percent: number | null
  full: number
  partial: number
  zero: number
  unscored: number
}

export function mockTotals(mock: MockExam): MockTotals {
  const kinds = mock.tasks.map(taskKind)
  const count = (kind: TaskKind) => kinds.filter((k) => k === kind).length
  const score = mock.tasks.reduce((sum, t) => sum + (t.score ?? 0), 0)
  const max = mock.tasks.reduce((sum, t) => sum + t.maxScore, 0)
  const graded = kinds.some((k) => k !== 'unscored')
  return {
    score,
    max,
    percent: graded && max > 0 ? Math.round((score / max) * 100) : null,
    full: count('full'),
    partial: count('partial'),
    zero: count('zero'),
    unscored: count('unscored'),
  }
}

export interface LossRow {
  key: string
  label: string
  /** В скольких пробниках потеряны баллы. */
  times: number
  attempts: number
  lostPoints: number
  maxPoints: number
}

export interface MocksStats {
  count: number
  scoreSum: number
  maxSum: number
  averagePercent: number | null
  bestPercent: number | null
  full: number
  partial: number
  zero: number
  trend: { label: string; percent: number }[]
  byNumber: LossRow[]
  byTopic: LossRow[]
}

/** В статистику входят только пробники, где выставлен хотя бы один балл. */
export function mocksStats(mocks: MockExam[]): MocksStats {
  const graded = mocks
    .map((mock) => ({ mock, totals: mockTotals(mock) }))
    .filter((x) => x.totals.percent !== null)
    .sort((a, b) => a.mock.date.localeCompare(b.mock.date))
  const percents = graded.map((x) => x.totals.percent!)
  const sum = (pick: (t: MockTotals) => number) => graded.reduce((acc, x) => acc + pick(x.totals), 0)

  const collect = (keyOf: (t: MockExamTask) => string, labelOf: (t: MockExamTask) => string): LossRow[] => {
    const rows = new Map<string, LossRow>()
    for (const { mock } of graded) {
      const lostHere = new Set<string>()
      const seenHere = new Set<string>()
      for (const task of mock.tasks) {
        if (task.score === null) continue
        const key = keyOf(task)
        const row = rows.get(key) ?? { key, label: labelOf(task), times: 0, attempts: 0, lostPoints: 0, maxPoints: 0 }
        row.lostPoints += task.maxScore - task.score
        row.maxPoints += task.maxScore
        if (!seenHere.has(key)) row.attempts += 1
        if (task.score < task.maxScore && !lostHere.has(key)) row.times += 1
        seenHere.add(key)
        if (task.score < task.maxScore) lostHere.add(key)
        rows.set(key, row)
      }
    }
    return [...rows.values()]
  }

  return {
    count: graded.length,
    scoreSum: sum((t) => t.score),
    maxSum: sum((t) => t.max),
    averagePercent: percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
    bestPercent: percents.length ? Math.max(...percents) : null,
    full: sum((t) => t.full),
    partial: sum((t) => t.partial),
    zero: sum((t) => t.zero),
    trend: graded.map((x) => ({ label: x.mock.title, percent: x.totals.percent! })),
    byNumber: collect(
      (t) => String(t.number),
      (t) => String(t.number),
    ).sort((a, b) => Number(a.key) - Number(b.key)),
    byTopic: collect(
      (t) => t.topic,
      (t) => t.topic,
    )
      .filter((r) => r.lostPoints > 0)
      .sort((a, b) => b.lostPoints - a.lostPoints || a.label.localeCompare(b.label, 'ru')),
  }
}

// ── Изменения ───────────────────────────────────────────────────────────────

export interface MockInput {
  title: string
  date: string
  comment: string
}

export function validateMockInput(input: MockInput): MockInput {
  const title = input.title.trim()
  if (title.length < 2) throw new ValidationError('title', 'Введите название пробника')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new ValidationError('date', 'Укажите дату пробника')
  return { title, date: input.date, comment: input.comment.trim() }
}

export function validateTasks(tasks: MockExamTask[]): MockExamTask[] {
  return tasks.map((task) => {
    if (task.score !== null && (!Number.isFinite(task.score) || task.score < 0 || task.score > task.maxScore)) {
      throw new ValidationError(`task-${task.number}`, `Задание ${task.number}: балл от 0 до ${task.maxScore}`)
    }
    return { ...task, comment: task.comment.trim() }
  })
}

async function tutorFileOf(session: Session, studentId: string) {
  if (session.bundle.role !== 'admin') throw new Error('Действие доступно только репетитору')
  const keys = await jsonFile<KeysFile>(session.data, paths.keys, session.key).load()
  const key = keys?.value.keys[studentId]
  if (!key) throw new Error('Ключ ученика не найден')
  return jsonFile<TutorFile>(session.data, paths.tutorFile(studentId), fromB64(key))
}

/**
 * Создаёт пробник и копирует в него задания из справочника.
 * Копия нужна, чтобы правки справочника не меняли результаты старых пробников.
 */
export async function createMock(
  session: Session,
  studentId: string,
  raw: MockInput,
  catalogId: string,
): Promise<MockExam> {
  const input = validateMockInput(raw)
  const catalog = CATALOGS.find((c) => c.id === catalogId)
  if (!catalog) throw new ValidationError('catalog', 'Выберите год экзамена')
  const mock: MockExam = {
    id: newId(),
    ...input,
    catalogVersion: catalog.id,
    tasks: catalog.tasks.map((t) => ({ ...t, score: null, comment: '' })),
  }
  const file = await tutorFileOf(session, studentId)
  await file.update((cur) => {
    if (!cur) throw new Error('Данные ученика не найдены')
    return { ...cur, mockExams: [...cur.mockExams, mock] }
  }, 'Создан пробник')
  return mock
}

export async function saveMock(
  session: Session,
  studentId: string,
  mockId: string,
  raw: MockInput,
  tasks: MockExamTask[],
): Promise<void> {
  const input = validateMockInput(raw)
  const cleanTasks = validateTasks(tasks)
  const file = await tutorFileOf(session, studentId)
  await file.update((cur) => {
    const target = cur?.mockExams.find((m) => m.id === mockId)
    if (!cur || !target) throw new Error('Пробник не найден: возможно, его удалили')
    const next: MockExam = { ...target, ...input, tasks: cleanTasks }
    return { ...cur, mockExams: cur.mockExams.map((m) => (m.id === mockId ? next : m)) }
  }, 'Сохранён пробник')
}

export async function deleteMock(session: Session, studentId: string, mockId: string): Promise<void> {
  const file = await tutorFileOf(session, studentId)
  await file.update((cur) => {
    if (!cur) throw new Error('Данные ученика не найдены')
    return { ...cur, mockExams: cur.mockExams.filter((m) => m.id !== mockId) }
  }, 'Удалён пробник')
}

export function sortMocks(mocks: MockExam[]): MockExam[] {
  return [...mocks].sort((a, b) => b.date.localeCompare(a.date))
}
