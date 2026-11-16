import { describe, expect, it } from 'vitest'
import { exportHomeworkCsv, exportMocksCsv, exportStudentJson } from './export'
import { CATALOGS, validateCatalog } from './mocks'
import { emptyStudentFile, emptyTutorFile, type StudentRecord, type TutorFile } from './types'

const student: StudentRecord = {
  id: 's1',
  name: 'Пётр Иванов',
  login: 'petya',
  loginHash: 'hash',
  timezone: 'Asia/Vladivostok',
  telemostUrl: '',
  createdAt: '2026-09-01T00:00:00.000Z',
}

const file: TutorFile = {
  ...emptyTutorFile({ name: student.name, timezone: student.timezone, telemostUrl: '' }),
  homework: [
    {
      id: 'h1',
      title: 'Задачи; "сложные"',
      topic: 'Рекурсия',
      egeTask: 16,
      lessonId: null,
      taskCount: 8,
      issuedAt: '2026-11-01T09:00:00.000Z',
      deadline: '2026-11-08T16:00:00.000Z',
      instructions: '',
      fileIds: [],
      maxScore: 8,
      score: 6,
      tutorComment: 'Хорошо',
      checkedAt: '2026-11-09T10:00:00.000Z',
      doneByTutor: null,
    },
  ],
  mockExams: [
    {
      id: 'm1',
      title: 'Пробник № 1',
      date: '2026-10-29',
      comment: '',
      catalogVersion: 'ege-2027',
      tasks: CATALOGS[0].tasks.map((t) => ({ ...t, score: t.maxScore, comment: '' })),
    },
  ],
}

describe('выгрузка', () => {
  it('JSON содержит данные ученика и не содержит ключей и хеша логина', () => {
    const text = exportStudentJson(student, file, emptyStudentFile(), [])
    const data = JSON.parse(text)
    expect(data.student.name).toBe('Пётр Иванов')
    expect(data.homework[0].status).toBe('Проверено')
    expect(data.mockExams[0].totals.percent).toBe(100)
    expect(text).not.toContain('loginHash')
    expect(text).not.toContain('"hash"')
  })

  it('CSV экранирует точки с запятой и кавычки', () => {
    const text = exportHomeworkCsv(file, emptyStudentFile(), [])
    const lines = text.replace('﻿', '').split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[1].startsWith('"Задачи; ""сложные""";Рекурсия;16;')).toBe(true)
    expect(lines[1]).toContain(';Проверено;6;8;Хорошо')
  })

  it('CSV пробников: по столбцу на задание', () => {
    const lines = exportMocksCsv(file).replace('﻿', '').split('\r\n')
    expect(lines[0].split(';')).toHaveLength(5 + 27)
    expect(lines[1].startsWith('Пробник № 1;2026-10-29;29;29;100;1;')).toBe(true)
  })
})

describe('справочник заданий', () => {
  it('перенумеровывает задания и чистит темы', () => {
    const out = validateCatalog({
      id: 'x',
      title: ' ЕГЭ 2028 ',
      tasks: [
        { number: 7, topic: ' Графы ', maxScore: 1 },
        { number: 9, topic: 'Сортировка', maxScore: 2 },
      ],
    })
    expect(out.title).toBe('ЕГЭ 2028')
    expect(out.tasks).toEqual([
      { number: 1, topic: 'Графы', maxScore: 1 },
      { number: 2, topic: 'Сортировка', maxScore: 2 },
    ])
  })

  it('отклоняет пустую тему, пустой список и неверный балл', () => {
    expect(() => validateCatalog({ id: 'x', title: 'Версия', tasks: [] })).toThrow()
    expect(() => validateCatalog({ id: 'x', title: 'Версия', tasks: [{ number: 1, topic: ' ', maxScore: 1 }] })).toThrow()
    expect(() => validateCatalog({ id: 'x', title: 'Версия', tasks: [{ number: 1, topic: 'Тема', maxScore: 9 }] })).toThrow()
  })
})
