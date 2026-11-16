import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDay, formatTime } from '../../core/time'
import {
  isArchived,
  sortHomework,
  topicLabel,
  type HomeworkSort,
  type HomeworkStatus,
  type HomeworkView,
} from '../../domain/homework'
import { lessonTitle } from '../../domain/lessons'
import { Button } from '../../ui/Button'
import { EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { useLessons } from '../shared/data'
import { HomeworkStatsPanel, scoreText, StatusBadge } from '../shared/homeworkUi'
import { useOwnData, useOwnHomework, useOwnSubmissions } from './data'

export function HomeworkRow({ view, timeZone, lesson }: { view: HomeworkView; timeZone: string; lesson: string | null }) {
  const { hw, status } = view
  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        to={`/homework/${hw.id}`}
        className={cn('flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 hover:bg-sunken sm:px-5', status === 'debt' && 'bg-red-soft/60')}
      >
        <div className="min-w-0 flex-1 basis-64">
          <p className="truncate font-medium">{hw.title}</p>
          <p className="truncate text-sm text-muted">
            {topicLabel(hw)}. Заданий: {hw.taskCount}
            {lesson ? `. Урок: ${lesson}` : ''}
          </p>
        </div>
        <div className="w-40 text-sm">
          <p className="text-muted">Дедлайн</p>
          <p className={cn('num', status === 'debt' && 'font-medium text-red')}>
            {formatDay(hw.deadline, timeZone)}, {formatTime(hw.deadline, timeZone)}
          </p>
        </div>
        <div className="w-24 text-sm">
          <p className="text-muted">Баллы</p>
          <p className="num">{scoreText(hw.score, hw.maxScore)}</p>
        </div>
        <div className="flex w-32 justify-end">
          <StatusBadge status={status} />
        </div>
      </Link>
    </li>
  )
}

type Filter = 'all' | 'open' | 'done' | 'checked' | 'debt'

const FILTERS: [Filter, string][] = [
  ['all', 'Все'],
  ['open', 'Невыполненные'],
  ['done', 'Выполненные'],
  ['checked', 'Проверенные'],
  ['debt', 'Долги'],
]

const MATCH: Record<Filter, HomeworkStatus[]> = {
  all: ['debt', 'todo', 'done', 'checked'],
  open: ['debt', 'todo'],
  done: ['done', 'checked'],
  checked: ['checked'],
  debt: ['debt'],
}

export function StudentHomeworkPage() {
  const own = useOwnData()
  const subs = useOwnSubmissions()
  const lessons = useLessons()
  const data = useOwnHomework()
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<HomeworkSort>('default')
  const [showArchive, setShowArchive] = useState(false)

  if (own.isPending || subs.isPending || lessons.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (own.isError) return <ErrorState error={own.error} onRetry={() => void own.refetch()} />
  if (subs.isError) return <ErrorState error={subs.error} onRetry={() => void subs.refetch()} />
  if (lessons.isError) return <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />
  if (!data) return null

  const { views, timeZone } = data
  const titleOf = (lessonId: string | null) => (lessonId ? lessonTitle(lessons.data, lessonId) : '')
  const matching = views.filter((v) => MATCH[filter].includes(v.status))
  const archived = matching.filter((v) => isArchived(v))
  const visible = sortHomework(showArchive ? matching : matching.filter((v) => !isArchived(v)), sort, titleOf)

  return (
    <>
      <PageHeader title="Домашние задания" />

      {views.length === 0 ? (
        <Panel>
          <EmptyState title="Заданий пока нет" description="Когда репетитор выдаст домашнее задание, оно появится здесь с дедлайном." />
        </Panel>
      ) : (
        <div className="flex flex-col gap-6">
          <HomeworkStatsPanel views={views} timeZone={timeZone} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Фильтр по статусу" className="flex flex-wrap gap-2">
              {FILTERS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    'h-11 rounded-full border px-4 text-sm font-medium transition-colors duration-150',
                    filter === value ? 'border-pen bg-pen text-pen-ink' : 'border-line bg-surface hover:bg-sunken',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              Сортировка
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as HomeworkSort)}
                className="h-11 rounded-control border border-line bg-surface px-3 text-base text-ink"
              >
                <option value="default">Сначала долги</option>
                <option value="deadline">По дедлайну</option>
                <option value="issued">По дате выдачи</option>
                <option value="lesson">По уроку</option>
                <option value="topic">По теме</option>
                <option value="status">По статусу</option>
              </select>
            </label>
          </div>

          <Panel className="overflow-hidden">
            {visible.length === 0 ? (
              <p className="px-5 py-6 text-muted">
                {archived.length > 0 ? 'Все подходящие задания в архиве.' : 'Под этот фильтр заданий нет.'}
              </p>
            ) : (
              <ul>
                {visible.map((view) => (
                  <HomeworkRow key={view.hw.id} view={view} timeZone={timeZone} lesson={titleOf(view.hw.lessonId) || null} />
                ))}
              </ul>
            )}
          </Panel>

          {archived.length > 0 && (
            <div>
              <Button onClick={() => setShowArchive((v) => !v)}>
                {showArchive ? 'Скрыть архив' : `Показать архив: ${archived.length}`}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
