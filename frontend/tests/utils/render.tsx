import { MantineProvider } from '@mantine/core'
import { render } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Provider } from 'react-redux'
// RouterProvider from 'react-router', not 'react-router/dom' as in main.tsx: under Vitest the /dom
// entry loads React Router's CommonJS build, whose contexts differ from the ESM build that
// <Outlet> and <Link> use, so nested routes render empty (found in panther-scoring-services).
import { createMemoryRouter, RouterProvider } from 'react-router'

import { mantineTheme } from '@/@panther.core/theme/mantineTheme'
import { routes } from '@/app/routes'
import { makeStore } from '@/app/store'

/** Renders the app at `path` with the providers main.tsx uses: a fresh store and a memory router. */
export function renderRoute(path = '/') {
  const store = makeStore()
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const user = userEvent.setup()
  const result = render(
    <Provider store={store}>
      {/* env="test": no transitions or portals. */}
      <MantineProvider theme={mantineTheme} env="test">
        <RouterProvider router={router} />
      </MantineProvider>
    </Provider>
  )
  return { ...result, store, router, user }
}
