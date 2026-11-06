import { useSearchParams } from 'react-router'

import type { LogSource, WindowKey } from '@/app/api/types'
import { DEFAULT_WINDOW, isWindowKey } from '@/features/shared/window'

/**
 * The filters every view shares, kept in the URL so a link reopens the same slice and moving
 * between pages keeps them.
 */
export function useViewFilters() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('window')
  const window: WindowKey = isWindowKey(raw) ? raw : DEFAULT_WINDOW
  const requests = params.get('requests')
  const requestSource: LogSource | undefined =
    requests === 'api' || requests === 'nginx' ? requests : undefined

  const set = (key: string, value: string | null) =>
    setParams(
      prev => {
        const next = new URLSearchParams(prev)
        if (value === null) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true }
    )

  return {
    window,
    setWindow: (value: WindowKey) => set('window', value === DEFAULT_WINDOW ? null : value),
    requestSource,
    setRequestSource: (value: LogSource) => set('requests', value),
    /** The window to carry onto a link to another page. */
    search: params.get('window') ? `?window=${params.get('window')}` : '',
  }
}
