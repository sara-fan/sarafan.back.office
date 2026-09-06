// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createRouter, createWebHistory } from 'vue-router'
import { can, landing, profileRoute } from './roles.js'
import { useSession } from './stores/session.js'
import LoginView from './views/LoginView.vue'
import UsersView from './views/UsersView.vue'
import AccountView from './views/AccountView.vue'
import StatusView from './views/StatusView.vue'

export function createAppRouter(history = createWebHistory(), session = useSession()) {
  const router = createRouter({ history, routes: [
    { path:'/', redirect: () => landing(session.user.value) },
    { path:'/login', component:LoginView, meta:{ public:true } },
    { path:'/home', redirect: () => landing(session.user.value) },
    { path:'/users', component:UsersView, meta:{ action:'manageUsers' } },
    { path:'/users/new', component:AccountView, meta:{ action:'manageUsers' } },
    { path:'/users/:id([1-9]\\d*)', component:AccountView, meta:{ action:'manageUsers' } },
    { path:'/profile', component:AccountView },
    { path:'/forbidden', component:StatusView, props:{ forbidden:true } },
    { path:'/:pathMatch(.*)*', component:StatusView }
  ] })
  router.beforeEach(async to => {
    await session.ensureReady()
    if (session.restoreProblem.value) return true
    if (!session.user.value && !to.meta.public) return { path:'/login', query:{ return:to.path } }
    if (session.user.value && to.path === '/login') return landing(session.user.value)
    if (session.user.value && to.path === '/profile') {
      const target = profileRoute(session.user.value)
      if (target !== '/profile') return target
    }
    if (!to.meta.public && !can(session.user.value, to.meta.action || 'access')) return '/forbidden'
    return true
  })
  return router
}
export const router = createAppRouter()
