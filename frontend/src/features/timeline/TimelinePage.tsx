import { Button, Chip, Switch } from '@mantine/core'
import {
  IconArrowsHorizontal,
  IconChevronLeft,
  IconChevronRight,
  IconZoomIn,
} from '@tabler/icons-react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { DataTable, EmptyState, PageHeader, Panel, StatusChip } from '@/@panther.core/components'
import type { Column } from '@/@panther.core/components'
import { formatCount, formatTime } from '@/@panther.core/format'
import { useSpanQuery, useTimelineQuery } from '@/app/api/api'
import type { Source, TimelineItem, Tone } from '@/app/api/types'
import { NoData, PageState, Refreshing } from '@/features/shared/PageState'
import { SourceBadge } from '@/features/shared/SourceBadge'
import { timelineSearch } from '@/features/timeline/timelineLink'

const ALL_SOURCES: Source[] = ['api', 'nginx', 'docker']
const DEFAULT_SPAN_MS = 15 * 60_000

const TONE_WORD: Record<Tone, string> = {
  pass: 'OK',
  warn: 'Warning',
  fail: 'Failure',
  active: 'Change',
  neutral: 'Info',
}

const JOB_ID = /(?:^Job |\/jobs\/)([0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{16,})/i

function clock(t: number): string {
  return `${formatTime(t).slice(11)}.${String(t % 1000).padStart(3, '0')}`
}

function duration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`
  return `${(ms / 3_600_000).toFixed(1)} h`
}

const columns: Column<TimelineItem>[] = [
  {
    key: 't',
    header: 'Time (UTC)',
    mono: true,
    className: 'whitespace-nowrap',
    render: i => clock(i.t),
  },
  { key: 'source', header: 'Source', render: i => <SourceBadge source={i.source} /> },
  {
    key: 'tone',
    header: 'State',
    render: i => <StatusChip tone={i.tone} label={TONE_WORD[i.tone]} />,
  },
  {
    key: 'text',
    header: 'What happened',
    mono: true,
    render: i => {
      const job = JOB_ID.exec(i.text)?.[1]
      const text = i.detail ? (
        <details>
          <summary className="cursor-pointer">{i.text}</summary>
          <pre className="mt-1 whitespace-pre-wrap text-ink-muted">{i.detail}</pre>
        </details>
      ) : (
        i.text
      )
      return (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">{text}</div>
          {job && (
            <Link
              to={`/jobs/${job}`}
              className="shrink-0 font-sans text-2xs font-medium text-accent hover:underline"
            >
              Job story
            </Link>
          )}
        </div>
      )
    },
  },
]

/**
 * Everything from all three sources in one window, interleaved: what the API, nginx and Docker
 * each recorded at the same moment, side by side. Opened from an incident or a chart zoom.
 */
export function TimelinePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const span = useSpanQuery()

  const last = span.data?.range?.end
  const start = Number(params.get('start') ?? NaN)
  const end = Number(params.get('end') ?? NaN)
  const haveWindow = Number.isFinite(start) && Number.isFinite(end) && end >= start
  const window: [number, number] | null = haveWindow
    ? [start, end]
    : last !== undefined
      ? [last - DEFAULT_SPAN_MS, last]
      : null
  const problemsOnly = params.get('problems') === '1'
  const sources = (params.get('sources')?.split(',') ?? ALL_SOURCES).filter((s): s is Source =>
    ALL_SOURCES.includes(s as Source)
  )

  const timeline = useTimelineQuery(
    window
      ? { start: window[0], end: window[1], problemsOnly, sources }
      : { start: 0, end: 0, problemsOnly, sources },
    { skip: !window }
  )

  if (!span.data) return <PageState title="Timeline" error={span.error} />
  if (!span.data.range || !window) return <NoData title="Timeline" />
  if (!timeline.data) return <PageState title="Timeline" error={timeline.error} />

  const go = (
    next: [number, number],
    overrides: { problems?: boolean; sources?: Source[] } = {}
  ) => {
    const search = new URLSearchParams(
      timelineSearch(next[0], next[1], overrides.problems ?? problemsOnly).slice(1)
    )
    const srcs = overrides.sources ?? sources
    if (srcs.length < ALL_SOURCES.length) search.set('sources', srcs.join(','))
    void navigate({ search: `?${search.toString()}` }, { replace: true })
  }
  const width = window[1] - window[0]
  const step = Math.max(60_000, Math.round(width / 3))
  const data = timeline.data

  return (
    <>
      <PageHeader
        title="Timeline"
        description="Everything the API, nginx and Docker recorded in one window, interleaved: what each saw at the same moment."
        meta={
          data.total > data.shown
            ? `The first ${formatCount(data.shown)} of ${formatCount(data.total)} events`
            : `${formatCount(data.total)} events`
        }
      />

      <div className="flex flex-col gap-3 rounded-panel bg-surface-1 px-4 py-3 sd-card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-baseline gap-2 text-sm font-semibold text-ink sd-figures">
            {formatTime(window[0])} to {formatTime(window[1]).slice(11)} UTC
            <span className="text-2xs font-medium text-ink-faint">{duration(width)}</span>
          </span>
          <span className="flex flex-wrap items-center gap-1 sm:ml-auto">
            <Button
              leftSection={<IconChevronLeft size={14} />}
              onClick={() => go([window[0] - step, window[1] - step])}
            >
              Earlier
            </Button>
            <Button
              rightSection={<IconChevronRight size={14} />}
              onClick={() => go([window[0] + step, window[1] + step])}
            >
              Later
            </Button>
            <Button
              leftSection={<IconArrowsHorizontal size={14} />}
              onClick={() => go([window[0] - width / 2, window[1] + width / 2])}
            >
              Wider
            </Button>
            <Button
              leftSection={<IconZoomIn size={14} />}
              disabled={width <= 20_000}
              onClick={() => go([window[0] + width / 4, window[1] - width / 4])}
            >
              Narrower
            </Button>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-3 sd-hairline-t">
          <Chip.Group
            multiple
            value={sources}
            onChange={value => {
              const next = ALL_SOURCES.filter(s => value.includes(s))
              if (next.length) go(window, { sources: next })
            }}
          >
            <span className="flex items-center gap-1.5" role="group" aria-label="Sources">
              <span className="mr-1 text-2xs text-ink-faint">Sources</span>
              <Chip value="api">API</Chip>
              <Chip value="nginx">nginx</Chip>
              <Chip value="docker">Docker</Chip>
            </span>
          </Chip.Group>
          <Switch
            label="Only problems and changes"
            checked={problemsOnly}
            onChange={event => go(window, { problems: event.currentTarget.checked })}
          />
        </div>
      </div>

      <Refreshing fetching={timeline.isFetching}>
        <Panel title="Events" subtitle="Oldest first" density="flush">
          {data.items.length > 0 ? (
            <DataTable
              caption="Events from all sources, oldest first"
              columns={columns}
              rows={data.items}
              rowKey={i => i.key}
              maxHeightClass="max-h-[72vh]"
            />
          ) : (
            <div className="px-4">
              <EmptyState
                title="Nothing happened in this window."
                description="Widen it, move it, or turn off “Only problems and changes”."
                compact
              />
            </div>
          )}
        </Panel>
      </Refreshing>
    </>
  )
}
