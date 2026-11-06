import { StatusChip } from '@/@panther.core/components'
import type { Level } from '@/features/shared/apiTypes'

const TONE = {
  DEBUG: 'neutral',
  INFO: 'neutral',
  WARNING: 'warn',
  ERROR: 'fail',
  CRITICAL: 'fail',
} as const

export function LevelChip({ level }: { level: Level }) {
  return <StatusChip tone={TONE[level]} label={level} />
}
