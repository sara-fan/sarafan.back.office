// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { PROBLEM_TYPE_ROOT, createInternalProblem } from './errors/problem.js'
import { can } from './roles.js'

export const SERVICE_CATALOGUE_FIELDS = ['service', 'priceMethod', 'percentage', 'minimumAmount', 'maximumAmount', 'amount', 'currency', 'bands', 'availableFrom', 'availableBy']
export const SERVICE_CATALOGUE_CONFLICT = `${PROBLEM_TYPE_ROOT}service-catalogue-update-conflict`
export const SERVICE_CATALOGUE_VERSION_INVALID = `${PROBLEM_TYPE_ROOT}invalid-service-catalogue-version`
export const SERVICE_CATALOGUE_OVERLAP = `${PROBLEM_TYPE_ROOT}service-catalogue-period-overlap`
export const SERVICE_CATALOGUE_ERROR_OPTIONS = { types:Object.fromEntries(Object.entries({
  'invalid-service-catalogue-service':'service',
  'invalid-service-catalogue-method':'priceMethod',
  'invalid-service-catalogue-bands':'bands',
  'invalid-service-catalogue-currency':'currency',
  'invalid-service-catalogue-percentage':'percentage',
  'invalid-service-catalogue-amount':'amount',
  'invalid-service-catalogue-minimum-amount':'minimumAmount',
  'invalid-service-catalogue-maximum-amount':'maximumAmount',
  'invalid-service-catalogue-dates':['availableFrom', 'availableBy'],
  'invalid-service-catalogue-version':'version',
  'service-catalogue-update-conflict':'version',
  'service-catalogue-product-reserved':'service',
  'service-catalogue-period-overlap':['service', 'availableFrom', 'availableBy']
}).map(([suffix, fields]) => [`${PROBLEM_TYPE_ROOT}${suffix}`, Array.isArray(fields) ? fields : [fields]])) }

const SERVICE_VALUES = [0, 100, 200, 300, 400, 500, 600, 700]
const SERVICE_ALIASES = ['product', 'us-warehouse-delivery', 'international-delivery', 'domestic-delivery', 'service-commission', 'warehouse-photo', 'product-inspection', 'shipment-insurance']
const METHOD_VALUES = [0, 100, 200, 300, 400]
const METHOD_ALIASES = ['percent', 'fixed', 'manual', 'auto', 'stepped']
const CURRENCY_VALUES = [643, 840]
const CURRENCY_ALIASES = ['rub', 'usd']
const MERCHANDISE_CURRENCY = 840
const AUDIT_VALUES = [0, 100, 200]
const AUDIT_ALIASES = ['created', 'updated', 'deleted']
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(value) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/u.test(value)
const positiveInteger = value => Number.isInteger(value) && value > 0
const finite = value => typeof value === 'number' && Number.isFinite(value)
const nullableFinite = value => value === null || finite(value)
const hasScale = (value, places) => {
  if (!finite(value)) return false
  const match = /^-?\d+(?:\.(\d+))?(?:e([+-]?\d+))?$/iu.exec(String(value))
  if (!match) return false
  return Math.max(0, (match[1]?.length ?? 0) - Number(match[2] ?? 0)) <= places
}
const protocol = () => { throw createInternalProblem('protocolError') }

function validateEnum(items, values, aliases) {
  if (!Array.isArray(items) || items.length !== values.length) protocol()
  for (let index = 0; index < values.length; index++) {
    const item = items[index]
    if (item?.value !== values[index] || item.routeAlias !== aliases[index]
      || typeof item.name !== 'string' || !item.name.trim()) protocol()
  }
  return items
}

function validDate(value, nullable = false) {
  if (nullable && value === null) return true
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function validTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.+(?:Z|\+00:00)$/u.test(value) && Number.isFinite(Date.parse(value))
}

export function validateServiceCatalogueOps(value) {
  if (!value || value.availabilityTimeZone !== 'Europe/Moscow'
    || !['view', 'create', 'edit', 'delete', 'audit'].every(key => typeof value.actions?.[key] === 'boolean')
    || !finite(value.limits?.maximumAmount) || value.limits.maximumAmount !== 99999999.99
    || value.limits.amountDecimalPlaces !== 2 || value.limits.maximumPercentage !== 100
    || value.limits.percentageDecimalPlaces !== 4 || value.limits.auditSearchMaxLength !== 200
    || value.limits.auditPageSizeMaximum !== 100 || value.limits.maximumBands !== 100) protocol()
  validateEnum(value.services, SERVICE_VALUES, SERVICE_ALIASES)
  validateEnum(value.priceMethods, METHOD_VALUES, METHOD_ALIASES)
  if (value.services.some(item => !Array.isArray(item.allowedPriceMethods) || item.allowedPriceMethods.length !== value.priceMethods.length
    || new Set(item.allowedPriceMethods).size !== item.allowedPriceMethods.length
    || item.allowedPriceMethods.some(method => !value.priceMethods.some(option => option.value === method)))) protocol()
  validateEnum(value.currencies, CURRENCY_VALUES, CURRENCY_ALIASES)
  if (value.currencies.some(item => typeof item.symbol !== 'string' || !item.symbol)) protocol()
  if (value.services.some(item => !Array.isArray(item.allowedCurrencies) || item.allowedCurrencies.length !== value.currencies.length
    || new Set(item.allowedCurrencies).size !== item.allowedCurrencies.length
    || item.allowedCurrencies.some(currency => !value.currencies.some(option => option.value === currency)))) protocol()
  validateEnum(value.auditActions, AUDIT_VALUES, AUDIT_ALIASES)
  if (value.currencies.some(item => item.value === 978 || item.routeAlias === 'eur')) protocol()
  return value
}

export function serviceCatalogueAction(user, ops, action) {
  const local = action === 'view' || action === 'audit' ? 'viewServiceCatalogue' : 'manageServiceCatalogue'
  return ops?.actions?.[action] === true && can(user, local)
}

export function serviceCatalogueIdentity(user) {
  return user ? `${user.id}:${[...user.roles].sort().join(',')}` : ''
}

export function validateServiceCatalogueEntry(value, ops, id) {
  const service = ops?.services?.find(item => item.value === value?.service)
  const method = ops?.priceMethods?.find(item => item.value === value?.priceMethod)
  const currency = ops?.currencies?.some(item => item.value === value?.currency)
  if (!value || !positiveInteger(value.id) || (id !== undefined && value.id !== Number(id)) || !service || !method || !currency
    || !validDate(value.availableFrom, true) || !validDate(value.availableBy, true)
    || value.availableFrom !== null && value.availableBy !== null && value.availableBy < value.availableFrom
    || !validTimestamp(value.createdAt) || !validTimestamp(value.updatedAt) || !uuid(value.version)
    || !nullableFinite(value.percentage) || !nullableFinite(value.minimumAmount)
    || !nullableFinite(value.maximumAmount) || !nullableFinite(value.amount)) protocol()
  const validShape = method.routeAlias === 'percent'
    ? value.percentage > 0 && value.percentage <= ops.limits.maximumPercentage && hasScale(value.percentage, ops.limits.percentageDecimalPlaces)
      && (value.minimumAmount === null || value.minimumAmount >= 0 && value.minimumAmount <= ops.limits.maximumAmount && hasScale(value.minimumAmount, ops.limits.amountDecimalPlaces))
      && (value.maximumAmount === null || value.maximumAmount >= 0 && value.maximumAmount <= ops.limits.maximumAmount && hasScale(value.maximumAmount, ops.limits.amountDecimalPlaces))
      && (value.minimumAmount === null || value.maximumAmount === null || value.maximumAmount >= value.minimumAmount)
      && value.amount === null && value.currency === MERCHANDISE_CURRENCY
    : method.routeAlias === 'fixed'
      ? value.percentage === null && value.minimumAmount === null && value.maximumAmount === null
        && value.amount >= 0 && value.amount <= ops.limits.maximumAmount && hasScale(value.amount, ops.limits.amountDecimalPlaces) && value.currency !== null
      : value.percentage === null && value.minimumAmount === null && value.maximumAmount === null
        && value.amount === null && value.currency !== null
  if (!validShape) protocol()
  if (!service.allowedCurrencies.includes(value.currency) || !service.allowedPriceMethods.includes(value.priceMethod)) protocol()
  if (method.routeAlias === 'stepped') {
    if (value.intervalCurrency !== MERCHANDISE_CURRENCY || !validBands(value.bands, ops)) protocol()
  } else if (value.intervalCurrency !== null || !Array.isArray(value.bands) || value.bands.length !== 0) protocol()
  return value
}

function validBands(bands, ops) {
  if (!Array.isArray(bands) || !bands.length || bands.length > ops.limits.maximumBands) return false
  const amount = value => finite(value) && value >= 0 && value <= ops.limits.maximumAmount && hasScale(value, ops.limits.amountDecimalPlaces)
  return bands.every((band, index) => band && amount(band.amount)
    && (index === 0 ? band.from === null : amount(band.from) && band.from === bands[index - 1].by)
    && (index === bands.length - 1 ? band.by === null : amount(band.by) && (band.from === null || band.by > band.from)))
}

export function validateServiceCatalogueList(value, ops) {
  if (!Array.isArray(value?.items)) protocol()
  const items = value.items.map(item => validateServiceCatalogueEntry(item, ops))
  if (new Set(items.map(item => item.id)).size !== items.length) protocol()
  for (let index = 1; index < items.length; index++) {
    const previous = items[index - 1]
    const current = items[index]
    if (current.service < previous.service
      || current.service === previous.service && previous.availableFrom === null && current.availableFrom !== null
      || current.service === previous.service && current.availableFrom !== null && previous.availableFrom !== null && current.availableFrom > previous.availableFrom
      || current.service === previous.service && current.availableFrom === previous.availableFrom && current.id < previous.id) protocol()
  }
  return items
}

export function serviceCatalogueForm(value, ops) {
  const defaultService = value ? ops.services.find(item => item.value === value.service) : ops.services.find(item => item.routeAlias !== 'product')
  const selectedPriceMethod = value?.priceMethod ?? defaultService.allowedPriceMethods[0]
  return {
    service:value?.service ?? defaultService.value,
    priceMethod:selectedPriceMethod,
    percentage:decimalInput(value?.percentage),
    minimumAmount:decimalInput(value?.minimumAmount),
    maximumAmount:decimalInput(value?.maximumAmount),
    amount:decimalInput(value?.amount),
    currency:selectedPriceMethod === 0 ? MERCHANDISE_CURRENCY : value?.currency ?? defaultService.allowedCurrencies[0],
    bands:value?.bands?.length ? value.bands.map(band => ({ from:decimalInput(band.from), by:decimalInput(band.by), amount:decimalInput(band.amount) })) : [{ from:'', by:'', amount:'' }],
    availableFrom:value?.availableFrom ?? '',
    availableBy:value?.availableBy ?? ''
  }
}

function decimalInput(value) {
  return value === null || value === undefined ? '' : String(value).replace('.', ',')
}

function decimalValue(value, places) {
  const normalized = String(value ?? '').trim().replace(',', '.')
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`, 'u').test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function serviceCatalogueBandAmountError(value, ops) {
  const amount = decimalValue(value, ops.limits.amountDecimalPlaces)
  return amount === null || amount < 0 || amount > ops.limits.maximumAmount
    ? 'Укажите неотрицательную сумму с двумя дробными знаками.' : null
}

export function serviceCatalogueBandEndError(bands, index, value, ops) {
  if (index < 0 || index >= bands.length - 1) return 'Конец последнего интервала должен быть пустым.'
  const invalidAmount = serviceCatalogueBandAmountError(value, ops)
  if (invalidAmount) return invalidAmount
  const boundary = decimalValue(value, ops.limits.amountDecimalPlaces)
  const start = index === 0 ? null : decimalValue(bands[index].from, ops.limits.amountDecimalPlaces)
  if (start !== null && boundary <= start) return 'Конец интервала должен быть больше его начала.'
  const nextEnd = bands[index + 1].by
  if (nextEnd !== '' && boundary >= decimalValue(nextEnd, ops.limits.amountDecimalPlaces)) {
    return 'Конец интервала должен быть меньше конца следующего интервала.'
  }
  return null
}

export function serviceCatalogueValidation(form, ops, creating = false, existing = null) {
  const errors = {}
  const method = ops.priceMethods.find(item => item.value === form.priceMethod)
  if (!ops.services.some(item => item.value === form.service)) errors.service = ['Выберите услугу.']
  if (creating && ops.services.some(item => item.value === form.service && item.routeAlias === 'product')) errors.service = ['Для стоимости товара уже существует базовая запись.']
  if (!creating && existing && ops.services.some(item => item.routeAlias === 'product' && (item.value === existing.service || item.value === form.service))) errors.service = ['Базовую запись стоимости товара нельзя изменить.']
  if (!method || !ops.services.find(item => item.value === form.service)?.allowedPriceMethods.includes(form.priceMethod)) errors.priceMethod = ['Выберите допустимый способ расчёта.']
  if (!ops.services.find(item => item.value === form.service)?.allowedCurrencies.includes(form.currency)) errors.currency = ['Выберите допустимую валюту услуги.']
  if (method?.routeAlias === 'stepped') {
    if (!validBands(bandPayload(form, ops), ops)) errors.bands = ['Заполните стоимость всех интервалов и укажите корректные возрастающие границы (не более двух дробных знаков).']
  }
  if (form.availableFrom && !validDate(form.availableFrom)) errors.availableFrom = ['Укажите корректную дату начала действия.']
  if (form.availableBy && !validDate(form.availableBy)) errors.availableBy = ['Укажите корректную дату окончания.']
  if (form.availableFrom && validDate(form.availableFrom) && form.availableBy && validDate(form.availableBy) && form.availableBy < form.availableFrom) errors.availableBy = ['Дата окончания не может быть раньше даты начала.']
  if (method?.routeAlias === 'percent') {
    if (form.currency !== MERCHANDISE_CURRENCY) errors.currency = ['Процент от стоимости товара задаётся в долларах США.']
    const percentage = decimalValue(form.percentage, ops.limits.percentageDecimalPlaces)
    if (percentage === null || percentage <= 0 || percentage > ops.limits.maximumPercentage) errors.percentage = ['Укажите процент больше 0 и не больше 100.']
    for (const field of ['minimumAmount', 'maximumAmount']) {
      if (form[field] !== '') {
        const amount = decimalValue(form[field], ops.limits.amountDecimalPlaces)
        if (amount === null || amount < 0 || amount > ops.limits.maximumAmount) errors[field] = ['Укажите неотрицательную сумму с двумя дробными знаками.']
      }
    }
    const minimum = decimalValue(form.minimumAmount, ops.limits.amountDecimalPlaces)
    const maximum = decimalValue(form.maximumAmount, ops.limits.amountDecimalPlaces)
    if (!errors.maximumAmount && form.minimumAmount !== '' && form.maximumAmount !== '' && maximum < minimum) errors.maximumAmount = ['Максимальная сумма не может быть меньше минимальной.']
  } else if (method?.routeAlias === 'fixed') {
    const amount = decimalValue(form.amount, ops.limits.amountDecimalPlaces)
    if (amount === null || amount < 0 || amount > ops.limits.maximumAmount) errors.amount = ['Укажите неотрицательную сумму с двумя дробными знаками.']
    if (!ops.currencies.some(item => item.value === form.currency)) errors.currency = ['Выберите валюту.']
  } else if (method?.routeAlias === 'manual' && !ops.currencies.some(item => item.value === form.currency)) errors.currency = ['Выберите валюту.']
  return Object.keys(errors).length ? createInternalProblem('invalidInput', { errors }) : null
}

export function serviceCataloguePayload(form, ops, version) {
  const method = ops.priceMethods.find(item => item.value === form.priceMethod)
  const base = {
    service:form.service,
    priceMethod:form.priceMethod,
    percentage:null,
    minimumAmount:null,
    maximumAmount:null,
    amount:null,
    currency:form.currency,
    intervalCurrency:null,
    bands:[],
    availableFrom:form.availableFrom || null,
    availableBy:form.availableBy || null,
    ...(version ? { version } : {})
  }
  if (method.routeAlias === 'percent') {
    base.currency = MERCHANDISE_CURRENCY
    base.percentage = decimalValue(form.percentage, ops.limits.percentageDecimalPlaces)
    base.minimumAmount = form.minimumAmount === '' ? null : decimalValue(form.minimumAmount, ops.limits.amountDecimalPlaces)
    base.maximumAmount = form.maximumAmount === '' ? null : decimalValue(form.maximumAmount, ops.limits.amountDecimalPlaces)
  } else if (method.routeAlias === 'fixed') {
    base.amount = decimalValue(form.amount, ops.limits.amountDecimalPlaces)
    base.currency = form.currency
  } else if (method.routeAlias === 'stepped') {
    base.intervalCurrency = MERCHANDISE_CURRENCY
    base.bands = bandPayload(form, ops)
  }
  return base
}

function bandPayload(form, ops) {
  return (form.bands ?? []).map(band => ({
    from:band.from === '' ? null : decimalValue(band.from, ops.limits.amountDecimalPlaces) ?? NaN,
    by:band.by === '' ? null : decimalValue(band.by, ops.limits.amountDecimalPlaces) ?? NaN,
    amount:decimalValue(band.amount, ops.limits.amountDecimalPlaces)
  }))
}

export function serviceCatalogueOverlapErrors(form, entries, currentId) {
  if (form.availableFrom && !validDate(form.availableFrom) || form.availableBy && !validDate(form.availableBy)) return {}
  const start = form.availableFrom || null
  const end = form.availableBy || null
  const overlap = entries.some(item => item.id !== currentId && item.service === form.service
    && (end === null || item.availableFrom === null || item.availableFrom <= end)
    && (item.availableBy === null || start === null || item.availableBy >= start))
  return overlap ? {
    availableFrom:['Период пересекается с другим тарифом этой услуги.'],
    availableBy:['Период пересекается с другим тарифом этой услуги.']
  } : {}
}

const money = new Intl.NumberFormat('ru-RU', { minimumFractionDigits:2, maximumFractionDigits:2 })
const percent = new Intl.NumberFormat('ru-RU', { minimumFractionDigits:0, maximumFractionDigits:4 })

export function formatServiceCatalogueParameters(entry, ops) {
  const method = ops.priceMethods.find(item => item.value === entry.priceMethod)
  const currency = ops.currencies.find(item => item.value === entry.currency)
  const unit = currency.symbol
  if (method.routeAlias === 'percent') {
    const parts = [`${percent.format(entry.percentage)}%`]
    if (entry.minimumAmount !== null) parts.push(`мин. ${money.format(entry.minimumAmount)}${unit}`)
    if (entry.maximumAmount !== null) parts.push(`макс. ${money.format(entry.maximumAmount)}${unit}`)
    return parts.join(', ')
  }
  if (method.routeAlias === 'stepped') {
    const intervalUnit = ops.currencies.find(item => item.value === MERCHANDISE_CURRENCY).symbol
    const formatted = entry.bands
      .map(band => {
        const lower = band.from === null ? '' : `${money.format(band.from)}${intervalUnit}`
        const upper = band.by === null ? '' : `${lower ? ' до ' : 'до '}${money.format(band.by)}${intervalUnit}`
        return `${lower ? `свыше ${lower}` : upper ? '' : 'любое значение'}${upper}: ${money.format(band.amount)}${unit}`
      })
      .join('; ')
    return formatted.replace(/\p{L}/u, letter => letter.toLocaleUpperCase('ru-RU'))
  }
  return method.routeAlias === 'fixed' ? `${money.format(entry.amount)}${unit}` : unit
}

export function formatServiceCatalogueAvailability(entry) {
  const display = value => {
    const [year, month, day] = value.split('-')
    return `${day}.${month}.${year}`
  }
  if (entry.availableFrom === null) return entry.availableBy === null ? 'в любое время' : `по ${display(entry.availableBy)}`
  return entry.availableBy ? `${display(entry.availableFrom)} — ${display(entry.availableBy)}` : `с ${display(entry.availableFrom)}`
}

function validateSnapshot(value, ops, entryId) {
  return value === null ? null : validateServiceCatalogueEntry(value, ops, entryId)
}

export function validateServiceCatalogueAuditItem(value, ops) {
  if (!value || !positiveInteger(value.id) || !positiveInteger(value.entryId) || !positiveInteger(value.actorId)
    || !ops.services.some(item => item.value === value.service)
    || !ops.auditActions.some(item => item.value === value.action)
    || typeof value.actorName !== 'string' || !value.actorName.trim() || !validTimestamp(value.at)) protocol()
  const before = validateSnapshot(value.before, ops, value.entryId)
  const after = validateSnapshot(value.after, ops, value.entryId)
  if (before?.service !== undefined && before.service !== value.service
    || after?.service !== undefined && after.service !== value.service) protocol()
  const alias = ops.auditActions.find(item => item.value === value.action).routeAlias
  if (alias === 'created' && (before !== null || after === null)
    || alias === 'updated' && (before === null || after === null)
    || alias === 'deleted' && (before === null || after !== null)) protocol()
  return value
}
