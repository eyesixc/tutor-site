import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../../core/auth/session'
import { loadContacts } from '../../domain/contacts'
import { listLessons, loadOverview } from '../../domain/lessons'

/** Общая библиотека уроков. */
export function useLessons() {
  const session = useSession()
  return useQuery({ queryKey: ['lessons'], queryFn: () => listLessons(session) })
}

/** Контакты репетитора: куда ученики отправляют домашние задания. */
export function useContacts() {
  const session = useSession()
  return useQuery({ queryKey: ['contacts'], queryFn: () => loadContacts(session) })
}

/** Все ученики и их личные данные: только для репетитора. */
export function useOverview() {
  const session = useSession()
  return useQuery({ queryKey: ['overview'], queryFn: () => loadOverview(session) })
}

/** После изменений у репетитора перечитываем всё, что от них зависит. */
export function useRefresh() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['overview'] }),
      queryClient.invalidateQueries({ queryKey: ['lessons'] }),
      queryClient.invalidateQueries({ queryKey: ['students'] }),
    ])
}
