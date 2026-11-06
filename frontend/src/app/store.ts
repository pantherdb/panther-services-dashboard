import { combineSlices, configureStore, createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit'

import { api } from '@/app/api/api'
import { storeColorScheme } from '@/app/colorScheme'
import { setColorScheme, toggleColorScheme, uiSlice } from '@/app/slices/uiSlice'

/**
 * The store holds the chrome's state and RTK Query's cache. The data itself lives in the backend;
 * nothing here parses or aggregates a log.
 */
const rootReducer = combineSlices(uiSlice, api)

export type RootState = ReturnType<typeof rootReducer>

/** A fresh store. Tests make their own, so no state leaks between them. */
export function makeStore(preloadedState?: Partial<RootState>) {
  // The chosen colour scheme is saved where it changes, so it's saved whatever changed it.
  const listener = createListenerMiddleware()
  listener.startListening({
    matcher: isAnyOf(setColorScheme, toggleColorScheme),
    effect: (_action, listenerApi) =>
      storeColorScheme((listenerApi.getState() as RootState).ui.colorScheme),
  })

  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware().prepend(listener.middleware).concat(api.middleware),
  })
}

export type AppStore = ReturnType<typeof makeStore>
export type AppDispatch = AppStore['dispatch']
