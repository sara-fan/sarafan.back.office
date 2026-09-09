# Sarafan Back Office
[![ci](https://github.com/sara-fan/sarafan.back.office/actions/workflows/ci.yml/badge.svg)](https://github.com/sara-fan/sarafan.back.office/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/sara-fan/sarafan.back.office/graph/badge.svg?token=u3gQ7usaRT)](https://codecov.io/gh/sara-fan/sarafan.back.office)


Staff application for Sarafan Project

## Staff workflows

- Email/password login, session restoration and logout. No public registration, customer phone verification or customer agreement flow.
- Administrators can search/filter/sort/page staff, create accounts, assign multiple fixed roles, update details, disable/reactivate accounts, and set passwords.
- All four roles can access their own names/password settings. Personal email and roles are read-only. Security-relevant changes terminate the affected sessions; the last active administrator cannot be disabled or demoted.
- Access tokens stay in memory; Core owns its separate HttpOnly refresh cookie. Expired sessions require login. Network/protocol restoration errors offer Retry. No staff records are persisted in browser storage.
- The browser API client permits only root-relative `/api/v1/backoffice/...` routes. Customer, unknown, absolute and cross-origin routes are rejected before a network call; Core authorization remains authoritative.
- Font Awesome Free supplies replaceable icons through Vuetify and centralized semantic aliases. Workspace ActionButtons are icon-only with accessible Russian tooltips; login and modal actions retain visible labels. Every workspace action header owns refresh and dirty editors confirm before discarding changes. Logibooks is a non-normative visual reference only.

## Run locally

Use Node 22.23.x or Node 24.15.x. Run `npm ci` and `npm run dev`, then open http://localhost:5174. Start Core on port 8080; set `SARAFAN_API_TARGET=http://localhost:5080` when using its native launch profile.

From the sibling Core checkout, `docker compose -f docker-compose.yml -f docker-compose.backoffice.yml up -d --build --wait` serves the container on http://localhost:8083. Set `SARAFAN_BACKOFFICE_PORT` to change the loopback port. Ordinary Core-only builds do not require this checkout.

The app consumes a versioned `@sara-fan/ui-shared` GitHub release tarball pinned by URL and lockfile integrity. Docker builds and clean installs do not need the sibling package repository.

## Deploy and verify

Cloud service `backoffice` serves internal port 8080 at **https://sb.sw.consulting**, through same-origin staff API proxying. The shared edge resolves `sarafan-backoffice`; dedicated edge routing is maintained in Core. Configure DNS and certificate coverage before deployment. Image and version are independent of Core and the customer UI.

Set `SARAFAN_BACKOFFICE_LOGGING_ENABLED=true` to enable privacy-safe logs. Runtime config loads before the bundle and is uncached; changing logging requires only a container restart. Missing/invalid values disable logging. Trace propagation is independent of this switch.

Run `npm run lint`, `npm run coverage`, and `npm run build`. CI enforces 95% statements, branches, functions and lines. Staff bootstrap remains an opt-in Core migration operation with credentials supplied securely; never put them in this repository.

Workflow actions are pinned to verified upstream commit SHAs. Update pins in a
reviewed pull request after checking the upstream release and running CI and the
container build. Use a recent Docker Compose v2 supporting `--wait` and
`--wait-timeout` for Core deployment commands.
