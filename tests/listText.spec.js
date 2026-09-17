// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import ListText from '../src/components/ListText.vue'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
let wrapper
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.unstubAllGlobals() })
it('enables the complete-value tooltip and keyboard focus only for overflowing text, remeasuring on changes', async () => {
  vi.stubGlobal('requestAnimationFrame', callback => { callback(); return 1 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const callbacks = []
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class { constructor(callback) { this.callback = callback } observe(node) { if (node.classList?.contains('list-text')) callbacks.push(this.callback) } disconnect = disconnect })
  wrapper = mount(ListText, { props:{ text:'Полное длинное название' }, global:{ plugins:[createSarafanVuetify()] } })
  const span = wrapper.get('.list-text')
  let width = 300
  Object.defineProperties(span.element, { scrollWidth:{ get:() => width }, clientWidth:{ get:() => 100 } })
  callbacks.forEach(callback => callback()); await flushPromises()
  expect(span.attributes('tabindex')).toBe('0')
  expect(wrapper.findComponent({ name:'VTooltip' }).props('text')).toBe('Полное длинное название')
  expect(wrapper.findComponent({ name:'VTooltip' }).props('disabled')).toBe(false)
  width = 50; await wrapper.setProps({ text:'Короткое' }); await flushPromises()
  expect(span.attributes('tabindex')).toBeUndefined()
  expect(wrapper.findComponent({ name:'VTooltip' }).props('disabled')).toBe(true)
  width = 300; globalThis.dispatchEvent(new globalThis.Event('resize')); await flushPromises()
  expect(span.attributes('tabindex')).toBe('0')
  wrapper.unmount(); wrapper = null
  expect(disconnect).toHaveBeenCalled()
})
it('supports environments without ResizeObserver and numeric values', async () => {
  vi.stubGlobal('ResizeObserver', undefined)
  wrapper = mount(ListText, { props:{ text:0 }, global:{ plugins:[createSarafanVuetify()] } })
  expect(wrapper.text()).toBe('0')
  await wrapper.setProps({ text:1 }); await flushPromises()
  expect(wrapper.text()).toBe('1')
})

it('coalesces resize measurements and cancels the pending frame on teardown', () => {
  let resize
  let nextId = 0
  const queued = new Map()
  vi.stubGlobal('requestAnimationFrame', callback => { queued.set(++nextId, callback); return nextId })
  vi.stubGlobal('cancelAnimationFrame', id => queued.delete(id))
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { this.callback = callback }
    observe(node) { if (node?.classList?.contains('list-text')) resize = this.callback }
    disconnect() {}
  })
  wrapper = mount(ListText, { props:{ text:'Название' }, global:{ plugins:[createSarafanVuetify()] } })
  queued.clear()
  resize(); resize(); resize()
  expect(queued.size).toBe(1)
  wrapper.unmount(); wrapper = null
  expect(queued.size).toBe(0)
})
