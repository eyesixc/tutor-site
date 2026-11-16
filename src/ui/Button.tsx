import { CircleNotch } from '@phosphor-icons/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'sm'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

const variants: Record<Variant, string> = {
  primary: 'bg-pen text-pen-ink hover:brightness-110',
  secondary: 'border border-line bg-surface text-ink hover:bg-sunken',
  ghost: 'text-ink hover:bg-sunken',
  danger: 'bg-red text-surface hover:brightness-110',
}

const sizes: Record<Size, string> = {
  md: 'h-11 px-4 text-base',
  sm: 'h-9 px-3 text-sm',
}

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', extra?: string): string {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap',
    'transition-[filter,background-color,transform] duration-150 active:translate-y-px',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0',
    variants[variant],
    sizes[size],
    extra,
  )
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <CircleNotch className="animate-spin" size={18} aria-hidden /> : icon}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
}

export function IconButton({ label, children, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted',
        'transition-colors duration-150 hover:bg-sunken hover:text-ink disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
