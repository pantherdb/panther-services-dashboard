import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconArrowsExchange,
  IconBox,
  IconBriefcase,
  IconClock,
  IconCpu,
} from '@tabler/icons-react'
import clsx from 'clsx'

import { StatTile } from '@/@panther.core/components'
import { formatCount, formatMs, formatPct } from '@/@panther.core/format'
import { nominalFill, ordinalFill, statusFill } from '@/@panther.core/theme/tokens'
import type { Kpis, LogSource, TrafficPoint } from '@/app/api/types'

type Props = { kpis: Kpis; points: TrafficPoint[]; source: LogSource | null }

const ICON = { size: 15, stroke: 1.75 }

/** The headline numbers for the window, each with its trend over the window where there is one. */
export function KpiRow({ kpis, points, source }: Props) {
  const memory = kpis.memPeakPct
  return (
    <div
      className={clsx(
        'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4',
        memory == null ? '2xl:grid-cols-6' : '2xl:grid-cols-7'
      )}
    >
      <StatTile
        label="Requests"
        icon={<IconArrowsExchange {...ICON} />}
        value={formatCount(kpis.requests)}
        hint={source === 'api' ? "counted by the API's access log" : 'counted by nginx'}
        trend={{ values: points.map(p => p.total), color: nominalFill() }}
      />
      <StatTile
        label="Server errors"
        icon={<IconAlertOctagon {...ICON} />}
        value={formatPct(kpis.serverErrorPct, 2)}
        hint="5xx, of all requests"
        trend={{ values: points.map(p => p.serverErrorPct), color: statusFill('fail') }}
      />
      <StatTile
        label="Client errors"
        icon={<IconAlertTriangle {...ICON} />}
        value={formatPct(kpis.clientErrorPct, 2)}
        hint="4xx, of all requests"
        trend={{ values: points.map(p => p.clientErrorPct), color: statusFill('warn') }}
      />
      <StatTile
        label="p95 latency"
        icon={<IconClock {...ICON} />}
        value={formatMs(kpis.p95Ms)}
        hint={kpis.p95Ms === null ? 'no request times in this log' : '95% were faster'}
        trend={
          kpis.p95Ms === null
            ? undefined
            : { values: points.map(p => p.p95), color: ordinalFill(3) }
        }
      />
      <StatTile
        label="Jobs"
        icon={<IconBriefcase {...ICON} />}
        value={formatCount(kpis.jobs)}
        hint={`${formatCount(kpis.failedJobs)} failed`}
        trend={{ values: points.map(p => p.jobs), color: nominalFill() }}
      />
      <StatTile
        label="Container failures"
        icon={<IconBox {...ICON} />}
        value={formatCount(kpis.containerEvents)}
        hint="stops and kills"
      />
      {memory != null && (
        <StatTile
          label="Peak memory"
          icon={<IconCpu {...ICON} />}
          value={formatPct(memory, 0)}
          hint="of a container's limit"
        />
      )}
    </div>
  )
}
