// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export const ROLES = Object.freeze({
  administrator: 'Администратор',
  'shift-manager': 'Старший смены',
  'senior-operator': 'Старший оператор',
  operator: 'Оператор'
})
const permissions = Object.freeze({
  access: Object.keys(ROLES),
  manualQuotes: Object.keys(ROLES),
  viewStores: Object.keys(ROLES),
  viewServiceCatalogue: Object.keys(ROLES),
  manageServiceCatalogue: ['administrator'],
  manageOrderPricing: ['administrator', 'shift-manager'],
  createStore: ['administrator'],
  editStore: ['administrator', 'shift-manager'],
  deleteStore: ['administrator'],
  manageUsers: ['administrator'],
  manageLegalDocuments: ['administrator'],
  manageConsentWithdrawalRequests: ['administrator', 'shift-manager', 'senior-operator']
})
export function can(user, action) {
  return Array.isArray(user?.roles) && user.roles.some(role => permissions[action]?.includes(role))
}
export function roleLabel(code) { return ROLES[code] || 'Неизвестная роль' }
export function landing(user) {
  if (can(user, 'manageUsers')) return '/users'
  if (can(user, 'manualQuotes')) return '/orders'
  return '/forbidden'
}
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
  if (can(user, 'createStore') && value === '/stores/new') return value
  if (can(user, 'viewStores') && /^\/stores(?:\/[1-9]\d*)?$/u.test(value)) return value
  if (can(user, 'manageServiceCatalogue') && value === '/service-catalogue/new') return value
  if (can(user, 'viewServiceCatalogue') && /^\/service-catalogue(?:\/(?:audit|[1-9]\d*))?$/u.test(value)) return value
  if (can(user, 'manageUsers') && /^\/users(?:\/(?:new|[1-9]\d*))?$/u.test(value)) return value
  if (can(user, 'manageLegalDocuments') && /^\/legal-documents(?:\/(?:new|audit|[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}))?$/u.test(value)) return value
  if (can(user, 'manageConsentWithdrawalRequests') && value === '/privacy-requests') return value
  if (can(user, 'manualQuotes') && /^\/orders(?:\/\d{8}-[1-9]\d*(?:\/pricing)?)?$/u.test(value)) return value
  return landing(user)
}
