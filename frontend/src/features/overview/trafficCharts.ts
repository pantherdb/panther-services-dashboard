/**
 * The overview's time-series charts, as ECharts options: pure functions of the API's points.
 *
 * Small multiples on one shared time axis, not one stacked status chart: request volume, the 5xx
 * rate and the 4xx rate are each one series in one colour. Stacking 2xx/4xx/5xx in status colours
 * failed the palette check (amber and red are nearly identical under deuteranopia).
 *
 * Every chart carries the same event marks (container events, API starts) and incident spans, so
 * a spike and its cause line up across all of them.
 */
import {
  eventMarks,
  fadingArea,
  lineSeries,
  timeSeriesBase,
  tooltipCard,
} from '@/@panther.core/charts'
import type { ChartOption, EventLine, EventSpan } from '@/@panther.core/charts'
import { formatCount, formatMs, formatPct, formatTime } from '@/@panther.core/format'
import {
  ink,
  MARK,
  nominalFill,
  ordinalFill,
  RAMP_STEPS,
  sequentialFill,
  statusFill,
} from '@/@panther.core/theme/tokens'
import type { Incident, LatencyHeatmap, Marker, TrafficPoint } from '@/app/api/types'

/** Charts in this group share a crosshair and zoom. */
export const TIME_GROUP = 'time'

export type Events = { lines: EventLine[]; spans: EventSpan[]; minSpanMs: number }

export function toEvents(markers: Marker[], incidents: Incident[], minSpanMs: number): Events {
  return {
    lines: markers.map(m => ({ t: m.t, label: m.label, tone: m.tone })),
    spans: incidents.map(i => ({ start: i.start, end: i.end, tone: i.tone })),
    minSpanMs,
  }
}

const marks = (e: Events) => eventMarks(e.lines, e.spans, e.minSpanMs)

export function volumeOption(points: readonly TrafficPoint[], events: Events): ChartOption {
  return {
    ...timeSeriesBase({ format: v => formatCount(v) }),
    series: [
      {
        type: 'bar',
        name: 'Requests',
        data: points.map(p => [p.t, p.total]),
        barMaxWidth: MARK.maxBarThickness,
        barCategoryGap: '20%',
        itemStyle: {
          color: nominalFill(),
          borderRadius: [MARK.barEndRadius, MARK.barEndRadius, 0, 0],
        },
        ...marks(events),
      },
    ],
  }
}

export function errorRateOption(
  points: readonly TrafficPoint[],
  kind: 'server' | 'client',
  events: Events
): ChartOption {
  const color = statusFill(kind === 'server' ? 'fail' : 'warn')
  const line = lineSeries(
    kind === 'server' ? '5xx' : '4xx',
    color,
    points.map(p => [p.t, kind === 'server' ? p.serverErrorPct : p.clientErrorPct])
  )
  return {
    ...timeSeriesBase({ format: v => formatPct(v) }),
    series: [{ ...line, areaStyle: fadingArea(color), ...marks(events) }],
  }
}

/**
 * p50, p95 and p99 are ordered, so they take the ordinal ramp (validated: monotone, one hue, the
 * light end clears the surface), each labelled at its line's end as well as in the legend.
 */
export function latencyOption(points: readonly TrafficPoint[], events: Events): ChartOption {
  const series = (name: string, step: number, pick: (p: TrafficPoint) => number | null) =>
    lineSeries(
      name,
      ordinalFill(step),
      points.map(p => [p.t, pick(p)]),
      true
    )
  return {
    ...timeSeriesBase({ format: v => formatMs(v), endLabels: true, legend: true }),
    series: [
      { ...series('p50', 1, p => p.p50), ...marks(events) },
      series('p95', 3, p => p.p95),
      series('p99', 5, p => p.p99),
    ],
  }
}

/**
 * The count ranges each step of the heatmap's ramp covers. Log-spaced: request counts per cell
 * span orders of magnitude, and a linear ramp would paint everything but the busiest cell pale.
 */
export function heatSteps(maxCount: number): [number, number][] {
  const max = Math.max(1, maxCount)
  const edges = Array.from({ length: RAMP_STEPS + 1 }, (_, i) =>
    Math.round(Math.exp((i / RAMP_STEPS) * Math.log(max + 1)))
  )
  const steps: [number, number][] = []
  let lo = 1
  for (let i = 1; i <= RAMP_STEPS; i++) {
    const hi = i === RAMP_STEPS ? max : Math.max(lo, edges[i] - 1)
    steps.push([lo, hi])
    lo = hi + 1
  }
  return steps.filter(([a, b]) => a <= b)
}

export function heatStep(count: number, steps: readonly [number, number][]): number {
  const i = steps.findIndex(([, hi]) => count <= hi)
  return (i === -1 ? steps.length - 1 : i) + 1
}

type HeatDatum = { value: [number, number, number]; itemStyle: { color: string } }

/**
 * Every request's time as a cell: time across, latency band up, how many requests by the
 * sequential ramp. Percentile lines hide a second cluster (a slow path, a queue); this shows it.
 * Drawn as a custom series on the shared time axis, so it zooms and lines up with the others.
 */
export function latencyHeatmapOption(
  heatmap: LatencyHeatmap,
  bucketMs: number,
  events: Events
): ChartOption {
  const steps = heatSteps(heatmap.maxCount)
  const base = timeSeriesBase({ format: v => formatCount(v) })
  return {
    ...base,
    grid: { ...(base.grid as object), right: 12 },
    tooltip: {
      ...tooltipCard,
      trigger: 'item',
      formatter: (p: { data?: HeatDatum }) => {
        if (!p.data) return ''
        const [t, bin, count] = p.data.value
        return [
          `<strong>${formatCount(count)}</strong> ${count === 1 ? 'request' : 'requests'}`,
          heatmap.bins[bin]?.label ?? '',
          `${formatTime(t).slice(5, 16)} to ${formatTime(t + bucketMs).slice(11, 16)} UTC`,
        ].join('<br/>')
      },
    },
    yAxis: {
      type: 'category',
      data: heatmap.bins.map(b => b.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: ink.faint, fontSize: 11 },
      splitLine: { show: false },
    },
    series: [
      {
        type: 'custom',
        name: 'Requests',
        encode: { x: 0, y: 1 },
        renderItem: (
          _params: unknown,
          api: {
            value: (dim: number) => number
            coord: (v: [number, number]) => [number, number]
            size: (v: [number, number]) => [number, number]
            visual: (key: string) => string
          }
        ) => {
          const t = api.value(0)
          const bin = api.value(1)
          const [x0, y] = api.coord([t, bin])
          const [x1] = api.coord([t + bucketMs, bin])
          const band = api.size([0, 1])[1]
          return {
            type: 'rect',
            shape: {
              x: x0 + 1,
              y: y - band / 2 + 1,
              width: Math.max(1, x1 - x0 - 2),
              height: Math.max(1, band - 2),
              r: 2,
            },
            style: { fill: api.visual('color') },
          }
        },
        data: heatmap.cells.map((c): HeatDatum => ({
          value: [c.t, c.bin, c.count],
          itemStyle: { color: sequentialFill(heatStep(c.count, steps)) },
        })),
        ...marks(events),
      },
    ],
  }
}
