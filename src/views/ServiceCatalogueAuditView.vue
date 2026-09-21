<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import ListFilterBar from '../components/ListFilterBar.vue'
import ListText from '../components/ListText.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { moscowTime } from '../consentFormatting.js'
import { createInternalProblem, normalizeProblem } from '../errors/problem.js'
import {
  formatServiceCatalogueAvailability,
  formatServiceCatalogueParameters,
  serviceCatalogueAction,
  validateServiceCatalogueAuditItem
} from '../serviceCatalogue.js'
import { useSession } from '../stores/session.js'
import { isPageResult, PAGE_SIZE_OPTIONS, readViewState, writeViewState } from '../viewState.js'

const VIEW_KEY = 'service-catalogue-audit'
const SORT_KEYS = ['timestamp', 'service', 'action', 'actor']
const defaults = { page:1, pageSize:25, sortBy:[{ key:'timestamp', order:'desc' }], filters:{ search:'', service:null, action:null } }
const session = useSession()
const router = useRouter()
let ops = null
const normalizeFilters = value => typeof value?.search === 'string' && value.search.length <= 200
  && (value.service === null || Number.isInteger(value.service))
  && (value.action === null || Number.isInteger(value.action))
  ? { search:value.search, service:value.service, action:value.action }
  : null
const restored = readViewState({ userId:session.user.value?.id, viewKey:VIEW_KEY, defaults, allowedSortKeys:SORT_KEYS, normalizeFilters })
const rows = ref([])
const metadata = ref(null)
const total = ref(0)
const page = ref(restored.state.page)
const pageSize = ref(restored.state.pageSize)
const sortBy = ref(restored.state.sortBy)
const search = ref(restored.state.filters.search)
const service = ref(restored.state.filters.service)
const action = ref(restored.state.filters.action)
const busy = ref(false)
const problem = ref(null)
const preferenceProblem = ref(restored.unavailable ? createInternalProblem('viewPreferencesUnavailable') : null)
const visibleProblem = computed(() => problem.value ?? preferenceProblem.value)
let loadVersion = 0
let searchTimer = null

const serviceItems = computed(() => [{ title:'Все услуги', value:null }, ...(metadata.value?.services ?? []).map(item => ({ title:item.name, value:item.value }))])
const actionItems = computed(() => [{ title:'Все действия', value:null }, ...(metadata.value?.auditActions ?? []).map(item => ({ title:item.name, value:item.value }))])
const pageSizeItems = PAGE_SIZE_OPTIONS.map(value => ({ value, title:String(value) }))
const headers = [
  { title:'Дата и время', key:'timestamp', width:'170px' },
  { title:'Действие', key:'action', width:'130px' },
  { title:'Услуга', key:'service', width:'220px' },
  { title:'Сотрудник', key:'actor', width:'220px' },
  { title:'Было', key:'before' },
  { title:'Стало', key:'after' }
]
const activeSort = () => {
  const candidate = sortBy.value?.[0]
  return SORT_KEYS.includes(candidate?.key) && ['asc', 'desc'].includes(candidate?.order) ? candidate : defaults.sortBy[0]
}
const serviceName = value => metadata.value?.services.find(item => item.value === value)?.name ?? ''
const actionName = value => metadata.value?.auditActions.find(item => item.value === value)?.name ?? ''
const methodName = value => metadata.value?.priceMethods.find(item => item.value === value)?.name ?? ''
const snapshotText = value => value === null ? '—' : `${serviceName(value.service)}; ${methodName(value.priceMethod)}; ${formatServiceCatalogueParameters(value, metadata.value)}; ${formatServiceCatalogueAvailability(value)}`

function persistState() {
  const saved = writeViewState({
    userId:session.user.value?.id,
    viewKey:VIEW_KEY,
    state:{ page:page.value, pageSize:pageSize.value, sortBy:[{ ...activeSort() }], filters:{ search:search.value, service:service.value, action:action.value } }
  })
  if (!saved && !preferenceProblem.value) preferenceProblem.value = createInternalProblem('viewPreferencesUnavailable')
}

async function load() {
  const version = ++loadVersion
  busy.value = true
  problem.value = null
  const sorting = activeSort()
  try {
    const catalogue = await session.getServiceCatalogueOps()
    if (version !== loadVersion) return
    if (!serviceCatalogueAction(session.user.value, catalogue, 'audit')) {
      await router.push('/forbidden')
      return
    }
    ops = catalogue
    if (!catalogue.services.some(item => item.value === service.value)) service.value = null
    if (!catalogue.auditActions.some(item => item.value === action.value)) action.value = null
    const query = new globalThis.URLSearchParams({ page:String(page.value), pageSize:String(pageSize.value), sortBy:sorting.key, sortOrder:sorting.order })
    if (search.value.trim()) query.set('search', search.value.trim())
    if (service.value !== null) query.set('service', String(service.value))
    if (action.value !== null) query.set('action', String(action.value))
    const result = await session.serviceCatalogueRequest(`/service-catalogue/audit?${query}`)
    if (version !== loadVersion) return
    if (!isPageResult(result, SORT_KEYS, item => {
      try { validateServiceCatalogueAuditItem(item, catalogue); return true } catch { return false }
    }) || result.pagination.currentPage !== page.value || result.pagination.pageSize !== pageSize.value
      || result.sorting.sortBy !== sorting.key || result.sorting.sortOrder !== sorting.order
      || (result.search ?? '') !== search.value.trim()
      || (result.service ?? null) !== service.value || (result.action ?? null) !== action.value
      || (result.entryId ?? null) !== null) throw createInternalProblem('protocolError')
    const lastPage = Math.max(1, result.pagination.totalPages)
    if (page.value > lastPage) { page.value = lastPage; persistState(); return load() }
    metadata.value = catalogue
    rows.value = result.items
    total.value = result.pagination.totalCount
  } catch (value) {
    if (version !== loadVersion) return
    rows.value = []; total.value = 0; problem.value = normalizeProblem(value)
  } finally { if (version === loadVersion) busy.value = false }
}

function onSearchInput(value) {
  loadVersion += 1
  search.value = String(value ?? '').slice(0, 200)
  page.value = 1
  if (searchTimer) globalThis.clearTimeout(searchTimer)
  searchTimer = globalThis.setTimeout(() => { searchTimer = null; persistState(); load() }, 300)
}
function onServiceChange(value) { service.value = ops?.services.some(item => item.value === value) ? value : null; page.value = 1; persistState(); load() }
function onActionChange(value) { action.value = ops?.auditActions.some(item => item.value === value) ? value : null; page.value = 1; persistState(); load() }
function onPageChange(value) { if (Number.isInteger(value) && value > 0 && value !== page.value) { page.value = value; persistState(); load() } }
function onPageSizeChange(value) { if (PAGE_SIZE_OPTIONS.includes(value) && value !== pageSize.value) { pageSize.value = value; page.value = 1; persistState(); load() } }
function onSortChange(value) {
  const candidate = value?.[0]
  if (SORT_KEYS.includes(candidate?.key) && ['asc', 'desc'].includes(candidate?.order)) {
    sortBy.value = [{ key:candidate.key, order:candidate.order }]; page.value = 1; persistState(); load()
  }
}
onMounted(load)
onUnmounted(() => { loadVersion += 1; if (searchTimer) globalThis.clearTimeout(searchTimer) })
</script>

<template>
  <section class="settings staff-list">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Журнал тарифов <span class="count">{{ total }}</span>
      </h1>
      <div class="header-actions">
        <ActionButton
          icon="$refresh"
          tooltip-text="Обновить журнал"
          :disabled="busy"
          @click="load"
        />
        <ActionButton
          icon="$close"
          tooltip-text="Вернуться к тарифам"
          :disabled="busy"
          @click="router.push('/service-catalogue')"
        />
      </div>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="visibleProblem" />
    <ListFilterBar
      :search="search"
      search-id="service-catalogue-audit-search"
      :aria-busy="busy"
      @update:search="onSearchInput"
    >
      <v-select
        :model-value="service"
        :disabled="busy || !metadata"
        class="filter-control"
        label="Услуга"
        :items="serviceItems"
        variant="solo"
        density="compact"
        active
        hide-details
        @update:model-value="onServiceChange"
      />
      <v-select
        :model-value="action"
        :disabled="busy || !metadata"
        class="filter-control"
        label="Действие"
        :items="actionItems"
        variant="solo"
        density="compact"
        active
        hide-details
        @update:model-value="onActionChange"
      />
    </ListFilterBar>
    <v-card class="table-card">
      <v-data-table-server
        :headers="headers"
        :items="rows"
        :items-length="total"
        :page="page"
        :items-per-page="pageSize"
        :sort-by="sortBy"
        :loading="busy"
        item-value="id"
        :items-per-page-options="pageSizeItems"
        items-per-page-text="Событий на странице"
        page-text="{0}-{1} из {2}"
        no-data-text="События не найдены."
        density="compact"
        must-sort
        class="interlaced-table service-catalogue-audit-table"
        height="var(--staff-table-height)"
        fixed-header
        @update:page="onPageChange"
        @update:items-per-page="onPageSizeChange"
        @update:sort-by="onSortChange"
      >
        <template #[`item.timestamp`]="{ item }">
          <ListText :text="moscowTime(item.at)" />
        </template>
        <template #[`item.action`]="{ item }">
          <ListText :text="actionName(item.action)" />
        </template>
        <template #[`item.service`]="{ item }">
          <ListText :text="serviceName(item.service)" />
        </template>
        <template #[`item.actor`]="{ item }">
          <ListText :text="item.actorName" />
        </template>
        <template #[`item.before`]="{ item }">
          <ListText :text="snapshotText(item.before)" />
        </template>
        <template #[`item.after`]="{ item }">
          <ListText :text="snapshotText(item.after)" />
        </template>
      </v-data-table-server>
    </v-card>
  </section>
</template>

<style scoped>
.service-catalogue-audit-table { --staff-table-height:max(320px, calc(100vh - 300px)); }
</style>
