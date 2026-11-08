# Progress — Biblioteca Personal

**Last updated:** 2026-11-08
**Current phase:** UX/UI redesign — authorized to begin; not a production-release or security approval.
**Active task:** Establish the UX/UI redesign scope; a formal roadmap task ID and any required owner decisions remain pending. `TEST-02` / `SEC-05` remain incomplete and `SEC-03` remains partial.
**Branch:** `modernization`
**Production:** Not accessed or changed.

## Completed

| ID | Result |
|---|---|
| `DISC-01` | Initial project discovery completed through selective static review. |
| `AUD-01` | Static security audit completed; findings mapped to remediation tasks. |
| `DOC-01` | `AGENTS.md`, `PLAN.md`, and `PROGRESS.md` written and verified on 2026-11-07. |
| `TEST-01` | Backend test harness and initial authentication and ownership tests implemented and locally validated. |
| `SEC-04` | Review and book ownership enforced and locally validated with A/B regression tests and security probes. |
| `TEST-03` | Authentication and multiuser regression coverage expanded and a representative isolation regression detected in a temporary copy. |

No migration or deployment work has been completed. A limited backend dependency security refresh is locally validated; it does not complete `UPG-02`.

Functional modernization handoff: the locally committed FIX-02 work comprises A (public authentication API errors, `c58e2b7`), B1 (book loading and error states, `b7112d1`), B2 (book mutation failures, `09178af`), B3 (book actions and CSV error handling, `25ecbd4`), and C (review reliability and recovery, `3216355`). FIX-02 is a work label, not an existing formal PLAN task ID.

## Verified source-code findings

- Frontend: Next.js 14.2.18, React 18, TypeScript, App Router, Ant Design, Tailwind CSS.
- Backend: Express 4, TypeScript, Zod, bcrypt, JWT, and `better-sqlite3`.
- SQLite uses relative path `library.db`; `backend/library.db` is tracked by Git.
- Schema creation occurs at module load; no migrations exist.
- Authentication uses a six-hour JWT in a JavaScript-readable `token` cookie, sent as a Bearer token.
- Middleware covers `/` and `/book/*`; public authentication routes remain accessible. JWT claims are decoded only for navigation and expiry; API verification remains authoritative.
- Review listing requires book ownership and filters reviews by owner. Creation, update, and deletion use token-derived identity and enforce the stored book relationship; inaccessible resources return a generic 404.
- Existing inconsistent review records are hidden and cannot be mutated through review endpoints; they are not repaired or deleted by SEC-04.
- CORS is open; authentication has local per-account rate limits and opt-in direct-peer IP limits; error handling is inconsistent.
- JWT configuration includes a hardcoded fallback secret.
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

This documentation-only handoff changes `README.md`, `PLAN.md`, and `PROGRESS.md`. Application code, dependencies, configuration, and `backend/library.db` are intentionally untouched; the tracked database has a pre-existing local modification.

## Next recommended task

Begin UX/UI redesign planning in the established direction: a modern minimalist editorial personal library with strong book covers, responsive mobile-first layouts, consistent navigation and forms, accessibility, and light/dark themes. Retain Ant Design 5 provisionally; evaluate token customization and selective replacement rather than an automatic full migration. Preserve all functional behavior, authentication, public registration, and multiuser isolation.

Nonblocking for starting design, but still required as applicable: browser-level authentication/deep-link/draft validation (`TEST-02`, `SEC-05`), CI (`TEST-04`), session/security decisions and remediation (`AUTH-01`, `SEC-01`–`SEC-03`, `SEC-06`–`SEC-07`), remaining dependency advisories (`UPG-02`), the pagination timestamp tie-breaker, production persistence/recovery, and release verification (`AUD-02`, `GOV-03`, `TEST-05`, `DB-06`–`DB-08`). These are not waived release gates. After the redesign is finalized, produce a polished GitHub/portfolio README with real screenshots, product overview, architecture, setup, and a demo; formal task assignment remains pending.

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
