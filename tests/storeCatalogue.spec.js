// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { describe, expect, it } from 'vitest'
import { safeStoreUrl, storeAction, storeIdentity, storeForm, storePayload, storeValidation, logoValidation, validateStore, validateStoreList, validateStoreOps, STORE_ERROR_OPTIONS } from '../src/storeCatalogue.js'
import { associatedFieldErrors, ProblemError } from '../src/errors/problem.js'
import { validationFields } from '../src/validationFocus.js'
import { store, ops, logoUrl } from './fixtures/stores.js'

describe('store contracts and atomic payload', () => {
  it('validates catalogues and full staff metadata including digest URLs', () => {
    expect(validateStoreOps(ops)).toBe(ops)
    expect(validateStore(store, ops, 1)).toBe(store)
    expect(validateStore({ ...store, status:1, logoUrl }, ops).logoUrl).toBe(logoUrl)
    expect(validateStoreList({ items:[] }, ops)).toEqual([])
    expect(validateStoreList({ items:[store] }, ops)).toEqual([store])
    expect(() => validateStoreList({ items:[store,store] }, ops)).toThrow()
    expect(() => validateStoreList({}, ops)).toThrow()
    expect(() => validateStoreList(null, ops)).toThrow()
    expect(() => validateStore(store, ops, 2)).toThrow()
  })
  it.each([null, {}, { statuses:[] }, { ...ops, statuses:[null,ops.statuses[1]] },
    { ...ops, statuses:[{ ...ops.statuses[0], name:'' }, ops.statuses[1]] },
    { ...ops, actions:{} }, { ...ops, limits:null },
    ...Object.keys(ops.limits).filter(key => key !== 'logoContentTypes').map(key => ({ ...ops, limits:{ ...ops.limits, [key]:0 } })),
    ...[[], ['image/svg+xml'], ['image/png','image/png'], null].map(logoContentTypes => ({ ...ops, limits:{ ...ops.limits, logoContentTypes } })),
    { ...ops, limits:{ ...ops.limits, descriptionRecommendedLength:161 } }
  ])('rejects incomplete operations %#', value => expect(() => validateStoreOps(value)).toThrow())
  it.each([
    null, {}, ...['name','description','officialUrl'].flatMap(key => [null, '', 'x'.repeat(2050)].map(value => ({ ...store, [key]:value }))),
    ...Object.entries({ id:0, status:2, showOnHome:1, displayOrder:-1, version:'bad', createdAt:'bad', updatedAt:'2026-09-17', logoUrl:'https://evil.test/logo' }).map(([key,value]) => ({ ...store, [key]:value })),
    { ...store, status:1 }, { ...store, version:'00000000-0000-0000-0000-000000000000' }, { ...store, logoUrl:5 },
    { ...store, displayOrder:2147483648 }, { ...store, officialUrl:'javascript:alert(1)' }, { ...store, logoUrl:logoUrl.replace('/1/', '/2/') }
  ])('rejects malformed or unsafe metadata %#', value => expect(() => validateStore(value, ops)).toThrow())
  it.each([null, 'https://', 'http://[bad', 'javascript:alert(1)', '//shop.test', 'https://a:b@shop.test', 'https://shop.test/ bad', 'https://shop.test/\\bad', 'https://shop.test/\n'])('rejects URL %s', value => expect(safeStoreUrl(value)).toBe(false))
  it('accepts Latin and Cyrillic HTTP destinations without an IANA requirement', () => {
    expect(safeStoreUrl('https://магазин.рф/путь')).toBe(true)
    expect(safeStoreUrl('HTTP://SHOP.TEST/a?q=1')).toBe(true)
    expect(storeIdentity(null)).toBe('')
    expect(storeIdentity({ id:1, roles:['operator'] })).toBe('1:operator')
    for (const role of ['administrator','shift-manager','senior-operator','operator','unknown']) {
      const user = { roles:[role] }
      expect(storeAction(user, ops, 'view')).toBe(role !== 'unknown')
      expect(storeAction(user, ops, 'edit')).toBe(['administrator','shift-manager'].includes(role))
      expect(storeAction(user, ops, 'create')).toBe(role === 'administrator')
      expect(storeAction(user, ops, 'delete')).toBe(role === 'administrator')
      expect(storeAction(user, { ...ops, actions:{ edit:false } }, 'edit')).toBe(false)
      expect(storeAction(user, null, 'view')).toBe(false)
    }
  })
  it('uses published limits, permits 140–160, enforces activation and integer order', () => {
    const form = storeForm(store)
    expect(storeForm()).toEqual({ name:'', description:'', officialUrl:'', status:0, showOnHome:false, displayOrder:'0' })
    expect(storeValidation(form, ops, null, false)).toBeNull()
    for (const count of [140,141,160]) expect(storeValidation({ ...form, description:'a'.repeat(count) }, ops, null, false)).toBeNull()
    expect(storeValidation({ ...form, description:'a'.repeat(161) }, ops, null, false).errors.description).toBeTruthy()
    expect(storeValidation({ ...form, status:1 }, ops, null, false).errors.logo).toBeTruthy()
    expect(storeValidation({ ...form, status:1 }, ops, null, true)).toBeNull()
    expect(storeValidation({ ...form, status:8, displayOrder:'', name:'' }, ops, null, false).errors).toHaveProperty('status')
    for (const displayOrder of ['-1','1.5','2147483648','Infinity']) expect(storeValidation({ ...form, displayOrder }, ops, null, false).errors.displayOrder).toBeTruthy()
    const file = new globalThis.File(['png'], 'logo.png', { type:'image/png' })
    expect(storeValidation({ ...form, status:1 }, ops, file, false)).toBeNull()
    const bad = new globalThis.File(['svg'], 'secret.svg', { type:'image/svg+xml' })
    expect(storeValidation(form, ops, bad, false).errors.logo).toBeTruthy()
    expect(logoValidation(null, ops.limits)).toBeNull()
    expect(logoValidation(new globalThis.File([], 'empty.png', { type:'image/png' }), ops.limits)).toBeTruthy()
    expect(logoValidation({ type:'image/png', size:2097153 }, ops.limits)).toBeTruthy()
    const body = storePayload({ ...form, name:' Shop ', showOnHome:true }, store.version, file)
    expect(body.get('name')).toBe('Shop')
    expect(body.get('version')).toBe(store.version)
    expect(body.get('logo')).toBe(file)
    expect(body.get('showOnHome')).toBe('true')
    expect(body.get('displayOrder')).toBe('0')
    expect([...storePayload(form).keys()]).toEqual(['name','description','officialUrl','status','showOnHome','displayOrder'])
  })
  it('maps every canonical validation type to one accessible field', () => {
    for (const [type, fields] of Object.entries(STORE_ERROR_OPTIONS.types)) {
      const problem = new ProblemError({ type, detail:'Исправьте поле' })
      expect(validationFields(problem, STORE_ERROR_OPTIONS)).toEqual(fields)
      expect(associatedFieldErrors(problem, fields[0], STORE_ERROR_OPTIONS)).toEqual(['Исправьте поле'])
    }
  })
})
