// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { describe, expect, it } from 'vitest'
import { nextStoreOrder, storePlacementErrors, safeStoreUrl, storeAction, storeIdentity, storeForm, storePayload, storeValidation, logoValidation, validateStore, validateStoreList, validateStoreOps, STORE_ERROR_OPTIONS } from '../src/storeCatalogue.js'
import { associatedFieldErrors, ProblemError } from '../src/errors/problem.js'
import { validationFields } from '../src/validationFocus.js'
import { store, ops, logoUrl } from './fixtures/stores.js'

describe('store contracts and atomic payload', () => {
  it.each([null, {}, { ...ops.officialUrlRules, maximumLength:1 },
    { ...ops.officialUrlRules, topLevelDomainListVersion:null }, { ...ops.officialUrlRules, topLevelDomainListVersion:'' },
    ...[null, [], [null], ['com'], ['COM.']].map(topLevelDomains => ({ ...ops.officialUrlRules, topLevelDomains }))
  ])('rejects malformed URL rules %j', officialUrlRules => {
    expect(() => validateStoreOps({ ...ops, officialUrlRules })).toThrow()
  })
  it('validates catalogues and full staff metadata including digest URLs', () => {
    expect(validateStoreOps(ops)).toBe(ops)
    expect(validateStore(store, ops, 1)).toBe(store)
    expect(validateStore({ ...store, status:1, logoUrl }, ops).logoUrl).toBe(logoUrl)
    const repairable = { ...store, status:1, logoUrl:null }
    expect(validateStore(repairable, ops, 1)).toBe(repairable)
    expect(validateStoreList({ items:[repairable] }, ops)).toEqual([repairable])
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
    ...Object.entries({ id:0, status:3, displayOrder:-1, version:'bad', createdAt:'bad', updatedAt:'2026-09-17', logoUrl:'https://evil.test/logo' }).map(([key,value]) => ({ ...store, [key]:value })),
    { ...store, version:'00000000-0000-0000-0000-000000000000' }, { ...store, logoUrl:5 },
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
    expect(storeForm()).toEqual({ name:'', description:'', officialUrl:'', status:0, displayOrder:'0' })
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
    expect(body.get('showOnHome')).toBeNull()
    expect(body.get('displayOrder')).toBe('0')
    expect([...storePayload(form).keys()]).toEqual(['name','description','officialUrl','status','displayOrder'])
  })
  it('maps every canonical validation type to one accessible field', () => {
    for (const [type, fields] of Object.entries(STORE_ERROR_OPTIONS.types)) {
      const problem = new ProblemError({ type, detail:'Исправьте поле' })
      expect(validationFields(problem, STORE_ERROR_OPTIONS)).toEqual(fields)
      expect(associatedFieldErrors(problem, fields[0], STORE_ERROR_OPTIONS)).toEqual(['Исправьте поле'])
    }
  })
})

it('allocates free numbers and validates placement across all statuses excluding the current record', () => {
  const stores = [0,1,2].map((status, id) => ({ ...store, id:id+1, status, displayOrder:id }))
  expect(nextStoreOrder(stores)).toBe(3)
  expect(nextStoreOrder([stores[0],stores[2]])).toBe(1)
  for (const item of stores) {
    expect(storePlacementErrors({ displayOrder:String(item.displayOrder), status:0 }, stores, null, 6)).toHaveProperty('displayOrder')
    expect(storePlacementErrors({ displayOrder:String(item.displayOrder), status:item.status }, stores, item.id, 6)).toEqual({})
  }
  const six = Array.from({ length:6 }, (_, i) => ({ ...store, id:i+1, status:2, displayOrder:i }))
  expect(storePlacementErrors({ displayOrder:'6', status:2 }, six, null, 6)).toHaveProperty('status')
  expect(storePlacementErrors({ displayOrder:'0', status:2 }, six, 1, 6)).toEqual({})
  expect(storePlacementErrors({ displayOrder:'bad', status:0 }, [], null, 6)).toEqual({})
  expect(storeValidation({ ...storeForm(store), status:2 }, ops, null, false).errors.logo).toBeTruthy()
})
