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
