import { CaretLeft, VideoCamera } from '@phosphor-icons/react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatDay, formatTime, formatTimeRange } from '../../core/time'
import { topicLabel } from '../../domain/homework'
import { findLesson } from '../../domain/lessons'
import { buttonClass } from '../../ui/Button'
import { Badge, ErrorState, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { LessonContent, LessonMeta } from '../shared/LessonContent'
import { useLessons } from '../shared/data'
import { StatusBadge } from '../shared/homeworkUi'
import { useOwnData, useOwnHomework } from './data'

export function StudentLessonPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const own = useOwnData()
  const lessons = useLessons()
  const homework = useOwnHomework()

  if (own.isPending || lessons.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-48" />
      </div>
    )
  }
  if (own.isError) return <ErrorState error={own.error} onRetry={() => void own.refetch()} />
  if (lessons.isError) return <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />

  const session = own.data.sessions.find((s) => s.id === sessionId)
  if (!session) {
    return <ErrorState error={new Error('Занятие не найдено. Возможно, репетитор его удалил.')} onRetry={() => navigate('/lessons')} />
  }
  const lesson = findLesson(lessons.data, session.lessonId)
  const { profile } = own.data
  const tz = profile.timezone
  const cancelled = session.status === 'cancelled'
  const finished = session.endsAt < new Date().toISOString()
  const related = (homework?.views ?? []).filter((v) => v.hw.lessonId === session.lessonId)

  return (
    <>
      <Link to="/lessons" className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm text-pen">
        <CaretLeft size={16} aria-hidden /> Все уроки
      </Link>
      <PageHeader
        title={lesson?.title ?? 'Урок удалён из библиотеки'}
        description={
          <>
            <span className="first-letter:uppercase">{formatDay(session.startsAt, tz, true)}</span>,{' '}
            <span className="num text-ink">{formatTimeRange(session.startsAt, session.endsAt, tz)}</span>
            {lesson && (
              <>
                . <LessonMeta lesson={lesson} />
              </>
            )}
          </>
        }
        action={
          cancelled ? (
            <Badge>Занятие отменено</Badge>
          ) : (
            !finished &&
            profile.telemostUrl && (
              <a href={profile.telemostUrl} target="_blank" rel="noreferrer" className={buttonClass('primary')}>
                <VideoCamera size={20} weight="fill" aria-hidden />
                Подключиться к уроку
              </a>
            )
          )
        }
      />

      {lesson ? (
        <div className="flex max-w-3xl flex-col gap-6">
          <LessonContent lesson={lesson} viewBase="/files/shared" />
          {related.length > 0 && (
            <Panel className="overflow-hidden">
              <h2 className="px-5 pt-5 pb-3 text-lg">Домашнее задание к уроку</h2>
              <ul>
                {related.map(({ hw, status }) => (
                  <li key={hw.id} className="border-t border-line">
                    <Link
                      to={`/homework/${hw.id}`}
                      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3 hover:bg-sunken"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{hw.title}</span>
                        <span className="block text-sm text-muted">
                          {topicLabel(hw)}. Заданий: {hw.taskCount}. Сдать до{' '}
                          <span className="num text-ink">
                            {formatDay(hw.deadline, tz)}, {formatTime(hw.deadline, tz)}
                          </span>
                        </span>
                      </span>
                      <StatusBadge status={status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      ) : (
        <Panel className="p-5 text-muted">Материалы этого урока больше недоступны.</Panel>
      )}
    </>
  )
}
