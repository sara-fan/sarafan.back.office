// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import StoreView from '../src/views/StoreView.vue'
import StoresView from '../src/views/StoresView.vue'
import StoreLogo from '../src/components/StoreLogo.vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import { createInternalProblem, ProblemError } from '../src/errors/problem.js'
import { STORE_CONFLICT, STORE_VERSION_INVALID, STORE_ERROR_OPTIONS } from '../src/storeCatalogue.js'
import { store, ops, logoUrl, pending } from './fixtures/stores.js'

const h = vi.hoisted(() => ({ session:{}, push:vi.fn(), leave:null, update:null, route:null }))
vi.mock('../src/stores/session.js', () => ({ useSession:() => h.session }))
vi.mock('vue-router', () => ({ useRoute:() => h.route, useRouter:() => ({ push:h.push }), onBeforeRouteLeave:fn => { h.leave = fn }, onBeforeRouteUpdate:fn => { h.update = fn } }))
let wrapper
const vm = () => wrapper.vm.$.setupState
const copy = value => globalThis.structuredClone(value)
async function render(component = StoreView, props = {}) { wrapper = mount(component, { props, attachTo:document.body, global:{ plugins:[createSarafanVuetify()] } }); await flushPromises() }
beforeEach(() => {
  h.route = reactive({ params:{ id:'1' }, fullPath:'/stores/1' })
  h.session.user = ref({ id:1, roles:['administrator'] })
  h.session.storeRequest = vi.fn(async path => path === '/stores/ops' ? copy(ops) : path === '/stores' ? { items:[copy(store)] } : copy(store))
  h.push.mockReset().mockResolvedValue()
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:logo')
  globalThis.URL.revokeObjectURL = vi.fn()
})
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.restoreAllMocks() })

describe('store editor', () => {
  it('associates corrupt image preview failures with the upload field on repeated attempts', async () => {
    await render()
    for (let attempt = 0; attempt < 2; attempt++) {
      await vm().selectLogo({ target:{ files:[new globalThis.File(['not a PNG'], 'bad.png', { type:'image/png' })] } })
      await flushPromises(); await wrapper.get('img').trigger('error'); await flushPromises()
      expect(wrapper.get('#logo').attributes('aria-invalid')).toBe('true')
      expect(wrapper.get('#logo-error').text()).toContain('Не удалось показать')
      expect(document.activeElement).toBe(wrapper.get('#logo').element)
      expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
    }
    await wrapper.get('#name').setValue('Черновик')
    await vm().save(); expect(h.session.storeRequest).toHaveBeenCalledTimes(2)
    expect(vm().form.name).toBe('Черновик')
    const old = vm().file
    await vm().selectLogo({ target:{ files:[new globalThis.File(['PNG'], 'good.png', { type:'image/png' })] } })
    await vm().previewFailed(old); expect(vm().invalidFile).toBeNull()
    expect(vm().problem).toBeNull()
  })
  it.each(['reject', 'abort'])('does not repeat a committed create after navigation %s', async outcome => {
    h.route.params = {}; await render()
    for (const field of ['name','description','officialUrl']) await wrapper.get(`#${field}`).setValue(store[field])
    h.session.storeRequest.mockResolvedValueOnce(store)
    if (outcome === 'reject') h.push.mockRejectedValueOnce(new Error('navigation failed'))
    else h.push.mockResolvedValueOnce(new Error('navigation aborted'))
    await vm().save()
    expect(vm().committed).toBe('saved'); expect(vm().dirty).toBe(false)
    expect(wrapper.text()).toContain('Магазин сохранён.')
    expect(wrapper.find('button[aria-label="Сохранить изменения"]').exists()).toBe(false)
    const calls = h.session.storeRequest.mock.calls.length
    await vm().save(); expect(h.session.storeRequest).toHaveBeenCalledTimes(calls)
    await vm().refresh(); expect(h.push).toHaveBeenCalledTimes(2)
    expect(h.session.storeRequest).toHaveBeenCalledTimes(calls)
  })
  it.each(['reject', 'abort'])('does not restore a deleted editor after navigation %s', async outcome => {
    await render(); vm().deleting = true
    h.session.storeRequest.mockResolvedValueOnce(null)
    if (outcome === 'reject') h.push.mockRejectedValueOnce(new Error('navigation failed'))
    else h.push.mockResolvedValueOnce(new Error('navigation aborted'))
    await vm().remove()
    expect(vm().committed).toBe('deleted'); expect(vm().form).toBeNull()
    expect(wrapper.text()).toContain('Магазин удалён.')
    expect(wrapper.find('button[aria-label="Сохранить изменения"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Удалить магазин"]').exists()).toBe(false)
    await vm().save(); await vm().remove()
    expect(h.session.storeRequest).toHaveBeenCalledTimes(3)
    await vm().refresh(); expect(h.push).toHaveBeenCalledTimes(2)
    expect(h.session.storeRequest).toHaveBeenCalledTimes(3)
  })
  it('renders server status/home errors and wires confirmation actions', async () => {
    await render()
    h.session.storeRequest.mockRejectedValueOnce(createInternalProblem('invalidInput', { errors:{ Status:['Ошибка статуса'], ShowOnHome:['Ошибка выбора'] } }))
    await vm().save()
    expect(wrapper.get('#status-error').text()).toContain('Ошибка статуса')
    expect(wrapper.get('#showOnHome-error').text()).toContain('Ошибка выбора')
    await wrapper.get('#name').setValue('Черновик')
    const cancel = vm().refresh(); wrapper.findAllComponents(ConfirmDialog)[0].vm.$emit('cancel'); await cancel
    expect(vm().dirty).toBe(true)
    const accept = vm().refresh(); wrapper.findAllComponents(ConfirmDialog)[0].vm.$emit('confirm'); await accept
    expect(vm().dirty).toBe(false)
    await wrapper.get('button[aria-label="Удалить магазин"]').trigger('click')
    wrapper.findAllComponents(ConfirmDialog)[1].vm.$emit('cancel'); expect(vm().deleting).toBe(false)
  })
  it('edits atomically and returns only after validated success', async () => {
    await render()
    expect(wrapper.findAll('label').map(item => item.text())).toContain('Показывать на главной')
    expect(wrapper.text()).toContain('первые шесть')
    expect(wrapper.text()).toContain('160')
    await wrapper.get('#name').setValue('Новый магазин')
    await wrapper.get('#displayOrder').setValue('10')
    await wrapper.get('[name="showOnHome"]').setValue(true)
    const file = new globalThis.File(['PNG'], 'logo.png', { type:'image/png' })
    await vm().selectLogo({ target:{ files:[file], value:'secret' } })
    expect(wrapper.get('img').attributes('src')).toBe('blob:logo')
    h.session.storeRequest.mockResolvedValueOnce({ ...store, name:'Новый магазин', displayOrder:10 })
    await wrapper.get('form').trigger('submit'); await flushPromises()
    const [path, request] = h.session.storeRequest.mock.calls.at(-1)
    expect(path).toBe('/stores/1'); expect(request.method).toBe('PUT')
    expect(request.headers).toBeUndefined()
    expect(request.body.get('version')).toBe(store.version)
    expect(request.body.get('logo')).toBe(file)
    expect(request.body.get('displayOrder')).toBe('10')
    expect(request.body.get('showOnHome')).toBe('true')
    expect(vm().dirty).toBe(false)
    expect(h.push).toHaveBeenCalledWith('/stores')
  })
  it('defaults creation Hidden and focuses required fields, then creates without a logo', async () => {
    h.route.params = {}; await render()
    expect(vm().form.status).toBe(0)
    await vm().save(); expect(document.activeElement).toBe(wrapper.get('#name').element)
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
    for (const field of ['name','description','officialUrl']) await wrapper.get(`#${field}`).setValue(store[field])
    h.session.storeRequest.mockResolvedValueOnce(store)
    await vm().save()
    const [path, request] = h.session.storeRequest.mock.calls.at(-1)
    expect(path).toBe('/stores'); expect(request.method).toBe('POST')
    expect(request.body.get('version')).toBeNull()
    expect(request.body.get('status')).toBe('0')
    expect(request.body.get('logo')).toBeNull()
  })
  it.each(['administrator','shift-manager','senior-operator','operator'])('matches client and server capabilities for %s', async role => {
    h.session.user.value.roles = [role]; await render()
    const edit = ['administrator','shift-manager'].includes(role)
    expect(wrapper.find('button[aria-label="Сохранить изменения"]').exists()).toBe(edit)
    expect(wrapper.find('#logo').exists()).toBe(edit)
    expect(wrapper.find('button[aria-label="Удалить магазин"]').exists()).toBe(role === 'administrator')
    if (!edit) { await vm().save(); expect(h.session.storeRequest).toHaveBeenCalledTimes(2) }
    vm().ops.actions.edit = false; await flushPromises()
    expect(wrapper.find('button[aria-label="Сохранить изменения"]').exists()).toBe(false)
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
  })
  it('preserves drafts through validation failures and uses canonical field errors', async () => {
    await render()
    await wrapper.get('#description').setValue('x'.repeat(161)); await vm().save()
    expect(document.activeElement).toBe(wrapper.get('#description').element)
    expect(vm().form.description).toHaveLength(161)
    await wrapper.get('#description').setValue('x'.repeat(160))
    const type = Object.keys(STORE_ERROR_OPTIONS.types)[0]
    h.session.storeRequest.mockRejectedValueOnce(new ProblemError({ type, detail:'Исправьте название' }))
    await vm().save()
    expect(wrapper.get('#name-error').text()).toBe('Исправьте название')
    expect(document.activeElement).toBe(wrapper.get('#name').element)
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
    await wrapper.get('#name').setValue('Черновик')
    h.session.storeRequest.mockRejectedValueOnce(createInternalProblem('invalidInput', { errors:{ Name:['Ошибка имени'] } }))
    await vm().save(); expect(wrapper.get('#name-error').text()).toContain('Ошибка имени')
    h.session.storeRequest.mockRejectedValueOnce(new Error('secret'))
    await vm().save(); expect(wrapper.text()).not.toContain('secret'); expect(vm().dirty).toBe(true)
  })
  it('validates file selection and activation without losing the previous replacement', async () => {
    await render()
    await wrapper.get('#status').setValue(1)
    await vm().save(); expect(document.activeElement).toBe(wrapper.get('#logo').element)
    const good = new globalThis.File(['png'], 'image.png', { type:'image/png' })
    await vm().selectLogo({ target:{ files:[good] } }); await flushPromises()
    await vm().selectLogo({ target:{ files:[new globalThis.File(['svg'], 'x.svg', { type:'image/svg+xml' })] } })
    expect(vm().file).toBe(good)
    expect(wrapper.get('#logo-error').text()).toContain('PNG')
    expect(document.activeElement).toBe(wrapper.get('#logo').element)
    await vm().selectLogo({ target:{ files:[] } })
    expect(vm().file).toBe(good)
  })
  it.each([STORE_CONFLICT, STORE_VERSION_INVALID])('locks writes until explicit refresh after %s', async type => {
    await render(); await wrapper.get('#name').setValue('Черновик')
    h.session.storeRequest.mockRejectedValueOnce(new ProblemError({ type, detail:'Обновите данные' }))
    await vm().save(); expect(vm().locked).toBe(true)
    await vm().save(); expect(h.session.storeRequest).toHaveBeenCalledTimes(3)
    const cancelled = vm().refresh(); vm().finish(false); await cancelled
    expect(vm().form.name).toBe('Черновик')
    const accepted = vm().refresh(); vm().finish(true); await accepted
    expect(vm().locked).toBe(false); expect(vm().dirty).toBe(false)
  })
  it('confirms deletion and handles failures/conflicts without discarding draft', async () => {
    await render(); await vm().remove(); expect(h.session.storeRequest).toHaveBeenCalledTimes(2)
    await wrapper.get('#name').setValue('Черновик')
    await wrapper.get('button[aria-label="Удалить магазин"]').trigger('click')
    expect(vm().deleting).toBe(true)
    h.session.storeRequest.mockRejectedValueOnce(new Error('secret'))
    await vm().remove(); expect(vm().form.name).toBe('Черновик')
    vm().deleting = true; h.session.storeRequest.mockResolvedValueOnce(null)
    await vm().remove()
    const [, request] = h.session.storeRequest.mock.calls.at(-1)
    expect(request.method).toBe('DELETE'); expect(JSON.parse(request.body)).toEqual({ version:store.version })
    expect(vm().dirty).toBe(false); expect(h.push).toHaveBeenCalledWith('/stores')
  })
  it('protects dirty refresh, route changes, closure and resolves pending guards on reset', async () => {
    await render(); expect(await h.leave()).toBe(true)
    const clean = new globalThis.Event('beforeunload', { cancelable:true }); globalThis.dispatchEvent(clean); expect(clean.defaultPrevented).toBe(false)
    await wrapper.get('#name').setValue('Черновик')
    const cancel = h.leave(); vm().finish(false); expect(await cancel).toBe(false)
    const accept = h.update(); vm().finish(true); expect(await accept).toBe(true)
    const event = new globalThis.Event('beforeunload', { cancelable:true }); globalThis.dispatchEvent(event); expect(event.defaultPrevented).toBe(true)
    const first = h.leave(); const second = h.leave(); expect(await first).toBe(false)
    h.session.user.value = null; expect(await second).toBe(false); expect(vm().form).toBeNull()
  })
  it('does not discard drafts on ordinary token refresh of the same identity', async () => {
    await render(); await wrapper.get('#name').setValue('Черновик')
    h.session.user.value = { id:1, roles:['administrator'] }; await flushPromises()
    expect(vm().form.name).toBe('Черновик')
  })
  it('rejects malformed data and recovers with header refresh', async () => {
    h.session.storeRequest.mockResolvedValueOnce({}); await render()
    expect(vm().problem.code).toBe('ui_protocol_error'); expect(vm().form).toBeNull()
    await vm().refresh(); expect(vm().form.name).toBe(store.name)
    h.push.mockRejectedValueOnce(new Error('secret')); await vm().back(); expect(vm().problem).toBeTruthy()
  })
  it.each(['ops','details','save','delete'])('ignores late %s completion after identity changes', async phase => {
    const deferred = pending()
    if (phase === 'ops') h.session.storeRequest.mockReturnValueOnce(deferred.promise)
    if (phase === 'details') h.session.storeRequest.mockResolvedValueOnce(copy(ops)).mockReturnValueOnce(deferred.promise)
    await render()
    let action
    if (phase === 'save' || phase === 'delete') {
      h.session.storeRequest.mockReturnValueOnce(deferred.promise)
      if (phase === 'delete') vm().deleting = true
      action = phase === 'save' ? vm().save() : vm().remove()
    }
    h.session.user.value = null
    deferred.resolve(phase === 'ops' ? ops : store)
    await action; await flushPromises()
    expect(vm().form).toBeNull(); expect(vm().problem).toBeNull(); expect(h.push).not.toHaveBeenCalled()
  })
  it('invalidates old route replies and ignores late rejection after unmount', async () => {
    await render()
    const deferred = pending(); h.session.storeRequest.mockReturnValueOnce(deferred.promise)
    const old = vm().load()
    h.route.params.id = '2'
    h.session.storeRequest.mockResolvedValueOnce(copy(ops)).mockResolvedValueOnce({ ...store, id:2 })
    await flushPromises(); expect(vm().details.id).toBe(2)
    deferred.reject(new Error('old')); await old
    expect(vm().problem).toBeNull()
    const late = pending(); h.session.storeRequest.mockReturnValueOnce(late.promise)
    const load = vm().load(); wrapper.unmount(); wrapper = null; late.reject(new Error('old')); await load
  })
})

describe('store management list', () => {
  it('supports view-only list actions, filter and page controls; ignores late failures', async () => {
    h.session.user.value.roles = ['operator']
    h.session.storeRequest.mockImplementation(async path => path === '/stores/ops' ? copy(ops) : { items:[{ ...store, showOnHome:true }] })
    await render(StoresView)
    expect(wrapper.text()).toContain('Да')
    expect(wrapper.find('button[aria-label="Добавить магазин"]').exists()).toBe(false)
    wrapper.findComponent({ name:'VSelect' }).vm.$emit('update:modelValue', 0)
    wrapper.findComponent({ name:'VDataTable' }).vm.$emit('update:page', 2)
    await flushPromises(); expect(vm().status).toBe(0); expect(vm().page).toBe(1)
    const nav = pending(); h.push.mockReturnValueOnce(nav.promise)
    const open = vm().open('/stores/1')
    const request = pending(); h.session.storeRequest.mockReturnValueOnce(request.promise)
    const load = vm().load()
    h.session.user.value = null
    nav.reject(new Error('obsolete')); request.reject(new Error('obsolete'))
    await Promise.all([open, load]); expect(vm().problem).toBeNull()
  })
  it('shows metadata, filters Hidden/Active and opens dedicated routes', async () => {
    h.session.storeRequest.mockImplementation(async path => path === '/stores/ops' ? copy(ops) : { items:[store, { ...store, id:2, name:'Active', status:1, logoUrl:logoUrl.replace('/1/', '/2/') }] })
    await render(StoresView)
    expect(wrapper.text()).toContain('Магазин A'); expect(wrapper.text()).toContain('Скрыт')
    vm().status = 1; await flushPromises(); expect(vm().filtered).toHaveLength(1)
    vm().status = 0; await flushPromises(); expect(vm().filtered).toHaveLength(1)
    await wrapper.get('button[aria-label="Открыть магазин"]').trigger('click'); expect(h.push).toHaveBeenCalledWith('/stores/1')
    await wrapper.get('button[aria-label="Добавить магазин"]').trigger('click'); expect(h.push).toHaveBeenCalledWith('/stores/new')
    h.push.mockRejectedValueOnce(new Error('secret')); await vm().open('/stores/1'); expect(vm().problem).toBeTruthy()
  })
  it('retains list on failed refresh, recovers and clears identity state', async () => {
    await render(StoresView)
    h.session.storeRequest.mockRejectedValueOnce(new Error('secret')); await vm().load()
    expect(vm().items).toHaveLength(1); expect(vm().problem).toBeTruthy()
    await vm().load(); expect(vm().problem).toBeNull()
    h.session.user.value = { id:2, roles:['operator'] }; await flushPromises()
    expect(vm().items).toEqual([]); expect(vm().ops).toBeNull()
    expect(wrapper.find('button[aria-label="Добавить магазин"]').exists()).toBe(false)
  })
  it.each(['ops','list'])('ignores obsolete list %s requests', async phase => {
    const deferred = pending()
    if (phase === 'ops') h.session.storeRequest.mockReturnValueOnce(deferred.promise)
    else h.session.storeRequest.mockResolvedValueOnce(copy(ops)).mockReturnValueOnce(deferred.promise)
    await render(StoresView)
    h.session.user.value = null
    deferred.resolve(phase === 'ops' ? ops : { items:[store] }); await flushPromises()
    expect(vm().items).toEqual([])
  })
})

describe('authenticated logo lifecycle', () => {
  it('emits selected-file failures once and rejects obsolete image error events', async () => {
    const file = new globalThis.File([], 'empty.png', { type:'image/png' })
    await render(StoreLogo, { file })
    expect(wrapper.emitted('invalid-file')).toEqual([[file]])
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    await wrapper.setProps({ file:new globalThis.File(['png'], 'good.png', { type:'image/png' }) })
    vm().failed({ target:{ getAttribute:() => 'blob:obsolete' } })
    expect(wrapper.find('img').exists()).toBe(true)
  })
  it('uses staff binary requests and revokes replacements and unmounted blobs', async () => {
    h.session.storeRequest.mockResolvedValue(new globalThis.Blob(['png'], { type:'image/png' }))
    await render(StoreLogo, { url:logoUrl })
    expect(h.session.storeRequest).toHaveBeenCalledWith(logoUrl.slice('/api/v1/backoffice'.length), {}, 'blob')
    await wrapper.setProps({ revision:1 }); await flushPromises()
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:logo')
    wrapper.unmount(); wrapper = null; expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })
  it('owns failed transport and decoder errors and retries on refresh', async () => {
    h.session.storeRequest.mockRejectedValueOnce(new Error('secret'))
    await render(StoreLogo, { url:logoUrl }); expect(wrapper.text()).toContain('Логотип недоступен'); expect(wrapper.text()).not.toContain('secret')
    h.session.storeRequest.mockResolvedValue(new globalThis.Blob(['png'], { type:'image/png' }))
    await wrapper.setProps({ revision:1 }); await flushPromises()
    await wrapper.get('img').trigger('error'); expect(wrapper.text()).toContain('Логотип недоступен')
  })
  it.each([null, new globalThis.Blob([], { type:'image/png' }), new globalThis.Blob(['svg'], { type:'image/svg+xml' })])('rejects unsafe binary response %#', async value => {
    h.session.storeRequest.mockResolvedValue(value); await render(StoreLogo, { url:logoUrl })
    expect(wrapper.find('img').exists()).toBe(false); expect(wrapper.text()).toContain('Логотип недоступен')
  })
  it('rejects foreign endpoints and ignores stale completions/failures', async () => {
    await render(StoreLogo, { url:'https://evil.test/logo' })
    expect(h.session.storeRequest).not.toHaveBeenCalled()
    const old = pending(); h.session.storeRequest.mockReturnValueOnce(old.promise)
    await wrapper.setProps({ url:logoUrl }); h.session.user.value = null
    old.resolve(new globalThis.Blob(['png'], { type:'image/png' })); await flushPromises()
    expect(globalThis.URL.createObjectURL).not.toHaveBeenCalled()
    const failed = pending(); h.session.storeRequest.mockReturnValueOnce(failed.promise)
    h.session.user.value = { id:2, roles:['operator'] }; await flushPromises()
    wrapper.unmount(); wrapper = null; failed.reject(new Error('secret')); await flushPromises()
  })
})
