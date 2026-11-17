import {
  ArrowUpRight,
  BookOpenText,
  ChatCircleText,
  Code,
  FileText,
  Globe,
  NotePencil,
  PlayCircle,
  Table,
  Target,
  type Icon,
} from '@phosphor-icons/react'
import { describeLink, linkRole, orderLessonLinks, type LinkKind } from '../domain/links'
import { cn } from './cn'

export const LINK_ICON: Record<LinkKind, Icon> = {
  homework: NotePencil,
  doc: FileText,
  table: Table,
  video: PlayCircle,
  trainer: Target,
  chat: ChatCircleText,
  code: Code,
  web: Globe,
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen'

interface HomeworkTileProps {
  url: string
  title?: string
  /** Строка под названием: откуда ссылка или до какого числа сдать. */
  note?: string
  className?: string
}

/** Главная плитка: ссылка на домашку. Широкая и синяя, чтобы её нельзя было пропустить. */
export function HomeworkTile({ url, title = 'Открыть домашку', note, className }: HomeworkTileProps) {
  const { service } = describeLink(url, 'Домашка')
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'group flex flex-wrap items-center gap-x-4 gap-y-3 rounded-panel bg-pen p-4 text-pen-ink transition-[filter] duration-150 hover:brightness-110',
        focusRing,
        className,
      )}
    >
      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-control bg-pen-ink/15">
        <NotePencil size={26} />
      </span>
      <span className="min-w-0 flex-1 basis-40">
        <span className="block text-sm opacity-80">Домашнее задание</span>
        <span className="block text-lg leading-snug font-semibold break-words">{title}</span>
        <span className="block text-sm opacity-80">{note ? `${service} · ${note}` : service}</span>
      </span>
      <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-control bg-pen-ink px-3.5 text-sm font-semibold text-pen">
        Открыть
        <ArrowUpRight size={16} weight="bold" aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
      <span className="sr-only">(откроется в новой вкладке)</span>
    </a>
  )
}

/** Плитка ссылки: значок типа, название и сервис вместо адреса. */
export function LinkTile({ title, url, className }: { title: string; url: string; className?: string }) {
  const info = describeLink(url, title)
  const Icon = LINK_ICON[info.kind]
  const accent = info.kind === 'homework'
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      className={cn(
        'group flex h-full flex-col gap-3.5 rounded-panel border p-4 transition-colors duration-150',
        accent ? 'border-pen bg-pen-soft' : 'border-line bg-surface hover:border-pen hover:bg-pen-soft/40',
        focusRing,
        className,
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span
          aria-hidden
          className={cn(
            'flex size-10 items-center justify-center rounded-control',
            accent
              ? 'bg-pen text-pen-ink'
              : info.kind === 'doc' || info.kind === 'table' || info.kind === 'video'
                ? 'bg-pen-soft text-pen'
                : 'bg-sunken text-ink',
          )}
        >
          <Icon size={22} />
        </span>
        <ArrowUpRight
          size={18}
          aria-hidden
          className="text-muted transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-pen"
        />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold break-words group-hover:text-pen">{title}</span>
        <span className="block truncate text-sm text-muted">{info.caption}</span>
      </span>
      <span className="sr-only">(откроется в новой вкладке)</span>
    </a>
  )
}

/** Главная плитка урока: рабочая тетрадь. Широкая и синяя, остальные ссылки под ней. */
export function WorkbookTile({ url, title, className }: { url: string; title: string; className?: string }) {
  const { caption } = describeLink(url, title)
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'group flex flex-wrap items-center gap-x-4 gap-y-3 rounded-panel bg-pen p-4 text-pen-ink transition-[filter] duration-150 hover:brightness-110',
        focusRing,
        className,
      )}
    >
      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-control bg-pen-ink/15">
        <BookOpenText size={26} />
      </span>
      <span className="min-w-0 flex-1 basis-40">
        <span className="block text-sm opacity-80">Главное на уроке</span>
        <span className="block text-lg leading-snug font-semibold break-words">{title}</span>
        <span className="block text-sm opacity-80">{caption}</span>
      </span>
      <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-control bg-pen-ink px-3.5 text-sm font-semibold text-pen">
        Открыть
        <ArrowUpRight size={16} weight="bold" aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
      <span className="sr-only">(откроется в новой вкладке)</span>
    </a>
  )
}

interface LinkTilesProps {
  links: { title: string; url: string }[]
  /**
   * Что показать главной плиткой сверху: домашку (в материалах)
   * или рабочую тетрадь (в уроке, тогда остальные идут по порядку: теория, домашка, прочее).
   */
  feature?: 'homework' | 'workbook'
  className?: string
}

/** Ссылки плитками: главная широкой плиткой, остальное сеткой. */
export function LinkTiles({ links, feature = 'homework', className }: LinkTilesProps) {
  const featured =
    feature === 'workbook'
      ? links.find((l) => linkRole(l.title) === 'workbook')
      : links.find((l) => describeLink(l.url, l.title).kind === 'homework')
  const others = links.filter((l) => l !== featured)
  const rest = feature === 'workbook' ? orderLessonLinks(others) : others
  if (feature === 'workbook') {
    return (
      <div className={cn('flex flex-col gap-3', className)}>
        {featured && <WorkbookTile url={featured.url} title={featured.title} />}
        {rest.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
            {rest.map((link) => (
              <li key={link.url + link.title} className="min-w-0">
                <LinkTile title={link.title} url={link.url} />
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {featured && <HomeworkTile url={featured.url} title={featured.title} />}
      {rest.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
          {rest.map((link) => (
            <li key={link.url + link.title} className="min-w-0">
              <LinkTile title={link.title} url={link.url} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
