import { Button, CopyButton } from '@mantine/core'
import { IconCheck, IconCopy, IconTrash } from '@tabler/icons-react'

import { PageHeader, Panel } from '@/@panther.core/components'
import { useFilesQuery, useRemoveAllFilesMutation } from '@/app/api/api'
import { FileIntake } from '@/features/files/FileIntake'
import { FileTable } from '@/features/files/FileTable'
import { PageState } from '@/features/shared/PageState'

const EXPORT = `docker compose logs --no-log-prefix -t api > api.log
docker compose logs --no-log-prefix -t web > web.log
docker events --since 24h --until "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --format '{{json .}}' > events.log
docker inspect $(docker compose ps -aq) > inspect.json`

const STATS = 'uv run services-dashboard record-stats ../exports/stats.log --every 5'

function Commands({ title, where, text }: { title: string; where: string; text: string }) {
  return (
    <div className="overflow-hidden rounded-lg bg-surface-2 sd-hairline">
      <div className="flex items-center gap-2 px-3 py-1.5 sd-hairline-b">
        <span className="shrink-0 text-2xs font-medium text-ink">{title}</span>
        <span className="truncate text-3xs text-ink-faint">{where}</span>
        <CopyButton value={text}>
          {({ copied, copy }) => (
            <Button
              size="compact-xs"
              variant="subtle"
              aria-label={`Copy: ${title}`}
              onClick={copy}
              leftSection={copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
              className="ml-auto shrink-0"
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </CopyButton>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-2xs leading-relaxed whitespace-pre text-ink">
        {text}
      </pre>
    </div>
  )
}

/** Add, inspect and remove files, see the lines nothing understood, and how to export more. */
export function FilesPage() {
  const { data, error } = useFilesQuery()
  const [removeAll] = useRemoveAllFilesMutation()
  if (!data) return <PageState title="Files" error={error} />

  const withUnparsed = data.files.filter(f => (f.summary?.unparsedSamples.length ?? 0) > 0)

  return (
    <>
      <PageHeader
        title="Files"
        description="The exported logs the dashboard reads. They stay on this machine, with its own backend."
        meta={data.files.length === 1 ? '1 file loaded' : `${data.files.length} files loaded`}
        actions={
          data.files.length > 0 && (
            <Button
              variant="subtle"
              leftSection={<IconTrash size={14} />}
              onClick={() => void removeAll()}
            >
              Remove all
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
        <FileIntake folder={data.folder} />
        <Panel
          title="Exporting logs"
          subtitle="No server access needed: run the stack locally, use the site, then export"
        >
          <div className="flex flex-col gap-3">
            <Commands
              title="Logs, events and state"
              where="in panther-scoring-services, with the stack running"
              text={EXPORT}
            />
            <Commands
              title="CPU and memory"
              where="in backend/, while you use the site; Ctrl+C to stop"
              text={STATS}
            />
            <p className="text-2xs text-ink-muted">
              Keep <span className="sd-ident">--no-log-prefix</span>: without it Compose puts{' '}
              <span className="sd-ident">api-1 |</span> before every line. Docker keeps only recent
              events, so export soon after an incident.
            </p>
          </div>
        </Panel>
      </div>

      {data.files.length > 0 && (
        <Panel title="Loaded" subtitle="What each file turned out to hold" density="flush">
          <FileTable files={data.files} />
        </Panel>
      )}

      {withUnparsed.map(f => (
        <Panel
          key={f.id}
          title="Lines not understood"
          subtitle={<span className="sd-ident">{f.path}</span>}
          footer={`The first ${f.summary?.unparsedSamples.length} of ${f.summary?.unparsed}. A new format needs a parser in backend/src/services_dashboard/parse/.`}
        >
          <pre className="max-h-64 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-2xs whitespace-pre-wrap text-ink-muted sd-hairline">
            {f.summary?.unparsedSamples.join('\n')}
          </pre>
        </Panel>
      ))}
    </>
  )
}
