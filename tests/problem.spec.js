// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { describe, expect, it, vi } from 'vitest'

import {
  INTERNAL_PROBLEM_TYPES,
  associatedFieldErrors,
  ProblemError,
  createInternalProblem,
  hasOnlyPresentedFieldErrors,
  normalizeProblem,
  presentProblem,
  problemFieldErrors,
  suppressProblem
} from '../src/errors/problem.js'

describe('shared problem model', () => {
  it('shares type and alias associations with focus while preferring structured corrections', () => {
    const options = { types:{ 'urn:test':['file'] }, aliases:{ source:'file', fileName:'file' } }
    const problem = new ProblemError({ type:'urn:test', title:'Ошибка', detail:'Исправьте файл' })
    expect(associatedFieldErrors(null, 'file', options)).toEqual([])
    expect(associatedFieldErrors(problem, 'file', options)).toEqual(['Исправьте файл'])
    expect(associatedFieldErrors(problem, 'title', options)).toEqual([])
    const structured = new ProblemError({ type:'urn:test', title:'Ошибка', detail:'Общая ошибка', errors:{ 'Source.Content':['Ошибка содержимого'], FileName:['Ошибка имени'], file:['Ошибка имени'] } })
    expect(associatedFieldErrors(structured, 'FILE', options)).toEqual(['Ошибка содержимого', 'Ошибка имени'])
  })
  it('constructs every internal catalogue entry without an HTTP status', () => {
    for (const [kind, type] of Object.entries(INTERNAL_PROBLEM_TYPES)) {
      const problem = createInternalProblem(kind)

      expect(problem).toBeInstanceOf(ProblemError)
      expect(problem).toMatchObject({ type })
      expect(problem.title).toMatch(/[А-ЯЁа-яё]/u)
      expect(problem.detail).toMatch(/[А-ЯЁа-яё]/u)
      expect(problem.code).toMatch(/^ui_/u)
      expect(problem.instance).toMatch(/^urn:sarafan:ui:/u)
      expect(problem).not.toHaveProperty('status')
    }
  })

  it('generates unique instances and keeps causes diagnostic-only', () => {
    const cause = new Error('secret native message')
    const first = createInternalProblem('unexpectedError', { cause })
    const second = createInternalProblem('unexpectedError')

    expect(first.instance).not.toBe(second.instance)
    expect(first.cause).toBe(cause)
    expect(Object.keys(first)).not.toContain('cause')
    expect(JSON.stringify(first)).not.toContain('secret native message')
    expect(first.toJSON()).not.toHaveProperty('cause')
  })

  it('presents transport and protocol failures with the standard service-unavailable detail', () => {
    for (const kind of ['networkUnavailable', 'protocolError', 'sessionRestoreUnavailable']) {
      expect(createInternalProblem(kind)).toMatchObject({
        type: INTERNAL_PROBLEM_TYPES[kind],
        title: 'Сервис временно недоступен',
        detail: 'Сервис временно недоступен'
      })
    }
  })

  it('preserves structured server problems and presents safe centralized text', () => {
    const server = new ProblemError({
      type: 'https://sarafan.sw.consulting/problems/customer-not-found',
      title: 'Пользователь не найден',
      status: 404,
      detail: 'Пользователь не найден',
      instance: 'urn:sarafan:problem:4bf92f3577b34da6a3ce929d0e0e4736',
      code: 'customer_not_found',
      errors: { Phone: ['Проверьте номер телефона'] },
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736'
    })

    expect(normalizeProblem(server)).toBe(server)
    expect(presentProblem(server, {
      detailsByType: { [server.type]: 'Выберите регистрацию' }
    })).toBe('Выберите регистрацию')
    expect(problemFieldErrors(server, 'phone')).toEqual(['Проверьте номер телефона'])
    expect(problemFieldErrors(server, 'code')).toEqual([])
    expect(server.toJSON()).toEqual(expect.objectContaining({
      status: 404,
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736'
    }))
  })

  it('normalizes native and arbitrary failures without displaying raw values', () => {
    for (const value of [
      'raw failure',
      null,
      { message: 'raw object' },
      new Error('raw error'),
      new TypeError('Failed to fetch')
    ]) {
      const problem = normalizeProblem(value, { detail: 'Безопасное описание' })
      expect(problem.type).toBe(INTERNAL_PROBLEM_TYPES.unexpectedError)
      expect(problem.message).toBe('Безопасное описание')
      expect(JSON.stringify(problem)).not.toContain('raw')
    }

    expect(normalizeProblem(new TypeError('network'), { kind: 'networkUnavailable' }).type)
      .toBe(INTERNAL_PROBLEM_TYPES.networkUnavailable)
  })

  it('supports structured local validation and named suppression', () => {
    const logger = { log: vi.fn() }
    const validation = createInternalProblem('invalidInput', {
      detail: 'Введите номер телефона',
      errors: { phone: ['Введите номер телефона'] }
    })
    expect(problemFieldErrors(validation, 'phone')).toEqual(['Введите номер телефона'])
    expect(hasOnlyPresentedFieldErrors(validation, ['phone'])).toBe(true)
    expect(hasOnlyPresentedFieldErrors(validation, ['email'])).toBe(false)
    expect(hasOnlyPresentedFieldErrors(createInternalProblem('unexpectedError'), ['phone'])).toBe(false)
    expect(suppressProblem(validation, { operation: 'validation.local', logger })).toBe(validation)
    expect(suppressProblem(new Error('hidden'), {
      detail: 'Безопасная диагностика',
      operation: 'failure.expected',
      logger
    }).message)
      .toBe('Безопасная диагностика')
    expect(logger.log).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('hidden')
  })

  it('rejects unknown internal catalogue keys', () => {
    expect(() => createInternalProblem('missing')).toThrow(TypeError)
  })
})
