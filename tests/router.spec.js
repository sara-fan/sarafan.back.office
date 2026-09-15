// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../src/router.js'
import { safeReturn } from '../src/roles.js'
describe('route authorization',()=>{
  it('authorizes direct order cards and safe returns for all four roles', async () => {
    const s = { user:ref(null), restoreProblem:ref(null), ensureReady:vi.fn().mockResolvedValue() }
    const r = createAppRouter(createMemoryHistory(), s)
    await r.push('/orders/12345678-1')
    expect(r.currentRoute.value.query.return).toBe('/orders/12345678-1')
    for (const role of ['administrator','shift-manager','senior-operator','operator']) {
      s.user.value = { roles:[role] }
      await r.push('/orders/12345678-1')
      expect(r.currentRoute.value.matched[0].meta.action).toBe('manualQuotes')
      expect(safeReturn('/orders/12345678-1', s.user.value)).toBe('/orders/12345678-1')
    }
    for (const value of ['/orders/12345678-01','/orders/1','//evil','/orders/12345678-1?secret=1']) expect(safeReturn(value, s.user.value)).toBe('/orders')
    s.user.value = { roles:['unknown'] }
    await r.push('/orders/12345678-2')
    expect(r.currentRoute.value.path).toBe('/forbidden')
  })
  it('chooses the landing page after the initial session restore',async()=>{
    const s={user:ref(null),restoreProblem:ref(null),ensureReady:vi.fn(async()=>{s.user.value={id:7,roles:['administrator']}})}
    const r=createAppRouter(createMemoryHistory(),s)
    await r.push('/')
    expect(r.currentRoute.value.path).toBe('/users')
    expect(s.ensureReady).toHaveBeenCalled()
  })
  it('restores before navigation and rejects direct access without leaking staff data',async()=>{
    const s={user:ref(null),restoreProblem:ref(null),ensureReady:vi.fn().mockResolvedValue()}
    const r=createAppRouter(createMemoryHistory(),s);await r.push('/users/3');expect(r.currentRoute.value.path).toBe('/login');expect(r.currentRoute.value.query.return).toBe('/users/3')
    s.user.value={roles:['operator']};await r.push('/users');expect(r.currentRoute.value.path).toBe('/forbidden')
    await r.push('/profile');expect(r.currentRoute.value.path).toBe('/profile');await r.push('/login');expect(r.currentRoute.value.path).toBe('/orders');await r.push('/home');expect(r.currentRoute.value.path).toBe('/orders');await r.push('/orders');expect(r.currentRoute.value.path).toBe('/orders')
    s.user.value={id:9,roles:['senior-operator']};await r.push('/home');expect(r.currentRoute.value.path).toBe('/orders');await r.push('/privacy-requests');expect(r.currentRoute.value.path).toBe('/privacy-requests');await r.push('/legal-documents');expect(r.currentRoute.value.path).toBe('/forbidden')
    s.user.value={id:10,roles:['shift-manager']};await r.push('/privacy-requests');expect(r.currentRoute.value.path).toBe('/privacy-requests');await r.push('/legal-documents');expect(r.currentRoute.value.path).toBe('/forbidden')
    s.user.value={id:7,roles:['administrator']};await r.push('/home');expect(r.currentRoute.value.path).toBe('/users');await r.push('/');expect(r.currentRoute.value.path).toBe('/users');await r.push('/profile');expect(r.currentRoute.value.path).toBe('/users/7');await r.push('/users/new');expect(r.currentRoute.value.path).toBe('/users/new');await r.push('/legal-documents/new');expect(r.currentRoute.value.path).toBe('/legal-documents/new');await r.push('/legal-documents/audit');expect(r.currentRoute.value.path).toBe('/legal-documents/audit');await r.push('/privacy-requests');expect(r.currentRoute.value.path).toBe('/privacy-requests');expect(r.getRoutes().some(route=>route.path.startsWith('/privacy-requests/:'))).toBe(false);await r.push('/missing');expect(r.currentRoute.value.matched).toHaveLength(1)
    s.restoreProblem.value={type:'problem'};await r.push('/users/2');expect(r.currentRoute.value.path).toBe('/users/2');expect(s.ensureReady).toHaveBeenCalled()
  })
})
