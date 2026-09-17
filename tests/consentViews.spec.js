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
import { createInternalProblem, ProblemError } from '../src/errors/problem.js'
import { LEGAL_DOCUMENT_KIND, documentNodes, moscowDate, moscowDateInput, moscowTime, isDocumentId } from '../src/consentFormatting.js'
const h = vi.hoisted(() => ({ session:{}, router:{}, route:{} }))
vi.mock('../src/stores/session.js', () => ({ useSession:() => h.session }))
vi.mock('vue-router', () => ({ useRouter:() => h.router, useRoute:() => h.route }))
const id = '11111111-1111-1111-1111-111111111111'
const ops = { kinds:[
  { value:1, name:'Согласие на обработку персональных данных', routeAlias:'personal-data-consent' },
  { value:2, name:'Пользовательское соглашение', routeAlias:'user-agreement' },
  { value:3, name:'Правила заказа товаров', routeAlias:'order-rules' },
  { value:4, name:'Политика обработки персональных данных', routeAlias:'privacy-policy' }
] }
const doc = { id, status:'future', kind:LEGAL_DOCUMENT_KIND.PERSONAL_DATA_CONSENT, locale:'ru', title:'Отдельное согласие', displayVersion:'2', html:'<p>Правовой текст</p>', sourceHash:'b'.repeat(64), contentHash:'a'.repeat(64), effectiveAt:'2027-09-07T21:00:00Z', canDelete:true }
const audit = { id:1, documentId:id, actorId:1, actorName:'Иванов Иван', action:'created', at:'2026-09-07T09:00:00Z', kind:doc.kind, title:doc.title, displayVersion:doc.displayVersion, effectiveAt:doc.effectiveAt }
const withdrawalRequest = { customerId:7, requestedAt:'2026-09-01T09:00:00Z', processed:false }
const failure = () => createInternalProblem('networkUnavailable')
let wrapper
let withdrawalRows
const vm = () => wrapper.vm.$.setupState
function render(view, route = { path:'/', params:{}, query:{} }, attachTo) { h.route = route; wrapper = mount(view, { attachTo, global:{ plugins:[createSarafanVuetify()], stubs:{ VDialog:{ props:['modelValue'], template:'<section v-if="modelValue"><slot /></section>' }, RouterLink:{ props:['to'], template:'<a :href="to"><slot /></a>' } } } }); return wrapper }
async function click(label) { await wrapper.get(`button[aria-label="${label}"]`).trigger('click'); await flushPromises() }
function openConfirm() { return wrapper.findAllComponents(ConfirmDialog).find(dialog => dialog.props('open')) }
async function confirm() { openConfirm().vm.$emit('confirm'); await flushPromises() }
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
    search:params.get('search'),
    requestedFrom:params.get('requestedFrom'),
    requestedTo:params.get('requestedTo')
  }
}
beforeEach(() => {
  globalThis.localStorage.clear()
  h.router = { push:vi.fn(), replace:vi.fn() }
  h.session.user = ref({ id:1, roles:['administrator'] })
  h.session.getLegalDocumentOps = vi.fn().mockResolvedValue(ops)
  h.session.consentRequest = vi.fn(async path => {
    if (path.startsWith('/legal-documents?kind=')) return [{ ...doc }]
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
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

it.each([PrivacyRequestsView, LegalDocumentAuditView])('keeps server-list filters focused and ignores superseded replies during debounce', async view => {
  vi.useFakeTimers()
  try {
    render(view, { path:'/', params:{}, query:{} }, document.body)
    await flushPromises()
    const input = wrapper.get('.filter-search input')
    input.element.focus()
    let finish
    h.session.consentRequest.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await input.setValue('7')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(vm().busy).toBe(true)
    expect(input.element.matches(':disabled')).toBe(false)
    expect(wrapper.get('fieldset.filter-bar').findAllComponents({ name:'VSelect' }).every(select => select.props('disabled'))).toBe(true)
    expect(document.activeElement).toBe(input.element)
    await input.setValue('76')
    finish({ invalid:true })
    await flushPromises()
    expect(vm().problem).toBeNull()
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(h.session.consentRequest.mock.calls.at(-1)[0]).toContain('search=76')
    expect(wrapper.get('fieldset.filter-bar').findAllComponents({ name:'VSelect' }).every(select => !select.props('disabled'))).toBe(true)
    expect(document.activeElement).toBe(input.element)
  } finally {
    vi.useRealTimers()
  }
})
it('shows and combines legal document status filters with search and kind', async () => {
  h.session.consentRequest.mockResolvedValueOnce([
    { ...doc, id:'old', title:'Согласие старое', status:'outdated' },
    { ...doc, id:'current', title:'Согласие текущее', status:'current' },
    { ...doc, id:'future', title:'Согласие будущее', status:'future' }
  ])
  render(LegalDocumentsView); await flushPromises()
  expect(vm().filtered.map(item => item.statusTitle)).toEqual(['Не актуальный', 'Актуальный', 'Будущий'])
  for (const value of ['outdated', 'current', 'future']) {
    vm().page = 2
    wrapper.findAllComponents({ name:'VSelect' }).find(select => select.props('label') === 'Статус').vm.$emit('update:modelValue', value)
    await nextTick()
    expect(vm().page).toBe(1)
    expect(vm().filtered.map(item => item.status)).toEqual([value])
  }
  vm().search = 'текущее'; await nextTick()
  expect(vm().filtered).toEqual([])
  vm().status = null; await nextTick()
  expect(vm().filtered.map(item => item.id)).toEqual(['current'])
  vm().kind = 2; await nextTick()
  expect(vm().filtered).toEqual([])
  h.session.consentRequest.mockResolvedValueOnce([{ ...doc, status:'unknown' }])
  await vm().load()
  expect(vm().problem).not.toBeNull()
})
it('requires a current server preview before immutable creation and preserves failed forms', async () => {
  render(LegalDocumentView, { path:'/legal-documents/new', params:{}, query:{} }); await flushPromises()
  expect(wrapper.text()).not.toContain('Загрузка правового документа')
  expect(wrapper.get('label[for="displayVersion"]').text()).toBe('Версия:')
  expect(wrapper.get('#legal-file-guidance').text()).toContain('256 Кб')
  const groups = wrapper.findAll('.header-action-groups > .header-actions')
  expect(groups).toHaveLength(1)
  expect(groups[0].findAll('button').map(button => button.attributes('aria-label'))).toEqual(['Обновить данные', 'Сохранить документ', 'Вернуться к списку'])
  expect(wrapper.get('button[aria-label="Сохранить документ"]').attributes('form')).toBe('legal-document-form')
  expect(wrapper.find('button[aria-label="Предварительный просмотр"]').exists()).toBe(false)
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
  expect(vm().preview).toBeNull()
  expect(wrapper.get('button[aria-label="Сохранить документ"]').attributes('disabled')).toBeDefined()
  await vm().previewDocument(); await nextTick()
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
  expect(h.router.replace).toHaveBeenCalledWith('/legal-documents')
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
it('refreshes pristine legal editors and confirms before clearing dirty source and preview state', async () => {
  render(LegalDocumentView, { path:'/legal-documents/new', params:{}, query:{} }); await flushPromises()
  expect(wrapper.get('button[aria-label="Сохранить документ"] .fa-check-double').exists()).toBe(true)
  const initialLoads = h.session.getLegalDocumentOps.mock.calls.length
  vm().busy = true; vm().requestRefresh(); vm().busy = false
  expect(h.session.getLegalDocumentOps).toHaveBeenCalledTimes(initialLoads)
  await click('Обновить данные')
  expect(h.session.getLegalDocumentOps).toHaveBeenCalledTimes(initialLoads + 1)
  expect(openConfirm()).toBeUndefined()

  vm().form.title = 'Несохранённый документ'
  vm().form.displayVersion = 'draft'
  const source = upload()
  vm().file = source
  h.session.consentRequest.mockResolvedValueOnce({ html:doc.html })
  await vm().previewDocument(); await nextTick()
  expect(vm().preview).not.toBeNull()
  const callsBeforeDirtyRefresh = h.session.getLegalDocumentOps.mock.calls.length
  await click('Обновить данные')
  expect(openConfirm().props()).toMatchObject({ action:'Сбросить и обновить', actionIcon:'$refresh' })
  expect(wrapper.get('button[aria-label="Сбросить и обновить"]').text()).toBe('Сбросить и обновить')
  openConfirm().vm.$emit('cancel'); await nextTick()
  expect(vm().form.title).toBe('Несохранённый документ')
  expect(vm().file).toMatchObject({ name:source.name, size:source.size })
  expect(vm().preview).not.toBeNull()
  expect(h.session.getLegalDocumentOps).toHaveBeenCalledTimes(callsBeforeDirtyRefresh)

  await click('Обновить данные')
  await confirm()
  expect(vm().form.title).toBe('Согласие на обработку персональных данных')
  expect(vm().form.displayVersion).toBe('')
  expect(vm().file).toBeNull()
  expect(vm().preview).toBeNull()
  expect(h.session.getLegalDocumentOps).toHaveBeenCalledTimes(callsBeforeDirtyRefresh + 1)
})

it('shows a minimal read-only document with header print/download actions and its derived end date', async () => {
  const nextDocument = { ...doc, id:'22222222-2222-2222-2222-222222222222', displayVersion:'3', effectiveAt:'2028-09-07T21:00:00Z' }
  h.session.consentRequest.mockImplementation(async path => {
    if (path === `/legal-documents/${id}`) return { ...doc }
    if (path.startsWith('/legal-documents?kind=')) return [{ ...nextDocument }, { ...doc }]
    if (path.endsWith('/source')) return new globalThis.Blob(['# Текст'])
    return { ...doc }
  })
  vi.stubGlobal('print', vi.fn())
  render(LegalDocumentView, { path:`/legal-documents/${id}`, params:{id}, query:{} }); await flushPromises()

  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.get('.primary-heading').text()).toBe('Отдельное согласие · Версия 2')
  expect(wrapper.get('.document-summary').text()).toContain('Дата начала действия')
  expect(wrapper.get('.document-summary').text()).toContain('08.09.2027')
  expect(wrapper.get('.document-summary').text()).toContain('Дата окончания действия')
  expect(wrapper.get('.document-summary').text()).toContain('08.09.2028')
  expect(wrapper.text()).not.toContain('Сохранённый документ')
  expect(wrapper.text()).not.toContain('Идентификатор')
  expect(wrapper.text()).not.toContain('SHA-256')
  expect(wrapper.find('button[aria-label="Создать новый документ"]').exists()).toBe(false)
  expect(wrapper.find('button[aria-label="Удаление невозможно после начала действия документа"]').exists()).toBe(false)
  expect(wrapper.findComponent(LegalDocumentReader).props('contentOnly')).toBe(true)

  const print = wrapper.get('button[aria-label="Распечатать"]')
  const download = wrapper.get('button[aria-label="Скачать"]')
  const groups = wrapper.findAll('.header-action-groups > .header-actions')
  expect(groups).toHaveLength(2)
  expect(groups[0].findAll('button').map(button => button.attributes('aria-label'))).toEqual(['Распечатать', 'Скачать'])
  expect(groups[1].findAll('button').map(button => button.attributes('aria-label'))).toEqual(['Обновить данные', 'Вернуться к списку'])
  expect(wrapper.find('button[aria-label="Сохранить документ"]').exists()).toBe(false)
  expect(wrapper.find('button[aria-label="Удалить документ"]').exists()).toBe(false)
  expect(print.text()).toBe(''); expect(print.find('.fa-print').exists()).toBe(true)
  expect(download.text()).toBe(''); expect(download.find('.fa-download').exists()).toBe(true)
  await print.trigger('click'); expect(globalThis.print).toHaveBeenCalled()
  await download.trigger('click'); await flushPromises()
  expect(h.session.consentRequest).toHaveBeenCalledWith(`/legal-documents/${id}/source`, expect.any(Object), 'blob')
  await click('Вернуться к списку'); expect(h.router.push).toHaveBeenCalledWith('/legal-documents')


})

it('uses the shared legal-document list layout, routes actions, filters, and retries failures', async () => {
  h.session.consentRequest.mockRejectedValueOnce(failure()); render(LegalDocumentsView); await flushPromises()
  expect(wrapper.find('.page-alert').exists()).toBe(true)
  expect(wrapper.find('button[aria-label="Повторить загрузку"]').exists()).toBe(false)
  await click('Обновить список'); expect(wrapper.find('.page-alert').exists()).toBe(false)
  expect(wrapper.get('.count').text()).toBe('1')
  const filterBar = wrapper.get('.filter-bar')
  expect(filterBar.findComponent({name:'VTextField'}).props()).toMatchObject({ density:'compact', variant:'solo', active:true })
  const filters = filterBar.findAllComponents({name:'VSelect'}); expect(filters).toHaveLength(2)
  filters[0].vm.$emit('update:modelValue',LEGAL_DOCUMENT_KIND.PERSONAL_DATA_CONSENT); await nextTick()
  const table = wrapper.findComponent({name:'VDataTable'}); table.vm.$emit('update:page',1); table.vm.$emit('update:itemsPerPage',25); table.vm.$emit('update:sortBy',[{key:'displayVersion',order:'desc'}]); await nextTick()
  await wrapper.get('.filter-search input').setValue('ничего'); expect(wrapper.text()).toContain('Правовые документы не найдены')
  await wrapper.get('.filter-search input').setValue('Отдельное'); await nextTick()
  await click('Создать новый документ'); expect(h.router.push).toHaveBeenCalledWith('/legal-documents/new')
  await click('Открыть журнал действий'); expect(h.router.push).toHaveBeenCalledWith('/legal-documents/audit')
  const rowActions = wrapper.get('.actions-container').findAll('button')
  expect(rowActions).toHaveLength(2)
  expect(wrapper.get('button[aria-label="Просмотреть документ"] .fa-eye').exists()).toBe(true)
  expect(wrapper.get('button[aria-label="Удалить документ"] .fa-trash-can').exists()).toBe(true)
  await click('Просмотреть документ'); expect(h.router.push).toHaveBeenCalledWith(`/legal-documents/${id}`)

  h.session.consentRequest.mockImplementation(async (path, options) => {
    if (path === `/legal-documents/${id}` && options?.method === 'DELETE') return null
    if (path === '/legal-documents') return []
    return { ...doc }
  })
  await click('Удалить документ')
  expect(openConfirm().props()).toMatchObject({ action:'Удалить документ', actionIcon:'$delete' })
  expect(wrapper.get('button[aria-label="Удалить документ"] .fa-trash-can').exists()).toBe(true)
  openConfirm().vm.$emit('cancel'); await nextTick()
  expect(h.session.consentRequest).not.toHaveBeenCalledWith(`/legal-documents/${id}`, { method:'DELETE' })
  await click('Удалить документ'); await confirm()
  expect(h.session.consentRequest).toHaveBeenCalledWith(`/legal-documents/${id}`, { method:'DELETE' })
  expect(wrapper.get('.count').text()).toBe('0')

  wrapper.unmount()
  h.session.consentRequest.mockImplementation(async path => path === '/legal-documents' || path.startsWith('/legal-documents?kind=')
    ? [{ ...doc, canDelete:false }]
    : { ...doc, canDelete:false })
  render(LegalDocumentsView); await flushPromises()
  expect(wrapper.get('.actions-container').findAll('button')).toHaveLength(2)
  const disabledDelete = wrapper.get('button[aria-label="Удаление невозможно после начала действия документа"]')
  expect(disabledDelete.attributes('disabled')).toBeDefined()
  await disabledDelete.trigger('click'); expect(openConfirm()).toBeUndefined()

  wrapper.unmount(); h.session.consentRequest.mockRejectedValueOnce(failure())
  render(LegalDocumentView, { path:`/legal-documents/${id}`, params:{id}, query:{} }); await flushPromises()
  expect(wrapper.find('.page-alert').exists()).toBe(true)
  expect(wrapper.find('button[aria-label="Повторить загрузку"]').exists()).toBe(false)
  await click('Обновить данные'); expect(wrapper.find('.page-alert').exists()).toBe(false)
})
it('guards list deletion and refreshes availability after deletion failures', async () => {
  render(LegalDocumentsView); await flushPromises()

  vm().confirmDeletion(null)
  vm().confirmDeletion({ ...doc, canDelete:false })
  vm().busy = true; vm().confirmDeletion({ ...doc }); vm().busy = false
  expect(vm().pendingDelete).toBeNull()
  await vm().deleteDocument()
  vm().pendingDelete = { ...doc, canDelete:false }; await vm().deleteDocument()
  vm().pendingDelete = { ...doc }; vm().busy = true; await vm().deleteDocument(); vm().busy = false

  const boundary = failure(); boundary.code = 'legal_document_already_effective'
  h.session.consentRequest.mockRejectedValueOnce(boundary).mockResolvedValueOnce([{ ...doc, canDelete:false }])
  vm().pendingDelete = { ...doc }; await vm().deleteDocument()
  expect(vm().problem.code).toBe('legal_document_already_effective')
  expect(vm().rows[0].canDelete).toBe(false)

  h.session.consentRequest.mockRejectedValueOnce(failure())
  vm().pendingDelete = { ...doc }; await vm().deleteDocument()
  expect(vm().problem.code).toBe('ui_network_unavailable')

  const secondBoundary = failure(); secondBoundary.code = 'legal_document_already_effective'
  h.session.consentRequest.mockRejectedValueOnce(secondBoundary).mockRejectedValueOnce(failure())
  vm().pendingDelete = { ...doc }; await vm().deleteDocument()
  expect(vm().problem.code).toBe('legal_document_already_effective')

  h.session.consentRequest.mockResolvedValueOnce(null).mockResolvedValueOnce({ items:[] })
  vm().pendingDelete = { ...doc }; await vm().deleteDocument()
  expect(vm().problem.code).toBe('ui_protocol_error')
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
  expect(wrapper.find('button[aria-label="Повторить загрузку"]').exists()).toBe(false)
  await click('Обновить журнал')
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
it('filters withdrawal dates, persists the range and validates calendar dates', async () => {
  render(PrivacyRequestsView); await flushPromises()
  vm().page = 3
  await wrapper.get('#privacy-request-from').setValue('2026-09-01')
  await flushPromises()
  expect(vm().page).toBe(1)
  await wrapper.get('#privacy-request-to').setValue('2026-09-16')
  await flushPromises()
  expect(h.session.consentRequest).toHaveBeenLastCalledWith(expect.stringContaining('requestedFrom=2026-09-01&requestedTo=2026-09-16'))
  expect(vm().problem).toBeNull()
  wrapper.unmount()
  render(PrivacyRequestsView); await flushPromises()
  expect(wrapper.get('#privacy-request-from').element.value).toBe('2026-09-01')
  expect(wrapper.get('#privacy-request-to').element.value).toBe('2026-09-16')
  const calls = h.session.consentRequest.mock.calls.length
  vm().onDateChange('requestedTo', '2026-08-31')
  vm().onDateChange('requestedFrom', '2026-02-30')
  expect(h.session.consentRequest).toHaveBeenCalledTimes(calls)
  vm().onDateChange('requestedFrom', null)
  await flushPromises()
  expect(h.session.consentRequest.mock.lastCall[0]).not.toContain('requestedFrom=')
  expect(h.session.consentRequest.mock.lastCall[0]).toContain('requestedTo=2026-09-16')
  h.session.consentRequest.mockImplementationOnce(path => Promise.resolve({ ...pageResult([], path), requestedTo:null }))
  vm().onDateChange('requestedTo', '2026-09-17')
  await flushPromises()
  expect(vm().problem).not.toBeNull()
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
  expect(initialActions[0].text()).toBe('')
  expect(initialActions[0].find('.fa-check-double').exists()).toBe(true)
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
  await wrapper.get('#title').setValue('Название из формы')
  await wrapper.get('#displayVersion').setValue('v3')
  await wrapper.get('#effectiveDate').setValue('2027-03-01')
  const input = wrapper.get('#file')
  const choose = vi.spyOn(input.element, 'click')
  await wrapper.get('button[aria-label="Выбрать файл Markdown"]').trigger('click')
  expect(choose).toHaveBeenCalledOnce()
  Object.defineProperty(input.element, 'files', { configurable:true, value:[upload()] })
  await input.trigger('change')
  expect(vm().form).toMatchObject({title:'Название из формы',displayVersion:'v3',effectiveDate:'2027-03-01'})
  await wrapper.get('#kind').setValue(String(LEGAL_DOCUMENT_KIND.PRIVACY_POLICY))
  expect(vm().form.kind).toBe(LEGAL_DOCUMENT_KIND.PRIVACY_POLICY)
  for (const name of ['kind','title','displayVersion','effectiveDate','file']) {
    expect(wrapper.get('label[for="'+name+'"]').attributes('for')).toBe(wrapper.get('[name="'+name+'"]').attributes('id'))
  }
  expect(wrapper.text()).not.toContain('Категория куки:')
  expect(vm().form).not.toHaveProperty('cookieCategories')
  h.session.consentRequest.mockResolvedValueOnce({ html:doc.html }); await vm().previewDocument(); await nextTick()
})


it('recovers a persisted audit filter for retired legal kind zero', async () => {
  globalThis.localStorage.setItem('sarafan.backoffice.view-state.v1.1.legal-document-audit', JSON.stringify({
    version:1, page:3, pageSize:50, sortBy:[{ key:'at', order:'asc' }],
    filters:{ search:'old', kind:0, action:'created' }
  }))
  render(LegalDocumentAuditView)
  await flushPromises()
  expect(vm().kind).toBeNull()
  expect(vm().page).toBe(1)
  expect(h.session.consentRequest.mock.calls.some(([path]) => /[?&]kind=0(?:&|$)/u.test(path))).toBe(false)
})


it('keeps focus in the active control during background preview validation', async () => {
  render(LegalDocumentView, { path:'/legal-documents/new', params:{}, query:{} }, document.body)
  await flushPromises()
  wrapper.get('[name="title"]').element.focus()
  await vm().previewDocument()
  expect(vm().problem).toBeNull()
  vm().file = upload()
  h.session.consentRequest.mockRejectedValueOnce(createInternalProblem('invalidInput', { errors:{ Title:['Исправьте название'] } }))
  await vm().previewDocument()
  expect(document.activeElement).toBe(wrapper.get('[name="title"]').element)
  expect(wrapper.get('[name="title"]').element.disabled).toBe(false)
  const title = wrapper.get('[name="title"]')
  expect(title.attributes('aria-invalid')).toBe('true')
  expect(document.getElementById(title.attributes('aria-describedby')).textContent).toContain('Исправьте название')
  h.session.consentRequest.mockRejectedValueOnce(createInternalProblem('invalidInput', { errors:{ Source:['Исправьте файл'], FileName:['Неверное имя файла'] } }))
  await vm().previewDocument()
  expect(wrapper.get('#file-error').text()).toContain('Исправьте файл')
  expect(wrapper.get('#file-error').text()).toContain('Неверное имя файла')
  expect(document.activeElement).toBe(wrapper.get('[name="title"]').element)
  expect(wrapper.get('button[aria-label="Выбрать файл Markdown"]').attributes('aria-describedby')).toBe('legal-file-guidance file-error')
})

it('automatically previews complete input after debounce and immediately hides obsolete content', async () => {
  render(LegalDocumentView, { path:'/legal-documents/new', params:{}, query:{} }); await flushPromises()
  vi.useFakeTimers()
  vm().form.title = ' '
  vm().file = upload()
  await vi.advanceTimersByTimeAsync(300)
  expect(h.session.consentRequest).not.toHaveBeenCalled()
  vm().form.title = 'Первое'
  await vi.advanceTimersByTimeAsync(200)
  vm().form.title = 'Второе'
  await vi.advanceTimersByTimeAsync(299)
  expect(h.session.consentRequest).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1); await flushPromises()
  expect(wrapper.find('.legal-preview-surface').exists()).toBe(true)
  expect(JSON.parse(h.session.consentRequest.mock.lastCall[1].body).title).toBe('Второе')
  vm().form.title = ''
  await nextTick()
  expect(wrapper.find('.legal-preview-surface').exists()).toBe(false)
  expect(vm().previewPayload).toBeNull()
  vm().form.title = 'Третье'
  h.session.consentRequest.mockResolvedValueOnce({ html:'<script>bad</script>' })
  await vi.advanceTimersByTimeAsync(300); await flushPromises()
  expect(vm().preview).toBeNull()
  expect(vm().problem).not.toBeNull()
  vm().file = null
  await vi.advanceTimersByTimeAsync(300)
  expect(h.session.consentRequest).toHaveBeenCalledTimes(2)
})

it.each(['resolve', 'reject'])('discards stale preview responses: %s', async outcome => {
  render(LegalDocumentView, { path:'/legal-documents/new', params:{}, query:{} }); await flushPromises()
  vi.useFakeTimers()
  let finish
  h.session.consentRequest.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = outcome === 'resolve' ? resolve : reject }))
  vm().file = upload()
  await vi.advanceTimersByTimeAsync(300); await flushPromises()
  expect(vm().busy).toBe(false)
  vm().form.title = 'Новое название'
  finish(outcome === 'resolve' ? { html:doc.html } : failure())
  await flushPromises()
  expect(vm().preview).toBeNull()
  expect(vm().problem).toBeNull()
  await vi.advanceTimersByTimeAsync(300); await flushPromises()
  expect(vm().preview).not.toBeNull()
})

it.each(['refresh', 'identity', 'unmount'])('discards pending preview after %s', async action => {
  render(LegalDocumentView, { path:'/legal-documents/new', params:{}, query:{} }); await flushPromises()
  vi.useFakeTimers()
  const state = vm()
  let finish
  h.session.consentRequest.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  state.file = upload()
  await vi.advanceTimersByTimeAsync(300); await flushPromises()
  if (action === 'refresh') await state.load()
  if (action === 'identity') h.session.user.value = null
  if (action === 'unmount') wrapper.unmount()
  finish({ html:doc.html }); await flushPromises()
  expect(state.preview).toBeNull()
  expect(state.previewPayload).toBeNull()
})

it('discards obsolete file reads before requesting a preview', async () => {
  render(LegalDocumentView, { path:'/legal-documents/new', params:{}, query:{} }); await flushPromises()
  vi.useFakeTimers()
  let finish
  vm().file = { ...upload(), arrayBuffer:() => new Promise(resolve => { finish = resolve }) }
  await vi.advanceTimersByTimeAsync(300)
  vm().file = null
  finish(new globalThis.TextEncoder().encode('# Old').buffer)
  await flushPromises()
  expect(h.session.consentRequest).not.toHaveBeenCalled()
  vm().file = upload()
  wrapper.unmount()
  await vi.advanceTimersByTimeAsync(300)
  expect(h.session.consentRequest).not.toHaveBeenCalled()
})

it('revalidates the exact version after a conflict before enabling save', async () => {
  render(LegalDocumentView, { path:'/legal-documents/new', params:{}, query:{} }); await flushPromises()
  vi.useFakeTimers()
  vm().file = upload()
  vm().form.displayVersion = 'duplicate'
  h.session.consentRequest.mockRejectedValueOnce(createInternalProblem('invalidInput', { errors:{ DisplayVersion:['Версия уже существует'] } }))
  await vi.advanceTimersByTimeAsync(300); await flushPromises()
  expect(vm().preview).toBeNull()
  expect(wrapper.get('#displayVersion-error').text()).toContain('Версия уже существует')
  vm().form.displayVersion = 'unique'
  expect(vm().problem).toBeNull()
  await vi.advanceTimersByTimeAsync(300); await flushPromises()
  expect(vm().previewPayload.displayVersion).toBe('unique')
  await vm().save()
  expect(JSON.parse(h.session.consentRequest.mock.lastCall[1].body).displayVersion).toBe('unique')
})

it('shows legal validation only at its field and retains unrelated errors in the alert', async () => {
  render(LegalDocumentView, { path:'/legal-documents/new', params:{}, query:{} }); await flushPromises()
  vm().problem = new ProblemError({ type:'https://sarafan.sw.consulting/problems/legal-document-version-conflict', detail:'Версия уже существует' })
  await nextTick()
  expect(wrapper.get('#displayVersion-error').text()).toBe('Версия уже существует')
  expect(wrapper.find('.page-alert').exists()).toBe(false)
  vm().problem = createInternalProblem('invalidInput', { detail:'Ошибка файла', errors:{ Source:['Ошибка файла'], Unknown:['Ошибка вне формы'] } })
  await nextTick()
  expect(wrapper.get('#file-error').text()).toBe('Ошибка файла')
  expect(wrapper.get('.page-alert').text()).toBe('Ошибка вне формы')
  vm().problem = failure(); await nextTick()
  expect(wrapper.find('.page-alert').exists()).toBe(true)
  vm().form = null
  vm().problem = createInternalProblem('invalidInput', { detail:'Ошибка загрузки', errors:{ Title:['Ошибка названия'] } })
  await nextTick()
  expect(wrapper.get('.page-alert').text()).toBe('Ошибка загрузки')
})
