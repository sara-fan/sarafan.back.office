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
    && [null, 1, 2, 4, 8].includes(value.area) && [null, 0, 100, 200].includes(value.actorType)
    && [value.from, value.to].every(date => date === '' || dateIsValid(date))
    ? { orderNumber:value.orderNumber, search:value.search, area:value.area, actorType:value.actorType, from:value.from, to:value.to } : null
}
export function validateHistoryOps(value) {
  for (const [key, values] of [['kinds', [0, 100, 200, 300, 400, 500]], ['areas', [1, 2, 4, 8]], ['actorTypes', [0, 100, 200]]]) {
    const allowedLengths = key === 'kinds' ? [values.length - 1, values.length] : [values.length]
    if (!Array.isArray(value?.[key]) || !allowedLengths.includes(value[key].length)
      || new Set(value[key].map(item => item.value)).size !== value[key].length
      || values.slice(0, key === 'kinds' ? -1 : undefined).some(item => !value[key].some(entry => entry.value === item))
      || !value[key].every(item => values.includes(item.value) && typeof item.name === 'string' && item.name.trim() && typeof item.routeAlias === 'string' && item.routeAlias.trim())) fail()
  }
  return value
}
export function historyItemIsValid(value, ops) {
  return value && typeof value.eventKey === 'string' && /^[0-3]-[1-9]\d*$/u.test(value.eventKey)
    && timestampIsValid(value.at) && ops.kinds.some(item => item.value === value.kind)
    && Number.isInteger(value.areas) && value.areas > 0 && value.areas <= 15
    && ops.actorTypes.some(item => item.value === value.actorType)
    && typeof value.actorName === 'string' && !!value.actorName.trim()
}
export function validateHistoryDetail(value, row, ops, orderOps, pricingOps) {
  if (!value || ![1, 2].includes(value.version) || typeof value.missingCreationDetails !== 'boolean'
    || !historyItemIsValid(value.event, ops) || Object.keys(row).some(key => value.event[key] !== row[key])
    || ![value.productBefore, value.productAfter].every(product => product === null || productIsValid(product, orderOps.currencies, orderOps.productLimits))
    || ![value.statusBefore, value.statusAfter].every(status => status === null || orderOps.statuses.some(item => item.value === status))
    || !(value.sourceUrl === null || typeof value.sourceUrl === 'string')
    || ![value.validUntilBefore, value.validUntilAfter].every(time => time === null || timestampIsValid(time))
    || value.version === 2 && value.event.kind !== 500
    || value.version === 1 && value.cancellationReason != null
    || value.version === 2 && !(value.cancellationReason === null
      || typeof value.cancellationReason === 'string' && value.cancellationReason.length > 0
        && value.cancellationReason.length <= 2000)) fail()
  for (const price of [value.pricingBefore, value.pricingAfter]) if (price !== null) validateCalculation(price, pricingOps)
  return value
}
export const historyAreas = (value, ops) => ops.areas.filter(item => (value & item.value) !== 0).map(item => item.name).join(', ')
