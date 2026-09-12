# Change: Configure web boot presentation

## Why

The framework-free boot page in `@deepseek-ai/dsh-client-web` is the only surface that reports progress and failure before plugin activation, and it hard-codes the English strings `HARNESS`, `Loading plugins…`, and `Failed to load plugins` while offering a host consumer no supported way to present them in another language or with that consumer's own theme tokens. A downstream host therefore either shows English boot text inside an otherwise localized product, or reinvents a second boot surface that the kernel does not own.

## What Changes

- `AppWebEntry` gains an optional third constructor argument, a presentation configuration that carries the loading wordmark, the loading and failure headings, an optional failure explanation, an optional accessible page language (`lang`) and writing direction (`dir`), and independently resolvable color values for six documented properties of the boot page's own fallback layer, applied as scoped inline styles on the boot root, with the existing `--dsw-alias-*` to `--dsh-boot-*` cascade still deciding which value is effective.
- `BootPage` gains a matching optional presentation input reachable only through `AppWebEntry`; the page keeps writing every string through `textContent` and never accepts HTML, a render function, or any other caller-supplied callback.
- The default presentation is unchanged: without the option the page still renders `HARNESS`, `Loading plugins…`, and `Failed to load plugins`, sets no `lang`/`dir` attribute, and sets no caller-supplied custom property.
- Invalid, partial, or malformed configuration degrades field by field to those defaults; a color value that is not independently resolvable — including a variable, environment, or attribute reference, a CSS-wide keyword, `currentColor`, a system color, or a value carrying a comment, an escape, or nesting — is rejected outright instead of being applied as an invalid substitution, and no rejected field or property can suppress or corrupt the failure report.
- Loader diagnostics stay non-localized technical text: the entry names, the `fail(message)` report, and the `web boot: N entries did not activate` audit text remain plain text nodes exactly as the loader produced them.
- The kernel continues to accept only a closed, documented set of scoped custom properties consumed by the boot page's own stylesheet; it introduces no global theme vocabulary, no theme state, and no runtime i18n or theme-plugin dependency before plugin activation, and no accepted value can hide or replace the failure report.
- The external version pin bump, the family-wide DSH release, and the Plane consumer wiring are deferred to separately reviewed artifacts; a kernel-side package proof does not by itself declare a production-ready release.

## Capabilities

### New Capabilities

- `client/web-boot-presentation`: the host-configurable presentation contract of the framework-free web boot page — headings, accessibility attributes, scoped custom-property overrides, bounded degradation, and the invariants that keep default behavior, plain-text diagnostics, and kernel root ownership intact.

### Modified Capabilities

- None.

## Impact

- Code: `packages/client/web/src/boot.ts`, `packages/client/web/src/boot-page.ts`, and the package test suite under `packages/client/web/tests/`. `BootSeams` keeps its `loadBundle` member and its positional second-argument compatibility; `apps/web/src/main.ts` needs no edit because the new argument is optional.
- Public API: an additive optional constructor parameter on `AppWebEntry` and a new exported presentation option type. No removed or renamed export, no changed default rendering, no changed error path.
- Dependencies: no new runtime dependency, and specifically no i18n or theme plugin loaded before the loader roster; the existing `--dsw-alias-*` → `--dsh-boot-*` fallback chain in `boot-page.module.css` stays the default resolution order.
- Consumers: a host consumer such as the Plane web shell may pass localized strings and scoped token values; consuming it is a separate, separately reviewed change in that repository.
- Deferred to release and consumer work: no DSH version pin or publish happens here, the family-wide pin consistency the pin recipe requires is release work, and any product implementation is out of scope. Kernel behavior plus an isolated package proof is the whole delivery, and it does not declare a production-ready release.
