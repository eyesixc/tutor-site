import { CaretLeft, PencilSimple, Trash } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useSession } from '../../core/auth/session'
import { fromB64 } from '../../core/crypto'
import { formatDay, formatTime, TUTOR_TIMEZONE } from '../../core/time'
import { pickFiles } from '../../domain/files'
import {
  addHomeworkFiles,
  checkHomework,
  deleteHomework,
  homeworkStatus,
  isDone,
  removeHomeworkFile,
  renameHomeworkFile,
  setDoneByTutor,
  topicLabel,
  uncheckHomework,
  updateHomework,
} from '../../domain/homework'
import { findLesson } from '../../domain/lessons'
import { ValidationError } from '../../domain/students'
import type { Homework, Lesson } from '../../domain/types'
import { Button } from '../../ui/Button'
import { ConfirmDialog, Dialog, DialogActions } from '../../ui/Dialog'
import { inputBase, TextAreaField, TextField } from '../../ui/Field'
import { ErrorState, errorMessage, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { useLessons, useOverview, useRefresh } from '../shared/data'
import { FileList, Uploader } from '../shared/filesUi'
import { Facts, scoreText, StatusBadge } from '../shared/homeworkUi'
import {
  deadlineParts,
  deadlineToUtc,
  formFromHomework,
  formToInput,
  HomeworkFields,
  type HomeworkFormState,
} from './HomeworkForm'

const when = (iso: string) => `${formatDay(iso, TUTOR_TIMEZONE)}, ${formatTime(iso, TUTOR_TIMEZONE)}`

function EditDialog({
  hw,
  studentId,
  lessons,
  onClose,
}: {
  hw: Homework
  studentId: string
  lessons: Lesson[]
  onClose(): void
}) {
  const session = useSession()
  const refresh = useRefresh()
  const [form, setForm] = useState<HomeworkFormState>(() => formFromHomework(hw))
  const [deadline, setDeadline] = useState(() => deadlineParts(hw.deadline))
  const [busy, setBusy] = useState(false)
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null)
  const err = (field: string) => (fieldError?.field === field ? fieldError.message : null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setFieldError(null)
    setBusy(true)
    try {
      await updateHomework(session, studentId, hw.id, {
        ...formToInput(form),
        deadline: deadlineToUtc(deadline.date, deadline.time),
      })
      await refresh()
      toast.success('Задание сохранено')
      onClose()
    } catch (cause) {
      if (cause instanceof ValidationError) setFieldError({ field: cause.field, message: cause.message })
      else toast.error(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()} title="Изменить задание" persistent={busy} wide>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <HomeworkFields form={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} lessons={lessons} error={err} />
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Дедлайн, время московское</legend>
          <div className="flex gap-2">
            <input
              type="date"
              aria-label="Дата дедлайна"
              value={deadline.date}
              onChange={(e) => setDeadline((d) => ({ ...d, date: e.target.value }))}
              className={cn(inputBase, 'num w-44')}
            />
            <input
              type="time"
              aria-label="Время дедлайна"
              value={deadline.time}
              onChange={(e) => setDeadline((d) => ({ ...d, time: e.target.value }))}
              className={cn(inputBase, 'num w-32')}
            />
          </div>
          {err('deadline') && (
            <p role="alert" className="text-sm text-red">
              {err('deadline')}
            </p>
          )}
        </fieldset>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Сохранить
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

function CheckPanel({ hw, studentId }: { hw: Homework; studentId: string }) {
  const session = useSession()
  const refresh = useRefresh()
  const [score, setScore] = useState(hw.score === null ? '' : String(hw.score))
  const [comment, setComment] = useState(hw.tutorComment)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const checked = hw.checkedAt !== null

  const run = async (action: () => Promise<void>, message: string) => {
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      await action()
      await refresh()
      toast.success(message)
    } catch (cause) {
      if (cause instanceof ValidationError) setError(cause.message)
      else toast.error(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = score.trim() === '' ? null : Number(score.replace(',', '.'))
    void run(
      () => checkHomework(session, studentId, hw.id, { score: value, comment }),
      checked ? 'Проверка обновлена' : 'Работа проверена',
    )
  }

  return (
    <Panel className="p-5">
      <h2 className="text-lg">Проверка</h2>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-4" noValidate>
        {hw.maxScore === null ? (
          <p className="text-sm text-muted">У задания нет максимального балла. Чтобы поставить баллы, укажите его в «Изменить».</p>
        ) : (
          <div className="max-w-48">
            <TextField
              label={`Баллы, из ${hw.maxScore}`}
              value={score}
              onChange={setScore}
              error={error}
              inputMode="decimal"
              mono
            />
          </div>
        )}
        <TextAreaField label="Комментарий ученику" value={comment} onChange={setComment} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={busy}>
            {checked ? 'Сохранить проверку' : 'Отметить проверенным'}
          </Button>
          {checked && (
            <Button disabled={busy} onClick={() => void run(() => uncheckHomework(session, studentId, hw.id), 'Проверка снята')}>
              Снять проверку
            </Button>
          )}
        </div>
      </form>
    </Panel>
  )
}

export function AdminHomeworkDetailPage() {
  const { studentId = '', homeworkId = '' } = useParams()
  const session = useSession()
  const refresh = useRefresh()
  const navigate = useNavigate()
  const overview = useOverview()
  const lessons = useLessons()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)

  if (overview.isPending || lessons.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    )
  }
  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
  if (lessons.isError) return <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />

  const student = overview.data.students.find((s) => s.id === studentId)
  const hw = overview.data.files[studentId]?.homework.find((h) => h.id === homeworkId)
  if (!student || !hw) {
    return <ErrorState error={new Error('Задание не найдено. Возможно, оно было удалено.')} onRetry={() => navigate('/admin/homework')} />
  }
  const submission = overview.data.subs[studentId].submissions[hw.id]
  const status = homeworkStatus(hw, submission)
  const done = isDone(hw, submission)
  const lesson = hw.lessonId ? findLesson(lessons.data, hw.lessonId) : null
  const studentKey = fromB64(overview.data.keys[studentId])
  const viewBase = `/admin/files/${studentId}`
  const attachments = pickFiles(overview.data.files[studentId].files, hw.fileIds)
  const solution = pickFiles(overview.data.subs[studentId].files, submission?.fileIds ?? [])

  const toggleDone = async () => {
    setToggling(true)
    try {
      await setDoneByTutor(session, studentId, hw.id, !done)
      await refresh()
      toast.success(done ? 'Отмечено невыполненным' : 'Отмечено выполненным')
    } catch (cause) {
      toast.error(errorMessage(cause))
    } finally {
      setToggling(false)
    }
  }

  const confirmDelete = async () => {
    try {
      await deleteHomework(session, studentId, hw.id)
      await refresh()
      toast.success('Задание удалено')
      navigate('/admin/homework', { replace: true })
    } catch (cause) {
      toast.error(errorMessage(cause))
      throw cause
    }
  }

  return (
    <>
      <Link to="/admin/homework" className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm text-pen">
        <CaretLeft size={16} aria-hidden /> Все домашние задания
      </Link>
      <PageHeader
        title={hw.title}
        description={
          <>
            <Link to={`/admin/students/${student.id}`} className="text-pen underline">
              {student.name}
            </Link>
            . {topicLabel(hw)}
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <Button icon={<PencilSimple size={18} />} onClick={() => setEditing(true)}>
              Изменить
            </Button>
            <Button icon={<Trash size={18} />} onClick={() => setDeleting(true)}>
              Удалить
            </Button>
          </div>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Panel className="p-5">
            <h2 className="text-lg">Инструкция</h2>
            {hw.instructions ? (
              <p className="mt-2 max-w-[65ch] whitespace-pre-line">{hw.instructions}</p>
            ) : (
              <p className="mt-2 text-muted">Инструкция не заполнена.</p>
            )}
          </Panel>

          <Panel className="overflow-hidden">
            <h2 className="px-5 pt-5 pb-3 text-lg">Файлы к заданию</h2>
            {attachments.length > 0 && (
              <FileList
                files={attachments}
                viewBase={viewBase}
                fileKey={studentKey}
                onRemove={async (meta) => {
                  await removeHomeworkFile(session, studentId, hw.id, meta)
                  await refresh()
                }}
                onRename={async (meta, title) => {
                  await renameHomeworkFile(session, studentId, meta.id, title)
                  await refresh()
                }}
              />
            )}
            <div className="border-t border-line p-4 sm:px-5">
              <Uploader
                scope={{ kind: 'student', studentId, key: studentKey }}
                hint="Условия, шаблоны, примеры. Видит только этот ученик"
                onUploaded={async (metas) => {
                  await addHomeworkFiles(session, studentId, hw.id, metas)
                  await refresh()
                }}
              />
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <h2 className="px-5 pt-5 pb-3 text-lg">Решение ученика</h2>
            {solution.length > 0 ? (
              <FileList files={solution} viewBase={viewBase} fileKey={studentKey} />
            ) : (
              <p className="border-t border-line px-5 py-4 text-sm text-muted">Ученик пока не прикрепил файлы.</p>
            )}
          </Panel>

          <Panel className="p-5">
            <h2 className="text-lg">Выполнение</h2>
            <p className="mt-2 text-sm text-muted">
              {hw.doneByTutor !== null
                ? `Отметку поставил репетитор: ${hw.doneByTutor ? 'выполнено' : 'не выполнено'}.`
                : submission?.done
                  ? `Ученик отметил работу выполненной ${submission.doneAt ? when(submission.doneAt) : ''}.`
                  : 'Ученик ещё не отметил работу выполненной.'}
            </p>
            <div className="mt-3">
              <Button onClick={() => void toggleDone()} loading={toggling}>
                {done ? 'Отметить невыполненным' : 'Отметить выполненным'}
              </Button>
            </div>
          </Panel>

          <CheckPanel key={hw.checkedAt ?? 'unchecked'} hw={hw} studentId={studentId} />
        </div>

        <Panel className="p-5">
          <h2 className="mb-3 text-lg">Сведения</h2>
          <Facts
            items={[
              ['Заданий', <span className="num">{hw.taskCount}</span>],
              ['Выдано', <span className="num">{formatDay(hw.issuedAt, TUTOR_TIMEZONE)}</span>],
              ['Дедлайн', <span className={cn('num', status === 'debt' && 'font-medium text-red')}>{when(hw.deadline)}</span>],
              ['Баллы', <span className="num">{scoreText(hw.score, hw.maxScore)}</span>],
              ['Проверено', hw.checkedAt ? <span className="num">{when(hw.checkedAt)}</span> : 'нет'],
              [
                'Урок',
                lesson ? (
                  <Link to={`/admin/lessons/${lesson.id}`} className="text-pen underline">
                    {lesson.title}
                  </Link>
                ) : (
                  'без привязки'
                ),
              ],
            ]}
          />
        </Panel>
      </div>

      {editing && <EditDialog hw={hw} studentId={studentId} lessons={lessons.data} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Удалить задание?"
        description={`«${hw.title}» у ученика ${student.name} будет удалено вместе с баллами и комментарием. Отменить удаление нельзя.`}
        confirmLabel="Удалить задание"
        danger
        onConfirm={confirmDelete}
      />
    </>
  )
}
