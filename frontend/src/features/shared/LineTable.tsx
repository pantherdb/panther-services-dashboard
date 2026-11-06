import { DataTable } from '@/@panther.core/components'
import type { Column } from '@/@panther.core/components'
import { formatTime } from '@/@panther.core/format'
import type { Line } from '@/features/shared/apiTypes'
import { LevelChip } from '@/features/shared/LevelChip'
import { SourceBadge } from '@/features/shared/SourceBadge'

type Props = {
  lines: readonly Line[]
  caption: string
  maxHeightClass?: string
}

const columns: Column<Line>[] = [
  {
    key: 't',
    header: 'Time (UTC)',
    mono: true,
    className: 'whitespace-nowrap',
    render: l => formatTime(l.t),
  },
  { key: 'source', header: 'Source', render: l => <SourceBadge source={l.source} /> },
  { key: 'level', header: 'Level', render: l => <LevelChip level={l.level} /> },
  {
    key: 'logger',
    header: 'From',
    mono: true,
    className: 'whitespace-nowrap text-ink-muted',
    render: l => l.logger,
  },
  {
    key: 'message',
    header: 'Message',
    mono: true,
    render: l =>
      l.detail ? (
        <details>
          <summary className="cursor-pointer">{l.message}</summary>
          <pre className="mt-1 whitespace-pre-wrap text-ink-muted">{l.detail}</pre>
        </details>
      ) : (
        l.message
      ),
  },
]

/** Log lines, newest first; a traceback opens under its line. */
export function LineTable({ lines, caption, maxHeightClass }: Props) {
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={lines}
      rowKey={l => l.key}
      maxHeightClass={maxHeightClass}
    />
  )
}
