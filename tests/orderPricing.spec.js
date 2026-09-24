// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { describe, expect, it } from 'vitest'
import { manualPricingTariffs, optionalServices, pricingForm, pricingPayload, validateOrderPricing, validatePricingOps } from '../src/orderPricing.js'
import { pricingDetails as details, pricingOps as ops } from './fixtures/orderPricing.js'
const clone = value => globalThis.structuredClone(value)
describe('order pricing protocol', () => {
  it('validates Core metadata, complete snapshots and form conversion', () => {
    expect(validatePricingOps(ops)).toBe(ops)
    expect(validateOrderPricing(details, ops, details.orderNumber)).toBe(details)
    expect(optionalServices(ops)).toHaveLength(3)
    expect(manualPricingTariffs(details, ops)).toHaveLength(1)
    const form = pricingForm(details, ops)
    expect(form.manualAmounts[100]).toBe('0,00')
    form.domesticDeliveryRub = '12,35'; form.customsRub = '1.20'; form.manualAmounts[100] = ''
    expect(pricingPayload(form, details.updatedAt, ops)).toEqual({ expectedUpdatedAt:details.updatedAt,
      inputs:{ manualAmounts:{}, selectedServices:[], domesticDeliveryRub:12.35, customsRub:1.2 } })
  })
  it.each([null, {}, { ...ops, validityHours:1 }, { ...ops, canManage:null }, { ...ops, componentStates:[] },
    { ...ops, componentStates:ops.componentStates.map(item => ({ ...item, routeAlias:'invalid' })) }])('rejects malformed metadata %#', value => expect(() => validatePricingOps(value)).toThrow())
  it.each([
    value => { value.orderNumber = 'foreign' }, value => { value.updatedAt = 'bad' }, value => { value.confirmed = true },
    value => { value.expired = true }, value => { value.canConfirm = 'yes' }, value => { value.history = null },
    value => { value.calculation.totalRub = 1 }, value => { value.calculation.totalRub = null },
    value => { value.calculation.components.pop() }, value => { value.calculation.components[0].currency = 978 },
    value => { value.calculation.components[0].amountRub = null }, value => { value.calculation.components[0].state = 999 },
    value => { value.calculation.components[0].amount = -1 }, value => { value.calculation.components[0].service = 999 },
    value => { value.calculation.components[0].tariff = value.activeTariffs[0] },
    value => { value.calculation.components[7].amount = 0 }, value => { value.calculation.calculatedAt = 'bad' },
    value => { value.calculation.exchangeRate.provider = 'manual' }, value => { value.calculation.exchangeRate.baseCurrency = 978 },
    value => { value.calculation.exchangeRate.nominal = 0 }, value => { value.calculation.exchangeRate.officialRate = Infinity },
    value => { value.calculation.exchangeRate.sourceEffectiveDate = 'bad' },
    value => { value.calculation.inputs.manualAmounts = [] }, value => { value.calculation.inputs.manualAmounts[999] = 1 },
    value => { value.calculation.inputs.manualAmounts[100] = 1.001 }, value => { value.calculation.inputs.selectedServices = [0] },
    value => { value.calculation.inputs.selectedServices = [500, 500] }, value => { value.calculation.inputs.domesticDeliveryRub = -1 },
    value => { value.activeTariffs.push(value.activeTariffs[0]) }, value => { value.history[0].actorId = 0 },
    value => { value.history[0].actorName = 'Unexpected' }, value => { value.history[0].validUntil = 'bad' },
    value => { value.history[0].validUntil = value.history[0].at }, value => { value.history.push(value.history[0]) }
  ])('rejects malformed price data %#', mutate => {
    const value = clone(details); mutate(value)
    expect(() => validateOrderPricing(value, ops, details.orderNumber)).toThrow()
  })
  it('accepts unavailable calculations and retained expired confirmations', () => {
    const missing = clone(details)
    missing.canConfirm = false; missing.calculation.totalRub = null; missing.calculation.exchangeRate = null
    missing.calculation.components[0].state = 100; missing.calculation.components[0].amountRub = null
    expect(validateOrderPricing(missing, ops, details.orderNumber)).toBe(missing)
    const frozen = clone(details)
    frozen.canEdit = frozen.canConfirm = false; frozen.confirmed = frozen.expired = true
    frozen.validUntil = '2026-09-25T10:00:00Z'
    frozen.history[0].actorId = 1; frozen.history[0].actorName = 'Иван'; frozen.history[0].validUntil = frozen.validUntil
    expect(validateOrderPricing(frozen, ops, details.orderNumber)).toBe(frozen)
  })
  it.each(['-1', '1.001', 'bad', '100000000', 'Infinity'])('rejects invalid manual money %s', text => {
    const form = pricingForm(details, ops); form.customsRub = text
    expect(() => pricingPayload(form, details.updatedAt, ops)).toThrow()
  })
})
