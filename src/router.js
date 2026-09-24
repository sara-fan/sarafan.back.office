// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createRouter, createWebHistory } from 'vue-router'
import { can, landing, profileRoute } from './roles.js'
import { useSession } from './stores/session.js'
import LoginView from './views/LoginView.vue'
import UsersView from './views/UsersView.vue'
import AccountView from './views/AccountView.vue'
import LegalDocumentsView from './views/LegalDocumentsView.vue'
import LegalDocumentView from './views/LegalDocumentView.vue'
import LegalDocumentAuditView from './views/LegalDocumentAuditView.vue'
import PrivacyRequestsView from './views/PrivacyRequestsView.vue'
import OrderView from './views/OrderView.vue'
import OrderPricingView from './views/OrderPricingView.vue'
import OrdersView from './views/OrdersView.vue'
import StoresView from './views/StoresView.vue'
import StoreView from './views/StoreView.vue'
import ServiceCatalogueView from './views/ServiceCatalogueView.vue'
import ServiceCatalogueEntryView from './views/ServiceCatalogueEntryView.vue'
import ServiceCatalogueAuditView from './views/ServiceCatalogueAuditView.vue'
import StatusView from './views/StatusView.vue'

export function createAppRouter(history = createWebHistory(), session = useSession()) {
  const router = createRouter({ history, routes: [
    { path:'/', component:StatusView, meta:{ entry:true } },
    { path:'/login', component:LoginView, meta:{ public:true } },
    { path:'/home', component:StatusView, meta:{ entry:true } },
    { path:'/users', component:UsersView, meta:{ action:'manageUsers' } },
    { path:'/users/new', component:AccountView, meta:{ action:'manageUsers' } },
    { path:'/users/:id([1-9]\\d*)', component:AccountView, meta:{ action:'manageUsers' } },
    { path:'/legal-documents', component:LegalDocumentsView, meta:{ action:'manageLegalDocuments' } },
    { path:'/legal-documents/new', component:LegalDocumentView, meta:{ action:'manageLegalDocuments' } },
    { path:'/legal-documents/audit', component:LegalDocumentAuditView, meta:{ action:'manageLegalDocuments' } },
    { path:'/legal-documents/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', component:LegalDocumentView, meta:{ action:'manageLegalDocuments' } },
    { path:'/privacy-requests', component:PrivacyRequestsView, meta:{ action:'manageConsentWithdrawalRequests' } },
    { path:'/orders', component:OrdersView, meta:{ action:'manualQuotes' } },
    { path:'/stores', component:StoresView, meta:{ action:'viewStores' } },
    { path:'/stores/new', component:StoreView, meta:{ action:'createStore' } },
    { path:'/stores/:id([1-9]\\d*)', component:StoreView, meta:{ action:'viewStores' } },
    { path:'/service-catalogue', component:ServiceCatalogueView, meta:{ action:'viewServiceCatalogue' } },
    { path:'/service-catalogue/new', component:ServiceCatalogueEntryView, meta:{ action:'manageServiceCatalogue' } },
    { path:'/service-catalogue/audit', component:ServiceCatalogueAuditView, meta:{ action:'viewServiceCatalogue' } },
    { path:'/service-catalogue/:id([1-9]\\d*)', component:ServiceCatalogueEntryView, meta:{ action:'viewServiceCatalogue' } },
    { path:'/orders/:orderNumber(\\d{8}-[1-9]\\d*)', component:OrderView, meta:{ action:'manualQuotes' } },
    { path:'/orders/:orderNumber(\\d{8}-[1-9]\\d*)/pricing', component:OrderPricingView, meta:{ action:'manualQuotes' } },
    { path:'/profile', component:AccountView },
    { path:'/forbidden', component:StatusView, props:{ forbidden:true } },
    { path:'/:pathMatch(.*)*', component:StatusView }
  ] })
  router.beforeEach(async to => {
    await session.ensureReady()
    if (session.restoreProblem.value) return true
    if (!session.user.value && !to.meta.public) return { path:'/login', query:{ return:to.path } }
    if (session.user.value && to.path === '/login') return landing(session.user.value)
    if (session.user.value && to.meta.entry) return landing(session.user.value)
    if (session.user.value && to.path === '/profile') {
      const target = profileRoute(session.user.value)
      if (target !== '/profile') return target
    }
    if (to.path === '/forbidden') return true
    if (!to.meta.public && !can(session.user.value, to.meta.action || 'access')) return '/forbidden'
    return true
  })
  return router
}
export const router = createAppRouter()
