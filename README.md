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
| `DATABASE_PROVIDER` | `sqlite` (default) or experimental `postgres`; all other values fail startup. PostgreSQL integration has not been validated against a real server. |
| `PORT` | API port; defaults to `3000`. Set it to `4000` for the frontend configuration below. |

With those variables configured, start the server from `backend/`:

```bash
npm start
```

With `PORT` set to `4000`, the API is available at `http://localhost:4000/api/v1`. See the [environment governance guide](docs/ENVIRONMENT_GOVERNANCE.md) for the full variable inventory, rate-limit options, and secret management. Keep secrets out of shell history and use distinct secrets for different environments; changing the signing key invalidates existing sessions.

Authentication rate limits are process-local, not distributed. Login and registration have per-account limits; the optional IP limit uses only the direct socket peer and is disabled by default. Enable it only after verifying that the direct peer is the actual client, not a proxy shared by clients. Render's ingress and client-IP behavior are unverified: do not enable this direct-peer limiter there on that assumption. A Render per-client limiter requires a separately verified, non-spoofable ingress/header trust boundary and a reviewed implementation; the current limiter deliberately ignores forwarded headers, even if Express proxy trust is enabled. Verify that clients cannot bypass the trusted ingress, how it sanitizes forwarding headers and identifies the client, and the correct trusted proxy configuration before designing such a change.

These limits do not stop attempts spread across many accounts, instances, or restarts. Registration currently reveals an existing email through its 409 response; changing that contract requires a separate decision. Unknown-user logins perform a dummy bcrypt comparison to reduce a timing signal, not guarantee constant-time responses; this extra synchronous work also increases the risk of CPU exhaustion under abuse.

### Experimental PostgreSQL runtime and startup readiness

PostgreSQL mode composes the user, book and review repositories explicitly and listens only after read-only readiness succeeds. It does not import the SQLite singleton or fall back to SQLite. The application pool is limited to five clients, with ten-second idle expiry and five-second connection, query and server statement timeouts. Startup failure attempts bounded pool cleanup; SIGINT/SIGTERM stop accepting requests, allow up to five seconds for draining, then close connections if needed and attempt bounded pool cleanup. A cleanup timeout does not prove an underlying client closed. PostgreSQL SQL, collation, authentication parity, actual pool behavior and shutdown have only fake-client coverage and have not been validated against a real server. Do not change production configuration or connect to any service on the basis of this foundation. SQLite remains the default and `DATABASE_PATH` is unchanged.

Book title, author and genre elements and review comments reject embedded U+0000 at request validation. Genre elements also reject unpaired UTF-16 surrogates, while valid pairs are accepted. These rules apply to both providers; existing stored records are not changed. PostgreSQL search, wildcard and JSONB genre parity remain unverified against a real server.

The PostgreSQL readiness configuration requires `DATABASE_URL` with a `postgres` or `postgresql` URL containing host, database, username and password, and `POSTGRES_TLS=verify-full`. URL query parameters and inherited `PG*` variables are rejected. TLS uses certificate and hostname verification with the Node trust store; no insecure TLS mode is provided. Do not log or publish the URL. The client has five-second connection, query and server statement timeouts; each readiness operation and cleanup also has a five-second bound. A stalled cleanup is reported as a failure, not proof that an unresponsive underlying client closed.

Readiness reads the packaged migration files from `backend/migrations` (which must accompany the compiled application), checks the existing `public.schema_migrations` ledger for an exact complete version, filename and checksum match, and uses PostgreSQL catalogs to check expected columns, types, nullability, primary/unique keys and cascading ownership foreign keys. It does not create a ledger, run migrations, or detect all drift: defaults, checks, indexes, collation, triggers, privileges and many other properties are outside this limited check. Readiness and TLS have only fake-client tests; real PostgreSQL compatibility, connectivity and deployment remain unverified. Startup readiness is not a substitute for the later staging and security gates.

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

- A disposable reset requires explicit approval, independently verified target identity, and confirmation that all target data is synthetic and disposable. No reset command has been tested; repeatable initialization and reset remain `DB-05` work.
- After a failed migration, stop, preserve evidence, and independently verify the ledger and schema. The runner attempts rollback, but rollback is not guaranteed in every failure.
- On a checksum mismatch, never edit the ledger or an already applied migration to force compatibility. Prefer reviewed sequential forward-fix migrations over destructive down-migrations.
- On lock contention, do not forcibly unlock or terminate unidentified sessions.
- If COMMIT's outcome is uncertain, do not blindly retry. Verify the actual schema and ledger from an independent connection; stop if they are inconsistent. Live connection-loss recovery during COMMIT has not been validated.

Application rollback is not database recovery: rolling code back does not restore data or reverse database writes. No tested backup, restore, recovery procedure, production readiness, or provider connectivity is implied by this CLI.

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

The default application uses SQLite; the experimental PostgreSQL runtime is not yet validated against a real server. Neon has been selected for eventual PostgreSQL deployment, but provider connectivity and the migration remain unverified. A staging strategy has not been approved, and durable production persistence and recovery have not been verified. The modernization changes are not claimed as deployed or production-ready. See [PROGRESS.md](PROGRESS.md) and [PLAN.md](PLAN.md) for current status and pending decisions.

---

**Author:** José A. Mota · [Project repository](https://github.com/JoseAMota11/read-group-challenge)
