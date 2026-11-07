# AGENTS.md — Biblioteca Personal

## Read order and context discipline

1. `AGENTS.md` — stable operating rules.
2. `PROGRESS.md` — current phase, active task, blockers, and verified state.
3. Only the relevant task row and applicable decision-log entries in `PLAN.md`.

Do not load the entire roadmap by default. Expand the `PLAN.md` section only when dependencies, acceptance criteria, or decisions require it. `PLAN.md` owns the roadmap; `PROGRESS.md` owns current state. Do not duplicate either here.

## Project and hosting

Biblioteca Personal (`read-group-challenge`) is a multiuser personal library application.

- **Frontend:** Next.js 14 App Router, React 18, TypeScript, Ant Design, Tailwind CSS, client-side services.
- **Backend:** Express 4, TypeScript, layered routes → middleware → controllers → models, raw SQL through `better-sqlite3`.
- **Data:** relative SQLite path `backend/library.db`; the file is currently tracked by Git.
- **Authentication:** email/password with bcrypt; six-hour JWT returned by the API and stored by the frontend in a JavaScript-readable `token` cookie, then sent as a Bearer token.
- **Product behavior:** public registration, login, private per-user collections, reviews, favorites, search/filtering, pagination, and per-book CSV export.

### Owner-confirmed deployment facts

- Vercel Production tracks `main`.
- Vercel Preview is configured for other branches.
- Render Free tracks `main` and has Auto-Deploy on commit.
- Render Free does not provide a persistent disk for this service.
- Actual production SQLite persistence and recovery have not been verified.

### Source-code findings

- `backend/library.db` is a relative-path database and is tracked by Git.
- The backend creates tables at module load with `CREATE TABLE IF NOT EXISTS`; there are no migrations.
- Frontend middleware matches only `/` and `/login`; `/book/*` is not covered.
- Review listing does not verify book ownership; review update relies on a client-supplied `bookId`.
- CORS is open, login has no rate limiting, and API error handling is inconsistent.
- There are no tests, test scripts, CI configuration, or backup procedure in the repository.
- README instructions are partially stale.

Treat every push or merge to `main` as a production deployment. A push can trigger both Vercel Production and Render Auto-Deploy.

Database provider, authentication and session architecture, upgrade targets, staging strategy, and the future public-registration policy are not approved.

## Repository navigation

- `backend/src/index.ts` — Express entry point and middleware.
- `backend/src/routes/` — HTTP routes.
- `backend/src/middlewares/` — authentication and Zod validation.
- `backend/src/controllers/` — request handling.
- `backend/src/models/` — SQL and persistence logic.
- `backend/src/config/` — environment configuration and database bootstrap.
- `backend/src/utils/`, `backend/src/types/` — schemas and types.
- `frontend/app/` — App Router pages.
- `frontend/components/` — UI components.
- `frontend/services/` — API clients.
- `frontend/context/`, `frontend/schemas/`, `frontend/utils/`, `frontend/types/` — state, validation, helpers, and types.
- `frontend/middleware.ts` — route middleware.
- `backend/library.db` — tracked SQLite data. Do not edit, replace, or delete it without explicit approval.

Use targeted search; do not scan the whole repository by default.

## Commands

No root package manifest exists. The README lists Node.js 22 and npm 10.

Frontend, from `frontend/`:

```bash
npm install
npm run dev
npm run lint
npm run build
npm run start
```

Backend, from `backend/`:

```bash
npm install
npm run build
npm start
```

There is no backend development script and no test script. Do not invent commands. If a check or script is absent, report that.

Do not run installs, builds, migrations, or deployments merely to orient yourself. Run only what the active task requires.

## Coding conventions

- Keep TypeScript strict; do not weaken configuration to hide errors.
- Preserve the backend layering. Put SQL in models, not controllers.
- Validate external input with Zod at the boundary. Use parameterized statements; never interpolate request values into SQL.
- Derive the acting user from the verified token, never from a body, query parameter, or client-supplied owner field.
- Preserve API response conventions unless a task explicitly standardizes them; update backend and frontend together.
- Use the App Router, `@/` alias, existing services, and Ant Design/Tailwind patterns. Mark interactive components with `'use client'`.
- Match local naming and formatting; avoid unrelated reformatting.
- Documentation, comments, commit messages, and agent responses are English. Spanish UI and API copy is product behavior unless a task changes it.
- Keep changes small and reviewable; do not combine security, database, and UI refactors.

## Security and privacy

These are required invariants. Current code does not satisfy all of them.

- Never expose secrets, tokens, cookies, passwords, connection strings, or private user data in code, logs, docs, issues, tests, or responses.
- Require an explicitly configured JWT secret. Do not rely on or reproduce a hardcoded fallback.
- Preserve multiuser registration, login, and per-user isolation. A change that weakens either is a release blocker.
- Public self-registration remains enabled until `PUB-01` records an approved policy change.
- Every book and review operation must enforce ownership from the verified token. Users must not read, update, delete, export, or infer another user's data.
- Review listing and mutation must verify the relationship between review, book, and acting user.
- Authentication endpoints require rate limiting.
- The frontend and API are cross-origin in production. Do not alter token transport, CORS, SameSite, cookie domain, or CSRF behavior without the `AUTH-01` decision and corresponding implementation. An HttpOnly-cookie migration is not assumed to be a drop-in change.
- Return validation errors without stack traces, SQL, internal paths, or account-existence details.
- Use synthetic fixtures. Never copy production data into tests, logs, screenshots, or issues.
- Do not add a dependency, hosted service, or paid tier without an approved plan task and confirmation that the $0 constraint still holds.

## Production and Git safety

Without explicit written authorization for the specific action, do not:

- commit, amend, push, force-push, merge, rebase shared branches, create or delete remote branches, or open/merge pull requests;
- deploy, redeploy, roll back, or change Vercel, Render, DNS, environment, or CI/CD settings;
- access production services, logs, databases, or secret stores;
- run migrations against shared or production data;
- run destructive database operations, resets, bulk deletes, or delete `backend/library.db`;
- delete production data, even if described as disposable;
- hard-reset or clean the worktree in a way that discards user changes.

A push or merge to `main` is a production action because Render Auto-Deploy is enabled. Never force-push. Never assume a backup exists. Preserve the current production deployment until a replacement passes staging validation and the owner approves cutover.

If a request conflicts with these rules, stop and report the conflict.

## Testing and validation

- No automated suite exists yet; `TEST-01` and `TEST-02` introduce harnesses.
- Run relevant frontend lint/build/tests and backend build/tests for every code change.
- Authentication, authorization, database, and export changes require tests for unauthorized and cross-user cases.
- Validate registration, login, invalid/expired tokens, own-data CRUD, denial of another user's data, reviews, favorites, filtering, pagination, and CSV.
- Report exact commands and results. If a check was not run, say so.
- Do not mark a task complete without evidence against its acceptance criteria.

## Documentation rules

- A read-only session must not create or modify any file, including `PLAN.md` and `PROGRESS.md`.
- Planning and implementation sessions update `PLAN.md` and `PROGRESS.md` only when file changes are authorized and the update is useful.
- Use task IDs exactly as written. Do not renumber or reuse them.
- Record owner decisions in the `PLAN.md` decision log. Never move a proposal to approved without explicit confirmation.
- Keep `AGENTS.md` stable and operational; put roadmap detail in `PLAN.md`.
- Update `README.md` when behavior, commands, or architecture change. Do not leave known-false instructions in place.

## Token-efficient working practices

- Start from `PROGRESS.md` and the relevant `PLAN.md` task and decisions; read only necessary files.
- Use `rg` for symbols and `git diff`/`git status` for local state.
- Avoid full-repository scans unless explicitly required.
- Summarize evidence with paths and line ranges; do not paste large outputs.
- Stop investigating when acceptance criteria can be evaluated.
- Prefer the smallest correct change. Do not perform opportunistic refactors.
- If an owner decision blocks progress, state the options and stop instead of guessing.

## Session protocol

### Start

1. Run `git status --short --branch`; confirm branch and worktree state.
2. Read `PROGRESS.md`.
3. Identify the active task, dependencies, and acceptance criteria in `PLAN.md`.
4. Check whether an owner decision blocks the task.
5. Inspect only relevant files.
6. For non-trivial work, state the intended steps and validation before editing.
7. Do not develop on `main` or modify production configuration.

### Execute

1. Stay within task scope.
2. Preserve existing behavior unless the task changes it.
3. Make small, reversible edits.
4. Run relevant checks and record results.
5. Update task status and handoff only when authorized and useful.
6. Do not commit, push, merge, deploy, or mutate shared data without explicit authorization.

### Handoff

1. Update `PROGRESS.md` with current phase, active task, completed work, verification evidence, and blockers.
2. List changed and intentionally untouched files.
3. State the next recommended task and required owner decisions.
4. Leave the worktree clear; explain any uncommitted or generated files.
5. Never claim verification that was not performed.
