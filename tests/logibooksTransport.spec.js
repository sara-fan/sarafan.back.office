// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../src/router.js'
import { createSession } from '../src/stores/session.js'
import { can, loginReturnPath, safeReturn } from '../src/roles.js'
import { response, problemResponse } from './fixtures/http.js'
import { id } from './fixtures/logibooks.js'
afterEach(() => vi.unstubAllGlobals())
const root = '/logibooks-registers'
it('limits register routes and safe returns to qualified staff', async () => {
  const session = { user:ref(null), restoreProblem:ref(null), ensureReady:vi.fn() }
  const router = createAppRouter(createMemoryHistory(), session)
  await router.push(root + '/' + id); expect(router.currentRoute.value.path).toBe('/login')
  for (const role of ['administrator', 'shift-manager', 'senior-operator', 'operator']) {
    session.user.value = { id:1, roles:[role] }; const allowed = ['administrator', 'shift-manager'].includes(role)
    expect(can(session.user.value, 'manageLogibooksRegisters')).toBe(allowed)
    for (const path of [root, root + '/new', root + '/' + id]) {
      await router.push(path); expect(router.currentRoute.value.path).toBe(allowed ? path : '/forbidden')
      expect(safeReturn(path, session.user.value)).toBe(allowed ? path : '/orders')
    }
  }
  for (const path of [root + '/bad', root + '/' + id + '/reconcile', root + '?x=1'])
    expect(safeReturn(path, { id:1, roles:['administrator'] })).toBe('/users')
})
it('uses supplementary staff transport and clears ephemeral selection when identity ends', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(200, { user:{ id:1, roles:['administrator'] }, accessToken:'private' }))
  vi.stubGlobal('fetch', fetch); const session = createSession(); await session.login('admin', 'password')
  for (const path of [root, root + '/ops', root + '/preview', root + '/' + id, root + '/' + id + '/rows?search=literal', root + '/' + id + '/reconcile', root + '/' + id + '/details']) {
    fetch.mockResolvedValueOnce(response(200, {}))
    await session.logibooksRequest(path)
    expect(fetch.mock.calls.at(-1)[1].headers.get('Authorization')).toBe('Bearer private')
  }
  for (const path of [null, '/users', root + '/bad', root + '/' + id + '/other', 'https://evil.test'])
    expect(() => session.logibooksRequest(path)).toThrow()
  fetch.mockResolvedValueOnce(problemResponse(503, 'logibooks-disabled'))
  await expect(session.logibooksRequest(root)).rejects.toBeDefined(); expect(session.user.value.id).toBe(1)
  fetch.mockResolvedValueOnce({ ok:true, status:200, json:async () => { throw new Error('private') } })
  await expect(session.logibooksRequest(root)).rejects.toBeDefined(); expect(session.user.value.id).toBe(1)
  session.logibooksDraft.value = { operationId:id, orders:[] }
  fetch.mockResolvedValueOnce(response(204)); await session.logout(); expect(session.logibooksDraft.value).toBeNull()
})

it('preserves only the operation UUID through expired-session sign-in recovery', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(problemResponse(401, 'invalid-backoffice-refresh-token'))
  vi.stubGlobal('fetch', fetch)
  const session = createSession(), router = createAppRouter(createMemoryHistory(), session)
  const target = root + '/new?operationId=' + id
  await router.push(target + '&secret=discarded#discarded')
  expect(router.currentRoute.value.path).toBe('/login'); expect(router.currentRoute.value.query.return).toBe(target)
  expect(session.logibooksDraft.value).toBeNull()
  fetch.mockResolvedValueOnce(response(200, { user:{ id:1, roles:['shift-manager'] }, accessToken:'private' }))
  await session.login('staff', 'password')
  await router.replace(safeReturn(router.currentRoute.value.query.return, session.user.value))
  expect(router.currentRoute.value.path).toBe(root + '/new'); expect(router.currentRoute.value.query).toEqual({ operationId:id })
  expect(safeReturn(target, { id:1, roles:['operator'] })).toBe('/orders')
  for (const value of ['bad', [id, id], id + '&secret=discarded'])
    expect(loginReturnPath({ path:root + '/new', query:{ operationId:value } })).toBe(root + '/new')
  for (const value of [target + '&secret=discarded', root + '/new?operationId=bad', target + '#discarded'])
    expect(safeReturn(value, session.user.value)).toBe('/orders')
})

it('drops missing or malformed existing login returns', () => {
  for (const query of [{}, { return:['/logibooks-registers', '/orders'] }])
    expect(loginReturnPath({ path:'/login', query })).toBeUndefined()
})
