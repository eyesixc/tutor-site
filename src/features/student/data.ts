import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useSession } from '../../core/auth/session'
import { loadOwnStudentFile, viewHomework, type HomeworkView } from '../../domain/homework'
import { loadOwnTutorFile } from '../../domain/students'

/** Личные данные ученика, которые ведёт репетитор: расписание, домашки, пробники. */
export function useOwnData() {
  const session = useSession()
  return useQuery({ queryKey: ['own', session.bundle.userId], queryFn: () => loadOwnTutorFile(session) })
}

/** То, что ученик пишет сам: отметки о выполнении и решения. */
export function useOwnSubmissions() {
  const session = useSession()
  return useQuery({ queryKey: ['own-subs', session.bundle.userId], queryFn: () => loadOwnStudentFile(session) })
}

/** Домашние задания ученика со статусами. null, пока данные не загружены. */
export function useOwnHomework(): { views: HomeworkView[]; timeZone: string } | null {
  const own = useOwnData()
  const subs = useOwnSubmissions()
  return useMemo(
    () =>
      own.data && subs.data
        ? { views: viewHomework(own.data.homework, subs.data.submissions), timeZone: own.data.profile.timezone }
        : null,
    [own.data, subs.data],
  )
}
