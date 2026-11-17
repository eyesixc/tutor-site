import { ArrowSquareOut, Plus } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  dayKey,
  daysSince,
  daysWord,
  formatDay,
  formatDayKey,
  formatTime,
  formatTimeRange,
  relativeDay,
  todayKey,
  TUTOR_TIMEZONE,
} from '../../core/time'
import { homeworkStats, viewHomework } from '../../domain/homework'
import { KIND_LABEL, lessonKind, lessonTitle, nextSession } from '../../domain/lessons'
import { mockTotals, SECONDARY_MIN, sortMocks } from '../../domain/mocks'
import { buttonClass } from '../../ui/Button'
import { MonthCalendar, type CalendarEvent } from '../../ui/MonthCalendar'
import { EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { useLessons, useOverview } from '../shared/data'

type Sort = 'next' | 'name'

const TZ = TUTOR_TIMEZONE
const firstName = (name: string) => name.split(/\s+/)[0]
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export function AdminHomePage() {
  const overview = useOverview()
  const lessons = useLessons()
  const [sort, setSort] = useState<Sort>('next')
  const today = todayKey(TZ)

  const data = useMemo(() => {
    if (!overview.data) return null
    const { students, files, subs } = overview.data
    const rows = students.map((student) => {
      const file = files[student.id]
      const views = viewHomework(file.homework, subs[student.id].submissions)
      const lastMock = sortMocks(file.mockExams).find((m) => mockTotals(m).percent !== null)
      return {
        student,
        views,
        next: nextSession(file.sessions),
        debts: views.filter((v) => v.status === 'debt').length,
        hwPercent: homeworkStats(views).averagePercent,
        lastMock: lastMock ? mockTotals(lastMock) : null,
      }
    })
    rows.sort((a, b) => {
      if (sort === 'name') return a.student.name.localeCompare(b.student.name, 'ru')
      // Ученики без назначенных занятий уходят в конец.
      return (a.next?.startsAt ?? '9999').localeCompare(b.next?.startsAt ?? '9999') || a.student.name.localeCompare(b.student.name, 'ru')
    })

    const todaySessions = students
      .flatMap((student) => files[student.id].sessions.map((s) => ({ student, s })))
      .filter(({ s }) => dayKey(s.startsAt, TZ) === today)
      .sort((a, b) => a.s.startsAt.localeCompare(b.s.startsAt))

    // Сначала работы на проверку (старые сверху), потом долги (самые просроченные сверху).
    const toCheck = rows
      .flatMap((r) => r.views.filter((v) => v.status === 'done').map((v) => ({ student: r.student, v })))
      .sort((a, b) => (a.v.submission?.doneAt ?? a.v.hw.deadline).localeCompare(b.v.submission?.doneAt ?? b.v.hw.deadline))
    const debts = rows
      .flatMap((r) => r.views.filter((v) => v.status === 'debt').map((v) => ({ student: r.student, v })))
      .sort((a, b) => a.v.hw.deadline.localeCompare(b.v.hw.deadline))

    return { rows, todaySessions, toCheck, debts }
  }, [overview.data, sort, today])

  const events = useMemo<CalendarEvent[]>(() => {
    if (!overview.data) return []
    return overview.data.students.flatMap((student) =>
      overview.data.files[student.id].sessions.map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        title: lessonTitle(lessons.data, s.lessonId),
        kind: lessonKind(lessons.data, s.lessonId),
        caption: firstName(student.name),
        to: `/admin/lessons/${s.lessonId}`,
        cancelled: s.status === 'cancelled',
      })),
    )
  }, [overview.data, lessons.data])

  if (overview.isPending || lessons.isPending || !data) {
    if (overview.isError) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
    if (lessons.isError) return <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  const { rows, todaySessions, toCheck, debts } = data
  const nowIso = new Date().toISOString()
  const activeToday = todaySessions.filter(({ s }) => s.status !== 'cancelled')
  // Ближайшее ещё не закончившееся занятие сегодня: у него кнопка Телемоста.
  const current = activeToday.find(({ s }) => s.endsAt > nowIso)
  const summary = [
    activeToday.length === 0 ? 'Занятий сегодня нет' : `Занятий сегодня: ${activeToday.length}`,
    toCheck.length > 0 ? `на проверке: ${toCheck.length}` : null,
    debts.length > 0 ? `долгов: ${debts.length}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <>
      <PageHeader
        title={capitalize(formatDayKey(today, true))}
        description={`${summary}. Время везде московское.`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/homework" className={buttonClass('secondary')}>
              Выдать ДЗ
            </Link>
            <Link to="/admin/lessons" className={buttonClass('primary')}>
              <Plus size={18} weight="bold" aria-hidden />
              Назначить урок
            </Link>
          </div>
        }
      />

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="Учеников пока нет"
            description="Создайте ученика, затем назначьте ему урок: он появится здесь и в календаре."
            action={
              <Link to="/admin/students" className={buttonClass('primary')}>
                Перейти к ученикам
              </Link>
            }
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <Panel className="overflow-hidden">
              <h2 className="px-4 pt-4 pb-3 text-lg sm:px-5">Сегодня</h2>
              {todaySessions.length === 0 ? (
                <p className="border-t border-line px-4 py-4 text-muted sm:px-5">Занятий нет.</p>
              ) : (
                <ul>
                  {todaySessions.map(({ student, s }) => {
                    const cancelled = s.status === 'cancelled'
                    const past = s.endsAt <= nowIso
                    const isCurrent = current?.s.id === s.id
                    const kind = lessonKind(lessons.data, s.lessonId)
                    return (
                      <li
                        key={s.id}
                        className={cn(
                          'grid grid-cols-[3.5rem_0.25rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-line px-4 py-3 sm:px-5',
                          isCurrent && 'bg-pen-soft',
                          (past || cancelled) && 'text-muted',
                        )}
                      >
                        <span className={cn('num', isCurrent && 'font-medium text-pen')}>{formatTime(s.startsAt, TZ)}</span>
                        <span
                          aria-hidden
                          className={cn(
                            'h-9 rounded-full',
                            past || cancelled ? 'bg-line' : kind === 'practice' ? 'bg-prac' : 'bg-pen',
                          )}
                        />
                        <div className="min-w-0">
                          <Link to={`/admin/lessons/${s.lessonId}`} className={cn('block truncate font-medium hover:underline', cancelled && 'line-through')}>
                            {firstName(student.name)} · {lessonTitle(lessons.data, s.lessonId)}
                          </Link>
                          <p className="num truncate text-sm text-muted">
                            {formatTimeRange(s.startsAt, s.endsAt, TZ)}
                            {kind && <span className="font-sans"> · {KIND_LABEL[kind]}</span>}
                            {cancelled && <span className="font-sans"> · отменено</span>}
                          </p>
                        </div>
                        {isCurrent && student.telemostUrl ? (
                          <a href={student.telemostUrl} target="_blank" rel="noreferrer" className={buttonClass('primary', 'sm')}>
                            Телемост <ArrowSquareOut size={16} aria-hidden />
                          </a>
                        ) : (
                          <span />
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>

            <Panel className="overflow-hidden">
              <h2 className="px-4 pt-4 pb-3 text-lg sm:px-5">Требует внимания</h2>
              {toCheck.length === 0 && debts.length === 0 ? (
                <p className="border-t border-line px-4 py-4 text-ok sm:px-5">Всё проверено, долгов нет.</p>
              ) : (
                <ul>
                  {toCheck.map(({ student, v }) => (
                    <li key={v.hw.id} className="border-t border-line">
                      <Link
                        to={`/admin/homework/${student.id}/${v.hw.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 hover:bg-sunken sm:px-5"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            Проверить: {firstName(student.name)}, {v.hw.title}
                          </span>
                          <span className="block text-sm text-muted">
                            {v.submission?.doneAt ? (
                              <>
                                отмечено выполненным {relativeDay(v.submission.doneAt, TZ).toLowerCase()} в{' '}
                                <span className="num">{formatTime(v.submission.doneAt, TZ)}</span>
                              </>
                            ) : (
                              'отмечено выполненным'
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-pen-soft px-2.5 py-0.5 text-xs font-medium text-pen">сдано</span>
                      </Link>
                    </li>
                  ))}
                  {debts.map(({ student, v }) => (
                    <li key={v.hw.id} className="border-t border-line">
                      <Link
                        to={`/admin/homework/${student.id}/${v.hw.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 hover:bg-sunken sm:px-5"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            Долг: {firstName(student.name)}, {v.hw.title}
                          </span>
                          <span className="block text-sm text-red">
                            {daysSince(v.hw.deadline) === 0
                              ? 'просрочено сегодня'
                              : `просрочено на ${daysWord(daysSince(v.hw.deadline))}`}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-red-soft px-2.5 py-0.5 text-xs font-medium text-red">долг</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left">
                <thead>
                  <tr className="text-sm text-muted">
                    <th scope="col" className="border-t border-line px-4 py-2 font-normal sm:px-5">Ученик</th>
                    <th scope="col" className="border-t border-line px-3 py-2 font-normal">Ближайшее занятие</th>
                    <th scope="col" className="border-t border-line px-3 py-2 font-normal">Долги</th>
                    <th scope="col" className="border-t border-line px-3 py-2 font-normal">ДЗ, средний %</th>
                    <th scope="col" className="border-t border-line px-4 py-2 font-normal sm:px-5">Последний пробник</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ student, next, debts: d, hwPercent, lastMock }) => (
                    <tr key={student.id} className="hover:bg-sunken">
                      <td className="border-t border-line px-4 py-3 sm:px-5">
                        <Link to={`/admin/students/${student.id}`} className="font-medium hover:underline">
                          {student.name}
                        </Link>
                      </td>
                      <td className="num border-t border-line px-3 py-3 text-sm">
                        {next ? (
                          <span className={cn(dayKey(next.startsAt, TZ) === today && 'font-medium text-pen')}>
                            {dayKey(next.startsAt, TZ) === today ? 'сегодня' : formatDay(next.startsAt, TZ)} {formatTime(next.startsAt, TZ)}
                          </span>
                        ) : (
                          <span className="font-sans text-muted">не назначено</span>
                        )}
                      </td>
                      <td className={cn('num border-t border-line px-3 py-3', d > 0 ? 'font-medium text-red' : 'text-muted')}>{d}</td>
                      <td className="num border-t border-line px-3 py-3">{hwPercent === null ? <span className="text-muted">—</span> : `${hwPercent}%`}</td>
                      <td className="num border-t border-line px-4 py-3 sm:px-5">
                        {lastMock === null ? (
                          <span className="text-muted">—</span>
                        ) : lastMock.secondary !== null ? (
                          <span className={cn(lastMock.secondary < SECONDARY_MIN && 'text-red')}>
                            {lastMock.secondary} <span className="text-xs text-muted">тест.</span>
                          </span>
                        ) : (
                          `${lastMock.percent}%`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <MonthCalendar events={events} timeZone={TZ} />
        </div>
      )}
    </>
  )
}
