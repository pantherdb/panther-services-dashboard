import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

import { DEFAULT_COLOR_SCHEME, readStoredColorScheme } from '@/app/colorScheme'
import type { ColorScheme } from '@/app/colorScheme'

export type UiState = {
  colorScheme: ColorScheme
}

/**
 * App-chrome state. The colour scheme lives here, not in Mantine's own hook, and `MantineProvider`
 * is a controlled consumer of it (`forceColorScheme`): one source of truth drives Mantine, the
 * Tailwind `dark:` variant and the charts together.
 */
export const uiSlice = createSlice({
  name: 'ui',
  initialState: (): UiState => ({
    colorScheme: readStoredColorScheme() ?? DEFAULT_COLOR_SCHEME,
  }),
  reducers: {
    setColorScheme(state, action: PayloadAction<ColorScheme>) {
      state.colorScheme = action.payload
    },
    toggleColorScheme(state) {
      state.colorScheme = state.colorScheme === 'dark' ? 'light' : 'dark'
    },
  },
  selectors: {
    selectColorScheme: state => state.colorScheme,
  },
})

export const { setColorScheme, toggleColorScheme } = uiSlice.actions
export const { selectColorScheme } = uiSlice.selectors
