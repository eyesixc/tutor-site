import { MagnifyingGlass } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { dayKey, formatDayKey, formatTimeRange, monthTitle, todayKey, yearMonthOf } from '../../core/time'
import { findLesson, sortByStart } from '../../domain/lessons'
import { inputClass } from '../../ui/Field'
import { Badge, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { useLessons } from '../shared/data'
import { useOwnData } from './HomePage'

export function StudentLessonsPage() {
  const own = useOwnData()
  const lessons = useLessons()
  const [query, setQuery] = useState('')
  const [month, setMonth] = useState('')
  const [topic, setTopic] = useState('')

  const tz = own.data?.profile.timezone ?? 'UTC'

  const rows = useMemo(() => {
    const list = sortByStart(own.data?.sessions ?? []).reverse()
    return list.map((s) => {
      const lesson = findLesson(lessons.data, s.lessonId)
      const key = dayKey(s.startsAt, tz)
      return { session: s, lesson, key, month: key.slice(0, 7) }
    })
  }, [own.data, lessons.data, tz])

  if (own.isPending || lessons.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-11 max-w-md" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (own.isError) return <ErrorState error={own.error} onRetry={() => void own.refetch()} />
  if (lessons.isError) return <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />

  const months = [...new Set(rows.map((r) => r.month))]
  const topics = [...new Set(rows.map((r) => r.lesson?.topic).filter((t): t is string => !!t))].sort((a, b) =>
    a.localeCompare(b, 'ru'),
  )
  const needle = query.trim().toLowerCase()
  const filtered = rows.filter(
    (r) =>
      (!month || r.month === month) &&
      (!topic || r.lesson?.topic === topic) &&
      (!needle || (r.lesson?.title ?? '').toLowerCase().includes(needle)),
  )
  const groups = [...new Set(filtered.map((r) => r.month))].map((m) => ({
    month: m,
    rows: filtered.filter((r) => r.month === m),
  }))
  const today = todayKey(tz)
  const nowIso = new Date().toISOString()
  const selectClass = cn(inputClass, 'pr-8')

  return (
    <>
      <PageHeader title="Уроки" description="Все твои занятия с материалами." />

      {rows.length === 0 ? (
        <Panel>
          <EmptyState title="Уроков пока нет" description="Когда репетитор назначит занятие, оно появится здесь и в календаре на главной." />
        </Panel>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_14rem]">
            <label className="relative block">
              <span className="sr-only">Поиск по названию</span>
              <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по названию"
                className={cn(inputClass, 'pl-10')}
              />
            </label>
            <select aria-label="Месяц" value={month} onChange={(e) => setMonth(e.target.value)} className={selectClass}>
              <option value="">Все месяцы</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthTitle(yearMonthOf(m + '-01'))}
                </option>
              ))}
            </select>
            <select aria-label="Тема" value={topic} onChange={(e) => setTopic(e.target.value)} className={selectClass}>
              <option value="">Все темы</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {groups.length === 0 ? (
            <Panel>
              <p className="px-5 py-6 text-muted">Под эти условия уроков не нашлось. Измени поиск или фильтры.</p>
            </Panel>
          ) : (
            <div className="flex flex-col gap-6">
              {groups.map((group) => (
                <section key={group.month}>
                  <h2 className="mb-3 text-lg">{monthTitle(yearMonthOf(group.month + '-01'))}</h2>
                  <Panel className="overflow-hidden">
                    <ul>
                      {group.rows.map(({ session, lesson, key }) => {
                        const cancelled = session.status === 'cancelled'
                        const isToday = key === today && !cancelled
                        const future = session.startsAt > nowIso && !cancelled
                        return (
                          <li key={session.id} className="border-b border-line last:border-b-0">
                            <Link
                              to={`/lessons/${session.id}`}
                              className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 hover:bg-sunken sm:px-5"
                            >
                              <div className="w-32 shrink-0">
                                <p className={cn('num text-sm font-medium', isToday ? 'text-pen' : cancelled && 'text-muted')}>
                                  {formatDayKey(key)}
                                </p>
                                <p className="num text-sm text-muted">{formatTimeRange(session.startsAt, session.endsAt, tz)}</p>
                              </div>
                              <div className="min-w-0 flex-1 basis-64">
                                <p className={cn('truncate font-medium', cancelled && 'text-muted line-through')}>
                                  {lesson?.title ?? 'Урок удалён из библиотеки'}
                                </p>
                                <p className="truncate text-sm text-muted">
                                  {lesson?.description || lesson?.topic || 'Описание появится позже'}
                                </p>
                              </div>
                              {cancelled ? (
                                <Badge>Отменён</Badge>
                              ) : isToday ? (
                                <Badge tone="pen">Сегодня</Badge>
                              ) : future ? (
                                <Badge>Впереди</Badge>
                              ) : null}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </Panel>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
