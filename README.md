<!-- Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
All rights reserved.
This file is a part of the Sarafan application -->

# Sarafan Back Office 0.0.1

Staff application for [back-office issue #1](https://github.com/sara-fan/sarafan.back.office/issues/1), using the separate identity API from [Core #13](https://github.com/sara-fan/sarafan.core/issues/13). Russian UI, Sarafan design tokens and Logibooks-style staff management and ActionButton controls.

## Run locally

Use Node 22.23+ or Node 24.15+. Run `npm ci` and `npm run dev`, then open http://localhost:5174. Start Core on port 8080; set `SARAFAN_API_TARGET=http://localhost:5080` when using its native launch profile.

From the sibling Core checkout, `docker compose -f docker-compose.yml -f docker-compose.backoffice.yml up -d --build --wait` serves the container on http://localhost:8083. Set `SARAFAN_BACKOFFICE_PORT` to change the loopback port. Ordinary Core-only builds do not require this checkout.

The app consumes a versioned `@sara-fan/ui-shared` GitHub release tarball pinned by URL and lockfile integrity. Docker builds and clean installs do not need the sibling package repository.

## Staff workflows

- Email/password login, session restoration and logout. No public registration, customer phone verification or customer agreement flow.
- Administrators can search/filter/sort/page staff, create accounts, assign multiple fixed roles, update details, disable/reactivate accounts, and set passwords.
- All four roles can access their own names/password settings. Personal email and roles are read-only. Security-relevant changes terminate the affected sessions; the last active administrator cannot be disabled or demoted.
- Access tokens stay in memory; Core owns its separate HttpOnly refresh cookie. Expired sessions require login. Network/protocol restoration errors offer Retry. No staff records are persisted in browser storage.
- ActionButton emits its item payload, supplies icon/tooltip/semantic variant and prevents disabled/loading actions. Disabled explanations remain keyboard-accessible. The owning view handles navigation and confirmation.

## Deploy and verify

Cloud service `backoffice` serves internal port 8080 at **https://sarafan-b.sw.consulting**, through same-origin staff API proxying. The shared edge resolves `sarafan-backoffice`; dedicated edge routing is maintained in Core. Configure DNS and certificate coverage before deployment. Image and version are independent of Core and the customer UI.

Set `SARAFAN_BACKOFFICE_LOGGING_ENABLED=true` to enable privacy-safe logs. Runtime config loads before the bundle and is uncached; changing logging requires only a container restart. Missing/invalid values disable logging. Trace propagation is independent of this switch.

Run `npm run lint`, `npm run coverage`, and `npm run build`. CI enforces 95% statements, branches, functions and lines. Staff bootstrap remains an opt-in Core migration operation with credentials supplied securely; never put them in this repository.
