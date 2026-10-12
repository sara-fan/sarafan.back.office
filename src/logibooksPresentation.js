// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { dateInputDisplay } from './dateInput.js'
import { formatMoneyAmount } from './moneyFormatting.js'
export const goodsColumns = [
  ['postingNumber', '№ посылки', 150], ['tnVed', 'ТН ВЭД', 140], ['productName', 'Описание', 300],
  ['productLink', 'Ссылка на товар', 240], ['lastName', 'Фамилия', 160], ['firstName', 'Имя', 140],
  ['patronymic', 'Отчество', 160], ['phone', 'Телефон', 170], ['email', 'Email', 220],
  ['postalCode', 'Индекс', 110], ['city', 'Город', 160], ['address', 'Улица', 260], ['passport', 'Паспорт', 300],
  ['inn', 'ИНН', 160], ['weightKg', 'Вес', 110], ['unitPrice', 'Стоимость', 150], ['currency', 'Валюта', 110],
  ['quantity', 'Количество', 140], ['sender', 'Отправитель', 180], ['senderPhone', 'Телефон отправителя', 220],
  ['senderEmail', 'Email отправителя', 220], ['senderAddress', 'Адрес отправителя', 260],
  ['countryCode', 'Страна', 110], ['senderCountryCode', 'Страна отправления', 220], ['tradingCountryCode', 'Торгующая страна', 210]
].map(([key, title, width]) => ({ key, title, width, minWidth:width, maxWidth:width, sortable:false }))
export const displayOptional = value => value == null || value === '' ? '—' : String(value)
export const displayWeight = value => value == null ? '—' : value.toFixed(3).replace('.', ',')
export function goodsCell(goods, key, symbol) {
  if (key === 'passport') return displayOptional([
    goods.passportSeries, goods.passportNumber,
    goods.passportIssuedBy || goods.passportIssueDate ? 'выдан' : null,
    goods.passportIssuedBy, goods.passportIssueDate ? dateInputDisplay(goods.passportIssueDate) : null
  ].filter(Boolean).join(' '))
  if (key === 'unitPrice') return formatMoneyAmount(goods.unitPrice) + symbol
  if (key === 'currency') return symbol
  if (key === 'weightKg') return displayWeight(goods.weightKg)
  return displayOptional(goods[key])
}
