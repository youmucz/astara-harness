# client/web-boot-presentation Specification

## Purpose

Define the host-configurable presentation contract of the framework-free web boot page: which localized headings, accessibility attributes, and scoped custom-property overrides a host consumer may supply through `AppWebEntry`, and the boundaries that keep default English behavior, non-localized loader diagnostics, and kernel ownership of the boot root intact.

## ADDED Requirements

### Requirement: Optional presentation configuration on AppWebEntry

`AppWebEntry` SHALL accept an optional third constructor argument carrying the boot presentation configuration, and SHALL keep its existing first argument (the mount container) and second argument (`BootSeams`, including its `loadBundle` member) unchanged in position, type, and behavior.

#### Scenario: Constructing without the presentation argument

- **WHEN** a host constructs `AppWebEntry` with a container and an optional `BootSeams` object only
- **THEN** construction and `run()` behave exactly as they do without the new parameter, and no presentation field is required

#### Scenario: Constructing with the presentation argument

- **WHEN** a host constructs `AppWebEntry` with a container, a `BootSeams` object whose `loadBundle` records the requested bundle URL, and a presentation configuration
- **THEN** the seam still receives the transport calls the module system issues, and the presentation configuration is applied to the boot page

### Requirement: Default English presentation preserved

When no presentation configuration is supplied, the boot page MUST render its current default English text and MUST NOT add accessibility attributes or configuration-derived inline custom properties.

#### Scenario: Loading defaults

- **WHEN** the boot page is created with no presentation configuration
- **THEN** the wordmark text is `HARNESS`, the hint text is `Loading plugins…`, and the boot root carries the `data-dsh-boot` marker

#### Scenario: No injected attributes or properties

- **WHEN** the boot page is created with no presentation configuration
- **THEN** the boot root carries no `lang` attribute, no `dir` attribute, and no configuration-derived custom property, while the spinner keeps only the progress arc custom property the kernel itself writes

#### Scenario: Failure defaults

- **WHEN** a loader entry reports `failed` with no presentation configuration
- **THEN** the failure report heading is `Failed to load plugins` and each failed entry name is rendered as its own plain-text line

### Requirement: Localized loading and failure headings

When a presentation configuration supplies heading text, the boot page SHALL render those strings instead of the default English strings through text nodes only, and MUST keep rendering the same structure: the wordmark above the progress arc while loading, and the failure heading above the failed entry names and the failure report.

#### Scenario: Configured wordmark and hint

- **WHEN** the presentation configuration supplies a wordmark and a loading heading
- **THEN** the boot page shows those exact strings and no longer shows `HARNESS` or `Loading plugins…`

#### Scenario: Configured failure heading

- **WHEN** the presentation configuration supplies a failure heading and an explanation, and a loader entry reports `failed`
- **THEN** the boot page shows the configured failure heading, then each failed entry name, then the configured explanation, each as plain text

#### Scenario: Accessibility attributes

- **WHEN** the presentation configuration supplies a language tag and a writing direction
- **THEN** the boot root carries those values as its `lang` and `dir` attributes

### Requirement: Plain-text only presentation values

Every presentation string, including the wordmark, the headings, and the explanation, MUST be written as text content; the boot page MUST NOT accept HTML, a template, a render function, or any other caller-supplied callback for it to invoke, MUST NOT interpret supplied values as markup, and MUST bound the length of a supplied string.

#### Scenario: Markup-bearing heading stays literal

- **WHEN** the presentation configuration supplies a heading whose text contains `<img src=x onerror=alert(1)>`
- **THEN** the boot root contains no `img` element, no `onerror` attribute, and one text node whose data equals the supplied string

#### Scenario: Over-long strings are ignored, not truncated

- **WHEN** a heading or the failure explanation exceeds the documented maximum length
- **THEN** that field is treated as absent, the documented default or absent rendering applies, and no partial string is rendered

#### Scenario: No field is invoked

- **WHEN** a presentation configuration object carries a function-valued or element-valued field
- **THEN** the boot page never calls that field and still renders its headings and failure report

#### Scenario: A raising field read costs one field

- **WHEN** reading one configuration field raises
- **THEN** that field falls back to its default, no exception escapes the boot page, the remaining fields still apply, and the failure report still renders

#### Scenario: No API accepts markup or a renderer

- **WHEN** the boot page presentation surface is inspected
- **THEN** it exposes no string-to-markup sink and no caller-supplied render function

### Requirement: Loader diagnostics remain non-localized technical text

Entry names, the failure report passed to the failure entry point, and the `web boot: N entries did not activate` activation audit text SHALL remain exactly as the loader produced them, rendered as plain text and not translated, reworded, truncated, or replaced by presentation configuration.

#### Scenario: Failure report text unchanged

- **WHEN** a loader failure report such as `web boot: 1 entry did not activate\nx: pending (waiting for service: y)` is displayed
- **THEN** the boot root text contains that report verbatim

#### Scenario: Localized chrome around unchanged diagnostics

- **WHEN** a presentation configuration supplies non-English headings and a loader failure is reported
- **THEN** the localized headings appear, and the failure report and failed entry names still appear as the loader emitted them

### Requirement: Bounded, scoped theme token overrides

A presentation configuration MAY supply values for exactly six documented color properties that the boot page's own stylesheet consumes, and the boot page SHALL read that closed list of names directly without enumerating the supplied object, SHALL apply an entry only when its value is a non-empty string of bounded length that the engine confirms to be a valid color before the property is set, SHALL apply accepted values as inline custom properties on the boot root element, MUST NOT write to the document root or body, MUST NOT apply any other property name, and MUST skip an entry that raises or is rejected without abandoning the remaining entries.

#### Scenario: Overrides apply to the boot root only

- **WHEN** the configuration supplies a documented color property such as the boot surface background with a valid color value
- **THEN** the boot root's inline custom property equals that value, and the document root and body carry no such inline value

#### Scenario: Undocumented property names are ignored

- **WHEN** the configuration supplies a property name outside the documented six, including a layout or visibility property that could hide the failure report
- **THEN** that name is not applied to the boot root, and the failure report and its heading remain visible in the rendered content

#### Scenario: An invalid color is not applied

- **WHEN** the configuration supplies a documented property name with a value the engine does not accept as a color, such as a `url(...)` reference or an unparsable token
- **THEN** that property is not set on the boot root, the stylesheet's own default or fallback remains the effective value, and the text of the failure report stays readable

#### Scenario: Invalid entries are skipped

- **WHEN** the configuration supplies a value that is not a string, an empty value, or a value longer than the documented bound
- **THEN** none of those entries is applied, no exception escapes, and the remaining valid entries are still applied

#### Scenario: Bounded reads of untrusted configuration

- **WHEN** the configuration object or one of its property reads raises, or it exposes additional properties beyond the documented six
- **THEN** the boot page reads only the documented names, throws nothing, renders its headings and failure report, and applies at most the accepted entries

#### Scenario: Alias precedence is explicit

- **WHEN** the boot root carries an inline value for a documented private property and the corresponding `--dsw-alias-*` variable is also defined for that element
- **THEN** the alias value remains the effective value and the supplied private value stays the stylesheet's unused fallback

#### Scenario: Private fallback is used when no alias is defined

- **WHEN** a documented property is supplied and the corresponding `--dsw-alias-*` variable is not defined for the boot root
- **THEN** the supplied value is the effective value for that property

### Requirement: Configured color values are independently resolvable

A supplied color value MUST resolve to a color on its own: it SHALL NOT depend on another declaration, on inheritance, or on the document environment, and the boot page MUST reject a value that does. The accepted grammar is the following conservative, explicitly enumerated subset, matched against the whole trimmed value; every value outside it is rejected:

- hexadecimal notation of 3, 4, 6, or 8 digits;
- the numeric color functions `rgb`, `rgba`, `hsl`, `hsla`, `hwb`, `lab`, `lch`, `oklab`, and `oklch`, case-insensitive, whose body consists only of digits, `.`, `%`, `,`, `/`, `+`, `-`, and spaces;
- the standard finite CSS named colors, including `transparent` and both `gray` and `grey`;
- `color()` with one of the nine predefined spaces `srgb`, `srgb-linear`, `display-p3`, `a98-rgb`, `prophoto-rgb`, `rec2020`, `xyz`, `xyz-d50`, or `xyz-d65`, and a numeric body.

Rejected by name: `currentColor` and the system colors. Rejected by form: an angle unit such as `deg`, the `none` keyword, exponent notation, `calc()`, any nested function, any CSS escape, and any comment. A value that passes this grammar MUST also pass `CSS.supports('color', value)` before it is applied.

#### Scenario: Variable and environment references are rejected

- **WHEN** a documented color property is supplied a value such as `var(--missing)`, `var(--x, red)`, `env(safe-area-inset-top)`, or `attr(data-color)`, each of which passes a bare grammar check
- **THEN** the property is not set on the boot root, the stylesheet's own value remains effective, and no transparent or initial background replaces it

#### Scenario: Contextual keywords are rejected

- **WHEN** a documented color property is supplied `inherit`, `initial`, `unset`, `revert`, `revert-layer`, `currentColor`, or a system color such as `CanvasText`
- **THEN** that property is not set on the boot root, and the boot page keeps rendering with the stylesheet's own color

#### Scenario: Comments, escapes, and nesting are rejected

- **WHEN** a documented color property is supplied a value containing a comment, a CSS escape, or a nested function such as a relative color form
- **THEN** the value is rejected as supplied rather than stripped or normalized, and the property is not set

#### Scenario: Out-of-grammar forms are rejected

- **WHEN** a documented color property is supplied an angle unit such as `10deg`, the `none` keyword, an exponent form such as `1e3`, or a `calc()` expression
- **THEN** that property is not set on the boot root, and the boot page keeps the stylesheet's own color

#### Scenario: Self-contained families are accepted

- **WHEN** a documented color property is supplied a hexadecimal value, a numeric color function such as `rgb(...)`, `hsl(...)`, `hwb(...)`, `lab(...)`, `lch(...)`, `oklab(...)`, `oklch(...)`, or `color(...)` with a predefined space, or a standard named color including `transparent`
- **THEN** that value is accepted and set on the boot root

#### Scenario: The default survives a rejected value

- **WHEN** every documented property is supplied a value that fails independent resolution
- **THEN** the boot root carries none of those properties, and the loading hint and failure report text remain rendered and readable

### Requirement: Graceful degradation of invalid configuration

The boot page MUST accept configuration as untrusted input: when the configuration itself is absent, null, a primitive, or otherwise unusable, or when an individual field has the wrong type, is over-long, is out of range, or raises when read, the boot page SHALL skip that field and keep the documented default for it, SHALL read the configuration only within documented bounds, SHALL keep rendering its headings and failure report, and MUST NOT throw out of construction, state projection, or failure rendering.

#### Scenario: Non-object configuration

- **WHEN** the boot page is constructed with a configuration that is `null`, a number, or a string
- **THEN** the page renders the default English presentation and throws nothing

#### Scenario: Partially invalid configuration

- **WHEN** the writing direction is an unsupported value such as `diagonal` and the loading heading is a valid non-English string
- **THEN** the boot root carries no `dir` attribute, the localized loading heading is rendered, and the page renders without throwing

#### Scenario: Throwing or proxied configuration

- **WHEN** the configuration, or a nested field it exposes, raises on property access or resolves fields through a proxy
- **THEN** the boot page throws nothing, falls back to its defaults, and renders

#### Scenario: Invalid configuration still reports failure

- **WHEN** a configuration with invalid fields is supplied and a loader failure is reported afterwards
- **THEN** the failure heading, the failed entry names, and the failure report are all still rendered

### Requirement: Presentation is independent of plugin activation

The boot page MUST remain usable before any client plugin activates: it SHALL resolve its presentation only from its own defaults and the supplied configuration, and MUST NOT read theme or locale state, subscribe to a plugin-owned store, or require an i18n or theme plugin to be loaded.

#### Scenario: Failure renders with no plugin loaded

- **WHEN** no client plugin activates and the boot fails
- **THEN** the boot page still renders its heading and the failure report using its own defaults or the supplied configuration

#### Scenario: No plugin dependency for presentation

- **WHEN** the boot page resolves its presentation
- **THEN** it consults only its own defaults and the supplied configuration, and no i18n package or theme plugin is loaded to render it

### Requirement: Kernel keeps ownership of the boot root

The kernel SHALL remain the owner of the boot page root and its failure rendering: the root keeps its `data-dsh-boot` marker, the spinner keeps its progress marker, the progress arc keeps its computed rotation values, disposal detaches the boot root only, and the mounting behavior the UI renderer takes over is unchanged.

#### Scenario: Boot root marker retained

- **WHEN** the boot page is created with any configuration
- **THEN** the boot root still carries `data-dsh-boot` and the spinner still carries its progress marker

#### Scenario: Progress computation unchanged

- **WHEN** two of four reported entries activate with a presentation configuration applied
- **THEN** the progress arc custom property on the spinner is `180deg`, the value the four-entry roster produces today

#### Scenario: Disposal scope unchanged

- **WHEN** the boot page is disposed
- **THEN** the boot root is removed from the mount point and no other document element is removed
