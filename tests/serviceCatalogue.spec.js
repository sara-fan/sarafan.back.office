// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { describe, expect, it } from 'vitest'
import { associatedFieldErrors, ProblemError } from '../src/errors/problem.js'
import {
  SERVICE_CATALOGUE_ERROR_OPTIONS,
  formatServiceCatalogueAvailability,
  formatServiceCatalogueParameters,
  serviceCatalogueAction,
  serviceCatalogueForm,
  serviceCatalogueIdentity,
  serviceCatalogueOverlapErrors,
  serviceCataloguePayload,
  serviceCatalogueValidation,
  validateServiceCatalogueAuditItem,
  validateServiceCatalogueEntry,
  validateServiceCatalogueList,
  validateServiceCatalogueOps
} from '../src/serviceCatalogue.js'
import { validationFields } from '../src/validationFocus.js'
import { auditItems, fixedEntry, manualEntry, percentageEntry, serviceCatalogueEntries, serviceCatalogueOps as ops } from './fixtures/serviceCatalogue.js'

describe('service catalogue protocol', () => {
  it('accepts the complete Core operations contract and excludes EUR', () => {
    expect(validateServiceCatalogueOps(ops)).toBe(ops)
    const restricted = { ...ops, actions:{ view:false, create:false, edit:false, delete:false, audit:false } }
    expect(validateServiceCatalogueOps(restricted)).toBe(restricted)
    expect(ops.currencies.map(item => item.value)).toEqual([643, 840])
    expect(ops.currencies.map(item => item.routeAlias)).not.toContain('eur')
  })

  it.each([
    null, {}, { ...ops, availabilityTimeZone:'UTC' }, { ...ops, actions:{} },
    { ...ops, currencies:[...ops.currencies, { value:978, name:'Евро', routeAlias:'eur' }] },
    { ...ops, currencies:[ops.currencies[1], ops.currencies[0]] },
    { ...ops, services:ops.services.slice(1) },
    { ...ops, priceMethods:ops.priceMethods.map((item, index) => index ? item : { ...item, name:'' }) },
    { ...ops, auditActions:ops.auditActions.map((item, index) => index ? item : { ...item, routeAlias:'create' }) },
    { ...ops, limits:{ ...ops.limits, maximumAmount:1 } },
    { ...ops, limits:{ ...ops.limits, amountDecimalPlaces:3 } },
    { ...ops, limits:{ ...ops.limits, maximumPercentage:99 } },
    { ...ops, limits:{ ...ops.limits, percentageDecimalPlaces:2 } },
    { ...ops, limits:{ ...ops.limits, auditSearchMaxLength:100 } },
    { ...ops, limits:{ ...ops.limits, auditPageSizeMaximum:50 } }
  ])('rejects malformed Ops %#', value => expect(() => validateServiceCatalogueOps(value)).toThrow())

  it('validates all three entry shapes and deterministic list order', () => {
    for (const entry of serviceCatalogueEntries) expect(validateServiceCatalogueEntry(entry, ops, entry.id)).toBe(entry)
    expect(validateServiceCatalogueList({ items:serviceCatalogueEntries }, ops)).toEqual(serviceCatalogueEntries)
    expect(validateServiceCatalogueList({ items:[] }, ops)).toEqual([])
    expect(() => validateServiceCatalogueList({} , ops)).toThrow()
    expect(() => validateServiceCatalogueList({ items:[percentageEntry, percentageEntry] }, ops)).toThrow()
    expect(() => validateServiceCatalogueList({ items:[fixedEntry, percentageEntry] }, ops)).toThrow()
    expect(() => validateServiceCatalogueEntry(percentageEntry, ops, 2)).toThrow()
  })

  it.each([
    null, {},
    { ...percentageEntry, id:0 }, { ...percentageEntry, service:999 }, { ...percentageEntry, priceMethod:999 },
    { ...percentageEntry, currency:978 }, { ...percentageEntry, availableFrom:'2026-02-30' },
    { ...percentageEntry, availableBy:'2025-12-31' }, { ...percentageEntry, createdAt:'bad' },
    { ...percentageEntry, updatedAt:'2026-09-21' }, { ...percentageEntry, version:'bad' },
    { ...percentageEntry, percentage:null }, { ...percentageEntry, percentage:0 }, { ...percentageEntry, percentage:100.0001 },
    { ...percentageEntry, percentage:1.12345 }, { ...percentageEntry, percentage:1e-10 }, { ...percentageEntry, minimumAmount:-1 },
    { ...percentageEntry, minimumAmount:1.001 }, { ...percentageEntry, maximumAmount:0 },
    { ...percentageEntry, amount:1 },
    { ...fixedEntry, amount:null }, { ...fixedEntry, amount:1.001 }, { ...fixedEntry, amount:1e-10 }, { ...fixedEntry, percentage:1 },
    { ...manualEntry, amount:0 }, { ...manualEntry, currency:null }
  ])('rejects malformed entries %#', value => expect(() => validateServiceCatalogueEntry(value, ops)).toThrow())

  it('creates method-aware forms and payloads with comma or dot decimals', () => {
    expect(serviceCatalogueForm(null, ops)).toEqual({ service:0, priceMethod:0, percentage:'', minimumAmount:'', maximumAmount:'', amount:'', currency:643, availableFrom:'', availableBy:'' })
    expect(serviceCatalogueForm(percentageEntry, ops).percentage).toBe('10,125')
    const percentForm = { ...serviceCatalogueForm(percentageEntry, ops), percentage:'12,3456', minimumAmount:'0', maximumAmount:'' }
    expect(serviceCatalogueValidation(percentForm, ops)).toBeNull()
    expect(serviceCataloguePayload(percentForm, ops, percentageEntry.version)).toMatchObject({ percentage:12.3456, minimumAmount:0, maximumAmount:null, amount:null, currency:null, version:percentageEntry.version })
    const fixedForm = { ...serviceCatalogueForm(fixedEntry, ops), amount:'1.25' }
    expect(serviceCatalogueValidation(fixedForm, ops)).toBeNull()
    expect(serviceCataloguePayload(fixedForm, ops)).toMatchObject({ amount:1.25, currency:643, percentage:null })
    const manualForm = serviceCatalogueForm(manualEntry, ops)
    expect(serviceCatalogueValidation(manualForm, ops)).toBeNull()
    expect(serviceCataloguePayload(manualForm, ops)).toMatchObject({ amount:null, currency:840 })
  })

  it.each([
    ['service', { service:999 }], ['priceMethod', { priceMethod:999 }],
    ['availableFrom', { availableFrom:'' }], ['availableBy', { availableBy:'2025-01-01' }],
    ['percentage', { percentage:'0' }], ['percentage', { percentage:'1,12345' }],
    ['minimumAmount', { minimumAmount:'-1' }], ['maximumAmount', { minimumAmount:'10', maximumAmount:'9' }]
  ])('returns structured %s validation errors', (field, patch) => {
    const problem = serviceCatalogueValidation({ ...serviceCatalogueForm(percentageEntry, ops), ...patch }, ops)
    expect(problem.errors).toHaveProperty(field)
  })

  it('validates fixed/manual currencies and amount limits without accepting EUR', () => {
    const fixed = serviceCatalogueForm(fixedEntry, ops)
    for (const patch of [{ amount:'' }, { amount:'-1' }, { amount:'100000000' }, { amount:'1.001' }, { currency:978 }]) {
      expect(serviceCatalogueValidation({ ...fixed, ...patch }, ops)).not.toBeNull()
    }
    const manual = serviceCatalogueForm(manualEntry, ops)
    expect(serviceCatalogueValidation({ ...manual, currency:978 }, ops).errors.currency).toBeTruthy()
  })

  it('detects inclusive and open-ended overlaps while excluding the edited row', () => {
    const form = serviceCatalogueForm(percentageEntry, ops)
    expect(serviceCatalogueOverlapErrors(form, serviceCatalogueEntries, null)).toHaveProperty('availableFrom')
    expect(serviceCatalogueOverlapErrors(form, serviceCatalogueEntries, percentageEntry.id)).toEqual({})
    expect(serviceCatalogueOverlapErrors({ ...form, availableFrom:'2026-01-31', availableBy:'2026-02-01' }, [percentageEntry], null)).toHaveProperty('availableBy')
    expect(serviceCatalogueOverlapErrors({ ...form, availableFrom:'2026-02-01', availableBy:'' }, [percentageEntry], null)).toEqual({})
    expect(serviceCatalogueOverlapErrors({ ...form, availableFrom:'bad' }, serviceCatalogueEntries, null)).toEqual({})
  })

  it('formats every method and inclusive availability using Ops aliases', () => {
    expect(formatServiceCatalogueParameters(percentageEntry, ops)).toContain('10,125 %')
    expect(formatServiceCatalogueParameters(percentageEntry, ops)).toContain('мин. 1,25 USD')
    expect(formatServiceCatalogueParameters(fixedEntry, ops)).toBe('1 500,50 RUB')
    expect(formatServiceCatalogueParameters(manualEntry, ops)).toBe('Доллар США')
    expect(formatServiceCatalogueAvailability(percentageEntry)).toContain('01.01.2026')
    expect(formatServiceCatalogueAvailability(fixedEntry)).toBe('с 01.02.2026')
  })

  it('validates typed create/update/delete audit snapshots', () => {
    for (const item of auditItems) expect(validateServiceCatalogueAuditItem(item, ops)).toBe(item)
    for (const value of [null, {}, { ...auditItems[0], id:0 }, { ...auditItems[0], actorName:'' },
      { ...auditItems[0], action:999 }, { ...auditItems[0], service:100 }, { ...auditItems[0], before:percentageEntry },
      { ...auditItems[1], before:null }, { ...auditItems[2], after:percentageEntry }]) {
      expect(() => validateServiceCatalogueAuditItem(value, ops)).toThrow()
    }
  })

  it('combines local deny-by-default roles with Core actions and maps canonical errors', () => {
    expect(serviceCatalogueIdentity(null)).toBe('')
    expect(serviceCatalogueIdentity({ id:1, roles:['operator','administrator'] })).toBe('1:administrator,operator')
    for (const role of ['administrator', 'shift-manager', 'senior-operator', 'operator', 'unknown']) {
      const user = { roles:[role] }
      expect(serviceCatalogueAction(user, ops, 'view')).toBe(role !== 'unknown')
      expect(serviceCatalogueAction(user, ops, 'audit')).toBe(role !== 'unknown')
      expect(serviceCatalogueAction(user, ops, 'create')).toBe(role === 'administrator')
      expect(serviceCatalogueAction(user, { ...ops, actions:{ ...ops.actions, create:false } }, 'create')).toBe(false)
      expect(serviceCatalogueAction(user, { ...ops, actions:{ ...ops.actions, audit:false } }, 'audit')).toBe(false)
    }
    for (const [type, fields] of Object.entries(SERVICE_CATALOGUE_ERROR_OPTIONS.types)) {
      const problem = new ProblemError({ type, detail:'Исправьте тариф' })
      expect(validationFields(problem, SERVICE_CATALOGUE_ERROR_OPTIONS)).toEqual(fields)
      expect(associatedFieldErrors(problem, fields[0], SERVICE_CATALOGUE_ERROR_OPTIONS)).toEqual(['Исправьте тариф'])
    }
  })
})
