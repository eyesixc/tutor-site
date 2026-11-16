import { useState, type ChangeEvent } from 'react'
import { toast } from 'sonner'
import { useSession } from '../../core/auth/session'
import { formatDay, TUTOR_TIMEZONE } from '../../core/time'
import { importHomework, parseHomeworkCsv, type ParsedImport } from '../../domain/importHomework'
import type { StudentRecord } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Dialog, DialogActions } from '../../ui/Dialog'
import { SelectField } from '../../ui/Field'
import { Badge, errorMessage } from '../../ui/bits'
import { useRefresh } from '../shared/data'

export function HomeworkImportDialog({
  students,
  presetStudentId,
  onClose,
}: {
  students: StudentRecord[]
  presetStudentId?: string
  onClose(): void
}) {
  const session = useSession()
  const refresh = useRefresh()
  const [studentId, setStudentId] = useState(presetStudentId ?? '')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedImport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setError(null)
    setParsed(null)
    if (!file) return
    setFileName(file.name)
    try {
      setParsed(parseHomeworkCsv(await file.text()))
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const run = async () => {
    if (!parsed || !studentId || busy) return
    setBusy(true)
    try {
      const result = await importHomework(session, studentId, parsed.rows)
      await refresh()
      toast.success(
        result.duplicates > 0
          ? `Добавлено заданий: ${result.added}. Уже были на сайте: ${result.duplicates}`
          : `Добавлено заданий: ${result.added}`,
      )
      onClose()
    } catch (cause) {
      toast.error(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const rows = parsed?.rows ?? []

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !busy && onClose()}
      title="Импорт домашних заданий из CSV"
      description="Файл выгрузки из прежней таблицы: название, даты, баллы, статус, комментарий. Один файл на одного ученика."
      persistent={busy}
      wide
    >
      <div className="flex flex-col gap-4">
        <SelectField label="Кому добавить задания" value={studentId} onChange={setStudentId}>
          <option value="">Выберите ученика</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Файл CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void pick(e)}
            className="text-base font-normal file:mr-3 file:h-11 file:cursor-pointer file:rounded-control file:border file:border-solid file:border-line file:bg-surface file:px-4 file:font-medium file:text-ink"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-control bg-red-soft px-3 py-2.5 text-sm text-red">
            {error}
          </p>
        )}

        {parsed && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">
              {fileName}: заданий <span className="num text-ink">{rows.length}</span>, из них проверенных{' '}
              <span className="num text-ink">{rows.filter((r) => r.done).length}</span>. Время дедлайнов считается московским.
            </p>
            <ul className="max-h-72 overflow-y-auto rounded-control border border-line">
              {rows.map((row, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-3 py-2 text-sm last:border-b-0">
                  <span className="min-w-0 flex-1 basis-44 font-medium">{row.title}</span>
                  <span className="num w-40 text-muted">
                    {formatDay(row.issuedAt, TUTOR_TIMEZONE)} → {formatDay(row.deadline, TUTOR_TIMEZONE)}
                  </span>
                  <span className="num w-20">
                    {row.score !== null && row.maxScore !== null ? `${row.score} из ${row.maxScore}` : 'без баллов'}
                  </span>
                  <Badge tone={row.done ? 'ok' : 'neutral'}>{row.done ? 'Проверено' : 'Не выполнено'}</Badge>
                  {row.warnings.length > 0 && <span className="basis-full text-warn">Проверьте: {row.warnings.join(', ')}</span>}
                </li>
              ))}
            </ul>
            {parsed.skipped.length > 0 && (
              <p className="text-sm text-warn">Не будут добавлены: {parsed.skipped.join('; ')}</p>
            )}
            <p className="text-sm text-muted">
              Повторный импорт того же файла безопасен: задания с тем же названием и датой выдачи второй раз не добавятся.
            </p>
          </div>
        )}

        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="primary" loading={busy} disabled={!studentId || rows.length === 0} onClick={() => void run()}>
            {rows.length > 0 ? `Добавить заданий: ${rows.length}` : 'Добавить'}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  )
}
