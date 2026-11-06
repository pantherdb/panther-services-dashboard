import clsx from 'clsx'

import type { Source } from '@/features/shared/apiTypes'

// Identity, not state: the first three categorical slots, the only ones that stay apart for every
// pair under colour-vision deficiency. Always with the word, never the dot alone.
const DOT: Record<Source, string> = {
  api: 'bg-series-1',
  nginx: 'bg-series-2',
  docker: 'bg-series-3',
}

const LABEL: Record<Source, string> = { api: 'API', nginx: 'nginx', docker: 'Docker' }

/** Which of the three sources a line came from. */
export function SourceBadge({ source, className }: { source: Source; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-2 pl-1.5 text-3xs font-semibold whitespace-nowrap text-ink-muted sd-hairline',
        className
      )}
    >
      <span aria-hidden="true" className={clsx('size-1.5 rounded-full', DOT[source])} />
      {LABEL[source]}
    </span>
  )
}
