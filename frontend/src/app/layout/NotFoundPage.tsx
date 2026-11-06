import { Button } from '@mantine/core'
import { IconMapOff } from '@tabler/icons-react'
import { Link } from 'react-router'

import { EmptyState, PageHeader, Panel } from '@/@panther.core/components'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Panel>
        <EmptyState
          icon={<IconMapOff size={18} stroke={1.75} />}
          title="There's no page at this address."
          action={
            <Button component={Link} to="/" variant="filled">
              Back to the overview
            </Button>
          }
        />
      </Panel>
    </>
  )
}
