/**
 * The chrome every time-series chart shares: axes, grid, tooltip, zoom. Charts spread this and add
 * their series, so a line on one panel weighs the same as on the next.
 *
 * Colours are token references (resolved by `EChart`), never literals. Gridlines are solid
 * hairlines one step off the surface; text wears ink tokens, never a series colour.
 */
import { alpha, chrome, ink, MARK } from '@/@panther.core/theme/tokens'
import type { TokenRef } from '@/@panther.core/theme/tokens'

import type { ChartOption } from '@/@panther.core/charts/echarts'

// A canvas can't read CSS variables for fonts either; the same stack as index.css.
export const CHART_FONT =
  '"Inter Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/** The tooltip as a small raised card. It's HTML, so the shadow can be a token. */
export const tooltipCard = {
  confine: true,
  backgroundColor: chrome.surfaceRaised,
  borderColor: chrome.hairlineStrong,
  borderWidth: 1,
  borderRadius: 8,
  padding: [8, 12],
  extraCssText: 'box-shadow: var(--sd-shadow-raised);',
  textStyle: { color: ink.primary, fontSize: 12, fontFamily: CHART_FONT },
} as const

type Options = {
  /** Formats a value for the y-axis and the tooltip. */
  format: (value: number) => string
  /** Pin the y-axis's top, such as 100 for a percentage. */
  yMax?: number
  /** A fixed step between y-axis ticks, so a pinned top lands on a tick. */
  yInterval?: number
  /** Leave room on the right for direct labels at the line ends. */
  endLabels?: boolean
  legend?: boolean
}

export function timeSeriesBase({
  format,
  yMax,
  yInterval,
  endLabels = false,
  legend = false,
}: Options): ChartOption {
  return {
    animation: false,
    useUTC: true,
    textStyle: { fontFamily: CHART_FONT, color: ink.faint, fontSize: 11 },
    grid: {
      left: 4,
      right: endLabels ? 44 : 8,
      top: legend ? 34 : 22,
      bottom: 4,
      containLabel: true,
    },
    legend: legend
      ? {
          top: 0,
          left: 0,
          itemWidth: 14,
          itemHeight: 3,
          itemGap: 14,
          textStyle: { color: ink.muted, fontSize: 11 },
        }
      : { show: false },
    tooltip: {
      ...tooltipCard,
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        lineStyle: { color: chrome.axis, width: MARK.hairlineWidth },
      },
      valueFormatter: (value: unknown) => (typeof value === 'number' ? format(value) : '—'),
    },
    toolbox: {
      right: 0,
      top: 0,
      itemSize: 12,
      itemGap: 6,
      iconStyle: { borderColor: ink.faint },
      emphasis: { iconStyle: { borderColor: ink.primary, textFill: ink.primary } },
      feature: {
        dataZoom: { yAxisIndex: 'none', title: { zoom: 'Drag to zoom', back: 'Undo zoom' } },
        restore: { title: 'Reset zoom' },
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: chrome.axis } },
      axisTick: { show: false },
      axisLabel: {
        color: ink.faint,
        hideOverlap: true,
        margin: 10,
        // By level, so a day boundary reads `Nov 4`, not ECharts' bare `4`.
        formatter: {
          year: '{yyyy}',
          month: '{MMM} {yyyy}',
          day: '{MMM} {d}',
          hour: '{HH}:{mm}',
          minute: '{HH}:{mm}',
          second: '{HH}:{mm}:{ss}',
          millisecond: '{HH}:{mm}:{ss}.{SSS}',
          none: '{yyyy}-{MM}-{dd} {HH}:{mm}',
        },
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      max: yMax,
      interval: yInterval,
      splitNumber: 4,
      axisLabel: { color: ink.faint, formatter: (v: number) => format(v) },
      splitLine: { lineStyle: { color: chrome.grid, width: MARK.hairlineWidth } },
    },
  }
}

/** An area under a line that fades to nothing, so the line stays the signal. */
export function fadingArea(color: TokenRef, top = 0.24) {
  return {
    color: {
      type: 'linear',
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: alpha(color, top) },
        { offset: 1, color: alpha(color, 0) },
      ],
    },
  }
}

/** A 2 px line with no markers until hovered: the line is the signal. */
export function lineSeries(
  name: string,
  color: string,
  data: [number, number | null][],
  endLabel = false
) {
  return {
    type: 'line',
    name,
    data,
    showSymbol: false,
    symbolSize: MARK.markerRadius * 2,
    connectNulls: false,
    lineStyle: { width: MARK.lineWidth, color, cap: 'round', join: 'round' },
    itemStyle: { color },
    endLabel: endLabel
      ? { show: true, formatter: '{a}', color: ink.muted, fontSize: 11, distance: 6 }
      : undefined,
    // Two lines ending at the same value would print their names on top of each other.
    labelLayout: endLabel ? { moveOverlap: 'shiftY' } : undefined,
    emphasis: { focus: 'series' },
  }
}
