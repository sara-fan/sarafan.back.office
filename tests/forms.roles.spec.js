// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { describe, expect, it } from 'vitest'
import { accountPayload, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../src/forms.js'
import { can, fullName, landing, profileRoute, roleLabel, ROLES, safeReturn } from '../src/roles.js'
const valid = () => ({ firstName:' Иван ', lastName:'Иванов', patronymic:'', email:' a@b.test ', roles:['operator'], isActive:true, password:'', confirmation:'' })
describe('staff forms and permissions',()=>{
  it('explicitly grants the four known roles and rejects unknown roles/actions',()=>{
    for(const code of Object.keys(ROLES)) {
      const u={roles:[code]}; expect(can(u,'access')).toBe(true); expect(can(u,'manageUsers')).toBe(code==='administrator'); expect(roleLabel(code)).toBe(ROLES[code]); expect(landing(u)).toBe(code==='administrator'?'/users':'/profile')
    }
    expect(can(null,'access')).toBe(false); expect(can({roles:'administrator'},'access')).toBe(false); expect(can({roles:['unknown']},'access')).toBe(false); expect(can({roles:['administrator']},'unknown')).toBe(false)
    expect(roleLabel('shift-manager')).toBe('Старший смены')
    expect(can({roles:['operator','administrator']},'manageUsers')).toBe(true); expect(roleLabel('unknown')).toBe('Неизвестная роль'); expect(fullName(null)).toBe(''); expect(fullName({firstName:'Иван',lastName:'Иванов',patronymic:'Иванович'})).toBe('Иванов Иван Иванович')
  })
  it('accepts only authorized internal return paths',()=>{
    const admin={id:7,roles:['administrator']}, operator={id:8,roles:['operator']}
    for(const path of ['/users','/users/new','/users/123']) { expect(safeReturn(path,admin)).toBe(path); expect(safeReturn(path,operator)).toBe('/profile') }
    expect(profileRoute(admin)).toBe('/users/7');expect(profileRoute(operator)).toBe('/profile');expect(profileRoute({...admin,id:0})).toBe('/profile')
    expect(safeReturn('/home',admin)).toBe('/users');expect(safeReturn('/home',operator)).toBe('/profile');expect(safeReturn('/profile',admin)).toBe('/users/7');expect(safeReturn('/profile',operator)).toBe('/profile')
    for(const path of [null,[], '//evil.test','https://evil.test','/users/0','/users?token=secret','/login']) expect(safeReturn(path,admin)).toBe('/users')
  })
  it('sends only allowed account fields and omits empty password and confirmation',()=>{
    expect(accountPayload(valid())).toEqual({firstName:'Иван',lastName:'Иванов',patronymic:null,email:'a@b.test',roles:['operator'],isActive:true})
    expect(accountPayload({...valid(),patronymic:' Имя '},{profile:true})).toEqual({firstName:'Иван',lastName:'Иванов',patronymic:'Имя'})
    const payload=accountPayload({...valid(),password:'test-password',confirmation:'test-password'},{creating:true}); expect(payload.password).toBe('test-password'); expect(payload).not.toHaveProperty('isActive'); expect(payload).not.toHaveProperty('confirmation')
  })
  it.each([{firstName:''},{lastName:'a'.repeat(101)},{patronymic:'a'.repeat(101)},{email:'bad'},{email:'a'.repeat(254)+'@b.test'},{roles:[]},{roles:['unknown']},{password:'a'.repeat(PASSWORD_MIN_LENGTH-1),confirmation:'different'},{password:'я'.repeat(PASSWORD_MAX_LENGTH+1),confirmation:'я'.repeat(PASSWORD_MAX_LENGTH+1)},{password:' '.repeat(PASSWORD_MIN_LENGTH),confirmation:' '.repeat(PASSWORD_MIN_LENGTH)}])('returns structured field errors for invalid inputs %j',patch=>{
    expect(()=>accountPayload({...valid(),...patch})).toThrow(); try {accountPayload({...valid(),...patch})}catch(e){expect(e.errors).toBeDefined();expect(e.code).toBe('ui_invalid_input')}
  })
  it('requires a password for new users',()=>{expect(()=>accountPayload(valid(),{creating:true})).toThrow()})
  it('uses field-specific required name messages and a separate length message',()=>{
    for(const [field,message] of [['firstName','Имя обязательно'],['lastName','Фамилия обязательна']]) {
      try { accountPayload({...valid(),[field]:' '}) } catch(error) { expect(error.errors[field]).toEqual([message]) }
    }
    try { accountPayload({...valid(),firstName:'а'.repeat(101)}) } catch(error) { expect(error.errors.firstName).toEqual(['Не более 100 символов']) }
  })
  it('accepts passwords at both character boundaries',()=>{
    for(const password of ['a'.repeat(PASSWORD_MIN_LENGTH),'я'.repeat(PASSWORD_MAX_LENGTH),'😀'.repeat(PASSWORD_MAX_LENGTH)]) expect(accountPayload({...valid(),password,confirmation:password},{creating:true}).password).toBe(password)
  })
})
