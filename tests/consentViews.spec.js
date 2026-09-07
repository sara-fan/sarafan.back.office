// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { ref, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import LegalDocumentsView from '../src/views/LegalDocumentsView.vue'
import CustomerConsentsView from '../src/views/CustomerConsentsView.vue'
import PrivacyRequestsView from '../src/views/PrivacyRequestsView.vue'
import LegalDocumentReader from '../src/components/LegalDocumentReader.vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
import { createInternalProblem } from '../src/errors/problem.js'
import { documentNodes, moscowTime, isDocumentId } from '../src/consentFormatting.js'
const h = vi.hoisted(() => ({ session:{} }))
vi.mock('../src/stores/session.js', () => ({ useSession:() => h.session }))
const id = '11111111-1111-1111-1111-111111111111'
const doc = { id, kind:'personal-data-consent', title:'Отдельное согласие', displayVersion:'2', revision:1, state:'draft', html:'<p>Правовой текст</p>', contentHash:'a'.repeat(64), cookieCategories:[], effectiveAt:'2026-09-07T09:00:00Z' }
const rights = { id, customerId:7, kind:'stop-processing', state:'open', revision:1, receivedAt:'2026-09-01T09:00:00Z', dueAt:'2026-09-02T09:00:00Z', responsibleStaffId:1, retentionBasis:'', completionEvidence:'', extensionReason:'', extended:false, completedAt:null }
const failure = () => createInternalProblem('networkUnavailable')
let wrapper
const vm = () => wrapper.vm.$.setupState
function render(view) { wrapper = mount(view, { global:{ plugins:[createSarafanVuetify()], stubs:{ VDialog:{ props:['modelValue'], template:'<section v-if="modelValue"><slot /></section>' }, RouterLink:{ props:['to'], template:'<a :href="to"><slot /></a>' } } } }); return wrapper }
async function click(label) { await wrapper.get(`button[aria-label="${label}"]`).trigger('click'); await flushPromises() }
async function confirm() { wrapper.findComponent(ConfirmDialog).vm.$emit('confirm'); await flushPromises() }
function upload() { return { name:'consent.md', size:10, arrayBuffer:async () => new globalThis.TextEncoder().encode('# Текст').buffer } }
beforeEach(() => {
  h.session.user = ref({ id:1, roles:['administrator'] })
  h.session.consentRequest = vi.fn(async path => {
    if (path === '/legal-documents') return [{ ...doc }]
    if (path.endsWith('/audit')) return [{ id:1, actorId:1, action:'draft-created', at:doc.effectiveAt }]
    if (path.endsWith('/source')) return new globalThis.Blob(['# Текст'])
    if (path === '/consents/rights') return [{ ...rights }, { ...rights, id:'withdrawal', kind:'withdrawal', state:'completed' }]
    return { ...doc }
  })
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:test'); globalThis.URL.revokeObjectURL = vi.fn()
  vi.spyOn(globalThis.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('loads, filters, edits and previews uploaded drafts while preserving failed forms', async () => {
  render(LegalDocumentsView); await flushPromises()
  expect(wrapper.text()).toContain('Черновик')
  await click('Создать новую версию')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.text()).toContain('Выберите файл UTF-8 Markdown')
  vm().file = { name:'bad.pdf', size:4 }; await vm().save()
  vm().file = { name:'big.md', size:262145 }; await vm().save()
  vm().form.title = 'Сохранить это название'; vm().form.displayVersion = 'draft-v2'; vm().file = [upload()]
  h.session.consentRequest.mockRejectedValueOnce(failure()); await vm().save()
  expect(vm().form.title).toBe('Сохранить это название')
  h.session.consentRequest.mockResolvedValueOnce({ ...doc }); await vm().save(); await nextTick()
  const mutation = h.session.consentRequest.mock.calls.find(x => x[1]?.method === 'POST' && x[0] === '/legal-documents')
  expect(JSON.parse(mutation[1].body).source).toBeTruthy()
  expect(wrapper.text()).toContain('Правовой текст')
  expect(wrapper.text()).toContain('draft-created')
  await wrapper.findComponent(LegalDocumentReader).vm.$emit('download'); await flushPromises()
  expect(h.session.consentRequest).toHaveBeenCalledWith(`/legal-documents/${id}/source`, expect.any(Object), 'blob')
  vm().file = upload(); h.session.consentRequest.mockResolvedValueOnce({ ...doc, revision:2 }); await vm().save()
  expect(h.session.consentRequest.mock.calls.some(x => x[1]?.method === 'PUT')).toBe(true)
  vm().filter = 'cookie-consent'; await nextTick(); expect(wrapper.findAll('tbody tr')).toHaveLength(0)
  vm().filter = ''; await nextTick()
  await click('Открыть документ')
  expect(vm().form.revision).toBe(1)
  vm().form.kind = 'cookie-consent'; await nextTick()
  const select = wrapper.findAllComponents({name:'VSelect'})[1]; select.vm.$emit('update:modelValue','cookie-consent'); await nextTick()
  await wrapper.findAll('input[type=checkbox]')[0].setValue(true)
  expect(vm().form.cookieCategories).toContain('analytics')
  await click('Создать отдельный черновик этого типа'); expect(vm().selected).toBeNull()
})
it('confirms publication and schedule cancellation using the saved revision', async () => {
  render(LegalDocumentsView); await flushPromises(); await click('Открыть документ')
  expect(wrapper.get('button[aria-label="После публикации текст нельзя изменить"]').attributes('disabled')).toBeDefined()
  const checkboxes = wrapper.findAll('input[type=checkbox]')
  await checkboxes[0].setValue(true)
  await click('После публикации текст нельзя изменить')
  wrapper.findComponent(ConfirmDialog).vm.$emit('cancel'); await nextTick()
  await click('После публикации текст нельзя изменить')
  h.session.consentRequest.mockResolvedValueOnce({ ...doc, state:'effective', revision:2 }); await confirm()
  expect(h.session.consentRequest).toHaveBeenCalledWith(`/legal-documents/${id}/publish`, expect.objectContaining({ body:JSON.stringify({ revision:1, now:true, effectiveDate:null }) }))
  await click('Открыть документ'); vm().previewed = true; vm().now = false; vm().effectiveDate = '2027-02-01'; await nextTick()
  await click('После публикации текст нельзя изменить')
  expect(wrapper.text()).toContain('2027-02-01')
  h.session.consentRequest.mockRejectedValueOnce(failure()); await confirm()
  expect(vm().effectiveDate).toBe('2027-02-01')
  await click('После публикации текст нельзя изменить')
  h.session.consentRequest.mockResolvedValueOnce({ ...doc, state:'scheduled', revision:2 }); await confirm()
  await click('Отмена доступна только до вступления в силу')
  h.session.consentRequest.mockResolvedValueOnce({ ...doc, state:'cancelled', revision:3 }); await confirm()
  expect(h.session.consentRequest).toHaveBeenCalledWith(`/legal-documents/${id}/cancel`, expect.objectContaining({ body:'{"revision":2}' }))
  h.session.consentRequest.mockResolvedValueOnce({ ...doc, state:'effective' }); await click('Открыть документ')
  expect(wrapper.find('form').exists()).toBe(false)
})
it('shows loading and document errors and permits an explicit retry', async () => {
  h.session.consentRequest.mockRejectedValueOnce(failure()); render(LegalDocumentsView); await flushPromises()
  expect(wrapper.find('.page-alert').exists()).toBe(true)
  await click('Обновить список'); expect(wrapper.find('.page-alert').exists()).toBe(false)
  h.session.consentRequest.mockRejectedValueOnce(failure()); await click('Открыть документ')
  expect(wrapper.find('.page-alert').exists()).toBe(true)
})
it('shows read-only versioned customer evidence and observed browser timestamps', async () => {
  render(CustomerConsentsView)
  await wrapper.get('form').trigger('submit'); await flushPromises(); expect(wrapper.text()).toContain('Введите положительный номер')
  await wrapper.get('input').setValue('7')
  h.session.consentRequest.mockRejectedValueOnce(failure()); await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.get('input').element.value).toBe('7')
  h.session.consentRequest.mockResolvedValueOnce({ customerId:7, statuses:[{kind:'personal-data-consent',status:'renewal-required', requiredVersion:null}], history:[{ id:'1', kind:'cookie-consent', displayVersion:'1', decision:'grant', categories:['analytics'], at:doc.effectiveAt, associatedAt:doc.effectiveAt, documentId:id, source:'cookie-settings', scope:'observed-browser' }, { id:'2',kind:'personal-data-consent', displayVersion:'1', decision:'grant', categories:[], at:doc.effectiveAt, documentId:id, source:'customer-consents', scope:'customer' }], rightsCases:[rights] })
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.findAll('button[aria-label="Прочитать принятую версию"]')).toHaveLength(2)
  expect(wrapper.text()).toContain('Требуется новое согласие')
  await click('Прочитать принятую версию')
  expect(wrapper.text()).toContain('Правовой текст')
  await wrapper.findComponent(LegalDocumentReader).vm.$emit('download'); await flushPromises()
  expect(h.session.consentRequest).toHaveBeenLastCalledWith(`/legal-documents/${id}/source`, expect.any(Object), 'blob')
})
it('handles privacy requests, records evidence and retains edits after server rejection', async () => {
  render(PrivacyRequestsView); await flushPromises()
  expect(wrapper.text()).toContain('Просрочено')
  await wrapper.findAll('button[aria-label="Открыть обращение"]')[0].trigger('click'); await nextTick()
  vm().selected.completionEvidence = 'Удалено у обработчика'; vm().selected.retentionBasis = 'Учёт до срока'; vm().selected.extend = true; vm().selected.extensionReason = 'Ответ обработчика'; await nextTick()
  await wrapper.get('form').trigger('submit'); await nextTick()
  wrapper.findComponent(ConfirmDialog).vm.$emit('cancel'); await nextTick()
  await wrapper.get('form').trigger('submit'); await nextTick()
  h.session.consentRequest.mockRejectedValueOnce(failure()); await confirm()
  expect(vm().selected.completionEvidence).toBe('Удалено у обработчика')
  await wrapper.get('form').trigger('submit'); await nextTick()
  h.session.consentRequest.mockResolvedValueOnce({ ...rights, completedAt:'2026-09-07T09:00:00Z', state:'completed', revision:2 }); await confirm()
  expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
  await click('Обновить обращения')
  await wrapper.findAll('button[aria-label="Открыть обращение"]')[1].trigger('click'); await nextTick()
  vm().selected.responsibleStaffId = ''; await wrapper.get('form').trigger('submit'); await nextTick()
  h.session.consentRequest.mockResolvedValueOnce({ ...rights }); await confirm()
  expect(JSON.parse(h.session.consentRequest.mock.calls.filter(x => x[1]?.method === 'PUT').at(-1)[1].body).responsibleStaffId).toBeNull()
})
it('uses the same safe document format, print and exact source download as the customer reader', async () => {
  wrapper = mount(LegalDocumentReader, {props:{ document:doc }})
  vi.stubGlobal('print', vi.fn()); await wrapper.findAll('button')[1].trigger('click'); expect(globalThis.print).toHaveBeenCalled()
  await wrapper.findAll('button')[0].trigger('click'); expect(wrapper.emitted('download')).toHaveLength(1)
  await wrapper.setProps({document:{...doc,html:'<script>bad</script>'}}); expect(wrapper.find('[role=alert]').exists()).toBe(true)
  expect(documentNodes('<h1>A</h1><a href="https://example.test" title="сайт">Ссылка</a><ol start="3"><li>Список</li></ol><table><tr><td style="text-align:center">Ячейка</td></tr></table>')).toHaveLength(4)
  for (const value of [null,'x'.repeat(2097153),'<img src=x>', '<!-- comment -->', '<a href="relative">bad</a>', '<a href="javascript:alert(1)">bad</a>', '<p onclick="x">bad</p>']) expect(() => documentNodes(value)).toThrow()
  expect(moscowTime(null)).toBe('—'); expect(moscowTime('bad')).toBe('—'); expect(isDocumentId(id)).toBe(true); expect(isDocumentId(null)).toBe(false)
})
it('connects every document and rights form control to its submitted value', async () => {
  render(LegalDocumentsView); await flushPromises(); await click('Создать новую версию')
  const fields = wrapper.findAllComponents({name:'VTextField'})
  fields.find(x => x.props('label') === 'Название').vm.$emit('update:modelValue','Название из формы')
  fields.find(x => x.props('label') === 'Обозначение версии').vm.$emit('update:modelValue','v3')
  wrapper.findComponent({name:'VFileInput'}).vm.$emit('update:modelValue',[upload()])
  await nextTick(); expect(vm().form.title).toBe('Название из формы'); expect(vm().form.displayVersion).toBe('v3')
  h.session.consentRequest.mockResolvedValueOnce({...doc}); await vm().save(); await nextTick()
  vm().now = false; await nextTick()
  wrapper.findAllComponents({name:'VTextField'}).at(-1).vm.$emit('update:modelValue','2027-03-01'); await nextTick(); expect(vm().effectiveDate).toBe('2027-03-01')
  wrapper.unmount(); render(PrivacyRequestsView); await flushPromises()
  await wrapper.findAll('button[aria-label="Открыть обращение"]')[0].trigger('click'); await nextTick()
  wrapper.findComponent({name:'VSelect'}).vm.$emit('update:modelValue','in-progress')
  wrapper.findAllComponents({name:'VTextField'}).find(x => x.props('label') === 'Номер ответственного администратора').vm.$emit('update:modelValue',3)
  const areas = wrapper.findAllComponents({name:'VTextarea'})
  areas[0].vm.$emit('update:modelValue','Основание'); areas[1].vm.$emit('update:modelValue','Результат')
  wrapper.findComponent({name:'VCheckbox'}).vm.$emit('update:modelValue',true); await nextTick()
  wrapper.findAllComponents({name:'VTextarea'}).at(-1).vm.$emit('update:modelValue','Причина'); await nextTick()
  expect(vm().selected).toMatchObject({state:'in-progress',responsibleStaffId:3,retentionBasis:'Основание',completionEvidence:'Результат',extend:true,extensionReason:'Причина'})
})
