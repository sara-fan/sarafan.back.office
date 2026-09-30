// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { describe, it, expect } from 'vitest'
import { priceHistoryRows } from '../src/orderPriceHistory.js'
import { pricingDetails, pricingOps } from './fixtures/orderPricing.js'
const clone = value => globalThis.structuredClone(value)
function fixture() { return { event:{ kind:300 }, pricingBefore:clone(pricingDetails.calculation), pricingAfter:clone(pricingDetails.calculation), validUntilBefore:null, validUntilAfter:null, productBefore:null, productAfter:null } }
const rows = detail => priceHistoryRows(detail, pricingOps)
const component = (detail, id) => detail.pricingAfter.components.find(item => item.service === id)

describe('compact historical price comparison', () => {
  it('shows only the total for identical snapshots and ignores tariff metadata', () => {
    const d = fixture(); component(d, 100).tariff.updatedAt = '2026-09-26T10:00:00Z'
    expect(rows(d)).toEqual([{ key:'total', name:'Итого', before:'8 998,40₽', after:'8 998,40₽', reason:'Стоимость без изменений', total:true }])
  })
  it('compares manual amounts and preserves zero and saved foreign-currency equivalents', () => {
    const d = fixture(); d.pricingAfter.inputs.manualAmounts[100] = 2
    Object.assign(component(d, 100), { amount:2, amountRub:160 }); d.pricingAfter.totalRub += 160
    const result = rows(d)
    expect(result[0]).toMatchObject({ key:100, before:'0,00$ (0,00₽)', after:'2,00$ (160,00₽)', reason:'Ручной ввод' })
    expect(result[1].reason).toBe('Ручной ввод')
  })
  it.each(['id', 'priceMethod', 'amount', 'currency', 'percentage', 'minimumAmount', 'maximumAmount', 'intervalCurrency', 'bands'])('shows a tariff %s change even at the same price', field => {
    const d = fixture(); component(d, 100).tariff[field] = field === 'bands' ? [{ from:null, by:100, amount:5 }] : 123
    expect(rows(d)[0].reason).toBe('Изменение тарифа')
  })
  it('reports combined tariff/manual/product/rate evidence', () => {
    const d = fixture(); component(d, 100).tariff.id++
    d.pricingAfter.inputs.manualAmounts[100] = 2; component(d, 100).amount = 2
    d.pricingAfter.exchangeRate.officialRate = 90
    d.productBefore = { quantity:1, sellerPrice:{ amount:1, currency:840 } }
    d.productAfter = { quantity:2, sellerPrice:{ amount:2, currency:840 } }
    expect(rows(d)[0].reason).toBe('Изменение тарифа; Ручной ввод; Автоматический пересчёт: изменение курса, изменение количества, изменение цены товара')
  })
  it('shows automatic changes without inventing a specific trigger', () => {
    const d = fixture(); component(d, 200).amount++
    expect(rows(d)[0].reason).toBe('Автоматический пересчёт')
  })
  it('explains changed customer selections and states', () => {
    const d = fixture(); d.pricingAfter.inputs.selectedServices.push(500)
    component(d, 500).state = 100
    expect(rows(d)[0]).toMatchObject({ before:'Не применяется', after:'Не рассчитана', reason:'Изменение выбора услуги' })
  })
  it('keeps changed extras after the unchanged total', () => {
    const d = fixture(); Object.assign(component(d, 300), { state:0, amount:0, amountRub:0 })
    Object.assign(component(d, 800), { state:0, amount:200, amountRub:200 })
    const result = rows(d)
    expect(result.map(row => row.key)).toEqual(['total', 300, 800])
    expect(result[1]).toMatchObject({ extra:true, before:'Не рассчитана', after:'0,00₽' })
  })
  it('distinguishes an initial calculation from missing historical evidence', () => {
    const d = fixture(); d.pricingBefore = null; d.event.kind = 0
    expect(rows(d)[0]).toMatchObject({ before:'—', reason:'Первичный расчёт' })
    d.event.kind = 300
    expect(rows(d)[0]).toMatchObject({ before:'Нет данных', reason:'-' })
    d.pricingBefore = d.pricingAfter; d.pricingAfter = null
    expect(rows(d)[0]).toMatchObject({ after:'Нет данных', reason:'-' })
    d.pricingBefore = null; expect(rows(d)).toEqual([])
  })
  it('never fills absent components or exchange equivalents from current data', () => {
    const d = fixture(); d.pricingBefore.components = d.pricingBefore.components.filter(item => item.service !== 100)
    component(d, 100).amountRub = null
    expect(rows(d)[0]).toMatchObject({ before:'Нет данных', after:'0,00$ (Нет данных)', reason:'-' })
    d.pricingAfter.components = d.pricingAfter.components.filter(item => item.service !== 100)
    expect(rows(d)).toHaveLength(1)
  })
  it('shows unavailable totals and confirmation validity without panels', () => {
    const d = fixture(); d.pricingAfter.totalRub = null; d.validUntilAfter = '2026-09-25T10:00:00Z'
    let result = rows(d)
    expect(result[0].after).toBe('Не рассчитана')
    expect(result[1]).toMatchObject({ before:'Не подтверждена', reason:'Подтверждение расчёта' })
    d.validUntilBefore = d.validUntilAfter; expect(rows(d)[1].reason).toBe('Без изменений')
    d.validUntilAfter = null; expect(rows(d)[1].reason).toBe('Снятие подтверждения')
  })
  it('compares both missing rates without reporting a rate change', () => {
    const d = fixture(); d.pricingBefore.exchangeRate = null; d.pricingAfter.exchangeRate = null
    component(d, 400).amount++
    expect(rows(d)[0].reason).toBe('Автоматический пересчёт')
  })
})


it('does not infer a cause for an inconsistent total or unrelated product edits', () => {
  const d = fixture(); d.pricingAfter.totalRub++
  d.productBefore = { quantity:1, sellerPrice:{ amount:1, currency:840 }, color:'Red' }
  d.productAfter = { ...d.productBefore, color:'Blue' }
  expect(rows(d)[0].reason).toBe('-')
})

it('interprets customs zero without changing its saved numeric evidence or other service zeros', () => {
  const d = fixture()
  Object.assign(component(d, 800), { state:0, amount:0, amountRub:0 })
  Object.assign(component(d, 300), { state:0, amount:0, amountRub:0 })
  expect(rows(d).find(row => row.key === 800).after).toBe('Не ожидаются')
  expect(rows(d).find(row => row.key === 300).after).toBe('0,00₽')
  expect(component(d, 800).amountRub).toBe(0)
})
