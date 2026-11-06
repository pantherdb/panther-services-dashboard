import { describe, expect, it } from 'vitest'

import type { JobOut } from '@/app/api/types'
import { isJobPoint, jobScatterOption, serviceColor } from '@/features/jobs/jobCharts'
import {
  heatStep,
  heatSteps,
  latencyHeatmapOption,
  toEvents,
  volumeOption,
} from '@/features/overview/trafficCharts'
import { containerColor, cpuOption, memoryOption } from '@/features/resources/resourceCharts'

import { fixtures } from '../mocks/handlers'

type Series = {
  name?: string
  data: unknown[]
  markLine?: { data: unknown[] }
  markArea?: { data: unknown[] }
}
const seriesOf = (option: object) => (option as { series: Series[] }).series

describe('event marks on the time charts', () => {
  it('draws every marker as a named line and every incident as a span, on the first series', () => {
    const o = fixtures.overview
    const events = toEvents(o.markers, o.incidents, o.bucketMs)
    const [bars] = seriesOf(volumeOption(o.points, events))

    expect(bars.data).toHaveLength(o.points.length)
    expect(bars.markLine?.data).toHaveLength(o.markers.length)
    expect(bars.markLine?.data).toContainEqual(
      expect.objectContaining({ name: 'api ran out of memory' })
    )
    expect(bars.markArea?.data).toHaveLength(o.incidents.length)
  })

  it('gives a one-moment incident at least one bucket of width, so it shows', () => {
    const events = toEvents(
      [],
      [
        {
          id: 'i',
          start: 1000,
          end: 1000,
          tone: 'fail',
          title: '',
          summary: [],
          events: [],
          sources: [],
          failedRequests: 0,
        },
      ],
      60_000
    )
    const [bars] = seriesOf(volumeOption([], events))
    expect(bars.markArea?.data).toEqual([
      [expect.objectContaining({ xAxis: 1000 }), { xAxis: 61_000 }],
    ])
  })
})

describe('the job scatter', () => {
  const job = (service: string, outcome: 'succeeded' | 'failed'): JobOut => ({
    ...fixtures.jobs.jobs[0],
    service,
    outcome,
    jobId: `${service}-${outcome}`,
  })

  it('marks a failed job with a triangle and carries the job for a click', () => {
    const series = seriesOf(
      jobScatterOption([job('csnp', 'succeeded'), job('csnp', 'failed')], 'ranS', [], [])
    )
    const points = series[0].data
    expect(points.map(p => (p as { symbol: string }).symbol)).toEqual(['circle', 'triangle'])
    expect(points.every(isJobPoint)).toBe(true)
  })

  it('keeps a service its colour whatever else is shown, and folds the fourth into Other', () => {
    const colour = serviceColor(['csnp', 'refmap', 'hmmscore', 'treegrafter'])
    expect(colour('csnp')).toBe('var(--sd-series-1)')
    expect(colour('refmap')).toBe('var(--sd-series-2)')
    expect(colour('hmmscore')).toBe('var(--sd-series-3)')
    expect(colour('treegrafter')).toBe('var(--sd-series-other)')
    expect(serviceColor(['refmap'])('refmap')).toBe('var(--sd-series-2)')
  })
})

describe('the latency heatmap', () => {
  it('splits the counts into log-spaced steps that cover 1 to the busiest cell', () => {
    const steps = heatSteps(805)
    expect(steps[0][0]).toBe(1)
    expect(steps.at(-1)?.[1]).toBe(805)
    for (let i = 1; i < steps.length; i++) expect(steps[i][0]).toBe(steps[i - 1][1] + 1)
    expect(heatStep(1, steps)).toBe(1)
    expect(heatStep(805, steps)).toBe(steps.length)
  })

  it('draws one cell per non-empty bucket and band, coloured by its step', () => {
    const o = fixtures.overview
    const heatmap = o.latencyHeatmap
    expect(heatmap).not.toBeNull()
    if (!heatmap) return
    const [cells] = seriesOf(latencyHeatmapOption(heatmap, o.bucketMs, toEvents([], [], 0)))
    expect(cells.data).toHaveLength(heatmap.cells.length)
    expect(cells.data[0]).toMatchObject({ itemStyle: { color: expect.stringMatching(/seq-\d/) } })
  })
})

describe('the resource charts', () => {
  const r = fixtures.resources

  it('gives api and web the same colours as their sources everywhere else', () => {
    const colour = containerColor(r.containers)
    const api = r.containers.find(c => c.service === 'api')
    const web = r.containers.find(c => c.service === 'web')
    expect(api && colour(api)).toBe('var(--sd-series-1)')
    expect(web && colour(web)).toBe('var(--sd-series-2)')
  })

  it('draws one line per container, with a gap where the API was down', () => {
    const events = toEvents([], [], r.bucketMs)
    const cpu = seriesOf(cpuOption(r.points, r.containers, events))
    expect(cpu.map(s => s.name)).toEqual(r.containers.map(c => c.service ?? c.name))
    const memory = seriesOf(memoryOption(r.points, r.containers, events))
    const api = memory[0].data as [number, number | null][]
    expect(api.some(([, v]) => v === null)).toBe(true)
    expect(Math.max(...api.map(([, v]) => v ?? 0))).toBeGreaterThan(95)
  })
})
