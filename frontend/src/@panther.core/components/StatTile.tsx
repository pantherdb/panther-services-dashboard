import type { ReactNode } from 'react'

import { Sparkline } from '@/@panther.core/charts/Sparkline'
import type { TokenRef } from '@/@panther.core/theme/tokens'

type Props = {
  label: string
  value: ReactNode
  /** One line under the value: a count behind a percentage, or why it's missing. */
  hint?: ReactNode
  /** A StatusChip, when the value is a state worth flagging. */
  status?: ReactNode
  /** A small icon beside the label. */
  icon?: ReactNode
  /** The value over the window, drawn small under it. */
  trend?: { values: readonly (number | null)[]; color: TokenRef }
}

/** A headline number, with its trend when there is one. */
export function StatTile({ label, value, hint, status, icon, trend }: Props) {
  return (
    <div className="flex min-w-0 flex-col rounded-panel bg-surface-1 px-4 pt-3.5 pb-3 sd-card">
      <div className="flex items-center gap-2">
        {icon && (
          <span aria-hidden="true" className="text-ink-faint">
            {icon}
          </span>
        )}
        <span className="truncate text-2xs font-medium text-ink-muted">{label}</span>
        {status && <span className="ml-auto">{status}</span>}
      </div>
      <span className="mt-1.5 text-display font-semibold tracking-tight text-ink sd-figures">
        {value}
      </span>
      {hint && <span className="mt-0.5 truncate text-2xs text-ink-faint">{hint}</span>}
      {trend && <Sparkline values={trend.values} color={trend.color} className="mt-2 h-8 w-full" />}
    </div>
  )
}
