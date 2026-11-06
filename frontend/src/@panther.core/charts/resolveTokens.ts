/**
 * ECharts draws on a canvas, and a canvas can't read CSS variables. Chart options are written with
 * the same `var(--sd-*)` references as the rest of the app (from `theme/tokens.ts`), and this
 * swaps each for its current value just before the chart draws. That keeps `src/index.css` the
 * only file with a colour literal, and lets a chart follow the colour scheme.
 */
const VAR_REF = /^var\((--[\w-]+)\)$/
const ALPHA_REF = /^alpha\(var\((--[\w-]+)\), ([\d.]+)\)$/
const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i

type Lookup = (name: string) => string

/** `#rrggbb` at an opacity as `rgba()`; anything else unchanged, since only hex can be split. */
function withAlpha(color: string, opacity: string): string {
  const m = HEX.exec(color)
  if (!m) return color
  const [r, g, b] = m.slice(1).map(h => parseInt(h, 16))
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

/**
 * A copy of `value` with every `var(--x)` string replaced by its value from `lookup`, and every
 * `alpha(var(--x), a)` (from `tokens.alpha`) by that value at opacity `a`.
 */
export function resolveTokens<T>(value: T, lookup: Lookup): T {
  if (typeof value === 'string') {
    const a = ALPHA_REF.exec(value)
    if (a) {
      const resolved = lookup(a[1]).trim()
      return (resolved ? withAlpha(resolved, a[2]) : value) as T
    }
    const m = VAR_REF.exec(value)
    if (!m) return value
    const resolved = lookup(m[1]).trim()
    return (resolved || value) as T
  }
  if (Array.isArray(value)) return value.map(v => resolveTokens(v, lookup)) as T
  if (value !== null && typeof value === 'object' && isPlain(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = resolveTokens(v, lookup)
    return out as T
  }
  // Functions (formatters) and anything else pass through untouched.
  return value
}

function isPlain(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Reads CSS custom properties from the document root, where the token layer declares them. */
export function documentLookup(): Lookup {
  const style = getComputedStyle(document.documentElement)
  return name => style.getPropertyValue(name)
}
