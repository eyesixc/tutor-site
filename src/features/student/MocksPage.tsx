import { CaretLeft } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatDayKey } from '../../core/time'
import { mocksStats, mockTotals, sortMocks, taskKind } from '../../domain/mocks'
import { Button } from '../../ui/Button'
import { EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../../ui/bits'
import { cn } from '../../ui/cn'
import { MockScore, MocksStatsPanel, SecondaryScore, TaskStrip } from '../shared/mocksUi'
import { useOwnData } from './data'

function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-40" />
      <Skeleton className="h-64" />
    </div>
  )
}

export function StudentMocksPage() {
  const own = useOwnData()
  if (own.isPending) return <Loading />
  if (own.isError) return <ErrorState error={own.error} onRetry={() => void own.refetch()} />

  const mocks = sortMocks(own.data.mockExams)
  const stats = mocksStats(mocks)

  return (
    <>
      <PageHeader title="Пробники" />
      {mocks.length === 0 ? (
        <Panel>
          <EmptyState title="Пробников пока нет" description="После первого пробника здесь появятся результаты по каждому заданию и статистика ошибок." />
        </Panel>
      ) : (
        <div className="flex flex-col gap-6">
          <Panel className="overflow-hidden">
            <ul>
              {mocks.map((mock) => {
                const totals = mockTotals(mock)
                return (
                  <li key={mock.id} className="border-b border-line last:border-b-0">
                    <Link to={`/mocks/${mock.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 hover:bg-sunken sm:px-5">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="truncate font-medium">{mock.title}</p>
                        {mock.comment && <p className="truncate text-sm text-muted">{mock.comment}</p>}
                      </div>
                      <p className="num w-32 text-sm">{formatDayKey(mock.date)}</p>
                      <div className="w-28">
                        <MockScore mock={mock} />
                      </div>
                      <div className="flex w-40 items-center gap-2.5">
                        <span aria-hidden className="h-2 flex-1 bg-sunken">
                          <span className="block h-full bg-pen" style={{ width: `${totals.percent ?? 0}%` }} />
                        </span>
                        <span className="num w-11 text-right text-sm">{totals.percent === null ? '' : `${totals.percent}%`}</span>
                      </div>
                      <div className="w-20 text-right">
                        <SecondaryScore mock={mock} />
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Panel>
          <MocksStatsPanel stats={stats} />
        </div>
      )}
    </>
  )
}

export function StudentMockPage() {
  const { mockId = '' } = useParams()
  const navigate = useNavigate()
  const own = useOwnData()
  const [showAll, setShowAll] = useState(false)

  if (own.isPending) return <Loading />
  if (own.isError) return <ErrorState error={own.error} onRetry={() => void own.refetch()} />
  const mock = own.data.mockExams.find((m) => m.id === mockId)
  if (!mock) {
    return <ErrorState error={new Error('Пробник не найден. Возможно, репетитор его удалил.')} onRetry={() => navigate('/mocks')} />
  }

  const totals = mockTotals(mock)
  const graded = totals.percent !== null
  const lost = mock.tasks.filter((t) => t.score !== null && t.score < t.maxScore)
  const rows = showAll ? mock.tasks : lost

  return (
    <>
      <Link to="/mocks" className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm text-pen">
        <CaretLeft size={16} aria-hidden /> Все пробники
      </Link>
      <PageHeader
        title={mock.title}
        description={formatDayKey(mock.date, false, true)}
        action={
          graded ? (
            <div className="text-right">
              <MockScore mock={mock} large />
              <p className="text-sm text-muted">
                {totals.secondary === null ? `${totals.percent}% первичных баллов` : `${totals.secondary} тестовых баллов`}
              </p>
            </div>
          ) : (
            <span className="text-muted">Ещё не проверен</span>
          )
        }
      />

      <div className="flex flex-col gap-6">
        <Panel className="flex flex-col gap-3 p-4 sm:p-5">
          <h2 className="text-lg">Задания</h2>
          <TaskStrip tasks={mock.tasks} />
        </Panel>

        {graded && (
          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <h2 className="text-lg">{showAll ? 'Все задания' : 'Где потеряны баллы'}</h2>
              <Button size="sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Только с потерями' : `Показать все ${mock.tasks.length}`}
              </Button>
            </div>
            {rows.length === 0 ? (
              <p className="border-t border-line px-4 py-4 text-muted sm:px-5">Потерь нет: все проверенные задания на полный балл.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="text-left text-muted">
                      <th scope="col" className="w-14 border-t border-line px-4 py-2 font-normal sm:px-5">№</th>
                      <th scope="col" className="border-t border-line px-3 py-2 font-normal">Тема</th>
                      <th scope="col" className="w-20 border-t border-line px-3 py-2 font-normal">Балл</th>
                      <th scope="col" className="border-t border-line px-4 py-2 font-normal sm:px-5">Комментарий репетитора</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((task) => {
                      const kind = taskKind(task)
                      return (
                        <tr key={task.number}>
                          <td className="num border-t border-line px-4 py-2.5 sm:px-5">{task.number}</td>
                          <td className="border-t border-line px-3 py-2.5">{task.topic}</td>
                          <td
                            className={cn(
                              'num border-t border-line px-3 py-2.5 font-medium',
                              kind === 'zero' && 'text-red',
                              kind === 'partial' && 'text-warn',
                              kind === 'full' && 'text-ok',
                              kind === 'unscored' && 'text-muted',
                            )}
                          >
                            {task.score === null ? 'нет' : `${task.score}/${task.maxScore}`}
                          </td>
                          <td className="border-t border-line px-4 py-2.5 text-muted sm:px-5">{task.comment}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}

        {mock.comment && (
          <Panel className="p-4 sm:p-5">
            <h2 className="text-lg">Комментарий к пробнику</h2>
            <p className="mt-2 max-w-[65ch] whitespace-pre-line">{mock.comment}</p>
          </Panel>
        )}
      </div>
    </>
  )
}
