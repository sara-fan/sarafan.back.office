// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { onScopeDispose, ref, watch } from 'vue'
import { normalizeProblem } from './errors/problem.js'
import { storeIdentity } from './storeCatalogue.js'

// Request ownership shared by staff views; token renewal preserves the identity.
export function useStaffRequest(session, reset = () => {}) {
  const busy = ref(false), problem = ref(null)
  let generation = 0, active = true
  const identity = () => storeIdentity(session.user.value)
  function invalidate() { generation++; busy.value = false }
  watch(identity, () => { invalidate(); problem.value = null; reset() }, { flush:'sync' })
  onScopeDispose(() => { active = false; invalidate() })
  async function run(action, apply = () => {}) {
    if (!active || !session.user.value) return false
    const current = ++generation, owner = identity()
    const valid = () => active && current === generation && owner === identity()
    busy.value = true; problem.value = null
    try {
      const value = await action()
      if (!valid()) return false
      await apply(value)
      return valid()
    } catch (value) {
      if (valid()) problem.value = normalizeProblem(value)
      return false
    } finally { if (valid()) busy.value = false }
  }
  return { busy, problem, run, invalidate }
}
