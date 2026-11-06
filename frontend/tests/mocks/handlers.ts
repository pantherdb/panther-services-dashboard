/**
 * The backend, mocked at the network with what it really answers on the sample day. The JSON in
 * tests/fixtures is written by the backend itself (`uv run services-dashboard fixtures
 * ../frontend/tests/fixtures`), so a renamed field shows up here as a failing test.
 */
import { http, HttpResponse } from 'msw'

import type {
  Containers,
  Files,
  JobStory,
  Jobs,
  Logs,
  Overview,
  Resources,
  Span,
  Timeline,
} from '@/app/api/types'

import containersJson from '../fixtures/containers.json'
import filesJson from '../fixtures/files.json'
import jobStoryJson from '../fixtures/job-story-lost.json'
import jobsJson from '../fixtures/jobs.json'
import logsJson from '../fixtures/logs.json'
import overviewJson from '../fixtures/overview.json'
import resourcesJson from '../fixtures/resources.json'
import spanJson from '../fixtures/span.json'
import timelineJson from '../fixtures/timeline.json'

// JSON imports are typed loosely (a tone is `string`, not `'fail' | …`); the backend wrote these
// from its response models, so they are those shapes.
function fixture<T>(data: unknown): T {
  return data as T
}

export const fixtures = {
  files: fixture<Files>(filesJson),
  span: fixture<Span>(spanJson),
  overview: fixture<Overview>(overviewJson),
  jobs: fixture<Jobs>(jobsJson),
  jobStory: fixture<JobStory>(jobStoryJson),
  logs: fixture<Logs>(logsJson),
  timeline: fixture<Timeline>(timelineJson),
  containers: fixture<Containers>(containersJson),
  resources: fixture<Resources>(resourcesJson),
}

export const emptyFiles: Files = { folder: null, files: [], hasSample: false }

/** What the mocked backend was asked, and the files it holds, reset after each test. */
export const calls = {
  uploads: 0,
  logs: [] as URLSearchParams[],
  files: fixtures.files,
}

export function resetCalls() {
  calls.uploads = 0
  calls.logs = []
  calls.files = fixtures.files
}

const api = (path: string) => `*/api/v1${path}`

export const handlers = [
  http.get(api('/files'), () => HttpResponse.json(calls.files)),
  http.post(api('/files'), () => {
    calls.uploads++
    const uploaded = {
      ...fixtures.files.files[0],
      id: 'f99',
      name: 'api.log',
      path: 'api.log',
      origin: 'upload' as const,
    }
    calls.files = { ...calls.files, files: [...calls.files.files, uploaded] }
    return HttpResponse.json(calls.files)
  }),
  http.post(api('/files/sample'), () => HttpResponse.json(fixtures.files)),
  http.post(api('/files/reload'), () => HttpResponse.json(fixtures.files)),
  http.delete(api('/files'), () => HttpResponse.json(emptyFiles)),
  http.delete(api('/files/:id'), () => HttpResponse.json(fixtures.files)),
  http.get(api('/span'), () => HttpResponse.json(fixtures.span)),
  http.get(api('/overview'), () => HttpResponse.json(fixtures.overview)),
  http.get(api('/jobs'), () => HttpResponse.json(fixtures.jobs)),
  http.get(api('/jobs/:id'), () => HttpResponse.json(fixtures.jobStory)),
  http.get(api('/logs'), ({ request }) => {
    calls.logs.push(new URL(request.url).searchParams)
    return HttpResponse.json(fixtures.logs)
  }),
  http.get(api('/timeline'), () => HttpResponse.json(fixtures.timeline)),
  http.get(api('/containers'), () => HttpResponse.json(fixtures.containers)),
  http.get(api('/resources'), () => HttpResponse.json(fixtures.resources)),
]
