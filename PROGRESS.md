# Progress — Biblioteca Personal

**Last updated:** 2026-11-07
**Current phase:** Phase 1 — Tests, CI, and repeatable validation
**Active task:** None — `TEST-03` complete locally
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

No migration, upgrade, or deployment work has been completed.

## Verified source-code findings

- Frontend: Next.js 14.2.18, React 18, TypeScript, App Router, Ant Design, Tailwind CSS.
- Backend: Express 4, TypeScript, Zod, bcrypt, JWT, and `better-sqlite3`.
- SQLite uses relative path `library.db`; `backend/library.db` is tracked by Git.
- Schema creation occurs at module load; no migrations exist.
- Authentication uses a six-hour JWT in a JavaScript-readable `token` cookie, sent as a Bearer token.
- Middleware matches only `/` and `/login`; `/book/*` is unprotected.
- Review listing requires book ownership and filters reviews by owner. Creation, update, and deletion use token-derived identity and enforce the stored book relationship; inaccessible resources return a generic 404.
- Existing inconsistent review records are hidden and cannot be mutated through review endpoints; they are not repaired or deleted by SEC-04.
- CORS is open; no login rate limiting; error handling is inconsistent.
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
| Upgrade targets not approved | Blocks `UPG-02`, `UPG-03`, and `UPG-04`. |
| Staging strategy not approved | Blocks `DB-06` and production validation. |
| Public registration policy not finalized | No immediate blocker; registration remains unchanged until `PUB-01`. |

## Latest validation status

- Prior DOC-01 validation consisted of read-only inspection and Git checks; no build or tests were run then.
- TEST-01 local validation used Node.js 22: `npm run build` passed and `npm test` passed all 26 tests, from `backend/`.
- Before SEC-04, the security probes reproduced cross-user listing (200), cross-user creation (201), and updating a review owned by the caller but attached to another user's book in a synthetic inconsistent state (200).
- SEC-04 validation from `backend/` used Node.js v22.23.4: `fnm exec --using 22 npm run build` passed, `fnm exec --using 22 npm test` passed 32/32 tests, and `fnm exec --using 22 npm run test:security` passed all 3 probes. Tests were not rerun after documentation and comment-only closeout edits.
- Tests use isolated temporary SQLite databases and synthetic data; their hash guards passed. Independent SHA-256 checks before and after SEC-04 validation confirmed `backend/library.db` was unchanged.
- TEST-03 validation under Node.js v22.23.4: `fnm exec --using 22 npm run build` passed, `fnm exec --using 22 npm test` passed 37/37, and `fnm exec --using 22 npm run test:security` passed 3/3. The filtered-list test passed unchanged and failed as expected when the owner predicate was removed in a temporary backend copy. This demonstrates one representative regression, not exhaustive security coverage. CI remains pending.
- TEST-03 filter fixtures use partially overlapping attributes and distinct synthetic timestamps for deterministic pagination tests. Production pagination still has no tie-breaker when books share `createdAt`; this task does not change that behavior.
- Production was not tested or accessed; no backup or recoverable production SQLite state is assumed.
- No push, merge, deployment, or production access occurred.

## Files changed

TEST-03 changes include `backend/package.json`, `backend/tests/books.ownership.test.ts`, `backend/tests/books.filters-pagination.test.ts`, `backend/tests/books.export.test.ts`, `backend/tests/reviews.ownership.test.ts`, `PLAN.md`, and `PROGRESS.md`. `backend/library.db`, application logic, production configuration, and frontend files were not modified.

## Next recommended task

`TEST-04` — add CI checks, subject to a new instruction. Production verification under `AUD-02` remains subject to authorization and non-destructive safeguards.

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
