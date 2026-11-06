import type { TokenRef } from '@/@panther.core/theme/tokens'

type Props = {
  values: readonly (number | null)[]
  /** A token, such as `seriesFill(1)`. */
  color: TokenRef
  className?: string
}

const W = 100
const H = 32

/**
 * A trend under a headline number: SVG, not a chart instance, since a page has several and they
 * only need the shape. Decorative: the number beside it and the charts below carry the values.
 * A gap (null) breaks the line rather than dropping it to zero.
 */
export function Sparkline({ values, color, className }: Props) {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (values.length < 2 || finite.length === 0) return null
  const max = Math.max(...finite)
  const min = Math.min(0, ...finite)
  const span = max - min || 1
  const x = (i: number) => (i / (values.length - 1)) * W
  const y = (v: number) => H - 2 - ((v - min) / span) * (H - 4)

  const runs: [number, number][][] = []
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (runs.at(-1)?.length) runs.push([])
      return
    }
    if (!runs.length) runs.push([])
    runs[runs.length - 1].push([x(i), y(v)])
  })
  const lines = runs.filter(r => r.length > 0)
  const line = lines
    .map(r => r.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`).join(''))
    .join('')
  const area = lines
    .filter(r => r.length > 1)
    .map(
      r =>
        `M${r[0][0].toFixed(2)},${H}` +
        r.map(([px, py]) => `L${px.toFixed(2)},${py.toFixed(2)}`).join('') +
        `L${r[r.length - 1][0].toFixed(2)},${H}Z`
    )
    .join('')

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className ?? 'h-9 w-full'}
    >
      <path d={area} style={{ fill: color }} fillOpacity={0.12} />
      <path
        d={line}
        style={{ stroke: color }}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
