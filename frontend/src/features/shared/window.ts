/**
 * The time windows a view offers. The backend defines the keys (`WindowKey` in the schema); this
 * gives them labels. Windows count back from the newest record loaded, not from now.
 */
import type { WindowKey } from '@/app/api/types'

export const WINDOWS: { key: WindowKey; label: string }[] = [
  { key: '15m', label: '15 min' },
  { key: '1h', label: '1 h' },
  { key: '6h', label: '6 h' },
  { key: '24h', label: '24 h' },
  { key: '7d', label: '7 days' },
  { key: 'all', label: 'All' },
]

export const DEFAULT_WINDOW: WindowKey = 'all'

export function isWindowKey(value: string | null): value is WindowKey {
  return WINDOWS.some(w => w.key === value)
}
