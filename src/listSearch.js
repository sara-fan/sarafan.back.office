// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { onUnmounted } from 'vue'

export const normalizeListSearch = value => String(value ?? '').replace(/[\u00a0\u202f]/gu, ' ').trim().toLocaleLowerCase('ru')

export function matchesListSearch(query, displayedValues) {
  const term = normalizeListSearch(query)
  return !term || displayedValues.some(value => normalizeListSearch(value).includes(term))
}

export function useListSearchDebounce(invalidate, reload) {
  let timer = null
  function cancel() {
    if (timer !== null) globalThis.clearTimeout(timer)
    timer = null
  }
  function schedule() {
    cancel()
    invalidate()
    timer = globalThis.setTimeout(() => { timer = null; reload() }, 300)
  }
  onUnmounted(cancel)
  return { schedule, cancel }
}
