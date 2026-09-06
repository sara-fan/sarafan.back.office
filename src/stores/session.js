// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { readonly, ref } from 'vue'
import { createApiClient } from '../api/client.js'
import { CORE_PROBLEM_TYPES, createInternalProblem, suppressProblem } from '../errors/problem.js'
import { can } from '../roles.js'

const BASE = '/api/v1/backoffice'
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export function createSession() {
  const user = ref(null)
  const ready = ref(false)
  const restoring = ref(false)
  const restoreProblem = ref(null)
  const notice = ref('')
  let token = ''
  let epoch = 0
  let refreshing = null
  let initialization = null
  const client = createApiClient({ getAccessToken: () => token, refreshSession })

  function clearSession(message = '') {
    epoch += 1
    token = ''
    user.value = null
    notice.value = message
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
    return user.value
  }
  async function refreshSession(operationTrace) {
    if (!refreshing) {
      const generation = epoch
      const pending = client.request(`${BASE}/auth/refresh`, { method:'POST' }, { operationTrace })
        .then(session => applySession(session, generation))
        .catch(problem => {
          if (generation === epoch && problem.type === CORE_PROBLEM_TYPES.invalidRefreshToken) {
            clearSession(user.value ? 'Сеанс завершён. Войдите повторно.' : '')
          }
          throw problem
        })
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
      if (problem.type !== CORE_PROBLEM_TYPES.invalidRefreshToken) restoreProblem.value = problem
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
    const result = await client.request(`${BASE}/auth/login`, json('POST', { email:email.trim(), password }))
    return applySession(result, generation)
  }
  async function logout(message = '') {
    clearSession(message)
    try { await client.request(`${BASE}/auth/logout`, { method:'POST' }) }
    catch (problem) { suppressProblem(problem, { operation:'session.logout' }) }
  }
  async function request(path, options = {}) {
    const generation = epoch
    try {
      const result = await client.request(`${BASE}${path}`, options, { authorize:true })
      if (generation !== epoch) throw createInternalProblem('sessionRestoreUnavailable')
      return result
    } catch (problem) {
      if (generation === epoch && [CORE_PROBLEM_TYPES.invalidAccessToken, CORE_PROBLEM_TYPES.invalidRefreshToken].includes(problem.type)) {
        clearSession('Сеанс завершён. Войдите повторно.')
      }
      throw problem
    }
  }
  async function saveUser(id, payload, original) {
    const result = await request(id ? `/users/${id}` : '/users', json(id ? 'PUT' : 'POST', payload))
    if (id === user.value?.id) {
      const securityChanged = Boolean(payload.password) || !payload.isActive
        || payload.email.trim().toLowerCase() !== original.email.trim().toLowerCase()
        || [...payload.roles].sort().join() !== [...original.roles].sort().join()
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
  return {
    user:readonly(user), ready:readonly(ready), restoring:readonly(restoring), restoreProblem:readonly(restoreProblem), notice:readonly(notice),
    ensureReady, restoreSession, login, logout, saveUser, saveProfile,
    listUsers: () => request('/users'), getUser: id => request(`/users/${id}`), getRoles: () => request('/users/ops'),
    getStatus: () => client.request('/api/v1/status/status')
  }
}
const session = createSession()
export function useSession() { return session }
