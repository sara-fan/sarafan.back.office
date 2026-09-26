<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import ListText from '../components/ListText.vue'
import ListFilterBar from '../components/ListFilterBar.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import OrderHistoryDetails from '../components/OrderHistoryDetails.vue'
import { moscowTime } from '../consentFormatting.js'
import { createInternalProblem, normalizeProblem } from '../errors/problem.js'
import { useSession } from '../stores/session.js'
import { validatePricingOps } from '../orderPricing.js'
import { HISTORY_SORT_KEYS, historyDefaults, normalizeHistoryFilters, validateHistoryOps, historyItemIsValid, validateHistoryDetail, historyAreas } from '../orderHistory.js'
import { PAGE_SIZE_OPTIONS, isPageResult, readViewState, writeViewState } from '../viewState.js'

const session = useSession(), route = useRoute(), router = useRouter()
const number = computed(() => route.params.orderNumber)
const stateOptions = () => ({ userId:session.user.value?.id, viewKey:'order-history', defaults:historyDefaults, allowedSortKeys:HISTORY_SORT_KEYS, normalizeFilters:normalizeHistoryFilters, memory:session.viewStateMemory })
const restored = readViewState(stateOptions())
if (restored.state.filters.orderNumber !== number.value) restored.state.page = 1
restored.state.filters.orderNumber = number.value
const state = ref(restored.state), rows = ref([]), total = ref(0), busy = ref(false), problem = ref(null)
const preferenceProblem = ref(restored.unavailable ? createInternalProblem('viewPreferencesUnavailable') : null)
const ops = ref(null), orderOps = ref(null), pricingOps = ref(null), expanded = ref([]), details = ref({}), detailProblems = ref({}), detailBusy = ref({})
let generation = 0, searchTimer = null
const headers = [{ title:'', key:'data-table-expand', sortable:false, width:'56px' }, { title:'Дата и время', key:'timestamp', width:'180px' },
  { title:'Событие', key:'event', width:'220px' }, { title:'Исполнитель', key:'actor', width:'220px' }, { title:'Изменения', key:'summary', sortable:false }]
const choices = (key, all) => [{ title:all, value:null }, ...(ops.value?.[key] ?? []).map(item => ({ title:item.name, value:item.value }))]
const kind = value => ops.value.kinds.find(item => item.value === value).name
function persist() {
  if (!writeViewState({ ...stateOptions(), state:state.value })) preferenceProblem.value = createInternalProblem('viewPreferencesUnavailable')
}
function invalidate() {
  generation++
  if (searchTimer) globalThis.clearTimeout(searchTimer)
  searchTimer = null
  expanded.value = []; details.value = {}; detailProblems.value = {}; detailBusy.value = {}
}
async function load() {
  invalidate()
  const current = generation
  if (!session.user.value) return
  busy.value = true; problem.value = null
  const request = JSON.parse(JSON.stringify(state.value))
  try {
    if (!ops.value) {
      const [catalogue, order, price] = await Promise.all([session.orderRequest(`/orders/${number.value}/history/ops`), session.getOrderOps(), session.orderRequest('/orders/pricing/ops')])
      if (current !== generation) return
      ops.value = validateHistoryOps(catalogue); orderOps.value = order; pricingOps.value = validatePricingOps(price)
    }
    const sorting = request.sortBy[0]
    const query = new globalThis.URLSearchParams({ page:String(request.page), pageSize:String(request.pageSize), sortBy:sorting.key, sortOrder:sorting.order })
    for (const [key, value] of Object.entries(request.filters)) if (key !== 'orderNumber' && value !== null && value !== '') query.set(key, typeof value === 'string' ? value.trim() : String(value))
    const result = await session.orderRequest(`/orders/${number.value}/history?${query}`)
    if (current !== generation) return
    if (!isPageResult(result, HISTORY_SORT_KEYS, item => historyItemIsValid(item, ops.value))
      || new Set(result.items.map(item => item.eventKey)).size !== result.items.length
      || result.pagination.currentPage !== request.page || result.pagination.pageSize !== request.pageSize
      || result.sorting.sortBy !== sorting.key || result.sorting.sortOrder !== sorting.order
      || (result.search ?? '') !== request.filters.search.trim()
      || result.area !== request.filters.area || result.actorType !== request.filters.actorType
      || (result.from ?? '') !== request.filters.from || (result.to ?? '') !== request.filters.to) throw createInternalProblem('protocolError')
    const lastPage = Math.max(1, result.pagination.totalPages)
    if (request.page > lastPage) { state.value.page = lastPage; persist(); return load() }
    rows.value = result.items; total.value = result.pagination.totalCount
  } catch (value) { if (current === generation) { rows.value = []; total.value = 0; problem.value = normalizeProblem(value) } }
  finally { if (current === generation) busy.value = false }
}
function filter(key, value) {
  invalidate()
  state.value.filters[key] = key === 'search' ? String(value ?? '').slice(0, 200) : value
  state.value.page = 1
  persist()
  if (key === 'search') searchTimer = globalThis.setTimeout(load, 300)
  else load()
}
function page(value) { if (Number.isInteger(value) && value > 0 && value !== state.value.page) { state.value.page = value; persist(); load() } }
function pageSize(value) { if (PAGE_SIZE_OPTIONS.includes(value) && value !== state.value.pageSize) { state.value.pageSize = value; state.value.page = 1; persist(); load() } }
function sort(value) {
  if (value.length !== 1 || !HISTORY_SORT_KEYS.includes(value[0].key) || !['asc', 'desc'].includes(value[0].order)) return
  state.value.sortBy = value; state.value.page = 1; persist(); load()
}
async function loadDetail(row) {
  const key = row.eventKey, current = generation
  if (detailBusy.value[key]) return
  detailBusy.value[key] = true; delete detailProblems.value[key]
  try {
    const result = await session.orderRequest(`/orders/${number.value}/history/${key}`)
    if (current === generation) details.value[key] = validateHistoryDetail(result, row, ops.value, orderOps.value, pricingOps.value)
  } catch (value) { if (current === generation) detailProblems.value[key] = normalizeProblem(value) }
  finally { if (current === generation) detailBusy.value[key] = false }
}
function toggle(row) {
  const key = row.eventKey
  if (expanded.value.includes(key)) expanded.value = expanded.value.filter(value => value !== key)
  else { expanded.value.push(key); if (!details.value[key]) loadDetail(row) }
}
async function back() {
  try { await router.push(`/orders/${number.value}`) }
  catch (value) { problem.value = normalizeProblem(value) }
}
watch(() => JSON.stringify([session.user.value?.id, session.user.value?.roles]), () => {
  invalidate(); rows.value = []; total.value = 0; ops.value = null; orderOps.value = null; pricingOps.value = null; problem.value = null; busy.value = false
  const restored = readViewState(stateOptions()); state.value = restored.state
  if (state.value.filters.orderNumber !== number.value) state.value.page = 1
  state.value.filters.orderNumber = number.value
  preferenceProblem.value = restored.unavailable ? createInternalProblem('viewPreferencesUnavailable') : null
  load()
}, { flush:'sync' })
watch(number, () => { invalidate(); rows.value = []; total.value = 0; ops.value = null; state.value.page = 1; state.value.filters.orderNumber = number.value; persist(); load() })
onMounted(load)
onUnmounted(invalidate)
</script>
<template>
  <section class="settings staff-list">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        История заказа {{ number }} <span class="count">{{ total }}</span>
      </h1>
      <div class="header-actions">
        <ActionButton
          icon="$refresh"
          tooltip-text="Обновить историю"
          :disabled="busy"
          @click="load"
        />
        <ActionButton
          icon="$close"
          tooltip-text="Вернуться к заказу"
          @click="back"
        />
      </div>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="problem ?? preferenceProblem" />
    <ListFilterBar
      :search="state.filters.search"
      search-id="order-history-search"
      :aria-busy="busy"
      @update:search="filter('search', $event)"
    >
      <v-select
        :model-value="state.filters.area"
        :items="choices('areas', 'Все изменения')"
        label="Раздел"
        :disabled="busy || !ops"
        class="filter-control"
        variant="solo"
        density="compact"
        hide-details
        @update:model-value="filter('area', $event)"
      />
      <v-select
        :model-value="state.filters.actorType"
        :items="choices('actorTypes', 'Все исполнители')"
        label="Исполнитель"
        :disabled="busy || !ops"
        class="filter-control"
        variant="solo"
        density="compact"
        hide-details
        @update:model-value="filter('actorType', $event)"
      />
      <v-text-field
        :model-value="state.filters.from"
        label="Дата с"
        type="date"
        class="filter-control"
        variant="solo"
        density="compact"
        hide-details
        @update:model-value="filter('from', $event ?? '')"
      />
      <v-text-field
        :model-value="state.filters.to"
        label="Дата по"
        type="date"
        class="filter-control"
        variant="solo"
        density="compact"
        hide-details
        @update:model-value="filter('to', $event ?? '')"
      />
    </ListFilterBar>
    <p class="field-hint">
      Поиск по имени исполнителя. Даты и время — московские.
    </p>
    <v-card class="table-card">
      <v-data-table-server
        :headers="headers"
        :items="rows"
        :items-length="total"
        :page="state.page"
        :items-per-page="state.pageSize"
        :sort-by="state.sortBy"
        :expanded="expanded"
        :loading="busy"
        item-value="eventKey"
        :items-per-page-options="PAGE_SIZE_OPTIONS"
        items-per-page-text="Событий на странице"
        page-text="{0}-{1} из {2}"
        no-data-text="События не найдены."
        density="compact"
        must-sort
        class="interlaced-table history-table"
        height="var(--staff-table-height)"
        fixed-header
        @update:page="page"
        @update:items-per-page="pageSize"
        @update:sort-by="sort"
      >
        <template #[`item.data-table-expand`]="{ item }">
          <ActionButton
            :icon="expanded.includes(item.eventKey) ? '$collapseSection' : '$expandSection'"
            :tooltip-text="expanded.includes(item.eventKey) ? 'Свернуть событие' : 'Подробнее о событии'"
            :aria-expanded="expanded.includes(item.eventKey)"
            @click="toggle(item)"
          />
        </template>
        <template #[`item.timestamp`]="{ item }">
          <ListText :text="moscowTime(item.at)" />
        </template>
        <template #[`item.event`]="{ item }">
          <ListText :text="kind(item.kind)" />
        </template>
        <template #[`item.actor`]="{ item }">
          <ListText :text="item.actorName + (item.actorNameHistorical ? '' : ' (текущее имя)')" />
        </template>
        <template #[`item.summary`]="{ item }">
          <ListText :text="historyAreas(item.areas, ops)" />
        </template>
        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length">
              <p
                v-if="detailBusy[item.eventKey]"
                role="status"
              >
                Загрузка события…
              </p>
              <PageAlertRegion :problem="detailProblems[item.eventKey]" />
              <ActionButton
                v-if="detailProblems[item.eventKey]"
                icon="$refresh"
                tooltip-text="Повторить загрузку события"
                @click="loadDetail(item)"
              />
              <OrderHistoryDetails
                v-if="details[item.eventKey]"
                :detail="details[item.eventKey]"
                :order-ops="orderOps"
                :pricing-ops="pricingOps"
              />
            </td>
          </tr>
        </template>
      </v-data-table-server>
    </v-card>
  </section>
</template>
<style scoped>
.history-table :deep(> .v-table__wrapper > table) { min-width:900px; table-layout:fixed; }
</style>
