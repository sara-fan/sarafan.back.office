// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export const RATE_UNAVAILABLE_MESSAGE = 'не удалось получить курс'
const numberFormat = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' })

function currencyByAlias(currencies, alias) {
  if (!Array.isArray(currencies)) return null
  const candidates = currencies.filter(currency => currency?.routeAlias === alias
    && Number.isInteger(currency.value) && currency.value > 0
    && typeof currency.name === 'string' && currency.name.trim())
  return candidates.length === 1 ? candidates[0] : null
}

export function exchangeRateDisplay(rates, currencies, alias = 'usd') {
  if (!Array.isArray(rates)) return null
  const usd = currencyByAlias(currencies, alias)
  const rub = currencyByAlias(currencies, 'rub')
  if (!usd || !rub || usd.value === rub.value) return null
  const candidates = rates.filter(rate => rate?.provider === 'CBR'
    && rate.baseCurrency === usd.value
    && rate.quoteCurrency === rub.value)
  if (candidates.length !== 1) return null
  const rate = candidates[0]
  if (!Number.isInteger(rate.nominal) || rate.nominal < 1 || rate.nominal > 1_000_000
    || typeof rate.officialRate !== 'number' || !Number.isFinite(rate.officialRate)
    || rate.officialRate <= 0 || rate.officialRate >= 1_000_000_000_000
    || typeof rate.sourceEffectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(rate.sourceEffectiveDate)) return null
  const date = new Date(`${rate.sourceEffectiveDate}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== rate.sourceEffectiveDate) return null
  return {
    date: dateFormat.format(date),
    isoDate: rate.sourceEffectiveDate,
    // Vcurs is the official RUB amount for Vnom units; do not silently label it as one USD.
    label: rate.nominal === 1 ? usd.routeAlias.toUpperCase() : `${rate.nominal.toLocaleString('ru-RU')} ${usd.routeAlias.toUpperCase()}`,
    value: numberFormat.format(rate.officialRate)
  }
}
