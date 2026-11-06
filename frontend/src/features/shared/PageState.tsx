import { Button, Loader } from '@mantine/core'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'
import type { SerializedError } from '@reduxjs/toolkit'
import { IconFolderOpen, IconPlugConnectedX } from '@tabler/icons-react'
import clsx from 'clsx'
import { Link } from 'react-router'

import { EmptyState, PageHeader, Panel } from '@/@panther.core/components'

type Props = {
  title: string
  error: FetchBaseQueryError | SerializedError | undefined
}

/**
 * A page before its data arrives: loading, or why it can't load. Shown only when there's no data
 * yet; a refetch keeps the old data on screen (`Refreshing`).
 */
export function PageState({ title, error }: Props) {
  return (
    <>
      <PageHeader title={title} />
      {error ? (
        <Panel title="Can't reach the dashboard's backend">
          <EmptyState
            icon={<IconPlugConnectedX size={18} stroke={1.75} />}
            title="The backend didn't answer."
            description={
              <>
                Start it from <span className="sd-ident">backend/</span> with{' '}
                <span className="sd-ident">uv run services-dashboard serve</span>, then reload.
                {'status' in error && typeof error.status === 'number' && (
                  <> It answered {error.status}.</>
                )}
              </>
            }
          />
        </Panel>
      ) : (
        <div role="status" className="flex items-center gap-2 py-10 text-xs text-ink-muted">
          <Loader size="xs" />
          Loading…
        </div>
      )}
    </>
  )
}

/** A page's state when nothing is loaded: where to load something. */
export function NoData({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Panel title="Nothing loaded yet">
        <EmptyState
          icon={<IconFolderOpen size={18} stroke={1.75} />}
          title="Load logs to see them here."
          description="Upload exported logs or a folder, point the backend at a folder, or load the sample day."
          action={
            <Button component={Link} to="/files" variant="filled">
              Go to Files
            </Button>
          }
        />
      </Panel>
    </>
  )
}

/** Holds the previous render while a refetch runs, so nothing jumps or flashes. */
export function Refreshing({
  fetching,
  children,
}: {
  fetching: boolean
  children: React.ReactNode
}) {
  return (
    <div
      aria-busy={fetching}
      className={clsx('flex flex-col gap-6 transition-opacity', fetching && 'opacity-60')}
    >
      {children}
    </div>
  )
}
