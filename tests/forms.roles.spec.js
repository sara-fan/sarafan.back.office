// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { describe, expect, it } from 'vitest'
import { accountPayload } from '../src/forms.js'
import { can, fullName, landing, roleLabel, ROLES, safeReturn } from '../src/roles.js'
const valid = () => ({ firstName:' Иван ', lastName:'Иванов', patronymic:'', email:' a@b.test ', roles:['operator'], isActive:true, password:'', confirmation:'' })
describe('staff forms and permissions',()=>{
  it('explicitly grants the four known roles and rejects unknown roles/actions',()=>{
    for(const code of Object.keys(ROLES)) {
      const u={roles:[code]}; expect(can(u,'access')).toBe(true); expect(can(u,'manageUsers')).toBe(code==='administrator'); expect(roleLabel(code)).toBe(ROLES[code]); expect(landing(u)).toBe(code==='administrator'?'/users':'/home')
    }
    expect(can(null,'access')).toBe(false); expect(can({roles:'administrator'},'access')).toBe(false); expect(can({roles:['unknown']},'access')).toBe(false); expect(can({roles:['administrator']},'unknown')).toBe(false)
    expect(can({roles:['operator','administrator']},'manageUsers')).toBe(true); expect(roleLabel('unknown')).toBe('Неизвестная роль'); expect(fullName(null)).toBe(''); expect(fullName({firstName:'Иван',lastName:'Иванов',patronymic:'Иванович'})).toBe('Иванов Иван Иванович')
  })
  it('accepts only authorized internal return paths',()=>{
    const admin={roles:['administrator']}, operator={roles:['operator']}
    for(const path of ['/users','/users/new','/users/123']) { expect(safeReturn(path,admin)).toBe(path); expect(safeReturn(path,operator)).toBe('/home') }
    for(const path of ['/home','/profile']) expect(safeReturn(path,operator)).toBe(path)
    for(const path of [null,[], '//evil.test','https://evil.test','/users/0','/users?token=secret','/login']) expect(safeReturn(path,admin)).toBe('/users')
  })
  it('sends only allowed account fields and omits empty password and confirmation',()=>{
    expect(accountPayload(valid())).toEqual({firstName:'Иван',lastName:'Иванов',patronymic:null,email:'a@b.test',roles:['operator'],isActive:true})
    expect(accountPayload({...valid(),patronymic:' Имя '},{profile:true})).toEqual({firstName:'Иван',lastName:'Иванов',patronymic:'Имя'})
    const payload=accountPayload({...valid(),password:'test-password',confirmation:'test-password'},{creating:true}); expect(payload.password).toBe('test-password'); expect(payload).not.toHaveProperty('isActive'); expect(payload).not.toHaveProperty('confirmation')
  })
  it.each([{firstName:''},{lastName:'a'.repeat(101)},{patronymic:'a'.repeat(101)},{email:'bad'},{email:'a'.repeat(254)+'@b.test'},{roles:[]},{roles:['unknown']},{password:'short',confirmation:'different'},{password:'я'.repeat(37),confirmation:'я'.repeat(37)},{password:' '.repeat(12),confirmation:' '.repeat(12)}])('returns structured field errors for invalid inputs %j',patch=>{
    expect(()=>accountPayload({...valid(),...patch})).toThrow(); try {accountPayload({...valid(),...patch})}catch(e){expect(e.errors).toBeDefined();expect(e.code).toBe('ui_invalid_input')}
  })
  it('requires a password for new users',()=>{expect(()=>accountPayload(valid(),{creating:true})).toThrow()})
})
