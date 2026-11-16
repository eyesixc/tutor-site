import { describe, expect, it } from 'vitest'
import {
  homeworkStats,
  homeworkStatus,
  isArchived,
  sortHomework,
  statsByTopic,
  validateHomeworkInput,
  viewHomework,
  type HomeworkInput,
} from './homework'
import type { Homework, Submission } from './types'

const NOW = new Date('2026-11-16T12:00:00.000Z')

function hw(patch: Partial<Homework> = {}): Homework {
  return {
    id: 'h1',
    title: 'Рекурсия',
    topic: 'Рекурсия',
    egeTask: 16,
    lessonId: null,
    taskCount: 8,
    issuedAt: '2026-11-10T09:00:00.000Z',
    deadline: '2026-11-20T16:00:00.000Z',
    instructions: '',
    fileIds: [],
    maxScore: 8,
    score: null,
    tutorComment: '',
    checkedAt: null,
    doneByTutor: null,
    ...patch,
  }
}

const done: Submission = { done: true, doneAt: '2026-11-15T10:00:00.000Z', fileIds: [] }
const PAST = '2026-11-12T16:00:00.000Z'

describe('статус и долги', () => {
  it('до дедлайна невыполненная работа не долг', () => {
    expect(homeworkStatus(hw(), undefined, NOW)).toBe('todo')
  })

  it('после дедлайна невыполненная работа становится долгом сама', () => {
    expect(homeworkStatus(hw({ deadline: PAST }), undefined, NOW)).toBe('debt')
  })

  it('выполненная работа не становится долгом, даже если дедлайн прошёл', () => {
    expect(homeworkStatus(hw({ deadline: PAST }), done, NOW)).toBe('done')
  })

  it('снятая учеником отметка возвращает долг', () => {
    expect(homeworkStatus(hw({ deadline: PAST }), { done: false, doneAt: null, fileIds: [] }, NOW)).toBe('debt')
  })

  it('отметка репетитора важнее отметки ученика', () => {
    expect(homeworkStatus(hw({ deadline: PAST, doneByTutor: true }), undefined, NOW)).toBe('done')
    expect(homeworkStatus(hw({ deadline: PAST, doneByTutor: false }), done, NOW)).toBe('debt')
  })

  it('проверенная работа остаётся проверенной', () => {
    expect(homeworkStatus(hw({ deadline: PAST, checkedAt: '2026-11-14T10:00:00.000Z' }), undefined, NOW)).toBe('checked')
  })
})

describe('порядок и архив', () => {
  const views = viewHomework(
    [
      hw({ id: 'checked', checkedAt: '2026-11-14T10:00:00.000Z', score: 6 }),
      hw({ id: 'todoLate', deadline: '2026-11-25T16:00:00.000Z' }),
      hw({ id: 'debt', deadline: PAST }),
      hw({ id: 'todoSoon', deadline: '2026-11-18T16:00:00.000Z' }),
      hw({ id: 'done' }),
    ],
    { done },
    NOW,
  )

  it('по умолчанию: долги, затем текущие по дедлайну, затем сделанные', () => {
    expect(sortHomework(views, 'default', () => '').map((v) => v.hw.id)).toEqual([
      'debt',
      'todoSoon',
      'todoLate',
      'done',
      'checked',
    ])
  })

  it('в архив уходят только давно сделанные работы', () => {
    const old = viewHomework([hw({ checkedAt: '2026-10-20T10:00:00.000Z' })], {}, NOW)[0]
    const fresh = viewHomework([hw({ checkedAt: '2026-11-10T10:00:00.000Z' })], {}, NOW)[0]
    const oldDebt = viewHomework([hw({ deadline: '2026-09-01T10:00:00.000Z' })], {}, NOW)[0]
    expect(isArchived(old, NOW)).toBe(true)
    expect(isArchived(fresh, NOW)).toBe(false)
    expect(isArchived(oldDebt, NOW)).toBe(false)
  })
})

describe('статистика', () => {
  const views = viewHomework(
    [
      hw({ id: 'a', maxScore: 10, score: 5, checkedAt: '2026-11-01T10:00:00.000Z', topic: 'Логика', egeTask: 2 }),
      hw({ id: 'b', maxScore: 8, score: 8, checkedAt: '2026-11-08T10:00:00.000Z' }),
      hw({ id: 'c', maxScore: null, score: null, checkedAt: '2026-11-09T10:00:00.000Z' }),
      hw({ id: 'd' }),
      hw({ id: 'e', deadline: PAST }),
      hw({ id: 'f' }),
    ],
    { d: done },
    NOW,
  )

  it('считает количества', () => {
    const stats = homeworkStats(views)
    expect(stats.issued).toBe(6)
    expect(stats.done).toBe(4)
    expect(stats.notDone).toBe(2)
    expect(stats.debts).toBe(1)
  })

  it('баллы и процент берёт только из проверенных работ с баллами', () => {
    const stats = homeworkStats(views)
    expect(stats.scoreSum).toBe(13)
    expect(stats.maxSum).toBe(18)
    expect(stats.averagePercent).toBe(75)
    expect(stats.trend).toEqual([
      { label: 'Рекурсия', percent: 50 },
      { label: 'Рекурсия', percent: 100 },
    ])
  })

  it('без проверенных работ процента нет, а не ноль', () => {
    expect(homeworkStats(viewHomework([hw()], {}, NOW)).averagePercent).toBeNull()
  })

  it('пересчитывается после проверки', () => {
    const before = homeworkStats(viewHomework([hw({ id: 'x' })], { x: done }, NOW))
    const after = homeworkStats(viewHomework([hw({ id: 'x', score: 4, checkedAt: NOW.toISOString() })], { x: done }, NOW))
    expect(before.averagePercent).toBeNull()
    expect(after.averagePercent).toBe(50)
    expect(after.scoreSum).toBe(4)
  })

  it('группирует по темам, к которым привязаны работы', () => {
    const groups = statsByTopic(views)
    expect(groups.map((g) => g.topic)).toEqual(['Логика, задание 2', 'Рекурсия, задание 16'])
    expect(groups[0].stats.issued).toBe(1)
    expect(groups[1].stats.issued).toBe(5)
  })
})

describe('проверка формы', () => {
  const base: HomeworkInput = {
    title: 'Задание',
    topic: '',
    egeTask: null,
    lessonId: null,
    taskCount: 5,
    maxScore: 5,
    issuedAt: '2026-11-10T09:00:00.000Z',
    deadline: '2026-11-20T16:00:00.000Z',
    instructions: '',
  }

  it('принимает корректные данные', () => {
    expect(() => validateHomeworkInput(base)).not.toThrow()
  })

  it('отклоняет дедлайн раньше выдачи, нулевое количество и пустое название', () => {
    expect(() => validateHomeworkInput({ ...base, deadline: '2026-11-09T09:00:00.000Z' })).toThrow()
    expect(() => validateHomeworkInput({ ...base, taskCount: 0 })).toThrow()
    expect(() => validateHomeworkInput({ ...base, title: ' ' })).toThrow()
    expect(() => validateHomeworkInput({ ...base, maxScore: 0 })).toThrow()
  })
})
