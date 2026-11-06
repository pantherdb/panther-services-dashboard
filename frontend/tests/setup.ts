import '@testing-library/jest-dom/vitest'

import { cleanup, configure } from '@testing-library/react'
import { createElement } from 'react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { resetCalls } from './mocks/handlers'
import { server } from './mocks/server'

// The overview renders a lot at once; under a busy machine its first paint can pass the default
// one second a `findBy` waits, and the test fails for nothing.
configure({ asyncUtilTimeout: 4000 })

// ECharts needs a canvas and a laid-out box, and jsdom has neither. Charts are tested as option
// builders and in the browser by e2e; here a chart is its labelled box.
vi.mock('@/@panther.core/charts/EChart', () => ({
  EChart: ({ label }: { label: string }) =>
    createElement('div', { role: 'img', 'aria-label': label }),
}))

// jsdom has no matchMedia. Report reduced motion so Mantine transitions take no time and can't
// fire after a test has finished.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: /prefers-reduced-motion:\s*reduce/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// jsdom has no ResizeObserver or scrollIntoView; Mantine's controls use both.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Element.prototype.scrollIntoView = () => {}

// The app calls a relative /api/v1, as it must in the browser. Node's Request, which jsdom
// leaves in place, throws on a relative URL; resolve it against jsdom's location as a browser
// would (found in panther-scoring-services).
const NodeRequest = globalThis.Request
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === 'string' ? new URL(input, window.location.href) : input, init)
  }
}

// A call without a handler fails the test instead of reaching the network.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetCalls()
  window.localStorage.clear()
})
afterAll(() => server.close())
