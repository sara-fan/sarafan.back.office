// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
export const ops = {
  statuses:[{ value:0, name:'Скрыт', routeAlias:'hidden' }, { value:1, name:'Активен', routeAlias:'active' }],
  limits:{ nameMaxLength:200, descriptionMaxLength:160, descriptionRecommendedLength:140, officialUrlMaxLength:2048, logoMaxBytes:2097152, logoContentTypes:['image/png', 'image/jpeg', 'image/webp'],
    logoMaxDimension:4096, logoMaxPixels:4194304, logoMaxFrames:100, logoMaxAnimationPixels:16777216, logoMaxMetadataBytes:1048576 },
  actions:{ view:true, create:true, edit:true, delete:true }
}
export const store = { id:1, name:'Магазин A', description:'Описание', officialUrl:'https://example.test/', status:0, showOnHome:false, displayOrder:0,
  version:'11111111-1111-4111-8111-111111111111', createdAt:'2026-09-17T12:00:00Z', updatedAt:'2026-09-17T12:00:00Z', logoUrl:null }
export const logoUrl = `/api/v1/backoffice/stores/1/logo?v=${'a'.repeat(64)}`
export const pending = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
