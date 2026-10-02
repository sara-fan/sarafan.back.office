// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OrderStatusBadge from '../src/components/OrderStatusBadge.vue'

describe('OrderStatusBadge', () => {
  it.each([
    ['under_review', 'under_review', '#854D0E', '#FEF9C3'],
    ['quote_ready', 'quote_ready', '#1D4ED8', '#DBEAFE'],
    ['quote_expired', 'quote_expired', '#9A3412', '#FED7AA'],
    ...['paid', 'purchasing_item', 'delivering_to_us_warehouse', 'delivered_to_us_warehouse',
      'delivering_to_russia', 'delivered_to_russian_warehouse', 'delivering_in_russia']
      .map(alias => [alias, 'in_progress', '#4338CA', '#E0E7FF']),
    ['received', 'completed', '#166534', '#DCFCE7'],
    ['cancelled', 'cancelled', '#475569', '#F1F5F9'],
    ['future_status', 'future_group', '#475569', '#F1F5F9']
  ])('colors %s while retaining the server label', (routeAlias, upperStatusRouteAlias, color, background) => {
    const wrapper = mount(OrderStatusBadge, { props:{ status:42,
      ops:{ statuses:[{ value:42, name:'Название из Core', routeAlias, upperStatusRouteAlias }] } } })
    expect(wrapper.text()).toBe('Название из Core')
    expect(wrapper.element.style.getPropertyValue('--order-status-text')).toBe(color)
    expect(wrapper.element.style.getPropertyValue('--order-status-background')).toBe(background)
    wrapper.unmount()
  })

  it('updates the compact label and color when the status changes', async () => {
    const wrapper = mount(OrderStatusBadge, { props:{ status:0, compact:true,
      ops:{ statuses:[{ value:0, name:'На проверке', routeAlias:'under_review' },
        { value:500, name:'Отменён', routeAlias:'cancelled' }] } },
    global:{ stubs:{ ListText:{ props:['text'], template:'<span class="list-text">{{ text }}</span>' } } } })
    expect(wrapper.get('.list-text').text()).toBe('На проверке')
    await wrapper.setProps({ status:500 })
    expect(wrapper.get('.list-text').text()).toBe('Отменён')
    expect(wrapper.element.style.getPropertyValue('--order-status-text')).toBe('#475569')
    wrapper.unmount()
  })

  it('uses a neutral fallback when metadata is unavailable and preserves supplementary content', () => {
    const wrapper = mount(OrderStatusBadge, { props:{ status:999 }, slots:{ default:'действует до 30.09.2026' } })
    expect(wrapper.get('.order-status-pill').text()).toBe('Статус 999')
    expect(wrapper.text()).toContain('действует до 30.09.2026')
    expect(wrapper.element.style.getPropertyValue('--order-status-text')).toBe('#475569')
    wrapper.unmount()
  })
})
