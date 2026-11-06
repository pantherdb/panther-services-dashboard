/**
 * Things that happened, drawn on a time chart: a thin vertical line per event (a container that
 * stopped, a service that started) and a shaded span per incident. Spread the result into a
 * chart's first series.
 *
 * Lines are solid hairlines, never dashed (dashing reads as a threshold), coloured by status tone
 * and named: hovering one shows its label. Spans use the tone's wash, so the data stays on top.
 */
import { ink, statusFill, statusWash } from '@/@panther.core/theme/tokens'
import type { StatusTone } from '@/@panther.core/theme/tokens'

export type EventLine = { t: number; label: string; tone: StatusTone }
export type EventSpan = { start: number; end: number; tone: StatusTone }

export function eventMarks(
  lines: readonly EventLine[],
  spans: readonly EventSpan[],
  minSpanMs: number
) {
  return {
    markLine: {
      silent: false,
      symbol: ['none', 'none'],
      animation: false,
      label: { show: false },
      emphasis: {
        label: {
          show: true,
          formatter: '{b}',
          color: ink.primary,
          fontSize: 11,
          position: 'insideEndTop',
        },
        lineStyle: { width: 2 },
      },
      data: lines.map(l => ({
        name: l.label,
        xAxis: l.t,
        lineStyle: { color: statusFill(l.tone), width: 1, type: 'solid' },
      })),
    },
    markArea: {
      silent: true,
      data: spans.map(s => [
        { xAxis: s.start, itemStyle: { color: statusWash(s.tone) } },
        { xAxis: Math.max(s.end, s.start + minSpanMs) },
      ]),
    },
  }
}
