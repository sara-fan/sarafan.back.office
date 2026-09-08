// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  JSON_ACCEPT,
  PHOTO_ACCEPT,
  createApiClient,
  parseProblemResponse
} from '../src/api/client.js'
import { INTERNAL_PROBLEM_TYPES, ProblemError } from '../src/errors/problem.js'
import { TEST_TRACE_ID, problem, problemResponse, response } from './fixtures/http.js'

describe('RFC 9457 API client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('preserves a complete domain and validation problem', async () => {
    const errors = { phone: ['Введите номер телефона'] }
    const result = await parseProblemResponse(problemResponse(400, 'validation-failed', {
      title: 'Некорректный запрос',
      detail: 'Исправьте указанные поля и повторите запрос',
      errors
    }))

    expect(result).toBeInstanceOf(ProblemError)
    expect(result).toMatchObject({
      type: 'https://sarafan.sw.consulting/problems/validation-failed',
      title: 'Некорректный запрос',
      status: 400,
      detail: 'Исправьте указанные поля и повторите запрос',
      instance: `urn:sarafan:problem:${TEST_TRACE_ID}`,
      code: 'validation_failed',
      errors,
      traceId: TEST_TRACE_ID
    })
  })

  it.each([
    ['missing body', null],
    ['missing type', { type: undefined }],
    ['foreign type', { type: 'https://example.test/problem' }],
    ['internal UI type', { type: 'https://sarafan.sw.consulting/problems/ui/protocol-error' }],
    ['invalid status', { status: 399 }],
    ['English title', { title: 'Bad request' }],
    ['missing detail', { detail: undefined }],
    ['invalid instance', { instance: '' }],
    ['invalid code', { code: 'Invalid-Code' }],
    ['invalid errors object', { errors: [] }],
    ['empty field messages', { errors: { phone: [] } }],
    ['English field message', { errors: { phone: ['Phone is required'] } }],
    ['invalid trace identifier', { traceId: '' }],
    ['mismatched trace instance', { instance: 'urn:sarafan:problem:ffffffffffffffffffffffffffffffff' }]
  ])('normalizes a malformed problem: %s', async (_label, overrides) => {
    const body = overrides === null ? null : problem(400, 'validation-failed', overrides)
    const invalid = response(400, body, 'application/problem+json')

    await expect(parseProblemResponse(invalid)).rejects.toMatchObject({
      type: INTERNAL_PROBLEM_TYPES.protocolError
    })
    await expect(parseProblemResponse(invalid)).rejects.not.toHaveProperty('status')
  })

  it('rejects status mismatches, wrong media types, and invalid JSON', async () => {
    const mismatch = problemResponse(400, 'validation-failed', { status: 422 })
    const wrongMedia = response(400, problem(400, 'validation-failed'), 'application/json')
    const invalidJson = response(400, null, 'application/problem+json')
    invalidJson.json.mockRejectedValue(new SyntaxError('invalid json'))

    for (const invalid of [mismatch, wrongMedia, invalidJson]) {
      await expect(parseProblemResponse(invalid)).rejects.toMatchObject({
        type: INTERNAL_PROBLEM_TYPES.protocolError
      })
    }
  })

  it('allows only root-relative back-office routes, including dynamic paths and queries', async () => {
    const paths = [
      '/api/v1/backoffice/auth/login',
      '/api/v1/backoffice/auth/refresh',
      '/api/v1/backoffice/auth/logout',
      '/api/v1/backoffice/users',
      '/api/v1/backoffice/users/42?include=roles',
      '/api/v1/backoffice/status'
    ]
    const fetch = vi.fn().mockResolvedValue(response(200, { ok: true }))
    vi.stubGlobal('fetch', fetch)
    const client = createApiClient({ getAccessToken: vi.fn(), refreshSession: vi.fn() })

    for (const path of paths) {
      await expect(client.request(path)).resolves.toEqual({ ok: true })
    }

    expect(fetch.mock.calls.map(([path]) => path)).toEqual(paths)
  })

  it('blocks non-staff routes before credentials, refresh, diagnostics, or network access', async () => {
    const blockedPaths = [
      '/api/v1/auth/refresh',
      '/api/v1/customers',
      '/api/v1/backoffice',
      '/api/v1/backoffice-users',
      'api/v1/backoffice/users',
      'https://sb.sw.consulting/api/v1/backoffice/users?value=secret-route-value',
      'https://example.test/api/v1/backoffice/users',
      '//example.test/api/v1/backoffice/users',
      '/api/v1/backoffice/../auth/refresh',
      '/api/v1/backoffice/%2e%2e/auth/refresh',
      '/api/v1/backoffice/%2fapi/v1/auth/refresh',
      '/api/v1/backoffice\\auth\\refresh',
      '/api/v1/backoffice/users\u0000private',
      '/api/v1/backoffice/users\u007fprivate',
      '/api/v1/backoffice/users#private-fragment',
      null,
      { path: '/api/v1/backoffice/users' }
    ]
    const fetch = vi.fn()
    const getAccessToken = vi.fn(() => 'staff-token')
    const refreshSession = vi.fn()
    const logger = { log: vi.fn() }
    vi.stubGlobal('fetch', fetch)
    const client = createApiClient({ getAccessToken, refreshSession, logger })

    for (const path of blockedPaths) {
      const failure = await client.request(path, {}, { authorize: true }).catch(problem => problem)
      expect(failure).toBeInstanceOf(ProblemError)
      expect(failure).toMatchObject({
        type: INTERNAL_PROBLEM_TYPES.apiRouteBlocked,
        code: 'ui_api_route_blocked'
      })
      expect(failure).not.toHaveProperty('status')
      expect(failure).not.toHaveProperty('cause')
      expect(JSON.stringify(failure)).not.toMatch(/secret-route-value|private-fragment/u)
    }

    vi.stubGlobal('URL', class {
      constructor() { throw new TypeError('private parser failure') }
    })
    const parserFailure = await client.request('/api/v1/backoffice/users').catch(problem => problem)
    expect(parserFailure).toMatchObject({ type: INTERNAL_PROBLEM_TYPES.apiRouteBlocked })
    expect(parserFailure).not.toHaveProperty('cause')

    expect(fetch).not.toHaveBeenCalled()
    expect(getAccessToken).not.toHaveBeenCalled()
    expect(refreshSession).not.toHaveBeenCalled()
    expect(logger.log).not.toHaveBeenCalled()
  })

  it('adds JSON negotiation, credentials, bearer auth, and retries once after refresh', async () => {
    let token = 'old-token'
    let client
    const refreshSession = vi.fn(async (operationTrace) => {
      await client.request('/api/v1/backoffice/auth/refresh', { method: 'POST' }, { operationTrace })
      token = 'new-token'
    })
    const fetch = vi.fn()
      .mockResolvedValueOnce(problemResponse(401, 'invalid-backoffice-access-token', {
        title: 'Недействительный токен доступа',
        detail: 'Обновите сеанс и повторите запрос'
      }))
      .mockResolvedValueOnce(response(204))
      .mockResolvedValueOnce(response(200, { ok: true }))
    vi.stubGlobal('fetch', fetch)
    client = createApiClient({ getAccessToken: () => token, refreshSession })

    await expect(client.request('/api/v1/backoffice/users', {}, { authorize: true })).resolves.toEqual({ ok: true })

    expect(refreshSession).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch.mock.calls[0][1].headers.get('Accept')).toBe(JSON_ACCEPT)
    expect(fetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer old-token')
    expect(fetch.mock.calls[2][1].headers.get('Authorization')).toBe('Bearer new-token')
    expect(fetch.mock.calls[2][1].credentials).toBe('include')

    const traceparents = fetch.mock.calls.map(([, options]) => options.headers.get('traceparent'))
    expect(traceparents).toHaveLength(3)
    for (const traceparent of traceparents) {
      expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/u)
    }
    expect(new Set(traceparents.map(traceparent => traceparent.slice(3, 35))).size).toBe(1)
    expect(new Set(traceparents.map(traceparent => traceparent.slice(36, 52))).size).toBe(3)
  })

  it('negotiates photo responses and handles bodyless successes', async () => {
    const photo = new globalThis.Blob(['image'], { type: 'image/png' })
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(200, photo, 'image/png'))
      .mockResolvedValueOnce(response(204))
    vi.stubGlobal('fetch', fetch)
    const client = createApiClient({ getAccessToken: () => '', refreshSession: vi.fn() })

    await expect(client.request('/api/v1/backoffice/legal-documents/11111111-1111-1111-1111-111111111111/source', {}, { responseType: 'blob' })).resolves.toBe(photo)
    expect(fetch.mock.calls[0][1].headers.get('Accept')).toBe(PHOTO_ACCEPT)
    await expect(client.request('/api/v1/backoffice/auth/logout', { method: 'POST' })).resolves.toBeNull()
  })

  it('normalizes rejected fetch and malformed success bodies', async () => {
    const malformed = response(200, null)
    malformed.json.mockRejectedValue(new SyntaxError('bad response'))
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(malformed)
    vi.stubGlobal('fetch', fetch)
    const client = createApiClient({ getAccessToken: () => '', refreshSession: vi.fn() })

    await expect(client.request('/api/v1/backoffice/status')).rejects.toMatchObject({
      type: INTERNAL_PROBLEM_TYPES.networkUnavailable
    })
    await expect(client.request('/api/v1/backoffice/users')).rejects.toMatchObject({
      type: INTERNAL_PROBLEM_TYPES.protocolError
    })
  })

  it('logs one sanitized final API failure with server correlation', async () => {
    const logger = { log: vi.fn() }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problemResponse(503, 'service-unavailable', {
      title: 'Сервис временно недоступен',
      detail: 'Повторите попытку позднее'
    })))
    const client = createApiClient({
      getAccessToken: () => 'never-log-this-token',
      refreshSession: vi.fn(),
      logger
    })

    await expect(client.request(
      '/api/v1/backoffice/users/me?phone=%2B79991234567',
      { method: 'GET', headers: { 'X-Unsafe': 'secret' } },
      { authorize: true }
    )).rejects.toMatchObject({ code: 'service_unavailable' })

    expect(logger.log).toHaveBeenCalledOnce()
    const [definition, attributes, context] = logger.log.mock.calls[0]
    expect(definition.name).toBe('sarafan.back.office.api.request.failed')
    expect(attributes).toEqual(expect.objectContaining({
      'http.request.method': 'GET',
      'http.route': '/api/v1/backoffice/users/me',
      'http.response.status_code': 503,
      'error.type': 'https://sarafan.sw.consulting/problems/service-unavailable',
      'sarafan.problem.code': 'service_unavailable',
      'sarafan.problem.instance': `urn:sarafan:problem:${TEST_TRACE_ID}`,
      'retry.count': 0
    }))
    expect(context).toEqual({ traceId: TEST_TRACE_ID })
    expect(JSON.stringify(logger.log.mock.calls)).not.toMatch(/79991234567|never-log|X-Unsafe/u)
  })

  it('logs non-validation client failures', async () => {
    const logger = { log: vi.fn() }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problemResponse(
      404,
      'customer-not-found'
    )))
    const client = createApiClient({
      getAccessToken: () => '',
      refreshSession: vi.fn(),
      logger
    })

    await expect(client.request('/api/v1/backoffice/users/me')).rejects.toMatchObject({
      code: 'customer_not_found'
    })
    expect(logger.log).toHaveBeenCalledOnce()
  })

  it.each([
    ['/api/v1/backoffice/legal-documents/AAAAAAAA-1111-2222-3333-BBBBBBBBBBBB', '/api/v1/backoffice/legal-documents/{id}'],
    ['/api/v1/backoffice/legal-documents/11111111-1111-1111-1111-111111111111/source', '/api/v1/backoffice/legal-documents/{id}/source'],
    ['/api/v1/backoffice/legal-documents/a', undefined],
    [`/api/v1/backoffice/legal-documents/${'-'.repeat(36)}`, undefined],
    ['/api/v1/backoffice/legal-documents/11111111-1111-1111-1111-11111111111', undefined]
  ])('normalizes only exact legal-document UUID paths: %s', async (path, expectedRoute) => {
    const logger = { log: vi.fn() }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problemResponse(404, 'customer-not-found')))
    const client = createApiClient({
      getAccessToken: () => '',
      refreshSession: vi.fn(),
      logger
    })

    await expect(client.request(path)).rejects.toMatchObject({ code:'customer_not_found' })
    expect(logger.log).toHaveBeenCalledOnce()
    expect(logger.log.mock.calls[0][1]['http.route']).toBe(expectedRoute)
  })

  it('logs an invalid access token only after its retry is exhausted', async () => {
    const logger = { log: vi.fn() }
    const fetch = vi.fn()
      .mockResolvedValueOnce(problemResponse(401, 'invalid-backoffice-access-token'))
      .mockResolvedValueOnce(problemResponse(401, 'invalid-backoffice-access-token'))
      .mockResolvedValueOnce(problemResponse(401, 'invalid-backoffice-access-token'))
    vi.stubGlobal('fetch', fetch)
    const client = createApiClient({
      getAccessToken: () => 'token',
      refreshSession: vi.fn(),
      logger
    })

    await expect(client.request(
      '/api/v1/backoffice/users/me',
      {},
      { authorize: true, retry: false }
    )).rejects.toBeInstanceOf(ProblemError)
    expect(logger.log).not.toHaveBeenCalled()

    await expect(client.request(
      '/api/v1/backoffice/users/me',
      {},
      { authorize: true }
    )).rejects.toBeInstanceOf(ProblemError)
    expect(logger.log).toHaveBeenCalledOnce()
    expect(logger.log.mock.calls[0][1]['retry.count']).toBe(1)
  })

  it('marks an already-reported refresh failure to prevent duplicate operation logs', async () => {
    const logger = { log: vi.fn() }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problemResponse(401, 'invalid-backoffice-access-token')))
    const client = createApiClient({
      getAccessToken: () => 'token',
      refreshSession: async () => {
        const refreshClient = createApiClient({
          getAccessToken: () => '',
          refreshSession: vi.fn(),
          logger
        })
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problemResponse(
          503,
          'service-unavailable'
        )))
        await refreshClient.request('/api/v1/backoffice/auth/refresh', { method: 'POST' })
      },
      logger
    })

    await expect(client.request('/api/v1/backoffice/users/me', {}, { authorize: true }))
      .rejects.toMatchObject({ code: 'service_unavailable' })
    expect(logger.log).toHaveBeenCalledOnce()
  })

  it('does not log expected validation, login, or session-expiry problems', async () => {
    const logger = { log: vi.fn() }
    const fetch = vi.fn()
      .mockResolvedValueOnce(problemResponse(400, 'validation-failed'))
      .mockResolvedValueOnce(problemResponse(401, 'backoffice-login-failed'))
      .mockResolvedValueOnce(problemResponse(401, 'invalid-backoffice-refresh-token'))
    vi.stubGlobal('fetch', fetch)
    const client = createApiClient({
      getAccessToken: () => '',
      refreshSession: vi.fn(),
      logger
    })

    await expect(client.request('/api/v1/backoffice/users', { method: 'POST' })).rejects.toBeInstanceOf(ProblemError)
    await expect(client.request('/api/v1/backoffice/auth/login', { method: 'POST' })).rejects.toBeInstanceOf(ProblemError)
    await expect(client.request('/api/v1/backoffice/auth/refresh', { method: 'POST' })).rejects.toBeInstanceOf(ProblemError)
    expect(logger.log).not.toHaveBeenCalled()
  })
})
