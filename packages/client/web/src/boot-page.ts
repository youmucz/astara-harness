/**
 * Framework-free boot page and failure report. It remains available when a
 * client plugin fails because React arrives only with the UI renderer.
 * @module @deepseek-ai/dsh-client-web/src/boot-page
 */
import { resolveBootPresentation, type ResolvedBootPresentation } from './boot-presentation.ts'
import type { LoaderEntryState } from './loader-status.ts'
import css from './boot-page.module.css'

/** Create a div with one module class and optional text. */
function div(className: string | undefined, text?: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className ?? ''
  if (text !== undefined) el.textContent = text
  return el
}

/** Kernel-owned page mounted below the application's root element. */
export class BootPage {
  private readonly presentation: ResolvedBootPresentation
  private readonly root: HTMLDivElement
  private readonly card: HTMLDivElement
  private readonly wordmark: HTMLDivElement
  private readonly spinner: HTMLDivElement
  private readonly hint: HTMLDivElement
  private readonly states = new Map<string, LoaderEntryState>()
  private readonly active = new Set<string>()
  private total = 0
  private failure: string | undefined

  /**
   * Build and attach the boot page.
   * @param container - Application mount point.
   * @param presentation - Resolved presentation; the kernel defaults apply when
   * a caller builds the page without one.
   */
  constructor(container: HTMLElement, presentation: ResolvedBootPresentation = resolveBootPresentation(undefined)) {
    this.presentation = presentation
    this.root = div(css.boot)
    this.root.dataset.dshBoot = ''
    this.applyPresentation()
    this.card = div(css.card)
    this.wordmark = div(css.wordmark, presentation.wordmark)
    this.spinner = div(css.spinner)
    this.spinner.dataset.dshBootSpinner = ''
    this.hint = div(css.hint, presentation.loading)
    this.card.append(this.wordmark, this.spinner, this.hint)
    this.root.append(this.card)
    container.append(this.root)
    this.updateProgress()
  }

  /**
   * Set the number of loader entries represented by the progress arc.
   * @param total - Complete boot roster size.
   */
  setTotal(total: number): void {
    this.total = total
    this.updateProgress()
  }

  /**
   * Project one loader entry's fiber state.
   * @param id - Loader entry name.
   * @param state - Projected fiber state.
   */
  setState(id: string, state: LoaderEntryState): void {
    this.states.set(id, state)
    if (state === 'active') this.active.add(id)
    this.updateProgress()
    this.render()
  }

  /**
   * Display the boot failure report.
   * @param message - Failure report text.
   */
  fail(message: string): void {
    this.failure = message
    this.render()
  }

  /** Detach the page before or after the UI renderer takes the mount point. */
  dispose(): void {
    this.root.remove()
  }

  /** Apply the resolved accessibility attributes and scoped color overrides. */
  private applyPresentation(): void {
    if (this.presentation.lang !== undefined) this.root.setAttribute('lang', this.presentation.lang)
    if (this.presentation.dir !== undefined) this.root.setAttribute('dir', this.presentation.dir)
    for (const [name, value] of this.presentation.cssVariables) {
      try {
        this.root.style.setProperty(name, value)
      } catch {
        // A rejected declaration leaves this property at its stylesheet
        // default; the remaining accepted entries still apply.
      }
    }
  }

  /** Redraw the state-dependent content below the wordmark. */
  private render(): void {
    const failed = [...this.states].filter(([, state]) => state === 'failed').map(([id]) => id)
    if (this.failure === undefined && failed.length === 0) {
      if (this.spinner.parentElement !== this.card) {
        this.card.replaceChildren(this.wordmark, this.spinner, this.hint)
      }
      return
    }
    const report = div(css.failed)
    report.append(div(css.failedTitle, this.presentation.failure))
    for (const id of failed) report.append(div(css.failedItem, id))
    if (this.presentation.failureExplanation !== undefined) {
      report.append(div(css.failedItem, this.presentation.failureExplanation))
    }
    if (this.failure !== undefined) report.append(div(css.failedItem, this.failure))
    this.card.replaceChildren(this.wordmark, report)
  }

  /** Grow the rotating arc monotonically as loader entries activate. */
  private updateProgress(): void {
    const ratio = this.total === 0 ? 0 : Math.min(this.active.size / this.total, 1)
    this.spinner.style.setProperty('--dsh-boot-arc', `${String(Math.round(72 + ratio * 216))}deg`)
  }
}
