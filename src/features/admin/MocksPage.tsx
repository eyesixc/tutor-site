import { CaretLeft, Plus, Trash } from '@phosphor-icons/react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useSession } from '../../core/auth/session'
import { formatDayKey, todayKey, TUTOR_TIMEZONE } from '../../core/time'
import { createMock, deleteMock, mockTotals, saveMock } from '../../domain/mocks'
import { ValidationError } from '../../domain/students'
import type { MockExam, MockExamTask, StudentRecord } from '../../domain/types'
import { Button, buttonClass } from '../../ui/Button'
import { ConfirmDialog, Dialog, DialogActions } from '../../ui/Dialog'
import { inputBase, SelectField, TextAreaField, TextField } from '../../ui/Field'
import { EmptyState, ErrorState, errorMessage, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { useOverview, useRefresh } from '../shared/data'
import { MockScore, SecondaryScore, TaskStrip } from '../shared/mocksUi'
import { useCatalogs } from './CatalogPage'

export function MockCreateDialog({
  students,
  presetStudentId,
  onClose,
}: {
  students: StudentRecord[]
  presetStudentId?: string
  onClose(): void
}) {
  const session = useSession()
  const refresh = useRefresh()
  const navigate = useNavigate()
  const [studentId, setStudentId] = useState(presetStudentId ?? students[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayKey(TUTOR_TIMEZONE))
  const catalogs = useCatalogs()
  const [catalogChoice, setCatalog] = useState('')
  const catalog = catalogChoice || catalogs.data?.[0]?.id || ''
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null)
  const err = (field: string) => (fieldError?.field === field ? fieldError.message : null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setFieldError(null)
    setBusy(true)
    try {
      const mock = await createMock(session, studentId, { title, date, comment }, catalog)
      await refresh()
      toast.success('Пробник создан')
      onClose()
      navigate(`/admin/mocks/${studentId}/${mock.id}`)
    } catch (cause) {
      if (cause instanceof ValidationError) setFieldError({ field: cause.field, message: cause.message })
      else toast.error(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !busy && onClose()}
      title="Новый пробник"
      description="Список заданий загрузится из справочника выбранного года. Баллы выставляются на следующем шаге."
      persistent={busy}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <SelectField label="Ученик" value={studentId} onChange={setStudentId}>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Название" value={title} onChange={setTitle} error={err('title')} placeholder="Пробник № 1" autoFocus />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Дата" type="date" value={date} onChange={setDate} error={err('date')} mono />
          <SelectField label="Год экзамена" value={catalog} onChange={setCatalog} error={err('catalog')}>
            {(catalogs.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </SelectField>
        </div>
        <TextAreaField label="Комментарий" value={comment} onChange={setComment} rows={3} />
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Создать пробник
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export function AdminMockRow({ mock, studentId, studentName }: { mock: MockExam; studentId: string; studentName?: string }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <Link to={`/admin/mocks/${studentId}/${mock.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 hover:bg-sunken sm:px-5">
        <div className="min-w-0 flex-1 basis-56">
          <p className="truncate font-medium">{mock.title}</p>
          {studentName && <p className="truncate text-sm text-muted">{studentName}</p>}
        </div>
        <p className="num w-32 text-sm">{formatDayKey(mock.date)}</p>
        <div className="w-28">
          <MockScore mock={mock} />
        </div>
        <div className="w-20 text-right">
          <SecondaryScore mock={mock} />
        </div>
      </Link>
    </li>
  )
}

export function AdminMocksPage() {
  const overview = useOverview()
  const [creating, setCreating] = useState(false)
  const [student, setStudent] = useState('')

  const rows = useMemo(() => {
    if (!overview.data) return []
    return overview.data.students
      .flatMap((s) => overview.data.files[s.id].mockExams.map((mock) => ({ mock, student: s })))
      .sort((a, b) => b.mock.date.localeCompare(a.mock.date))
  }, [overview.data])

  if (overview.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-56" />
      </div>
    )
  }
  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />

  const students = overview.data.students
  const visible = rows.filter((r) => !student || r.student.id === student)
  const createButton = (
    <Button variant="primary" icon={<Plus size={18} weight="bold" />} onClick={() => setCreating(true)}>
      Создать пробник
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Пробники"
        description="Пробник создаётся для одного ученика. Баллы по заданиям выставляются вручную."
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/catalog" className={buttonClass('secondary')}>
              Справочник заданий
            </Link>
            {students.length > 0 && rows.length > 0 && createButton}
          </div>
        }
      />
      {students.length === 0 ? (
        <Panel>
          <EmptyState title="Сначала создайте ученика" description="Пробник привязывается к конкретному ученику." />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="Пробников пока нет"
            description="Создайте пробник: в него загрузятся 27 заданий ЕГЭ с темами и максимальными баллами."
            action={createButton}
          />
        </Panel>
      ) : (
        <>
          <select
            aria-label="Ученик"
            value={student}
            onChange={(e) => setStudent(e.target.value)}
            className="mb-4 h-11 rounded-control border border-line bg-surface px-3 text-base"
          >
            <option value="">Все ученики</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Panel className="overflow-hidden">
            {visible.length === 0 ? (
              <p className="px-5 py-6 text-muted">У этого ученика пробников ещё нет.</p>
            ) : (
              <ul>
                {visible.map(({ mock, student: s }) => (
                  <AdminMockRow key={mock.id} mock={mock} studentId={s.id} studentName={s.name} />
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
      {creating && <MockCreateDialog students={students} presetStudentId={student || undefined} onClose={() => setCreating(false)} />}
    </>
  )
}

/** Редактор пробника: баллы и комментарии по всем заданиям сохраняются одним действием. */
function MockEditor({ mock, studentId, studentName }: { mock: MockExam; studentId: string; studentName: string }) {
  const session = useSession()
  const refresh = useRefresh()
  const navigate = useNavigate()
  const [title, setTitle] = useState(mock.title)
  const [date, setDate] = useState(mock.date)
  const [comment, setComment] = useState(mock.comment)
  const [tasks, setTasks] = useState<MockExamTask[]>(mock.tasks)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setTask = (number: number, patch: Partial<MockExamTask>) =>
    setTasks((list) => list.map((t) => (t.number === number ? { ...t, ...patch } : t)))
  const totals = mockTotals({ ...mock, tasks })
  const dirty =
    title !== mock.title || date !== mock.date || comment !== mock.comment || JSON.stringify(tasks) !== JSON.stringify(mock.tasks)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      await saveMock(session, studentId, mock.id, { title, date, comment }, tasks)
      await refresh()
      toast.success('Пробник сохранён')
    } catch (cause) {
      if (cause instanceof ValidationError) setError(cause.message)
      else toast.error(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    try {
      await deleteMock(session, studentId, mock.id)
      await refresh()
      toast.success('Пробник удалён')
      navigate('/admin/mocks', { replace: true })
    } catch (cause) {
      toast.error(errorMessage(cause))
      throw cause
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <Link to="/admin/mocks" className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm text-pen">
        <CaretLeft size={16} aria-hidden /> Все пробники
      </Link>
      <PageHeader
        title={mock.title}
        description={
          <>
            <Link to={`/admin/students/${studentId}`} className="text-pen underline">
              {studentName}
            </Link>
            . {formatDayKey(mock.date, false, true)}
          </>
        }
        action={
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="num text-2xl leading-tight">
                {totals.score} <span className="text-muted">из {totals.max}</span>
              </p>
              <p className="text-sm text-muted">
                {totals.percent === null
                  ? 'баллы не выставлены'
                  : totals.secondary === null
                    ? `${totals.percent}% первичных баллов`
                    : `${totals.secondary} тестовых баллов`}
              </p>
            </div>
            <Button icon={<Trash size={18} />} onClick={() => setDeleting(true)}>
              Удалить
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        <Panel className="p-4 sm:p-5">
          <TaskStrip tasks={tasks} />
        </Panel>

        <Panel className="grid gap-4 p-4 sm:grid-cols-[1fr_12rem] sm:p-5">
          <TextField label="Название" value={title} onChange={setTitle} />
          <TextField label="Дата" type="date" value={date} onChange={setDate} mono />
          <div className="sm:col-span-2">
            <TextAreaField label="Комментарий к пробнику" value={comment} onChange={setComment} rows={3} />
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <h2 className="text-lg">Баллы по заданиям</h2>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setTasks((l) => l.map((t) => ({ ...t, score: t.maxScore })))}>
                Всем полный балл
              </Button>
              <Button size="sm" onClick={() => setTasks((l) => l.map((t) => ({ ...t, score: 0 })))}>
                Всем 0
              </Button>
              <Button size="sm" onClick={() => setTasks((l) => l.map((t) => ({ ...t, score: null })))}>
                Очистить
              </Button>
            </div>
          </div>
          <ul>
            {tasks.map((task) => (
              <li key={task.number} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t border-line px-4 py-2 sm:grid-cols-[2.5rem_minmax(0,14rem)_auto_minmax(0,1fr)] sm:px-5">
                <span className="num text-lg font-medium">{task.number}</span>
                <span className="min-w-0 truncate text-sm">{task.topic}</span>
                <div role="group" aria-label={`Задание ${task.number}: балл`} className="flex gap-1">
                  {Array.from({ length: task.maxScore + 1 }, (_, score) => (
                    <button
                      key={score}
                      type="button"
                      aria-pressed={task.score === score}
                      onClick={() => setTask(task.number, { score: task.score === score ? null : score })}
                      className={cn(
                        'num size-11 rounded-control border text-base font-medium transition-colors duration-150',
                        task.score !== score
                          ? 'border-line bg-surface hover:bg-sunken'
                          : score === task.maxScore
                            ? 'border-ok bg-ok-soft text-ok'
                            : score === 0
                              ? 'border-red bg-red text-surface'
                              : 'border-warn bg-warn-soft text-warn',
                      )}
                    >
                      {score}
                    </button>
                  ))}
                </div>
                <input
                  aria-label={`Задание ${task.number}: комментарий`}
                  placeholder="Комментарий"
                  value={task.comment}
                  onChange={(e) => setTask(task.number, { comment: e.target.value })}
                  className={cn(inputBase, 'col-span-3 w-full text-sm sm:col-span-1')}
                />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3 sm:-mx-8 sm:px-8">
        <p role={error ? 'alert' : undefined} className={cn('text-sm', error ? 'text-red' : 'text-muted')}>
          {error ?? (dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены')}
        </p>
        <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>
          Сохранить пробник
        </Button>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Удалить пробник?"
        description={`«${mock.title}» ученика ${studentName} будет удалён вместе со всеми баллами. Отменить удаление нельзя.`}
        confirmLabel="Удалить пробник"
        danger
        onConfirm={confirmDelete}
      />
    </form>
  )
}

export function AdminMockPage() {
  const { studentId = '', mockId = '' } = useParams()
  const navigate = useNavigate()
  const overview = useOverview()

  if (overview.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    )
  }
  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
  const student = overview.data.students.find((s) => s.id === studentId)
  const mock = overview.data.files[studentId]?.mockExams.find((m) => m.id === mockId)
  if (!student || !mock) {
    return <ErrorState error={new Error('Пробник не найден. Возможно, он был удалён.')} onRetry={() => navigate('/admin/mocks')} />
  }
  // key: после сохранения редактор берёт свежие данные как исходные.
  return <MockEditor key={JSON.stringify(mock)} mock={mock} studentId={studentId} studentName={student.name} />
}

