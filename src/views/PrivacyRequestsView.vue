<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed, onMounted, onUnmounted, ref } from 'vue'
import ActionButton from '../components/ActionButton.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { moscowTime } from '../consentFormatting.js'
import { createInternalProblem, normalizeProblem } from '../errors/problem.js'
import { useSession } from '../stores/session.js'
import { isPageResult, PAGE_SIZE_OPTIONS, readViewState, writeViewState } from '../viewState.js'

const VIEW_KEY = 'privacy-requests'
const SORT_KEYS = ['processed', 'requestedAt', 'customerId']
const defaults = {
  page:1,
  pageSize:10,
  sortBy:[{ key:'processed', order:'asc' }],
  filters:{ search:'', processed:'' }
}
const normalizeFilters = value => typeof value?.search === 'string' && /^\d{0,10}$/u.test(value.search)
  && ['', 'false', 'true'].includes(value?.processed)
  ? { search:value.search, processed:value.processed }
  : null

const session = useSession()
const restored = readViewState({
  userId:session.user.value?.id,
  viewKey:VIEW_KEY,
  defaults,
  allowedSortKeys:SORT_KEYS,
  normalizeFilters
})
const rows = ref([])
const total = ref(0)
const search = ref(restored.state.filters.search)
const processed = ref(restored.state.filters.processed)
const page = ref(restored.state.page)
const itemsPerPage = ref(restored.state.pageSize)
const sortBy = ref(restored.state.sortBy)
const busy = ref(false)
const processingKey = ref('')
const problem = ref(null)
const preferenceProblem = ref(restored.unavailable ? createInternalProblem('viewPreferencesUnavailable') : null)
const visibleProblem = computed(() => problem.value ?? preferenceProblem.value)
let loadVersion = 0
let searchTimer = null

const statusItems = [
  { title:'Все статусы', value:'' },
  { title:'Ожидают обработки', value:'false' },
  { title:'Обработанные', value:'true' }
]
const pageSizeItems = PAGE_SIZE_OPTIONS.map(value => ({ value, title:String(value) }))
const headers = [
  { title:'Действия', key:'actions', sortable:false, width:'150px' },
  { title:'Покупатель', key:'customerId' },
  { title:'Время запроса', key:'requestedAt' },
  { title:'Статус', key:'processed' }
]
const rowKey = request => `${request.customerId}:${request.requestedAt}`
const requestIsValid = request => Number.isInteger(request?.customerId) && request.customerId > 0
  && typeof request.requestedAt === 'string' && typeof request.processed === 'boolean'
const activeSort = () => {
  const candidate = sortBy.value?.[0]
  return SORT_KEYS.includes(candidate?.key) && ['asc', 'desc'].includes(candidate?.order)
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
      filters:{ search:search.value, processed:processed.value }
    }
  })
  if (!saved && !preferenceProblem.value) preferenceProblem.value = createInternalProblem('viewPreferencesUnavailable')
}

async function load(options) {
  const retainRows = options?.retainRows === true
  const version = ++loadVersion
  busy.value = true
  problem.value = null
  const sorting = activeSort()
  const query = new globalThis.URLSearchParams({
    page:String(page.value),
    pageSize:String(itemsPerPage.value),
    sortBy:sorting.key,
    sortOrder:sorting.order
  })
  if (search.value) query.set('search', search.value)
  if (processed.value) query.set('processed', processed.value)
  try {
    const result = await session.consentRequest(`/consents/withdrawal-requests?${query}`)
    if (version !== loadVersion) return
    if (!isPageResult(result, SORT_KEYS, requestIsValid)
      || result.pagination.currentPage !== page.value
      || result.pagination.pageSize !== itemsPerPage.value
      || result.sorting.sortBy !== sorting.key || result.sorting.sortOrder !== sorting.order
      || (result.search ?? '') !== search.value) {
      throw createInternalProblem('protocolError')
    }
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

function onSearchInput(value) {
  search.value = String(value ?? '').replace(/\D/gu, '').slice(0, 10)
  page.value = 1
  if (searchTimer) globalThis.clearTimeout(searchTimer)
  searchTimer = globalThis.setTimeout(() => {
    searchTimer = null
    persistState()
    load()
  }, 300)
}

function onProcessedChange(value) {
  processed.value = ['', 'false', 'true'].includes(value) ? value : ''
  page.value = 1
  persistState()
  load()
}

function onPageChange(value) {
  if (!Number.isInteger(value) || value < 1 || value === page.value) return
  page.value = value
  persistState()
  load()
}

function onItemsPerPageChange(value) {
  if (!PAGE_SIZE_OPTIONS.includes(value) || value === itemsPerPage.value) return
  itemsPerPage.value = value
  page.value = 1
  persistState()
  load()
}

function onSortChange(value) {
  const candidate = value?.[0]
  if (!SORT_KEYS.includes(candidate?.key) || !['asc', 'desc'].includes(candidate?.order)) return
  sortBy.value = [{ key:candidate.key, order:candidate.order }]
  page.value = 1
  persistState()
  load()
}

async function process(request) {
  if (!request || request.processed) return
  processingKey.value = rowKey(request)
  problem.value = null
  try {
    const result = await session.consentRequest('/consents/withdrawal-requests/processed', {
      method:'PUT',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ customerId:request.customerId, requestedAt:request.requestedAt })
    })
    rows.value = processed.value === 'false'
      ? rows.value.filter(item => rowKey(item) !== rowKey(request))
      : rows.value.map(item => rowKey(item) === rowKey(request) ? result : item)
    if (processed.value === 'false') total.value = Math.max(0, total.value - 1)
    await load({ retainRows:true })
  } catch (value) {
    problem.value = normalizeProblem(value)
  } finally {
    processingKey.value = ''
  }
}

onMounted(load)
onUnmounted(() => {
  loadVersion += 1
  if (searchTimer) globalThis.clearTimeout(searchTimer)
})
</script>

<template>
  <section class="settings table-wide">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Запросы на удаление персональных данных <span class="count">{{ total }}</span>
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
          tooltip-text="Обновить обращения"
          :disabled="busy || Boolean(processingKey)"
          @click="load"
        />
      </div>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="visibleProblem" />
    <fieldset
      class="filter-bar"
      :disabled="busy || Boolean(processingKey)"
    >
      <v-text-field
        id="privacy-request-search"
        :model-value="search"
        class="filter-control filter-search"
        label="Поиск по номеру покупателя"
        prepend-inner-icon="$search"
        inputmode="numeric"
        variant="solo"
        density="compact"
        active
        hide-details
        clearable
        @update:model-value="onSearchInput"
      />
      <v-select
        :model-value="processed"
        class="filter-control"
        :items="statusItems"
        label="Статус"
        variant="solo"
        density="compact"
        active
        hide-details
        @update:model-value="onProcessedChange"
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
        :items-length="total"
        :loading="busy"
        :item-value="rowKey"
        :items-per-page-options="pageSizeItems"
        items-per-page-text="Обращений на странице"
        page-text="{0}-{1} из {2}"
        no-data-text="Обращения не найдены."
        density="compact"
        must-sort
        class="interlaced-table privacy-requests-table"
        height="var(--staff-table-height)"
        fixed-header
        @update:page="onPageChange"
        @update:items-per-page="onItemsPerPageChange"
        @update:sort-by="onSortChange"
      >
        <template #[`item.actions`]="{ item }">
          <div class="actions-container">
            <ActionButton
              :item="item"
              icon="$saveChanges"
              tooltip-text="Отметить запрос как обработанный"
              variant="blue"
              :loading="processingKey === rowKey(item)"
              :disabled="busy || Boolean(processingKey) || item.processed"
              @click="process"
            />
          </div>
        </template>
        <template #[`item.customerId`]="{ item }">
          <span class="customer-id">№ {{ item.customerId }}</span>
        </template>
        <template #[`item.requestedAt`]="{ item }">
          {{ moscowTime(item.requestedAt) }}
        </template>
        <template #[`item.processed`]="{ item }">
          <span :class="['status-pill', { inactive:item.processed }]">{{ item.processed ? 'Обработан' : 'Ожидает ручной обработки' }}</span>
        </template>
      </v-data-table-server>
    </v-card>
  </section>
</template>

<style scoped>
.privacy-requests-table { --staff-table-height:max(320px, calc(100vh - 300px)); }
.customer-id { color:#203c58; font-weight:650; }
</style>
