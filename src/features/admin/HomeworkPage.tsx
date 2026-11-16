import { Plus } from '@phosphor-icons/react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useSession } from '../../core/auth/session'
import { formatDay, formatTime, shiftDayKey, todayKey, TUTOR_TIMEZONE } from '../../core/time'
import {
  createHomework,
  sortHomework,
  STATUS_LABEL,
  topicLabel,
  viewHomework,
  type HomeworkStatus,
  type HomeworkView,
} from '../../domain/homework'
import { ValidationError } from '../../domain/students'
import type { Lesson, StudentRecord } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Dialog, DialogActions } from '../../ui/Dialog'
import { inputClass } from '../../ui/Field'
import { EmptyState, ErrorState, errorMessage, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { useLessons, useOverview, useRefresh } from '../shared/data'
import { scoreText, StatusBadge } from '../shared/homeworkUi'
import { blankHomeworkForm, deadlineToUtc, formToInput, HomeworkFields, type HomeworkFormState } from './HomeworkForm'

interface Target {
  on: boolean
  date: string
  time: string
}

export function HomeworkCreateDialog({
  students,
  lessons,
  presetStudentId,
  onClose,
}: {
  students: StudentRecord[]
  lessons: Lesson[]
  presetStudentId?: string
  onClose(): void
}) {
  const session = useSession()
  const refresh = useRefresh()
  const [form, setForm] = useState<HomeworkFormState>(blankHomeworkForm)
  const blank = (id: string): Target => ({
    on: id === presetStudentId,
    date: shiftDayKey(todayKey(TUTOR_TIMEZONE), 7),
    time: '19:00',
  })
  const [targets, setTargets] = useState<Record<string, Target>>({})
  const targetOf = (id: string) => targets[id] ?? blank(id)
  const patch = (id: string, change: Partial<Target>) =>
    setTargets((t) => ({ ...t, [id]: { ...(t[id] ?? blank(id)), ...change } }))
  const [busy, setBusy] = useState(false)
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null)
  const err = (field: string) => (fieldError?.field === field ? fieldError.message : null)

  const chosen = students.filter((s) => targetOf(s.id).on)
  const allOn = students.length > 0 && chosen.length === students.length

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setFieldError(null)
    setBusy(true)
    try {
      await createHomework(
        session,
        formToInput(form),
        chosen.map((s) => ({ studentId: s.id, deadline: deadlineToUtc(targetOf(s.id).date, targetOf(s.id).time) })),
      )
      await refresh()
      toast.success(chosen.length === 1 ? 'Задание выдано' : `Задание выдано: учеников ${chosen.length}`)
      onClose()
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
      title="Новое домашнее задание"
      description="Содержание общее для выбранных учеников. Дедлайн, статус, баллы и комментарии у каждого свои."
      persistent={busy}
      wide
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <HomeworkFields form={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} lessons={lessons} error={err} />

        <fieldset className="rounded-control border border-line">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <legend className="float-left text-sm font-medium">Кому и до какого срока (время московское)</legend>
            {students.length > 1 && (
              <Button size="sm" onClick={() => students.forEach((s) => patch(s.id, { on: !allOn }))}>
                {allOn ? 'Снять выбор' : 'Выбрать всех'}
              </Button>
            )}
          </div>
          {students.map((s) => {
            const t = targetOf(s.id)
            return (
              <div
                key={s.id}
                className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-3 py-2', t.on && 'bg-pen-soft/40')}
              >
                <label className="flex min-h-11 flex-1 basis-40 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={t.on}
                    onChange={(e) => patch(s.id, { on: e.target.checked })}
                    className="size-5 shrink-0 accent-(--pen)"
                  />
                  <span className="font-medium">{s.name}</span>
                </label>
                {t.on && (
                  <div className="flex gap-2">
                    <input
                      type="date"
                      aria-label={`${s.name}: дата дедлайна`}
                      value={t.date}
                      onChange={(e) => patch(s.id, { date: e.target.value })}
                      className={cn(inputClass, 'num w-40 text-sm')}
                    />
                    <input
                      type="time"
                      aria-label={`${s.name}: время дедлайна`}
                      value={t.time}
                      onChange={(e) => patch(s.id, { time: e.target.value })}
                      className={cn(inputClass, 'num w-28 text-sm')}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </fieldset>
        {(err('students') || err('deadline')) && (
          <p role="alert" className="text-sm text-red">
            {err('students') ?? err('deadline')}
          </p>
        )}

        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={chosen.length === 0}>
            Выдать задание
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

/** Строка задания в списках репетитора. */
export function AdminHomeworkRow({
  view,
  studentId,
  studentName,
  waiting,
}: {
  view: HomeworkView
  studentId: string
  studentName?: string
  waiting: boolean
}) {
  const { hw, status } = view
  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        to={`/admin/homework/${studentId}/${hw.id}`}
        className={cn('flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 hover:bg-sunken sm:px-5', status === 'debt' && 'bg-red-soft/60')}
      >
        <div className="min-w-0 flex-1 basis-64">
          <p className="truncate font-medium">{hw.title}</p>
          <p className="truncate text-sm text-muted">
            {studentName ? `${studentName}. ` : ''}
            {topicLabel(hw)}
          </p>
        </div>
        <div className="w-36 text-sm">
          <p className="text-muted">Дедлайн</p>
          <p className={cn('num', status === 'debt' && 'font-medium text-red')}>
            {formatDay(hw.deadline, TUTOR_TIMEZONE)}, {formatTime(hw.deadline, TUTOR_TIMEZONE)}
          </p>
        </div>
        <p className="num w-24 text-sm">{scoreText(hw.score, hw.maxScore)}</p>
        <div className="flex w-36 justify-end">
          {waiting ? <span className="text-sm font-medium text-pen">Ждёт проверки</span> : <StatusBadge status={status} />}
        </div>
      </Link>
    </li>
  )
}

type StatusFilter = 'all' | 'waiting' | HomeworkStatus

export function AdminHomeworkPage() {
  const overview = useOverview()
  const lessons = useLessons()
  const [creating, setCreating] = useState(false)
  const [student, setStudent] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  const rows = useMemo(() => {
    if (!overview.data) return []
    return overview.data.students.flatMap((s) =>
      viewHomework(overview.data.files[s.id].homework, overview.data.subs[s.id].submissions).map((view) => ({
        view,
        student: s,
      })),
    )
  }, [overview.data])

  if (overview.isPending || lessons.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
  if (lessons.isError) return <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />

  const students = overview.data.students
  const waitingCount = rows.filter((r) => r.view.status === 'done').length
  const filtered = rows.filter(
    (r) =>
      (!student || r.student.id === student) &&
      (status === 'all' || (status === 'waiting' ? r.view.status === 'done' : r.view.status === status)),
  )
  const order = new Map(sortHomework(filtered.map((r) => r.view), 'default', () => '').map((v, i) => [v, i]))
  const sorted = [...filtered].sort((a, b) => order.get(a.view)! - order.get(b.view)!)
  const selectClass = 'h-11 rounded-control border border-line bg-surface px-3 text-base'

  return (
    <>
      <PageHeader
        title="Домашние задания"
        description={
          waitingCount > 0
            ? `Работ, которые ждут проверки: ${waitingCount}. Время московское.`
            : 'Все сданные работы проверены. Время московское.'
        }
        action={
          students.length > 0 && (
            <Button variant="primary" icon={<Plus size={18} weight="bold" />} onClick={() => setCreating(true)}>
              Выдать задание
            </Button>
          )
        }
      />

      {students.length === 0 ? (
        <Panel>
          <EmptyState
            title="Некому выдавать задания"
            description="Сначала создайте ученика."
            action={
              <Link to="/admin/students" className="text-pen underline">
                Перейти к ученикам
              </Link>
            }
          />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="Заданий пока нет"
            description="Выдайте первое задание: одному ученику или сразу нескольким, каждому со своим дедлайном."
            action={
              <Button variant="primary" icon={<Plus size={18} weight="bold" />} onClick={() => setCreating(true)}>
                Выдать задание
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <select aria-label="Ученик" value={student} onChange={(e) => setStudent(e.target.value)} className={selectClass}>
              <option value="">Все ученики</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select aria-label="Статус" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={selectClass}>
              <option value="all">Все статусы</option>
              <option value="waiting">Ждут проверки</option>
              {(['debt', 'todo', 'checked'] as const).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <Panel className="overflow-hidden">
            {sorted.length === 0 ? (
              <p className="px-5 py-6 text-muted">Под эти условия заданий нет.</p>
            ) : (
              <ul>
                {sorted.map(({ view, student: s }) => (
                  <AdminHomeworkRow
                    key={s.id + view.hw.id}
                    view={view}
                    studentId={s.id}
                    studentName={s.name}
                    waiting={view.status === 'done'}
                  />
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}

      {creating && <HomeworkCreateDialog students={students} lessons={lessons.data} onClose={() => setCreating(false)} />}
    </>
  )
}
