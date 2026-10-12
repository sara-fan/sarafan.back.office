// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export const id = '10000000-0000-4000-8000-000000000001'
export const version = '10000000-0000-4000-8000-000000000002'
export const attemptId = '10000000-0000-4000-8000-000000000003'
export const ops = { enabled:true, canManage:true, maximumOrders:1000, maximumLabelLength:200, maximumCommandBytes:1048576,
  maximumOutboundBytes:33554432, maximumResponseBytes:4194304, mappingVersion:1, demoDefaults:['CPT, 643, вес единицы 1 кг'],
  unitPriceCurrency:{ value:840, name:'Доллар США', routeAlias:'usd', symbol:'$' },
  states:['Submitting', 'Succeeded', 'PartiallySucceeded', 'Rejected', 'Unknown'].map((routeAlias, value) => ({ value, routeAlias, name:['Отправляется', 'Создан', 'Создан частично', 'Отклонён', 'Результат неизвестен'][value] })) }
export const goods = { postingNumber:'12345678-1', productName:'Товар', unitPrice:12.34, quantity:2, productLink:'https://shop.test/item',
  weightKg:1, currency:'USD', countryCode:643, senderCountryCode:643, tradingCountryCode:643 }
export const operation = { id, version, fileName:'Sarafan-20261012-150000-10000000', state:'Submitting', phase:'Queued',
  createdAt:'2026-10-12T12:00:00Z', updatedAt:'2026-10-12T12:00:00Z', total:1, created:0, rejected:0, unresolved:1,
  attemptId:null, registerId:null, investigationRequired:false, failure:null }
export const row = { rowNumber:1, orderNumber:goods.postingNumber, outcome:'Unresolved', parcelId:null, statusId:null, checkStatus:null, issues:[], goods }
export const command = { operationId:id, orders:[{ orderNumber:goods.postingNumber, expectedUpdatedAt:operation.updatedAt }], fileName:null }
export const preview = { operationId:id, fileName:operation.fileName, mappingVersion:1, fingerprint:'A'.repeat(64), parcels:[goods],
  register:{ fileName:operation.fileName, realWeightKg:2, customsProcedureCode:40, transportationTypeCode:1, incotermsCode:2 }, demoDefaults:ops.demoDefaults }
export function page(items, query, sort = 'rowNumber', total = items.length) {
  const q = typeof query === 'string' ? new globalThis.URLSearchParams(query.split('?')[1]) : query
  const current = Number(q.get('page') || 1), size = Number(q.get('pageSize') || 25), pages = Math.ceil(total / size)
  return { items, search:q.get('search') || '', sorting:{ sortBy:q.get('sortBy') || sort, sortOrder:q.get('sortOrder') || 'asc' },
    pagination:{ currentPage:current, pageSize:size, totalCount:total, totalPages:pages, hasNextPage:current < pages, hasPreviousPage:current > 1 } }
}
