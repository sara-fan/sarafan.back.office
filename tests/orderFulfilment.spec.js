// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { recordOrderStage } from '../src/orderFulfilment.js'
import { validateOrderDetails } from '../src/orderProduct.js'
import OrderCostSummary from '../src/components/OrderCostSummary.vue'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import { details, ops } from './fixtures/orderProduct.js'
import { pricingDetails, pricingOps } from './fixtures/orderPricing.js'

const catalogue = { ...ops, statuses:[...ops.statuses, { value:350, name:'Доставляется', routeAlias:'delivering' }, { value:400, name:'Получен', routeAlias:'received' }] }
it.each([350, 400])('sends the exact version and validates recorded stage %s', async target => {
  const before = { ...details, status:target === 350 ? 300 : 350, mainPaymentPaid:true, canEditProduct:false, nextStage:target }
  const after = { ...before, status:target, nextStage:target === 350 ? 400 : null }
  const session = { orderRequest:vi.fn().mockResolvedValue(after) }
  expect(await recordOrderStage(session, before.orderNumber, before, catalogue)).toEqual(after)
  expect(session.orderRequest.mock.calls[0][0]).toBe('/orders/12345678-1/fulfilment')
  expect(JSON.parse(session.orderRequest.mock.calls[0][1].body)).toEqual({ expectedUpdatedAt:before.updatedAt, status:target })
})
it.each([{ status:300 }, { mainPaymentPaid:false }, { nextStage:undefined }, { nextStage:350 }, { nextStage:null }, { nextStage:999 }])('rejects contradictory stage completion %j', async patch => {
  const before = { ...details, status:300, mainPaymentPaid:true, nextStage:350 }
  const session = { orderRequest:vi.fn().mockResolvedValue({ ...before, status:350, nextStage:400, ...patch }) }
  await expect(recordOrderStage(session, before.orderNumber, before, catalogue)).rejects.toMatchObject({ code:'ui_protocol_error' })
})
it.each([
  { status:0, mainPaymentPaid:true, nextStage:350 },
  { status:300, mainPaymentPaid:true, nextStage:400 },
  { status:350, mainPaymentPaid:true, nextStage:350 },
  { status:400, mainPaymentPaid:true, nextStage:350 }
])('suppresses impossible action capabilities %j', patch => {
  expect(validateOrderDetails({ ...details, ...patch }, catalogue, details.orderNumber).nextStage).toBeNull()
})
it('rejects an invalid source before sending and a contradictory terminal successor', async () => {
  const before = { ...details, status:350, mainPaymentPaid:true, nextStage:400 }
  const session = { orderRequest:vi.fn().mockResolvedValue({ ...before, status:400, nextStage:350 }) }
  await expect(recordOrderStage(session, before.orderNumber, { ...before, status:0 }, catalogue)).rejects.toMatchObject({ code:'ui_protocol_error' })
  expect(session.orderRequest).not.toHaveBeenCalled()
  await expect(recordOrderStage(session, before.orderNumber, before, catalogue)).rejects.toMatchObject({ code:'ui_protocol_error' })
})
it.each([[300, 350, 400], [350, 400, null]])('retains Core stage capability without historical payment evidence for %s', async (status, target, nextStage) => {
  const before = { ...details, status, canEditProduct:false, mainPaymentPaid:false, nextStage:target }
  const after = { ...before, status:target, nextStage }
  expect(validateOrderDetails(before, catalogue, before.orderNumber).nextStage).toBe(target)
  const session = { orderRequest:vi.fn().mockResolvedValue(after) }
  expect(await recordOrderStage(session, before.orderNumber, before, catalogue)).toEqual(after)
})
it('normalizes unfamiliar stage capabilities without making unknown orders editable', () => {
  expect(validateOrderDetails({ ...details, status:999, nextStage:350 }, catalogue, details.orderNumber).nextStage).toBeNull()
  expect(validateOrderDetails({ ...details, nextStage:999 }, catalogue, details.orderNumber).nextStage).toBeNull()
})
it.each([undefined, null, 1, 'true'])('requires explicit main payment evidence %s', mainPaymentPaid => {
  expect(() => validateOrderDetails({ ...details, mainPaymentPaid }, catalogue, details.orderNumber)).toThrow()
})
it.each([null, 0, 100])('reuses green indicators for main payment and known delivery %s', amount => {
  const pricing = globalThis.structuredClone(pricingDetails)
  const delivery = pricingOps.catalogue.services.find(item => item.routeAlias === 'domestic-delivery').value
  pricing.calculation.components.find(item => item.service === delivery).amountRub = amount
  const wrapper = mount(OrderCostSummary, { props:{ pricing, ops:pricingOps, mainPaymentPaid:true }, global:{ plugins:[createSarafanVuetify()] } })
  expect(wrapper.find('[aria-label="Основной платёж подтверждён"]').exists()).toBe(true)
  expect(wrapper.find('[aria-label="Доставка по России оплачена"]').exists()).toBe(amount !== null)
  wrapper.unmount()
})
