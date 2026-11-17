import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../../core/auth/session'
import { pickFiles, renameSharedFiles } from '../../domain/files'
import { addLessonFiles, KIND_LABEL, removeLessonFile } from '../../domain/lessons'
import type { Lesson } from '../../domain/types'
import { Panel } from '../../ui/bits'
import { LinkTiles } from '../../ui/LinkCard'
import { FileList, Uploader, useSharedFiles } from './filesUi'

interface LessonContentProps {
  lesson: Lesson
  /** Адрес страницы просмотра общих файлов: /files/shared или /admin/files/shared. */
  viewBase: string
  /** Репетитор может загружать и удалять файлы урока. */
  manage?: boolean
}

/** Содержание урока: одинаково выглядит у репетитора и у ученика. */
export function LessonContent({ lesson, viewBase, manage }: LessonContentProps) {
  const session = useSession()
  const queryClient = useQueryClient()
  const shared = useSharedFiles()
  const files = pickFiles(shared.data, lesson.fileIds)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['shared-files'] }),
      queryClient.invalidateQueries({ queryKey: ['lessons'] }),
    ])

  return (
    <Panel className="overflow-hidden">
      <div className="p-5">
        <h2 className="text-lg">Содержание</h2>
        {lesson.description ? (
          <p className="mt-2 max-w-[65ch] whitespace-pre-line">{lesson.description}</p>
        ) : (
          <p className="mt-2 text-muted">Описание не заполнено.</p>
        )}
      </div>

      {lesson.links.length > 0 && (
        <div className="border-t border-line p-5">
          <h3 className="text-sm font-normal text-muted">Тетради и ссылки</h3>
          <LinkTiles links={lesson.links} feature="workbook" className="mt-3" />
        </div>
      )}

      {(files.length > 0 || manage) && (
        <div className="border-t border-line">
          <h3 className="px-5 pt-4 pb-2 text-sm font-normal text-muted">Файлы урока</h3>
          {files.length > 0 ? (
            <FileList
              files={files}
              viewBase={viewBase}
              onRemove={
                manage
                  ? async (meta) => {
                      await removeLessonFile(session, lesson.id, meta)
                      await refresh()
                    }
                  : undefined
              }
              onRename={
                manage
                  ? async (meta, title) => {
                      await renameSharedFiles(session, { [meta.id]: title })
                      await refresh()
                    }
                  : undefined
              }
            />
          ) : (
            <p className="px-5 pb-3 text-sm text-muted">Файлов пока нет.</p>
          )}
          {manage && (
            <div className="border-t border-line p-4 sm:px-5">
              <Uploader
                scope={{ kind: 'shared' }}
                hint="Перетащите файлы или выберите. До 20 МБ хранятся в репозитории, крупнее и видео уходят на Яндекс Диск"
                onUploaded={async (metas) => {
                  await addLessonFiles(session, lesson.id, metas)
                  await refresh()
                }}
              />
            </div>
          )}
        </div>
      )}

    </Panel>
  )
}

export function LessonMeta({ lesson }: { lesson: Lesson }) {
  return (
    <>
      {lesson.kind ? `${KIND_LABEL[lesson.kind]}. ` : ''}
      {lesson.topic ? `Тема: ${lesson.topic}` : 'Тема не указана'}
      {lesson.egeTask && (
        <>
          . Задание ЕГЭ <span className="num text-ink">{lesson.egeTask}</span>
        </>
      )}
    </>
  )
}
