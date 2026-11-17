import { describe, expect, it } from 'vitest'
import { homeworkLinkOf } from './lessons'
import type { Lesson } from './types'

const lesson = (links: { title: string; url: string }[]): Lesson => ({
  id: 'l1',
  title: '№ 1. Теория',
  topic: '',
  description: '',
  egeTask: 1,
  kind: 'theory',
  links,
  fileIds: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})

describe('ссылка на домашку из урока', () => {
  it('находит ссылку с «Домашка» или «ДЗ»', () => {
    expect(homeworkLinkOf(lesson([{ title: 'Тетрадь', url: 'https://a' }, { title: 'Домашка', url: 'https://b' }]))?.url).toBe('https://b')
    expect(homeworkLinkOf(lesson([{ title: 'ДЗ к уроку', url: 'https://c' }]))?.url).toBe('https://c')
  })

  it('не путает с другими словами и пустым уроком', () => {
    expect(homeworkLinkOf(lesson([{ title: 'Рабочая тетрадь', url: 'https://a' }]))).toBeNull()
    expect(homeworkLinkOf(lesson([{ title: 'Подзадачи', url: 'https://a' }]))).toBeNull()
    expect(homeworkLinkOf(null)).toBeNull()
  })
})
