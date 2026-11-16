import { DownloadSimple, PencilSimple, Trash, UploadSimple } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState, type DragEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useSession } from '../../core/auth/session'
import type { Bytes } from '../../core/crypto'
import { formatBytes } from '../../core/disk'
import {
  canPreview,
  downloadFile,
  extensionOf,
  fileKind,
  fileTitle,
  listSharedFiles,
  MAX_FILE_SIZE,
  storeFile,
  type FileScope,
} from '../../domain/files'
import type { FileMeta } from '../../domain/types'
import { Button, buttonClass, IconButton } from '../../ui/Button'
import { ConfirmDialog, Dialog, DialogActions } from '../../ui/Dialog'
import { TextField } from '../../ui/Field'
import { errorMessage } from '../../ui/bits'
import { cn } from '../../ui/cn'

/** Реестр общих файлов: уроки, методички, полезные материалы. */
export function useSharedFiles() {
  const session = useSession()
  return useQuery({ queryKey: ['shared-files'], queryFn: () => listSharedFiles(session) })
}

const OPEN_LABEL = { html: 'Открыть на сайте', pdf: 'Открыть', image: 'Открыть', video: 'Смотреть', audio: 'Слушать', text: 'Открыть', other: '' }

interface FileListProps {
  files: FileMeta[]
  /** Адрес страницы просмотра без идентификатора: /files/shared, /admin/files/<ученик>. */
  viewBase: string
  /** Ключ для личных зашифрованных файлов. */
  fileKey?: Bytes
  onRemove?(meta: FileMeta): Promise<void>
  /** Репетитор может дать файлу название. */
  onRename?(meta: FileMeta, title: string): Promise<void>
}

function RenameDialog({ meta, onClose, onRename }: { meta: FileMeta; onClose(): void; onRename(title: string): Promise<void> }) {
  const [title, setTitle] = useState(meta.title ?? '')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await onRename(title)
      toast.success('Название сохранено')
      onClose()
    } catch (cause) {
      toast.error(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()} title="Название файла" persistent={busy}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="Название"
          value={title}
          onChange={setTitle}
          hint={`Файл: ${meta.name}. Если оставить пустым, будет показано имя файла`}
          autoFocus
        />
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Сохранить
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export function FileList({ files, viewBase, fileKey, onRemove, onRename }: FileListProps) {
  const session = useSession()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<FileMeta | null>(null)
  const [renaming, setRenaming] = useState<FileMeta | null>(null)

  const download = async (meta: FileMeta) => {
    setBusyId(meta.id)
    try {
      await downloadFile(session, meta, fileKey)
    } catch (cause) {
      toast.error(errorMessage(cause))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <ul>
        {files.map((meta) => (
          <li key={meta.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-2.5 sm:px-5">
            <span className="num w-13 shrink-0 rounded-[6px] bg-sunken py-0.5 text-center text-xs text-muted uppercase">
              {extensionOf(meta.name) || 'файл'}
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="font-medium break-words">{fileTitle(meta)}</p>
              <p className="text-xs text-muted">
                {meta.title?.trim() && <span className="break-all">{meta.name}, </span>}
                <span className="num">{formatBytes(meta.size)}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canPreview(meta) && (
                <Link to={`${viewBase}/${meta.id}`} className={buttonClass('secondary', 'sm', 'border-transparent bg-pen-soft text-pen')}>
                  {OPEN_LABEL[fileKind(meta)]}
                </Link>
              )}
              <Button size="sm" icon={<DownloadSimple size={16} />} loading={busyId === meta.id} onClick={() => void download(meta)}>
                Скачать
              </Button>
              {onRename && (
                <IconButton label={`Изменить название: ${fileTitle(meta)}`} onClick={() => setRenaming(meta)}>
                  <PencilSimple size={18} />
                </IconButton>
              )}
              {onRemove && (
                <IconButton label={`Удалить файл ${fileTitle(meta)}`} onClick={() => setRemoving(meta)}>
                  <Trash size={18} />
                </IconButton>
              )}
            </div>
          </li>
        ))}
      </ul>
      {renaming && onRename && (
        <RenameDialog meta={renaming} onClose={() => setRenaming(null)} onRename={(title) => onRename(renaming, title)} />
      )}
      {onRemove && (
        <ConfirmDialog
          open={!!removing}
          onOpenChange={(open) => !open && setRemoving(null)}
          title="Удалить файл?"
          description={`«${removing ? fileTitle(removing) : ''}» будет удалён из хранилища. Отменить удаление нельзя.`}
          confirmLabel="Удалить файл"
          danger
          onConfirm={async () => {
            if (!removing) return
            try {
              await onRemove(removing)
              toast.success('Файл удалён')
            } catch (cause) {
              toast.error(errorMessage(cause))
              throw cause
            }
          }}
        />
      )}
    </>
  )
}

interface UploaderProps {
  scope: FileScope
  maxSize?: number
  hint?: string
  /** Вызывается после загрузки всех выбранных файлов: здесь их нужно привязать к уроку или заданию. */
  onUploaded(metas: FileMeta[]): Promise<void>
}

export function Uploader({ scope, maxSize = MAX_FILE_SIZE, hint, onUploaded }: UploaderProps) {
  const session = useSession()
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const busy = status !== null

  const upload = async (list: FileList | null) => {
    const files = [...(list ?? [])]
    if (files.length === 0 || busy) return
    const done: FileMeta[] = []
    try {
      for (const [i, file] of files.entries()) {
        const prefix = files.length > 1 ? `Файл ${i + 1} из ${files.length}: ` : ''
        setStatus(`${prefix}загружаю «${file.name}»`)
        done.push(
          await storeFile(
            session,
            file,
            scope,
            (fraction) => setStatus(`${prefix}«${file.name}», ${Math.round(fraction * 100)}%`),
            maxSize,
          ),
        )
      }
    } catch (cause) {
      toast.error(errorMessage(cause))
    }
    try {
      if (done.length > 0) {
        setStatus('Сохраняю')
        await onUploaded(done)
        toast.success(done.length === 1 ? 'Файл загружен' : `Загружено файлов: ${done.length}`)
      }
    } catch (cause) {
      toast.error(errorMessage(cause))
    } finally {
      setStatus(null)
      if (input.current) input.current.value = ''
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void upload(e.dataTransfer.files)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-control border border-dashed px-4 py-3 transition-colors duration-150',
        over ? 'border-pen bg-pen-soft/50' : 'border-muted/50',
      )}
    >
      <p className="min-w-0 text-sm text-muted" aria-live="polite">
        {status ?? hint ?? `Перетащите файлы сюда или выберите. До ${Math.round(maxSize / 1024 / 1024)} МБ каждый`}
      </p>
      <input ref={input} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
      <Button size="sm" icon={<UploadSimple size={16} />} loading={busy} onClick={() => input.current?.click()}>
        Выбрать файлы
      </Button>
    </div>
  )
}
