// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import OrderCostSummary from '../src/components/OrderCostSummary.vue'
import InlineEditableField from '../src/components/InlineEditableField.vue'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import { pricingOps, pricingDetails } from './fixtures/orderPricing.js'
import { details, ops } from './fixtures/orderProduct.js'
import { validateOrderDetails } from '../src/orderProduct.js'

it.each([true, false].flatMap(included => [[true, 120, true], [false, 120, false], [true, null, true], [true, 0, true]].map(values => [included, ...values])))(
  'shares the paid check for included=%s paid=%s customs=%s visible=%s', (included, customsPaid, amount, visible) => {
    const pricing = globalThis.structuredClone(pricingDetails)
    Object.assign(pricing.calculation.components.find(item => item.service === 800),
      { state:amount === null ? 100 : 0, amount, amountRub:amount })
    const metadata = globalThis.structuredClone(pricingOps)
    metadata.catalogue.services.find(item => item.value === 800).includedInTotal = included
    const wrapper = mount(OrderCostSummary, { props:{ pricing, ops:metadata, customsPaid },
      global:{ plugins:[createSarafanVuetify()] } })
    const checks = wrapper.findAll('[role="img"][aria-label="Таможенная пошлина оплачена"]')
    expect(checks).toHaveLength(visible ? 1 : 0)
    if (visible) expect(checks[0].element.closest(included ? 'tbody' : 'tfoot')).not.toBeNull()
    wrapper.unmount()
  })
it.each(['customsPaid', 'canMarkCustomsPaid'])('requires boolean staff evidence %s', field => {
  for (const value of [undefined, null, 1, 'true']) {
    expect(() => validateOrderDetails({ ...details, [field]:value }, ops, details.orderNumber)).toThrow()
  }
})

it.each([false, true])('retains editable customs amount and clearing behavior when included=%s', included => {
  const metadata = globalThis.structuredClone(pricingOps)
  metadata.catalogue.services.find(item => item.value === 800).includedInTotal = included
  const wrapper = mount(OrderCostSummary, { props:{ pricing:pricingDetails, ops:metadata, customsPaid:true,
    editable:true, draft:{ selectedServices:[], manualAmounts:{ 800:'120,00' } } },
  global:{ plugins:[createSarafanVuetify()] } })
  const editor = wrapper.findAllComponents(InlineEditableField).find(item => item.props('id') === 'manualAmount800')
  expect(editor).toBeDefined()
  editor.vm.$emit('update:modelValue', '42,1')
  editor.vm.$emit('update:modelValue', '')
  expect(wrapper.emitted('amount-change')).toEqual([[800, '42,10'], [800, '']])
  wrapper.unmount()
})
