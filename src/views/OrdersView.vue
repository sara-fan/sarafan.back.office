<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { moscowTime } from '../consentFormatting.js'
import { createInternalProblem, normalizeProblem } from '../errors/problem.js'
import {
  DEFAULT_ORDER_STATUS_SELECTION,
  ORDER_SEARCH_LIMIT,
  ORDER_SORT_KEYS,
  formatOrderMoney,
  normalizeOrderFilters,
  orderRowIsValid,
  orderStatusItems,
  orderStatusName,
  safeOrderSource,
  selectionIsKnown
} from '../orderFormatting.js'
import { useSession } from '../stores/session.js'
import { isPageResult, PAGE_SIZE_OPTIONS, readViewState, writeViewState } from '../viewState.js'

const router = useRouter()
const VIEW_KEY = 'orders'
const defaults = {
  page:1,
  pageSize:10,
  sortBy:[{ key:'createdAt', order:'desc' }],
  filters:{ search:'', status:DEFAULT_ORDER_STATUS_SELECTION, createdFrom:'', createdTo:'' }
}
const session = useSession()
const restored = readViewState({
  userId:session.user.value?.id,
  viewKey:VIEW_KEY,
  defaults,
  allowedSortKeys:ORDER_SORT_KEYS,
  normalizeFilters:normalizeOrderFilters
})
const rows = ref([])
const total = ref(0)
const search = ref(restored.state.filters.search)
const selectedStatus = ref(restored.state.filters.status)
const createdFrom = ref(restored.state.filters.createdFrom)
const createdTo = ref(restored.state.filters.createdTo)
const page = ref(restored.state.page)
const itemsPerPage = ref(restored.state.pageSize)
const sortBy = ref(restored.state.sortBy)
const ops = ref(null)
const busy = ref(false)
const problem = ref(null)
const preferenceProblem = ref(restored.unavailable ? createInternalProblem('viewPreferencesUnavailable') : null)
const visibleProblem = computed(() => problem.value ?? preferenceProblem.value)
const statusItems = computed(() => ops.value ? orderStatusItems(ops.value) : [{ title:'Все статусы', value:'' }])
const pageSizeItems = PAGE_SIZE_OPTIONS.map(value => ({ value, title:String(value) }))
let loadVersion = 0
let searchTimer = null

const headers = [
  { title:'', key:'actions', sortable:false, width:'56px' },
  { title:'Номер', key:'orderNumber' },
  { title:'Статус', key:'status' },
  { title:'Товар', key:'productName' },
  { title:'Магазин', key:'storeName' },
  { title:'Цена продавца', key:'sellerPrice', align:'end' },
  { title:'Кол-во', key:'quantity', align:'end' },
  { title:'Создан', key:'createdAt' },
  { title:'Обновлён', key:'updatedAt' }
]
const activeSort = () => {
  const candidate = sortBy.value?.[0]
  return ORDER_SORT_KEYS.includes(candidate?.key) && ['asc', 'desc'].includes(candidate?.order)
    ? candidate
    : defaults.sortBy[0]
}

function persistState() {
  const saved = writeViewState({
    userId:session.user.value?.id,
    viewKey:VIEW_KEY,
    state:{
      page:page.value,
      pageSize:itemsPerPage.value,
      sortBy:[{ ...activeSort() }],
      filters:{
        search:search.value,
        status:selectedStatus.value,
        createdFrom:createdFrom.value,
        createdTo:createdTo.value
      }
    }
  })
  if (!saved && !preferenceProblem.value) preferenceProblem.value = createInternalProblem('viewPreferencesUnavailable')
}

function clearSearchTimer() {
  if (searchTimer) {
    globalThis.clearTimeout(searchTimer)
    searchTimer = null
  }
}

function statusQuery(query) {
  if (!selectedStatus.value) return
  const [kind, value] = selectedStatus.value.split(':')
  query.set(kind === 'group' ? 'statusGroup' : 'status', value)
}

function echoesFilters(result) {
  const [kind, raw] = selectedStatus.value ? selectedStatus.value.split(':') : ['', '']
  const expectedStatus = kind === 'status' ? Number(raw) : null
  const expectedGroup = kind === 'group' ? raw : null
  return (result.search ?? '') === search.value.trim()
    && (result.status ?? null) === expectedStatus
    && (result.statusGroup ?? null) === expectedGroup
    && (result.createdFrom ?? null) === (createdFrom.value || null)
    && (result.createdTo ?? null) === (createdTo.value || null)
}

async function load(options) {
  const retainRows = options?.retainRows === true
  const version = ++loadVersion
  busy.value = true
  problem.value = null
  try {
    const loadedOps = await session.getOrderOps()
    if (version !== loadVersion) return
    ops.value = loadedOps
    if (!selectionIsKnown(selectedStatus.value, loadedOps)) {
      selectedStatus.value = DEFAULT_ORDER_STATUS_SELECTION
      page.value = 1
      persistState()
    }
    const sorting = activeSort()
    const query = new globalThis.URLSearchParams({
      page:String(page.value),
      pageSize:String(itemsPerPage.value),
      sortBy:sorting.key,
      sortOrder:sorting.order
    })
    const normalizedSearch = search.value.trim()
    if (normalizedSearch) query.set('search', normalizedSearch)
    statusQuery(query)
    if (createdFrom.value) query.set('createdFrom', createdFrom.value)
    if (createdTo.value) query.set('createdTo', createdTo.value)
    const result = await session.orderRequest(`/orders?${query}`)
    if (version !== loadVersion) return
    if (!isPageResult(result, ORDER_SORT_KEYS, row => orderRowIsValid(row, loadedOps))
      || result.pagination.currentPage !== page.value
      || result.pagination.pageSize !== itemsPerPage.value
      || result.sorting.sortBy !== sorting.key || result.sorting.sortOrder !== sorting.order
      || !echoesFilters(result)) throw createInternalProblem('protocolError')
    const lastPage = Math.max(1, result.pagination.totalPages)
    if (page.value > lastPage) {
      page.value = lastPage
      persistState()
      return load({ retainRows })
    }
    rows.value = result.items
    total.value = result.pagination.totalCount
  } catch (value) {
    if (version !== loadVersion) return
    if (!retainRows) {
      rows.value = []
      total.value = 0
    }
    problem.value = normalizeProblem(value)
  } finally {
    if (version === loadVersion) busy.value = false
  }
}

function reloadFromFirstPage() {
  clearSearchTimer()
  page.value = 1
  persistState()
  load()
}

function onSearchInput(value) {
  search.value = String(value ?? '').slice(0, ORDER_SEARCH_LIMIT)
  page.value = 1
  persistState()
  if (searchTimer) globalThis.clearTimeout(searchTimer)
  searchTimer = globalThis.setTimeout(() => {
    searchTimer = null
    load()
  }, 300)
}

function refreshList() {
  clearSearchTimer()
  load()
}

async function openOrder(item) {
  if (busy.value) return
  try { await router.push(`/orders/${item.orderNumber}`) }
  catch (value) { problem.value = normalizeProblem(value) }
}

function orderCellProps({ item, column }) {
  if (column.key === 'productName') return {}
  return {
    class:'order-card-cell',
    onClick:() => openOrder(item)
  }
}

function onStatusChange(value) {
  if (!ops.value || !selectionIsKnown(value, ops.value)) return
  selectedStatus.value = value
  reloadFromFirstPage()
}

function onCreatedFromChange(value) {
  const normalized = normalizeOrderFilters({
    search:search.value, status:selectedStatus.value, createdFrom:value ?? '', createdTo:createdTo.value
  })
  if (!normalized) return
  createdFrom.value = normalized.createdFrom
  reloadFromFirstPage()
}

function onCreatedToChange(value) {
  const normalized = normalizeOrderFilters({
    search:search.value, status:selectedStatus.value, createdFrom:createdFrom.value, createdTo:value ?? ''
  })
  if (!normalized) return
  createdTo.value = normalized.createdTo
  reloadFromFirstPage()
}

function onPageChange(value) {
  if (busy.value || !Number.isInteger(value) || value < 1 || value === page.value) return
  clearSearchTimer()
  page.value = value
  persistState()
  load()
}

function onItemsPerPageChange(value) {
  if (busy.value || !PAGE_SIZE_OPTIONS.includes(value) || value === itemsPerPage.value) return
  itemsPerPage.value = value
  reloadFromFirstPage()
}

function onSortChange(value) {
  const candidate = value?.[0]
  if (busy.value || !ORDER_SORT_KEYS.includes(candidate?.key) || !['asc', 'desc'].includes(candidate?.order)) return
  sortBy.value = [{ key:candidate.key, order:candidate.order }]
  reloadFromFirstPage()
}

onMounted(load)
onUnmounted(() => {
  loadVersion += 1
  if (searchTimer) globalThis.clearTimeout(searchTimer)
})
</script>

<template>
  <section class="settings staff-list">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Заказы <span class="count">{{ total }}</span>
      </h1>
      <div class="header-actions">
        <span
          v-if="busy"
          class="header-spinner"
          role="status"
          aria-label="Загрузка"
        />
        <ActionButton
          icon="$refresh"
          tooltip-text="Обновить заказы"
          :disabled="busy"
          @click="refreshList"
        />
      </div>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="visibleProblem" />
    <fieldset
      class="filter-bar orders-filter-bar"
      :disabled="busy"
    >
      <v-text-field
        id="order-search"
        :model-value="search"
        class="filter-control filter-search"
        label="Поиск"
        prepend-inner-icon="$search"
        variant="solo"
        density="compact"
        active
        hide-details
        clearable
        @update:model-value="onSearchInput"
      />
      <v-select
        :model-value="selectedStatus"
        class="filter-control order-status-filter"
        :items="statusItems"
        label="Статус"
        variant="solo"
        density="compact"
        active
        hide-details
        @update:model-value="onStatusChange"
      />
      <v-text-field
        :model-value="createdFrom"
        class="filter-control order-date-filter"
        label="Создан с"
        type="date"
        variant="solo"
        density="compact"
        active
        hide-details
        clearable
        @update:model-value="onCreatedFromChange"
      />
      <v-text-field
        :model-value="createdTo"
        class="filter-control order-date-filter"
        label="Создан по"
        type="date"
        variant="solo"
        density="compact"
        active
        hide-details
        clearable
        @update:model-value="onCreatedToChange"
      />
    </fieldset>
    <v-card
      v-if="!problem || rows.length"
      class="table-card"
    >
      <v-data-table-server
        :page="page"
        :items-per-page="itemsPerPage"
        :sort-by="sortBy"
        :headers="headers"
        :items="rows"
        :cell-props="orderCellProps"
        :items-length="total"
        :loading="busy"
        item-value="orderNumber"
        :items-per-page-options="pageSizeItems"
        items-per-page-text="Заказов на странице"
        page-text="{0}-{1} из {2}"
        no-data-text="Заказы не найдены."
        density="compact"
        must-sort
        class="interlaced-table orders-table"
        height="var(--staff-table-height)"
        fixed-header
        @update:page="onPageChange"
        @update:items-per-page="onItemsPerPageChange"
        @update:sort-by="onSortChange"
      >
        <template #[`item.actions`]="{ item }">
          <div class="actions-container">
            <ActionButton
              icon="$edit"
              tooltip-text="Открыть заказ"
              :item="item"
              :disabled="busy"
            />
          </div>
        </template>
        <template #[`item.status`]="{ item }">
          <span class="status-pill">{{ orderStatusName(item.status, ops) }}</span>
        </template>
        <template #[`item.productName`]="{ item }">
          <div class="order-product">
            <span>{{ item.productName || 'Товар не указан' }}</span>
            <a
              :href="safeOrderSource(item.sourceUrl)"
              target="_blank"
              rel="noopener noreferrer"
            >Страница товара</a>
          </div>
        </template>
        <template #[`item.storeName`]="{ item }">
          {{ item.storeName || 'Магазин не указан' }}
        </template>
        <template #[`item.sellerPrice`]="{ item }">
          {{ formatOrderMoney(item.sellerPrice, ops) }}
        </template>
        <template #[`item.createdAt`]="{ item }">
          {{ moscowTime(item.createdAt) }}
        </template>
        <template #[`item.updatedAt`]="{ item }">
          {{ moscowTime(item.updatedAt) }}
        </template>
      </v-data-table-server>
    </v-card>
  </section>
</template>

<style scoped>
.staff-list .orders-filter-bar { grid-template-columns:minmax(260px, 1fr) minmax(240px, 320px) minmax(150px, 190px) minmax(150px, 190px); }
.orders-table { --staff-table-height:max(320px, calc(100vh - 300px)); }
.orders-table :deep(td.order-card-cell) { cursor:pointer; }
.order-product { display:grid; gap:2px; min-width:200px; }
.order-product a { color:#176da5; font-size:12px; text-decoration:underline; text-underline-offset:2px; }
.order-product a:hover { color:#1d3e85; }
@media (max-width:1100px) {
  .staff-list .orders-filter-bar { grid-template-columns:1fr 1fr; }
  .staff-list .orders-filter-bar .filter-search { grid-column:1 / -1; }
}
@media (max-width:600px) {
  .staff-list .orders-filter-bar { grid-template-columns:1fr; }
  .staff-list .orders-filter-bar .filter-search { grid-column:auto; }
}
</style>
