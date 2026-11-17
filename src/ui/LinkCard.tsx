import {
  ArrowUpRight,
  CloudArrowDown,
  FileText,
  GithubLogo,
  Globe,
  NotePencil,
  PaperPlaneTilt,
  YoutubeLogo,
  type Icon,
} from '@phosphor-icons/react'
import { cn } from './cn'

/** Адрес без протокола и www: по нему видно, куда ведёт ссылка. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function iconFor(url: string, title: string): Icon {
  const host = linkHost(url)
  if (/домаш|дз/i.test(title)) return NotePencil
  if (/disk\.yandex|yadi\.sk|drive\.google|cloud\.mail/.test(host)) return CloudArrowDown
  if (/youtube|youtu\.be|rutube|vk\.com\/video|vkvideo/.test(host)) return YoutubeLogo
  if (/github/.test(host)) return GithubLogo
  if (/t\.me|telegram/.test(host)) return PaperPlaneTilt
  if (/docs\.google|\.pdf$/.test(url)) return FileText
  return Globe
}

interface LinkCardProps {
  title: string
  url: string
  /** Главная ссылка, например на домашку: выделяется синим. */
  accent?: boolean
  /** Подпись вместо адреса сайта. */
  note?: string
  className?: string
}

/** Ссылка строкой: значок по типу сайта, название, адрес и стрелка «откроется в новой вкладке». */
export function LinkCard({ title, url, accent, note, className }: LinkCardProps) {
  const Icon = iconFor(url, title)
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'group flex min-h-14 items-center gap-3 rounded-control border px-3 py-2 transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
        accent ? 'border-pen bg-pen-soft hover:bg-pen-soft/70' : 'border-line bg-surface hover:border-muted/60 hover:bg-sunken',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-control',
          accent ? 'bg-pen text-pen-ink' : 'bg-sunken text-pen',
        )}
      >
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate font-medium', accent && 'text-pen')}>{title}</span>
        <span className="num block truncate text-xs text-muted">{note ?? linkHost(url)}</span>
      </span>
      <ArrowUpRight
        size={18}
        aria-hidden
        className="shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-pen"
      />
      <span className="sr-only">(откроется в новой вкладке)</span>
    </a>
  )
}

/** Список ссылок сеткой: на телефоне в столбик, шире — в две колонки. */
export function LinkList({ links, className }: { links: { title: string; url: string }[]; className?: string }) {
  return (
    <ul className={cn('grid gap-2 sm:grid-cols-2', className)}>
      {links.map((link) => (
        <li key={link.url + link.title} className="min-w-0">
          <LinkCard title={link.title} url={link.url} />
        </li>
      ))}
    </ul>
  )
}
