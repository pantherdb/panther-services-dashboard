import { Button, CopyButton } from '@mantine/core'
import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconArrowRight,
  IconBulb,
  IconCheck,
  IconCopy,
  IconCpu,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { Link } from 'react-router'

import { ChartPanel } from '@/@panther.core/charts'
import { DataTable, EmptyState, PageHeader, Panel } from '@/@panther.core/components'
import type { Column } from '@/@panther.core/components'
import {
  ABSENT,
  formatBucket,
  formatBytes,
  formatPct,
  formatShort,
  formatTime,
} from '@/@panther.core/format'
import { useResourcesQuery } from '@/app/api/api'
import type {
  ConcurrencyPoint,
  ResourceContainer,
  ResourceNote,
  ResourcePoint,
  Tone,
} from '@/app/api/types'
import { TIME_GROUP, toEvents } from '@/features/overview/trafficCharts'
import {
  concurrencyOption,
  containerLabel,
  cpuOption,
  memoryAsShare,
  memoryOption,
} from '@/features/resources/resourceCharts'
import { FilterRow, rangeNote } from '@/features/shared/FilterRow'
import { NoData, PageState, Refreshing } from '@/features/shared/PageState'
import { useViewFilters } from '@/features/shared/useViewFilters'
import { timelineSearch } from '@/features/timeline/timelineLink'

const RECORD = 'uv run services-dashboard record-stats ../exports/stats.log --every 5'

// Whole class names, so Tailwind finds them.
const NOTE_STYLE: Record<Tone, string> = {
  fail: 'bg-status-fail-wash text-status-fail',
  warn: 'bg-status-warn-wash text-status-warn',
  pass: 'bg-status-pass-wash text-status-pass',
  active: 'bg-accent-wash text-accent',
  neutral: 'bg-accent-wash text-accent',
}

function NoteIcon({ tone }: { tone: Tone }) {
  const Icon = tone === 'fail' ? IconAlertOctagon : tone === 'warn' ? IconAlertTriangle : IconBulb
  return (
    <span
      aria-hidden="true"
      className={clsx('grid size-8 shrink-0 place-items-center rounded-lg', NOTE_STYLE[tone])}
    >
      <Icon size={17} stroke={1.75} />
    </span>
  )
}

/** What the stats say once joined to jobs and container events: the reason this page exists. */
function Notes({ notes }: { notes: ResourceNote[] }) {
  return (
    <Panel
      title="What the stats say"
      subtitle="CPU and memory joined to the jobs that were running and to Docker's events"
      icon={<IconBulb size={16} stroke={1.75} />}
    >
      {notes.length === 0 ? (
        <EmptyState
          title="Nothing stands out in this window."
          description="No climb to a memory limit, and jobs ran no slower when CPU was high."
          compact
        />
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {notes.map(n => (
            <li
              key={`${n.t}-${n.text}`}
              className="flex items-start gap-3 py-3 first:pt-1 last:pb-0"
            >
              <NoteIcon tone={n.tone} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-xs text-ink">{n.text}</span>
                <span className="text-3xs text-ink-faint sd-figures">{formatTime(n.t)} UTC</span>
              </div>
              <Button
                component={Link}
                to={{
                  pathname: '/timeline',
                  search: timelineSearch(n.t - 5 * 60_000, n.t + 5 * 60_000),
                }}
                variant="subtle"
                size="compact-xs"
                rightSection={<IconArrowRight size={13} />}
              >
                Timeline
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** A container's peaks, with its memory peak as a share of its limit. */
function ContainerPeak({ c }: { c: ResourceContainer }) {
  const share = c.memLimitBytes ? (c.memPeakBytes / c.memLimitBytes) * 100 : null
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-panel bg-surface-1 p-4 sd-card">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-muted sd-hairline"
        >
          <IconCpu size={18} stroke={1.75} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-ink">{containerLabel(c)}</span>
          <span className="truncate sd-ident text-2xs text-ink-faint">{c.name}</span>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <div className="flex flex-col">
          <dt className="text-3xs text-ink-faint">Peak CPU</dt>
          <dd className="text-lede font-semibold text-ink sd-figures">
            {formatPct(c.cpuPeakPct, 0)}
          </dd>
          <dd className="text-3xs text-ink-faint sd-figures">{formatShort(c.cpuPeakT)} UTC</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-3xs text-ink-faint">Peak memory</dt>
          <dd className="text-lede font-semibold text-ink sd-figures">
            {formatBytes(c.memPeakBytes)}
          </dd>
          <dd className="text-3xs text-ink-faint sd-figures">
            {c.memLimitBytes ? `of ${formatBytes(c.memLimitBytes)} limit` : 'no limit set'}
          </dd>
        </div>
      </dl>
      {share !== null && (
        <div className="flex flex-col gap-1">
          <div
            role="meter"
            aria-label={`${containerLabel(c)}: peak memory, share of its limit`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(share)}
            className="h-1.5 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min(100, share)}%` }}
            />
          </div>
          <span className="text-3xs text-ink-faint sd-figures">
            {formatPct(share, 0)} of its limit at {formatTime(c.memPeakT).slice(11, 19)} UTC
          </span>
        </div>
      )}
    </li>
  )
}

function NoStats() {
  return (
    <Panel title="No CPU or memory recorded">
      <EmptyState
        icon={<IconCpu size={18} stroke={1.75} />}
        title="Load a docker stats recording to see CPU and memory here."
        description={
          <div className="flex flex-col gap-2">
            <span>
              <span className="sd-ident">docker stats</span> has no history, so record it while you
              use the site, from <span className="sd-ident">backend/</span>, and load the file on
              the Files page:
            </span>
            <span className="flex items-center gap-2">
              <code className="rounded-md bg-surface-2 px-2 py-1 text-2xs text-ink sd-hairline">
                {RECORD}
              </code>
              <CopyButton value={RECORD}>
                {({ copied, copy }) => (
                  <Button size="compact-xs" aria-label="Copy the command" onClick={copy}>
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </Button>
                )}
              </CopyButton>
            </span>
          </div>
        }
      />
    </Panel>
  )
}

type PointRow = { t: number; values: Map<string, ResourcePoint> }

function pointRows(points: readonly ResourcePoint[]): PointRow[] {
  const rows = new Map<number, PointRow>()
  for (const p of points) {
    const row = rows.get(p.t) ?? { t: p.t, values: new Map() }
    row.values.set(p.container, p)
    rows.set(p.t, row)
  }
  return [...rows.values()].sort((a, b) => a.t - b.t)
}

const timeColumn = <T extends { t: number }>(): Column<T> => ({
  key: 't',
  header: 'Bucket start (UTC)',
  mono: true,
  render: r => formatTime(r.t),
})

/**
 * CPU and memory per container from `docker stats`, beside the jobs the API was running: whether a
 * slow job was the machine, and what a container did before it was killed.
 */
export function ResourcesPage() {
  const filters = useViewFilters()
  const { data, error, isFetching } = useResourcesQuery({ window: filters.window })

  if (!data) return <PageState title="Resources" error={error} />
  if (!data.hasData) return <NoData title="Resources" />

  const events = toEvents(data.markers, data.incidents, data.bucketMs)
  const per = `per ${formatBucket(data.bucketMs)}`
  const rows = pointRows(data.points)
  const share = memoryAsShare(data.containers)
  const shared = { group: TIME_GROUP, dragToZoom: true }

  return (
    <>
      <PageHeader
        title="Resources"
        description="CPU and memory per container from docker stats, beside the jobs the API was running and Docker's events."
        meta={rangeNote(data.range)}
        actions={<FilterRow window={filters.window} onWindow={filters.setWindow} />}
      />
      <Refreshing fetching={isFetching}>
        {!data.hasStats ? (
          <NoStats />
        ) : (
          <>
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[2fr_3fr]">
              <ul aria-label="Containers' peaks" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {data.containers.map(c => (
                  <ContainerPeak key={c.name} c={c} />
                ))}
              </ul>
              <Notes notes={data.notes} />
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartPanel
                title="CPU"
                subtitle={`Highest in each ${formatBucket(data.bucketMs)}; 100% is one core`}
                option={cpuOption(data.points, data.containers, events)}
                {...shared}
                table={
                  <DataTable<PointRow>
                    caption="CPU per container per bucket"
                    columns={[
                      timeColumn<PointRow>(),
                      ...data.containers.map((c): Column<PointRow> => ({
                        key: c.name,
                        header: containerLabel(c),
                        align: 'right',
                        render: r => {
                          const v = r.values.get(c.name)?.cpuPct
                          return v == null ? ABSENT : formatPct(v, 0)
                        },
                      })),
                    ]}
                    rows={rows}
                    rowKey={r => String(r.t)}
                  />
                }
              />
              <ChartPanel
                title="Memory"
                subtitle={
                  share
                    ? `Highest in each ${formatBucket(data.bucketMs)}, as a share of the container's limit`
                    : `Highest in each ${formatBucket(data.bucketMs)}`
                }
                option={memoryOption(data.points, data.containers, events)}
                {...shared}
                table={
                  <DataTable<PointRow>
                    caption="Memory per container per bucket"
                    columns={[
                      timeColumn<PointRow>(),
                      ...data.containers.map((c): Column<PointRow> => ({
                        key: c.name,
                        header: containerLabel(c),
                        align: 'right',
                        render: r => {
                          const v = r.values.get(c.name)?.memBytes
                          return v == null ? ABSENT : formatBytes(v)
                        },
                      })),
                    ]}
                    rows={rows}
                    rowKey={r => String(r.t)}
                  />
                }
              />
            </div>
          </>
        )}
        {data.concurrency.length > 0 && (
          <ChartPanel
            title="Jobs in flight"
            subtitle={`Jobs running and waiting in the API, on average ${per}, from its finish lines`}
            option={concurrencyOption(data.concurrency, events)}
            {...shared}
            table={
              <DataTable<ConcurrencyPoint>
                caption="Jobs running and waiting per bucket"
                columns={[
                  timeColumn<ConcurrencyPoint>(),
                  {
                    key: 'running',
                    header: 'Running',
                    align: 'right',
                    render: p => p.running.toFixed(1),
                  },
                  {
                    key: 'waiting',
                    header: 'Waiting',
                    align: 'right',
                    render: p => p.waiting.toFixed(1),
                  },
                ]}
                rows={data.concurrency}
                rowKey={p => String(p.t)}
              />
            }
          />
        )}
      </Refreshing>
    </>
  )
}
