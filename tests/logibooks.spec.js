// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { describe, expect, it } from 'vitest'
import { goodsIsValid, uuidIsValid, validateLogibooksOps, validatePreview, validateOperation, validateRows,
  validateOperationPage, normalizeLogibooksFilters, rowIsValid, operationLabel, rowLabel, eligibilityIsValid,
  canManageLogibooksRegisters, canCreateLogibooksRegister, canReconcileLogibooksRegister } from '../src/logibooks.js'
import { normalizeRegisterInput, registerInputErrors, validateRegisterDetails } from '../src/logibooks.js'
import { goodsColumns, goodsCell, displayOptional, displayWeight } from '../src/logibooksPresentation.js'
import { ops, goods, command, preview, operation, row, page, id, attemptId } from './fixtures/logibooks.js'
const copy = value => globalThis.structuredClone(value)
function changed(value, path, replacement) { const result = copy(value), parts = path.split('.'), last = parts.pop(); let target = result
  for (const key of parts) target = target[key]; target[last] = replacement; return result }
describe('Logibooks protocol', () => {
  it('validates the demo and frozen preview contracts', () => {
    expect(uuidIsValid(id)).toBe(true); expect(uuidIsValid('invalid')).toBe(false)
    expect(validateLogibooksOps(ops)).toBe(ops); expect(goodsIsValid(goods)).toBe(true)
    expect(validatePreview(preview, ops, command)).toBe(preview)
    expect(validatePreview(preview, ops, { ...command, fileName:preview.fileName })).toBe(preview)
    expect(operationLabel('Unknown', ops)).toBe('Результат неизвестен'); expect(operationLabel('other', ops)).toBe('—')
    for (const outcome of ['Created', 'Rejected', 'Unresolved']) expect(rowLabel({ outcome })).toBeTruthy()
    expect(normalizeLogibooksFilters({ search:'', state:'' })).toEqual({ search:'', state:'' })
    expect(normalizeLogibooksFilters({ search:'x', state:'Unknown' })).toEqual({ search:'x', state:'Unknown' })
    for (const value of [null, {}, { search:'x', state:'bad' }, { search:'x'.repeat(201), state:'' }]) expect(normalizeLogibooksFilters(value)).toBeNull()
  })
  it.each([['enabled', null], ['canManage', 1], ['maximumOrders', 0], ['maximumOrders', undefined], ['maximumOrders', 1001],
    ['maximumOrders', 1.5], ['maximumOrders', Number.MAX_SAFE_INTEGER + 1],
    ['unitPriceCurrency', undefined], ['unitPriceCurrency', null], ['unitPriceCurrency.value', 643],
    ['unitPriceCurrency.routeAlias', 'rub'], ['unitPriceCurrency.name', ' '], ['unitPriceCurrency.name', null],
    ['unitPriceCurrency.symbol', ' '], ['unitPriceCurrency.symbol', null], ['maximumLabelLength', -1], ['maximumCommandBytes', 0],
    ['maximumOutboundBytes', 0], ['maximumResponseBytes', 0], ['mappingVersion', 0], ['demoDefaults', null], ['demoDefaults', ['']],
    ['states', []], ['states.0.name', ''], ['states.0.routeAlias', 'bad'], ['states.0.value', 8]])('rejects invalid metadata %s', (key, value) => {
    expect(() => validateLogibooksOps(changed(ops, key, value))).toThrow(); expect(() => validateLogibooksOps(null)).toThrow()
  })
  it('accepts bounded limits and server-owned USD symbol text', () => {
    for (const maximumOrders of [1, 1000]) {
      const metadata = { ...ops, maximumOrders, unitPriceCurrency:{ ...ops.unitPriceCurrency, symbol:'US$' } }
      expect(validateLogibooksOps(metadata)).toBe(metadata)
    }
  })
  it.each([['postingNumber', 'bad'], ['productName', ''], ['unitPrice', 0], ['unitPrice', 100000000], ['unitPrice', 1.234], ['currency', 'RUB'],
    ['quantity', 0], ['quantity', 10000000000], ['weightKg', 0], ['countryCode', 1], ['senderCountryCode', 1], ['tradingCountryCode', 1],
    ['productLink', null]])('rejects invalid goods %s', (key, value) => expect(goodsIsValid({ ...goods, [key]:value })).toBeFalsy())
  it.each([['operationId', 'bad'], ['fileName', ''], ['fileName', 'x'.repeat(201)], ['mappingVersion', 2], ['fingerprint', 'a'.repeat(64)],
    ['parcels', []], ['parcels.0.postingNumber', '12345678-2'], ['register.fileName', 'other'], ['register.customsProcedureCode', 10],
    ['register.transportationTypeCode', 0], ['register.incotermsCode', 0], ['register.realWeightKg', 1], ['demoDefaults', null],
    ['demoDefaults', [1]]])('rejects inconsistent preview %s', (key, value) => expect(() => validatePreview(changed(preview, key, value), ops, command)).toThrow())
  it('validates operations, retained failures, and state counts', async () => {
    expect((await validateOperation(operation, id)).id).toBe(id)
    await validateOperation({ ...operation, state:'Succeeded', phase:'Applied', created:1, unresolved:0, registerId:10 })
    await validateOperation({ ...operation, state:'Rejected', phase:'Applied', rejected:1, unresolved:0 })
    await validateOperation({ ...operation, total:2, state:'PartiallySucceeded', created:1, rejected:1, unresolved:0, registerId:10 })
    const failure = { type:'https://sarafan.sw.consulting/problems/logibooks-unknown', code:'logibooks_unknown', status:502,
      title:'Результат неизвестен', detail:'Проверьте результат.', instance:'/test' }
    expect((await validateOperation({ ...operation, state:'Unknown', phase:'Dispatching', attemptId, failure })).failure.code).toBe('logibooks_unknown')
    await expect(validateOperation({ ...operation, failure:{} })).rejects.toThrow()
    for (const [key, value] of [['id', 'bad'], ['version', null], ['fileName', ''], ['state', 'bad'], ['phase', 'bad'],
      ['createdAt', 'bad'], ['updatedAt', 'bad'], ['attemptId', 'bad'], ['total', 0], ['created', -1], ['rejected', 1],
      ['registerId', 0], ['investigationRequired', null], ['state', 'Succeeded'], ['state', 'Rejected'], ['state', 'PartiallySucceeded']])
      await expect(validateOperation({ ...operation, [key]:value })).rejects.toThrow()
    await expect(validateOperation(operation, 'other')).rejects.toThrow()
    await expect(validateOperation({ ...operation, created:1, unresolved:0 })).rejects.toThrow()
  })
  it('combines local roles and Core capability independently of dispatch enablement', () => {
    const admin = { roles:['administrator'] }, manager = { roles:['shift-manager'] }
    for (const user of [admin, manager]) {
      expect(canManageLogibooksRegisters(user, ops)).toBe(true)
      expect(canCreateLogibooksRegister(user, ops)).toBe(true)
      expect(canManageLogibooksRegisters(user, { ...ops, enabled:false })).toBe(true)
      expect(canCreateLogibooksRegister(user, { ...ops, enabled:false })).toBe(false)
      for (const metadata of [null, {}, { ...ops, canManage:false }]) {
        expect(canManageLogibooksRegisters(user, metadata)).toBe(false)
        expect(canCreateLogibooksRegister(user, metadata)).toBe(false)
      }
    }
    for (const user of [null, {}, { roles:['operator'] }, { roles:['senior-operator'] }, { roles:['unknown'] }]) {
      expect(canManageLogibooksRegisters(user, ops)).toBe(false)
      expect(canCreateLogibooksRegister(user, ops)).toBe(false)
    }
  })
  it('requires attempt evidence for Unknown operations and shares reconciliation eligibility', async () => {
    const unknown = { ...operation, state:'Unknown', phase:'Dispatching', attemptId }
    expect((await validateOperation(unknown)).attemptId).toBe(attemptId)
    expect(canReconcileLogibooksRegister(unknown)).toBe(true)
    for (const attemptId of [null, undefined, '', 'bad']) {
      const invalid = { ...unknown, attemptId }
      await expect(validateOperation(invalid)).rejects.toThrow()
      expect(canReconcileLogibooksRegister(invalid)).toBe(false)
    }
    expect((await validateOperation(operation)).attemptId).toBeNull()
    for (const unavailable of [null, operation, { ...unknown, phase:'ReceiptRetained' }, { ...unknown, investigationRequired:true }])
      expect(canReconcileLogibooksRegister(unavailable)).toBe(false)
  })
  it('validates paged rows and server filters without assuming consecutive filtered row numbers', async () => {
    expect(rowIsValid(row)).toBe(true)
    expect(rowIsValid({ ...row, outcome:'Created', parcelId:10, statusId:7, checkStatus:16 })).toBe(true)
    const value = page([row], new globalThis.URLSearchParams({ page:1, pageSize:25 }))
    expect(validateRows(value, 1, 25)).toBe(value)
    expect(validateRows({ ...value, items:[{ ...row, rowNumber:99 }], search:'товар' }, 1, 25, 'товар')).toBeTruthy()
    for (const [key, replacement] of [['rowNumber', 0], ['orderNumber', 'bad'], ['outcome', 'bad'], ['parcelId', 10],
      ['statusId', 'bad'], ['checkStatus', 1.5], ['goods', {}], ['issues', null], ['issues', [{ code:'', msg:'msg' }]],
      ['issues', [{ code:'code', msg:'', field:'x' }]], ['issues', [{ code:'code', msg:'msg', field:1 }]]])
      expect(rowIsValid({ ...row, [key]:replacement })).toBeFalsy()
    expect(rowIsValid({ ...row, issues:[{ code:'code', msg:'msg', field:'x' }] })).toBe(true)
    expect(() => validateRows(value, 2, 25)).toThrow(); expect(() => validateRows(value, 1, 10)).toThrow()
    expect(() => validateRows({ ...value, search:'other' }, 1, 25)).toThrow()
    expect(() => validateRows({ ...value, sorting:{ sortBy:'rowNumber', sortOrder:'desc' } }, 1, 25)).toThrow()
    const duplicate = page([row, row], new globalThis.URLSearchParams())
    expect(() => validateRows(duplicate, 1, 25)).toThrow()
    const state = { page:1, pageSize:25, sortBy:[{ key:'createdAt', order:'asc' }], filters:{ search:'', state:'' } }
    const list = page([operation], new globalThis.URLSearchParams(), 'createdAt')
    expect((await validateOperationPage(list, state)).items).toHaveLength(1)
    for (const invalid of [{ ...state, page:2 }, { ...state, pageSize:10 }, { ...state, sortBy:[{ key:'state', order:'desc' }] },
      { ...state, filters:{ search:'other', state:'' } }, { ...state, filters:{ search:'', state:'Unknown' } }])
      await expect(validateOperationPage(list, invalid)).rejects.toThrow()
  })
  it('allows selection only with server eligibility and an actual paid USD unit price', () => {
    const value = { status:300, sellerPrice:{ amount:1.25, currency:840 }, logibooks:{ canSelect:true, reason:null, operationId:null } }
    expect(eligibilityIsValid(value)).toBe(true)
    expect(eligibilityIsValid({ ...value, logibooks:{ canSelect:false, reason:'Недоступно', operationId:id } })).toBe(true)
    for (const change of [{ status:0 }, { sellerPrice:null }, { sellerPrice:{ amount:0, currency:840 } },
      { sellerPrice:{ amount:1.234, currency:840 } }, { sellerPrice:{ amount:1, currency:643 } }, { logibooks:null },
      { logibooks:{ canSelect:1 } }, { logibooks:{ canSelect:false, reason:'' } },
      { logibooks:{ canSelect:true, reason:'blocked' } }, { logibooks:{ canSelect:true, operationId:'bad' } }])
      expect(eligibilityIsValid({ ...value, ...change })).toBeFalsy()
  })
})

describe('register details and parcel presentation', () => {
  it('normalizes only editable metadata and validates dates and fixed values', () => {
    expect(normalizeRegisterInput()).toBeUndefined()
    expect(normalizeRegisterInput({ dealNumber:' ', invoiceNumber:null })).toBeUndefined()
    expect(normalizeRegisterInput({ dealNumber:' Deal ', customsProcedureCode:10 })).toEqual({ dealNumber:'Deal' })
    expect(registerInputErrors({ invoiceDate:'2024-02-29' })).toEqual({})
    for (const invoiceDate of ['2026-02-29', '0000-01-01', 'bad'])
      expect(registerInputErrors({ invoiceDate })['register.invoiceDate']).toBeTruthy()
    expect(registerInputErrors()).toEqual({})
    expect(validateRegisterDetails(preview.register, preview.fileName)).toEqual(preview.register)
    for (const change of [{ fileName:'' }, { fileName:0 }, { invoiceDate:'' }, { invoiceDate:'bad' }, { dealNumber:42 },
      { realWeightKg:0 }, { realWeightKg:Infinity }, { realWeightKg:'2' }, { customsProcedureCode:10 },
      { transportationTypeCode:0 }, { incotermsCode:3 }])
      expect(() => validateRegisterDetails({ ...preview.register, ...change }, preview.fileName)).toThrow()
    expect(() => validateRegisterDetails(null)).toThrow()
    expect(() => validateRegisterDetails([])).toThrow()
    const register = { dealNumber:'Deal', invoiceDate:'2026-10-12' }
    expect(validatePreview({ ...preview, register:{ ...preview.register, ...register } }, ops, { ...command, register }).register.dealNumber).toBe('Deal')
    expect(() => validatePreview({ ...preview, register:{ ...preview.register, ...register } }, ops, command)).toThrow()
    for (const change of [{ senderPhone:42 }, { passportIssueDate:'bad' }, { passportIssueDate:'' }])
      expect(goodsIsValid({ ...goods, ...change })).toBe(false)
  })
  it('formats reference columns, missing values and combined passports', () => {
    expect(goodsColumns.map(x => x.title)).toEqual(['№ посылки', 'ТН ВЭД', 'Описание', 'Ссылка на товар', 'Фамилия', 'Имя', 'Отчество',
      'Телефон', 'Email', 'Индекс', 'Город', 'Улица', 'Паспорт', 'ИНН', 'Вес', 'Стоимость', 'Валюта', 'Количество', 'Отправитель',
      'Телефон отправителя', 'Email отправителя', 'Адрес отправителя', 'Страна', 'Страна отправления', 'Торгующая страна'])
    expect(goodsCell(goods, 'passport', 'US$')).toBe('—')
    expect(goodsCell({ ...goods, passportSeries:'4500', passportNumber:'123456', passportIssuedBy:'Отдел', passportIssueDate:'2020-02-29' }, 'passport', 'US$'))
      .toBe('4500 123456 выдан Отдел 29.02.2020')
    expect(goodsCell({ ...goods, passportIssuedBy:'Отдел' }, 'passport', 'US$')).toBe('выдан Отдел')
    expect(goodsCell({ ...goods, passportIssueDate:'2020-02-29' }, 'passport', 'US$')).toBe('выдан 29.02.2020')
    expect(goodsCell(goods, 'unitPrice', 'US$')).toBe('12,34US$')
    expect(goodsCell(goods, 'currency', 'US$')).toBe('US$')
    expect(goodsCell(goods, 'weightKg', 'US$')).toBe('1,000')
    expect(goodsCell(goods, 'countryCode', 'US$')).toBe('643')
    expect(goodsCell(goods, 'senderPhone', 'US$')).toBe('—')
    expect(displayOptional('')).toBe('—'); expect(displayWeight(null)).toBe('—')
  })
})
