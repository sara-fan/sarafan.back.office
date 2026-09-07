// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSession } from '../src/stores/session.js'
import { problemResponse, response } from './fixtures/http.js'

const identity = { id:1, email:'admin@example.test', firstName:'Иван', lastName:'Иванов', patronymic:null, roles:['administrator'], isActive:true }
const cookieCategories = [{ value:0, name:'Обязательные', required:true }]
const legalOps = { kinds:[{ value:0, name:'Согласие на куки', routeAlias:'cookie-consent' }], cookieCategories }
const auth = (user = identity) => response(200, { accessToken:'staff-token', expiresAt:'2026-10-01T00:00:00Z', user })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
afterEach(() => vi.unstubAllGlobals())

describe('staff session boundary', () => {
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
  it.each([null, {}, { kinds:[], cookieCategories }, { kinds:[{ value:'0', name:'Куки', routeAlias:'cookie-consent' }], cookieCategories },
    { kinds:[{ value:0, name:'', routeAlias:'cookie-consent' }], cookieCategories }, { kinds:[{ value:0, name:'Куки', routeAlias:'Bad alias' }], cookieCategories },
    { kinds:[{ value:0, name:'One', routeAlias:'one' }, { value:0, name:'Two', routeAlias:'two' }], cookieCategories },
    { kinds:[{ value:0, name:'One', routeAlias:'same' }, { value:1, name:'Two', routeAlias:'same' }], cookieCategories }])('rejects malformed legal-document ops metadata %j', async value => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(response(200,value)))
    const s = createSession(); await s.login('admin@example.test','password')
    await expect(s.getLegalDocumentOps()).rejects.toMatchObject({ code:'ui_protocol_error' })
    expect(s.legalDocumentOps.value).toBeNull()
  })
  it.each([
    undefined,
    [],
    [{ value:'0', name:'Обязательные', required:true }],
    [{ value:0, name:'', required:true }],
    [{ value:0, name:'Обязательные', required:'yes' }],
    [{ value:0, name:'Первая', required:true }, { value:0, name:'Вторая', required:false }],
    [{ value:0, name:'Необязательные', required:false }]
  ])('rejects malformed куки category metadata %j', async value => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(response(200,{ ...legalOps, cookieCategories:value })))
    const s = createSession(); await s.login('admin@example.test','password')
    await expect(s.getLegalDocumentOps()).rejects.toMatchObject({ code:'ui_protocol_error' })
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
    await expect(s.listUsers()).rejects.toMatchObject({code:'ui_service_unavailable',detail:'Сервис недоступен. Пожалуйста, повторите позже.'})
    expect(s.user.value).toBeNull();expect(s.notice.value).toBe('');expect(s.loginProblem.value).toMatchObject({code:'ui_service_unavailable',detail:'Сервис недоступен. Пожалуйста, повторите позже.'})
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
