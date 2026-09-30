// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { formatMoneyAmount } from './moneyFormatting.js'
import { moscowTime } from './consentFormatting.js'

const tariffFields = ['id', 'priceMethod', 'currency', 'amount', 'percentage', 'minimumAmount', 'maximumAmount', 'intervalCurrency', 'bands']
const tariff = value => value === null ? null : tariffFields.map(key => value[key])
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const unique = values => [...new Set(values)].join('; ')

export function priceHistoryRows(detail, ops) {
  const before = detail.pricingBefore, after = detail.pricingAfter
  if (!before && !after) return []
  const initial = !before && detail.event.kind === 0
  const missing = initial ? '—' : 'Нет данных'
  const rub = ops.catalogue.currencies.find(item => item.routeAlias === 'rub')
  const money = (amount, currency) => formatMoneyAmount(amount) + ops.catalogue.currencies.find(item => item.value === currency).symbol
  const value = component => {
    if (!component) return missing
    if (component.state !== 0) return ops.componentStates.find(item => item.value === component.state).name
    if (component.amountRub === 0 && ops.catalogue.services.find(item => item.value === component.service).routeAlias === 'customs-payments') return 'Не ожидаются'
    return money(component.amount, component.currency) + (component.currency === rub.value ? '' : ' (' + (component.amountRub === null ? 'Нет данных' : money(component.amountRub, rub.value)) + ')')
  }
  const automatic = []
  if (before && after) {
    if (!same(before.exchangeRate && [before.exchangeRate.nominal, before.exchangeRate.officialRate], after.exchangeRate && [after.exchangeRate.nominal, after.exchangeRate.officialRate])) automatic.push('изменение курса')
    if (detail.productBefore && detail.productAfter) {
      if (detail.productBefore.quantity !== detail.productAfter.quantity) automatic.push('изменение количества')
      if (!same(detail.productBefore.sellerPrice, detail.productAfter.sellerPrice)) automatic.push('изменение цены товара')
    }
  }
  const autoReason = 'Автоматический пересчёт' + (automatic.length ? ': ' + automatic.join(', ') : '')
  const rows = []
  for (const service of ops.catalogue.services) {
    const previous = before?.components.find(item => item.service === service.value)
    const next = after?.components.find(item => item.service === service.value)
    if (!previous && !next) continue
    const output = component => component ? [component.state, component.currency, component.amount, component.amountRub] : null
    const outputChanged = !same(output(previous), output(next))
    const tariffChanged = !same(tariff(previous?.tariff ?? null), tariff(next?.tariff ?? null))
    const manualChanged = before?.inputs.manualAmounts[service.value] !== after?.inputs.manualAmounts[service.value]
    const selectionChanged = (before?.inputs.selectedServices.includes(service.value) ?? false) !== (after?.inputs.selectedServices.includes(service.value) ?? false)
    if (!outputChanged && !tariffChanged && !manualChanged && !selectionChanged) continue
    const reasons = []
    if (!previous || !next) reasons.push(initial ? 'Первичный расчёт' : '-')
    else {
      if (tariffChanged) reasons.push('Изменение тарифа')
      if (manualChanged) reasons.push('Ручной ввод')
      if (selectionChanged) reasons.push('Изменение выбора услуги')
      if (outputChanged && (automatic.length || !reasons.length)) reasons.push(autoReason)
    }
    rows.push({ key:service.value, name:service.name, before:value(previous), after:value(next), reason:unique(reasons), extra:!service.includedInTotal })
  }
  const included = rows.filter(row => !row.extra), extras = rows.filter(row => row.extra)
  const total = calculation => !calculation ? missing : calculation.totalRub === null ? 'Не рассчитана' : money(calculation.totalRub, rub.value)
  const totalReason = !before || !after ? initial ? 'Первичный расчёт' : '-'
    : before.totalRub === after.totalRub ? 'Стоимость без изменений' : unique(included.map(row => row.reason)) || '-'
  const result = [...included, { key:'total', name:'Итого', before:total(before), after:total(after), reason:totalReason, total:true }, ...extras]
  if (detail.validUntilBefore !== null || detail.validUntilAfter !== null) {
    const validity = time => time === null ? 'Не подтверждена' : moscowTime(time)
    result.push({ key:'validity', name:'Подтверждение действует до', before:validity(detail.validUntilBefore), after:validity(detail.validUntilAfter), reason:detail.validUntilBefore === detail.validUntilAfter ? 'Без изменений' : detail.validUntilAfter === null ? 'Снятие подтверждения' : 'Подтверждение расчёта' })
  }
  return result
}
