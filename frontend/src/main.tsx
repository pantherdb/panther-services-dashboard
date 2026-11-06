import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { createBrowserRouter } from 'react-router'

import { App } from '@/App'
import { routes } from '@/app/routes'
import { makeStore } from '@/app/store'

// Mantine's stylesheets load before ours, so Tailwind utilities and our base layer win on equal
// specificity.
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import '@/index.css'

const container = document.getElementById('root')
if (!container) throw new Error("Root element with id 'root' was not found in index.html.")

const store = makeStore()
const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <App router={router} />
    </Provider>
  </StrictMode>
)
