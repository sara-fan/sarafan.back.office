// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createInternalProblem, PROBLEM_TYPE_ROOT } from './errors/problem.js'
import { can } from './roles.js'
import { normalizeStoreAddress } from './storeAddress.js'

export const STORE_FIELDS = ['name', 'description', 'officialUrl', 'logo', 'status', 'displayOrder']
export const STORE_CONFLICT = `${PROBLEM_TYPE_ROOT}store-update-conflict`
export const STORE_VERSION_INVALID = `${PROBLEM_TYPE_ROOT}invalid-store-version`
export const STORE_ERROR_OPTIONS = { types:Object.fromEntries(Object.entries({
  'store-display-order-conflict':'displayOrder', 'store-priority-limit-exceeded':'status',
  'invalid-store-name':'name', 'invalid-store-description':'description', 'invalid-store-url':'officialUrl',
  'invalid-store-status':'status', 'invalid-store-display-order':'displayOrder', 'store-logo-required':'logo',
  'invalid-store-logo-size':'logo', 'invalid-store-logo-type':'logo', 'invalid-store-logo-content':'logo'
}).map(([key, value]) => [`${PROBLEM_TYPE_ROOT}${key}`, [value]])) }
const positive = value => Number.isInteger(value) && value > 0 && value <= 2147483647
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(value) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/u.test(value)
const media = ['image/png', 'image/jpeg', 'image/webp']
const protocol = () => { throw createInternalProblem('protocolError') }

export function safeStoreUrl(value) {
  if (typeof value !== 'string' || /[\s\\]/u.test(value) || [...value].some(char => char.codePointAt(0) < 32 || char.codePointAt(0) === 127) || !/^https?:\/\//iu.test(value)) return false
  try {
    const url = new globalThis.URL(value)
    return !!url.hostname && !url.username && !url.password
  } catch { return false }
}
export function validateStoreOps(value) {
  const rules = value?.officialUrlRules
  if (!rules || rules.maximumLength !== value?.limits?.officialUrlMaxLength
    || typeof rules.topLevelDomainListVersion !== 'string' || !rules.topLevelDomainListVersion.trim()
    || !Array.isArray(rules.topLevelDomains) || !rules.topLevelDomains.length
    || rules.topLevelDomains.some(tld => typeof tld !== 'string' || !/^[A-Z0-9-]+$/u.test(tld))) protocol()
  if (!value || !Array.isArray(value.statuses) || value.statuses.length !== 3
    || !['hidden', 'active', 'priority'].every((alias, index) => value.statuses.some(item => item?.value === index && item.routeAlias === alias && typeof item.name === 'string' && item.name.trim()))
    || !['view', 'create', 'edit', 'delete'].every(key => typeof value.actions?.[key] === 'boolean')
    || !['maxPriorityStores', 'nameMaxLength', 'descriptionMaxLength', 'descriptionRecommendedLength', 'officialUrlMaxLength', 'logoMaxBytes',
      'logoMaxDimension', 'logoMaxPixels', 'logoMaxFrames', 'logoMaxAnimationPixels', 'logoMaxMetadataBytes'].every(key => positive(value.limits?.[key]))
    || value.limits.descriptionRecommendedLength > value.limits.descriptionMaxLength
    || !Array.isArray(value.limits.logoContentTypes) || value.limits.logoContentTypes.length === 0
    || new Set(value.limits.logoContentTypes).size !== value.limits.logoContentTypes.length
    || value.limits.logoContentTypes.some(type => !media.includes(type))) protocol()
  return value
}
export function storeAction(user, ops, action) {
  return ops?.actions[action] === true && can(user, action === 'view' ? 'viewStores' : `${action}Store`)
}
export function storeIdentity(user) {
  return user ? `${user.id}:${user.roles.join(',')}` : ''
}
export function validateStore(value, ops, id) {
  if (!value || !positive(value.id) || (id !== undefined && value.id !== Number(id))
    || !['name', 'description', 'officialUrl'].every(key => typeof value[key] === 'string' && value[key].trim().length > 0 && value[key].length <= ops.limits[`${key}MaxLength`])
    || !safeStoreUrl(value.officialUrl) || !ops.statuses.some(item => item.value === value.status)
    || !Number.isInteger(value.displayOrder) || value.displayOrder < 0 || value.displayOrder > 2147483647
    || !uuid(value.version) || !['createdAt', 'updatedAt'].every(key => typeof value[key] === 'string' && /^\d{4}-\d{2}-\d{2}T.+(?:Z|\+00:00)$/u.test(value[key]) && Number.isFinite(Date.parse(value[key])))
    || !(value.logoUrl === null || (typeof value.logoUrl === 'string' && new RegExp(`^/api/v1/backoffice/stores/${value.id}/logo\\?v=[0-9a-f]{64}$`, 'u').test(value.logoUrl)))) protocol()
  return value
}
export function validateStoreList(value, ops) {
  if (!Array.isArray(value?.items)) protocol()
  const items = value.items.map(item => validateStore(item, ops))
  if (new Set(items.map(item => item.id)).size !== items.length) protocol()
  return items
}
export function storeForm(value) {
  return { name:value?.name ?? '', description:value?.description ?? '', officialUrl:value?.officialUrl ?? '',
    status:value?.status ?? 0, displayOrder:String(value?.displayOrder ?? 0) }
}
export function logoValidation(file, limits) {
  if (!file) return null
  const message = !limits.logoContentTypes.includes(file.type) ? 'Выберите файл PNG, JPEG или WebP.'
    : file.size <= 0 || file.size > limits.logoMaxBytes ? `Размер файла должен быть от 1 до ${limits.logoMaxBytes} байт.` : null
  return message ? createInternalProblem('invalidInput', { errors:{ logo:[message] } }) : null
}
export function storeValidation(form, ops, file, hasLogo) {
  const errors = {}
  for (const key of ['name', 'description', 'officialUrl']) {
    const limit = ops.limits[`${key}MaxLength`]
    if (!form[key].trim() || form[key].trim().length > limit) errors[key] = [`Обязательное поле, не более ${limit} символов.`]
  }
  if (!normalizeStoreAddress(form.officialUrl, ops.officialUrlRules)) errors.officialUrl = ['Укажите адрес HTTP(S) с допустимым доменом верхнего уровня, без учётных данных.']
  if (!ops.statuses.some(item => item.value === form.status)) errors.status = ['Выберите статус магазина.']
  if (!/^\d+$/u.test(form.displayOrder) || !Number.isInteger(Number(form.displayOrder)) || Number(form.displayOrder) > 2147483647) errors.displayOrder = ['Укажите целое число от 0 до 2147483647.']
  const logoProblem = logoValidation(file, ops.limits)
  if (logoProblem) Object.assign(errors, logoProblem.errors)
  else if (form.status !== 0 && !file && !hasLogo) errors.logo = ['Для показа магазина необходим логотип.']
  return Object.keys(errors).length ? createInternalProblem('invalidInput', { errors }) : null
}
export function storePayload(form, version, file) {
  const body = new globalThis.FormData()
  for (const key of STORE_FIELDS.filter(key => key !== 'logo')) body.append(key, String(form[key]).trim())
  if (version) body.append('version', version)
  if (file) body.append('logo', file)
  return body
}

export function nextStoreOrder(stores) {
  const used = new Set(stores.map(item => item.displayOrder))
  let next = 0
  while (used.has(next)) next++
  return next
}

export function storePlacementErrors(form, stores, currentId, maximum) {
  const others = stores.filter(item => item.id !== currentId)
  const errors = {}
  if (/^\d+$/u.test(form.displayOrder) && others.some(item => item.displayOrder === Number(form.displayOrder))) {
    errors.displayOrder = ['Этот номер порядка показа уже используется другим магазином.']
  }
  if (form.status === 2 && others.filter(item => item.status === 2).length >= maximum) {
    errors.status = [`На главной странице можно показывать не более ${maximum} магазинов.`]
  }
  return errors
}
