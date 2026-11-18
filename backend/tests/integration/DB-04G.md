# DB-04G: opt-in PostgreSQL startup and shutdown validation

The owner reports a successful disposable live run and independent post-check; see `PROGRESS.md` for its scope and limitations. DB-04 has qualified foundation acceptance, not production readiness. This harness must not be included in the normal test suite. It uses the DB-04F target only if its identity and current safety are independently reconfirmed; its historical existence, state and authorization are not assumed.

## Authorization and safety boundaries

Obtain explicit written owner approval for this specific container `0b33e7bb22bebfc11cf4289747bab878c05cb1e9cac384c76bd113b7cfea064b`, independently verified image ID, `127.0.0.1:55491`, database `readstack_disposable_db04f`, role `readstack_db04f_runner`, and the following operations: Docker identity inspection; TLS PostgreSQL connections and read-only SQL (including ledger, catalog, empty tables and `pg_stat_activity`); a local ephemeral HTTP listener and synthetic JWT; creation/removal of a private temporary synthetic migration manifest; startup/shutdown and independent post-checks. No database/container/TLS-material creation, migration, write, reset or removal is performed or authorized by this procedure. Resource cleanup after an interrupted run, if needed, requires a separate specific approval. An environment variable or interactive confirmation is not a substitute for written approval.

Before invoking, the owner must independently verify the full container and image IDs, local Docker daemon and loopback port binding, no mounts, tmpfs and restart policy, database and session role, approved `0001` ledger and empty application tables. Confirm no other clients or operators can change the target or redirect the port throughout the run. No SQLite records, external service or production data are in scope. If the target is missing, changed, not isolated or cannot be verified, **stop**, do not create or repair it as part of this procedure.

## WSL procedure (only after the approvals above)

In a private terminal, with Node 22 and existing backend dependencies, first perform the independent identity/read-only checks above using owner-controlled credentials and the DB-04F procedure. Do not paste raw Docker inspect output, connection strings or secret material into logs, issues or chat. Verify the image ID without printing container environment, for example:

```sh
timeout 10s docker inspect --format '{{.Id}} {{.Image}}' 0b33e7bb22bebfc11cf4289747bab878c05cb1e9cac384c76bd113b7cfea064b
```

Confirm this ID and image are the approved ones, and separately inspect the non-secret mount, restart and port fields. Independently verify the Docker daemon and endpoint, not just matching names. Then, from `backend/` in a clean shell with no inherited `PG*` variables, use a private subshell. Enter the existing synthetic URL and CA path without disclosing them; the URL must have no query options. The subshell does not change the parent environment:

```bash
(
  set -e
  set +x
  read -r -p 'Approved sha256 image ID: ' DB04G_IMAGE_ID
  read -r -p 'Existing local test CA certificate path: ' NODE_EXTRA_CA_CERTS
  read -r -s -p 'Existing synthetic PostgreSQL URL: ' DATABASE_URL
  printf '\n'
  export DB04G_IMAGE_ID NODE_EXTRA_CA_CERTS DATABASE_URL
  export DATABASE_PROVIDER=postgres POSTGRES_TLS=verify-full
  timeout --signal=TERM --kill-after=10s 140s node --import tsx tests/integration/postgres-lifecycle.ts
)
```

When prompted, type the exact `APPROVE <full-container-ID>` displayed by the harness only after written approval and independent checks. The harness refuses non-TTY input; this prompt confirms deliberate invocation, not legal or operational authorization. `NODE_EXTRA_CA_CERTS` must trust the already-configured server certificate with IP SAN `127.0.0.1`. Do not change TLS verification. The PostgreSQL URL is passed only via the process environment; protect the machine and process environment from other users. The test uses a new process-local synthetic JWT secret and does not read or change the application's existing secret.

After success, independently recheck the same container and endpoint, ledger and all three empty tables through a separately authorized read-only session; check that no test listener or test-created PostgreSQL session remains. The harness also uses a separate PostgreSQL client after shutdown to check identity, ledger, emptiness and the observed pool backend PID. A reported success requires exit code 0 and its final success message. On any failure, timeout, identity discrepancy or interrupted run, stop and isolate the target; do not assume cleanup, retry, mutate, or remove resources without specific approval. Temporary files or sockets may remain after forced termination.

## What is and is not tested

The harness calls the real `startApplication`, default PostgreSQL readiness implementation and real `pg.Pool` with application settings. It supplies a listener solely to bind an ephemeral `127.0.0.1` port and captures the registered shutdown callback, rather than using the unmodified entry point, default listener or OS signals. An authenticated synthetic HTTP GET causes a real pool query; shutdown is called, the pool rejects further queries, the listener stops, and an independent connection checks the observed pool backend PID has disappeared. This does not prove all sessions or stalled connections are cleaned up under all conditions.

For the failure case, the harness creates a synthetic `0001` manifest outside the repository with a different checksum and passes that directory to the real readiness checker. The checker connects to the unchanged target and rejects the actual ledger before pool construction or its listener callback. It never executes the manifest. This is a non-mutating ledger mismatch, **not** evidence of a physically invalid schema, unmodified default startup entry point, or all possible readiness failures. The temporary file and directory are removed on normal completion and best-effort error cleanup; a hard kill can leave them behind.

Connection/query/statement settings use the application's five-second limits, readiness and shutdown use its five-second operation bounds, HTTP requests have five-second timeouts, Docker inspection has a five-second bound, the overall process has a 120-second watchdog, and the external command has a 140-second timeout plus ten-second kill grace. These are bounds on attempts, not proof that a stalled driver or server has closed. The watchdog may terminate without executing cleanup. Only one observed pool backend PID is checked; other sessions, PID reuse, privileges and `pg_stat_activity` visibility limit what this proves.

Disconnected checks from `backend/`: `node --import tsx --test tests/integration/db04g-guard.test.ts` and `npx tsc --noEmit --strict --esModuleInterop --skipLibCheck --target es2022 --module commonjs src/types/express.d.ts tests/integration/db04g-guard.ts tests/integration/db04g-guard.test.ts tests/integration/postgres-lifecycle.ts`. They do not run the live harness or contact Docker/PostgreSQL.
