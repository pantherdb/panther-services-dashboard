/**
 * Job run and wait times as scatter plots over time: one dot per job, so a single slow job or a
 * queue building up shows at once, where a percentile line would smooth it away.
 *
 * Colour is the service's identity, bound once to a fixed order so it never changes with the
 * window. A scatter puts every pair of colours side by side, which the palette only keeps apart
 * for three slots (validated, all pairs, both schemes), so a fourth service and beyond share
 * "Other". A failed job is a triangle, a success a circle: outcome never rests on colour.
 */
import { eventMarks, timeSeriesBase } from '@/@panther.core/charts'
import type { ChartOption, EventLine, EventSpan } from '@/@panther.core/charts'
import { formatSeconds, formatTime } from '@/@panther.core/format'
import {
  createCategoricalScale,
  MARK,
  markSeparator,
  SERIES_ALL_PAIRS_SAFE_SLOTS,
  seriesFill,
  seriesOtherFill,
} from '@/@panther.core/theme/tokens'
import type { JobOut } from '@/app/api/types'

/** The services in the scoring API's priority order; a service not listed follows. */
const KNOWN_SERVICES = ['csnp', 'refmap', 'hmmscore', 'treegrafter', 'tools']

export function serviceColor(services: readonly string[]) {
  const scale = createCategoricalScale([
    ...KNOWN_SERVICES,
    ...services.filter(s => !KNOWN_SERVICES.includes(s)),
  ])
  return (service: string) => {
    const slot = scale.slotOf(service)
    return slot !== null && slot <= SERIES_ALL_PAIRS_SAFE_SLOTS ? seriesFill(slot) : seriesOtherFill
  }
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ESCAPES[c] ?? c)

/** What a scatter point carries, so a click can open the job's story. */
export type JobPoint = { value: [number, number]; symbol: string; job: JobOut }

export function isJobPoint(data: unknown): data is JobPoint {
  return typeof data === 'object' && data !== null && 'job' in data
}

export function jobScatterOption(
  jobs: readonly JobOut[],
  measure: 'ranS' | 'waitedS',
  lines: EventLine[],
  spans: EventSpan[]
): ChartOption {
  const services = [...new Set(jobs.map(j => j.service))]
  const colorOf = serviceColor(services)
  const base = timeSeriesBase({ format: v => formatSeconds(v), legend: true })

  return {
    ...base,
    // Dots, so the legend keys with dots. Clicking a service hides it, and the y-axis rescales to
    // the rest: how to compare refmap's seconds with csnp's minutes.
    legend: { ...(base.legend as object), icon: 'circle', itemWidth: 8, itemHeight: 8 },
    tooltip: {
      ...(base.tooltip as object),
      trigger: 'item',
      // Built from log text, so every value is escaped before it becomes HTML.
      formatter: (p: { data?: unknown }) => {
        if (!isJobPoint(p.data)) return ''
        const j = p.data.job
        return [
          `<strong>${formatSeconds(j[measure])}</strong> ${measure === 'ranS' ? 'run' : 'wait'}`,
          `${escapeHtml(j.service)}${j.summary ? `, ${escapeHtml(j.summary)}` : ''}`,
          escapeHtml(j.outcomeText),
          `${formatTime(j.t)} UTC`,
          '<em>Click for its story</em>',
        ].join('<br/>')
      },
    },
    series: services.map((service, i) => ({
      type: 'scatter',
      name: service,
      cursor: 'pointer',
      symbolSize: MARK.markerRadius * 2,
      itemStyle: {
        color: colorOf(service),
        borderColor: markSeparator,
        borderWidth: 1,
        opacity: 0.85,
      },
      emphasis: { focus: 'series', scale: 1.6 },
      data: jobs
        .filter(j => j.service === service)
        .map((j): JobPoint => ({
          value: [j.t, j[measure]],
          symbol: j.outcome === 'failed' ? 'triangle' : 'circle',
          job: j,
        })),
      ...(i === 0 ? eventMarks(lines, spans, 60_000) : {}),
    })),
  }
}
