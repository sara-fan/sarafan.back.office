// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../src/router.js'
import { safeReturn } from '../src/roles.js'
import { createSession } from '../src/stores/session.js'
import { response, problemResponse } from './fixtures/http.js'
import { serviceCatalogueOps } from './fixtures/serviceCatalogue.js'

const user = { id:1, roles:['administrator'] }
const auth = (currentUser = user) => response(200, { user:currentUser, accessToken:'staff-secret' })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
afterEach(() => vi.unstubAllGlobals())

describe('service catalogue staff boundary', () => {
  it('authorizes catalogue and audit routes for staff but creation only for administrators', async () => {
    const session = { user:ref(null), restoreProblem:ref(null), ensureReady:vi.fn() }
    const router = createAppRouter(createMemoryHistory(), session)
    await router.push('/service-catalogue/1')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.return).toBe('/service-catalogue/1')
    for (const role of ['administrator','shift-manager','senior-operator','operator']) {
      session.user.value = { id:1, roles:[role] }
      for (const path of ['/service-catalogue', '/service-catalogue/1', '/service-catalogue/audit']) {
        await router.push(path)
        expect(router.currentRoute.value.matched[0].meta.action).toBe('viewServiceCatalogue')
        expect(safeReturn(path, session.user.value)).toBe(path)
      }
      await router.push('/service-catalogue/new')
      expect(router.currentRoute.value.path).toBe(role === 'administrator' ? '/service-catalogue/new' : '/forbidden')
      expect(safeReturn('/service-catalogue/new', session.user.value)).toBe(role === 'administrator' ? '/service-catalogue/new' : '/orders')
    }
    for (const path of ['/service-catalogue/0', '/service-catalogue/01', '/service-catalogue/1?secret=1', '/service-catalogue/unknown']) {
      expect(safeReturn(path, user)).not.toBe(path)
    }
  })

  it('allows only the exact service-catalogue API family and caches validated Ops', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(auth())
      .mockResolvedValueOnce(response(200, serviceCatalogueOps))
      .mockResolvedValueOnce(response(200, { items:[] }))
      .mockResolvedValueOnce(response(204))
    vi.stubGlobal('fetch', fetch)
    const session = createSession()
    await session.login('admin', 'password')
    expect(await session.getServiceCatalogueOps()).toEqual(serviceCatalogueOps)
    expect(await session.getServiceCatalogueOps()).toEqual(serviceCatalogueOps)
    await session.serviceCatalogueRequest('/service-catalogue?service=0')
    await session.serviceCatalogueRequest('/service-catalogue/1', { method:'DELETE' })
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(fetch.mock.calls.at(-1)[1].headers.get('Authorization')).toBe('Bearer staff-secret')
    for (const path of [null, '/stores', '/service-catalogue/01', '/service-catalogue/1/audit', '/api/v1/backoffice/service-catalogue']) {
      expect(() => session.serviceCatalogueRequest(path)).toThrow()
    }
  })

  it('retains the session and drafts for transport, protocol and 5xx failures', async () => {
    const malformed = { ...serviceCatalogueOps, currencies:[...serviceCatalogueOps.currencies, { value:978, name:'Евро', routeAlias:'eur' }] }
    const fetch = vi.fn().mockResolvedValueOnce(auth())
      .mockResolvedValueOnce(problemResponse(503, 'service-unavailable'))
      .mockResolvedValueOnce(response(200, malformed))
      .mockResolvedValueOnce({ ok:true, status:200, json:async () => { throw new Error('private') } })
    vi.stubGlobal('fetch', fetch)
    const session = createSession()
    await session.login('admin', 'password')
    await expect(session.serviceCatalogueRequest('/service-catalogue')).rejects.toBeDefined()
    expect(session.user.value.id).toBe(1)
    await expect(session.getServiceCatalogueOps()).rejects.toBeDefined()
    expect(session.user.value.id).toBe(1)
    await expect(session.serviceCatalogueRequest('/service-catalogue')).rejects.toBeDefined()
    expect(session.user.value.id).toBe(1)
  })

  it('invalidates caller capabilities when refresh changes the staff roles', async () => {
    const operator = { id:1, roles:['operator'] }
    const readOps = { ...serviceCatalogueOps, actions:{ view:true, create:false, edit:false, delete:false, audit:true } }
    const fetch = vi.fn().mockResolvedValueOnce(auth(operator))
      .mockResolvedValueOnce(response(200, readOps))
      .mockResolvedValueOnce(auth(user))
      .mockResolvedValueOnce(response(200, serviceCatalogueOps))
    vi.stubGlobal('fetch', fetch)
    const session = createSession()
    await session.login('operator', 'password')
    expect((await session.getServiceCatalogueOps()).actions.create).toBe(false)
    await session.restoreSession()
    expect(session.user.value.roles).toEqual(['administrator'])
    expect((await session.getServiceCatalogueOps()).actions.create).toBe(true)
    expect(fetch.mock.calls.filter(([url]) => url === '/api/v1/backoffice/service-catalogue/ops')).toHaveLength(2)
  })

  it('rejects an obsolete Ops response after a same-user role change', async () => {
    const operator = { id:1, roles:['operator'] }
    const readOps = { ...serviceCatalogueOps, actions:{ view:true, create:false, edit:false, delete:false, audit:true } }
    const staleResponse = deferred()
    const fetch = vi.fn().mockResolvedValueOnce(auth(operator))
      .mockReturnValueOnce(staleResponse.promise)
      .mockResolvedValueOnce(auth(user))
      .mockResolvedValueOnce(response(200, serviceCatalogueOps))
    vi.stubGlobal('fetch', fetch)
    const session = createSession()
    await session.login('operator', 'password')
    const stale = session.getServiceCatalogueOps()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    await session.restoreSession()
    expect((await session.getServiceCatalogueOps()).actions.create).toBe(true)
    staleResponse.resolve(response(200, readOps))
    await expect(stale).rejects.toMatchObject({ code:'ui_session_restore_unavailable' })
    expect(session.serviceCatalogueOps.value.actions.create).toBe(true)
  })
})
