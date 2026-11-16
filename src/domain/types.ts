// Формы файлов в репозитории данных. Даты и время — строки ISO 8601 в UTC.

export interface StudentRecord {
  id: string
  name: string
  login: string
  loginHash: string
  /** Идентификатор IANA, например Asia/Novosibirsk. */
  timezone: string
  telemostUrl: string
  createdAt: string
}

/** admin/students.enc */
export interface StudentsIndex {
  students: StudentRecord[]
}

/** admin/keys.enc — ключи учеников, доступные только репетитору. */
export interface KeysFile {
  keys: Record<string, string>
}

/** admin/settings.enc */
export interface AdminSettings {
  createdAt: string
  maxUploadMb: number
}

export interface LessonLink {
  title: string
  url: string
}

export type LessonKind = 'theory' | 'practice'

/** Урок из общей библиотеки. Создаётся один раз и назначается разным ученикам. */
export interface Lesson {
  id: string
  title: string
  topic: string
  description: string
  egeTask: number | null
  /** Тип урока. У уроков, созданных до появления типов, поля нет. */
  kind?: LessonKind | null
  links: LessonLink[]
  fileIds: string[]
  createdAt: string
  updatedAt: string
}

/** shared/lessons.json */
export interface LessonsFile {
  lessons: Lesson[]
}

export interface StudentProfile {
  name: string
  timezone: string
  telemostUrl: string
}

/** Занятие: общий урок из библиотеки плюс личные дата и время ученика. */
export interface LessonSession {
  id: string
  lessonId: string
  startsAt: string
  endsAt: string
  status: 'planned' | 'cancelled'
}

export interface Homework {
  id: string
  title: string
  topic: string
  egeTask: number | null
  lessonId: string | null
  taskCount: number
  issuedAt: string
  deadline: string
  instructions: string
  fileIds: string[]
  maxScore: number | null
  score: number | null
  tutorComment: string
  checkedAt: string | null
  /** Репетитор отметил выполнение вручную, независимо от отметки ученика. */
  doneByTutor: boolean | null
}

export interface MockExamTask {
  number: number
  topic: string
  maxScore: number
  score: number | null
  comment: string
}

export interface MockExam {
  id: string
  title: string
  date: string
  comment: string
  /** Версия справочника, из которой скопированы задания. */
  catalogVersion: string
  tasks: MockExamTask[]
}

/** Сведения о загруженном файле. Само содержимое лежит в репозитории данных или на Диске. */
export interface FileMeta {
  id: string
  /** Имя загруженного файла: под ним он скачивается. */
  name: string
  /** Название, которое дал репетитор. Если пусто, показывается имя файла. */
  title?: string
  mime: string
  size: number
  /** github: до 20 МБ, читается сайтом; disk: крупные файлы и видео. */
  store: 'github' | 'disk'
  path: string
  uploadedAt: string
  /** Личные файлы в репозитории зашифрованы ключом ученика. */
  encrypted: boolean
}

/** shared/files.json */
export interface SharedFilesFile {
  files: FileMeta[]
}

export interface MaterialLink {
  title: string
  url: string
}

/** Полезный материал: видео, картинка, файлы и ссылки. Общий для всех учеников. */
export interface UsefulItem {
  id: string
  title: string
  description: string
  topic: string
  fileIds: string[]
  links: MaterialLink[]
  createdAt: string
}

/** shared/useful.json */
export interface UsefulFile {
  items: UsefulItem[]
}

/** Методичка: файлы по теме или номеру задания. Общая для всех учеников. */
export interface MethodicalItem {
  id: string
  title: string
  description: string
  egeTask: number | null
  topic: string
  fileIds: string[]
  createdAt: string
}

/** shared/methodical.json */
export interface MethodicalFile {
  items: MethodicalItem[]
}

/** students/<id>/tutor.enc — пишет только репетитор. */
export interface TutorFile {
  profile: StudentProfile
  sessions: LessonSession[]
  homework: Homework[]
  mockExams: MockExam[]
  /** Личные файлы от репетитора: вложения к заданиям. */
  files?: FileMeta[]
}

export interface Submission {
  done: boolean
  doneAt: string | null
  fileIds: string[]
}

/** students/<id>/student.enc — пишет только ученик. */
export interface StudentFile {
  submissions: Record<string, Submission>
  videoProgress: Record<string, number>
  /** Файлы решений, загруженные учеником. */
  files?: FileMeta[]
}

export const paths = {
  students: 'admin/students.enc',
  keys: 'admin/keys.enc',
  settings: 'admin/settings.enc',
  tutorFile: (studentId: string) => `students/${studentId}/tutor.enc`,
  studentFile: (studentId: string) => `students/${studentId}/student.enc`,
  studentDir: (studentId: string) => `students/${studentId}`,
  studentFilesDir: (studentId: string) => `students/${studentId}/files`,
  sharedFilesDir: 'files',
  shared: {
    lessons: 'shared/lessons.json',
    files: 'shared/files.json',
    useful: 'shared/useful.json',
    methodical: 'shared/methodical.json',
    examCatalog: 'shared/exam_catalog.json',
  },
} as const

export function emptyTutorFile(profile: StudentProfile): TutorFile {
  return { profile, sessions: [], homework: [], mockExams: [] }
}

export function emptyStudentFile(): StudentFile {
  return { submissions: {}, videoProgress: {} }
}
