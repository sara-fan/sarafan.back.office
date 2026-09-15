// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import { createInternalProblem } from '../src/errors/problem.js'
import {
  DEFAULT_ORDER_STATUS_SELECTION,
  formatOrderMoney,
  normalizeOrderFilters,
  orderRowIsValid,
  orderStatusItems,
  safeOrderSource,
  selectionIsKnown,
  validateOrderOps
} from '../src/orderFormatting.js'
import { currencies, productLimits } from './fixtures/orderProduct.js'
import OrdersView from '../src/views/OrdersView.vue'

const h = vi.hoisted(() => ({ session:{}, push:vi.fn() }))
vi.mock('vue-router', () => ({ useRouter:() => ({ push:h.push }) }))
vi.mock('../src/stores/session.js', () => ({ useSession:() => h.session }))

const status = (value, name, routeAlias) => ({
  value, name, routeAlias,
  upperStatusValue:value >= 300 && value < 400 ? 300 : value,
  upperStatusName:value >= 300 && value < 400 ? 'Выполняется' : name,
  upperStatusRouteAlias:value >= 300 && value < 400 ? 'in_progress' : routeAlias
})
const rawOps = {
  statuses:[status(0, 'На проверке', 'under_review'), status(300, 'Оплачен', 'paid'), status(380, 'Доставка по России', 'delivering_in_russia'), status(400, 'Получен', 'received')],
  currencies, productLimits,
  statusGroups:[
    { routeAlias:'work', name:'В работе', statuses:[0, 300, 380] },
    { routeAlias:'in_progress', name:'Выполняется', statuses:[300, 380] }
  ]
}
const ops = validateOrderOps(rawOps)
const rows = [
  {
    orderNumber:'12345678-1', status:0, sourceUrl:'https://shop.example/item?a=1', productName:'Чайник', storeName:'Магазин',
    sellerPrice:{ amount:12.5, currency:840 }, quantity:2, createdAt:'2026-09-13T21:00:00Z', updatedAt:'2026-09-13T22:00:00Z'
  },
  {
    orderNumber:'12345678-2', status:300, sourceUrl:'http://shop.example/item-2', productName:null, storeName:null,
    sellerPrice:null, quantity:1, createdAt:'2026-09-14T00:00:00Z', updatedAt:'2026-09-14T00:00:00Z'
  }
]
const resultFor = (path, items = rows, total = items.length) => {
  const query = new globalThis.URL(path, 'https://sarafan.test').searchParams
  const page = Number(query.get('page'))
  const pageSize = Number(query.get('pageSize'))
  const pages = total === 0 ? 0 : Math.ceil(total / pageSize)
  return {
    items,
    pagination:{ currentPage:page, pageSize, totalCount:total, totalPages:pages, hasNextPage:page < pages, hasPreviousPage:page > 1 },
    sorting:{ sortBy:query.get('sortBy'), sortOrder:query.get('sortOrder') },
    search:query.get('search'),
    status:query.has('status') ? Number(query.get('status')) : null,
    statusGroup:query.get('statusGroup'),
    createdFrom:query.get('createdFrom'),
    createdTo:query.get('createdTo')
  }
}
const pending = () => { let resolve; return { promise:new Promise(done => { resolve = done }), resolve } }
let wrapper
const vm = () => wrapper.vm.$.setupState
const render = () => {
  wrapper = mount(OrdersView, { global:{ plugins:[createSarafanVuetify()] } })
  return wrapper
}

beforeEach(() => {
  globalThis.localStorage.clear()
  h.session.viewStateMemory = new Map()
  h.session.user = ref({ id:7, roles:['operator'] })
  h.session.getOrderOps = vi.fn().mockResolvedValue(ops)
  h.session.orderRequest = vi.fn(async path => resultFor(path))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('order catalogue and formatting', () => {
  it('strictly validates Core metadata and derives selectors and labels from it', () => {
    expect(validateOrderOps(rawOps)).toEqual(rawOps)
    expect(orderStatusItems(ops).map(item => item.title)).toEqual([
      'Все статусы', 'В работе', 'Выполняется',
      'На проверке', 'Оплачен', 'Доставка по России', 'Получен'
    ])
    expect(selectionIsKnown('', ops)).toBe(true)
    expect(selectionIsKnown('group:work', ops)).toBe(true)
    expect(selectionIsKnown('status:300', ops)).toBe(true)
    expect(selectionIsKnown('status:999', ops)).toBe(false)
    expect(selectionIsKnown('bad:300', ops)).toBe(false)
    expect(DEFAULT_ORDER_STATUS_SELECTION).toBe('group:work')
  })

  it.each([
    null,
    { ...rawOps, statuses:[] },
    { ...rawOps, currencies:[{ value:643, name:'', routeAlias:'rub' }] },
    { ...rawOps, statuses:[rawOps.statuses[0], rawOps.statuses[0]] },
    { ...rawOps, statusGroups:rawOps.statusGroups.slice(0, 1) },
    { ...rawOps, statusGroups:[rawOps.statusGroups[0], { ...rawOps.statusGroups[1], routeAlias:'work' }] },
    { ...rawOps, statusGroups:[rawOps.statusGroups[0], { ...rawOps.statusGroups[1], statuses:[999] }] },
    { ...rawOps, statusGroups:[{ ...rawOps.statusGroups[0], name:'Работа' }, rawOps.statusGroups[1]] }
  ])('rejects malformed order metadata %j', value => {
    expect(() => validateOrderOps(value)).toThrow(expect.objectContaining({ code:'ui_protocol_error' }))
  })

  it('validates filters, rows, safe links and Core-owned currency aliases', () => {
    expect(normalizeOrderFilters({ search:' чайник ', status:'group:work', createdFrom:'2026-09-01', createdTo:'2026-09-30' }))
      .toEqual({ search:' чайник ', status:'group:work', createdFrom:'2026-09-01', createdTo:'2026-09-30' })
    for (const invalid of [
      null,
      { search:'', status:'group:work', createdFrom:'2026-02-30', createdTo:'' },
      { search:'', status:'bad', createdFrom:'', createdTo:'' },
      { search:'', status:'', createdFrom:'2026-09-30', createdTo:'2026-09-01' },
      { search:'x'.repeat(2049), status:'', createdFrom:'', createdTo:'' }
    ]) expect(normalizeOrderFilters(invalid)).toBeNull()
    expect(orderRowIsValid(rows[0], ops)).toBe(true)
    expect(orderRowIsValid({ ...rows[0], orderNumber:'internal' }, ops)).toBe(false)
    expect(orderRowIsValid({ ...rows[0], sourceUrl:'javascript:alert(1)' }, ops)).toBe(false)
    expect(orderRowIsValid({ ...rows[0], createdAt:'2026-09-13' }, ops)).toBe(false)
    expect(orderRowIsValid({ ...rows[0], updatedAt:'2020-01-01T00:00:00Z' }, ops)).toBe(false)
    expect(safeOrderSource(rows[0].sourceUrl)).toBe('https://shop.example/item?a=1')
    expect(safeOrderSource('javascript:alert(1)')).toBeNull()
    expect(formatOrderMoney(rows[0].sellerPrice, ops)).toBe('12,50 USD')
    expect(formatOrderMoney(null, ops)).toBe('—')
    expect(formatOrderMoney({ amount:1, currency:999 }, ops)).toBe('—')
  })
})

describe('orders server table', () => {
  it('opens with the staff default, renders compact rows, and opens the dedicated card', async () => {
    render()
    await flushPromises()

    expect(h.session.getOrderOps).toHaveBeenCalledOnce()
    expect(h.session.orderRequest).toHaveBeenCalledWith('/orders?page=1&pageSize=10&sortBy=createdAt&sortOrder=desc&statusGroup=work')
    expect(wrapper.get('.count').text()).toBe('2')
    expect(wrapper.text()).toContain('Чайник')
    expect(wrapper.text()).toContain('Товар не указан')
    expect(wrapper.text()).toContain('Магазин не указан')
    expect(wrapper.text()).toContain('12,50 USD')
    expect(wrapper.text()).toContain('МСК')
    expect(wrapper.get('.order-product a').attributes()).toMatchObject({ href:'https://shop.example/item?a=1', target:'_blank', rel:'noopener noreferrer' })
    const table = wrapper.findComponent({ name:'VDataTableServer' })
    expect(table.props()).toMatchObject({ fixedHeader:true, density:'compact', mustSort:true, itemsPerPage:10, itemsLength:2 })
    expect(table.props('headers').map(header => header.key)).toEqual([
      'actions', 'orderNumber', 'status', 'productName', 'storeName', 'sellerPrice', 'quantity', 'createdAt', 'updatedAt'
    ])
    expect(table.props('headers')[0]).toMatchObject({ title:'', sortable:false })
    const clickableColumns = table.props('headers').filter(header => !['productName', 'actions'].includes(header.key))
    const clickable = table.props('cellProps')({ item:rows[0], column:clickableColumns[0] })
    for (const column of clickableColumns) {
      expect(table.props('cellProps')({ item:rows[0], column })).toMatchObject({ class:'order-card-cell', onClick:expect.any(Function) })
    }
    clickable.onClick()
    expect(h.push).toHaveBeenCalledWith('/orders/12345678-1')
    expect(table.props('cellProps')({ item:rows[0], column:{ key:'productName' } })).toEqual({})
    h.push.mockClear()
    await wrapper.get('button[aria-label="Открыть заказ"]').trigger('click')
    expect(h.push).toHaveBeenCalledExactlyOnceWith('/orders/12345678-1')
    expect(wrapper.find('.order-number').exists()).toBe(false)
    h.push.mockRejectedValueOnce(new Error('private'))
    await vm().openOrder(rows[0])
    expect(vm().problem).toBeTruthy()
    expect(wrapper.text()).not.toContain('private')
    expect(wrapper.findAllComponents({ name:'VSelect' })[0].props('items').map(item => item.title)).toContain('Выполняется')
  })

  it('builds exact/group/date queries and resets filter, sort and page-size changes to page one', async () => {
    h.session.orderRequest = vi.fn(async path => resultFor(path, rows, 40))
    render()
    await flushPromises()
    h.session.orderRequest.mockClear()

    vm().onPageChange(3)
    await flushPromises()
    expect(h.session.orderRequest.mock.calls.at(-1)[0]).toContain('page=3')
    vm().onStatusChange('status:300')
    await flushPromises()
    let path = h.session.orderRequest.mock.calls.at(-1)[0]
    expect(path).toContain('page=1')
    expect(path).toContain('status=300')
    expect(path).not.toContain('statusGroup')
    vm().onCreatedFromChange('2026-09-01')
    await flushPromises()
    vm().onCreatedToChange('2026-09-30')
    await flushPromises()
    path = h.session.orderRequest.mock.calls.at(-1)[0]
    expect(path).toContain('createdFrom=2026-09-01')
    expect(path).toContain('createdTo=2026-09-30')
    vm().onItemsPerPageChange(25)
    await flushPromises()
    expect(h.session.orderRequest.mock.calls.at(-1)[0]).toContain('pageSize=25')
    vm().onSortChange([{ key:'sellerPrice', order:'asc' }])
    await flushPromises()
    path = h.session.orderRequest.mock.calls.at(-1)[0]
    expect(path).toContain('sortBy=sellerPrice')
    expect(path).toContain('sortOrder=asc')
    expect(path).toContain('page=1')
  })

  it('debounces and trims search while persisting the bounded user input', async () => {
    vi.useFakeTimers()
    render()
    await flushPromises()
    h.session.orderRequest.mockClear()

    vm().onSearchInput(`  чайник  ${'x'.repeat(2100)}`)
    await vi.advanceTimersByTimeAsync(299)
    expect(h.session.orderRequest).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    const path = h.session.orderRequest.mock.calls.at(-1)[0]
    expect(new globalThis.URL(path, 'https://sarafan.test').searchParams.get('search')?.length).toBeLessThanOrEqual(2048)
    expect(new globalThis.URL(path, 'https://sarafan.test').searchParams.get('search')?.startsWith('чайник')).toBe(true)
    const stored = JSON.parse(globalThis.localStorage.getItem('sarafan.backoffice.view-state.v1.7.orders'))
    expect(stored.page).toBe(1)
    expect(stored.filters.search.length).toBe(2048)
  })

  it('restores validated per-user state and recovers unknown catalogue selections to the first-visit default', async () => {
    globalThis.localStorage.setItem('sarafan.backoffice.view-state.v1.7.orders', JSON.stringify({
      version:1, page:2, pageSize:25, sortBy:[{ key:'orderNumber', order:'asc' }],
      filters:{ search:'item', status:'status:999', createdFrom:'2026-09-01', createdTo:'2026-09-30' }
    }))
    render()
    await flushPromises()

    const path = h.session.orderRequest.mock.calls.at(-1)[0]
    expect(path).toContain('page=1')
    expect(path).toContain('pageSize=25')
    expect(path).toContain('sortBy=orderNumber')
    expect(path).toContain('statusGroup=work')
    expect(path).toContain('createdFrom=2026-09-01')
    expect(JSON.parse(globalThis.localStorage.getItem('sarafan.backoffice.view-state.v1.7.orders')).filters.status)
      .toBe('group:work')
  })

  it('restores filters, sort and page after card navigation when storage writes fail', async () => {
    vi.spyOn(globalThis.Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    h.session.orderRequest = vi.fn(async path => resultFor(path, rows, 100))
    render(); await flushPromises()
    vm().onSearchInput('tea'); vm().refreshList(); await flushPromises()
    vm().onSortChange([{ key:'orderNumber', order:'asc' }]); await flushPromises()
    vm().onPageChange(3); await flushPromises()
    await vm().openOrder(rows[0])
    wrapper.unmount()
    render(); await flushPromises()
    expect(vm().search).toBe('tea')
    expect(vm().page).toBe(3)
    expect(vm().sortBy).toEqual([{ key:'orderNumber', order:'asc' }])
    expect(vm().preferenceProblem).toBeTruthy()
  })
  it('keeps the list usable when browser storage is unavailable', async () => {
    vi.spyOn(globalThis.globalThis.Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    render()
    await flushPromises()

    expect(wrapper.get('[role=alert]').text()).toContain('браузер не может сохранить')
    expect(wrapper.get('.count').text()).toBe('2')
    expect(h.session.orderRequest).toHaveBeenCalledOnce()
  })

  it('corrects page underflow with one authoritative reload', async () => {
    globalThis.localStorage.setItem('sarafan.backoffice.view-state.v1.7.orders', JSON.stringify({
      version:1, page:4, pageSize:10, sortBy:[{ key:'createdAt', order:'desc' }],
      filters:{ search:'', status:'group:work', createdFrom:'', createdTo:'' }
    }))
    h.session.orderRequest = vi.fn(async path => {
      const page = Number(new globalThis.URL(path, 'https://sarafan.test').searchParams.get('page'))
      return resultFor(path, page === 4 ? [] : rows, 20)
    })
    render()
    await flushPromises()

    expect(h.session.orderRequest).toHaveBeenCalledTimes(2)
    expect(h.session.orderRequest.mock.calls[0][0]).toContain('page=4')
    expect(h.session.orderRequest.mock.calls[1][0]).toContain('page=2')
    expect(vm().page).toBe(2)
    expect(wrapper.get('.count').text()).toBe('20')
  })

  it('ignores stale responses, keeps refresh as the single recovery owner, and rejects malformed envelopes', async () => {
    const first = pending()
    h.session.orderRequest = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockImplementation(async path => resultFor(path, [rows[1]], 1))
    render()
    await flushPromises()
    vm().onStatusChange('status:300')
    await flushPromises()
    expect(wrapper.text()).toContain('12345678-2')
    first.resolve(resultFor('/orders?page=1&pageSize=10&sortBy=createdAt&sortOrder=desc&statusGroup=work', [rows[0]], 1))
    await flushPromises()
    expect(wrapper.text()).toContain('12345678-2')
    expect(wrapper.text()).not.toContain('12345678-1')

    h.session.orderRequest.mockRejectedValueOnce(createInternalProblem('networkUnavailable'))
    await wrapper.get('button[aria-label="Обновить заказы"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role=alert]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Повторить загрузку"]').exists()).toBe(false)
    h.session.orderRequest.mockResolvedValueOnce({ items:[], pagination:{} })
    await wrapper.get('button[aria-label="Обновить заказы"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('Сервис временно недоступен')
  })

  it('ignores invalid table events, preserves rows on retained reloads, and handles failed preference writes', async () => {
    render()
    await flushPromises()
    h.session.orderRequest.mockClear()
    vm().onStatusChange('status:999')
    vm().onCreatedFromChange('bad-date')
    vm().onCreatedToChange('2020-13-40')
    vm().onPageChange(0)
    vm().onItemsPerPageChange(11)
    vm().onSortChange([{ key:'id', order:'up' }])
    expect(h.session.orderRequest).not.toHaveBeenCalled()

    vm().onStatusChange('')
    await flushPromises()
    expect(h.session.orderRequest.mock.calls.at(-1)[0]).not.toContain('status')
    vi.spyOn(globalThis.globalThis.Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    vm().onStatusChange('group:work')
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('браузер не может сохранить')

    h.session.orderRequest.mockRejectedValueOnce(createInternalProblem('networkUnavailable'))
    await vm().load({ retainRows:true })
    expect(wrapper.text()).toContain('12345678-1')
    vi.useFakeTimers()
    vm().onSearchInput(null)
    vm().onSearchInput('new search')
    wrapper.unmount()
    wrapper = null
  })
})
