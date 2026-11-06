/** The search string for a link to the timeline between two times (epoch ms). */
export function timelineSearch(start: number, end: number, problemsOnly = false): string {
  const params = new URLSearchParams({
    start: String(Math.floor(start)),
    end: String(Math.ceil(end)),
  })
  if (problemsOnly) params.set('problems', '1')
  return `?${params.toString()}`
}
