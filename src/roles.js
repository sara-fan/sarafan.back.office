// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export const ROLES = Object.freeze({
  administrator: 'Администратор',
  'shift-manager': 'Старший смены',
  'senior-operator': 'Старший оператор',
  operator: 'Оператор'
})
const permissions = Object.freeze({ access: Object.keys(ROLES), manageUsers: ['administrator'], manageLegalDocuments: ['administrator'] })
export function can(user, action) {
  return Array.isArray(user?.roles) && user.roles.some(role => permissions[action]?.includes(role))
}
export function roleLabel(code) { return ROLES[code] || 'Неизвестная роль' }
export function landing(user) { return can(user, 'manageUsers') ? '/users' : '/profile' }
export function profileRoute(user) {
  return can(user, 'manageUsers') && Number.isInteger(user?.id) && user.id > 0
    ? `/users/${user.id}`
    : '/profile'
}
export function fullName(user) {
  return [user?.lastName, user?.firstName, user?.patronymic].filter(Boolean).join(' ')
}
export function safeReturn(value, user) {
  if (typeof value !== 'string') return landing(user)
  if (value === '/home') return landing(user)
  if (value === '/profile') return profileRoute(user)
  if (can(user, 'manageUsers') && /^\/users(?:\/(?:new|[1-9]\d*))?$/u.test(value)) return value
  if (can(user, 'manageLegalDocuments') && ['/legal-documents', '/customer-consents', '/privacy-requests'].includes(value)) return value
  return landing(user)
}
