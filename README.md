# ReadStack

ReadStack is a multiuser personal book catalog for organizing collections and recording reviews. Search and filter your library, keep track of favorites, and revisit your impressions of each book. It is a catalog, not an ebook reader.

## Screenshots

### Library

![Desktop view of the ReadStack library and book collection](docs/screenshots/library-desktop.png)

### Book detail

![Desktop book detail with cover, information, actions, and reviews](docs/screenshots/book-detail-desktop.png)

| Mobile library | Add a book | Sign in |
| --- | --- | --- |
| ![ReadStack library on a mobile screen](docs/screenshots/library-mobile.png) | ![Add-book form displayed over the library](docs/screenshots/add-book-modal.png) | ![ReadStack sign-in screen on desktop](docs/screenshots/login-desktop.png) |

## Features

- Public registration and sign-in, with a separate collection for each user.
- Add, view, edit, and delete books with details such as title, author, year, genres, and cover.
- Search by title, filter by author, year, and genre, and browse paginated results.
- Mark favorites and manage reviews and ratings on each book's detail page.
- Export an individual book to CSV; full-library export is not implemented.
- Responsive interface with light and dark themes; the browser stores the selected preference.

## Technology and architecture

- **Frontend:** Next.js 16.4.6 with App Router, React 19.3.1, and TypeScript. Ant Design 5.29.3 and Tailwind CSS 3 support the interface; client services communicate with the API.
- **Backend:** Node.js, Express 4, and TypeScript. The REST API is organized into routes, middleware, controllers, and models, with Zod input validation.
- **Data:** SQLite is the default, using `better-sqlite3` and creating its tables at startup. Experimental PostgreSQL repositories are composed into the application after read-only readiness succeeds. User, book, and review operations expose typed asynchronous contracts; SQLite and bcrypt still execute synchronously. The separate experimental PostgreSQL migration CLI is not part of application startup.
- **Authentication and authorization:** bcrypt password hashing and JWT authentication. The frontend stores the token in a JavaScript-readable cookie and sends it as a Bearer token. The API verifies the token and checks book and review ownership; frontend navigation protection does not replace those checks.

## Design

The approved **Archival Modern** direction combines a restrained editorial style with prominent book covers, generous space, and responsive layouts. Light and dark themes receive equal care. Implementation and visual and accessibility validation are ongoing; see [DESIGN.md](DESIGN.md) for the design principles and their limits.

## Local setup

Local validation has used Node.js 22; npm 10 is recommended. Install dependencies separately for the frontend and backend. Use synthetic accounts and data for local work.

### Backend

From the repository root:

```bash
cd backend
npm install
npm run build
```

Configure the following environment variables for the backend process. The backend does not automatically load an `.env` file.

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY` | Required. Use an independently generated local secret of exactly 64 hexadecimal characters. Do not publish it or store it in the repository. |
| `DATABASE_PATH` | SQLite path. Use an isolated local path for synthetic data; otherwise it defaults to `library.db` relative to the working directory. Avoid modifying the tracked `backend/library.db`. |
| `DATABASE_PROVIDER` | `sqlite` (default) or experimental `postgres`; all other values fail startup. Limited disposable PostgreSQL validation is owner-reported; comprehensive parity remains unverified. |
| `PORT` | API port; defaults to `3000`. Set it to `4000` for the frontend configuration below. |

With those variables configured, start the server from `backend/`:

```bash
npm start
```

With `PORT` set to `4000`, the API is available at `http://localhost:4000/api/v1`. See the [environment governance guide](docs/ENVIRONMENT_GOVERNANCE.md) for the full variable inventory, rate-limit options, and secret management. Keep secrets out of shell history and use distinct secrets for different environments; changing the signing key invalidates existing sessions.

Authentication rate limits are process-local, not distributed. Login and registration have per-account limits; the optional IP limit uses only the direct socket peer and is disabled by default. Enable it only after verifying that the direct peer is the actual client, not a proxy shared by clients. Render's ingress and client-IP behavior are unverified: do not enable this direct-peer limiter there on that assumption. A Render per-client limiter requires a separately verified, non-spoofable ingress/header trust boundary and a reviewed implementation; the current limiter deliberately ignores forwarded headers, even if Express proxy trust is enabled. Verify that clients cannot bypass the trusted ingress, how it sanitizes forwarding headers and identifies the client, and the correct trusted proxy configuration before designing such a change.

These limits do not stop attempts spread across many accounts, instances, or restarts. Registration currently reveals an existing email through its 409 response; changing that contract requires a separate decision. Unknown-user logins perform a dummy bcrypt comparison to reduce a timing signal, not guarantee constant-time responses; this extra synchronous work also increases the risk of CPU exhaustion under abuse.

### Experimental PostgreSQL runtime and startup readiness

PostgreSQL mode composes the user, book and review repositories explicitly and listens only after read-only readiness succeeds. It does not import the SQLite singleton or fall back to SQLite. The application pool is limited to five clients, with ten-second idle expiry and five-second connection, query and server statement timeouts. Startup failure attempts bounded pool cleanup; SIGINT/SIGTERM stop accepting requests, allow up to five seconds for draining, then close connections if needed and attempt bounded pool cleanup. A cleanup timeout does not prove an underlying client closed. The owner reports limited disposable PostgreSQL route, rollback, startup, pool-shutdown and targeted parity/security validation; these results were not independently agent-verified and do not establish comprehensive parity, hosted TLS or lifecycle behavior. `DB-04` has qualified foundation acceptance, not production readiness; see `PROGRESS.md`. Do not change production configuration or connect to any service on this basis. SQLite remains the default and `DATABASE_PATH` is unchanged.

Book title, author and genre elements and review comments reject embedded U+0000 at request validation. Genre elements also reject unpaired UTF-16 surrogates, while valid pairs are accepted. These rules apply to both providers; existing stored records are not changed. The owner reports a passing targeted real-server comparison of search, wildcard and JSONB genre cases; broader parity remains unverified.

`backend/tests/provider-parity-security.test.ts` records SQLite's ASCII-only LIKE folding, substring and wildcard behavior and compact JSON-text genre matching, and checks PostgreSQL parameters and HTTP security contracts with an injected fake client. Quotes, backslashes and control characters in genre elements are JSON-escaped in SQLite; the genre filter itself is not JSON-escaped, so an exact-looking filter may not match. The fake client does not execute PostgreSQL SQL or establish matching results. The owner reports a successful opt-in DB-04I comparison and independent pre/post checks; its separate approval, isolation and post-check requirements are documented in `backend/tests/integration/DB-04I.md`. It reuses the DB-04H matrix and is excluded from ordinary tests; it cannot verify committed multi-session behavior. No connection, writes or migrations are authorized by this documentation.

The PostgreSQL readiness configuration requires `DATABASE_URL` with a `postgres` or `postgresql` URL containing host, database, username and password, and `POSTGRES_TLS=verify-full`. URL query parameters and inherited `PG*` variables are rejected. TLS uses certificate and hostname verification with the Node trust store; no insecure TLS mode is provided. Do not log or publish the URL. The client has five-second connection, query and server statement timeouts; each readiness operation and cleanup also has a five-second bound. A stalled cleanup is reported as a failure, not proof that an unresponsive underlying client closed.

Readiness reads the packaged migration files from `backend/migrations` (which must accompany the compiled application), checks the existing `public.schema_migrations` ledger for an exact complete version, filename and checksum match, and uses PostgreSQL catalogs to check expected columns, types, nullability, primary/unique keys and cascading ownership foreign keys. It does not create a ledger, run migrations, or detect all drift: defaults, checks, indexes, collation, triggers, privileges and many other properties are outside this limited check. The owner reports limited local verified-TLS and readiness validation; hosted-provider connectivity and deployment remain unverified. Startup readiness is not a substitute for the later staging and security gates.

### Experimental local PostgreSQL migrations

Preparing this CLI is not authorization to execute it. Obtain separate owner approval for the **exact local PostgreSQL instance and disposable database** before running either command. Loopback does not guarantee a disposable target: a tunnel or proxy could forward to another system. Verify the target independently; the naming and acknowledgement checks do not establish safety. Do not use this CLI for Neon, Render, or production. SQLite remains the default and no SQLite records are transferred.

For an approved target, configure these process environment variables without putting credentials in shell history or the repository (placeholders are not values to use):

| Variable | Requirement |
| --- | --- |
| `READSTACK_MIGRATION_HOST` | Literal `127.0.0.1` or `::1` only. |
| `READSTACK_MIGRATION_PORT` | Explicit decimal TCP port, 1–65535. |
| `READSTACK_MIGRATION_DATABASE` | Explicit lowercase name beginning `readstack_disposable_`, followed by lowercase letters, digits or underscores; maximum 63 characters. |
| `READSTACK_MIGRATION_USER` | Explicit PostgreSQL user identifier. |
| `READSTACK_MIGRATION_PASSWORD` | Nonempty password, supplied securely. |
| `READSTACK_MIGRATION_CONFIRM_LOCAL` | Exactly `I_APPROVE_LOCAL_DISPOSABLE_MIGRATIONS`. This is not a substitute for separate target approval. |

Remove inherited `PG*` variables first; the CLI rejects them. It does not load dotenv files or use `DATABASE_URL` or `DATABASE_PATH`. From `backend/`, **only after approval**, `npm run migrate:local:ts` invokes the TypeScript CLI; `npm run build` followed by `npm run migrate:local` invokes the compiled CLI. Neither ordinary startup nor build runs migrations.

Migrations are forward-only and tracked with checksums. Operational safeguards:

- A disposable reset requires separate explicit approval, independently verified target identity, and confirmation that all target data is synthetic and disposable. The owner reports successful repeated DB-05 reset on one disposable PostgreSQL target; this is not a recovery procedure or authorization for another reset.
- After a failed migration, stop, preserve evidence, and independently verify the ledger and schema. The runner attempts rollback, but rollback is not guaranteed in every failure.
- On a checksum mismatch, never edit the ledger or an already applied migration to force compatibility. Prefer reviewed sequential forward-fix migrations over destructive down-migrations.
- On lock contention, do not forcibly unlock or terminate unidentified sessions.
- If COMMIT's outcome is uncertain, do not blindly retry. Verify the actual schema and ledger from an independent connection; stop if they are inconsistent. Live connection-loss recovery during COMMIT has not been validated.

Application rollback is not database recovery: rolling code back does not restore data or reverse database writes. No tested backup, restore, recovery procedure, production readiness, or provider connectivity is implied by this CLI.

### DB-05 disposable PostgreSQL fixture procedure

These experimental commands are **not authorization to connect or write**. The owner reports successful seed, repeated seed, separately authorized reset and repeated reset on one disposable PostgreSQL 17 target, with independent count and ledger checks; this live result was not independently verified by the agent in the documentation closeout. `DB-05` has qualified acceptance for that scope, not staging, hosted persistence, backup/restore or production readiness; see `PROGRESS.md`. Ordinary startup, build and tests never invoke these commands. The fixture has 2 users, 3 books and 2 reviews (7 rows); 2 favorite flags are fields on books, not separate rows. IDs and timestamps are fixed; intentionally invalid passwords cannot test login. No SQLite data is transferred.

1. Obtain explicit owner approval for the exact disposable instance, database, container ID, image ID and port, and separately for each action: migration, seed and destructive reset. Do not reuse DB-04 resources without specific approval. Independently verify the image, container and actual PostgreSQL data directory use disposable tmpfs, no persistent mounts, restarts or other clients, and that the loopback port connects directly to that instance—not a tunnel, proxy, or different service. Confirm all data is synthetic and disposable. Container metadata and acknowledgement variables alone do **not** prove this. Stop if anything is uncertain; never target Render, Neon, staging or production. No broad privileges or production-role changes are authorized.
2. Initialize the empty schema using the existing migration procedure above, only after its separate approval. The fixture commands **do not run migrations**; they require the unchanged `0001_initial_schema.sql`, its matching complete ledger and readiness checks. They require a role with adequate access to read, insert, delete and acquire access-exclusive locks on the three tables; if its existing permissions are insufficient, stop rather than granting broad access. Provide local verified TLS with a trusted certificate valid for `127.0.0.1`; do not disable verification.
3. Set `DATABASE_PROVIDER=postgres`, `POSTGRES_TLS=verify-full`, and securely provide `DATABASE_URL` for host `127.0.0.1`, database `readstack_disposable_db05`, role `readstack_db05_runner` and the approved port. Do not put credentials in shell history, logs or the repository; inherited `PG*` variables are rejected. Set `DB05_PORT` to that explicit decimal port, `DB05_CONTAINER_ID` to the full 64-hex container ID, `DB05_IMAGE_ID` to its full `sha256:` image ID, and `DB05_INDEPENDENTLY_VERIFIED=yes` only after the independent checks. For a separately approved seed set `DB05_SEED_APPROVAL=I_APPROVE_DB05_SEED`; for a separately approved reset set `DB05_RESET_APPROVAL=I_APPROVE_DB05_RESET`. One approval never implies the other.
4. From `backend/`, after `npm run build`, invoke **only the approved action**: `npm run synthetic:seed` or `npm run synthetic:reset`. Both verify container metadata, TLS, database and role, and the migration ledger. They lock the application tables, reject unexpected schema features and compare their complete contents against an empty state or the exact fixture. Seed inserts only into empty tables; a repeated exact seed is a no-op. Partial, modified or unrelated application data is rejected. Reset deletes only the exact fixture IDs, reviews first, then books and users; empty reset is a no-op. It refuses mixed or changed data and preserves the schema and `public.schema_migrations`. The reset's destructive scope is those 7 fixture rows only. Extra inbound foreign keys, user triggers, rules, inheritance or row-level security cause refusal. These checks are not a substitute for independent inspection.
5. Before and after each separately approved operation, use an independent verified-TLS PostgreSQL session to confirm the database/role and expected state. For example, run `SELECT current_database(), current_user, session_user;`, `SELECT version, filename, checksum FROM public.schema_migrations ORDER BY version;` and `SELECT (SELECT count(*) FROM public.users) AS users, (SELECT count(*) FROM public.books) AS books, (SELECT count(*) FROM public.reviews) AS reviews, (SELECT count(*) FROM public.books WHERE is_favorite) AS favorites;`. Expected counts are `0,0,0,0` before first seed and after reset, and `2,3,2,2` after seed. Independently verify ownership with `SELECT count(*) FROM public.reviews r LEFT JOIN public.books b ON b.id = r.book_id AND b.user_id = r.user_id WHERE b.id IS NULL;` (expected 0), and check the complete fixture, not counts alone. Do not expose connection details or private data.

Operations have five-second connection/query/server-statement timeouts and a 120-second process watchdog. On any failure, timeout, interrupted connection or uncertain COMMIT, stop and independently verify the target, rows and ledger; rollback/cleanup is attempted, not guaranteed. Do not blindly retry. `npm run test:synthetic` uses disconnected fakes and does not validate SQL, TLS, privilege behavior or real transaction outcomes.

### Frontend

In another terminal, from the repository root:

```bash
cd frontend
npm install
```

Create `frontend/.env.local` with the local API address:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

Then start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`. To build and serve an optimized local frontend, run `npm run build` and `npm run start` from `frontend/`.

## Tests

With dependencies installed, run these commands from the repository root in separate terminals:

```bash
cd frontend
npm test
npm run lint
```

```bash
cd backend
npm test
npm run test:security
```

Backend tests use synthetic data and isolated temporary SQLite databases. Local tests cover functionality and cross-user isolation, but CI and comprehensive browser validation remain pending.

## Project status

ReadStack is being modernized. Its features and tests exist locally, but that is not production approval. Comprehensive browser validation, security and deployment gates, CI, and decisions about sessions and persistence remain outstanding.

The default application uses SQLite; the experimental PostgreSQL runtime has limited owner-reported disposable-server validation, not comprehensive parity or production validation. Neon has been selected for eventual PostgreSQL deployment, but hosted-provider connectivity and the migration remain unverified. A staging strategy has not been approved, and durable production persistence and recovery have not been verified. The modernization changes are not claimed as deployed or production-ready. See [PROGRESS.md](PROGRESS.md) and [PLAN.md](PLAN.md) for current status and pending decisions.

---

**Author:** José A. Mota · [Project repository](https://github.com/JoseAMota11/read-group-challenge)
