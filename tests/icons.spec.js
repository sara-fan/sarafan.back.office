// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { VIcon } from 'vuetify/components'
import { createSarafanVuetify, sarafanAliases } from '../src/plugins/vuetify.js'

const applicationAliases = {
  add:'fa-plus',
  addUser:'fa-user-plus',
  audit:'fa-clock-rotate-left',
  block:'fa-user-slash',
  close:'fa-xmark',
  delete:'fa-trash-can',
  download:'fa-download',
  edit:'fa-pen-to-square',
  eye:'fa-eye',
  eyeOff:'fa-eye-slash',
  legalDocuments:'fa-file-contract',
  login:'fa-right-to-bracket',
  logout:'fa-right-from-bracket',
  privacyRequests:'fa-clipboard-list',
  print:'fa-print',
  profile:'fa-user',
  refresh:'fa-rotate-right',
  save:'fa-floppy-disk',
  saveChanges:'fa-check-double',
  search:'fa-magnifying-glass',
  staff:'fa-users'
}

describe('Font Awesome icon configuration', () => {
  it('keeps official Vuetify aliases and maps every application alias to Font Awesome Free classes', () => {
    expect(sarafanAliases.calendar).toBe('fas fa-calendar')
    expect(sarafanAliases.checkboxOff).toBe('far fa-square')
    expect(sarafanAliases.dropdown).toBe('fas fa-caret-down')
    for (const [alias, iconClass] of Object.entries(applicationAliases)) {
      expect(sarafanAliases[alias].split(' ')).toEqual(['fas', iconClass])
    }
    expect(Object.values(sarafanAliases).every(value => /^(?:fas|far) fa-/u.test(value))).toBe(true)
    expect(Object.values(sarafanAliases).some(value => /(?:svg:|mdi)/iu.test(value))).toBe(false)
  })

  it('renders semantic and official aliases with the Vuetify Font Awesome set', () => {
    const Host = defineComponent({
      components:{ VIcon },
      data:() => ({ icons:['refresh', 'saveChanges', 'calendar', 'checkboxOff'] }),
      template:'<div><VIcon v-for="icon in icons" :key="icon" :data-alias="icon" :icon="`$${icon}`" /></div>'
    })
    const wrapper = mount(Host, { global:{ plugins:[createSarafanVuetify()] } })
    expect(wrapper.get('[data-alias="refresh"]').classes()).toEqual(expect.arrayContaining(['fas', 'fa-rotate-right']))
    expect(wrapper.get('[data-alias="saveChanges"]').classes()).toEqual(expect.arrayContaining(['fas', 'fa-check-double']))
    expect(wrapper.get('[data-alias="calendar"]').classes()).toEqual(expect.arrayContaining(['fas', 'fa-calendar']))
    expect(wrapper.get('[data-alias="checkboxOff"]').classes()).toEqual(expect.arrayContaining(['far', 'fa-square']))
    wrapper.unmount()
  })
})
