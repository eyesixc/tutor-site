import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from './cn'

const controlClass =
  'h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-ink ' +
  'placeholder:text-muted/70 transition-colors duration-150 ' +
  'hover:border-muted/60 focus:border-pen focus:outline-none focus:ring-2 focus:ring-pen/25 ' +
  'aria-invalid:border-red aria-invalid:focus:ring-red/25 disabled:opacity-60'

interface WrapperProps {
  label: string
  hint?: ReactNode
  error?: string | null
}

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: WrapperProps & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type TextFieldProps = WrapperProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
    value: string
    onChange(value: string): void
    mono?: boolean
  }

export function TextField({ label, hint, error, value, onChange, mono, className, ...rest }: TextFieldProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(controlClass, mono && 'num text-sm', className)}
        {...rest}
      />
    </FieldShell>
  )
}

type TextAreaFieldProps = WrapperProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
    value: string
    onChange(value: string): void
  }

export function TextAreaField({ label, hint, error, value, onChange, className, rows = 4, ...rest }: TextAreaFieldProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={cn(controlClass, 'h-auto min-h-24 resize-y py-2.5 leading-normal', className)}
        {...rest}
      />
    </FieldShell>
  )
}

/** Класс для полей ввода вне FieldShell (плотные строки с датой и временем). */
export const inputClass = controlClass

type SelectFieldProps =WrapperProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
    value: string
    onChange(value: string): void
    children: ReactNode
  }

export function SelectField({ label, hint, error, value, onChange, children, className, ...rest }: SelectFieldProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={cn(controlClass, 'pr-8', className)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  )
}

interface CheckboxProps {
  label: string
  checked: boolean
  onChange(checked: boolean): void
}

export function Checkbox({ label, checked, onChange }: CheckboxProps) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 shrink-0 rounded-[5px] accent-(--pen)"
      />
      {label}
    </label>
  )
}
