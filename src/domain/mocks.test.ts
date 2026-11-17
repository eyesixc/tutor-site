import { describe, expect, it } from 'vitest'
import { CATALOGS, focusTasks, mocksStats, mockTotals, previousGraded, secondaryScore, SECONDARY_SCALE, taskKind, validateTasks } from './mocks'
import type { MockExam } from './types'

function mock(id: string, date: string, scores: Record<number, number | null>, fill: number | null = null): MockExam {
  return {
    id,
    title: `Пробник ${id}`,
    date,
    comment: '',
    catalogVersion: 'ege-2027',
    tasks: CATALOGS[0].tasks.map((t) => ({
      ...t,
      comment: '',
      score: t.number in scores ? scores[t.number] : fill === null ? null : Math.min(fill, t.maxScore),
    })),
  }
}

/** Все задания на полный балл, кроме перечисленных. */
const fullExcept = (id: string, date: string, scores: Record<number, number>) => {
  const m = mock(id, date, {})
  m.tasks = m.tasks.map((t) => ({ ...t, score: t.number in scores ? scores[t.number] : t.maxScore }))
  return m
}

describe('справочник', () => {
  it('27 заданий, максимум 29 первичных баллов', () => {
    const tasks = CATALOGS[0].tasks
    expect(tasks).toHaveLength(27)
    expect(tasks.reduce((s, t) => s + t.maxScore, 0)).toBe(29)
    expect(tasks[25].maxScore).toBe(2)
  })
})

describe('итоги пробника', () => {
  it('частичный балл не считается ни полным, ни нулём', () => {
    expect(taskKind({ number: 26, topic: '', maxScore: 2, score: 1, comment: '' })).toBe('partial')
    expect(taskKind({ number: 26, topic: '', maxScore: 2, score: 2, comment: '' })).toBe('full')
    expect(taskKind({ number: 26, topic: '', maxScore: 2, score: 0, comment: '' })).toBe('zero')
    expect(taskKind({ number: 26, topic: '', maxScore: 2, score: null, comment: '' })).toBe('unscored')
  })

  it('считает баллы, процент и количества', () => {
    const totals = mockTotals(fullExcept('2', '2026-10-29', { 8: 0, 15: 0, 22: 0, 24: 0, 26: 1, 27: 0 }))
    expect(totals.score).toBe(22)
    expect(totals.max).toBe(29)
    expect(totals.percent).toBe(76)
    expect(totals.full).toBe(21)
    expect(totals.partial).toBe(1)
    expect(totals.zero).toBe(5)
    expect(totals.unscored).toBe(0)
  })

  it('пробник без баллов не даёт процента', () => {
    expect(mockTotals(mock('x', '2026-11-01', {})).percent).toBeNull()
  })

  it('не принимает балл выше максимума', () => {
    const m = mock('x', '2026-11-01', { 1: 2 })
    expect(() => validateTasks(m.tasks)).toThrow()
  })
})

describe('статистика пробников', () => {
  const first = fullExcept('1', '2026-09-24', { 8: 0, 11: 0, 15: 0, 18: 0, 22: 0, 23: 0, 24: 0, 26: 0, 27: 0 })
  const second = fullExcept('2', '2026-10-29', { 8: 0, 15: 0, 22: 0, 24: 0, 26: 1, 27: 0 })
  const empty = mock('3', '2026-11-26', {})
  const stats = mocksStats([second, empty, first])

  it('учитывает только проверенные пробники и идёт по датам', () => {
    expect(stats.count).toBe(2)
    expect(stats.trend.map((p) => p.percent)).toEqual([62, 76])
    expect(stats.scoreSum).toBe(40)
    expect(stats.maxSum).toBe(58)
    expect(stats.averagePercent).toBe(69)
    expect(stats.bestPercent).toBe(76)
  })

  it('считает полные, частичные и нулевые задания', () => {
    expect(stats.full).toBe(39)
    expect(stats.partial).toBe(1)
    expect(stats.zero).toBe(14)
  })

  it('ошибки по номерам: сколько раз и сколько баллов потеряно', () => {
    const byNumber = Object.fromEntries(stats.byNumber.map((r) => [r.key, r]))
    expect(byNumber['8'].times).toBe(2)
    expect(byNumber['11'].times).toBe(1)
    expect(byNumber['1'].times).toBe(0)
    expect(byNumber['26'].lostPoints).toBe(3)
    expect(byNumber['26'].maxPoints).toBe(4)
    expect(byNumber['26'].attempts).toBe(2)
  })

  it('ошибки по темам объединяют задания одной темы', () => {
    expect(stats.byTopic[0].label).toBe('Кластеризация')
    expect(stats.byTopic[0].lostPoints).toBe(4)
    expect(stats.byTopic.every((r) => r.lostPoints > 0)).toBe(true)
  })

  it('изменение справочника не меняет старый пробник', () => {
    const snapshot = JSON.stringify(first.tasks)
    const original = CATALOGS[0].tasks[0].topic
    CATALOGS[0].tasks[0].topic = 'Новая тема'
    expect(JSON.stringify(first.tasks)).toBe(snapshot)
    CATALOGS[0].tasks[0].topic = original
  })
})

describe('вторичные баллы', () => {
  it('шкала растёт от 0 до 100 на 29 первичных', () => {
    expect(SECONDARY_SCALE).toHaveLength(30)
    expect(SECONDARY_SCALE[29]).toBe(100)
    for (let i = 1; i < SECONDARY_SCALE.length; i++) expect(SECONDARY_SCALE[i]).toBeGreaterThan(SECONDARY_SCALE[i - 1])
  })

  it('переводит первичные баллы', () => {
    expect(secondaryScore(6, 29)).toBe(40)
    expect(secondaryScore(15, 29)).toBe(64)
    expect(secondaryScore(0, 29)).toBe(0)
  })

  it('не переводит пробник с другим максимумом', () => {
    expect(secondaryScore(10, 20)).toBeNull()
  })
})

describe('сравнение и приоритеты', () => {
  const make = (id: string, date: string, full: number): MockExam => ({
    id,
    title: id,
    date,
    comment: '',
    catalogVersion: 'ege-2027',
    tasks: CATALOGS[0].tasks.map((t, i) => ({ ...t, score: i < full ? t.maxScore : 0, comment: '' })),
  })
  const a = make('a', '2026-10-01', 5)
  const b = make('b', '2026-11-01', 15)
  const empty: MockExam = { ...make('c', '2026-11-10', 0), tasks: CATALOGS[0].tasks.map((t) => ({ ...t, score: null, comment: '' })) }

  it('предыдущий проверенный пробник', () => {
    expect(previousGraded([a, b, empty], b)?.id).toBe('a')
    expect(previousGraded([a, b, empty], a)).toBeNull()
    expect(previousGraded([a, b, empty], empty)?.id).toBe('b')
  })

  it('сначала номера, проваленные каждый раз', () => {
    const rows = focusTasks(mocksStats([a, b]), 3)
    expect(rows.every((r) => r.times === r.attempts)).toBe(true)
    expect(rows[0].key).toBe('26')
  })
})
