// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { describe, expect, it } from 'vitest'
import { dateIsValid, timestampIsValid, limitIsValid, validateProductLimits, validateOrderDetails, productForm, productValidation, priceCents, productPayload } from '../src/orderProduct.js'
import { details, product, currencies, ops, productLimits, limit } from './fixtures/orderProduct.js'

describe('order product contracts', () => {
  it('accepts complete and legacy snapshots and retains microseconds', () => {
    expect(validateOrderDetails(details, ops, details.orderNumber)).toBe(details)
    const legacy = { ...details, product:{ ...product, productName:null, sellerPrice:null }, storeName:null, imageUrl:null, dimensions:null, characteristics:null, savedLimitSourceEffectiveDate:null }
    expect(validateOrderDetails(legacy, ops, details.orderNumber)).toBe(legacy)
    expect(productForm(legacy.product, legacy.storeName, productLimits).sellerPrice).toBe('')
    expect(productForm(legacy.product, legacy.storeName, productLimits).productName).toBe('')
    expect(validateProductLimits(productLimits, currencies)).toBe(productLimits)
    expect(limitIsValid({ ...limit, available:false, sourceEffectiveDate:null, maximumTotalUsd:null }, currencies)).toBe(true)
  })
  it.each([null, {}, { ...details, orderNumber:'bad' }, { ...details, status:999 }, { ...details, sourceUrl:4 },
    { ...details, createdAt:'2026-02-30T00:00:00Z' }, { ...details, updatedAt:'2020-01-01T00:00:00Z' },
    { ...details, product:null }, { ...details, product:{ ...product, color:3 } },
    { ...details, product:{ ...product, quantity:1.5 } }, { ...details, product:{ ...product, sellerPrice:{ amount:0, currency:840 } } },
    { ...details, product:{ ...product, sellerPrice:{ amount:1, currency:999 } } },
    { ...details, submittedProduct:null }, { ...details, customer:null },
    { ...details, customer:{ ...details.customer, phone:null } }, { ...details, customer:{ ...details.customer, phone:'' } },
    { ...details, customer:{ ...details.customer, passportIssueDate:'2026-02-30' } },
    { ...details, customer:{ ...details.customer, email:9 } }, { ...details, customer:{ ...details.customer, email:'x'.repeat(2001) } },
    { ...details, storeName:5 }, { ...details, imageUrl:5 }, { ...details, dimensions:{} }, { ...details, dimensions:[] }, { ...details, savedLimitSourceEffectiveDate:'bad' },
    { ...details, characteristics:[] }, { ...details, characteristics:{ a:1 } }, { ...details, characteristics:{ '':'x' } },
    { ...details, limitCheck:null }, { ...details, canEditProduct:null }, { ...details, status:300 }
  ])('rejects malformed detail DTO (%j)', value => {
    expect(() => validateOrderDetails(value, ops, details.orderNumber)).toThrow()
  })
  it('validates dates without normalizing broken dates', () => {
    for (const value of [null, '', 'bad', '2026-02-30', '2026-13-01']) expect(dateIsValid(value)).toBe(false)
    expect(dateIsValid('2024-02-29')).toBe(true)
    expect(timestampIsValid('2026-01-01T99:00:00Z')).toBe(false)
    expect(timestampIsValid(null)).toBe(false)
    expect(validateOrderDetails({ ...details, customer:{ ...details.customer, passportIssueDate:'2020-01-01' } }, ops, details.orderNumber)).toBeDefined()
  })
  it.each([null, {}, { ...productLimits, minimumQuantity:0 }, { ...productLimits, minimumQuantity:2 },
    { ...productLimits, defaultQuantity:5 }, { ...productLimits, maximumUnitPrice:Infinity },
    { ...productLimits, priceDecimalPlaces:3 }, { ...productLimits, sellerPriceCurrency:643 },
    ...[null, { ...limit, maximumAmount:0 }, { ...limit, currency:840 }, { ...limit, available:1 },
      { ...limit, sourceEffectiveDate:null }, { ...limit, maximumTotalUsd:-1 }, { ...limit, maximumTotalUsd:Infinity },
      { ...limit, exceededMessage:null }, { ...limit, exceededMessage:'raw error' },
      { ...limit, available:false }, { ...limit, available:false, sourceEffectiveDate:null }].map(valueLimit => ({ ...productLimits, valueLimit }))
  ])('rejects broken limits (%j)', value => { expect(() => validateProductLimits(value, currencies)).toThrow() })
})

describe('form rules and payload', () => {
  it('compares integer cents, keeps the exact boundary and uses Core message', () => {
    const form = { ...productForm(product, details.storeName, productLimits), sellerPrice:'281,25', quantity:'4' }
    expect(productValidation(form, productLimits, limit)).toBeNull()
    expect(priceCents(' 1,1 ')).toBe(110n)
    expect(priceCents('1')).toBe(100n)
    expect(priceCents('1.001')).toBeNull()
    form.sellerPrice = '281.26'
    expect(productValidation(form, productLimits, limit).errors.sellerPrice).toEqual([limit.exceededMessage])
    expect(productValidation(form, productLimits, { ...limit, available:false })).toBeNull()
    form.sellerPrice = '1124.99'; form.quantity = '1'
    expect(productValidation(form, productLimits, limit)).toBeNull()
  })
  it('preserves invalid input and reports all fields', () => {
    const form = { productName:'', storeName:'m'.repeat(201), sellerPrice:'abc', quantity:'1.5', color:'c'.repeat(201), size:'s'.repeat(201), comment:'x'.repeat(2001) }
    expect(Object.keys(productValidation(form, productLimits, limit).errors)).toHaveLength(7)
    expect(form.quantity).toBe('1.5')
    for (const quantity of ['0', '-1', 'abc', '999999999999999999999999']) expect(productValidation({ ...form, quantity }, productLimits, limit).errors.quantity).toBeDefined()
    expect(productValidation({ ...form, quantity:'5' }, productLimits, limit).errors.quantity).toEqual(['Такое количество товара может быть признано коммерческой партией и запрещено к ввозу'])
    for (const sellerPrice of ['0', '100000000', '-1', '1e3']) expect(productValidation({ ...form, sellerPrice }, productLimits, limit).errors.sellerPrice).toBeDefined()
    expect(productValidation({ ...form, productName:'x'.repeat(501) }, productLimits, limit).errors.productName).toEqual(['Не более 500 символов.'])
  })
  it('whitelists payload and keeps server version verbatim', () => {
    const form = { ...productForm(product, details.storeName, productLimits), productName:' Чайник ', storeName:' Магазин 2 ', sellerPrice:'40,01', comment:' note ', size:' L ', sourceUrl:'evil' }
    expect(productPayload(form, productLimits, details.updatedAt)).toEqual({
      expectedUpdatedAt:details.updatedAt, storeName:'Магазин 2', productName:'Чайник', sellerPrice:{ amount:40.01, currency:840 },
      quantity:1, color:'Красный', size:'L', comment:'note'
    })
    expect(productPayload({ ...form, storeName:' ', color:' ', size:'', comment:'' }, productLimits, details.updatedAt)).toMatchObject({ storeName:null, color:null, size:null, comment:null })
    expect(productForm({ ...product, color:null, sellerPrice:{ amount:1, currency:978 } }, null, productLimits).sellerPrice).toBe('')
  })
})
