/**
 * How numbers and times read everywhere: one place, so a table and a chart tooltip agree.
 * Times are UTC, as the logs write them; the views say so.
 */

/** Shown for a value that doesn't exist, never `0`. */
export const ABSENT = '—'

const counts = new Intl.NumberFormat('en-US')

export function formatCount(n: number | null): string {
  return n === null ? ABSENT : counts.format(n)
}

export function formatPct(n: number | null, digits = 1): string {
  if (n === null) return ABSENT
  if (n > 0 && n < 10 ** -digits) return `<${10 ** -digits}%`
  return `${n.toFixed(digits)}%`
}

export function formatMs(ms: number | null): string {
  if (ms === null) return ABSENT
  if (ms < 1) return `${ms.toFixed(2)} ms`
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export function formatSeconds(s: number | null): string {
  if (s === null) return ABSENT
  if (s < 60) return `${s.toFixed(1)} s`
  return `${(s / 60).toFixed(1)} min`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`
  if (bytes < 1024 ** 3)
    return `${(bytes / 1024 ** 2).toFixed(bytes < 100 * 1024 ** 2 ? 1 : 0)} MiB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`
}

/** A chart bucket's width: `15 min`, `1 h`. */
export function formatBucket(ms: number): string {
  if (ms < 60_000) return `${ms / 1000} s`
  if (ms < 3_600_000) return `${ms / 60_000} min`
  if (ms < 86_400_000) return `${ms / 3_600_000} h`
  return 'day'
}

/** `2026-11-04 03:10:05`, in UTC. */
export function formatTime(t: number): string {
  return new Date(t).toISOString().replace('T', ' ').slice(0, 19)
}

/** `Nov 4, 03:10`, in UTC: a moment within a day or two of others on screen. */
export function formatShort(t: number): string {
  const d = new Date(t)
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${d.getUTCDate()}, ${formatTime(t).slice(11, 16)}`
}

/** `2026-11-04 03:10` to `2026-11-04 12:00 UTC`. */
export function formatRange([start, end]: readonly [number, number]): string {
  return `${formatTime(start).slice(0, 16)} to ${formatTime(end).slice(0, 16)} UTC`
}
