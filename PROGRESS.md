# Progress — Biblioteca Personal

**Last updated:** 2026-11-11
**Current phase:** UX/UI redesign — authorized to begin; not a production-release or security approval.
**Active task:** `SEC-01` implemented and locally validated; production configuration and deployment remain unverified. UI-03.1 was owner-validated within the checks below; UI-03.2 awaits owner review. `TEST-02` / `SEC-05` remain incomplete and `SEC-03` remains partial.
**Branch:** `modernization`
**Production:** Not accessed or changed.

## UI-BETA-03 local handoff

- Added the existing library BETA badge to the shared authentication identity used by login and registration, retaining the decorative book icon and allowing the brand row to wrap. Added a focused source-level test; browser, narrow-screen, theme, and screen-reader review remain pending.
- From `frontend/` on Node 22: `fnm exec --using 22 npm test` passed 132/132; `fnm exec --using 22 npm run lint -- --no-cache` passed with two existing `reviews.tsx` warnings; `fnm exec --using 22 npx tsc --noEmit --incremental false` and `fnm exec --using 22 npm run build` passed. `git diff --check -- . ':(exclude)backend/library.db'` passed.
- Changed `frontend/components/auth-identity.tsx`, `frontend/app/globals.css`, `frontend/tests/auth-beta-badge.test.cjs`, and this handoff. Existing UI-BETA-01 work and favicon assets were preserved. The pre-existing database modification was not inspected or changed; no production access or deployment occurred.

## UI-BETA-02 local handoff

- Added `frontend/app/icon.svg`: an ivory tile with an ink-blue R, stacked book lines, and a bookmark; removed the conflicting legacy `frontend/app/favicon.ico`. The opaque tile is intended to work against both light and dark browser chrome.
- From `frontend/` on Node 22: `fnm exec --using 22 npm test` passed 131/131; `fnm exec --using 22 npm run lint -- --no-cache` passed with two existing `reviews.tsx` warnings; `fnm exec --using 22 npx tsc --noEmit --incremental false` and `fnm exec --using 22 npm run build` passed. The build lists `/icon.svg` as a static route.
- Browser review at 16px and 32px in light and dark browser themes remains pending. UI-BETA-01 changes and the pre-existing `backend/library.db` modification were intentionally preserved; no production access or deployment occurred.

## UI-BETA-01 local handoff

- Added a persistent BETA badge to the library navigation and a non-blocking Spanish notice that stored books and reviews could be lost during Beta. Existing theme tokens support both color schemes; the navigation can wrap on narrow screens.
- From `frontend/` on Node 22: `fnm exec --using 22 npm test` passed 131/131; `fnm exec --using 22 npm run lint -- --no-cache` passed with two existing `reviews.tsx` warnings; `fnm exec --using 22 npx tsc --noEmit --incremental false` and `fnm exec --using 22 npm run build` passed. Tests use a component harness and CSS assertions, not browser automation.
- Changed `frontend/components/navbar.tsx`, `frontend/components/home.tsx`, `frontend/app/globals.css`, `frontend/tests/beta-notice.test.cjs`, and this handoff. Backend code and the pre-existing `backend/library.db` modification were intentionally untouched. No deployment or production access occurred.
- Owner browser review remains needed in both themes and at narrow widths and zoom, including keyboard and screen-reader reading order, contrast, and existing navigation and filter actions. No persistence or recovery guarantee is implied.

## SEC-BETA-02 local handoff

- Added a dummy cost-10 bcrypt comparison for unknown-user login and made the opt-in IP limiter key explicitly from the direct socket peer, independent of Express proxy trust. Existing account limits, API responses and default-disabled IP behavior remain unchanged.
- With Node 22 from `backend/`, `fnm exec --using 22 npm test` passed 71/71; `fnm exec --using 22 npm run test:security` passed 3/3; `fnm exec --using 22 npm run build` passed. Tests use isolated synthetic databases. Node emitted an existing experimental MockTimers warning.
- Render ingress and client-IP trust remain unverified; the direct-peer limiter is not a safe assumed Render per-client control. `SEC-03` remains partial. Account-spanning and distributed abuse, synchronous bcrypt CPU exhaustion, timing differences, and the existing duplicate-registration 409 disclosure remain risks. An enumeration-safe registration response needs a separate API contract decision.
- Changed backend auth model, auth rate-limit middleware, focused auth tests, `README.md`, and this handoff. The pre-existing `backend/library.db` modification, frontend, environment and production configuration are intentionally untouched. No production access or deployment occurred.

## Completed

| ID | Result |
|---|---|
| `DISC-01` | Initial project discovery completed through selective static review. |
| `AUD-01` | Static security audit completed; findings mapped to remediation tasks. |
| `DOC-01` | `AGENTS.md`, `PLAN.md`, and `PROGRESS.md` written and verified on 2026-11-07. |
| `TEST-01` | Backend test harness and initial authentication and ownership tests implemented and locally validated. |
| `SEC-04` | Review and book ownership enforced and locally validated with A/B regression tests and security probes. |
| `TEST-03` | Authentication and multiuser regression coverage expanded and a representative isolation regression detected in a temporary copy. |
| `GOV-02` | Owner-approved environment governance, service inventory, rotation and revocation procedures documented in `docs/ENVIRONMENT_GOVERNANCE.md`; production settings remain unverified. |
| `SEC-01` | Explicit 64-hex JWT secret enforced before startup and app initialization in all environments; synthetic configuration and isolated SQLite regression tests pass locally. Runtime validation cannot establish randomness or uniqueness. |

Frontend migration work is locally committed: Next.js 16 / React 19 (`78699d1`), the Ant Design `destroyOnHidden` correction (`639b590`), the middleware-to-Proxy convention migration (`cee9e10`), and authenticated-login navigation and recovery (`9a3a17a`). These increments do not complete `UPG-03`; no deployment or database migration was performed. A limited backend dependency security refresh is locally validated; it does not complete `UPG-02`.

Functional modernization handoff: the locally committed FIX-02 work comprises A (public authentication API errors, `c58e2b7`), B1 (book loading and error states, `b7112d1`), B2 (book mutation failures, `09178af`), B3 (book actions and CSV error handling, `25ecbd4`), and C (review reliability and recovery, `3216355`). FIX-02 is a work label, not an existing formal PLAN task ID.

## Verified source-code findings

- Frontend: Next.js 16.4.6, React 19.3.1, TypeScript, App Router, Ant Design 5.29.3, Tailwind CSS.
- Backend: Express 4, TypeScript, Zod, bcrypt, JWT, and `better-sqlite3`.
- SQLite uses relative path `library.db`; `backend/library.db` is tracked by Git.
- Schema creation occurs at module load; no migrations exist.
- Authentication uses a six-hour JWT in a JavaScript-readable `token` cookie, sent as a Bearer token.
- Proxy covers `/` and `/book/*`; public authentication routes remain accessible. JWT claims are decoded only for navigation and expiry; API verification remains authoritative. The login page checks a plausible session with an authenticated API read and uses safe `replace` navigation after verification or login; verification failure offers recovery without deleting a valid session.
- Review listing requires book ownership and filters reviews by owner. Creation, update, and deletion use token-derived identity and enforce the stored book relationship; inaccessible resources return a generic 404.
- Existing inconsistent review records are hidden and cannot be mutated through review endpoints; they are not repaired or deleted by SEC-04.
- CORS is open; authentication has local per-account rate limits and opt-in direct-peer IP limits; error handling is inconsistent.
- JWT configuration requires an explicit 64-hex-character secret and has no fallback; generation and uniqueness are operational responsibilities.
- Initial discovery found no tests, test scripts, CI, or backup procedure. Backend tests and scripts now exist; CI and a backup procedure remain absent.
- Initial discovery found the README partially stale; TEST-01 added backend test instructions.

## Owner-confirmed deployment facts

- Vercel Production tracks `main`.
- Vercel Preview is configured for other branches.
- Render Free tracks `main` with Auto-Deploy on commit.
- Render Free provides no persistent disk for this service.
- Production SQLite persistence and recovery are unverified.

## Pending verification

`AUD-02` remains pending:

- Runtime registration, login, CRUD, reviews, favorites, filters, and CSV.
- Cross-user isolation in a live environment.
- Production persistence behavior and recovery capability.
- Free-tier limits and dependency vulnerability status.
- Hosting access, deployment settings, and rollback feasibility.

Production persistence must not be tested destructively. Any disposal of production demo data requires explicit approval.

## Pending decisions and blockers

| Decision | Impact |
|---|---|
| Database provider not selected | Blocks `DB-02` and downstream database work. `DB-01` can proceed. |
| Authentication/session architecture not approved | Blocks `SEC-02`, `SEC-06`, and `OPT-02`. |
| Broader upgrade targets not approved | Blocks completion of `UPG-02`, `UPG-03`, and `UPG-04`; the owner approved the limited Express 4 and compatible transitive refresh. |
| Staging strategy not approved | Blocks `DB-06` and production validation. |
| Public registration policy not finalized | No immediate blocker; registration remains unchanged until `PUB-01`. |
| Render client-IP and proxy behavior unverified | Blocks a safe Render per-client IP limiter and full `SEC-03` acceptance; direct-peer IP limits are disabled by default. |
| Duplicate registration returns 409 | Existing account-existence disclosure remains; resolving it requires a registration API contract decision. |

## Latest validation status

- Owner-reported manual `TEST-02` browser observations, using synthetic accounts and an isolated temporary SQLite database: registration, login, logout, protected-route redirects with `returnTo`, book creation, detail viewing, editing, cancellation of deletion and successful deletion worked. Editing a coverless book after committed FIX-01 worked. Review creation and deletion updated derived ratings on book detail and library cards; favorite toggling and library favorite filtering worked; per-book CSV export matched the book data. Two synthetic users had separate libraries; direct cross-user detail and edit navigation returned HTTP 404 without revealing the other user's book.
  - The owner selectively blocked localhost:4000 book API requests in Edge DevTools, observed the library error state, disabled the blocking rule and used Retry to reload books without losing the session. This is one manual recovery scenario, not automated end-to-end testing or comprehensive recovery validation.
  - These observations do not establish all form validation cases, cross-user mutations or accessibility, nor do they constitute staging or production validation, security sign-off or release readiness. `TEST-02` and `SEC-05` remain formally open; CI and remaining acceptance evidence are still pending.
- FIX-01 follow-up (2026-11-11): the owner confirmed that the original null normalization permits a title-only edit and rejects invalid nonempty URLs, but clearing a previously invalid image field remained blocked. The edit-only resolver now treats empty and whitespace-only input as absent; PATCH omission retains any persisted cover, so removal remains unsupported. On Node v22.23.4, focused frontend mutation tests passed 17/17, full frontend tests passed 128/128, isolated backend tests passed 65/65, frontend lint passed with two existing `reviews.tsx` warnings, frontend and backend TypeScript checks and builds passed. Tests exercise the real resolver with a mocked form handler, not browser revalidation. Owner browser review was pending at that time; see the later observations above.
- Coverless edit regression (2026-11-11): the edit form normalizes a loaded null cover to undefined, preserving the existing URL-only PATCH contract and unchanged-cover behavior. Clearing an existing cover remains unsupported. On Node 22, focused frontend mutation tests passed 16/16, full frontend tests passed 127/127, lint passed with two existing `reviews.tsx` warnings, TypeScript and production build passed; backend build and isolated tests passed 65/65. The focused test uses a handler harness and real schema resolver, not a browser. Owner browser review was pending at that time; see the later observations above. `TEST-02` remains incomplete.
- Session observer increment (2026-11-10): added a client-only invalidation snapshot and best-effort cross-tab hints without changing filter retention or authentication protocols. On Node v22.23.4, focused observer/auth/login tests passed 29/29, full frontend tests passed 110/110, frontend lint passed with the two existing `reviews.tsx` warnings, targeted utility lint and TypeScript passed, and the frontend build passed. Those tests use simulated browser events and channels.
  - Manual validation used Microsoft Edge InPrivate with two tabs sharing the same local origin, isolated temporary frontend/backend services, a synthetic SQLite database and a synthetic account; production was not involved. Subscribe and unsubscribe passed. Unchanged reconciliation while subscribed did not increment the generation; reconciliation while unsubscribed conservatively incremented it without notifying subscribers. Same-tab synthetic login and logout notified observers synchronously between the before/after calls to `setToken` and `removeToken`.
  - For cross-tab login/logout, passive BroadcastChannel message counts increased and the receiving observer updated its state. A temporary BroadcastChannel sender with no observer subscriber, closed immediately after posting, delivered to the other tab in this run. Returning to a visible tab triggered conservative observer invalidation.
  - BFCache restoration was not validated: Edge reloaded the harness instead of restoring its document. Its Back/forward cache diagnostic reported `MainResourceHasCacheControlNoStore` and `WebSocketUsedWithCCNS` in the development environment. Synthetic token expiry, deliberately missed channel delivery, and server-side revocation were not browser-tested. These observations do not guarantee cross-tab delivery, establish authentication authority, or establish safe exposure of retained private filters. Missed cross-tab events, arbitrary cookie changes between checks, and server-side revocation cannot be reliably detected.
- Cover-only View Transitions proof of concept (2026-11-10): on Node v22.23.4, from `frontend/`, `fnm exec --using 22 npm run lint -- --no-cache` passed with two existing `reviews.tsx` warnings, `fnm exec --using 22 npx tsc --noEmit --incremental false` passed, `fnm exec --using 22 npm test` passed 94/94, and `fnm exec --using 22 npm run build` passed. Tests inspect boundary configuration and CSS rather than rendered browser transitions. No browser verification was performed; client-side loading may prevent pairing. `UPG-03` and its prerequisites remain open.
- `SEC-01`: from `backend/` on Node v22.23.4, `fnm exec --using 22 npm run build` passed, `fnm exec --using 22 npm test` passed 64/64, and `fnm exec --using 22 npm run test:security` passed 3/3. Configuration tests exercise invalid and valid secrets in test and production modes through isolated subprocesses; they do not access production. Tests use temporary databases and no longer read the tracked database for hash guards. Independent before/after SHA-256 checks verify preservation of the pre-existing `backend/library.db` modification. Node emitted an existing experimental MockTimers warning.
- `GOV-02` documentation-only closeout: source and test references were checked without reading environment files or production systems; the inventory includes dynamically constructed rate-limit names, `DATABASE_PATH`, `NODE_ENV`, and frontend test `TZ`. At that time the test secret did not meet the approved format and runtime fallback remained; `SEC-01` subsequently addressed both. No builds or tests were run for this documentation-only increment.
- Frontend migration and login UX: on Node 22, `fnm exec --using 22 npm test` passed 87/87; `fnm exec --using 22 npm run lint` passed with 10 existing warnings; `fnm exec --using 22 npx tsc --noEmit --incremental false` and `fnm exec --using 22 npm run build` passed. The build did not report the middleware deprecation warning. After a test-only addition, the focused login component tests passed 2/2. These checks were not rerun during this documentation update.
- Owner-reported browser checks: catalog-to-detail navigation and Back returned to the catalog; unauthenticated access to protected routes was denied; disconnecting the local backend displayed the session-verification recovery UI. Before the login correction, an authenticated user could visit `/login`, Back could return there, and `/` remained accessible with the existing session. These observations do not establish the corrected login flow end-to-end. Cross-tab changes, hydration failure, JavaScript-disabled behavior, deep-link and Back/Forward recovery, and comprehensive authentication and cross-user security remain unverified.
- Published-review follow-up (2026-11-09): removed a duplicate decorative separator for unsupported dates and corrected review presentation assertions; valid UTC dates and raw unsupported values remain covered. On Node 22, focused review tests passed 22/22, frontend tests passed 79/79, lint and TypeScript checks passed, and the production build passed with the existing outdated Browserslist warning. No browser validation was performed.
- Catalog presentation batch (2026-11-09): aligned the existing filter form with the catalog, added restrained card/disclosure hover feedback and consistent catalog state styling without changing handlers. Node 22 frontend lint, TypeScript, and production build passed; build warned that Browserslist data is outdated. `npm test` reported 77/79 passing; two unrelated review presentation assertions failed in untouched `review-functional.test.cjs`. The focused catalog, filter, and loading test command passed 22/22. Browser validation, including contrast, zoom, touch, and recovery states, remains pending. The pre-existing database modification and untracked `frontend/tests/book-action-presentation.test.cjs` were not edited.
- UI-03.1 owner-led browser validation: desktop detail layout worked in light and dark themes; at 390px the cover and information stacked without observed horizontal scrolling or clipping. The tested book's cover was complete and uncropped, and title, author, genres, actions and reviews were legible and accessible in the tested layouts. At 200% zoom, content and controls remained usable. Favorite toggle, edit navigation, export, delete confirmation/cancel, review draft entry and browser Back worked. Varied cover ratios, failed/missing cover fallbacks, screen-reader behavior, 400% zoom and comprehensive accessibility were not established by these checks.
- UI-03.1 implementation checks on Node 22: frontend `fnm exec --using 22 npm run lint -- --no-cache`, `fnm exec --using 22 npx tsc --noEmit --incremental false`, and `fnm exec --using 22 npm test` passed (64 tests); an isolated frontend `fnm exec --using 22 npm run build` passed with an outdated Browserslist data warning. In an isolated backend copy without the tracked database, `fnm exec --using 22 npm run build`, `fnm exec --using 22 npm test` (42 tests), and `fnm exec --using 22 npm run test:security` (3 probes) passed. The new presentation test uses a lightweight component harness, not browser automation. Checks were not rerun during documentation-only closeout.
- UI-02.3 owner-led browser validation: in light mode selected and unselected stars were distinguishable and rating text was correct; in dark mode selected, unselected and hover states were distinguishable and rating text was correct. Enter selected the focused star and updated its value; Tab reached the enabled publish button without trapping focus. Unsent review text and a three-star rating survived navigation away and back. Screen-reader, physical-touch and uncertain-result recovery behavior were not manually verified in this increment; this is not a comprehensive WCAG assessment.
- UI-02.3 implementation checks on Node 22: frontend `fnm exec --using 22 npm run lint -- --no-cache`, `fnm exec --using 22 npx tsc --noEmit --incremental false` and `fnm exec --using 22 npm test` passed (63 tests); frontend and backend builds and backend tests passed in isolated copies (42 backend tests). Rating tests exercise a lightweight harness and server-rendered markup, not browser automation. Checks were not rerun during closeout.
- UI-02.2 owner-led browser validation: at 390px title search remained visible and secondary filters were accessible through “Más filtros”; author filtering applied, remained active while collapsed, retained its displayed value on reopening, and cleared; the active indication reflected applied filters. Genre selection, clearing, keyboard navigation and dismissal worked. Genre Select uses `virtual={false}` to avoid the virtual list touch handler implicated in scroll interference; with it, a continuous scroll gesture moved the dropdown without moving the page and the previous touchmove intervention warnings disappeared in Edge mobile emulation. A separate gesture at a list boundary may scroll the page; the owner accepted this without overscroll CSS. Desktop secondary filters worked in light and dark themes. Physical touch devices, screen readers and zoom were not validated for this increment; this is not a comprehensive accessibility assessment.
- UI-02.2 implementation checks on Node 22: `fnm exec --using 22 npm run lint -- --no-cache`, `fnm exec --using 22 npx tsc --noEmit --incremental false`, and `fnm exec --using 22 npm test` passed in `frontend/` (61 tests); frontend build and backend build/tests passed in isolated copies (42 backend tests). The filter tests use a lightweight harness, not browser automation. Checks were not rerun during closeout. The shared 400ms debounce is unchanged; its rapid-cross-filter limitation remains separate.
- UI-02.1 owner-led browser validation: desktop light and dark presentation was satisfactory; at 390px the two-column grid was usable without horizontal overflow; card navigation and browser Back worked; at 200% zoom content was readable without horizontal overflow; keyboard Tab focus was visible and Enter opened the selected card. This is not a comprehensive accessibility assessment. Synthetic failure states were not browser-validated.
- UI-02.1 implementation checks on Node 22.23.4: from `frontend/`, `fnm exec --using 22 npm run lint -- --no-cache`, `fnm exec --using 22 npx tsc --noEmit --incremental false`, and `fnm exec --using 22 npm test` passed (55 tests); `fnm exec --using 22 npm run build` passed in an isolated copy. Backend build and tests passed in an isolated copy (42 tests). Card tests include a lightweight handler harness, not browser automation. Checks were not rerun during closeout.
- Theme foundation: semantic CSS tokens and a shared Ant Design/Tailwind provider preserve the existing local preference and initial system fallback. A pre-paint script and fail-open hydration guard mitigate theme flash. Newsreader is available under SIL OFL 1.1 but not bundled pending local asset/license packaging and loading/rendering review. Existing page-specific colors are not yet migrated.
- UI-01 manual browser validation, as reported by the owner: light/dark switching, persistence after reload, initial rendering without visible theme flash, hydration console, login/registration forms, book forms, dropdowns, buttons, tested overlays, and keyboard navigation worked in both themes. This is not a comprehensive accessibility assessment.
- UI-02 historical accessibility/visual QA finding: review rating stars were reported extremely low-contrast in both themes before UI-02.3. Further rendered contrast and accessibility assessment remain necessary; the owner observations above are not a compliance assessment.
- Theme increment validation on Node 22: from `frontend/`, `fnm exec --using 22 npm run lint -- --no-cache`, `fnm exec --using 22 npx tsc --noEmit --incremental false`, and `fnm exec --using 22 npm test` passed (52 tests); `fnm exec --using 22 npm run build` passed in a temporary copy with linked dependencies and isolated `.next`. From `backend/`, `fnm exec --using 22 npm run build`, `fnm exec --using 22 npm test` (42 tests), and `fnm exec --using 22 npm run test:security` (3 probes) passed. New tests exercise the bootstrap and provider handler with a lightweight harness, not a browser. The pre-existing database modification remained unchanged by SHA-256 during implementation; the owner reports it may have changed during subsequent manual browser validation and its current contents must be preserved.
- Final integrated regression reported on Node 22: frontend tests 49/49, backend tests 42/42, security probes 3/3, frontend lint and TypeScript checks passed. Builds were not rerun in this final regression. Earlier build results below are separate evidence.
- Focused manual browser checks were completed during prior work, but detailed evidence is not fully captured in repository documentation; comprehensive browser-level validation remains pending.
- Prior DOC-01 validation consisted of read-only inspection and Git checks; no build or tests were run then.
- TEST-01 local validation used Node.js 22: `npm run build` passed and `npm test` passed all 26 tests, from `backend/`.
- Before SEC-04, the security probes reproduced cross-user listing (200), cross-user creation (201), and updating a review owned by the caller but attached to another user's book in a synthetic inconsistent state (200).
- SEC-04 validation from `backend/` used Node.js v22.23.4: `fnm exec --using 22 npm run build` passed, `fnm exec --using 22 npm test` passed 32/32 tests, and `fnm exec --using 22 npm run test:security` passed all 3 probes. Tests were not rerun after documentation and comment-only closeout edits.
- Tests use isolated temporary SQLite databases and synthetic data; their hash guards passed. Independent SHA-256 checks before and after SEC-04 validation confirmed `backend/library.db` was unchanged.
- TEST-03 validation under Node.js v22.23.4: `fnm exec --using 22 npm run build` passed, `fnm exec --using 22 npm test` passed 37/37, and `fnm exec --using 22 npm run test:security` passed 3/3. The filtered-list test passed unchanged and failed as expected when the owner predicate was removed in a temporary backend copy. This demonstrates one representative regression, not exhaustive security coverage. CI remains pending.
- SEC-03 local validation under Node.js v22.23.4: `fnm exec --using 22 npm run build` passed, `fnm exec --using 22 npm test` passed 41/41, and `fnm exec --using 22 npm run test:security` passed 3/3. Rate-limit tests cover thresholds, retry headers, known/unknown accounts, expiry, and ignored spoofed forwarding headers. Render IP behavior was not verified.
- Backend dependency refresh: `fnm exec --using 22 npm audit --omit=dev --json --no-update-notifier` initially reported 13 affected packages (2 critical, 10 high, 1 moderate). After the approved Express 4 and compatible transitive refresh, `fnm exec --using 22 npm audit --omit=dev` reports 4 (1 critical, 3 high): `tar` via `@mapbox/node-pre-gyp` and `bcrypt`, primarily an install-time risk, and `zod`, whose unbounded genre array may be exposed to authenticated requests. The practical Zod impact under the JSON body limit is unverified; bcrypt 6 and Zod 4 were not approved. The `jws` advisory explicitly excludes jsonwebtoken verification usage.
- Dependency refresh validation on Node v22.23.4: `fnm exec --using 22 npm run build` passed; `fnm exec --using 22 npm test` passed 42/42, including a synthetic compressed JSON trailing-byte smoke test; `fnm exec --using 22 npm run test:security` passed 3/3. The smoke test does not control decoder scheduling or prove it detects the original vulnerability.
- `sha256sum backend/library.db` matched before and after the dependency refresh and validation; `git diff --check` passed. Tests were not rerun after comment and documentation-only edits.
- TEST-03 filter fixtures use partially overlapping attributes and distinct synthetic timestamps for deterministic pagination tests. Production pagination still has no tie-breaker when books share `createdAt`; this task does not change that behavior.
- Production was not tested or accessed; no backup or recoverable production SQLite state is assumed.
- No push, merge, deployment, or production access occurred.
- Authentication stability validation with Node.js 22: frontend `npm test` passed 11/11; frontend `npm run lint -- --no-cache` and `npm run build` passed. Backend `npm run build`, `npm test` (42/42), and `npm run test:security` (3/3) passed. The tracked database hash matched before and after. Local HTTP smoke checks confirmed public forms render with POST, native POST does not redirect or reflect synthetic inputs, and private routes redirect without a cookie. Browser hydration, actual login, and draft restoration were not exercised end-to-end.
- Review draft follow-up validation with Node.js v22.23.4: frontend `npm test` passed 13/13, `npm run lint -- --no-cache` and `npm run build` passed; backend `npm run build`, `npm test` (42/42), and `npm run test:security` (3/3) passed. Component-handler tests cover unrelated 401, restoration, and edits during a request using a lightweight hook harness, not a browser. Drafts expire after 24 hours of inactivity and are cleaned up on app startup and approximately hourly. The tracked database hash remained unchanged.

## Files changed

The coverless edit fix changes `frontend/app/book/[id]/edit/page.tsx`, `frontend/schemas/book.shema.ts`, `frontend/tests/book-mutations.test.cjs`, and this handoff. Backend code and the pre-existing `backend/library.db` modification are intentionally untouched.
The session observer increment changes `frontend/utils/cookies-handlers.ts`, adds `frontend/utils/session-observer.ts` and `frontend/tests/session-observer.test.cjs`, and updates this handoff. `FiltersProvider`, frontend navigation and fetching, backend code, and the pre-existing `backend/library.db` modification are intentionally untouched.
The local cover transition proof of concept changes `frontend/components/card.tsx`, `frontend/app/book/[id]/page.tsx`, `frontend/app/globals.css`, `frontend/utils/cover-transition.ts`, `frontend/tests/library-card.test.cjs`, `frontend/tests/book-loading.test.cjs`, and this handoff. The pre-existing `backend/library.db` modification is intentionally untouched.
`SEC-01` changes `backend/src/config/config.ts`, `backend/src/app.ts`, `backend/tests/helpers/test-env.ts`, `backend/tests/helpers/test-app.ts`, `backend/tests/auth.test.ts`, `backend/tests/config.test.ts`, `backend/package.json`, `README.md`, `docs/ENVIRONMENT_GOVERNANCE.md`, `PLAN.md`, and `PROGRESS.md`. The pre-existing `backend/library.db` modification is untouched. Frontend, dependencies, environment files, and production configuration are untouched.

`GOV-02` creates `docs/ENVIRONMENT_GOVERNANCE.md` and updates `README.md`, `PLAN.md`, and `PROGRESS.md`. The pre-existing modification to `backend/library.db` is intentionally untouched; no application, test, dependency, environment, or production configuration changes are part of this increment.

The migration commits listed above are already committed. The earlier migration handoff changed only `PROGRESS.md`; the pre-existing local modification to `backend/library.db` remains intentionally untouched.

The published-review follow-up changes `frontend/components/review-card.tsx`, `frontend/tests/review-functional.test.cjs`, and this handoff; pre-existing catalog work remains uncommitted.
The catalog presentation batch changes `frontend/app/globals.css`, `frontend/components/main.tsx`, `frontend/tests/library-card.test.cjs`, `frontend/tests/book-loading.test.cjs`, and this handoff. No backend files were changed by the batch.
UI-03.1 changes `frontend/app/book/[id]/page.tsx`, `frontend/app/globals.css`, and `frontend/tests/book-loading.test.cjs`; this closeout updates `PROGRESS.md`. Loading, error and retry flows, action handlers, review logic and API contracts remain unchanged. The pre-existing local modification to `backend/library.db` remains intentionally untouched.

UI-02.3 changes `frontend/components/reviews.tsx`, `frontend/components/review-card.tsx`, `frontend/app/globals.css`, and `frontend/tests/review-functional.test.cjs`; this closeout updates `PROGRESS.md`. Draft persistence, submission and recovery handlers and API contracts are untouched.

UI-02.2 changes `frontend/components/filters.tsx`, `frontend/app/globals.css`, and `frontend/tests/library-filters.test.cjs`; this closeout updates `PROGRESS.md`. The filter context and backend are untouched.

UI-02.1 changes `frontend/app/globals.css`, `frontend/components/card.tsx`, `frontend/components/home.tsx`, `frontend/components/main.tsx`, `frontend/components/navbar.tsx`, and `frontend/tests/library-card.test.cjs`; this closeout updates `PROGRESS.md`. The shared detail placeholder and backend are untouched.

The theme increment changes `DESIGN.md`, `README.md`, `PROGRESS.md`, `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/app/login/page.tsx`, `frontend/app/register/page.tsx`, `frontend/components/reviews.tsx`, `frontend/components/theme-switcher.tsx`, `frontend/context/theme.context.tsx`, `frontend/tailwind.config.ts`, and `frontend/tests/theme.test.cjs`. Backend code, dependencies, production configuration, and `backend/library.db` are intentionally untouched; the tracked database has a pre-existing local modification.

## Next recommended task

Further owner browser review, beyond the coverless edit observed above: with synthetic data and an isolated local database, trigger invalid cover validation, clear the field and verify the error clears and the title update succeeds; also verify whitespace-only input, existing URL preservation, and that clearing an existing URL does not remove the persisted cover. Do not treat this as completion of `TEST-02`.
Continue browser validation of the observer with synthetic accounts and isolated services, including suspended tabs, back-forward cache restoration, synthetic token expiry, deliberately missed channel delivery, and server-side revocation. Design a separate private-state exposure boundary before using the observer for filter retention; observer notifications alone do not guarantee that retained UI cannot flash or that all changes are detected.
Before any future deployment of `SEC-01`, obtain separate owner authorization to assess and, if needed, change the production secret securely and plan reauthentication; an absent or nonconforming secret will prevent startup. Production secret inspection, configuration changes, rotation, and deployment each require separate owner authorization; deployment settings and recovery remain unverified. Continue independently with the pending browser and isolation validation (`TEST-02` / `SEC-05`).

Browser-check the local cover-only View Transitions proof of concept using synthetic data and an isolated backend, including its non-animated fallback and unchanged navigation semantics. Complete the pending login and isolation browser checks before treating the authentication work as fully validated.

Independent follow-ups: evaluate ESLint 10 compatibility and the existing lint warnings; address remaining dependency security advisories; investigate optional cover/rating null-versus-undefined validation; and plan the login/register Archival Modern redesign with integrated recovery UI. These are separate from the cover-only proof of concept.

Review UI-03.2 with the owner: accessible naming refinements for icon-only actions, missing/failed/changed cover fallback behavior beyond the existing behavior, and additional action or error-state presentation refinements were deferred from UI-03.1. The shared debounce's rapid-cross-filter limitation remains a separately scoped issue. Later visual refinement should revisit card alignment. Retain Ant Design 5 provisionally and preserve all functional behavior, authentication, public registration, and multiuser isolation.

Nonblocking for starting design, but still required as applicable: browser-level authentication/deep-link/draft validation (`TEST-02`, `SEC-05`), CI (`TEST-04`), session/security decisions and remediation (`AUTH-01`, `SEC-01`–`SEC-03`, `SEC-06`–`SEC-07`), remaining dependency advisories (`UPG-02`), the pagination timestamp tie-breaker, production persistence/recovery, and release verification (`AUD-02`, `GOV-03`, `TEST-05`, `DB-06`–`DB-08`). These are not waived release gates. After the redesign is finalized, produce a polished GitHub/portfolio README with real screenshots, product overview, architecture, setup, and a demo; formal task assignment remains pending.

`UPG-03` remains open: its `UPG-01`, `TEST-02`, and `TEST-05` prerequisites, auth/route smoke evidence, and visual-regression acceptance remain incomplete; broader upgrade and release decisions are not implied by the local commits.

## Session handoff checklist

- [ ] Read `AGENTS.md` and this file first.
- [ ] Read only the relevant `PLAN.md` task row and applicable decisions; do not load the full roadmap by default.
- [ ] Confirm branch and worktree with `git status --short --branch`.
- [ ] Confirm the active task, dependencies, and acceptance criteria in `PLAN.md`.
- [ ] Check whether an owner decision blocks the task.
- [ ] Inspect only relevant files.
- [ ] Record exact validation commands and results.
- [ ] Update task status and this handoff only when file changes are authorized and useful.
- [ ] Do not commit, push, merge, deploy, or modify production data without explicit authorization.
- [ ] Never claim an unperformed check passed or assume a backup exists.
