import { describe, expect, it } from 'vitest'
import { autoLessonTitle, nextSession, validateLessonInput, validateTiming } from './lessons'
import type { LessonSession } from './types'

const s = (
  id: string,
  startsAt: string,
  endsAt: string,
  status: LessonSession['status'] = 'planned',
): LessonSession => ({ id, lessonId: 'l', startsAt, endsAt, status })

describe('ближайшее занятие', () => {
  const now = new Date('2026-11-16T16:30:00.000Z')

  it('выбирает самое раннее из будущих', () => {
    const list = [
      s('b', '2026-11-19T16:00:00.000Z', '2026-11-19T17:30:00.000Z'),
      s('a', '2026-11-17T16:00:00.000Z', '2026-11-17T17:30:00.000Z'),
    ]
    expect(nextSession(list, now)?.id).toBe('a')
  })

  it('считает ближайшим урок, который уже идёт', () => {
    const list = [
      s('live', '2026-11-16T16:00:00.000Z', '2026-11-16T17:30:00.000Z'),
      s('next', '2026-11-17T16:00:00.000Z', '2026-11-17T17:30:00.000Z'),
    ]
    expect(nextSession(list, now)?.id).toBe('live')
  })

  it('пропускает прошедшие и отменённые', () => {
    const list = [
      s('past', '2026-11-15T16:00:00.000Z', '2026-11-15T17:30:00.000Z'),
      s('cancelled', '2026-11-17T16:00:00.000Z', '2026-11-17T17:30:00.000Z', 'cancelled'),
    ]
    expect(nextSession(list, now)).toBeNull()
  })
})

describe('проверка форм', () => {
  it('не принимает окончание раньше начала', () => {
    expect(() =>
      validateTiming({ startsAt: '2026-11-16T17:00:00.000Z', endsAt: '2026-11-16T16:00:00.000Z' }),
    ).toThrow()
    expect(() =>
      validateTiming({ startsAt: '2026-11-16T16:00:00.000Z', endsAt: '2026-11-16T17:00:00.000Z' }),
    ).not.toThrow()
  })

  it('чистит урок и отбрасывает пустые ссылки', () => {
    const out = validateLessonInput({
      title: '  Рекурсия ',
      topic: ' Задание 16 ',
      description: '',
      egeTask: 16,
      kind: 'theory',
      links: [
        { title: '', url: '' },
        { title: '', url: 'https://example.org/a' },
      ],
    })
    expect(out.title).toBe('Рекурсия')
    expect(out.topic).toBe('Задание 16')
    expect(out.links).toEqual([{ title: 'https://example.org/a', url: 'https://example.org/a' }])
  })

  it('не принимает опасные ссылки и неверный номер задания', () => {
    const base = { title: 'Урок', topic: '', description: '', egeTask: null, kind: null, links: [] }
    expect(() => validateLessonInput({ ...base, links: [{ title: 'x', url: 'javascript:alert(1)' }] })).toThrow()
    expect(() => validateLessonInput({ ...base, egeTask: 28 })).toThrow()
  })
})

describe('название урока по типу', () => {
  it('собирает «№ N. Теория» и «№ N. Практика»', () => {
    expect(autoLessonTitle(16, 'theory')).toBe('№ 16. Теория')
    expect(autoLessonTitle(5, 'practice')).toBe('№ 5. Практика')
  })

  it('без номера оставляет только тип, без типа ничего не подставляет', () => {
    expect(autoLessonTitle(null, 'practice')).toBe('Практика')
    expect(autoLessonTitle(16, null)).toBe('')
  })
})
