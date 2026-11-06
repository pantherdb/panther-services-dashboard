import { describe, expect, it } from 'vitest'

import { resolveTokens } from '@/@panther.core/charts/resolveTokens'

const lookup = (name: string) =>
  ({ '--sd-series-1': ' #2a78d6 ', '--sd-grid': '#e6e6e0' })[name] ?? ''

describe('resolveTokens', () => {
  it('replaces every var() reference, however deep', () => {
    const format = (v: number) => `${v}`
    const option = {
      series: [{ itemStyle: { color: 'var(--sd-series-1)' }, data: [[1, 2]] }],
      yAxis: {
        splitLine: { lineStyle: { color: 'var(--sd-grid)' } },
        axisLabel: { formatter: format },
      },
      name: 'Requests',
    }

    const resolved = resolveTokens(option, lookup)

    expect(resolved.series[0].itemStyle.color).toBe('#2a78d6')
    expect(resolved.yAxis.splitLine.lineStyle.color).toBe('#e6e6e0')
    // Functions and plain strings pass through untouched.
    expect(resolved.yAxis.axisLabel.formatter).toBe(format)
    expect(resolved.name).toBe('Requests')
    // The input isn't changed.
    expect(option.series[0].itemStyle.color).toBe('var(--sd-series-1)')
  })

  it('turns a token at an opacity into rgba()', () => {
    expect(resolveTokens('alpha(var(--sd-series-1), 0.25)', lookup)).toBe(
      'rgba(42, 120, 214, 0.25)'
    )
  })

  it('keeps a reference it can’t resolve', () => {
    expect(resolveTokens('var(--sd-missing)', lookup)).toBe('var(--sd-missing)')
  })
})
