import type { RouteObject } from 'react-router'

import { AppLayout } from '@/app/layout/AppLayout'
import { ErrorPage } from '@/app/layout/ErrorPage'
import { NotFoundPage } from '@/app/layout/NotFoundPage'
import { ContainersPage } from '@/features/containers/ContainersPage'
import { LogsPage } from '@/features/explorer/LogsPage'
import { FilesPage } from '@/features/files/FilesPage'
import { JobsPage } from '@/features/jobs/JobsPage'
import { JobStoryPage } from '@/features/jobs/JobStoryPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { ResourcesPage } from '@/features/resources/ResourcesPage'
import { TimelinePage } from '@/features/timeline/TimelinePage'

/**
 * Every route has an `errorElement`, so a render error shows our page inside the layout rather
 * than React Router's developer screen.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <OverviewPage />, errorElement: <ErrorPage /> },
      { path: 'timeline', element: <TimelinePage />, errorElement: <ErrorPage /> },
      { path: 'jobs', element: <JobsPage />, errorElement: <ErrorPage /> },
      { path: 'jobs/:jobId', element: <JobStoryPage />, errorElement: <ErrorPage /> },
      { path: 'resources', element: <ResourcesPage />, errorElement: <ErrorPage /> },
      { path: 'containers', element: <ContainersPage />, errorElement: <ErrorPage /> },
      { path: 'logs', element: <LogsPage />, errorElement: <ErrorPage /> },
      { path: 'files', element: <FilesPage />, errorElement: <ErrorPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
