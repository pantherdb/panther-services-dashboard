/**
 * The colour scheme the viewer chose, remembered in local storage. The store holds the live value
 * (`uiSlice`); this only seeds it on start and saves it on change.
 *
 * Every storage access is wrapped: a private window can throw on `localStorage`, and a dashboard
 * that can't remember a preference is better than one that won't start.
 */
export type ColorScheme = 'light' | 'dark'

const STORAGE_KEY = 'psd.colorScheme'

/** Dark is the working default for an operations console. */
export const DEFAULT_COLOR_SCHEME: ColorScheme = 'dark'

export function readStoredColorScheme(): ColorScheme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

export function storeColorScheme(scheme: ColorScheme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, scheme)
  } catch {
    // Not remembered; nothing else depends on it.
  }
}
