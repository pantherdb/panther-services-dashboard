import { SegmentedControl } from '@mantine/core'

import { formatRange } from '@/@panther.core/format'
import type { LogSource, Range, WindowKey } from '@/features/shared/apiTypes'
import { WINDOWS } from '@/features/shared/window'

type Props = {
  window: WindowKey
  onWindow: (value: WindowKey) => void
  /** Offered only when both nginx's and the API's access logs are loaded. */
  requestSources?: {
    value: LogSource
    onChange: (value: LogSource) => void
  }
}

/** The controls that scope a page, for its header: where requests are counted, then the window. */
export function FilterRow({ window, onWindow, requestSources }: Props) {
  return (
    <>
      {requestSources && (
        <span className="flex items-center gap-2">
          <span className="text-2xs text-ink-faint">Requests from</span>
          <SegmentedControl
            aria-label="Count requests from"
            value={requestSources.value}
            onChange={value => requestSources.onChange(value === 'api' ? 'api' : 'nginx')}
            data={[
              { value: 'nginx', label: 'nginx' },
              { value: 'api', label: 'API' },
            ]}
          />
        </span>
      )}
      <SegmentedControl
        aria-label="Time window"
        value={window}
        onChange={value => onWindow(value as WindowKey)}
        data={WINDOWS.map(w => ({ value: w.key, label: w.label }))}
      />
    </>
  )
}

/** The window a page shows, for its header's meta line. */
export function rangeNote(range: Range | null): string | undefined {
  return range
    ? `${formatRange([range.start, range.end])}, counting back from the newest line loaded`
    : undefined
}
