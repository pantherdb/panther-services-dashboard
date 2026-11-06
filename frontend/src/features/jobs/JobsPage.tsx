import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconBriefcase,
  IconCircleCheck,
} from '@tabler/icons-react'
import { Link, useNavigate } from 'react-router'

import { ChartPanel } from '@/@panther.core/charts'
import {
  DataTable,
  EmptyState,
  PageHeader,
  Panel,
  StatTile,
  StatusChip,
} from '@/@panther.core/components'
import type { Column } from '@/@panther.core/components'
import { formatCount, formatPct, formatSeconds, formatTime } from '@/@panther.core/format'
import { useJobsQuery } from '@/app/api/api'
import type { JobOut, JobServiceRow } from '@/app/api/types'
import { isJobPoint, jobScatterOption } from '@/features/jobs/jobCharts'
import { TIME_GROUP, toEvents } from '@/features/overview/trafficCharts'
import { FilterRow, rangeNote } from '@/features/shared/FilterRow'
import { NoData, PageState, Refreshing } from '@/features/shared/PageState'
import { useViewFilters } from '@/features/shared/useViewFilters'

const SLOWEST_LIMIT = 25

const serviceColumns: Column<JobServiceRow>[] = [
  { key: 'service', header: 'Service', mono: true, render: r => r.service },
  { key: 'jobs', header: 'Jobs', align: 'right', render: r => formatCount(r.jobs) },
  { key: 'ok', header: 'Succeeded', align: 'right', render: r => formatCount(r.succeeded) },
  { key: '4xx', header: 'Input errors', align: 'right', render: r => formatCount(r.inputErrors) },
  { key: '5xx', header: 'Server errors', align: 'right', render: r => formatCount(r.serverErrors) },
  { key: 'p50', header: 'Run p50', align: 'right', render: r => formatSeconds(r.ranP50) },
  { key: 'p95', header: 'Run p95', align: 'right', render: r => formatSeconds(r.ranP95) },
  { key: 'max', header: 'Run max', align: 'right', render: r => formatSeconds(r.ranMax) },
  { key: 'wait', header: 'Wait p95', align: 'right', render: r => formatSeconds(r.waitedP95) },
]

export function outcomeChip(job: JobOut) {
  if (job.outcome === 'succeeded') return <StatusChip tone="pass" label="Succeeded" />
  return (job.status ?? 0) >= 500 ? (
    <StatusChip tone="fail" label={`Failed ${job.status ?? ''}`.trim()} />
  ) : (
    <StatusChip tone="warn" label={`Refused ${job.status ?? ''}`.trim()} />
  )
}

const jobColumns: Column<JobOut>[] = [
  {
    key: 't',
    header: 'Finished (UTC)',
    mono: true,
    className: 'whitespace-nowrap',
    render: j => formatTime(j.t),
  },
  { key: 'service', header: 'Service', mono: true, render: j => j.service },
  { key: 'summary', header: 'Input', render: j => j.summary },
  { key: 'ran', header: 'Ran', align: 'right', render: j => formatSeconds(j.ranS) },
  { key: 'waited', header: 'Waited', align: 'right', render: j => formatSeconds(j.waitedS) },
  { key: 'outcome', header: 'Outcome', render: j => outcomeChip(j) },
  {
    key: 'id',
    header: 'Job',
    mono: true,
    render: j => (
      <Link to={`/jobs/${j.jobId}`} className="font-medium text-accent hover:underline">
        {j.jobId.slice(0, 8)}…
      </Link>
    ),
  },
]

/** Profiling the scoring jobs: how long they ran, how long they waited, and which failed. */
export function JobsPage() {
  const filters = useViewFilters()
  const navigate = useNavigate()
  const { data, error, isFetching } = useJobsQuery({ window: filters.window })

  if (!data) return <PageState title="Jobs" error={error} />
  if (!data.hasData) return <NoData title="Jobs" />

  const { jobs } = data
  const events = toEvents(data.markers, data.incidents, 60_000)
  const slowest = [...jobs].sort((a, b) => b.ranS - a.ranS).slice(0, SLOWEST_LIMIT)
  const openJob = (point: unknown) => {
    if (isJobPoint(point)) void navigate(`/jobs/${point.job.jobId}`)
  }
  const jobTable = (caption: string) => (
    <DataTable caption={caption} columns={jobColumns} rows={jobs} rowKey={j => j.jobId} />
  )

  const total = data.services.reduce((n, r) => n + r.jobs, 0)
  const succeeded = data.services.reduce((n, r) => n + r.succeeded, 0)
  const inputErrors = data.services.reduce((n, r) => n + r.inputErrors, 0)
  const serverErrors = data.services.reduce((n, r) => n + r.serverErrors, 0)
  const ICON = { size: 15, stroke: 1.75 }

  return (
    <>
      <PageHeader
        title="Jobs"
        description="How long the scoring jobs ran and waited, and which failed. Click a dot for that job's whole story."
        meta={rangeNote(data.range)}
        actions={<FilterRow window={filters.window} onWindow={filters.setWindow} />}
      />

      <Refreshing fetching={isFetching}>
        {jobs.length === 0 ? (
          <Panel title="Jobs">
            <EmptyState
              title="No finished jobs in this window."
              description="Jobs come from the API's log: one line per job when it finishes."
            />
          </Panel>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile
                label="Jobs finished"
                icon={<IconBriefcase {...ICON} />}
                value={formatCount(total)}
                hint={`${data.services.length} ${data.services.length === 1 ? 'service' : 'services'}`}
              />
              <StatTile
                label="Succeeded"
                icon={<IconCircleCheck {...ICON} />}
                value={formatPct(total ? (succeeded / total) * 100 : null)}
                hint={`${formatCount(succeeded)} of ${formatCount(total)}`}
              />
              <StatTile
                label="Input errors"
                icon={<IconAlertTriangle {...ICON} />}
                value={formatCount(inputErrors)}
                hint="refused or rejected, 4xx"
              />
              <StatTile
                label="Server errors"
                icon={<IconAlertOctagon {...ICON} />}
                value={formatCount(serverErrors)}
                hint="failed in the API, 5xx"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartPanel
                title="Run time"
                subtitle="One dot per job; a triangle failed. Click one for its story."
                option={jobScatterOption(jobs, 'ranS', events.lines, events.spans)}
                group={TIME_GROUP}
                dragToZoom
                onItemClick={openJob}
                heightClass="h-72"
                table={jobTable('Jobs and their run times')}
              />
              <ChartPanel
                title="Queue wait"
                subtitle="From submission to start: a queue building up shows as a climb."
                option={jobScatterOption(jobs, 'waitedS', events.lines, events.spans)}
                group={TIME_GROUP}
                dragToZoom
                onItemClick={openJob}
                heightClass="h-72"
                table={jobTable('Jobs and their wait times')}
              />
            </div>
            <Panel
              title="By service"
              subtitle="Run and wait times per scoring service"
              density="flush"
            >
              <DataTable
                caption="Jobs by service"
                columns={serviceColumns}
                rows={data.services}
                rowKey={r => r.service}
              />
            </Panel>
            <Panel
              title="Slowest jobs"
              subtitle={`The ${SLOWEST_LIMIT} longest runs in this window`}
              density="flush"
            >
              <DataTable
                caption="Slowest jobs"
                columns={jobColumns}
                rows={slowest}
                rowKey={j => j.jobId}
              />
            </Panel>
          </>
        )}
      </Refreshing>
    </>
  )
}
