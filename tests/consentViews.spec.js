// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { ref, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import LegalDocumentsView from '../src/views/LegalDocumentsView.vue'
import LegalDocumentView from '../src/views/LegalDocumentView.vue'
import LegalDocumentAuditView from '../src/views/LegalDocumentAuditView.vue'
import PrivacyRequestsView from '../src/views/PrivacyRequestsView.vue'
import LegalDocumentReader from '../src/components/LegalDocumentReader.vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
import { createInternalProblem } from '../src/errors/problem.js'
import { LEGAL_DOCUMENT_KIND, documentNodes, moscowDate, moscowDateInput, moscowTime, isDocumentId } from '../src/consentFormatting.js'
const h = vi.hoisted(() => ({ session:{}, router:{}, route:{} }))
vi.mock('../src/stores/session.js', () => ({ useSession:() => h.session }))
vi.mock('vue-router', () => ({ useRouter:() => h.router, useRoute:() => h.route }))
const id = '11111111-1111-1111-1111-111111111111'
const ops = { kinds:[
  { value:0, name:'Согласие на использование куки', routeAlias:'cookie-consent' },
  { value:1, name:'Согласие на обработку персональных данных', routeAlias:'personal-data-consent' },
  { value:2, name:'Пользовательское соглашение', routeAlias:'user-agreement' },
  { value:3, name:'Правила заказа товаров', routeAlias:'order-rules' },
  { value:4, name:'Политика обработки персональных данных', routeAlias:'privacy-policy' }
], cookieCategories:[{ value:0, name:'Обязательные', required:true }] }
const doc = { id, kind:LEGAL_DOCUMENT_KIND.PERSONAL_DATA_CONSENT, title:'Отдельное согласие', displayVersion:'2', html:'<p>Правовой текст</p>', sourceHash:'b'.repeat(64), contentHash:'a'.repeat(64), cookieCategories:[], effectiveAt:'2027-09-07T21:00:00Z', canDelete:true }
const audit = { id:1, documentId:id, actorId:1, actorName:'Иванов Иван', action:'created', at:'2026-09-07T09:00:00Z', kind:doc.kind, title:doc.title, displayVersion:doc.displayVersion, effectiveAt:doc.effectiveAt }
const withdrawalRequest = { customerId:7, requestedAt:'2026-09-01T09:00:00Z', processed:false }
const failure = () => createInternalProblem('networkUnavailable')
let wrapper
let withdrawalRows
const vm = () => wrapper.vm.$.setupState
function render(view, route = { path:'/', params:{}, query:{} }) { h.route = route; wrapper = mount(view, { global:{ plugins:[createSarafanVuetify()], stubs:{ VDialog:{ props:['modelValue'], template:'<section v-if="modelValue"><slot /></section>' }, RouterLink:{ props:['to'], template:'<a :href="to"><slot /></a>' } } } }); return wrapper }
async function click(label) { await wrapper.get(`button[aria-label="${label}"]`).trigger('click'); await flushPromises() }
async function confirm() { wrapper.findComponent(ConfirmDialog).vm.$emit('confirm'); await flushPromises() }
function upload() { return { name:'consent.md', size:10, arrayBuffer:async () => new globalThis.TextEncoder().encode('# Текст').buffer } }
function pageResult(items, path, { total=items.length, defaultPageSize=25, defaultSortBy='at', defaultSortOrder='desc' } = {}) {
  const params = new globalThis.URL(path, 'https://sarafan.test').searchParams
  const currentPage = Number(params.get('page') || 1)
  const pageSize = Number(params.get('pageSize') || defaultPageSize)
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)
  return {
    items,
    pagination:{ currentPage, pageSize, totalCount:total, totalPages, hasNextPage:currentPage < totalPages, hasPreviousPage:currentPage > 1 },
    sorting:{ sortBy:params.get('sortBy') || defaultSortBy, sortOrder:params.get('sortOrder') || defaultSortOrder },
    search:params.get('search')
  }
}
beforeEach(() => {
  globalThis.localStorage.clear()
  h.router = { push:vi.fn(), replace:vi.fn() }
  h.session.user = ref({ id:1, roles:['administrator'] })
  h.session.getLegalDocumentOps = vi.fn().mockResolvedValue(ops)
  h.session.consentRequest = vi.fn(async path => {
    if (path === '/legal-documents') return [{ ...doc }]
    if (path.startsWith('/legal-documents/audit?')) return pageResult([{ ...audit }], path)
    if (path === '/legal-documents/preview') return { html:doc.html }
    if (path.endsWith('/source')) return new globalThis.Blob(['# Текст'])
    if (path.startsWith('/consents/withdrawal-requests?')) {
      const params = new globalThis.URL(path, 'https://sarafan.test').searchParams
      const search = params.get('search') || ''
      const processed = params.get('processed')
      const filtered = withdrawalRows.filter(item => String(item.customerId).includes(search)
        && (processed === null || String(item.processed) === processed))
      return pageResult(filtered, path, { defaultPageSize:10, defaultSortBy:'processed', defaultSortOrder:'asc' })
    }
    if (path === '/consents/withdrawal-requests/processed') {
      withdrawalRows = withdrawalRows.map(item => item.customerId === withdrawalRequest.customerId ? { ...item, processed:true } : item)
      return { ...withdrawalRequest, processed:true }
    }
    return { ...doc }
  })
  withdrawalRows = [{ ...withdrawalRequest }, { customerId:8, requestedAt:'2026-08-01T09:00:00Z', processed:true }]
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:test'); globalThis.URL.revokeObjectURL = vi.fn()
  vi.spyOn(globalThis.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('requires a current server preview before immutable creation and preserves failed forms', async () => {
  render(LegalDocumentView, { path:'/legal-documents/new', params:{}, query:{} }); await flushPromises()
  expect(wrapper.text()).not.toContain('Загрузка правового документа')
  expect(wrapper.findAllComponents({name:'VTextField'}).some(field => field.props('label') === 'Версия')).toBe(true)
  expect(wrapper.findComponent({name:'VFileInput'}).props('label')).toContain('256 Кб')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.text()).toContain('Загрузите файл Markdown с расширением .md')
  vm().file = { name:'bad.pdf', size:4 }; await vm().previewDocument(); expect(wrapper.text()).toContain('Выберите файл Markdown с расширением .md')
  vm().file = { name:'empty.md', size:0 }; await vm().previewDocument(); expect(wrapper.text()).toContain('Выбранный файл пуст')
  vm().file = { name:'big.md', size:262145 }; await vm().previewDocument(); expect(wrapper.text()).toContain('Размер файла не должен превышать 256 Кб')
  vm().form.title = 'Сохранить это название'; vm().form.displayVersion = ''; vm().form.effectiveDate = '2027-09-08'; vm().file = [upload()]
  h.session.consentRequest.mockRejectedValueOnce(failure()); await vm().previewDocument()
  expect(vm().form.title).toBe('Сохранить это название')
  h.session.consentRequest.mockResolvedValueOnce({ html:doc.html })
  await vm().previewDocument(); await nextTick()
  const previewCall = h.session.consentRequest.mock.calls.find(x => x[0] === '/legal-documents/preview' && x[1]?.method === 'POST')
  expect(JSON.parse(previewCall[1].body)).toMatchObject({ title:'Сохранить это название', displayVersion:'', effectiveDate:'2027-09-08' })
  expect(JSON.parse(previewCall[1].body).source).toBeTruthy()
  expect(wrapper.text()).toContain('Правовой текст')
  const preview = wrapper.get('.legal-preview-surface')
  expect(preview.text()).toBe('Правовой текст')
  expect(preview.find('header').exists()).toBe(false)
  expect(preview.find('button').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('SHA-256')
  expect(wrapper.text()).not.toContain('Канонический текст')
  expect(wrapper.get('button[aria-label="Сохранить документ"]').attributes('disabled')).toBeDefined()
  vm().form.displayVersion = 'v2'; await nextTick()
  expect(vm().preview).not.toBeNull()
  expect(wrapper.get('button[aria-label="Сохранить документ"]').attributes('disabled')).toBeUndefined()
  h.session.consentRequest.mockRejectedValueOnce(failure()); await vm().save()
  const creationCall = h.session.consentRequest.mock.calls.filter(x => x[0] === '/legal-documents' && x[1]?.method === 'POST').at(-1)
  expect(JSON.parse(creationCall[1].body).displayVersion).toBe('v2')
  expect(vm().form.title).toBe('Сохранить это название')
  vm().form.title = 'Изменённое название'; await nextTick()
  expect(vm().preview).toBeNull()
  expect(wrapper.get('button[aria-label="Сохранить документ"]').attributes('disabled')).toBeDefined()
  h.session.consentRequest.mockResolvedValueOnce({ html:doc.html })
  await vm().previewDocument()
  h.session.consentRequest.mockResolvedValueOnce({ ...doc }); await vm().save()
  expect(h.router.replace).toHaveBeenCalledWith(`/legal-documents/${id}`)
})
it('preserves source bytes when base64 conversion crosses chunk boundaries', async () => {
  const source = 'a'.repeat(32769)
  const bytes = new globalThis.TextEncoder().encode(source)
  render(LegalDocumentView, { path:'/legal-documents/new', params:{}, query:{} }); await flushPromises()
  vm().file = { name:'large.md', size:bytes.length, arrayBuffer:async () => bytes.buffer }

  await vm().previewDocument()

  const previewCall = h.session.consentRequest.mock.calls.find(([path]) => path === '/legal-documents/preview')
  expect(JSON.parse(previewCall[1].body).source).toBe(globalThis.btoa(source))
})
it('shows read-only detail, confirms permitted deletion, and refreshes a boundary conflict', async () => {
  render(LegalDocumentView, { path:`/legal-documents/${id}`, params:{id}, query:{} }); await flushPromises()
  expect(wrapper.find('form').exists()).toBe(false)
  await wrapper.findComponent(LegalDocumentReader).vm.$emit('download'); await flushPromises()
  expect(h.session.consentRequest).toHaveBeenCalledWith(`/legal-documents/${id}/source`, expect.any(Object), 'blob')
  await click('Удалить документ до даты начала действия')
  wrapper.findComponent(ConfirmDialog).vm.$emit('cancel'); await nextTick()
  await click('Удалить документ до даты начала действия')
  const boundary = createInternalProblem('networkUnavailable')
  boundary.code = 'legal_document_already_effective'
  h.session.consentRequest.mockRejectedValueOnce(boundary).mockResolvedValueOnce({ ...doc, canDelete:false })
  await confirm()
  expect(h.session.consentRequest).toHaveBeenCalledWith(`/legal-documents/${id}`, { method:'DELETE' })
  expect(vm().selected.canDelete).toBe(false)
  expect(wrapper.find('button[aria-label="Удалить документ до даты начала действия"]').exists()).toBe(false)
  await click('Создать новый документ')
  expect(h.router.push).toHaveBeenCalledWith({ path:'/legal-documents/new', query:{kind:LEGAL_DOCUMENT_KIND.PERSONAL_DATA_CONSENT} })
  wrapper.unmount(); h.session.consentRequest.mockResolvedValueOnce({ ...doc, canDelete:true })
  render(LegalDocumentView, { path:`/legal-documents/${id}`, params:{id}, query:{} }); await flushPromises()
  await click('Удалить документ до даты начала действия')
  h.session.consentRequest.mockResolvedValueOnce(null); await confirm()
  expect(h.router.push).toHaveBeenCalledWith('/legal-documents')
})
it('uses the shared legal-document list layout, routes actions, filters, and retries failures', async () => {
  h.session.consentRequest.mockRejectedValueOnce(failure()); render(LegalDocumentsView); await flushPromises()
  expect(wrapper.find('.page-alert').exists()).toBe(true)
  await click('Повторить загрузку'); expect(wrapper.find('.page-alert').exists()).toBe(false)
  expect(wrapper.get('.count').text()).toBe('1')
  const filterBar = wrapper.get('.filter-bar')
  expect(filterBar.findComponent({name:'VTextField'}).props()).toMatchObject({ density:'compact', variant:'solo', active:true })
  const filters = filterBar.findAllComponents({name:'VSelect'}); expect(filters).toHaveLength(1)
  filters[0].vm.$emit('update:modelValue',LEGAL_DOCUMENT_KIND.PERSONAL_DATA_CONSENT); await nextTick()
  const table = wrapper.findComponent({name:'VDataTable'}); table.vm.$emit('update:page',1); table.vm.$emit('update:itemsPerPage',25); table.vm.$emit('update:sortBy',[{key:'displayVersion',order:'desc'}]); await nextTick()
  await wrapper.get('.filter-search input').setValue('ничего'); expect(wrapper.text()).toContain('Правовые документы не найдены')
  await wrapper.get('.filter-search input').setValue('Отдельное'); await nextTick()
  await click('Создать новый документ'); expect(h.router.push).toHaveBeenCalledWith('/legal-documents/new')
  await click('Открыть журнал действий'); expect(h.router.push).toHaveBeenCalledWith('/legal-documents/audit')
  await click('Открыть документ'); expect(h.router.push).toHaveBeenCalledWith(`/legal-documents/${id}`)

  wrapper.unmount(); h.session.consentRequest.mockRejectedValueOnce(failure())
  render(LegalDocumentView, { path:`/legal-documents/${id}`, params:{id}, query:{} }); await flushPromises()
  expect(wrapper.find('.page-alert').exists()).toBe(true)
  await click('Повторить загрузку'); expect(wrapper.find('.page-alert').exists()).toBe(false)
})
it('loads, filters, paginates and returns from the legal-document audit table', async () => {
  render(LegalDocumentAuditView); await flushPromises()
  expect(wrapper.text()).toContain('Иванов Иван')
  expect(wrapper.text()).toContain('Создан')
  await wrapper.get('.filter-search input').setValue('Отдельное')
  await new Promise(resolve => globalThis.setTimeout(resolve, 310)); await flushPromises()
  const filters = wrapper.get('.filter-bar').findAllComponents({name:'VSelect'})
  filters[0].vm.$emit('update:modelValue',LEGAL_DOCUMENT_KIND.PERSONAL_DATA_CONSENT)
  filters[1].vm.$emit('update:modelValue','deleted')
  await flushPromises()
  expect(h.session.consentRequest.mock.calls.some(([path]) => path.includes('search=%D0%9E%D1%82%D0%B4%D0%B5%D0%BB%D1%8C%D0%BD%D0%BE%D0%B5') && path.includes('action=deleted'))).toBe(true)
  await click('Вернуться к документам')
  expect(h.router.push).toHaveBeenCalledWith('/legal-documents')
})
it('retries audit failures and enforces pagination boundaries', async () => {
  h.session.consentRequest.mockRejectedValueOnce(failure())
  render(LegalDocumentAuditView); await flushPromises()
  expect(wrapper.find('.page-alert').exists()).toBe(true)
  h.session.consentRequest.mockImplementationOnce(path => Promise.resolve(pageResult(
    [{ ...audit, actorName:'', action:'legacy' }], path, { total:30 })))
  await click('Повторить загрузку')
  expect(wrapper.text()).toContain('ID 1')
  expect(wrapper.text()).toContain('legacy')
  const table = wrapper.findComponent({name:'VDataTableServer'})
  h.session.consentRequest.mockImplementationOnce(path => Promise.resolve(pageResult([{ ...audit }], path, { total:30 })))
  table.vm.$emit('update:page',2); await flushPromises()
  expect(vm().page).toBe(2)
  h.session.consentRequest.mockImplementationOnce(path => Promise.resolve(pageResult([{ ...audit }], path, { total:30 })))
  table.vm.$emit('update:page',1); await flushPromises()
  expect(vm().page).toBe(1)
})
it('restores server-table state across fresh mounts and corrects a stale last page once', async () => {
  const key = 'sarafan.backoffice.view-state.v1.1.privacy-requests'
  globalThis.localStorage.setItem(key, JSON.stringify({
    version:1,
    page:2,
    pageSize:25,
    sortBy:[{ key:'customerId', order:'desc' }],
    filters:{ search:'7', processed:'false' }
  }))
  h.session.consentRequest.mockImplementation(async path => {
    if (path.startsWith('/consents/withdrawal-requests?')) {
      return pageResult([{ ...withdrawalRequest }], path,
        { total:50, defaultPageSize:10, defaultSortBy:'processed', defaultSortOrder:'asc' })
    }
    return { ...doc }
  })

  render(PrivacyRequestsView); await flushPromises()
  expect(h.session.consentRequest).toHaveBeenCalledWith(expect.stringContaining('page=2&pageSize=25&sortBy=customerId&sortOrder=desc'))
  expect(h.session.consentRequest).toHaveBeenCalledWith(expect.stringContaining('search=7&processed=false'))
  h.session.user.value = null
  await nextTick()
  expect(globalThis.localStorage.getItem(key)).not.toBeNull()
  h.session.user.value = { id:1, roles:['administrator'] }
  wrapper.unmount()
  h.session.consentRequest.mockClear()
  render(PrivacyRequestsView); await flushPromises()
  expect(h.session.consentRequest).toHaveBeenCalledWith(expect.stringContaining('page=2&pageSize=25&sortBy=customerId&sortOrder=desc'))

  wrapper.unmount()
  globalThis.localStorage.setItem('sarafan.backoffice.view-state.v1.1.legal-document-audit', JSON.stringify({
    version:1,
    page:4,
    pageSize:25,
    sortBy:[{ key:'at', order:'desc' }],
    filters:{ search:'', kind:null, action:'' }
  }))
  h.session.consentRequest.mockImplementation(async path => path.startsWith('/legal-documents/audit?')
    ? pageResult(new globalThis.URL(path, 'https://sarafan.test').searchParams.get('page') === '1' ? [{ ...audit }] : [], path, { total:1 })
    : { ...doc })
  render(LegalDocumentAuditView); await flushPromises()
  const auditCalls = h.session.consentRequest.mock.calls.map(([path]) => path).filter(path => path.startsWith('/legal-documents/audit?'))
  expect(auditCalls).toHaveLength(2)
  expect(auditCalls[0]).toContain('page=4')
  expect(auditCalls[1]).toContain('page=1')
  expect(vm().page).toBe(1)
  expect(JSON.parse(globalThis.localStorage.getItem('sarafan.backoffice.view-state.v1.1.legal-document-audit')).page).toBe(1)
})
it('ignores stale list results and rejects malformed page envelopes', async () => {
  const pending = []
  h.session.consentRequest.mockImplementation(path => {
    if (!path.startsWith('/consents/withdrawal-requests?')) return Promise.resolve({ ...doc })
    return new Promise(resolve => pending.push({ path, resolve }))
  })
  render(PrivacyRequestsView); await nextTick()
  wrapper.findComponent({name:'VSelect'}).vm.$emit('update:modelValue','false'); await nextTick()
  expect(pending).toHaveLength(2)
  pending[1].resolve(pageResult([{ ...withdrawalRequest }], pending[1].path,
    { defaultPageSize:10, defaultSortBy:'processed', defaultSortOrder:'asc' }))
  await flushPromises()
  pending[0].resolve(pageResult([{ customerId:99, requestedAt:withdrawalRequest.requestedAt, processed:true }], pending[0].path,
    { defaultPageSize:10, defaultSortBy:'processed', defaultSortOrder:'asc' }))
  await flushPromises()
  expect(vm().rows.map(item => item.customerId)).toEqual([7])

  wrapper.unmount()
  h.session.consentRequest.mockResolvedValueOnce({ items:[], pagination:{ currentPage:1 } })
  render(PrivacyRequestsView); await flushPromises()
  expect(wrapper.find('.page-alert').exists()).toBe(true)
  expect(vm().rows).toEqual([])
})
it('keeps tables usable and shows one safe notice when local preferences are unavailable', async () => {
  vi.stubGlobal('localStorage', {
    getItem:vi.fn(() => { throw new globalThis.DOMException('private preference contents') }),
    setItem:vi.fn(() => { throw new globalThis.DOMException('private preference contents') }),
    removeItem:vi.fn()
  })
  const warn = vi.spyOn(globalThis.console, 'warn').mockImplementation(() => {})
  const error = vi.spyOn(globalThis.console, 'error').mockImplementation(() => {})

  render(PrivacyRequestsView); await flushPromises()

  expect(wrapper.findComponent({name:'VDataTableServer'}).exists()).toBe(true)
  expect(wrapper.text()).toContain('Список доступен, но браузер не может сохранить его параметры')
  expect(wrapper.findAll('.page-alert')).toHaveLength(1)
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})
it('validates and persists every audit and queue server-table event', async () => {
  h.session.consentRequest.mockImplementation(async path => {
    if (path.startsWith('/legal-documents/audit?')) return pageResult([{ ...audit }], path, { total:100 })
    if (path.startsWith('/consents/withdrawal-requests?')) {
      return pageResult([{ ...withdrawalRequest }], path,
        { total:100, defaultPageSize:10, defaultSortBy:'processed', defaultSortOrder:'asc' })
    }
    return { ...doc }
  })
  render(LegalDocumentAuditView); await flushPromises()
  const initialAuditCalls = h.session.consentRequest.mock.calls.length
  for (const invalid of [null, 0, 1]) vm().onPageChange(invalid)
  vm().onPageSizeChange(12)
  vm().onPageSizeChange(25)
  vm().onSortChange(null)
  vm().onSortChange([{ key:'unknown', order:'asc' }])
  vm().onSortChange([{ key:'title', order:'sideways' }])
  await nextTick()
  expect(h.session.consentRequest.mock.calls).toHaveLength(initialAuditCalls)
  vm().onPageChange(2); await flushPromises()
  vm().onPageSizeChange(50); await flushPromises()
  vm().onSortChange([{ key:'title', order:'asc' }]); await flushPromises()
  vm().onKindChange(99); await flushPromises()
  vm().onActionChange('unknown'); await flushPromises()
  vm().onSearchInput('first')
  vm().onSearchInput('second')
  await new Promise(resolve => globalThis.setTimeout(resolve, 310)); await flushPromises()
  expect(JSON.parse(globalThis.localStorage.getItem('sarafan.backoffice.view-state.v1.1.legal-document-audit')))
    .toMatchObject({ page:1, pageSize:50, sortBy:[{ key:'title', order:'asc' }], filters:{ search:'second', kind:null, action:'' } })

  wrapper.unmount()
  render(PrivacyRequestsView); await flushPromises()
  vm().sortBy = []
  vm().persistState()
  expect(JSON.parse(globalThis.localStorage.getItem('sarafan.backoffice.view-state.v1.1.privacy-requests')).sortBy)
    .toEqual([{ key:'processed', order:'asc' }])
  vm().sortBy = [{ key:'processed', order:'asc' }]
  const initialQueueCalls = h.session.consentRequest.mock.calls.length
  for (const invalid of [null, 0, 1]) vm().onPageChange(invalid)
  vm().onItemsPerPageChange(12)
  vm().onItemsPerPageChange(10)
  vm().onSortChange(null)
  vm().onSortChange([{ key:'unknown', order:'asc' }])
  vm().onSortChange([{ key:'customerId', order:'sideways' }])
  await nextTick()
  expect(h.session.consentRequest.mock.calls).toHaveLength(initialQueueCalls)
  vm().onPageChange(2); await flushPromises()
  vm().onItemsPerPageChange(25); await flushPromises()
  vm().onSortChange([{ key:'customerId', order:'desc' }]); await flushPromises()
  vm().onProcessedChange('unknown'); await flushPromises()
  vm().onSearchInput(null)
  vm().onSearchInput('customer 1234567890123')
  await new Promise(resolve => globalThis.setTimeout(resolve, 310)); await flushPromises()
  expect(JSON.parse(globalThis.localStorage.getItem('sarafan.backoffice.view-state.v1.1.privacy-requests')))
    .toMatchObject({ page:1, pageSize:25, sortBy:[{ key:'customerId', order:'desc' }], filters:{ search:'1234567890', processed:'' } })
})
it('corrects queue underflow and patches a processed row before authoritative refresh', async () => {
  globalThis.localStorage.setItem('sarafan.backoffice.view-state.v1.1.privacy-requests', JSON.stringify({
    version:1,
    page:3,
    pageSize:10,
    sortBy:[{ key:'processed', order:'asc' }],
    filters:{ search:'', processed:'' }
  }))
  render(PrivacyRequestsView); await flushPromises()
  expect(vm().page).toBe(1)
  expect(JSON.parse(globalThis.localStorage.getItem('sarafan.backoffice.view-state.v1.1.privacy-requests')).page).toBe(1)
  await vm().process(null)
  await vm().process({ ...withdrawalRequest, processed:true })
  await vm().process({ ...withdrawalRequest })
  expect(vm().rows.find(item => item.customerId === withdrawalRequest.customerId)?.processed).toBe(true)
  expect(h.session.consentRequest.mock.calls.filter(([path]) => path.startsWith('/consents/withdrawal-requests?')).length).toBeGreaterThanOrEqual(3)
})
it('rejects a malformed audit envelope and cancels pending search loads on unmount', async () => {
  h.session.consentRequest.mockResolvedValueOnce({ items:[], sorting:{ sortBy:'at', sortOrder:'desc' } })
  render(LegalDocumentAuditView); await flushPromises()
  expect(wrapper.find('.page-alert').exists()).toBe(true)
  wrapper.unmount()

  render(PrivacyRequestsView); await flushPromises()
  const calls = h.session.consentRequest.mock.calls.length
  vm().onSearchInput('7')
  wrapper.unmount()
  await new Promise(resolve => globalThis.setTimeout(resolve, 310)); await flushPromises()
  expect(h.session.consentRequest.mock.calls).toHaveLength(calls)
})
it('lists, filters and directly processes customer withdrawal requests', async () => {
  render(PrivacyRequestsView); await flushPromises()
  expect(wrapper.text()).toContain('Ожидает ручной обработки')
  expect(wrapper.text()).toContain('Обработан')
  const initialActions = wrapper.findAll('button[aria-label="Отметить запрос как обработанный"]')
  expect(initialActions).toHaveLength(2)
  expect(initialActions[1].attributes('disabled')).toBeDefined()
  await wrapper.get('.filter-search input').setValue('7')
  await new Promise(resolve => globalThis.setTimeout(resolve, 310)); await flushPromises()
  const filters = wrapper.get('.filter-bar').findAllComponents({name:'VSelect'})
  expect(filters).toHaveLength(1)
  filters[0].vm.$emit('update:modelValue','false'); await flushPromises()
  const table = wrapper.findComponent({name:'VDataTableServer'}); table.vm.$emit('update:itemsPerPage',25); await flushPromises(); table.vm.$emit('update:sortBy',[{key:'customerId',order:'desc'}]); await flushPromises()
  expect(table.props()).toMatchObject({ fixedHeader:true, density:'compact' })
  const actions = wrapper.findAll('button[aria-label="Отметить запрос как обработанный"]')
  expect(actions).toHaveLength(1)
  expect(actions[0].attributes('disabled')).toBeUndefined()
  await actions[0].trigger('click'); await flushPromises()
  const call = h.session.consentRequest.mock.calls.find(([path, options]) => path === '/consents/withdrawal-requests/processed' && options?.method === 'PUT')
  expect(JSON.parse(call[1].body)).toEqual({ customerId:7, requestedAt:'2026-09-01T09:00:00Z' })
  expect(vm().rows).toHaveLength(0)
  filters[0].vm.$emit('update:modelValue',''); await flushPromises()
  expect(wrapper.text()).toContain('Обработан')
})
it('retains the queue and shows the shared alert when processing fails', async () => {
  render(PrivacyRequestsView); await flushPromises()
  h.session.consentRequest.mockRejectedValueOnce(failure())
  await wrapper.findAll('button[aria-label="Отметить запрос как обработанный"]')[0].trigger('click'); await flushPromises()
  expect(wrapper.find('.page-alert').exists()).toBe(true)
  expect(wrapper.text()).toContain('№ 7')
  await click('Обновить обращения')
  expect(wrapper.find('.page-alert').exists()).toBe(false)
})
it('uses the same safe document format, print and exact source download as the customer reader', async () => {
  wrapper = mount(LegalDocumentReader, {props:{ document:doc }})
  vi.stubGlobal('print', vi.fn()); await wrapper.findAll('button')[1].trigger('click'); expect(globalThis.print).toHaveBeenCalled()
  await wrapper.findAll('button')[0].trigger('click'); expect(wrapper.emitted('download')).toHaveLength(1)
  await wrapper.setProps({contentOnly:true}); expect(wrapper.find('header').exists()).toBe(false); expect(wrapper.find('button').exists()).toBe(false)
  await wrapper.setProps({document:{...doc,html:'<script>bad</script>'}}); expect(wrapper.find('[role=alert]').exists()).toBe(true)
  expect(documentNodes('<h1>A</h1><a href="https://example.test" title="сайт">Ссылка</a><ol start="3"><li>Список</li></ol><table><tr><td style="text-align:center">Ячейка</td></tr></table>')).toHaveLength(4)
  for (const value of [null,'x'.repeat(2097153),'<img src=x>', '<!-- comment -->', '<a href="relative">bad</a>', '<a href="javascript:alert(1)">bad</a>', '<p onclick="x">bad</p>']) expect(() => documentNodes(value)).toThrow()
  expect(moscowTime(null)).toBe('—'); expect(moscowTime('bad')).toBe('—'); expect(moscowDate(null)).toBe('—'); expect(moscowDate('bad')).toBe('—'); expect(moscowDateInput('bad')).toBe(''); expect(moscowDateInput('2026-09-07T21:00:00Z')).toBe('2026-09-08'); expect(isDocumentId(id)).toBe(true); expect(isDocumentId(null)).toBe(false)
})
it('connects every legal-document form control to its submitted value', async () => {
  render(LegalDocumentView, { path:'/legal-documents/new', params:{}, query:{} }); await flushPromises()
  const fields = wrapper.findAllComponents({name:'VTextField'})
  fields.find(x => x.props('label') === 'Название').vm.$emit('update:modelValue','Название из формы')
  fields.find(x => x.props('label') === 'Версия').vm.$emit('update:modelValue','v3')
  fields.find(x => x.props('label') === 'Дата начала действия').vm.$emit('update:modelValue','2027-03-01')
  expect(fields.find(x => x.props('label') === 'Версия').classes()).toContain('legal-version')
  expect(fields.find(x => x.props('label') === 'Дата начала действия').classes()).toContain('legal-effective-date')
  wrapper.findComponent({name:'VFileInput'}).vm.$emit('update:modelValue',[upload()])
  await nextTick(); expect(vm().form).toMatchObject({title:'Название из формы',displayVersion:'v3',effectiveDate:'2027-03-01'})
  wrapper.findComponent({name:'VSelect'}).vm.$emit('update:modelValue',LEGAL_DOCUMENT_KIND.COOKIE_CONSENT); await nextTick()
  expect(wrapper.text()).toContain('Категория куки: Обязательные')
  expect(vm().form).not.toHaveProperty('cookieCategories')
  h.session.consentRequest.mockResolvedValueOnce({ html:doc.html }); await vm().previewDocument(); await nextTick()
})
