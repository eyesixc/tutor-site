import { CaretLeft, Check } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useSession } from '../../core/auth/session'
import { formatDay, formatTime } from '../../core/time'
import { telegramUrl } from '../../domain/contacts'
import { pickFiles } from '../../domain/files'
import { markOwnHomework, topicLabel } from '../../domain/homework'
import { homeworkLinkOf } from '../../domain/lessons'
import { Button } from '../../ui/Button'
import { ErrorState, errorMessage, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { LinkCard } from '../../ui/LinkCard'
import { useContacts, useLessons } from '../shared/data'
import { FileList } from '../shared/filesUi'
import { Facts, Linkified, scoreText, StatusBadge } from '../shared/homeworkUi'
import { useOwnData, useOwnHomework, useOwnSubmissions } from './data'

export function StudentHomeworkCardPage() {
  const { homeworkId = '' } = useParams()
  const session = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const own = useOwnData()
  const subs = useOwnSubmissions()
  const lessons = useLessons()
  const data = useOwnHomework()
  const contacts = useContacts()

  const mark = useMutation({
    mutationFn: (done: boolean) => markOwnHomework(session, homeworkId, done),
    onSuccess: async (_, done) => {
      await queryClient.invalidateQueries({ queryKey: ['own-subs'] })
      toast.success(done ? 'Отмечено выполненным' : 'Отметка снята')
    },
    onError: (cause) => toast.error(errorMessage(cause)),
  })

  if (own.isPending || subs.isPending || lessons.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-56" />
      </div>
    )
  }
  if (own.isError) return <ErrorState error={own.error} onRetry={() => void own.refetch()} />
  if (subs.isError) return <ErrorState error={subs.error} onRetry={() => void subs.refetch()} />
  if (lessons.isError) return <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />

  const view = data?.views.find((v) => v.hw.id === homeworkId)
  if (!data || !view) {
    return <ErrorState error={new Error('Задание не найдено. Возможно, репетитор его удалил.')} onRetry={() => navigate('/homework')} />
  }
  const { hw, status, submission } = view
  const tz = data.timeZone
  const when = (iso: string) => `${formatDay(iso, tz)}, ${formatTime(iso, tz)}`
  // Занятие ученика по этому уроку: на него ведёт ссылка «к уроку».
  const session_ = hw.lessonId ? own.data.sessions.find((s) => s.lessonId === hw.lessonId) : undefined
  const lesson = hw.lessonId ? lessons.data.find((l) => l.id === hw.lessonId) : undefined
  const lockedByTutor = hw.doneByTutor !== null
  const attachments = pickFiles(own.data.files, hw.fileIds)
  const solution = pickFiles(subs.data.files, submission?.fileIds ?? [])
  const homeworkLink = homeworkLinkOf(lesson)
  const telegram = telegramUrl(contacts.data?.telegram ?? '')
  const percent = hw.score !== null && hw.maxScore ? Math.round((hw.score / hw.maxScore) * 100) : null

  return (
    <>
      <Link to="/homework" className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm text-pen">
        <CaretLeft size={16} aria-hidden /> Все домашние задания
      </Link>
      <PageHeader title={hw.title} description={topicLabel(hw)} action={<StatusBadge status={status} />} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {status === 'debt' && (
            <Panel className="border-red bg-red-soft p-5">
              <h2 className="text-lg text-red">Это долг</h2>
              <p className="mt-1">
                Дедлайн был <span className="num">{when(hw.deadline)}</span>. Сделай работу и отметь её выполненной: долг сразу
                закроется.
              </p>
            </Panel>
          )}

          {status === 'checked' && (
            <Panel className="overflow-hidden border-ok">
              <div className="flex flex-wrap items-end justify-between gap-3 bg-ok-soft p-5">
                <div>
                  <p className="text-sm text-ok">Результат</p>
                  <p className="num text-2xl leading-tight">{scoreText(hw.score, hw.maxScore)}</p>
                </div>
                {percent !== null && <p className="num text-xl">{percent}%</p>}
              </div>
              <div className="p-5">
                <h2 className="text-lg">Комментарий репетитора</h2>
                {hw.tutorComment ? (
                  <p className="mt-2 max-w-[65ch] whitespace-pre-line">{hw.tutorComment}</p>
                ) : (
                  <p className="mt-2 text-muted">Комментария нет.</p>
                )}
              </div>
            </Panel>
          )}

          <Panel className="p-5">
            <h2 className="text-lg">Что нужно сделать</h2>
            {homeworkLink && (
              <LinkCard
                className="mt-3"
                accent
                title="Открыть домашку"
                url={homeworkLink.url}
                note={lesson ? `Из урока «${lesson.title}»` : undefined}
              />
            )}
            {hw.instructions ? (
              <div className="mt-2">
                <Linkified text={hw.instructions} />
              </div>
            ) : (
              !homeworkLink && <p className="mt-2 text-muted">Репетитор не оставил инструкцию. Спроси на уроке, если что-то неясно.</p>
            )}
          </Panel>

          {attachments.length > 0 && (
            <Panel className="overflow-hidden">
              <h2 className="px-5 pt-5 pb-3 text-lg">Файлы от репетитора</h2>
              <FileList files={attachments} viewBase="/files/own" fileKey={session.key} />
            </Panel>
          )}

          {status !== 'checked' && (
            <Panel className="p-5">
              <h2 className="text-lg">Как сдать</h2>
              <p className="mt-1 max-w-[65ch]">
                Отправь решение репетитору в Телеграм: файлы, фото или скриншоты. Потом отметь задание выполненным ниже.
              </p>
              {telegram ? (
                <LinkCard className="mt-3 sm:max-w-sm" title="Написать в Телеграм" url={telegram} note={`@${contacts.data?.telegram}`} />
              ) : (
                <p className="mt-2 text-sm text-muted">Контакт в Телеграме репетитор пока не указал. Спроси его на уроке.</p>
              )}
            </Panel>
          )}

          {solution.length > 0 && (
            <Panel className="overflow-hidden">
              <h2 className="px-5 pt-5 pb-3 text-lg">Загруженные раньше файлы</h2>
              <FileList files={solution} viewBase="/files/own" fileKey={session.key} />
            </Panel>
          )}

          {status !== 'checked' && (
            <Panel className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <h2 className="text-lg">{status === 'done' ? 'Работа сдана' : 'Отметь, когда сделаешь'}</h2>
                <p className="mt-1 text-sm text-muted">
                  {lockedByTutor
                    ? 'Отметку поставил репетитор, изменить её может только он.'
                    : status === 'done'
                      ? 'Репетитор увидит отметку и проверит работу.'
                      : 'Репетитор увидит отметку в своей панели.'}
                </p>
              </div>
              {!lockedByTutor &&
                (status === 'done' ? (
                  <Button loading={mark.isPending} onClick={() => mark.mutate(false)}>
                    Снять отметку
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    icon={<Check size={18} weight="bold" />}
                    loading={mark.isPending}
                    onClick={() => mark.mutate(true)}
                  >
                    Отметить выполненным
                  </Button>
                ))}
            </Panel>
          )}
        </div>

        <Panel className="p-5">
          <h2 className="mb-3 text-lg">Сведения</h2>
          <Facts
            items={[
              ['Заданий', <span className="num">{hw.taskCount}</span>],
              ['Выдано', <span className="num">{formatDay(hw.issuedAt, tz)}</span>],
              ['Дедлайн', <span className={cn('num', status === 'debt' && 'font-medium text-red')}>{when(hw.deadline)}</span>],
              ['Сдано', submission?.done && submission.doneAt ? <span className="num">{when(submission.doneAt)}</span> : 'нет'],
              ['Баллы', <span className="num">{scoreText(hw.score, hw.maxScore)}</span>],
              [
                'Урок',
                lesson ? (
                  session_ ? (
                    <Link to={`/lessons/${session_.id}`} className="text-pen underline">
                      {lesson.title}
                    </Link>
                  ) : (
                    lesson.title
                  )
                ) : (
                  'без привязки'
                ),
              ],
            ]}
          />
        </Panel>
      </div>
    </>
  )
}
