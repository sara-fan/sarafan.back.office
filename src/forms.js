// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { createInternalProblem } from './errors/problem.js'
import { ROLES } from './roles.js'

export function accountPayload(form, { profile = false, creating = false } = {}) {
  const errors = {}
  for (const field of ['firstName','lastName']) {
    if (!form[field].trim() || form[field].trim().length > 100) errors[field] = ['Введите от 1 до 100 символов']
  }
  if (form.patronymic.trim().length > 100) errors.patronymic = ['Не более 100 символов']
  if (!profile && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(form.email.trim()) || form.email.trim().length > 254)) errors.email = ['Укажите корректный адрес электронной почты']
  if (creating || form.password) {
    if (form.password.length < 12 || new globalThis.TextEncoder().encode(form.password).length > 72 || !form.password.trim()) errors.password = ['Не менее 12 символов и не более 72 байт UTF-8']
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
