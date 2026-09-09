<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { AUDIT_ACTIONS, LEGAL_DOCUMENT_KIND, moscowDate, moscowTime } from '../consentFormatting.js'
import { createInternalProblem, normalizeProblem } from '../errors/problem.js'
import { useSession } from '../stores/session.js'
import { isPageResult, PAGE_SIZE_OPTIONS, readViewState, writeViewState } from '../viewState.js'

const VIEW_KEY = 'legal-document-audit'
const SORT_KEYS = ['at', 'action', 'title', 'displayVersion', 'effectiveAt', 'actorName']
const KIND_VALUES = Object.values(LEGAL_DOCUMENT_KIND)
const defaults = {
  page:1,
  pageSize:25,
  sortBy:[{ key:'at', order:'desc' }],
  filters:{ search:'', kind:null, action:'' }
}
const normalizeFilters = value => typeof value?.search === 'string' && value.search.length <= 200
  && (value?.kind === null || KIND_VALUES.includes(value?.kind))
  && (value?.action === '' || Object.hasOwn(AUDIT_ACTIONS, value?.action))
  ? { search:value.search, kind:value.kind, action:value.action }
  : null

const session = useSession()
const router = useRouter()
const restored = readViewState({
  userId:session.user.value?.id,
  viewKey:VIEW_KEY,
  defaults,
  allowedSortKeys:SORT_KEYS,
  normalizeFilters
})
const rows = ref([])
const ops = ref(null)
const total = ref(0)
const page = ref(restored.state.page)
const pageSize = ref(restored.state.pageSize)
const sortBy = ref(restored.state.sortBy)
const search = ref(restored.state.filters.search)
const kind = ref(restored.state.filters.kind)
const action = ref(restored.state.filters.action)
const busy = ref(false)
const problem = ref(null)
const preferenceProblem = ref(restored.unavailable ? createInternalProblem('viewPreferencesUnavailable') : null)
const visibleProblem = computed(() => problem.value ?? preferenceProblem.value)
let loadVersion = 0
let searchTimer = null

const kindItems = computed(() => [{ title:'Все типы', value:null }, ...(ops.value?.kinds || []).map(item => ({ value:item.value, title:item.name }))])
const kindName = value => ops.value?.kinds.find(item => item.value === value)?.name
const actionItems = [{ title:'Все действия', value:'' }, ...Object.entries(AUDIT_ACTIONS).map(([value,title]) => ({ value,title }))]
const pageSizeItems = PAGE_SIZE_OPTIONS.map(value => ({ value, title:String(value) }))
const headers = [
  { title:'Дата и время', key:'at', width:'170px' },
  { title:'Действие', key:'action', width:'120px' },
  { title:'Документ', key:'title' },
  { title:'Версия', key:'displayVersion', width:'120px' },
  { title:'Дата начала действия', key:'effectiveAt', width:'170px' },
  { title:'Администратор', key:'actorName', width:'220px' }
]
const auditIsValid = item => Number.isInteger(item?.id) && item.id > 0
  && typeof item.documentId === 'string'
  && Number.isInteger(item.kind)
  && Number.isInteger(item.actorId)
  && typeof item.actorName === 'string'
  && typeof item.action === 'string' && typeof item.at === 'string'
  && typeof item.title === 'string' && typeof item.displayVersion === 'string'
  && typeof item.effectiveAt === 'string'
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
      pageSize:pageSize.value,
      sortBy:[{ ...activeSort() }],
      filters:{ search:search.value, kind:kind.value, action:action.value }
    }
  })
  if (!saved && !preferenceProblem.value) preferenceProblem.value = createInternalProblem('viewPreferencesUnavailable')
}

async function load() {
  const version = ++loadVersion
  busy.value = true
  problem.value = null
  const sorting = activeSort()
  const query = new globalThis.URLSearchParams({
    page:String(page.value),
    pageSize:String(pageSize.value),
    sortBy:sorting.key,
    sortOrder:sorting.order
  })
  if (search.value.trim()) query.set('search', search.value.trim())
  if (kind.value !== null) query.set('kind', String(kind.value))
  if (action.value) query.set('action', action.value)
  try {
    const [catalogue, result] = await Promise.all([
      session.getLegalDocumentOps(),
      session.consentRequest(`/legal-documents/audit?${query}`)
    ])
    if (version !== loadVersion) return
    ops.value = catalogue
    if (!isPageResult(result, SORT_KEYS, auditIsValid)
      || result.items.some(item => !kindName(item.kind))
      || result.pagination.currentPage !== page.value
      || result.pagination.pageSize !== pageSize.value
      || result.sorting.sortBy !== sorting.key || result.sorting.sortOrder !== sorting.order
      || (result.search ?? '') !== search.value.trim()) {
      throw createInternalProblem('protocolError')
    }
    const lastPage = Math.max(1, result.pagination.totalPages)
    if (page.value > lastPage) {
      page.value = lastPage
      persistState()
      return load()
    }
    rows.value = result.items
    total.value = result.pagination.totalCount
  } catch (value) {
    if (version !== loadVersion) return
    rows.value = []
    total.value = 0
    problem.value = normalizeProblem(value)
  } finally {
    if (version === loadVersion) busy.value = false
  }
}

function onSearchInput(value) {
  search.value = String(value ?? '').slice(0, 200)
  page.value = 1
  if (searchTimer) globalThis.clearTimeout(searchTimer)
  searchTimer = globalThis.setTimeout(() => {
    searchTimer = null
    persistState()
    load()
  }, 300)
}

function onKindChange(value) {
  kind.value = value === null || KIND_VALUES.includes(value) ? value : null
  page.value = 1
  persistState()
  load()
}

function onActionChange(value) {
  action.value = value === '' || Object.hasOwn(AUDIT_ACTIONS, value) ? value : ''
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

function onPageSizeChange(value) {
  if (!PAGE_SIZE_OPTIONS.includes(value) || value === pageSize.value) return
  pageSize.value = value
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
        Журнал правовых документов <span class="count">{{ total }}</span>
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
          tooltip-text="Обновить журнал"
          :disabled="busy"
          @click="load"
        />
        <ActionButton
          icon="$close"
          tooltip-text="Вернуться к документам"
          :disabled="busy"
          @click="router.push('/legal-documents')"
        />
      </div>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="visibleProblem" />
    <fieldset
      class="filter-bar"
      :disabled="busy"
    >
      <v-text-field
        :model-value="search"
        class="filter-control filter-search"
        label="Поиск по документу, версии или идентификатору"
        prepend-inner-icon="$search"
        variant="solo"
        density="compact"
        active
        hide-details
        clearable
        @update:model-value="onSearchInput"
      />
      <v-select
        :model-value="kind"
        class="filter-control"
        :items="kindItems"
        label="Тип документа"
        variant="solo"
        density="compact"
        active
        hide-details
        @update:model-value="onKindChange"
      />
      <v-select
        :model-value="action"
        class="filter-control"
        :items="actionItems"
        label="Действие"
        variant="solo"
        density="compact"
        active
        hide-details
        @update:model-value="onActionChange"
      />
    </fieldset>
    <v-card
      v-if="!problem"
      class="table-card"
    >
      <v-data-table-server
        :page="page"
        :items-per-page="pageSize"
        :sort-by="sortBy"
        :headers="headers"
        :items="rows"
        :items-length="total"
        :loading="busy"
        :items-per-page-options="pageSizeItems"
        items-per-page-text="Записей на странице"
        page-text="{0}-{1} из {2}"
        item-value="id"
        no-data-text="Записи журнала не найдены."
        density="compact"
        must-sort
        class="interlaced-table audit-table"
        height="var(--staff-table-height)"
        fixed-header
        @update:page="onPageChange"
        @update:items-per-page="onPageSizeChange"
        @update:sort-by="onSortChange"
      >
        <template #[`item.at`]="{ item }">
          {{ moscowTime(item.at) }}
        </template>
        <template #[`item.action`]="{ item }">
          {{ AUDIT_ACTIONS[item.action] || item.action }}
        </template>
        <template #[`item.title`]="{ item }">
          <span class="document-title">{{ item.title }}</span>
          <span class="document-kind">{{ kindName(item.kind) }}</span>
          <span class="document-id">{{ item.documentId }}</span>
        </template>
        <template #[`item.effectiveAt`]="{ item }">
          {{ moscowDate(item.effectiveAt) }}
        </template>
        <template #[`item.actorName`]="{ item }">
          {{ item.actorName || `ID ${item.actorId}` }}
        </template>
      </v-data-table-server>
    </v-card>
  </section>
</template>

<style scoped>
.audit-table { --staff-table-height:max(320px, calc(100vh - 340px)); }
.document-title { display:block; color:#203c58; font-weight:650; }
.document-kind, .document-id { display:block; margin-top:2px; color:#6b7f92; font-size:11px; }
.document-id { font-family:ui-monospace, SFMono-Regular, Consolas, monospace; }
</style>
