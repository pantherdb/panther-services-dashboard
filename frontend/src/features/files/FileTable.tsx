import { ActionIcon, Tooltip } from '@mantine/core'
import { IconX } from '@tabler/icons-react'

import { DataTable, StatusChip } from '@/@panther.core/components'
import type { Column } from '@/@panther.core/components'
import { formatBytes, formatCount, formatRange } from '@/@panther.core/format'
import { useRemoveFileMutation } from '@/app/api/api'
import type { LoadedFile } from '@/app/api/types'

const HOLDS = {
  api: 'API log',
  nginx: 'nginx',
  docker: 'Docker',
  stats: 'Docker stats',
  mixed: 'Several',
  unknown: 'Not recognised',
} as const

const ORIGIN = { folder: 'folder', upload: 'uploaded', sample: 'sample' } as const

function Status({ file }: { file: LoadedFile }) {
  if (file.status === 'error') return <StatusChip tone="fail" label="Failed" />
  if (!file.summary || file.summary.parsed === 0)
    return <StatusChip tone="warn" label="Nothing read" />
  if (file.summary.unparsed > 0) return <StatusChip tone="warn" label="Partly read" />
  return <StatusChip tone="pass" label="Read" />
}

/** `1 log line`, `2 log lines`. */
const n = (count: number, noun: string) =>
  `${formatCount(count)} ${count === 1 ? noun : `${noun}s`}`

function counts(f: LoadedFile): string {
  const c = f.summary?.counts
  if (!c) return ''
  const parts = [
    c.request && n(c.request, 'request'),
    c.job && n(c.job, 'job'),
    c.log && n(c.log, 'log line'),
    c.event && n(c.event, 'event'),
    c.container && n(c.container, 'container'),
    c.stat && n(c.stat, 'stat'),
  ].filter(Boolean)
  return parts.join(', ')
}

/** The loaded files, what each turned out to hold, and what in it wasn't understood. */
export function FileTable({ files }: { files: LoadedFile[] }) {
  const [remove] = useRemoveFileMutation()

  const columns: Column<LoadedFile>[] = [
    { key: 'status', header: 'Status', render: f => <Status file={f} /> },
    {
      key: 'path',
      header: 'File',
      mono: true,
      render: f => (
        <>
          {f.path}
          <span className="ml-2 font-sans text-2xs text-ink-faint">{ORIGIN[f.origin]}</span>
          {f.error && <div className="mt-0.5 font-sans text-status-fail">{f.error}</div>}
        </>
      ),
    },
    { key: 'holds', header: 'Holds', render: f => (f.summary ? HOLDS[f.summary.format] : '') },
    { key: 'what', header: 'Read as', render: counts },
    { key: 'size', header: 'Size', align: 'right', render: f => formatBytes(f.bytes) },
    {
      key: 'unparsed',
      header: 'Not understood',
      align: 'right',
      render: f => (f.summary ? formatCount(f.summary.unparsed) : ''),
    },
    {
      key: 'span',
      header: 'Covers',
      render: f =>
        f.summary?.firstT != null && f.summary.lastT != null
          ? formatRange([f.summary.firstT, f.summary.lastT])
          : '',
    },
    {
      key: 'remove',
      header: '',
      align: 'right',
      render: f => (
        <Tooltip label="Remove">
          <ActionIcon aria-label={`Remove ${f.path}`} onClick={() => void remove(f.id)}>
            <IconX size={14} />
          </ActionIcon>
        </Tooltip>
      ),
    },
  ]

  return <DataTable caption="Loaded files" columns={columns} rows={files} rowKey={f => f.id} />
}
