import { ArrowSquareOut } from '@phosphor-icons/react'
import type { Lesson } from '../../domain/types'
import { Panel } from '../../ui/bits'

/** Содержание урока: одинаково выглядит у репетитора и у ученика. */
export function LessonContent({ lesson }: { lesson: Lesson }) {
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
          <h3 className="text-sm font-normal text-muted">Ссылки</h3>
          <ul className="mt-2 flex flex-col gap-1">
            {lesson.links.map((link) => (
              <li key={link.url + link.title}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center gap-1.5 text-pen underline"
                >
                  {link.title} <ArrowSquareOut size={16} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

export function LessonMeta({ lesson }: { lesson: Lesson }) {
  return (
    <>
      {lesson.topic ? `Тема: ${lesson.topic}` : 'Тема не указана'}
      {lesson.egeTask && (
        <>
          . Задание ЕГЭ <span className="num text-ink">{lesson.egeTask}</span>
        </>
      )}
    </>
  )
}
