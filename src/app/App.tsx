import { GearSix, House, Users } from '@phosphor-icons/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { SessionProvider, useAuth } from '../core/auth/session'
import { SettingsPage } from '../features/admin/SettingsPage'
import { StudentsPage } from '../features/admin/StudentsPage'
import { homePath, LoginPage } from '../features/auth/LoginPage'
import { SetupPage } from '../features/auth/SetupPage'
import { StudentHomePage, useOwnData } from '../features/student/HomePage'
import { AppShell, type NavItem } from '../ui/AppShell'
import { ThemeProvider } from '../ui/theme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

const ADMIN_NAV: NavItem[] = [
  { to: '/admin/students', label: 'Ученики', icon: Users },
  { to: '/admin/settings', label: 'Настройки', icon: GearSix },
]

const STUDENT_NAV: NavItem[] = [{ to: '/', label: 'Главная', icon: House, end: true }]

/** Пускает только свою роль. Чужую отправляет на её главную, гостя — на вход. */
function RequireRole({ role }: { role: 'admin' | 'student' }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/login" replace />
  if (session.bundle.role !== role) return <Navigate to={homePath(session.bundle.role)} replace />
  return <Outlet />
}

function useSignOut() {
  const { signOut } = useAuth()
  return () => {
    queryClient.clear()
    signOut()
  }
}

function AdminLayout() {
  const { session } = useAuth()
  const signOut = useSignOut()
  const name = session?.bundle.role === 'admin' ? session.bundle.name : ''
  return (
    <AppShell nav={ADMIN_NAV} userName={name} userCaption="Репетитор" onSignOut={signOut}>
      <Outlet />
    </AppShell>
  )
}

function StudentLayout() {
  const { session } = useAuth()
  const signOut = useSignOut()
  const own = useOwnData()
  return (
    <AppShell
      nav={STUDENT_NAV}
      userName={own.data?.profile.name ?? session?.login ?? ''}
      userCaption="Ученик"
      onSignOut={signOut}
    >
      <Outlet />
    </AppShell>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <HashRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/setup" element={<SetupPage />} />

              <Route element={<RequireRole role="admin" />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="students" replace />} />
                  <Route path="students" element={<StudentsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
              </Route>

              <Route element={<RequireRole role="student" />}>
                <Route element={<StudentLayout />}>
                  <Route path="/" element={<StudentHomePage />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </HashRouter>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
