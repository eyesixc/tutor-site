import { MagnifyingGlass, Plus, X } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useSession } from '../../core/auth/session'
import { pickFiles, removeStored, renameSharedFiles } from '../../domain/files'
import {
  addLessonFiles,
  autoLessonTitle,
  EGE_TASK_COUNT,
  KIND_LABEL,
  removeLessonFile,
  saveLesson,
  type LessonInput,
} from '../../domain/lessons'
import { ValidationError } from '../../domain/students'
import type { FileMeta, Lesson, LessonKind } from '../../domain/types'
import { Button, IconButton } from '../../ui/Button'
import { Dialog, DialogActions } from '../../ui/Dialog'
import { inputBase, inputClass, SelectField, TextAreaField, TextField } from '../../ui/Field'
import { EmptyState, ErrorState, errorMessage, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { useLessons, useOverview, useRefresh } from '../shared/data'
import { useSharedFiles } from '../shared/filesUi'
import { FormFiles } from '../shared/MaterialsPages'
import { useQueryClient } from '@tanstack/react-query'

export function LessonFormDialog({
  lesson,
  onClose,
  onSaved,
}: {
  lesson: Lesson | null
  onClose(): void
  onSaved?(lesson: Lesson): void
}) {
  const session = useSession()
  const refresh = useRefresh()
  const [form, setForm] = useState<LessonInput>(() => ({
    title: lesson?.title ?? '',
    topic: lesson?.topic ?? '',
    description: lesson?.description ?? '',
    egeTask: lesson?.egeTask ?? null,
    kind: lesson?.kind ?? null,
    links: lesson?.links.length ? lesson.links : [],
  }))
  // Пока название не меняли руками, оно собирается из номера и типа: «№ 16. Теория».
  const [titleTouched, setTitleTouched] = useState(!!lesson)
  const setNumberOrKind = (patch: { egeTask?: number | null; kind?: LessonKind | null }) =>
    setForm((f) => {
      const next = { ...f, ...patch }
      return titleTouched ? next : { ...next, title: autoLessonTitle(next.egeTask, next.kind) }
    })
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null)
  const err = (field: string) => (fieldError?.field === field ? fieldError.message : null)
  const queryClient = useQueryClient()
  const shared = useSharedFiles()
  // Файлы применяются при сохранении: до этого новые лежат в хранилище без привязки.
  const [added, setAdded] = useState<FileMeta[]>([])
  const [removed, setRemoved] = useState<FileMeta[]>([])
  const [renamed, setRenamed] = useState<Record<string, string>>({})
  const withTitle = (f: FileMeta): FileMeta => (f.id in renamed ? { ...f, title: renamed[f.id] } : f)
  const existing = pickFiles(shared.data, lesson?.fileIds ?? []).filter((f) => !removed.some((r) => r.id === f.id))

  const discard = () => {
    for (const meta of added) void removeStored(session, meta).catch(() => undefined)
    onClose()
  }

  const save = useMutation({
    mutationFn: async () => {
      const saved = await saveLesson(session, form, lesson?.id)
      if (added.length > 0) {
        await addLessonFiles(
          session,
          saved.id,
          added.map((f) => (f.id in renamed ? { ...f, title: renamed[f.id].trim() } : f)),
        )
      }
      const addedIds = new Set(added.map((f) => f.id))
      await renameSharedFiles(session, Object.fromEntries(Object.entries(renamed).filter(([id]) => !addedIds.has(id))))
      for (const meta of removed) await removeLessonFile(session, saved.id, meta)
      return saved
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['shared-files'] })
      await refresh()
      toast.success(lesson ? 'Урок сохранён' : 'Урок создан')
      onClose()
      onSaved?.(saved)
    },
    onError: (cause) => {
      if (cause instanceof ValidationError) setFieldError({ field: cause.field, message: cause.message })
      else toast.error(errorMessage(cause))
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (save.isPending) return
    setFieldError(null)
    save.mutate()
  }

  const setLink = (index: number, patch: Partial<{ title: string; url: string }>) =>
    setForm((f) => ({ ...f, links: f.links.map((l, i) => (i === index ? { ...l, ...patch } : l)) }))

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !save.isPending && discard()}
      title={lesson ? 'Изменить урок' : 'Новый урок'}
      description={
        lesson
          ? 'Изменения увидят все ученики, которым назначен урок. Даты занятий не изменятся.'
          : 'Урок создаётся один раз, затем его можно назначать разным ученикам на разные даты.'
      }
      persistent={save.isPending}
      wide
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Задание ЕГЭ"
            value={form.egeTask === null ? '' : String(form.egeTask)}
            onChange={(v) => setNumberOrKind({ egeTask: v ? Number(v) : null })}
            error={err('egeTask')}
            autoFocus
          >
            <option value="">Не привязано</option>
            {Array.from({ length: EGE_TASK_COUNT }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Задание {n}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Тип урока"
            value={form.kind ?? ''}
            onChange={(v) => setNumberOrKind({ kind: (v || null) as LessonKind | null })}
            hint="В календаре теория и практика разного цвета"
          >
            <option value="">Другое</option>
            <option value="theory">{KIND_LABEL.theory}</option>
            <option value="practice">{KIND_LABEL.practice}</option>
          </SelectField>
        </div>
        <TextField
          label="Название"
          value={form.title}
          onChange={(title) => {
            setTitleTouched(title.trim() !== '')
            setForm((f) => ({ ...f, title }))
          }}
          error={err('title')}
          hint={titleTouched ? undefined : 'Подставляется из номера и типа. Можно написать своё'}
        />
        <div className="grid gap-4">
          <TextField
            label="Тема"
            value={form.topic}
            onChange={(topic) => setForm((f) => ({ ...f, topic }))}
            hint="Например: рекурсия. По теме строится статистика"
          />
        </div>
        <TextAreaField
          label="Описание"
          value={form.description}
          onChange={(description) => setForm((f) => ({ ...f, description }))}
          hint="Что разбираем на уроке"
        />

        <FormFiles
          files={[...existing, ...added].map(withTitle)}
          onRename={(id, title) => setRenamed((r) => ({ ...r, [id]: title }))}
          onAdd={(metas) => setAdded((a) => [...a, ...metas])}
          onRemove={(meta) => {
            if (added.some((a) => a.id === meta.id)) {
              setAdded((a) => a.filter((x) => x.id !== meta.id))
              void removeStored(session, meta).catch(() => undefined)
            } else {
              setRemoved((r) => [...r, meta])
            }
          }}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Ссылки</legend>
          {form.links.map((link, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                aria-label={`Ссылка ${i + 1}: название`}
                placeholder="Название"
                value={link.title}
                onChange={(e) => setLink(i, { title: e.target.value })}
                className={cn(inputBase, 'min-w-0 flex-1 basis-40')}
              />
              <input
                aria-label={`Ссылка ${i + 1}: адрес`}
                placeholder="https://…"
                inputMode="url"
                value={link.url}
                onChange={(e) => setLink(i, { url: e.target.value })}
                className={cn(inputBase, 'min-w-0 flex-[2] basis-56')}
              />
              <IconButton
                label={`Убрать ссылку ${i + 1}`}
                onClick={() => setForm((f) => ({ ...f, links: f.links.filter((_, j) => j !== i) }))}
              >
                <X size={18} />
              </IconButton>
            </div>
          ))}
          {err('links') && (
            <p role="alert" className="text-sm text-red">
              {err('links')}
            </p>
          )}
          <div>
            <Button
              size="sm"
              icon={<Plus size={16} weight="bold" />}
              onClick={() => setForm((f) => ({ ...f, links: [...f.links, { title: '', url: '' }] }))}
            >
              Добавить ссылку
            </Button>
          </div>
        </fieldset>

        <DialogActions>
          <Button onClick={discard} disabled={save.isPending}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {lesson ? 'Сохранить' : 'Создать урок'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export function LessonsPage() {
  const lessons = useLessons()
  const overview = useOverview()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')

  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const file of Object.values(overview.data?.files ?? {})) {
      for (const s of file.sessions) counts.set(s.lessonId, (counts.get(s.lessonId) ?? 0) + 1)
    }
    return counts
  }, [overview.data])

  const all = lessons.data ?? []
  const needle = query.trim().toLowerCase()
  const list = all
    .filter((l) => !needle || `${l.title} ${l.topic}`.toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <>
      <PageHeader
        title="Уроки"
        description="Библиотека уроков. Каждый урок создаётся один раз и назначается ученикам на свои даты."
        action={
          all.length > 0 && (
            <Button variant="primary" icon={<Plus size={18} weight="bold" />} onClick={() => setCreating(true)}>
              Создать урок
            </Button>
          )
        }
      />

      {lessons.isPending ? (
        <Panel className="flex flex-col gap-3 p-5">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </Panel>
      ) : lessons.isError ? (
        <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />
      ) : all.length === 0 ? (
        <Panel>
          <EmptyState
            title="Уроков пока нет"
            description="Создайте первый урок: название, тема и описание. После этого его можно назначить одному или нескольким ученикам."
            action={
              <Button variant="primary" icon={<Plus size={18} weight="bold" />} onClick={() => setCreating(true)}>
                Создать урок
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <label className="relative mb-4 block max-w-md">
            <span className="sr-only">Поиск по названию и теме</span>
            <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию и теме"
              className={cn(inputClass, 'pl-10')}
            />
          </label>
          <Panel>
            {list.length === 0 ? (
              <p className="px-5 py-6 text-muted">По запросу «{query}» уроков не найдено.</p>
            ) : (
              <ul>
                {list.map((lesson) => {
                  const count = usage.get(lesson.id) ?? 0
                  return (
                    <li key={lesson.id} className="border-b border-line last:border-b-0">
                      <Link
                        to={`/admin/lessons/${lesson.id}`}
                        className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 hover:bg-sunken sm:px-5"
                      >
                        <div className="min-w-0 flex-1 basis-64">
                          <p className="flex items-center gap-2 font-medium">
                            <span className="truncate">{lesson.title}</span>
                            {lesson.kind && (
                              <span
                                className={cn(
                                  'shrink-0 rounded-full px-2 py-0.5 text-xs',
                                  lesson.kind === 'practice' ? 'bg-prac-soft text-prac' : 'bg-pen-soft text-pen',
                                )}
                              >
                                {KIND_LABEL[lesson.kind]}
                              </span>
                            )}
                          </p>
                          <p className="truncate text-sm text-muted">{lesson.topic || 'Тема не указана'}</p>
                        </div>
                        <p className="w-28 text-sm text-muted">
                          {lesson.egeTask ? (
                            <>
                              Задание <span className="num text-ink">{lesson.egeTask}</span>
                            </>
                          ) : (
                            'Без номера'
                          )}
                        </p>
                        <p className="w-36 text-sm text-muted">
                          {count === 0 ? (
                            'Не назначен'
                          ) : (
                            <>
                              Занятий: <span className="num text-ink">{count}</span>
                            </>
                          )}
                        </p>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </>
      )}

      {creating && (
        <LessonFormDialog
          lesson={null}
          onClose={() => setCreating(false)}
          onSaved={(lesson) => navigate(`/admin/lessons/${lesson.id}`)}
        />
      )}
    </>
  )
}
