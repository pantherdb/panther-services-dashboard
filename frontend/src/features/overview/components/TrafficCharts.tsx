import clsx from 'clsx'

import { ChartPanel } from '@/@panther.core/charts'
import { DataTable, EmptyState, Panel } from '@/@panther.core/components'
import type { Column } from '@/@panther.core/components'
import { formatCount, formatMs, formatPct, formatTime } from '@/@panther.core/format'
import type { LatencyHeatmap, LogSource, TrafficPoint } from '@/app/api/types'
import {
  errorRateOption,
  heatSteps,
  latencyHeatmapOption,
  latencyOption,
  TIME_GROUP,
  volumeOption,
} from '@/features/overview/trafficCharts'
import type { Events } from '@/features/overview/trafficCharts'

type Props = {
  points: TrafficPoint[]
  heatmap: LatencyHeatmap | null
  events: Events
  bucketMs: number
  bucketLabel: string
  source: LogSource | null
  hasDurations: boolean
  onZoom: (window: [number, number] | null) => void
}

const time: Column<TrafficPoint> = {
  key: 't',
  header: 'Bucket start (UTC)',
  mono: true,
  render: p => formatTime(p.t),
}

function pointTable(columns: Column<TrafficPoint>[], points: TrafficPoint[], caption: string) {
  return (
    <DataTable
      caption={caption}
      columns={[time, ...columns]}
      rows={points}
      rowKey={p => String(p.t)}
    />
  )
}

// Whole class names, so Tailwind finds them.
const SWATCH = ['bg-seq-1', 'bg-seq-2', 'bg-seq-3', 'bg-seq-4', 'bg-seq-5']

/** The heatmap's key: each step of the ramp and the counts it covers. */
function HeatLegend({ maxCount }: { maxCount: number }) {
  const steps = heatSteps(maxCount)
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-3xs text-ink-faint">
      <span>Requests per cell</span>
      {steps.map(([lo, hi], i) => (
        <span key={lo} className="flex items-center gap-1.5 sd-figures">
          <span aria-hidden="true" className={clsx('h-2.5 w-4 rounded-sm', SWATCH[i])} />
          {lo === hi ? formatCount(lo) : `${formatCount(lo)} to ${formatCount(hi)}`}
        </span>
      ))}
    </div>
  )
}

type HeatRow = { t: number; band: string; count: number }

/**
 * The traffic charts on one time axis. Hover one and the crosshair follows on all; drag across
 * one to zoom all of them. Container events are lines and incidents are shaded, on every chart.
 */
export function TrafficCharts({
  points,
  heatmap,
  events,
  bucketMs,
  bucketLabel,
  source,
  hasDurations,
  onZoom,
}: Props) {
  const per = `per ${bucketLabel}`
  const shared = { group: TIME_GROUP, dragToZoom: true, onZoom }
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartPanel
        title="Requests"
        subtitle={`${source === 'api' ? "API's access log" : 'nginx'}, ${per}`}
        option={volumeOption(points, events)}
        {...shared}
        table={pointTable(
          [{ key: 'n', header: 'Requests', align: 'right', render: p => formatCount(p.total) }],
          points,
          'Requests per bucket'
        )}
      />
      <ChartPanel
        title="Server errors (5xx)"
        subtitle={`% of requests, ${per}`}
        option={errorRateOption(points, 'server', events)}
        {...shared}
        table={pointTable(
          [
            { key: 'n', header: '5xx', align: 'right', render: p => formatCount(p.serverErrors) },
            {
              key: 'pct',
              header: '% of requests',
              align: 'right',
              render: p => formatPct(p.serverErrorPct, 2),
            },
          ],
          points,
          'Server errors per bucket'
        )}
      />
      <ChartPanel
        title="Client errors (4xx)"
        subtitle={`% of requests, ${per}`}
        option={errorRateOption(points, 'client', events)}
        {...shared}
        table={pointTable(
          [
            { key: 'n', header: '4xx', align: 'right', render: p => formatCount(p.clientErrors) },
            {
              key: 'pct',
              header: '% of requests',
              align: 'right',
              render: p => formatPct(p.clientErrorPct, 2),
            },
          ],
          points,
          'Client errors per bucket'
        )}
      />
      {hasDurations ? (
        <ChartPanel
          title="Latency"
          subtitle={`p50, p95 and p99 request time, ${per}`}
          option={latencyOption(points, events)}
          {...shared}
          table={pointTable(
            [
              { key: 'p50', header: 'p50', align: 'right', render: p => formatMs(p.p50) },
              { key: 'p95', header: 'p95', align: 'right', render: p => formatMs(p.p95) },
              { key: 'p99', header: 'p99', align: 'right', render: p => formatMs(p.p99) },
            ],
            points,
            'Latency percentiles per bucket'
          )}
        />
      ) : (
        <Panel title="Latency">
          <EmptyState
            title="No request times in this log."
            description={
              source === 'api' ? (
                <>
                  Uvicorn&apos;s access log doesn&apos;t record how long a request took. Count
                  requests from nginx, with times in its log format.
                </>
              ) : (
                <>
                  nginx&apos;s default <span className="sd-ident">main</span> format has no times.
                  Add{' '}
                  <span className="sd-ident">
                    rt=$request_time urt=&quot;$upstream_response_time&quot;
                  </span>{' '}
                  to the end of its <span className="sd-ident">log_format</span> and latency is
                  charted here.
                </>
              )
            }
          />
        </Panel>
      )}
      {heatmap && heatmap.cells.length > 0 && (
        <ChartPanel
          className="xl:col-span-2"
          title="Latency distribution"
          subtitle={`every request by how long it took, ${per}: a second band is a slow path the percentiles hide`}
          option={latencyHeatmapOption(heatmap, bucketMs, events)}
          {...shared}
          heightClass="h-72"
          legend={<HeatLegend maxCount={heatmap.maxCount} />}
          table={
            <DataTable<HeatRow>
              caption="Requests by time and latency band"
              columns={[
                {
                  key: 't',
                  header: 'Bucket start (UTC)',
                  mono: true,
                  render: r => formatTime(r.t),
                },
                { key: 'band', header: 'Took', render: r => r.band },
                {
                  key: 'n',
                  header: 'Requests',
                  align: 'right',
                  render: r => formatCount(r.count),
                },
              ]}
              rows={heatmap.cells.map(c => ({
                t: c.t,
                band: heatmap.bins[c.bin]?.label ?? '',
                count: c.count,
              }))}
              rowKey={r => `${r.t}-${r.band}`}
            />
          }
        />
      )}
    </div>
  )
}
