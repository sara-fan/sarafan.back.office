// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { afterEach, describe, expect, it, vi } from 'vitest'
import { currencies, productLimits } from './fixtures/orderProduct.js'
import { createSession } from '../src/stores/session.js'
import { problemResponse, response } from './fixtures/http.js'

const identity = { id:1, email:'admin@example.test', firstName:'Иван', lastName:'Иванов', patronymic:null, roles:['administrator'], isActive:true }
const legalOps = { kinds:[{ value:1, name:'Согласие на обработку персональных данных', routeAlias:'personal-data-consent' }, { value:2, name:'Пользовательское соглашение', routeAlias:'user-agreement' }] }
const orderOps = {
  statuses:[
    { value:0,name:'На проверке',routeAlias:'under_review',upperStatusValue:0,upperStatusName:'На проверке',upperStatusRouteAlias:'under_review' },
    { value:300,name:'Оплачен',routeAlias:'paid',upperStatusValue:300,upperStatusName:'Выполняется',upperStatusRouteAlias:'in_progress' }
  ],
  currencies, productLimits,
  statusGroups:[
    { routeAlias:'work',name:'В работе',statuses:[0,300] },
    { routeAlias:'in_progress',name:'Выполняется',statuses:[300] }
  ]
}
const auth = (user = identity) => response(200, { accessToken:'staff-token', expiresAt:'2026-10-01T00:00:00Z', user })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
afterEach(() => vi.unstubAllGlobals())

describe('staff session boundary', () => {
  it('presents a staff login timeout as service unavailability', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problemResponse(503, 'anonymous-api-timeout')))
    const session = createSession()
    await expect(session.login('admin@example.test', 'password')).rejects.toMatchObject({ code:'ui_service_unavailable' })
    expect(session.user.value).toBeNull()
    expect(session.loginProblem.value).toMatchObject({ code:'ui_service_unavailable', detail:'Сервис временно недоступен' })
  })
  it('retains identity when an authorized request refresh times out', async () => {
    const fetch = vi.fn(url => {
      if (url === '/api/v1/backoffice/auth/login') return Promise.resolve(auth())
      if (url === '/api/v1/backoffice/users') return Promise.resolve(problemResponse(401, 'invalid-backoffice-access-token'))
      if (url === '/api/v1/backoffice/auth/refresh') return Promise.resolve(problemResponse(503, 'anonymous-api-timeout'))
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetch)
    const session = createSession()
    await session.login('admin@example.test', 'password')
    await expect(session.listUsers()).rejects.toMatchObject({ code:'anonymous_api_timeout' })
    expect(session.user.value).toEqual(identity)
    expect(session.refreshCooldownSeconds.value).toBeGreaterThan(0)
    await expect(session.listUsers()).rejects.toMatchObject({ code:'anonymous_api_timeout' })
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/refresh'))).toHaveLength(1)
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/users'))).toHaveLength(1)
    expect(session.user.value).toEqual(identity)
  })
  it('allows session restoration again after the timeout cooldown expires', async () => {
    vi.useFakeTimers()
    try {
      const fetch = vi.fn().mockResolvedValueOnce(problemResponse(503, 'anonymous-api-timeout')).mockResolvedValueOnce(auth())
      vi.stubGlobal('fetch', fetch)
      const session = createSession()
      await session.restoreSession()
      expect(session.restoreProblem.value).toMatchObject({ code:'anonymous_api_timeout' })
      expect(session.refreshCooldownSeconds.value).toBeGreaterThan(0)
      await vi.advanceTimersByTimeAsync(1250)
      expect(session.refreshCooldownSeconds.value).toBe(0)
      await session.restoreSession()
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(session.restoreProblem.value).toBeNull()
      expect(session.user.value).toEqual(identity)
    } finally {
      vi.useRealTimers()
    }
  })
  it('treats a direct timeout on a staff request as service unavailability', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(problemResponse(503, 'anonymous-api-timeout')))
    const session = createSession()
    await session.login('admin@example.test', 'password')
    await expect(session.listUsers()).rejects.toMatchObject({ code:'ui_service_unavailable' })
    expect(session.user.value).toBeNull()
  })
  it('retains identity and blocks refresh requests during a throttling cooldown', async () => {
    let refreshCount = 0
    const fetch = vi.fn(url => {
      if (url === '/api/v1/backoffice/auth/login') return Promise.resolve(auth())
      if (url === '/api/v1/backoffice/auth/refresh') {
        refreshCount++
        return Promise.resolve(problemResponse(429, 'rate-limited'))
      }
      if (url === '/api/v1/backoffice/users') return Promise.resolve(response(200, []))
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetch)
    const session = createSession()
    await session.login('admin@example.test', 'password')
    await session.restoreSession()
    expect(session.user.value).toEqual(identity)
    expect(session.restoreProblem.value).toMatchObject({ code:'rate_limited' })
    expect(session.refreshCooldownSeconds.value).toBeGreaterThan(0)
    await session.restoreSession()
    expect(refreshCount).toBe(1)
    expect(session.user.value).toEqual(identity)
    await expect(session.listUsers()).resolves.toEqual([])
    expect(fetch.mock.calls.filter(([url]) => url === '/api/v1/backoffice/users')).toHaveLength(1)
  })
  it('blocks requests known to need renewal until the refresh cooldown ends', async () => {
    let refreshCount = 0
    const fetch = vi.fn(url => {
      if (url === '/api/v1/backoffice/auth/login') return Promise.resolve(auth())
      if (url === '/api/v1/backoffice/auth/refresh') {
        refreshCount++
        return Promise.resolve(problemResponse(429, 'rate-limited'))
      }
      if (url === '/api/v1/backoffice/users') return Promise.resolve(problemResponse(401, 'invalid-backoffice-access-token'))
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetch)
    const session = createSession()
    await session.login('admin@example.test', 'password')
    await expect(session.listUsers()).rejects.toMatchObject({ code:'rate_limited' })
    await expect(session.listUsers()).rejects.toMatchObject({ code:'rate_limited' })
    expect(refreshCount).toBe(1)
    expect(fetch.mock.calls.filter(([url]) => url === '/api/v1/backoffice/users')).toHaveLength(1)
    expect(session.user.value).toEqual(identity)
  })
  it('clears memory preferences on identity change and logout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(auth({ ...identity, id:2 })).mockResolvedValueOnce(response(200, {})))
    const session = createSession()
    await session.login('a', 'password')
    session.viewStateMemory.set('orders', 'old preferences')
    await session.login('b', 'password')
    expect(session.viewStateMemory.size).toBe(0)
    session.viewStateMemory.set('orders', 'new preferences')
    await session.logout()
    expect(session.viewStateMemory.size).toBe(0)
  })
  it('uses only staff detail/update endpoints and retains session on recoverable order failures', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(response(200, {}))
      .mockResolvedValueOnce(problemResponse(503, 'order-limit-rates-unavailable'))
    vi.stubGlobal('fetch', fetch)
    const s = createSession(); await s.login('a@b.test', 'password')
    await s.orderRequest('/orders/12345678-1')
    await expect(s.orderRequest('/orders/12345678-1/product', { method:'PUT', body:'{}' })).rejects.toMatchObject({ code:'order_limit_rates_unavailable' })
    expect(fetch.mock.calls.at(-1)[0]).toBe('/api/v1/backoffice/orders/12345678-1/product')
    expect(fetch.mock.calls.at(-1)[1].method).toBe('PUT')
    expect(s.user.value).toEqual(identity)
    for (const path of ['/orders/12345678-0', '/orders/12345678-01', '/orders/12345678-1/customer', '/api/v1/orders/12345678-1']) expect(() => s.orderRequest(path)).toThrow()
  })
  it('loads and caches order metadata and restricts order requests to read-only list routes', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(response(200,orderOps)).mockResolvedValueOnce(response(200,{items:[]}))
    vi.stubGlobal('fetch',fetch)
    const s=createSession();await s.login('a@b.test','p')
    expect(await s.getOrderOps()).toEqual(orderOps)
    expect(await s.getOrderOps()).toEqual(orderOps)
    expect(s.orderOps.value).toEqual(orderOps)
    await s.orderRequest('/orders?page=1&statusGroup=work')
    expect(fetch.mock.calls.filter(([url])=>url==='/api/v1/backoffice/orders/ops')).toHaveLength(1)
    expect(fetch.mock.calls.at(-1)[0]).toBe('/api/v1/backoffice/orders?page=1&statusGroup=work')
    expect(() => s.orderRequest('/orders/1')).toThrow(expect.objectContaining({code:'ui_invalid_input'}))
    expect(() => s.orderRequest('/users')).toThrow(expect.objectContaining({code:'ui_invalid_input'}))
  })
  it('retains the staff session when order metadata is unavailable', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(problemResponse(503, 'service-unavailable'))
    vi.stubGlobal('fetch', fetch)
    const s = createSession(); await s.login('a@b.test', 'password')
    await expect(s.getOrderOps()).rejects.toBeDefined()
    expect(s.user.value).toEqual(identity)
    expect(s.orderOps.value).toBeNull()
  })
  it.each([
    '/legal-documents/a',
    '/legal-documents/-',
    `/legal-documents/${'-'.repeat(36)}`,
    '/legal-documents/11111111-1111-1111-1111-11111111111',
    '/legal-documents/11111111-1111-1111-1111-11111111111/source'
  ])('rejects malformed legal-document identifier path %s', async path => {
    const fetch = vi.fn().mockResolvedValueOnce(auth())
    vi.stubGlobal('fetch', fetch)
    const s = createSession(); await s.login('admin@example.test','password')
    expect(() => s.consentRequest(path)).toThrow()
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('keeps legal forms recoverable, rejects non-staff paths and downloads exact source', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(problemResponse(503,'service-unavailable')).mockResolvedValueOnce(response(200, []))
    vi.stubGlobal('fetch',fetch)
    const s = createSession(); await s.login('admin@example.test','password')
    expect(() => s.consentRequest('/users')).toThrow()
    expect(() => s.consentRequest('/consents/customers/7')).toThrow()
    expect(() => s.consentRequest('/legal-documents/11111111-1111-1111-1111-111111111111/publish')).toThrow()
    await expect(s.consentRequest('/legal-documents')).rejects.toBeDefined()
    expect(s.user.value).toEqual(identity)
    await s.consentRequest('/consents/withdrawal-requests')
    expect(() => s.consentRequest('/consents/withdrawal-requests/7')).toThrow()
    fetch.mockResolvedValueOnce(response(200,legalOps))
    expect(await s.getLegalDocumentOps()).toEqual(legalOps)
    expect(await s.getLegalDocumentOps()).toEqual(legalOps)
    expect(fetch.mock.calls.filter(([url]) => url === '/api/v1/backoffice/legal-documents/ops')).toHaveLength(1)
    fetch.mockResolvedValueOnce(response(200,{ items:[], page:1, pageSize:25, total:0 }))
    await s.consentRequest('/legal-documents/audit?page=1&pageSize=25')
    fetch.mockResolvedValueOnce(new globalThis.Response('# Текст', { status:200, headers:{'Content-Type':'text/markdown'} }))
    const blob = await s.consentRequest('/legal-documents/11111111-1111-1111-1111-111111111111/source', { headers:{Accept:'text/markdown, application/problem+json'} }, 'blob')
    expect(await blob.text()).toBe('# Текст')
    expect(fetch.mock.calls.at(-1)[1].headers.get('Authorization')).toBe('Bearer staff-token')
  })
  it.each([null, {}, { kinds:[] }, { kinds:[{ value:'0', name:'Куки', routeAlias:'cookie-consent' }] },
    { kinds:[{ value:0, name:'', routeAlias:'cookie-consent' }] }, { kinds:[{ value:0, name:'Куки', routeAlias:'Bad alias' }] },
    { kinds:[{ value:0, name:'One', routeAlias:'one' }, { value:0, name:'Two', routeAlias:'two' }] },
    { kinds:[{ value:0, name:'One', routeAlias:'same' }, { value:1, name:'Two', routeAlias:'same' }] }])('rejects malformed legal-document ops metadata %j', async value => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(response(200,value)))
    const s = createSession(); await s.login('admin@example.test','password')
    await expect(s.getLegalDocumentOps()).rejects.toMatchObject({ code:'ui_protocol_error' })
    expect(s.legalDocumentOps.value).toBeNull()
  })

  it('authorizes supplementary status, preserves the shell on failure and rejects stale results', async () => {
    const wait = deferred()
    const fetch = vi.fn().mockResolvedValueOnce(auth())
      .mockResolvedValueOnce(problemResponse(503,'service-unavailable'))
      .mockResolvedValueOnce(new globalThis.Response('invalid JSON', { status:200,headers:{'Content-Type':'application/json'} }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockReturnValueOnce(wait.promise).mockResolvedValueOnce(response(204))
    vi.stubGlobal('fetch',fetch)
    const s = createSession(); await s.login('admin@example.test','password')
    await expect(s.getStatus()).rejects.toBeDefined(); expect(s.user.value).toEqual(identity)
    await expect(s.getStatus()).rejects.toBeDefined(); expect(s.user.value).toEqual(identity)
    await expect(s.getStatus()).rejects.toBeDefined(); expect(s.user.value).toEqual(identity)
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/backoffice/status')
    expect(fetch.mock.calls[1][1].headers.get('Authorization')).toBe('Bearer staff-token')
    const stale = s.getStatus(); const rejected = expect(stale).rejects.toBeDefined()
    await s.logout(); wait.resolve(response(200,{ exchangeRates:[] })); await rejected
    expect(s.user.value).toBeNull()
  })
  it('restores once, logs in by email, reads staff resources and logs out locally even on failure', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(problemResponse(401,'invalid-backoffice-refresh-token')).mockResolvedValueOnce(auth()).mockResolvedValueOnce(response(200,[])).mockResolvedValueOnce(response(200,identity)).mockResolvedValueOnce(response(200,[])).mockResolvedValueOnce(response(200,{appVersion:'0.0.6'})).mockRejectedValueOnce(new Error('secret'))
    vi.stubGlobal('fetch',fetch)
    const s = createSession()
    await Promise.all([s.ensureReady(),s.ensureReady()]); await s.ensureReady()
    expect(fetch).toHaveBeenCalledTimes(1); expect(s.user.value).toBeNull(); expect(s.notice.value).toBe('')
    await s.login(' admin@example.test ','secret-password')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({email:'admin@example.test',password:'secret-password'})
    expect(s.user.value).toEqual(identity)
    await s.listUsers(); await s.getUser(1); await s.getRoles(); await s.getStatus()
    expect(fetch.mock.calls.map(([url])=>url)).toEqual(['/api/v1/backoffice/auth/refresh','/api/v1/backoffice/auth/login','/api/v1/backoffice/users','/api/v1/backoffice/users/1','/api/v1/backoffice/users/ops','/api/v1/backoffice/status'])
    expect(fetch.mock.calls[2][1].headers.get('Authorization')).toBe('Bearer staff-token')
    await s.logout(); expect(s.user.value).toBeNull()
  })
  it('distinguishes restore transport failure and permits retry', async () => {
    vi.stubGlobal('fetch',vi.fn().mockRejectedValueOnce(new Error('private')).mockResolvedValueOnce(auth()))
    const s=createSession(); await s.ensureReady()
    expect(s.restoreProblem.value.code).toBe('ui_network_unavailable'); expect(s.ready.value).toBe(true)
    await s.restoreSession(); expect(s.restoreProblem.value).toBeNull(); expect(s.user.value.id).toBe(1)
  })
  it.each([null,{}, {accessToken:'',user:identity},{accessToken:'a',user:{}},{accessToken:'a',user:{...identity,roles:['unknown']}}])('rejects malformed authentication payloads %j', async value => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(200,value)))
    const s=createSession(); await expect(s.login('a@b.test','p')).rejects.toMatchObject({code:'ui_protocol_error'}); expect(s.user.value).toBeNull()
  })
  it.each([
    { kinds:[legalOps.kinds[0]] },
    { kinds:[legalOps.kinds[0], { ...legalOps.kinds[1], value:3 }] },
    { kinds:[legalOps.kinds[0], { ...legalOps.kinds[1], value:4 }] },
    { kinds:[...legalOps.kinds, { value:3, name:'Retired', routeAlias:'order-rules' }] },
    { kinds:[legalOps.kinds[0], { ...legalOps.kinds[1], value:1 }] },
    { kinds:[legalOps.kinds[0], { ...legalOps.kinds[1], routeAlias:legalOps.kinds[0].routeAlias }] }
  ])('rejects incomplete, retired or duplicate legal catalogues %j', async value => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(response(200,value)))
    const session = createSession()
    await session.login('a', 'p')
    await expect(session.getLegalDocumentOps()).rejects.toMatchObject({ code:'ui_protocol_error' })
    expect(session.legalDocumentOps.value).toBeNull()
    expect(session.user.value).toEqual(identity)
  })
  it('shares refresh across concurrent requests and retries each request only once', async () => {
    const refresh=deferred(); let calls=0
    const fetch=vi.fn(async url => {
      if(url.endsWith('/login')) return auth()
      if(url.endsWith('/refresh')) return refresh.promise
      calls++; return calls <= 2 ? problemResponse(401,'invalid-backoffice-access-token') : response(200,[])
    })
    vi.stubGlobal('fetch',fetch); const s=createSession(); await s.login('a@b.test','p')
    const pending=[s.listUsers(),s.listUsers()]; await vi.waitFor(()=>expect(fetch.mock.calls.filter(([url])=>url.endsWith('/refresh'))).toHaveLength(1))
    refresh.resolve(auth()); await Promise.all(pending); expect(calls).toBe(4)
  })
  it('clears revoked identity, distinguishes access denial, and expires an exhausted retry', async () => {
    const fetch=vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(problemResponse(403,'access-denied')).mockResolvedValueOnce(problemResponse(401,'invalid-backoffice-access-token')).mockResolvedValueOnce(auth()).mockResolvedValueOnce(problemResponse(401,'invalid-backoffice-access-token'))
    vi.stubGlobal('fetch',fetch); const s=createSession(); await s.login('a@b.test','p')
    await expect(s.listUsers()).rejects.toMatchObject({code:'access_denied'}); expect(s.user.value).not.toBeNull()
    await expect(s.listUsers()).rejects.toMatchObject({code:'invalid_backoffice_access_token'}); expect(s.user.value).toBeNull()
  })
  it('preserves identity for refresh network failures but expires invalid refresh sessions', async () => {
    const fetch=vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(problemResponse(401,'invalid-backoffice-access-token')).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(problemResponse(401,'invalid-backoffice-access-token')).mockResolvedValueOnce(problemResponse(401,'invalid-backoffice-refresh-token'))
    vi.stubGlobal('fetch',fetch); const s=createSession(); await s.login('a@b.test','p')
    await expect(s.listUsers()).rejects.toMatchObject({code:'ui_network_unavailable'}); expect(s.user.value).not.toBeNull()
    await expect(s.listUsers()).rejects.toMatchObject({code:'invalid_backoffice_refresh_token'}); expect(s.user.value).toBeNull()
  })
  it.each([
    ['an HTML gateway error', response(502,null,'text/html')],
    ['a structured server error', problemResponse(503,'service-unavailable')]
  ])('forces logoff with a safe message after %s', async (_label, unavailable) => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(unavailable))
    const s=createSession();await s.login('a@b.test','p')
    await expect(s.listUsers()).rejects.toMatchObject({code:'ui_service_unavailable',detail:'Сервис временно недоступен'})
    expect(s.user.value).toBeNull();expect(s.notice.value).toBe('');expect(s.loginProblem.value).toMatchObject({code:'ui_service_unavailable',detail:'Сервис временно недоступен'})
  })
  it('shows the service notice instead of restore recovery for an HTML gateway error', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(502,null,'text/html')))
    const s=createSession();await s.ensureReady()
    expect(s.user.value).toBeNull();expect(s.restoreProblem.value).toBeNull();expect(s.notice.value).toBe('');expect(s.loginProblem.value).toMatchObject({code:'ui_service_unavailable'})
  })
  it('never restores stale responses after logout or a subsequent login', async () => {
    const login=deferred(), list=deferred(), refresh=deferred()
    const fetch=vi.fn().mockReturnValueOnce(login.promise).mockResolvedValueOnce(response(204)).mockResolvedValueOnce(auth()).mockReturnValueOnce(list.promise).mockResolvedValueOnce(response(204)).mockReturnValueOnce(refresh.promise).mockResolvedValueOnce(response(204))
    vi.stubGlobal('fetch',fetch); const s=createSession(); const pending=s.login('a@b.test','p'); await s.logout(); login.resolve(auth()); expect(await pending).toBeNull()
    await s.login('a@b.test','p'); const loading=s.listUsers(); const rejected=expect(loading).rejects.toMatchObject({code:'ui_session_restore_unavailable'}); await s.logout(); list.resolve(response(200,[identity])); await rejected
    const restoring=s.restoreSession(); await s.logout(); refresh.resolve(auth()); await restoring; expect(s.user.value).toBeNull()
  })
  it('saves names without revocation and clears sessions on own password/email/roles/state changes', async () => {
    const fetch=vi.fn().mockImplementation(async (url,options)=>url.endsWith('/login') ? auth() : url.endsWith('/logout') ? response(204) : response(200,{...identity,...JSON.parse(options.body)}))
    vi.stubGlobal('fetch',fetch); const s=createSession(); await s.login('a@b.test','p')
    await s.saveUser(null,{...identity,password:'secret-password'}); expect(fetch.mock.calls.at(-1)[1].method).toBe('POST')
    await s.saveUser(2,{...identity,isActive:true},identity); expect(s.user.value.id).toBe(1)
    await s.saveUser(1,{...identity,isActive:true,firstName:'Пётр'},identity); expect(s.user.value.firstName).toBe('Пётр')
    await s.saveUser(1,{firstName:'Олег'},identity); expect(s.user.value.firstName).toBe('Олег')
    expect(fetch.mock.calls.some(([url])=>url.endsWith('/logout'))).toBe(false)
    await s.saveProfile({firstName:'Анна'}); expect(s.user.value.firstName).toBe('Анна')
    for(const change of [{password:'new-secret-password'},{email:'new@example.test'},{roles:['operator']},{isActive:false}]) {
      await s.login('a@b.test','p'); await s.saveUser(1,{...identity,isActive:true,...change},identity); expect(s.user.value).toBeNull()
    }
    await s.login('a@b.test','p'); await s.saveProfile({password:'new-secret-password'}); expect(s.notice.value).toContain('Пароль изменён')
    await s.login('a@b.test','p'); await s.saveUser(1,{...identity,isActive:true},{...identity,isActive:false}); expect(s.user.value).toBeNull()
  })
})


it('allows only the staff history route shapes', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(auth()).mockImplementation(async () => response(200, {}))
  vi.stubGlobal('fetch', fetch)
  const s = createSession(); await s.login('a', 'p')
  for (const suffix of ['history', 'history/ops', 'history/0-1', 'history/1-2', 'history/2-3', 'history/3-1']) {
    await s.orderRequest('/orders/12345678-1/' + suffix)
    expect(fetch.mock.calls.at(-1)[0]).toBe('/api/v1/backoffice/orders/12345678-1/' + suffix)
  }
  for (const suffix of ['history/4-1', 'history/0-0', 'history/0-01', 'history/0-1/edit']) expect(() => s.orderRequest('/orders/12345678-1/' + suffix)).toThrow()
})


it('forwards review rejection through the staff boundary and retains the session after a conflict', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(response(200, {}))
    .mockResolvedValueOnce(problemResponse(409, 'order-review-unavailable'));
  vi.stubGlobal('fetch', fetch);
  const session = createSession();
  await session.login('a@b.test', 'password');
  const options = { method:'POST', body:JSON.stringify({ expectedUpdatedAt:'2026-10-04T10:00:00Z', reason:'Причина' }) };
  await session.orderRequest('/orders/12345678-1/review/reject', options);
  expect(fetch.mock.calls.at(-1)[0]).toBe('/api/v1/backoffice/orders/12345678-1/review/reject');
  expect(fetch.mock.calls.at(-1)[1]).toMatchObject(options);
  await expect(session.orderRequest('/orders/12345678-1/review/reject', options)).rejects.toMatchObject({ code:'order_review_unavailable' });
  expect(session.user.value).toEqual(identity);
  expect(() => session.orderRequest('/orders/12345678-1/review/other', options)).toThrow();
});

it('forwards customs paid through the real session and retains identity on a payment conflict', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(response(200, { customsPaid:true }))
    .mockResolvedValueOnce(problemResponse(409, 'customs-payment-unavailable'))
  vi.stubGlobal('fetch', fetch)
  const session = createSession()
  await session.login('admin@example.test', 'password')
  const options = { method:'POST', body:JSON.stringify({ expectedUpdatedAt:'2026-10-09T10:00:00.123456Z' }) }
  await expect(session.orderRequest('/orders/12345678-1/customs/paid', options)).resolves.toEqual({ customsPaid:true })
  expect(fetch.mock.calls.at(-1)[0]).toBe('/api/v1/backoffice/orders/12345678-1/customs/paid')
  expect(fetch.mock.calls.at(-1)[1]).toMatchObject(options)
  await expect(session.orderRequest('/orders/12345678-1/customs/paid', options)).rejects.toMatchObject({ code:'customs_payment_unavailable' })
  expect(session.user.value).toEqual(identity)
  for (const path of ['/orders/12345678-0/customs/paid', '/orders/12345678-1/customs/other', '/orders/12345678-1/customs/paid/again'])
    expect(() => session.orderRequest(path, options)).toThrow()
})
