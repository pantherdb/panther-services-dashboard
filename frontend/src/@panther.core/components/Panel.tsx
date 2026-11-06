import clsx from 'clsx'
import type { ReactNode } from 'react'

type Props = {
  title?: ReactNode
  /** One line under the title: what the card shows, or where it comes from. */
  subtitle?: ReactNode
  /** A small icon beside the title. */
  icon?: ReactNode
  /** A StatusChip in the header. */
  status?: ReactNode
  /** Controls, such as a chart/table toggle. */
  actions?: ReactNode
  footer?: ReactNode
  /** `flush` lets a table run edge to edge under a ruled header. */
  density?: 'normal' | 'tight' | 'flush'
  headingLevel?: 1 | 2 | 3 | 4
  className?: string
  children?: ReactNode
}

/**
 * The one container: a rounded card on `surface-1` with a hairline ring and a soft shadow, a
 * header with a title and a quiet subtitle, then the content. One card style everywhere, so the
 * data is what differs from panel to panel.
 */
export function Panel({
  title,
  subtitle,
  icon,
  status,
  actions,
  footer,
  density = 'normal',
  headingLevel = 2,
  className,
  children,
}: Props) {
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3' | 'h4'
  const hasHeader = Boolean(title || subtitle || status || actions)

  return (
    <section
      className={clsx(
        'flex min-w-0 flex-col overflow-hidden rounded-panel bg-surface-1 sd-card',
        className
      )}
    >
      {hasHeader && (
        <header
          className={clsx(
            'flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3.5',
            density === 'flush' ? 'pb-3 sd-hairline-b' : 'pb-1'
          )}
        >
          {icon && (
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-muted sd-hairline"
            >
              {icon}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            {title && <Heading className="text-sm font-semibold text-ink">{title}</Heading>}
            {subtitle && <span className="text-2xs text-ink-faint">{subtitle}</span>}
          </div>
          {(status || actions) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {status}
              {actions}
            </div>
          )}
        </header>
      )}
      <div
        className={clsx(
          'min-w-0 flex-1',
          density === 'flush' ? 'p-0' : density === 'tight' ? 'px-3 py-2' : 'px-4 pt-2 pb-4',
          density === 'normal' && !hasHeader && 'pt-4'
        )}
      >
        {children}
      </div>
      {footer && (
        <div className="bg-surface-2 px-4 py-2.5 text-2xs text-ink-muted sd-hairline-t">
          {footer}
        </div>
      )}
    </section>
  )
}
