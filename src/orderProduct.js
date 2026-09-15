// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createInternalProblem } from './errors/problem.js'

export const PRODUCT_FIELDS = ['productName', 'storeName', 'sellerPrice', 'quantity', 'color', 'size', 'comment']
export const CUSTOMER_FIELDS = Object.freeze({
  lastName:'Фамилия', firstName:'Имя', patronymic:'Отчество', inn:'ИНН',
  phone:'Телефон', email:'Email', passportSeries:'Серия паспорта', passportNumber:'Номер паспорта',
  passportIssueDate:'Дата выдачи паспорта', passportIssuedBy:'Кем выдан паспорт',
  postalCode:'Индекс', city:'Город', address:'Адрес'
})
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0
const text = (value, max) => value === null || (typeof value === 'string' && value.length <= max)
export const orderNumberIsValid = value => typeof value === 'string' && /^\d{8}-[1-9]\d*$/u.test(value)
export const dateIsValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
export const timestampIsValid = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  && dateIsValid(value.slice(0, 10)) && Number.isFinite(Date.parse(value))

export function limitIsValid(value, currencies) {
  return value && positive(value.maximumAmount)
    && typeof value.exceededMessage === 'string' && /[А-Яа-яЁё]/u.test(value.exceededMessage)
    && currencies.some(item => item.value === value.currency && item.routeAlias === 'eur')
    && typeof value.available === 'boolean'
    && (value.available ? dateIsValid(value.sourceEffectiveDate)
      && typeof value.maximumTotalUsd === 'number' && Number.isFinite(value.maximumTotalUsd) && value.maximumTotalUsd >= 0
      : value.sourceEffectiveDate === null && value.maximumTotalUsd === null)
}

export function validateProductLimits(value, currencies) {
  if (!value || !['minimumQuantity', 'maximumQuantity', 'defaultQuantity', 'storeNameMaximumLength', 'productNameMaximumLength',
    'colorMaximumLength', 'sizeMaximumLength', 'commentMaximumLength'].every(key => Number.isSafeInteger(value[key]) && value[key] > 0)
    || value.minimumQuantity > value.defaultQuantity || value.defaultQuantity > value.maximumQuantity
    || !positive(value.maximumUnitPrice) || value.priceDecimalPlaces !== 2
    || !currencies.some(item => item.value === value.sellerPriceCurrency && item.routeAlias === 'usd')
    || !limitIsValid(value.valueLimit, currencies)) throw createInternalProblem('protocolError')
  return value
}

function productIsValid(product, currencies, limits) {
  return product && text(product.productName, limits.productNameMaximumLength)
    && text(product.storeName, limits.storeNameMaximumLength)
    && text(product.color, limits.colorMaximumLength) && text(product.size, limits.sizeMaximumLength)
    && text(product.comment, limits.commentMaximumLength) && Number.isSafeInteger(product.quantity) && product.quantity > 0
    && (product.sellerPrice === null || (positive(product.sellerPrice?.amount)
      && currencies.some(item => item.value === product.sellerPrice.currency)))
}

export function validateOrderDetails(value, ops, number) {
  if (!value || value.orderNumber !== number || !orderNumberIsValid(number)
    || !ops.statuses.some(item => item.value === value.status)
    || typeof value.sourceUrl !== 'string'
    || !timestampIsValid(value.createdAt) || !timestampIsValid(value.updatedAt)
    || Date.parse(value.updatedAt) < Date.parse(value.createdAt)
    || !productIsValid(value.product, ops.currencies, ops.productLimits)
    || !value.customer || !Object.keys(CUSTOMER_FIELDS).every(key => key === 'passportIssueDate'
      ? value.customer[key] === null || dateIsValid(value.customer[key]) : text(value.customer[key], 2000))
    || typeof value.customer.phone !== 'string' || !value.customer.phone
    || !text(value.imageUrl, 2048)
    || !(value.savedLimitSourceEffectiveDate === null || dateIsValid(value.savedLimitSourceEffectiveDate))
    || !(value.dimensions === null || (value.dimensions && ['lengthCm', 'widthCm', 'heightCm'].every(key => positive(value.dimensions[key]))))
    || !(value.characteristics === null || (typeof value.characteristics === 'object' && !Array.isArray(value.characteristics)
      && Object.entries(value.characteristics).every(([key, item]) => key.length > 0 && typeof item === 'string')))
    || !limitIsValid(value.limitCheck, ops.currencies) || typeof value.canEditProduct !== 'boolean'
    || (value.canEditProduct && !ops.statuses.some(item => item.value === value.status && item.routeAlias === 'under_review'))) {
    throw createInternalProblem('protocolError')
  }
  return value
}

export function productForm(product, limits) {
  return { productName:product.productName ?? '', storeName:product.storeName ?? '',
    sellerPrice:product.sellerPrice?.currency === limits.sellerPriceCurrency ? String(product.sellerPrice.amount) : '',
    quantity:String(product.quantity), color:product.color ?? '', size:product.size ?? '', comment:product.comment ?? '' }
}

// Parse decimal input into integer cents, without binary floating-point comparisons.
export function priceCents(value) {
  const raw = String(value).trim().replace(',', '.')
  if (!/^\d+(?:\.\d{1,2})?$/u.test(raw)) return null
  const [whole, fraction = ''] = raw.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function productValidation(form, limits, limit) {
  const errors = {}
  if (!form.productName.trim()) errors.productName = ['Укажите название товара.']
  for (const [key, max] of [['productName', limits.productNameMaximumLength], ['storeName', limits.storeNameMaximumLength], ['color', limits.colorMaximumLength],
    ['size', limits.sizeMaximumLength], ['comment', limits.commentMaximumLength]]) {
    if (form[key].trim().length > max) errors[key] = [`Не более ${max} символов.`]
  }
  const quantity = /^\d+$/u.test(form.quantity.trim()) ? Number(form.quantity) : NaN
  if (!Number.isSafeInteger(quantity) || quantity < limits.minimumQuantity) errors.quantity = ['Укажите положительное целое количество.']
  else if (quantity > limits.maximumQuantity) errors.quantity = ['Такое количество товара может быть признано коммерческой партией и запрещено к ввозу']
  const cents = priceCents(form.sellerPrice)
  if (cents === null || cents <= 0n || cents > priceCents(limits.maximumUnitPrice)) errors.sellerPrice = ['Укажите положительную цену в USD, не более двух знаков после запятой.']
  // Core supplies a conservative USD-cent ceiling. Core owns the exact cross-rate validation and message.
  else if (!errors.quantity && limit.available && cents * BigInt(quantity) > priceCents(limit.maximumTotalUsd)) {
    errors.sellerPrice = [limit.exceededMessage]
  }
  return Object.keys(errors).length ? createInternalProblem('invalidInput', { errors }) : null
}

export function productPayload(form, limits, expectedUpdatedAt) {
  return { expectedUpdatedAt, storeName:form.storeName.trim() || null, productName:form.productName.trim(),
    sellerPrice:{ amount:Number(priceCents(form.sellerPrice)) / 100, currency:limits.sellerPriceCurrency },
    quantity:Number(form.quantity), color:form.color.trim() || null, size:form.size.trim() || null, comment:form.comment.trim() || null }
}
