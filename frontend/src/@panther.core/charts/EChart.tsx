import clsx from 'clsx'
import { useEffect, useRef } from 'react'

import { echarts } from '@/@panther.core/charts/echarts'
import type { ChartOption, EChartsType } from '@/@panther.core/charts/echarts'
import { documentLookup, resolveTokens } from '@/@panther.core/charts/resolveTokens'

type Props = {
  option: ChartOption
  /** Charts in one group share a crosshair, tooltip and zoom: hover one, all follow. */
  group?: string
  /** Drag across the plot to zoom into a time window (on time-axis charts). */
  dragToZoom?: boolean
  /** Told the time window zoomed into, or null when the zoom is reset. */
  onZoom?: (window: [number, number] | null) => void
  /** Told the data item a click landed on, such as a scatter point's job. */
  onItemClick?: (data: unknown) => void
  /** What the chart shows, for screen readers. The panel's table view carries the values. */
  label: string
  /** Height, as a Tailwind class. Include room for the x-axis labels. */
  heightClass?: string
}

type ZoomState = { startValue?: unknown; endValue?: unknown }

// ECharts has no public way to read an axis's visible range; its model does, unchanged since v4.
type ModelHost = {
  getModel?: () => {
    getComponent: (
      type: string,
      index: number
    ) => { axis?: { scale?: { getExtent?: () => number[] } } } | undefined
  }
}

/** The time window a zoom shows: from the event when it says, else from the x-axis itself. */
function zoomWindow(
  chart: EChartsType,
  params: ZoomState & { batch?: ZoomState[] }
): [number, number] | null {
  const z = params.batch?.[0] ?? params
  if (typeof z.startValue === 'number' && typeof z.endValue === 'number') {
    return [z.startValue, z.endValue]
  }
  try {
    const extent = (chart as unknown as ModelHost)
      .getModel?.()
      .getComponent('xAxis', 0)
      ?.axis?.scale?.getExtent?.()
    return extent && extent.length === 2 ? [extent[0], extent[1]] : null
  } catch {
    return null
  }
}

/**
 * One ECharts instance, sized to its box.
 *
 * - Token references in `option` are resolved when it draws, and again when the colour scheme
 *   flips (Mantine sets `data-mantine-color-scheme` on <html>), so the canvas follows the theme.
 * - A ResizeObserver keeps the canvas the size of its box.
 * - Callbacks are read through a ref, so a new callback each render doesn't redraw the chart.
 * - Tests replace this component (tests/setup.ts): jsdom has no canvas and no layout.
 */
export function EChart({
  option,
  group,
  dragToZoom = false,
  onZoom,
  onItemClick,
  label,
  heightClass = 'h-56',
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | null>(null)
  const callbacks = useRef({ onZoom, onItemClick })

  useEffect(() => {
    callbacks.current = { onZoom, onItemClick }
  })

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const chart = echarts.init(box, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const resize = new ResizeObserver(() => chart.resize())
    resize.observe(box)

    chart.on('datazoom', params => {
      callbacks.current.onZoom?.(zoomWindow(chart, params as ZoomState & { batch?: ZoomState[] }))
    })
    chart.on('restore', () => callbacks.current.onZoom?.(null))
    chart.on('click', params => callbacks.current.onItemClick?.(params.data))

    return () => {
      resize.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !group) return
    chart.group = group
    echarts.connect(group)
  }, [group])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const draw = () => {
      chart.setOption(resolveTokens(option, documentLookup()), { notMerge: true })
      if (dragToZoom) {
        chart.dispatchAction({
          type: 'takeGlobalCursor',
          key: 'dataZoomSelect',
          dataZoomSelectActive: true,
        })
      }
    }
    draw()
    const scheme = new MutationObserver(draw)
    scheme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mantine-color-scheme'],
    })
    return () => scheme.disconnect()
  }, [option, dragToZoom])

  return <div ref={boxRef} role="img" aria-label={label} className={clsx('w-full', heightClass)} />
}
