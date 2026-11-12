# Modernization Plan — Biblioteca Personal

**Status:** Active
**Last updated:** 2026-11-09
**Owner:** Repository owner
**Scope:** Incremental modernization of the existing Next.js/Express application.

## 1. How to use this plan

Task IDs are stable. Work only on tasks whose dependencies are satisfied and whose owner decisions are approved.

Status:

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
- `[!]` Blocked

Priority:

- **P0** — Required before a production database cutover or before relying on the application for real user data.
- **P1** — Required for a maintainable, documented, upgradeable baseline.
- **P2** — Optional; schedule only after P0/P1 work is stable.

Definition of done:

- Acceptance criteria are met and evidenced.
- Relevant lint, build, and test checks pass.
- Multiuser isolation and public registration remain intact unless an approved policy changes registration.
- Documentation and task statuses are updated when authorized.
- Production-affecting changes have a documented rollback path.

## 2. Goals, constraints, and scope

### Goals

1. Preserve existing functionality, especially registration, login, and per-user data isolation.
2. Replace non-durable production SQLite storage with an approved hosted PostgreSQL option at approximately $0/month.
3. Close high-risk authentication and authorization gaps before storing real user data.
4. Establish automated regression coverage and CI.
5. Modernize dependencies and documentation incrementally.

### Constraints

- Hosting must remain approximately $0/month, including free-tier pauses, quotas, and overages.
- The current production deployment remains available until a replacement is validated.
- Public self-registration remains enabled until `PUB-01` records an approved policy change.
- Authentication/session architecture, upgrade targets, and staging strategy require owner approval; the owner selected Neon PostgreSQL under `D-015`.
- Demo records, including current production demo data, may be discarded. Nothing is deleted without explicit approval.
- No production backup or recovery capability is assumed.
- Documentation, agent instructions, and agent responses are English.
- Existing Spanish UI copy is preserved unless a task changes it.
- Prefer small, independently verifiable changes over a rewrite.

### Non-goals

- Rewriting the application in a new framework.
- Selecting a database vendor, authentication vendor, or framework version in this plan.
- Migrating SQLite records to PostgreSQL. The approved approach starts with a fresh database.
- Adding major features before security, persistence, and test foundations are stable.
- Removing or restricting public registration by assumption.
- Moving to paid infrastructure.
- Deleting production or repository data during planning.
- Repeating exhaustive audits every session.

## 3. Current baseline

### Source-code findings

Historical baseline verified through selective static review on 2026-11-06; later changes and current validation are recorded in `PROGRESS.md`.

| Area | Current state |
|---|---|
| Frontend | Next.js 14.2.18, React 18, TypeScript, App Router, Ant Design, Tailwind CSS. |
| Backend | Express 4.22.x, TypeScript 5.7.x, layered architecture, Zod validation, raw SQL. |
| Data | `better-sqlite3` using relative path `library.db`; `backend/library.db` is tracked by Git. Tables are created at module load; no migrations exist. |
| Authentication | bcrypt; six-hour JWT; token stored in a JavaScript-readable `token` cookie and sent as a Bearer token. |
| Authorization | Book queries are generally scoped by `userId`. Review listing does not verify book ownership; review update trusts a client-supplied `bookId`. |
| Frontend protection | Middleware matches only `/` and `/login`; `/book/*` is not covered. |
| Security | Hardcoded fallback JWT secret, client-readable token, incorrect cookie expiry handling, no login rate limiting, open CORS, inconsistent errors. |
| Quality | No tests, test scripts, CI, migrations, or backup procedure found. |
| Repository | `modernization` currently points at the same commit as `main`; the worktree was clean during review. |

### Owner-confirmed deployment facts

- Vercel Production tracks `main`.
- Vercel Preview is configured for other branches.
- Render Free tracks `main` with Auto-Deploy on commit.
- Render Free does not provide a persistent disk for this service.
- Actual production SQLite persistence and recovery have not been verified.

### Verification status

- `DISC-01` — Initial project discovery: completed.
- `AUD-01` — Static security audit: completed.
- `AUD-02` — Runtime and production verification: pending.

Initial findings were static; TEST-01 has since verified selected behavior locally with synthetic data. Production runtime behavior, hosting access, free-tier limits, dependency vulnerability status, and recovery procedures remain unverified.

## 4. Risks and prerequisites

| Risk | Impact | Mitigation |
|---|---|---|
| SQLite on Render Free has no persistent disk and recovery is unverified | Data loss; no reliable rollback of old data | `AUD-02`, `DB-03` through `DB-08` |
| Fallback JWT secret and JavaScript-readable token | Account takeover, session theft | `GOV-02`, `SEC-01`, `AUTH-01`, `SEC-02` |
| Authentication transport is cross-origin | Cookie, CORS, SameSite, and CSRF mistakes can break login or weaken security | `AUTH-01`, `SEC-02`, `SEC-06` |
| Cross-user review access | Privacy breach, unauthorized mutation | `SEC-04`, `TEST-03` |
| No login rate limiting | Brute force and credential stuffing | `SEC-03` |
| Incomplete frontend protection | Unauthenticated access to private screens | `SEC-05` |
| Open CORS and inconsistent errors | Expanded attack surface, information leakage | `SEC-06`, `SEC-07` |
| Incomplete test coverage and no CI | Silent regressions during migration and upgrades | `TEST-02` through `TEST-04` |
| Render Auto-Deploy from `main` | Accidental production release | `GOV-01`, `GOV-03` |
| Free-tier limits or unexpected cost | Outage or budget breach | `DB-01`, `DB-02`, `DB-06` |
| Legacy dependencies | Failed upgrades or security exposure | `UPG-01` through `UPG-05` |

Prerequisites:

- Owner approval of database provider, authentication/session architecture, staging model, and upgrade targets before dependent implementation.
- A non-production environment for integration and recovery validation.
- Confirmation that selected services remain within approximately $0/month.
- Explicit authorization before production, destructive, or secret-related actions.

## 5. Milestones and tasks

### M0 — Baseline, governance, and production protection

| ID | Task | P | Status | Depends on | Deliverable | Acceptance criteria |
|---|---|---|---|---|---|---|
| `DISC-01` | Initial project discovery | P0 | `[x]` | — | Verified architecture and repository map | Completed via selective static review; no runtime claims |
| `AUD-01` | Static security audit | P0 | `[x]` | — | Findings mapped to remediation tasks | Completed statically; runtime and production checks marked pending |
| `AUD-02` | Runtime and production verification | P0 | `[ ]` | — | Verified runtime and deployment baseline | Registration, login, CRUD, reviews, favorites, filters, CSV, and cross-user denial tested; persistence checked only with owner-approved disposable data; no secrets or destructive production actions; environment and date recorded |
| `DOC-01` | Author and refine planning documents | P1 | `[x]` | — | `AGENTS.md`, `PLAN.md`, `PROGRESS.md` | Owner approved content; all three files created and verified on 2026-11-07; no implementation claimed |
| `GOV-01` | Document production guardrails | P0 | `[ ]` | — | Written branch-to-environment and deployment procedure | Confirms Vercel Production/Preview and Render Auto-Deploy behavior; any `main` push is treated as production; authorization and rollback steps documented |
| `GOV-02` | Inventory environment variables and rotation | P0 | `[x]` | — | Variable names, owners, and rotation procedure by service | No secret values recorded; all services covered; rotation and revocation steps documented. Evidence: `docs/ENVIRONMENT_GOVERNANCE.md`; deployed settings remain unverified |
| `GOV-03` | Create recovery and rollback runbook | P0 | `[ ]` | `GOV-01`, `GOV-02` | Operational runbook for application, environment, and new database recovery | Distinguishes verified capability from assumptions; states current SQLite recovery is unverified; covers app rollback, fresh-database restore, and decision authority; no destructive production test |
| `GOV-04` | Decide staging strategy | P0 | `[ ]` | — | Owner-approved staging ADR | Topology, access control, data policy, validation scope, and $0 feasibility documented; synthetic data only |

### M1 — Tests, CI, and repeatable validation

| ID | Task | P | Status | Depends on | Deliverable | Acceptance criteria |
|---|---|---|---|---|---|---|
| `TEST-01` | Add backend test harness | P0 | `[x]` | — | Test runner, scripts, and initial route/middleware tests | Runs locally without production services; authentication and one ownership route covered; isolated test database |
| `TEST-02` | Add frontend test harness | P1 | `[x]` | — | Component/route test setup and scripts | Runs in CI; cookie/token helpers and protected-route behavior covered. Frontend tests passed in the hosted pull-request CI run recorded under `TEST-04`; local route tests and owner-reported browser observations are recorded in `PROGRESS.md`. |
| `TEST-03` | Add authentication and isolation regression suite | P0 | `[x]` | `TEST-01` | Automated multiuser regression suite | Registration, login, invalid/expired token, own-data CRUD, cross-user denial, reviews, favorites, filters, pagination, and CSV covered; suite fails on isolation regressions |
| `TEST-04` | Add CI checks | P0 | `[x]` | `TEST-01` | Pull-request workflow | Backend tests/build and frontend lint/build run on pull requests; frontend tests added when `TEST-02` lands; no deployment secrets exposed. Evidence: successful [pull-request CI run](https://github.com/JoseAMota11/readstack/actions/runs/43068633604) at `e1b11fd` |
| `TEST-05` | Create release smoke checklist | P1 | `[ ]` | `GOV-01`, `TEST-03` | Repeatable smoke procedure | Covers login/registration, CRUD, reviews, favorites, filters, CSV, and cross-user denial; executable with recorded evidence |

### M2 — Security and access-control stabilization

| ID | Task | P | Status | Depends on | Deliverable | Acceptance criteria |
|---|---|---|---|---|---|---|
| `AUTH-01` | Decide authentication and session architecture | P0 | `[ ]` | `AUD-01` | Owner-approved ADR | Evaluates the current Vercel-to-Render cross-origin model and at minimum: hardened JWT/Bearer, server-issued sessions, and a managed provider. Covers token transport and storage, cookie domain and SameSite, CORS credentials, CSRF, logout/revocation, XSS exposure, user migration, registration control, free-tier cost, lock-in, and operational effort. Does not assume HttpOnly cookies are a drop-in change; no vendor selected by the agent |
| `SEC-01` | Require an explicit JWT secret | P0 | `[x]` | `GOV-02` | Fail-fast configuration and tests | Startup requires exactly 64 hex characters in all environments, with no fallback or secret in errors; local Node 22 build and regression checks passed. Secure random generation and uniqueness require operational controls; deployed configuration remains unverified |
| `SEC-02` | Implement approved authentication and session transport | P0 | `[ ]` | `AUTH-01`, `SEC-01` | Implemented transport, session lifecycle, and CSRF controls | Selected architecture works end-to-end across Vercel and Render origins; logout, expiry, invalid-token handling, and CSRF controls as applicable; unauthorized flows return consistent 401 responses; isolation tests pass |
| `SEC-03` | Rate-limit authentication endpoints | P0 | `[ ]` | `TEST-01` | Login and registration rate limiting | Per-IP and per-account thresholds, 429 with retry guidance, no account enumeration, tests, and documented single-instance limitations. Partially implemented locally: account limits enabled; IP limits are opt-in pending verified client-IP strategy for Render; existing duplicate-registration 409 discloses account existence. |
| `SEC-04` | Enforce review and book ownership | P0 | `[x]` | `TEST-01` | Scoped review queries and mutation authorization | Listing requires book ownership or an approved sharing policy; update/delete derive ownership from the token and server-side records; foreign identifiers return 403 or 404; A/B isolation tests pass |
| `SEC-05` | Complete frontend route protection | P0 | `[x]` | `TEST-02` | Correct middleware and route policy | All private routes, including `/book/*`, require authentication; `/login` and `/register` remain public; deep links and login redirects behave correctly. Local automated tests and owner-reported browser validation are recorded in `PROGRESS.md`; API authorization remains authoritative. |
| `SEC-06` | Restrict CORS | P1 | `[ ]` | `AUTH-01`, `TEST-01` | Environment-driven allowlist consistent with the approved transport | Local origins are explicit; production rejects unlisted origins; credentials are allowed only as approved; wildcard with credentials prohibited; preflight tests pass |
| `SEC-07` | Standardize API error handling | P1 | `[ ]` | `TEST-01` | Central error middleware and documented response shape | Validation, authentication, authorization, not-found, conflict, and server errors are consistent; no stack traces or internal details; frontend remains compatible |
| `SEC-08` | Add security headers and request limits | P2 | `[ ]` | `SEC-06`, `SEC-07` | Header and body-size hardening | Standard security headers present; oversized JSON rejected; `X-Powered-By` removed if applicable; no functional regression |
| `PUB-01` | Decide public registration policy | P1 | `[ ]` | — | Owner-approved access-policy ADR | Options and privacy/abuse implications documented; open registration remains unchanged until approval; follow-up implementation task created only after a decision |

### M3 — Fresh PostgreSQL migration

The approved approach starts with a fresh database. Existing demo records are not migrated.

| ID | Task | P | Status | Depends on | Deliverable | Acceptance criteria |
|---|---|---|---|---|---|---|
| `DB-01` | Evaluate hosted PostgreSQL providers | P0 | `[x]` | — | Comparison matrix for Supabase and Neon, plus any owner-supplied option | Current free-tier terms cited; persistence, pausing, backups/restore, connection limits, pooling, region, SSL, quotas, operational effort, and $0 feasibility compared; no vendor selected during evaluation |
| `DB-02` | Record database provider decision | P0 | `[x]` | `DB-01` | Owner-approved provider ADR | Decision, rationale, rejected options, migration implications, and rollback limitations documented; implementation waits for approval |
| `DB-03` | Create fresh schema and migrations | P0 | `[x]` | `DB-02` | Versioned migrations and schema foundation, including runner-level ledger validation | Empty database initializes from migrations; users, books, reviews, foreign keys, indexes, timestamps, and genre representation are correct; reset and rollback behavior documented; no record migration. Qualified acceptance is recorded in `PROGRESS.md`; this is not production readiness |
| `DB-04` | Refactor database configuration and access | P0 | `[ ]` | `DB-03` | Provider-compatible connection/configuration layer and fail-closed application startup schema readiness | No relative SQLite path in the production path; connection settings come from environment variables; startup fails clearly on invalid configuration and fails closed when schema readiness is not established; secrets are not logged; model boundaries remain intact |
| `DB-05` | Add synthetic fixtures and clean initialization checks | P0 | `[ ]` | `DB-03`, `DB-04` | Deterministic fixture and reset procedure | Empty database can be initialized and seeded with two synthetic users, books, reviews, and favorites; reset is repeatable; no real or production data |
| `DB-06` | Run PostgreSQL integration validation in staging | P0 | `[ ]` | `DB-04`, `DB-05`, `TEST-03`, `TEST-05`, `GOV-04` | Staging integration report | Full functional smoke and multiuser isolation pass; reviews, favorites, filters, pagination, CSV, and authentication verified; latency and free-tier limits acceptable; cost remains approximately $0 |
| `DB-07` | Verify backup and restore for the new database | P0 | `[ ]` | `DB-06` | Tested recovery procedure | Provider backup/restore or documented alternative restores into a separate database; synthetic data verified; recovery-point and recovery-time limits documented, including free-tier constraints; no production destructive test |
| `DB-08` | Cut over production to a fresh PostgreSQL database | P0 | `[ ]` | `DB-06`, `DB-07`, `GOV-03`, `SEC-01`, `SEC-02`, `SEC-03`, `SEC-04`, `SEC-05`, `SEC-06` | Executed cutover with evidence | Owner confirms demo data is disposable; fresh schema initialized; no SQLite records migrated; environment switched; smoke tests pass; previous deployment retained; no data deleted; rollback limitations documented because current SQLite recovery is unverified; no backup assumed |
| `DB-09` | Decommission SQLite | P2 | `[ ]` | `DB-08`, agreed observation period | Removed legacy dependency and tracked data file | Owner approves removal; no remaining reliance on SQLite; README, environment docs, and tests updated; no claim of recoverability for deleted demo data |

#### `DB-01` provider comparison

Two read-only investigations compared the options below. Provider documentation was retrieved on 2026-11-12; terms may change and published features are not operational validation. The evaluation did not select a vendor; the owner made the separate `DB-02` decision afterward.

| Criterion | Neon Free | Supabase Free |
|---|---|---|
| Persistence and quotas | Managed PostgreSQL; published 100 projects, 1 GB per project and 20 GB account total, 100 CU-hours and 5 GB egress per project per month, up to 10 branches per project; compute suspends on compute or egress exhaustion and storage limits can block writes. | Managed PostgreSQL; published two active projects, 500 MB database per project and 5 GB egress; Nano has shared CPU and up to 0.5 GB RAM. See [Neon plans](https://neon.com/docs/introduction/plans) and [Supabase pricing](https://supabase.com/pricing). |
| Idle behavior and compute | Neon Free scales compute to zero after five idle minutes, with up to 2 CU; it does not pause projects merely for inactivity. See [Neon plans](https://neon.com/docs/introduction/plans). | Supabase Free projects may pause after one week of inactivity. See [Supabase pricing](https://supabase.com/pricing) and [compute](https://supabase.com/docs/guides/platform/compute-and-disk). Actual wake-up and workload behavior remain untested for both. |
| Recovery | Neon documents a six-hour history window capped at 1 GB and Free instant restore in its [plans](https://neon.com/docs/introduction/plans) and [history](https://neon.com/docs/postgres/backup-restore/history-window) documentation, but its [pricing table](https://neon.com/pricing) marks instant restore unavailable on Free. This discrepancy remains unresolved; do not rely on the feature until confirmed and tested. Independent [Neon dumps](https://neon.com/docs/manage/backup-pg-dump) are documented. | Automatic backups and PITR are not included on Free; Supabase recommends [off-site exports](https://supabase.com/docs/guides/platform/backups). Neither provider's published recovery features replace independent, protected backups and a tested restore into a separate database. |
| Connections and pooling | At 0.25 CU Neon documents 112 database connections, seven reserved, and up to 10,000 pooler clients, not simultaneous database queries. Its transaction pooler has session-state restrictions; use direct connections for dumps and migrations. | Supabase documents Nano limits of 60 database connections, 200 pooler clients, and default pool size 15; platform services also consume connections. Its IPv4 shared pooler offers session and transaction modes, with transaction-mode restrictions. See [Neon pooling](https://neon.com/docs/connect/connection-pooling), [Supabase limits](https://supabase.com/docs/guides/platform/compute-and-disk), and [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres). |
| Regions and TLS | Neon lists regions geographically matching Render's Oregon, Ohio, Virginia, Frankfurt and Singapore options and documents full TLS verification. See [Neon regions](https://neon.com/docs/introduction/regions) and [TLS](https://neon.com/docs/connect/connect-securely). | Supabase lists matching regions and documents full TLS verification; see [regions](https://supabase.com/docs/guides/platform/regions) and [connections](https://supabase.com/docs/guides/database/connecting-to-postgres). For both, require client certificate-chain and hostname verification; actual [Render](https://render.com/docs/regions) region, latency and endpoint reachability are unverified. |
| Effort and cost | Both require asynchronous backend access, SQL and schema conversion, versioned migrations, isolation regression tests, and operated backups. Neon allows separate free projects for synthetic development and staging plus eventual production. | Supabase's two-active-project limit favors local development plus separate staging and production. Approximately $0 is plausible for low intermittent usage, not verified or guaranteed for either provider once staging, backups, egress and Render usage are included. [Render Free](https://render.com/docs/free) shares instance hours across the workspace, so staging could affect the existing service. |

`DB-01` assesses documented options, not production readiness. Reconfirm changing terms, the Neon restore discrepancy, actual Render region and IPv4/IPv6 connectivity, TLS hostname verification, pooling, quotas, staging costs, backup and separate-database restore before relying on them. Approval of a staging strategy and `DB-06`–`DB-08` remain separate gates.

#### `DB-02` provider decision — `D-015`

The owner selected **Neon PostgreSQL** on 2026-11-12. It offers focused managed PostgreSQL, transferable PostgreSQL learning, and published project isolation and free allowances that appear suitable for low intermittent use. Its $0 feasibility for the full application and recovery workflow is not established. Supabase PostgreSQL was evaluated but not selected: it offers a broader platform that this database-only change does not require, and its two active Free projects and lack of Free automatic backups make the proposed isolated environments and recovery operations less convenient. These are tradeoffs, not a claim that Supabase is unsuitable.

Under `D-009`, the target starts with a fresh schema: existing Beta accounts, books, reviews and other SQLite records will not automatically transfer. This can require users to register again and loses continuity of their existing collections; any different data-transfer proposal requires a separate owner decision and an approved backup and recovery procedure. Synchronous SQLite access and SQL must eventually be redesigned for asynchronous PostgreSQL while preserving authentication, API behavior and user isolation. Selection authorizes architecture design only; it does not authorize provisioning, implementation or deployment.

Application rollback and data recovery are distinct. Current production SQLite persistence and recovery are unverified, and no backup is assumed. Rolling application code back after PostgreSQL accepts writes does not restore old SQLite records or carry new writes back. Define ownership, write handling and rollback limitations in `GOV-03`, test independent backup and restore under `DB-07`, and satisfy all `DB-08` gates before any separately authorized cutover. Do not delete old data or the tracked SQLite file without separate approval.

#### `DB-03` schema and migration design — `D-022`

The owner approved the book product scope in `D-021` and the technical decisions below in `D-022`. These approvals do not themselves authorize implementation, provisioning, migrations, or deployment. `DB-03` has qualified acceptance for the schema and migration foundation, not PostgreSQL production readiness; see `PROGRESS.md`. Under `D-009` the database starts fresh; no SQLite records are transferred.

- The owner approved the following initial PostgreSQL schema specification; approval is not implementation or validation. All columns are `NOT NULL` unless marked nullable. Each table has an application-generated `uuid` primary key `id` with no database UUID default.
  - `users`: `id uuid`; `username text`; `email text` with `C` collation and case-sensitive uniqueness; `password text`; `created_at timestamptz` default `CURRENT_TIMESTAMP`.
  - `books`: `id uuid`; `user_id uuid`; `title text`; `author text`; `year integer`; `genre jsonb` with a `CHECK` requiring a JSON array; `cover_image text NULL`; `rating double precision NULL`; `is_favorite boolean` default `false`; `description text NULL`; `reading_status text` default `'pending'` with a `CHECK` allowing `pending`, `reading`, `finished`, and `abandoned`; `created_at timestamptz` and `updated_at timestamptz`, each default `CURRENT_TIMESTAMP`. `updated_at` remains insertion-only, without an update trigger.
  - `reviews`: `id uuid`; `book_id uuid`; `user_id uuid`; `rating integer` with a `CHECK` allowing 0 through 5 inclusive; `comment text`; `created_at timestamptz` default `CURRENT_TIMESTAMP`.
  - `books.user_id` references `users.id` with `ON DELETE CASCADE`; books have `UNIQUE (id, user_id)`. Reviews have a composite foreign key `(book_id, user_id)` referencing `books (id, user_id)` with `ON DELETE CASCADE`, preserving the review-to-user relationship through the book.
  - Owner-scoped listing indexes are `books (user_id, created_at DESC, id DESC)` and `reviews (book_id, user_id, created_at DESC, id DESC)`.
- A text check rather than a PostgreSQL enum permits future status changes through a reviewed migration. Under `D-021` and `D-022`, descriptions have a 2,000 Unicode scalar value limit, consistently validated by frontend and backend in the later application feature; empty or whitespace-only values normalize to null, PATCH null clears, and omission preserves. An emoji can be one or more scalar values and a combining sequence can be multiple values; this is not a count of user-perceived characters.
- Preserve parameterized substring search, ASCII case folding, and existing wildcard semantics. Test SQLite/PostgreSQL parity before accepting behavioral differences; differences from `jsonb` genre serialization are not preapproved. Preserve case-sensitive email equality and uniqueness using PostgreSQL `C` collation, subject to environment verification.
- Preserve application-generated UUIDs and safely validate malformed route identifiers without exposing database errors or changing endpoint-specific API behavior. Use `timestamptz` internally and serialize UTC dates for API and CSV as `YYYY-MM-DD HH:mm:ss`; `updatedAt` remains insertion-only. Use `jsonb` for genres with a `CHECK` requiring an array, while request validation continues to require nonempty string arrays.
- Use `created_at DESC, id DESC` deterministic ordering where applicable. Equal-timestamp items may visibly reorder compared with the current unspecified tie order. Additional validation constraints remain subject to review.
- Approved integrity defense: books have `UNIQUE (id, user_id)` and reviews have a composite `(book_id, user_id)` foreign key to that key with `ON DELETE CASCADE`. Deleting a user cascades to their books and then reviews. This prevents a review from referencing another user's book, but does not replace token-derived, owner-scoped application authorization.
- Use sequential immutable SQL migrations, checksums and a migration ledger, with explicit invocation, direct-session PostgreSQL advisory locking, per-migration transactions and fail-closed schema readiness checks. No automatic schema creation on normal application startup. `DB-03` owns runner-level ledger validation; the owner assigns fail-closed application startup schema readiness to `DB-04` and repeatable synthetic initialization/reset implementation and validation to `DB-05`. Failure and recovery limitations are documented in `README.md`; do not assume application rollback restores data.
- Phasing: first build and validate the schema foundation; then implement database access (`DB-04`) and synthetic-only initialization and validation (`DB-05`, followed by applicable integration gates). Only after PostgreSQL infrastructure has been validated and a separate feature increment is approved should coordinated API, validation, UI, owner-scoped filters, and CSV work implement `D-021`. Reserving columns alone must not expose unfinished functionality.
- Until that feature increment is approved and implemented, existing API responses, request validation, CSV headers, and UI behavior remain unchanged. Backend CSV output and the frontend's exact-header validation must change together. Preserve authorization, isolation, existing error recovery, and review drafts throughout.
- Actual search and genre-filter parity, the `C` collation in the target environment, consistent Unicode enforcement, uncertain-COMMIT recovery, and repeatable synthetic-only reset remain to be verified. Provider connectivity, TLS, staging, costs, backup/restore and production cutover remain unverified; no recovery capability is assumed.

### M4 — Framework and dependency upgrades

| ID | Task | P | Status | Depends on | Deliverable | Acceptance criteria |
|---|---|---|---|---|---|---|
| `UPG-01` | Build compatibility and support matrix | P1 | `[ ]` | `AUD-02`, `TEST-04` | Upgrade inventory and proposed order | Current versions, runtime requirements, peer conflicts, security advisories, breaking changes, and test gaps documented; targets proposed but not approved |
| `UPG-02` | Upgrade backend dependencies and runtime | P1 | `[ ]` | `UPG-01`, `TEST-03` | Incremental backend upgrade | Build and regression tests pass; staged smoke passes; lockfile updated; behavior preserved; rollback documented. Owner approved a limited Express 4 and compatible transitive security refresh; broader upgrade targets remain pending. Residual audit findings include Zod array-validation memory exhaustion and the bcrypt installer’s vulnerable tar chain. |
| `UPG-03` | Upgrade frontend framework and dependencies | P1 | `[ ]` | `UPG-01`, `TEST-02`, `TEST-05` | Incremental frontend upgrade | Framework, React, TypeScript, and UI dependencies upgraded in reviewable steps; lint, build, tests, and auth/route smoke pass; no unresolved visual regression |
| `UPG-04` | Align Node.js runtime | P1 | `[ ]` | `UPG-01`, `GOV-01` | Consistent supported runtime | Local, CI, Render, Vercel, and README use the same approved supported LTS version; build verified; owner confirms hosting setting |
| `UPG-05` | Reduce type and lint debt in touched areas | P2 | `[ ]` | `UPG-02`, `UPG-03` | Cleaner type/lint baseline | No behavior change; no new lint/type errors; unsafe casts removed where practical; checks pass |

### M5 — Documentation and operations

| ID | Task | P | Status | Depends on | Deliverable | Acceptance criteria |
|---|---|---|---|---|---|---|
| `DOC-02` | Rewrite README to match reality | P1 | `[ ]` | `GOV-01` | Accurate setup and architecture guide | Removes stale Vite and obsolete references; no credentials or secrets; commands verified; environment names documented; hosting topology described without sensitive values |
| `DOC-03` | Publish operations runbook | P1 | `[ ]` | `GOV-03`, `DB-07` | Deploy, rollback, backup, restore, and incident runbook | Procedures tested in non-production; owners and escalation paths defined; recovery verification included |
| `DOC-04` | Add release checklist | P2 | `[ ]` | `TEST-05` | Release checklist tied to gates and evidence | References task IDs, required checks, backup/restore status, smoke results, and rollback readiness |

### M6 — Optional improvements and future features

All optional tasks require owner prioritization and $0 confirmation.

| ID | Task | P | Status | Depends on | Deliverable | Acceptance criteria |
|---|---|---|---|---|---|---|
| `OPT-01` | Add health and readiness endpoints | P2 | `[ ]` | `DB-04` | Minimal operational checks | No secrets or internal details exposed; database readiness distinguished from process liveness; fast and tested |
| `OPT-02` | Add password reset and email verification | P2 | `[ ]` | `SEC-02`, `SEC-03`, `PUB-01` | Secure account-recovery flow | Single-use expiring tokens, rate limiting, no account enumeration, tests, and a separately approved email option that remains within $0 |
| `OPT-03` | Add library-wide CSV export | P2 | `[ ]` | `SEC-04`, `SEC-07` | Export of the authenticated user's full library | Scoped to the authenticated user; existing per-book export preserved; CSV escaping handled; no cross-user data |
| `OPT-04` | Conduct accessibility review | P2 | `[ ]` | `SEC-05` | Prioritized accessibility fixes | Keyboard navigation, labels, focus handling, contrast, and error announcements reviewed; critical issues fixed without scope expansion |

**Future concept — Explore Your Library:** On a selected book's detail page only, not in text-search results, suggest other books owned by the authenticated user by the same author or with shared genres. Exclude the current book and never expose another user's records. Prefer a compact, restrained Archival Modern presentation; up to four books per category is a proposal, not an approved acceptance criterion. This is a future idea, not a `DB-03` blocker or immediate implementation approval. No external recommendation service, AI, or additional schema is authorized; prioritization, scope and any implementation require separate review.

### UX/UI handoff and follow-up

Beginning UX/UI redesign is authorized, not production release or security approval. Direction: modern minimalist editorial personal library, strong book covers, responsive mobile-first experience, consistent navigation and forms, accessibility, and light/dark themes. Retain Ant Design 5 provisionally and evaluate token customization and selective replacement, not an automatic full migration. Preserve functionality, authentication, public registration, and multiuser isolation. A formal redesign task ID and any further owner decisions remain pending; no existing decision is replaced.

CI, browser validation, session/security decisions and remediation, dependency advisories, the pagination timestamp tie-breaker, production persistence/recovery, and release verification remain follow-up work, not blockers to beginning design or waived release gates. After redesign is finalized, produce a polished GitHub/portfolio README with real screenshots, product overview, architecture, setup instructions, and a demo; formal task assignment remains pending. The accuracy edits to README do not complete `DOC-02`.

## 6. Production safety and rollback

### Release gates

1. **Local:** lint, build, tests, and targeted manual checks pass.
2. **Review:** change is reviewed and limited to the active task.
3. **Staging:** full smoke and multiuser isolation pass in a non-production environment.
4. **Recovery:** new-database backup/restore has been tested; current SQLite recovery is not assumed.
5. **Production:** owner approval, change window, monitoring, and rollback owner identified.
6. **Observation:** post-release checks pass before cleanup or deletion.

A push or merge to `main` is a production action because Vercel Production and Render Auto-Deploy both follow `main`.

### Fresh-database cutover sequence

1. Obtain explicit owner approval and confirm the change window.
2. Confirm staging validation and rollback ownership.
3. Initialize the approved production database from migrations.
4. Configure the backend with the new database connection.
5. Deploy the application and verify the previous deployment remains available.
6. Smoke-test registration, login, CRUD, reviews, favorites, filters, CSV, and two-user isolation.
7. Monitor errors and performance; roll back the application if agreed thresholds are exceeded.
8. Do not delete the old deployment or repository database without separate approval.
9. Record that SQLite demo data was intentionally discarded, not migrated, and not assumed recoverable.

### Rollback principles

- Application rollback uses the previous known-good deployment and configuration.
- Old production SQLite persistence and recovery are unverified. Do not promise restoration of old demo data.
- New-database recovery depends on the provider's approved backup/restore capability or a documented alternative.
- Do not use destructive down-migrations.
- Do not delete data, backups, or `backend/library.db` during rollback.
- Record the incident, decision authority, evidence, and follow-up tasks.

## 7. Decision log

### Approved

| ID | Decision | Status | Notes |
|---|---|---|---|
| `D-001` | Preserve existing working functionality, especially multiuser registration, login, and per-user isolation | Approved | Confirmed requirement |
| `D-002` | Keep hosting at approximately $0/month | Approved | Applies to database, staging, email, and monitoring |
| `D-003` | Prefer incremental modernization over a full rewrite | Approved | Confirmed requirement |
| `D-004` | Preserve current production until replacement changes are validated | Approved | Cutover requires staging evidence and owner approval |
| `D-005` | Evaluate Supabase and Neon before selecting a database provider | Approved | Completed in `DB-01` before the separate `D-015` decision |
| `D-006` | Keep public self-registration unchanged until an explicit policy decision | Approved | `PUB-01` owns the decision |
| `D-007` | Demo records, including current production demo data, may be discarded | Approved | No deletion during planning; deletion requires explicit approval |
| `D-008` | Documentation, agent instructions, and agent responses are English | Approved | Spanish UI copy remains product behavior |
| `D-009` | Start PostgreSQL with a fresh schema; do not migrate SQLite records | Approved | Synthetic fixtures and integration validation replace record migration |
| `D-015` | Select Neon PostgreSQL as the database provider | Approved | Owner decision for `DB-02`; rationale, alternative, migration implications, and rollback limits in the `DB-02` section |
| `D-020` | Environment and JWT governance | Approved | Owner is sole policy owner/operator; JWT keys use 32 cryptographically random bytes encoded as exactly 64 hex characters; tests use an explicit synthetic key of the same format; keys are distinct across local, test, production and future staging. Rotate after suspected exposure or documented operational necessity, not on a mandatory schedule. Production inspection, configuration changes, rotation and deployment each require separate explicit owner authorization. Never record secret values; replacement invalidates previous JWTs under the single-key model. `SEC-01` implements enforcement later. |
| `D-021` | Add optional book descriptions and reading status after PostgreSQL infrastructure validation | Approved | Description is optional, maximum 2,000 characters; empty or whitespace-only descriptions normalize to null; PATCH null clears and omission preserves. Status values are `pending`, `reading`, `finished`, `abandoned`, defaulting to `pending`; initially changed via book edit, displayed on cards, and available as an owner-scoped filter. Include both fields in CSV with coordinated backend and frontend validation. Product scope approval does not approve the proposed schema details or authorize implementation; see `DB-03`. |
| `D-022` | Approve the `DB-03` technical architecture decisions | Approved | Search and wildcard compatibility, case-sensitive email, timestamps, genre arrays, UUID handling, deterministic tie ordering, Unicode scalar counting, versioned migration safety, and composite review ownership with cascades are specified in the `DB-03` section. This does not authorize implementation, provisioning, migrations, or deployment; parity and operational behavior remain unverified. |

### Proposed

| ID | Proposal | Status | Notes |
|---|---|---|---|
| `D-010` | `main` is production; `modernization` is integration; implementation uses short-lived task branches | Proposed | Requires confirmation of branch workflow |
| `D-011` | Require lint, build, and tests as CI gates before merging modernization work | Proposed | Depends on `TEST-04` |
| `D-012` | Complete security stabilization before production database cutover | Proposed | Reflected in `DB-08` dependencies |
| `D-013` | Use synthetic fixtures only for database and isolation validation | Proposed | No production data |
| `D-014` | Preserve per-book CSV export and add library-wide export separately | Proposed | Avoids breaking current behavior |

### Pending owner decisions

| ID | Decision | Status | Blocking |
|---|---|---|---|
| `D-016` | Authentication and session architecture, including cross-origin transport, CORS, SameSite, and CSRF | Pending | `SEC-02`, `SEC-06`, `OPT-02` |
| `D-017` | Supported upgrade targets and order | Pending | `UPG-02`, `UPG-03`, `UPG-04`; owner approved only the limited Express 4 and compatible transitive security refresh, not Zod 4 or bcrypt 6 |
| `D-018` | Staging strategy and topology | Pending | `DB-06` and production validation |
| `D-019` | Future public self-registration policy | Pending | `PUB-01`, and any later registration change |

`DISC-01`, `AUD-01`, `DOC-01`, `TEST-01`, `SEC-04`, and `TEST-03` are complete. `AUD-02` remains pending.
