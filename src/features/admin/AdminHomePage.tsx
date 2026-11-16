import { ArrowSquareOut, Plus } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { dayKey, formatDayKey, formatTimeRange, relativeDay, todayKey, TUTOR_TIMEZONE } from '../../core/time'
import { lessonTitle, nextSession } from '../../domain/lessons'
import { buttonClass } from '../../ui/Button'
import { MonthCalendar, type CalendarEvent } from '../../ui/MonthCalendar'
import { EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { useLessons, useOverview } from '../shared/data'

type Sort = 'next' | 'name'

export function AdminHomePage() {
  const overview = useOverview()
  const lessons = useLessons()
  const [sort, setSort] = useState<Sort>('next')
  const today = todayKey(TUTOR_TIMEZONE)

  const rows = useMemo(() => {
    if (!overview.data) return []
    const list = overview.data.students.map((student) => ({
      student,
      next: nextSession(overview.data.files[student.id].sessions),
    }))
    return list.sort((a, b) => {
      if (sort === 'name') return a.student.name.localeCompare(b.student.name, 'ru')
      // Ученики без назначенных занятий уходят в конец.
      return (a.next?.startsAt ?? '9999').localeCompare(b.next?.startsAt ?? '9999') || a.student.name.localeCompare(b.student.name, 'ru')
    })
  }, [overview.data, sort])

  const events = useMemo<CalendarEvent[]>(() => {
    if (!overview.data) return []
    return overview.data.students.flatMap((student) =>
      overview.data.files[student.id].sessions.map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        title: lessonTitle(lessons.data, s.lessonId),
        caption: student.name.split(/\s+/)[0],
        to: `/admin/lessons/${s.lessonId}`,
        cancelled: s.status === 'cancelled',
      })),
    )
  }, [overview.data, lessons.data])

  if (overview.isPending || lessons.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48" />
        <Skeleton className="h-96" />
      </div>
    )
  }
  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
  if (lessons.isError) return <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />

  const todayCount = events.filter((e) => !e.cancelled && dayKey(e.startsAt, TUTOR_TIMEZONE) === today).length

  return (
    <>
      <PageHeader
        title={`Сегодня, ${formatDayKey(today)}`}
        description={
          todayCount === 0 ? 'Занятий сегодня нет. Время везде московское.' : `Занятий сегодня: ${todayCount}. Время везде московское.`
        }
        action={
          <Link to="/admin/lessons" className={buttonClass('primary')}>
            <Plus size={18} weight="bold" aria-hidden />
            Назначить занятие
          </Link>
        }
      />

      <div className="flex flex-col gap-6">
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <h2 className="text-lg">Ученики</h2>
            {rows.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-muted">
                Сортировка
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="h-9 rounded-control border border-line bg-surface px-2 text-sm text-ink"
                >
                  <option value="next">По ближайшему занятию</option>
                  <option value="name">По имени</option>
                </select>
              </label>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="border-t border-line">
              <EmptyState
                title="Учеников пока нет"
                description="Создайте ученика, затем назначьте ему урок: он появится здесь и в календаре."
                action={
                  <Link to="/admin/students" className={buttonClass('primary')}>
                    Перейти к ученикам
                  </Link>
                }
              />
            </div>
          ) : (
            <ul>
              {rows.map(({ student, next }) => (
                <li
                  key={student.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 sm:px-5 md:grid-cols-[minmax(0,1.1fr)_10rem_minmax(0,1.3fr)_auto]"
                >
                  <Link to={`/admin/students/${student.id}`} className="min-w-0 truncate font-medium hover:underline">
                    {student.name}
                  </Link>
                  {next ? (
                    <>
                      <div className="col-start-1 md:col-start-auto">
                        <p
                          className={cn(
                            'text-sm font-medium first-letter:uppercase',
                            dayKey(next.startsAt, TUTOR_TIMEZONE) === today && 'text-pen',
                          )}
                        >
                          {relativeDay(next.startsAt, TUTOR_TIMEZONE)}
                        </p>
                        <p className="num text-sm text-muted">{formatTimeRange(next.startsAt, next.endsAt, TUTOR_TIMEZONE)}</p>
                      </div>
                      <Link
                        to={`/admin/lessons/${next.lessonId}`}
                        className="col-start-1 min-w-0 truncate text-sm hover:underline md:col-start-auto"
                      >
                        {lessonTitle(lessons.data, next.lessonId)}
                      </Link>
                    </>
                  ) : (
                    <p className="col-start-1 text-sm text-muted md:col-span-2 md:col-start-auto">Занятий не назначено</p>
                  )}
                  <div className="col-start-2 row-span-3 row-start-1 md:col-start-auto md:row-span-1 md:row-start-auto">
                    {student.telemostUrl ? (
                      <a href={student.telemostUrl} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
                        Телемост <ArrowSquareOut size={16} aria-hidden />
                      </a>
                    ) : (
                      <span className="text-sm text-muted">Нет ссылки</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <MonthCalendar events={events} timeZone={TUTOR_TIMEZONE} />
      </div>
    </>
  )
}
