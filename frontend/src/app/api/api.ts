/**
 * Every call to the backend, through RTK Query. Components never `fetch` themselves.
 *
 * Everything the views show derives from the loaded files, so every query provides the one `Data`
 * tag and every change to the files invalidates it: add or remove a file and each open view
 * refetches.
 */
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

import { apiBaseUrl } from '@/app/apiBaseUrl'
import type {
  Containers,
  Files,
  JobStory,
  Jobs,
  Level,
  Logs,
  LogSource,
  Overview,
  Resources,
  Source,
  Span,
  Timeline,
  WindowKey,
} from '@/app/api/types'

const DATA = ['Data'] as const

export type LogsArgs = {
  window: WindowKey
  level?: Level
  source?: LogSource
  q?: string
  page: number
}

export type TimelineArgs = {
  start: number
  end: number
  problemsOnly: boolean
  sources: Source[]
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: apiBaseUrl() }),
  tagTypes: ['Data'],
  endpoints: build => ({
    files: build.query<Files, void>({ query: () => 'files', providesTags: DATA }),
    uploadFiles: build.mutation<Files, File[]>({
      query: files => {
        const body = new FormData()
        // The path inside a picked folder travels as the file name, so the list shows it.
        for (const file of files) body.append('files', file, file.webkitRelativePath || file.name)
        return { url: 'files', method: 'POST', body }
      },
      invalidatesTags: DATA,
    }),
    loadSample: build.mutation<Files, void>({
      query: () => ({ url: 'files/sample', method: 'POST' }),
      invalidatesTags: DATA,
    }),
    reloadFolder: build.mutation<Files, void>({
      query: () => ({ url: 'files/reload', method: 'POST' }),
      invalidatesTags: DATA,
    }),
    removeFile: build.mutation<Files, string>({
      query: id => ({ url: `files/${encodeURIComponent(id)}`, method: 'DELETE' }),
      invalidatesTags: DATA,
    }),
    removeAllFiles: build.mutation<Files, void>({
      query: () => ({ url: 'files', method: 'DELETE' }),
      invalidatesTags: DATA,
    }),
    span: build.query<Span, void>({ query: () => 'span', providesTags: DATA }),
    overview: build.query<Overview, { window: WindowKey; source?: LogSource }>({
      query: params => ({ url: 'overview', params }),
      providesTags: DATA,
    }),
    jobs: build.query<Jobs, { window: WindowKey }>({
      query: params => ({ url: 'jobs', params }),
      providesTags: DATA,
    }),
    jobStory: build.query<JobStory, string>({
      query: id => `jobs/${encodeURIComponent(id)}`,
      providesTags: DATA,
    }),
    logs: build.query<Logs, LogsArgs>({
      query: ({ q, ...params }) => ({
        url: 'logs',
        params: { ...params, ...(q?.trim() ? { q: q.trim() } : {}) },
      }),
      providesTags: DATA,
    }),
    timeline: build.query<Timeline, TimelineArgs>({
      query: ({ sources, ...params }) => {
        const search = new URLSearchParams({
          start: String(params.start),
          end: String(params.end),
          problemsOnly: String(params.problemsOnly),
        })
        for (const s of sources) search.append('sources', s)
        return `timeline?${search.toString()}`
      },
      providesTags: DATA,
    }),
    containers: build.query<Containers, void>({ query: () => 'containers', providesTags: DATA }),
    resources: build.query<Resources, { window: WindowKey }>({
      query: params => ({ url: 'resources', params }),
      providesTags: DATA,
    }),
  }),
})

export const {
  useFilesQuery,
  useUploadFilesMutation,
  useLoadSampleMutation,
  useReloadFolderMutation,
  useRemoveFileMutation,
  useRemoveAllFilesMutation,
  useSpanQuery,
  useOverviewQuery,
  useJobsQuery,
  useJobStoryQuery,
  useLogsQuery,
  useTimelineQuery,
  useContainersQuery,
  useResourcesQuery,
} = api
