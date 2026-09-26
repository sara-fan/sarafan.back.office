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
    expect(manualPricingTariffs(details, ops)).toHaveLength(3)
    const form = pricingForm(details, ops)
    expect(form.manualAmounts[100]).toBe('0,00')
    form.manualAmounts[300] = '12,35'; form.manualAmounts[800] = '1.20'; form.manualAmounts[100] = ''
    expect(pricingPayload(form, details.updatedAt, ops)).toEqual({ expectedUpdatedAt:details.updatedAt,
      inputs:{ manualAmounts:{ 300:12.35, 800:1.2 }, selectedServices:[] } })
  })
  it.each([null, {}, { ...ops, validityHours:1 }, { ...ops, canManage:null }, { ...ops, componentStates:[] },
    { ...ops, catalogue:{ ...ops.catalogue, services:ops.catalogue.services.map(item => ({ ...item, includedInTotal:null })) } },
    { ...ops, componentStates:ops.componentStates.map(item => ({ ...item, routeAlias:'invalid' })) }])('rejects malformed metadata %#', value => expect(() => validatePricingOps(value)).toThrow())
  it.each([
    value => { value.orderNumber = 'foreign' }, value => { value.updatedAt = 'bad' }, value => { value.confirmed = true },
    value => { value.expired = true }, value => { value.canConfirm = 'yes' },
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
    value => { value.calculation.inputs.selectedServices = [500, 500] }, value => { value.calculation.inputs.manualAmounts[300] = -1 },
    value => { value.activeTariffs.push(value.activeTariffs[0]) }
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
    expect(validateOrderPricing(frozen, ops, details.orderNumber)).toBe(frozen)
  })
  it('validates total membership from Core flags', () => {
    const metadata = clone(ops), value = clone(details)
    metadata.catalogue.services.find(item => item.value === 400).includedInTotal = false
    value.calculation.totalRub -= 900
    expect(validateOrderPricing(value, metadata, value.orderNumber)).toBe(value)
    metadata.catalogue.services.find(item => item.value === 300).includedInTotal = true
    expect(() => validateOrderPricing(value, metadata, value.orderNumber)).toThrow()
  })
  it.each(ops.catalogue.services.map(item => item.value))('uses metadata for an unknown applicable cost of service %s', service => {
    const metadata = clone(ops), value = clone(details)
    value.calculation.inputs.selectedServices = optionalServices(metadata).map(item => item.value)
    for (const component of value.calculation.components) {
      component.state = 0
      component.amount = component.amountRub = 10
    }
    const missing = value.calculation.components.find(item => item.service === service)
    missing.state = 100
    missing.amount = missing.amountRub = null
    const membership = metadata.catalogue.services.find(item => item.value === service)
    membership.includedInTotal = false
    value.calculation.totalRub = metadata.catalogue.services.filter(item => item.includedInTotal).length * 10
    value.canConfirm = true
    expect(validateOrderPricing(value, metadata, value.orderNumber)).toBe(value)

    membership.includedInTotal = true
    expect(() => validateOrderPricing(value, metadata, value.orderNumber)).toThrow()
    value.calculation.totalRub = null
    expect(() => validateOrderPricing(value, metadata, value.orderNumber)).toThrow()
    value.canConfirm = false
    expect(validateOrderPricing(value, metadata, value.orderNumber)).toBe(value)
  })
  it.each(['-1', '1.001', 'bad', '100000000', 'Infinity'])('rejects invalid manual money %s', text => {
    const form = pricingForm(details, ops); form.manualAmounts[800] = text
    expect(() => pricingPayload(form, details.updatedAt, ops)).toThrow()
  })
})
