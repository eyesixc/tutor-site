import { describe, expect, it } from 'vitest'
import { normalizeTelegram, telegramUrl } from './contacts'

describe('контакт в Телеграме', () => {
  it('принимает имя, @имя и ссылку', () => {
    expect(normalizeTelegram('tutor_name')).toBe('tutor_name')
    expect(normalizeTelegram(' @tutor_name ')).toBe('tutor_name')
    expect(normalizeTelegram('https://t.me/tutor_name/')).toBe('tutor_name')
  })

  it('пустое значение разрешено', () => {
    expect(normalizeTelegram('')).toBe('')
    expect(telegramUrl('')).toBeNull()
  })

  it('не принимает кириллицу и короткие имена', () => {
    expect(() => normalizeTelegram('репетитор')).toThrow()
    expect(() => normalizeTelegram('abc')).toThrow()
  })

  it('строит ссылку', () => {
    expect(telegramUrl('tutor_name')).toBe('https://t.me/tutor_name')
  })
})
