// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../src/router.js'
import { createSession } from '../src/stores/session.js'
import { can, safeReturn } from '../src/roles.js'
import { response, problemResponse } from './fixtures/http.js'

afterEach(() => vi.unstubAllGlobals())
const root = '/payment-information-bundles'
it('restricts all payment routes and safe returns to administrators', async () => {
  const session = { user:ref(null),restoreProblem:ref(null),ensureReady:vi.fn() }
  const router = createAppRouter(createMemoryHistory(),session)
  await router.push(root+'/1'); expect(router.currentRoute.value.path).toBe('/login')
  for (const role of ['administrator','shift-manager','senior-operator','operator']) {
    session.user.value = { id:1,roles:[role] }
    expect(can(session.user.value,'managePaymentInformation')).toBe(role === 'administrator')
    for (const path of [root,root+'/new',root+'/1']) {
      await router.push(path); expect(router.currentRoute.value.path).toBe(role === 'administrator' ? path : '/forbidden')
      expect(safeReturn(path,session.user.value)).toBe(role === 'administrator' ? path : '/orders')
    }
  }
  for (const path of [root+'/01',root+'/0',root+'/1?secret=x',root+'/1/edit']) expect(safeReturn(path,{id:1,roles:['administrator']})).not.toBe(path)
})
it('uses authenticated recoverable transport, multipart and binary for every catalogue path', async () => {
  const user = {id:1,roles:['administrator']}
  const fetch = vi.fn().mockResolvedValueOnce(response(200,{user,accessToken:'private-token'}))
  vi.stubGlobal('fetch',fetch)
  const session = createSession(); await session.login('admin','password')
  for (const [path,options] of [
    [root,{}],[root+'/ops',{}],[root+'/1',{}],
    [root,{method:'POST',body:new globalThis.FormData()}],[root+'/1',{method:'PUT',body:new globalThis.FormData()}],
    [root+'/1/copy',{method:'POST',body:'{}'}],[root+'/1/enable',{method:'POST',body:'{}'}],[root+'/1/disable',{method:'POST',body:'{}'}],
    [root+'/1',{method:'DELETE',body:'{}'}]
  ]) {
    fetch.mockResolvedValueOnce(response(options.method === 'DELETE' ? 204 : 200,{}))
    await session.paymentInformationRequest(path,options)
    expect(fetch.mock.calls.at(-1)[1].headers.get('Authorization')).toBe('Bearer private-token')
  }
  const blob = new globalThis.Blob(['png'],{type:'image/png'})
  fetch.mockResolvedValueOnce(response(200,blob))
  expect(await session.paymentInformationRequest(root+'/1/qr?v='+'a'.repeat(64),{},'blob')).toBe(blob)
  expect(fetch.mock.calls.at(-1)[1].headers.get('Accept')).toContain('image/png')
  for (const path of [null,'/users',root+'/01',root+'/1/other','https://evil.test']) expect(() => session.paymentInformationRequest(path)).toThrow()
  fetch.mockResolvedValueOnce(problemResponse(503,'service-unavailable'))
  await expect(session.paymentInformationRequest(root)).rejects.toBeDefined()
  expect(session.user.value.id).toBe(1)
  fetch.mockResolvedValueOnce({ok:true,status:200,json:async()=>{throw new Error('private bank data')}})
  await expect(session.paymentInformationRequest(root)).rejects.toBeDefined()
  expect(session.user.value.id).toBe(1)
})
