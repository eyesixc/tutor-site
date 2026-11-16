import { formatDay, formatTime, TUTOR_TIMEZONE } from '../core/time'
import { STATUS_LABEL, viewHomework } from './homework'
import { lessonTitle } from './lessons'
import { mockTotals } from './mocks'
import type { Lesson, StudentFile, StudentRecord, TutorFile } from './types'

const when = (iso: string) => `${formatDay(iso, TUTOR_TIMEZONE)} ${formatTime(iso, TUTOR_TIMEZONE)}`

/** Полная выгрузка данных ученика. Время московское, ключи и пароли в выгрузку не попадают. */
export function exportStudentJson(student: StudentRecord, file: TutorFile, subs: StudentFile, lessons: Lesson[]): string {
  const views = viewHomework(file.homework, subs.submissions)
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      student: {
        name: student.name,
        login: student.login,
        timezone: student.timezone,
        telemostUrl: student.telemostUrl,
        createdAt: student.createdAt,
      },
      sessions: file.sessions.map((s) => ({
        lesson: lessonTitle(lessons, s.lessonId),
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        status: s.status,
      })),
      homework: views.map(({ hw, submission, status }) => ({
        title: hw.title,
        topic: hw.topic,
        egeTask: hw.egeTask,
        lesson: hw.lessonId ? lessonTitle(lessons, hw.lessonId) : null,
        taskCount: hw.taskCount,
        issuedAt: hw.issuedAt,
        deadline: hw.deadline,
        status: STATUS_LABEL[status],
        doneAt: submission?.doneAt ?? null,
        score: hw.score,
        maxScore: hw.maxScore,
        checkedAt: hw.checkedAt,
        tutorComment: hw.tutorComment,
        instructions: hw.instructions,
      })),
      mockExams: file.mockExams.map((m) => ({ ...m, totals: mockTotals(m) })),
    },
    null,
    2,
  )
}

function csv(rows: (string | number | null)[][]): string {
  const cell = (value: string | number | null) => {
    const text = value === null ? '' : String(value)
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  // BOM и точка с запятой: так файл сразу правильно открывается в русском Excel.
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')
}

export function exportHomeworkCsv(file: TutorFile, subs: StudentFile, lessons: Lesson[]): string {
  const views = viewHomework(file.homework, subs.submissions)
  return csv([
    ['Название', 'Тема', 'Задание ЕГЭ', 'Урок', 'Заданий', 'Выдано', 'Дедлайн', 'Статус', 'Баллы', 'Максимум', 'Комментарий'],
    ...views.map(({ hw, status }) => [
      hw.title,
      hw.topic,
      hw.egeTask,
      hw.lessonId ? lessonTitle(lessons, hw.lessonId) : '',
      hw.taskCount,
      when(hw.issuedAt),
      when(hw.deadline),
      STATUS_LABEL[status],
      hw.score,
      hw.maxScore,
      hw.tutorComment,
    ]),
  ])
}

export function exportMocksCsv(file: TutorFile): string {
  const numbers = [...new Set(file.mockExams.flatMap((m) => m.tasks.map((t) => t.number)))].sort((a, b) => a - b)
  return csv([
    ['Пробник', 'Дата', 'Баллы', 'Максимум', 'Процент', ...numbers.map((n) => `№ ${n}`)],
    ...file.mockExams.map((m) => {
      const totals = mockTotals(m)
      return [
        m.title,
        m.date,
        totals.score,
        totals.max,
        totals.percent,
        ...numbers.map((n) => m.tasks.find((t) => t.number === n)?.score ?? null),
      ]
    }),
  ])
}

export function saveTextFile(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
