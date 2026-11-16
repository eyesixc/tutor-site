import { BookOpen, ChartBar, ClipboardText, Files, GearSix, House, PlayCircle, Users } from '@phosphor-icons/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { SessionProvider, useAuth } from '../core/auth/session'
import { AdminHomePage } from '../features/admin/AdminHomePage'
import { CatalogPage } from '../features/admin/CatalogPage'
import { AdminHomeworkDetailPage } from '../features/admin/HomeworkDetailPage'
import { AdminHomeworkPage } from '../features/admin/HomeworkPage'
import { LessonPage } from '../features/admin/LessonPage'
import { LessonsPage } from '../features/admin/LessonsPage'
import { AdminMockPage, AdminMocksPage } from '../features/admin/MocksPage'
import { SettingsPage } from '../features/admin/SettingsPage'
import { StudentPage } from '../features/admin/StudentPage'
import { StudentsPage } from '../features/admin/StudentsPage'
import { homePath, LoginPage } from '../features/auth/LoginPage'
import { SetupPage } from '../features/auth/SetupPage'
import { FileViewPage } from '../features/shared/FileViewPage'
import { MethodicalPage, UsefulPage } from '../features/shared/MaterialsPages'
import { useOwnData } from '../features/student/data'
import { StudentHomePage } from '../features/student/HomePage'
import { StudentHomeworkCardPage } from '../features/student/HomeworkCardPage'
import { StudentHomeworkPage } from '../features/student/HomeworkPage'
import { StudentLessonPage } from '../features/student/LessonPage'
import { StudentLessonsPage } from '../features/student/LessonsPage'
import { StudentMockPage, StudentMocksPage } from '../features/student/MocksPage'
import { AppShell, type NavItem } from '../ui/AppShell'
import { ThemeProvider } from '../ui/theme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Главная', icon: House, end: true },
  { to: '/admin/students', label: 'Ученики', icon: Users },
  { to: '/admin/lessons', label: 'Уроки', icon: BookOpen },
  { to: '/admin/homework', label: 'Домашние задания', icon: ClipboardText },
  { to: '/admin/mocks', label: 'Пробники', icon: ChartBar },
  { to: '/admin/useful', label: 'Полезные материалы', icon: PlayCircle },
  { to: '/admin/methodical', label: 'Методички', icon: Files },
  { to: '/admin/settings', label: 'Настройки', icon: GearSix },
]

const STUDENT_NAV: NavItem[] = [
  { to: '/', label: 'Главная', icon: House, end: true },
  { to: '/lessons', label: 'Уроки', icon: BookOpen },
  { to: '/homework', label: 'Домашние задания', icon: ClipboardText },
  { to: '/mocks', label: 'Пробники', icon: ChartBar },
  { to: '/useful', label: 'Полезные материалы', icon: PlayCircle },
  { to: '/methodical', label: 'Методички', icon: Files },
]

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
                  <Route index element={<AdminHomePage />} />
                  <Route path="students" element={<StudentsPage />} />
                  <Route path="students/:studentId" element={<StudentPage />} />
                  <Route path="lessons" element={<LessonsPage />} />
                  <Route path="lessons/:lessonId" element={<LessonPage />} />
                  <Route path="homework" element={<AdminHomeworkPage />} />
                  <Route path="homework/:studentId/:homeworkId" element={<AdminHomeworkDetailPage />} />
                  <Route path="mocks" element={<AdminMocksPage />} />
                  <Route path="mocks/:studentId/:mockId" element={<AdminMockPage />} />
                  <Route path="catalog" element={<CatalogPage />} />
                  <Route path="useful" element={<UsefulPage />} />
                  <Route path="methodical" element={<MethodicalPage />} />
                  <Route path="files/:scope/:fileId" element={<FileViewPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
              </Route>

              <Route element={<RequireRole role="student" />}>
                <Route element={<StudentLayout />}>
                  <Route path="/" element={<StudentHomePage />} />
                  <Route path="/lessons" element={<StudentLessonsPage />} />
                  <Route path="/lessons/:sessionId" element={<StudentLessonPage />} />
                  <Route path="/homework" element={<StudentHomeworkPage />} />
                  <Route path="/homework/:homeworkId" element={<StudentHomeworkCardPage />} />
                  <Route path="/mocks" element={<StudentMocksPage />} />
                  <Route path="/mocks/:mockId" element={<StudentMockPage />} />
                  <Route path="/useful" element={<UsefulPage />} />
                  <Route path="/methodical" element={<MethodicalPage />} />
                  <Route path="/files/:scope/:fileId" element={<FileViewPage />} />
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
