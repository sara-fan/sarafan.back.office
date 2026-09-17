// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { onMounted, onUnmounted, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

// Reusable guard for editors with in-memory drafts. A session reset cancels a pending departure.
export function useDiscardChanges(dirty) {
  const confirmation = ref(false)
  let resolvePending = null
  function finish(accepted) {
    confirmation.value = false
    const resolve = resolvePending
    resolvePending = null
    resolve?.(accepted)
  }
  function confirmDiscard() {
    if (!dirty.value) return Promise.resolve(true)
    finish(false)
    confirmation.value = true
    return new Promise(resolve => { resolvePending = resolve })
  }
  onBeforeRouteLeave(confirmDiscard)
  onBeforeRouteUpdate(confirmDiscard)
  function beforeUnload(event) {
    if (!dirty.value) return
    event.preventDefault()
    event.returnValue = ''
  }
  onMounted(() => globalThis.addEventListener('beforeunload', beforeUnload))
  onUnmounted(() => { finish(false); globalThis.removeEventListener('beforeunload', beforeUnload) })
  return { confirmation, confirmDiscard, finish }
}
