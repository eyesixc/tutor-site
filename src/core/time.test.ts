import { describe, expect, it } from 'vitest'
import {
  dayKey,
  formatDayKey,
  formatOffset,
  formatTime,
  monthGrid,
  monthTitle,
  shiftDayKey,
  shiftMonth,
  zonedToUtc,
  zoneOffsetMinutes,
} from './time'

describe('часовые пояса', () => {
  it('переводит московское время в UTC', () => {
    expect(zonedToUtc('2026-11-16', '18:00', 'Europe/Moscow')).toBe('2026-11-16T15:00:00.000Z')
  })

  it('урок в 18:00 по Москве ученик во Владивостоке видит в 01:00 следующего дня', () => {
    const iso = zonedToUtc('2026-11-16', '18:00', 'Europe/Moscow')
    expect(formatTime(iso, 'Asia/Vladivostok')).toBe('01:00')
    expect(dayKey(iso, 'Asia/Vladivostok')).toBe('2026-11-17')
    expect(formatTime(iso, 'Europe/Kaliningrad')).toBe('17:00')
    expect(dayKey(iso, 'Europe/Kaliningrad')).toBe('2026-11-16')
  })

  it('учитывает летнее время там, где оно есть', () => {
    expect(zonedToUtc('2026-07-01', '12:00', 'Europe/Berlin')).toBe('2026-07-01T10:00:00.000Z')
    expect(zonedToUtc('2026-12-01', '12:00', 'Europe/Berlin')).toBe('2026-12-01T11:00:00.000Z')
  })

  it('обратное преобразование даёт исходное время', () => {
    for (const zone of ['Europe/Moscow', 'Asia/Kamchatka', 'America/New_York', 'Asia/Kolkata']) {
      const iso = zonedToUtc('2027-03-28', '09:30', zone)
      expect(formatTime(iso, zone)).toBe('09:30')
      expect(dayKey(iso, zone)).toBe('2027-03-28')
    }
  })

  it('считает и подписывает смещение', () => {
    expect(zoneOffsetMinutes('Europe/Moscow')).toBe(180)
    expect(formatOffset(180)).toBe('UTC+3')
    expect(formatOffset(330)).toBe('UTC+5:30')
    expect(formatOffset(-300)).toBe('UTC−5')
  })
})

describe('календарь', () => {
  it('сетка ноября 2026 начинается с понедельника 26 октября', () => {
    const grid = monthGrid({ year: 2026, month: 11 })
    expect(grid).toHaveLength(42)
    expect(grid[0]).toBe('2026-10-26')
    expect(grid[6]).toBe('2026-11-01')
    expect(grid[41]).toBe('2026-12-06')
  })

  it('месяц, начинающийся с понедельника, не получает пустой первой недели', () => {
    expect(monthGrid({ year: 2027, month: 2 })[0]).toBe('2027-02-01')
  })

  it('листает месяцы через границу года', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 })
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('подписывает месяц и день по-русски', () => {
    expect(monthTitle({ year: 2026, month: 11 })).toBe('Ноябрь 2026')
    expect(formatDayKey('2026-11-16')).toBe('16 ноября')
    expect(formatDayKey('2026-11-16', true)).toBe('понедельник, 16 ноября')
  })
})
