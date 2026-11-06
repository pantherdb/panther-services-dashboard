import { IconFlask } from '@tabler/icons-react'
import { Link } from 'react-router'

import { useFilesQuery } from '@/app/api/api'

/** Made-up data must never pass for real: say so on every page while any is loaded. */
export function SampleBanner() {
  const { data } = useFilesQuery()
  if (!data?.hasSample) return null
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-panel bg-status-warn-wash px-4 py-2.5 text-xs text-ink"
    >
      <IconFlask size={16} className="shrink-0 text-status-warn" aria-hidden="true" />
      <span>
        <strong className="font-semibold text-status-warn">Sample data.</strong> A made-up day, not
        read from a server.
      </span>
      <Link to="/files" className="ml-auto font-medium text-accent hover:underline">
        Remove it on the Files page
      </Link>
    </div>
  )
}
