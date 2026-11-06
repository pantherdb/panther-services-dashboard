import { SegmentedControl } from '@mantine/core'
import { useState } from 'react'

import { DataTable, Panel } from '@/@panther.core/components'
import type { Column } from '@/@panther.core/components'
import { formatCount, formatMs, formatPct } from '@/@panther.core/format'
import type { EndpointRow } from '@/app/api/types'

type Props = { rows: EndpointRow[] }

const SORTS = {
  requests: (a: EndpointRow, b: EndpointRow) => b.requests - a.requests,
  errors: (a: EndpointRow, b: EndpointRow) =>
    b.serverErrors + b.clientErrors - (a.serverErrors + a.clientErrors) || b.requests - a.requests,
  slowest: (a: EndpointRow, b: EndpointRow) => (b.p95 ?? -1) - (a.p95 ?? -1),
} as const

type SortKey = keyof typeof SORTS

const LIMIT = 30

const columns: Column<EndpointRow>[] = [
  { key: 'method', header: 'Method', mono: true, render: r => r.method },
  {
    key: 'route',
    header: 'Route',
    mono: true,
    className: 'w-full whitespace-nowrap',
    render: r => r.route,
  },
  { key: 'requests', header: 'Requests', align: 'right', render: r => formatCount(r.requests) },
  { key: '4xx', header: '4xx', align: 'right', render: r => formatCount(r.clientErrors) },
  { key: '5xx', header: '5xx', align: 'right', render: r => formatCount(r.serverErrors) },
  { key: 'err', header: 'Error %', align: 'right', render: r => formatPct(r.errorPct) },
  { key: 'p50', header: 'p50', align: 'right', render: r => formatMs(r.p50) },
  { key: 'p95', header: 'p95', align: 'right', render: r => formatMs(r.p95) },
  { key: 'max', header: 'Max', align: 'right', render: r => formatMs(r.max) },
]

/** Requests by route: where the traffic, the failures and the slow requests are. */
export function EndpointTable({ rows }: Props) {
  const [sort, setSort] = useState<SortKey>('requests')
  const sorted = [...rows].sort(SORTS[sort]).slice(0, LIMIT)

  return (
    <Panel
      title="Endpoints"
      subtitle={rows.length > LIMIT ? `top ${LIMIT} of ${rows.length}` : `${rows.length} routes`}
      density="flush"
      actions={
        <SegmentedControl
          aria-label="Sort endpoints by"
          value={sort}
          onChange={value => setSort(value as SortKey)}
          data={[
            { value: 'requests', label: 'Busiest' },
            { value: 'errors', label: 'Most errors' },
            { value: 'slowest', label: 'Slowest p95' },
          ]}
        />
      }
    >
      <DataTable
        caption="Requests by route"
        columns={columns}
        rows={sorted}
        rowKey={r => `${r.method} ${r.route}`}
      />
    </Panel>
  )
}
