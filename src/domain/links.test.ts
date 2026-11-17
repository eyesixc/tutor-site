import { describe, expect, it } from 'vitest'
import { describeLink, isHomeworkTitle } from './links'

describe('распознавание ссылок', () => {
  it('Яндекс Диск — документ, а по названию — домашка или таблица', () => {
    expect(describeLink('https://disk.yandex.ru/i/abc', 'Рабочая тетрадь')).toEqual({
      kind: 'doc',
      service: 'Яндекс Диск',
      caption: 'Яндекс Диск · документ',
    })
    expect(describeLink('https://disk.yandex.ru/d/abc', 'Домашка').kind).toBe('homework')
    expect(describeLink('https://disk.yandex.ru/d/abc', 'Таблица для задания 9').kind).toBe('table')
  })

  it('видео и тренажёры', () => {
    expect(describeLink('https://youtu.be/xyz', 'Разбор').kind).toBe('video')
    expect(describeLink('https://rutube.ru/video/1', 'Разбор').service).toBe('Rutube')
    expect(describeLink('https://kompege.ru/task?id=1', 'Задачи').caption).toBe('КомпЕГЭ · тренажёр')
    expect(describeLink('https://inf-ege.sdamgia.ru/test', 'Вариант').service).toBe('Решу ЕГЭ')
  })

  it('незнакомый сайт показывает адрес', () => {
    expect(describeLink('https://www.example.org/page', 'Статья')).toEqual({
      kind: 'web',
      service: 'example.org',
      caption: 'example.org · сайт',
    })
  })

  it('домашка: «Домашка», «ДЗ», но не слова с этими буквами', () => {
    expect(isHomeworkTitle('ДЗ к уроку')).toBe(true)
    expect(isHomeworkTitle('Домашнее задание')).toBe(true)
    expect(isHomeworkTitle('Подзадачи')).toBe(false)
  })
})
