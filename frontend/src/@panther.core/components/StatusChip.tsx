import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleHalf2,
  IconCircleX,
  IconPointFilled,
} from '@tabler/icons-react'
import clsx from 'clsx'

import type { StatusTone } from '@/@panther.core/theme/tokens'

type Props = {
  tone: StatusTone
  label: string
  className?: string
}

// Whole class names, so Tailwind finds them when it scans the source.
const toneClass: Record<StatusTone, string> = {
  pass: 'bg-status-pass-wash text-status-pass',
  warn: 'bg-status-warn-wash text-status-warn',
  hole: 'bg-status-hole-wash text-status-hole',
  fail: 'bg-status-fail-wash text-status-fail',
  active: 'bg-status-active-wash text-status-active',
  neutral: 'bg-status-neutral-wash text-status-neutral',
}

const toneIcon = {
  pass: IconCircleCheck,
  warn: IconAlertTriangle,
  hole: IconCircleHalf2,
  fail: IconCircleX,
  active: IconPointFilled,
  neutral: IconCircleDashed,
} as const

/**
 * A state, always as colour AND a shape AND a word, so it reads in a monochrome print, under
 * colour-vision deficiency and at a glance. Never colour alone.
 */
export function StatusChip({ tone, label, className }: Props) {
  const Icon = toneIcon[tone]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full py-0.5 pr-2 pl-1.5 text-3xs font-semibold whitespace-nowrap',
        toneClass[tone],
        className
      )}
    >
      <Icon size={13} stroke={2} aria-hidden="true" />
      {label}
    </span>
  )
}
