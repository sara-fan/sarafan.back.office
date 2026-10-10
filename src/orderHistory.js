// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createInternalProblem } from './errors/problem.js'
import { dateIsValid, timestampIsValid, productIsValid, orderNumberIsValid } from './orderProduct.js'
import { validateCalculation } from './orderPricing.js'

export const HISTORY_SORT_KEYS = ['timestamp', 'event', 'actor']
export const historyDefaults = { page:1, pageSize:25, sortBy:[{ key:'timestamp', order:'desc' }], filters:{ orderNumber:'', search:'', area:null, actorType:null, from:'', to:'' } }
const fail = () => { throw createInternalProblem('protocolError') }
export function normalizeHistoryFilters(value) {
  return value && (value.orderNumber === '' || orderNumberIsValid(value.orderNumber)) && typeof value.search === 'string' && value.search.length <= 200
    && [null, 1, 2, 4, 8, 16, 32].includes(value.area) && [null, 0, 100, 200].includes(value.actorType)
    && [value.from, value.to].every(date => date === '' || dateIsValid(date))
    ? { orderNumber:value.orderNumber, search:value.search, area:value.area, actorType:value.actorType, from:value.from, to:value.to } : null
}
export function validateHistoryOps(value) {
  for (const [key, values] of [['kinds', [0, 100, 200, 300, 400, 500, 600, 700, 800]], ['areas', [1, 2, 4, 8, 16, 32]], ['actorTypes', [0, 100, 200]]]) {
    const required = values.slice(0, key === 'kinds' ? 5 : key === 'areas' ? 4 : undefined)
    const allowedLengths = key === 'areas' ? [4, 5, 6] : [values.length]
    if (!Array.isArray(value?.[key]) || value[key].length < required.length || key !== 'kinds' && !allowedLengths.includes(value[key].length)
      || new Set(value[key].map(item => item?.value)).size !== value[key].length
      || required.some(item => !value[key].some(entry => entry?.value === item))
      || !value[key].every(item => item && Number.isInteger(item.value) && item.value >= 0 && (key === 'kinds' || values.includes(item.value)) && typeof item.name === 'string' && item.name.trim() && typeof item.routeAlias === 'string' && item.routeAlias.trim())) fail()
  }
  return value
}
export function historyItemIsValid(value, ops) {
  return value && typeof value.eventKey === 'string' && /^[0-3]-[1-9]\d*$/u.test(value.eventKey)
    && timestampIsValid(value.at) && ops.kinds.some(item => item.value === value.kind)
    && Number.isInteger(value.areas) && value.areas > 0 && value.areas <= 63
    && (value.areas & ~ops.areas.reduce((mask, item) => mask | item.value, 0)) === 0
    && ops.actorTypes.some(item => item.value === value.actorType)
    && typeof value.actorName === 'string' && !!value.actorName.trim()
}
export function validateHistoryDetail(value, row, ops, orderOps, pricingOps) {
  if (!value || ![1, 2, 3, 4, 5].includes(value.version) || typeof value.missingCreationDetails !== 'boolean'
    || !historyItemIsValid(value.event, ops) || Object.keys(row).some(key => value.event[key] !== row[key])
    || ![value.productBefore, value.productAfter].every(product => product === null || productIsValid(product, orderOps.currencies, orderOps.productLimits))
    || ![value.statusBefore, value.statusAfter].every(status => status === null || Number.isInteger(status))
    || !(value.sourceUrl === null || typeof value.sourceUrl === 'string')
    || ![value.validUntilBefore, value.validUntilAfter].every(time => time === null || timestampIsValid(time))
    || value.version === 2 && value.event.kind !== 500
    || value.version >= 2 && ![value.statusBefore, value.statusAfter].every(Number.isInteger)
    || value.version === 3 && ![600, 700].includes(value.event.kind)
    || [600, 700].includes(value.event.kind) && value.version !== 3
    || value.event.kind === 800 && value.version !== 4
    || value.event.kind === 600 && (typeof value.reviewReason !== "string" || !value.reviewReason.trim() || value.reviewReason.length > 2000)
    || value.event.kind === 700 && value.reviewReason != null
    || value.version === 4 && (value.event.kind !== 800
      || typeof value.checkoutDeliveryName !== 'string' || !value.checkoutDeliveryName.trim() || value.checkoutDeliveryName.length > 500)
    || value.version !== 4 && value.checkoutDeliveryName != null
    || value.event.kind === 900 && value.version !== 5
    || value.version === 5 && (value.event.kind !== 900 || value.event.areas !== 32 || value.customsPaidBefore !== false
      || value.customsPaidAfter !== true || value.statusBefore !== value.statusAfter)
    || value.version !== 5 && (value.customsPaidBefore != null || value.customsPaidAfter != null)
    || value.version === 1 && value.cancellationReason != null
    || value.version === 2 && !(value.cancellationReason === null
      || typeof value.cancellationReason === 'string' && value.cancellationReason.length > 0
        && value.cancellationReason.length <= 2000)) fail()
  for (const price of [value.pricingBefore, value.pricingAfter]) if (price !== null) validateCalculation(price, pricingOps)
  return value
}
export const historyAreas = (value, ops) => ops.areas.filter(item => (value & item.value) !== 0).map(item => item.name).join(', ')
