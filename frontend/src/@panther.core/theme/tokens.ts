/**
 * Typed accessors for the design tokens declared in `src/index.css`.
 *
 * Everything here returns a `var(--sd-*)` reference, never a colour value, so
 * `src/index.css` stays the only file in `src/` that contains a colour literal
 * and an SVG attribute written from TypeScript still follows the colour scheme.
 *
 * The chart colour rules live in this module rather than in each chart, because
 * a rule a chart has to remember is a rule a chart will get wrong. In
 * particular `createCategoricalScale` binds a slot to an ENTITY for the life of
 * the scale, so filtering a series out cannot repaint the survivors.
 */

/** A CSS reference to a token, safe to hand to an SVG paint attribute. */
export type TokenRef = string

const ref = (name: string): TokenRef => `var(--sd-${name})`

/**
 * A token at an opacity, for a canvas paint such as an area's fading gradient. `resolveTokens`
 * turns it into `rgba()` when the chart draws; CSS can't, since the token holds a hex.
 */
export const alpha = (token: TokenRef, opacity: number): TokenRef => `alpha(${token}, ${opacity})`

/* -------------------------------------------------------------------------- */
/* Ink and chrome                                                             */
/* -------------------------------------------------------------------------- */

/** Text and glyph colours. Chart text always wears one of these, never a series colour. */
export const ink = {
  primary: ref('ink'),
  muted: ref('ink-muted'),
  faint: ref('ink-faint'),
  inverse: ref('ink-inverse'),
} as const

/** Surfaces and lines. `surface1` is the plane a chart is drawn on, so it is
 *  also the colour of the gaps and rings that separate touching marks. */
export const chrome = {
  plane: ref('plane'),
  surfaceRaised: ref('surface-raised'),
  surface1: ref('surface-1'),
  surface2: ref('surface-2'),
  surface3: ref('surface-3'),
  hairline: ref('hairline'),
  hairlineStrong: ref('hairline-strong'),
  grid: ref('grid'),
  axis: ref('axis'),
  hatchInk: ref('hatch-ink'),
} as const

/** The one accent, reserved for changed / anomalous / attention-worthy data. */
export const accent = {
  base: ref('accent'),
  hover: ref('accent-hover'),
  wash: ref('accent-wash'),
  on: ref('on-accent'),
} as const

/* -------------------------------------------------------------------------- */
/* Status - state only                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The six status tones. Every one of the app's status vocabularies (container
 * state, HTTP status class, log level, source availability) maps onto these,
 * so a reader learns six colours rather than twenty-five.
 *
 * A status tone NEVER appears without an icon and a word, and never as a
 * categorical series colour. A plot that draws status fills must not also draw
 * categorical fills.
 */
export type StatusTone = 'pass' | 'warn' | 'hole' | 'fail' | 'active' | 'neutral'

export const statusFill = (tone: StatusTone): TokenRef => ref(`status-${tone}`)
export const statusWash = (tone: StatusTone): TokenRef => ref(`status-${tone}-wash`)
/** Label ink for text sitting on top of a filled status mark. */
export const statusOnFill = (): TokenRef => ref('on-status')

/* -------------------------------------------------------------------------- */
/* Categorical - identity                                                     */
/* -------------------------------------------------------------------------- */

export const SERIES_SLOT_COUNT = 6

/**
 * Slots beyond `SERIES_SLOT_COUNT` are NOT given a generated hue. They fold
 * into one neutral "Other" fill, because a seventh invented colour is a colour
 * nobody validated.
 */
export type SeriesSlot = 1 | 2 | 3 | 4 | 5 | 6

/**
 * All-pairs colour-vision separation only holds for the first three slots (see
 * the validation note in `src/index.css`). A chart form where every pair is
 * visually adjacent - scatter, beeswarm, strip, map, small multiples - must not
 * exceed this.
 */
export const SERIES_ALL_PAIRS_SAFE_SLOTS = 3

export const seriesFill = (slot: SeriesSlot): TokenRef => ref(`series-${slot}`)
/** Label ink for text sitting inside a series fill, chosen by the fill's luminance. */
export const seriesOnFill = (slot: SeriesSlot): TokenRef => ref(`on-series-${slot}`)
export const seriesOtherFill: TokenRef = ref('series-other')
export const seriesOtherOnFill: TokenRef = ref('on-series-other')

export interface CategoricalScale {
  /** The entity keys in the order they were declared, which is the slot order. */
  readonly domain: readonly string[]
  /** Keys past the last slot, all painted `series-other`. */
  readonly overflow: readonly string[]
  /** The slot an entity holds, or `null` when it folded into "Other". */
  slotOf(key: string): SeriesSlot | null
  /** Fill for an entity. Unknown keys get the neutral "Other" fill, not slot 1. */
  fill(key: string): TokenRef
  /** Label ink for text drawn inside this entity's fill. */
  onFill(key: string): TokenRef
}

/**
 * Bind categorical colour to identity.
 *
 * Pass the FULL domain once - every mechanism, every node type - and keep the
 * scale while the view filters. Colour then follows the entity: hiding a series
 * cannot shift the others' colours, and a chart cannot accidentally encode rank
 * as hue. Building a scale from the currently-visible subset is the bug this
 * function exists to prevent.
 */
export const createCategoricalScale = (domain: readonly string[]): CategoricalScale => {
  const slots = new Map<string, SeriesSlot>()
  const overflow: string[] = []

  for (const key of domain) {
    if (slots.has(key) || overflow.includes(key)) continue
    const slot = slots.size + 1
    if (slot <= SERIES_SLOT_COUNT) slots.set(key, slot as SeriesSlot)
    else overflow.push(key)
  }

  return {
    domain,
    overflow,
    slotOf: key => slots.get(key) ?? null,
    fill: key => {
      const slot = slots.get(key)
      return slot ? seriesFill(slot) : seriesOtherFill
    },
    onFill: key => {
      const slot = slots.get(key)
      return slot ? seriesOnFill(slot) : seriesOtherOnFill
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Sequential and ordinal - magnitude and order                               */
/* -------------------------------------------------------------------------- */

export const RAMP_STEPS = 5

/** Step index 1..5, clamped. `1` is the LOW end in both colour schemes. */
const clampStep = (step: number): number => {
  if (!Number.isFinite(step)) return 1
  return Math.min(RAMP_STEPS, Math.max(1, Math.round(step)))
}

/** One hue, light -> dark (dark -> light on a dark surface). Continuous magnitude. */
export const sequentialFill = (step: number): TokenRef => ref(`seq-${clampStep(step)}`)

/**
 * Bucket a magnitude onto the sequential ramp.
 *
 * A zero-width domain returns the lowest step rather than dividing by zero -
 * an all-equal column is not a reason to blank a chart.
 */
export const sequentialFillForValue = (
  value: number,
  domain: readonly [number, number]
): TokenRef => {
  const [min, max] = domain
  const span = max - min
  if (!Number.isFinite(value) || !Number.isFinite(span) || span <= 0) return sequentialFill(1)
  const t = (value - min) / span
  return sequentialFill(Math.floor(t * (RAMP_STEPS - 1)) + 1)
}

/** One hue, monotone steps. Discrete ordered things: stages, tiers, phases. */
export const ordinalFill = (step: number): TokenRef => ref(`ord-${clampStep(step)}`)

/** Ordinal step for position `index` of `count` ordered marks. */
export const ordinalFillForIndex = (index: number, count: number): TokenRef => {
  if (!Number.isFinite(index) || !Number.isFinite(count) || count <= 1) return ordinalFill(3)
  const t = Math.min(1, Math.max(0, index / (count - 1)))
  return ordinalFill(Math.round(t * (RAMP_STEPS - 1)) + 1)
}

/**
 * NEVER use a value ramp on nominal categories. Nominal bars all take slot 1;
 * this is the accessor that says so out loud.
 */
export const nominalFill = (): TokenRef => seriesFill(1)

/* -------------------------------------------------------------------------- */
/* Diverging - polarity around a baseline                                     */
/* -------------------------------------------------------------------------- */

export type DivergingStep = 'neg-3' | 'neg-2' | 'neg-1' | 'mid' | 'pos-1' | 'pos-2' | 'pos-3'

export const divergingFill = (step: DivergingStep): TokenRef => ref(`div-${step}`)

/**
 * Two opposed hues with a NEUTRAL GREY midpoint. `magnitude` is the largest
 * absolute value in the domain, so both arms share one scale and a small
 * negative is not painted as strongly as a large one.
 *
 * Zero - and a zero or non-finite magnitude - returns the neutral midpoint,
 * which is the honest reading of "no change".
 */
export const divergingFillForValue = (value: number, magnitude: number): TokenRef => {
  if (!Number.isFinite(value) || value === 0) return divergingFill('mid')
  if (!Number.isFinite(magnitude) || magnitude <= 0) return divergingFill('mid')
  const t = Math.min(1, Math.abs(value) / magnitude)
  const arm = t > 2 / 3 ? 3 : t > 1 / 3 ? 2 : 1
  return divergingFill(`${value > 0 ? 'pos' : 'neg'}-${arm}` as DivergingStep)
}

/* -------------------------------------------------------------------------- */
/* Mark geometry - fixed, shared by every chart                               */
/* -------------------------------------------------------------------------- */

/**
 * One geometry for every chart in the app. Charts import these rather than
 * choosing their own, so a bar in the mapping progression is the same weight as
 * a bar in the species table.
 */
export const MARK = {
  /** Bars and columns are capped in thickness; the band's leftover is air. */
  maxBarThickness: 24,
  /** Radius on the DATA END only - the baseline end stays square. */
  barEndRadius: 3,
  /** Lines are 2 px with round caps. */
  lineWidth: 2,
  /** Markers are never smaller than this, so they remain findable. */
  markerRadius: 4,
  /** Area fills sit at ~10 % so the line on top stays the signal. */
  areaFillOpacity: 0.1,
  /** Gridlines and axes: solid 1 px hairlines. Never dashed, never heavy. */
  hairlineWidth: 1,
  /**
   * A gap in the SURFACE colour separates touching fills - stacked segments and
   * adjacent bars alike - and a ring of the same width sits on overlapping
   * dots. Never a stroke of a border colour around a mark.
   */
  surfaceGap: 2,
  /** Hit targets are bigger than the mark they belong to. */
  minHitTarget: 24,
  /** Axis tick label offset from the plot edge. */
  tickPadding: 6,
} as const

/** The paint for the gap between touching fills and the ring on overlapping dots. */
export const markSeparator: TokenRef = chrome.surface1
