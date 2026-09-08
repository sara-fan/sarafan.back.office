// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { PROBLEM_TYPE_ROOT, createProblemTools } from '@sara-fan/ui-shared/problems'
import { EVENTS } from '../observability/catalogue.js'
import { uiLogger } from '../observability/logger.js'
export { PROBLEM_TYPE_ROOT, ProblemError } from '@sara-fan/ui-shared/problems'

export const CORE_PROBLEM_TYPES = Object.freeze({
  userNotFound: `${PROBLEM_TYPE_ROOT}backoffice-user-not-found`,
  invalidAccessToken: `${PROBLEM_TYPE_ROOT}invalid-backoffice-access-token`,
  invalidRefreshToken: `${PROBLEM_TYPE_ROOT}invalid-backoffice-refresh-token`,
  loginFailed: `${PROBLEM_TYPE_ROOT}backoffice-login-failed`,
  emailExists: `${PROBLEM_TYPE_ROOT}backoffice-email-exists`,
  lastAdministrator: `${PROBLEM_TYPE_ROOT}last-backoffice-administrator`,
  accessDenied: `${PROBLEM_TYPE_ROOT}access-denied`,
  validationFailed: `${PROBLEM_TYPE_ROOT}validation-failed`
})

export const { INTERNAL_PROBLEM_TYPES, createInternalProblem, normalizeProblem, presentProblem, problemFieldErrors, suppressProblem } = createProblemTools({
  logger: uiLogger, suppressedEvent: EVENTS.operationSuppressed, additions: {
    apiRouteBlocked: {
      suffix: 'api-route-blocked',
      code: 'ui_api_route_blocked',
      title: 'Недопустимый адрес запроса',
      detail: 'Приложение может обращаться только к служебному API'
    },
    serviceUnavailable: {
      suffix: 'service-unavailable',
      code: 'ui_service_unavailable',
      title: 'Сервис недоступен',
      detail: 'Сервис недоступен. Пожалуйста, повторите позже.'
    }
  }
})

export function hasOnlyPresentedFieldErrors(value, fields) {
  if (!value?.errors || typeof value.errors !== 'object' || Array.isArray(value.errors)) return false
  const presented = new Set(fields.map(field => field.toLowerCase()))
  const entries = Object.entries(value.errors)
  return entries.length > 0 && entries.every(([field, messages]) =>
    presented.has(field.toLowerCase()) && Array.isArray(messages) && messages.length > 0
  )
}
