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
  }
})
