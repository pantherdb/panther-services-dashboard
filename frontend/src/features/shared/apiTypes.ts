/** The API types the shared view pieces use, plus `Range`, which `types.ts` doesn't list. */
import type { components } from '@/app/api/schema'

export type { Level, Line, LogSource, Source, Tone, WindowKey } from '@/app/api/types'
export type Range = components['schemas']['Range']
