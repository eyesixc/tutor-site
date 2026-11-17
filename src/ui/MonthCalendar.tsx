import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  dayKey,
  formatDayKey,
  formatTime,
  monthGrid,
  monthKey,
  monthTitle,
  shiftMonth,
  todayKey,
  WEEKDAYS_SHORT,
  yearMonthOf,
  type YearMonth,
} from '../core/time'
import { Button, IconButton } from './Button'
import { cn } from './cn'

export interface CalendarEvent {
  id: string
  startsAt: string
  endsAt: string
  title: string
  /** Вторая строка: имя ученика в календаре репетитора. */
  caption?: string
  to: string
  cancelled?: boolean
  /** Тип урока: теория и практика подсвечиваются по-разному. */
  kind?: 'theory' | 'practice' | null
}

export interface CalendarDeadline {
  id: string
  /** Момент дедлайна, ISO. */
  at: string
  title: string
  to: string
  /** Долг: дедлайн прошёл, работа не сдана. */
  overdue?: boolean
}

interface MonthCalendarProps {
  events: CalendarEvent[]
  timeZone: string
  /** Дедлайны домашних заданий: день обводится красной рамкой. */
  deadlines?: CalendarDeadline[]
}

const MAX_IN_CELL = 3

const KIND_TAG = { theory: 'Т', practice: 'П' } as const

function dotClass(event: CalendarEvent): string {
  if (event.cancelled) return 'bg-muted/50'
  return event.kind === 'practice' ? 'bg-prac' : 'bg-pen'
}

function chipClass(event: CalendarEvent, isPast: boolean): string {
  if (!event.cancelled && !isPast && event.kind === 'practice') return 'bg-prac-soft text-prac'

  if (event.cancelled) return 'bg-sunken text-muted line-through'
  return isPast ? 'bg-sunken text-muted' : 'bg-pen-soft text-pen'
}

export function MonthCalendar({ events, timeZone, deadlines = [] }: MonthCalendarProps) {
  const today = todayKey(timeZone)
  const [month, setMonth] = useState<YearMonth>(() => yearMonthOf(today))
  const [selected, setSelected] = useState(today)
  const nowIso = new Date().toISOString()

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const key = dayKey(event.startsAt, timeZone)
      map.set(key, [...(map.get(key) ?? []), event])
    }
    return map
  }, [events, timeZone])

  const deadlinesByDay = useMemo(() => {
    const map = new Map<string, CalendarDeadline[]>()
    for (const d of [...deadlines].sort((a, b) => a.at.localeCompare(b.at))) {
      const key = dayKey(d.at, timeZone)
      map.set(key, [...(map.get(key) ?? []), d])
    }
    return map
  }, [deadlines, timeZone])

  const days = monthGrid(month)
  const current = monthKey(month)
  const selectedEvents = byDay.get(selected) ?? []
  const selectedDeadlines = deadlinesByDay.get(selected) ?? []

  const goToday = () => {
    setMonth(yearMonthOf(today))
    setSelected(today)
  }

  return (
    <section className="overflow-hidden rounded-panel border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <h2 className="text-lg" aria-live="polite">
          {monthTitle(month)}
        </h2>
        <div className="flex items-center gap-1">
          <IconButton label="Предыдущий месяц" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            <CaretLeft size={20} />
          </IconButton>
          <Button size="sm" onClick={goToday}>
            Сегодня
          </Button>
          <IconButton label="Следующий месяц" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            <CaretRight size={20} />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-7 border-t border-line text-xs text-muted" aria-hidden>
        {WEEKDAYS_SHORT.map((w, i) => (
          <div key={w} className={cn('px-1 py-1.5 text-center sm:px-2.5 sm:text-left', i < 6 && 'border-r border-line')}>
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-t border-line">
        {days.map((key, i) => {
          const inMonth = key.startsWith(current)
          const list = byDay.get(key) ?? []
          const dayDeadlines = deadlinesByDay.get(key) ?? []
          const isToday = key === today
          const isSelected = key === selected
          const dayNumber = Number(key.slice(8))
          return (
            <div
              key={key}
              className={cn(
                'flex min-h-14 flex-col gap-1 border-b border-line p-1 sm:min-h-26 sm:p-1.5',
                i % 7 < 6 && 'border-r',
                i >= 35 && 'border-b-0',
                !inMonth && 'bg-bg',
                isSelected && 'bg-pen-soft/50',
                dayDeadlines.length > 0 && 'shadow-[inset_0_0_0_2px_var(--color-red)]',
              )}
            >
              <button
                type="button"
                onClick={() => setSelected(key)}
                aria-pressed={isSelected}
                aria-label={`${formatDayKey(key, true)}${list.length ? `, занятий: ${list.length}` : ''}${dayDeadlines.length ? `, дедлайнов: ${dayDeadlines.length}` : ''}`}
                className={cn(
                  'num flex size-9 items-center justify-center self-center rounded-full text-sm sm:size-7 sm:self-start',
                  isToday ? 'bg-pen font-medium text-pen-ink' : inMonth ? 'text-ink hover:bg-sunken' : 'text-muted hover:bg-sunken',
                )}
              >
                {dayNumber}
              </button>

              {list.length > 0 && (
                <span className="flex justify-center gap-0.5 sm:hidden" aria-hidden>
                  {list.slice(0, 3).map((e) => (
                    <span key={e.id} className={cn('size-1.5 rounded-full', dotClass(e))} />
                  ))}
                </span>
              )}

              <div className="hidden flex-col gap-1 sm:flex">
                {list.slice(0, MAX_IN_CELL).map((e) => (
                  <Link
                    key={e.id}
                    to={e.to}
                    className={cn('rounded-[6px] px-1.5 py-1 text-xs leading-tight', chipClass(e, e.endsAt < nowIso))}
                  >
                    <span className="num flex items-center justify-between gap-1">
                      {formatTime(e.startsAt, timeZone)}
                      {e.kind && (
                        <span className="font-sans font-semibold" title={e.kind === 'theory' ? 'Теория' : 'Практика'}>
                          {KIND_TAG[e.kind]}
                        </span>
                      )}
                    </span>
                    {e.caption && <span className="block truncate font-medium">{e.caption}</span>}
                    <span className="block truncate">{e.title}</span>
                  </Link>
                ))}
                {list.length > MAX_IN_CELL && (
                  <button type="button" onClick={() => setSelected(key)} className="px-1.5 text-left text-xs text-muted underline">
                    ещё {list.length - MAX_IN_CELL}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {(events.some((e) => e.kind) || deadlines.length > 0) && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-4 py-2.5 text-sm text-muted sm:px-5">
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-3.5 rounded-[4px] bg-pen-soft outline-1 outline-pen" />
            Теория
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-3.5 rounded-[4px] bg-prac-soft outline-1 outline-prac" />
            Практика
          </li>
          {deadlines.length > 0 && (
            <li className="flex items-center gap-2">
              <span aria-hidden className="size-3.5 rounded-[4px] border-2 border-red" />
              Дедлайн
            </li>
          )}
        </ul>
      )}

      <div className="border-t border-line px-4 py-3 sm:px-5">
        <h3 className="text-sm font-medium first-letter:uppercase">{formatDayKey(selected, true)}</h3>
        {selectedDeadlines.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {selectedDeadlines.map((d) => (
              <li key={d.id}>
                <Link to={d.to} className="flex min-h-11 items-center gap-3 rounded-control px-2 py-1.5 hover:bg-sunken">
                  <span className="num w-24 shrink-0 text-sm text-muted">до {formatTime(d.at, timeZone)}</span>
                  <span className="shrink-0 rounded-full bg-red-soft px-2 py-0.5 text-xs font-medium text-red">
                    {d.overdue ? 'Долг' : 'Дедлайн'}
                  </span>
                  <span className="min-w-0 flex-1">{d.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {selectedEvents.length === 0 ? (
          selectedDeadlines.length === 0 && <p className="mt-1 text-sm text-muted">Занятий нет</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {selectedEvents.map((e) => (
              <li key={e.id}>
                <Link
                  to={e.to}
                  className="flex min-h-11 items-center gap-3 rounded-control px-2 py-1.5 hover:bg-sunken"
                >
                  <span className="num w-24 shrink-0 text-sm text-muted">
                    {formatTime(e.startsAt, timeZone)}–{formatTime(e.endsAt, timeZone)}
                  </span>
                  {e.kind && (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                        e.kind === 'practice' ? 'bg-prac-soft text-prac' : 'bg-pen-soft text-pen',
                      )}
                    >
                      {e.kind === 'theory' ? 'Теория' : 'Практика'}
                    </span>
                  )}
                  <span className={cn('min-w-0 flex-1', e.cancelled && 'text-muted line-through')}>
                    {e.caption && <span className="font-medium">{e.caption}: </span>}
                    {e.title}
                  </span>
                  {e.cancelled && <span className="text-sm text-muted">Отменено</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
