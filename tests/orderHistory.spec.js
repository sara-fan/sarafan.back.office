// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import OrderHistoryView from '../src/views/OrderHistoryView.vue'
import OrderHistoryDetails from '../src/components/OrderHistoryDetails.vue'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import { validateHistoryOps, historyItemIsValid, normalizeHistoryFilters, historyDefaults, validateHistoryDetail } from '../src/orderHistory.js'
import { ops as orderOps, product } from './fixtures/orderProduct.js'
import { pricingOps, pricingDetails } from './fixtures/orderPricing.js'
const h = vi.hoisted(() => ({ session:{}, push:vi.fn(), route:null }))
vi.mock('../src/stores/session.js', () => ({ useSession:() => h.session }))
vi.mock('vue-router', () => ({ useRoute:() => h.route, useRouter:() => ({ push:h.push }) }))
const ops = { kinds:[0, 100, 200, 300, 400, 500].map((value, i) => ({ value, name:['Создание', 'Изменение товара', 'Распознавание', 'Расчёт', 'Подтверждение', 'Отмена покупателем'][i], routeAlias:'kind-' + value })),
  areas:[1, 2, 4, 8].map((value, i) => ({ value, name:['Создание', 'Товар', 'Стоимость', 'Статус'][i], routeAlias:'area-' + value })),
  actorTypes:[0, 100, 200].map((value, i) => ({ value, name:['Покупатель', 'Сотрудник', 'Система'][i], routeAlias:'actor-' + value })) }
const row = { eventKey:'0-1', at:'2026-09-24T10:00:00Z', kind:100, areas:6, actorType:100, actorName:'Иванов Иван' }
const detail = { event:row, version:1, missingCreationDetails:false, productBefore:null, productAfter:product,
  statusBefore:null, statusAfter:0, sourceUrl:'https://shop.example/item', pricingBefore:null, pricingAfter:pricingDetails.calculation, validUntilBefore:null, validUntilAfter:null }
function resultFor(path, items = [row], total = 1) {
  const q = new globalThis.URL(path, 'https://sarafan.test').searchParams, page = Number(q.get('page')), size = Number(q.get('pageSize')), pages = Math.ceil(total / size)
  return { items, pagination:{ currentPage:page, pageSize:size, totalCount:total, totalPages:pages, hasNextPage:page < pages, hasPreviousPage:page > 1 },
    sorting:{ sortBy:q.get('sortBy'), sortOrder:q.get('sortOrder') }, search:q.get('search'), area:q.has('area') ? Number(q.get('area')) : null,
    actorType:q.has('actorType') ? Number(q.get('actorType')) : null, from:q.get('from'), to:q.get('to') }
}
const pending = () => { let resolve, reject; return { promise:new Promise((a, b) => { resolve = a; reject = b }), resolve, reject } }
let wrapper
const vm = () => wrapper.vm.$.setupState
async function render() { wrapper = mount(OrderHistoryView, { global:{ plugins:[createSarafanVuetify()] } }); await flushPromises() }
beforeEach(() => {
  globalThis.localStorage.clear(); h.route = reactive({ params:{ orderNumber:'12345678-1' } }); h.push.mockReset().mockResolvedValue()
  h.session.user = ref({ id:1, roles:['operator'] }); h.session.viewStateMemory = new Map()
  h.session.getOrderOps = vi.fn().mockResolvedValue(orderOps)
  h.session.orderRequest = vi.fn(async path => path.endsWith('/history/ops') ? ops : path === '/orders/pricing/ops' ? pricingOps : path.endsWith('/history/0-1') ? detail : resultFor(path))
})
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.useRealTimers(); vi.restoreAllMocks() })

describe('history protocol', () => {
  it('validates metadata, items, filters and typed details', () => {
    expect(validateHistoryOps(ops)).toBe(ops)
    const previousOps = { ...ops, kinds:ops.kinds.slice(0, -1) }
    expect(validateHistoryOps(previousOps)).toBe(previousOps)
    expect(historyItemIsValid(row, ops)).toBe(true)
    expect(normalizeHistoryFilters(historyDefaults.filters)).toEqual(historyDefaults.filters)
    expect(validateHistoryDetail(detail, row, ops, orderOps, pricingOps)).toBe(detail)
  })
  it.each([null, {}, { ...ops, kinds:[] }, { ...ops, areas:[ops.areas[0], ops.areas[0], ops.areas[2], ops.areas[3]] },
    { ...ops, actorTypes:ops.actorTypes.map(item => ({ ...item, name:'' })) }, { ...ops, kinds:ops.kinds.map(item => ({ ...item, routeAlias:'' })) }])('rejects invalid metadata %#', value => expect(() => validateHistoryOps(value)).toThrow())
  it.each([{ eventKey:'0-0' }, { at:'bad' }, { kind:1 }, { areas:0 }, { areas:16 }, { actorType:1 }, { actorName:'' }])('rejects invalid list item %#', change => expect(historyItemIsValid({ ...row, ...change }, ops)).toBeFalsy())
  it.each([null, {}, { ...historyDefaults.filters, search:'x'.repeat(201) }, { ...historyDefaults.filters, area:3 }, { ...historyDefaults.filters, actorType:1 }, { ...historyDefaults.filters, from:'bad' }])('rejects invalid preferences %#', value => expect(normalizeHistoryFilters(value)).toBeNull())
  it.each([{ version:2 }, { event:{ ...row, eventKey:'0-2' } }, { missingCreationDetails:null }, { productAfter:{} }, { statusAfter:123 }, { sourceUrl:3 }, { validUntilAfter:'bad' }, { pricingAfter:{} }])('rejects invalid details %#', change => expect(() => validateHistoryDetail({ ...detail, ...change }, row, ops, orderOps, pricingOps)).toThrow())
})

describe('Vuetify order history', () => {
  it('renders the staff table and expands full evidence on demand', async () => {
    await render()
    expect(wrapper.findComponent({ name:'VDataTableServer' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('Иванов Иван')
    expect(wrapper.text()).not.toContain('Поиск по имени исполнителя')
    expect(wrapper.find('.field-hint').exists()).toBe(false)
    expect(wrapper.getComponent({ name:'ListFilterBar' }).getComponent({ name:'VTextField' }).props('label')).toBe('Поиск')
    expect(h.session.orderRequest).toHaveBeenCalledTimes(3)
    await wrapper.get('button[aria-label="Подробнее о событии"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('Изменение стоимости')
    expect(wrapper.text()).not.toContain('Параметры тарифа')
    expect(wrapper.findComponent({ name:'OrderCostSummary' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('Чайник')
    expect(wrapper.findComponent(OrderHistoryDetails).exists()).toBe(true)
    vm().toggle(row); vm().toggle(row); await flushPromises()
    expect(h.session.orderRequest).toHaveBeenCalledTimes(4)
    await vm().back(); expect(h.push).toHaveBeenCalledWith('/orders/12345678-1')
    h.push.mockRejectedValueOnce(new Error('secret')); await vm().back(); expect(vm().problem).not.toBeNull()
  })
  it('applies all filters, sorting and paging and persists them', async () => {
    await render()
    vm().filter('area', 4); await flushPromises(); vm().filter('actorType', 100); await flushPromises()
    vm().filter('from', '2026-09-24'); await flushPromises(); vm().filter('to', '2026-09-24'); await flushPromises()
    vm().sort([{ key:'actor', order:'asc' }]); await flushPromises()
    vm().pageSize(10); await flushPromises()
    expect(h.session.orderRequest.mock.calls.at(-1)[0]).toContain('area=4&actorType=100&from=2026-09-24&to=2026-09-24')
    vm().page(2); await flushPromises(); expect(vm().state.page).toBe(1) // Underflow repaired.
    const calls = h.session.orderRequest.mock.calls.length
    vm().sort([]); vm().sort([{ key:'bad', order:'asc' }]); vm().sort([{ key:'actor', order:'bad' }]); vm().pageSize(11); vm().page(0)
    expect(h.session.orderRequest).toHaveBeenCalledTimes(calls)
    wrapper.unmount(); wrapper = null; await render()
    expect(vm().state.filters.area).toBe(4); expect(vm().state.pageSize).toBe(10)
  })
  it('debounces search and ignores obsolete list results immediately', async () => {
    await render(); vi.useFakeTimers()
    const wait = pending(); h.session.orderRequest.mockReturnValueOnce(wait.promise)
    const loading = vm().load(); await flushPromises()
    vm().filter('search', 'Иван')
    wait.resolve(resultFor('/history?page=1&pageSize=25&sortBy=timestamp&sortOrder=desc', [], 0)); await loading
    expect(vm().rows).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(300); await flushPromises()
    expect(h.session.orderRequest.mock.calls.at(-1)[0]).toContain('search=')
    expect(vm().busy).toBe(false)
  })
  it('retries detail failures and ignores replies after switching order', async () => {
    await render(); h.session.orderRequest.mockRejectedValueOnce(new Error('private')); vm().toggle(row); await flushPromises()
    expect(wrapper.text()).not.toContain('private'); expect(vm().detailProblems[row.eventKey]).toBeTruthy()
    await wrapper.get('button[aria-label="Повторить загрузку события"]').trigger('click'); await flushPromises()
    expect(vm().details[row.eventKey]).toBeTruthy()
    const wait = pending(); h.session.orderRequest.mockReturnValueOnce(wait.promise)
    const request = vm().loadDetail(row); await vm().loadDetail(row)
    h.route.params.orderNumber = '12345678-2'; await flushPromises()
    wait.resolve(detail); await request
    expect(vm().details).toEqual({}); expect(vm().state.page).toBe(1)
  })
  it.each(['ops', 'list', 'echo'])('presents one error and recovers after %s failure', async mode => {
    const normal = h.session.orderRequest.getMockImplementation()
    h.session.orderRequest.mockImplementation(async path => {
      if (mode === 'ops' && path.endsWith('/history/ops') || mode === 'list' && path.includes('?')) throw new Error('private')
      const value = await normal(path); return mode === 'echo' && path.includes('?') ? { ...value, area:8 } : value
    })
    await render(); expect(wrapper.findAll('[role="alert"]')).toHaveLength(1); expect(wrapper.text()).not.toContain('private')
    h.session.orderRequest.mockImplementation(normal); await vm().load(); expect(vm().problem).toBeNull()
  })
  it('isolates identity changes and pending unmounted requests', async () => {
    const wait = pending(); h.session.orderRequest.mockReturnValueOnce(wait.promise)
    await render(); h.session.user.value = null
    wait.resolve(ops); await flushPromises(); expect(vm().rows).toEqual([]); expect(vm().ops).toBeNull()
    h.session.user.value = { id:2, roles:['operator'] }; await flushPromises(); expect(vm().rows).toHaveLength(1)
    const late = pending(); h.session.orderRequest.mockReturnValueOnce(late.promise)
    const request = vm().load(); wrapper.unmount(); wrapper = null
    late.reject(new Error('private')); await request
  })
  it('keeps preferences in memory when storage is blocked', async () => {
    vi.spyOn(globalThis.Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    await render(); vm().filter('area', 4); await flushPromises()
    expect(vm().preferenceProblem).not.toBeNull(); expect(h.session.viewStateMemory.size).toBe(1)
  })
})

describe('historical detail rendering', () => {
  it('shows before/after and missing creation details without editing controls', () => {
    wrapper = mount(OrderHistoryDetails, { props:{ detail:{ ...detail, missingCreationDetails:true,
      productBefore:{ ...product, quantity:2, size:'L' }, statusBefore:300, pricingBefore:pricingDetails.calculation, validUntilBefore:'2026-09-25T10:00:00Z' }, orderOps, pricingOps }, global:{ plugins:[createSarafanVuetify()] } })
    expect(wrapper.text()).toContain('Известна только дата создания')
    expect(wrapper.text()).toContain('Оплачен'); expect(wrapper.text()).toContain('Стоимость без изменений')
    expect(wrapper.find('input').exists()).toBe(false)
  })
})


describe('history control events', () => {
  it('connects the shared filters and keeps text/date controls usable during reads', async () => {
    await render()
    const selects = wrapper.findAllComponents({ name:'VSelect' }).filter(item => ['Раздел', 'Исполнитель'].includes(item.props('label')))
    selects[0].vm.$emit('update:modelValue', 4); await flushPromises()
    selects[1].vm.$emit('update:modelValue', 100); await flushPromises()
    for (const field of wrapper.findAllComponents({ name:'VTextField' }).filter(item => item.props('type') === 'date')) {
      field.vm.$emit('update:modelValue', '2026-09-24'); await flushPromises()
      field.vm.$emit('update:modelValue', null); await flushPromises()
    }
    wrapper.findComponent({ name:'ListFilterBar' }).vm.$emit('update:search', 'Иван')
    await new Promise(resolve => globalThis.setTimeout(resolve, 320)); await flushPromises()
    expect(vm().state.filters.search).toBe('Иван')
    expect(h.session.orderRequest.mock.calls.at(-1)[0]).not.toContain('orderNumber=')
  })
  it('restores a blocked-storage notice and resets the page when opening another order', async () => {
    await render()
    vm().state.page = 4; vm().persist(); wrapper.unmount(); wrapper = null
    h.route.params.orderNumber = '12345678-2'
    await render(); expect(vm().state.page).toBe(1)
    expect(vm().state.filters.orderNumber).toBe('12345678-2')
    wrapper.unmount(); wrapper = null
    vi.spyOn(globalThis.Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    await render(); expect(vm().preferenceProblem).not.toBeNull()
  })
})


describe('history evidence boundaries', () => {
  it('validates and displays the customer cancellation reason as plain text', () => {
    const orderOpsWithCancelled = { ...orderOps, statuses:[...orderOps.statuses,
      { value:500, name:'Отменён', routeAlias:'cancelled', upperStatusValue:500, upperStatusName:'Отменён', upperStatusRouteAlias:'cancelled' }] }
    const cancelledRow = { ...row, kind:500, areas:8, actorType:0, actorName:'Покупатель' }
    const cancelled = { ...detail, event:cancelledRow, version:2, productAfter:null,
      statusBefore:0, statusAfter:500, sourceUrl:null, pricingAfter:null,
      cancellationReason:'Передумал <script>alert(1)</script>' }
    expect(validateHistoryDetail(cancelled, cancelledRow, ops, orderOpsWithCancelled, pricingOps).cancellationReason)
      .toBe(cancelled.cancellationReason)
    wrapper = mount(OrderHistoryDetails, { props:{ detail:cancelled, orderOps:orderOpsWithCancelled, pricingOps },
      global:{ plugins:[createSarafanVuetify()] } })
    expect(wrapper.text()).toContain(cancelled.cancellationReason)
    expect(wrapper.find('script').exists()).toBe(false)
  })
  it('renders a timestamp-only legacy creation without inventing field or price values', () => {
    wrapper = mount(OrderHistoryDetails, { props:{ detail:{ ...detail, missingCreationDetails:true,
      productBefore:null, productAfter:null, statusBefore:null, statusAfter:null, sourceUrl:null, pricingAfter:null }, orderOps, pricingOps }, global:{ plugins:[createSarafanVuetify()] } })
    expect(wrapper.text()).toContain('Известна только дата создания')
    expect(wrapper.find('table').exists()).toBe(false)
  })
  it('renders removed product values and manual amounts without a tariff', () => {
    const calculation = globalThis.structuredClone(pricingDetails.calculation)
    const component = calculation.components[0]
    component.tariff = null; calculation.inputs.manualAmounts[component.service] = 7
    wrapper = mount(OrderHistoryDetails, { props:{ detail:{ ...detail,
      productBefore:product, productAfter:null, statusBefore:0, statusAfter:null, sourceUrl:null, pricingAfter:calculation }, orderOps, pricingOps }, global:{ plugins:[createSarafanVuetify()] } })
    expect(wrapper.text()).toContain('100,00$')
    expect(wrapper.text()).not.toContain('Ручная сумма')
    expect(wrapper.text()).toContain('Чайник')
  })
  it('rejects duplicate event keys before displaying the result', async () => {
    const normal = h.session.orderRequest.getMockImplementation()
    h.session.orderRequest.mockImplementation(path => path.includes('?') ? resultFor(path, [row, row], 2) : normal(path))
    await render(); expect(vm().rows).toEqual([]); expect(vm().problem).not.toBeNull()
  })
})


it('clears actor search and ignores a detail failure after the list refreshes', async () => {
  await render()
  const wait = pending(); h.session.orderRequest.mockReturnValueOnce(wait.promise)
  const request = vm().loadDetail(row)
  vm().filter('search', null)
  wait.reject(new Error('obsolete')); await request
  expect(vm().detailProblems).toEqual({})
  await new Promise(resolve => globalThis.setTimeout(resolve, 320)); await flushPromises()
  expect(vm().state.filters.search).toBe('')
  expect(vm().rows).toHaveLength(1)
})


it('renders accessible compact headers, total and separately marked extras', () => {
  const pricingAfter = globalThis.structuredClone(pricingDetails.calculation)
  Object.assign(pricingAfter.components.find(item => item.service === 300), { state:0, amount:0, amountRub:0 })
  wrapper = mount(OrderHistoryDetails, { props:{ detail:{ ...detail, pricingBefore:pricingDetails.calculation, pricingAfter }, orderOps, pricingOps }, global:{ plugins:[createSarafanVuetify()] } })
  const table = wrapper.get('.price-comparison')
  expect(table.findAll('thead th[scope="col"]').map(item => item.text())).toEqual(['Компонент', 'Было', 'Стало', 'Причина'])
  const body = table.findAll('tbody tr')
  expect(body).toHaveLength(2)
  expect(body[0].text()).toContain('Итого')
  expect(body[0].get('th > .price-total-context').text()).toBe('Итого, прогнозная стоимость $ 80.0000 ₽ (ЦБ РФ, 24.09.2026)')
  expect(body[0].get('small.price-note.price-total-rate').text()).toBe('$ 80.0000 ₽ (ЦБ РФ, 24.09.2026)')
  expect(body[1].text()).toContain('Не входит в итог')
  expect(body[1].find('small.price-note').exists()).toBe(true)
  expect(body[1].text()).toContain('0,00₽')
  expect(wrapper.text()).not.toContain('Параметры тарифа')
})

it('shows the saved confirmed rate beneath the historical total', () => {
  wrapper = mount(OrderHistoryDetails, { props:{ detail:{ ...detail, validUntilAfter:'2026-09-25T10:00:00Z' }, orderOps, pricingOps }, global:{ plugins:[createSarafanVuetify()] } })
  const total = wrapper.get('.price-comparison tbody tr.price-total th')
  expect(total.get('.price-total-context').text()).toBe('Итого, утверждённая стоимость $ 80.0000 ₽ (ЦБ РФ, 24.09.2026)')
  expect(total.get('small.price-note.price-total-rate').text()).toBe('$ 80.0000 ₽ (ЦБ РФ, 24.09.2026)')
})
