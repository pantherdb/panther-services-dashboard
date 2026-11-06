/**
 * ECharts, with only the parts the app draws. Importing from `echarts/core` and registering
 * charts one by one keeps the bundle to what's used; a new chart type is registered here.
 */
import { BarChart, CustomChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { LabelLayout } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  CustomChart,
  LineChart,
  ScatterChart,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  ToolboxComponent,
  TooltipComponent,
  LabelLayout,
  CanvasRenderer,
])

export { echarts }
export type { EChartsCoreOption as ChartOption, EChartsType } from 'echarts/core'
