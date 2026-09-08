// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export const PAGE_SIZE_OPTIONS = Object.freeze([10, 25, 50, 100])
const VERSION = 1
const KEY_PREFIX = 'sarafan.backoffice.view-state.v1'
const VIEW_KEY_PATTERN = /^[a-z]+(?:-[a-z]+)*$/u

function defaultsCopy(defaults) {
  return {
    page:defaults.page,
    pageSize:defaults.pageSize,
    sortBy:defaults.sortBy.map(item => ({ ...item })),
    filters:{ ...defaults.filters }
  }
}

function storageKey(userId, viewKey) {
  if (!Number.isInteger(userId) || userId <= 0 || !VIEW_KEY_PATTERN.test(viewKey)) return null
  return `${KEY_PREFIX}.${userId}.${viewKey}`
}

function normalizedSort(value, defaults, allowedSortKeys) {
  const candidate = Array.isArray(value) ? value[0] : null
  if (!candidate || value.length !== 1 || !allowedSortKeys.includes(candidate.key) || !['asc', 'desc'].includes(candidate.order)) return null
  return [{ key:candidate.key, order:candidate.order }]
}

export function readViewState({ userId, viewKey, defaults, allowedSortKeys, normalizeFilters }) {
  const fallback = defaultsCopy(defaults)
  const key = storageKey(userId, viewKey)
  if (!key) return { state:fallback, unavailable:false }
  let raw
  try {
    raw = globalThis.localStorage.getItem(key)
  } catch {
    return { state:fallback, unavailable:true }
  }
  if (!raw) return { state:fallback, unavailable:false }
  try {
    const value = JSON.parse(raw)
    if (!value || value.version !== VERSION) return { state:fallback, unavailable:false }
    const restoredSort = normalizedSort(value.sortBy, defaults, allowedSortKeys)
    const restoredFilters = normalizeFilters(value.filters)
    if (!Number.isInteger(value.page) || value.page < 1
      || !PAGE_SIZE_OPTIONS.includes(value.pageSize) || !restoredSort || !restoredFilters) {
      return { state:fallback, unavailable:false }
    }
    return {
      state:{
        page:value.page,
        pageSize:value.pageSize,
        sortBy:restoredSort,
        filters:restoredFilters
      },
      unavailable:false
    }
  } catch {
    try { globalThis.localStorage.removeItem(key) } catch { return { state:fallback, unavailable:true } }
    return { state:fallback, unavailable:false }
  }
}

export function writeViewState({ userId, viewKey, state }) {
  const key = storageKey(userId, viewKey)
  if (!key) return true
  try {
    globalThis.localStorage.setItem(key, JSON.stringify({ version:VERSION, ...state }))
    return true
  } catch {
    return false
  }
}

export function isPageResult(value, allowedSortKeys, itemIsValid) {
  const pagination = value?.pagination
  const sorting = value?.sorting
  if (!value || !Array.isArray(value.items) || value.items.some(item => !itemIsValid(item))
    || !pagination || !Number.isInteger(pagination.currentPage) || pagination.currentPage < 1
    || !Number.isInteger(pagination.pageSize) || pagination.pageSize < 1 || pagination.pageSize > 100
    || !Number.isInteger(pagination.totalCount) || pagination.totalCount < 0
    || !Number.isInteger(pagination.totalPages) || pagination.totalPages < 0
    || typeof pagination.hasNextPage !== 'boolean' || typeof pagination.hasPreviousPage !== 'boolean'
    || !sorting || !allowedSortKeys.includes(sorting.sortBy) || !['asc', 'desc'].includes(sorting.sortOrder)
    || !(value.search === null || value.search === undefined || typeof value.search === 'string')) return false
  const expectedPages = pagination.totalCount === 0 ? 0 : Math.ceil(pagination.totalCount / pagination.pageSize)
  return value.items.length <= pagination.pageSize && value.items.length <= pagination.totalCount
    && pagination.totalPages === expectedPages
    && pagination.hasNextPage === (pagination.currentPage < expectedPages)
    && pagination.hasPreviousPage === (pagination.currentPage > 1)
}
