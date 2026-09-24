// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import OrderView from '../src/views/OrderView.vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import { CORE_PROBLEM_TYPES, createInternalProblem, ProblemError } from '../src/errors/problem.js'
import { details, ops, limit } from './fixtures/orderProduct.js'

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
  h.session.orderRequest = vi.fn().mockResolvedValue(globalThis.structuredClone(details))
  h.push.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.restoreAllMocks() })

describe('staff order card', () => {
  it('shows profile and recognition, edits store and sends only allowed fields with exact timestamp', async () => {
    await render()
    expect(wrapper.text()).toContain('Иванов')
    expect(wrapper.text()).toContain('Не указано')
    expect(wrapper.text()).toContain('Габариты: 1 × 2 × 3 см')
    expect(wrapper.text()).toContain('Материал')
    expect(wrapper.get('img').attributes('referrerpolicy')).toBe('no-referrer')
    expect(wrapper.get('.product-page-link').text()).toBe('Страница товара')
    expect(wrapper.get('.product-page-link').attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.findAll('.product-grid label').map(label => label.text())).toEqual([
      'Название товара', 'Магазин', 'Цена за единицу, USD', 'Количество', 'Цвет', 'Размер', 'Комментарий'
    ])
    expect(wrapper.text()).not.toContain('как на сайте')
    expect(wrapper.findAll('.buyer-field')).toHaveLength(Object.keys(details.customer).length)
    expect(wrapper.findAll('.buyer-field .staff-form-value').at(-1).text()).toBe('Не указано')
    expect(wrapper.findAll('.buyer-field .staff-form-value').every(field => field.classes().includes('staff-form-value--readonly'))).toBe(true)
    await wrapper.get('#productName').setValue(' Новое название ')
    await wrapper.get('#storeName').setValue(' Новый магазин ')
    expect(wrapper.get('.saved-limit').text()).toContain('14.09.2026')
    expect(wrapper.get('.saved-limit').text()).not.toContain('15.09.2026')
    expect(wrapper.get('.total-line').text()).toContain('Стоимость, USD40,00')
    expect(wrapper.findAll('.header-actions button').map(button => button.attributes('aria-label'))).toEqual([
      'Расчёт стоимости', 'Обновить данные', 'Сохранить изменения', 'Отменить'
    ])
    expect(wrapper.find('.merchandise-summary').exists()).toBe(false)
    const result = { ...details, product:{ ...details.product, productName:'Новое название', storeName:'Новый магазин' }, updatedAt:'2026-09-15T12:00:00.123456Z' }
    h.session.orderRequest.mockResolvedValueOnce(result)
    await vm().save()
    expect(JSON.parse(h.session.orderRequest.mock.calls.at(-1)[1].body)).toEqual({
      expectedUpdatedAt:details.updatedAt, storeName:'Новый магазин', productName:'Новое название', sellerPrice:{ amount:40, currency:840 }, quantity:1, color:'Красный', size:null, comment:null
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
    expect(h.session.orderRequest).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(wrapper.get('#quantity').element)
    await wrapper.get('#quantity').setValue('4')
    await wrapper.get('#sellerPrice').setValue('281.26')
    expect(wrapper.text().match(/Максимальная стоимость заказа/g)).toHaveLength(1)
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
    expect(h.session.orderRequest).toHaveBeenCalledTimes(2)
    vm().refresh()
    expect(vm().confirmation).toBe(true)
    wrapper.findComponent(ConfirmDialog).vm.$emit('cancel'); await flushPromises()
    expect(vm().form.productName).toBe('Черновик')
    vm().refresh()
    h.session.orderRequest.mockResolvedValueOnce({ ...details, status:300, canEditProduct:false })
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm'); await flushPromises()
    expect(vm().dirty).toBe(false)
    expect(vm().editable).toBe(false)
    expect(wrapper.text()).toContain('только для просмотра')
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
    expect(wrapper.get('.product-grid').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.total-line .staff-form-value').classes()).toContain('staff-form-value--readonly')
    expect(wrapper.text()).toContain('Исправление товара временно недоступно')
    expect(wrapper.get('.saved-limit').text()).toContain('Сохранённая проверка лимита отсутствует')
    await vm().save()
    expect(h.session.orderRequest).toHaveBeenCalledTimes(1)
  })
  it.each(['administrator','shift-manager','senior-operator','operator'])('allows the role %s only with server permission', async role => {
    h.session.user.value.roles = [role]
    await render(); expect(vm().editable).toBe(true)
    vm().details.canEditProduct = false
    expect(vm().editable).toBe(false)
    await flushPromises()
    expect(wrapper.find('button[aria-label="Сохранить изменения"]').exists()).toBe(false)
    expect(wrapper.findAll('.header-actions button').map(button => button.attributes('aria-label'))).toEqual(['Расчёт стоимости', 'Обновить данные', 'Отменить'])
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
    expect(h.session.orderRequest).toHaveBeenLastCalledWith(`/orders/${next}`)
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
