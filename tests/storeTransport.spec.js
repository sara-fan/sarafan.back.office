// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../src/router.js'
import { createSession } from '../src/stores/session.js'
import { safeReturn } from '../src/roles.js'
import { response, problemResponse } from './fixtures/http.js'
import { pending } from './fixtures/stores.js'

const user = { id:1, roles:['administrator'] }
const auth = () => response(200, { user, accessToken:'staff-secret' })
afterEach(() => vi.unstubAllGlobals())
describe('store staff boundary', () => {
  it('authorizes deep links and safe returns for each role', async () => {
    const session = { user:ref(null), restoreProblem:ref(null), ensureReady:vi.fn() }
    const router = createAppRouter(createMemoryHistory(), session)
    await router.push('/stores/1'); expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.return).toBe('/stores/1')
    for (const role of ['administrator','shift-manager','senior-operator','operator']) {
      session.user.value = { id:1, roles:[role] }
      for (const path of ['/stores','/stores/1']) {
        await router.push(path); expect(router.currentRoute.value.matched[0].meta.action).toBe('viewStores')
        expect(safeReturn(path, session.user.value)).toBe(path)
      }
      await router.push('/stores/new'); expect(router.currentRoute.value.path).toBe(role === 'administrator' ? '/stores/new' : '/forbidden')
      expect(safeReturn('/stores/new', session.user.value)).toBe(role === 'administrator' ? '/stores/new' : '/orders')
      for (const path of ['/stores/0','/stores/01','/stores/1?x=1','//stores/1','https://evil.test']) expect(safeReturn(path, session.user.value)).not.toBe(path)
    }
  })
  it('sends authenticated JSON/multipart/binary requests and rejects non-store paths before fetch', async () => {
    const blob = new globalThis.Blob(['png'], { type:'image/png' })
    const fetch = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(response(200, { items:[] }))
      .mockResolvedValueOnce({ ok:true, status:200, blob:async () => blob })
    vi.stubGlobal('fetch', fetch)
    const session = createSession(); await session.login('admin','password')
    await session.storeRequest('/stores?status=0')
    expect(fetch.mock.calls.at(-1)[1].headers.get('Authorization')).toBe('Bearer staff-secret')
    expect(await session.storeRequest('/stores/1/logo?v=abc', {}, 'blob')).toBe(blob)
    expect(fetch.mock.calls.at(-1)[1].headers.get('Accept')).toContain('image/png')
    for (const path of [null, '/users', '/stores/01', '/stores/1/product', '/api/v1/stores', 'https://evil.test']) expect(() => session.storeRequest(path)).toThrow()
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('retains the session for recoverable failures but rejects obsolete success', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(problemResponse(503, 'service-unavailable'))
    vi.stubGlobal('fetch', fetch)
    const session = createSession(); await session.login('admin','password')
    await expect(session.storeRequest('/stores')).rejects.toBeDefined(); expect(session.user.value.id).toBe(1)
    // Transport JSON parsing errors are recoverable under the same policy.
    fetch.mockResolvedValueOnce({ ok:true, status:200, json:async () => { throw new Error('secret') } })
    await expect(session.storeRequest('/stores')).rejects.toBeDefined(); expect(session.user.value.id).toBe(1)
    const deferred = pending()
    fetch.mockReturnValueOnce(deferred.promise).mockResolvedValueOnce(response(204))
    const request = session.storeRequest('/stores'); await session.logout()
    deferred.resolve(response(200, { items:[] })); await expect(request).rejects.toBeDefined()
  })
})
