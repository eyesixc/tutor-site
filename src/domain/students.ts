import {
  authFilePath,
  buildAuthFile,
  type AdminBundle,
  type StudentBundle,
} from '../core/auth/authFile'
import type { Session } from '../core/auth/session'
import {
  fromB64,
  generateKey,
  generatePassword,
  hashLogin,
  newId,
  normalizeLogin,
  PBKDF2_ITERATIONS,
  toB64,
  type Bytes,
} from '../core/crypto'
import { removeResource } from '../core/disk'
import { isLocalRepo, jsonFile } from '../core/storage'
import { isValidTimeZone } from '../core/time'
import {
  emptyStudentFile,
  emptyTutorFile,
  paths,
  type KeysFile,
  type StudentFile,
  type StudentRecord,
  type StudentsIndex,
  type TutorFile,
} from './types'

export class ValidationError extends Error {
  field: string
  constructor(field: string, message: string) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

export interface StudentInput {
  name: string
  login: string
  timezone: string
  telemostUrl: string
}

function adminBundle(session: Session): AdminBundle {
  if (session.bundle.role !== 'admin' || !session.site) throw new Error('Действие доступно только репетитору')
  return session.bundle
}

export function validateStudentInput(input: StudentInput): StudentInput {
  const name = input.name.trim()
  const login = normalizeLogin(input.login)
  const telemostUrl = input.telemostUrl.trim()
  if (name.length < 2) throw new ValidationError('name', 'Введите имя ученика')
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(login)) {
    throw new ValidationError('login', 'Логин: 3–32 символа, латинские буквы, цифры, точка, дефис, подчёркивание')
  }
  if (!isValidTimeZone(input.timezone)) throw new ValidationError('timezone', 'Выберите часовой пояс')
  if (telemostUrl && !/^https:\/\/\S+$/.test(telemostUrl)) {
    throw new ValidationError('telemostUrl', 'Ссылка должна начинаться с https://')
  }
  return { name, login, timezone: input.timezone, telemostUrl }
}

export async function listStudents(session: Session): Promise<StudentRecord[]> {
  adminBundle(session)
  const index = await jsonFile<StudentsIndex>(session.data, paths.students, session.key).load()
  return index?.value.students ?? []
}

/** Ключ ученика из хранилища репетитора. */
export async function studentKey(session: Session, studentId: string): Promise<Bytes> {
  adminBundle(session)
  const keys = await jsonFile<KeysFile>(session.data, paths.keys, session.key).load()
  const key = keys?.value.keys[studentId]
  if (!key) throw new Error('Ключ ученика не найден. Данные ученика повреждены или удалены.')
  return fromB64(key)
}

async function writeAuthFile(
  session: Session,
  record: Pick<StudentRecord, 'id' | 'loginHash'>,
  key: Bytes,
  password: string,
): Promise<void> {
  const admin = adminBundle(session)
  const bundle: StudentBundle = {
    role: 'student',
    userId: record.id,
    dataRepo: admin.dataRepo,
    githubToken: admin.studentGithubToken,
    diskToken: admin.diskToken,
  }
  // В локальном режиме разработки итераций меньше, чтобы тесты в браузере шли быстро.
  const iterations = isLocalRepo(admin.dataRepo) ? 1000 : PBKDF2_ITERATIONS
  const file = await buildAuthFile(password, key, bundle, iterations)
  const path = authFilePath(record.loginHash)
  const existing = await session.site!.read(path)
  await session.site!.write(path, JSON.stringify(file), {
    sha: existing?.sha,
    message: 'Обновлён файл входа',
  })
}

/** Создаёт ученика и возвращает пароль. Пароль нигде не сохраняется. */
export async function createStudent(
  session: Session,
  rawInput: StudentInput,
): Promise<{ student: StudentRecord; password: string }> {
  const input = validateStudentInput(rawInput)
  if (input.login === session.login) throw new ValidationError('login', 'Этот логин занят репетитором')
  const existing = await listStudents(session)
  if (existing.some((s) => s.login === input.login)) {
    throw new ValidationError('login', 'Ученик с таким логином уже есть')
  }

  const student: StudentRecord = {
    id: newId(),
    name: input.name,
    login: input.login,
    loginHash: await hashLogin(input.login),
    timezone: input.timezone,
    telemostUrl: input.telemostUrl,
    createdAt: new Date().toISOString(),
  }
  const key = generateKey()
  const password = generatePassword()

  // Порядок важен: сначала ключ, иначе при сбое останутся файлы, которые нечем расшифровать.
  await jsonFile<KeysFile>(session.data, paths.keys, session.key).update(
    (cur) => ({ keys: { ...cur?.keys, [student.id]: toB64(key) } }),
    'Добавлен ключ ученика',
  )
  const profile = { name: student.name, timezone: student.timezone, telemostUrl: student.telemostUrl }
  await jsonFile<TutorFile>(session.data, paths.tutorFile(student.id), key).save(
    emptyTutorFile(profile),
    'Создан ученик',
  )
  await jsonFile<StudentFile>(session.data, paths.studentFile(student.id), key).save(
    emptyStudentFile(),
    'Создан ученик',
  )
  await jsonFile<StudentsIndex>(session.data, paths.students, session.key).update(
    (cur) => ({ students: [...(cur?.students ?? []), student] }),
    'Добавлен ученик',
  )
  await writeAuthFile(session, student, key, password)
  return { student, password }
}

export type StudentPatch = Pick<StudentInput, 'name' | 'timezone' | 'telemostUrl'>

export async function updateStudent(session: Session, studentId: string, patch: StudentPatch): Promise<StudentRecord> {
  const students = await listStudents(session)
  const current = students.find((s) => s.id === studentId)
  if (!current) throw new Error('Ученик не найден')
  const input = validateStudentInput({ ...patch, login: current.login })
  const updated: StudentRecord = {
    ...current,
    name: input.name,
    timezone: input.timezone,
    telemostUrl: input.telemostUrl,
  }
  const key = await studentKey(session, studentId)
  const profile = { name: updated.name, timezone: updated.timezone, telemostUrl: updated.telemostUrl }
  await jsonFile<TutorFile>(session.data, paths.tutorFile(studentId), key).update(
    (cur) => ({ ...(cur ?? emptyTutorFile(profile)), profile }),
    'Изменён профиль ученика',
  )
  await jsonFile<StudentsIndex>(session.data, paths.students, session.key).update(
    (cur) => ({ students: (cur?.students ?? []).map((s) => (s.id === studentId ? updated : s)) }),
    'Изменён ученик',
  )
  return updated
}

/** Старый пароль перестаёт работать сразу после обновления сайта. */
export async function resetStudentPassword(session: Session, studentId: string): Promise<string> {
  const student = (await listStudents(session)).find((s) => s.id === studentId)
  if (!student) throw new Error('Ученик не найден')
  const password = generatePassword()
  await writeAuthFile(session, student, await studentKey(session, studentId), password)
  return password
}

/** Удаляет всё личное: вход, ключ, данные, файлы на Диске. Общие материалы не затрагиваются. */
export async function deleteStudent(session: Session, studentId: string): Promise<void> {
  const admin = adminBundle(session)
  const student = (await listStudents(session)).find((s) => s.id === studentId)
  if (!student) return

  // Сначала закрываем вход, затем убираем данные.
  await session.site!.remove(authFilePath(student.loginHash), 'Удалён файл входа')
  for (const name of await session.data.list(paths.studentDir(studentId))) {
    await session.data.remove(`${paths.studentDir(studentId)}/${name}`, 'Удалён ученик')
  }
  if (admin.diskToken) {
    await removeResource(admin.diskToken, `app:/students/${studentId}`)
  }
  await jsonFile<StudentsIndex>(session.data, paths.students, session.key).update(
    (cur) => ({ students: (cur?.students ?? []).filter((s) => s.id !== studentId) }),
    'Удалён ученик',
  )
  await jsonFile<KeysFile>(session.data, paths.keys, session.key).update((cur) => {
    const keys = { ...cur?.keys }
    delete keys[studentId]
    return { keys }
  }, 'Удалён ключ ученика')
}

/** Данные самого ученика: то, что видит его кабинет. */
export async function loadOwnTutorFile(session: Session): Promise<TutorFile> {
  const file = await jsonFile<TutorFile>(session.data, paths.tutorFile(session.bundle.userId), session.key).load()
  if (!file) throw new Error('Данные кабинета не найдены. Обратитесь к репетитору.')
  return file.value
}
