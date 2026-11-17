import type { ReactNode } from 'react'
import { mockTotals, SECONDARY_MIN, taskKind, type LossRow, type MocksStats, type TaskKind } from '../../domain/mocks'
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

/** Тестовый балл пробника: число и пометка, если он ниже минимального. */
export function SecondaryScore({ mock, large }: { mock: MockExam; large?: boolean }) {
  const { secondary } = mockTotals(mock)
  if (secondary === null) return null
  const low = secondary < SECONDARY_MIN
  return (
    <span className={cn('num', large ? 'text-2xl' : 'text-lg', low && 'text-red')} title={low ? `Ниже минимума ${SECONDARY_MIN}` : undefined}>
      {secondary}
      <span className="text-sm text-muted"> тест.</span>
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

      {stats.secondaryCount > 0 && (
        <Panel>
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <h2 className="text-lg">Тестовые баллы</h2>
            <p className="mt-0.5 text-sm text-muted">
              Первичные баллы, переведённые по шкале ЕГЭ по информатике. Минимальный тестовый балл — {SECONDARY_MIN}
            </p>
          </div>
          <div className="grid md:grid-cols-2">
            <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-4 p-4 sm:p-5">
              <Stat label="Последний пробник" value={stats.lastSecondary} />
              <Stat label="Средний" value={stats.averageSecondary} />
              <Stat label="Лучший" value={stats.bestSecondary} />
              <Stat
                label={`Не ниже ${SECONDARY_MIN}`}
                value={
                  <span className={stats.aboveMin < stats.secondaryCount ? 'text-red' : 'text-ok'}>
                    {stats.aboveMin} из {stats.secondaryCount}
                  </span>
                }
              />
            </dl>
            <div className="border-t border-line p-4 sm:p-5 md:border-t-0 md:border-l">
              <p className="mb-2 text-sm text-muted">Тестовый балл по пробникам, из 100</p>
              <TrendChart points={stats.secondaryTrend} unit=" б." threshold={{ value: SECONDARY_MIN, label: `минимум ${SECONDARY_MIN}` }} />
            </div>
          </div>
        </Panel>
      )}

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

/** Главный блок пробника: тестовый балл, шкала 0–100 с минимумом и сравнение с прошлым пробником. */
export function MockScorePanel({ mock, previous, average }: { mock: MockExam; previous: MockExam | null; average: number | null }) {
  const totals = mockTotals(mock)
  if (totals.percent === null) {
    return (
      <Panel className="p-5">
        <p className="text-muted">Баллы ещё не выставлены.</p>
      </Panel>
    )
  }
  const value = totals.secondary
  const prev = previous ? mockTotals(previous) : null
  const delta = value !== null && prev?.secondary != null ? value - prev.secondary : prev ? totals.percent - (prev.percent ?? 0) : null
  const unit = value !== null ? '' : ' п.п.'
  return (
    <Panel className="grid overflow-hidden md:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-1.5 border-b border-line p-5 md:border-r md:border-b-0 sm:p-6">
        <span className="text-sm text-muted">{value !== null ? 'Тестовый балл' : 'Результат'}</span>
        <span className={cn('num text-[4.5rem] leading-none font-medium', value !== null && value < SECONDARY_MIN && 'text-red')}>
          {value ?? `${totals.percent}%`}
        </span>
        <span className="num text-sm text-muted">
          {totals.score} из {totals.max} первичных
        </span>
        {delta !== null && previous && (
          <span
            className={cn(
              'num mt-2 self-start rounded-full px-2.5 py-0.5 text-sm',
              delta > 0 ? 'bg-ok-soft text-ok' : delta < 0 ? 'bg-red-soft text-red' : 'bg-sunken text-muted',
            )}
          >
            {delta > 0 ? '+' : delta < 0 ? '−' : '±'}
            {Math.abs(delta)}
            {unit} к «{previous.title}»
          </span>
        )}
      </div>
      {value !== null ? (
        <div className="flex flex-col justify-center gap-4 p-5 sm:p-6">
          <span className="text-sm text-muted">Шкала от 0 до 100</span>
          <div className="relative h-14" role="img" aria-label={`${value} из 100, минимум ${SECONDARY_MIN}`}>
            <span className="absolute inset-x-0 top-[18px] h-3.5 rounded-full bg-sunken" />
            <span className="absolute left-0 top-[18px] h-3.5 rounded-l-full bg-red-soft" style={{ width: `${SECONDARY_MIN}%` }} />
            <span className="absolute left-0 top-[18px] h-3.5 rounded-full bg-pen" style={{ width: `${value}%` }} />
            <span className="absolute top-2.5 h-7.5 w-0.5 bg-red" style={{ left: `${SECONDARY_MIN}%` }} />
            <span className="absolute top-11 -translate-x-1/2 text-xs whitespace-nowrap text-red" style={{ left: `${SECONDARY_MIN}%` }}>
              минимум {SECONDARY_MIN}
            </span>
            <span className="num absolute top-0 -translate-x-1/2 text-xs text-pen" style={{ left: `${value}%` }}>
              {value}
            </span>
          </div>
          <p className="text-sm text-muted">
            {value >= SECONDARY_MIN ? (
              <>
                Выше минимума на <span className="num text-ink">{value - SECONDARY_MIN}</span>.
              </>
            ) : (
              <>
                Ниже минимума на <span className="num text-red">{SECONDARY_MIN - value}</span>.
              </>
            )}
            {average !== null && (
              <>
                {' '}
                Средний по всем пробникам: <span className="num text-ink">{average}</span>.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="flex items-center p-5 text-sm text-muted sm:p-6">
          В этом пробнике не 29 первичных баллов, поэтому перевести в тестовые нельзя.
        </div>
      )}
    </Panel>
  )
}

/** Номера заданий, которые стоит подтянуть в первую очередь. */
export function FocusList({ rows }: { rows: LossRow[] }) {
  return (
    <Panel className="flex flex-col gap-1 p-4 sm:p-5">
      <h2 className="text-lg">Что подтянуть в первую очередь</h2>
      <p className="text-sm text-muted">Задания, где баллы теряются чаще всего</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-muted">Потерь нет: все задания на полный балл.</p>
      ) : (
        <ul className="mt-2">
          {rows.map((row) => {
            const always = row.times === row.attempts
            return (
              <li key={row.key} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-line py-2.5">
                <span className={cn('num font-medium', always ? 'text-red' : 'text-warn')}>{row.label}</span>
                <span className="truncate">{row.topic}</span>
                <span className="num text-sm">
                  {row.times} из {row.attempts}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
