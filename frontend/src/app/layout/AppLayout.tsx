import { Burger, Drawer } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Outlet } from 'react-router'

import { Brand, Sidebar } from '@/app/layout/Sidebar'
import { SampleBanner } from '@/features/shared/SampleBanner'

/**
 * The frame: a sidebar on wide screens (a drawer behind a menu button on narrow ones), then the
 * page. Wide on purpose: columns of figures and stacked time series read better wide than in a
 * centred measure.
 */
export function AppLayout() {
  const [menu, { toggle, close }] = useDisclosure(false)

  return (
    <div className="flex min-h-screen bg-plane">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto bg-sidebar shadow-[inset_-1px_0_0_0_var(--sd-hairline)] lg:block">
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-sidebar px-4 sd-hairline-b lg:hidden">
          <Burger
            opened={menu}
            onClick={toggle}
            size="sm"
            aria-label={menu ? 'Close the menu' : 'Open the menu'}
          />
          <Brand />
        </div>
        <Drawer opened={menu} onClose={close} withCloseButton={false} padding={0} hiddenFrom="lg">
          <Sidebar onNavigate={close} />
        </Drawer>

        <main className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <SampleBanner />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
