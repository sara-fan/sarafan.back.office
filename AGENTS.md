# Repository instructions

## Specification and repository guidance

- Follow the current specification identified in the [specification README](https://github.com/sara-fan/sarafan.spec#source-of-truth). If an implementation issue conflicts with it, flag the discrepancy before implementing the affected behavior.
- In implementation PR descriptions, cite the governing specification version and section, and link the planning issue. Use any suitable format; the PR template is optional.
- When a change introduces or changes a lasting convention, API contract, domain invariant, security/privacy rule, workflow, or test pattern, update the nearest relevant `AGENTS.md` in the same PR. Keep entries concise and reusable.
- Otherwise, include `AGENTS.md: no durable change` in the PR description.
- Before editing documentation, read its current revision and preserve user-authored changes. Keep product requirements in the specification and task-specific discussion in the issue.

## Copyright headers

- Add the Sarafan copyright header to every file you create or modify whenever the file format safely supports comments.
- Markdown files do not require the Sarafan copyright header; do not add it to `.md` files.
- Use the comment syntax appropriate for the file type. Keep shebangs, encoding declarations, XML declarations, and other required first-line directives before the header.
- Do not add a header where comments are unsupported or would alter behavior, and do not modify generated files, dependency files, build output, coverage output, lockfiles, or binary files solely to add a header.
- Preserve an existing copyright or license header instead of adding a duplicate.

For JavaScript and other files that support `//` comments, use:

```js
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
```

For other comment-capable formats, use the same three lines with that format's native comment syntax.

## Error handling

- Treat RFC 9457 `type` as the canonical machine-readable identifier for Core API failures. Never branch on localized `title`, `detail`, raw exception text, or HTTP status alone.
- Accept a Core error as structured only when its media type is `application/problem+json` and it contains a valid Sarafan `type`, matching HTTP/body `status`, Russian `title` and `detail`, `instance`, and `code`. Preserve optional `errors` and `traceId` without flattening them.
- Do not add compatibility parsing for partial Problem Details, arbitrary JSON, `msg`, legacy envelopes, or bodyless error responses. Normalize malformed or inconsistent server responses to the internal UI protocol problem.
- Send `Accept: application/json, application/problem+json` for JSON endpoints.
- Use the shared `ProblemError` abstraction for API and internal failures. Components must retain the structured problem, use the shared presentation and field-error helpers, and must not render an unknown `Error.message`.
- Model browser-originated and local failures with RFC 9457 field semantics under `https://sarafan.sw.consulting/problems/ui/`, but omit `status` when no HTTP response exists and never claim the `application/problem+json` media type for an internal failure.
- Create internal problems through the centralized catalogue. Their type, code, Russian title, and safe Russian default detail are stable UI contracts; generate a unique `instance` for each occurrence.
- Keep an internal problem's original JavaScript `cause` non-enumerable and diagnostic-only. Never render, serialize, persist, or log the cause or raw payload, especially when it may contain personal data, tokens, or browser/native error text.
- Represent local and remote validation with structured `errors` collections and expose field messages through the shared helper instead of flattening them into a generic string.
- Preserve single-flight token refresh and retry an authorized request at most once. Treat only the canonical invalid-refresh-token problem type as expected session expiry; distinguish network restore failures and offer an explicit retry state.
- Treat HTTP 5xx responses and invalid HTTP response formats as service unavailability. Clear the authenticated session and show `Сервис недоступен. Пожалуйста, повторите позже.` on the login screen, except for the supplementary staff status lookup below.
- Route intentional suppression through a named shared policy. Version lookup and server logout failures may be suppressed after normalization.
- Load versions and official USD/RUB rates only through authorized `/api/v1/backoffice/status`, scoped to the current identity/session. Status transport, 5xx and malformed-data failures show `USD —` with an accessible Russian explanation without clearing an otherwise valid session. Authentication/refresh failures still obey the identity policy. Retain source dates over weekends/holidays; never relabel a non-unit nominal as one USD or apply commercial adjustments.
- Keep the exchange-rate block in the existing light app bar: `ru-RU` source date `dd.MM.yy`, four decimal places, blue `#1976d2`, strong `text-green-darken-3` (`#2e7d32`), `0.875rem` text and `0.75rem` gap. It must coexist with keyboard navigation at narrow widths; user-name space may yield.
- Add tests for every new problem type, parser validation and retry branch, structured field errors, non-serialization of causes, and intentional recovery/suppression policy. New and modified code must satisfy the repository's 95% coverage thresholds.

## Observability and logging

- Emit UI logs only through the stable catalogue and facade in `src/observability/`. Direct `console.*` calls are forbidden outside the console sink, and call sites must not construct free-form events, messages, or attribute objects outside the catalogue contract.
- Every event must have a stable dotted name, OpenTelemetry severity number/text, fixed English human-readable message template, RFC 3339 UTC timestamp, `sarafan.back.office` resource identity, and typed allowlisted attributes. Keep console output single-line readable text, never raw JSON or a code-only record.
- Treat `SARAFAN_BACKOFFICE_LOGGING_ENABLED=true|false` as the authoritative runtime master switch. Missing/invalid values disable logging. The value must come from the startup-generated `runtime-config.js`, load before the application bundle, use `Cache-Control: no-store`, and require at most a same-image container restart—never a bundle/image rebuild.
- Keep W3C `traceparent` generation and propagation independent of the logging switch. One logical API operation retains its 32-hex trace ID across refresh/retry and uses a new 16-hex span ID for each network attempt. Prefer the validated RFC 9457 server `traceId` when reporting a Core failure.
- Log API failures only after retry/refresh policy finishes, using method, a catalogue-approved route template, status, stable problem identity, correlation IDs, and retry count. Never log raw URLs/query strings, headers, bodies, tokens/cookies/codes, personal data, DOM/storage/history/device data, localized Problem Details text, arbitrary rejected values, Error messages/stacks, or `ProblemError.cause`.
- Normalize and mark handled failures at their ownership boundary so the API client, session store, Vue handler, `window.error`, and `unhandledrejection` cannot report the same failure repeatedly. Intentional suppression must use a stable operation code.
- Keep the logger and every sink non-throwing. Apply bounded rate limiting to repeated global failures and emit only an aggregate dropped count without retaining payloads.
- Production logging defaults to Warning and Development may use Debug, both beneath the runtime master switch. Thresholds and switches must never bypass sanitization or change the allowed fields.
- Extend tests for record shape/readability, catalogue enforcement, redaction, runtime control, W3C generation/retry propagation, RFC 9457 correlation, deduplication, rate limiting, global boundaries, and sink failure. Preserve at least 95% coverage for new and modified code.

## Shared infrastructure and UI behavior

- Use @sara-fan/ui-shared for problem parsing, HTTP transport, tracing and privacy-safe diagnostics. Keep identity state, runtime configuration, route allowlists, fixed event catalogues and domain-specific problems in this application.
- Follow this repository's operational workspace rules throughout the application; Logibooks may be consulted only as a non-normative visual reference and never overrides the specification or local rules. Land directly on the role's primary work screen; use a light Vuetify app bar and navigation drawer; use compact blue page headings, separators and grouped icon actions; and keep forms and tables dense. List screens use the user list as their reference layout: count badge, grouped header actions, compact solo filters, shared alert and header recovery state, and a compact fixed-header `v-data-table` inside the shared table card. Every create or edit action initiated from a table navigates to a dedicated route and view; do not place create/edit forms beneath or inside list tables. All dedicated create/edit views use the user editor's flat compact form styling without a surrounding card, and use the same native `check` pattern for checkboxes. Editors use the double-check save action, with accessible eye/crossed-eye controls for password fields. Use a simple, vertically centered login form with Sarafan branding and enough width for common errors.
- Every user-relevant failure has one presentation owner. Stores reject transport/server failures; no empty catches or unobserved promise rejections. Expected suppression uses the named shared policy.
- Render one shared page alert immediately below the heading for failures that need page-level presentation. Every shared error and notice alert has an accessible close button and presents a later message after its source changes. Omit the page alert when all validation failures are already presented beneath visible controls. Put field errors beneath controls without shrinking inputs. Failed forms retain values; navigate only after success. Clear stale alerts on successful navigation.
- Use shared confirmation/dialog primitives and Sarafan semantic colors, explicit action labels and keyboard-accessible controls. Color is never the only indication of meaning.
- Add asynchronous rejection-path tests verifying propagation and visible presentation, preserved failed forms, retry behavior and duplicate-reporting prevention. Run lint, coverage and build before handoff.
- Pin shared-package release tarball URLs and commit lockfile integrity. Do not commit sibling file dependencies. Shared changes require packed-artifact tests in both consumers.

## Staff identity and authorization

- Follow sara-fan/sarafan.back.office#1 and sara-fan/sarafan.core#13 for the internal back office; Product Spec v1.14 governs the customer facade.
- Use only /api/v1/backoffice staff endpoints and separate staff credentials/cookies. Access tokens remain in memory. Never reuse customer identity, customer consent or phone verification.
- Enforce the browser-side staff/customer boundary before `fetch`: accept only root-relative `/api/v1/backoffice/...` routes, and reject customer, non-back-office, absolute and cross-origin targets through a privacy-safe internal problem that never retains or logs the raw URL. Server authorization remains authoritative.
- Authorize by the stable administrator, shift-manager, senior-operator and operator codes through a deny-by-default action matrix; only administrator can manage staff.
- Keep all account state scoped to the current session; ignore stale asynchronous responses after logout or identity change. Server authorization remains authoritative.
- Disable rather than delete. Preserve the last-administrator protection and require login after security-relevant self-changes.
- Route an administrator's Profile entry to `/users/{ownId}` so it uses the full staff account editor; keep `/profile` as the restricted self-service form for non-administrators.
- Require back-office passwords to contain 8 to 18 characters and describe both limits in characters. Keep UI validation and guidance aligned with Core; do not ask users to count encoded bytes.
- Serve on its own origin/container at sb.sw.consulting. Keep logging identity and runtime configuration independent of the customer application.

## Action buttons

- Use the local ActionButton component for application actions: an icon, tooltip, item payload emitted on click, semantic variant, and disabled/loading state. Workspace and recovery ActionButtons are icon-only; only login actions and modal-dialog actions may add visible labels. Put the full Russian action text in the tooltip and accessible name.
- Keep disabled-action explanations keyboard-accessible through a focusable tooltip activator. Never emit actions while disabled or loading. Keep native button types and accessible names. Navigation and confirmations stay with the owning view.
- Use Font Awesome Free through Vuetify for replaceable application and framework icons, referenced through centralized semantic aliases rather than raw paths or per-call classes. Native browser controls and Sarafan brand artwork are exempt when replacement is infeasible. Use the Sarafan palette, focus styles and reduced-motion behavior; do not add per-call button styling.
- Every authenticated workspace header action group includes refresh. Do not render a second load-retry action when header refresh is available. Before refresh reloads an editor with unsaved changes, require confirmation in a labelled modal and preserve the form when confirmation is cancelled.
- Use the Font Awesome double-check icon for actions that commit current editor changes. The login screen and modal dialogs are exempt from the icon-only and workspace-refresh rules.

- Application logger adapters fix service/version identity, event catalogue, severities and catalogue validation after configurable test/runtime options; callers cannot override these invariants.

## GitHub Actions conventions

- Pin reusable actions to published version tags and give every workflow step a descriptive name.

## Versioned customer consent

- Consent history contains only versioned events with a document ID and content digest. Do not add legacy record labels or fallbacks; pre-versioned records are deleted by the Core consent migration, and existing customers without a new receipt have missing consent.

- Spec v1.16 §4.18 / back.office #6 govern the legal-document and withdrawal-request screens. `manageLegalDocuments` remains Administrator-only. The separate `manageConsentWithdrawalRequests` action is available only to Administrator, Shift manager and Senior operator; Senior operator lands on `/privacy-requests`. All requests stay under `/api/v1/backoffice`, and customer consent never authorizes staff identity.
- Legal-document and withdrawal-queue requests retain the current staff session on transport/protocol/5xx failures; failed queue processing retains the loaded rows. Authentication/refresh failures retain their normal identity policy. Ignore stale responses after a session change.
- Use `v-data-table-server` and Core's complete shared page envelope for the withdrawal queue and legal-document audit. Keep page sizes at 10/25/50/100, use one allowlisted server sort, debounce text search by 300 ms, reset filters/sort/page-size changes to page 1, reject stale or malformed envelopes, and correct/persist page underflow with one authoritative reload.
- Persist each server table's page, page size, sort and filters in versioned browser `localStorage`, keyed by authenticated staff ID and stable view key. Restore only after identity is known, validate the entire record before use, preserve it on logout, and treat blocked/quota-failed storage as a non-fatal privacy-safe notice. Never log keys, values or persisted preference contents; browser preferences do not synchronize across origins, browsers or devices.
- Upload UTF-8 `.md` up to 256 Кб on the dedicated `/legal-documents/new` page. The page heading is the only heading above the upload form; label the version field `Версия`, give the kind selector more horizontal space than the title field, and cap the version and effective-date controls at compact desktop widths. Allow Core canonical preview before the display version is assigned. Entering or changing the display version after preview keeps that preview valid and updates the creation payload because the version is not rendered; changes to the kind, locale, title, effective date or file invalidate it. Keep final creation unavailable until a non-empty version and a valid preview are present. Present the preview as canonical content in one plain bordered area, without a caption, metadata, hashes, download, print, or explanatory controls. Any rejection shown for the upload identifies the specific invalid field or unsupported source construct. A document is created once with a required today-or-future effective date at 00:00 Europe/Moscow and cannot be edited; return to the list immediately after creation. Each list row has exactly two icon actions: view and delete. Keep delete visible but disabled when Core says deletion is unavailable; confirm enabled deletion and refresh the list after deletion or a boundary conflict. Keep creation/deletion history in a separate read-only, filterable, paginated audit table whose rows remain useful after document deletion.
- Validate Core's `cookieCategories` catalogue from the staff legal-document ops response. Use its numeric values, Russian names and required flags as the only category metadata; do not compile local mappings or submit category fields when previewing or creating a document. Show Core-assigned categories as read-only document information. Use `куки` in Russian user-facing text while retaining English technical identifiers.
- Keep the safe reader/formatting contract identical to the customer reader. Do not add a general-purpose customer-consent history list, search or view to back.office. `/privacy-requests` is a table-only queue with customer ID, request time and processed flag; it has no detail/edit route. Every row shows `Выполнить`, disabled when processed, and calls the exact processing endpoint directly. The flag records only that staff report manual work outside the application; it does not itself change consent, access, account or data, and the UI must not claim those effects.
