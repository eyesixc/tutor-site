import { ArrowSquareOut, MagnifyingGlass, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useSession } from '../../core/auth/session'
import { formatDay, TUTOR_TIMEZONE } from '../../core/time'
import { fileKind, pickFiles, registerSharedFiles, removeStored } from '../../domain/files'
import { EGE_TASK_COUNT } from '../../domain/lessons'
import {
  deleteMethodical,
  deleteUseful,
  dropSharedFiles,
  listMethodical,
  listUseful,
  saveMethodical,
  saveUseful,
} from '../../domain/materials'
import { ValidationError } from '../../domain/students'
import type { FileMeta, MaterialLink, MethodicalItem, UsefulItem } from '../../domain/types'
import { Button, IconButton } from '../../ui/Button'
import { ConfirmDialog, Dialog, DialogActions } from '../../ui/Dialog'
import { inputBase, inputClass, SelectField, TextAreaField, TextField } from '../../ui/Field'
import { EmptyState, ErrorState, errorMessage, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { FileViewInline } from './FileViewPage'
import { FileList, Uploader, useSharedFiles } from './filesUi'

function useRole() {
  const session = useSession()
  const admin = session.bundle.role === 'admin'
  return { admin, viewBase: admin ? '/admin/files/shared' : '/files/shared', tz: TUTOR_TIMEZONE }
}

function Search({ value, onChange, label }: { value: string; onChange(v: string): void; label: string }) {
  return (
    <label className="relative block max-w-md flex-1">
      <span className="sr-only">{label}</span>
      <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} className={cn(inputClass, 'pl-10')} />
    </label>
  )
}

function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-11 max-w-md" />
      <Skeleton className="h-64" />
    </div>
  )
}

/** Файлы в форме материала: уже прикреплённые и только что загруженные. */
function FormFiles({ files, onAdd, onRemove }: { files: FileMeta[]; onAdd(m: FileMeta[]): void; onRemove(m: FileMeta): void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">Файлы</legend>
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-2 rounded-control border border-line px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
          <IconButton label={`Открепить ${f.name}`} onClick={() => onRemove(f)}>
            <X size={18} />
          </IconButton>
        </div>
      ))}
      <Uploader
        scope={{ kind: 'shared' }}
        onUploaded={async (metas) => {
          onAdd(metas)
        }}
      />
    </fieldset>
  )
}

function ItemActions({ onEdit, onDelete, name }: { onEdit(): void; onDelete(): void; name: string }) {
  return (
    <div className="flex shrink-0">
      <IconButton label={`Изменить: ${name}`} onClick={onEdit}>
        <PencilSimple size={18} />
      </IconButton>
      <IconButton label={`Удалить: ${name}`} onClick={onDelete}>
        <Trash size={18} />
      </IconButton>
    </div>
  )
}

/** Общая логика формы: новые файлы регистрируются при сохранении, открепленные удаляются. */
function useMaterialForm(initialFiles: FileMeta[], onClose: () => void, queryKey: string) {
  const session = useSession()
  const queryClient = useQueryClient()
  const [files, setFiles] = useState<FileMeta[]>(initialFiles)
  const [added, setAdded] = useState<FileMeta[]>([])
  const [removed, setRemoved] = useState<FileMeta[]>([])
  const [busy, setBusy] = useState(false)
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null)

  const submit = async (save: (fileIds: string[]) => Promise<void>, done: string) => {
    if (busy) return
    setFieldError(null)
    setBusy(true)
    try {
      await registerSharedFiles(session, added)
      setAdded([])
      await save(files.map((f) => f.id))
      await dropSharedFiles(session, removed.map((f) => f.id))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [queryKey] }),
        queryClient.invalidateQueries({ queryKey: ['shared-files'] }),
      ])
      toast.success(done)
      onClose()
    } catch (cause) {
      if (cause instanceof ValidationError) setFieldError({ field: cause.field, message: cause.message })
      else toast.error(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  /** Закрытие без сохранения: загруженные в форме файлы никому не нужны. */
  const discard = () => {
    for (const meta of added) void removeStored(session, meta).catch(() => undefined)
    onClose()
  }

  return {
    files,
    busy,
    discard,
    err: (field: string) => (fieldError?.field === field ? fieldError.message : null),
    add: (metas: FileMeta[]) => {
      setFiles((f) => [...f, ...metas])
      setAdded((a) => [...a, ...metas])
    },
    remove: (meta: FileMeta) => {
      setFiles((f) => f.filter((x) => x.id !== meta.id))
      setRemoved((r) => [...r, meta])
    },
    submit,
  }
}

// ── Полезные материалы ──────────────────────────────────────────────────────

function UsefulDialog({ item, files, onClose }: { item: UsefulItem | null; files: FileMeta[]; onClose(): void }) {
  const session = useSession()
  const form = useMaterialForm(files, onClose, 'useful')
  const [title, setTitle] = useState(item?.title ?? '')
  const [topic, setTopic] = useState(item?.topic ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [links, setLinks] = useState<MaterialLink[]>(item?.links ?? [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void form.submit(
      (fileIds) => saveUseful(session, { title, topic, description, links }, fileIds, item?.id),
      item ? 'Материал сохранён' : 'Материал добавлен',
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !form.busy && form.discard()} title={item ? 'Изменить материал' : 'Новый материал'} persistent={form.busy} wide>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField label="Название" value={title} onChange={setTitle} error={form.err('title')} autoFocus />
        <TextField label="Тема" value={topic} onChange={setTopic} hint="Категория для фильтра, например: Python" />
        <TextAreaField label="Описание" value={description} onChange={setDescription} rows={3} />
        <FormFiles files={form.files} onAdd={form.add} onRemove={form.remove} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Внешние ссылки</legend>
          {links.map((link, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                aria-label={`Ссылка ${i + 1}: название`}
                placeholder="Название"
                value={link.title}
                onChange={(e) => setLinks((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                className={cn(inputBase, 'min-w-0 flex-1 basis-40')}
              />
              <input
                aria-label={`Ссылка ${i + 1}: адрес`}
                placeholder="https://…"
                value={link.url}
                onChange={(e) => setLinks((l) => l.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                className={cn(inputBase, 'min-w-0 flex-[2] basis-56')}
              />
              <IconButton label={`Убрать ссылку ${i + 1}`} onClick={() => setLinks((l) => l.filter((_, j) => j !== i))}>
                <X size={18} />
              </IconButton>
            </div>
          ))}
          {form.err('links') && (
            <p role="alert" className="text-sm text-red">
              {form.err('links')}
            </p>
          )}
          <div>
            <Button size="sm" icon={<Plus size={16} weight="bold" />} onClick={() => setLinks((l) => [...l, { title: '', url: '' }])}>
              Добавить ссылку
            </Button>
          </div>
        </fieldset>
        <DialogActions>
          <Button onClick={form.discard} disabled={form.busy}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={form.busy}>
            {item ? 'Сохранить' : 'Добавить материал'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export function UsefulPage() {
  const session = useSession()
  const queryClient = useQueryClient()
  const { admin, viewBase } = useRole()
  const items = useQuery({ queryKey: ['useful'], queryFn: () => listUseful(session) })
  const shared = useSharedFiles()
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState('')
  const [editing, setEditing] = useState<UsefulItem | 'new' | null>(null)
  const [deleting, setDeleting] = useState<UsefulItem | null>(null)

  if (items.isPending || shared.isPending) return <Loading />
  if (items.isError) return <ErrorState error={items.error} onRetry={() => void items.refetch()} />
  if (shared.isError) return <ErrorState error={shared.error} onRetry={() => void shared.refetch()} />

  const all = [...items.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const topics = [...new Set(all.map((i) => i.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'))
  const needle = query.trim().toLowerCase()
  const visible = all.filter(
    (i) => (!topic || i.topic === topic) && (!needle || `${i.title} ${i.description} ${i.topic}`.toLowerCase().includes(needle)),
  )
  const addButton = (
    <Button variant="primary" icon={<Plus size={18} weight="bold" />} onClick={() => setEditing('new')}>
      Добавить материал
    </Button>
  )

  return (
    <>
      <PageHeader title="Полезные материалы" description="Видео, изображения и ссылки. Общие для всех учеников." action={admin && all.length > 0 && addButton} />
      {all.length === 0 ? (
        <Panel>
          <EmptyState
            title="Материалов пока нет"
            description={admin ? 'Добавьте видео, картинку или ссылку: материал сразу увидят все ученики.' : 'Здесь появятся видео и ссылки от репетитора.'}
            action={admin ? addButton : undefined}
          />
        </Panel>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-3">
            <Search value={query} onChange={setQuery} label="Поиск по материалам" />
            {topics.length > 0 && (
              <div role="group" aria-label="Категория" className="flex flex-wrap gap-2">
                {['', ...topics].map((t) => (
                  <button
                    key={t || 'all'}
                    type="button"
                    aria-pressed={topic === t}
                    onClick={() => setTopic(t)}
                    className={cn(
                      'h-11 rounded-full border px-4 text-sm font-medium transition-colors duration-150',
                      topic === t ? 'border-pen bg-pen text-pen-ink' : 'border-line bg-surface hover:bg-sunken',
                    )}
                  >
                    {t || 'Все'}
                  </button>
                ))}
              </div>
            )}
          </div>
          {visible.length === 0 ? (
            <Panel>
              <p className="px-5 py-6 text-muted">Под эти условия материалов не нашлось.</p>
            </Panel>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {visible.map((item) => {
                const files = pickFiles(shared.data, item.fileIds)
                const lead = files.find((f) => ['video', 'image'].includes(fileKind(f)))
                const rest = files.filter((f) => f !== lead)
                return (
                  <Panel key={item.id} className="flex flex-col overflow-hidden">
                    {lead && <FileViewInline meta={lead} />}
                    <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
                      <div className="min-w-0">
                        <h2 className="text-lg break-words">{item.title}</h2>
                        <p className="mt-0.5 text-sm text-muted">
                          {item.topic ? `${item.topic}. ` : ''}Добавлено {formatDay(item.createdAt, TUTOR_TIMEZONE)}
                        </p>
                        {item.description && <p className="mt-2 whitespace-pre-line">{item.description}</p>}
                        {item.links.length > 0 && (
                          <ul className="mt-2 flex flex-col">
                            {item.links.map((link) => (
                              <li key={link.url}>
                                <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-pen underline">
                                  {link.title} <ArrowSquareOut size={16} aria-hidden />
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {admin && <ItemActions name={item.title} onEdit={() => setEditing(item)} onDelete={() => setDeleting(item)} />}
                    </div>
                    {(rest.length > 0 || lead) && <FileList files={lead ? [lead, ...rest] : rest} viewBase={viewBase} />}
                  </Panel>
                )
              })}
            </div>
          )}
        </>
      )}

      {editing && (
        <UsefulDialog
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? null : editing}
          files={editing === 'new' ? [] : pickFiles(shared.data, editing.fileIds)}
          onClose={() => setEditing(null)}
        />
      )}
      <DeleteDialog
        item={deleting}
        onClose={() => setDeleting(null)}
        onDelete={async (id) => {
          await deleteUseful(session, id)
          await queryClient.invalidateQueries({ queryKey: ['useful'] })
          await queryClient.invalidateQueries({ queryKey: ['shared-files'] })
        }}
      />
    </>
  )
}

function DeleteDialog({
  item,
  onClose,
  onDelete,
}: {
  item: { id: string; title: string } | null
  onClose(): void
  onDelete(id: string): Promise<void>
}) {
  return (
    <ConfirmDialog
      open={!!item}
      onOpenChange={(open) => !open && onClose()}
      title="Удалить материал?"
      description={`«${item?.title ?? ''}» и его файлы будут удалены у всех учеников. Отменить удаление нельзя.`}
      confirmLabel="Удалить"
      danger
      onConfirm={async () => {
        if (!item) return
        try {
          await onDelete(item.id)
          toast.success('Материал удалён')
        } catch (cause) {
          toast.error(errorMessage(cause))
          throw cause
        }
      }}
    />
  )
}

// ── Методички ───────────────────────────────────────────────────────────────

function MethodicalDialog({ item, files, onClose }: { item: MethodicalItem | null; files: FileMeta[]; onClose(): void }) {
  const session = useSession()
  const form = useMaterialForm(files, onClose, 'methodical')
  const [title, setTitle] = useState(item?.title ?? '')
  const [topic, setTopic] = useState(item?.topic ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [egeTask, setEgeTask] = useState(item?.egeTask ? String(item.egeTask) : '')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void form.submit(
      (fileIds) =>
        saveMethodical(session, { title, topic, description, egeTask: egeTask ? Number(egeTask) : null }, fileIds, item?.id),
      item ? 'Методичка сохранена' : 'Методичка добавлена',
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !form.busy && form.discard()} title={item ? 'Изменить методичку' : 'Новая методичка'} persistent={form.busy} wide>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField label="Название" value={title} onChange={setTitle} error={form.err('title')} autoFocus />
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <TextField label="Тема" value={topic} onChange={setTopic} />
          <SelectField label="Задание ЕГЭ" value={egeTask} onChange={setEgeTask} error={form.err('egeTask')}>
            <option value="">Без номера</option>
            {Array.from({ length: EGE_TASK_COUNT }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Задание {n}
              </option>
            ))}
          </SelectField>
        </div>
        <TextAreaField label="Описание" value={description} onChange={setDescription} rows={3} />
        <FormFiles files={form.files} onAdd={form.add} onRemove={form.remove} />
        {form.err('file') && (
          <p role="alert" className="text-sm text-red">
            {form.err('file')}
          </p>
        )}
        <DialogActions>
          <Button onClick={form.discard} disabled={form.busy}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={form.busy}>
            {item ? 'Сохранить' : 'Добавить методичку'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export function MethodicalPage() {
  const session = useSession()
  const queryClient = useQueryClient()
  const { admin, viewBase } = useRole()
  const items = useQuery({ queryKey: ['methodical'], queryFn: () => listMethodical(session) })
  const shared = useSharedFiles()
  const [query, setQuery] = useState('')
  const [task, setTask] = useState<number | null>(null)
  const [editing, setEditing] = useState<MethodicalItem | 'new' | null>(null)
  const [deleting, setDeleting] = useState<MethodicalItem | null>(null)

  if (items.isPending || shared.isPending) return <Loading />
  if (items.isError) return <ErrorState error={items.error} onRetry={() => void items.refetch()} />
  if (shared.isError) return <ErrorState error={shared.error} onRetry={() => void shared.refetch()} />

  const all = items.data
  const counts = new Map<number, number>()
  for (const item of all) if (item.egeTask) counts.set(item.egeTask, (counts.get(item.egeTask) ?? 0) + 1)
  const needle = query.trim().toLowerCase()
  const visible = all.filter(
    (i) => (task === null || i.egeTask === task) && (!needle || `${i.title} ${i.description} ${i.topic}`.toLowerCase().includes(needle)),
  )
  // Группы по номеру задания; материалы без номера идут последними.
  const groups = [...new Set(visible.map((i) => i.egeTask ?? 0))]
    .sort((a, b) => (a || 99) - (b || 99))
    .map((n) => ({ n, items: visible.filter((i) => (i.egeTask ?? 0) === n).sort((a, b) => a.title.localeCompare(b.title, 'ru')) }))
  const addButton = (
    <Button variant="primary" icon={<Plus size={18} weight="bold" />} onClick={() => setEditing('new')}>
      Добавить методичку
    </Button>
  )

  let body: ReactNode
  if (all.length === 0) {
    body = (
      <Panel>
        <EmptyState
          title="Методичек пока нет"
          description={admin ? 'Добавьте первую методичку: PDF, DOCX, HTML или изображение.' : 'Здесь появятся методички от репетитора.'}
          action={admin ? addButton : undefined}
        />
      </Panel>
    )
  } else {
    body = (
      <div className="flex flex-col gap-6">
        <Search value={query} onChange={setQuery} label="Поиск по методичкам" />
        <Panel className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">По номеру задания</h2>
            {task !== null && (
              <Button size="sm" onClick={() => setTask(null)}>
                Показать все
              </Button>
            )}
          </div>
          <div role="group" aria-label="Номер задания" className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] border-t border-l border-line">
            {Array.from({ length: EGE_TASK_COUNT }, (_, i) => i + 1).map((n) => {
              const count = counts.get(n) ?? 0
              return (
                <button
                  key={n}
                  type="button"
                  disabled={count === 0}
                  aria-pressed={task === n}
                  aria-label={`Задание ${n}, методичек: ${count}`}
                  onClick={() => setTask(task === n ? null : n)}
                  className={cn(
                    'flex h-16 flex-col items-center justify-center gap-0.5 border-r border-b border-line transition-colors duration-150',
                    task === n ? 'bg-pen text-pen-ink' : count > 0 ? 'bg-pen-soft text-pen hover:brightness-95' : 'text-muted/60',
                  )}
                >
                  <span className="num text-lg font-medium">{n}</span>
                  <span className="num text-xs">{count || '·'}</span>
                </button>
              )
            })}
          </div>
        </Panel>

        {groups.length === 0 ? (
          <Panel>
            <p className="px-5 py-6 text-muted">Под эти условия методичек не нашлось.</p>
          </Panel>
        ) : (
          groups.map((group) => (
            <section key={group.n}>
              <h2 className="mb-3 text-lg">{group.n ? `Задание ${group.n}` : 'Без номера задания'}</h2>
              <div className="flex flex-col gap-4">
                {group.items.map((item) => (
                  <Panel key={item.id} className="overflow-hidden">
                    <div className="flex items-start justify-between gap-3 p-4 sm:px-5">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold break-words">{item.title}</h3>
                        <p className="text-sm text-muted">
                          {item.topic ? `${item.topic}. ` : ''}Опубликовано {formatDay(item.createdAt, TUTOR_TIMEZONE)}
                        </p>
                        {item.description && <p className="mt-2 whitespace-pre-line">{item.description}</p>}
                      </div>
                      {admin && <ItemActions name={item.title} onEdit={() => setEditing(item)} onDelete={() => setDeleting(item)} />}
                    </div>
                    <FileList files={pickFiles(shared.data, item.fileIds)} viewBase={viewBase} />
                  </Panel>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Методички" description="Файлы по заданиям ЕГЭ. Общие для всех учеников." action={admin && all.length > 0 && addButton} />
      {body}
      {editing && (
        <MethodicalDialog
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? null : editing}
          files={editing === 'new' ? [] : pickFiles(shared.data, editing.fileIds)}
          onClose={() => setEditing(null)}
        />
      )}
      <DeleteDialog
        item={deleting}
        onClose={() => setDeleting(null)}
        onDelete={async (id) => {
          await deleteMethodical(session, id)
          await queryClient.invalidateQueries({ queryKey: ['methodical'] })
          await queryClient.invalidateQueries({ queryKey: ['shared-files'] })
        }}
      />
    </>
  )
}
