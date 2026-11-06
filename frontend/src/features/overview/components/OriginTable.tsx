import { DataTable, EmptyState, Panel, StatusChip } from '@/@panther.core/components'
import type { Column } from '@/@panther.core/components'
import { formatCount } from '@/@panther.core/format'
import type { OriginRow } from '@/app/api/types'

type Props = { rows: OriginRow[]; hasApiLog: boolean }

const columns: Column<OriginRow>[] = [
  {
    key: 'origin',
    header: 'Failed where',
    render: r => <StatusChip tone={r.tone} label={r.label} />,
  },
  { key: 'count', header: 'Requests', align: 'right', render: r => formatCount(r.count) },
  { key: 'what', header: 'What it means', render: r => r.description },
  {
    key: 'example',
    header: 'First one',
    mono: true,
    className: 'text-ink-muted',
    render: r => r.example,
  },
]

/**
 * Where each failed request failed, by matching nginx's line for it to the API's own line: the
 * question a 502 alone can't answer.
 */
export function OriginTable({ rows, hasApiLog }: Props) {
  return (
    <Panel
      title="Where requests failed"
      subtitle="nginx's failures, matched to the API's own lines"
      density="flush"
      footer={
        hasApiLog
          ? undefined
          : "The API's log isn't loaded, so a 5xx can't be traced into the API. Load it to tell API errors from an unreachable API."
      }
    >
      {rows.length === 0 ? (
        <div className="px-3">
          <EmptyState title="No failed requests in this window." compact />
        </div>
      ) : (
        <DataTable
          caption="Failed requests by where they failed"
          columns={columns}
          rows={rows}
          rowKey={r => r.origin}
        />
      )}
    </Panel>
  )
}
