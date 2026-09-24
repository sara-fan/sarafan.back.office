// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import OrderPricingView from '../src/views/OrderPricingView.vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import { createInternalProblem, ProblemError, PROBLEM_TYPE_ROOT } from '../src/errors/problem.js'
import { pricingDetails, pricingOps } from './fixtures/orderPricing.js'
const h = vi.hoisted(() => ({ session:{}, route:null, push:vi.fn(), leave:null, update:null }))
vi.mock('../src/stores/session.js', () => ({ useSession:() => h.session }))
vi.mock('vue-router', () => ({ useRoute:() => h.route, useRouter:() => ({ push:h.push }), onBeforeRouteLeave:fn => { h.leave = fn }, onBeforeRouteUpdate:fn => { h.update = fn } }))
let wrapper
const vm = () => wrapper.vm.$.setupState
async function render() { wrapper = mount(OrderPricingView, { attachTo:document.body, global:{ plugins:[createSarafanVuetify()] } }); await flushPromises() }
beforeEach(() => {
  h.route = reactive({ params:{ orderNumber:pricingDetails.orderNumber }, fullPath:'/orders/12345678-1/pricing' })
  h.session.user = ref({ id:1, roles:['shift-manager'] })
  h.session.orderRequest = vi.fn().mockImplementation(path => Promise.resolve(globalThis.structuredClone(path.endsWith('/ops') ? pricingOps : pricingDetails)))
  h.push.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.restoreAllMocks() })
describe('staff pricing screen', () => {
  it('shows components, validates and saves comma values without a manual total', async () => {
    await render()
    expect(wrapper.text()).toContain('Прогнозная стоимость')
    expect(wrapper.text()).toContain('ЦБ РФ: 1$ = 80₽')
    expect(wrapper.text()).toContain('100,00$')
    expect(wrapper.text()).toContain('8 998,40₽')
    expect(wrapper.find('[name="totalRub"]').exists()).toBe(false)
    await wrapper.get('#customsRub').setValue('12,35')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(JSON.parse(h.session.orderRequest.mock.calls.at(-1)[1].body).inputs.customsRub).toBe(12.35)
    expect(vm().dirty).toBe(false)
    await wrapper.get('#customsRub').setValue('-1')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(wrapper.text()).toContain('неотрицательную')
  })
  it('uses changed Core currency symbols for quote amounts and inputs', async () => {
    const metadata = globalThis.structuredClone(pricingOps)
    metadata.catalogue.currencies[0].symbol = '¤'
    metadata.catalogue.currencies[1].symbol = '＄'
    h.session.orderRequest.mockImplementation(path => Promise.resolve(globalThis.structuredClone(path.endsWith('/ops') ? metadata : pricingDetails)))
    await render()
    expect(wrapper.text()).toContain('100,00＄')
    expect(wrapper.text()).toContain('8 998,40¤')
    expect(wrapper.text()).toContain('ЦБ РФ: 1＄ = 80¤')
    expect(wrapper.get('[for="domesticDeliveryRub"]').text()).toContain('¤')
  })
  it('uses the Core symbol when the official rate is unavailable', async () => {
    const metadata = globalThis.structuredClone(pricingOps)
    metadata.catalogue.currencies[1].symbol = '＄'
    const details = globalThis.structuredClone(pricingDetails)
    details.calculation.exchangeRate = null
    details.history[0].calculation.exchangeRate = null
    h.session.orderRequest.mockImplementation(path => Promise.resolve(globalThis.structuredClone(path.endsWith('/ops') ? metadata : details)))
    await render()
    expect(wrapper.text()).toContain('＄ — не удалось получить курс')
    expect(wrapper.text()).not.toContain('USD — не удалось получить курс')
  })
  it.each(['operator', 'senior-operator'])('keeps %s read-only', async role => {
    h.session.user.value.roles = [role]; await render()
    expect(vm().editable).toBe(false)
    expect(wrapper.find('[aria-label="Сохранить изменения"]').exists()).toBe(false)
    await vm().save(); expect(h.session.orderRequest).toHaveBeenCalledTimes(2)
  })
  it('requires confirmation and locks a confirmed snapshot', async () => {
    await render()
    await wrapper.get('[aria-label="Подтвердить сохранённый расчёт"]').trigger('click')
    expect(wrapper.findAllComponents(ConfirmDialog)[1].props('open')).toBe(true)
    const value = globalThis.structuredClone(pricingDetails)
    Object.assign(value, { confirmed:true, canEdit:false, canConfirm:false, expired:true, validUntil:'2026-09-25T10:00:00Z' })
    h.session.orderRequest.mockResolvedValueOnce(value)
    wrapper.findAllComponents(ConfirmDialog)[1].vm.$emit('confirm'); await flushPromises()
    expect(h.session.orderRequest.mock.calls.at(-1)[0]).toContain('/pricing/confirm')
    expect(wrapper.text()).toContain('Срок расчёта истёк')
    expect(vm().editable).toBe(false)
  })
  it('retains a failed draft and locks conflicts until refresh', async () => {
    await render(); await wrapper.get('#domesticDeliveryRub').setValue('123')
    h.session.orderRequest.mockRejectedValueOnce(new ProblemError({ type:`${PROBLEM_TYPE_ROOT}order-update-conflict`, detail:'Обновите расчёт.' }))
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(wrapper.get('#domesticDeliveryRub').element.value).toBe('123')
    expect(vm().locked).toBe(true)
    const refresh = vm().refresh(); await flushPromises()
    expect(wrapper.findAllComponents(ConfirmDialog)[0].props('open')).toBe(true)
    wrapper.findAllComponents(ConfirmDialog)[0].vm.$emit('cancel'); await refresh
    expect(vm().dirty).toBe(true)
    const retry = vm().refresh(); await flushPromises()
    wrapper.findAllComponents(ConfirmDialog)[0].vm.$emit('confirm'); await retry
    expect(vm().locked).toBe(false)
  })
  it('discards stale responses after identity change and supports recovery', async () => {
    let resolve
    h.session.orderRequest.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    await render(); h.session.user.value = { id:2, roles:['operator'] }
    resolve(pricingOps); await flushPromises()
    expect(vm().details).toBeNull()
    h.session.orderRequest.mockRejectedValueOnce(createInternalProblem('protocolError'))
    await vm().refresh(); expect(vm().problem).not.toBeNull()
    await vm().refresh(); expect(vm().details).not.toBeNull()
  })
  it('protects dirty navigation and closure and handles back failures', async () => {
    await render(); await wrapper.get('#customsRub').setValue('5')
    const event = new globalThis.Event('beforeunload', { cancelable:true }); globalThis.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    const leaving = h.leave(); await flushPromises(); vm().finish(false); expect(await leaving).toBe(false)
    h.push.mockRejectedValueOnce(createInternalProblem('protocolError')); await vm().back()
    expect(vm().problem).not.toBeNull()
    h.route.params.orderNumber = '12345678-2'; await flushPromises()
    expect(h.session.orderRequest.mock.calls.at(-1)[0]).toBe('/orders/12345678-2/pricing')
  })
})
