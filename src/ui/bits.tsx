import { Check, Copy, WarningCircle } from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from './Button'
import { cn } from './cn'

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-panel border border-line bg-surface', className)}>{children}</section>
}

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-[65ch] text-muted">{description}</p>}
      </div>
      {action}
    </header>
  )
}

type Tone = 'neutral' | 'pen' | 'ok' | 'warn' | 'red'

const tones: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted',
  pen: 'bg-pen-soft text-pen',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  red: 'bg-red-soft text-red',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap', tones[tone])}>
      {children}
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-[pulse-soft_1.4s_ease-in-out_infinite] rounded-control bg-sunken', className)} />
}

export function EmptyState({ title, description, action }: { title: string; description: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 px-5 py-10 sm:px-8">
      <h2 className="text-lg">{title}</h2>
      <p className="max-w-[55ch] text-muted">{description}</p>
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?(): void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-panel border border-red/40 bg-red-soft px-5 py-4 text-ink">
      <div className="flex items-start gap-2">
        <WarningCircle size={20} className="mt-0.5 shrink-0 text-red" aria-hidden />
        <p>{errorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  )
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Что-то пошло не так. Повторите попытку.'
}

/** Значение, которое нужно переписать или скопировать: пароль, логин. */
export function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Не удалось скопировать. Выделите текст и скопируйте вручную.')
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <code className="num min-w-0 flex-1 rounded-control border border-line bg-sunken px-3 py-2.5 text-base break-all select-all">
          {value}
        </code>
        <Button
          size="md"
          onClick={copy}
          icon={copied ? <Check size={18} className="text-ok" /> : <Copy size={18} />}
          aria-label={`Скопировать: ${label}`}
        >
          {copied ? 'Скопировано' : 'Копировать'}
        </Button>
      </div>
    </div>
  )
}
