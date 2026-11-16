import { describe, expect, it } from 'vitest'
import { formatTime, dayKey } from '../core/time'
import { homeworkStatus } from './homework'
import { egeTaskFromTitle, parseCsv, parseHomeworkCsv, rowToHomework } from './importHomework'

const HEAD = 'Название,Урок,Дата выдачи,Получено,Категория,Статус,Максимум,Дедлайн,Комментарий преподавателя,Процент выполнения'

const SAMPLE = [
  HEAD,
  'ДЗ №1 - 4 задание,"https://example.org/a,https://example.org/b",2026/09/24,6,,сделано ,6,2026/09/27 00:00,"молодец, 100%",100',
  'ДЗ №3 - Задание 7,https://example.org/c,2026/10/08,26,,cделано,28,2026/10/15 00:00,Внимательно!,92.85',
  'Вводное занятие,,2026/11/06,,,сделано,,2026/11/12 00:00,,',
  'ДЗ №2 - 3 задание,https://example.org/d,2026/11/06,,,выдано,,2026/11/19 00:00,,',
  'ДЗ №1 - Задание 1,,2026/10/26,11,,сделано,12,2026/10/26,,91.6',
  'ДЗ №1 - 1 задание,,2026/10/22,3,,сделано,3,2026/10/21 00:00,,100',
  ',,,,,,,,,',
  '',
].join('\n')

describe('разбор CSV', () => {
  it('понимает кавычки, запятые внутри ячеек и пустые строки', () => {
    expect(parseCsv('a,"b,c","d ""e"""\n\n1,2,3\n')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', '2', '3'],
    ])
  })

  it('достаёт номер задания из названия', () => {
    expect(egeTaskFromTitle('ДЗ №1 - 4 задание')).toBe(4)
    expect(egeTaskFromTitle('ДЗ №3 - Задание 7')).toBe(7)
    expect(egeTaskFromTitle('ДЗ 2 - 12 задание')).toBe(12)
    expect(egeTaskFromTitle('Вводное занятие')).toBeNull()
  })
})

describe('импорт домашних заданий', () => {
  const { rows, skipped } = parseHomeworkCsv(SAMPLE)

  it('берёт все строки с названием и датами, пустые пропускает', () => {
    expect(rows).toHaveLength(6)
    expect(skipped).toHaveLength(0)
  })

  it('разбирает ссылки, баллы, комментарий и даты по Москве', () => {
    const first = rows[0]
    expect(first.links).toEqual(['https://example.org/a', 'https://example.org/b'])
    expect(first.score).toBe(6)
    expect(first.maxScore).toBe(6)
    expect(first.comment).toBe('молодец, 100%')
    expect(first.egeTask).toBe(4)
    expect(dayKey(first.issuedAt, 'Europe/Moscow')).toBe('2026-09-24')
    expect(formatTime(first.deadline, 'Europe/Moscow')).toBe('00:00')
  })

  it('«сделано» распознаёт с пробелом и с латинской буквой', () => {
    expect(rows[0].done).toBe(true)
    expect(rows[1].done).toBe(true)
    expect(rows[3].done).toBe(false)
  })

  it('дедлайн без времени считается концом дня', () => {
    expect(formatTime(rows[4].deadline, 'Europe/Moscow')).toBe('23:59')
    expect(rows[4].warnings).toEqual([])
  })

  it('предупреждает, когда дедлайн раньше выдачи, но строку не теряет', () => {
    expect(rows[5].warnings).toContain('дедлайн раньше даты выдачи')
  })

  it('сделанное становится проверенным с баллами, выданное остаётся невыполненным', () => {
    const now = new Date('2026-11-16T12:00:00Z')
    const checked = rowToHomework(rows[0])
    expect(homeworkStatus(checked, undefined, now)).toBe('checked')
    expect(checked.score).toBe(6)
    expect(checked.instructions).toContain('https://example.org/a')

    const noScore = rowToHomework(rows[2])
    expect(homeworkStatus(noScore, undefined, now)).toBe('checked')
    expect(noScore.score).toBeNull()
    expect(noScore.maxScore).toBeNull()

    const open = rowToHomework(rows[3])
    expect(homeworkStatus(open, undefined, now)).toBe('todo')
    expect(open.checkedAt).toBeNull()
  })

  it('отказывается от файла без нужных столбцов', () => {
    expect(() => parseHomeworkCsv('Имя,Балл\nПётр,5')).toThrow(/столбца/)
  })
})
