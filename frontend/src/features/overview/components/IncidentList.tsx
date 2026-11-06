import { Button } from '@mantine/core'
import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconArrowRight,
  IconShieldCheck,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { useState } from 'react'
import { Link } from 'react-router'

import { EmptyState, Panel, SectionHeading, StatusChip } from '@/@panther.core/components'
import { formatTime } from '@/@panther.core/format'
import type { Incident } from '@/app/api/types'
import { SourceBadge } from '@/features/shared/SourceBadge'
import { timelineSearch } from '@/features/timeline/timelineLink'

const SHOWN = 6

function lasted(ms: number): string | null {
  if (ms < 60_000) return null
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`
  return `${(ms / 3_600_000).toFixed(1)} h`
}

function IncidentCard({ incident: i }: { incident: Incident }) {
  const fail = i.tone === 'fail'
  const Icon = fail ? IconAlertOctagon : IconAlertTriangle
  const duration = lasted(i.end - i.start)
  return (
    <li className="flex min-w-0 flex-col rounded-panel bg-surface-1 sd-card">
      <div className="flex items-start gap-3 px-4 pt-4">
        <span
          aria-hidden="true"
          className={clsx(
            'grid size-9 shrink-0 place-items-center rounded-lg',
            fail ? 'bg-status-fail-wash text-status-fail' : 'bg-status-warn-wash text-status-warn'
          )}
        >
          <Icon size={19} stroke={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={i.tone} label={fail ? 'Failure' : 'Warning'} />
            {duration && <span className="text-3xs font-medium text-ink-faint">{duration}</span>}
          </div>
          <h3 className="text-sm font-semibold text-ink">{i.title}</h3>
          <span className="text-2xs text-ink-faint sd-figures">
            {formatTime(i.start)}
            {i.end > i.start && <> to {formatTime(i.end).slice(11)}</>} UTC
          </span>
        </div>
      </div>

      {i.summary.length > 0 && (
        <ul className="flex flex-col gap-1 px-4 pt-3 text-xs text-ink-muted">
          {i.summary.map(s => (
            <li key={s} className="break-words">
              {s}
            </li>
          ))}
        </ul>
      )}

      {i.events.length > 0 && (
        <ol
          aria-label={`${i.title}: what happened, oldest first`}
          className="mx-4 mt-3 flex flex-col gap-2 border-l border-hairline-strong pl-3"
        >
          {i.events.map((e, n) => (
            <li key={`${e.t}-${n}`} className="relative flex flex-col gap-0.5 text-xs">
              <span
                aria-hidden="true"
                className={clsx(
                  'absolute top-1.5 -left-[17px] size-2 rounded-full ring-2 ring-surface-1',
                  e.tone === 'fail'
                    ? 'bg-status-fail'
                    : e.tone === 'warn'
                      ? 'bg-status-warn'
                      : e.tone === 'pass'
                        ? 'bg-status-pass'
                        : 'bg-ink-faint'
                )}
              />
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-3xs text-ink-faint sd-figures">
                  {formatTime(e.t).slice(11)}
                </span>
                <SourceBadge source={e.source} />
              </span>
              <span className="break-words text-ink">{e.text}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3">
        <span className="flex flex-wrap items-center gap-1.5 text-3xs text-ink-faint">
          Evidence from
          {i.sources.map(s => (
            <SourceBadge key={s} source={s} />
          ))}
        </span>
        <Button
          component={Link}
          to={{ pathname: '/timeline', search: timelineSearch(i.start - 60_000, i.end + 60_000) }}
          variant="subtle"
          rightSection={<IconArrowRight size={14} />}
        >
          Open in timeline
        </Button>
      </div>
    </li>
  )
}

type Props = { incidents: Incident[] }

/**
 * What went wrong, joined up from all three sources: failed requests, error lines, container
 * events and restarts close together become one incident, told as a short story. Newest first.
 */
export function IncidentList({ incidents }: Props) {
  const [all, setAll] = useState(false)
  const shown = all ? incidents : incidents.slice(0, SHOWN)

  return (
    <section aria-labelledby="incidents" className="flex flex-col gap-3">
      <SectionHeading
        count={`${incidents.length} in this window`}
        description="Failed requests, error lines and container events close together in time, joined into one story."
      >
        <span id="incidents">Incidents</span>
      </SectionHeading>
      {incidents.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<IconShieldCheck size={18} stroke={1.75} />}
            title="No incidents in this window."
            description="No failed requests, error lines or container failures."
            compact
          />
        </Panel>
      ) : (
        <>
          <ol className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {shown.map(i => (
              <IncidentCard key={i.id} incident={i} />
            ))}
          </ol>
          {incidents.length > SHOWN && (
            <Button variant="subtle" className="self-start" onClick={() => setAll(v => !v)}>
              {all ? 'Show fewer' : `Show all ${incidents.length}`}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
