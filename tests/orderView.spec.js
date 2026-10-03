// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { mount, flushPromises, DOMWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import OrderView from '../src/views/OrderView.vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import { CORE_PROBLEM_TYPES, createInternalProblem, ProblemError } from '../src/errors/problem.js'
import { details, ops, limit } from './fixtures/orderProduct.js'
import { pricingDetails, pricingOps } from './fixtures/orderPricing.js'

const h = vi.hoisted(() => ({ session:{}, push:vi.fn(), leave:null, update:null, route:null }))
vi.mock('../src/stores/session.js', () => ({ useSession:() => h.session }))
vi.mock('vue-router', () => ({ useRoute:() => h.route, useRouter:() => ({ push:h.push }), onBeforeRouteLeave:fn => { h.leave = fn }, onBeforeRouteUpdate:fn => { h.update = fn } }))
let wrapper
const vm = () => wrapper.vm.$.setupState
const pending = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
async function render() { wrapper = mount(OrderView, { attachTo:document.body, global:{ plugins:[createSarafanVuetify()] } }); await flushPromises() }
const remote = type => new ProblemError({ type, code:type.split('/').at(-1).replaceAll('-', '_'), title:'Конфликт', detail:'Обновите данные заказа.', status:409, instance:'/test' })
beforeEach(() => {
  h.route = reactive({ params:{ orderNumber:'12345678-1' } })
  h.update = null
  h.session.user = ref({ id:1, roles:['operator'] })
  h.session.getOrderOps = vi.fn().mockResolvedValue(ops)
  h.session.orderRequest = vi.fn().mockImplementation(path => Promise.resolve(globalThis.structuredClone(
    path === '/orders/pricing/ops' ? pricingOps : path.endsWith('/pricing') ? { ...pricingDetails, orderNumber:h.route.params.orderNumber } : details
  )))
  h.push.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.restoreAllMocks() })

describe('staff order card', () => {
  it('collapses sections independently, preserves drafts and reopens product validation', async () => {
    await render()
    await wrapper.get('#size').setValue('XL')
    for (const title of ['Товар', 'Услуги и стоимость', 'Покупатель']) {
      const toggle = wrapper.get(`button[aria-label="Свернуть раздел «${title}»"]`)
      expect(toggle.attributes('type')).toBe('button')
      const content = wrapper.get(`[id="${toggle.attributes('aria-controls')}"]`)
      expect(content.isVisible()).toBe(true)
      await toggle.trigger('click')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(content.isVisible()).toBe(false)
    }
    expect(vm().form.size).toBe('XL')
    expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
    const productToggle = wrapper.get('button[aria-label="Развернуть раздел «Товар»"]')
    await productToggle.trigger('click')
    expect(wrapper.get('#size').element.value).toBe('XL')
    await wrapper.get('#quantity').setValue('5')
    await productToggle.trigger('click')
    await vm().save()
    expect(productToggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#quantity').isVisible()).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('#quantity').element)
    expect(wrapper.get('button[aria-label="Развернуть раздел «Покупатель»"]').attributes('aria-expanded')).toBe('false')
  })
  it.each(['/orders/pricing/ops', '/orders/12345678-1/pricing'])('presents pricing failure once and recovers with header refresh: %s', async path => {
    const normal = h.session.orderRequest.getMockImplementation()
    h.session.orderRequest.mockImplementation(value => value === path ? Promise.reject(new Error('private')) : normal(value))
    await render()
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('private')
    expect(wrapper.text()).toContain('Стоимость недоступна')
    expect(vm().details).not.toBeNull()
    await wrapper.get('#size').setValue('XL')
    expect(vm().form.size).toBe('XL')
    h.session.orderRequest.mockImplementation(normal)
    vm().refresh(); vm().acceptConfirmation(); await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('tfoot').text()).toContain('112,48')
  })
  it.each(['/orders/pricing/ops', '/orders/12345678-1/pricing'])('ignores pricing replies after an identity change: %s', async path => {
    const wait = pending()
    const normal = h.session.orderRequest.getMockImplementation()
    h.session.orderRequest.mockImplementation(value => value === path ? wait.promise : normal(value))
    await render()
    h.session.user.value = null
    wait.resolve(path.endsWith('/ops') ? pricingOps : pricingDetails)
    await flushPromises()
    expect(vm().pricing).toBeNull()
    expect(vm().pricingOps).toBeNull()
    expect(vm().details).toBeNull()
  })
  it('shows profile and recognition, edits store and sends only allowed fields with exact timestamp', async () => {
    h.session.orderRequest.mockResolvedValueOnce({ ...details, customer:{ ...details.customer, passportIssueDate:'2010-02-03' } })
    await render()
    expect(wrapper.get('.order-state .order-status-pill').text()).toBe('На проверке')
    expect(wrapper.find('.order-state .order-validity').exists()).toBe(false)
    expect(wrapper.get('.order-dates').text()).toContain('Заказ создан:')
    expect(wrapper.text()).toContain('Иванов')
    expect(wrapper.text()).toContain('03.02.2010')
    expect(wrapper.text()).not.toContain('2010-02-03')
    expect(wrapper.text()).toContain('Не указано')
    expect(wrapper.text()).toContain('Габариты: 1 × 2 × 3 см')
    expect(wrapper.text()).toContain('Материал')
    expect(wrapper.get('img').attributes('referrerpolicy')).toBe('no-referrer')
    expect(wrapper.get('.product-page-link').text()).toBe('Страница товара')
    expect(wrapper.get('.product-page-link').attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.findAll('.product-grid label').map(label => label.text())).toEqual([
      'Название товара', 'Магазин', 'Цена за единицу, $', 'Количество', 'Цвет', 'Размер', 'Комментарий'
    ])
    expect(wrapper.text()).not.toContain('как на сайте')
    expect(wrapper.findAll('.buyer-field')).toHaveLength(Object.keys(details.customer).length)
    expect(wrapper.findAll('.buyer-field').filter(field => field.text().includes('Телефон'))).toHaveLength(1)
    expect(wrapper.text()).toContain(details.customer.phone)
    expect(wrapper.text()).not.toContain('Дата рождения')
    expect(wrapper.text()).not.toContain('Код подразделения')
    expect(wrapper.text()).not.toContain('Телефон получателя')
    expect(wrapper.findAll('.buyer-field .staff-form-value').at(-1).text()).toBe('Не указано')
    expect(wrapper.findAll('.buyer-field .staff-form-value').every(field => field.classes().includes('staff-form-value--readonly'))).toBe(true)
    await wrapper.get('#productName').setValue(' Новое название ')
    await wrapper.get('#storeName').setValue(' Новый магазин ')
    expect(wrapper.text()).not.toContain('Дата курсов при последнем сохранении товара')
    expect(wrapper.findAll('h2').map(item => item.text())).toEqual(['Товар', 'Услуги и стоимость', 'Покупатель'])
    expect(wrapper.get('tfoot').text()).toContain('112,48')
    expect(wrapper.get('.total-line').text()).toContain('Общая цена, $40,00')
    expect(wrapper.findAll('header .header-actions button').map(button => button.attributes('aria-label'))).toEqual([
      'История заказа', 'Обновить данные', 'Сохранить изменения', 'Отменить'
    ])
    expect(wrapper.find('.merchandise-summary').exists()).toBe(false)
    const result = { ...details, product:{ ...details.product, productName:'Новое название', storeName:'Новый магазин' }, updatedAt:'2026-09-15T12:00:00.123456Z' }
    h.session.orderRequest.mockResolvedValueOnce(result)
    await vm().save()
    expect(JSON.parse(h.session.orderRequest.mock.calls.at(-1)[1].body)).toEqual({
      expectedUpdatedAt:details.updatedAt, acceptValueLimitExceeded:false, storeName:'Новый магазин', productName:'Новое название', sellerPrice:{ amount:40, currency:840 }, quantity:1, color:'Красный', size:null, comment:null
    })
    expect(vm().dirty).toBe(false)
    expect(vm().details.updatedAt).toBe(result.updatedAt)
    expect(vm().details.status).toBe(0)
    expect(h.push).toHaveBeenCalledWith('/orders')
  })
  it('shows quantity and value errors once immediately without clamping values', async () => {
    await render()
    await wrapper.get('#quantity').setValue('5')
    expect(wrapper.text().match(/Такое количество товара/g)).toHaveLength(1)
    expect(vm().form.quantity).toBe('5')
    await vm().save()
    expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
    expect(document.activeElement).toBe(wrapper.get('#quantity').element)
    await wrapper.get('#quantity').setValue('4')
    await wrapper.get('#sellerPrice').setValue('281.26')
    const saving = vm().save()
    await flushPromises()
    expect(vm().limitConfirmation).toBe(true)
    expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
    vm().resolveValueLimit(false)
    await saving
    await wrapper.get('#sellerPrice').setValue('abc')
    expect(vm().total).toBe('—')
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
    await wrapper.get('#comment').setValue('x'.repeat(2001))
    expect(wrapper.get('#comment-error').text()).toContain('2000')
  })
  it.each([CORE_PROBLEM_TYPES.orderUpdateConflict, CORE_PROBLEM_TYPES.orderNotEditable])('keeps draft and requires explicit refresh after %s', async type => {
    await render()
    await wrapper.get('#productName').setValue('Черновик')
    h.session.orderRequest.mockRejectedValueOnce(remote(type))
    await vm().save()
    expect(vm().form.productName).toBe('Черновик')
    expect(vm().locked).toBe(true)
    expect(wrapper.text()).toContain('Обновите карточку')
    await vm().save()
    expect(h.session.orderRequest).toHaveBeenCalledTimes(4)
    vm().refresh()
    expect(vm().confirmation).toBe(true)
    wrapper.findComponent(ConfirmDialog).vm.$emit('cancel'); await flushPromises()
    expect(vm().form.productName).toBe('Черновик')
    vm().refresh()
    h.session.orderRequest.mockResolvedValueOnce({ ...details, status:300, canEditProduct:false })
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm'); await flushPromises()
    expect(vm().dirty).toBe(false)
    expect(vm().editable).toBe(false)
    expect(wrapper.text()).not.toContain('только для просмотра')
  })
  it('retains failed form and presents field errors once', async () => {
    await render()
    await wrapper.get('#productName').setValue('Черновик')
    h.session.orderRequest.mockRejectedValueOnce(createInternalProblem('invalidInput', { errors:{ sellerPrice:[limit.exceededMessage] } }))
    await vm().save()
    expect(wrapper.text().match(/Максимальная стоимость заказа/g)).toHaveLength(1)
    await wrapper.get('#sellerPrice').setValue('20')
    expect(vm().problem).toBeNull()
    h.session.orderRequest.mockRejectedValueOnce(new Error('secret'))
    await vm().save()
    expect(wrapper.text()).not.toContain('secret')
    expect(vm().form.productName).toBe('Черновик')
    expect(vm().dirty).toBe(true)
  })
  it('guards route leave, refresh and browser close; allows navigation after clean save', async () => {
    await render()
    expect(h.leave()).toBe(true)
    await vm().back(); expect(h.push).toHaveBeenCalledWith('/orders')
    vm().refresh(); await flushPromises()
    await wrapper.get('#size').setValue('XL')
    const leave = h.leave()
    vm().cancelConfirmation(); expect(await leave).toBe(false)
    const proceed = h.leave()
    vm().acceptConfirmation(); expect(await proceed).toBe(true)
    await wrapper.get('#size').setValue('XXL')
    const event = new globalThis.Event('beforeunload', { cancelable:true })
    globalThis.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    h.push.mockRejectedValueOnce(new Error('raw'))
    await vm().back(); expect(vm().problem).toBeTruthy()
    vm().form = null
    const clean = new globalThis.Event('beforeunload', { cancelable:true }); globalThis.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
    vm().cancelConfirmation(); vm().acceptConfirmation()
  })
  it('rejects malformed DTOs and recovers through header refresh', async () => {
    h.session.orderRequest.mockResolvedValueOnce({})
    await render()
    expect(vm().problem.code).toBe('ui_protocol_error')
    expect(vm().details).toBeNull()
    vm().refresh(); await flushPromises()
    expect(vm().details.orderNumber).toBe(details.orderNumber)
    expect(vm().problem).toBeNull()
  })
  it('keeps read-only data and blocks save when rates are unavailable', async () => {
    h.session.orderRequest.mockResolvedValueOnce({ ...details, sourceUrl:'javascript:secret', imageUrl:'data:secret', product:{ ...details.product, storeName:null }, savedLimitSourceEffectiveDate:null,
      dimensions:null, characteristics:null, limitCheck:{ ...limit, available:false, maximumTotalUsd:null, sourceEffectiveDate:null } })
    await render()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.get('.product-page-link').text()).toBe('Страница товара недоступна')
    expect(wrapper.get('button[aria-label="Сохранить изменения"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.product-grid').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('.total-line .staff-form-value').classes()).toContain('staff-form-value--readonly')
    expect(wrapper.text()).toContain('Исправление товара временно недоступно')
    expect(wrapper.find('.saved-limit').exists()).toBe(false)
    await wrapper.get('#sellerPrice').setValue('11')
    expect(wrapper.get('.product-grid').attributes('disabled')).toBeUndefined()
    await wrapper.get('#sellerPrice').setValue('')
    expect(wrapper.get('.product-grid').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('button[aria-label="Сохранить изменения"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('#sellerPrice').setValue('11')
    await vm().save()
    expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
  })
  it.each(['administrator','shift-manager','senior-operator','operator'])('allows the role %s only with server permission', async role => {
    h.session.user.value.roles = [role]
    await render(); expect(vm().editable).toBe(true)
    vm().details.canEditProduct = false
    expect(vm().editable).toBe(false)
    await flushPromises()
    expect(wrapper.find('button[aria-label="Сохранить изменения"]').exists()).toBe(false)
    expect(wrapper.findAll('header .header-actions button').map(button => button.attributes('aria-label'))).toEqual([...(['administrator', 'shift-manager'].includes(role) ? ['Рассчитать и сохранить стоимость', 'Подтвердить сохранённый расчёт', 'Не можем привезти'] : []), 'История заказа', 'Обновить данные', 'Отменить'])
    if (['administrator', 'shift-manager'].includes(role)) {
      const reject = wrapper.get('button[aria-label="Не можем привезти"]')
      expect(reject.classes()).not.toContain('action-button--labelled')
      expect(reject.text()).toBe('')
      expect(reject.get('.v-icon').classes()).toContain('fa-bridge-circle-xmark')
    }
  })
  it('reloads a changed order number only after the dirty draft is confirmed', async () => {
    await render()
    await wrapper.get('#size').setValue('XL')
    const next = '12345678-2'
    const cancelled = h.update({ params:{ orderNumber:next } }, { params:{ orderNumber:details.orderNumber } })
    await flushPromises()
    expect(wrapper.findComponent(ConfirmDialog).props('open')).toBe(true)
    wrapper.findComponent(ConfirmDialog).vm.$emit('cancel')
    expect(await cancelled).toBe(false)

    const accepted = h.update({ params:{ orderNumber:next } }, { params:{ orderNumber:details.orderNumber } })
    await flushPromises()
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm')
    expect(await accepted).toBe(true)
    h.session.orderRequest.mockResolvedValueOnce({ ...details, orderNumber:next })
    h.route.params.orderNumber = next
    await flushPromises()
    expect(h.session.orderRequest).toHaveBeenLastCalledWith(`/orders/${next}/pricing`)
    expect(wrapper.get('.primary-heading').text()).toBe(`Заказ ${next}`)
  })
  it('denies unknown roles and ignores late load replies and failures after identity changes', async () => {
    const wait = pending()
    h.session.getOrderOps.mockReturnValueOnce(wait.promise)
    await render()
    expect(wrapper.text()).toContain('Загрузка')
    vm().refresh(); await vm().save()
    h.session.user.value = null
    wait.resolve(ops); await flushPromises()
    expect(vm().details).toBeNull()
    expect(h.session.orderRequest).not.toHaveBeenCalled()
    h.session.user.value = { id:2, roles:['unknown'] }
    await vm().load(); expect(vm().editable).toBe(false)
    const reply = pending(); h.session.orderRequest.mockReturnValueOnce(reply.promise)
    const load = vm().load(); await flushPromises()
    h.session.user.value = null; reply.reject(new Error('secret')); await load
    expect(vm().problem).toBeNull(); expect(vm().details).toBeNull()
  })
  it.each([true, false])('ignores stale save result (success=%s)', async success => {
    await render()
    await wrapper.get('#size').setValue('L')
    const wait = pending(); h.session.orderRequest.mockReturnValueOnce(wait.promise)
    const save = vm().save()
    h.session.user.value = null
    if (success) wait.resolve(details); else wait.reject(new Error('private'))
    await save
    expect(vm().form).toBeNull(); expect(vm().problem).toBeNull()
  })
  it('ignores late loaded details after unmount', async () => {
    const wait = pending(); h.session.orderRequest.mockReturnValueOnce(wait.promise)
    await render(); const state = vm(); wrapper.unmount(); wrapper = null
    wait.resolve(details); await flushPromises()
    expect(state.details).toBeNull()
  })
})


describe('pricing on the order card', () => {
  const action = name => wrapper.get(`button[aria-label="${name}"]`)
  const calculate = () => action('Рассчитать и сохранить стоимость')
  async function edit(value = '230.5', service = 300) {
    await wrapper.get(`button#manualAmount${service}`).trigger('click')
    await wrapper.get(`input#manualAmount${service}`).setValue(value)
  }
  beforeEach(() => { h.session.user.value.roles = ['shift-manager'] })
  it('uses the existing inline editor, validates and normalizes manual amounts, and preserves customer choices', async () => {
    await render()
    expect(wrapper.findAll('header .header-actions').map(group => group.findAll('button').map(button => button.attributes('aria-label')))).toEqual([
      ['Рассчитать и сохранить стоимость', 'Подтвердить сохранённый расчёт', 'Не можем привезти'],
      ['История заказа'], ['Обновить данные', 'Сохранить изменения', 'Отменить']
    ])
    expect(wrapper.findAll('button[aria-label="Рассчитать и сохранить стоимость"]')).toHaveLength(1)
    expect(wrapper.findAll('button[aria-label="Подтвердить сохранённый расчёт"]')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Для таможенных платежей 0 означает')
    expect(wrapper.text()).not.toContain('Определите таможенные платежи и сохраните расчёт')
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    await edit('-1')
    expect(calculate().attributes('disabled')).toBeDefined()
    await action('Применить').trigger('click')
    expect(wrapper.text()).toContain('Укажите неотрицательную сумму')
    await wrapper.get('input#manualAmount300').setValue('230.5')
    await action('Применить').trigger('click')
    expect(vm().pricingDraft.manualAmounts[300]).toBe('230,50')
    expect(vm().pricingDirty).toBe(true)
    expect(action('Подтвердить сохранённый расчёт').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.product-grid').attributes('disabled')).toBeDefined()
    await calculate().trigger('click'); await flushPromises()
    const [, request] = h.session.orderRequest.mock.calls.find(([, options]) => options?.method === 'PUT')
    expect(JSON.parse(request.body)).toEqual({ expectedUpdatedAt:pricingDetails.updatedAt, inputs:{ selectedServices:[], manualAmounts:{ 100:0, 300:230.5 } } })
    expect(vm().dirty).toBe(false)
    expect(h.push).not.toHaveBeenCalled()
  })
  it('cancels inline drafts and protects accepted or uncommitted drafts on navigation and refresh', async () => {
    await render(); await edit()
    const leaving = h.leave(); await flushPromises(); vm().cancelConfirmation()
    expect(await leaving).toBe(false)
    await wrapper.get('input#manualAmount300').trigger('keydown', { key:'Escape' })
    expect(vm().dirty).toBe(false)
    await edit(); await action('Применить').trigger('click')
    const event = new globalThis.Event('beforeunload', { cancelable:true }); globalThis.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    vm().refresh(); vm().cancelConfirmation(); expect(vm().pricingDirty).toBe(true)
    vm().refresh(); vm().acceptConfirmation(); await flushPromises()
    expect(vm().dirty).toBe(false)
  })
  it('requires explicit confirmation and reloads order capabilities and version after freezing', async () => {
    await render()
    await action('Подтвердить сохранённый расчёт').trigger('click')
    const dialog = wrapper.findAllComponents(ConfirmDialog).find(item => item.props('title') === 'Подтвердить расчёт?')
    expect(dialog.props('open')).toBe(true)
    dialog.vm.$emit('cancel'); await flushPromises()
    expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
    await action('Подтвердить сохранённый расчёт').trigger('click')
    const frozen = { ...pricingDetails, updatedAt:'2026-09-24T11:00:00Z', confirmed:true, validUntil:'2026-09-25T11:00:00Z', canEdit:false, canConfirm:false }
    h.session.orderRequest.mockResolvedValueOnce(frozen).mockResolvedValueOnce({ ...details, updatedAt:frozen.updatedAt, canEditProduct:false })
    dialog.vm.$emit('confirm'); await flushPromises()
    expect(h.session.orderRequest.mock.calls[3][0]).toBe('/orders/12345678-1/pricing/confirm')
    expect(JSON.parse(h.session.orderRequest.mock.calls[3][1].body)).toEqual({ expectedUpdatedAt:pricingDetails.updatedAt })
    expect(vm().details.updatedAt).toBe(frozen.updatedAt)
    expect(wrapper.get('.order-state .order-validity').text()).toContain('действует до')
    expect(wrapper.get('.order-dates').text()).toContain('обновлён:')
    expect(wrapper.text()).not.toContain('Финансовые значения сохранены')
    expect(wrapper.find('button#manualAmount300').exists()).toBe(false)
    expect(vm().productEditingEnabled).toBe(false)
  })
  it.each([CORE_PROBLEM_TYPES.orderUpdateConflict, CORE_PROBLEM_TYPES.orderNotEditable, null])('retains failed pricing drafts and locks conflicts: %s', async type => {
    await render(); await edit(); await action('Применить').trigger('click')
    h.session.orderRequest.mockRejectedValueOnce(type ? remote(type) : createInternalProblem('protocolError'))
    await calculate().trigger('click'); await flushPromises()
    expect(vm().pricingDraft.manualAmounts[300]).toBe('230,50')
    expect(vm().locked).toBe(!!type)
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
    vm().refresh(); vm().acceptConfirmation(); await flushPromises()
    expect(vm().locked).toBe(false)
  })
  it.each(['operator', 'senior-operator'])('keeps pricing read-only for %s', async role => {
    h.session.user.value.roles = [role]; await render()
    expect(wrapper.find('button#manualAmount300').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Рассчитать и сохранить стоимость"]').exists()).toBe(false)
    await vm().mutatePricing(); expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
  })
  it('blocks pricing writes while the product draft is dirty or an inline amount is uncommitted', async () => {
    await render(); await wrapper.get('#size').setValue('L')
    await vm().mutatePricing(); expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
    expect(calculate().attributes('disabled')).toBeDefined()
    vm().refresh(); vm().acceptConfirmation(); await flushPromises()
    await edit(); await vm().mutatePricing(); await vm().saveAction()
    expect(h.session.orderRequest).toHaveBeenCalledTimes(6)
    expect(action('Сохранить изменения').attributes('disabled')).toBeDefined()
  })
  it.each([true, false])('ignores a stale pricing mutation after identity changes (success=%s)', async success => {
    await render()
    const wait = pending(); h.session.orderRequest.mockReturnValueOnce(wait.promise)
    const saving = vm().mutatePricing()
    h.session.user.value = null
    if (success) wait.resolve(pricingDetails); else wait.reject(new Error('private'))
    await saving
    expect(vm().pricing).toBeNull(); expect(vm().problem).toBeNull()
  })
})


describe('pricing recovery and field errors', () => {
  beforeEach(() => { h.session.user.value.roles = ['administrator'] })
  it('edits USD manual amounts and clears them with the shared inline editor', async () => {
    await render()
    for (const value of ['12.25', '']) {
      await wrapper.get('button#manualAmount100').trigger('click')
      await wrapper.get('input#manualAmount100').setValue(value)
      await wrapper.get('input#manualAmount100').trigger('keydown', { key:'Enter' })
      expect(vm().pricingDraft.manualAmounts[100]).toBe(value ? '12,25' : '')
    }
    await vm().calculatePrice()
    const payload = JSON.parse(h.session.orderRequest.mock.calls.find(([, options]) => options?.method === 'PUT')[1].body)
    expect(payload.inputs.manualAmounts).toEqual({})
  })
  it('focuses repeated customs confirmation errors without discarding pricing or locking edits', async () => {
    await render()
    const saved = vm().pricing
    for (let attempt = 0; attempt < 2; attempt++) {
      h.session.orderRequest.mockRejectedValueOnce(new ProblemError({
        type:'https://sarafan.sw.consulting/problems/order-customs-unresolved', code:'order_customs_unresolved',
        status:409, title:'Таможенные платежи не определены', detail:'Определите таможенные платежи.', instance:'/test',
        errors:{ manualAmounts:['Укажите таможенные платежи; 0 означает, что платежи не ожидаются.'] }
      }))
      wrapper.get('button[aria-label="Подтвердить сохранённый расчёт"]').element.focus()
      await vm().confirmPrice()
      expect(wrapper.get('#manual-amounts-error').text()).toContain('0 означает')
      expect(document.activeElement).toBe(wrapper.get('button#manualAmount100').element)
      expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
      expect(vm().pricing).toBe(saved)
      expect(vm().locked).toBe(false)
    }
  })
  it('shows server amount errors beside the price controls and focuses the existing inline editor', async () => {
    await render()
    h.session.orderRequest.mockRejectedValueOnce(createInternalProblem('invalidInput', { errors:{ manualAmounts:['Тариф изменился.'] } }))
    await vm().calculatePrice()
    expect(wrapper.get('#manual-amounts-error').text()).toBe('Тариф изменился.')
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
    expect(document.activeElement).toBe(wrapper.get('button#manualAmount100').element)
  })
  it('locks stale product data after a successful pricing write whose order reload fails, then recovers', async () => {
    await render()
    h.session.orderRequest.mockResolvedValueOnce(pricingDetails).mockRejectedValueOnce(createInternalProblem('protocolError'))
    await vm().calculatePrice()
    expect(vm().pricing).not.toBeNull()
    expect(vm().details).not.toBeNull()
    expect(vm().locked).toBe(true)
    await vm().mutatePricing(); expect(h.session.orderRequest).toHaveBeenCalledTimes(5)
    vm().refresh(); await flushPromises()
    expect(vm().locked).toBe(false)
    expect(vm().problem).toBeNull()
  })
  it('ignores an order reload after pricing saved when the identity changes', async () => {
    await render()
    const wait = pending()
    h.session.orderRequest.mockResolvedValueOnce(pricingDetails).mockReturnValueOnce(wait.promise)
    const saving = vm().calculatePrice(); await flushPromises()
    h.session.user.value = null; wait.resolve(details); await saving
    expect(vm().details).toBeNull()
  })
  it('blocks confirmation for unsaved manual amounts and enforces Core management capabilities', async () => {
    await render(); vm().pricingDraft.manualAmounts[300] = '4'
    await vm().mutatePricing(true); expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
    vm().pricingOps.canManage = false; await flushPromises()
    expect(wrapper.find('button#manualAmount300').exists()).toBe(false)
  })
})


describe('save before order navigation', () => {
  it('saves a product and resolves the pending departure without redirecting to the list', async () => {
    await render(); await wrapper.get('#size').setValue('XL')
    const leaving = h.leave({ path:'/orders/12345678-1/history' })
    await flushPromises()
    expect(wrapper.findComponent(ConfirmDialog).props('secondaryAction')).toBe('Не сохранять и продолжить')
    await vm().saveAndContinue()
    expect(await leaving).toBe(true)
    expect(h.push).not.toHaveBeenCalled()
    expect(JSON.parse(h.session.orderRequest.mock.calls[3][1].body).size).toBe('XL')
    expect(vm().dirty).toBe(false)
  })
  it('saves an unfinished inline amount and continues without confirming the quote', async () => {
    h.session.user.value.roles = ['administrator']; await render()
    await wrapper.get('button#manualAmount300').trigger('click')
    await wrapper.get('input#manualAmount300').setValue('240,5')
    const leaving = h.leave({ path:'/orders/12345678-1/history' }); await vm().saveAndContinue()
    expect(await leaving).toBe(true)
    expect(JSON.parse(h.session.orderRequest.mock.calls[3][1].body).inputs.manualAmounts[300]).toBe(240.5)
    expect(h.session.orderRequest.mock.calls.some(([path]) => path.endsWith('/confirm'))).toBe(false)
  })
  it('discards both an accepted amount and an unfinished inline draft', async () => {
    h.session.user.value.roles = ['administrator']; await render()
    vm().pricingDraft.manualAmounts[300] = '2'
    await wrapper.get('button#manualAmount300').trigger('click')
    await wrapper.get('input#manualAmount300').setValue('400')
    const leaving = h.leave({ path:'/orders/12345678-1/history' }); vm().acceptConfirmation()
    expect(await leaving).toBe(true)
    expect(vm().pricingDirty).toBe(false); expect(vm().pricingEditing).toBe(false)
    expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
  })
  it('retains an invalid inline draft, focuses it and cancels departure', async () => {
    h.session.user.value.roles = ['administrator']; await render()
    await wrapper.get('button#manualAmount300').trigger('click')
    await wrapper.get('input#manualAmount300').setValue('-2')
    const leaving = h.leave({ path:'/orders/12345678-1/history' }); await vm().saveAndContinue()
    expect(await leaving).toBe(false)
    expect(wrapper.get('input#manualAmount300').element.value).toBe('-2')
    expect(document.activeElement).toBe(wrapper.get('input#manualAmount300').element)
  })
  it.each([true, false])('blocks departure after product save failure (validation=%s)', async validation => {
    await render(); await wrapper.get('#size').setValue('XL')
    if (validation) await wrapper.get('#quantity').setValue('99')
    else h.session.orderRequest.mockRejectedValueOnce(createInternalProblem('protocolError'))
    const leaving = h.leave({ path:'/orders/12345678-1/history' }); await vm().saveAndContinue()
    expect(await leaving).toBe(false); expect(vm().form.size).toBe('XL')
    expect(h.push).not.toHaveBeenCalled()
  })
  it('saves before history navigation and ignores repeated requests while saving', async () => {
    await render(); await wrapper.get('#size').setValue('XL')
    const wait = pending(); h.session.orderRequest.mockReturnValueOnce(wait.promise)
    const leaving = h.leave({ path:'/orders/12345678-1/history' }); const saving = vm().saveAndContinue(); await flushPromises()
    await vm().saveAndContinue(); vm().acceptConfirmation(); vm().refresh()
    expect(h.session.orderRequest).toHaveBeenCalledTimes(4)
    wait.resolve(details); await saving; await flushPromises()
    expect(await leaving).toBe(true)
    expect(h.session.orderRequest).toHaveBeenCalledTimes(4)
    expect(vm().dirty).toBe(false)
  })
  it('cancels a pending continuation on identity reset and handles history navigation errors', async () => {
    await render(); await vm().openHistory()
    expect(h.push).toHaveBeenCalledWith('/orders/12345678-1/history')
    h.push.mockRejectedValueOnce(new Error('private')); await vm().openHistory(); expect(vm().problem).not.toBeNull()
    await wrapper.get('#size').setValue('XL')
    const wait = pending(); h.session.orderRequest.mockReturnValueOnce(wait.promise)
    const leaving = h.leave({ path:'/orders/12345678-1/history' }), saving = vm().saveAndContinue(); await flushPromises()
    h.session.user.value = null; wait.resolve(details); await saving
    expect(await leaving).toBe(false); expect(vm().details).toBeNull()
  })
})


it('offers real save and discard continuation buttons with cancel preserving the draft', async () => {
  await render(); await wrapper.get('#size').setValue('XL')
  const leaving = h.leave({ path:'/orders/12345678-1/history' }); await flushPromises()
  document.querySelector('button[aria-label="Не сохранять и продолжить"]').click(); await flushPromises()
  expect(await leaving).toBe(true); expect(vm().dirty).toBe(false)
  await wrapper.get('#size').setValue('L')
  const saveLeaving = h.leave({ path:'/orders/12345678-1/history' }); await flushPromises()
  document.querySelector('button[aria-label="Сохранить и продолжить"]').click(); await flushPromises()
  expect(await saveLeaving).toBe(true)
})


describe('order confirmation action selection', () => {
  it.each(['refresh', 'cancel', 'navigation', 'other history'])('offers only discard for dirty %s', async action => {
    await render(); await wrapper.get('#size').setValue('XL')
    h.push.mockImplementation(async path => h.leave({ path }))
    let result
    const start = () => {
      if (action === 'refresh') return vm().refresh()
      if (action === 'cancel') return vm().back()
      return h.leave({ path:action === 'other history' ? '/orders/12345678-2/history' : '/users' })
    }
    result = start(); await flushPromises()
    const dialog = wrapper.findComponent(ConfirmDialog)
    expect(dialog.props()).toMatchObject({ open:true, secondaryAction:'', action:'Не сохранять и продолжить' })
    expect(document.querySelector('button[aria-label="Сохранить и продолжить"]')).toBeNull()
    await vm().saveAndContinue()
    expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
    dialog.vm.$emit('cancel'); await result; await flushPromises()
    expect(vm().form.size).toBe('XL')
    result = start(); await flushPromises()
    dialog.vm.$emit('confirm'); await result; await flushPromises()
    expect(vm().dirty).toBe(false)
    expect(h.session.orderRequest.mock.calls.every(([, options]) => !options?.method)).toBe(true)
  })
  it('uses three choices for the history button and cancels without saving', async () => {
    await render(); await wrapper.get('#size').setValue('XL')
    h.push.mockImplementation(async path => h.leave({ path }))
    const opening = vm().openHistory(); await flushPromises()
    const dialog = wrapper.findComponent(ConfirmDialog)
    expect(dialog.props('secondaryAction')).toBe('Не сохранять и продолжить')
    expect(document.querySelectorAll('[role=alertdialog] button')).toHaveLength(3)
    dialog.vm.$emit('cancel'); await opening
    expect(vm().form.size).toBe('XL')
    expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
  })
  it('saves directly and leaves without a second confirmation', async () => {
    await render(); await wrapper.get('#size').setValue('XL')
    h.push.mockImplementation(async path => h.leave({ path }))
    await vm().save(); await flushPromises()
    expect(vm().confirmation).toBe(false)
    expect(h.push).toHaveBeenCalledWith('/orders')
    expect(h.session.orderRequest).toHaveBeenCalledTimes(4)
  })
  it('cancels a pending history continuation on unmount', async () => {
    await render(); await wrapper.get('#size').setValue('XL')
    const leaving = h.leave({ path:'/orders/12345678-1/history' })
    wrapper.unmount(); wrapper = null
    expect(await leaving).toBe(false)
  })
})


describe('review reconciliation actions', () => {
  it('requires acknowledgement before saving an over-limit draft', async () => {
    await render()
    await wrapper.get('#sellerPrice').setValue('1200')
    const saving = vm().save()
    await flushPromises()
    expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
    expect(vm().limitConfirmation).toBe(true)
    const accepted = { ...details, product:{ ...details.product, sellerPrice:{ amount:1200, currency:840 } }, updatedAt:'2026-09-15T12:00:00Z' }
    h.session.orderRequest.mockResolvedValueOnce(accepted)
    wrapper.getComponent(ConfirmDialog).vm.$emit('confirm')
    await saving
    expect(JSON.parse(h.session.orderRequest.mock.calls.at(-1)[1].body).acceptValueLimitExceeded).toBe(true)
    expect(vm().dirty).toBe(false)
    expect(h.push).toHaveBeenCalledWith('/orders')
  })
  it('cancels review actions without saving or losing the product draft', async () => {
    h.session.user.value = { id:1, roles:['shift-manager'] }
    await render()
    await wrapper.get('button[aria-label="Не можем привезти"]').trigger('click')
    await flushPromises()
    await new DOMWrapper(document.querySelector('button[aria-label="Отмена"]')).trigger('click')
    expect(vm().rejectionOpen).toBe(false)
    await wrapper.get('button[aria-label="Не можем привезти"]').trigger('click')
    await flushPromises()
    wrapper.getComponent({ name:'VDialog' }).vm.$emit('update:modelValue', false)
    expect(vm().rejectionOpen).toBe(false)
    await wrapper.get('#sellerPrice').setValue('1200')
    const saving = vm().save()
    await flushPromises()
    wrapper.getComponent(ConfirmDialog).vm.$emit('cancel')
    await saving
    expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
    expect(vm().dirty).toBe(true)
    expect(vm().form.sellerPrice).toBe('1200')
    expect(h.push).not.toHaveBeenCalled()
  })
  it('discards acknowledgement when the staff identity changes' , async () => {
    await render()
    await wrapper.get('#sellerPrice').setValue('1200')
    const saving = vm().save(); await flushPromises()
    h.session.user.value = { id:2, roles:['operator'] }
    await saving
    expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
    expect(vm().limitConfirmation).toBe(false)
  })
  it('finishes review with a versioned free-text reason and displays it safely', async () => {
    h.session.user.value = { id:1, roles:['shift-manager'] }
    await render()
    await wrapper.get('button[aria-label="Не можем привезти"]').trigger('click')
    await flushPromises()
    await new DOMWrapper(document.querySelector('input[name="reason"]')).setValue(' <script>text</script> ')
    const rejected = { ...details, status:600, canEditProduct:false, updatedAt:'2026-09-15T12:00:00Z', reviewCompletedAt:'2026-09-15T12:00:00Z', reviewReason:'<script>text</script>' }
    h.session.orderRequest.mockResolvedValueOnce(rejected)
      .mockResolvedValueOnce(rejected).mockResolvedValueOnce(pricingOps).mockResolvedValueOnce({ ...pricingDetails, canEdit:false, canConfirm:false })
    await vm().submitRejection(); await flushPromises()
    expect(h.session.orderRequest.mock.calls[3][0]).toBe('/orders/12345678-1/review/reject')
    expect(JSON.parse(h.session.orderRequest.mock.calls[3][1].body)).toEqual({ expectedUpdatedAt:details.updatedAt, reason:'<script>text</script>' })
    expect(vm().details.status).toBe(600)
    expect(wrapper.text()).toContain('<script>text</script>')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Не можем привезти"]').exists()).toBe(false)
  })
  it('preserves a failed rejection reason and focuses a local length error', async () => {
    h.session.user.value = { id:1, roles:['shift-manager'] }
    await render()
    vm().rejectionOpen = true; vm().rejectionReason = 'я'.repeat(2001)
    await flushPromises(); await vm().submitRejection()
    expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
    expect(vm().problem.errors.reason[0]).toContain('2000')
    expect(vm().rejectionReason).toHaveLength(2001)
    vm().rejectionReason = 'Причина'
    h.session.orderRequest.mockRejectedValueOnce(remote(CORE_PROBLEM_TYPES.orderUpdateConflict))
    await vm().submitRejection()
    expect(vm().locked).toBe(true)
    expect(vm().rejectionOpen).toBe(true)
    expect(vm().rejectionReason).toBe('Причина')
    await flushPromises()
    const dialog = new DOMWrapper(document.querySelector('.confirm-card'))
    expect(dialog.get('[role="alert"]').text()).toContain('Обновите данные заказа.')
    expect(dialog.get('button[aria-label="Завершить проверку"]').element.disabled).toBe(true)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await dialog.get('button[aria-label="Обновить заказ"]').trigger('click'); await flushPromises()
    expect(vm().locked).toBe(false)
    expect(vm().rejectionOpen).toBe(false)
  })
  it('presents transport failures inside the rejection dialog and keeps its reason available for retry', async () => {
    h.session.user.value = { id:1, roles:['shift-manager'] }
    await render()
    await wrapper.get('button[aria-label="Не можем привезти"]').trigger('click'); await flushPromises()
    const dialog = new DOMWrapper(document.querySelector('.confirm-card'))
    await dialog.get('input[name="reason"]').setValue('Причина')
    h.session.orderRequest.mockRejectedValueOnce(createInternalProblem('networkUnavailable'))
    await dialog.get('button[aria-label="Завершить проверку"]').trigger('click'); await flushPromises()
    expect(dialog.get('[role="alert"]').text()).not.toBe('')
    expect(dialog.get('input[name="reason"]').element.value).toBe('Причина')
    expect(dialog.get('button[aria-label="Завершить проверку"]').element.disabled).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
