// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export const currencies = [
  { value:643, name:'Российский рубль', routeAlias:'rub' },
  { value:840, name:'Доллар США', routeAlias:'usd' },
  { value:978, name:'Евро', routeAlias:'eur' }
]
export const limit = { maximumAmount:900, currency:978, available:true, sourceEffectiveDate:'2026-09-15', maximumTotalUsd:1125,
  exceededMessage:'Максимальная стоимость заказа при экспресс-перевозке 900 евро с учётом резерва 10% на изменение курса' }
export const productLimits = { minimumQuantity:1, maximumQuantity:4, defaultQuantity:1, storeNameMaximumLength:200, productNameMaximumLength:500,
  colorMaximumLength:200, sizeMaximumLength:200, commentMaximumLength:2000, sellerPriceCurrency:840,
  maximumUnitPrice:99999999.99, priceDecimalPlaces:2, valueLimit:limit }
export const ops = { currencies, productLimits, statuses:[
  { value:0, name:'На проверке', routeAlias:'under_review', upperStatusValue:0, upperStatusName:'На проверке', upperStatusRouteAlias:'under_review' },
  { value:300, name:'Оплачен', routeAlias:'paid', upperStatusValue:300, upperStatusName:'Выполняется', upperStatusRouteAlias:'in_progress' }
], statusGroups:[{ routeAlias:'work', name:'В работе', statuses:[0, 300] }, { routeAlias:'in_progress', name:'Выполняется', statuses:[300] }] }
export const product = { productName:'Чайник', storeName:'Магазин', sellerPrice:{ amount:40, currency:840 }, quantity:1, color:'Красный', size:null, comment:null }
export const details = {
  orderNumber:'12345678-1', status:0, sourceUrl:'https://shop.example/item',
  createdAt:'2026-09-15T10:00:00.123456Z', updatedAt:'2026-09-15T11:00:00.654321Z',
  product, limitCheck:limit, canEditProduct:true,
  savedLimitSourceEffectiveDate:'2026-09-14',
  imageUrl:'https://shop.example/item.png', dimensions:{ lengthCm:1, widthCm:2, heightCm:3 }, characteristics:{ Материал:'Сталь' },
  customer:{ lastName:'Иванов', firstName:'Иван', patronymic:null, phone:'+79991234567', email:null,
    passportSeries:null, passportNumber:null, passportIssueDate:null, passportIssuedBy:null, inn:null,
    postalCode:null, city:'Москва', address:null }
}
