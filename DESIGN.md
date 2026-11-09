---
version: alpha
name: ReadStack — Archival Modern
description: Editorial, cover-first design for a personal library.
omitted:
  - section: rounded
    reason: Corner radii have not yet been selected or validated.
  - section: components
    reason: Component token values have not yet been selected or validated.
---

# ReadStack design direction

## Overview

ReadStack is a multiuser personal library for cataloging and reviewing books, not an ebook reader. The owner approved the general **Archival Modern** visual direction after reviewing light and dark library prototypes. This document consolidates that direction into an initial design reference; individual colors, type sizes, component treatments, and implementation details remain candidates until validated. It is not approval to change product behavior or release to production.

The token blocks follow the [Google DESIGN.md alpha specification](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md). Tokens are provisional design inputs; the initial theme foundation implements a subset for Ant Design and semantic CSS, but browser validation and individual screen adoption remain pending.

- **Editorial warmth, modern restraint:** evoke a carefully kept collection through typography, breathing room, and warm neutrals rather than visual clutter.
- **Covers first:** let book artwork carry visual interest; preserve the entire image rather than cropping it to fill a frame.
- **Quiet, useful interfaces:** make search, actions, and status easy to find without competing with the collection. Hierarchy comes from spacing and type before ornament.
- **Dark mode with equal care:** use layered, sophisticated dark surfaces and readable content, not a simple color inversion. Covers and controls must remain clear in both themes.
- **Responsive and inclusive:** design from small screens upward, with keyboard access, visible focus, readable text, and reduced-motion support.
- **Decoration is optional:** background books, plants, textures, and spine effects may be explored sparingly; none are required, and none should consume useful space or obstruct content.

## Colors

The canvas, surface, primary text, accent, and gold values are initial color candidates within the approved direction, not individually approved values. Supporting colors and interaction states are provisional starting points. Change them as measurements and implementation testing require. Each semantic role has a separate light and dark CSS color token; use the appropriate theme consistently.

```yaml
colors:
  canvas-light: "#F8F5EE"
  canvas-dark: "#121316"
  surface-light: "#FFFCF7"
  surface-dark: "#1A1C21"
  surface-raised-light: "#FFFFFF"
  surface-raised-dark: "#242730"
  surface-muted-light: "#EEEAE1"
  surface-muted-dark: "#22242A"
  text-primary-light: "#191816"
  text-primary-dark: "#ECE8E0"
  text-secondary-light: "#5C5852"
  text-secondary-dark: "#B8B3AA"
  text-on-accent-light: "#FFFFFF"
  text-on-accent-dark: "#121316"
  border-subtle-light: "#C6BFB3"
  border-subtle-dark: "#6A6C73"
  accent-light: "#1F3A5F"
  accent-dark: "#7597C4"
  accent-hover-light: "#304F78"
  accent-hover-dark: "#9AB7DB"
  accent-active-light: "#152C4B"
  accent-active-dark: "#B3CAE5"
  accent-subtle-light: "#E3EAF2"
  accent-subtle-dark: "#27384D"
  gold-light: "#B8860B"
  gold-dark: "#E0AC43"
  error-light: "#A32D27"
  error-dark: "#FF938B"
  warning-light: "#805600"
  warning-dark: "#E0AC43"
  success-light: "#28613C"
  success-dark: "#8BCF9F"
  focus-light: "#1F3A5F"
  focus-dark: "#9AB7DB"
  disabled-text-light: "#6D6861"
  disabled-text-dark: "#AAA69E"
  disabled-surface-light: "#E8E4DC"
  disabled-surface-dark: "#303239"
```

Use semantic roles rather than hardcoded component colors. Gold is for suitable graphic accents such as rating or favorite details, not normal-size text on light surfaces. Meaningful graphics and states still need sufficient contrast and non-color cues. Status must also be conveyed with text, shape, or iconography, never color alone. Disabled appearance must not be the sole explanation of why an action is unavailable.

Previously reported contrast checks for these candidate pairs are: primary text/light canvas 16.30:1; secondary text/light surface 6.90:1; white/light accent 11.48:1; primary text/dark canvas 15.20:1; secondary text/dark surface 8.17:1; gold/light surface 3.18:1; and subtle border/light surface 1.78:1. These are pair-specific results, not certification. The light subtle border is decorative and must not be the sole visual boundary needed to identify a control. Choose and measure a separate functional boundary against its adjacent colors when a visible boundary is necessary; no functional border token is approved yet.

**Validation required before implementation sign-off:** measure actual foreground/background pairs in both modes, including secondary text, gold, status messages, links, button text on accent and hover/active fills, disabled states, borders, icons, and focus indicators against every adjacent surface. Target WCAG 2.2 AA: at least 4.5:1 for normal text and 3:1 for qualifying large text; applicable non-text controls, state boundaries, and focus indicators need at least 3:1 against adjacent colors. Assess focus appearance and obscuration separately. Disabled controls are generally exempt from contrast requirements, but should remain legible where practical. Adjust tokens or usage when a pair fails; do not infer compliance from the palette alone.

## Typography

- **Display:** Newsreader is the preferred editorial serif for page titles and selected headings, subject to license, availability, loading, fallback, performance, and rendering verification. Use a suitable system serif fallback until verified; adding a font dependency or service needs separate approval.
- **UI and body:** existing locally loaded Geist Sans, with a system sans-serif fallback. Use for controls, forms, body copy, metadata, and dense information.
- **Metadata only:** Geist Mono may be used sparingly when alignment or distinction actually improves readability; it is not the default for book details.

Newsreader is available from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/newsreader) under the SIL Open Font License 1.1, which permits bundling with its copyright notice and license. It is not installed in this increment: a local asset choice, license packaging, loading/performance and rendering review are still needed; a hosted font service or font dependency also requires separate approval. The system serif remains the fallback for future display use.

Candidate responsive type scale, using CSS `rem` with a nominal 16px browser default; respect user font settings and zoom:

| Role | Small screen | Larger screen | Line height |
|---|---:|---:|---:|
| Display / page title | 2rem | 3rem | 1.1–1.2 |
| Section heading | 1.5rem | 2rem | 1.2–1.3 |
| Card title / subsection | 1.125rem | 1.25rem | 1.3–1.4 |
| Body / controls | 1rem | 1rem | 1.5–1.6 |
| Supporting metadata | 0.875rem | 0.875rem | 1.4–1.5 |

Use 0.875rem as the practical minimum for ordinary metadata and helper text; avoid smaller text for essential information. Keep labels and inputs comfortably readable, and validate long Spanish labels, wrapping, and user-enlarged text. Use a consistent spacing rhythm (candidate steps: 4, 8, 12, 16, 24, 32, 48, and 64px); scale outer gutters and grid gaps to available width rather than enforcing fixed desktop dimensions.

The following values are candidate endpoints of the scale above, not final font or weight decisions. Intermediate sizes and line heights may adapt within the stated ranges.

```yaml
typography:
  display-small: { fontFamily: Newsreader, fontSize: 2rem, lineHeight: 1.2 }
  display-large: { fontFamily: Newsreader, fontSize: 3rem, lineHeight: 1.1 }
  heading-small: { fontFamily: Newsreader, fontSize: 1.5rem, lineHeight: 1.3 }
  heading-large: { fontFamily: Newsreader, fontSize: 2rem, lineHeight: 1.2 }
  subsection-small: { fontFamily: Geist Sans, fontSize: 1.125rem, lineHeight: 1.4 }
  subsection-large: { fontFamily: Geist Sans, fontSize: 1.25rem, lineHeight: 1.3 }
  body: { fontFamily: Geist Sans, fontSize: 1rem, lineHeight: 1.5 }
  metadata: { fontFamily: Geist Sans, fontSize: 0.875rem, lineHeight: 1.5 }
  metadata-mono: { fontFamily: Geist Mono, fontSize: 0.875rem, lineHeight: 1.5 }
```

## Layout

Use a responsive, cover-first grid with fluid outer gutters and gaps, and shared navigation across relevant routes. Book detail uses two columns on desktop and a logical stack on mobile. Preserve useful screen space and allow content to reflow instead of fixing desktop dimensions.

```yaml
spacing:
  step-1: 4px
  step-2: 8px
  step-3: 12px
  step-4: 16px
  step-5: 24px
  step-6: 32px
  step-7: 48px
  step-8: 64px
```

## Elevation & Depth

Prefer quiet tonal separation, spacing, and restrained borders over heavy shadows. Raised and muted surfaces are candidates, not a requirement to add elevation to every element; verify separation in both themes.

## Shapes

Keep shapes understated and consistent with the modern editorial direction. Corner radii have not been selected; validate any future scale rather than treating a particular radius as approved.

## Components

### Navigation and library

Use shared, consistent navigation across relevant routes, with clear current location and accessible names. Keep search visible at mobile and desktop widths. Put secondary mobile filters in a labeled, keyboard-operable disclosure that exposes its expanded state; keep applied filters discoverable. Preserve existing search, filtering, pagination, and actions.

The library is a responsive, cover-first grid. Each cover sits in a consistent 2:3 frame with `object-fit: contain`, so the complete image remains visible; accommodate missing or failed artwork with a quiet, accessible fallback. Card content clearly identifies title, author, year, rating, and favorite status when available. Maintain readable metadata and usable controls as columns change; avoid relying on hover for information or actions.

### Book detail and reviews

Use a responsive two-column desktop composition for cover and book information, collapsing to a logical single-column stack on mobile. Keep key metadata and existing actions easy to find. Reviews should feel editorial but remain scannable, with clear authorship/context where already provided, content, and available actions. Long titles, content, and localized dates must wrap without clipping.

### Forms and feedback

Use restrained surfaces, persistent visible labels, clear grouping, and inline validation with actionable text. Keep submission, pending, success, and failure states distinct without losing entered content. Apply the same care to authentication and book/review forms. Empty states explain the situation and offer an appropriate existing action; loading states communicate progress without layout jumps where practical; errors explain recovery without exposing sensitive internal details. Announce relevant asynchronous updates accessibly.

### Ant Design and theme synchronization

Retain Ant Design 5 provisionally. The initial shared provider synchronizes its algorithm and selected tokens with the document's Tailwind dark class and existing preference, with a pre-hydration bootstrap and a fail-open visibility guard. Ant Design color seeds are literal values mirrored from CSS because its algorithms derive palettes from them. Validate modals, dropdowns, portals, notifications, inputs, disabled states, first paint and hydration in both modes; existing page-specific colors remain for later increments.

### Accessibility and responsive behavior

- Provide semantic landmarks, headings, labels, meaningful cover alternatives, accessible icon-button names, and programmatic state for controls. Decorative imagery should be ignored by assistive technology.
- Support keyboard-only operation in logical order, visible focus on every interactive element, proper dialog focus management and return, and usable disclosures. Focus must not be hidden by sticky UI.
- Aim for at least 44 × 44 CSS pixels for touch targets where practical, with adequate separation; validate against applicable WCAG 2.2 target-size requirements and exceptions.
- Respect `prefers-reduced-motion`: remove nonessential transforms and smooth scrolling or transitions when requested. Motion must never be needed to understand state.
- Reflow at narrow viewport widths and 400% zoom without loss of content or functionality or unnecessary two-dimensional scrolling; test text resizing to 200%. Do not truncate essential text without an accessible way to read it.
- Test representative light and dark screens with keyboard, screen reader, zoom, touch, and measured contrast. These are requirements for validation, not a claim of current compliance.

## Do's and Don'ts

### Behavioral boundaries

This is a visual and interaction design reference, not a change to application contracts. Preserve Spanish UI copy, public registration, authentication and session behavior, per-user isolation, book and review mutation guards, draft persistence and recovery, and all existing book/review functionality including favorites and CSV export. Do not weaken error handling or security to match a visual treatment. Existing decisions and outstanding release/security gates remain in force; design approval is not approval of a new authentication architecture or registration policy.

### Implementation order

1. Establish semantic tokens and synchronized light/dark theme foundation; validate contrast and font loading.
2. Apply the foundation to navigation and the cover-first library, search, and filters.
3. Adapt book detail and reviews, including responsive layouts and feedback states.
4. Align book forms and authentication screens without changing their behavior.
5. Validate across screens, themes, viewport sizes, accessibility modes, and existing functional and multiuser regression checks; resolve failures before sign-off.
