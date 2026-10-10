// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export const paymentOps = {
  canManage:true, recipientTypes:[{ value:0, name:'Юридическое лицо', routeAlias:'legal-entity' }, { value:1, name:'ИП', routeAlias:'individual-entrepreneur' }],
  states:[{ value:'draft', name:'Черновик' }, { value:'enabled', name:'Включён' }, { value:'disabled', name:'Отключён' }],
  limits:{ nameMaxLength:200, linkMaxLength:2048, qrMaxBytes:2097152, qrContentTypes:['image/png', 'image/jpeg', 'image/webp'], qrMaxDimension:4096, qrMaxPixels:4194304, qrMaxMetadataBytes:1048576 }
}
export const paymentBundle = {
  id:1, version:'11111111-1111-4111-8111-111111111111',
  information:{ recipientType:0, recipientName:'Получатель', inn:'0012345678', kpp:'001234567', settlementAccount:'00000000000000000001',
    bankName:'Банк', bik:'001234567', correspondentAccount:'00000000000000000002', paymentLink:'https://bank.example/Pay/Ab%2Fc?token=AbC+%2B' },
  state:'draft', enabled:false, qrUrl:'/api/v1/backoffice/payment-information-bundles/1/qr?v=' + 'a'.repeat(64),
  createdAt:'2026-10-10T12:00:00Z', updatedAt:'2026-10-10T12:00:00Z', createdBy:1, updatedBy:1,
  canEdit:true, canEnable:true, canDisable:false, canDelete:true, canCopy:false
}
export function paymentRow(state, id = 1) {
  const frozen = state !== 'draft', enabled = state === 'enabled'
  return { ...globalThis.structuredClone(paymentBundle), id, state, enabled, qrUrl:paymentBundle.qrUrl.replace('/1/', `/${id}/`),
    canEdit:!frozen, canEnable:!enabled, canDisable:enabled, canDelete:!enabled, canCopy:frozen }
}
export function paymentPage(items = [paymentRow('draft')], query = new globalThis.URLSearchParams()) {
  const page = Number(query.get('page') ?? 1), pageSize = Number(query.get('pageSize') ?? 10)
  const totalCount = items.length, totalPages = totalCount ? Math.ceil(totalCount / pageSize) : 0
  const active = items.find(item => item.enabled)
  return { items, pagination:{ currentPage:page, pageSize,totalCount,totalPages,hasNextPage:page < totalPages,hasPreviousPage:page > 1 },
    sorting:{ sortBy:query.get('sortBy') ?? 'id', sortOrder:query.get('sortOrder') ?? 'desc' },
    search:query.get('search'), state:query.get('state'), enabledBundle:active ? { id:active.id,version:active.version } : null }
}
