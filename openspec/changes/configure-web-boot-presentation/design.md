# Design: Configure web boot presentation

## Context

`packages/client/web` is the browser boot kernel. `AppWebEntry.run()` builds the module system from `window.__ModuleLoader__`, projects loader state to a framework-free `BootPage` through the `onEntryState` callback, and hands the mount point to `mountClient` after every entry activates; any rejection lands in one `catch` that logs and calls `BootPage.fail(reason.message)`. The page exists because React arrives only with the UI renderer, so it must render with no plugin active, and it currently hard-codes `HARNESS`, `Loading plugins…`, and `Failed to load plugins` in `packages/client/web/src/boot-page.ts`.

`boot-page.module.css` defines local `--dsh-boot-*` properties and consumes them through `var(--dsw-alias-*, var(--dsh-boot-*))`, with a `:global(body[data-ds-dark-theme])` dark override block. The kernel owns the boot root (`data-dsh-boot`, `data-dsh-boot-spinner`) and disposes only that element.

`BootSeams = Pick<ClientModuleCreateOptions, 'loadBundle'>` is the documented second constructor argument, exercised by `packages/client/web/tests/boot.client.spec.ts`, `apps/web/tests/assembled-boot.ts`, and the pinned Plane host's `boot-integration.test.ts`.

A host consumer cannot currently localize the boot chrome or route its own theme tokens into it. The Plane web shell demonstrates the second half of that gap: it sets its theme attribute on `html` at parse time, while the kernel's dark fallback selector keys off `body[data-ds-dark-theme]`, so a consumer that wants a themed boot page must override values rather than rely on the kernel's dark branch. Its full palette is served by a profile API after authentication. The confirmed consumer-side consideration keeps the pre-boot theme solve in that consumer: a minimal local boot snapshot of validated colors, written by the existing theme owner there and read before boot as a read-only projection that makes no authenticated call and uses no credential, then cleared on logout or account switch. That snapshot and its lifecycle stay in the consumer; this kernel change neither implements it nor requires a cache.

## Goals / Non-Goals

**Goals:**

- One additive, optional, fully typed presentation configuration on `AppWebEntry` that reaches `BootPage` without changing `BootSeams`, argument positions, default rendering, or the failure path.
- Localized loading and failure chrome, optional accessibility `lang`/`dir`, and a bounded scoped custom-property override map for host theme tokens.
- Fail-closed handling of untrusted configuration: no field, value, or name can throw out of construction, state projection, or failure rendering, and no value can become markup or a callback.
- Kernel-local resolution with no runtime i18n or theme dependency and no theme state of its own.

**Non-Goals:**

- Any product implementation, including the Plane consumer's boot presentation wiring, its pre-boot palette projection, and any change to the existing GUI.
- Publishing, pinning, or releasing a DSH version; the Plane host's pin and release artifacts are separate.
- A general theming API, a new global token vocabulary, dark-mode detection inside the kernel, or a second boot surface.
- Rewording, translating, or truncating loader diagnostics.

## Decisions

**1. Keep `BootSeams` second and add the presentation configuration as an optional third constructor argument.**
`constructor(container: HTMLElement, seams?: BootSeams, presentation?: unknown)`. Every existing call site — `new AppWebEntry(el)` and `new AppWebEntry(el, { loadBundle })` — stays valid and unchanged, and the seam object keeps exactly one member. The parameter is typed `unknown` at the boundary because it is untrusted host input; the resolver is what gives it a type.

**2. Resolve configuration once, in the kernel, into a closed presentation record.**
A new kernel module `packages/client/web/src/boot-presentation.ts` exports the public `BootPresentation` input type and a `resolveBootPresentation(config: unknown)` function returning a fully populated readonly presentation. `AppWebEntry` calls it in its constructor and passes the resolved record to `BootPage`. Resolution is per-field and total: a missing, non-object, or invalid field falls back to its default, so `BootPage` never validates anything and every downstream read is total.

| Field | Accepted input | Default when absent or invalid |
|---|---|---|
| `wordmark` | non-empty trimmed string, at most 256 characters | `HARNESS` |
| `loading` | non-empty trimmed string, at most 1024 characters | `Loading plugins…` |
| `failure` | non-empty trimmed string, at most 1024 characters | `Failed to load plugins` |
| `failureExplanation` | non-empty trimmed string, at most 1024 characters | absent |
| `lang` | non-empty trimmed string, at most 35 characters | absent |
| `dir` | exactly `ltr`, `rtl`, or `auto` | absent |
| `cssVariables` | the six documented color property names with non-empty, independently resolvable color values of at most 256 characters | absent |

An over-long string field is treated as absent rather than truncated, so a host cannot silently ship a half-rendered heading. The bounds are fixed literals in the resolver: 256 characters for the wordmark, 1024 for each heading and the explanation, 35 for `lang`, and 256 for a property value. `cssVariables` accepts exactly six color properties, which is the closed set of color inputs the page's stylesheet reads:

| Name | Role |
|---|---|
| `--dsh-boot-bg` | boot surface background |
| `--dsh-boot-label-primary` | wordmark and failure heading color |
| `--dsh-boot-label-secondary` | failed entry and report color |
| `--dsh-boot-label-tertiary` | loading hint color |
| `--dsh-boot-border` | spinner ring track |
| `--dsh-boot-brand` | progress arc color |

Six names, no enumeration, and no font or typography property: a value is applied only after it passes two independent checks — it must be an accepted, self-contained color, and `CSS.supports('color', value)` must accept it. The first check is what the engine's grammar test cannot provide: `CSS.supports('color', 'var(--missing)')` returns true because the value is grammatically valid, yet at computed-value time the variable resolves to nothing, the declaration becomes invalid at computed-value time, and the property takes its inherited or initial value — for `background` that is `transparent`, which would replace the boot surface's own default with nothing. Because an invalid substituted value does not fall back through `var()`, the resolver rejects anything whose color depends on another declaration, on inheritance, or on the document environment: variable, environment, and attribute references; the CSS-wide keywords; `currentColor`; system colors; and any value carrying a comment, an escape, or a nested function. What is accepted is the following conservative grammar (D1), matched against the whole trimmed value, with everything outside it rejected:

| Form | Accepted |
|---|---|
| Hex | 3, 4, 6, or 8 digits |
| Numeric functions | `rgb`, `rgba`, `hsl`, `hsla`, `hwb`, `lab`, `lch`, `oklab`, `oklch`, case-insensitive, body limited to digits, `.`, `%`, `,`, `/`, `+`, `-`, and spaces |
| Named colors | the standard finite CSS named colors, including `transparent` and both `gray` and `grey` |
| `color()` | one of the nine predefined spaces `srgb`, `srgb-linear`, `display-p3`, `a98-rgb`, `prophoto-rgb`, `rec2020`, `xyz`, `xyz-d50`, `xyz-d65`, with a numeric body |

Rejected by name: `currentColor` and the system colors. Rejected by form: an angle unit such as `deg`, `none`, exponent notation, `calc()`, any nested function, any CSS escape, and any comment. The grammar is deliberately narrower than what a browser parser accepts and is only the first of the two checks: a value that matches still has to pass `CSS.supports('color', value)`. Being explicit rather than delegating to the parser is what keeps the rejection set testable and stable across engines. Restricting names is what keeps the surface closed: an arbitrary `--*` map would accept a property that hides or restyles the failure report and would contradict decision 7, whereas these six cannot reach layout, visibility, or generated content.

**3. The presentation record is plain data; the page applies it, and nothing else does.**
`BootPage` receives the resolved record, then: renders `wordmark`, `loading`, and `failure` where the literals are today; renders `failureExplanation` as one additional plain-text line below the failed entry names when present; sets `lang`/`dir` on the boot root when present; and writes each accepted custom property with an inline `setProperty` on the boot root, each in its own `try`/`catch` so one rejecting entry cannot abandon the rest. `BootPage` keeps its internal-module status: the package entry (`src/index.ts`) exports `AppWebEntry`, `BootSeams`, and the new public presentation option type only.

**4. Configuration is read as untrusted input, with no enumeration and no invoked field.**
The resolver reads the six known color names and the six known text and attribute fields directly, probing each with a descriptor read on the supplied object and `try`/`catch` around the field read; it never enumerates the object's keys, never recurses into nested objects, and never calls a supplied value. The honest boundary: reading a field on a `Proxy` or a getter runs that trap, because that is the language, so this is not a security sandbox and the change does not claim one. What it guarantees is that the boot page itself invokes nothing and that no single failing read can take down rendering — a raising read costs one skipped field.

**5. Strings are written as text, never as markup, and the configuration has no executable slots.**
The page already builds its DOM with `createElement`, `textContent`, `append`, and `replaceChildren`; the change keeps that the only write path and adds no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, template, or renderer field. No field is a function the page invokes, so no host-supplied callback runs as part of rendering and no host callback can fail the failure UI; a getter or proxy trap still runs when a field is read, which decision 4 covers as an ordinary read. The `dir` choice is the bounded HTML enumeration rather than the full spec grammar, keeping the surface to three literals.

**6. Diagnostics stay exactly as the loader emitted them.**
`fail(message)` continues to render its argument verbatim as plain text, `onEntryState` continues to receive loader states, and the `web boot: N entries did not activate` audit text produced by `assertEntriesActive` is untouched. Presentation configuration reaches chrome only, never entry names or report text, which is what keeps failure diagnosis unambiguous in any locale.

**7. The kernel keeps ownership of the boot root and the documented custom-property contract.**
The root keeps `data-dsh-boot`, the spinner keeps `data-dsh-boot-spinner`, `updateProgress` keeps computing `72 + ratio * 216` degrees, and `dispose()` keeps removing only that element, which also discards every inline custom property with it. The stylesheet keeps its `--dsw-alias-*` → `--dsh-boot-*` fallback chain and its dark block unchanged. Host-supplied values are inline on the boot root and are values for the page's private `--dsh-boot-*` fallback properties, so the existing cascade decides what is visible. For a property whose corresponding `--dsw-alias-*` variable is defined, the alias wins and the supplied private value stays an unused fallback; for a property whose alias is absent, the supplied private value is used. Kept in place are the generic spine `var(--dsw-alias-bg-base, var(--dsh-boot-bg))` and the six property rules in `boot-page.module.css`, including the `--ds-font-family-code` typography fallback, which stays set by the stylesheet and is not settable through the configuration. The accepted names are exactly the six color properties in decision 2, and the kernel adds no third vocabulary and no theme state. `packages/client/web/src/base.css` and the ui-theme package are untouched.

**8. `src/main.ts` of `apps/web` and `apps/web/tests/assembled-boot.ts` need no edit.**
The new argument is optional and the two-argument form is unchanged, so the existing shell and its assembled-boot test keep their behavior; a dedicated package-level test covers the new surface.

**9. Test plan for the package (`packages/client/web/tests`).**
A new `boot-presentation.client.spec.ts` (jsdom) covers, against the real `AppWebEntry` and `BootPage`:

- defaults with no configuration: `HARNESS`, `Loading plugins…`, `Failed to load plugins`, no `lang`, no `dir`, no configuration-derived property on the boot root, the `data-dsh-boot` marker present, and the spinner carrying only the kernel's progress arc;
- non-English headings: a supplied wordmark and loading heading replace the English literals, and a supplied failure heading appears above the failed entry names;
- escaping: a heading containing `<img src=x onerror=alert(1)>` produces no element, no `onerror` attribute, and one text node equal to the supplied string;
- invalid parameters: `null`, a primitive, `{}`, wrong-typed fields, an over-long string, an unsupported `dir`, and an invalid `lang` each fall back per field while valid fields still apply;
- untrusted reads: a configuration whose field read raises, and a color value obtained through a proxy or getter that raises, both fall back without throwing and still render the failure report;
- theme tokens: supplied `--dsh-boot-bg`, `--dsh-boot-label-primary`, and `--dsh-boot-brand` colors land on the boot root only, never on `document.documentElement` or `body`; an undocumented name such as `--dsh-boot-layout` or `--dsw-alias-bg-base`, a non-string value, an empty value, an over-long value, and a value the engine rejects as a color such as `url(https://example.invalid/x)` are all skipped without throwing or dropping valid entries;
- independent resolution: `var(--missing)`, `var(--x, red)`, `env(...)`, `attr(...)`, `inherit`, `initial`, `unset`, `revert`, `currentColor`, a system color, a value carrying a comment, a value carrying an escape, a nested relative-color function, an angle unit such as `10deg`, `none`, an exponent form such as `1e3`, and `calc(...)` are each rejected and leave the boot root without that property, while hex, numeric color functions, named colors, and `color()` with a predefined space are accepted;
- precedence: with a supplied private value and a defined `--dsw-alias-*` variable the alias remains effective, and with no alias defined the supplied private value is effective;
- loader failure unchanged: a `run()` rejection still reaches `fail()` with its message intact, `console.error` still receives the rejection, failed entry names still render verbatim, and the arc value for two of four entries is still `180deg`.

The existing `boot-page.client.spec.ts` and `boot.client.spec.ts` assertions are expected to pass with no edits; new accessibility semantics are asserted only in the new file, and no existing test's expectations are rewritten.

## Risks / Trade-offs

- **A host can pass a low-contrast or unreadable value for an allowlisted property.** The kernel cannot judge contrast, and judging it would re-create a theme authority it must not own. Mitigation: validation is limited to whether the engine accepts the value as a color, values are applied only to the boot root, the supplied value is effective only when its alias is undefined, and the page's default applies to every property neither layer sets.
- **The allowlist may be too narrow for a future consumer need.** Adding a property then looks like a kernel change. Mitigation: the six names cover every color input the boot page's stylesheet reads, so a consumer's remaining flexibility is the `--dsw-alias-*` layer it already controls; a genuinely new need is a deliberate, reviewed kernel edit rather than an open `--*` channel.
- **A consumer-detected dark mode may still resolve through aliases rather than the supplied values.** Because the alias is the outer layer of the existing `var()` chain, a defined `--dsw-alias-*` value wins over a supplied private property. Mitigation: precedence is documented instead of promised away; a consumer that owns the alias layer can set it there, and a consumer without an alias layer controls the private property directly, which is exactly the Plane case (no `--dsw-alias-*` defined before boot).
- **The kernel's own dark block matches `body[data-ds-dark-theme]`, which a differently marked consumer does not set.** The Plane shell marks dark state on `html` at parse time, so the kernel's dark defaults do not apply there. Mitigation: precedence and the supplied-private-value path are stated explicitly, and detecting a consumer's dark marker inside the kernel stays out of scope rather than widening the kernel into theme detection.
- **A grammatically valid but context-dependent value would erase a default instead of failing harmlessly.** `CSS.supports('color', value)` alone accepts `var(--missing)`, and a substituted invalid value makes the property take its initial value, so a boot surface would compute `transparent`. Mitigation: every color value must first pass independent resolution — self-contained families only, with variable, environment, and attribute references, CSS-wide keywords, `currentColor`, system colors, comments, escapes, and nesting rejected — and only then the engine color check, with each `setProperty` inside its own `try`/`catch`.
- **Reading untrusted configuration is not a security boundary.** A getter or proxy trap executes when its field is read, and the kernel cannot prevent that. Mitigation: the resolver reads only fixed names, never enumerates, never recurses, never invokes a supplied field, and tolerates a raising read, so the guarantee is bounded reads and total rendering rather than isolation.
- **A host could blank the chrome with whitespace-only strings.** Whitespace-only and empty strings are treated as absent, so the defaults survive; hosts that want a specific chrome must pass real text.
- **Coupling risk: a consumer may treat the override map as a theming API.** Mitigation: the requirement and design both bind the kernel to documented, scoped custom properties with no global vocabulary, and the consumer-side palette projection stays a separate reviewed decision.
- **Release-scope risk.** A kernel-side package proof alone cannot declare a production-ready release: the Plane pin recipe requires family-wide pin consistency across the agent-manager, Docker, and plugin surfaces with its own gate. Mitigation: this change delivers kernel behavior plus an isolated package proof and explicitly defers the release and pin work.

## Migration Plan

No migration is required. The added constructor argument is optional, absent by default, and placed after `BootSeams`, so existing kernel, shell, and pinned-host call sites keep their current source and behavior; no configuration file, env var, token, or data shape changes. A host adopts the feature by passing the new argument. The Plane consumer integration and the coordinated DSH pin/version release are owned by their own repositories and workflows; this change produces neither and claims neither.

## Open Questions

None. The kernel contract is fully decided, and no open question blocks a task. Two items are scoped to other artifacts by ownership rather than left unresolved:

- The Plane consumer's presentation wiring and its pre-boot theme projection are that repository's work: the confirmed consideration is a minimal local boot snapshot of validated colors written by the existing theme owner there, read before boot, used read-only with no authenticated call, and cleared on logout or account switch. This kernel change does not implement it and does not depend on it; the kernel-side entry hook is preferred there so no duplicate early script is introduced.
- The family-wide pin/version release, including the agent-manager, Docker, and plugin surfaces and the pin gate, is release work; a single-package patch does not declare production readiness, and this change claims only an isolated package proof.
