// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { readonly, ref } from 'vue'
import { UUID_PATH_PATTERN, createApiClient } from '../api/client.js'
import { CORE_PROBLEM_TYPES, INTERNAL_PROBLEM_TYPES, createInternalProblem, suppressProblem } from '../errors/problem.js'
import { can } from '../roles.js'

const BASE = '/api/v1/backoffice'
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const CONSENT_REQUEST_PATH_PATTERN = new RegExp(`^/(legal-documents(?:/(?:ops|preview|audit|${UUID_PATH_PATTERN}(?:/source)?))?|consents/withdrawal-requests(?:/processed)?)$`, 'iu')

function isServiceUnavailable(problem) {
  return problem?.type === INTERNAL_PROBLEM_TYPES.protocolError
    || problem?.type === INTERNAL_PROBLEM_TYPES.serviceUnavailable
    || (Number.isInteger(problem?.status) && problem.status >= 500)
}

function serviceUnavailableProblem(problem) {
  return problem?.type === INTERNAL_PROBLEM_TYPES.serviceUnavailable
    ? problem
    : createInternalProblem('serviceUnavailable', { cause:problem })
}

export function createSession() {
  const user = ref(null)
  const ready = ref(false)
  const restoring = ref(false)
  const restoreProblem = ref(null)
  const notice = ref('')
  const loginProblem = ref(null)
  const legalDocumentOps = ref(null)
  let token = ''
  let epoch = 0
  let refreshing = null
  let initialization = null
  let legalDocumentOpsRequest = null
  const client = createApiClient({ getAccessToken: () => token, refreshSession })

  function clearSession(message = '', problem = null) {
    epoch += 1
    token = ''
    user.value = null
    notice.value = message
    loginProblem.value = problem
    legalDocumentOps.value = null
    legalDocumentOpsRequest = null
  }
  function forceLogoff(problem) {
    const unavailable = serviceUnavailableProblem(problem)
    clearSession('', unavailable)
    return unavailable
  }
  function applySession(session, generation) {
    if (generation !== epoch) return null
    if (!session || typeof session.accessToken !== 'string' || !session.accessToken
      || !Number.isInteger(session.user?.id) || !can(session.user, 'access')) {
      throw createInternalProblem('protocolError')
    }
    token = session.accessToken
    user.value = session.user
    notice.value = ''
    loginProblem.value = null
    return user.value
  }
  async function refreshSession(operationTrace) {
    if (!refreshing) {
      const generation = epoch
      const pending = client.request(`${BASE}/auth/refresh`, { method:'POST' }, { operationTrace })
        .catch(problem => {
          if (generation === epoch) {
            if (problem.type === CORE_PROBLEM_TYPES.invalidRefreshToken) {
              clearSession(user.value ? 'Сеанс завершён. Войдите повторно.' : '')
            } else if (isServiceUnavailable(problem)) {
              throw forceLogoff(problem)
            }
          }
          throw problem
        })
        .then(session => applySession(session, generation))
        .finally(() => { if (refreshing === pending) refreshing = null })
      refreshing = pending
    }
    return refreshing
  }
  async function restoreSession() {
    restoring.value = true
    restoreProblem.value = null
    try { await refreshSession() }
    catch (problem) {
      if (problem.type !== CORE_PROBLEM_TYPES.invalidRefreshToken
        && problem.type !== INTERNAL_PROBLEM_TYPES.serviceUnavailable) restoreProblem.value = problem
    } finally { restoring.value = false; ready.value = true }
  }
  function ensureReady() {
    if (ready.value) return Promise.resolve()
    if (!initialization) initialization = restoreSession()
    return initialization
  }
  async function login(email, password) {
    clearSession()
    const generation = epoch
    let result
    try {
      result = await client.request(`${BASE}/auth/login`, json('POST', { email:email.trim(), password }))
    } catch (problem) {
      if (generation === epoch && isServiceUnavailable(problem)) {
        throw forceLogoff(problem)
      }
      throw problem
    }
    return applySession(result, generation)
  }
  async function logout(message = '') {
    clearSession(message)
    try { await client.request(`${BASE}/auth/logout`, { method:'POST' }) }
    catch (problem) { suppressProblem(problem, { operation:'session.logout' }) }
  }
  async function request(path, options = {}, { supplementary = false, responseType = 'json' } = {}) {
    const generation = epoch
    try {
      const result = await client.request(`${BASE}${path}`, options, { authorize:true, responseType })
      if (generation !== epoch) throw createInternalProblem('sessionRestoreUnavailable')
      return result
    } catch (problem) {
      if (generation === epoch) {
        if (!supplementary && isServiceUnavailable(problem)) {
          throw forceLogoff(problem)
        }
        if ([CORE_PROBLEM_TYPES.invalidAccessToken, CORE_PROBLEM_TYPES.invalidRefreshToken].includes(problem.type)) {
          clearSession('Сеанс завершён. Войдите повторно.')
        }
      }
      throw problem
    }
  }
  async function saveUser(id, payload, original) {
    const result = await request(id ? `/users/${id}` : '/users', json(id ? 'PUT' : 'POST', payload))
    if (id === user.value?.id) {
      const securityChanged = Boolean(payload.password)
        || (typeof payload.isActive === 'boolean' && payload.isActive !== original.isActive)
        || (typeof payload.email === 'string' && payload.email.trim().toLowerCase() !== original.email.trim().toLowerCase())
        || (Array.isArray(payload.roles) && [...payload.roles].sort().join() !== [...original.roles].sort().join())
      if (securityChanged) await logout('Данные доступа изменены. Войдите повторно.')
      else user.value = result
    }
    return result
  }
  async function saveProfile(payload) {
    const result = await request('/users/me', json('PUT', payload))
    if (payload.password) await logout('Пароль изменён. Войдите повторно.')
    else user.value = result
    return result
  }
  function validateLegalDocumentOps(value) {
    if (!value || !Array.isArray(value.kinds) || value.kinds.length === 0
      || !Array.isArray(value.cookieCategories) || value.cookieCategories.length === 0) throw createInternalProblem('protocolError')
    const values = new Set()
    const aliases = new Set()
    for (const item of value.kinds) {
      if (!item || !Number.isInteger(item.value) || item.value < 0 || typeof item.name !== 'string' || !item.name.trim()
        || typeof item.routeAlias !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(item.routeAlias)
        || values.has(item.value) || aliases.has(item.routeAlias)) throw createInternalProblem('protocolError')
      values.add(item.value)
      aliases.add(item.routeAlias)
    }
    const categoryValues = new Set()
    for (const item of value.cookieCategories) {
      if (!item || !Number.isInteger(item.value) || item.value < 0 || typeof item.name !== 'string' || !item.name.trim()
        || typeof item.required !== 'boolean' || categoryValues.has(item.value)) throw createInternalProblem('protocolError')
      categoryValues.add(item.value)
    }
    if (!value.cookieCategories.some(item => item.required)) throw createInternalProblem('protocolError')
    return {
      kinds:value.kinds.map(item => ({ value:item.value, name:item.name, routeAlias:item.routeAlias })),
      cookieCategories:value.cookieCategories.map(item => ({ value:item.value, name:item.name, required:item.required }))
    }
  }
  async function getLegalDocumentOps() {
    if (legalDocumentOps.value) return legalDocumentOps.value
    if (!legalDocumentOpsRequest) {
      const pending = request('/legal-documents/ops', {}, { supplementary:true })
        .then(value => { legalDocumentOps.value = validateLegalDocumentOps(value); return legalDocumentOps.value })
        .finally(() => { if (legalDocumentOpsRequest === pending) legalDocumentOpsRequest = null })
      legalDocumentOpsRequest = pending
    }
    return legalDocumentOpsRequest
  }
  return {
    user:readonly(user), ready:readonly(ready), restoring:readonly(restoring), restoreProblem:readonly(restoreProblem), notice:readonly(notice), loginProblem:readonly(loginProblem), legalDocumentOps:readonly(legalDocumentOps),
    ensureReady, restoreSession, login, logout, saveUser, saveProfile, getLegalDocumentOps,
    consentRequest: (path, options = {}, responseType = 'json') => {
      const pathname = typeof path === 'string' ? path.split('?')[0] : ''
      if (!CONSENT_REQUEST_PATH_PATTERN.test(pathname)) throw createInternalProblem('invalidInput')
      return request(path, options, { supplementary:true, responseType })
    },
    listUsers: () => request('/users'), getUser: id => request(`/users/${id}`), getRoles: () => request('/users/ops'),
    getStatus: () => request('/status', {}, { supplementary:true })
  }
}
const session = createSession()
export function useSession() { return session }
