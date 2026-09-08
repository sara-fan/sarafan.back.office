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
export const UUID_PATH_PATTERN = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'

const BACK_OFFICE_API_PREFIX = '/api/v1/backoffice/'
const ROUTE_VALIDATION_ORIGIN = 'https://sarafan.invalid'
const ENCODED_PATH_BOUNDARIES = /%(?:2e|2f|5c)/iu
const LEGAL_DOCUMENT_ROUTE_PATTERN = new RegExp(`(/legal-documents/)${UUID_PATH_PATTERN}(?=/source$|$)`, 'iu')

const API_ROUTE_TEMPLATES = new Set([
  '/api/v1/backoffice/legal-documents',
  '/api/v1/backoffice/legal-documents/ops',
  '/api/v1/backoffice/legal-documents/{id}',
  '/api/v1/backoffice/legal-documents/preview',
  '/api/v1/backoffice/legal-documents/audit',
  '/api/v1/backoffice/legal-documents/{id}/source',
  '/api/v1/backoffice/consents/withdrawal-requests',
  '/api/v1/backoffice/consents/withdrawal-requests/processed',
  '/api/v1/backoffice/auth/login', '/api/v1/backoffice/auth/refresh', '/api/v1/backoffice/auth/logout', '/api/v1/backoffice/auth/me',
  '/api/v1/backoffice/users', '/api/v1/backoffice/users/me', '/api/v1/backoffice/users/ops', '/api/v1/backoffice/users/{id}', '/api/v1/backoffice/status'
])

function routeTemplate(path) {
  try {
    const pathname = new globalThis.URL(path, ROUTE_VALIDATION_ORIGIN).pathname.replace(LEGAL_DOCUMENT_ROUTE_PATTERN, '$1{id}').replace(/(\/backoffice\/users\/)\d+$/u, '$1{id}')
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

function hasUnsafePathCharacters(pathname) {
  if (pathname.includes('\\')) return true
  return [...pathname].some(character => {
    const codePoint = character.codePointAt(0)
    return codePoint <= 0x1f || codePoint === 0x7f
  })
}

function isBackOfficeApiRoute(path) {
  if (typeof path !== 'string' || path.includes('#')) return false
  const queryStart = path.indexOf('?')
  const pathname = queryStart < 0 ? path : path.slice(0, queryStart)
  if (!pathname.startsWith(BACK_OFFICE_API_PREFIX)
    || hasUnsafePathCharacters(pathname)
    || ENCODED_PATH_BOUNDARIES.test(pathname)) return false

  try {
    const url = new globalThis.URL(path, ROUTE_VALIDATION_ORIGIN)
    return url.origin === ROUTE_VALIDATION_ORIGIN
      && url.pathname.startsWith(BACK_OFFICE_API_PREFIX)
  } catch {
    return false
  }
}

const httpTools = createHttpTools({ createInternalProblem, normalizeProblem, isHandled, markHandled, logger: uiLogger, failedEvent: EVENTS.apiRequestFailed, routeTemplate, shouldReportFailure, invalidAccessTokenType: CORE_PROBLEM_TYPES.invalidAccessToken, binaryAccept: PHOTO_ACCEPT })
export const { parseProblemResponse } = httpTools

export function createApiClient(options) {
  const client = httpTools.createApiClient(options)
  return Object.freeze({
    async request(path, requestOptions = {}, policy = {}) {
      if (!isBackOfficeApiRoute(path)) throw createInternalProblem('apiRouteBlocked')
      return client.request(path, requestOptions, policy)
    }
  })
}
