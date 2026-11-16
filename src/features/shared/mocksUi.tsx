import type { ReactNode } from 'react'
import { mockTotals, taskKind, type LossRow, type MocksStats, type TaskKind } from '../../domain/mocks'
import type { MockExam, MockExamTask } from '../../domain/types'
import { Panel } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { TrendChart } from './homeworkUi'

// Клетка задания: цвет и рисунок границы различают результат не только цветом.
const KIND_CELL: Record<TaskKind, string> = {
  full: 'bg-ok-soft text-ok',
  partial: 'bg-warn-soft text-warn outline-1 -outline-offset-4 outline-dashed outline-warn',
  zero: 'bg-red text-surface',
  unscored: 'bg-surface text-muted',
}

const KIND_LABEL: Record<TaskKind, string> = {
  full: 'полный балл',
  partial: 'частично',
  zero: 'ноль',
  unscored: 'не проверено',
}

const STRIP = 'grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] border-t border-l border-line'
const CELL = 'flex h-16 flex-col items-center justify-center gap-0.5 border-r border-b border-line'

function Legend({ items }: { items: [string, string, ReactNode][] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      {items.map(([swatch, label, value]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-3.5 shrink-0', swatch)} />
          {label}
          {value !== null && <span className="num text-ink">{value}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Лента заданий одного пробника: номер и балл в каждой клетке. */
export function TaskStrip({ tasks }: { tasks: MockExamTask[] }) {
  const count = (kind: TaskKind) => tasks.filter((t) => taskKind(t) === kind).length
  return (
    <div className="flex flex-col gap-3">
      <Legend
        items={[
          ['bg-ok-soft border border-ok', 'Полный балл:', count('full')],
          ['bg-warn-soft border border-dashed border-warn', 'Частично:', count('partial')],
          ['bg-red', 'Ноль:', count('zero')],
          ...(count('unscored') > 0
            ? ([['bg-surface border border-line', 'Не проверено:', count('unscored')]] as [string, string, ReactNode][])
            : []),
        ]}
      />
      <ol className={STRIP}>
        {tasks.map((task) => {
          const kind = taskKind(task)
          return (
            <li
              key={task.number}
              title={task.topic}
              aria-label={`Задание ${task.number}, ${task.topic}: ${KIND_LABEL[kind]}`}
              className={cn(CELL, KIND_CELL[kind])}
            >
              <span className="num text-lg font-medium">{task.number}</span>
              <span className="num text-xs">
                {task.score === null ? '·' : task.score}/{task.maxScore}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Лента ошибок по номерам за все пробники. */
export function LossStrip({ rows }: { rows: LossRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <Legend
        items={[
          ['bg-surface border border-line', 'Без потерь', null],
          ['bg-red-soft border border-red', 'Иногда', null],
          ['bg-red', 'Каждый раз', null],
        ]}
      />
      <ol className={STRIP}>
        {rows.map((row) => {
          const always = row.times > 0 && row.times === row.attempts
          return (
            <li
              key={row.key}
              aria-label={`Задание ${row.label}: баллы потеряны в ${row.times} из ${row.attempts} пробников`}
              className={cn(
                CELL,
                row.times === 0
                  ? 'bg-surface text-muted'
                  : always
                    ? 'bg-red text-surface'
                    : 'bg-red-soft text-red outline-1 -outline-offset-4 outline-red',
              )}
            >
              <span className="num text-lg font-medium">{row.label}</span>
              <span className="num text-xs">
                {row.times}/{row.attempts}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function MockScore({ mock, large }: { mock: MockExam; large?: boolean }) {
  const totals = mockTotals(mock)
  if (totals.percent === null) return <span className="text-sm text-muted">Не проверен</span>
  return (
    <span className={cn('num', large ? 'text-2xl' : 'text-lg')}>
      {totals.score} <span className="text-muted">из {totals.max}</span>
    </span>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="num text-xl">{value}</dd>
    </div>
  )
}

export function MocksStatsPanel({ stats }: { stats: MocksStats }) {
  if (stats.count === 0) return null
  return (
    <>
      <Panel>
        <h2 className="border-b border-line px-4 py-3 text-lg sm:px-5">Статистика</h2>
        <div className="grid md:grid-cols-2">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:p-5">
            <Stat label="Написано пробников" value={stats.count} />
            <Stat label="Сумма баллов" value={`${stats.scoreSum} из ${stats.maxSum}`} />
            <Stat label="Средний результат" value={`${stats.averagePercent}%`} />
            <Stat label="Лучший результат" value={`${stats.bestPercent}%`} />
            <Stat label="На полный балл" value={<span className="text-ok">{stats.full}</span>} />
            <Stat
              label="Частично и ноль"
              value={
                <>
                  <span className="text-warn">{stats.partial}</span> и <span className="text-red">{stats.zero}</span>
                </>
              }
            />
          </dl>
          <div className="border-t border-line p-4 sm:p-5 md:border-t-0 md:border-l">
            <p className="mb-2 text-sm text-muted">Результат по пробникам, % от максимума</p>
            <TrendChart points={stats.trend} />
          </div>
        </div>
      </Panel>

      <Panel className="flex flex-col gap-3 p-4 sm:p-5">
        <div>
          <h2 className="text-lg">Ошибки по номерам</h2>
          <p className="mt-0.5 text-sm text-muted">Под номером: в скольких пробниках из написанных потеряны баллы</p>
        </div>
        <LossStrip rows={stats.byNumber} />
      </Panel>

      {stats.byTopic.length > 0 && (
        <Panel className="p-4 sm:p-5">
          <h2 className="mb-3 text-lg">Ошибки по темам</h2>
          <ul className="grid gap-x-8 gap-y-2 md:grid-cols-2">
            {stats.byTopic.map((row) => (
              <li key={row.key} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                <span aria-hidden className="h-2 w-24 shrink-0 bg-sunken">
                  <span className="block h-full bg-red" style={{ width: `${(row.lostPoints / row.maxPoints) * 100}%` }} />
                </span>
                <span className="num w-24 shrink-0 text-right">
                  −{row.lostPoints} из {row.maxPoints}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  )
}
