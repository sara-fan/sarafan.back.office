// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import ServiceCatalogueAuditView from '../src/views/ServiceCatalogueAuditView.vue'
import ServiceCatalogueEntryView from '../src/views/ServiceCatalogueEntryView.vue'
import ServiceCatalogueView from '../src/views/ServiceCatalogueView.vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
import { createInternalProblem, ProblemError } from '../src/errors/problem.js'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import { SERVICE_CATALOGUE_CONFLICT } from '../src/serviceCatalogue.js'
import { auditPage, fixedEntry, percentageEntry, serviceCatalogueEntries, serviceCatalogueOps } from './fixtures/serviceCatalogue.js'
import { pending } from './fixtures/stores.js'

const h = vi.hoisted(() => ({ session:{}, push:vi.fn(), route:null, leave:null, update:null }))
vi.mock('../src/stores/session.js', () => ({ useSession:() => h.session }))
vi.mock('vue-router', async importOriginal => ({
  ...await importOriginal(),
  useRoute:() => h.route,
  useRouter:() => ({ push:h.push }),
  onBeforeRouteLeave:fn => { h.leave = fn },
  onBeforeRouteUpdate:fn => { h.update = fn }
}))

let wrapper
const vm = () => wrapper.vm.$.setupState
const copy = value => globalThis.structuredClone(value)
const editableEntry = { ...percentageEntry, id:4, service:500 }
async function render(component, attachTo) {
  wrapper = mount(component, { attachTo, global:{ plugins:[createSarafanVuetify()] } })
  await flushPromises()
}

beforeEach(() => {
  globalThis.localStorage.clear()
  h.route = reactive({ params:{ id:'1' }, fullPath:'/service-catalogue/1' })
  h.session.user = ref({ id:1, roles:['administrator'] })
  h.session.viewStateMemory = new Map()
  h.session.getServiceCatalogueOps = vi.fn(async () => copy(serviceCatalogueOps))
  h.session.serviceCatalogueRequest = vi.fn(async path => {
    if (path === '/service-catalogue') return { items:copy(serviceCatalogueEntries) }
    if (path.startsWith('/service-catalogue/audit?')) return copy(auditPage())
    return copy(percentageEntry)
  })
  h.push.mockReset().mockResolvedValue()
})
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.restoreAllMocks(); vi.useRealTimers() })

describe('service catalogue list', () => {
  it('offers both currencies and all methods for every service without resetting the selection', async () => {
    h.route.params = {}
    h.route.fullPath = '/service-catalogue/new'
    await render(ServiceCatalogueEntryView)
    expect(wrapper.find('#currency').exists()).toBe(false)
    expect(vm().form.currency).toBe(840)
    await wrapper.get('#priceMethod').setValue('200')
    expect(wrapper.get('#currency').element.value).toBe('840')
    await wrapper.get('#currency').setValue('643')
    await wrapper.get('#currency').setValue('840')
    expect(wrapper.findAll('#currency option').map(option => option.text())).toEqual(['Российский рубль (₽)', 'Доллар США ($)'])
    expect(wrapper.findAll('#service option').map(option => Number(option.element.value))).not.toContain(0)
    for (const service of [100, 200, 300, 400, 500, 600, 700]) {
      await wrapper.get('#service').setValue(String(service))
      expect(wrapper.findAll('#currency option').map(option => Number(option.element.value))).toEqual([643, 840])
      expect(wrapper.get('#currency').element.value).toBe('840')
      expect(wrapper.findAll('#priceMethod option').map(option => Number(option.element.value))).toEqual([0, 100, 200, 300, 400])
      expect(wrapper.get('#priceMethod').element.value).toBe('200')
    }
    await wrapper.get('#currency').setValue('643')
    await wrapper.get('#priceMethod').setValue('0')
    expect(wrapper.find('#currency').exists()).toBe(false)
    expect(vm().form.currency).toBe(840)
  })
  it('loads, filters, opens, confirms deletion and exposes audit/create actions', async () => {
    await render(ServiceCatalogueView)
    expect(wrapper.text()).toContain('Тарифы')
    expect(wrapper.text()).toContain('Процент от цены товара')
    expect(wrapper.findAll('th')[0].text()).toBe('')
    const [actions, service, method, parameters, availability] = vm().headers
    expect(actions.sortable).toBe(false)
    expect(service.sortRaw(percentageEntry, fixedEntry)).toBeGreaterThan(0)
    expect(method.sortRaw(percentageEntry, fixedEntry)).toBeLessThan(0)
    expect(parameters.sortRaw(percentageEntry, fixedEntry)).not.toBe(0)
    expect(availability.sortRaw(percentageEntry, fixedEntry)).toBeLessThan(0)
    expect(wrapper.find('button[aria-label="Добавить тариф"]').exists()).toBe(true)
    expect(wrapper.findAll('button[aria-label="Удалить тариф"]')).toHaveLength(2)
    await wrapper.get('button[aria-label="Открыть журнал изменений"]').trigger('click')
    expect(h.push).toHaveBeenCalledWith('/service-catalogue/audit')
    await wrapper.get('button[aria-label="Добавить тариф"]').trigger('click')
    expect(h.push).toHaveBeenCalledWith('/service-catalogue/new')
    const selects = wrapper.findAllComponents({ name:'VSelect' })
    selects[0].vm.$emit('update:modelValue', 100)
    selects[1].vm.$emit('update:modelValue', 100)
    await flushPromises()
    expect(vm().filtered).toHaveLength(1)
    await wrapper.get('.filter-search input').setValue('склада')
    expect(vm().page).toBe(1)
    const cell = vm().cellProps({ item:fixedEntry, column:{ key:'service' } })
    cell.onClick()
    const keyEvent = { key:'Enter', preventDefault:vi.fn() }
    cell.onKeydown(keyEvent)
    cell.onKeydown({ key:'Space', preventDefault:vi.fn() })
    expect(keyEvent.preventDefault).toHaveBeenCalled()
    expect(vm().cellProps({ item:fixedEntry, column:{ key:'actions' } })).toEqual({})
    await wrapper.get('button[aria-label="Открыть тариф"]').trigger('click')
    expect(h.push).toHaveBeenCalledWith('/service-catalogue/2')
    await wrapper.get('button[aria-label="Удалить тариф"]').trigger('click')
    expect(wrapper.findComponent(ConfirmDialog).props('open')).toBe(true)
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm')
    await flushPromises()
    const call = h.session.serviceCatalogueRequest.mock.calls.find(([, options]) => options?.method === 'DELETE')
    expect(call[0]).toBe('/service-catalogue/2')
    expect(JSON.parse(call[1].body)).toEqual({ version:fixedEntry.version })
    expect(vm().items.some(item => item.id === 2)).toBe(false)
    vm().pendingDelete = fixedEntry
    await flushPromises()
    wrapper.findComponent(ConfirmDialog).vm.$emit('cancel')
    expect(vm().pendingDelete).toBeNull()
  })

  it('uses read-only actions for non-admin staff and locks stale deletion until refresh', async () => {
    h.session.user.value = { id:2, roles:['operator'] }
    const readOps = { ...serviceCatalogueOps, actions:{ view:true, create:false, edit:false, delete:false, audit:true } }
    h.session.getServiceCatalogueOps.mockResolvedValue(copy(readOps))
    await render(ServiceCatalogueView)
    expect(wrapper.find('button[aria-label="Добавить тариф"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Удалить тариф"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Открыть тариф"] .fa-eye').exists()).toBe(true)
    wrapper.unmount()

    h.session.user.value = { id:1, roles:['administrator'] }
    h.session.getServiceCatalogueOps.mockResolvedValue(copy(serviceCatalogueOps))
    h.session.serviceCatalogueRequest.mockImplementation(async (path, options) => {
      if (options?.method === 'DELETE') throw new ProblemError({ type:SERVICE_CATALOGUE_CONFLICT, status:409, detail:'Конфликт' })
      return path === '/service-catalogue' ? { items:copy(serviceCatalogueEntries) } : copy(percentageEntry)
    })
    await render(ServiceCatalogueView)
    vm().pendingDelete = fixedEntry
    await vm().remove()
    expect(vm().deleteLocked).toBe(true)
    expect(vm().items).toHaveLength(3)
    await vm().load()
    expect(vm().deleteLocked).toBe(false)
  })

  it('discards obsolete loads and shows recoverable failures without clearing staff', async () => {
    const deferred = pending()
    h.session.serviceCatalogueRequest.mockReturnValueOnce(deferred.promise)
    await render(ServiceCatalogueView)
    const second = vm().load()
    deferred.resolve({ items:copy(serviceCatalogueEntries) })
    await second
    h.session.serviceCatalogueRequest.mockRejectedValueOnce(createInternalProblem('serviceUnavailable'))
    await vm().load()
    expect(wrapper.find('.page-alert').exists()).toBe(true)
    expect(h.session.user.value.id).toBe(1)
    h.session.user.value = null
    await flushPromises()
    expect(vm().items).toEqual([])
  })

  it('handles navigation rejection and no-op deletion states', async () => {
    await render(ServiceCatalogueView)
    const calls = h.session.serviceCatalogueRequest.mock.calls.length
    await vm().remove()
    vm().busy = true; vm().pendingDelete = percentageEntry; await vm().remove()
    vm().busy = false; vm().deleteLocked = true; await vm().remove()
    expect(h.session.serviceCatalogueRequest).toHaveBeenCalledTimes(calls)
    h.push.mockRejectedValueOnce(createInternalProblem('invalidInput'))
    await vm().open('/service-catalogue/1')
    expect(vm().problem).not.toBeNull()
  })

  it('honors Core view and audit capabilities before loading protected data', async () => {
    const noView = { ...serviceCatalogueOps, actions:{ ...serviceCatalogueOps.actions, view:false } }
    h.session.getServiceCatalogueOps.mockResolvedValue(copy(noView))
    h.session.serviceCatalogueRequest.mockClear()
    await render(ServiceCatalogueView)
    expect(h.push).toHaveBeenCalledWith('/forbidden')
    expect(h.session.serviceCatalogueRequest).not.toHaveBeenCalled()
    wrapper.unmount()

    h.route.params = {}
    h.route.fullPath = '/service-catalogue/new'
    const noCreate = { ...serviceCatalogueOps, actions:{ ...serviceCatalogueOps.actions, create:false } }
    h.session.getServiceCatalogueOps.mockResolvedValue(copy(noCreate))
    h.push.mockClear()
    await render(ServiceCatalogueEntryView)
    expect(h.push).toHaveBeenCalledWith('/forbidden')
    expect(h.session.serviceCatalogueRequest).not.toHaveBeenCalled()
    wrapper.unmount()

    const noAudit = { ...serviceCatalogueOps, actions:{ ...serviceCatalogueOps.actions, audit:false } }
    h.session.getServiceCatalogueOps.mockResolvedValue(copy(noAudit))
    h.push.mockClear()
    await render(ServiceCatalogueAuditView)
    expect(h.push).toHaveBeenCalledWith('/forbidden')
    expect(h.session.serviceCatalogueRequest).not.toHaveBeenCalled()
  })
})

describe('service catalogue editor', () => {
  beforeEach(() => {
    h.route.params = { id:'4' }
    h.route.fullPath = '/service-catalogue/4'
    h.session.serviceCatalogueRequest.mockImplementation(async path => path === '/service-catalogue'
      ? { items:copy(serviceCatalogueEntries) } : copy(editableEntry))
  })
  it('shows the revised guidance and clears either date with its brush action', async () => {
    await render(ServiceCatalogueEntryView)
    expect(wrapper.find('#percentage-hint').exists()).toBe(false)
    expect(wrapper.get('#minimumAmount-hint').text()).toBe('Необязательно.')
    expect(wrapper.get('#maximumAmount-hint').text()).toBe('Необязательно.')
    expect(wrapper.get('#availableBy-hint').text()).toContain('отсутствие окончания срока действия')
    await wrapper.get('#availableFrom').setValue('2026-09-30')
    await wrapper.get('#availableBy').setValue('2026-10-31')
    await wrapper.get('button[aria-label="Очистить дату: Действует с"]').trigger('click')
    expect(wrapper.get('#availableFrom').element.value).toBe('')
    expect(wrapper.get('#availableBy').element.value).toBe('2026-10-31')
    await wrapper.get('button[aria-label="Очистить дату: Действует по"]').trigger('click')
    expect(wrapper.get('#availableBy').element.value).toBe('')
    expect(vm().form.availableBy).toBe('')
  })
  it('adds a stepped interval by editing its shared boundary and sends the inclusive payload', async () => {
    await render(ServiceCatalogueEntryView, document.body)
    await wrapper.get('#priceMethod').setValue('400')
    expect(wrapper.get('#priceMethod option:checked').text()).toBe('Стоимость по диапазонам')
    expect(wrapper.find('#intervalCurrency').exists()).toBe(false)
    expect(wrapper.find('.band-table').exists()).toBe(true)
    expect(wrapper.get('.band-section .form-field > label').text()).toBe('Диапазоны и стоимость')
    expect(wrapper.get('.band-section .form-field > label').attributes('for')).toBe('bandAmount0')
    expect(wrapper.find('.band-section .staff-form-control > .table-card .interlaced-table').exists()).toBe(true)
    expect(wrapper.find('.band-help').exists()).toBe(false)
    expect(wrapper.findAll('.band-table thead th').map(header => header.text())).toEqual([
      '', 'Начало интервала', 'Конец интервала', 'Стоимость'
    ])
    expect(wrapper.find('.band-table tbody tr td:first-child button[aria-label="Удалить интервал"]').exists()).toBe(true)
    expect(wrapper.find('.band-table tbody tr:last-child .header-actions button[aria-label="Добавить интервал"]').exists()).toBe(true)
    expect(wrapper.find('.band-table tbody tr:last-child .fa-square-plus').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Изменить начало интервала"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Изменить конец интервала"]').exists()).toBe(false)
    expect(wrapper.find('input#bandAmount0').exists()).toBe(false)
    await vm().save()
    expect(wrapper.get('#bands-error').text()).toContain('Заполните стоимость')
    expect(document.activeElement).toBe(wrapper.get('#bandAmount0').element)
    await wrapper.get('button[aria-label="Изменить стоимость"]').trigger('click')
    await wrapper.get('#bandAmount0').setValue('2,50')
    expect(vm().form.bands[0].amount).toBe('')
    expect(wrapper.get('button[aria-label="Сохранить изменения"]').element.disabled).toBe(true)
    expect(wrapper.get('button[aria-label="Добавить интервал"]').element.disabled).toBe(true)
    await wrapper.get('.band-table tbody tr:first-child td:last-child button[aria-label="Применить"]').trigger('click')
    expect(vm().form.bands[0].amount).toBe('2,50')
    await wrapper.get('button[aria-label="Добавить интервал"]').trigger('click')
    expect(vm().form.bands).toHaveLength(2)
    expect(wrapper.get('.band-section .form-field > label').attributes('for')).toBe('bandBy0')
    expect(document.activeElement).toBe(wrapper.get('#bandBy0').element)
    expect(wrapper.get('button[aria-label="Добавить интервал"]').element.disabled).toBe(true)
    await wrapper.get('#bandBy0').trigger('keydown', { key:'Enter' })
    expect(wrapper.get('#bandBy0-edit-error').text()).toContain('неотрицательную сумму')
    expect(vm().form.bands).toHaveLength(2)
    await wrapper.get('#bandBy0').setValue('100')
    await wrapper.get('#bandBy0').trigger('keydown', { key:'Enter' })
    expect(vm().form.bands[1].from).toBe('100')
    expect(vm().form.bands[1].by).toBe('')
    expect(wrapper.find('button[aria-label="Изменить начало интервала"]').exists()).toBe(false)
    expect(wrapper.findAll('button[aria-label="Изменить конец интервала"]')).toHaveLength(1)
    await wrapper.findAll('button[aria-label="Изменить стоимость"]')[1].trigger('click')
    await wrapper.get('#bandAmount1').setValue('3')
    await wrapper.get('#bandAmount1').trigger('keydown', { key:'Enter' })
    const saved = { ...editableEntry, priceMethod:400, percentage:null, minimumAmount:null, maximumAmount:null,
      intervalCurrency:840, bands:[{ from:null, by:100, amount:2.5 }, { from:100, by:null, amount:3 }] }
    h.session.serviceCatalogueRequest.mockResolvedValueOnce(saved)
    await vm().save()
    expect(JSON.parse(h.session.serviceCatalogueRequest.mock.calls.at(-1)[1].body).bands).toEqual(saved.bands)
  })
  it('cancels a new interval, validates edits and relinks boundaries after deletion', async () => {
    await render(ServiceCatalogueEntryView, document.body)
    await wrapper.get('#priceMethod').setValue('400')
    await wrapper.get('button[aria-label="Добавить интервал"]').trigger('click')
    await wrapper.get('#bandBy0').trigger('keydown', { key:'Escape' })
    expect(vm().form.bands).toEqual([{ from:'', by:'', amount:'' }])
    await wrapper.get('button[aria-label="Добавить интервал"]').trigger('click')
    await wrapper.get('#bandBy0').setValue('100')
    await wrapper.get('#bandBy0').trigger('keydown', { key:'Enter' })
    await wrapper.get('button[aria-label="Добавить интервал"]').trigger('click')
    expect(document.activeElement).toBe(wrapper.get('#bandBy1').element)
    await wrapper.get('#bandBy1').setValue('200')
    await wrapper.get('#bandBy1').trigger('keydown', { key:'Enter' })
    await wrapper.get('button[aria-label="Изменить конец интервала"]').trigger('click')
    await wrapper.get('#bandBy0').setValue('250')
    await wrapper.get('#bandBy0').trigger('keydown', { key:'Enter' })
    expect(wrapper.get('#bandBy0-edit-error').text()).toContain('меньше конца следующего')
    expect(vm().form.bands[1].from).toBe('100')
    await wrapper.get('#bandBy0').setValue('120')
    await wrapper.get('#bandBy0').trigger('keydown', { key:'Enter' })
    expect(vm().form.bands[1].from).toBe('120')
    await wrapper.findAll('button[aria-label="Удалить интервал"]')[1].trigger('click')
    expect(vm().form.bands).toHaveLength(2)
    expect(vm().form.bands[1]).toMatchObject({ from:'120', by:'' })
    await wrapper.findAll('button[aria-label="Удалить интервал"]')[1].trigger('click')
    expect(vm().form.bands).toHaveLength(1)
    expect(vm().form.bands[0]).toMatchObject({ from:'', by:'' })
  })
  it('makes Auto amount read-only while allowing definition edits', async () => {
    await render(ServiceCatalogueEntryView)
    await wrapper.get('#priceMethod').setValue('400')
    await wrapper.get('button[aria-label="Добавить интервал"]').trigger('click')
    expect(vm().form.bands).toHaveLength(2)
    await wrapper.get('#priceMethod').setValue('300')
    expect(vm().form.bands).toHaveLength(1)
    await wrapper.get('#priceMethod').setValue('400')
    await wrapper.get('button[aria-label="Изменить стоимость"]').trigger('click')
    await wrapper.get('#bandAmount0').setValue('9')
    await wrapper.get('#priceMethod').setValue('300')
    expect(wrapper.get('button[aria-label="Сохранить изменения"]').element.disabled).toBe(false)
    expect(wrapper.find('#amount').exists()).toBe(false)
    expect(wrapper.text()).toContain('Ручное изменение импортированной суммы недоступно')
    expect(wrapper.find('#intervalCurrency').exists()).toBe(false)
  })
  it('renders dynamic method fields and saves comma money with the current version', async () => {
    await render(ServiceCatalogueEntryView, document.body)
    expect(wrapper.get('h1').text()).toBe('Тариф для услуги «Фото товара на складе в США»')
    expect(wrapper.find('#service').exists()).toBe(false)
    expect(wrapper.find('#percentage').exists()).toBe(true)
    expect(wrapper.find('#currency').exists()).toBe(false)
    await wrapper.get('#minimumAmount').setValue('10')
    await wrapper.get('#maximumAmount').setValue('20')
    await wrapper.get('#priceMethod').setValue('100')
    await wrapper.get('#priceMethod').trigger('change')
    await flushPromises()
    expect(wrapper.find('#percentage').exists()).toBe(false)
    expect(wrapper.find('#amount').exists()).toBe(true)
    expect(wrapper.find('#amount-hint').exists()).toBe(false)
    expect(wrapper.find('#currency').exists()).toBe(true)
    await wrapper.get('#amount').setValue('125,50')
    await wrapper.get('#currency').setValue('840')
    h.session.serviceCatalogueRequest.mockResolvedValueOnce({ ...copy(fixedEntry), id:4, service:500 })
    await vm().save()
    const [path, options] = h.session.serviceCatalogueRequest.mock.calls.find(([, request]) => request?.method === 'PUT')
    expect(path).toBe('/service-catalogue/4')
    expect(JSON.parse(options.body)).toMatchObject({ priceMethod:100, amount:125.5, currency:840, version:editableEntry.version })
    expect(h.push).toHaveBeenCalledWith('/service-catalogue')
  })

  it('creates manual tariffs, rejects EUR locally and focuses validation errors', async () => {
    h.route.params = {}
    h.route.fullPath = '/service-catalogue/new'
    h.session.serviceCatalogueRequest.mockImplementation(async path => path === '/service-catalogue' ? { items:[] } : copy(percentageEntry))
    await render(ServiceCatalogueEntryView, document.body)
    expect(wrapper.get('h1').text()).toBe('Новый тариф')
    expect(wrapper.find('#service').exists()).toBe(true)
    await vm().save()
    expect(document.activeElement).toBe(wrapper.get('#percentage').element)
    await wrapper.get('#priceMethod').setValue('200')
    await wrapper.get('#priceMethod').trigger('change')
    await wrapper.get('#service').setValue('200')
    await wrapper.get('#currency').setValue('978')
    await wrapper.get('#availableFrom').setValue('2026-03-01')
    await vm().save()
    expect(wrapper.get('#currency-error').text()).toContain('Выберите валюту')
    expect(h.session.serviceCatalogueRequest.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
    await wrapper.get('#currency').setValue('840')
    await wrapper.get('#availableFrom').setValue('')
    h.session.serviceCatalogueRequest.mockResolvedValueOnce({ ...fixedEntry, id:4, service:200, priceMethod:200, amount:null, currency:840, availableFrom:null })
    await vm().save()
    const [, options] = h.session.serviceCatalogueRequest.mock.calls.find(([, request]) => request?.method === 'POST')
    expect(JSON.parse(options.body)).toMatchObject({ service:200, priceMethod:200, amount:null, currency:840, availableFrom:null })
    expect(JSON.parse(options.body)).not.toHaveProperty('version')
  })

  it('preserves and locks drafts after authoritative conflicts and requires refresh to recover', async () => {
    await render(ServiceCatalogueEntryView)
    await wrapper.get('#percentage').setValue('15')
    h.session.serviceCatalogueRequest.mockRejectedValueOnce(new ProblemError({ type:SERVICE_CATALOGUE_CONFLICT, status:409, detail:'Обновите карточку' }))
    await vm().save()
    expect(vm().locked).toBe(true)
    expect(vm().form.percentage).toBe('15')
    expect(wrapper.find('.page-alert').exists()).toBe(true)
    const refresh = vm().refresh()
    expect(vm().confirmation).toBe(true)
    vm().finish(true)
    await refresh
    expect(vm().locked).toBe(false)
  })

  it('covers failed loading/navigation, method resets and completed refresh behavior', async () => {
    await render(ServiceCatalogueEntryView)
    vm().form.amount = '5'
    vm().form.priceMethod = 0
    vm().resetMethodFields()
    expect(vm().form.amount).toBe('')
    vm().form.priceMethod = 200
    vm().form.percentage = '5'; vm().form.minimumAmount = '1'; vm().form.maximumAmount = '2'; vm().form.amount = '3'
    vm().resetMethodFields()
    expect(vm().form).toMatchObject({ percentage:'', minimumAmount:'', maximumAmount:'', amount:'' })
    vm().busy = true; await vm().refresh(); vm().busy = false
    vm().committed = true; await vm().refresh(); expect(h.push).toHaveBeenCalledWith('/service-catalogue')
    h.push.mockRejectedValueOnce(createInternalProblem('invalidInput'))
    await vm().back(); expect(vm().problem).not.toBeNull()
    h.route.params.id = '2'
    await vi.waitFor(() => expect(vm().problem).not.toBeNull())
    h.session.getServiceCatalogueOps.mockRejectedValueOnce(createInternalProblem('serviceUnavailable'))
    await vm().load(); expect(vm().problem).not.toBeNull()
  })

  it('renders server field mappings and wires both discard dialog actions', async () => {
    await render(ServiceCatalogueEntryView)
    vm().problem = createInternalProblem('invalidInput', { errors:{ service:['Ошибка услуги'], priceMethod:['Ошибка способа'] } })
    await flushPromises()
    expect(wrapper.find('#service-error').exists()).toBe(false)
    expect(wrapper.get('.page-alert').text()).toContain('Ошибка услуги')
    expect(wrapper.get('#priceMethod-error').text()).toContain('Ошибка способа')
    await wrapper.get('#percentage').setValue('15')
    const cancelled = vm().refresh()
    await flushPromises()
    wrapper.findComponent(ConfirmDialog).vm.$emit('cancel')
    await cancelled
    expect(vm().dirty).toBe(true)
    const accepted = vm().refresh()
    await flushPromises()
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm')
    await accepted
    expect(vm().dirty).toBe(false)
  })

  it('blocks inclusive local overlap, supports read-only details and cancels discard', async () => {
    h.route.params = {}
    h.route.fullPath = '/service-catalogue/new'
    await render(ServiceCatalogueEntryView)
    await wrapper.get('#availableFrom').setValue('2026-01-31')
    await wrapper.get('#availableBy').setValue('2026-02-01')
    expect(vm().overlapErrors).toHaveProperty('availableFrom')
    await vm().save()
    expect(h.session.serviceCatalogueRequest.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
    const refresh = vm().refresh()
    vm().finish(false)
    await refresh
    expect(vm().form.availableFrom).toBe('2026-01-31')
    wrapper.unmount()

    h.route.params = { id:'1' }
    h.route.fullPath = '/service-catalogue/1'
    h.session.user.value = { id:2, roles:['operator'] }
    h.session.getServiceCatalogueOps.mockResolvedValue({ ...serviceCatalogueOps, actions:{ view:true, create:false, edit:false, delete:false, audit:true } })
    h.session.serviceCatalogueRequest.mockImplementation(async path => path === '/service-catalogue'
      ? { items:copy(serviceCatalogueEntries) } : copy(percentageEntry))
    await render(ServiceCatalogueEntryView)
    expect(wrapper.find('button[aria-label="Сохранить изменения"]').exists()).toBe(false)
    expect(wrapper.get('h1').text()).toBe('Тариф для услуги «Товар»')
    expect(wrapper.find('#service').exists()).toBe(false)
    await vm().refresh()
    expect(vm().problem).toBeNull()
  })

  it('keeps the seeded Product entry read-only even for an administrator', async () => {
    h.route.params = { id:'1' }
    h.route.fullPath = '/service-catalogue/1'
    h.session.serviceCatalogueRequest.mockImplementation(async path => path === '/service-catalogue'
      ? { items:copy(serviceCatalogueEntries) } : copy(percentageEntry))
    await render(ServiceCatalogueEntryView)
    expect(wrapper.find('button[aria-label="Сохранить изменения"]').exists()).toBe(false)
    expect(wrapper.get('#priceMethod').attributes('disabled')).toBeDefined()
    expect(vm().editable).toBe(false)
  })
})

describe('service catalogue audit', () => {
  it('renders typed before/after snapshots and persists every server-table control', async () => {
    await render(ServiceCatalogueAuditView)
    expect(wrapper.text()).toContain('Журнал тарифов')
    expect(wrapper.text()).toContain('Иванов Иван')
    expect(wrapper.text()).toContain('1,25$')
    expect(wrapper.text()).toContain('—')
    expect(wrapper.findAll('th').map(cell => cell.text())).toContain('Было')
    await wrapper.get('button[aria-label="Вернуться к тарифам"]').trigger('click')
    expect(h.push).toHaveBeenCalledWith('/service-catalogue')
    vm().onPageChange(2); await flushPromises()
    vm().onPageSizeChange(50); await flushPromises()
    vm().onSortChange([{ key:'service', order:'asc' }]); await flushPromises()
    vm().onServiceChange(0); await flushPromises()
    vm().onActionChange(100); await flushPromises()
    vi.useFakeTimers()
    vm().onSearchInput('Иванов')
    await vi.advanceTimersByTimeAsync(300); await flushPromises()
    expect(JSON.parse(globalThis.localStorage.getItem('sarafan.backoffice.view-state.v1.1.service-catalogue-audit')))
      .toMatchObject({ page:1, pageSize:50, sortBy:[{ key:'service', order:'asc' }], filters:{ search:'Иванов', service:0, action:100 } })
  })

  it('corrects page underflow, rejects malformed envelopes and ignores stale results', async () => {
    globalThis.localStorage.setItem('sarafan.backoffice.view-state.v1.1.service-catalogue-audit', JSON.stringify({
      version:1, page:3, pageSize:25, sortBy:[{ key:'timestamp', order:'desc' }], filters:{ search:'', service:null, action:null }
    }))
    h.session.serviceCatalogueRequest.mockImplementation(async path => {
      const query = new globalThis.URL(path, 'https://test').searchParams
      const current = Number(query.get('page'))
      return copy(auditPage({ items:current === 1 ? auditPage().items : [], pagination:{ currentPage:current, pageSize:25, totalCount:3, totalPages:1, hasNextPage:false, hasPreviousPage:current > 1 } }))
    })
    await render(ServiceCatalogueAuditView)
    expect(vm().page).toBe(1)
    h.session.serviceCatalogueRequest.mockResolvedValueOnce({ items:[] })
    await vm().load()
    expect(wrapper.find('.page-alert').exists()).toBe(true)
    const deferred = pending()
    h.session.serviceCatalogueRequest.mockReturnValueOnce(deferred.promise).mockResolvedValueOnce(copy(auditPage()))
    const first = vm().load()
    const second = vm().load()
    deferred.resolve(copy(auditPage()))
    await Promise.all([first, second])
    expect(vm().rows).toHaveLength(3)
  })

  it('ignores invalid table events, sanitizes stale persisted filters and cancels debounce on unmount', async () => {
    globalThis.localStorage.setItem('sarafan.backoffice.view-state.v1.1.service-catalogue-audit', JSON.stringify({
      version:1, page:1, pageSize:25, sortBy:[{ key:'timestamp', order:'desc' }], filters:{ search:'', service:999, action:999 }
    }))
    await render(ServiceCatalogueAuditView)
    expect(vm().service).toBeNull()
    expect(vm().action).toBeNull()
    const calls = h.session.serviceCatalogueRequest.mock.calls.length
    for (const value of [null, 0, 1]) vm().onPageChange(value)
    vm().onPageSizeChange(12)
    vm().onSortChange(null)
    vm().onSortChange([{ key:'bad', order:'asc' }])
    vm().onServiceChange(999)
    vm().onActionChange(999)
    await flushPromises()
    expect(h.session.serviceCatalogueRequest.mock.calls.length).toBeGreaterThan(calls)
    vi.useFakeTimers()
    vm().onSearchInput('later')
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(300)
  })
})
