// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export const serviceCatalogueOps = {
  services:[
    { value:0, name:'Товар', routeAlias:'product' },
    { value:100, name:'Доставка до склада в США', routeAlias:'us-warehouse-delivery' },
    { value:200, name:'Доставка из США в Россию', routeAlias:'international-delivery' },
    { value:300, name:'Доставка по России', routeAlias:'domestic-delivery' },
    { value:400, name:'Комиссия/маржа «Сарафана»', routeAlias:'service-commission' },
    { value:500, name:'Фото товара на складе в США', routeAlias:'warehouse-photo' },
    { value:600, name:'Проверка товара', routeAlias:'product-inspection' },
    { value:700, name:'Страхование отправления', routeAlias:'shipment-insurance' }
  ].map(service => ({ ...service, allowedCurrencies:[643, 840], allowedPriceMethods:[0, 100, 200, 300, 400] })),
  priceMethods:[
    { value:0, name:'Процент от цены товара', routeAlias:'percent' },
    { value:100, name:'Фиксированная стоимость', routeAlias:'fixed' },
    { value:200, name:'Ввод вручную', routeAlias:'manual' },
    { value:300, name:'Автоматическое определение', routeAlias:'auto' },
    { value:400, name:'Стоимость по диапазонам', routeAlias:'stepped' }
  ],
  currencies:[
    { value:643, name:'Российский рубль', routeAlias:'rub', symbol:'₽' },
    { value:840, name:'Доллар США', routeAlias:'usd', symbol:'$' }
  ],
  auditActions:[
    { value:0, name:'Создано', routeAlias:'created' },
    { value:100, name:'Изменено', routeAlias:'updated' },
    { value:200, name:'Удалено', routeAlias:'deleted' }
  ],
  limits:{ maximumAmount:99999999.99, amountDecimalPlaces:2, maximumPercentage:100, percentageDecimalPlaces:4, auditSearchMaxLength:200, auditPageSizeMaximum:100, maximumBands:100 },
  actions:{ view:true, create:true, edit:true, delete:true, audit:true },
  availabilityTimeZone:'Europe/Moscow'
}

export const percentageEntry = {
  id:1, service:0, priceMethod:0, percentage:10.125, minimumAmount:1.25, maximumAmount:100,
  amount:null, currency:840, intervalCurrency:null, bands:[], availableFrom:'2026-01-01', availableBy:'2026-01-31',
  createdAt:'2026-09-21T10:00:00Z', updatedAt:'2026-09-21T10:00:00Z',
  version:'11111111-1111-4111-8111-111111111111'
}
export const fixedEntry = {
  ...percentageEntry, id:2, service:100, priceMethod:100, percentage:null, minimumAmount:null,
  maximumAmount:null, amount:1500.5, currency:840, availableFrom:'2026-02-01', availableBy:null,
  version:'22222222-2222-4222-8222-222222222222'
}
export const manualEntry = {
  ...fixedEntry, id:3, service:200, priceMethod:200, amount:null, currency:840,
  version:'33333333-3333-4333-8333-333333333333'
}
export const serviceCatalogueEntries = [percentageEntry, fixedEntry, manualEntry]

export const auditItems = [
  { id:1, entryId:1, service:0, action:0, actorId:7, actorName:'Иванов Иван', at:'2026-09-21T10:00:00Z', before:null, after:percentageEntry },
  { id:2, entryId:1, service:0, action:100, actorId:7, actorName:'Иванов Иван', at:'2026-09-21T11:00:00Z', before:percentageEntry, after:{ ...percentageEntry, percentage:12 } },
  { id:3, entryId:1, service:0, action:200, actorId:7, actorName:'Иванов Иван', at:'2026-09-21T12:00:00Z', before:{ ...percentageEntry, percentage:12 }, after:null }
]

export function auditPage(overrides = {}) {
  return {
    items:auditItems,
    pagination:{ currentPage:1, pageSize:25, totalCount:3, totalPages:1, hasNextPage:false, hasPreviousPage:false },
    sorting:{ sortBy:'timestamp', sortOrder:'desc' },
    search:null, service:null, action:null, entryId:null,
    ...overrides
  }
}
