// Яндекс Диск: файлы лежат в папке приложения (путь app:/), остальной Диск токену недоступен.

const API = 'https://cloud-api.yandex.net/v1/disk'

export class DiskError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'DiskError'
    this.status = status
  }
}

function describe(status: number, fallback: string): string {
  if (status === 401) return 'Токен Яндекс Диска недействителен или истёк. Замените его в настройках.'
  if (status === 403) return 'У токена нет прав на это действие с Диском.'
  if (status === 404) return 'Файл на Диске не найден.'
  if (status === 409) return 'Папка или файл с таким путём уже существует или родительской папки нет.'
  if (status === 429) return 'Яндекс Диск временно ограничил запросы. Повторите через минуту.'
  if (status === 507) return 'На Яндекс Диске закончилось место.'
  if (status >= 500) return 'Яндекс Диск сейчас недоступен. Повторите позже.'
  return fallback
}

async function call(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(API + path, {
      ...init,
      cache: 'no-store',
      headers: { Authorization: `OAuth ${token}`, Accept: 'application/json', ...init.headers },
    })
  } catch {
    throw new DiskError('Нет связи с Яндекс Диском. Проверьте интернет и повторите.')
  }
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw new DiskError(describe(res.status, fallback), res.status)
  return (await res.json()) as T
}

const q = (path: string) => encodeURIComponent(path)

export interface DiskInfo {
  totalSpace: number
  usedSpace: number
}

export async function diskInfo(token: string): Promise<DiskInfo> {
  const data = await json<{ total_space: number; used_space: number }>(
    await call(token, '/'),
    'Не удалось получить сведения о Диске',
  )
  return { totalSpace: data.total_space, usedSpace: data.used_space }
}

/** Создаёт папку. Уже существующая папка ошибкой не считается. */
export async function ensureFolder(token: string, path: string): Promise<void> {
  const res = await call(token, `/resources?path=${q(path)}`, { method: 'PUT' })
  if (!res.ok && res.status !== 409) throw new DiskError(describe(res.status, 'Не удалось создать папку'), res.status)
}

/** Адрес, на который браузер отправляет содержимое файла. */
export async function uploadLink(token: string, path: string): Promise<string> {
  const { href } = await json<{ href: string }>(
    await call(token, `/resources/upload?path=${q(path)}&overwrite=true`),
    'Не удалось начать загрузку',
  )
  return href
}

export async function uploadFile(token: string, path: string, body: Blob): Promise<void> {
  const href = await uploadLink(token, path)
  let res: Response
  try {
    res = await fetch(href, { method: 'PUT', body })
  } catch {
    throw new DiskError('Загрузка прервалась. Проверьте интернет и повторите.')
  }
  if (!res.ok) throw new DiskError(describe(res.status, 'Не удалось загрузить файл'), res.status)
}

/** Временная ссылка на скачивание. Живёт недолго: запрашивать прямо перед использованием. */
export async function downloadLink(token: string, path: string): Promise<string> {
  const { href } = await json<{ href: string }>(
    await call(token, `/resources/download?path=${q(path)}`),
    'Не удалось получить ссылку на файл',
  )
  return href
}

export async function removeResource(token: string, path: string): Promise<void> {
  const res = await call(token, `/resources?path=${q(path)}&permanently=true`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) throw new DiskError(describe(res.status, 'Не удалось удалить файл'), res.status)
}

export interface DiskCheckStep {
  name: string
  ok: boolean
  detail: string
}

/**
 * Проверка всего, что нужно сайту от Диска: загрузка, ссылка, чтение из браузера, перемотка.
 * Создаёт и удаляет один маленький служебный файл.
 */
export async function runDiskCheck(token: string): Promise<DiskCheckStep[]> {
  const steps: DiskCheckStep[] = []
  const path = 'app:/_check.txt'
  const sample = 'tutor-platform-check-0123456789'
  const step = async (name: string, run: () => Promise<string>): Promise<boolean> => {
    try {
      steps.push({ name, ok: true, detail: await run() })
      return true
    } catch (error) {
      steps.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  const reachable = await step('Доступ к Диску', async () => {
    const info = await diskInfo(token)
    return `Занято ${formatBytes(info.usedSpace)} из ${formatBytes(info.totalSpace)}`
  })
  if (!reachable) return steps

  const uploaded = await step('Загрузка файла из браузера', async () => {
    await uploadFile(token, path, new Blob([sample], { type: 'text/plain' }))
    return 'Файл загружен в папку приложения'
  })
  if (!uploaded) return steps

  let href = ''
  const linked = await step('Временная ссылка на скачивание', async () => {
    href = await downloadLink(token, path)
    return 'Ссылка получена'
  })

  if (linked) {
    await step('Чтение содержимого из браузера (нужно для HTML и личных файлов)', async () => {
      const res = await fetch(href)
      const text = await res.text()
      if (text !== sample) throw new Error('Содержимое не совпало с загруженным')
      return 'Содержимое читается'
    })
    await step('Запрос части файла (нужно для перемотки видео)', async () => {
      const res = await fetch(href, { headers: { Range: 'bytes=5-9' } })
      if (res.status !== 206) throw new Error(`Сервер ответил ${res.status} вместо 206`)
      return 'Перемотка поддерживается'
    })
  }

  await step('Удаление файла', async () => {
    await removeResource(token, path)
    return 'Служебный файл удалён'
  })
  return steps
}

export function formatBytes(bytes: number): string {
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1).replace('.', ',')} ${units[unit]}`
}
