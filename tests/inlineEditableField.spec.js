// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import InlineEditableField from '../src/components/InlineEditableField.vue'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'

let wrapper
let host

function render(props = {}) {
  host = document.createElement('div')
  document.body.append(host)
  wrapper = mount(InlineEditableField, {
    attachTo:host,
    props:{ id:'fee', label:'Стоимость услуги', editTooltip:'Изменить стоимость услуги', editable:true, modelValue:'5', ...props },
    global:{ plugins:[createSarafanVuetify()] }
  })
}

afterEach(() => { wrapper?.unmount(); host?.remove(); wrapper = null; host = null })

describe('inline editable field', () => {
  it('keeps a draft until applied, focuses the editor and returns focus to the pen', async () => {
    render()
    expect(wrapper.find('.fa-pen').exists()).toBe(true)
    await wrapper.get('button[aria-label="Изменить стоимость услуги"]').trigger('click')
    expect(document.activeElement).toBe(wrapper.get('input#fee').element)
    await wrapper.get('input#fee').setValue(' 6,50 ')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.get('button[aria-label="Применить"]').trigger('click')
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['6,50'])
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('button#fee').element)

    await wrapper.setProps({ modelValue:'6,50' })
    await wrapper.get('button#fee').trigger('click')
    await wrapper.get('input#fee').setValue('8')
    await wrapper.get('input#fee').trigger('keydown', { key:'Escape' })
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    expect(wrapper.text()).toContain('6,50')
  })

  it('keeps a read-only value and blocks editing when disabled', async () => {
    render({ editable:false, modelValue:'' })
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).toContain('—')
    await wrapper.setProps({ editable:true, disabled:true })
    expect(wrapper.get('button#fee').element.disabled).toBe(true)
    wrapper.vm.startEdit()
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('keeps invalid drafts open and reports acceptance or cancellation', async () => {
    render({ validationField:'bands', validate:value => value === '10' ? null : 'Введите 10.' })
    expect(wrapper.get('button#fee').attributes('name')).toBe('bands')
    await wrapper.get('button#fee').trigger('click')
    await wrapper.get('input#fee').setValue('9')
    await wrapper.get('input#fee').trigger('keydown', { key:'Enter' })
    expect(wrapper.get('#fee-edit-error').text()).toBe('Введите 10.')
    expect(wrapper.get('input#fee').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('input#fee').attributes('aria-describedby')).toContain('fee-edit-error')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.get('input#fee').setValue('10')
    expect(wrapper.find('#fee-edit-error').exists()).toBe(false)
    await wrapper.get('input#fee').trigger('keydown', { key:'Enter' })
    expect(wrapper.emitted('accepted')).toEqual([['10']])
    await wrapper.setProps({ modelValue:'10' })
    await wrapper.get('button#fee').trigger('click')
    await wrapper.get('input#fee').trigger('keydown', { key:'Escape' })
    expect(wrapper.emitted('cancelled')).toHaveLength(1)
  })
})
