// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import OrderCostSummary from '../src/components/OrderCostSummary.vue'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import { pricingDetails, pricingOps } from './fixtures/orderPricing.js'

let wrapper
function render(pricing = globalThis.structuredClone(pricingDetails), ops = pricingOps) {
  wrapper = mount(OrderCostSummary, { props:{ pricing, ops }, global:{ plugins:[createSarafanVuetify()] } })
  return pricing
}
afterEach(() => wrapper?.unmount())

describe('order cost summary', () => {
  it('shows service selection independently of calculation status in an untitled column', () => {
    const pricing = globalThis.structuredClone(pricingDetails)
    pricing.calculation.inputs.selectedServices = [500]
    pricing.calculation.components.find(item => item.service === 500).state = 100
    pricing.calculation.components[0].state = 100
    render(pricing)
    expect(wrapper.get('thead .service-status-column').text()).toBe('')
    const rows = wrapper.findAll('tbody tr')
    for (const row of rows.slice(0, 4)) {
      expect(row.get('[role="img"]').attributes('aria-label')).toBe('Обязательная услуга')
      expect(row.find('.fa-square-check').exists()).toBe(true)
    }
    expect(rows[4].get('[role="img"]').attributes('aria-label')).toBe('Услуга заказана')
    expect(rows[4].find('.fa-square-plus').exists()).toBe(true)
    expect(rows[4].text()).toContain('Не рассчитана')
    expect(rows[5].get('[role="img"]').attributes('aria-label')).toBe('Услуга не заказана')
    expect(rows[5].find('.fa-square-minus').exists()).toBe(true)
    expect(rows[5].get('[role="img"]').attributes('tabindex')).toBe('0')
    for (const row of wrapper.findAll('tfoot tr').slice(1)) {
      expect(row.get('[role="img"]').attributes('aria-label')).toBe('Обязательная услуга')
      expect(row.find('.fa-square-check').exists()).toBe(true)
    }
  })
  it('shows server component amounts, states, zero and both totals with server currency symbols', () => {
    const ops = globalThis.structuredClone(pricingOps)
    ops.catalogue.currencies[0].symbol = 'руб.'
    ops.catalogue.currencies[1].symbol = 'USD'
    render(globalThis.structuredClone(pricingDetails), ops)
    expect(wrapper.findAll('tbody tr')).toHaveLength(7)
    expect(wrapper.get('tbody').text()).toContain('0,00')
    expect(wrapper.findAll('thead th').slice(3).map(cell => cell.text())).toEqual(['Стоимость, USD', 'Стоимость, руб.'])
    expect(wrapper.get('tbody').text()).not.toMatch(/USD|руб\./u)
    expect(wrapper.get('tbody').text()).toContain('Не применяется')
    expect(wrapper.findAll('tfoot tr:first-child td').map(cell => cell.text())).toEqual(['112,48', '8 998,40'])
    expect(wrapper.text()).toContain('Курс расчёта стоимости: 1 USD = 80 RUB')
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0].findAll('td').slice(2).map(cell => cell.text())).toEqual(['100,00', '8 000,00'])
    expect(rows[0].get('.original-price').text()).toBe('100,00')
    expect(rows[0].get('.original-price').attributes('aria-label')).toContain('исходная стоимость')
    expect(rows[1].get('.original-price').text()).toBe('0,00')
    expect(rows[3].findAll('td').slice(2).map(cell => cell.text())).toEqual(['11,25', '900,00'])
    expect(rows[3].get('.original-price').text()).toBe('900,00')
    expect(rows[4].find('.original-price').exists()).toBe(false)
    expect(wrapper.text()).toContain('24.09.2026')
    expect(wrapper.text()).toContain('Прогнозная стоимость')
    expect(wrapper.findAll('tfoot tr').slice(1).map(row => row.findAll('td').slice(1).map(cell => cell.text()))).toEqual([
      ['Не рассчитана', '—', '—'], ['Не рассчитана', '—', '—']
    ])
  })
  it('uses the calculation nominal and keeps domestic delivery/customs outside its total', () => {
    const pricing = globalThis.structuredClone(pricingDetails)
    pricing.calculation.exchangeRate.nominal = 100
    pricing.calculation.exchangeRate.officialRate = 8000
    pricing.calculation.inputs.domesticDeliveryRub = 500
    pricing.calculation.inputs.customsRub = 300
    Object.assign(pricing.calculation.components.find(item => item.service === 300), { state:0, amount:500, amountRub:500 })
    pricing.confirmed = true
    pricing.expired = true
    render(pricing)
    expect(wrapper.findAll('tfoot tr:first-child td').map(cell => cell.text())).toEqual(['112,48', '8 998,40'])
    expect(wrapper.findAll('tfoot th').map(cell => cell.text())).toEqual(['Итого', 'Таможенная пошлина', 'Доставка по РФ'])
    expect(wrapper.findAll('tfoot tr').slice(1).map(row => row.findAll('td').slice(1).map(cell => cell.text()))).toEqual([
      ['Рассчитана', '3,75', '300,00'], ['Рассчитана', '6,25', '500,00']
    ])
    expect(wrapper.findAll('tfoot .original-price').map(cell => cell.text())).toEqual(['300,00', '500,00'])
    expect(wrapper.find('dl').exists()).toBe(false)
    expect(wrapper.text()).toContain('Подтверждённая стоимость')
    expect(wrapper.text()).toContain('Срок расчёта истёк')
  })
  it('does not invent a USD amount when the calculation rate is missing', () => {
    const pricing = globalThis.structuredClone(pricingDetails)
    pricing.calculation.exchangeRate = null
    render(pricing)
    expect(wrapper.findAll('tfoot tr:first-child td').map(cell => cell.text())).toEqual(['—', '8 998,40'])
    expect(wrapper.findAll('tbody tr')[3].findAll('td').slice(2).map(cell => cell.text())).toEqual(['—', '900,00'])
    expect(wrapper.text()).toContain('Курс недоступен')
  })
  it('preserves incomplete amounts and states instead of showing a zero total', () => {
    const pricing = globalThis.structuredClone(pricingDetails)
    pricing.calculation.totalRub = null
    pricing.calculation.components[0].state = 100
    pricing.calculation.components[0].amountRub = null
    render(pricing)
    expect(wrapper.findAll('tfoot tr:first-child td').map(cell => cell.text())).toEqual(['—', '—'])
    expect(wrapper.get('tbody').text()).toContain('Не рассчитана')
  })
  it('highlights the tariff currency and preserves Core-converted RUB amounts', () => {
    const pricing = globalThis.structuredClone(pricingDetails)
    const component = pricing.calculation.components[0]
    component.tariff = { currency:840 }
    component.amount = 1.23
    component.amountRub = 98.41
    render(pricing)
    const row = wrapper.get('tbody tr')
    expect(row.findAll('td').slice(2).map(cell => cell.text())).toEqual(['1,23', '98,41'])
    expect(row.get('.original-price').text()).toBe('1,23')
  })
  it('shows loading and unavailable states without an additional retry action', async () => {
    render(null, null)
    expect(wrapper.text()).toContain('Стоимость недоступна')
    await wrapper.setProps({ loading:true })
    expect(wrapper.text()).toContain('Загрузка стоимости')
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
  })
})
