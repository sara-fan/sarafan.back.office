// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import PaymentInformationBundleView from '../src/views/PaymentInformationBundleView.vue'
import PaymentInformationBundlesView from '../src/views/PaymentInformationBundlesView.vue'
import PaymentQrPreview from '../src/components/PaymentQrPreview.vue'
import StaffImagePreview from '../src/components/StaffImagePreview.vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
import ListFilterBar from '../src/components/ListFilterBar.vue'
import EditorHeaderActions from '../src/components/EditorHeaderActions.vue'
import { createInternalProblem, ProblemError } from '../src/errors/problem.js'
import { PAYMENT_ROOT as root, PAYMENT_CONFLICTS } from '../src/paymentInformation.js'
import { paymentOps as ops, paymentBundle as row, paymentRow, paymentPage } from './fixtures/paymentInformation.js'
import { pending } from './fixtures/stores.js'

const h = vi.hoisted(() => ({session:{},push:vi.fn(),route:null,leave:null}))
vi.mock('../src/stores/session.js',()=>({useSession:()=>h.session}))
vi.mock('vue-router',async original=>({...await original(),useRoute:()=>h.route,useRouter:()=>({push:h.push}),onBeforeRouteLeave:fn=>{h.leave=fn},onBeforeRouteUpdate:()=>{}}))
let wrapper, rows
const vm = () => wrapper.vm.$.setupState
const copy = value => globalThis.structuredClone(value)
async function render(component = PaymentInformationBundleView, props = {}) {
  wrapper = mount(component,{props,attachTo:document.body,global:{plugins:[createSarafanVuetify()]}})
  await flushPromises()
}
beforeEach(()=>{
  globalThis.localStorage.clear()
  rows = [paymentRow('draft'),paymentRow('enabled',2),paymentRow('disabled',3)]
  h.route = reactive({params:{id:'1'},fullPath:root+'/1'})
  h.session.user = ref({id:1,roles:['administrator']}); h.session.viewStateMemory = new Map()
  h.session.paymentInformationRequest = vi.fn(async (path, options) => {
    if (path === root+'/ops') return copy(ops)
    if (path.includes('/qr?')) return new globalThis.Blob(['png'],{type:'image/png'})
    if (path.startsWith(root+'?')) return paymentPage(rows,new globalThis.URLSearchParams(path.split('?')[1]))
    if (options?.method === 'POST' && path === root) return copy(row)
    return copy(row)
  })
  h.push.mockReset().mockResolvedValue()
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:qr')
  globalThis.URL.revokeObjectURL = vi.fn()
})
afterEach(()=>{wrapper?.unmount();wrapper=null;vi.restoreAllMocks();vi.useRealTimers()})

describe('payment draft editor',()=>{
  it('loads the dedicated form, retains leading zeroes and saves without enabling',async()=>{
    await render()
    expect(wrapper.findComponent(EditorHeaderActions).exists()).toBe(true)
    expect(wrapper.get('#inn').element.value).toBe('0012345678')
    await wrapper.get('#recipientName').setValue('Исправленный получатель')
    h.session.paymentInformationRequest.mockResolvedValueOnce({...row,information:{...row.information,recipientName:'Исправленный получатель'}})
    await vm().save()
    const [,options] = h.session.paymentInformationRequest.mock.calls.find(([,options])=>options?.method==='PUT')
    expect(options.body.get('inn')).toBe('0012345678');expect(options.body.get('qr')).toBeNull()
    expect(options.body.get('version')).toBe(row.version)
    expect(vm().dirty).toBe(false);expect(vm().committed).toBe(true)
    expect(h.push).toHaveBeenCalledWith(root)
    const count = h.session.paymentInformationRequest.mock.calls.length
    await vm().save();await vm().refresh()
    expect(h.session.paymentInformationRequest).toHaveBeenCalledTimes(count)
    wrapper.findComponent(EditorHeaderActions).vm.$emit('cancel');await flushPromises()
    expect(h.push).toHaveBeenCalledTimes(3)
  })
  it('creates incomplete drafts and prevents repeat create after failed navigation',async()=>{
    h.route.params = {};await render()
    expect(vm().creating).toBe(true);expect(vm().form.recipientType).toBeNull()
    h.push.mockRejectedValueOnce(new Error('secret'))
    await vm().save()
    expect(h.session.paymentInformationRequest.mock.calls.some(([,options])=>options?.method==='POST')).toBe(true)
    expect(vm().committed).toBe(true);expect(wrapper.text()).not.toContain('secret')
    const count=h.session.paymentInformationRequest.mock.calls.length
    await vm().save();expect(h.session.paymentInformationRequest).toHaveBeenCalledTimes(count)
  })
  it.each(PAYMENT_CONFLICTS)('locks failed edits until explicit reload: %s',async type=>{
    await render();await wrapper.get('#recipientName').setValue('Черновик')
    h.session.paymentInformationRequest.mockRejectedValueOnce(new ProblemError({type,detail:'Обновите данные.'}))
    await vm().save()
    expect(vm().form.recipientName).toBe('Черновик');expect(vm().locked).toBe(true)
    const count=h.session.paymentInformationRequest.mock.calls.length;await vm().save()
    expect(h.session.paymentInformationRequest).toHaveBeenCalledTimes(count)
    const reload=vm().refresh();await flushPromises()
    wrapper.findComponent(ConfirmDialog).vm.$emit('cancel');await reload
    expect(vm().dirty).toBe(true)
    const discard=vm().refresh();await flushPromises()
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm');await discard
    expect(vm().locked).toBe(false);expect(vm().dirty).toBe(false)
  })
  it('preserves fields after validation failures and focuses the upload for repeated image failures',async()=>{
    await render()
    await wrapper.get('#bik').setValue('x');await vm().save()
    expect(wrapper.get('#bik-error').text()).not.toBe('')
    expect(document.activeElement).toBe(wrapper.get('#bik').element)
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
    await wrapper.get('#bik').setValue(row.information.bik)
    for(let attempt=0;attempt<2;attempt++) {
      await vm().selectQr(new globalThis.File(['svg'],'bad.svg',{type:'image/svg+xml'}))
      expect(wrapper.get('#qr-error').text()).toContain('PNG')
      expect(document.activeElement).toBe(wrapper.get('button[aria-label="Выбрать QR СБП"]').element)
    }
    const selected=new globalThis.File(['invalid png'],'qr.png',{type:'image/png'})
    await vm().selectQr(selected);await flushPromises()
    await wrapper.get('img').trigger('error');await flushPromises()
    expect(vm().invalidFile).toBe(selected);expect(wrapper.get('#qr-error').text()).toContain('Не удалось показать')
    await wrapper.get('#recipientName').setValue('Черновик')
    await vm().save();expect(vm().problem.errors.qr).toBeDefined()
    await vm().selectQr(new globalThis.File(['png'],'good.png',{type:'image/png'}))
    await vm().previewFailed(selected);expect(vm().invalidFile).toBeNull()
    h.session.paymentInformationRequest.mockRejectedValueOnce(createInternalProblem('invalidInput',{errors:{bankName:['Проверьте банк.']}}))
    await vm().save();expect(wrapper.get('#bankName-error').text()).toContain('Проверьте банк.')
    expect(vm().form.recipientName).toBe('Черновик')
    const count=h.session.paymentInformationRequest.mock.calls.length
    vm().busy=true;await vm().save();await vm().refresh();await vm().selectQr(selected)
    expect(h.session.paymentInformationRequest).toHaveBeenCalledTimes(count)
  })
  it('clears KPP for individual entrepreneurs and freezes published editors',async()=>{
    await render()
    await wrapper.get('#recipientType').setValue('1');expect(vm().form.kpp).toBe('')
    wrapper.unmount()
    h.session.paymentInformationRequest.mockImplementation(async path=>path===root+'/ops'?copy(ops):path.includes('/qr?')?new globalThis.Blob(['png'],{type:'image/png'}):paymentRow('disabled'))
    await render()
    expect(vm().editable).toBe(false);expect(wrapper.get('#recipientName').element.disabled).toBe(true)
    expect(wrapper.find('button[aria-label="Сохранить черновик"]').exists()).toBe(false)
    const count=h.session.paymentInformationRequest.mock.calls.length
    await vm().save();await vm().selectQr(new globalThis.File(['png'],'qr.png',{type:'image/png'}));await vm().previewFailed(null)
    expect(h.session.paymentInformationRequest).toHaveBeenCalledTimes(count)
  })
  it('rejects contradictory successful save responses and presents failed loads safely',async()=>{
    await render();await wrapper.get('#recipientName').setValue('Черновик')
    h.session.paymentInformationRequest.mockResolvedValueOnce(paymentRow('enabled'))
    await vm().save();expect(vm().committed).toBe(false);expect(vm().form.recipientName).toBe('Черновик')
    h.push.mockRejectedValueOnce(new Error('private'));await vm().back();expect(wrapper.text()).not.toContain('private')
    wrapper.unmount();h.session.paymentInformationRequest.mockRejectedValue(new Error('private'))
    await render();expect(vm().form).toBeNull();expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })
  it('ignores old saves and loads after identity, route changes or unmount',async()=>{
    await render();await wrapper.get('#recipientName').setValue('Черновик')
    const save=pending();h.session.paymentInformationRequest.mockReturnValueOnce(save.promise)
    const action=vm().save();await flushPromises()
    h.session.user.value={id:2,roles:['operator']};save.resolve(row);await action
    expect(vm().form).toBeNull();expect(h.push).not.toHaveBeenCalled()
    h.session.user.value={id:1,roles:['administrator']};await flushPromises()
    const old=pending();h.session.paymentInformationRequest.mockReturnValueOnce(old.promise)
    const load=vm().load();h.route.params.id='2';await flushPromises()
    old.reject(new Error('old'));await load;expect(vm().form).toBeNull()
    h.session.paymentInformationRequest.mockResolvedValueOnce(ops)
    const later=pending();h.session.paymentInformationRequest.mockReturnValueOnce(later.promise)
    const last=vm().load();await flushPromises();wrapper.unmount();wrapper=null;later.resolve(row);await last
  })
})

describe('payment bundle list',()=>{
  it('uses shared server table actions, observed selection tokens, copying and inactive publication deletion',async()=>{
    await render(PaymentInformationBundlesView)
    expect(wrapper.findComponent(ListFilterBar).exists()).toBe(true);expect(vm().total).toBe(3)
    expect(wrapper.findComponent({name:'VDataTableServer'}).props('headers').map(header=>header.key))
      .toEqual(['actions','recipientName','inn','bankName','state','createdAt'])
    expect(wrapper.get('button[aria-label="Перед удалением прекратите использование"]').element.disabled).toBe(true)
    h.session.paymentInformationRequest.mockResolvedValueOnce(paymentRow('enabled'))
    await vm().mutate(rows[0],'enable')
    const enable=h.session.paymentInformationRequest.mock.calls.find(([path,options])=>path.endsWith('/enable')&&options?.method==='POST')
    expect(JSON.parse(enable[1].body)).toEqual({version:row.version,expectedEnabled:{id:2,version:row.version}})
    h.session.paymentInformationRequest.mockResolvedValueOnce(paymentRow('disabled',2))
    await vm().mutate(rows[1],'disable')
    h.session.paymentInformationRequest.mockResolvedValueOnce(paymentRow('draft',4))
    await vm().mutate(rows[2],'copy');expect(h.push).toHaveBeenCalledWith(root+'/4')
    vm().requestDeletion(rows[1]);expect(vm().removing).toBeNull()
    vm().requestDeletion(rows[2]);expect(vm().removing.id).toBe(3)
    wrapper.findComponent(ConfirmDialog).vm.$emit('cancel');expect(vm().removing).toBeNull()
    vm().requestDeletion(rows[2]);h.session.paymentInformationRequest.mockResolvedValueOnce(null)
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm');await flushPromises()
    expect(h.session.paymentInformationRequest.mock.calls.some(([path,options])=>path===root+'/3'&&options?.method==='DELETE')).toBe(true)
    await vm().open();expect(h.push).toHaveBeenCalledWith(root+'/new')
  })
  it('allows disable-all selection, disables incomplete drafts with accessible explanation and rejects stale selections',async()=>{
    rows=[{...row,qrUrl:null,canEnable:false},paymentRow('disabled',3)]
    await render(PaymentInformationBundlesView)
    expect(wrapper.find('.action-button-disabled[aria-label*="заполните"]').exists()).toBe(true)
    const count=h.session.paymentInformationRequest.mock.calls.length
    await vm().mutate(rows[0],'enable');expect(h.session.paymentInformationRequest).toHaveBeenCalledTimes(count)
    h.session.paymentInformationRequest.mockResolvedValueOnce(paymentRow('enabled',3))
    await vm().mutate(rows[1],'enable')
    const [,options]=h.session.paymentInformationRequest.mock.calls.find(([path])=>path.endsWith('/enable'))
    expect(JSON.parse(options.body).expectedEnabled).toBeNull()
    h.session.paymentInformationRequest.mockRejectedValueOnce(new ProblemError({type:PAYMENT_CONFLICTS[0],detail:'Обновите список.'}))
    await vm().mutate(rows[1],'enable');expect(vm().locked).toBe(true)
    await vm().mutate(rows[1],'enable');expect(vm().problem.type).toBe(PAYMENT_CONFLICTS[0])
    await vm().load();expect(vm().locked).toBe(false)
  })
  it('persists server paging, sort, filters and debounced search',async()=>{
    await render(PaymentInformationBundlesView)
    await vm().filter('state','draft');expect(vm().state.page).toBe(1)
    await vm().pageSize(25);expect(vm().state.pageSize).toBe(25)
    await vm().sort([{key:'bankName',order:'asc'}]);expect(vm().state.sortBy[0].key).toBe('bankName')
    const table=wrapper.findComponent({name:'VDataTableServer'})
    table.vm.$emit('update:page',1);table.vm.$emit('update:itemsPerPage',25);table.vm.$emit('update:sortBy',[])
    await vm().page(0);await vm().pageSize(11);await vm().sort([{key:'invalid',order:'asc'}])
    vi.useFakeTimers()
    vm().filter('search',' Банк ');expect(vm().state.filters.search).toBe(' Банк ')
    await vi.advanceTimersByTimeAsync(300);await flushPromises();vi.useRealTimers()
    expect(h.session.paymentInformationRequest.mock.calls.at(-1)[0]).toContain('search=%D0%91%D0%B0%D0%BD%D0%BA')
    wrapper.findComponent(ListFilterBar).vm.$emit('update:search','');await flushPromises()
    await vm().load()
    h.session.paymentInformationRequest.mockResolvedValueOnce(paymentPage([],new globalThis.URLSearchParams('page=2&pageSize=25&sortBy=bankName&sortOrder=asc&state=draft')))
    await vm().page(2);expect(vm().state.page).toBe(1)
  })
  it('handles storage failure, invalid envelopes, load failures and navigation failure',async()=>{
    vi.spyOn(globalThis.Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('private')})
    await render(PaymentInformationBundlesView)
    await vm().filter('state','disabled');expect(vm().preferenceProblem).not.toBeNull()
    h.session.paymentInformationRequest.mockResolvedValueOnce({})
    await vm().load();expect(vm().rows).toEqual([]);expect(vm().problem).not.toBeNull()
    h.session.paymentInformationRequest.mockRejectedValueOnce(new Error('private'))
    await vm().load();expect(wrapper.text()).not.toContain('private')
    h.push.mockRejectedValueOnce(new Error('private'));await vm().open(1)
    expect(vm().problem).not.toBeNull()
  })
  it('guards busy actions, contradictions, identity changes and stale responses',async()=>{
    await render(PaymentInformationBundlesView)
    h.session.paymentInformationRequest.mockResolvedValueOnce(paymentRow('disabled'))
    await vm().mutate(rows[0],'enable');expect(vm().problem).not.toBeNull()
    await vm().load()
    const old=pending();h.session.paymentInformationRequest.mockReturnValueOnce(old.promise)
    const action=vm().mutate(rows[0],'enable');await flushPromises()
    const count=h.session.paymentInformationRequest.mock.calls.length
    await vm().load();await vm().filter('state','draft');await vm().sort([]);await vm().page(2);await vm().pageSize(25);await vm().mutate(rows[0],'enable');vm().requestDeletion(rows[2])
    expect(h.session.paymentInformationRequest).toHaveBeenCalledTimes(count)
    h.session.user.value={id:2,roles:['operator']};old.resolve(paymentRow('enabled'));await action
    expect(vm().rows).toEqual([]);expect(vm().total).toBe(0);expect(vm().removing).toBeNull()
    h.session.user.value={id:1,roles:['administrator']};await flushPromises()
    const deferred=pending();h.session.paymentInformationRequest.mockReturnValueOnce(deferred.promise)
    const load=vm().load();h.session.user.value=null;deferred.reject(new Error('old'));await load
    expect(vm().problem).toBeNull()
    const count2=h.session.paymentInformationRequest.mock.calls.length
    await vm().mutate(rows[0],'enable');expect(h.session.paymentInformationRequest).toHaveBeenCalledTimes(count2)
  })
})

it('connects each visible header, row and filter action to the catalogue workflow',async()=>{
  await render(PaymentInformationBundlesView)
  expect(wrapper.findComponent({name:'VDataTableServer'}).props('headers')[0].title).toBe('')
  await wrapper.get('button[aria-label="Обновить список"]').trigger('click');await flushPromises()
  await wrapper.get('button[aria-label="Создать реквизиты"]').trigger('click');expect(h.push).toHaveBeenLastCalledWith(root+'/new')
  await wrapper.get('button[aria-label="Редактировать реквизиты"]').trigger('click');expect(h.push).toHaveBeenLastCalledWith(root+'/1')
  await wrapper.findAll('button[aria-label="Открыть реквизиты"]')[0].trigger('click');expect(h.push).toHaveBeenLastCalledWith(root+'/2')
  h.session.paymentInformationRequest.mockResolvedValueOnce(paymentRow('draft',4))
  await wrapper.findAll('button[aria-label="Копировать в новый черновик"]')[0].trigger('click');await flushPromises()
  expect(h.push).toHaveBeenLastCalledWith(root+'/4')
  h.session.paymentInformationRequest.mockResolvedValueOnce(paymentRow('enabled'))
  await wrapper.get('button[aria-label^="Использовать реквизиты"]').trigger('click');await flushPromises()
  h.session.paymentInformationRequest.mockResolvedValueOnce(paymentRow('disabled',2))
  await wrapper.get('button[aria-label="Прекратить использование"]').trigger('click');await flushPromises()
  await wrapper.findAll('button[aria-label="Удалить реквизиты"]')[0].trigger('click')
  expect(vm().removing.id).toBe(1)
  wrapper.findComponent(ConfirmDialog).vm.$emit('cancel')
  wrapper.findComponent({name:'VSelect'}).vm.$emit('update:modelValue','enabled');await flushPromises()
  expect(vm().state.filters.state).toBe('enabled')
  await vm().filter('search',null);await vm().load()
})

it.each([
  ['disable',paymentRow('enabled',2),paymentRow('enabled',2)],
  ['copy',paymentRow('disabled',3),paymentRow('draft',3)],
  ['copy',paymentRow('disabled',3),paymentRow('enabled',4)]
])('rejects contradictory %s responses and requires refresh',async(action,selected,response)=>{
  await render(PaymentInformationBundlesView)
  h.session.paymentInformationRequest.mockResolvedValueOnce(response)
  await vm().mutate(selected,action)
  expect(vm().locked).toBe(true);expect(vm().problem).not.toBeNull()
})

it('discards stale successful list metadata and rows and never navigates a copy across identities',async()=>{
  const metadata=pending();h.session.paymentInformationRequest.mockReturnValueOnce(metadata.promise)
  await render(PaymentInformationBundlesView)
  h.session.user.value=null;metadata.resolve(ops);await flushPromises()
  expect(vm().rows).toEqual([])
  h.session.user.value={id:1,roles:['administrator']};await flushPromises()
  const result=pending();h.session.paymentInformationRequest.mockReturnValueOnce(result.promise)
  const loading=vm().load();h.session.user.value=null
  result.resolve(paymentPage(rows));await loading;expect(vm().rows).toEqual([])
  h.session.user.value={id:1,roles:['administrator']};await flushPromises()
  const reload=pending()
  h.session.paymentInformationRequest.mockResolvedValueOnce(paymentRow('draft',4)).mockReturnValueOnce(reload.promise)
  const copying=vm().mutate(rows[2],'copy');await flushPromises()
  h.session.user.value={id:2,roles:['administrator']};await flushPromises()
  reload.resolve(paymentPage(rows));await copying
  expect(h.push).not.toHaveBeenCalled()
})

it.each(['navigation','newer refresh'])('discards copy navigation after %s interrupts its reload',async interruption=>{
  await render(PaymentInformationBundlesView)
  const reload=pending()
  h.session.paymentInformationRequest.mockResolvedValueOnce(paymentRow('draft',4)).mockReturnValueOnce(reload.promise)
  const view=vm(), copying=view.mutate(rows[2],'copy')
  await flushPromises()
  if(interruption==='navigation') { wrapper.unmount();wrapper=null }
  else await view.load()
  reload.resolve(paymentPage(rows));await copying
  expect(h.push).not.toHaveBeenCalled()
})

it('shows incomplete row fallbacks and storage-read recovery without logging financial information',async()=>{
  vi.spyOn(globalThis.Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('private')})
  rows=[{...row,information:Object.fromEntries(Object.keys(row.information).map(key=>[key,null])),qrUrl:null,canEnable:false}]
  await render(PaymentInformationBundlesView)
  expect(vm().preferenceProblem).not.toBeNull();expect(wrapper.text()).toContain('—');expect(wrapper.text()).not.toContain('private')
})

it('handles aborted editor navigation without repeating a successful save',async()=>{
  await render()
  await wrapper.get('#recipientName').setValue('Черновик')
  h.push.mockResolvedValueOnce(new Error('unexpected navigation result'))
  h.session.paymentInformationRequest.mockResolvedValueOnce(copy(row))
  await vm().save()
  expect(vm().committed).toBe(true);expect(vm().dirty).toBe(false);expect(vm().problem).not.toBeNull()
})

it('uses the shared preview lifecycle but validates payment-specific authenticated QR routes',async()=>{
  await render(PaymentQrPreview,{url:row.qrUrl})
  expect(wrapper.get('img').attributes('alt')).toBe('QR СБП получателя')
  expect(h.session.paymentInformationRequest).toHaveBeenCalledWith(row.qrUrl.slice('/api/v1/backoffice'.length),{},'blob')
  await wrapper.setProps({url:'https://evil.test/qr'});await flushPromises()
  expect(wrapper.find('img').exists()).toBe(false);expect(wrapper.text()).toContain('Изображение недоступно')
  const file=new globalThis.File(['png'],'qr.png',{type:'image/png'})
  await wrapper.setProps({file});await flushPromises()
  wrapper.getComponent(StaffImagePreview).vm.$.setupState.failed({target:{getAttribute:()=> 'obsolete'}})
  await wrapper.get('img').trigger('error')
  expect(wrapper.emitted('invalid-file')).toEqual([[file]])
})
