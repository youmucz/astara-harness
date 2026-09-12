// @vitest-environment jsdom
/**
 * Boot presentation contract of the framework-free boot page: English defaults,
 * localized chrome, plain-text-only values, bounded reads of untrusted
 * configuration, scoped color overrides, and kernel ownership of the boot root.
 *
 * This environment has no CSS engine: jsdom leaves `CSS` undefined, loads no
 * stylesheet, and cannot resolve `var()`. The color cases therefore drive the
 * engine half of the two-part validation through an explicit `CSS.supports` stub
 * plus the no-engine skip path, while the kernel's own closed literal grammar is
 * exercised directly. Alias precedence is pinned structurally against
 * `boot-page.module.css`. Real component-count acceptance by a browser engine and
 * real computed precedence are that lane's measurement, never claimed here.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as modulesClient from '@deepseek-ai/dsh-client-modules/client'
import type {
  ClientBundleRegistration, ClientModuleCreateOptions, ClientModuleLoaderTarget, DshWindow,
  WebBootEntry,
} from '@deepseek-ai/dsh-client-modules/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveBootPresentation } from '../src/boot-presentation.ts'
import { BootPage } from '../src/boot-page.ts'
import { AppWebEntry, type BootSeams } from '../src/boot.ts'
import * as webPackage from '../src/index.ts'
import type { BootPresentation } from '../src/index.ts'

const win = globalThis as DshWindow
const transportGlobal = globalThis as {
  __DSH_TRANSPORT__?: { loadBundle?: (url: string) => Promise<void> }
}

/**
 * Collapsed stylesheet text: source layout whitespace carries no meaning here.
 * `import.meta.url` is http-scheme in the jsdom pool, and vitest runs from the
 * repository root, so the sheet is resolved repo-relatively.
 */
const stylesheet = readFileSync(
  resolve('packages/client/web/src/boot-page.module.css'),
  'utf8',
).replaceAll(/\s+/g, ' ')

/** Every alias → private pair the boot stylesheet consumes, alias outermost. */
const ALIAS_PAIRS = [
  ['--dsw-alias-bg-base', '--dsh-boot-bg'],
  ['--dsw-alias-label-primary', '--dsh-boot-label-primary'],
  ['--dsw-alias-label-secondary', '--dsh-boot-label-secondary'],
  ['--dsw-alias-label-tertiary', '--dsh-boot-label-tertiary'],
  ['--dsw-alias-border-l2', '--dsh-boot-border'],
  ['--dsw-alias-brand-primary', '--dsh-boot-brand'],
] as const

/** The six documented color property names a presentation configuration may carry. */
const DOCUMENTED_COLORS: readonly string[] = ALIAS_PAIRS.map(([, privateName]) => privateName)

/** Non-English chrome used by the localized-presentation cases. */
const LOCALIZED = {
  wordmark: '工作台',
  loading: '正在加载插件…',
  failure: '插件加载失败',
  failureExplanation: '请查看控制台了解详情',
} as const

/** Exactly 35 characters: the documented `lang` bound, spelled as a valid private-use tag. */
const BOUND_LANG = 'zh-Hant-TW-x-harness-private-000123'

/** The loader-owned failure report the entry passes to `fail()` verbatim. */
const REPORT_TEXT = 'web boot: 1 entry did not activate'

/** Report the kernel produces when no bootstrap facade owns the document. */
const REPORT_TEXT_FOR_MISSING_FACADE = 'web boot: window.__ModuleLoader__ bootstrap facade is missing'

/** Message of the probe error the module-system facade throws in these cases. */
const PROBE_MESSAGE = 'probe: module system construction stopped'

/** Registration key of the modules bundle that owns the client module system. */
const MODULES_ID = '@deepseek-ai/dsh-client-modules'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  // The throwing-engine case installs its own accessor, which `unstubAllGlobals` does not own.
  Reflect.deleteProperty(globalThis, 'CSS')
  delete win.__DSH_BOOT__
  delete win.__ModuleLoader__
  delete transportGlobal.__DSH_TRANSPORT__
  document.body.innerHTML = ''
})

/** Mount a container under the test body and return it. */
function mount(): HTMLElement {
  const container = document.createElement('div')
  document.body.append(container)
  return container
}

/** The kernel-owned boot root inside a container. */
function bootRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>('[data-dsh-boot]')
  if (root === null) throw new Error('boot root is missing')
  return root
}

/** The kernel-owned spinner inside a container. */
function bootSpinner(container: HTMLElement): HTMLElement {
  const spinner = container.querySelector<HTMLElement>('[data-dsh-boot-spinner]')
  if (spinner === null) throw new Error('boot spinner is missing')
  return spinner
}

/** Text-node data of a subtree in document order. */
function textNodes(node: Node): string[] {
  const data: string[] = []
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) data.push(child.textContent ?? '')
    else data.push(...textNodes(child))
  }
  return data
}

/** Inline custom-property names present on an element, in declaration order. */
function inlineProperties(element: HTMLElement): string[] {
  const names: string[] = []
  for (let index = 0; index < element.style.length; index += 1) {
    const name = element.style.item(index)
    if (name !== '') names.push(name)
  }
  return names
}

/**
 * Install an explicit `CSS.supports` stub and record every probe. A value reaches
 * this probe only after the kernel's closed literal grammar accepted it; whether
 * a real engine accepts the literal's component counts is the browser lane's
 * measurement.
 * @param accepts - Engine verdict for one property value.
 * @returns Every recorded `(property, value)` probe.
 */
function stubColorEngine(accepts: (value: string) => boolean): ReadonlyArray<readonly [string, string]> {
  const probes: Array<readonly [string, string]> = []
  vi.stubGlobal('CSS', {
    supports: (property: string, value: string): boolean => {
      probes.push([property, value])
      return accepts(value)
    },
  })
  return probes
}

/** Resolve untrusted configuration and build the page, asserting construction never throws. */
function mountPage(container: HTMLElement, config: unknown): BootPage {
  let page: BootPage | undefined
  expect(() => { page = new BootPage(container, resolveBootPresentation(config)) }).not.toThrow()
  if (page === undefined) throw new Error('boot page construction threw')
  return page
}

/**
 * Install a facade whose `create` records the entry's create options, then fails the boot.
 * @param failure - Rejection the probe raises; an `Error` unless a case needs another value.
 */
function installCreateProbe(
  failure: unknown = new Error(PROBE_MESSAGE),
): { options: ClientModuleCreateOptions | undefined } {
  const probe: { options: ClientModuleCreateOptions | undefined } = { options: undefined }
  const target: ClientModuleLoaderTarget = {
    mode: 'queue',
    pendingQueue: [],
    load: () => {},
    create: (options) => {
      probe.options = options
      throw failure
    },
  }
  win.__ModuleLoader__ = target
  return probe
}

/** Install the live module-system facade the Host injects on the page before the entry runs. */
function installLiveFacade(): void {
  const pendingQueue: ClientBundleRegistration[] = []
  const target: ClientModuleLoaderTarget = {
    mode: 'queue',
    pendingQueue,
    load: (registration) => { pendingQueue.push(registration) },
    create: options => modulesClient.createClientModuleSystem(
      target,
      { id: MODULES_ID, exports: modulesClient },
      options,
    ),
  }
  win.__ModuleLoader__ = target
}

/** Two distinct transport hooks, so each case can prove which one reached the module system. */
const transportLoad = (): Promise<void> => Promise.resolve()
const seamLoad: BootSeams['loadBundle'] = () => Promise.resolve()

describe('resolveBootPresentation field resolution', () => {
  it('returns the documented English defaults for unusable configuration', () => {
    const unusable: ReadonlyArray<readonly [string, unknown]> = [
      ['undefined', undefined],
      ['null', null],
      ['a number', 7],
      ['a string', 'HARNESS'],
      ['a boolean', true],
      ['a function', () => 'HARNESS'],
      ['an empty object', {}],
      ['an empty array', []],
      [
        'an array carrying assigned fields',
        Object.assign([], {
          wordmark: 'ARRAY',
          loading: 'ARRAY',
          cssVariables: { '--dsh-boot-bg': '#123456' },
        }),
      ],
    ]
    const observed = unusable.map(([label, config]) => {
      const resolved = resolveBootPresentation(config)
      return {
        label,
        wordmark: resolved.wordmark,
        loading: resolved.loading,
        failure: resolved.failure,
        failureExplanation: resolved.failureExplanation,
        lang: resolved.lang,
        dir: resolved.dir,
      }
    })
    expect(observed).toEqual(unusable.map(([label]) => ({
      label,
      wordmark: 'HARNESS',
      loading: 'Loading plugins…',
      failure: 'Failed to load plugins',
      failureExplanation: undefined,
      lang: undefined,
      dir: undefined,
    })))
  })

  it('accepts every string and attribute field at its documented maximum length', () => {
    expect(BOUND_LANG).toHaveLength(35)
    const resolved = resolveBootPresentation({
      wordmark: 'W'.repeat(256),
      loading: 'L'.repeat(1024),
      failure: 'F'.repeat(1024),
      failureExplanation: 'E'.repeat(1024),
      lang: BOUND_LANG,
      dir: 'auto',
    })
    expect(resolved.wordmark).toBe('W'.repeat(256))
    expect(resolved.loading).toBe('L'.repeat(1024))
    expect(resolved.failure).toBe('F'.repeat(1024))
    expect(resolved.failureExplanation).toBe('E'.repeat(1024))
    expect(resolved.lang).toBe(BOUND_LANG)
    expect(resolved.dir).toBe('auto')
  })

  it('treats over-long strings as absent instead of truncating them', () => {
    const resolved = resolveBootPresentation({
      wordmark: 'W'.repeat(257),
      loading: 'L'.repeat(1025),
      failure: 'F'.repeat(1025),
      failureExplanation: 'E'.repeat(1025),
      lang: 'l'.repeat(36),
    })
    expect(resolved.wordmark).toBe('HARNESS')
    expect(resolved.loading).toBe('Loading plugins…')
    expect(resolved.failure).toBe('Failed to load plugins')
    expect(resolved.failureExplanation).toBeUndefined()
    expect(resolved.lang).toBeUndefined()
  })

  it('treats whitespace-only strings as absent', () => {
    const resolved = resolveBootPresentation({
      wordmark: '   ',
      loading: '\t\n',
      failure: ' ',
      failureExplanation: '  ',
    })
    expect(resolved.wordmark).toBe('HARNESS')
    expect(resolved.loading).toBe('Loading plugins…')
    expect(resolved.failure).toBe('Failed to load plugins')
    expect(resolved.failureExplanation).toBeUndefined()
  })

  it('keeps a valid field when a sibling field has the wrong type', () => {
    const resolved = resolveBootPresentation({
      wordmark: LOCALIZED.wordmark,
      loading: 42,
      failure: null,
      failureExplanation: { text: 'x' },
      lang: 'zh',
      dir: 'rtl',
    })
    expect(resolved.wordmark).toBe(LOCALIZED.wordmark)
    expect(resolved.loading).toBe('Loading plugins…')
    expect(resolved.failure).toBe('Failed to load plugins')
    expect(resolved.failureExplanation).toBeUndefined()
    expect(resolved.lang).toBe('zh')
    expect(resolved.dir).toBe('rtl')
  })

  it('limits direction to the three documented literals', () => {
    for (const dir of ['ltr', 'rtl', 'auto'] as const) {
      expect(resolveBootPresentation({ dir }).dir).toBe(dir)
    }
    for (const dir of ['diagonal', 'LTR', '']) {
      expect(resolveBootPresentation({ dir }).dir).toBeUndefined()
    }
  })

  it('costs one field when that field read raises', () => {
    const config = {
      wordmark: 'HARNESS',
      get loading(): string { throw new Error('host getter failed') },
      failure: LOCALIZED.failure,
      dir: 'rtl',
    }
    const resolved = resolveBootPresentation(config)
    expect(resolved.wordmark).toBe('HARNESS')
    expect(resolved.loading).toBe('Loading plugins…')
    expect(resolved.failure).toBe(LOCALIZED.failure)
    expect(resolved.dir).toBe('rtl')
  })

  it('reads a getter-valued field through a direct property read', () => {
    let reads = 0
    const config = {
      get wordmark(): string {
        reads += 1
        return 'GETTER'
      },
    }
    expect(resolveBootPresentation(config).wordmark).toBe('GETTER')
    expect(reads).toBeGreaterThan(0)
  })

  it('reads only the documented names and never enumerates the configuration', () => {
    const invoked = vi.fn(() => 'called')
    const config = new Proxy<Record<string, unknown>>({
      wordmark: '代理',
      render: invoked,
      html: invoked,
      template: invoked,
    }, {
      get: (target, property) => (typeof property === 'string' ? target[property] : undefined),
      ownKeys: () => { throw new Error('the resolver must not enumerate the configuration') },
    })
    const resolved = resolveBootPresentation(config)
    expect(resolved.wordmark).toBe('代理')
    expect(invoked).not.toHaveBeenCalled()
  })
})

describe('boot page defaults', () => {
  it('draws the English loading chrome with no injected attribute or property', () => {
    const container = mount()
    new BootPage(container)
    const root = bootRoot(container)
    expect(root.textContent).toContain('HARNESS')
    expect(root.textContent).toContain('Loading plugins…')
    expect(root.hasAttribute('lang')).toBe(false)
    expect(root.hasAttribute('dir')).toBe(false)
    expect(inlineProperties(root)).toEqual([])
    expect(bootSpinner(container).style.getPropertyValue('--dsh-boot-arc')).toBe('72deg')
    expect(inlineProperties(bootSpinner(container))).toEqual(['--dsh-boot-arc'])
  })

  it('draws the same defaults for an empty presentation record', () => {
    const container = mount()
    new BootPage(container, resolveBootPresentation({}))
    const root = bootRoot(container)
    expect(root.textContent).toContain('HARNESS')
    expect(root.textContent).toContain('Loading plugins…')
    expect(inlineProperties(root)).toEqual([])
  })

  it('keeps the default failure heading with one plain-text line per failed entry', () => {
    const container = mount()
    const page = new BootPage(container)
    page.setState('@deepseek-ai/dsh-client-ui-layout', 'failed')
    page.setState('ok', 'active')
    const nodes = textNodes(container)
    expect(nodes).toContain('Failed to load plugins')
    expect(nodes).toContain('@deepseek-ai/dsh-client-ui-layout')
    expect(nodes).not.toContain('ok')
  })
})

describe('localized chrome', () => {
  it('replaces the English wordmark and loading heading with configured text', () => {
    const container = mount()
    new BootPage(container, resolveBootPresentation(LOCALIZED))
    const root = bootRoot(container)
    expect(root.textContent).toContain(LOCALIZED.wordmark)
    expect(root.textContent).toContain(LOCALIZED.loading)
    expect(root.textContent).not.toContain('HARNESS')
    expect(root.textContent).not.toContain('Loading plugins…')
  })

  it('renders the failure heading, entry names, explanation, then the raw report', () => {
    const container = mount()
    const page = new BootPage(container, resolveBootPresentation(LOCALIZED))
    page.setTotal(4)
    const failedName = '@deepseek-ai/dsh-client-ui-layout'
    page.setState('a', 'active')
    page.setState('b', 'active')
    page.setState(failedName, 'failed')
    const rawReport = `${REPORT_TEXT}\n${failedName}: pending (waiting for service: y)`
    page.fail(rawReport)

    const nodes = textNodes(container)
    expect(nodes[0]).toBe(LOCALIZED.wordmark)
    expect(nodes.filter(node => node === rawReport)).toHaveLength(1)
    const positionOf = (text: string): number => {
      const index = nodes.indexOf(text)
      expect(index).toBeGreaterThanOrEqual(0)
      return index
    }
    expect(positionOf(LOCALIZED.failure)).toBeLessThan(positionOf(failedName))
    expect(positionOf(failedName)).toBeLessThan(positionOf(LOCALIZED.failureExplanation))
    expect(positionOf(LOCALIZED.failureExplanation)).toBeLessThan(positionOf(rawReport))
    expect(nodes).not.toContain(LOCALIZED.loading)
  })

  it('sets the configured language and direction on the boot root only', () => {
    const container = mount()
    new BootPage(container, resolveBootPresentation({ ...LOCALIZED, lang: 'ar', dir: 'rtl' }))
    const root = bootRoot(container)
    expect(root.getAttribute('lang')).toBe('ar')
    expect(root.getAttribute('dir')).toBe('rtl')
    expect(document.documentElement.getAttribute('lang')).not.toBe('ar')
    expect(document.documentElement.getAttribute('dir')).not.toBe('rtl')
    expect(document.body.getAttribute('lang')).not.toBe('ar')
    expect(document.body.getAttribute('dir')).not.toBe('rtl')
  })

  it('accepts the auto direction literal', () => {
    const container = mount()
    new BootPage(container, resolveBootPresentation({ dir: 'auto' }))
    expect(bootRoot(container).getAttribute('dir')).toBe('auto')
  })

  it('injects no attribute when the language or direction is unusable', () => {
    const container = mount()
    new BootPage(container, resolveBootPresentation({
      wordmark: LOCALIZED.wordmark,
      lang: 'l'.repeat(36),
      dir: 'diagonal',
    }))
    const root = bootRoot(container)
    expect(root.textContent).toContain(LOCALIZED.wordmark)
    expect(root.hasAttribute('lang')).toBe(false)
    expect(root.hasAttribute('dir')).toBe(false)
  })
})

describe('plain-text presentation values', () => {
  it('keeps a markup-bearing heading as one literal text node', () => {
    const markup = '<img src=x onerror=alert(1)>'
    const container = mount()
    new BootPage(container, resolveBootPresentation({ wordmark: markup }))
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
    expect(textNodes(container).filter(node => node === markup)).toHaveLength(1)
    expect(container.textContent).toContain(markup)
  })

  it('invokes no supplied function or element value', () => {
    const invoked = vi.fn(() => 'called')
    const container = mount()
    new BootPage(container, resolveBootPresentation({
      wordmark: invoked,
      loading: document.createElement('b'),
      failure: invoked,
      render: invoked,
    }))
    expect(invoked).not.toHaveBeenCalled()
    expect(textNodes(container)[0]).toBe('HARNESS')
    expect(container.querySelector('b')).toBeNull()
  })
})

describe('bounded reads of untrusted configuration', () => {
  it('renders per-field defaults and still reports a loader failure', () => {
    const container = mount()
    const page = mountPage(container, {
      wordmark: LOCALIZED.wordmark,
      loading: 42,
      failure: LOCALIZED.failure,
      failureExplanation: 'E'.repeat(1025),
      lang: 'l'.repeat(36),
      dir: 'diagonal',
    })
    const root = bootRoot(container)
    expect(root.textContent).toContain(LOCALIZED.wordmark)
    expect(root.textContent).toContain('Loading plugins…')
    expect(root.hasAttribute('lang')).toBe(false)
    expect(root.hasAttribute('dir')).toBe(false)
    page.setState('entry-partial', 'failed')
    page.fail(REPORT_TEXT)
    const nodes = textNodes(container)
    expect(nodes).toContain(LOCALIZED.failure)
    expect(nodes).toContain('entry-partial')
    expect(nodes).toContain(REPORT_TEXT)
  })

  it('renders the default presentation for a primitive configuration without throwing', () => {
    for (const config of [null, 7, 'HARNESS']) {
      const container = mount()
      const page = mountPage(container, config)
      expect(bootRoot(container).textContent).toContain('Loading plugins…')
      page.setState('entry-primitive', 'failed')
      page.fail(REPORT_TEXT)
      expect(textNodes(container)).toContain(REPORT_TEXT)
    }
  })

  it('ignores fields assigned to an array configuration and applies no color', () => {
    stubColorEngine(() => true)
    const container = mount()
    const config = Object.assign([], {
      loading: '读我',
      cssVariables: { '--dsh-boot-bg': '#123456' },
    })
    const page = mountPage(container, config)
    const root = bootRoot(container)
    expect(root.textContent).toContain('Loading plugins…')
    expect(root.textContent).not.toContain('读我')
    expect(inlineProperties(root)).toEqual([])
    page.setState('entry-array', 'failed')
    page.fail(REPORT_TEXT)
    expect(textNodes(container)).toContain(REPORT_TEXT)
  })

  it('renders around a raising configuration read', () => {
    const container = mount()
    const config = {
      get wordmark(): string { throw new Error('host getter failed') },
      loading: LOCALIZED.loading,
    }
    const page = mountPage(container, config)
    const root = bootRoot(container)
    expect(root.textContent).toContain('HARNESS')
    expect(root.textContent).toContain(LOCALIZED.loading)
    page.setState('entry-getter', 'failed')
    page.fail(REPORT_TEXT)
    expect(textNodes(container)).toContain(REPORT_TEXT)
  })

  it('falls back without throwing when every read of the configuration raises', () => {
    const revoked = Proxy.revocable<Record<string, unknown>>({ wordmark: 'REVOKED' }, {})
    revoked.revoke()
    const container = mount()
    const page = mountPage(container, revoked.proxy)
    const root = bootRoot(container)
    expect(root.textContent).toContain('HARNESS')
    expect(root.textContent).toContain('Loading plugins…')
    page.setState('entry-revoked', 'failed')
    page.fail(REPORT_TEXT)
    expect(textNodes(container)).toContain(REPORT_TEXT)
  })

  it('falls back without throwing when every read of the color map raises', () => {
    stubColorEngine(() => true)
    const revoked = Proxy.revocable<Record<string, unknown>>({ '--dsh-boot-bg': '#123456' }, {})
    revoked.revoke()
    const container = mount()
    const page = mountPage(container, { wordmark: LOCALIZED.wordmark, cssVariables: revoked.proxy })
    const root = bootRoot(container)
    expect(root.textContent).toContain(LOCALIZED.wordmark)
    expect(inlineProperties(root)).toEqual([])
    page.setState('entry-revoked-colors', 'failed')
    page.fail(REPORT_TEXT)
    expect(textNodes(container)).toContain(REPORT_TEXT)
  })
})

/**
 * Literals the locked grammar accepts on its own: the CSS named colors (any
 * case), `transparent`, the four hex forms, and the numeric or `color()`
 * functions whose argument alphabet carries no letter.
 */
const ACCEPTED_COLORS = [
  'red',
  'transparent',
  'rebeccapurple',
  'gray',
  'grey',
  'RED',
  'RebeccaPurple',
  '#abc',
  '#abcd',
  '#aabbcc',
  '#aabbccdd',
  '#AABBCC',
  'rgb(1, 2, 3)',
  'rgba(1 2 3 / 0.5)',
  'rgb(1 2 3/50%)',
  'rgb(+1 -2 3)',
  'hsl(120 100% 50%)',
  'hsla(120, 100%, 50%, 0.5)',
  'hwb(120 0% 0%)',
  'lab(50% 0 0)',
  'lch(50% 0 0)',
  'oklab(50% 0 0)',
  'oklch(50% 0 0 / +0.5)',
  'color(srgb 1 0 0)',
  'color(srgb-linear 1 0 0)',
  'color(display-p3 1 0 0)',
  'color(a98-rgb 1 0 0)',
  'color(prophoto-rgb 1 0 0)',
  'color(rec2020 1 0 0)',
  'color(xyz-d50 0.1 0.2 0.3)',
  'color(xyz-d65 0.1 0.2 0.3)',
  'color(xyz 0.1 0.2 0.3)',
  '  red  ',
] as const

/**
 * Literals the independent grammar rejects before the engine is consulted:
 * element references, element-relative and CSS-wide keywords, system colors,
 * escapes, comments, and forms whose letters come from a unit or a nested call.
 */
const REJECTED_COLORS = [
  'var(--dsh-not-defined)',
  'var(--x, red)',
  'env(safe-area-inset-top)',
  'attr(data-color)',
  'currentColor',
  'currentcolor',
  'none',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
  'Canvas',
  'ButtonFace',
  'ActiveText',
  'AccentColor',
  'r\\65 d',
  '#abc/**/',
  're/**/d',
  'rgb(var(--x) 0 0)',
  'rgb(from red r g b)',
  'color(from red srgb r g b)',
  'rgb(1e2 0 0)',
  'hsl(120deg 100% 50%)',
  'rgb(calc(1) 0 0)',
  'url(https://example.invalid/x)',
  '#ab',
  '#abcde',
  '#abcdefg',
] as const

describe('scoped color overrides with a stubbed engine probe', () => {
  it('applies engine-accepted values to the boot root only', () => {
    const accepted = new Set(['#123456', 'rgb(1 2 3)', '#abcdef'])
    const probes = stubColorEngine(value => accepted.has(value))
    const container = mount()
    new BootPage(container, resolveBootPresentation({
      cssVariables: {
        '--dsh-boot-bg': '#123456',
        '--dsh-boot-label-primary': 'rgb(1 2 3)',
        '--dsh-boot-brand': '#abcdef',
      },
    }))
    const root = bootRoot(container)
    expect(root.style.getPropertyValue('--dsh-boot-bg')).toBe('#123456')
    expect(root.style.getPropertyValue('--dsh-boot-label-primary')).toBe('rgb(1 2 3)')
    expect(root.style.getPropertyValue('--dsh-boot-brand')).toBe('#abcdef')
    expect(inlineProperties(root).sort()).toEqual([
      '--dsh-boot-bg',
      '--dsh-boot-brand',
      '--dsh-boot-label-primary',
    ])
    expect(probes.every(([property]) => property === 'color')).toBe(true)
    expect(probes.length).toBeGreaterThanOrEqual(3)
    for (const name of DOCUMENTED_COLORS) {
      expect(document.documentElement.style.getPropertyValue(name)).toBe('')
      expect(document.body.style.getPropertyValue(name)).toBe('')
    }
  })

  it('accepts the documented literal forms, including names in any case', () => {
    const probes = stubColorEngine(() => true)
    const observed = ACCEPTED_COLORS.map((value) => {
      const container = mount()
      new BootPage(container, resolveBootPresentation({ cssVariables: { '--dsh-boot-bg': value } }))
      return {
        value,
        applied: bootRoot(container).style.getPropertyValue('--dsh-boot-bg').toLowerCase(),
      }
    })
    expect(observed).toEqual(ACCEPTED_COLORS.map(value => ({
      value,
      applied: value.trim().toLowerCase(),
    })))
    expect(probes).toHaveLength(ACCEPTED_COLORS.length)
  })

  it('rejects a var() reference instead of applying it', () => {
    const probes = stubColorEngine(() => true)
    const container = mount()
    new BootPage(container, resolveBootPresentation({
      cssVariables: {
        '--dsh-boot-bg': 'var(--dsh-not-defined)',
        '--dsh-boot-brand': 'red',
      },
    }))
    const root = bootRoot(container)
    expect(root.style.getPropertyValue('--dsh-boot-bg')).toBe('')
    expect(root.style.getPropertyValue('--dsh-boot-brand')).toBe('red')
    // The closed grammar decides before the engine is asked, so a reference is
    // never even offered to `CSS.supports`.
    expect(probes.map(([, value]) => value)).toEqual(['red'])
  })

  it('rejects keywords, system colors, escapes, comments, and nested or unit-bearing forms', () => {
    const probes = stubColorEngine(() => true)
    const observed = REJECTED_COLORS.map((value) => {
      const container = mount()
      new BootPage(container, resolveBootPresentation({ cssVariables: { '--dsh-boot-bg': value } }))
      return { value, applied: inlineProperties(bootRoot(container)) }
    })
    expect(observed).toEqual(REJECTED_COLORS.map(value => ({ value, applied: [] })))
    expect(probes).toHaveLength(0)
  })

  it('skips a well-formed literal the engine rejects', () => {
    const probes = stubColorEngine(value => value !== '#123456')
    const container = mount()
    new BootPage(container, resolveBootPresentation({
      cssVariables: {
        '--dsh-boot-bg': '#123456',
        '--dsh-boot-brand': 'red',
      },
    }))
    const root = bootRoot(container)
    expect(root.style.getPropertyValue('--dsh-boot-bg')).toBe('')
    expect(root.style.getPropertyValue('--dsh-boot-brand')).toBe('red')
    expect(probes.map(([, value]) => value)).toEqual(['#123456', 'red'])
  })

  it('keeps the failure report readable when every supplied color is rejected', () => {
    stubColorEngine(() => true)
    const container = mount()
    const page = mountPage(container, {
      cssVariables: { '--dsh-boot-bg': 'currentColor', '--dsh-boot-brand': 'var(--dsh-not-defined)' },
    })
    expect(inlineProperties(bootRoot(container))).toEqual([])
    page.setState('entry-rejected', 'failed')
    page.fail(REPORT_TEXT)
    const nodes = textNodes(container)
    expect(nodes).toContain('Failed to load plugins')
    expect(nodes).toContain(REPORT_TEXT)
  })

  it('skips undocumented names and keeps the failure report readable', () => {
    stubColorEngine(() => true)
    const container = mount()
    const page = new BootPage(container, resolveBootPresentation({
      cssVariables: {
        '--dsh-boot-bg': '#123456',
        '--dsh-boot-layout': 'display: none',
        '--dsh-boot-visibility': 'hidden',
        '--dsw-alias-bg-base': '#000000',
      },
    }))
    const root = bootRoot(container)
    expect(inlineProperties(root)).toEqual(['--dsh-boot-bg'])
    expect(root.style.getPropertyValue('--dsh-boot-layout')).toBe('')
    expect(root.style.getPropertyValue('--dsw-alias-bg-base')).toBe('')
    page.setState('entry-hidden', 'failed')
    page.fail(REPORT_TEXT)
    const nodes = textNodes(container)
    expect(nodes).toContain('Failed to load plugins')
    expect(nodes).toContain(REPORT_TEXT)
  })

  it('skips wrong-typed, empty, over-long, and grammatically invalid values without dropping valid entries', () => {
    const overLong = 'x'.repeat(257)
    const invalid = 'url(https://example.invalid/x)'
    const probes = stubColorEngine(() => true)
    const container = mount()
    new BootPage(container, resolveBootPresentation({
      cssVariables: {
        '--dsh-boot-bg': '#123456',
        '--dsh-boot-label-primary': 'rgb(1 2 3)',
        '--dsh-boot-label-secondary': 42,
        '--dsh-boot-label-tertiary': '',
        '--dsh-boot-border': overLong,
        '--dsh-boot-brand': invalid,
      },
    }))
    const root = bootRoot(container)
    expect(inlineProperties(root).sort()).toEqual(['--dsh-boot-bg', '--dsh-boot-label-primary'])
    expect(root.style.getPropertyValue('--dsh-boot-brand')).toBe('')
    expect(root.style.getPropertyValue('--dsh-boot-border')).toBe('')
    // Neither the over-long value nor the invalid literal reached the engine.
    expect(probes.map(([, value]) => value).sort()).toEqual(['#123456', 'rgb(1 2 3)'])
  })

  it('applies a 256-character literal and rejects a 257-character one', () => {
    const boundValue = `color(srgb ${'0 '.repeat(122)})`
    const overValue = `color(srgb ${'0 '.repeat(122)}0)`
    expect(boundValue).toHaveLength(256)
    expect(overValue).toHaveLength(257)
    const probes = stubColorEngine(() => true)
    const container = mount()
    new BootPage(container, resolveBootPresentation({
      cssVariables: {
        '--dsh-boot-bg': boundValue,
        '--dsh-boot-brand': overValue,
      },
    }))
    const root = bootRoot(container)
    expect(root.style.getPropertyValue('--dsh-boot-bg')).toBe(boundValue)
    expect(root.style.getPropertyValue('--dsh-boot-brand')).toBe('')
    expect(probes.map(([, value]) => value)).toEqual([boundValue])
  })

  it('costs one entry when the engine probe raises', () => {
    stubColorEngine((value) => {
      if (value === 'rgb(9 9 9)') throw new Error('engine probe failed')
      return true
    })
    const container = mount()
    const page = mountPage(container, {
      cssVariables: {
        '--dsh-boot-bg': '#123456',
        '--dsh-boot-brand': 'rgb(9 9 9)',
        '--dsh-boot-label-primary': 'rgb(1 2 3)',
      },
    })
    expect(inlineProperties(bootRoot(container)).sort()).toEqual([
      '--dsh-boot-bg',
      '--dsh-boot-label-primary',
    ])
    page.setState('entry-engine', 'failed')
    page.fail(REPORT_TEXT)
    expect(textNodes(container)).toContain(REPORT_TEXT)
  })

  it('applies no color when reading the global engine itself raises', () => {
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      get: () => { throw new Error('global CSS access failed') },
    })
    const container = mount()
    const page = mountPage(container, {
      cssVariables: {
        '--dsh-boot-bg': '#123456',
        '--dsh-boot-label-primary': 'rgb(1 2 3)',
      },
    })
    expect(inlineProperties(bootRoot(container))).toEqual([])
    page.setState('entry-engine-access', 'failed')
    page.fail(REPORT_TEXT)
    expect(textNodes(container)).toContain(REPORT_TEXT)
  })

  it('applies no color when the color map is an array', () => {
    const probes = stubColorEngine(() => true)
    const container = mount()
    const page = mountPage(container, {
      wordmark: LOCALIZED.wordmark,
      cssVariables: Object.assign([], { '--dsh-boot-bg': '#123456' }),
    })
    expect(inlineProperties(bootRoot(container))).toEqual([])
    expect(probes).toHaveLength(0)
    page.setState('entry-array-colors', 'failed')
    page.fail(REPORT_TEXT)
    expect(textNodes(container)).toContain(REPORT_TEXT)
  })

  it('costs one color when its map read raises and reads only documented names', () => {
    stubColorEngine(() => true)
    const read: string[] = []
    const colors = new Proxy<Record<string, unknown>>({
      '--dsh-boot-bg': '#123456',
      '--dsh-boot-brand': '#abcdef',
    }, {
      get: (target, property) => {
        if (property === '--dsh-boot-label-primary') throw new Error('host proxy read failed')
        if (typeof property !== 'string') return undefined
        read.push(property)
        return target[property]
      },
      ownKeys: () => { throw new Error('the resolver must not enumerate the color map') },
    })
    const container = mount()
    const page = mountPage(container, { wordmark: LOCALIZED.wordmark, cssVariables: colors })
    expect(inlineProperties(bootRoot(container)).sort()).toEqual([
      '--dsh-boot-bg',
      '--dsh-boot-brand',
    ])
    expect(read.every(name => DOCUMENTED_COLORS.includes(name))).toBe(true)
    page.setState('entry-proxy', 'failed')
    page.fail(REPORT_TEXT)
    expect(textNodes(container)).toContain(REPORT_TEXT)
  })

  it('applies no color while this environment has no CSS engine', () => {
    expect(typeof CSS).toBe('undefined')
    const container = mount()
    const page = mountPage(container, {
      cssVariables: {
        '--dsh-boot-bg': '#123456',
        '--dsh-boot-label-primary': 'rgb(1 2 3)',
      },
    })
    expect(inlineProperties(bootRoot(container))).toEqual([])
    expect(container.textContent).toContain('Loading plugins…')
    page.setState('entry-no-engine', 'failed')
    page.fail(REPORT_TEXT)
    expect(textNodes(container)).toContain(REPORT_TEXT)
  })
})

describe('private property and alias precedence (stylesheet check)', () => {
  it('keeps the alias outermost in every fallback chain', () => {
    for (const [alias, privateName] of ALIAS_PAIRS) {
      expect(stylesheet).toContain(`var(${alias}, var(${privateName}))`)
    }
  })

  it('consumes exactly the six documented color properties', () => {
    const consumed = new Set(
      [...stylesheet.matchAll(/var\(--dsw-alias-[a-z0-9-]+,\s*var\((--dsh-boot-[a-z0-9-]+)\)\)/g)]
        .map(match => match[1] ?? ''),
    )
    expect([...consumed].sort()).toEqual([...DOCUMENTED_COLORS].sort())
  })

  it('declares the six private defaults on the boot root and in the dark block', () => {
    const blocks = [...stylesheet.matchAll(/\.boot \{([^}]*)\}/g)].map(match => match[1] ?? '')
    expect(blocks).toHaveLength(2)
    for (const block of blocks) {
      const declared = new Set(
        [...block.matchAll(/(--dsh-boot-[a-z0-9-]+)\s*:/g)].map(match => match[1] ?? ''),
      )
      expect([...declared].sort()).toEqual([...DOCUMENTED_COLORS].sort())
    }
  })

  it('never defines an alias variable of its own and keeps the arc default', () => {
    expect(stylesheet).not.toMatch(/(?:^|[;{])\s*--dsw-alias-[\w-]+\s*:/)
    expect(stylesheet).toContain('var(--dsh-boot-arc, 72deg)')
  })

  it('writes the supplied private value inline without touching the alias layer', () => {
    stubColorEngine(() => true)
    const container = mount()
    new BootPage(container, resolveBootPresentation({
      cssVariables: { '--dsh-boot-bg': '#123456' },
    }))
    const root = bootRoot(container)
    expect(root.style.getPropertyValue('--dsh-boot-bg')).toBe('#123456')
    expect(root.style.getPropertyValue('--dsw-alias-bg-base')).toBe('')
    expect(inlineProperties(root)).toEqual(['--dsh-boot-bg'])
  })
})

describe('kernel ownership of the boot root', () => {
  it('keeps the boot markers, entry names, and the four-entry arc under localized chrome', () => {
    const container = mount()
    const page = new BootPage(container, resolveBootPresentation(LOCALIZED))
    page.setTotal(4)
    const root = bootRoot(container)
    expect(root.getAttribute('data-dsh-boot')).toBe('')
    expect(bootSpinner(container).getAttribute('data-dsh-boot-spinner')).toBe('')
    page.setState('a', 'active')
    page.setState('b', 'active')
    expect(bootSpinner(container).style.getPropertyValue('--dsh-boot-arc')).toBe('180deg')
    page.setState('@deepseek-ai/dsh-client-ui-layout', 'failed')
    expect(textNodes(container)).toContain('@deepseek-ai/dsh-client-ui-layout')
  })

  it('restores the loading skeleton when a failed entry recovers before any report', () => {
    const container = mount()
    const page = new BootPage(container, resolveBootPresentation(LOCALIZED))
    page.setState('entry-transient', 'failed')
    expect(textNodes(container)).toContain(LOCALIZED.failure)
    expect(container.querySelector('[data-dsh-boot-spinner]')).toBeNull()
    page.setState('entry-transient', 'active')
    expect(bootSpinner(container).getAttribute('data-dsh-boot-spinner')).toBe('')
    expect(textNodes(container)).toContain(LOCALIZED.loading)
    expect(textNodes(container)).not.toContain(LOCALIZED.failure)
  })

  it('detaches only the boot root on disposal and discards the inline overrides with it', () => {
    stubColorEngine(() => true)
    const sibling = document.createElement('div')
    sibling.id = 'boot-presentation-sibling'
    document.body.append(sibling)
    const container = mount()
    const page = new BootPage(container, resolveBootPresentation({
      cssVariables: { '--dsh-boot-bg': '#123456' },
    }))
    expect(inlineProperties(bootRoot(container))).toEqual(['--dsh-boot-bg'])
    page.dispose()
    expect(container.childNodes).toHaveLength(0)
    expect(document.getElementById('boot-presentation-sibling')).toBe(sibling)
  })
})

describe('AppWebEntry presentation wiring', () => {
  it('keeps the two-argument construction on the default English chrome', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = mount()
    const probe = installCreateProbe()
    const entry = new AppWebEntry(container, { loadBundle: seamLoad })
    expect(container.textContent).toContain('HARNESS')
    expect(container.textContent).toContain('Loading plugins…')
    await entry.run()
    expect(probe.options?.loadBundle).toBe(seamLoad)
    expect(container.textContent).toContain('Failed to load plugins')
    expect(error).toHaveBeenCalledWith(expect.any(Error))
    await entry.dispose()
  })

  it('hands the seam loadBundle to the module system with a presentation argument', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = mount()
    const probe = installCreateProbe()
    const entry = new AppWebEntry(container, { loadBundle: seamLoad }, { ...LOCALIZED })
    expect(container.textContent).toContain(LOCALIZED.wordmark)
    expect(container.textContent).not.toContain('HARNESS')
    await entry.run()
    expect(probe.options?.loadBundle).toBe(seamLoad)
    expect(error).toHaveBeenCalledWith(expect.any(Error))
    const nodes = textNodes(container)
    expect(nodes).toContain(PROBE_MESSAGE)
    expect(nodes).toContain(LOCALIZED.failure)
    await entry.dispose()
  })

  it('keeps the pre-injected transport as the default transport', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = mount()
    const probe = installCreateProbe()
    transportGlobal.__DSH_TRANSPORT__ = { loadBundle: transportLoad }
    const entry = new AppWebEntry(container, undefined, { wordmark: LOCALIZED.wordmark })
    await entry.run()
    expect(probe.options?.loadBundle).toBe(transportLoad)
    expect(error).toHaveBeenCalledWith(expect.any(Error))
    await entry.dispose()
  })

  it('lets an explicit seam win over the pre-injected transport', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = mount()
    const probe = installCreateProbe()
    transportGlobal.__DSH_TRANSPORT__ = { loadBundle: transportLoad }
    const entry = new AppWebEntry(container, { loadBundle: seamLoad }, { wordmark: LOCALIZED.wordmark })
    await entry.run()
    expect(probe.options?.loadBundle).toBe(seamLoad)
    expect(error).toHaveBeenCalledWith(expect.any(Error))
    await entry.dispose()
  })

  it('reports a loader failure verbatim under localized chrome with no plugin loaded', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = mount()
    const entry = new AppWebEntry(container, undefined, { ...LOCALIZED })
    await entry.run()
    const nodes = textNodes(container)
    expect(nodes.filter(node => node === REPORT_TEXT_FOR_MISSING_FACADE)).toHaveLength(1)
    expect(nodes).toContain(LOCALIZED.failure)
    expect(nodes).toContain(LOCALIZED.failureExplanation)
    expect(nodes).not.toContain(LOCALIZED.loading)
    expect(error).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledWith(expect.any(Error))
    await entry.dispose()
  })

  it('renders a non-Error rejection through its string form', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = mount()
    installCreateProbe('boot exploded')
    const entry = new AppWebEntry(container, undefined, { ...LOCALIZED })
    await entry.run()
    const nodes = textNodes(container)
    expect(nodes).toContain('boot exploded')
    expect(nodes).toContain(LOCALIZED.failure)
    expect(error).toHaveBeenCalledWith('boot exploded')
    await entry.dispose()
  })

  it('keeps booting when an immediate-tier prefetch fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = mount()
    installLiveFacade()
    const entries: WebBootEntry[] = [
      { id: 'immediate', url: '/immediate.js', rev: '1', immediately: true },
      { id: 'renderer', url: '/renderer.js', rev: '1' },
    ]
    win.__DSH_BOOT__ = {
      rev: 'graph',
      entries,
      batches: [{
        phase: 'application',
        url: '/application.js',
        rev: 'batch',
        entries: entries.map(row => row.id),
      }],
    }
    const requested: string[] = []
    const entry = new AppWebEntry(container, {
      loadBundle: async (url) => {
        requested.push(url)
        throw new Error(`missing fixture bundle ${url}`)
      },
    }, { ...LOCALIZED })
    await entry.run()
    expect(requested.length).toBeGreaterThan(0)
    expect(error).toHaveBeenCalledWith(expect.any(Error))
    const nodes = textNodes(container)
    // The swallowed prefetch failure leaves the loader to import the row, so the
    // loader's own report for `immediate` reaches the page; a propagated prefetch
    // rejection would have failed the boot before the loader ran.
    expect(nodes.some(node => node.includes('(immediate)'))).toBe(true)
    expect(nodes).toContain(LOCALIZED.failure)
    await entry.dispose()
  })

  it('keeps the package entry to its documented runtime exports', () => {
    expect(Object.keys(webPackage).sort()).toEqual([
      'AppWebEntry',
      'PLATFORM_MODULES',
      'PRELOADED_CLIENT_EXTERNALS',
      'getStaticModules',
    ])
    expect(webPackage).not.toHaveProperty('resolveBootPresentation')
    expect(webPackage).not.toHaveProperty('BootPage')
  })

  it('exposes the documented presentation fields as a public option type', () => {
    const sample: BootPresentation = {
      wordmark: 'HARNESS',
      loading: 'Loading plugins…',
      failure: 'Failed to load plugins',
      failureExplanation: 'see the console',
      lang: 'en',
      dir: 'rtl',
    }
    expect(sample.dir).toBe('rtl')
  })
})

describe('boot page without stylesheet class names', () => {
  it('renders when the stylesheet supplies no class name', async () => {
    vi.resetModules()
    vi.doMock('../src/boot-page.module.css', () => ({ default: {} }))
    try {
      const { BootPage: ClasslessBootPage } = await import('../src/boot-page.ts')
      const container = mount()
      const page = new ClasslessBootPage(container)
      const root = bootRoot(container)
      expect(root.className).toBe('')
      expect(root.textContent).toContain('HARNESS')
      expect(bootSpinner(container).className).toBe('')
      page.dispose()
    } finally {
      vi.doUnmock('../src/boot-page.module.css')
      vi.resetModules()
    }
  })
})
