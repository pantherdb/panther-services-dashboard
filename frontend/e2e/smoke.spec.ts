import { expect, test } from '@playwright/test'

// Against the real backend with the sample day loaded: what jsdom can't check. ECharts really
// draws, the frontend and the backend agree on the contract, and the views link up.

test('the overview draws every chart and finds the outage', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('API unreachable for 25 min')).toBeVisible()
  for (const name of [
    'Requests',
    'Server errors (5xx)',
    'Client errors (4xx)',
    'Latency',
    'Latency distribution',
  ]) {
    await expect(page.getByRole('img', { name, exact: true }).locator('canvas')).toBeVisible()
  }
})

test('an incident opens the timeline with all three sources', async ({ page }) => {
  await page.goto('/')
  const incident = page.getByRole('listitem').filter({ hasText: 'API unreachable for 25 min' })
  await incident.getByRole('link', { name: 'Open in timeline' }).click()
  const events = page.getByRole('table', { name: 'Events from all sources, oldest first' })
  await expect(events.getByText('Container api ran out of memory')).toBeVisible()
  await expect(events.getByText('Docker', { exact: true }).first()).toBeVisible()
})

test('dragging across a chart offers the timeline for those minutes', async ({ page }) => {
  await page.goto('/')
  const chart = page.getByRole('img', { name: 'Requests' })
  await expect(chart.locator('canvas')).toBeVisible()
  await chart.scrollIntoViewIfNeeded()
  const box = await chart.boundingBox()
  if (!box) throw new Error('no chart box')
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByRole('link', { name: 'Everything in these minutes' })).toBeVisible()
})

test("a job's story, and the containers", async ({ page }) => {
  await page.goto('/jobs')
  await expect(page.getByRole('img', { name: 'Run time' }).locator('canvas')).toBeVisible()
  await page.getByRole('table', { name: 'Slowest jobs' }).getByRole('link').first().click()
  await expect(page.getByRole('heading', { name: 'Job story' })).toBeVisible()
  await expect(page.getByText(/Finished: /)).toBeVisible()

  await page.getByRole('link', { name: 'Containers' }).click()
  await expect(page.getByRole('list', { name: 'Containers' })).toBeVisible()
})

test('resources joins CPU and memory to the jobs and the out-of-memory kill', async ({ page }) => {
  await page.goto('/resources')
  for (const name of ['CPU', 'Memory', 'Jobs in flight']) {
    await expect(page.getByRole('img', { name }).locator('canvas')).toBeVisible()
  }
  await expect(page.getByText(/before it ran out of memory/)).toBeVisible()
})
