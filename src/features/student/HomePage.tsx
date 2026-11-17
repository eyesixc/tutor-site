import { CaretRight, VideoCamera } from '@phosphor-icons/react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatDay, formatTime, formatTimeRange, relativeDay, zoneLabel } from '../../core/time'
import { sortHomework, type HomeworkView } from '../../domain/homework'
import { findLesson, KIND_LABEL, lessonKind, lessonTitle, nextSession } from '../../domain/lessons'
import { mockTotals, previousGraded, SECONDARY_MIN, sortMocks } from '../../domain/mocks'
import { MonthCalendar, type CalendarDeadline, type CalendarEvent } from '../../ui/MonthCalendar'
import { ErrorState, Panel, Skeleton } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { useLessons } from '../shared/data'
import { useOwnData, useOwnHomework } from './data'

/** Дедлайн ближе двух суток: строка подсвечивается жёлтым. */
const SOON_MS = 48 * 3600 * 1000

function TodoRow({ view, tz }: { view: HomeworkView; tz: string }) {
  const { hw, status } = view
  const soon = status === 'todo' && new Date(hw.deadline).getTime() - Date.now() < SOON_MS
  const tone = status === 'debt' ? 'red' : soon ? 'warn' : 'muted'
  return (
    <li className="border-t border-line">
      <Link
        to={`/homework/${hw.id}`}
        className={cn('flex items-center gap-3 px-4 py-3 transition-colors duration-150 sm:px-5', status === 'debt' ? 'bg-red-soft hover:bg-red/10' : 'hover:bg-sunken')}
      >
        <span
          aria-hidden
          className={cn('w-1 self-stretch rounded-full', tone === 'red' ? 'bg-red' : tone === 'warn' ? 'bg-warn' : 'bg-line')}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{hw.title}</span>
          <span className={cn('block text-sm', tone === 'red' ? 'text-red' : tone === 'warn' ? 'text-warn' : 'text-muted')}>
            {status === 'debt' ? 'Долг · дедлайн был ' : 'Сдать до '}
            <span className="num">
              {relativeDay(hw.deadline, tz).toLowerCase()}, {formatTime(hw.deadline, tz)}
            </span>
          </span>
        </span>
        <CaretRight size={18} aria-hidden className="shrink-0 text-muted" />
      </Link>
    </li>
  )
}

export function StudentHomePage() {
  const own = useOwnData()
  const lessons = useLessons()
  const homework = useOwnHomework()

  const events = useMemo<CalendarEvent[]>(
    () =>
      (own.data?.sessions ?? []).map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        title: lessonTitle(lessons.data, s.lessonId),
        kind: lessonKind(lessons.data, s.lessonId),
        to: `/lessons/${s.id}`,
        cancelled: s.status === 'cancelled',
      })),
    [own.data, lessons.data],
  )

  const deadlines = useMemo<CalendarDeadline[]>(
    () =>
      (homework?.views ?? [])
        .filter((v) => v.status === 'todo' || v.status === 'debt')
        .map((v) => ({ id: v.hw.id, at: v.hw.deadline, title: v.hw.title, to: `/homework/${v.hw.id}`, overdue: v.status === 'debt' })),
    [homework],
  )

  if (own.isPending || lessons.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48" />
        <Skeleton className="h-96" />
      </div>
    )
  }
  if (own.isError) return <ErrorState error={own.error} onRetry={() => void own.refetch()} />
  if (lessons.isError) return <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />

  const { profile, sessions } = own.data
  const tz = profile.timezone
  const firstName = profile.name.split(/\s+/)[0]
  const next = nextSession(sessions)
  const nextLesson = next ? findLesson(lessons.data, next.lessonId) : null
  const live = next !== null && next.startsAt <= new Date().toISOString()
  const views = homework?.views ?? []
  const todo = sortHomework(
    views.filter((v) => v.status === 'debt' || v.status === 'todo'),
    'status',
    () => '',
  )
  const mocks = sortMocks(own.data.mockExams).filter((m) => mockTotals(m).percent !== null)
  const lastMock = mocks[0]
  const lastTotals = lastMock ? mockTotals(lastMock) : null
  const prevMock = lastMock ? previousGraded(own.data.mockExams, lastMock) : null
  const prevTotals = prevMock ? mockTotals(prevMock) : null
  const delta = lastTotals?.secondary != null && prevTotals?.secondary != null ? lastTotals.secondary - prevTotals.secondary : null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl sm:text-2xl">Привет, {firstName}</h1>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col gap-6">
          {next ? (
            <section className="flex flex-col gap-4 rounded-panel bg-pen p-5 text-pen-ink">
              <span className="text-sm opacity-85">{live ? 'Урок идёт сейчас' : 'Следующий урок'}</span>
              <div>
                <Link to={`/lessons/${next.id}`} className="block text-2xl leading-tight font-semibold hover:underline">
                  {lessonTitle(lessons.data, next.lessonId)}
                </Link>
                <p className="num mt-1 opacity-90">
                  <span className="font-sans first-letter:uppercase">{relativeDay(next.startsAt, tz)}</span>
                  {' · '}
                  {formatTimeRange(next.startsAt, next.endsAt, tz)}
                  {nextLesson?.kind && <span className="font-sans"> · {KIND_LABEL[nextLesson.kind]}</span>}
                </p>
              </div>
              {profile.telemostUrl && (
                <a
                  href={profile.telemostUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-pen-ink font-semibold text-pen transition-[filter] duration-150 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen-ink"
                >
                  <VideoCamera size={20} weight="fill" aria-hidden />
                  Войти в Телемост
                </a>
              )}
            </section>
          ) : (
            <Panel className="p-5">
              <p className="text-sm text-muted">Следующий урок</p>
              <p className="mt-1">Ближайших уроков пока нет. Они появятся в календаре, когда репетитор их назначит.</p>
            </Panel>
          )}

          {lastMock && lastTotals && (
            <Link
              to={`/mocks/${lastMock.id}`}
              className="flex items-center justify-between gap-4 rounded-panel border border-line bg-surface p-4 transition-colors duration-150 hover:bg-sunken sm:px-5"
            >
              <span>
                <span className="block text-sm text-muted">Последний пробник</span>
                <span className={cn('num text-2xl', lastTotals.secondary !== null && lastTotals.secondary < SECONDARY_MIN && 'text-red')}>
                  {lastTotals.secondary ?? `${lastTotals.percent}%`}
                  {lastTotals.secondary !== null && <span className="text-sm whitespace-nowrap text-muted"> тест. балла</span>}
                </span>
              </span>
              {delta !== null && (
                <span
                  className={cn(
                    'num shrink-0 rounded-full px-2.5 py-0.5 text-sm',
                    delta > 0 ? 'bg-ok-soft text-ok' : delta < 0 ? 'bg-red-soft text-red' : 'bg-sunken text-muted',
                  )}
                >
                  {delta > 0 ? '+' : delta < 0 ? '−' : '±'}
                  {Math.abs(delta)} к прошлому
                </span>
              )}
            </Link>
          )}
        </div>

        <Panel className="overflow-hidden">
          <h2 className="px-4 pt-4 pb-3 text-lg sm:px-5">Что сделать</h2>
          {todo.length === 0 ? (
            <p className="border-t border-line px-4 py-4 text-ok sm:px-5">Всё сдано. Новые задания появятся здесь.</p>
          ) : (
            <ul>
              {todo.map((view) => (
                <TodoRow key={view.hw.id} view={view} tz={tz} />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <MonthCalendar events={events} timeZone={tz} deadlines={deadlines} />

      <p className="text-sm text-muted">
        Время показано в твоём часовом поясе: {zoneLabel(tz)}. Сегодня <span className="num">{formatDay(new Date().toISOString(), tz)}</span>.
      </p>
    </div>
  )
}
