import { VideoCamera } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '../../core/auth/session'
import { zoneLabel } from '../../core/time'
import { loadOwnTutorFile } from '../../domain/students'
import { buttonClass } from '../../ui/Button'
import { ErrorState, Panel, Skeleton } from '../../ui/bits'

export function useOwnData() {
  const session = useSession()
  return useQuery({ queryKey: ['own', session.bundle.userId], queryFn: () => loadOwnTutorFile(session) })
}

export function StudentHomePage() {
  const own = useOwnData()

  if (own.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-24" />
      </div>
    )
  }
  if (own.isError) return <ErrorState error={own.error} onRetry={() => void own.refetch()} />

  const { profile } = own.data
  const firstName = profile.name.split(/\s+/)[0]

  return (
    <>
      <h1 className="text-xl sm:text-2xl">Привет, {firstName}</h1>
      <p className="mt-1 text-muted">Время показано в твоём часовом поясе: {zoneLabel(profile.timezone)}.</p>

      <Panel className="mt-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-lg">Урок проходит в Яндекс Телемосте</h2>
          <p className="mt-1 text-sm text-muted">
            {profile.telemostUrl
              ? 'Ссылка постоянная, она не меняется от урока к уроку.'
              : 'Репетитор ещё не добавил ссылку. Она появится здесь.'}
          </p>
        </div>
        {profile.telemostUrl && (
          <a href={profile.telemostUrl} target="_blank" rel="noreferrer" className={buttonClass('primary')}>
            <VideoCamera size={20} weight="fill" aria-hidden />
            Подключиться к уроку
          </a>
        )}
      </Panel>
    </>
  )
}
