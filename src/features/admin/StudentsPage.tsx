import * as Menu from '@radix-ui/react-dropdown-menu'
import { ArrowSquareOut, DotsThree, Key, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useSession } from '../../core/auth/session'
import { TUTOR_TIMEZONE, zoneLabel, zoneOptions } from '../../core/time'
import {
  createStudent,
  deleteStudent,
  listStudents,
  resetStudentPassword,
  updateStudent,
  ValidationError,
  type StudentInput,
} from '../../domain/students'
import type { StudentRecord } from '../../domain/types'
import { Button, IconButton } from '../../ui/Button'
import { ConfirmDialog, Dialog, DialogActions } from '../../ui/Dialog'
import { SelectField, TextField } from '../../ui/Field'
import { CopyValue, EmptyState, ErrorState, errorMessage, PageHeader, Panel, Skeleton } from '../../ui/bits'

const ZONES = zoneOptions()

interface Credentials {
  name: string
  login: string
  password: string
  isNew: boolean
}

function StudentFormDialog({
  student,
  open,
  onOpenChange,
  onCreated,
}: {
  student: StudentRecord | null
  open: boolean
  onOpenChange(open: boolean): void
  onCreated(credentials: Credentials): void
}) {
  const session = useSession()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<StudentInput>(() => ({
    name: student?.name ?? '',
    login: student?.login ?? '',
    timezone: student?.timezone ?? TUTOR_TIMEZONE,
    telemostUrl: student?.telemostUrl ?? '',
  }))
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null)
  const set = (field: keyof StudentInput) => (value: string) => setForm((f) => ({ ...f, [field]: value }))
  const err = (field: string) => (fieldError?.field === field ? fieldError.message : null)

  const save = useMutation({
    mutationFn: async () => {
      if (student) {
        await updateStudent(session, student.id, form)
        return null
      }
      return createStudent(session, form)
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['students'] })
      onOpenChange(false)
      if (created) {
        onCreated({ name: created.student.name, login: created.student.login, password: created.password, isNew: true })
      } else {
        toast.success('Изменения сохранены')
      }
    },
    onError: (cause) => {
      if (cause instanceof ValidationError) setFieldError({ field: cause.field, message: cause.message })
      else toast.error(errorMessage(cause))
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (save.isPending) return
    setFieldError(null)
    save.mutate()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !save.isPending && onOpenChange(next)}
      title={student ? 'Изменить ученика' : 'Новый ученик'}
      description={student ? undefined : 'Пароль будет создан автоматически и показан один раз.'}
      persistent={save.isPending}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField label="Имя" value={form.name} onChange={set('name')} error={err('name')} autoFocus autoComplete="off" />
        <TextField
          label="Логин"
          value={form.login}
          onChange={set('login')}
          error={err('login')}
          hint={student ? 'Логин нельзя изменить после создания' : 'Латинские буквы и цифры, например petya'}
          disabled={!!student}
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          mono
        />
        <SelectField label="Часовой пояс" value={form.timezone} onChange={set('timezone')} error={err('timezone')}>
          <optgroup label="Россия">
            {ZONES.russian.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Другие">
            {ZONES.other.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </optgroup>
        </SelectField>
        <TextField
          label="Ссылка на Яндекс Телемост"
          value={form.telemostUrl}
          onChange={set('telemostUrl')}
          error={err('telemostUrl')}
          hint="Можно добавить позже"
          placeholder="https://telemost.yandex.ru/j/…"
          inputMode="url"
          autoComplete="off"
        />
        <DialogActions>
          <Button onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {student ? 'Сохранить' : 'Создать ученика'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

function CredentialsDialog({ credentials, onClose }: { credentials: Credentials | null; onClose(): void }) {
  return (
    <Dialog
      open={!!credentials}
      onOpenChange={() => undefined}
      title={credentials?.isNew ? 'Ученик создан' : 'Новый пароль создан'}
      description={`${credentials?.name ?? ''}: передайте ученику логин и пароль. Пароль показывается один раз.`}
      persistent
    >
      {credentials && (
        <div className="flex flex-col gap-4">
          <CopyValue label="Логин" value={credentials.login} />
          <CopyValue label="Пароль" value={credentials.password} />
          <p className="text-sm text-muted">
            Войти с этим паролем можно будет через 1–2 минуты, когда сайт обновится.
            {!credentials.isNew && ' Старый пароль после этого перестанет работать.'}
          </p>
        </div>
      )}
      <DialogActions>
        <Button variant="primary" onClick={onClose}>
          Пароль сохранён
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function RowMenu({
  student,
  onEdit,
  onReset,
  onDelete,
}: {
  student: StudentRecord
  onEdit(): void
  onReset(): void
  onDelete(): void
}) {
  const item =
    'flex h-10 cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 text-sm outline-none data-highlighted:bg-sunken'
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <IconButton label={`Действия: ${student.name}`}>
          <DotsThree size={22} weight="bold" />
        </IconButton>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-52 rounded-control border border-line bg-surface p-1 shadow-pop animate-[pop-in_140ms_ease-out]"
        >
          <Menu.Item className={item} onSelect={onEdit}>
            <PencilSimple size={18} aria-hidden /> Изменить
          </Menu.Item>
          <Menu.Item className={item} onSelect={onReset}>
            <Key size={18} aria-hidden /> Создать новый пароль
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item className={`${item} text-red`} onSelect={onDelete}>
            <Trash size={18} aria-hidden /> Удалить ученика
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

export function StudentsPage() {
  const session = useSession()
  const queryClient = useQueryClient()
  const students = useQuery({ queryKey: ['students'], queryFn: () => listStudents(session) })

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<StudentRecord | null>(null)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [resetting, setResetting] = useState<StudentRecord | null>(null)
  const [deleting, setDeleting] = useState<StudentRecord | null>(null)

  const openForm = (student: StudentRecord | null) => {
    setEditing(student)
    setFormOpen(true)
  }

  const confirmReset = async () => {
    if (!resetting) return
    try {
      const password = await resetStudentPassword(session, resetting.id)
      setCredentials({ name: resetting.name, login: resetting.login, password, isNew: false })
    } catch (cause) {
      toast.error(errorMessage(cause))
      throw cause
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await deleteStudent(session, deleting.id)
      await queryClient.invalidateQueries({ queryKey: ['students'] })
      toast.success('Ученик удалён')
    } catch (cause) {
      toast.error(errorMessage(cause))
      throw cause
    }
  }

  const list = [...(students.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  return (
    <>
      <PageHeader
        title="Ученики"
        description="Аккаунты, часовые пояса и ссылки на Телемост."
        action={
          list.length > 0 && (
            <Button variant="primary" icon={<Plus size={18} weight="bold" />} onClick={() => openForm(null)}>
              Создать ученика
            </Button>
          )
        }
      />

      {students.isPending ? (
        <Panel className="flex flex-col gap-3 p-5">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </Panel>
      ) : students.isError ? (
        <ErrorState error={students.error} onRetry={() => void students.refetch()} />
      ) : list.length === 0 ? (
        <Panel>
          <EmptyState
            title="Учеников пока нет"
            description="Создайте первого ученика: сайт сгенерирует пароль и личный кабинет. После этого ему можно назначать уроки и домашние задания."
            action={
              <Button variant="primary" icon={<Plus size={18} weight="bold" />} onClick={() => openForm(null)}>
                Создать ученика
              </Button>
            }
          />
        </Panel>
      ) : (
        <Panel>
          <ul>
            {list.map((student) => (
              <li
                key={student.id}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{student.name}</p>
                  <p className="num truncate text-sm text-muted">{student.login}</p>
                </div>
                <p className="col-start-1 truncate text-sm text-muted sm:col-start-auto">{zoneLabel(student.timezone)}</p>
                <div className="col-start-1 min-w-0 text-sm sm:col-start-auto">
                  {student.telemostUrl ? (
                    <a
                      href={student.telemostUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-pen underline"
                    >
                      Телемост <ArrowSquareOut size={16} aria-hidden />
                    </a>
                  ) : (
                    <span className="text-muted">Ссылка не задана</span>
                  )}
                </div>
                <div className="col-start-2 row-span-3 row-start-1 sm:col-start-auto sm:row-span-1 sm:row-start-auto">
                  <RowMenu
                    student={student}
                    onEdit={() => openForm(student)}
                    onReset={() => setResetting(student)}
                    onDelete={() => setDeleting(student)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {formOpen && (
        <StudentFormDialog
          key={editing?.id ?? 'new'}
          student={editing}
          open={formOpen}
          onOpenChange={setFormOpen}
          onCreated={setCredentials}
        />
      )}

      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />

      <ConfirmDialog
        open={!!resetting}
        onOpenChange={(open) => !open && setResetting(null)}
        title="Создать новый пароль?"
        description={`Старый пароль ученика ${resetting?.name ?? ''} перестанет работать. Данные ученика сохранятся.`}
        confirmLabel="Создать пароль"
        onConfirm={confirmReset}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Удалить ученика?"
        description={
          <>
            Будут удалены аккаунт, расписание, домашние задания, результаты пробников и личные файлы ученика{' '}
            <b className="text-ink">{deleting?.name}</b>. Общие уроки, методички и материалы останутся. Отменить
            удаление нельзя.
          </>
        }
        confirmLabel="Удалить навсегда"
        typeToConfirm={deleting?.login}
        danger
        onConfirm={confirmDelete}
      />
    </>
  )
}
