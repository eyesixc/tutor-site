import type { Session } from '../core/auth/session'
import { fromB64, newId } from '../core/crypto'
import { jsonFile } from '../core/storage'
import { dayKey } from '../core/time'
import { removeStored } from './files'
import { EGE_TASK_COUNT } from './lessons'
import { ValidationError } from './students'
import {
  emptyStudentFile,
  paths,
  type FileMeta,
  type Homework,
  type KeysFile,
  type StudentFile,
  type Submission,
  type TutorFile,
} from './types'

export type HomeworkStatus = 'debt' | 'todo' | 'done' | 'checked'

export const STATUS_LABEL: Record<HomeworkStatus, string> = {
  debt: 'Долг',
  todo: 'Не выполнено',
  done: 'Выполнено',
  checked: 'Проверено',
}

/** Порядок показа: сначала долги, затем текущие, затем сделанное. */
export const STATUS_ORDER: Record<HomeworkStatus, number> = { debt: 0, todo: 1, done: 2, checked: 3 }

export function isDone(hw: Homework, submission: Submission | undefined): boolean {
  return hw.doneByTutor ?? submission?.done ?? false
}

/**
 * Статус вычисляется, а не хранится: долг возникает сам, когда проходит дедлайн,
 * и сам исчезает, когда работу сдают.
 */
export function homeworkStatus(hw: Homework, submission: Submission | undefined, now: Date = new Date()): HomeworkStatus {
  if (hw.checkedAt) return 'checked'
  if (isDone(hw, submission)) return 'done'
  return hw.deadline < now.toISOString() ? 'debt' : 'todo'
}

export interface HomeworkView {
  hw: Homework
  submission: Submission | undefined
  status: HomeworkStatus
}

export function viewHomework(
  homework: Homework[],
  submissions: Record<string, Submission>,
  now: Date = new Date(),
): HomeworkView[] {
  return homework.map((hw) => ({
    hw,
    submission: submissions[hw.id],
    status: homeworkStatus(hw, submissions[hw.id], now),
  }))
}

const ARCHIVE_AFTER_DAYS = 14

/** Старые сделанные работы уходят в архив, чтобы не мешать текущим. */
export function isArchived(view: HomeworkView, now: Date = new Date()): boolean {
  if (view.status !== 'done' && view.status !== 'checked') return false
  const closedAt = view.hw.checkedAt ?? view.submission?.doneAt ?? view.hw.deadline
  return now.getTime() - Date.parse(closedAt) > ARCHIVE_AFTER_DAYS * 86_400_000
}

export type HomeworkSort = 'default' | 'deadline' | 'issued' | 'lesson' | 'topic' | 'status'

export function sortHomework(
  views: HomeworkView[],
  sort: HomeworkSort,
  lessonTitleOf: (lessonId: string | null) => string,
): HomeworkView[] {
  const byDeadline = (a: HomeworkView, b: HomeworkView) => a.hw.deadline.localeCompare(b.hw.deadline)
  const text = (a: string, b: string) => a.localeCompare(b, 'ru')
  const list = [...views]
  switch (sort) {
    case 'deadline':
      return list.sort(byDeadline)
    case 'issued':
      return list.sort((a, b) => b.hw.issuedAt.localeCompare(a.hw.issuedAt))
    case 'lesson':
      return list.sort((a, b) => text(lessonTitleOf(a.hw.lessonId), lessonTitleOf(b.hw.lessonId)) || byDeadline(a, b))
    case 'topic':
      return list.sort((a, b) => text(a.hw.topic, b.hw.topic) || byDeadline(a, b))
    case 'status':
      return list.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byDeadline(a, b))
    default:
      // Долги и текущие: ближайший дедлайн сверху. Сделанные: свежие сверху.
      return list.sort((a, b) => {
        const order = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        if (order) return order
        return a.status === 'debt' || a.status === 'todo' ? byDeadline(a, b) : byDeadline(b, a)
      })
  }
}

// ── Статистика ──────────────────────────────────────────────────────────────

export interface HomeworkStats {
  issued: number
  done: number
  notDone: number
  debts: number
  scoreSum: number
  maxSum: number
  /** Средний процент по проверенным работам с баллами; null, если таких нет. */
  averagePercent: number | null
  /** Динамика: проверенные работы по порядку проверки. */
  trend: { label: string; percent: number }[]
}

export function homeworkStats(views: HomeworkView[]): HomeworkStats {
  const scored = views
    .filter((v) => v.status === 'checked' && v.hw.score !== null && v.hw.maxScore !== null && v.hw.maxScore > 0)
    .sort((a, b) => (a.hw.checkedAt ?? '').localeCompare(b.hw.checkedAt ?? ''))
  const percents = scored.map((v) => (v.hw.score! / v.hw.maxScore!) * 100)
  return {
    issued: views.length,
    done: views.filter((v) => v.status === 'done' || v.status === 'checked').length,
    notDone: views.filter((v) => v.status === 'todo' || v.status === 'debt').length,
    debts: views.filter((v) => v.status === 'debt').length,
    scoreSum: scored.reduce((sum, v) => sum + v.hw.score!, 0),
    maxSum: scored.reduce((sum, v) => sum + v.hw.maxScore!, 0),
    averagePercent: percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
    trend: scored.map((v, i) => ({ label: v.hw.title, percent: Math.round(percents[i]) })),
  }
}

/** Месяцы выдачи (ключи вида 2026-11) в поясе зрителя, от новых к старым. */
export function homeworkMonths(views: HomeworkView[], timeZone: string): string[] {
  return [...new Set(views.map((v) => dayKey(v.hw.issuedAt, timeZone).slice(0, 7)))].sort().reverse()
}

export function inMonth(view: HomeworkView, month: string, timeZone: string): boolean {
  return dayKey(view.hw.issuedAt, timeZone).startsWith(month)
}

export function topicLabel(hw: Pick<Homework, 'topic' | 'egeTask'>): string {
  if (hw.topic && hw.egeTask) return `${hw.topic}, задание ${hw.egeTask}`
  if (hw.topic) return hw.topic
  return hw.egeTask ? `Задание ${hw.egeTask}` : 'Без темы'
}

/** Статистика по темам строится только по тем темам, к которым привязаны работы. */
export function statsByTopic(views: HomeworkView[]): { topic: string; stats: HomeworkStats }[] {
  const groups = new Map<string, HomeworkView[]>()
  for (const view of views) {
    const key = topicLabel(view.hw)
    groups.set(key, [...(groups.get(key) ?? []), view])
  }
  return [...groups.entries()]
    .map(([topic, list]) => ({ topic, stats: homeworkStats(list) }))
    .sort((a, b) => a.topic.localeCompare(b.topic, 'ru', { numeric: true }))
}

// ── Изменения ───────────────────────────────────────────────────────────────

export interface HomeworkInput {
  title: string
  topic: string
  egeTask: number | null
  lessonId: string | null
  taskCount: number
  maxScore: number | null
  issuedAt: string
  deadline: string
  instructions: string
}

export function validateHomeworkInput(input: HomeworkInput): HomeworkInput {
  const title = input.title.trim()
  if (title.length < 2) throw new ValidationError('title', 'Введите название задания')
  if (!Number.isInteger(input.taskCount) || input.taskCount < 1 || input.taskCount > 200) {
    throw new ValidationError('taskCount', 'Количество заданий: от 1 до 200')
  }
  if (input.maxScore !== null && (!Number.isFinite(input.maxScore) || input.maxScore <= 0 || input.maxScore > 1000)) {
    throw new ValidationError('maxScore', 'Максимальный балл: больше 0')
  }
  if (input.egeTask !== null && (!Number.isInteger(input.egeTask) || input.egeTask < 1 || input.egeTask > EGE_TASK_COUNT)) {
    throw new ValidationError('egeTask', `Номер задания: от 1 до ${EGE_TASK_COUNT}`)
  }
  if (Number.isNaN(Date.parse(input.issuedAt))) throw new ValidationError('issuedAt', 'Укажите дату выдачи')
  if (Number.isNaN(Date.parse(input.deadline))) throw new ValidationError('deadline', 'Укажите дедлайн')
  if (input.deadline <= input.issuedAt) throw new ValidationError('deadline', 'Дедлайн должен быть позже даты выдачи')
  return { ...input, title, topic: input.topic.trim(), instructions: input.instructions.trim() }
}

function requireAdmin(session: Session): void {
  if (session.bundle.role !== 'admin') throw new Error('Действие доступно только репетитору')
}

async function tutorFileOf(session: Session, studentId: string) {
  requireAdmin(session)
  const keys = await jsonFile<KeysFile>(session.data, paths.keys, session.key).load()
  const key = keys?.value.keys[studentId]
  if (!key) throw new Error('Ключ ученика не найден')
  return jsonFile<TutorFile>(session.data, paths.tutorFile(studentId), fromB64(key))
}

export interface HomeworkTarget {
  studentId: string
  deadline: string
}

/**
 * Одно задание для нескольких учеников. Содержание общее, а дедлайн, статус,
 * баллы и комментарии у каждого свои: это отдельные записи.
 */
export async function createHomework(
  session: Session,
  input: Omit<HomeworkInput, 'deadline'>,
  targets: HomeworkTarget[],
): Promise<void> {
  requireAdmin(session)
  if (targets.length === 0) throw new ValidationError('students', 'Выберите хотя бы одного ученика')
  const prepared = targets.map((t) => ({ target: t, input: validateHomeworkInput({ ...input, deadline: t.deadline }) }))
  for (const { target, input: clean } of prepared) {
    const file = await tutorFileOf(session, target.studentId)
    const hw: Homework = {
      id: newId(),
      ...clean,
      fileIds: [],
      score: null,
      tutorComment: '',
      checkedAt: null,
      doneByTutor: null,
    }
    await file.update((cur) => {
      if (!cur) throw new Error('Данные ученика не найдены')
      return { ...cur, homework: [...cur.homework, hw] }
    }, 'Выдано домашнее задание')
  }
}

async function patchHomework(
  session: Session,
  studentId: string,
  homeworkId: string,
  change: (hw: Homework) => Homework,
  message: string,
): Promise<void> {
  const file = await tutorFileOf(session, studentId)
  await file.update((cur) => {
    const target = cur?.homework.find((h) => h.id === homeworkId)
    if (!cur || !target) throw new Error('Задание не найдено: возможно, его удалили')
    return { ...cur, homework: cur.homework.map((h) => (h.id === homeworkId ? change(target) : h)) }
  }, message)
}

export async function updateHomework(
  session: Session,
  studentId: string,
  homeworkId: string,
  input: HomeworkInput,
): Promise<void> {
  const clean = validateHomeworkInput(input)
  await patchHomework(
    session,
    studentId,
    homeworkId,
    (hw) => {
      if (clean.maxScore !== null && hw.score !== null && hw.score > clean.maxScore) {
        throw new ValidationError('maxScore', `Уже выставлено ${hw.score}: максимум не может быть меньше`)
      }
      return { ...hw, ...clean }
    },
    'Изменено домашнее задание',
  )
}

/** Репетитор отмечает выполнение вручную; null возвращает решение ученику. */
export async function setDoneByTutor(
  session: Session,
  studentId: string,
  homeworkId: string,
  done: boolean | null,
): Promise<void> {
  await patchHomework(session, studentId, homeworkId, (hw) => ({ ...hw, doneByTutor: done }), 'Изменена отметка о выполнении')
}

export interface CheckInput {
  score: number | null
  comment: string
}

export async function checkHomework(
  session: Session,
  studentId: string,
  homeworkId: string,
  { score, comment }: CheckInput,
): Promise<void> {
  await patchHomework(
    session,
    studentId,
    homeworkId,
    (hw) => {
      if (score !== null) {
        if (hw.maxScore === null) throw new ValidationError('score', 'Сначала укажите максимальный балл задания')
        if (!Number.isFinite(score) || score < 0 || score > hw.maxScore) {
          throw new ValidationError('score', `Баллы: от 0 до ${hw.maxScore}`)
        }
      }
      return { ...hw, score, tutorComment: comment.trim(), checkedAt: new Date().toISOString() }
    },
    'Проверено домашнее задание',
  )
}

/** Снимает проверку: баллы и комментарий остаются, работа возвращается в «Выполнено». */
export async function uncheckHomework(session: Session, studentId: string, homeworkId: string): Promise<void> {
  await patchHomework(session, studentId, homeworkId, (hw) => ({ ...hw, checkedAt: null }), 'Снята проверка')
}

export async function deleteHomework(session: Session, studentId: string, homeworkId: string): Promise<void> {
  const file = await tutorFileOf(session, studentId)
  let orphans: FileMeta[] = []
  await file.update((cur) => {
    if (!cur) throw new Error('Данные ученика не найдены')
    const ids = new Set(cur.homework.find((h) => h.id === homeworkId)?.fileIds ?? [])
    orphans = (cur.files ?? []).filter((f) => ids.has(f.id))
    return {
      ...cur,
      files: (cur.files ?? []).filter((f) => !ids.has(f.id)),
      homework: cur.homework.filter((h) => h.id !== homeworkId),
    }
  }, 'Удалено домашнее задание')
  for (const meta of orphans) await removeStored(session, meta)
}

// ── Ученик ──────────────────────────────────────────────────────────────────

function ownStudentFile(session: Session) {
  return jsonFile<StudentFile>(session.data, paths.studentFile(session.bundle.userId), session.key)
}

export async function loadOwnStudentFile(session: Session): Promise<StudentFile> {
  return (await ownStudentFile(session).load())?.value ?? emptyStudentFile()
}

/** Ученик отмечает работу выполненной или снимает отметку. Пишет только в свой файл. */
export async function markOwnHomework(session: Session, homeworkId: string, done: boolean): Promise<void> {
  if (session.bundle.role !== 'student') throw new Error('Отметить выполнение может только ученик')
  await ownStudentFile(session).update((cur) => {
    const file = cur ?? emptyStudentFile()
    const previous = file.submissions[homeworkId]
    return {
      ...file,
      submissions: {
        ...file.submissions,
        [homeworkId]: { fileIds: previous?.fileIds ?? [], done, doneAt: done ? new Date().toISOString() : null },
      },
    }
  }, done ? 'Работа отмечена выполненной' : 'Снята отметка о выполнении')
}

// ── Файлы ───────────────────────────────────────────────────────────────────

/** Вложения репетитора к заданию: личные, зашифрованы ключом ученика. */
export async function addHomeworkFiles(
  session: Session,
  studentId: string,
  homeworkId: string,
  metas: FileMeta[],
): Promise<void> {
  const file = await tutorFileOf(session, studentId)
  await file.update((cur) => {
    if (!cur?.homework.some((h) => h.id === homeworkId)) throw new Error('Задание не найдено')
    return {
      ...cur,
      files: [...(cur.files ?? []), ...metas],
      homework: cur.homework.map((h) =>
        h.id === homeworkId ? { ...h, fileIds: [...h.fileIds, ...metas.map((m) => m.id)] } : h,
      ),
    }
  }, 'К заданию добавлены файлы')
}

export async function removeHomeworkFile(
  session: Session,
  studentId: string,
  homeworkId: string,
  meta: FileMeta,
): Promise<void> {
  const file = await tutorFileOf(session, studentId)
  await file.update((cur) => {
    if (!cur) throw new Error('Данные ученика не найдены')
    return {
      ...cur,
      files: (cur.files ?? []).filter((f) => f.id !== meta.id),
      homework: cur.homework.map((h) =>
        h.id === homeworkId ? { ...h, fileIds: h.fileIds.filter((id) => id !== meta.id) } : h,
      ),
    }
  }, 'Из задания убран файл')
  await removeStored(session, meta)
}

/** Ученик прикрепляет файлы решения. Пишет только в свой файл. */
export async function addSubmissionFiles(session: Session, homeworkId: string, metas: FileMeta[]): Promise<void> {
  if (session.bundle.role !== 'student') throw new Error('Прикрепить решение может только ученик')
  await ownStudentFile(session).update((cur) => {
    const file = cur ?? emptyStudentFile()
    const previous = file.submissions[homeworkId] ?? { done: false, doneAt: null, fileIds: [] }
    return {
      ...file,
      files: [...(file.files ?? []), ...metas],
      submissions: {
        ...file.submissions,
        [homeworkId]: { ...previous, fileIds: [...previous.fileIds, ...metas.map((m) => m.id)] },
      },
    }
  }, 'Прикреплено решение')
}

export async function removeSubmissionFile(session: Session, homeworkId: string, meta: FileMeta): Promise<void> {
  if (session.bundle.role !== 'student') throw new Error('Убрать решение может только ученик')
  await ownStudentFile(session).update((cur) => {
    const file = cur ?? emptyStudentFile()
    const previous = file.submissions[homeworkId]
    return {
      ...file,
      files: (file.files ?? []).filter((f) => f.id !== meta.id),
      submissions: previous
        ? { ...file.submissions, [homeworkId]: { ...previous, fileIds: previous.fileIds.filter((id) => id !== meta.id) } }
        : file.submissions,
    }
  }, 'Убран файл решения')
  await removeStored(session, meta)
}
