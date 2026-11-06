import { Button } from '@mantine/core'
import { IconBug } from '@tabler/icons-react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

import { EmptyState, Panel } from '@/@panther.core/components'

/** What a render error shows: the message, not a stack trace. The console has the rest. */
export function ErrorPage() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error'

  if (import.meta.env.DEV) console.error(error)

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Panel title="Something went wrong" headingLevel={1}>
        <EmptyState
          icon={<IconBug size={18} stroke={1.75} />}
          title="This page hit an error and stopped."
          description={<span className="sd-ident">{message}</span>}
          action={
            <Button component={Link} to="/" variant="filled">
              Back to the overview
            </Button>
          }
        />
      </Panel>
    </div>
  )
}
