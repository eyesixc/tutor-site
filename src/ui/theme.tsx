import { Moon, Sun } from '@phosphor-icons/react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'
import { IconButton } from './Button'

type Theme = 'light' | 'dark'

const ThemeContext = createContext<{ theme: Theme; toggle(): void } | null>(null)

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = next
      try {
        localStorage.setItem('tutor:theme', next)
      } catch {
        // Без хранилища тема просто не запомнится.
      }
      return next
    })
  }, [])

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return (
    <ThemeContext.Provider value={value}>
      {children}
      <Toaster
        theme={theme}
        position="bottom-center"
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--ink)',
            border: '1px solid var(--line)',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-pop)',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
          },
        }}
      />
    </ThemeContext.Provider>
  )
}

export function ThemeToggle() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('ThemeToggle вне ThemeProvider')
  const dark = ctx.theme === 'dark'
  return (
    <IconButton label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'} onClick={ctx.toggle}>
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </IconButton>
  )
}
