import * as RadixDialog from '@radix-ui/react-dialog'
import { List, SignOut, X, type Icon } from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { IconButton } from './Button'
import { cn } from './cn'
import { ThemeToggle } from './theme'

export interface NavItem {
  to: string
  label: string
  icon: Icon
  /** Совпадение только по точному адресу (для главной). */
  end?: boolean
}

interface AppShellProps {
  nav: NavItem[]
  userName: string
  userCaption: string
  onSignOut(): void
  children: ReactNode
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" className="fill-pen" />
        <path d="M8 11h16M8 16h16M8 21h16M13 8v16M19 8v16" className="stroke-pen-ink" strokeOpacity=".35" />
        <rect x="13" y="11" width="6" height="5" className="fill-pen-ink" />
      </svg>
      <span className="font-semibold tracking-tight">Информатика</span>
    </div>
  )
}

function NavList({ nav, onNavigate }: { nav: NavItem[]; onNavigate?(): void }) {
  return (
    <nav aria-label="Разделы" className="flex flex-col gap-0.5">
      {nav.map(({ to, label, icon: IconComponent, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex h-11 items-center gap-3 rounded-control px-3 font-medium transition-colors duration-150',
              isActive ? 'bg-pen-soft text-pen' : 'text-muted hover:bg-sunken hover:text-ink',
            )
          }
        >
          {({ isActive }) => (
            <>
              <IconComponent size={20} weight={isActive ? 'fill' : 'regular'} aria-hidden />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function UserBlock({ userName, userCaption, onSignOut }: Pick<AppShellProps, 'userName' | 'userCaption' | 'onSignOut'>) {
  return (
    <div className="flex items-center gap-1 border-t border-line pt-3">
      <div className="min-w-0 flex-1 px-2">
        <p className="truncate text-sm font-medium">{userName}</p>
        <p className="truncate text-xs text-muted">{userCaption}</p>
      </div>
      <ThemeToggle />
      <IconButton label="Выйти" onClick={onSignOut}>
        <SignOut size={20} />
      </IconButton>
    </div>
  )
}

export function AppShell({ nav, userName, userCaption, onSignOut, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const current = nav.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))

  return (
    <div className="min-h-dvh lg:pl-58">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-pen focus:px-3 focus:py-2 focus:text-pen-ink"
      >
        Перейти к содержимому
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-58 flex-col gap-6 border-r border-line bg-surface p-3 pt-5 lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto">
          <NavList nav={nav} />
        </div>
        <UserBlock userName={userName} userCaption={userCaption} onSignOut={onSignOut} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-line bg-surface px-2 lg:hidden">
        <RadixDialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <RadixDialog.Trigger asChild>
            <IconButton label="Открыть меню">
              <List size={22} />
            </IconButton>
          </RadixDialog.Trigger>
          <RadixDialog.Portal>
            <RadixDialog.Overlay className="fixed inset-0 z-40 bg-overlay animate-[fade-in_150ms_ease-out]" />
            <RadixDialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,86vw)] flex-col gap-6 border-r border-line bg-surface p-3 pt-4 shadow-pop animate-[slide-in_200ms_cubic-bezier(0.16,1,0.3,1)]">
              <div className="flex items-center justify-between">
                <RadixDialog.Title asChild>
                  <div>
                    <Brand />
                  </div>
                </RadixDialog.Title>
                <RadixDialog.Description className="sr-only">Навигация по разделам</RadixDialog.Description>
                <RadixDialog.Close asChild>
                  <IconButton label="Закрыть меню">
                    <X size={20} />
                  </IconButton>
                </RadixDialog.Close>
              </div>
              <div className="flex-1 overflow-y-auto">
                <NavList nav={nav} onNavigate={() => setMenuOpen(false)} />
              </div>
              <UserBlock userName={userName} userCaption={userCaption} onSignOut={onSignOut} />
            </RadixDialog.Content>
          </RadixDialog.Portal>
        </RadixDialog.Root>
        <span className="min-w-0 flex-1 truncate font-semibold">{current?.label ?? 'Информатика'}</span>
        <ThemeToggle />
      </header>

      <main id="main" className="mx-auto w-full max-w-280 px-4 py-6 sm:px-8 sm:py-10">
        {children}
      </main>
    </div>
  )
}
