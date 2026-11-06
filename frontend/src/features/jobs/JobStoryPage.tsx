import { ActionIcon, Button, CopyButton, Tooltip } from '@mantine/core'
import {
  IconArrowRight,
  IconBriefcase,
  IconCheck,
  IconClock,
  IconCopy,
  IconHourglass,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { Link, useParams } from 'react-router'

import { EmptyState, PageHeader, Panel, StatTile, StatusChip } from '@/@panther.core/components'
import { formatSeconds, formatTime } from '@/@panther.core/format'
import { useJobStoryQuery } from '@/app/api/api'
import type { StoryItem, Tone } from '@/app/api/types'
import { outcomeChip } from '@/features/jobs/JobsPage'
import { PageState } from '@/features/shared/PageState'
import { SourceBadge } from '@/features/shared/SourceBadge'
import { timelineSearch } from '@/features/timeline/timelineLink'

const TONE_WORD: Record<Tone, string> = {
  pass: 'OK',
  warn: 'Warning',
  fail: 'Failure',
  active: 'Step',
  neutral: 'Info',
}

// Whole class names, so Tailwind finds them.
const DOT: Record<Tone, string> = {
  pass: 'bg-status-pass',
  warn: 'bg-status-warn',
  fail: 'bg-status-fail',
  active: 'bg-status-active',
  neutral: 'bg-ink-faint',
}

function Step({ item, last }: { item: StoryItem; last: boolean }) {
  return (
    <li className="relative grid grid-cols-[1.25rem_1fr] gap-x-3 pb-5 last:pb-0">
      {!last && (
        <span
          aria-hidden="true"
          className="absolute top-4 bottom-0 left-[0.5625rem] w-px bg-hairline-strong"
        />
      )}
      <span
        aria-hidden="true"
        className={clsx(
          'relative z-10 mt-1 size-2.5 justify-self-center rounded-full ring-4 ring-surface-1',
          DOT[item.tone]
        )}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-2xs text-ink-faint sd-figures">
            {formatTime(item.t).slice(11)}
          </span>
          <SourceBadge source={item.source} />
          <StatusChip tone={item.tone} label={TONE_WORD[item.tone]} />
        </div>
        <div className="text-xs text-ink">{item.text}</div>
        {item.detail && (
          <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-2xs whitespace-pre-wrap text-ink-muted sd-hairline">
            {item.detail}
          </pre>
        )}
      </div>
    </li>
  )
}

/**
 * One job's whole life, from all three sources: the submission nginx saw, every poll, the API's
 * finish line or traceback, and what happened to the containers meanwhile.
 */
export function JobStoryPage() {
  const { jobId = '' } = useParams()
  const { data, error } = useJobStoryQuery(jobId)

  if (!data) return <PageState title="Job story" error={error} />
  const { job, items } = data
  const first = items[0]?.t
  const last = items.at(-1)?.t
  const ICON = { size: 15, stroke: 1.75 }

  return (
    <>
      <PageHeader
        title="Job story"
        back={{ to: '/jobs', label: 'All jobs' }}
        description={
          <span className="flex items-center gap-1">
            <span className="sd-ident text-ink">{data.jobId}</span>
            <CopyButton value={data.jobId}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied' : 'Copy the job id'}>
                  <ActionIcon size="sm" aria-label="Copy the job id" onClick={copy}>
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </span>
        }
        actions={
          first !== undefined && last !== undefined ? (
            <Button
              component={Link}
              to={{ pathname: '/timeline', search: timelineSearch(first - 30_000, last + 30_000) }}
              rightSection={<IconArrowRight size={14} />}
            >
              Everything from all sources at that time
            </Button>
          ) : undefined
        }
      />

      {job ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="Service"
            icon={<IconBriefcase {...ICON} />}
            value={job.service}
            hint={job.summary || 'no input summary'}
          />
          <StatTile
            label="Outcome"
            value={<span className="block pt-1.5 text-sm">{outcomeChip(job)}</span>}
            hint={job.outcomeText}
          />
          <StatTile
            label="Ran"
            icon={<IconClock {...ICON} />}
            value={formatSeconds(job.ranS)}
            hint="in a worker"
          />
          <StatTile
            label="Waited"
            icon={<IconHourglass {...ICON} />}
            value={formatSeconds(job.waitedS)}
            hint="in the queue first"
          />
        </div>
      ) : (
        <Panel title="No finish line">
          <EmptyState
            title={
              items.length
                ? 'This job never finished in the loaded logs.'
                : 'Nothing about this job is loaded.'
            }
            description={
              items.length
                ? 'Its story below says what the other sources saw.'
                : 'Check the id, or load the logs from when it ran.'
            }
          />
        </Panel>
      )}

      {items.length > 0 && (
        <Panel
          title="What happened"
          subtitle={
            data.clients.length ? `Oldest first. Client ${data.clients.join(', ')}` : 'Oldest first'
          }
        >
          <ol aria-label="The job's story, oldest first" className="pt-2">
            {items.map((item, i) => (
              <Step key={`${item.t}-${i}`} item={item} last={i === items.length - 1} />
            ))}
          </ol>
        </Panel>
      )}
    </>
  )
}
