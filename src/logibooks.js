// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { parseProblemResponse, UUID_PATH_PATTERN } from './api/client.js'
import { createInternalProblem } from './errors/problem.js'
import { timestampIsValid, orderNumberIsValid } from './orderProduct.js'
import { isPageResult } from './viewState.js'
import { validDate } from './orderFormatting.js'
import { can } from './roles.js'
export const REGISTER_INPUT_FIELDS = ['dealNumber', 'customerOrderNumber', 'invoiceNumber', 'invoiceDate']
const optionalText = value => value == null || typeof value === 'string'
const calendarDate = value => typeof value === 'string' && !!value && !value.startsWith('0000') && validDate(value)
export function normalizeRegisterInput(value) {
  const fields = Object.fromEntries(REGISTER_INPUT_FIELDS.map(key => [key, value?.[key]?.trim() || null]).filter(([, item]) => item != null))
  return Object.keys(fields).length ? fields : undefined
}
export function registerInputErrors(value) {
  return value?.invoiceDate && !calendarDate(value.invoiceDate)
    ? { 'register.invoiceDate':['Укажите корректную дату накладной.'] } : {}
}
function registerInputIsValid(value) {
  return REGISTER_INPUT_FIELDS.every(key => optionalText(value[key]))
    && (value.invoiceDate == null || calendarDate(value.invoiceDate))
}
export function validateRegisterDetails(value, fileName) {
  if (!value || Array.isArray(value) || typeof value.fileName !== 'string' || !value.fileName.trim()
    || fileName != null && value.fileName !== fileName || !registerInputIsValid(value)
    || value.customsProcedureCode !== 40 || value.transportationTypeCode !== 1 || value.incotermsCode !== 2
    || typeof value.realWeightKg !== 'number' || !Number.isFinite(value.realWeightKg) || value.realWeightKg <= 0) fail()
  return value
}
export const LOGIBOOKS_MAXIMUM_ORDERS = 1000
export const logibooksLimitIsValid = value => Number.isSafeInteger(value) && value >= 1 && value <= LOGIBOOKS_MAXIMUM_ORDERS
export const LOGIBOOKS_ROOT = '/logibooks-registers'
export const canManageLogibooksRegisters = (user, ops) => can(user, 'manageLogibooksRegisters') && ops?.canManage === true
export const canCreateLogibooksRegister = (user, ops) => canManageLogibooksRegisters(user, ops) && ops.enabled === true
export const canReconcileLogibooksRegister = operation => operation?.state === 'Unknown'
  && !operation.investigationRequired && operation.phase !== 'ReceiptRetained' && uuidIsValid(operation.attemptId)
export const LOGIBOOKS_SORT = ['createdAt', 'fileName', 'state']
export const LOGIBOOKS_STATES = ['Submitting', 'Succeeded', 'PartiallySucceeded', 'Rejected', 'Unknown']
export const uuidIsValid = value => typeof value === 'string' && new RegExp(`^${UUID_PATH_PATTERN}$`, 'iu').test(value)
const positive = value => Number.isSafeInteger(value) && value > 0
const fail = () => { throw createInternalProblem('protocolError') }
export const jsonCommand = body => ({ method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body) })
export function validateLogibooksOps(value) {
  if (!value || typeof value.enabled !== 'boolean' || typeof value.canManage !== 'boolean'
    || !logibooksLimitIsValid(value.maximumOrders)
    || !['maximumLabelLength', 'maximumCommandBytes', 'maximumOutboundBytes', 'maximumResponseBytes', 'mappingVersion'].every(key => positive(value[key]))
    || value.unitPriceCurrency?.value !== 840 || value.unitPriceCurrency.routeAlias !== 'usd'
    || !['name', 'symbol'].every(key => typeof value.unitPriceCurrency[key] === 'string' && value.unitPriceCurrency[key].trim())
    || !Array.isArray(value.demoDefaults) || !value.demoDefaults.every(x => typeof x === 'string' && x.trim())
    || !Array.isArray(value.states) || value.states.length !== LOGIBOOKS_STATES.length
    || !LOGIBOOKS_STATES.every((state, index) => value.states.some(x => x.value === index && x.routeAlias === state && typeof x.name === 'string' && x.name.trim()))) fail()
  return value
}
export function goodsIsValid(goods) {
  return goods && orderNumberIsValid(goods.postingNumber) && typeof goods.productName === 'string' && !!goods.productName.trim()
    && typeof goods.unitPrice === 'number' && goods.unitPrice > 0 && goods.unitPrice <= 99999999.99
    && Math.abs(Math.round(goods.unitPrice * 100) - goods.unitPrice * 100) < 0.000001
    && goods.currency === 'USD' && positive(goods.quantity) && goods.quantity <= 9999999999
    && goods.weightKg === 1 && goods.countryCode === 643 && goods.senderCountryCode === 643 && goods.tradingCountryCode === 643
    && typeof goods.productLink === 'string'
    && ['tnVed', 'lastName', 'firstName', 'patronymic', 'phone', 'email', 'postalCode', 'city', 'address',
      'passportSeries', 'passportNumber', 'passportIssuedBy', 'inn', 'sender', 'senderPhone', 'senderEmail', 'senderAddress'].every(key => optionalText(goods[key]))
    && (goods.passportIssueDate == null || calendarDate(goods.passportIssueDate))
}
export function validatePreview(value, ops, command) {
  validateRegisterDetails(value?.register, value?.fileName)
  if (!value || value.operationId !== command.operationId || !uuidIsValid(value.operationId)
    || typeof value.fileName !== 'string' || !value.fileName.trim() || value.fileName.length > ops.maximumLabelLength
    || value.mappingVersion !== ops.mappingVersion || !/^[0-9A-F]{64}$/u.test(value.fingerprint ?? '')
    || command.fileName != null && value.fileName !== command.fileName.trim()
    || !Array.isArray(value.parcels) || value.parcels.length !== command.orders.length || value.parcels.length > ops.maximumOrders
    || !value.parcels.every((goods, index) => goodsIsValid(goods) && goods.postingNumber === command.orders[index].orderNumber)
    || JSON.stringify(normalizeRegisterInput(value.register)) !== JSON.stringify(normalizeRegisterInput(command.register))
    || typeof value.register.realWeightKg !== 'number' || value.register.realWeightKg !== value.parcels.reduce((total, goods) => total + goods.quantity * goods.weightKg, 0)
    || !Array.isArray(value.demoDefaults) || !value.demoDefaults.every(x => typeof x === 'string')) fail()
  return value
}
export async function validateOperation(value, expectedId) {
  if (!value || !uuidIsValid(value.id) || expectedId && value.id !== expectedId || !uuidIsValid(value.version)
    || typeof value.fileName !== 'string' || !value.fileName.trim() || !LOGIBOOKS_STATES.includes(value.state)
    || !['Queued', 'Dispatching', 'ReceiptRetained', 'Applied'].includes(value.phase)
    || !timestampIsValid(value.createdAt) || !timestampIsValid(value.updatedAt)
    || !(value.attemptId == null || uuidIsValid(value.attemptId))
    || value.state === 'Unknown' && !uuidIsValid(value.attemptId) || !positive(value.total)
    || ![value.created, value.rejected, value.unresolved].every(x => Number.isSafeInteger(x) && x >= 0)
    || value.created + value.rejected + value.unresolved !== value.total
    || !(value.registerId == null || positive(value.registerId)) || value.created > 0 && value.registerId == null
    || typeof value.investigationRequired !== 'boolean'
    || value.state === 'Submitting' && (value.created !== 0 || value.rejected !== 0)
    || value.state === 'Succeeded' && value.created !== value.total
    || value.state === 'Rejected' && value.rejected !== value.total
    || value.state === 'PartiallySucceeded' && !(value.created > 0 && value.rejected > 0 && value.unresolved === 0)) fail()
  // Validate embedded retained failures through the same strict Problem Details parser.
  const failure = value.failure == null ? null : await parseProblemResponse({
    status:value.failure.status, headers:new globalThis.Headers({ 'Content-Type':'application/problem+json' }), json:async () => value.failure
  })
  return { ...value, failure }
}
export function rowIsValid(row) {
  return row && positive(row.rowNumber) && orderNumberIsValid(row.orderNumber)
    && ['Unresolved', 'Created', 'Rejected'].includes(row.outcome) && (row.outcome === 'Created' ? positive(row.parcelId) : row.parcelId == null)
    && [row.statusId, row.checkStatus].every(x => x == null || Number.isInteger(x))
    && goodsIsValid(row.goods) && row.goods.postingNumber === row.orderNumber && Array.isArray(row.issues)
    && row.issues.every(x => x && typeof x.code === 'string' && !!x.code.trim() && typeof x.msg === 'string' && !!x.msg.trim()
      && (x.field == null || typeof x.field === 'string'))
}
export function validateRows(value, page, pageSize, search = '') {
  if (!isPageResult(value, ['rowNumber'], rowIsValid) || value.pagination.currentPage !== page
    || value.pagination.pageSize !== pageSize || value.sorting.sortBy !== 'rowNumber' || value.sorting.sortOrder !== 'asc'
    || (value.search ?? '') !== search || value.items.some((row, index) => index > 0 && row.rowNumber <= value.items[index - 1].rowNumber)) fail()
  return value
}
export async function validateOperationPage(value, state) {
  if (!isPageResult(value, LOGIBOOKS_SORT, () => true) || value.pagination.currentPage !== state.page
    || value.pagination.pageSize !== state.pageSize || value.sorting.sortBy !== state.sortBy[0].key
    || value.sorting.sortOrder !== state.sortBy[0].order || (value.search ?? '') !== state.filters.search.trim()) fail()
  if (state.filters.state && value.items.some(x => x.state !== state.filters.state)) fail()
  return { ...value, items:await Promise.all(value.items.map(x => validateOperation(x))) }
}
export function normalizeLogibooksFilters(value) {
  return value && typeof value.search === 'string' && value.search.length <= 200
    && (value.state === '' || LOGIBOOKS_STATES.includes(value.state)) ? { search:value.search, state:value.state } : null
}
export const operationLabel = (state, ops) => ops.states.find(x => x.routeAlias === state)?.name ?? '—'
export const rowLabel = row => ({ Unresolved:'Результат неизвестен', Created:'Создана', Rejected:'Отклонена' })[row.outcome]


export function eligibilityIsValid(row) {
  const value = row.logibooks
  return value && typeof value.canSelect === 'boolean'
    && (value.operationId == null || uuidIsValid(value.operationId))
    && (value.canSelect
      ? value.reason == null && value.operationId == null && row.status === 300 && row.sellerPrice?.currency === 840
        && row.sellerPrice.amount > 0 && row.sellerPrice.amount <= 99999999.99
        && Math.abs(Math.round(row.sellerPrice.amount * 100) - row.sellerPrice.amount * 100) < 0.000001
      : typeof value.reason === 'string' && !!value.reason.trim())
}
