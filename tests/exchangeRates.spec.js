// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import componentSource from '../src/components/ExchangeRateDisplay.vue?raw'
import { exchangeRateDisplay } from '../src/exchangeRates.js'
import ExchangeRateDisplay from '../src/components/ExchangeRateDisplay.vue'

const rate = { provider:'CBR', baseCurrency:'USD', quoteCurrency:'RUB', nominal:1, officialRate:81.1234, sourceEffectiveDate:'2026-09-05', retrievedAt:'2026-09-06T21:10:00Z' }
describe('official exchange-rate display', () => {
  it('shows source date and four Russian decimals without discarding older rates', () => {
    const wrapper = mount(ExchangeRateDisplay, { props:{ rates:[rate] } })
    expect(wrapper.get('time').text()).toBe('05.09.26')
    expect(wrapper.get('time').attributes('datetime')).toBe('2026-09-05')
    expect(wrapper.get('strong').text()).toContain('USD 81,1234')
    expect(wrapper.get('strong').classes()).toContain('text-green-darken-3')
    expect(wrapper.get('[role="status"]').attributes('aria-live')).toBe('polite')
    expect(wrapper.text()).toContain('RUB, официальный курс ЦБ РФ')
    expect(exchangeRateDisplay([{ ...rate, sourceEffectiveDate:'2020-01-01', officialRate:81 }]).value).toBe('81,0000')
    expect(exchangeRateDisplay([{ ...rate, nominal:100, officialRate:8112.34 }])).toMatchObject({ label:'100 USD', value:'8 112,3400' })
    expect(exchangeRateDisplay([{ ...rate, baseCurrency:'usd', quoteCurrency:'rub' }])).not.toBeNull()
    expect(exchangeRateDisplay([rate, { ...rate,quoteCurrency:'EUR' }, { ...rate,provider:'other' }])).toEqual(exchangeRateDisplay([rate]))
    expect(wrapper.attributes('tabindex')).toBe('0')
    wrapper.unmount()
  })
  it.each([undefined, null, {}, [], [null], [{ ...rate, baseCurrency:1 }], [{ ...rate, baseCurrency:'EUR' }], [rate, rate],
    ...Object.entries({ provider:'other', quoteCurrency:'EUR', nominal:0, officialRate:0, sourceEffectiveDate:'2026-02-30' }).map(([key,value]) => [{ ...rate,[key]:value }]),
    ...[null, 3].map(quoteCurrency => [{ ...rate,quoteCurrency }]),
    ...[-1, 1.5, 1_000_001, null].map(nominal => [{ ...rate,nominal }]),
    ...[-1, Number.NaN, Infinity, '81.2', 1e12].map(officialRate => [{ ...rate,officialRate }]),
    ...[undefined, '2026-9-5', '2026-13-01', '2026-00-01'].map(sourceEffectiveDate => [{ ...rate,sourceEffectiveDate }])
  ])('rejects missing or malformed data (%j)', rates => {
    expect(exchangeRateDisplay(rates)).toBeNull()
  })
  it('renders an accessible unavailable placeholder and updates reactively', async () => {
    const wrapper = mount(ExchangeRateDisplay)
    expect(wrapper.get('strong').text()).toBe('USD —')
    expect(wrapper.text()).toContain('не удалось получить курс')
    expect(wrapper.attributes('title')).toBe('не удалось получить курс')
    expect(wrapper.find('time').exists()).toBe(false)
    await wrapper.setProps({ rates:[rate] })
    expect(wrapper.find('time').exists()).toBe(true)
    wrapper.unmount()
  })
  it('preserves compact blue/green styling and bounded width in the existing app bar', () => {
    const component = componentSource
    expect(component).toContain('color: #1976d2')
    expect(component).toContain('font-size: 0.875rem')
    expect(component).toContain('gap: 0.75rem')
    expect(component).toContain('max-width: calc(100% - 80px)')
    expect(component).toContain('font-weight: 700')
  })
})
