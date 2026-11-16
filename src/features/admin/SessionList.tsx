import * as Menu from '@radix-ui/react-dropdown-menu'
import { ArrowsClockwise, CalendarX, DotsThree, Trash } from '@phosphor-icons/react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useSession } from '../../core/auth/session'
import {
  dayKey,
  formatDay,
  formatTime,
  formatTimeRange,
  TUTOR_TIMEZONE,
  zonedToUtc,
  zoneLabel,
} from '../../core/time'
import { deleteSession, updateSession } from '../../domain/lessons'
import { ValidationError } from '../../domain/students'
import type { LessonSession } from '../../domain/types'
import { Button, IconButton } from '../../ui/Button'
import { ConfirmDialog, Dialog, DialogActions } from '../../ui/Dialog'
import { inputClass } from '../../ui/Field'
import { Badge, errorMessage } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { useRefresh } from '../shared/data'

export interface SessionEntry {
  session: LessonSession
  studentId: string
  /** Заголовок строки: имя ученика или название урока, смотря где список. */
  title: string
  to: string
  studentTimezone: string
}

/** Поля даты и времени. Репетитор всегда вводит московское время. */
export function TimingFields({
  date,
  start,
  end,
  onChange,
  labelPrefix,
}: {
  date: string
  start: string
  end: string
  onChange(patch: { date?: string; start?: string; end?: string }): void
  labelPrefix: string
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <input
        type="date"
        aria-label={`${labelPrefix}: дата`}
        value={date}
        onChange={(e) => onChange({ date: e.target.value })}
        className={cn(inputClass, 'num w-40 text-sm')}
      />
      <input
        type="time"
        aria-label={`${labelPrefix}: начало`}
        value={start}
        onChange={(e) => onChange({ start: e.target.value })}
        className={cn(inputClass, 'num w-28 text-sm')}
      />
      <input
        type="time"
        aria-label={`${labelPrefix}: окончание`}
        value={end}
        onChange={(e) => onChange({ end: e.target.value })}
        className={cn(inputClass, 'num w-28 text-sm')}
      />
    </div>
  )
}

/** Подсказка, какое время увидит ученик из другого пояса. */
export function StudentTimeHint({ date, start, timezone }: { date: string; start: string; timezone: string }) {
  if (timezone === TUTOR_TIMEZONE || !date || !start) return null
  const iso = zonedToUtc(date, start, TUTOR_TIMEZONE)
  return (
    <p className="text-sm text-muted">
      У ученика это <span className="num text-ink">{formatTime(iso, timezone)}</span>, {formatDay(iso, timezone)},{' '}
      {zoneLabel(timezone)}
    </p>
  )
}

function RescheduleDialog({ entry, onClose }: { entry: SessionEntry; onClose(): void }) {
  const session = useSession()
  const refresh = useRefresh()
  const [timing, setTiming] = useState(() => ({
    date: dayKey(entry.session.startsAt, TUTOR_TIMEZONE),
    start: formatTime(entry.session.startsAt, TUTOR_TIMEZONE),
    end: formatTime(entry.session.endsAt, TUTOR_TIMEZONE),
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    if (!timing.date || !timing.start || !timing.end) {
      setError('Укажите дату, начало и окончание')
      return
    }
    setBusy(true)
    try {
      await updateSession(session, entry.studentId, entry.session.id, {
        startsAt: zonedToUtc(timing.date, timing.start, TUTOR_TIMEZONE),
        endsAt: zonedToUtc(timing.date, timing.end, TUTOR_TIMEZONE),
      })
      await refresh()
      toast.success('Занятие перенесено')
      onClose()
    } catch (cause) {
      if (cause instanceof ValidationError) setError(cause.message)
      else toast.error(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !busy && onClose()}
      title="Перенести занятие"
      description={`${entry.title}. Время московское. У остальных учеников расписание не изменится.`}
      persistent={busy}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <TimingFields {...timing} onChange={(patch) => setTiming((t) => ({ ...t, ...patch }))} labelPrefix="Новое время" />
        <StudentTimeHint date={timing.date} start={timing.start} timezone={entry.studentTimezone} />
        {error && (
          <p role="alert" className="text-sm text-red">
            {error}
          </p>
        )}
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Перенести
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

const menuItem =
  'flex h-10 cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 text-sm outline-none data-highlighted:bg-sunken'

function SessionRow({ entry }: { entry: SessionEntry }) {
  const session = useSession()
  const refresh = useRefresh()
  const [rescheduling, setRescheduling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { session: item } = entry
  const cancelled = item.status === 'cancelled'
  const past = item.endsAt < new Date().toISOString()

  const toggleCancel = async () => {
    try {
      await updateSession(session, entry.studentId, item.id, { status: cancelled ? 'planned' : 'cancelled' })
      await refresh()
      toast.success(cancelled ? 'Занятие возвращено в расписание' : 'Занятие отменено')
    } catch (cause) {
      toast.error(errorMessage(cause))
    }
  }

  const confirmDelete = async () => {
    try {
      await deleteSession(session, entry.studentId, item.id)
      await refresh()
      toast.success('Занятие удалено')
    } catch (cause) {
      toast.error(errorMessage(cause))
      throw cause
    }
  }

  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 sm:px-5">
      <div className="w-36 shrink-0">
        <p className={cn('text-sm font-medium first-letter:uppercase', (cancelled || past) && 'text-muted')}>
          {formatDay(item.startsAt, TUTOR_TIMEZONE)}
        </p>
        <p className="num text-sm text-muted">{formatTimeRange(item.startsAt, item.endsAt, TUTOR_TIMEZONE)}</p>
      </div>
      <Link to={entry.to} className={cn('min-w-0 flex-1 truncate font-medium hover:underline', cancelled && 'text-muted line-through')}>
        {entry.title}
      </Link>
      {cancelled ? <Badge>Отменено</Badge> : past ? <Badge>Прошло</Badge> : <Badge tone="pen">Запланировано</Badge>}
      <Menu.Root>
        <Menu.Trigger asChild>
          <IconButton label={`Действия с занятием: ${entry.title}`}>
            <DotsThree size={22} weight="bold" />
          </IconButton>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-56 rounded-control border border-line bg-surface p-1 shadow-pop animate-[pop-in_140ms_ease-out]"
          >
            <Menu.Item className={menuItem} onSelect={() => setRescheduling(true)}>
              <ArrowsClockwise size={18} aria-hidden /> Перенести
            </Menu.Item>
            <Menu.Item className={menuItem} onSelect={() => void toggleCancel()}>
              <CalendarX size={18} aria-hidden /> {cancelled ? 'Вернуть в расписание' : 'Отменить занятие'}
            </Menu.Item>
            <Menu.Separator className="my-1 h-px bg-line" />
            <Menu.Item className={`${menuItem} text-red`} onSelect={() => setDeleting(true)}>
              <Trash size={18} aria-hidden /> Удалить занятие
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

      {rescheduling && <RescheduleDialog entry={entry} onClose={() => setRescheduling(false)} />}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Удалить занятие?"
        description={`${entry.title}, ${formatDay(item.startsAt, TUTOR_TIMEZONE)}. Занятие исчезнет из расписания ученика. Сам урок в библиотеке останется.`}
        confirmLabel="Удалить"
        danger
        onConfirm={confirmDelete}
      />
    </li>
  )
}

export function SessionList({ entries, empty }: { entries: SessionEntry[]; empty: ReactNode }) {
  if (entries.length === 0) return <p className="px-4 py-4 text-sm text-muted sm:px-5">{empty}</p>
  return (
    <ul>
      {entries.map((entry) => (
        <SessionRow key={entry.session.id} entry={entry} />
      ))}
    </ul>
  )
}
