import { useState, type ReactNode } from 'react'
import { monthTitle, yearMonthOf } from '../../core/time'
import {
  homeworkMonths,
  homeworkStats,
  inMonth,
  STATUS_LABEL,
  statsByTopic,
  type HomeworkStats,
  type HomeworkStatus,
  type HomeworkView,
} from '../../domain/homework'
import { Badge, Panel } from '../../ui/bits'
import { cn } from '../../ui/cn'

const STATUS_TONE = { debt: 'red', todo: 'neutral', done: 'pen', checked: 'ok' } as const

export function StatusBadge({ status }: { status: HomeworkStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
}

export function scoreText(score: number | null, maxScore: number | null): string {
  if (score !== null && maxScore !== null) return `${score} из ${maxScore}`
  if (maxScore !== null) return `до ${maxScore}`
  return 'без баллов'
}

/** Линия результатов в процентах. Ось от 0 до 100, подписи у крайних точек. */
export function TrendChart({ points }: { points: { label: string; percent: number }[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-muted">График появится после первой проверенной работы с баллами.</p>
  }
  const W = 400
  const H = 140
  const left = 30
  const top = 12
  const bottom = 22
  const innerW = W - left - 8
  const innerH = H - top - bottom
  const x = (i: number) => left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (p: number) => top + (1 - p / 100) * innerH
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.percent).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  const summary =
    points.length === 1
      ? `Одна проверенная работа: ${last.percent}%`
      : `Результат по ${points.length} работам: от ${points[0].percent}% к ${last.percent}%`
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="block h-auto w-full">
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={left} x2={W} y1={y(v)} y2={y(v)} className="stroke-line" />
            <text x={left - 6} y={y(v) + 4} textAnchor="end" className="num fill-muted text-[11px]">
              {v}
            </text>
          </g>
        ))}
        {points.length > 1 && (
          <path d={path} fill="none" className="stroke-pen" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.percent)} r={i === points.length - 1 ? 4.5 : 3} className="fill-pen">
            <title>{`${p.label}: ${p.percent}%`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="mt-1 text-sm text-muted">{summary}</figcaption>
    </figure>
  )
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'red' }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={cn('num text-xl', tone === 'red' && 'text-red')}>{value}</dd>
    </div>
  )
}

function StatsGrid({ stats }: { stats: HomeworkStats }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
      <Stat label="Выдано" value={stats.issued} />
      <Stat label="Выполнено" value={stats.done} />
      <Stat label="Не выполнено" value={stats.notDone} />
      <Stat label="Долги" value={stats.debts} tone={stats.debts > 0 ? 'red' : undefined} />
      <Stat label="Баллы" value={stats.maxSum > 0 ? `${stats.scoreSum} из ${stats.maxSum}` : 'пока нет'} />
      <Stat label="Средний результат" value={stats.averagePercent === null ? 'пока нет' : `${stats.averagePercent}%`} />
    </dl>
  )
}

type Mode = 'all' | 'month' | 'topic'

const MODES: [Mode, string][] = [
  ['all', 'За всё время'],
  ['month', 'За месяц'],
  ['topic', 'По темам'],
]

export function HomeworkStatsPanel({ views, timeZone }: { views: HomeworkView[]; timeZone: string }) {
  const [mode, setMode] = useState<Mode>('all')
  const months = homeworkMonths(views, timeZone)
  const [month, setMonth] = useState('')
  const activeMonth = month || months[0] || ''
  const scoped = mode === 'month' && activeMonth ? views.filter((v) => inMonth(v, activeMonth, timeZone)) : views
  const stats = homeworkStats(scoped)

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-lg">Статистика</h2>
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'month' && months.length > 0 && (
            <select
              aria-label="Месяц"
              value={activeMonth}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 rounded-control border border-line bg-surface px-2 text-sm"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthTitle(yearMonthOf(m + '-01'))}
                </option>
              ))}
            </select>
          )}
          <div role="group" aria-label="Режим статистики" className="flex gap-1 rounded-control bg-sunken p-1">
            {MODES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  'h-9 rounded-[6px] px-3 text-sm font-medium transition-colors duration-150',
                  mode === value ? 'bg-surface text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === 'topic' ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th scope="col" className="px-4 py-2 font-normal sm:px-5">Тема</th>
                <th scope="col" className="px-3 py-2 font-normal">Выдано</th>
                <th scope="col" className="px-3 py-2 font-normal">Выполнено</th>
                <th scope="col" className="px-3 py-2 font-normal">Долги</th>
                <th scope="col" className="px-3 py-2 font-normal">Баллы</th>
                <th scope="col" className="px-4 py-2 font-normal sm:px-5">Результат</th>
              </tr>
            </thead>
            <tbody>
              {statsByTopic(views).map(({ topic, stats: s }) => (
                <tr key={topic} className="border-t border-line">
                  <th scope="row" className="px-4 py-2.5 text-left font-medium sm:px-5">{topic}</th>
                  <td className="num px-3 py-2.5">{s.issued}</td>
                  <td className="num px-3 py-2.5">{s.done}</td>
                  <td className={cn('num px-3 py-2.5', s.debts > 0 && 'text-red')}>{s.debts}</td>
                  <td className="num px-3 py-2.5">{s.maxSum > 0 ? `${s.scoreSum} из ${s.maxSum}` : 'нет'}</td>
                  <td className="num px-4 py-2.5 sm:px-5">{s.averagePercent === null ? 'нет' : `${s.averagePercent}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid md:grid-cols-2">
          <div className="p-4 sm:p-5">
            <StatsGrid stats={stats} />
          </div>
          <div className="border-t border-line p-4 sm:p-5 md:border-t-0 md:border-l">
            <p className="mb-2 text-sm text-muted">Результат по проверенным работам, %</p>
            <TrendChart points={stats.trend} />
          </div>
        </div>
      )}
    </Panel>
  )
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Текст с переносами строк, в котором адреса становятся ссылками. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return (
    <p className="max-w-[65ch] break-words whitespace-pre-line">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="text-pen underline">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  )
}
