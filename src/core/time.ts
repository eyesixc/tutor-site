// Время хранится в UTC (ISO 8601), показывается в часовом поясе зрителя.

export const TUTOR_TIMEZONE = 'Europe/Moscow'

const RUSSIAN_ZONES: [string, string][] = [
  ['Europe/Kaliningrad', 'Калининград'],
  ['Europe/Moscow', 'Москва'],
  ['Europe/Samara', 'Самара'],
  ['Asia/Yekaterinburg', 'Екатеринбург'],
  ['Asia/Omsk', 'Омск'],
  ['Asia/Novosibirsk', 'Новосибирск'],
  ['Asia/Krasnoyarsk', 'Красноярск'],
  ['Asia/Irkutsk', 'Иркутск'],
  ['Asia/Yakutsk', 'Якутск'],
  ['Asia/Vladivostok', 'Владивосток'],
  ['Asia/Magadan', 'Магадан'],
  ['Asia/Kamchatka', 'Камчатка'],
]

/** Смещение пояса от UTC в минутах на указанный момент. */
export function zoneOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - at.getTime()) / 60000)
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

export interface ZoneOption {
  id: string
  label: string
}

export function zoneLabel(id: string): string {
  const city = RUSSIAN_ZONES.find(([zone]) => zone === id)?.[1] ?? id.split('/').pop()!.replace(/_/g, ' ')
  return `${city} (${formatOffset(zoneOffsetMinutes(id))})`
}

/** Сначала российские пояса с запада на восток, затем остальные по алфавиту. */
export function zoneOptions(): { russian: ZoneOption[]; other: ZoneOption[] } {
  const russianIds = new Set(RUSSIAN_ZONES.map(([id]) => id))
  const all: string[] =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return {
    russian: RUSSIAN_ZONES.map(([id]) => ({ id, label: zoneLabel(id) })),
    other: all.filter((id) => !russianIds.has(id)).map((id) => ({ id, label: zoneLabel(id) })),
  }
}

// ── Даты в поясе зрителя ────────────────────────────────────────────────────

/** Ключ дня вида 2026-11-16 в указанном поясе. */
export function dayKey(at: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    typeof at === 'string' ? new Date(at) : at,
  )
}

export function todayKey(timeZone: string): string {
  return dayKey(new Date(), timeZone)
}

/** Местные дата и время в поясе → момент в UTC (ISO). Учитывает переход на летнее время. */
export function zonedToUtc(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  let utc = wall - zoneOffsetMinutes(timeZone, new Date(wall)) * 60000
  // Смещение считалось для приблизительного момента: уточняем для найденного.
  utc = wall - zoneOffsetMinutes(timeZone, new Date(utc)) * 60000
  return new Date(utc).toISOString()
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso),
  )
}

export function formatTimeRange(startIso: string, endIso: string, timeZone: string): string {
  return `${formatTime(startIso, timeZone)}–${formatTime(endIso, timeZone)}`
}

function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

/** «16 ноября» или «понедельник, 16 ноября» по ключу дня. */
export function formatDayKey(key: string, withWeekday = false, withYear = false): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    ...(withWeekday ? { weekday: 'long' } : {}),
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(keyToDate(key))
}

export function formatDay(iso: string, timeZone: string, withWeekday = false): string {
  return formatDayKey(dayKey(iso, timeZone), withWeekday)
}

/** «Сегодня», «Завтра» или дата с днём недели. */
export function relativeDay(iso: string, timeZone: string): string {
  const key = dayKey(iso, timeZone)
  const today = todayKey(timeZone)
  if (key === today) return 'Сегодня'
  if (key === shiftDayKey(today, 1)) return 'Завтра'
  return formatDayKey(key, true)
}

export function shiftDayKey(key: string, days: number): string {
  const date = keyToDate(key)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export interface YearMonth {
  year: number
  /** 1–12 */
  month: number
}

export function yearMonthOf(key: string): YearMonth {
  const [year, month] = key.split('-').map(Number)
  return { year, month }
}

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export function monthKey({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function monthTitle(ym: YearMonth): string {
  const text = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(ym.year, ym.month - 1, 15)),
  )
  return (text.charAt(0).toUpperCase() + text.slice(1)).replace(/\s*г\.$/, '')
}

/** 42 ключа дней: шесть недель с понедельника, покрывающие месяц. */
export function monthGrid({ year, month }: YearMonth): string[] {
  const first = new Date(Date.UTC(year, month - 1, 1, 12))
  const lead = (first.getUTCDay() + 6) % 7
  const start = shiftDayKey(first.toISOString().slice(0, 10), -lead)
  return Array.from({ length: 42 }, (_, i) => shiftDayKey(start, i))
}

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** Сколько полных дней прошло после момента: для «просрочено на 2 дня». */
export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000))
}

/** «1 день», «2 дня», «5 дней». */
export function daysWord(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} день`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} дня`
  return `${n} дней`
}
