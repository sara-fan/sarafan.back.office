// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { createInternalProblem } from './errors/problem.js'
import { ROLES } from './roles.js'

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 18

export function accountPayload(form, { profile = false, creating = false } = {}) {
  const errors = {}
  const requiredNames = { firstName:'Имя обязательно', lastName:'Фамилия обязательна' }
  for (const [field, requiredMessage] of Object.entries(requiredNames)) {
    const value = form[field].trim()
    if (!value) errors[field] = [requiredMessage]
    else if (value.length > 100) errors[field] = ['Не более 100 символов']
  }
  if (form.patronymic.trim().length > 100) errors.patronymic = ['Не более 100 символов']
  if (!profile && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(form.email.trim()) || form.email.trim().length > 254)) errors.email = ['Укажите корректный адрес электронной почты']
  if (creating || form.password) {
    const passwordLength = Array.from(form.password).length
    if (passwordLength < PASSWORD_MIN_LENGTH || passwordLength > PASSWORD_MAX_LENGTH || !form.password.trim()) errors.password = ['Пароль должен содержать от 8 до 18 символов']
    if (form.password !== form.confirmation) errors.confirmation = ['Пароли не совпадают']
  }
  if (!profile && (!form.roles.length || form.roles.some(role => !Object.hasOwn(ROLES, role)))) errors.roles = ['Выберите хотя бы одну доступную роль']
  if (Object.keys(errors).length) throw createInternalProblem('invalidInput', { errors })
  return {
    firstName:form.firstName.trim(), lastName:form.lastName.trim(), patronymic:form.patronymic.trim() || null,
    ...(form.password ? { password:form.password } : {}),
    ...(!profile ? { email:form.email.trim(), roles:[...form.roles], ...(!creating ? { isActive:form.isActive } : {}) } : {})
  }
}
