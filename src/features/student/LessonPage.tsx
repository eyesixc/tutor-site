import { CaretLeft, VideoCamera } from '@phosphor-icons/react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatDay, formatTimeRange } from '../../core/time'
import { findLesson } from '../../domain/lessons'
import { buttonClass } from '../../ui/Button'
import { Badge, ErrorState, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { LessonContent, LessonMeta } from '../shared/LessonContent'
import { useLessons } from '../shared/data'
import { useOwnData } from './HomePage'

export function StudentLessonPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const own = useOwnData()
  const lessons = useLessons()

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
        <div className="max-w-3xl">
          <LessonContent lesson={lesson} />
        </div>
      ) : (
        <Panel className="p-5 text-muted">Материалы этого урока больше недоступны.</Panel>
      )}
    </>
  )
}
