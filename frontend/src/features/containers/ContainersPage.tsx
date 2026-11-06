import { IconBox } from '@tabler/icons-react'

import { DataTable, EmptyState, PageHeader, Panel, StatusChip } from '@/@panther.core/components'
import type { Column } from '@/@panther.core/components'
import { ABSENT, formatCount, formatTime } from '@/@panther.core/format'
import { useContainersQuery } from '@/app/api/api'
import type { ContainerEvent, ContainerOut } from '@/app/api/types'
import { PageState, Refreshing } from '@/features/shared/PageState'

function stateChip(c: ContainerOut) {
  if (c.oomKilled) return <StatusChip tone="fail" label="Out of memory" />
  switch (c.status) {
    case 'running':
      return <StatusChip tone="pass" label="Running" />
    case 'restarting':
      return <StatusChip tone="warn" label="Restarting" />
    case 'exited':
    case 'dead':
      return (
        <StatusChip
          tone={c.exitCode === 0 ? 'neutral' : 'fail'}
          label={`Exited ${c.exitCode ?? ''}`.trim()}
        />
      )
    default:
      return <StatusChip tone="neutral" label={c.status} />
  }
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-3xs text-ink-faint">{label}</dt>
      <dd className="truncate text-xs text-ink sd-figures">{children}</dd>
    </div>
  )
}

/** One container's state from `docker inspect`, as a card: there are only a few of them. */
function ContainerCard({ c }: { c: ContainerOut }) {
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-panel bg-surface-1 p-4 sd-card">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-muted sd-hairline"
        >
          <IconBox size={18} stroke={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-ink">{c.service ?? c.name}</span>
          <span className="truncate sd-ident text-2xs text-ink-faint">{c.name}</span>
        </div>
        {stateChip(c)}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Fact label="Started (UTC)">{c.startedAt ? formatTime(c.startedAt) : ABSENT}</Fact>
        <Fact label="Stopped (UTC)">{c.finishedAt ? formatTime(c.finishedAt) : ABSENT}</Fact>
        <Fact label="Restarts">{formatCount(c.restartCount)}</Fact>
        <Fact label="Health">{c.health ?? ABSENT}</Fact>
        <div className="col-span-2">
          <Fact label="Image">
            <span className="sd-ident">{c.image ?? ABSENT}</span>
          </Fact>
        </div>
      </dl>
      {c.error && <p className="text-xs text-status-fail">{c.error}</p>}
    </li>
  )
}

const eventColumns: Column<ContainerEvent>[] = [
  {
    key: 't',
    header: 'Time (UTC)',
    mono: true,
    className: 'whitespace-nowrap',
    render: e => formatTime(e.t),
  },
  {
    key: 'tone',
    header: 'State',
    render: e => (
      <StatusChip
        tone={e.tone}
        label={
          e.tone === 'fail'
            ? 'Failure'
            : e.tone === 'warn'
              ? 'Warning'
              : e.tone === 'pass'
                ? 'OK'
                : 'Change'
        }
      />
    ),
  },
  { key: 'text', header: 'What happened', render: e => e.text },
  {
    key: 'container',
    header: 'Container',
    mono: true,
    className: 'text-ink-muted',
    render: e => e.container,
  },
  {
    key: 'action',
    header: 'Docker action',
    mono: true,
    className: 'text-ink-faint',
    render: e => e.action,
  },
]

/** Docker's own record: each container's state from `docker inspect`, and its events. */
export function ContainersPage() {
  const { data, error, isFetching } = useContainersQuery()
  if (!data) return <PageState title="Containers" error={error} />

  return (
    <>
      <PageHeader
        title="Containers"
        description="Docker's own record: each container's state when it was inspected, and every start, stop and out-of-memory kill."
        meta={`${data.containers.length} containers, ${formatCount(data.events.length)} events`}
      />
      <Refreshing fetching={isFetching}>
        {data.containers.length ? (
          <ul
            aria-label="Containers"
            className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3"
          >
            {data.containers.map(c => (
              <ContainerCard key={c.containerId || c.name} c={c} />
            ))}
          </ul>
        ) : (
          <Panel title="State">
            <EmptyState
              title="No docker inspect output loaded."
              description={
                <>
                  Export it with{' '}
                  <span className="sd-ident">
                    docker inspect $(docker compose ps -aq) &gt; inspect.json
                  </span>{' '}
                  and load it on the Files page.
                </>
              }
            />
          </Panel>
        )}
        <Panel title="Events" subtitle="Newest first" density="flush">
          {data.events.length ? (
            <DataTable
              caption="Container events, newest first"
              columns={eventColumns}
              rows={data.events}
              rowKey={e => `${e.t}-${e.container}-${e.action}`}
              maxHeightClass="max-h-[36rem]"
            />
          ) : (
            <div className="px-4">
              <EmptyState
                title="No Docker events loaded."
                description={
                  <>
                    Export them with{' '}
                    <span className="sd-ident">
                      docker events --since 24h --until &quot;$(date -u +%Y-%m-%dT%H:%M:%SZ)&quot;
                      --format &apos;{'{{json .}}'}&apos; &gt; events.log
                    </span>
                    . Docker keeps only recent events: export soon after an incident.
                  </>
                }
              />
            </div>
          )}
        </Panel>
      </Refreshing>
    </>
  )
}
