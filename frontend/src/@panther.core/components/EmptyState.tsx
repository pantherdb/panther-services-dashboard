import { IconInbox } from '@tabler/icons-react'
import clsx from 'clsx'
import type { ReactNode } from 'react'

type Props = {
  title: string
  description?: ReactNode
  /** A control that fills or undoes whatever left the view empty. */
  action?: ReactNode
  icon?: ReactNode
  compact?: boolean
  className?: string
}

/** Nothing to show, and why: a filter left nothing, or there's no data of this kind. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  compact = false,
  className,
}: Props) {
  return (
    <div
      role="status"
      className={clsx(
        'flex items-start gap-3 text-ink-muted',
        compact ? 'py-3' : 'py-5',
        className
      )}
    >
      {!compact && (
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-faint sd-hairline"
        >
          {icon ?? <IconInbox size={18} stroke={1.75} />}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-ink">{title}</span>
        {description && <div className="max-w-prose text-xs">{description}</div>}
        {action && <div className="mt-1.5">{action}</div>}
      </div>
    </div>
  )
}
