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
  { value:0, name:'Согласие на куки', routeAlias:'cookie-consent' },
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
const vm = () => wrapper.vm.$.setupState
function render(view, route = { path:'/', params:{}, query:{} }) { h.route = route; wrapper = mount(view, { global:{ plugins:[createSarafanVuetify()], stubs:{ VDialog:{ props:['modelValue'], template:'<section v-if="modelValue"><slot /></section>' }, RouterLink:{ props:['to'], template:'<a :href="to"><slot /></a>' } } } }); return wrapper }
async function click(label) { await wrapper.get(`button[aria-label="${label}"]`).trigger('click'); await flushPromises() }
async function confirm() { wrapper.findComponent(ConfirmDialog).vm.$emit('confirm'); await flushPromises() }
function upload() { return { name:'consent.md', size:10, arrayBuffer:async () => new globalThis.TextEncoder().encode('# Текст').buffer } }
beforeEach(() => {
  h.router = { push:vi.fn(), replace:vi.fn() }
  h.session.user = ref({ id:1, roles:['administrator'] })
  h.session.getLegalDocumentOps = vi.fn().mockResolvedValue(ops)
  h.session.consentRequest = vi.fn(async path => {
    if (path === '/legal-documents') return [{ ...doc }]
    if (path.startsWith('/legal-documents/audit?')) return { items:[{ ...audit }], page:1, pageSize:25, total:1 }
    if (path === '/legal-documents/preview') return { html:doc.html }
    if (path.endsWith('/source')) return new globalThis.Blob(['# Текст'])
    if (path === '/consents/withdrawal-requests') return [{ ...withdrawalRequest }, { customerId:8, requestedAt:'2026-08-01T09:00:00Z', processed:true }]
    if (path === '/consents/withdrawal-requests/processed') return { ...withdrawalRequest, processed:true }
    return { ...doc }
  })
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
  await wrapper.get('.filter-search input').setValue('Отдельное'); await flushPromises()
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
  vm().previousPage()
  vm().nextPage()
  expect(vm().page).toBe(1)
  h.session.consentRequest.mockResolvedValueOnce({ items:[{ ...audit, actorName:'', action:'legacy' }], page:1, pageSize:25, total:30 })
  await click('Повторить загрузку')
  expect(wrapper.text()).toContain('ID 1')
  expect(wrapper.text()).toContain('legacy')
  vm().nextPage(); await flushPromises()
  expect(vm().page).toBe(2)
  vm().previousPage(); await flushPromises()
  expect(vm().page).toBe(1)
})
it('lists, filters and directly processes customer withdrawal requests', async () => {
  render(PrivacyRequestsView); await flushPromises()
  expect(wrapper.text()).toContain('Ожидает ручной обработки')
  expect(wrapper.text()).toContain('Обработан')
  const initialActions = wrapper.findAll('button[aria-label="Отметить запрос как обработанный"]')
  expect(initialActions).toHaveLength(2)
  expect(initialActions[1].attributes('disabled')).toBeDefined()
  await wrapper.get('.filter-search input').setValue('7')
  const filters = wrapper.get('.filter-bar').findAllComponents({name:'VSelect'})
  expect(filters).toHaveLength(1)
  filters[0].vm.$emit('update:modelValue','false'); await nextTick()
  const table = wrapper.findComponent({name:'VDataTable'}); table.vm.$emit('update:page',1); table.vm.$emit('update:itemsPerPage',25); table.vm.$emit('update:sortBy',[{key:'customerId',order:'desc'}]); await nextTick()
  expect(table.props()).toMatchObject({ fixedHeader:true, density:'compact' })
  const actions = wrapper.findAll('button[aria-label="Отметить запрос как обработанный"]')
  expect(actions).toHaveLength(1)
  expect(actions[0].attributes('disabled')).toBeUndefined()
  await actions[0].trigger('click'); await flushPromises()
  const call = h.session.consentRequest.mock.calls.find(([path, options]) => path === '/consents/withdrawal-requests/processed' && options?.method === 'PUT')
  expect(JSON.parse(call[1].body)).toEqual({ customerId:7, requestedAt:'2026-09-01T09:00:00Z' })
  expect(vm().rows.every(item => item.processed)).toBe(true)
  filters[0].vm.$emit('update:modelValue',''); await nextTick()
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
