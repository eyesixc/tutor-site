import { CheckCircle, XCircle } from '@phosphor-icons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSession } from '../../core/auth/session'
import { diskInfo, formatBytes, runDiskCheck } from '../../core/disk'
import { isLocalRepo } from '../../core/storage'
import { getRateLimit } from '../../core/storage/github'
import { listStudents } from '../../domain/students'
import { useOverview } from '../shared/data'
import { useSharedFiles } from '../shared/filesUi'
import { Button } from '../../ui/Button'
import { Badge, errorMessage, PageHeader, Panel, Skeleton } from '../../ui/bits'

function Row({ title, status, children }: { title: string; status: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line px-5 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {status}
      </div>
      <div className="text-sm text-muted">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const session = useSession()
  const { bundle } = session
  const local = isLocalRepo(bundle.dataRepo)

  const students = useQuery({ queryKey: ['students'], queryFn: () => listStudents(session) })
  const github = useQuery({
    queryKey: ['github-rate'],
    queryFn: () => getRateLimit(bundle.githubToken),
    enabled: !local,
  })
  const disk = useQuery({
    queryKey: ['disk-info'],
    queryFn: () => diskInfo(bundle.diskToken),
    enabled: !!bundle.diskToken,
  })
  const check = useMutation({ mutationFn: () => runDiskCheck(bundle.diskToken) })
  const shared = useSharedFiles()
  const overview = useOverview()
  const personal = Object.values(overview.data?.files ?? {})
    .flatMap((f) => f.files ?? [])
    .concat(Object.values(overview.data?.subs ?? {}).flatMap((f) => f.files ?? []))
  const allFiles = [...(shared.data ?? []), ...personal]
  const inRepo = allFiles.filter((f) => f.store === 'github')
  const repoBytes = inRepo.reduce((sum, f) => sum + f.size, 0)
  const REPO_SOFT_LIMIT = 1024 * 1024 * 1024

  const used = disk.data ? disk.data.usedSpace / disk.data.totalSpace : 0

  return (
    <>
      <PageHeader title="Настройки" description="Состояние хранилищ и подключённых сервисов." />

      <Panel>
        <Row
          title="Ученики"
          status={students.isPending ? <Skeleton className="h-6 w-16" /> : <Badge>{students.data?.length ?? 0} из 10</Badge>}
        >
          Платформа рассчитана на 10 учеников. Больше создать можно, ограничение не техническое.
        </Row>

        <Row
          title="Файлы"
          status={
            shared.isPending || overview.isPending ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <Badge tone={repoBytes > REPO_SOFT_LIMIT * 0.8 ? 'warn' : 'neutral'}>{allFiles.length} шт.</Badge>
            )
          }
        >
          В репозитории: <span className="num text-ink">{inRepo.length}</span> файлов,{' '}
          <span className="num text-ink">{formatBytes(repoBytes)}</span> из рекомендованного 1 ГБ. На Диске:{' '}
          <span className="num text-ink">{allFiles.length - inRepo.length}</span> файлов. Общих:{' '}
          <span className="num text-ink">{shared.data?.length ?? 0}</span>, личных:{' '}
          <span className="num text-ink">{personal.length}</span>.
          {repoBytes > REPO_SOFT_LIMIT * 0.8 && ' Репозиторий близок к рекомендованному пределу: удалите ненужные файлы.'}
        </Row>

        <Row
          title="GitHub: данные и сайт"
          status={
            local ? (
              <Badge tone="warn">Локальный режим</Badge>
            ) : github.isPending ? (
              <Skeleton className="h-6 w-24" />
            ) : github.isError ? (
              <Badge tone="red">Ошибка</Badge>
            ) : (
              <Badge tone="ok">Подключено</Badge>
            )
          }
        >
          {local ? (
            'Данные хранятся в этом браузере. Режим только для разработки.'
          ) : github.isError ? (
            errorMessage(github.error)
          ) : (
            <>
              Данные: <span className="num text-ink">{bundle.dataRepo}</span>
              {bundle.role === 'admin' && (
                <>
                  , сайт: <span className="num text-ink">{bundle.siteRepo}</span>
                </>
              )}
              {github.data && (
                <>
                  . Осталось запросов в этом часе:{' '}
                  <span className="num text-ink">
                    {github.data.remaining} из {github.data.limit}
                  </span>
                </>
              )}
            </>
          )}
        </Row>

        <Row
          title="Яндекс Диск: файлы"
          status={
            !bundle.diskToken ? (
              <Badge tone="warn">Не подключён</Badge>
            ) : disk.isPending ? (
              <Skeleton className="h-6 w-24" />
            ) : disk.isError ? (
              <Badge tone="red">Ошибка</Badge>
            ) : (
              <Badge tone={used > 0.9 ? 'red' : used > 0.75 ? 'warn' : 'ok'}>Подключён</Badge>
            )
          }
        >
          {!bundle.diskToken ? (
            'Токен Диска не задан. Загрузка файлов и видео недоступна.'
          ) : disk.isError ? (
            errorMessage(disk.error)
          ) : disk.data ? (
            <div className="flex flex-col gap-3">
              <p>
                Занято{' '}
                <span className="num text-ink">
                  {formatBytes(disk.data.usedSpace)} из {formatBytes(disk.data.totalSpace)}
                </span>
                {used > 0.9
                  ? '. Место почти закончилось: освободите Диск, иначе загрузка файлов перестанет работать.'
                  : used > 0.75
                    ? '. Свободного места осталось меньше четверти.'
                    : ''}
              </p>
              <div
                className="h-2 overflow-hidden rounded-full bg-sunken"
                role="progressbar"
                aria-label="Заполненность Диска"
                aria-valuenow={Math.round(used * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={used > 0.9 ? 'h-full bg-red' : used > 0.75 ? 'h-full bg-warn' : 'h-full bg-pen'}
                  style={{ width: `${Math.max(used * 100, 1)}%` }}
                />
              </div>
              <div>
                <Button size="sm" onClick={() => check.mutate()} loading={check.isPending}>
                  Проверить работу Диска
                </Button>
              </div>
              {check.isError && <p className="text-red">{errorMessage(check.error)}</p>}
              {check.data && (
                <ul className="flex flex-col gap-2">
                  {check.data.map((step) => (
                    <li key={step.name} className="flex items-start gap-2">
                      {step.ok ? (
                        <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-ok" aria-label="Успешно" />
                      ) : (
                        <XCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-red" aria-label="Ошибка" />
                      )}
                      <span>
                        <span className="text-ink">{step.name}.</span> {step.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </Row>
      </Panel>
    </>
  )
}
