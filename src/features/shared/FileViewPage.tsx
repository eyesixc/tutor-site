import { CaretLeft, DownloadSimple } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useSession } from '../../core/auth/session'
import { fromB64, type Bytes } from '../../core/crypto'
import { formatBytes } from '../../core/disk'
import { diskUrl, downloadFile, fileKind, fileTitle, loadBlob } from '../../domain/files'
import type { FileMeta } from '../../domain/types'
import { Button } from '../../ui/Button'
import { ErrorState, errorMessage, Skeleton } from '../../ui/bits'
import { useOwnData, useOwnSubmissions } from '../student/data'
import { useOverview } from './data'
import { useSharedFiles } from './filesUi'

interface Resolved {
  meta: FileMeta | undefined
  key: Bytes | undefined
  pending: boolean
  error: unknown
}

function useSharedRef(id: string): Resolved {
  const files = useSharedFiles()
  return { meta: files.data?.find((f) => f.id === id), key: undefined, pending: files.isPending, error: files.error }
}

function useOwnRef(id: string): Resolved {
  const session = useSession()
  const own = useOwnData()
  const subs = useOwnSubmissions()
  const all = [...(own.data?.files ?? []), ...(subs.data?.files ?? [])]
  return {
    meta: all.find((f) => f.id === id),
    key: session.key,
    pending: own.isPending || subs.isPending,
    error: own.error ?? subs.error,
  }
}

function useStudentRef(studentId: string, id: string): Resolved {
  const overview = useOverview()
  const all = [...(overview.data?.files[studentId]?.files ?? []), ...(overview.data?.subs[studentId]?.files ?? [])]
  const key = overview.data?.keys[studentId]
  return {
    meta: all.find((f) => f.id === id),
    key: key ? fromB64(key) : undefined,
    pending: overview.isPending,
    error: overview.error,
  }
}

function Video({ meta, src }: { meta: FileMeta; src: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const storageKey = `tutor:video:${meta.id}`

  // Позиция просмотра запоминается на этом устройстве.
  useEffect(() => {
    const video = ref.current
    if (!video) return
    const restore = () => {
      const saved = Number(localStorage.getItem(storageKey))
      if (saved > 5 && saved < video.duration - 10) video.currentTime = saved
    }
    let last = 0
    const save = () => {
      if (Math.abs(video.currentTime - last) < 5) return
      last = video.currentTime
      try {
        localStorage.setItem(storageKey, String(Math.floor(video.currentTime)))
      } catch {
        // Без хранилища позиция просто не запомнится.
      }
    }
    video.addEventListener('loadedmetadata', restore)
    video.addEventListener('timeupdate', save)
    return () => {
      video.removeEventListener('loadedmetadata', restore)
      video.removeEventListener('timeupdate', save)
    }
  }, [storageKey])

  return (
    <video ref={ref} src={src} controls playsInline preload="metadata" className="max-h-[80dvh] w-full rounded-panel bg-black">
      Браузер не может воспроизвести это видео. Скачайте файл кнопкой выше.
    </video>
  )
}

function Viewer({ meta, fileKey }: { meta: FileMeta; fileKey: Bytes | undefined }) {
  const session = useSession()
  const kind = fileKind(meta)
  const fromDisk = meta.store === 'disk'

  const content = useQuery({
    queryKey: ['file-content', meta.id],
    staleTime: fromDisk ? 0 : Infinity,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      if (fromDisk) return { url: await diskUrl(session, meta), text: '' }
      const blob = await loadBlob(session, meta, fileKey)
      if (kind === 'html' || kind === 'text') return { url: '', text: await blob.text() }
      return { url: URL.createObjectURL(blob), text: '' }
    },
  })

  const url = content.data?.url
  useEffect(() => {
    return () => {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }, [url])

  if (content.isPending) return <Skeleton className="h-96" />
  if (content.isError) return <ErrorState error={content.error} onRetry={() => void content.refetch()} />
  const { text } = content.data

  switch (kind) {
    case 'html':
      // sandbox без allow-same-origin: страница получает отдельное происхождение
      // и не видит ни ключей, ни сессии сайта. Скрипты внутри неё работают.
      return (
        <iframe
          title={meta.name}
          srcDoc={text}
          sandbox="allow-scripts allow-forms allow-modals"
          referrerPolicy="no-referrer"
          className="h-[80dvh] w-full rounded-panel border border-line bg-white"
        />
      )
    case 'pdf':
      return <iframe title={meta.name} src={url} className="h-[85dvh] w-full rounded-panel border border-line bg-white" />
    case 'image':
      return <img src={url} alt={meta.name} className="max-h-[85dvh] max-w-full rounded-panel border border-line" />
    case 'video':
      return <Video meta={meta} src={url!} />
    case 'audio':
      return <audio src={url} controls className="w-full" />
    case 'text':
      return (
        <pre className="num max-h-[80dvh] overflow-auto rounded-panel border border-line bg-surface p-4 text-sm whitespace-pre-wrap">
          {text}
        </pre>
      )
    default:
      return <p className="text-muted">Этот файл нельзя показать на сайте. Скачайте его кнопкой выше.</p>
  }
}

/** Просмотр общего файла прямо в карточке материала: видео и картинки. */
export function FileViewInline({ meta }: { meta: FileMeta }) {
  return <Viewer meta={meta} fileKey={undefined} />
}

/** Отдельная страница просмотра файла. scope: shared, own или идентификатор ученика. */
export function FileViewPage() {
  const { scope = '', fileId = '' } = useParams()
  const session = useSession()
  if (scope === 'shared') return <SharedScope fileId={fileId} />
  // Ученик всегда получает только свои файлы, что бы ни стояло в адресе.
  return session.bundle.role === 'admin' ? <StudentScope studentId={scope} fileId={fileId} /> : <OwnScope fileId={fileId} />
}

function SharedScope({ fileId }: { fileId: string }) {
  const navigate = useNavigate()
  return <Frame resolved={useSharedRef(fileId)} onBack={() => navigate(-1)} />
}

function StudentScope({ studentId, fileId }: { studentId: string; fileId: string }) {
  const navigate = useNavigate()
  return <Frame resolved={useStudentRef(studentId, fileId)} onBack={() => navigate(-1)} />
}

function OwnScope({ fileId }: { fileId: string }) {
  const navigate = useNavigate()
  return <Frame resolved={useOwnRef(fileId)} onBack={() => navigate(-1)} />
}

function Frame({ resolved, onBack }: { resolved: Resolved; onBack(): void }) {
  const session = useSession()
  const { meta, key, pending, error } = resolved
  const title = useMemo(() => (meta ? fileTitle(meta) : 'Файл'), [meta])

  if (pending) return <Skeleton className="h-96" />
  if (error) return <ErrorState error={error} />
  if (!meta) return <ErrorState error={new Error('Файл не найден. Возможно, его удалили.')} onRetry={onBack} />

  const download = async () => {
    try {
      await downloadFile(session, meta, key)
    } catch (cause) {
      toast.error(errorMessage(cause))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="mb-1 inline-flex min-h-9 items-center gap-1 text-sm text-pen">
            <CaretLeft size={16} aria-hidden /> Назад
          </button>
          <h1 className="text-lg break-words sm:text-xl">{title}</h1>
          <p className="num text-sm text-muted">{formatBytes(meta.size)}</p>
        </div>
        <Button icon={<DownloadSimple size={18} />} onClick={() => void download()}>
          Скачать оригинал
        </Button>
      </div>
      <Viewer meta={meta} fileKey={key} />
    </div>
  )
}
