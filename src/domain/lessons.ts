import type { Session } from '../core/auth/session'
import { fromB64, newId } from '../core/crypto'
import { jsonFile } from '../core/storage'
import { listStudents, ValidationError } from './students'
import {
  emptyStudentFile,
  emptyTutorFile,
  paths,
  type KeysFile,
  type Lesson,
  type LessonLink,
  type LessonSession,
  type LessonsFile,
  type StudentFile,
  type StudentRecord,
  type TutorFile,
} from './types'

export const EGE_TASK_COUNT = 27

export interface LessonInput {
  title: string
  topic: string
  description: string
  egeTask: number | null
  links: LessonLink[]
}

function requireAdmin(session: Session): void {
  if (session.bundle.role !== 'admin') throw new Error('Действие доступно только репетитору')
}

function lessonsFile(session: Session) {
  return jsonFile<LessonsFile>(session.data, paths.shared.lessons)
}

export function validateLessonInput(input: LessonInput): LessonInput {
  const title = input.title.trim()
  if (title.length < 2) throw new ValidationError('title', 'Введите название урока')
  if (
    input.egeTask !== null &&
    (!Number.isInteger(input.egeTask) || input.egeTask < 1 || input.egeTask > EGE_TASK_COUNT)
  ) {
    throw new ValidationError('egeTask', `Номер задания: от 1 до ${EGE_TASK_COUNT}`)
  }
  const links = input.links
    .map((l) => ({ title: l.title.trim(), url: l.url.trim() }))
    .filter((l) => l.title || l.url)
  for (const link of links) {
    if (!/^https?:\/\/\S+$/.test(link.url)) throw new ValidationError('links', 'Ссылка должна начинаться с https://')
    if (!link.title) link.title = link.url
  }
  return { title, topic: input.topic.trim(), description: input.description.trim(), egeTask: input.egeTask, links }
}

/** Общая библиотека уроков: доступна и репетитору, и ученикам. */
export async function listLessons(session: Session): Promise<Lesson[]> {
  return (await lessonsFile(session).load())?.value.lessons ?? []
}

export async function saveLesson(session: Session, raw: LessonInput, id?: string): Promise<Lesson> {
  requireAdmin(session)
  const input = validateLessonInput(raw)
  const now = new Date().toISOString()
  let saved: Lesson | null = null
  await lessonsFile(session).update(
    (cur) => {
      const lessons = cur?.lessons ?? []
      if (id) {
        const existing = lessons.find((l) => l.id === id)
        if (!existing) throw new Error('Урок не найден: возможно, его удалили')
        const updated: Lesson = { ...existing, ...input, updatedAt: now }
        saved = updated
        return { lessons: lessons.map((l) => (l.id === id ? updated : l)) }
      }
      const created: Lesson = { id: newId(), ...input, fileIds: [], createdAt: now, updatedAt: now }
      saved = created
      return { lessons: [...lessons, created] }
    },
    id ? 'Изменён урок' : 'Создан урок',
  )
  return saved!
}

// ── Данные всех учеников (панель репетитора) ───────────────────────────────

export interface Overview {
  students: StudentRecord[]
  files: Record<string, TutorFile>
  /** То, что пишут сами ученики: отметки о выполнении и решения. */
  subs: Record<string, StudentFile>
}

export async function loadOverview(session: Session): Promise<Overview> {
  requireAdmin(session)
  const [students, keys] = await Promise.all([
    listStudents(session),
    jsonFile<KeysFile>(session.data, paths.keys, session.key).load(),
  ])
  const entries = await Promise.all(
    students.map(async (student) => {
      const key = keys?.value.keys[student.id]
      if (!key) throw new Error(`Не найден ключ ученика ${student.name}`)
      const raw = fromB64(key)
      const [file, sub] = await Promise.all([
        jsonFile<TutorFile>(session.data, paths.tutorFile(student.id), raw).load(),
        jsonFile<StudentFile>(session.data, paths.studentFile(student.id), raw).load(),
      ])
      const profile = { name: student.name, timezone: student.timezone, telemostUrl: student.telemostUrl }
      return [student.id, file?.value ?? emptyTutorFile(profile), sub?.value ?? emptyStudentFile()] as const
    }),
  )
  return {
    students,
    files: Object.fromEntries(entries.map(([id, file]) => [id, file])),
    subs: Object.fromEntries(entries.map(([id, , sub]) => [id, sub])),
  }
}

async function tutorFileOf(session: Session, studentId: string) {
  requireAdmin(session)
  const keys = await jsonFile<KeysFile>(session.data, paths.keys, session.key).load()
  const key = keys?.value.keys[studentId]
  if (!key) throw new Error('Ключ ученика не найден')
  return jsonFile<TutorFile>(session.data, paths.tutorFile(studentId), fromB64(key))
}

/** Удалить урок можно, только пока на него никто не ссылается: связи не должны теряться. */
export async function deleteLesson(session: Session, lessonId: string): Promise<void> {
  requireAdmin(session)
  const { students, files } = await loadOverview(session)
  const users = students.filter((s) => {
    const file = files[s.id]
    return file.sessions.some((x) => x.lessonId === lessonId) || file.homework.some((x) => x.lessonId === lessonId)
  })
  if (users.length > 0) {
    throw new Error(
      `Урок назначен или привязан к домашним заданиям: ${users.map((s) => s.name).join(', ')}. Сначала удалите эти занятия.`,
    )
  }
  await lessonsFile(session).update(
    (cur) => ({ lessons: (cur?.lessons ?? []).filter((l) => l.id !== lessonId) }),
    'Удалён урок',
  )
}

// ── Занятия: личные дата и время ученика для общего урока ──────────────────

export interface SessionTiming {
  startsAt: string
  endsAt: string
}

export function validateTiming({ startsAt, endsAt }: SessionTiming): void {
  if (Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(endsAt))) {
    throw new ValidationError('time', 'Укажите дату и время')
  }
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new ValidationError('time', 'Окончание должно быть позже начала')
  }
}

export interface Assignment extends SessionTiming {
  studentId: string
}

/** Назначает один урок нескольким ученикам. Содержание урока не копируется. */
export async function assignLesson(session: Session, lessonId: string, assignments: Assignment[]): Promise<void> {
  requireAdmin(session)
  if (assignments.length === 0) throw new ValidationError('students', 'Выберите хотя бы одного ученика')
  assignments.forEach(validateTiming)
  if (!(await listLessons(session)).some((l) => l.id === lessonId)) throw new Error('Урок не найден')
  for (const a of assignments) {
    const file = await tutorFileOf(session, a.studentId)
    const item: LessonSession = { id: newId(), lessonId, startsAt: a.startsAt, endsAt: a.endsAt, status: 'planned' }
    await file.update((cur) => {
      if (!cur) throw new Error('Данные ученика не найдены')
      return { ...cur, sessions: [...cur.sessions, item] }
    }, 'Назначено занятие')
  }
}

/** Перенос или отмена занятия одного ученика. Остальных не затрагивает. */
export async function updateSession(
  session: Session,
  studentId: string,
  sessionId: string,
  patch: Partial<SessionTiming & Pick<LessonSession, 'status'>>,
): Promise<void> {
  const file = await tutorFileOf(session, studentId)
  await file.update((cur) => {
    const target = cur?.sessions.find((s) => s.id === sessionId)
    if (!cur || !target) throw new Error('Занятие не найдено: возможно, его удалили')
    const next = { ...target, ...patch }
    validateTiming(next)
    return { ...cur, sessions: cur.sessions.map((s) => (s.id === sessionId ? next : s)) }
  }, 'Изменено занятие')
}

export async function deleteSession(session: Session, studentId: string, sessionId: string): Promise<void> {
  const file = await tutorFileOf(session, studentId)
  await file.update((cur) => {
    if (!cur) throw new Error('Данные ученика не найдены')
    return { ...cur, sessions: cur.sessions.filter((s) => s.id !== sessionId) }
  }, 'Удалено занятие')
}

// ── Чтение ──────────────────────────────────────────────────────────────────

export function sortByStart<T extends { startsAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** Ближайшее неотменённое занятие, которое ещё не закончилось. */
export function nextSession(sessions: LessonSession[], now: Date = new Date()): LessonSession | null {
  const nowIso = now.toISOString()
  return sortByStart(sessions.filter((s) => s.status === 'planned' && s.endsAt > nowIso))[0] ?? null
}

export function findLesson(lessons: Lesson[] | undefined, lessonId: string): Lesson | null {
  return lessons?.find((l) => l.id === lessonId) ?? null
}

export function lessonTitle(lessons: Lesson[] | undefined, lessonId: string): string {
  return findLesson(lessons, lessonId)?.title ?? 'Урок удалён из библиотеки'
}
