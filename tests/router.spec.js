// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../src/router.js'
describe('route authorization',()=>{
  it('restores before navigation and rejects direct access without leaking staff data',async()=>{
    const s={user:ref(null),restoreProblem:ref(null),ensureReady:vi.fn().mockResolvedValue()}
    const r=createAppRouter(createMemoryHistory(),s);await r.push('/users/3');expect(r.currentRoute.value.path).toBe('/login');expect(r.currentRoute.value.query.return).toBe('/users/3')
    s.user.value={roles:['operator']};await r.push('/users');expect(r.currentRoute.value.path).toBe('/forbidden')
    await r.push('/profile');expect(r.currentRoute.value.path).toBe('/profile');await r.push('/login');expect(r.currentRoute.value.path).toBe('/home')
    s.user.value={roles:['administrator']};await r.push('/');expect(r.currentRoute.value.path).toBe('/users');await r.push('/users/new');expect(r.currentRoute.value.path).toBe('/users/new');await r.push('/missing');expect(r.currentRoute.value.matched).toHaveLength(1)
    s.restoreProblem.value={type:'problem'};await r.push('/users/2');expect(r.currentRoute.value.path).toBe('/users/2');expect(s.ensureReady).toHaveBeenCalled()
  })
})
