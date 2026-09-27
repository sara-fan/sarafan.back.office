// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { matchesListSearch, normalizeListSearch, useListSearchDebounce } from '../src/listSearch.js'
import { moscowDate, moscowTime } from '../src/consentFormatting.js'
import { formatMoneyAmount } from '../src/moneyFormatting.js'
import { formatServiceCatalogueParameters } from '../src/serviceCatalogue.js'
import { serviceCatalogueOps } from './fixtures/serviceCatalogue.js'

afterEach(() => vi.useRealTimers())

it.each([
  ['  ЁЛКИН  ', ['Ёлкин Иван'], true],
  ['1 234,50$', [formatMoneyAmount(1234.5) + '$'], true],
  ['1\u202f234,50', ['1\u00a0234,50$'], true],
  ['27.09.2026, 00:15 МСК', [moscowTime('2026-09-26T21:15:00Z')], true],
  ['27.09.2026', [moscowDate('2026-09-26T21:15:00Z')], true],
  ['2026-09-26', [moscowTime('2026-09-26T21:15:00Z')], false],
  ['1234.5', [formatMoneyAmount(1234.5)], false],
  ['0', [0], true],
  ['100%_\\', ['Товар 100%_\\образец'], true],
  ['100X', ['Товар 100%_\\образец'], false],
  ['имя email', ['имя', 'email'], false],
  ['—', ['—'], true],
  ['', [], true],
  [null, [], true],
  ['null', [null, undefined], false]
])('matches displayed fields for %s', (query, fields, expected) => {
  expect(matchesListSearch(query, fields)).toBe(expected)
})

it('normalizes null and undefined safely', () => {
  expect(normalizeListSearch(null)).toBe('')
  expect(normalizeListSearch(undefined)).toBe('')
})

it.each([
  [0, '12,3456%, мин. 0,00$, макс. 2 345,60$'],
  [100, '1 234,50$'],
  [200, '$'],
  [300, '$'],
  [400, 'До 100,00$: 0,00$; свыше 100,00$: 1 234,50$']
])('keeps tariff presentation aligned with Core display-search fixtures for method %s', (priceMethod, expected) => {
  const entry = { priceMethod, currency:840, percentage:12.3456, minimumAmount:0, maximumAmount:2345.6, amount:1234.5,
    bands:[{ from:null, by:100, amount:0 }, { from:100, by:null, amount:1234.5 }] }
  expect(normalizeListSearch(formatServiceCatalogueParameters(entry, serviceCatalogueOps))).toBe(normalizeListSearch(expected))
})

it('invalidates immediately, reloads once after 300 ms and cancels on unmount', () => {
  vi.useFakeTimers()
  const invalidate = vi.fn(), reload = vi.fn()
  let debounce
  const wrapper = mount({ setup() { debounce = useListSearchDebounce(invalidate, reload); return {} }, template:'<div />' })
  debounce.cancel()
  debounce.schedule()
  expect(invalidate).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(299)
  expect(reload).not.toHaveBeenCalled()
  debounce.schedule()
  expect(invalidate).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(300)
  expect(reload).toHaveBeenCalledTimes(1)
  debounce.schedule()
  wrapper.unmount()
  vi.advanceTimersByTime(300)
  expect(reload).toHaveBeenCalledTimes(1)
})
