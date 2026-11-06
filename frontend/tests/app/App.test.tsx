import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { calls, emptyFiles, fixtures } from '../mocks/handlers'
import { server } from '../mocks/server'
import { renderRoute } from '../utils/render'

const api = (path: string) => `*/api/v1${path}`

describe('the overview', () => {
  it('puts the incidents first, joined up from all three sources', async () => {
    renderRoute('/')
    expect(await screen.findByText('API unreachable for 25 min')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByText(/Job queue full/)).toBeInTheDocument()
    expect(screen.getByText('Sample data.')).toBeInTheDocument()

    // The outage's story: memory, the kill, nginx's failures, the restart, each from its source.
    const story = screen.getByRole('list', {
      name: 'API unreachable for 25 min: what happened, oldest first',
    })
    expect(within(story).getByText(/memory peaked at/)).toBeInTheDocument()
    expect(within(story).getByText('Container api ran out of memory')).toBeInTheDocument()
    expect(within(story).getByText(/First failed request/)).toBeInTheDocument()
    for (const source of ['API', 'nginx', 'Docker']) {
      expect(within(story).getAllByText(source).length).toBeGreaterThan(0)
    }
  })

  it('charts traffic, and says where failed requests failed', async () => {
    renderRoute('/')
    for (const chart of [
      'Requests',
      'Server errors (5xx)',
      'Client errors (4xx)',
      'Latency',
      'Latency distribution',
    ]) {
      expect(await screen.findByRole('img', { name: chart })).toBeInTheDocument()
    }
    const origins = screen.getByRole('table', { name: 'Failed requests by where they failed' })
    expect(within(origins).getByText('API unreachable')).toBeInTheDocument()
    expect(within(origins).getByText('API refused')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Requests by route' })).toBeInTheDocument()
  })

  it('opens an incident in the timeline', async () => {
    const { user } = renderRoute('/')
    const links = await screen.findAllByRole('link', { name: 'Open in timeline' })
    await user.click(links[0])
    expect(await screen.findByRole('heading', { name: 'Timeline' })).toBeInTheDocument()
    const events = screen.getByRole('table', { name: 'Events from all sources, oldest first' })
    expect(within(events).getAllByText('Docker').length).toBeGreaterThan(0)
    expect(within(events).getAllByText('nginx').length).toBeGreaterThan(0)
  })

  it('switches a chart to its table view', async () => {
    const { user } = renderRoute('/')
    const toggle = await screen.findByRole('radiogroup', { name: 'Server errors (5xx): view as' })
    await user.click(within(toggle).getByText('Table'))
    expect(screen.getByRole('table', { name: 'Server errors per bucket' })).toBeInTheDocument()
  })

  it('points to Files when nothing is loaded', async () => {
    server.use(
      http.get(api('/overview'), () => HttpResponse.json({ ...fixtures.overview, hasData: false })),
      http.get(api('/files'), () => HttpResponse.json(emptyFiles))
    )
    renderRoute('/')
    expect(await screen.findByText('Nothing loaded yet')).toBeInTheDocument()
    expect(screen.queryByText('Sample data.')).not.toBeInTheDocument()
  })

  it("says so when the backend isn't running, rather than showing nothing", async () => {
    server.use(
      http.get(api('/overview'), () => HttpResponse.error()),
      http.get(api('/files'), () => HttpResponse.error())
    )
    renderRoute('/')
    expect(await screen.findByText("Can't reach the dashboard's backend")).toBeInTheDocument()
    expect(screen.getByText('backend not reachable')).toBeInTheDocument()
  })
})

describe('jobs', () => {
  it('profiles run and wait times by service', async () => {
    renderRoute('/jobs')
    expect(await screen.findByRole('img', { name: 'Run time' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Queue wait' })).toBeInTheDocument()
    const byService = screen.getByRole('table', { name: 'Jobs by service' })
    expect(within(byService).getByText('csnp')).toBeInTheDocument()
  })

  it("tells a lost job's story", async () => {
    renderRoute(`/jobs/${fixtures.jobStory.jobId}`)
    // The loading state has the same heading, so wait for the story itself first.
    expect(
      await screen.findByText('This job never finished in the loaded logs.')
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Job story' })).toBeInTheDocument()
    const story = screen.getByRole('list', { name: "The job's story, oldest first" })
    expect(within(story).getByText(/Submitted: POST \/api\/v1\/jobs/)).toBeInTheDocument()
    expect(within(story).getByText(/the restart lost it/)).toBeInTheDocument()
  })
})

describe('resources', () => {
  it('charts CPU and memory per container, and says what they mean', async () => {
    renderRoute('/resources')
    for (const chart of ['CPU', 'Memory', 'Jobs in flight']) {
      expect(await screen.findByRole('img', { name: chart })).toBeInTheDocument()
    }
    expect(screen.getByText(/memory rose from .* before it ran out of memory/)).toBeInTheDocument()
    expect(
      screen.getByRole('meter', { name: 'api: peak memory, share of its limit' })
    ).toHaveAttribute('aria-valuenow', '99')
  })

  it('says how to record stats when none are loaded', async () => {
    server.use(
      http.get(api('/resources'), () =>
        HttpResponse.json({ ...fixtures.resources, hasStats: false, containers: [], points: [] })
      )
    )
    renderRoute('/resources')
    expect(await screen.findByText('No CPU or memory recorded')).toBeInTheDocument()
    expect(screen.getByText(/record-stats/)).toBeInTheDocument()
  })
})

describe('containers, logs and files', () => {
  it("lists the containers and Docker's events", async () => {
    renderRoute('/containers')
    const state = await screen.findByRole('list', { name: 'Containers' })
    expect(within(state).getByText('panther-scoring-services-api-1')).toBeInTheDocument()
    const events = screen.getByRole('table', { name: 'Container events, newest first' })
    expect(within(events).getByText('api ran out of memory')).toBeInTheDocument()
  })

  it('asks the backend for the filtered lines', async () => {
    const { user } = renderRoute('/logs')
    await user.click(
      within(await screen.findByRole('radiogroup', { name: 'Level' })).getByText('Errors +')
    )
    await user.type(screen.getByRole('textbox', { name: 'Search messages' }), 'connect')
    await vi.waitFor(() =>
      expect(calls.logs.some(p => p.get('q') === 'connect' && p.get('level') === 'ERROR')).toBe(
        true
      )
    )
    expect(screen.getByRole('table', { name: 'Log lines, newest first' })).toBeInTheDocument()
  })

  it('sends a chosen file to the backend and lists it', async () => {
    const { user } = renderRoute('/files')
    const input = await screen.findByLabelText('Choose files')
    await user.upload(input, new File(['2026-11-04T17:03:11.002Z WARNING x: y\n'], 'api.log'))
    await vi.waitFor(() => expect(calls.uploads).toBe(1))
    const table = await screen.findByRole('table', { name: 'Loaded files' })
    expect(await within(table).findByText('api.log')).toBeInTheDocument()
  })
})

describe('chrome', () => {
  it('switches the colour scheme and remembers it', async () => {
    const { user } = renderRoute('/')
    await user.click(await screen.findByRole('button', { name: 'Switch to light mode' }))
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument()
    expect(window.localStorage.getItem('psd.colorScheme')).toBe('light')
  })

  it('shows a not-found page for an unknown address', async () => {
    renderRoute('/nowhere')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
