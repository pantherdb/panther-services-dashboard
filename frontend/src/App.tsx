import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { RouterProvider } from 'react-router/dom'
import type { createBrowserRouter } from 'react-router'

import { mantineTheme } from '@/@panther.core/theme/mantineTheme'
import { useAppSelector } from '@/app/hooks'
import { selectColorScheme } from '@/app/slices/uiSlice'

type Props = {
  router: ReturnType<typeof createBrowserRouter>
}

/** Providers: Mantine, driven by the store's colour scheme, then the router. */
export function App({ router }: Props) {
  const colorScheme = useAppSelector(selectColorScheme)

  return (
    <MantineProvider theme={mantineTheme} forceColorScheme={colorScheme}>
      <Notifications />
      <RouterProvider router={router} />
    </MantineProvider>
  )
}
