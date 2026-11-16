import { CaretLeft, Plus, Trash } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useSession } from '../../core/auth/session'
import { deleteCatalog, listCatalogs, saveCatalog, type CatalogVersion } from '../../domain/mocks'
import { ValidationError } from '../../domain/students'
import { Button } from '../../ui/Button'
import { ConfirmDialog } from '../../ui/Dialog'
import { inputBase, TextField } from '../../ui/Field'
import { ErrorState, errorMessage, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { cn } from '../../ui/cn'

export function useCatalogs() {
  const session = useSession()
  return useQuery({ queryKey: ['catalogs'], queryFn: () => listCatalogs(session) })
}

function Editor({ version, canDelete, onDeleted }: { version: CatalogVersion; canDelete: boolean; onDeleted(): void }) {
  const session = useSession()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(version.title)
  const [tasks, setTasks] = useState(version.tasks)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const dirty = title !== version.title || JSON.stringify(tasks) !== JSON.stringify(version.tasks)
  const total = tasks.reduce((sum, t) => sum + t.maxScore, 0)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      await saveCatalog(session, { ...version, title, tasks })
      await queryClient.invalidateQueries({ queryKey: ['catalogs'] })
      toast.success('Справочник сохранён')
    } catch (cause) {
      if (cause instanceof ValidationError) setError(cause.message)
      else toast.error(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-6">
      <Panel className="flex flex-wrap items-end justify-between gap-4 p-4 sm:p-5">
        <div className="max-w-xs flex-1">
          <TextField label="Название версии" value={title} onChange={setTitle} />
        </div>
        <p className="text-sm text-muted">
          Заданий: <span className="num text-ink">{tasks.length}</span>, максимум первичных баллов:{' '}
          <span className="num text-ink">{total}</span>
        </p>
      </Panel>

      <Panel className="overflow-hidden">
        <ul>
          {tasks.map((task, i) => (
            <li key={task.number} className={cn('flex flex-wrap items-center gap-3 px-4 py-2 sm:px-5', i > 0 && 'border-t border-line')}>
              <span className="num w-8 text-lg font-medium">{task.number}</span>
              <input
                aria-label={`Задание ${task.number}: тема`}
                value={task.topic}
                onChange={(e) => setTasks((l) => l.map((t) => (t.number === task.number ? { ...t, topic: e.target.value } : t)))}
                className={cn(inputBase, 'min-w-0 flex-1 basis-56')}
              />
              <label className="flex items-center gap-2 text-sm text-muted">
                Макс. балл
                <select
                  value={task.maxScore}
                  onChange={(e) =>
                    setTasks((l) => l.map((t) => (t.number === task.number ? { ...t, maxScore: Number(e.target.value) } : t)))
                  }
                  className={cn(inputBase, 'num w-20 text-ink')}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 border-t border-line p-4 sm:px-5">
          <Button
            size="sm"
            icon={<Plus size={16} weight="bold" />}
            onClick={() => setTasks((l) => [...l, { number: l.length + 1, topic: '', maxScore: 1 }])}
          >
            Добавить задание
          </Button>
          <Button size="sm" disabled={tasks.length <= 1} onClick={() => setTasks((l) => l.slice(0, -1))}>
            Убрать последнее
          </Button>
        </div>
      </Panel>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3 sm:-mx-8 sm:px-8">
        <p role={error ? 'alert' : undefined} className={cn('text-sm', error ? 'text-red' : 'text-muted')}>
          {error ?? (dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены')}
        </p>
        <div className="flex gap-2">
          {canDelete && (
            <Button icon={<Trash size={18} />} onClick={() => setDeleting(true)}>
              Удалить версию
            </Button>
          )}
          <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>
            Сохранить справочник
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Удалить версию справочника?"
        description={`«${version.title}» больше нельзя будет выбрать для новых пробников. Уже созданные пробники не изменятся: у них своя копия заданий.`}
        confirmLabel="Удалить версию"
        danger
        onConfirm={async () => {
          try {
            await deleteCatalog(session, version.id)
            await queryClient.invalidateQueries({ queryKey: ['catalogs'] })
            toast.success('Версия удалена')
            onDeleted()
          } catch (cause) {
            toast.error(errorMessage(cause))
            throw cause
          }
        }}
      />
    </form>
  )
}

export function CatalogPage() {
  const session = useSession()
  const queryClient = useQueryClient()
  const catalogs = useCatalogs()
  const [selected, setSelected] = useState('')
  const [copyTitle, setCopyTitle] = useState('')
  const [copying, setCopying] = useState(false)

  if (catalogs.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96" />
      </div>
    )
  }
  if (catalogs.isError) return <ErrorState error={catalogs.error} onRetry={() => void catalogs.refetch()} />

  const versions = catalogs.data
  const current = versions.find((v) => v.id === selected) ?? versions[0]

  const copy = async (e: FormEvent) => {
    e.preventDefault()
    if (copying) return
    setCopying(true)
    try {
      const id = `v-${Date.now().toString(36)}`
      await saveCatalog(session, { id, title: copyTitle, tasks: current.tasks })
      await queryClient.invalidateQueries({ queryKey: ['catalogs'] })
      setSelected(id)
      setCopyTitle('')
      toast.success('Новая версия создана')
    } catch (cause) {
      toast.error(errorMessage(cause))
    } finally {
      setCopying(false)
    }
  }

  return (
    <>
      <Link to="/admin/mocks" className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm text-pen">
        <CaretLeft size={16} aria-hidden /> Пробники
      </Link>
      <PageHeader
        title="Справочник заданий"
        description="Темы и максимальные баллы, которые подставляются в новый пробник. Правки не меняют уже созданные пробники."
      />

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Версия
          <select
            value={current.id}
            onChange={(e) => setSelected(e.target.value)}
            className={cn(inputBase, 'min-w-48 font-normal')}
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        </label>
        <form onSubmit={copy} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Новая версия на основе этой
            <input
              value={copyTitle}
              onChange={(e) => setCopyTitle(e.target.value)}
              placeholder="ЕГЭ 2028"
              className={cn(inputBase, 'w-48 font-normal')}
            />
          </label>
          <Button type="submit" loading={copying} disabled={copyTitle.trim().length < 2}>
            Создать версию
          </Button>
        </form>
      </div>

      <Editor key={current.id + JSON.stringify(current)} version={current} canDelete={versions.length > 1} onDeleted={() => setSelected('')} />
    </>
  )
}
