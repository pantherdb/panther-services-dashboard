import { Button } from '@mantine/core'
import { IconListDetails, IconTimeline, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { EmptyState, PageHeader, Panel, SectionHeading } from '@/@panther.core/components'
import { formatBucket, formatCount, formatTime } from '@/@panther.core/format'
import { useOverviewQuery } from '@/app/api/api'
import { EndpointTable } from '@/features/overview/components/EndpointTable'
import { IncidentList } from '@/features/overview/components/IncidentList'
import { KpiRow } from '@/features/overview/components/KpiRow'
import { OriginTable } from '@/features/overview/components/OriginTable'
import { TrafficCharts } from '@/features/overview/components/TrafficCharts'
import { toEvents } from '@/features/overview/trafficCharts'
import { FilterRow, rangeNote } from '@/features/shared/FilterRow'
import { LineTable } from '@/features/shared/LineTable'
import { NoData, PageState, Refreshing } from '@/features/shared/PageState'
import { useViewFilters } from '@/features/shared/useViewFilters'
import { timelineSearch } from '@/features/timeline/timelineLink'

/** What went wrong and when, from all three sources, for the window chosen above. */
export function OverviewPage() {
  const filters = useViewFilters()
  const { data, error, isFetching } = useOverviewQuery({
    window: filters.window,
    source: filters.requestSource,
  })
  const [zoom, setZoom] = useState<[number, number] | null>(null)

  if (!data) return <PageState title="Overview" error={error} />
  if (!data.hasData) return <NoData title="Overview" />

  const events = toEvents(data.markers, data.incidents, data.bucketMs)
  const onZoom = (next: [number, number] | null) =>
    setZoom(prev => (prev?.[0] === next?.[0] && prev?.[1] === next?.[1] ? prev : next))

  return (
    <>
      <PageHeader
        title="Overview"
        description="What went wrong and when, joined up from the API's log, nginx and Docker."
        meta={rangeNote(data.range)}
        actions={
          <FilterRow
            window={filters.window}
            onWindow={value => {
              setZoom(null)
              filters.setWindow(value)
            }}
            requestSources={
              data.sources.length > 1 && data.source
                ? { value: data.source, onChange: filters.setRequestSource }
                : undefined
            }
          />
        }
      />
      <Refreshing fetching={isFetching}>
        <KpiRow kpis={data.kpis} points={data.points} source={data.source} />
        <IncidentList incidents={data.incidents} />

        {data.points.length > 0 && data.kpis.requests > 0 ? (
          <>
            <section aria-labelledby="traffic" className="flex flex-col gap-3">
              <SectionHeading
                description={
                  zoom
                    ? undefined
                    : 'Drag across a chart to zoom them all. Lines mark container events and API starts; shading marks incidents.'
                }
                actions={
                  zoom && (
                    <>
                      <span className="text-2xs text-ink-muted sd-figures">
                        {formatTime(zoom[0])} to {formatTime(zoom[1]).slice(11)} UTC
                      </span>
                      <Button
                        component={Link}
                        to={{ pathname: '/timeline', search: timelineSearch(zoom[0], zoom[1]) }}
                        variant="filled"
                        leftSection={<IconTimeline size={14} />}
                      >
                        Everything in these minutes
                      </Button>
                      <Button
                        variant="subtle"
                        leftSection={<IconX size={14} />}
                        onClick={() => setZoom(null)}
                      >
                        Forget the zoom
                      </Button>
                    </>
                  )
                }
              >
                <span id="traffic">Traffic</span>
              </SectionHeading>
              <TrafficCharts
                points={data.points}
                heatmap={data.latencyHeatmap ?? null}
                events={events}
                bucketMs={data.bucketMs}
                bucketLabel={formatBucket(data.bucketMs)}
                source={data.source}
                hasDurations={data.hasDurations}
                onZoom={onZoom}
              />
            </section>
            <div className="flex flex-col gap-6">
              <OriginTable rows={data.origins} hasApiLog={data.sources.includes('api')} />
              <EndpointTable rows={data.endpoints} />
            </div>
          </>
        ) : (
          <Panel title="Requests">
            <EmptyState
              title="No requests in this window."
              description="Load nginx's access log, or the API's log, to chart requests."
            />
          </Panel>
        )}

        <Panel
          title="Warnings and errors"
          subtitle={
            data.problemCount > data.problems.length
              ? `The newest ${data.problems.length} of ${formatCount(data.problemCount)}`
              : `${formatCount(data.problemCount)} in this window`
          }
          density="flush"
          actions={
            <Button
              component={Link}
              to={{ pathname: '/logs', search: filters.search }}
              variant="subtle"
              leftSection={<IconListDetails size={14} />}
            >
              Every log line
            </Button>
          }
        >
          {data.problems.length > 0 ? (
            <LineTable
              lines={data.problems}
              caption="Warnings and errors, newest first"
              maxHeightClass="max-h-[28rem]"
            />
          ) : (
            <div className="px-4">
              <EmptyState title="No warnings or errors in this window." compact />
            </div>
          )}
        </Panel>
      </Refreshing>
    </>
  )
}
