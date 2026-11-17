import type { Session } from '../core/auth/session'
import { jsonFile } from '../core/storage'
import { ValidationError } from './students'
import { paths } from './types'

/** shared/contacts.json — контакты репетитора, видны всем ученикам. */
export interface ContactsFile {
  /** Имя пользователя в Телеграме без @. */
  telegram: string
}

const contactsFile = (session: Session) => jsonFile<ContactsFile>(session.data, paths.shared.contacts)

export async function loadContacts(session: Session): Promise<ContactsFile> {
  return (await contactsFile(session).load())?.value ?? { telegram: '' }
}

/** Принимает «@name», «name» или ссылку t.me и оставляет только имя. */
export function normalizeTelegram(raw: string): string {
  const value = raw
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^(t\.me|telegram\.me)\//, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '')
  if (value && !/^[A-Za-z0-9_]{5,32}$/.test(value)) {
    throw new ValidationError('telegram', 'Имя в Телеграме: от 5 до 32 латинских букв, цифр или «_»')
  }
  return value
}

export function telegramUrl(handle: string): string | null {
  return handle ? `https://t.me/${handle}` : null
}

export async function saveTelegram(session: Session, raw: string): Promise<void> {
  if (session.bundle.role !== 'admin') throw new Error('Действие доступно только репетитору')
  const telegram = normalizeTelegram(raw)
  await contactsFile(session).update((cur) => ({ ...(cur ?? {}), telegram }), 'Обновлён контакт в Телеграме')
}
