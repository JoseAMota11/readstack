# Environment governance

## Purpose and authority

This policy covers repository-defined application configuration for the backend and frontend, their tests, local development, production, and staging. The project owner is currently the sole policy owner and authorized operator. This document authorizes no operational action: production configuration changes, secret inspection, rotation, and deployment each require separate explicit owner authorization. Do not access production systems to complete this documentation task.

## Branches, deployment and application rollback (`GOV-01`)

`main` is the production branch; `modernization` is the integration and development branch, with optional short-lived task branches. The owner confirms Vercel Production tracks `main`, Vercel Preview covers other branches, and production Render tracks `main` with Auto-Deploy. Therefore every push or merge to `main` is a production deployment action, not merely a Git change. Agreed CI checks, including lint, builds and tests as applicable, are mandatory before merges; existing CI does not itself establish branch protection.

Before a release, the owner reviews the candidate, agreed CI results, staging evidence, known risks and rollback limitations, and explicitly authorizes the specific production action. The authorized operator verifies the intended branch and commit before executing it, then records the deployment and validates only within separately authorized scope. Stop and consult the owner if checks fail or the target is uncertain. This procedure does not change hosting settings or grant authorization.

For an application incident, the operator stops further releases, records the affected service, deployment and symptoms without secrets, and notifies the owner. The owner decides whether to roll back and separately authorizes the specific production action. The operator identifies a known previous application version and, only if available and authorized, uses the applicable provider's verified rollback mechanism or a separately authorized deployment of that version; then checks the affected application within authorized scope and records the outcome. If the prior version or mechanism is unavailable, stop and escalate rather than assume recovery. An application rollback does not restore database state or necessarily undo schema or configuration changes. Current production SQLite persistence and recovery are unverified; no backup is assumed. `GOV-03` remains open for the broader recovery runbook.

## Staging strategy ADR (`GOV-04`, `D-018`)

The owner approved Vercel `modernization` Preview connected to a separate Render Staging backend and Neon PostgreSQL staging database. Only authorized operators and synthetic accounts and data are permitted. Continue invitation-controlled staging registration and the previously accepted limited public API/login exposure; CORS is not an authorization mechanism. Staging's Neon branch name `production` is a provider label, not evidence that it is the production application database.

The intended validation scope is bounded synthetic functional, persistence, cross-user isolation and latency checks on staging. Production data, production credentials, destructive operations, migrations, configuration changes and deployments require separate explicit authorization; this ADR grants none. Production remains unchanged until separately authorized.

The objective is approximately $0 per month; paid usage is not authorized. Review provider usage and billing during significant testing sessions and before relevant deployments; stop and seek owner direction if free limits or charges are at risk. Owner-reported November 2026 observations: Render Hobby accumulated and projected charges were each $0.00; Neon Free was $0/month, with usage since November 12 of 0.78 CU-hours, 32.03 MB storage, 771.57 kB history and 204.93 kB network transfer. These limited point-in-time observations support approximate $0 feasibility for light use, not future cost, quota or availability guarantees. Provider terms and actual use can change.

For `DB-06`, the owner approved this staging latency target: after one unmeasured warm-up, five successful warm authenticated database-backed reads must have median latency at most 1 second and no request over 2 seconds. Record a cold-start request separately after an identifiable idle period; its staging acceptance target is at most 30 seconds. Record endpoint, idle period, outcomes and timings; investigate failures without assuming their cause. Owner-reported preliminary GET `/api/v1/` timings of 21.479, 0.422 and 0.556 seconds were HTTP 404 responses, not authenticated database-backed reads, and do not satisfy the warm criterion. The first is consistent with a cold start, but its cause is unconfirmed.

## Inventory and evidence

All rows are owned by the project owner. “Source verified” means a static repository reference was found, not that a deployment setting, value, or effective behavior was inspected. Applicable environments indicate where the variable can be relevant, not where it is known to be configured. Local = development; test = automated tests; production = deployed service; staging = any future staging. Framework/hosting-provided variables not referenced by repository code are outside this application inventory.

| Variable | Classification | Consumer and purpose | Applicable environments | Verification status |
|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Public | Frontend `frontend/utils/constants.ts`: API base URL, exposed to browser code; frontend tests set it | Local, test, production, future staging | Source and test references verified; deployed value and build settings unverified |
| `PORT` | Internal | Backend `backend/src/config/config.ts`: listening port; defaults to 3000 | Local, test, production, future staging | Source verified; Render configuration unverified |
| `CORS_ALLOWED_ORIGINS` | Internal | Optional comma-separated exact HTTP/HTTPS origins; absent preserves unrestricted CORS, invalid values fail startup | Local, test, future staging | Staging origins and deployment unverified; CORS is not access control |
| `STAGING_REGISTRATION_SECRET` | Secret | Optional registration gate; 32 random bytes as 64 lowercase hex characters, absent preserves public registration | Staging backend only; synthetic tests | Staging configuration and operation unverified; never configure Beta or frontend. See README operator procedure |
| `DATABASE_PATH` | Internal, potentially sensitive path | Backend `backend/src/config/db.ts`: SQLite path; defaults to relative `library.db`; backend test helper sets an isolated path | Local, test, production, future staging | Source and test references verified; production path and persistence unverified |
| `NODE_ENV` | Internal | Backend `backend/src/config/db.ts`: suppresses SQL verbose logging when set to test; test helper sets it; framework tooling may also use it | Local, test, production, future staging | Source and test references verified; deployment setting unverified |
| `SECRET_KEY` | Secret | Backend config, user model and authentication middleware: JWT signing and verification; backend test helper sets a synthetic key | Local, test, production, future staging | Source and test references verified; deployed configuration, strength and separation unverified |
| `AUTH_IP_RATE_LIMIT_ENABLED` | Internal | Backend auth rate-limit middleware: opts into direct-peer IP limits only when set to `true` | Local, test, production, future staging | Source and test references verified; deployment setting and Render ingress unverified |
| `AUTH_LOGIN_WINDOW_MS`, `AUTH_LOGIN_ACCOUNT_MAX`, `AUTH_LOGIN_IP_MAX` | Internal | Backend auth rate-limit middleware: login window and per-account/IP limits | Local, test, production, future staging | Names constructed in source; IP limit referenced in tests; deployment settings unverified |
| `AUTH_REGISTER_WINDOW_MS`, `AUTH_REGISTER_ACCOUNT_MAX`, `AUTH_REGISTER_IP_MAX` | Internal | Backend auth rate-limit middleware: registration window and per-account/IP limits | Local, test, production, future staging | Names constructed in source; IP limit referenced in tests; deployment settings unverified |
| `TZ` | Internal, test-only repository use | Frontend `frontend/tests/review-functional.test.cjs`: controls test timezone | Test | Test reference verified; not an application deployment setting |
| `DB06_PROJECT`, `DB06_BRANCH`, `DB06_ENDPOINT`, `DB06_HOST` | Internal | One-off staging initializer: target identifiers and exact direct hostname | Staging initialization only | Source verified; owner-observed mapping must be rechecked before authorized use |
| `DB06_CONSOLE_VERIFIED`, `DB06_BETA_SEPARATION_VERIFIED`, `DB06_APPROVAL` | Internal | One-off staging initializer: operator attestations and target-scoped write acknowledgment | Staging initialization only | Source verified; acknowledgments do not establish identity or grant authorization |
| `DB06_DATABASE_URL` | Secret | One-off staging initializer: PostgreSQL connection credentials | Staging initialization only | Source verified; never log, document or reuse credentials |

The backend reads process variables and does not load `.env` itself. Rate-limit numeric settings must be positive integers at most 2147483647; invalid settings prevent startup. IP limiting is disabled by default; enabling it behind an unverified proxy can block unrelated users. See the README for defaults and constraints. `DATABASE_PATH` is not a backup or persistence guarantee; production SQLite persistence and recovery remain unverified.

Repository evidence: `backend/src/config/config.ts`, `backend/src/config/db.ts`, `backend/src/middlewares/auth-rate-limit.middleware.ts`, `backend/src/models/user.model.ts`, `backend/src/middlewares/book.middleware.ts`, `backend/tests/helpers/test-env.ts`, `backend/tests/auth.ip-rate-limit.test.ts`, `frontend/utils/constants.ts`, and frontend tests. Vercel Production tracking `main`, Vercel Preview on other branches, and Render Free tracking `main` with Auto-Deploy and no persistent disk are owner-confirmed facts, not dashboard verification in this increment. Actual environment assignments, access controls, deploy behavior, and recovery capabilities are unverified.

## Configuration handling

- **Public:** Treat `NEXT_PUBLIC_API_URL` as browser-visible, including when bundled at build time. Never put credentials or private endpoints with credentials in it. The owner reviews the intended environment and endpoint, authorizes production changes separately, and checks the resulting public configuration without exposing private data. Rebuild/redeploy may be needed for a frontend change; do so only with separate authorization.
- **Internal:** Restrict configuration access to the owner, record names and non-sensitive intent rather than values, and validate effects in an isolated environment first. Protect paths and operational details. Do not enable IP limits until direct-peer behavior and proxy trust are safely verified. Production changes and any needed deployment require separate authorization.
- **Secrets:** Generate and store through an access-controlled secret mechanism; restrict read and modification access to the owner. Never commit, document, log, screenshot, report, or paste secret values, including into tickets or shell history. Do not use public frontend variables for secrets. Production inspection, changes, rotation, and deployment each require separate explicit authorization. Document only non-sensitive metadata such as operator, environment, date, reason, and outcome.

## JWT secret policy

For non-test environments, generate `SECRET_KEY` from **32 cryptographically secure random bytes**, encoded as **exactly 64 hexadecimal characters**. Generate independently and keep local development, tests, production, and any future staging secrets distinct. Use an established cryptographic generator (for example, OpenSSL's random-byte generator with hex encoding) in a secure workflow that does not print or record the output; supply the result through the approved protected secret mechanism. Prevent exposure through shell tracing, process arguments, history, logs, clipboard, and shared storage. Confirm format through a non-disclosing check; format alone cannot prove randomness, entropy, provenance, or uniqueness.

Tests must use an explicit synthetic key matching the same 64-hex-character format, distinct from every other environment, never a copied real secret. The backend test helper uses a deterministic synthetic fixture; it is not a production key and its format does not establish cryptographic generation.

Backend startup requires an explicit 64-character hexadecimal `SECRET_KEY` in every environment, including tests, and has no fallback. Invalid configuration fails without reporting its value. A format check cannot verify secure generation or uniqueness; operational provenance is required. The present JWT model uses one signing/verification key and six-hour tokens. Deployed configuration and compliance remain unverified.

## Rotation, revocation, and recovery

Rotate after suspected exposure or documented operational necessity. There is no mandatory periodic rotation schedule. The owner must separately authorize production secret inspection, rotation, production configuration changes, and deployment before any such action. A rotation plan should cover:

1. Record the reason, affected environment, authorization, expected user impact, and a non-sensitive timeline; do not record secret values. Identify the affected service and ensure a secure channel and access-controlled secret storage are available.
2. Generate a new independent key under the policy above; perform non-disclosing format checks. Never reuse a key from another environment.
3. With the specific required authorizations, replace the backend environment secret using the provider's protected configuration mechanism and deploy/restart as required by the actual provider workflow. Do not assume the change has propagated; provider behavior is unverified.
4. Validate with synthetic accounts and tokens, without logging tokens or secrets: a token issued under the old key is rejected and a newly issued token works; check login and protected access. Coordinate user reauthentication and monitor without recording sensitive data.
5. Record the outcome and remaining risks without secrets. If validation fails, stop and follow an owner-approved recovery plan. Restoring an exposed old key would re-enable compromised tokens and is not a safe default. Do not assume a backup, previous key, deployment rollback, or database recovery is available; escalation and recovery depend on separately authorized investigation. `GOV-03` remains open for the broader runbook.

Replacing the single key invalidates previously signed JWTs once all verifiers use the new key, forcing affected users to authenticate again; staggered instances may temporarily behave inconsistently. Individual-session revocation and seamless dual-key rotation are **not established capabilities**. Do not claim that clearing one browser cookie revokes a token or that rollback safely restores sessions.

## Suspected disclosure

Contain the exposure without reproducing it: stop sharing the material, notify the owner through a secure channel, preserve only non-sensitive evidence and timeline, and identify affected environments and access paths without inspecting production secrets unless separately authorized. The owner determines scope and authorizes containment, secret rotation, configuration changes, and deployment separately. Follow the rotation checklist, investigate unauthorized access using separately authorized procedures, and communicate user impact without exposing tokens, private data, or secret values. Do not paste a leaked value into an issue or log. Record follow-up actions and unresolved uncertainty; do not assume rotation undoes prior unauthorized access.

## Service procedures

### Backend / Render

The backend consumes `SECRET_KEY`, `PORT`, `DATABASE_PATH`, `NODE_ENV`, and the `AUTH_*` settings above. For local work, use isolated synthetic data and independently provisioned secrets. For Render, the owner must separately authorize any inspection or production change; then use the provider's protected configuration mechanism without displaying or recording secrets. Verify deployment and effective behavior only after separately authorized deployment and safe validation. The exact Render configuration and restart/propagation behavior have not been verified. Do not change the database path or test persistence destructively; no backup or recovery is assumed.

### Frontend / Vercel

The frontend consumes the public `NEXT_PUBLIC_API_URL`; it must never contain a secret. The owner reviews the correct local, Preview, Production, or future staging target and the exposure of its value. Production inspection, changes, and deployment require separate explicit authorization. After authorized changes, account for build-time inclusion and verify the intended endpoint without exposing credentials. Preview and production settings and propagation have not been inspected; Preview does not establish a backend staging environment. No frontend JWT signing secret or frontend secret rotation is established by repository source.
