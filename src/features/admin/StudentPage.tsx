import { ArrowSquareOut, CaretLeft, Plus } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TUTOR_TIMEZONE, zoneLabel } from '../../core/time'
import { sortHomework, viewHomework } from '../../domain/homework'
import { lessonTitle, sortByStart } from '../../domain/lessons'
import { Button, buttonClass } from '../../ui/Button'
import { MonthCalendar, type CalendarEvent } from '../../ui/MonthCalendar'
import { ErrorState, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { useLessons, useOverview } from '../shared/data'
import { HomeworkStatsPanel } from '../shared/homeworkUi'
import { AdminHomeworkRow, HomeworkCreateDialog } from './HomeworkPage'
import { SessionList, type SessionEntry } from './SessionList'

/** Кабинет ученика глазами репетитора: всё личное можно править. */
export function StudentPage() {
  const { studentId = '' } = useParams()
  const navigate = useNavigate()
  const overview = useOverview()
  const lessons = useLessons()
  const [assigning, setAssigning] = useState(false)

  const student = overview.data?.students.find((s) => s.id === studentId)
  const file = overview.data?.files[studentId]

  const { upcoming, past, events } = useMemo(() => {
    const nowIso = new Date().toISOString()
    const sessions = sortByStart(file?.sessions ?? [])
    const toEntry = (s: (typeof sessions)[number]): SessionEntry => ({
      session: s,
      studentId,
      title: lessonTitle(lessons.data, s.lessonId),
      to: `/admin/lessons/${s.lessonId}`,
      studentTimezone: student?.timezone ?? TUTOR_TIMEZONE,
    })
    const calendar: CalendarEvent[] = sessions.map((s) => ({
      id: s.id,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      title: lessonTitle(lessons.data, s.lessonId),
      to: `/admin/lessons/${s.lessonId}`,
      cancelled: s.status === 'cancelled',
    }))
    return {
      upcoming: sessions.filter((s) => s.endsAt >= nowIso).map(toEntry),
      past: sessions.filter((s) => s.endsAt < nowIso).reverse().map(toEntry),
      events: calendar,
    }
  }, [file, lessons.data, student, studentId])

  if (overview.isPending || lessons.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    )
  }
  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
  if (lessons.isError) return <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />
  if (!student) {
    return <ErrorState error={new Error('Ученик не найден. Возможно, он был удалён.')} onRetry={() => navigate('/admin/students')} />
  }

  const homework = sortHomework(
    viewHomework(overview.data.files[studentId].homework, overview.data.subs[studentId].submissions),
    'default',
    () => '',
  )

  return (
    <>
      <Link to="/admin/students" className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm text-pen">
        <CaretLeft size={16} aria-hidden /> Все ученики
      </Link>
      <PageHeader
        title={student.name}
        description={
          <>
            Логин <span className="num text-ink">{student.login}</span>. Часовой пояс: {zoneLabel(student.timezone)}. Время
            ниже московское.
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            {student.telemostUrl && (
              <a href={student.telemostUrl} target="_blank" rel="noreferrer" className={buttonClass('secondary')}>
                Телемост <ArrowSquareOut size={18} aria-hidden />
              </a>
            )}
            <Link to="/admin/lessons" className={buttonClass('primary')}>
              <Plus size={18} weight="bold" aria-hidden />
              Назначить занятие
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        <Panel className="overflow-hidden">
          <h2 className="px-4 pt-4 pb-3 text-lg sm:px-5">Предстоящие занятия</h2>
          <div className="border-t border-line">
            <SessionList entries={upcoming} empty="Занятий не назначено. Откройте урок в библиотеке и назначьте его этому ученику." />
          </div>
        </Panel>

        <MonthCalendar events={events} timeZone={TUTOR_TIMEZONE} />

        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <h2 className="text-lg">Домашние задания</h2>
            <Button size="sm" icon={<Plus size={16} weight="bold" />} onClick={() => setAssigning(true)}>
              Выдать задание
            </Button>
          </div>
          <div className="border-t border-line">
            {homework.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted sm:px-5">Заданий этому ученику ещё не выдавали.</p>
            ) : (
              <ul>
                {homework.map((view) => (
                  <AdminHomeworkRow key={view.hw.id} view={view} studentId={studentId} waiting={view.status === 'done'} />
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {homework.length > 0 && <HomeworkStatsPanel views={homework} timeZone={TUTOR_TIMEZONE} />}

        {past.length > 0 && (
          <Panel className="overflow-hidden">
            <h2 className="px-4 pt-4 pb-3 text-lg sm:px-5">Прошедшие занятия</h2>
            <div className="border-t border-line">
              <SessionList entries={past} empty="" />
            </div>
          </Panel>
        )}
      </div>

      {assigning && (
        <HomeworkCreateDialog
          students={overview.data.students}
          lessons={lessons.data}
          presetStudentId={studentId}
          onClose={() => setAssigning(false)}
        />
      )}
    </>
  )
}
