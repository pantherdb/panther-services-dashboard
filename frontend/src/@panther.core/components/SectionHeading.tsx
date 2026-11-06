import clsx from 'clsx'
import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  level?: 2 | 3
  /** A figure the section summarises, such as `3 in this window`. */
  count?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

/** A heading between groups of cards on a page. */
export function SectionHeading({
  children,
  level = 2,
  count,
  description,
  actions,
  className,
}: Props) {
  const Heading = `h${level}` as 'h2' | 'h3'
  return (
    <div className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      <Heading className="text-lede font-semibold tracking-tight text-ink">{children}</Heading>
      {count !== undefined && (
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-3xs font-semibold text-ink-muted sd-figures">
          {count}
        </span>
      )}
      {actions && <span className="ml-auto flex flex-wrap items-center gap-2">{actions}</span>}
      {description && <p className="max-w-3xl basis-full text-xs text-ink-muted">{description}</p>}
    </div>
  )
}
