# Agent Note: Host-configurable boot presentation

Status: implemented

English | [中文](2026-09-12-host-configurable-boot-presentation.zh.md)

## Problem

`packages/client/web` renders the framework-free [boot page](../../../../packages/client/web/src/boot-page.ts) before any client plugin activates, because React arrives only with the UI renderer; the [startup kernel decision](../../implemented/architecture/2026-08-15-client-shells-and-dynamic-packages.md) owns that position and the [boot-glue decision](../../implemented/architecture/2026-07-24-web-config-tree-boot-and-transport-layering.md) owns `AppWebEntry.run()`. That page is the only surface that can report loading progress, a failed bundle import, or a plugin stuck on a missing service, and it hard-codes the English strings `HARNESS`, `Loading plugins…`, and `Failed to load plugins`.

A host consumer therefore shows English boot text inside an otherwise localized product, or builds a second boot surface the kernel does not own. The page's private light/dark fallback palette (`--dsh-boot-*` in [boot-page.module.css](../../../../packages/client/web/src/boot-page.module.css)) is equally unreachable from a consumer whose own theme tokens arrive with a plugin and whose dark marker sits on an element other than the kernel's `body[data-ds-dark-theme]` selector.

## Decision

`AppWebEntry` takes an optional third constructor argument, `constructor(container, seams?, presentation?)`, resolved once in the constructor by the internal module [boot-presentation.ts](../../../../packages/client/web/src/boot-presentation.ts) into a closed readonly record that `BootPage` renders. `BootSeams` keeps its position and its single `loadBundle` member, so `new AppWebEntry(el)` and `new AppWebEntry(el, { loadBundle })` are unchanged. The package entry [index.ts](../../../../packages/client/web/src/index.ts) exports the `BootPresentation` input type; the resolver and the resolved record stay internal.

### The third argument is typed `unknown` on purpose

The root [conventions](../../../../AGENTS.md#conventions) trust TypeScript at typed same-process boundaries and require runtime validation at parser, config, durable, worker, process, and wire boundaries. A host presentation object is configuration input crossing a package boundary into the kernel: it can arrive from another build or plain JavaScript, and it is supplied precisely when the page must still render a failure. Typing the parameter `unknown` makes [resolveBootPresentation](../../../../packages/client/web/src/boot-presentation.ts) the parser that gives it a type, which is also the explicit `resolve(request): Spec` step the conventions require instead of a hidden default inside `run()`. The resolver reads only the documented field names, never enumerates keys, never recurses into a nested value, and never invokes a supplied field; each read is confined to `try`/`catch`. The honest limit is that reading a getter or a proxy trap runs that trap, so this is bounded reading, not a sandbox.

### Resolved fields and defaults

| Field | Accepted input | Default |
|---|---|---|
| `wordmark` | non-empty trimmed string, at most 256 characters | `HARNESS` |
| `loading` | non-empty trimmed string, at most 1024 characters | `Loading plugins…` |
| `failure` | non-empty trimmed string, at most 1024 characters | `Failed to load plugins` |
| `failureExplanation` | non-empty trimmed string, at most 1024 characters | absent |
| `lang` | non-empty trimmed string, at most 35 characters | absent |
| `dir` | exactly `ltr`, `rtl`, or `auto` | absent |
| `cssVariables` | the six documented color names with non-empty hexadecimal, named-color, or listed-function values of at most 256 characters | absent |

An over-long string is treated as absent rather than truncated, so a host cannot silently ship a half-rendered heading. Resolution is per field and total: a configuration that is absent, not a plain object (an array included), or invalid in one field keeps the default for that field, so `BootPage` validates nothing and every downstream read is total. `lang` and `dir` are set as attributes on the boot root only.

### The six color properties are the page's own fallback layer

`cssVariables` accepts exactly the six color inputs `boot-page.module.css` reads: `--dsh-boot-bg`, `--dsh-boot-label-primary`, `--dsh-boot-label-secondary`, `--dsh-boot-label-tertiary`, `--dsh-boot-border`, and `--dsh-boot-brand`. Each accepted value becomes an inline custom property on the boot root, inside its own `try`/`catch`, and an entry is accepted only when it is a non-empty string of at most 256 characters that is an independently resolvable color and that `CSS.supports('color', value)` also accepts. The accepted forms are 3-, 4-, 6-, and 8-digit hexadecimal colors; the finite CSS named-color table, including `transparent` and both `gray`/`grey` spellings, and excluding `currentColor` and the system colors; and the lowercased functions `rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, and `color()`, whose bodies contain only digits, `.`, `%`, comma, slash, plus, minus, and spaces, with `color()` restricted to the `srgb`, `srgb-linear`, `display-p3`, `a98-rgb`, `prophoto-rgb`, `rec2020`, `xyz`, `xyz-d50`, and `xyz-d65` spaces and a numeric body. Angle units, `none`, exponent notation, `calc()` and nested functions, relative-color `from` syntax, escapes, and comments are rejected, as is any reference such as `var()`.

The grammar is required rather than decorative: a value the grammar admits but the engine rejects, and a value such as `var(--missing)` or `inherit` that is not independently resolvable at all, both end the same way. An invalid custom-property value does not fall back through `var()`; the declaration becomes invalid at computed-value time and the property takes its inherited or initial value, so an unvalidated value makes a label unreadable instead of harmlessly ignored.

The stylesheet keeps its `var(--dsw-alias-*, var(--dsh-boot-*))` chain, so a defined `--dsw-alias-*` variable remains the effective value and a supplied private value is used only where its alias is absent. The six names are the closed set of color inputs the page reads, which keeps a supplied name from reaching layout, visibility, or generated content and from hiding the failure report; `--dsh-boot-arc` stays kernel-owned on the spinner, and no font or typography property is settable.

### What stays unchanged

Without the argument the page still renders `HARNESS`, `Loading plugins…`, and `Failed to load plugins`, sets no `lang` or `dir` attribute, and writes no caller-supplied property. Every presentation string stays a plain text node, so no value becomes markup and no caller-supplied callback runs during rendering. Entry names, the `fail(message)` report, and the `web boot: N entries did not activate` audit text remain exactly as the loader produced them. The boot root keeps `data-dsh-boot`, the spinner keeps `data-dsh-boot-spinner`, `updateProgress` keeps computing `72 + ratio * 216` degrees, `dispose()` still removes only the boot root, and the kernel adds no dependency, reads no theme or locale state, and loads no plugin before the roster settles.

### Locale ownership does not move

The three default literals change file, not owner: the kernel constants live in [boot-presentation.ts](../../../../packages/client/web/src/boot-presentation.ts), not in locale-dictionary entries, because the page renders before any locale service exists; [Locale-owned client UI copy](../../implemented/architecture/2026-08-23-locale-owned-client-ui-copy.md) records boot markup as outside the dictionary path. `verify-client-ui-i18n` discovers JSX under `packages/client/*/src`, every `.ts`/`.tsx` file under `packages/client/ui-*`, package `src/client` trees that contain TSX, and the `apps/web` source, so the `.ts` boot files are outside its scan and the change adds no allowlist entry, exclusion, or waiver. A new boot-surface string in a scanned path still needs its dictionary owner.

### Related decisions and supersession

The [startup kernel](../../implemented/architecture/2026-08-15-client-shells-and-dynamic-packages.md) and [boot-glue](../../implemented/architecture/2026-07-24-web-config-tree-boot-and-transport-layering.md) decisions remain the owners of kernel placement and `AppWebEntry.run()`; [locale-owned client UI copy](../../implemented/architecture/2026-08-23-locale-owned-client-ui-copy.md) remains the owner of client copy; the archived [pre-plugin theme bootstrap](../../archived/bug-fix/2026-08-10-pre-plugin-theme-bootstrap.md) remains the frozen record of the first-frame palette and sets no rule here. No active Agent Note is superseded, and the consumer wiring, the pre-boot palette snapshot, the DSH pin, and the family-wide release stay with their own artifacts.

## Alternatives considered

**Type the argument as `BootPresentation` and trust callers.** Rejected because the kernel's public constructor is a pre-stable package boundary reached from other builds, and a partial or malformed object would fail the page exactly when it must report a failed roster; the conventions put runtime validation at the config boundary instead.

**Accept an open `--*` map or a style declaration object.** Rejected because an arbitrary property can hide or restyle the failure report, contradicting kernel ownership of the page; the closed six names are the page's own inputs.

**Truncate an over-long string.** Rejected because a truncated heading ships silently broken chrome; treating it as absent keeps the default or the host's valid field.

**Accept a template, HTML string, or host render callback.** Rejected because it adds a markup sink and executes caller code in the failure path; text nodes are the only write path.

**Ship localized defaults in the kernel or prefetch an i18n or theme plugin.** Rejected because the kernel would own a locale or theme choice and depend on a plugin that may itself be the entry that failed; presentation resolves from kernel defaults plus configuration alone.

## Consequences

Existing call sites keep their source and behavior, the new argument is additive, and the default presentation is exactly the previous chrome: `HARNESS`, `Loading plugins…`, and `Failed to load plugins`, no `lang` or `dir`, and no configuration-derived property. Configured strings render as text nodes in the documented order, malformed input degrades field by field, only the six documented names reach the boot root, and a defined `--dsw-alias-*` variable keeps winning over a supplied private value. Default markers, the progress-arc computation, disposal scope, and loader diagnostics are unchanged, and no dependency or pre-activation plugin is added.

The accepted-value contract is deliberately conservative. A host cannot use relative-color `from` syntax, `calc()`, nested functions, angle units, `none` channels, exponent notation, escapes, or comments, and a listed function an engine does not support is skipped by the mandatory engine check rather than approximated, so the stylesheet default remains. The kernel judges no contrast and detects no dark mode, and the six-name set may later prove too narrow; widening it is a reviewed kernel edit rather than an open channel.

Reading the configuration is bounded, not sandboxed: a getter or proxy trap runs when its field is read, so the guarantee is that one raising field costs one field and rendering never depends on a successful untrusted read. The consumer's theme state stays the consumer's: a consumer that marks dark on an element other than `body` gets the page's light fallback unless it supplies values or owns the alias layer.

The change is kernel behavior with an isolated package proof. Consumer wiring, the pre-boot palette projection, the DSH pin, and the family-wide release remain separate artifacts, and no production-ready release is declared.

## Testing

`packages/client/web/tests/boot-presentation.client.spec.ts` pins the defaults, localized chrome, literal text, per-field degradation, untrusted reads, the closed color set, and the unchanged failure path, while the two existing package specs pass unedited. The recorded package results are 78 tests with the three package source files at 100% coverage, `pnpm typecheck`, `pnpm lint` (0 errors and 0 warnings across 3573 files), `pnpm build`, and `pnpm build:web` all at exit 0. The two-engine browser lane (Chromium 151.0.7922.34 and Chrome 153.0.8010.36, 199/199 checks each) shows `var()` and `inherit` rejected with the inline property unset and the default light white and dark `rgb(21, 21, 23)` surfaces rendered, accepted hexadecimal, `rgb()`, and `oklch()` values applied, and no alias behavior changes.
