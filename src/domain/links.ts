/** Что за ссылка: по адресу и названию определяется сервис и тип материала. */

export type LinkKind = 'homework' | 'doc' | 'table' | 'video' | 'trainer' | 'chat' | 'code' | 'web'

export interface LinkInfo {
  kind: LinkKind
  /** Понятное название сервиса вместо адреса: «Яндекс Диск», «КомпЕГЭ». */
  service: string
  /** Подпись под названием: «Яндекс Диск · документ». */
  caption: string
}

const HOMEWORK_TITLE = /домаш|(^|[^а-яё])дз([^а-яё]|$)/i

export function isHomeworkTitle(title: string): boolean {
  return HOMEWORK_TITLE.test(title)
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return url
  }
}

const SERVICES: { test: RegExp; service: string; kind: LinkKind }[] = [
  { test: /(^|\.)disk\.yandex\.|(^|\.)yadi\.sk$/, service: 'Яндекс Диск', kind: 'doc' },
  { test: /(^|\.)docs\.google\.com$/, service: 'Google Документы', kind: 'doc' },
  { test: /(^|\.)drive\.google\.com$/, service: 'Google Диск', kind: 'doc' },
  { test: /(^|\.)cloud\.mail\.ru$/, service: 'Облако Mail', kind: 'doc' },
  { test: /(^|\.)(youtube\.com|youtu\.be)$/, service: 'YouTube', kind: 'video' },
  { test: /(^|\.)rutube\.ru$/, service: 'Rutube', kind: 'video' },
  { test: /(^|\.)(vkvideo\.ru)$/, service: 'VK Видео', kind: 'video' },
  { test: /(^|\.)kompege\.ru$/, service: 'КомпЕГЭ', kind: 'trainer' },
  { test: /(^|\.)sdamgia\.ru$/, service: 'Решу ЕГЭ', kind: 'trainer' },
  { test: /(^|\.)fipi\.ru$/, service: 'ФИПИ', kind: 'trainer' },
  { test: /(^|\.)stepik\.org$/, service: 'Stepik', kind: 'trainer' },
  { test: /(^|\.)(t\.me|telegram\.me)$/, service: 'Телеграм', kind: 'chat' },
  { test: /(^|\.)github\.com$/, service: 'GitHub', kind: 'code' },
]

const KIND_CAPTION: Record<LinkKind, string> = {
  homework: 'домашнее задание',
  doc: 'документ',
  table: 'таблица',
  video: 'видео',
  trainer: 'тренажёр',
  chat: 'чат',
  code: 'код',
  web: 'сайт',
}

export function describeLink(url: string, title: string): LinkInfo {
  const host = hostOf(url)
  const known = SERVICES.find((s) => s.test.test(host))
  let kind: LinkKind = known?.kind ?? 'web'
  if (/vk\.com$/.test(host) && /\/video/.test(url)) kind = 'video'
  if (kind === 'doc' && (/таблиц/i.test(title) || /\/spreadsheets\//.test(url))) kind = 'table'
  if (isHomeworkTitle(title)) kind = 'homework'
  const service = known?.service ?? (kind === 'video' ? 'VK Видео' : host)
  const caption = kind === 'homework' ? service : `${service} · ${KIND_CAPTION[kind]}`
  return { kind, service, caption }
}

/** Роль ссылки в уроке: по ней выбирается порядок плиток. */
export type LinkRole = 'workbook' | 'theory' | 'homework' | 'other'

export function linkRole(title: string): LinkRole {
  if (isHomeworkTitle(title)) return 'homework'
  if (/рабоч\S*\s+тетрад|^\s*практика\s*$/i.test(title)) return 'workbook'
  if (/теори/i.test(title)) return 'theory'
  return 'other'
}

const ROLE_ORDER: Record<LinkRole, number> = { workbook: 0, theory: 1, homework: 2, other: 3 }

/** Ссылки урока по порядку: рабочая тетрадь, теория, домашка, остальное. Внутри роли порядок сохраняется. */
export function orderLessonLinks<T extends { title: string }>(links: T[]): T[] {
  return links
    .map((link, i) => ({ link, i, r: ROLE_ORDER[linkRole(link.title)] }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.link)
}
