// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createInternalProblem, PROBLEM_TYPE_ROOT } from './errors/problem.js'
import { validateImageFile } from './imageUpload.js'
import { isPageResult } from './viewState.js'

export const PAYMENT_ROOT = '/payment-information-bundles'
export const PAYMENT_FIELDS = ['recipientType', 'recipientName', 'inn', 'kpp', 'settlementAccount', 'bankName', 'bik', 'correspondentAccount', 'paymentLink', 'qr']
export const PAYMENT_SORT_KEYS = ['id', 'recipientName', 'inn', 'bankName', 'state', 'createdAt']
export const paymentDefaults = { page:1, pageSize:10, sortBy:[{ key:'id', order:'desc' }], filters:{ search:'', state:null } }
export const PAYMENT_CONFLICTS = ['payment-bundle-update-conflict', 'invalid-payment-bundle-version', 'payment-bundle-frozen', 'payment-bundle-enabled']
  .map(value => PROBLEM_TYPE_ROOT + value)
const controls = value => [...value].some(character => character.codePointAt(0) < 32 || character.codePointAt(0) === 127)
const positive = value => Number.isSafeInteger(value) && value > 0
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(value) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/u.test(value)
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.+(?:Z|\+00:00)$/u.test(value) && Number.isFinite(Date.parse(value))
const protocol = () => { throw createInternalProblem('protocolError') }

export function normalizePaymentFilters(value) {
  return value && typeof value.search === 'string' && value.search.length <= 200
    && [null, 'draft', 'enabled', 'disabled'].includes(value.state)
    ? { search:value.search, state:value.state } : null
}
export function safePaymentLink(value) {
  if (typeof value !== 'string' || !/^https:\/\//iu.test(value) || (controls(value) || value.includes('\\'))) return false
  try { const url = new globalThis.URL(value); return !!url.hostname && !url.username && !url.password }
  catch { return false }
}
export function validatePaymentOps(value) {
  if (!value || typeof value.canManage !== 'boolean'
    || !Array.isArray(value.recipientTypes) || value.recipientTypes.length !== 2
    || !['legal-entity', 'individual-entrepreneur'].every((alias, index) => value.recipientTypes.some(item => item?.value === index && item.routeAlias === alias && typeof item.name === 'string' && item.name.trim()))
    || !Array.isArray(value.states) || value.states.length !== 3
    || !['draft', 'enabled', 'disabled'].every(state => value.states.some(item => item?.value === state && typeof item.name === 'string' && item.name.trim()))
    || !['nameMaxLength', 'linkMaxLength', 'qrMaxBytes', 'qrMaxDimension', 'qrMaxPixels', 'qrMaxMetadataBytes'].every(key => positive(value.limits?.[key]))
    || !Array.isArray(value.limits.qrContentTypes) || value.limits.qrContentTypes.length !== 3
    || !['image/png', 'image/jpeg', 'image/webp'].every(type => value.limits.qrContentTypes.includes(type))) protocol()
  return value
}
export function paymentForm(row) {
  return Object.fromEntries(PAYMENT_FIELDS.filter(key => key !== 'qr').map(key => [key, row?.information[key] ?? (key === 'recipientType' ? null : '')]))
}
function fieldErrors(form, limits, complete = false, hasQr = false) {
  const errors = {}
  for (const key of ['recipientName', 'bankName']) {
    const text = form[key].trim()
    if ((complete && !text) || text.length > limits.nameMaxLength || controls(text)) errors[key] = ['Проверьте обязательное поле и длину текста.']
  }
  if (!(form.recipientType === null || [0, 1].includes(form.recipientType)) || (complete && form.recipientType === null)) errors.recipientType = ['Выберите тип получателя.']
  const lengths = { inn:form.recipientType === 0 ? [10] : form.recipientType === 1 ? [12] : [10, 12], kpp:[9], settlementAccount:[20], bik:[9], correspondentAccount:[20] }
  for (const [key, sizes] of Object.entries(lengths)) {
    const text = form[key].trim()
    if (key === 'kpp' && form.recipientType === 1) { if (text) errors[key] = ['КПП для ИП не указывается.']; continue }
    const required = complete && (key !== 'kpp' || form.recipientType === 0)
    if ((required && !text) || (text && (!/^\d+$/u.test(text) || !sizes.includes(text.length)))) errors[key] = ['Проверьте количество цифр и формат реквизита.']
  }
  const link = form.paymentLink.trim()
  if ((complete && !link) || (link && (link.length > limits.linkMaxLength || !safePaymentLink(link)))) errors.paymentLink = ['Укажите полную банковскую ссылку HTTPS без встроенного логина и пароля.']
  if (complete && !hasQr) errors.qr = ['Загрузите статический QR СБП получателя.']
  return errors
}
export function paymentValidation(form, ops, file) {
  const errors = fieldErrors(form, ops.limits)
  const image = validateImageFile(file, { contentTypes:ops.limits.qrContentTypes, maxBytes:ops.limits.qrMaxBytes }, 'qr')
  if (image) Object.assign(errors, image.errors)
  return Object.keys(errors).length ? createInternalProblem('invalidInput', { errors }) : null
}
export function validatePaymentBundle(value, ops, id) {
  if (!value || !positive(value.id) || (id !== undefined && value.id !== Number(id)) || !uuid(value.version)
    || !value.information || !(value.information.recipientType === null || [0, 1].includes(value.information.recipientType))
    || !PAYMENT_FIELDS.filter(key => !['qr', 'recipientType'].includes(key)).every(key => value.information[key] === null || typeof value.information[key] === 'string')
    || !['createdAt', 'updatedAt'].every(key => date(value[key])) || Date.parse(value.updatedAt) < Date.parse(value.createdAt)
    || !positive(value.createdBy) || !positive(value.updatedBy)
    || !['enabled', 'canEdit', 'canEnable', 'canDisable', 'canDelete', 'canCopy'].every(key => typeof value[key] === 'boolean')
    || !(value.qrUrl === null || (typeof value.qrUrl === 'string' && new RegExp(`^/api/v1/backoffice/payment-information-bundles/${value.id}/qr\\?v=[0-9a-f]{64}$`, 'u').test(value.qrUrl)))) protocol()
  const frozen = value.state !== 'draft'
  const complete = Object.keys(fieldErrors(paymentForm(value), ops.limits, true, value.qrUrl !== null)).length === 0
  if (Object.keys(fieldErrors(paymentForm(value), ops.limits)).length
    || value.state !== (value.enabled ? 'enabled' : frozen ? 'disabled' : 'draft')
    || (value.enabled && (!frozen || !complete)) || (frozen && !complete)
    || value.canEdit !== !frozen || value.canEnable !== (!value.enabled && complete)
    || value.canDisable !== value.enabled || value.canDelete !== !value.enabled || value.canCopy !== frozen) protocol()
  return value
}
export function validatePaymentPage(value, ops, request) {
  const sorting = request.sortBy[0]
  if (!isPageResult(value, PAYMENT_SORT_KEYS, item => { validatePaymentBundle(item, ops); return true })
    || new Set(value.items.map(item => item.id)).size !== value.items.length
    || value.pagination.currentPage !== request.page || value.pagination.pageSize !== request.pageSize
    || value.sorting.sortBy !== sorting.key || value.sorting.sortOrder !== sorting.order
    || (value.search ?? '') !== request.filters.search.trim() || value.state !== request.filters.state
    || !(value.enabledBundle === null || (positive(value.enabledBundle?.id) && uuid(value.enabledBundle.version)))
    || value.items.some(item => item.enabled && (item.id !== value.enabledBundle?.id || item.version !== value.enabledBundle.version))) protocol()
  return value
}
export function paymentPayload(form, version, file) {
  const body = new globalThis.FormData()
  for (const key of PAYMENT_FIELDS.filter(key => key !== 'qr')) if (form[key] !== null) body.append(key, String(form[key]).trim())
  if (version) body.append('version', version)
  if (file) body.append('qr', file)
  return body
}
