import { VideoCamera } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../core/auth/session'
import { formatTime, relativeDay, zoneLabel } from '../../core/time'
import { lessonTitle, nextSession } from '../../domain/lessons'
import { loadOwnTutorFile } from '../../domain/students'
import { buttonClass } from '../../ui/Button'
import { MonthCalendar, type CalendarEvent } from '../../ui/MonthCalendar'
import { ErrorState, Skeleton } from '../../ui/bits'
import { useLessons } from '../shared/data'

/** Личные данные ученика: расписание, домашки, пробники. */
export function useOwnData() {
  const session = useSession()
  return useQuery({ queryKey: ['own', session.bundle.userId], queryFn: () => loadOwnTutorFile(session) })
}

export function StudentHomePage() {
  const own = useOwnData()
  const lessons = useLessons()

  const events = useMemo<CalendarEvent[]>(
    () =>
      (own.data?.sessions ?? []).map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        title: lessonTitle(lessons.data, s.lessonId),
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

      <p className="text-sm text-muted">Время показано в твоём часовом поясе: {zoneLabel(tz)}.</p>
    </div>
  )
}
