// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export const RATE_UNAVAILABLE_MESSAGE = 'не удалось получить курс'
const numberFormat = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' })

export function exchangeRateDisplay(rates) {
  if (!Array.isArray(rates)) return null
  const candidates = rates.filter(rate => typeof rate?.baseCurrency === 'string' && rate.baseCurrency.toUpperCase() === 'USD')
  if (candidates.length !== 1) return null
  const rate = candidates[0]
  if (rate.provider !== 'CBR' || typeof rate.quoteCurrency !== 'string' || rate.quoteCurrency.toUpperCase() !== 'RUB'
    || !Number.isInteger(rate.nominal) || rate.nominal < 1 || rate.nominal > 1_000_000
    || typeof rate.officialRate !== 'number' || !Number.isFinite(rate.officialRate)
    || rate.officialRate <= 0 || rate.officialRate >= 1_000_000_000_000
    || typeof rate.sourceEffectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(rate.sourceEffectiveDate)) return null
  const date = new Date(`${rate.sourceEffectiveDate}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== rate.sourceEffectiveDate) return null
  return {
    date: dateFormat.format(date),
    isoDate: rate.sourceEffectiveDate,
    // Vcurs is the official RUB amount for Vnom units; do not silently label it as one USD.
    label: rate.nominal === 1 ? 'USD' : `${rate.nominal.toLocaleString('ru-RU')} USD`,
    value: numberFormat.format(rate.officialRate)
  }
}
