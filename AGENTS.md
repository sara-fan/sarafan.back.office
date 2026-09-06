<!--
Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
All rights reserved.
This file is a part of the Sarafan application
-->

# Repository instructions

## Specification and repository guidance

- Follow the current specification identified in the [specification README](https://github.com/sara-fan/sarafan.spec#source-of-truth). If an implementation issue conflicts with it, flag the discrepancy before implementing the affected behavior.
- In implementation PR descriptions, cite the governing specification version and section, and link the planning issue. Use any suitable format; the PR template is optional.
- When a change introduces or changes a lasting convention, API contract, domain invariant, security/privacy rule, workflow, or test pattern, update the nearest relevant `AGENTS.md` in the same PR. Keep entries concise and reusable.
- Otherwise, include `AGENTS.md: no durable change` in the PR description.
- Before editing documentation, read its current revision and preserve user-authored changes. Keep product requirements in the specification and task-specific discussion in the issue.

## Copyright headers

- Add the Sarafan copyright header to every file you create or modify whenever the file format safely supports comments.
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
- Follow the Logibooks operational workspace pattern: land directly on the role's primary work screen; use a light Vuetify app bar and navigation drawer; use compact blue page headings, separators and grouped icon actions; and keep forms and tables dense. Account editors use the flat compact Logibooks row layout, edit title and double-check save action, with accessible eye/crossed-eye controls for both password fields. Use a simple, vertically centered login form with Sarafan branding and enough width for common errors.
- Every user-relevant failure has one presentation owner. Stores reject transport/server failures; no empty catches or unobserved promise rejections. Expected suppression uses the named shared policy.
- Render one shared page alert immediately below the heading for failures that need page-level presentation. Omit it when all validation failures are already presented beneath visible controls. Put field errors beneath controls without shrinking inputs. Failed forms retain values; navigate only after success. Clear stale alerts on successful navigation.
- Use shared confirmation/dialog primitives and Sarafan semantic colors, explicit action labels and keyboard-accessible controls. Color is never the only indication of meaning.
- Add asynchronous rejection-path tests verifying propagation and visible presentation, preserved failed forms, retry behavior and duplicate-reporting prevention. Run lint, coverage and build before handoff.
- Pin shared-package release tarball URLs and commit lockfile integrity. Do not commit sibling file dependencies. Shared changes require packed-artifact tests in both consumers.

## Staff identity and authorization

- Follow sara-fan/sarafan.back.office#1 and sara-fan/sarafan.core#13 for the internal back office; Product Spec v1.14 governs the customer facade.
- Use only /api/v1/backoffice staff endpoints and separate staff credentials/cookies. Access tokens remain in memory. Never reuse customer identity, customer consent or phone verification.
- Authorize by the stable administrator, shift-manager, senior-operator and operator codes through a deny-by-default action matrix; only administrator can manage staff.
- Keep all account state scoped to the current session; ignore stale asynchronous responses after logout or identity change. Server authorization remains authoritative.
- Disable rather than delete. Preserve the last-administrator protection and require login after security-relevant self-changes.
- Route an administrator's Profile entry to `/users/{ownId}` so it uses the full staff account editor; keep `/profile` as the restricted self-service form for non-administrators.
- Require back-office passwords to contain 8 to 18 characters and describe both limits in characters. Keep UI validation and guidance aligned with Core; do not ask users to count encoded bytes.
- Serve on its own origin/container at sb.sw.consulting. Keep logging identity and runtime configuration independent of the customer application.

## Action buttons

- Use the Logibooks ActionButton concept for application actions: an icon, tooltip, item payload emitted on click, semantic variant, and disabled/loading state. Use the local ActionButton component; row actions are icon-only and primary form actions may add visible labels.
- Keep disabled-action explanations keyboard-accessible through a focusable tooltip activator. Never emit actions while disabled or loading. Keep native button types and accessible names. Navigation and confirmations stay with the owning view.
- Use Sarafan SVG icons, palette, focus styles and reduced-motion behavior; do not add per-call button styling.

- Application logger adapters fix service/version identity, event catalogue, severities and catalogue validation after configurable test/runtime options; callers cannot override these invariants.

## GitHub Actions conventions

- Pin reusable actions to published version tags and give every workflow step a descriptive name.
