import { Pagination, SegmentedControl, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import { useState } from 'react'

import { EmptyState, PageHeader, Panel } from '@/@panther.core/components'
import { formatCount } from '@/@panther.core/format'
import { useLogsQuery } from '@/app/api/api'
import type { Level, LogSource } from '@/app/api/types'
import { FilterRow, rangeNote } from '@/features/shared/FilterRow'
import { LineTable } from '@/features/shared/LineTable'
import { NoData, PageState, Refreshing } from '@/features/shared/PageState'
import { useViewFilters } from '@/features/shared/useViewFilters'

const LEVELS = [
  { value: 'all', label: 'All' },
  { value: 'WARNING', label: 'Warnings +' },
  { value: 'ERROR', label: 'Errors +' },
] as const

const SOURCES = [
  { value: 'all', label: 'All' },
  { value: 'api', label: 'API' },
  { value: 'nginx', label: 'nginx' },
] as const

type LevelFilter = 'all' | Level
type SourceFilter = 'all' | LogSource

/** Every log line that isn't a request, newest first, filtered and paged by the backend. */
export function LogsPage() {
  const filters = useViewFilters()
  const [level, setLevel] = useState<LevelFilter>('all')
  const [source, setSource] = useState<SourceFilter>('all')
  const [text, setText] = useState('')
  const [q] = useDebouncedValue(text, 300)
  const [page, setPage] = useState(1)

  const { data, error, isFetching } = useLogsQuery({
    window: filters.window,
    level: level === 'all' ? undefined : level,
    source: source === 'all' ? undefined : source,
    q,
    page,
  })

  if (!data) return <PageState title="Logs" error={error} />
  if (!data.hasData) return <NoData title="Logs" />

  return (
    <>
      <PageHeader
        title="Logs"
        description="Every line that isn't a request: the API's log, nginx's errors and the finished jobs, newest first."
        meta={rangeNote(data.range)}
        actions={
          <FilterRow
            window={filters.window}
            onWindow={value => {
              setPage(1)
              filters.setWindow(value)
            }}
          />
        }
      />

      <Refreshing fetching={isFetching}>
        <Panel
          title={`${formatCount(data.total)} lines`}
          subtitle={data.pages > 1 ? `Page ${data.page} of ${data.pages}` : undefined}
          density="flush"
          actions={
            <>
              <TextInput
                aria-label="Search messages"
                placeholder="Search messages and tracebacks"
                leftSection={<IconSearch size={14} />}
                value={text}
                onChange={event => {
                  setText(event.currentTarget.value)
                  setPage(1)
                }}
                className="w-full sm:w-72"
              />
              <SegmentedControl
                aria-label="Level"
                value={level}
                onChange={value => {
                  setLevel(value as LevelFilter)
                  setPage(1)
                }}
                data={[...LEVELS]}
              />
              <SegmentedControl
                aria-label="Source"
                value={source}
                onChange={value => {
                  setSource(value as SourceFilter)
                  setPage(1)
                }}
                data={[...SOURCES]}
              />
            </>
          }
          footer={
            data.pages > 1 && <Pagination total={data.pages} value={data.page} onChange={setPage} />
          }
        >
          {data.lines.length > 0 ? (
            <LineTable
              lines={data.lines}
              caption="Log lines, newest first"
              maxHeightClass="max-h-[70vh]"
            />
          ) : (
            <div className="px-4">
              <EmptyState title="No lines match." compact />
            </div>
          )}
        </Panel>
      </Refreshing>
    </>
  )
}
