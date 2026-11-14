# Release smoke checklist (`TEST-05`)

Use this procedure only after the owner authorizes the specific environment and checks. Follow [environment governance](ENVIRONMENT_GOVERNANCE.md); this checklist does not authorize hosted access, registration, mutations, deployment or production testing. Confirm the target, branch and deployed revision; stop if uncertain. Staging uses authorized synthetic accounts and data only. Never record credentials, invitation values, tokens, cookies, CSV private content or other sensitive data.

Record date, operator, environment, deployed revision, each check and outcome, relevant HTTP status, and a link to non-sensitive evidence. Mark unrun checks explicitly; stop and report failures rather than assuming a pass. Use two authorized synthetic accounts A and B and disposable data. Do not delete or modify existing data without specific authorization.

- [ ] Registration: where invitation control applies, check missing and incorrect invitations are denied, then register a new synthetic account using an authorized valid invitation. Confirm the new account can log in. Do not disclose the invitation; if account creation is not authorized, record this check as unrun.
- [ ] Login and logout: authenticate and confirm access to the account's library; log out and confirm protected access is denied until logging in again.
- [ ] Books: create, read, edit and delete a disposable book; reload to verify persistence and deletion. Retain separate disposable books for the remaining checks.
- [ ] Reviews: create and delete a review on an owned book; reload and verify each change.
- [ ] Favorites: mark and unmark an owned book, checking persistence after reload.
- [ ] Filters and pagination: use known synthetic books to verify filter results and navigation across pages.
- [ ] CSV: export an owned book and verify the expected synthetic content without recording private contents.
- [ ] Isolation: confirm A and B see only their own libraries. Using B, attempt to read, edit and delete A's book, list/create/update/delete reviews on A's book, and export A's book. Confirm denial without foreign data or CSV, and verify A's book and reviews remain unchanged. Record each operation and status independently.

For staging `DB-06`, also record the separate warm and cold latency checks and provider usage against the approved targets in [environment governance](ENVIRONMENT_GOVERNANCE.md#staging-strategy-adr-gov-04-d-018). Review quotas and costs without assuming future free usage. Prior owner-reported results and unresolved gaps are linked from [PROGRESS.md](../PROGRESS.md#test-05-and-db-06-staging-evidence-assessment); do not treat earlier results as evidence for a different release or environment.
