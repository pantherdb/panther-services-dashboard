import { IconArrowLeft } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

type Props = {
  title: ReactNode
  description?: ReactNode
  /** Controls that scope the whole page, such as the time window. */
  actions?: ReactNode
  /** A line under the description: the time range shown, a count. */
  meta?: ReactNode
  back?: { to: string; label: string }
}

/** The top of every page: what it is, what it's for, and the controls that scope it. */
export function PageHeader({ title, description, actions, meta, back }: Props) {
  return (
    <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {back && (
          <Link
            to={back.to}
            className="mb-1 inline-flex items-center gap-1 self-start text-2xs font-medium text-ink-muted hover:text-ink"
          >
            <IconArrowLeft size={14} aria-hidden="true" />
            {back.label}
          </Link>
        )}
        <h1 className="text-title font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="max-w-3xl text-xs text-ink-muted">{description}</p>}
        {meta && <div className="text-2xs text-ink-faint sd-figures">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 xl:justify-end">{actions}</div>}
    </header>
  )
}
