<!-- Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
All rights reserved.
This file is a part of the Sarafan application -->

# Sarafan Back Office 0.0.2
[![ci](https://github.com/sara-fan/sarafan.back.office/actions/workflows/ci.yml/badge.svg)](https://github.com/sara-fan/sarafan.back.office/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/sara-fan/sarafan.back.office/graph/badge.svg?token=u3gQ7usaRT)](https://codecov.io/gh/sara-fan/sarafan.back.office)


Staff application for [back-office issue #1](https://github.com/sara-fan/sarafan.back.office/issues/1), using the separate identity API from [Core #13](https://github.com/sara-fan/sarafan.core/issues/13). Russian UI, Sarafan design tokens and Logibooks-style staff management and ActionButton controls.

## Run locally

Use Node 22.23.x or Node 24.15.x. Run `npm ci` and `npm run dev`, then open http://localhost:5174. Start Core on port 8080; set `SARAFAN_API_TARGET=http://localhost:5080` when using its native launch profile.

From the sibling Core checkout, `docker compose -f docker-compose.yml -f docker-compose.backoffice.yml up -d --build --wait` serves the container on http://localhost:8083. Set `SARAFAN_BACKOFFICE_PORT` to change the loopback port. Ordinary Core-only builds do not require this checkout.

The app consumes a versioned `@sara-fan/ui-shared` GitHub release tarball pinned by URL and lockfile integrity. Docker builds and clean installs do not need the sibling package repository.

## Staff workflows

- Email/password login, session restoration and logout. No public registration, customer phone verification or customer agreement flow.
- Administrators can search/filter/sort/page staff, create accounts, assign multiple fixed roles, update details, disable/reactivate accounts, and set passwords.
- All four roles can access their own names/password settings. Personal email and roles are read-only. Security-relevant changes terminate the affected sessions; the last active administrator cannot be disabled or demoted.
- Access tokens stay in memory; Core owns its separate HttpOnly refresh cookie. Expired sessions require login. Network/protocol restoration errors offer Retry. No staff records are persisted in browser storage.
- ActionButton emits its item payload, supplies icon/tooltip/semantic variant and prevents disabled/loading actions. Disabled explanations remain keyboard-accessible. The owning view handles navigation and confirmation.

## Official exchange-rate display

The signed-in app bar loads `/api/v1/backoffice/status` with the staff bearer token and displays Core's persisted official CBR USD/RUB rate. Deploy Core #16's migration/API before this UI (back.office #3). The anonymous health endpoint is not used for this display.

The response contains `appVersion` and `exchangeRates`; each rate has `provider: "CBR"`, `baseCurrency: "USD"`, `quoteCurrency: "RUB"`, `nominal`, `officialRate`, `sourceEffectiveDate` (ISO date), and `retrievedAt` (UTC timestamp). The UI displays the source date, not retrieval time. RUB applies to the given nominal of USD; non-unit nominals are explicitly labelled. Weekend/holiday dates remain valid, and no commercial adjustment is made.

Missing/invalid data or lookup failures show `USD —` and accessible `не удалось получить курс` while leaving navigation and a valid session usable. Session expiry still follows the normal authentication policy. A new signed-in identity triggers a fresh lookup; logout or identity changes discard outstanding results. Status is loaded once per signed-in identity, not continuously polled.

The compact block matches Logibooks' blue date (`#1976d2`), bold green amount (`text-green-darken-3`, `#2e7d32`), `0.875rem` type and `0.75rem` gap, with Russian four-decimal numbers and `dd.MM.yy` dates. Logibooks Core/UI are non-normative implementation/style references only, not runtime dependencies.

## Deploy and verify

Cloud service `backoffice` serves internal port 8080 at **https://sb.sw.consulting**, through same-origin staff API proxying. The shared edge resolves `sarafan-backoffice`; dedicated edge routing is maintained in Core. Configure DNS and certificate coverage before deployment. Image and version are independent of Core and the customer UI.

Set `SARAFAN_BACKOFFICE_LOGGING_ENABLED=true` to enable privacy-safe logs. Runtime config loads before the bundle and is uncached; changing logging requires only a container restart. Missing/invalid values disable logging. Trace propagation is independent of this switch.

Run `npm run lint`, `npm run coverage`, and `npm run build`. CI enforces 95% statements, branches, functions and lines. Staff bootstrap remains an opt-in Core migration operation with credentials supplied securely; never put them in this repository.

Workflow actions are pinned to verified upstream commit SHAs. Update pins in a
reviewed pull request after checking the upstream release and running CI and the
container build. Use a recent Docker Compose v2 supporting `--wait` and
`--wait-timeout` for Core deployment commands.

## Legal documents and privacy requests

The coordinated implementation follows [spec v1.16 §4.18](https://github.com/sara-fan/sarafan.spec/issues/30). [Core API and rollout guide](https://github.com/sara-fan/sarafan.core/blob/v008/docs/customer-consents.md); [contract and text templates](https://github.com/sara-fan/sarafan.spec/blob/consents/spec/Consent%20implementation%20contract.md). Legal text must be prepared and published by an Administrator before registration can process personal data; no consent is silently granted to existing customers.
