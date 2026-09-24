// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createInternalProblem } from './errors/problem.js'
import { validateServiceCatalogueEntry, validateServiceCatalogueOps } from './serviceCatalogue.js'

const fail = () => { throw createInternalProblem('protocolError') }
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.+(?:Z|\+00:00)$/u.test(value) && Number.isFinite(Date.parse(value))
const amount = (value, max = 99999999.99) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max && /^\d+(?:\.\d{1,2})?$/u.test(String(value))
const optionalAmount = value => value === null || amount(value)
const optionalServices = ops => ops.catalogue.services.filter(item => ['warehouse-photo', 'product-inspection', 'shipment-insurance'].includes(item.routeAlias))
export { optionalServices }

export function validatePricingOps(value) {
  validateServiceCatalogueOps(value?.catalogue)
  if (value.validityHours !== 24 || typeof value.canManage !== 'boolean' || !Array.isArray(value.componentStates)
    || value.componentStates.length !== 3) fail()
  const aliases = ['calculated', 'not-calculated', 'not-applicable']
  value.componentStates.forEach((item, index) => {
    if (item.value !== index * 100 || item.routeAlias !== aliases[index] || typeof item.name !== 'string' || !item.name.trim()) fail()
  })
  return value
}

function validateInputs(value, ops) {
  if (!value || !value.manualAmounts || typeof value.manualAmounts !== 'object' || Array.isArray(value.manualAmounts)
    || !Array.isArray(value.selectedServices) || new Set(value.selectedServices).size !== value.selectedServices.length
    || !value.selectedServices.every(service => optionalServices(ops).some(item => item.value === service))
    || !optionalAmount(value.domesticDeliveryRub) || !optionalAmount(value.customsRub)) fail()
  for (const [key, price] of Object.entries(value.manualAmounts)) {
    if (!ops.catalogue.services.some(item => String(item.value) === key) || !amount(price)) fail()
  }
}

function validateCalculation(value, ops) {
  if (!value || !timestamp(value.calculatedAt) || !Array.isArray(value.components)
    || value.components.length !== ops.catalogue.services.length
    || new Set(value.components.map(item => item.service)).size !== value.components.length
    || value.totalRub !== null && !amount(value.totalRub, 8 * ops.catalogue.limits.maximumAmount)) fail()
  validateInputs(value.inputs, ops)
  if (value.exchangeRate !== null) {
    const rate = value.exchangeRate
    if (!rate || !Number.isSafeInteger(rate.id) || rate.id <= 0 || rate.provider !== 'CBR'
      || rate.baseCurrency !== 840 || rate.quoteCurrency !== 643 || !Number.isSafeInteger(rate.nominal) || rate.nominal <= 0
      || typeof rate.officialRate !== 'number' || !Number.isFinite(rate.officialRate) || rate.officialRate <= 0
      || typeof rate.sourceEffectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(rate.sourceEffectiveDate)) fail()
  }
  for (const component of value.components) {
    if (!ops.catalogue.services.some(item => item.value === component.service)
      || !ops.catalogue.currencies.some(item => item.value === component.currency)
      || !ops.componentStates.some(item => item.value === component.state)
      || !optionalAmount(component.amount) || !optionalAmount(component.amountRub)) fail()
    if (component.state === 0 && (component.amount === null || component.amountRub === null)
      || component.state === 200 && (component.amount !== null || component.amountRub !== null)) fail()
    if (component.tariff !== null) {
      validateServiceCatalogueEntry(component.tariff, ops.catalogue)
      if (component.tariff.service !== component.service) fail()
    }
  }
  const domestic = ops.catalogue.services.find(item => item.routeAlias === 'domestic-delivery').value
  const included = value.components.filter(item => item.service !== domestic && item.state !== 200)
  if (included.some(item => item.state !== 0)) { if (value.totalRub !== null) fail() }
  else if (value.totalRub === null || Math.round(value.totalRub * 100) !== included.reduce((sum, item) => sum + Math.round(item.amountRub * 100), 0)) fail()
  return value
}

export function validateOrderPricing(value, ops, orderNumber) {
  if (!value || value.orderNumber !== orderNumber || !timestamp(value.updatedAt)
    || !['canEdit', 'canConfirm', 'confirmed', 'expired'].every(key => typeof value[key] === 'boolean')
    || value.validUntil !== null && !timestamp(value.validUntil)
    || value.confirmed !== (value.validUntil !== null) || value.expired && !value.confirmed
    || value.confirmed && (value.canEdit || value.canConfirm)
    || !Array.isArray(value.history) || value.history.length > 100 || !Array.isArray(value.activeTariffs)) fail()
  validateCalculation(value.calculation, ops)
  if (value.canConfirm && (!value.canEdit || value.calculation.totalRub === null)) fail()
  value.activeTariffs.forEach(item => validateServiceCatalogueEntry(item, ops.catalogue))
  if (new Set(value.activeTariffs.map(item => item.service)).size !== value.activeTariffs.length) fail()
  let previousId = Infinity
  for (const item of value.history) {
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || item.id >= previousId || !timestamp(item.at)
      || item.validUntil !== null && (!timestamp(item.validUntil) || Date.parse(item.validUntil) <= Date.parse(item.at))
      || (item.actorId === null ? item.actorName !== null : !Number.isSafeInteger(item.actorId) || item.actorId <= 0 || typeof item.actorName !== 'string' || !item.actorName.trim())) fail()
    previousId = item.id
    validateCalculation(item.calculation, ops)
  }
  return value
}

export function manualPricingTariffs(value, ops) {
  const method = ops.catalogue.priceMethods.find(item => item.routeAlias === 'manual').value
  const excluded = ops.catalogue.services.filter(item => ['product', 'domestic-delivery'].includes(item.routeAlias)).map(item => item.value)
  return value.activeTariffs.filter(item => item.priceMethod === method && !excluded.includes(item.service))
}

export function pricingForm(value, ops) {
  const inputs = value.calculation.inputs
  const text = number => number === null || number === undefined ? '' : number.toFixed(2).replace('.', ',')
  return { selectedServices:[...inputs.selectedServices], domesticDeliveryRub:text(inputs.domesticDeliveryRub), customsRub:text(inputs.customsRub),
    manualAmounts:Object.fromEntries(manualPricingTariffs(value, ops).map(item => [item.service, text(inputs.manualAmounts[item.service])])) }
}

export function pricingPayload(form, updatedAt, ops) {
  const errors = {}
  const read = (text, field) => {
    if (text === '') return null
    const normalized = String(text).trim().replace(',', '.')
    const value = Number(normalized)
    if (!/^\d+(?:\.\d{1,2})?$/u.test(normalized) || !amount(value, ops.catalogue.limits.maximumAmount)) errors[field] = ['Укажите неотрицательную сумму с двумя дробными знаками.']
    return value
  }
  const inputs = { manualAmounts:{}, selectedServices:[...form.selectedServices],
    domesticDeliveryRub:read(form.domesticDeliveryRub, 'domesticDeliveryRub'), customsRub:read(form.customsRub, 'customsRub') }
  for (const [key, text] of Object.entries(form.manualAmounts)) {
    const value = read(text, 'manualAmounts')
    if (value !== null) inputs.manualAmounts[key] = value
  }
  if (Object.keys(errors).length) throw createInternalProblem('invalidInput', { errors })
  return { expectedUpdatedAt:updatedAt, inputs }
}
