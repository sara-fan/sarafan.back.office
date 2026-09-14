// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createInternalProblem } from './errors/problem.js'

export const ORDER_SORT_KEYS = Object.freeze([
  'orderNumber', 'status', 'productName', 'storeName',
  'sellerPrice', 'quantity', 'createdAt', 'updatedAt'
])
export const ORDER_SEARCH_LIMIT = 2048
export const DEFAULT_ORDER_STATUS_SELECTION = 'group:work'
const DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/u
const ALIAS_PATTERN = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$/u

const validDate = value => {
  if (value === '') return true
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function normalizeOrderFilters(value) {
  if (!value || typeof value.search !== 'string' || value.search.length > ORDER_SEARCH_LIMIT
    || typeof value.status !== 'string' || !/^(?:|group:[a-z][a-z0-9_-]*|status:\d{1,3})$/u.test(value.status)
    || !validDate(value.createdFrom) || !validDate(value.createdTo)
    || (value.createdFrom && value.createdTo && value.createdFrom > value.createdTo)) return null
  return {
    search:value.search,
    status:value.status,
    createdFrom:value.createdFrom,
    createdTo:value.createdTo
  }
}

function validateCatalogItems(items, { upper = false } = {}) {
  if (!Array.isArray(items) || items.length === 0) return null
  const values = new Set()
  const aliases = new Set()
  const result = []
  for (const item of items) {
    if (!item || !Number.isInteger(item.value) || item.value < 0
      || typeof item.name !== 'string' || !item.name.trim()
      || typeof item.routeAlias !== 'string' || !ALIAS_PATTERN.test(item.routeAlias)
      || values.has(item.value) || aliases.has(item.routeAlias)
      || (upper && (!Number.isInteger(item.upperStatusValue) || item.upperStatusValue < 0
        || typeof item.upperStatusName !== 'string' || !item.upperStatusName.trim()
        || typeof item.upperStatusRouteAlias !== 'string' || !ALIAS_PATTERN.test(item.upperStatusRouteAlias)))) return null
    values.add(item.value)
    aliases.add(item.routeAlias)
    result.push({ ...item })
  }
  return { values, result }
}

export function validateOrderOps(value) {
  const statuses = validateCatalogItems(value?.statuses, { upper:true })
  const currencies = validateCatalogItems(value?.currencies)
  if (!statuses || !currencies || !Array.isArray(value?.statusGroups) || value.statusGroups.length !== 2) {
    throw createInternalProblem('protocolError')
  }
  const groupAliases = new Set()
  const groups = []
  for (const group of value.statusGroups) {
    if (!group || typeof group.routeAlias !== 'string' || !ALIAS_PATTERN.test(group.routeAlias)
      || typeof group.name !== 'string' || !group.name.trim()
      || !Array.isArray(group.statuses) || group.statuses.length === 0
      || group.statuses.some(status => !Number.isInteger(status) || !statuses.values.has(status))
      || new Set(group.statuses).size !== group.statuses.length || groupAliases.has(group.routeAlias)) {
      throw createInternalProblem('protocolError')
    }
    groupAliases.add(group.routeAlias)
    groups.push({ routeAlias:group.routeAlias, name:group.name, statuses:[...group.statuses] })
  }
  if (groups[0].routeAlias !== 'work' || groups[0].name !== 'В работе'
    || groups[1].routeAlias !== 'in_progress' || groups[1].name !== 'Выполняется') {
    throw createInternalProblem('protocolError')
  }
  return { statuses:statuses.result, currencies:currencies.result, statusGroups:groups }
}

export function orderStatusItems(ops) {
  return [
    { title:'Все статусы', value:'' },
    ...ops.statusGroups.map(group => ({
      title:`${group.name}`,
      value:`group:${group.routeAlias}`
    })),
    ...ops.statuses.map(status => ({ title:status.name, value:`status:${status.value}` }))
  ]
}

export function selectionIsKnown(selection, ops) {
  if (selection === '') return true
  const [kind, raw] = selection.split(':')
  return kind === 'group'
    ? ops.statusGroups.some(group => group.routeAlias === raw)
    : kind === 'status' && ops.statuses.some(status => String(status.value) === raw)
}

export function safeOrderSource(value) {
  if (typeof value !== 'string' || value.length > ORDER_SEARCH_LIMIT) return null
  try {
    const url = new globalThis.URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export function orderRowIsValid(row, ops) {
  const statusValues = new Set(ops.statuses.map(item => item.value))
  const currencyValues = new Set(ops.currencies.map(item => item.value))
  const created = new Date(row?.createdAt)
  const updated = new Date(row?.updatedAt)
  const price = row?.sellerPrice
  return typeof row?.orderNumber === 'string' && /^\d{8}-[1-9]\d*$/u.test(row.orderNumber)
    && statusValues.has(row.status) && safeOrderSource(row.sourceUrl) !== null
    && (row.productName === null || (typeof row.productName === 'string' && row.productName.length <= 500))
    && (row.storeName === null || (typeof row.storeName === 'string' && row.storeName.length <= 200))
    && Number.isInteger(row.quantity) && row.quantity > 0
    && (price === null || (price && typeof price.amount === 'number' && Number.isFinite(price.amount)
      && price.amount > 0 && currencyValues.has(price.currency)))
    && typeof row.createdAt === 'string' && TIMESTAMP_PATTERN.test(row.createdAt) && Number.isFinite(created.getTime())
    && typeof row.updatedAt === 'string' && TIMESTAMP_PATTERN.test(row.updatedAt) && Number.isFinite(updated.getTime())
    && updated >= created
}

export function orderStatusName(value, ops) {
  return ops.statuses.find(status => status.value === value)?.name ?? '—'
}

export function formatOrderMoney(price, ops) {
  if (!price) return '—'
  const alias = ops.currencies.find(currency => currency.value === price.currency)?.routeAlias
  if (!alias) return '—'
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(price.amount)} ${alias.toUpperCase()}`
}
