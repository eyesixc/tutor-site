import { CaretLeft, PencilSimple, Trash } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useSession } from '../../core/auth/session'
import { todayKey, TUTOR_TIMEZONE, zonedToUtc } from '../../core/time'
import { assignLesson, deleteLesson, findLesson, sortByStart, type Assignment } from '../../domain/lessons'
import { ValidationError } from '../../domain/students'
import type { StudentRecord } from '../../domain/types'
import { Button } from '../../ui/Button'
import { ConfirmDialog } from '../../ui/Dialog'
import { ErrorState, errorMessage, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { LessonContent, LessonMeta } from '../shared/LessonContent'
import { useLessons, useOverview, useRefresh } from '../shared/data'
import { LessonFormDialog } from './LessonsPage'
import { SessionList, StudentTimeHint, TimingFields, type SessionEntry } from './SessionList'

interface Draft {
  on: boolean
  date: string
  start: string
  end: string
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function AssignPanel({ lessonId, students }: { lessonId: string; students: StudentRecord[] }) {
  const session = useSession()
  const refresh = useRefresh()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const blank = (): Draft => ({ on: false, date: todayKey(TUTOR_TIMEZONE), start: '19:00', end: '20:30' })
  const draftOf = (id: string) => drafts[id] ?? blank()
  const patch = (id: string, change: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? blank()), ...change } }))

  const chosen = students.filter((s) => draftOf(s.id).on)
  const allOn = students.length > 0 && chosen.length === students.length

  const submit = async () => {
    if (busy) return
    setError(null)
    const assignments: Assignment[] = []
    for (const s of chosen) {
      const d = draftOf(s.id)
      if (!d.date || !d.start || !d.end) {
        setError(`${s.name}: укажите дату, начало и окончание`)
        return
      }
      assignments.push({
        studentId: s.id,
        startsAt: zonedToUtc(d.date, d.start, TUTOR_TIMEZONE),
        endsAt: zonedToUtc(d.date, d.end, TUTOR_TIMEZONE),
      })
    }
    setBusy(true)
    try {
      await assignLesson(session, lessonId, assignments)
      await refresh()
      toast.success(
        `Урок назначен: ${assignments.length} ${plural(assignments.length, 'ученик', 'ученика', 'учеников')}`,
      )
      setDrafts({})
    } catch (cause) {
      if (cause instanceof ValidationError) setError(cause.message)
      else toast.error(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-lg">Назначить ученикам</h2>
          <p className="mt-1 text-sm text-muted">У каждого своя дата и время. Время московское.</p>
        </div>
        {students.length > 1 && (
          <Button size="sm" onClick={() => students.forEach((s) => patch(s.id, { on: !allOn }))}>
            {allOn ? 'Снять выбор' : 'Выбрать всех'}
          </Button>
        )}
      </div>

      {students.length === 0 ? (
        <p className="border-t border-line px-5 py-4 text-muted">
          Учеников пока нет.{' '}
          <Link to="/admin/students" className="text-pen underline">
            Создать ученика
          </Link>
        </p>
      ) : (
        <ul>
          {students.map((s) => {
            const d = draftOf(s.id)
            return (
              <li key={s.id} className={cn('flex flex-col gap-2 border-t border-line px-5 py-2.5', d.on && 'bg-pen-soft/40')}>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <label className="flex min-h-11 flex-1 basis-44 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={d.on}
                      onChange={(e) => patch(s.id, { on: e.target.checked })}
                      className="size-5 shrink-0 accent-(--pen)"
                    />
                    <span className="font-medium">{s.name}</span>
                  </label>
                  {d.on && <TimingFields {...d} onChange={(change) => patch(s.id, change)} labelPrefix={s.name} />}
                </div>
                {d.on && <StudentTimeHint date={d.date} start={d.start} timezone={s.timezone} />}
              </li>
            )
          })}
        </ul>
      )}

      {students.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bg px-5 py-4">
          <p role={error ? 'alert' : undefined} className={cn('text-sm', error ? 'text-red' : 'text-muted')}>
            {error ?? (chosen.length === 0 ? 'Отметьте учеников, которым нужно назначить урок.' : `Выбрано: ${chosen.length}`)}
          </p>
          <Button variant="primary" disabled={chosen.length === 0} loading={busy} onClick={() => void submit()}>
            Назначить
          </Button>
        </div>
      )}
    </Panel>
  )
}

export function LessonPage() {
  const { lessonId = '' } = useParams()
  const session = useSession()
  const refresh = useRefresh()
  const navigate = useNavigate()
  const lessons = useLessons()
  const overview = useOverview()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const lesson = findLesson(lessons.data, lessonId)

  const entries = useMemo<SessionEntry[]>(() => {
    if (!overview.data) return []
    const out: SessionEntry[] = []
    for (const student of overview.data.students) {
      for (const item of overview.data.files[student.id].sessions) {
        if (item.lessonId !== lessonId) continue
        out.push({
          session: item,
          studentId: student.id,
          title: student.name,
          to: `/admin/students/${student.id}`,
          studentTimezone: student.timezone,
        })
      }
    }
    return sortByStart(out.map((e) => ({ ...e, startsAt: e.session.startsAt }))).reverse()
  }, [overview.data, lessonId])

  if (lessons.isPending || overview.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
      </div>
    )
  }
  if (lessons.isError) return <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />
  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
  if (!lesson) {
    return (
      <ErrorState error={new Error('Урок не найден. Возможно, он был удалён.')} onRetry={() => navigate('/admin/lessons')} />
    )
  }

  const confirmDelete = async () => {
    try {
      await deleteLesson(session, lesson.id)
      await refresh()
      toast.success('Урок удалён')
      navigate('/admin/lessons', { replace: true })
    } catch (cause) {
      toast.error(errorMessage(cause))
      throw cause
    }
  }

  return (
    <>
      <Link to="/admin/lessons" className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm text-pen">
        <CaretLeft size={16} aria-hidden /> Библиотека уроков
      </Link>
      <PageHeader
        title={lesson.title}
        description={<LessonMeta lesson={lesson} />}
        action={
          <div className="flex gap-2">
            <Button icon={<PencilSimple size={18} />} onClick={() => setEditing(true)}>
              Изменить
            </Button>
            <Button icon={<Trash size={18} />} onClick={() => setDeleting(true)}>
              Удалить
            </Button>
          </div>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <LessonContent lesson={lesson} viewBase="/admin/files/shared" manage />
        <div className="flex flex-col gap-6">
          <AssignPanel lessonId={lesson.id} students={overview.data.students} />
          <Panel className="overflow-hidden">
            <h2 className="px-5 pt-5 pb-3 text-lg">Назначенные занятия</h2>
            <div className="border-t border-line">
              <SessionList entries={entries} empty="Этот урок пока никому не назначен." />
            </div>
          </Panel>
        </div>
      </div>

      {editing && <LessonFormDialog lesson={lesson} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Удалить урок?"
        description={
          entries.length > 0
            ? `Урок назначен (занятий: ${entries.length}). Сначала удалите эти занятия: урок, на который есть ссылки, удалить нельзя.`
            : `«${lesson.title}» будет удалён из библиотеки. Отменить удаление нельзя.`
        }
        confirmLabel="Удалить урок"
        danger
        onConfirm={confirmDelete}
      />
    </>
  )
}
