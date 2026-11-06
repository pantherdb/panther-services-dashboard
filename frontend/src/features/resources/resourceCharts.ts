/**
 * CPU, memory and jobs in flight, as ECharts options on the shared time axis: the same group as
 * the overview's charts, so a zoom or a crosshair carries across, and the same event marks, so an
 * out-of-memory kill lines up with the memory that led to it.
 *
 * Containers take categorical slots by Compose service, in a fixed order (api, then web, then the
 * rest by name), so the API is the same colour here as its badge everywhere else.
 */
import { eventMarks, fadingArea, lineSeries, timeSeriesBase } from '@/@panther.core/charts'
import type { ChartOption } from '@/@panther.core/charts'
import { formatBytes, formatPct } from '@/@panther.core/format'
import { createCategoricalScale, seriesFill } from '@/@panther.core/theme/tokens'
import type { ConcurrencyPoint, ResourceContainer, ResourcePoint } from '@/app/api/types'
import type { Events } from '@/features/overview/trafficCharts'

const KNOWN = ['api', 'web']

/** A container's name for a legend: its Compose service when it has one. */
export const containerLabel = (c: ResourceContainer) => c.service ?? c.name

export function containerColor(containers: readonly ResourceContainer[]) {
  const labels = containers.map(containerLabel)
  const scale = createCategoricalScale([...KNOWN, ...labels.filter(l => !KNOWN.includes(l)).sort()])
  return (c: ResourceContainer) => scale.fill(containerLabel(c))
}

const marks = (e: Events) => eventMarks(e.lines, e.spans, e.minSpanMs)

/** Whether every container has a memory limit, so memory can be charted as a share of it. */
export const memoryAsShare = (containers: readonly ResourceContainer[]) =>
  containers.length > 0 && containers.every(c => (c.memLimitBytes ?? 0) > 0)

function perContainer(
  points: readonly ResourcePoint[],
  containers: readonly ResourceContainer[],
  events: Events,
  pick: (p: ResourcePoint, c: ResourceContainer) => number | null
) {
  const colorOf = containerColor(containers)
  return containers.map((c, i) => ({
    ...lineSeries(
      containerLabel(c),
      colorOf(c),
      points.filter(p => p.container === c.name).map(p => [p.t, pick(p, c)]),
      true
    ),
    ...(i === 0 ? marks(events) : {}),
  }))
}

export function cpuOption(
  points: readonly ResourcePoint[],
  containers: readonly ResourceContainer[],
  events: Events
): ChartOption {
  return {
    ...timeSeriesBase({ format: v => formatPct(v, 0), endLabels: true, legend: true }),
    series: perContainer(points, containers, events, p => p.cpuPct),
  }
}

export function memoryOption(
  points: readonly ResourcePoint[],
  containers: readonly ResourceContainer[],
  events: Events
): ChartOption {
  const share = memoryAsShare(containers)
  return {
    ...timeSeriesBase({
      format: v => (share ? formatPct(v, 0) : formatBytes(v)),
      yMax: share ? 100 : undefined,
      yInterval: share ? 25 : undefined,
      endLabels: true,
      legend: true,
    }),
    series: perContainer(points, containers, events, (p, c) =>
      p.memBytes === null
        ? null
        : share && c.memLimitBytes
          ? (p.memBytes / c.memLimitBytes) * 100
          : p.memBytes
    ),
  }
}

/** Jobs running and waiting, averaged over each bucket: how busy the API's workers were. */
export function concurrencyOption(
  points: readonly ConcurrencyPoint[],
  events: Events
): ChartOption {
  const running = seriesFill(4)
  const waiting = seriesFill(5)
  const fmt = (v: number) => v.toFixed(v < 10 ? 1 : 0)
  return {
    ...timeSeriesBase({ format: fmt, endLabels: true, legend: true }),
    series: [
      {
        ...lineSeries(
          'running',
          running,
          points.map(p => [p.t, p.running]),
          true
        ),
        areaStyle: fadingArea(running, 0.2),
        ...marks(events),
      },
      lineSeries(
        'waiting',
        waiting,
        points.map(p => [p.t, p.waiting]),
        true
      ),
    ],
  }
}
