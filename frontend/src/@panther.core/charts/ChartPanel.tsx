import { SegmentedControl } from '@mantine/core'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { EChart } from '@/@panther.core/charts/EChart'
import type { ChartOption } from '@/@panther.core/charts/echarts'
import { Panel } from '@/@panther.core/components/Panel'

type Props = {
  title: string
  subtitle?: ReactNode
  status?: ReactNode
  option: ChartOption
  /** The same values as a table: the chart's accessible twin, and a way to copy numbers out. */
  table: ReactNode
  /** A key drawn under the chart, such as a colour ramp's steps. */
  legend?: ReactNode
  group?: string
  dragToZoom?: boolean
  onZoom?: (window: [number, number] | null) => void
  onItemClick?: (data: unknown) => void
  heightClass?: string
  footer?: ReactNode
  className?: string
}

/** A card holding one chart, with a switch to its table view. */
export function ChartPanel({ title, table, legend, className, ...chart }: Props) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const { subtitle, status, footer, ...rest } = chart

  return (
    <Panel
      title={title}
      subtitle={subtitle}
      status={status}
      footer={footer}
      className={className}
      density={view === 'table' ? 'flush' : 'normal'}
      actions={
        <SegmentedControl
          aria-label={`${title}: view as`}
          value={view}
          onChange={value => setView(value === 'table' ? 'table' : 'chart')}
          data={[
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Table' },
          ]}
        />
      }
    >
      {view === 'chart' ? (
        <>
          <EChart label={title} {...rest} />
          {legend}
        </>
      ) : (
        table
      )}
    </Panel>
  )
}
