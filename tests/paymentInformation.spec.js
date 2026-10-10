// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { describe, expect, it } from 'vitest'
import { PAYMENT_SORT_KEYS, paymentDefaults, normalizePaymentFilters, safePaymentLink, validatePaymentOps, paymentForm, paymentValidation, validatePaymentBundle, validatePaymentPage, paymentPayload } from '../src/paymentInformation.js'
import { paymentOps as ops, paymentBundle as row, paymentRow, paymentPage } from './fixtures/paymentInformation.js'

const copy = value => globalThis.structuredClone(value)
describe('payment bundle contract', () => {
  it('validates metadata, lifecycle, incomplete drafts and exact bank strings', () => {
    expect(validatePaymentOps(ops)).toBe(ops)
    expect(PAYMENT_SORT_KEYS).toEqual(['id', 'recipientName', 'inn', 'bankName', 'state', 'createdAt'])
    for (const state of ['draft','enabled','disabled']) expect(validatePaymentBundle(paymentRow(state),ops,1).state).toBe(state)
    const empty = { ...row, information:Object.fromEntries(Object.keys(row.information).map(key => [key,null])), qrUrl:null,canEnable:false }
    expect(validatePaymentBundle(empty,ops)).toBe(empty)
    expect(paymentForm(null).recipientType).toBeNull()
    expect(paymentValidation(paymentForm(null),ops,null)).toBeNull()
    expect(normalizePaymentFilters(paymentDefaults.filters)).toEqual(paymentDefaults.filters)
    for (const invalid of [null,{}, { search:1,state:null }, { search:'a'.repeat(201),state:null }, { search:'',state:'bad' }]) expect(normalizePaymentFilters(invalid)).toBeNull()
    const form = paymentForm(row), file = new globalThis.File(['png'],'qr.png',{ type:'image/png' })
    const payload = paymentPayload(form,row.version,file)
    expect(payload.get('inn')).toBe('0012345678'); expect(payload.get('paymentLink')).toBe(row.information.paymentLink)
    expect(payload.get('version')).toBe(row.version); expect(payload.get('qr')).toBe(file)
    expect(paymentPayload(paymentForm(null)).has('recipientType')).toBe(false)
    expect(safePaymentLink(row.information.paymentLink)).toBe(true)
    for (const link of [null, 'http://bank.example/', 'https://u:p@bank.example/', 'https://', 'https://bank.example/\\bad', 'https://bank.example/ab\ncd']) expect(safePaymentLink(link)).toBe(false)
  })
  it.each([
    value => { value.canManage = 1 }, value => { value.recipientTypes = [] }, value => { value.recipientTypes[0].name = '' },
    value => { value.states = null }, value => { value.states[0].value = 'other' }, value => { value.limits = {} },
    value => { value.limits.qrContentTypes = [] }, value => { value.limits.qrContentTypes[0] = 'image/gif' }
  ])('rejects malformed metadata %#', mutate => { const value = copy(ops); mutate(value); expect(() => validatePaymentOps(value)).toThrow() })
  it.each([
    value => { value.id = 0 }, value => { value.version = 'secret' }, value => { value.information = null },
    value => { value.information.recipientType = 2 }, value => { value.information.inn = 123 },
    value => { value.information.bankName = 'a'.repeat(201) }, value => { value.createdAt = 'yesterday' },
    value => { value.updatedAt = '2026-01-01T00:00:00Z' }, value => { value.createdBy = 0 },
    value => { value.updatedBy = 0 }, value => { value.state = 'unknown' },
    value => { value.enabled = 1 }, value => { value.qrUrl = 'https://evil.example/' }, value => { value.qrUrl = 5 },
    value => { value.state = 'enabled' }, value => { value.canEdit = false }, value => { value.canEnable = false },
    value => { value.canDisable = true }, value => { value.canDelete = false }, value => { value.canCopy = true },
    value => { value.enabled = true; value.state = 'enabled' },
    value => { value.state = 'disabled'; value.canEdit = false; value.canCopy = true; value.qrUrl = null }
  ])('rejects malformed bundles and contradictory capabilities %#', mutate => { const value = copy(row); mutate(value); expect(() => validatePaymentBundle(value,ops)).toThrow() })
  it('validates optional supplied fields and recipient-specific completeness', () => {
    for (const [key, value] of [['recipientType',9],['recipientName','Name\nName'],['bankName','a'.repeat(201)],['inn','x'.repeat(10)],['kpp','123'],['settlementAccount','1'],['bik','1'],['correspondentAccount','1'],['paymentLink','http://bank.example/']]) {
      const form = paymentForm(row); form[key] = value
      expect(paymentValidation(form,ops,null).errors).toHaveProperty(key)
    }
    const ip = paymentForm(row); ip.recipientType = 1; ip.inn = '001234567890'
    expect(paymentValidation(ip,ops,null).errors.kpp).toBeDefined()
    ip.kpp = ''; expect(paymentValidation(ip,ops,null)).toBeNull()
    const unspecified = paymentForm(row); unspecified.recipientType = null
    expect(paymentValidation(unspecified,ops,null)).toBeNull()
    for (const file of [new globalThis.File([],'empty.png',{type:'image/png'}), new globalThis.File(['svg'],'x.svg',{type:'image/svg+xml'}), {type:'image/png',size:ops.limits.qrMaxBytes+1}])
      expect(paymentValidation(paymentForm(row),ops,file).errors.qr).toBeDefined()
    expect(paymentValidation(paymentForm(row),ops,new globalThis.File(['png'],'qr.png',{type:'image/png'}))).toBeNull()
    expect(() => validatePaymentBundle(row,ops,2)).toThrow()
  })
  it('validates full paging echoes and global enabled selection', () => {
    const request = copy(paymentDefaults), page = paymentPage([paymentRow('enabled')])
    expect(validatePaymentPage(page,ops,request)).toBe(page)
    for (const mutate of [
      value => { value.items = [row,row] }, value => { value.pagination.currentPage = 2 }, value => { value.pagination.pageSize = 25 },
      value => { value.sorting.sortBy = 'bankName' }, value => { value.sorting.sortOrder = 'asc' },
      value => { value.search = 'different' }, value => { value.state = 'disabled' },
      value => { value.enabledBundle = undefined }, value => { value.enabledBundle.id = 2 }, value => { value.enabledBundle.version = row.version.replace('1111','2222') }
    ]) { const value = copy(page); mutate(value); expect(() => validatePaymentPage(value,ops,request)).toThrow() }
  })
})
