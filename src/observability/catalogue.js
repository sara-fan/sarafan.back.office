// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export const SEVERITY = Object.freeze({
  DEBUG: Object.freeze({ text: 'DEBUG', number: 5 }),
  INFO: Object.freeze({ text: 'INFO', number: 9 }),
  WARN: Object.freeze({ text: 'WARN', number: 13 }),
  ERROR: Object.freeze({ text: 'ERROR', number: 17 }),
  FATAL: Object.freeze({ text: 'FATAL', number: 21 })
})

function event(name, severity, body, allowedAttributes, options = {}) {
  return Object.freeze({
    name,
    severity,
    body,
    allowedAttributes: Object.freeze(allowedAttributes),
    rateLimited: options.rateLimited === true
  })
}

export const EVENTS = Object.freeze({
  applicationStarted: event(
    'sarafan.back.office.application.started',
    SEVERITY.INFO,
    () => 'Sarafan Back Office started.',
    []
  ),
  applicationError: event(
    'sarafan.back.office.application.error',
    SEVERITY.ERROR,
    () => 'An unexpected application error prevented a UI operation from completing.',
    ['error.type'],
    { rateLimited: true }
  ),
  promiseUnhandled: event(
    'sarafan.back.office.promise.unhandled',
    SEVERITY.ERROR,
    () => 'An unhandled promise rejection prevented a UI operation from completing.',
    ['error.type'],
    { rateLimited: true }
  ),
  apiRequestFailed: event(
    'sarafan.back.office.api.request.failed',
    SEVERITY.WARN,
    (attributes) => `API request failed: ${attributes['http.request.method'] ?? 'UNKNOWN'} ${attributes['http.route'] ?? '<unknown>'} -> ${attributes['http.response.status_code'] ?? 'no response'}.`,
    [
      'http.request.method',
      'http.route',
      'http.response.status_code',
      'error.type',
      'sarafan.problem.code',
      'sarafan.problem.instance',
      'retry.count'
    ]
  ),
  sessionRestoreFailed: event(
    'sarafan.back.office.session.restore.failed',
    SEVERITY.WARN,
    () => 'The staff session could not be restored.',
    ['error.type', 'sarafan.problem.code', 'sarafan.problem.instance']
  ),
  operationSuppressed: event(
    'sarafan.back.office.operation.suppressed',
    SEVERITY.INFO,
    (attributes) => `An expected failure was suppressed for ${attributes['operation.name'] ?? 'unknown operation'}.`,
    ['operation.name', 'error.type', 'sarafan.problem.code', 'sarafan.problem.instance']
  ),
  eventsDropped: event(
    'sarafan.back.office.events.dropped',
    SEVERITY.WARN,
    (attributes) => `Dropped ${attributes['event.dropped_count'] ?? 0} repeated ${attributes['event.name'] ?? 'unknown'} events.`,
    ['event.name', 'event.dropped_count']
  )
})

const DEFINITIONS = new Set(Object.values(EVENTS))

export function isCatalogueEvent(value) {
  return DEFINITIONS.has(value)
}
