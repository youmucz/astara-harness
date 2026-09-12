/**
 * Boot-page presentation resolution. It converts host-supplied configuration
 * into the closed record the boot page renders: bounded plain-text chrome, an
 * optional `lang`/`dir` pair, and accepted values for the six color custom
 * properties of the page's own stylesheet. A color is applied only when it is an
 * independently resolvable literal from the documented grammar and the engine
 * confirms its syntax. The resolver reads only the documented field names, never
 * enumerates the supplied object, never recurses into a nested value, and never
 * invokes a supplied value, so a malformed or raising configuration degrades
 * field by field instead of failing the page.
 * @module @deepseek-ai/dsh-client-web/src/boot-presentation
 */

/** The color custom properties the boot page's stylesheet consumes. */
const COLOR_PROPERTIES = [
  '--dsh-boot-bg',
  '--dsh-boot-label-primary',
  '--dsh-boot-label-secondary',
  '--dsh-boot-label-tertiary',
  '--dsh-boot-border',
  '--dsh-boot-brand',
] as const

/** One of the six color custom properties a presentation may override. */
export type BootColorProperty = (typeof COLOR_PROPERTIES)[number]

/** Writing direction accepted for the boot root's `dir` attribute. */
export type BootDirection = 'ltr' | 'rtl' | 'auto'

/** Maximum accepted length of the wordmark. */
const WORDMARK_MAX_LENGTH = 256

/** Maximum accepted length of a heading or the failure explanation. */
const TEXT_MAX_LENGTH = 1024

/** Maximum accepted length of a language tag. */
const LANG_MAX_LENGTH = 35

/** Maximum accepted length of a color value. */
const COLOR_MAX_LENGTH = 256

/** Wordmark shown above the progress arc when none is configured. */
const DEFAULT_WORDMARK = 'HARNESS'

/** Hint shown below the progress arc when none is configured. */
const DEFAULT_LOADING = 'Loading plugins…'

/** Heading shown above a failure report when none is configured. */
const DEFAULT_FAILURE = 'Failed to load plugins'

/**
 * The color keywords this module accepts: the 148-name CSS named-color keyword
 * set plus `transparent`. Membership is exactly this list — a documented closed
 * subset of `<color>` values, not a promise that every CSS color is accepted.
 * `currentcolor`, the CSS-wide keywords, and every system color are absent by
 * construction, so no keyword can depend on the element or the user agent.
 */
const COLOR_KEYWORDS = new Set([
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'transparent',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
])

/** Hexadecimal colors: `#rgb`, `#rgba`, `#rrggbb`, and `#rrggbbaa` only. */
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/**
 * Numeric color functions whose argument alphabet is digits, `.`, `%`, `,`,
 * `/`, space, `+`, and `-`. No letter can follow the function name, so no
 * argument can be an identifier, a nested call, an escape, or a comment.
 */
const NUMERIC_COLOR = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([0-9.,%/ +-]+\)$/i

/**
 * `color()` with one of the nine predefined color spaces — the only letters the
 * form accepts — followed by the same letter-free argument alphabet.
 */
const COLOR_FUNCTION = /^color\((?:srgb-linear|srgb|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz-d50|xyz-d65|xyz) +[0-9.,%/ +-]+\)$/i

/**
 * Host-supplied presentation configuration for the boot page. Every field is
 * optional, and a field that is absent or outside its documented bound falls
 * back to the kernel default instead of failing the page.
 */
export interface BootPresentation {
  /** Loading wordmark: a non-empty trimmed string of at most 256 characters. */
  readonly wordmark?: string
  /** Loading hint: a non-empty trimmed string of at most 1024 characters. */
  readonly loading?: string
  /** Failure heading: a non-empty trimmed string of at most 1024 characters. */
  readonly failure?: string
  /** Explanation under the failed entry names; at most 1024 characters. */
  readonly failureExplanation?: string
  /** Boot root `lang` attribute: a non-empty trimmed string of at most 35 characters. */
  readonly lang?: string
  /** Boot root `dir` attribute: exactly `ltr`, `rtl`, or `auto`. */
  readonly dir?: BootDirection
  /**
   * Values for the six documented color properties. A value is applied only
   * when it is an independently resolvable color literal — a hex form, one of
   * the documented keywords, or a numeric color function — that the engine also
   * accepts as color syntax, and the page's `--dsw-alias-*` layer still decides
   * which value is effective.
   */
  readonly cssVariables?: Readonly<Partial<Record<BootColorProperty, string>>>
}

/**
 * Presentation the boot page renders. The text fields are always present; an
 * optional field is `undefined` when the configuration supplied no accepted
 * value for it.
 */
export interface ResolvedBootPresentation {
  /** Wordmark shown above the progress arc. */
  readonly wordmark: string
  /** Hint shown below the progress arc. */
  readonly loading: string
  /** Heading shown above a failure report. */
  readonly failure: string
  /** Explanation shown below the failed entry names, when configured. */
  readonly failureExplanation: string | undefined
  /** Boot root `lang` attribute, when configured. */
  readonly lang: string | undefined
  /** Boot root `dir` attribute, when configured. */
  readonly dir: BootDirection | undefined
  /** Accepted color overrides — closed literals the engine confirms — in the documented property order. */
  readonly cssVariables: readonly (readonly [BootColorProperty, string])[]
}

/**
 * Accept only a plain configuration object. A primitive, `null`, or an array
 * keeps the caller's defaults, including an array that carries assigned fields.
 * @param value - Candidate configuration object or property value.
 * @returns The object, or `undefined` when the value is not a usable object.
 */
function asRecord(value: unknown): object | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  try {
    return Array.isArray(value) ? undefined : value
  } catch {
    // `Array.isArray` raises for a proxy that has been revoked, and a revoked
    // object exposes no readable field; the caller keeps its defaults.
    return undefined
  }
}

/**
 * Read one documented field of an untrusted object.
 * @param source - Configuration object supplied by the host, when usable.
 * @param key - Documented field or property name.
 * @returns The field value, or `undefined` when the read raises.
 */
function readField(source: object | undefined, key: string): unknown {
  try {
    return (source as Record<string, unknown> | undefined)?.[key]
  } catch {
    // A getter or proxy trap that raises costs this one field; every other
    // field still resolves and the page still renders.
    return undefined
  }
}

/**
 * Bound one optional string field to its documented maximum length.
 * @param value - Raw field value.
 * @param maxLength - Maximum accepted length in characters.
 * @returns The trimmed value, or `undefined` when the value is not a non-empty
 * string of at most `maxLength` characters.
 */
function boundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' || trimmed.length > maxLength ? undefined : trimmed
}

/**
 * Accept only the three bounded HTML writing directions.
 * @param value - Raw field value.
 * @returns The direction, or `undefined` for any other value.
 */
function direction(value: unknown): BootDirection | undefined {
  if (value === 'ltr' || value === 'rtl' || value === 'auto') return value
  return undefined
}

/**
 * Confirm a value is an independently resolvable color literal. The alphabet and
 * the vocabulary are closed, so a value cannot reference the element or the user
 * agent: there is no room for `var()`, `env()`, `attr()`, `calc()`,
 * `currentcolor`, a CSS-wide keyword, a system color, an escape, a comment, or a
 * nested call. Component-count validity stays with {@link supportedColor}.
 * @param value - Trimmed candidate color value.
 * @returns Whether the value is one of the four closed literal forms.
 */
function independentColor(value: string): boolean {
  return COLOR_KEYWORDS.has(value.toLowerCase())
    || HEX_COLOR.test(value)
    || NUMERIC_COLOR.test(value)
    || COLOR_FUNCTION.test(value)
}

/**
 * Confirm the engine accepts an already-closed literal as color syntax. A value
 * the engine rejects would make its declaration invalid at computed-value time
 * instead of falling back through `var()`, so a rejected value must never reach
 * the boot root. Acceptance is syntactic: the engine does not resolve a value
 * such as `var(--missing)` against the element.
 * @param value - Trimmed candidate color value.
 * @returns Whether the engine's `CSS.supports('color', value)` accepts it.
 */
function supportedColor(value: string): boolean {
  try {
    const css = (globalThis as { CSS?: { supports?(property: string, value: string): boolean } }).CSS
    return css?.supports?.('color', value) === true
  } catch {
    // A `CSS` accessor or probe that raises confirms nothing, so the property
    // keeps the stylesheet default instead of an unvalidated value.
    return false
  }
}

/**
 * Read the six documented color properties by name, keeping a value only when it
 * is an independently resolvable color literal the engine also accepts.
 * @param source - Configuration object supplied by the host.
 * @returns Accepted name/value pairs in the documented property order.
 */
function colorVariables(source: object | undefined): readonly (readonly [BootColorProperty, string])[] {
  const supplied = asRecord(readField(source, 'cssVariables'))
  if (supplied === undefined) return []
  const accepted: (readonly [BootColorProperty, string])[] = []
  for (const name of COLOR_PROPERTIES) {
    const value = boundedString(readField(supplied, name), COLOR_MAX_LENGTH)
    if (value !== undefined && independentColor(value) && supportedColor(value)) accepted.push([name, value])
  }
  return accepted
}

/**
 * Resolve host-supplied presentation configuration into the record the boot
 * page renders. Resolution is per field and total: a configuration that is
 * absent, not a plain object (an array included), or invalid in one field keeps
 * the kernel default for that field, so the boot page itself validates nothing.
 * @param config - Untrusted host configuration.
 * @returns A fully populated presentation record.
 */
export function resolveBootPresentation(config: unknown): ResolvedBootPresentation {
  const source = asRecord(config)
  return {
    wordmark: boundedString(readField(source, 'wordmark'), WORDMARK_MAX_LENGTH) ?? DEFAULT_WORDMARK,
    loading: boundedString(readField(source, 'loading'), TEXT_MAX_LENGTH) ?? DEFAULT_LOADING,
    failure: boundedString(readField(source, 'failure'), TEXT_MAX_LENGTH) ?? DEFAULT_FAILURE,
    failureExplanation: boundedString(readField(source, 'failureExplanation'), TEXT_MAX_LENGTH),
    lang: boundedString(readField(source, 'lang'), LANG_MAX_LENGTH),
    dir: direction(readField(source, 'dir')),
    cssVariables: colorVariables(source),
  }
}
