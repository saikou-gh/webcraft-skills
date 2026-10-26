# Replica Review Checklist

## Contents

- [Scope and setup](#scope-and-setup)
- [Route coverage](#route-coverage)
- [Visual fidelity](#visual-fidelity)
- [Behavior and motion](#behavior-and-motion)
- [Mobile and responsive behavior](#mobile-and-responsive-behavior)
- [Accessibility](#accessibility)
- [Performance and robustness](#performance-and-robustness)
- [Source quality](#source-quality)
- [Evidence and decision](#evidence-and-decision)

## Scope and setup

- [ ] The reference, replica, and repository are clearly identified.
- [ ] Included and excluded routes/states are explicit.
- [ ] Asset permissions and intentional differences are recorded.
- [ ] Desktop and mobile viewport sizes are fixed.
- [ ] Authentication, personalization, region, consent, and data limitations are recorded.
- [ ] Reference and replica are compared with the same browser state and content where possible.

## Route coverage

- [ ] Every header and footer navigation target is inventoried.
- [ ] Every in-scope route opens directly and through navigation.
- [ ] Back/forward behavior and deep links work.
- [ ] Unknown or intentionally omitted links are not left as broken controls.
- [ ] Menus, drawers, modals, tabs, accordions, carousels, and tooltips are inventoried.
- [ ] Default, loading, empty, success, validation, and error states are inventoried when present.
- [ ] Media, canvas, WebGL, and audio states are inventoried.

## Visual fidelity

Compare matched native-resolution states:

- [ ] Section order and hierarchy
- [ ] Page/container width and alignment
- [ ] First-viewport composition and visual weight
- [ ] Typography family, size, weight, line height, tracking, and case
- [ ] Text wrapping, truncation, and line count
- [ ] Vertical and horizontal spacing rhythm
- [ ] Color, opacity, gradients, borders, radii, and shadows
- [ ] Image/media selection, aspect ratio, crop, focal point, and quality
- [ ] Icon shape, stroke, size, baseline, and optical weight
- [ ] Repeated component consistency
- [ ] Backgrounds and section transitions

Record measurements when a finding depends on geometry; avoid unsupported adjectives such as “off” or “generic.”

## Behavior and motion

- [ ] Internal navigation and controls perform the expected action.
- [ ] Hover, focus, active, selected, disabled, and pressed states match.
- [ ] Menus, drawers, and modals open, close, and restore state correctly.
- [ ] Replica forms validate, submit, fail, and recover in a local sandbox with synthetic data; reference forms are not submitted.
- [ ] Tabs, filters, sort, pagination, and carousels preserve the expected state.
- [ ] Sticky elements and scroll positions match.
- [ ] Page-load, route, entrance, exit, and scroll transitions are compared.
- [ ] Motion duration, delay, easing, direction, stagger, and interruption match.
- [ ] Video/audio controls and playback behavior match.
- [ ] Canvas/3D input and lifecycle behavior match.

Use sequential frames or video timestamps for motion findings.

## Mobile and responsive behavior

- [ ] All routes remain reachable.
- [ ] There is no unintended horizontal page overflow.
- [ ] Text does not clip, overlap, or become unreadable.
- [ ] Content order and visibility match the reference intent.
- [ ] Navigation opens, closes, scrolls, and manages focus.
- [ ] Touch targets are usable and not occluded.
- [ ] Fixed/sticky controls do not cover content or safe areas.
- [ ] Images use the intended crop and placement.
- [ ] Swipe/touch behavior works without accidental page gestures.
- [ ] Orientation change and nearby viewport widths are stable.
- [ ] A real-device limitation is stated when only emulation was used.

## Accessibility

- [ ] Keyboard users can reach and operate every core control.
- [ ] Focus is visible, ordered, trapped when appropriate, and restored.
- [ ] Interactive elements use native semantics where possible.
- [ ] Controls and form fields have accurate accessible names/labels.
- [ ] Headings and landmarks describe the page structure.
- [ ] Form errors are associated with fields and announced appropriately.
- [ ] Images/media have purpose-appropriate alternatives.
- [ ] Color contrast and non-color cues are sufficient.
- [ ] Reduced-motion behavior preserves meaning without harmful motion.

## Performance and robustness

- [ ] The page has no unexpected console errors or failed core requests.
- [ ] Primary media has dimensions and appropriate delivery size.
- [ ] Fonts load without severe layout shifts or missing glyphs.
- [ ] Routes do not load obviously unnecessary heavy features.
- [ ] Animation remains responsive on representative hardware.
- [ ] Resize, tab visibility, and route changes do not leak work/resources.
- [ ] Loading and asset failure have usable outcomes.
- [ ] Core Web Vitals are measured before numeric claims are made.

## Source quality

- [ ] Source is authored, readable, and not a mirrored/compiled export.
- [ ] Routes and repeated components have a maintainable structure.
- [ ] Interaction state and side effects have clear ownership.
- [ ] Repeated behavior is shared without erasing legitimate variants.
- [ ] Assets are authorized, local or intentionally remote, and documented.
- [ ] No credentials, private configuration, analytics IDs, or machine files are committed.
- [ ] No runtime dependency on the reference domain exists unless explicitly intended.
- [ ] README/setup steps work from a clean checkout.
- [ ] Production build succeeds in a credential-free, least-privilege environment after its command is inspected.
- [ ] Relevant tests, lint, and type checks succeed in that environment, or their absence is reported.

## Evidence and decision

- [ ] Every finding states reference versus replica.
- [ ] Every finding names route, viewport, and state.
- [ ] Evidence is reproducible: crop, measurement, frame, log, test, or source line.
- [ ] Severity reflects reach and user impact, not just visual size.
- [ ] Repeated root causes are grouped.
- [ ] Passed checks are specific.
- [ ] Unverified checks and access limitations are explicit.
- [ ] `ready` is recommended only with no blockers and complete scoped coverage.
