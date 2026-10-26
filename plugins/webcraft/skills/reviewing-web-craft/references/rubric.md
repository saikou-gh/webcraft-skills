# Frontend Craft Review Rubric

## Contents

- [A — Architecture and reuse](#a--architecture-and-reuse)
- [F — Framework and lifecycle](#f--framework-and-lifecycle)
- [S — Styling and responsiveness](#s--styling-and-responsiveness)
- [M — Motion and interaction](#m--motion-and-interaction)
- [Y — Accessibility and semantics](#y--accessibility-and-semantics)
- [P — Performance and rendering](#p--performance-and-rendering)
- [H — Assets, security, and hygiene](#h--assets-security-and-hygiene)

Treat each search signal as a lead. Open the source and confirm the behavior before reporting it. Default severities are calibration points; adjust for reach, frequency, and user impact.

## A — Architecture and reuse

### A1 — Oversized multi-purpose component

- **Look for:** a route/component combining large content datasets, rendering, data access, motion, and unrelated interaction state.
- **Signal:** largest source files; many hooks/listeners and large markup in one component.
- **Default:** High when it blocks safe maintenance; Medium when merely unwieldy.
- **Direction:** split by stable product responsibility; keep behavior beside the markup it owns.

### A2 — Repeated structures without a shared model

- **Look for:** copied card, section, route, or interaction logic that should be data-driven or shared.
- **Signal:** similar blocks across files; repeated class and label sequences.
- **Default:** High if behavior has drifted; Medium otherwise.
- **Direction:** extract a shared component, data schema, or behavior primitive without flattening legitimate variants.

### A3 — Cross-component DOM ownership

- **Look for:** one component querying or mutating nodes rendered by another.
- **Signal:** `querySelector`, `getElementById`, or global class mutation.
- **Default:** High.
- **Direction:** communicate through state, props, events, context, or a narrow store; let each component own its DOM.

### A4 — Content or configuration scattered through render code

- **Look for:** route maps, navigation, repeated labels, or product data duplicated across component bodies.
- **Default:** Medium.
- **Direction:** centralize stable data at the smallest sensible scope and preserve type/schema validation.

## F — Framework and lifecycle

### F1 — Derived state stored and synchronized

- **Look for:** effects/watchers writing values fully computable from existing state or props.
- **Default:** Medium; High when visible desynchronization occurs.
- **Direction:** compute during render or use the framework's computed/memo primitive.
- **Source:** [React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

### F2 — Missing lifecycle cleanup

- **Look for:** listeners, timers, observers, subscriptions, animation frames, or renderer resources without teardown.
- **Signal:** `addEventListener`, `setInterval`, `requestAnimationFrame`, `IntersectionObserver`, `ResizeObserver`, subscriptions.
- **Default:** High.
- **Direction:** pair setup with framework-appropriate cleanup and make remounts idempotent.
- **Source:** [React: Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)

### F3 — Unstable list identity

- **Look for:** index/random/time keys on lists that can reorder, insert, or retain child state.
- **Default:** Medium; Low for immutable decorative lists.
- **Direction:** use a stable domain identifier.

### F4 — Render impurity or state mutation

- **Look for:** state updates, network calls, DOM mutation, or non-deterministic values during render/SSR.
- **Default:** High.
- **Direction:** keep render pure and move side effects to the correct lifecycle or event boundary.

### F5 — Version-specific reactivity misuse

- **Look for:** destructured reactive values, signals read outside tracking, stale effect closures, or legacy idioms misapplied to a newer major version.
- **Default:** High when updates stop; Medium otherwise.
- **Direction:** apply the detected framework version's documented reactive primitive.

## S — Styling and responsiveness

### S1 — No coherent token or scale

- **Look for:** many near-duplicate colors, spacing values, radii, shadows, or typography sizes with the same role.
- **Default:** Medium.
- **Direction:** consolidate recurring roles into a small token system; preserve intentional exceptions.

### S2 — Brittle viewport assumptions

- **Look for:** fixed widths/heights, absolute placement, `100vh` traps, or pixel offsets that fail at nearby widths.
- **Default:** High when content clips or overlaps; Medium otherwise.
- **Direction:** use intrinsic layout, modern viewport units, content-driven breakpoints, and explicit overflow behavior.

### S3 — Specificity escalation

- **Look for:** repeated `!important`, deeply nested selectors, or selector wars used to override component state.
- **Default:** Medium.
- **Direction:** reduce selector scope, clarify ownership, and encode variants explicitly.

### S4 — Inline style logic duplicating CSS behavior

- **Look for:** repeated large style objects or imperative property writes for ordinary responsive/state styling.
- **Default:** Medium.
- **Direction:** move stable presentation into the project's styling system and keep runtime values as explicit variables.

### S5 — Missing responsive content decisions

- **Look for:** desktop UI merely shrunk on mobile, unreadable line lengths, hidden essential actions, or unhandled overflow.
- **Default:** High for unreachable content; Medium otherwise.
- **Direction:** define navigation, content order, media crop, density, and interaction for small viewports.

## M — Motion and interaction

### M1 — No reduced-motion path

- **Look for:** large entrance, parallax, smooth-scroll, autoplay, or continuous motion with no reduced-motion handling.
- **Default:** Critical for unavoidable harmful motion; High otherwise.
- **Direction:** remove nonessential movement and preserve state changes under `prefers-reduced-motion`.
- **Source:** [WCAG 2.2: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

### M2 — Animation without cleanup or scoped ownership

- **Look for:** timelines/selectors recreated on render, global selectors, un-killed scroll triggers, or duplicate listeners.
- **Default:** High.
- **Direction:** scope animation to component-owned nodes and revert/kill it during cleanup.

### M3 — Layout-triggering work in hot paths

- **Look for:** alternating layout reads and style writes during scroll, pointermove, or animation frames.
- **Default:** High; mark `needs live run` when impact is inferred.
- **Direction:** batch reads/writes, animate compositor-friendly properties, and avoid synchronous layout in per-frame paths.

### M4 — Interaction only discoverable through hover

- **Look for:** controls or essential content available only on hover.
- **Default:** High when unavailable to touch/keyboard; Medium otherwise.
- **Direction:** provide focus, touch, and persistent affordances.

### M5 — State and visual feedback disagree

- **Look for:** disabled/loading/selected state not reflected semantically or visually, or animation finishing in the wrong state.
- **Default:** High for consequential actions; Medium otherwise.
- **Direction:** drive feedback from one state model and verify interruption/cancellation paths.

## Y — Accessibility and semantics

### Y1 — Non-semantic interactive element

- **Look for:** clickable `div`/`span`, missing keyboard behavior, or links used as buttons.
- **Default:** High.
- **Direction:** use native controls first; add correct keyboard and semantics only when no native element fits.
- **Source:** [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)

### Y2 — Missing accessible name or label

- **Look for:** icon-only controls, inputs, regions, or media controls without an accessible name.
- **Default:** Critical for a core flow; High otherwise.
- **Direction:** provide a visible label or accurate accessible name tied to the control.

### Y3 — Focus is hidden, trapped, or unmanaged

- **Look for:** removed outlines, modals that leak focus, overlays that fail to restore focus, or route changes with no focus strategy.
- **Default:** High.
- **Direction:** preserve visible focus and implement the expected focus lifecycle for the component pattern.

### Y4 — Image/text alternative mismatch

- **Look for:** missing/duplicative alt text, meaningful CSS backgrounds with no equivalent, or decorative media announced as content.
- **Default:** Medium; High when essential information is lost.
- **Direction:** make alternatives reflect purpose, not filenames or appearance alone.

### Y5 — Heading, landmark, or form structure is incoherent

- **Look for:** visual headings without heading semantics, missing landmarks, labels disconnected from fields, or errors not associated with inputs.
- **Default:** High for forms; Medium otherwise.
- **Direction:** encode the document and validation relationships in native semantics.

### Y6 — Contrast or target-size risk

- **Look for:** low-contrast text/controls or very small touch targets.
- **Default:** High when confirmed; otherwise Medium and `needs live run`.
- **Source:** [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## P — Performance and rendering

### P1 — Unsized or unoptimized primary media

- **Look for:** missing intrinsic dimensions, oversized source images, eager offscreen media, or absent responsive sources.
- **Default:** High for hero/LCP or layout shifts; Medium otherwise.
- **Direction:** reserve dimensions, deliver an appropriate format/size, and prioritize only genuinely critical media.

### P2 — Render-wide state churn

- **Look for:** high-frequency pointer/scroll/time state causing large subtree renders or a monolithic context changing every frame.
- **Default:** High; mark `needs live run` unless profiled.
- **Direction:** isolate hot state, use selectors or imperative render loops where appropriate, and keep unrelated UI out of the update path.

### P3 — Heavy dependency for a narrow use

- **Look for:** a large library imported for one small helper or bundled on routes that do not use it.
- **Default:** Medium; High when bundle evidence confirms impact.
- **Direction:** use a smaller entry point, native API, or lazy route boundary.

### P4 — Unbounded listeners, observers, or DOM work

- **Look for:** per-item global listeners, full-page queries on every update, huge rendered lists, or observers never disconnected.
- **Default:** High.
- **Direction:** delegate, virtualize, scope, cache, and clean up based on the actual bottleneck.

### P5 — Fonts or scripts block first render unnecessarily

- **Look for:** many font weights, render-blocking third parties, duplicate preload, or synchronous scripts.
- **Default:** Medium; High when measured impact is large.
- **Direction:** reduce variants, subset/self-host when appropriate, and load noncritical work after the initial experience.

Core Web Vitals must be measured. Source can justify a risk finding, not a numeric claim.

## H — Assets, security, and hygiene

### H1 — Raw HTML injection or unsafe URL handling

- **Look for:** `dangerouslySetInnerHTML`, `v-html`, Svelte raw HTML, unsanitized URLs, or string-built script/style content.
- **Default:** Critical for untrusted data; High when the trust boundary is unclear.
- **Direction:** render structured data, sanitize at the boundary, and restrict allowed protocols/origins.
- **Source:** [OWASP Cross Site Scripting Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)

### H2 — Secret, credential, or private endpoint in client source

- **Look for:** API secrets, tokens, service credentials, private hostnames, or environment files committed with values.
- **Default:** Critical.
- **Direction:** revoke exposed credentials, move secrets server-side, and keep only documented public configuration in the client.

### H3 — Runtime dependency on a reference/origin site

- **Look for:** navigation, API calls, scripts, fonts, or content fetched from a site the project claims to recreate independently.
- **Default:** High; Critical if it leaks user data or breaks core behavior.
- **Direction:** use authorized local assets/fixtures or an explicit supported integration.

### H4 — Generated, compiled, or development artifacts committed as source

- **Look for:** build output, screenshots in source folders, debug dumps, temporary files, or copied minified bundles.
- **Default:** High when presented as implementation; Medium for repository noise.
- **Direction:** remove artifacts, update ignore rules, and preserve reproducible source/build steps.

### H5 — Dead code, placeholders, or incomplete paths

- **Look for:** TODO/FIXME markers, empty handlers, sample copy, unreachable routes, console debugging, or unused assets/imports.
- **Default:** High when user-visible; Medium/Low otherwise.
- **Direction:** finish, remove, or explicitly scope the unfinished behavior.

### H6 — Missing reproducible quality commands

- **Look for:** no working build, lint, type, or test command; documentation that does not match the project.
- **Default:** Medium; High when the project cannot be built.
- **Direction:** make the supported checks explicit and runnable from a clean checkout.
