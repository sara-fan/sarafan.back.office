// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createHttpTools } from '@sara-fan/ui-shared/http'
import { CORE_PROBLEM_TYPES, createInternalProblem, normalizeProblem } from '../errors/problem.js'
import { EVENTS } from '../observability/catalogue.js'
import { uiLogger } from '../observability/logger.js'
import { isHandled, markHandled } from '../observability/deduplication.js'
export { JSON_ACCEPT } from '@sara-fan/ui-shared/http'
export const PHOTO_ACCEPT = 'image/avif, image/webp, image/png, image/jpeg, application/problem+json'

const API_ROUTE_TEMPLATES = new Set([
  '/api/v1/backoffice/legal-documents',
  '/api/v1/backoffice/legal-documents/{id}',
  '/api/v1/backoffice/legal-documents/{id}/publish',
  '/api/v1/backoffice/legal-documents/{id}/cancel',
  '/api/v1/backoffice/legal-documents/{id}/audit',
  '/api/v1/backoffice/legal-documents/{id}/source',
  '/api/v1/backoffice/consents/customers/{id}',
  '/api/v1/backoffice/consents/rights',
  '/api/v1/backoffice/consents/rights/{id}',
  '/api/v1/backoffice/auth/login', '/api/v1/backoffice/auth/refresh', '/api/v1/backoffice/auth/logout', '/api/v1/backoffice/auth/me',
  '/api/v1/backoffice/users', '/api/v1/backoffice/users/me', '/api/v1/backoffice/users/ops', '/api/v1/backoffice/users/{id}', '/api/v1/backoffice/status'
])

function routeTemplate(path) {
  try {
    const pathname = new globalThis.URL(path, 'https://sarafan.invalid').pathname.replace(/(\/legal-documents\/|\/consents\/rights\/)[0-9a-f-]{36}(?=\/(?:publish|cancel|audit|source)$|$)/iu, '$1{id}').replace(/(\/consents\/customers\/)\d+$/u, '$1{id}').replace(/(\/backoffice\/users\/)\d+$/u, '$1{id}')
    return API_ROUTE_TEMPLATES.has(pathname) ? pathname : undefined
  } catch {
    return undefined
  }
}

function shouldReportFailure(problem, retryCount) {
  if (problem.type === CORE_PROBLEM_TYPES.validationFailed
    || problem.type === CORE_PROBLEM_TYPES.loginFailed
    || problem.type === CORE_PROBLEM_TYPES.invalidRefreshToken) return false
  if (problem.type === CORE_PROBLEM_TYPES.invalidAccessToken) return retryCount > 0
  return true
}

export const { createApiClient, parseProblemResponse } = createHttpTools({ createInternalProblem, normalizeProblem, isHandled, markHandled, logger: uiLogger, failedEvent: EVENTS.apiRequestFailed, routeTemplate, shouldReportFailure, invalidAccessTokenType: CORE_PROBLEM_TYPES.invalidAccessToken, binaryAccept: PHOTO_ACCEPT })
