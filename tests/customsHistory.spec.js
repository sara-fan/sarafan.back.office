// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { validateHistoryDetail, validateHistoryOps, historyItemIsValid, normalizeHistoryFilters, historyDefaults } from '../src/orderHistory.js'
import OrderHistoryDetails from '../src/components/OrderHistoryDetails.vue'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import { ops as orderOps } from './fixtures/orderProduct.js'
import { pricingOps } from './fixtures/orderPricing.js'

const catalog = values => values.map(value => ({ value, name:'Данные', routeAlias:'data-' + value }))
const ops = { kinds:catalog([0, 100, 200, 300, 400, 500, 600, 700, 800, 900]), areas:catalog([1, 2, 4, 8, 16, 32]), actorTypes:catalog([0, 100, 200]) }
const row = { eventKey:'0-1', at:'2026-10-09T10:00:00Z', kind:900, areas:32, actorType:100, actorName:'Оператор' }
const detail = { event:row, version:5, missingCreationDetails:false, productBefore:null, productAfter:null,
  statusBefore:100, statusAfter:100, sourceUrl:null, pricingBefore:null, pricingAfter:null,
  validUntilBefore:null, validUntilAfter:null, customsPaidBefore:false, customsPaidAfter:true }
it('reads and renders independent duty payment history with unchanged status', () => {
  expect(validateHistoryOps(ops)).toBe(ops)
  expect(historyItemIsValid(row, ops)).toBe(true)
  expect(normalizeHistoryFilters({ ...historyDefaults.filters, area:32 }).area).toBe(32)
  expect(validateHistoryDetail(detail, row, ops, orderOps, pricingOps)).toBe(detail)
  const wrapper = mount(OrderHistoryDetails, { props:{ detail, orderOps, pricingOps }, global:{ plugins:[createSarafanVuetify()] } })
  expect(wrapper.text()).toContain('Таможенная пошлина оплачена')
  expect(wrapper.text()).toContain('Нет')
  expect(wrapper.text()).toContain('Да')
  wrapper.unmount()
})
it.each([{ version:4 }, { customsPaidBefore:null }, { customsPaidAfter:false }, { statusAfter:300 },
  { event:{ ...row, kind:800 } }, { event:{ ...row, areas:1 } }, { event:{ ...row, areas:33 } }, { customsPaidBefore:true }])('rejects malformed payment evidence %j', patch => {
    const changed = { ...detail, ...patch }
    expect(() => validateHistoryDetail(changed, changed.event, ops, orderOps, pricingOps)).toThrow()
  })
it('rejects payment evidence on legacy events', () => {
  const changed = { ...detail, version:1, event:{ ...row, kind:100 }, statusBefore:null, statusAfter:null }
  expect(() => validateHistoryDetail(changed, changed.event, ops, orderOps, pricingOps)).toThrow()
})
