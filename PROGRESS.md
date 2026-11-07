# Progress — Biblioteca Personal

**Last updated:** 2026-11-07
**Current phase:** Phase 1 — Tests, CI, and repeatable validation
**Active task:** None — `TEST-01` complete; `SEC-04` not started
**Branch:** `modernization`
**Production:** Not accessed or changed.

## Completed

| ID | Result |
|---|---|
| `DISC-01` | Initial project discovery completed through selective static review. |
| `AUD-01` | Static security audit completed; findings mapped to remediation tasks. |
| `DOC-01` | `AGENTS.md`, `PLAN.md`, and `PROGRESS.md` written and verified on 2026-11-07. |
| `TEST-01` | Backend test harness and initial authentication and ownership tests implemented and locally validated. |

No migration, upgrade, or deployment work has been completed.

## Verified source-code findings

- Frontend: Next.js 14.2.18, React 18, TypeScript, App Router, Ant Design, Tailwind CSS.
- Backend: Express 4, TypeScript, Zod, bcrypt, JWT, and `better-sqlite3`.
- SQLite uses relative path `library.db`; `backend/library.db` is tracked by Git.
- Schema creation occurs at module load; no migrations exist.
- Authentication uses a six-hour JWT in a JavaScript-readable `token` cookie, sent as a Bearer token.
- Middleware matches only `/` and `/login`; `/book/*` is unprotected.
- Review listing does not verify book ownership; review update trusts a client-supplied `bookId`.
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
- `npm run test:security`, from `backend/`, exited non-zero as expected: three probes reproduced existing authorization weaknesses. P1: cross-user review listing returned HTTP 200; P2: cross-user review creation returned HTTP 201; P3: updating a review associated with a foreign-owned book in a synthetically constructed inconsistent ownership state returned HTTP 200.
- Tests use temporary SQLite databases and synthetic authentication data. Test helpers compute and compare SHA-256 hashes of `backend/library.db` during normal test execution; no independent pre-implementation hash was verified.
- `git diff --check` passed during TEST-01 validation. The full isolation regression suite and CI remain pending; these probes do not establish that all isolation vulnerabilities have been discovered or fixed.
- Production was not tested or accessed; no backup or recoverable production SQLite state is assumed.
- No commit, push, merge, or deployment occurred.

## Files changed

Documentation closeout modified:
- `PLAN.md`
- `PROGRESS.md`

Pre-existing uncommitted TEST-01 changes include `README.md`, backend package files, backend source/configuration, and `backend/tests/`. This closeout does not modify those files, `AGENTS.md`, or the database.

## Next recommended task

`SEC-04` — enforce review and book ownership; `TEST-01` is complete. Do not begin without a new instruction. `TEST-03` and `TEST-04` remain pending; production verification under `AUD-02` remains subject to authorization and non-destructive safeguards.

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
