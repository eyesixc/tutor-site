import { VideoCamera } from '@phosphor-icons/react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatDay, formatTime, relativeDay, zoneLabel } from '../../core/time'
import { sortHomework, topicLabel } from '../../domain/homework'
import { findLesson, homeworkLinkOf, lessonKind, lessonTitle, nextSession } from '../../domain/lessons'
import { buttonClass } from '../../ui/Button'
import { MonthCalendar, type CalendarEvent } from '../../ui/MonthCalendar'
import { ErrorState, Panel, Skeleton } from '../../ui/bits'
import { LinkCard } from '../../ui/LinkCard'
import { useLessons } from '../shared/data'
import { StatusBadge } from '../shared/homeworkUi'
import { useOwnData, useOwnHomework } from './data'

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

  if (own.isPending || lessons.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-6 w-96 max-w-full" />
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
  const live = next !== null && next.startsAt <= new Date().toISOString()
  const views = homework?.views ?? []
  const debts = sortHomework(
    views.filter((v) => v.status === 'debt'),
    'deadline',
    () => '',
  )
  const latest = [...views].sort((a, b) => b.hw.issuedAt.localeCompare(a.hw.issuedAt))[0]
  const latestSession = latest?.hw.lessonId ? sessions.find((s) => s.lessonId === latest.hw.lessonId) : undefined
  const latestLink = latest?.hw.lessonId ? homeworkLinkOf(findLesson(lessons.data, latest.hw.lessonId)) : null
  const when = (iso: string) => `${formatDay(iso, tz)}, ${formatTime(iso, tz)}`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl">Привет, {firstName}</h1>
          {next ? (
            <p className="mt-1 text-muted">
              {live ? 'Урок идёт сейчас' : `Ближайший урок: ${relativeDay(next.startsAt, tz).toLowerCase()} в `}
              {!live && <span className="num text-ink">{formatTime(next.startsAt, tz)}</span>}
              {': '}
              <Link to={`/lessons/${next.id}`} className="text-pen underline">
                {lessonTitle(lessons.data, next.lessonId)}
              </Link>
            </p>
          ) : (
            <p className="mt-1 text-muted">Ближайших уроков пока нет. Они появятся в календаре, когда репетитор их назначит.</p>
          )}
        </div>
        {profile.telemostUrl && (
          <a href={profile.telemostUrl} target="_blank" rel="noreferrer" className={buttonClass('primary')}>
            <VideoCamera size={20} weight="fill" aria-hidden />
            Подключиться к уроку
          </a>
        )}
      </div>

      <MonthCalendar events={events} timeZone={tz} />

      {debts.length > 0 && (
        <Panel className="overflow-hidden border-red bg-red-soft">
          <h2 className="px-4 pt-4 text-lg text-red sm:px-5">У тебя есть незакрытые долги</h2>
          <ul className="mt-2">
            {debts.map(({ hw }) => (
              <li key={hw.id} className="border-t border-red/25">
                <Link
                  to={`/homework/${hw.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 hover:bg-red/10 sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{hw.title}</span>
                    <span className="block text-sm">
                      {topicLabel(hw)}. Заданий: {hw.taskCount}
                    </span>
                  </span>
                  <span className="text-sm">
                    Дедлайн был <span className="num font-medium">{when(hw.deadline)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {latest && (
        <Panel className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-sm text-muted">Последнее домашнее задание</p>
            <h2 className="mt-1 text-lg">{latest.hw.title}</h2>
            <p className="mt-1 text-muted">
              {topicLabel(latest.hw)}. Заданий: {latest.hw.taskCount}
              {latest.hw.lessonId && (
                <>
                  {'. К уроку '}
                  {latestSession ? (
                    <Link to={`/lessons/${latestSession.id}`} className="text-pen underline">
                      {lessonTitle(lessons.data, latest.hw.lessonId)}
                    </Link>
                  ) : (
                    lessonTitle(lessons.data, latest.hw.lessonId)
                  )}
                </>
              )}
            </p>
            <p className="mt-1">
              Сдать до <span className="num">{when(latest.hw.deadline)}</span>
            </p>
            {latestLink && (
              <LinkCard className="mt-3 sm:max-w-sm" accent title="Открыть домашку" url={latestLink.url} />
            )}
          </div>
          <div className="flex flex-col items-end gap-3">
            <StatusBadge status={latest.status} />
            <Link to={`/homework/${latest.hw.id}`} className={buttonClass('secondary')}>
              Открыть задание
            </Link>
          </div>
        </Panel>
      )}

      <p className="text-sm text-muted">Время показано в твоём часовом поясе: {zoneLabel(tz)}.</p>
    </div>
  )
}
