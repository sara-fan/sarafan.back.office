// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref, defineComponent } from 'vue'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import PreviewView from '../src/views/LogibooksRegisterPreviewView.vue'
import RegisterView from '../src/views/LogibooksRegisterView.vue'
import RegistersView from '../src/views/LogibooksRegistersView.vue'
import ReconcileDialog from '../src/components/LogibooksReconcileDialog.vue'
import GoodsTable from '../src/components/LogibooksGoodsTable.vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
import ListFilterBar from '../src/components/ListFilterBar.vue'

import { useStaffRequest } from '../src/useStaffRequest.js'
import { createInternalProblem, ProblemError } from '../src/errors/problem.js'
import { ops, operation, row, command, preview, page, id, attemptId } from './fixtures/logibooks.js'
import { pending } from './fixtures/stores.js'
const h = vi.hoisted(() => ({ session:{}, route:null, push:vi.fn(), replace:vi.fn(), leave:null }))
vi.mock('../src/stores/session.js', () => ({ useSession:() => h.session }))
vi.mock('vue-router', async original => ({ ...await original(), useRoute:() => h.route, useRouter:() => ({ push:h.push, replace:h.replace }),
  onBeforeRouteLeave:fn => { h.leave = fn }, onBeforeRouteUpdate:() => {} }))
let wrapper, current, resultRows
const copy = value => globalThis.structuredClone(value)
const vm = () => wrapper.vm.$.setupState
async function render(component = PreviewView, props = {}) {
  wrapper = mount(component, { props:{ ...(component === ReconcileDialog ? { ops:copy(ops) } : {}), ...props }, attachTo:document.body, global:{ plugins:[createSarafanVuetify()] } }); await flushPromises()
}
beforeEach(() => {
  globalThis.localStorage.clear()
  current = copy(operation); resultRows = [copy(row)]
  h.route = reactive({ params:{ id }, query:{ operationId:id }, fullPath:'/logibooks-registers/new?operationId=' + id })
  h.session.user = ref({ id:1, roles:['administrator'] }); h.session.viewStateMemory = new Map()
  h.session.logibooksDraft = ref(copy(command))
  h.session.logibooksRequest = vi.fn(async (path, options) => {
    if (path.endsWith('/ops')) return copy(ops)
    if (path.endsWith('/preview')) return { ...copy(preview), fileName:JSON.parse(options.body).fileName || preview.fileName,
      register:{ ...preview.register, ...JSON.parse(options.body).register, fileName:JSON.parse(options.body).fileName || preview.fileName } }
    if (path.endsWith('/details')) return copy(preview.register)
    if (path.includes('/rows?')) return page(copy(resultRows), path)
    if (path.startsWith('/logibooks-registers?')) return page([copy(current)], path, 'createdAt')
    return copy(current)
  })
  h.push.mockReset().mockResolvedValue(); h.replace.mockReset().mockResolvedValue()
})
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.restoreAllMocks(); vi.useRealTimers() })

describe('shared staff request ownership', () => {
  it('ignores stale successes and failures and resets for a changed identity', async () => {
    await render(defineComponent({ setup:() => useStaffRequest(h.session, () => h.push()), template:'<div />' }))
    const task = vm(), first = pending(), apply = vi.fn()
    const work = task.run(() => first.promise, apply); task.invalidate()
    first.resolve('stale'); await work; expect(apply).not.toHaveBeenCalled()
    const second = pending(), failed = task.run(() => second.promise, apply)
    h.session.user.value = { id:2, roles:['operator'] }; second.reject(new Error('private'))
    await failed; expect(task.problem).toBeNull(); expect(h.push).toHaveBeenCalled()
    await task.run(() => Promise.reject(new Error('private')))
    expect(task.problem).toBeTruthy()
    const third = pending(), late = task.run(() => third.promise, apply); wrapper.unmount(); wrapper = null
    third.resolve('late'); await late; expect(apply).not.toHaveBeenCalled()
  })
})

describe('register preview and admission', () => {
  it('uses dedicated preview, demo defaults, pagination and the frozen command', async () => {
    await render(); expect(wrapper.text()).not.toContain('Демо:'); expect(vm().dirty).toBe(true)
    vm().paging('pageSize', 10); vm().paging('page', 2); vm().paging('page', 0); vm().paging('pageSize', 11)
    expect(vm().page).toBe(2); expect(vm().pageSize).toBe(10)
    vm().paging('page', 1)
    await vm().send()
    const [, options] = h.session.logibooksRequest.mock.calls.find(([path, options]) => path === '/logibooks-registers' && options)
    expect(JSON.parse(options.body)).toEqual({ ...command, fileName:preview.fileName, fingerprint:preview.fingerprint, mappingVersion:1 })
    expect(h.replace).toHaveBeenCalledWith('/logibooks-registers/' + id); expect(vm().committed).toBe(true)
    const calls = h.session.logibooksRequest.mock.calls.length; await vm().send()
    expect(h.session.logibooksRequest).toHaveBeenCalledTimes(calls)
  })
  it('creates directly after metadata edits using the refreshed fingerprint and complete normalized command', async () => {
    await render(); vm().changeField('dealNumber', ' New ')
    expect(vm().preview).toBeTruthy(); expect(vm().previewCurrent).toBe(false); expect(vm().dirty).toBe(true)
    await flushPromises()
    const create = wrapper.get('button[aria-label="Создать таможенный реестр"]')
    expect(create.element.disabled).toBe(false)
    expect(wrapper.text()).not.toContain('Обновите предварительный просмотр')
    const request = h.session.logibooksRequest.getMockImplementation()
    h.session.logibooksRequest.mockImplementation(async (path, options) => {
      const value = await request(path, options)
      return path.endsWith('/preview') ? { ...value, fingerprint:'B'.repeat(64) } : value
    })
    h.session.logibooksRequest.mockClear()
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(h.session.logibooksRequest.mock.calls.map(([path]) => path)).toEqual([
      '/logibooks-registers/ops', '/logibooks-registers/preview', '/logibooks-registers'
    ])
    const body = JSON.parse(h.session.logibooksRequest.mock.calls.at(-1)[1].body)
    expect(body).toEqual({ ...command, fileName:preview.fileName, mappingVersion:1, fingerprint:'B'.repeat(64), register:{ dealNumber:'New' } })
    expect(vm().preview.register.dealNumber).toBe('New')
    expect(vm().preview.fileName).toBe(preview.fileName)
    expect(vm().problem).toBeNull(); expect(h.replace).toHaveBeenCalledWith('/logibooks-registers/' + id)
  })
  it.each(['/ops', '/preview'])('preserves edits and retries Create after failed automatic preparation at %s', async suffix => {
    await render(); vm().changeField('invoiceNumber', ' Invoice 9 ')
    const request = h.session.logibooksRequest.getMockImplementation()
    let fail = true
    h.session.logibooksRequest.mockImplementation((path, options) => {
      if (fail && path.endsWith(suffix)) { fail = false; return Promise.reject(new Error('private preparation failure')) }
      return request(path, options)
    })
    await vm().send()
    expect(vm().command).toBeNull(); expect(h.session.logibooksDraft.value.command).toBeUndefined()
    expect(vm().registerFields.invoiceNumber).toBe(' Invoice 9 '); expect(vm().preview.parcels).toHaveLength(1)
    expect(vm().pageProblem).toBeTruthy(); expect(wrapper.text()).not.toContain('private preparation failure')
    expect(h.session.logibooksRequest.mock.calls.some(([path]) => path === '/logibooks-registers')).toBe(false)
    await vm().send()
    expect(vm().command.register).toEqual({ invoiceNumber:'Invoice 9' })
    expect(h.replace).toHaveBeenCalledWith('/logibooks-registers/' + id)
  })
  it.each(['route', 'identity', 'disposal'])('never submits after automatic preparation loses its %s owner', async owner => {
    await render(); vm().changeField('dealNumber', 'Deal')
    const request = h.session.logibooksRequest.getMockImplementation(), hold = pending(), state = vm()
    h.session.logibooksRequest.mockImplementation((path, options) => path.endsWith('/preview') ? hold.promise : request(path, options))
    const work = state.send(); await flushPromises()
    expect(state.busy).toBe(true)
    const calls = h.session.logibooksRequest.mock.calls.length
    await state.send(); state.changeField('dealNumber', 'ignored')
    expect(h.session.logibooksRequest).toHaveBeenCalledTimes(calls); expect(state.registerFields.dealNumber).toBe('Deal')
    if (owner === 'route') { h.route.query.operationId = 'bad'; await flushPromises() }
    else if (owner === 'identity') h.session.user.value = null
    else { wrapper.unmount(); wrapper = null }
    hold.resolve({ ...copy(preview), register:{ ...preview.register, dealNumber:'Deal' } }); await work
    expect(h.session.logibooksRequest.mock.calls.some(([path]) => path === '/logibooks-registers')).toBe(false)
    expect(h.replace).not.toHaveBeenCalled()
  })
  it('keeps creation unavailable when current Ops disables the integration', async () => {
    const request = h.session.logibooksRequest.getMockImplementation()
    h.session.logibooksRequest.mockImplementation((path, options) => path.endsWith('/ops') ? { ...copy(ops), enabled:false } : request(path, options))
    await render()
    expect(wrapper.get('button[aria-label="Создать таможенный реестр"]').element.disabled).toBe(true)
    await vm().send()
    expect(vm().command).toBeNull(); expect(vm().pageProblem).toBeTruthy()
    expect(wrapper.text()).toContain('Создание таможенного реестра недоступно.')
    expect(h.session.logibooksRequest.mock.calls.some(([path]) => path === '/logibooks-registers')).toBe(false)
  })
  it.each([
    ['administrator', false], ['shift-manager', false], ['operator', true], ['senior-operator', true]
  ])('blocks preview and creation for role %s with canManage=%s', async (role, canManage) => {
    h.session.user.value = { id:1, roles:[role] }
    const request = h.session.logibooksRequest.getMockImplementation()
    h.session.logibooksRequest.mockImplementation((path, options) => path.endsWith('/ops') ? { ...copy(ops), canManage } : request(path, options))
    await render()
    expect(wrapper.get('button[aria-label="Создать таможенный реестр"]').element.disabled).toBe(true)
    expect(wrapper.get('input[name="register.dealNumber"]').element.disabled).toBe(true)
    vm().changeField('dealNumber', 'ignored'); await vm().send()
    expect(vm().registerFields.dealNumber).toBeUndefined()
    expect(vm().command).toBeNull(); expect(vm().pageProblem).toBeTruthy()
    expect(h.session.logibooksRequest.mock.calls.some(([path]) => path.endsWith('/preview') || path === '/logibooks-registers')).toBe(false)
  })
  it('retains visible parcels and edits when refreshed Ops withdraws management capability', async () => {
    await render(); vm().changeField('invoiceNumber', 'Draft invoice')
    const request = h.session.logibooksRequest.getMockImplementation()
    h.session.logibooksRequest.mockImplementation((path, options) => path.endsWith('/ops') ? { ...copy(ops), canManage:false } : request(path, options))
    h.session.logibooksRequest.mockClear()
    await vm().send()
    expect(h.session.logibooksRequest.mock.calls.map(([path]) => path)).toEqual(['/logibooks-registers/ops'])
    expect(vm().registerFields.invoiceNumber).toBe('Draft invoice'); expect(vm().preview.parcels).toHaveLength(1)
    expect(vm().command).toBeNull(); expect(vm().previewCurrent).toBe(false)
    expect(wrapper.get('button[aria-label="Создать таможенный реестр"]').element.disabled).toBe(true)
  })
  it('does not freeze a current preview if its management capability is withdrawn', async () => {
    await render(); vm().ops = { ...ops, canManage:false }; await flushPromises()
    h.session.logibooksRequest.mockClear()
    await vm().send()
    expect(h.session.logibooksRequest).not.toHaveBeenCalled()
    expect(vm().command).toBeNull(); expect(vm().pageProblem).toBeTruthy()
  })
  it.each(['denied', 'unavailable'])('preserves a recovered frozen command when capability lookup is %s', async outcome => {
    const frozen = { ...command, fileName:preview.fileName, mappingVersion:1, fingerprint:preview.fingerprint }
    h.session.logibooksDraft.value.command = copy(frozen)
    h.session.logibooksRequest.mockRejectedValueOnce(new Error('lookup unavailable'))
    await render()
    const request = h.session.logibooksRequest.getMockImplementation()
    let blocked = true
    h.session.logibooksRequest.mockImplementation((path, options) => {
      if (path.endsWith('/ops') && blocked) return outcome === 'denied'
        ? { ...copy(ops), canManage:false } : Promise.reject(new Error('private capability failure'))
      return request(path, options)
    })
    h.session.logibooksRequest.mockClear()
    await vm().send()
    expect(h.session.logibooksRequest.mock.calls.map(([path]) => path)).toEqual(['/logibooks-registers/ops'])
    expect(vm().command).toEqual(frozen); expect(h.session.logibooksDraft.value.command).toEqual(frozen)
    expect(vm().pageProblem).toBeTruthy()
    if (outcome === 'denied') {
      expect(wrapper.get('button[aria-label="Создать таможенный реестр"]').element.disabled).toBe(true)
      blocked = false; h.session.logibooksRequest.mockClear()
      h.session.logibooksRequest.mockImplementation((path, options) => path === '/logibooks-registers/' + id
        ? Promise.reject(new Error('operation not admitted')) : request(path, options))
      await vm().refresh()
      expect(h.session.logibooksRequest.mock.calls.map(([path]) => path)).toEqual(['/logibooks-registers/ops', '/logibooks-registers/' + id])
      expect(wrapper.get('button[aria-label="Создать таможенный реестр"]').element.disabled).toBe(false)
      expect(vm().command).toEqual(frozen)
    } else blocked = false
    await vm().send()
    expect(h.session.logibooksRequest.mock.calls.at(-1)[1].body).toBe(JSON.stringify(frozen))
    expect(h.session.logibooksRequest.mock.calls.some(([path]) => path.endsWith('/preview'))).toBe(false)
  })
  it('recovers an already admitted operation during Create preparation without submitting again', async () => {
    await render(); vm().changeField('dealNumber', 'Draft')
    h.session.logibooksDraft.value = null; h.session.logibooksRequest.mockClear()
    await vm().send()
    expect(h.session.logibooksRequest.mock.calls.map(([path]) => path)).toEqual(['/logibooks-registers/' + id])
    expect(h.replace).toHaveBeenCalledWith('/logibooks-registers/' + id)
    expect(vm().command).toBeNull()
  })
  it('retains an identical automatically prepared command after a lost response and navigation failure', async () => {
    await render(); vm().changeField('dealNumber', 'Deal')
    const request = h.session.logibooksRequest.getMockImplementation()
    let fail = true
    h.session.logibooksRequest.mockImplementation((path, options) => {
      if (fail && path === '/logibooks-registers') { fail = false; return Promise.reject(new Error('lost response')) }
      return request(path, options)
    })
    await vm().send(); const original = JSON.stringify(vm().command); expect(vm().committed).toBe(false)
    expect(vm().command.register).toEqual({ dealNumber:'Deal' })
    const previews = h.session.logibooksRequest.mock.calls.filter(([path]) => path.endsWith('/preview')).length
    h.replace.mockRejectedValueOnce(new Error('private navigation data'))
    await vm().send(); expect(JSON.stringify(vm().command)).toBe(original); expect(vm().committed).toBe(true)
    expect(h.session.logibooksRequest.mock.calls.filter(([path]) => path.endsWith('/preview'))).toHaveLength(previews)
    expect(wrapper.text()).not.toContain('private navigation data')
    const posts = h.session.logibooksRequest.mock.calls.filter(([path, options]) => path === '/logibooks-registers' && options)
    expect(posts).toHaveLength(2); expect(posts[0][1].body).toBe(posts[1][1].body)
  })
  it('recovers an admitted operation by UUID after refresh or browser reload', async () => {
    h.session.logibooksDraft.value = null; await render()
    expect(h.session.logibooksRequest).toHaveBeenCalledWith('/logibooks-registers/' + id)
    expect(h.replace).toHaveBeenCalledWith('/logibooks-registers/' + id)
    expect(vm().dirty).toBe(false)
  })
  it('looks up UUID after frozen admission and never makes another preview', async () => {
    await render(); h.session.logibooksRequest.mockRejectedValueOnce(new Error('lost')); await vm().send()
    const before = h.session.logibooksRequest.mock.calls.filter(([path]) => path.endsWith('/preview')).length
    await vm().refresh(); expect(h.replace).toHaveBeenCalled()
    expect(h.session.logibooksRequest.mock.calls.filter(([path]) => path.endsWith('/preview'))).toHaveLength(before)
  })
  it('stops frozen recovery if capability refresh fails or loses identity ownership', async () => {
    await render(); h.session.logibooksRequest.mockRejectedValueOnce(new Error('lost response')); await vm().send()
    const frozen = JSON.stringify(vm().command)
    h.session.logibooksRequest.mockClear(); h.session.logibooksRequest.mockRejectedValueOnce(new Error('capability unavailable'))
    await vm().refresh()
    expect(h.session.logibooksRequest.mock.calls.map(([path]) => path)).toEqual(['/logibooks-registers/ops'])
    expect(JSON.stringify(vm().command)).toBe(frozen); expect(vm().pageProblem).toBeTruthy()
    const hold = pending()
    h.session.logibooksRequest.mockClear(); h.session.logibooksRequest.mockReturnValueOnce(hold.promise)
    const refresh = vm().refresh(); await flushPromises()
    h.session.user.value = null; hold.resolve(copy(ops)); await refresh
    expect(h.session.logibooksRequest.mock.calls.map(([path]) => path)).toEqual(['/logibooks-registers/ops'])
  })
  it.each([true, false])('retains an uncertain frozen admission across remount (admitted=%s)', async admitted => {
    await render(); h.session.logibooksRequest.mockRejectedValueOnce(new Error('lost response')); await vm().send()
    const original = JSON.stringify(vm().command)
    const cancel = vm().cancel(); await flushPromises(); wrapper.findComponent(ConfirmDialog).vm.$emit('confirm'); await cancel
    wrapper.unmount(); wrapper = null; h.replace.mockClear(); h.session.logibooksRequest.mockClear()
    if (!admitted) h.session.logibooksRequest.mockRejectedValueOnce(new ProblemError({ type:'https://sarafan.sw.consulting/problems/logibooks-not-found', status:404 }))
    await render()
    expect(h.session.logibooksRequest.mock.calls.map(([path]) => path)).toEqual(['/logibooks-registers/' + id])
    expect(JSON.stringify(vm().command)).toBe(original); expect(vm().fileName).toBe(preview.fileName)
    if (admitted) expect(h.replace).toHaveBeenCalledWith('/logibooks-registers/' + id)
    else {
      expect(h.replace).not.toHaveBeenCalled()
      const request = h.session.logibooksRequest.getMockImplementation()
      h.session.logibooksRequest.mockImplementation((path, options) => path.endsWith('/ops') ? { ...copy(ops), enabled:false } : request(path, options))
      await vm().send()
      expect(h.session.logibooksRequest.mock.calls.some(([path]) => path.endsWith('/preview'))).toBe(false)
      expect(h.session.logibooksRequest.mock.calls.at(-1)[1].body).toBe(original)
      expect(h.replace).toHaveBeenCalledWith('/logibooks-registers/' + id)
    }
  })
  it('validates operation UUID and ignores route-obsolete replies', async () => {
    h.route.query.operationId = 'bad'; await render(); expect(vm().problem).toBeTruthy()
    h.route.query.operationId = id; await flushPromises(); expect(vm().preview).toBeTruthy()
    const hold = pending(); h.session.logibooksRequest.mockReturnValueOnce(hold.promise)
    const work = vm().load(); h.route.query.operationId = 'bad'; await flushPromises()
    hold.resolve(copy(ops)); await work; expect(vm().preview).toBeNull()
  })
  it('confirms dirty cancellation and preserves drafts if cancellation is declined', async () => {
    await render()
    const cancel = vm().cancel(); await flushPromises(); expect(vm().confirmation).toBe(true)
    wrapper.findComponent(ConfirmDialog).vm.$emit('cancel'); await cancel; expect(h.push).not.toHaveBeenCalled()
    const discard = vm().cancel(); await flushPromises(); wrapper.findComponent(ConfirmDialog).vm.$emit('confirm'); await discard
    expect(h.push).toHaveBeenCalledWith('/orders')
  })
})

describe('register operation history', () => {
  it('loads shared list, debounces literal search, persists paging and sorting, and opens details', async () => {
    await render(RegistersView); expect(vm().rows).toHaveLength(1)
    vi.useFakeTimers()
    vm().filter('search', 'Sarafan'); expect(vm().state.page).toBe(1)
    await vi.advanceTimersByTimeAsync(300); await flushPromises()
    expect(h.session.logibooksRequest.mock.calls.at(-1)[0]).toContain('search=Sarafan')
    vm().filter('state', 'Submitting'); await flushPromises()
    vm().paging('pageSize', 10); await flushPromises(); vm().paging('page', 2); await flushPromises()
    vm().sort([{ key:'fileName', order:'asc' }]); await flushPromises()
    expect(vm().state.sortBy).toEqual([{ key:'fileName', order:'asc' }])
    for (const args of [['page', 0], ['pageSize', 11]]) vm().paging(...args)
    vm().sort([]); vm().sort([{ key:'other', order:'bad' }])
    await vm().open(operation); expect(h.push).toHaveBeenCalledWith('/logibooks-registers/' + id)
    expect(globalThis.localStorage.length).toBe(1)
  })
  it('retains read failures in page ownership and preferences failure is recoverable', async () => {
    vi.spyOn(globalThis.Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage') })
    vi.spyOn(globalThis.Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage') })
    await render(RegistersView); expect(vm().preferenceProblem).toBeTruthy()
    vm().filter('state', 'Submitting'); await flushPromises(); expect(h.session.viewStateMemory.size).toBe(1)
    h.session.logibooksRequest.mockRejectedValueOnce(new Error('private'))
    await vm().load(); expect(vm().problem).toBeTruthy(); expect(vm().rows).toHaveLength(1); expect(wrapper.text()).not.toContain('private')
  })
})

describe('register results', () => {
  it.each(['operation', 'rows'])('prioritizes current %s failures, then retained failure over blocked-storage notices', async source => {
    vi.useFakeTimers()
    vi.spyOn(globalThis.Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage') })
    vi.spyOn(globalThis.Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage') })
    const failure = { type:'https://sarafan.sw.consulting/problems/logibooks-unknown', code:'logibooks_unknown', status:502,
      title:'Результат неизвестен', detail:'Проверьте результат в таможенном реестре.', instance:'/test' }
    current = { ...current, state:'Unknown', phase:'Dispatching', attemptId, failure }
    await render(RegisterView)
    const retained = vm().operation.failure, notice = vm().preferenceProblem
    expect(notice).toBeTruthy()
    expect(vm().canReconcile).toBe(true)
    expect(vm().rows).toHaveLength(1)
    expect(vm().visibleProblem).toBe(retained)
    expect(wrapper.get('[role="alert"]').text()).toContain(failure.detail)
    expect(wrapper.get('[role="alert"]').text()).not.toContain(notice.detail)

    h.session.logibooksRequest.mockRejectedValueOnce(new Error('private read failure'))
    const refresh = source === 'operation' ? () => vm().load() : () => vm().loadRows()
    await refresh()
    const readProblem = source === 'operation' ? vm().problem : vm().rowTask.problem.value
    expect(readProblem).toBeTruthy()
    expect(vm().visibleProblem).toBe(readProblem)
    expect(wrapper.get('[role="alert"]').text()).not.toContain('private read failure')
    await refresh()
    expect(vm().visibleProblem).toBe(retained)
    expect(wrapper.get('[role="alert"]').text()).toContain(failure.detail)

    current = { ...current, version:attemptId, failure:null }
    await vm().load()
    expect(vm().visibleProblem).toBe(notice)
    expect(wrapper.get('[role="alert"]').text()).toContain(notice.detail)
  })
  it.each([['administrator', false], ['operator', true]])('keeps reconciliation unavailable for role %s with canManage=%s', async (role, canManage) => {
    h.session.user.value = { id:1, roles:[role] }; current = { ...current, state:'Unknown', phase:'Dispatching', attemptId }
    const request = h.session.logibooksRequest.getMockImplementation()
    h.session.logibooksRequest.mockImplementation((path, options) => path.endsWith('/ops') ? { ...copy(ops), canManage } : request(path, options))
    await render(RegisterView)
    expect(vm().canReconcile).toBe(false)
    expect(wrapper.find('button[aria-label="Сверить результат"]').exists()).toBe(false)
    vm().reconcile(row); expect(vm().reconciling).toBeNull()
  })
  it('rejects an Unknown response without attempt evidence before exposing reconciliation', async () => {
    current = { ...current, state:'Unknown', phase:'Dispatching', attemptId:null }
    await render(RegisterView)
    expect(vm().operation).toBeNull(); expect(vm().problem).toBeTruthy(); expect(vm().canReconcile).toBe(false)
    expect(wrapper.find('button[aria-label="Сверить результат"]').exists()).toBe(false)
    expect(h.session.logibooksRequest.mock.calls.some(([path]) => path.endsWith('/details') || path.includes('/rows?'))).toBe(false)
  })
  it('allows reconciliation while dispatch is disabled', async () => {
    current = { ...current, state:'Unknown', phase:'Dispatching', attemptId }
    const request = h.session.logibooksRequest.getMockImplementation()
    h.session.logibooksRequest.mockImplementation((path, options) => path.endsWith('/ops') ? { ...copy(ops), enabled:false } : request(path, options))
    await render(RegisterView)
    expect(vm().canReconcile).toBe(true)
    vm().reconcile(row); await flushPromises()
    const dialog = wrapper.findComponent(ReconcileDialog)
    expect(dialog.props('ops').enabled).toBe(false); expect(dialog.findComponent(ConfirmDialog).props('actionDisabled')).toBe(false)
  })
  it('polls metadata only until version changes and stops after a final result', async () => {
    vi.useFakeTimers(); await render(RegisterView)
    expect(vm().rows).toHaveLength(1)
    const rowReads = () => h.session.logibooksRequest.mock.calls.filter(([path]) => path.includes('/rows?')).length
    const original = vm().operation
    expect(rowReads()).toBe(1); await vi.advanceTimersByTimeAsync(2000); await flushPromises(); expect(rowReads()).toBe(1)
    expect(vm().operation).toBe(original)
    current = { ...current, state:'Succeeded', phase:'Applied', version:attemptId, created:1, unresolved:0, registerId:10 }
    resultRows = [{ ...row, outcome:'Created', parcelId:101, statusId:7, checkStatus:0 }]
    await vi.advanceTimersByTimeAsync(2000); await flushPromises(); expect(rowReads()).toBe(2)
    const count = h.session.logibooksRequest.mock.calls.length; await vi.advanceTimersByTimeAsync(4000)
    expect(h.session.logibooksRequest).toHaveBeenCalledTimes(count)
  })
  it.each(['Submitting', 'Succeeded'])('retries failed updated rows for %s through polling or header refresh', async state => {
    vi.useFakeTimers(); await render(RegisterView)
    current = { ...current, state, phase:state === 'Succeeded' ? 'Applied' : 'ReceiptRetained', version:attemptId,
      created:state === 'Succeeded' ? 1 : 0, unresolved:state === 'Succeeded' ? 0 : 1, registerId:10 }
    resultRows = [{ ...row, outcome:'Created', parcelId:101, statusId:7, checkStatus:0 }]
    const request = h.session.logibooksRequest.getMockImplementation()
    let failRows = true
    h.session.logibooksRequest.mockImplementation(async (...args) => {
      if (failRows && args[0].includes('/rows?')) { failRows = false; throw new Error('temporary row read failure') }
      return request(...args)
    })
    await vi.advanceTimersByTimeAsync(2000); await flushPromises()
    expect(vm().operation.version).toBe(attemptId); expect(vm().rows[0].outcome).toBe('Unresolved')
    expect(vm().rowsLoaded).toBe(false); expect(vm().rowTask.problem.value).toBeTruthy()
    if (state === 'Succeeded') {
      wrapper.findAllComponents({ name:'ActionButton' }).find(button => button.props('tooltipText') === 'Обновить реестр').vm.$emit('click')
      await flushPromises()
    } else { await vi.advanceTimersByTimeAsync(2000); await flushPromises() }
    expect(vm().rows[0].outcome).toBe('Created'); expect(vm().rows[0].parcelId).toBe(101)
    expect(vm().rowsLoaded).toBe(true); expect(vm().rowTask.problem.value).toBeNull()
  })
  it('searches all server rows, reloads paging and halts poll while reconciling', async () => {
    vi.useFakeTimers(); current = { ...current, state:'Unknown', phase:'Dispatching', attemptId }
    await render(RegisterView); expect(vm().canReconcile).toBe(true)
    resultRows = [{ ...row, rowNumber:50 }]; vm().search('Товар'); await vi.advanceTimersByTimeAsync(300); await flushPromises()
    expect(h.session.logibooksRequest.mock.calls.at(-1)[0]).toContain('search=%D0%A2%D0%BE%D0%B2%D0%B0%D1%80')
    expect(vm().rows[0].rowNumber).toBe(50)
    vm().paging('pageSize', 10); await flushPromises(); vm().paging('page', 2); await flushPromises()
    vm().paging('page', 0); vm().paging('pageSize', 11)
    vm().reconcile(row); expect(vm().reconciling).toEqual(row)
    const count = h.session.logibooksRequest.mock.calls.length; await vi.advanceTimersByTimeAsync(4000); expect(h.session.logibooksRequest).toHaveBeenCalledTimes(count)
    await vm().close(); await flushPromises(); expect(vm().reconciling).toBeNull()
    h.route.params.id = attemptId; await flushPromises(); expect(vm().operation).toBeNull()
  })
  it('retains operation on a temporary read failure, ignores logout and post-unmount replies', async () => {
    vi.useFakeTimers(); await render(RegisterView)
    h.session.logibooksRequest.mockRejectedValueOnce(new Error('private'))
    await vm().load(); expect(vm().problem).toBeTruthy(); expect(vm().operation).toBeTruthy()
    await vi.advanceTimersByTimeAsync(2000); await flushPromises(); expect(vm().problem).toBeNull()
    const hold = pending(); h.session.logibooksRequest.mockReturnValueOnce(hold.promise)
    const work = vm().load(); wrapper.unmount(); wrapper = null; hold.resolve(copy(current)); await work
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('manual reconciliation', () => {
  const unknown = () => ({ ...operation, state:'Unknown', phase:'Dispatching', attemptId })
  it.each([null, undefined, 'bad'])('blocks dialog submission without valid attempt evidence (%s)', async attemptId => {
    await render(ReconcileDialog, { row, operation:{ ...unknown(), attemptId } })
    vm().note = 'Проверено'; vm().finished = true
    expect(wrapper.findComponent(ConfirmDialog).props('actionDisabled')).toBe(true)
    await vm().submit()
    expect(h.session.logibooksRequest).not.toHaveBeenCalled(); expect(vm().pageProblem).toBeTruthy()
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
  it.each(['capability', 'role', 'receipt', 'investigation'])('rechecks %s restrictions at dialog submission', async restriction => {
    const metadata = { ...ops }, value = unknown()
    if (restriction === 'capability') metadata.canManage = false
    if (restriction === 'role') h.session.user.value = { id:1, roles:['operator'] }
    if (restriction === 'receipt') value.phase = 'ReceiptRetained'
    if (restriction === 'investigation') value.investigationRequired = true
    await render(ReconcileDialog, { row, operation:value, ops:metadata })
    vm().note = 'Проверено'; vm().finished = true
    expect(wrapper.findComponent(ConfirmDialog).props('actionDisabled')).toBe(true)
    await vm().submit()
    expect(h.session.logibooksRequest).not.toHaveBeenCalled(); expect(vm().pageProblem).toBeTruthy()
  })
  it('submits reconciliation with the current attempt while dispatch is disabled', async () => {
    await render(ReconcileDialog, { row, operation:unknown(), ops:{ ...ops, enabled:false } })
    vm().note = 'Проверено'; vm().finished = true
    current = { ...unknown(), state:'Rejected', rejected:1, unresolved:0 }
    await vm().submit()
    expect(JSON.parse(h.session.logibooksRequest.mock.calls.at(-1)[1].body).attemptId).toBe(attemptId)
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })
  it('validates external completion, note, and positive IDs before submitting', async () => {
    await render(ReconcileDialog, { row, operation:unknown() })
    await vm().submit(); expect(vm().problem.errors.note).toBeTruthy(); expect(vm().problem.errors.originalAttemptFinished).toBeTruthy()
    vm().created = true; vm().note = 'Проверено'; vm().finished = true
    await vm().submit(); expect(vm().problem.errors.parcelId).toBeTruthy(); expect(vm().problem.errors.registerId).toBeTruthy()
    vm().parcelId = '101'; vm().registerId = '10'; current = { ...unknown(), state:'Succeeded', created:1, unresolved:0, registerId:10 }
    await vm().submit(); expect(wrapper.emitted('saved')).toHaveLength(1)
    const body = JSON.parse(h.session.logibooksRequest.mock.calls.at(-1)[1].body)
    expect(body.rows).toEqual([{ rowNumber:1, created:true, parcelId:101 }]); expect(body.note).toBe('Проверено')
    expect(body.version).toBe(operation.version); expect(body.attemptId).toBe(attemptId)
  })
  it('records noncreation only after proof, and locks conflicts until authoritative refresh', async () => {
    await render(ReconcileDialog, { row, operation:unknown() })
    vm().note = 'Завершено, строка не создана'; vm().finished = true
    h.session.logibooksRequest.mockRejectedValueOnce(new ProblemError({ type:'https://sarafan.sw.consulting/problems/logibooks-update-conflict', detail:'Обновите' }))
    await vm().submit(); expect(vm().locked).toBe(true); expect(vm().note).toContain('Завершено')
    await vm().submit(); expect(h.session.logibooksRequest).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ row:{ ...row, rowNumber:2 } }); expect(vm().locked).toBe(false); expect(vm().note).toBe('')
    vm().note = 'Проверено'; vm().finished = true; current = { ...unknown(), state:'Rejected', rejected:1, unresolved:0 }
    await vm().submit(); expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(JSON.parse(h.session.logibooksRequest.mock.calls.at(-1)[1].body).rows[0]).toEqual({ rowNumber:2, created:false, parcelId:null })
  })
  it('owns server field failures for hidden fields and ignores identity changes', async () => {
    await render(ReconcileDialog, { row, operation:unknown() })
    vm().note = 'Проверено'; vm().finished = true
    h.session.logibooksRequest.mockRejectedValueOnce(createInternalProblem('invalidInput', { errors:{ registerId:['Проверьте реестр'] } }))
    await vm().submit(); expect(document.body.textContent).toContain('Проверьте реестр')
    h.session.user.value = null; await flushPromises(); expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})

describe('shared goods presentation', () => {
  it.each([PreviewView, RegisterView])('uses the validated Core USD symbol in register views', async component => {
    const request = h.session.logibooksRequest.getMockImplementation()
    h.session.logibooksRequest.mockImplementation((path, options) => path.endsWith('/ops')
      ? { ...copy(ops), unitPriceCurrency:{ ...ops.unitPriceCurrency, symbol:'US$' } } : request(path, options))
    await render(component)
    expect(wrapper.findComponent(GoodsTable).props('currencySymbol')).toBe('US$')
    expect(wrapper.text()).toContain('12,34US$')
    expect(wrapper.text()).not.toContain('12,34 USD')
  })
  it('renders price per unit, quantity, issues and accessible reconciliation action', async () => {
    await render(GoodsTable, { rows:[{ ...row, issues:[{ code:'demo', msg:'Замечание' }] }], total:1, page:1, pageSize:25, currencySymbol:ops.unitPriceCurrency.symbol, results:true, canReconcile:true })
    expect(wrapper.text()).toContain('12,34' + ops.unitPriceCurrency.symbol); expect(wrapper.text()).toContain('Замечание')
    const action = wrapper.findAll('button').find(button => button.attributes('aria-label') === 'Сверить результат')
    await action.trigger('click'); expect(wrapper.emitted('reconcile')[0]).toEqual([expect.objectContaining({ rowNumber:1 })])
  })
})


it('routes table paging and header recovery through shared controls', async () => {
  await render(PreviewView)
  const table = wrapper.findComponent(GoodsTable)
  const dataTable = table.findComponent({ name:'VDataTableServer' })
  dataTable.vm.$emit('update:page', 2); dataTable.vm.$emit('update:itemsPerPage', 10); await flushPromises()
  expect(vm().pageSize).toBe(10)
  wrapper.unmount(); wrapper = null
  await render(RegistersView)
  wrapper.findComponent(ListFilterBar).vm.$emit('update:search', 'Sarafan'); await flushPromises()
  vm().debounce?.cancel()
  h.session.user.value = null; await flushPromises(); expect(vm().rows).toEqual([])
})
it('reconciliation controls own edits, cancellation, and explicit conflict refresh', async () => {
  await render(ReconcileDialog, { row, operation:{ ...operation, state:'Unknown', phase:'Dispatching', attemptId } })
  const fields = () => wrapper.findAllComponents({ name:'FormField' })
  fields().find(field => field.props('name') === 'note').vm.$emit('update:modelValue', 'Проверено')
  expect(vm().note).toBe('Проверено')
  vm().created = true; await flushPromises()
  fields().find(field => field.props('name') === 'registerId').vm.$emit('update:modelValue', '10')
  fields().find(field => field.props('name') === 'parcelId').vm.$emit('update:modelValue', '101')
  vm().finished = true
  h.session.logibooksRequest.mockRejectedValueOnce(new ProblemError({ type:'https://sarafan.sw.consulting/problems/logibooks-update-conflict', detail:'Обновите' }))
  wrapper.findComponent(ConfirmDialog).vm.$emit('confirm'); await flushPromises()
  const refresh = wrapper.findAllComponents({ name:'ActionButton' }).find(button => button.props('tooltipText') === 'Обновить результат')
  refresh.vm.$emit('click'); expect(wrapper.emitted('refresh')).toHaveLength(1)
  wrapper.findComponent(ConfirmDialog).vm.$emit('cancel'); expect(wrapper.emitted('cancel')).toHaveLength(1)
})


it('reopens a changed preview after a definitive admission conflict', async () => {
  await render()
  h.session.logibooksRequest.mockRejectedValueOnce(new ProblemError({ type:'https://sarafan.sw.consulting/problems/logibooks-preview-changed', detail:'Обновите выбор' }))
  await vm().send(); expect(vm().command).toBeNull(); expect(vm().previewCurrent).toBe(false); expect(vm().preview).toBeTruthy(); expect(h.session.logibooksDraft.value.command).toBeNull()
  expect(vm().dirty).toBe(true); await vm().refresh(); expect(vm().preview).toBeTruthy()
})
it('does not reload an empty filtered page on unchanged metadata polls', async () => {
  vi.useFakeTimers(); resultRows = []; await render(RegisterView)
  const reads = () => h.session.logibooksRequest.mock.calls.filter(([path]) => path.includes('/rows?')).length
  expect(reads()).toBe(1); await vi.advanceTimersByTimeAsync(2000); await flushPromises(); expect(reads()).toBe(1)
})
it('an obsolete metadata read cannot schedule an extra polling loop', async () => {
  vi.useFakeTimers()
  const hold = pending()
  h.session.logibooksRequest.mockImplementation(async path => {
    if (path.endsWith('/ops')) return copy(ops)
    if (path.endsWith('/details')) return copy(preview.register)
    if (path.includes('/rows?')) return hold.promise
    return { ...copy(operation), id:path.split('/').at(-1) }
  })
  wrapper = mount(RegisterView, { global:{ plugins:[createSarafanVuetify()] } })
  await flushPromises()
  h.route.params.id = attemptId; await flushPromises()
  hold.resolve(page([copy(row)], new globalThis.URLSearchParams())); await flushPromises()
  const requests = h.session.logibooksRequest.mock.calls.length
  await vi.advanceTimersByTimeAsync(2000); await flushPromises()
  expect(h.session.logibooksRequest).toHaveBeenCalledTimes(requests + 1)
})

it('shared request ownership never starts work after logout or disposal', async () => {
  await render(defineComponent({ setup:() => useStaffRequest(h.session), template:'<div />' }))
  const task = vm(), action = vi.fn()
  h.session.user.value = null; await flushPromises()
  expect(await task.run(action)).toBe(false); expect(action).not.toHaveBeenCalled()
  wrapper.unmount(); wrapper = null; h.session.user.value = { id:1, roles:['administrator'] }
  expect(await task.run(action)).toBe(false); expect(action).not.toHaveBeenCalled()
})


describe('compact register editor', () => {
  it('retains metadata through refresh, remount and uncertain admission while keeping parcel rows visible', async () => {
    await render()
    expect(wrapper.find('button[aria-label="Предварительный просмотр"]').exists()).toBe(false)
    expect(wrapper.find('input[name="theOtherCompanyId"]').exists()).toBe(false)
    expect(wrapper.findAll('form label').map(label => label.text())).toEqual([
      'Номер сделки', 'Номер заказа клиента', 'Номер накладной', 'Дата накладной'
    ])
    expect(wrapper.text()).toContain('Общий вес, кг')
    expect(wrapper.find('input[name="fileName"]').exists()).toBe(false)
    for (const label of ['Условия поставки', 'Получатель', 'Страна назначения', 'Транспорт', 'Процедура'])
      expect(wrapper.text()).not.toContain(label)
    const fields = { dealNumber:' Deal 42 ', customerOrderNumber:' Client 7 ', invoiceNumber:' Invoice 9 ', invoiceDate:'2026-10-12' }
    for (const [key, value] of Object.entries(fields)) await wrapper.get('input[name="register.' + key + '"]').setValue(value)
    expect(vm().previewCurrent).toBe(false)
    expect(wrapper.findComponent(GoodsTable).exists()).toBe(true)
    const original = { ...h.session.logibooksDraft.value.register }
    vm().changeField('customsProcedureCode', '10')
    vm().changeField('fileName', 'changed')
    expect(vm().fileName).toBe(preview.fileName)
    expect(h.session.logibooksDraft.value.register).toEqual(original)
    wrapper.unmount(); wrapper = null
    await render()
    expect(vm().registerFields).toEqual({ dealNumber:'Deal 42', customerOrderNumber:'Client 7', invoiceNumber:'Invoice 9', invoiceDate:'2026-10-12' })
    expect(vm().previewCurrent).toBe(true)
    const blocked = pending()
    h.session.logibooksRequest.mockReturnValueOnce(blocked.promise)
    const send = vm().send(); await flushPromises()
    vm().changeField('dealNumber', 'changed')
    expect(vm().registerFields.dealNumber).toBe('Deal 42')
    blocked.reject(new Error('lost response')); await send
    const frozen = JSON.stringify(vm().command)
    vm().changeField('invoiceNumber', 'changed')
    expect(JSON.stringify(vm().command)).toBe(frozen)
    wrapper.unmount(); wrapper = null
    h.session.logibooksRequest.mockRejectedValueOnce(new Error('lookup unavailable'))
    await render()
    expect(JSON.stringify(vm().command)).toBe(frozen)
    await vm().send()
    expect(h.session.logibooksRequest.mock.calls.at(-1)[1].body).toBe(frozen)
  })
  it('shows invoice-date errors during Create and preserves edits for a direct retry', async () => {
    await render()
    vm().changeField('invoiceDate', '2026-02-30')
    const calls = h.session.logibooksRequest.mock.calls.length
    await vm().send()
    expect(h.session.logibooksRequest).toHaveBeenCalledTimes(calls)
    expect(wrapper.get('[id="register.invoiceDate-error"]').text()).toContain('Укажите корректную дату')
    expect(vm().pageProblem).toBeNull()
    expect(vm().registerFields.invoiceDate).toBe('2026-02-30')
    vm().changeField('invoiceDate', '2026-02-28')
    h.session.logibooksRequest.mockRejectedValueOnce(new Error('unavailable'))
    await vm().send()
    expect(vm().registerFields.invoiceDate).toBe('2026-02-28')
    expect(vm().previewCurrent).toBe(false); expect(vm().command).toBeNull()
    await vm().send()
    expect(vm().previewCurrent).toBe(true)
    expect(vm().command.register.invoiceDate).toBe('2026-02-28')
    expect(h.replace).toHaveBeenCalled()
  })
  it('invalidates a rejected preview without discarding register edits or parcel rows', async () => {
    await render()
    vm().changeField('dealNumber', 'Deal')
    await vm().refresh()
    h.session.logibooksRequest.mockRejectedValueOnce(new ProblemError({ type:'https://sarafan.sw.consulting/problems/logibooks-preview-changed' }))
    await vm().send()
    expect(vm().command).toBeNull(); expect(vm().previewCurrent).toBe(false)
    expect(vm().registerFields.dealNumber).toBe('Deal'); expect(vm().preview.parcels).toHaveLength(1)
    await vm().send()
    expect(h.replace).toHaveBeenCalled()
  })
  it('loads frozen details once, displays them read-only and retains metadata-only polling', async () => {
    vi.useFakeTimers()
    const request = h.session.logibooksRequest.getMockImplementation()
    h.session.logibooksRequest.mockImplementation((path, options) => path.endsWith('/details')
      ? { ...preview.register, dealNumber:'Saved deal', invoiceDate:'2026-10-12' } : request(path, options))
    await render(RegisterView)
    expect(wrapper.text()).toContain('Saved deal'); expect(wrapper.text()).toContain('12.10.2026')
    expect(wrapper.find('input[name="register.dealNumber"]').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(4000); await flushPromises()
    expect(h.session.logibooksRequest.mock.calls.filter(([path]) => path.endsWith('/details'))).toHaveLength(1)
  })
  it('reports failed details without applying a partial view and permits retry', async () => {
    const request = h.session.logibooksRequest.getMockImplementation()
    let fail = true
    h.session.logibooksRequest.mockImplementation((path, options) => {
      if (path.endsWith('/details') && fail) { fail = false; throw new Error('private details') }
      return request(path, options)
    })
    await render(RegisterView)
    expect(vm().details).toBeNull(); expect(vm().problem).toBeTruthy()
    await vm().load()
    expect(vm().details).toEqual(preview.register); expect(vm().problem).toBeNull()
  })
})
