import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import { Button, IconButton } from './Button'
import { cn } from './cn'
import { TextField } from './Field'

interface DialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description?: ReactNode
  children: ReactNode
  /** Нельзя закрыть кликом мимо или Esc: для окон, где закрытие теряет данные. */
  persistent?: boolean
  wide?: boolean
}

export function Dialog({ open, onOpenChange, title, description, children, persistent, wide }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-overlay animate-[fade-in_150ms_ease-out]" />
        <RadixDialog.Content
          onInteractOutside={persistent ? (e) => e.preventDefault() : undefined}
          onEscapeKeyDown={persistent ? (e) => e.preventDefault() : undefined}
          aria-describedby={description ? undefined : undefined}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-panel border border-line bg-surface p-5 shadow-pop',
            'animate-[pop-in_180ms_cubic-bezier(0.16,1,0.3,1)]',
            'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-panel sm:p-6',
            wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <RadixDialog.Title className="text-lg font-semibold">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-sm text-muted">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            {!persistent && (
              <RadixDialog.Close asChild>
                <IconButton label="Закрыть" className="-mt-2 -mr-2">
                  <X size={20} />
                </IconButton>
              </RadixDialog.Close>
            )}
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>
}

interface ConfirmDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description: ReactNode
  confirmLabel: string
  /** Если задано, кнопка активна только после ввода этого слова. */
  typeToConfirm?: string
  danger?: boolean
  onConfirm(): Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  typeToConfirm,
  danger,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase()

  const handleOpenChange = (next: boolean) => {
    if (busy) return
    if (!next) setTyped('')
    onOpenChange(next)
  }

  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
      setTyped('')
      onOpenChange(false)
    } catch {
      // Ошибку показывает вызывающая сторона, окно остаётся открытым.
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} title={title} description={description} persistent={busy}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) void confirm()
        }}
      >
        {typeToConfirm && (
          <TextField
            label={`Для подтверждения введите: ${typeToConfirm}`}
            value={typed}
            onChange={setTyped}
            autoComplete="off"
            autoCapitalize="off"
            mono
          />
        )}
        <DialogActions>
          <Button onClick={() => handleOpenChange(false)} disabled={busy}>
            Отмена
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={!ready} loading={busy}>
            {confirmLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
