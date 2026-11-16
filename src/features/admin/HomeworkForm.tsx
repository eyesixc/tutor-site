import { dayKey, formatTime, todayKey, TUTOR_TIMEZONE, zonedToUtc } from '../../core/time'
import { EGE_TASK_COUNT } from '../../domain/lessons'
import type { HomeworkInput } from '../../domain/homework'
import type { Homework, Lesson } from '../../domain/types'
import { SelectField, TextAreaField, TextField } from '../../ui/Field'

/** Поля формы как строки: так их удобно редактировать и проверять перед сохранением. */
export interface HomeworkFormState {
  title: string
  topic: string
  egeTask: string
  lessonId: string
  taskCount: string
  maxScore: string
  issuedDate: string
  instructions: string
}

export function blankHomeworkForm(): HomeworkFormState {
  return {
    title: '',
    topic: '',
    egeTask: '',
    lessonId: '',
    taskCount: '',
    maxScore: '',
    issuedDate: todayKey(TUTOR_TIMEZONE),
    instructions: '',
  }
}

export function formFromHomework(hw: Homework): HomeworkFormState {
  return {
    title: hw.title,
    topic: hw.topic,
    egeTask: hw.egeTask === null ? '' : String(hw.egeTask),
    lessonId: hw.lessonId ?? '',
    taskCount: String(hw.taskCount),
    maxScore: hw.maxScore === null ? '' : String(hw.maxScore),
    issuedDate: dayKey(hw.issuedAt, TUTOR_TIMEZONE),
    instructions: hw.instructions,
  }
}

export function formToInput(form: HomeworkFormState): Omit<HomeworkInput, 'deadline'> {
  const number = (text: string) => (text.trim() === '' ? NaN : Number(text.replace(',', '.')))
  return {
    title: form.title,
    topic: form.topic,
    egeTask: form.egeTask ? Number(form.egeTask) : null,
    lessonId: form.lessonId || null,
    taskCount: number(form.taskCount),
    maxScore: form.maxScore.trim() === '' ? null : number(form.maxScore),
    issuedAt: form.issuedDate ? zonedToUtc(form.issuedDate, '00:00', TUTOR_TIMEZONE) : '',
    instructions: form.instructions,
  }
}

export function deadlineParts(iso: string): { date: string; time: string } {
  return { date: dayKey(iso, TUTOR_TIMEZONE), time: formatTime(iso, TUTOR_TIMEZONE) }
}

export function deadlineToUtc(date: string, time: string): string {
  return date && time ? zonedToUtc(date, time, TUTOR_TIMEZONE) : ''
}

export function HomeworkFields({
  form,
  onChange,
  lessons,
  error,
}: {
  form: HomeworkFormState
  onChange(patch: Partial<HomeworkFormState>): void
  lessons: Lesson[]
  error(field: string): string | null
}) {
  const pickLesson = (lessonId: string) => {
    const lesson = lessons.find((l) => l.id === lessonId)
    // Тема и номер подставляются из урока, только если ещё не заполнены вручную.
    onChange({
      lessonId,
      ...(lesson && !form.topic ? { topic: lesson.topic } : {}),
      ...(lesson && !form.egeTask && lesson.egeTask ? { egeTask: String(lesson.egeTask) } : {}),
    })
  }

  return (
    <>
      <TextField label="Название" value={form.title} onChange={(title) => onChange({ title })} error={error('title')} autoFocus />
      <SelectField
        label="К какому уроку относится"
        value={form.lessonId}
        onChange={pickLesson}
        hint="У ученика появится ссылка на этот урок"
      >
        <option value="">Без привязки к уроку</option>
        {[...lessons]
          .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
          .map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
      </SelectField>
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <TextField label="Тема" value={form.topic} onChange={(topic) => onChange({ topic })} hint="По теме строится статистика" />
        <SelectField label="Задание ЕГЭ" value={form.egeTask} onChange={(egeTask) => onChange({ egeTask })} error={error('egeTask')}>
          <option value="">Не привязано</option>
          {Array.from({ length: EGE_TASK_COUNT }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              Задание {n}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Количество заданий"
          value={form.taskCount}
          onChange={(taskCount) => onChange({ taskCount })}
          error={error('taskCount')}
          inputMode="numeric"
          mono
        />
        <TextField
          label="Максимальный балл"
          value={form.maxScore}
          onChange={(maxScore) => onChange({ maxScore })}
          error={error('maxScore')}
          hint="Пусто: без баллов"
          inputMode="decimal"
          mono
        />
        <TextField
          label="Дата выдачи"
          type="date"
          value={form.issuedDate}
          onChange={(issuedDate) => onChange({ issuedDate })}
          error={error('issuedAt')}
          mono
        />
      </div>
      <TextAreaField
        label="Инструкция"
        value={form.instructions}
        onChange={(instructions) => onChange({ instructions })}
        hint="Что нужно сделать и в каком виде сдать"
      />
    </>
  )
}
