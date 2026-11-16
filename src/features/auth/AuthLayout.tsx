import type { ReactNode } from 'react'
import { cn } from '../../ui/cn'
import { ThemeToggle } from '../../ui/theme'

// 27 заданий ЕГЭ по информатике: клетки, закрашенные «ручкой», как отметки в тетради.
const MARKED = new Set([2, 5, 8, 12, 15, 16, 23, 24])

function TaskGrid() {
  return (
    <div
      aria-hidden
      className="relative hidden min-w-0 flex-1 items-center justify-center overflow-hidden border-l border-line xl:flex"
      style={{
        backgroundImage:
          'linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        backgroundPosition: '-1px -1px',
      }}
    >
      <div className="grid shrink-0 grid-cols-[repeat(9,4rem)] border-t border-l border-ink/70 bg-bg">
        {Array.from({ length: 27 }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            className={cn(
              'num flex size-16 items-center justify-center border-r border-b border-ink/70 text-lg',
              MARKED.has(n) ? 'bg-pen text-pen-ink' : 'text-ink',
            )}
          >
            {n}
          </div>
        ))}
      </div>
    </div>
  )
}

export function AuthLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-dvh bg-bg">
      <div className={cn('flex w-full flex-col px-5 py-4 sm:px-10', 'mx-auto', wide ? 'max-w-[46rem] xl:w-[46rem]' : 'max-w-[32rem] xl:w-[32rem]', 'xl:mx-0 xl:shrink-0')}>
        <div className="flex items-center justify-between">
          <span className="font-semibold tracking-tight">Информатика</span>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 flex-col justify-center py-8">{children}</div>
      </div>
      <TaskGrid />
    </div>
  )
}
