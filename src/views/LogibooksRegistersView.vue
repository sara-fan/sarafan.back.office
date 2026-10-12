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
import { createInternalProblem } from '../errors/problem.js'
import { useSession } from '../stores/session.js'
import { useStaffRequest } from '../useStaffRequest.js'
import { useListSearchDebounce } from '../listSearch.js'
import { PAGE_SIZE_OPTIONS, readViewState, writeViewState } from '../viewState.js'
import { LOGIBOOKS_ROOT, LOGIBOOKS_SORT, normalizeLogibooksFilters, validateLogibooksOps, validateOperationPage, operationLabel } from '../logibooks.js'
const session = useSession(), router = useRouter()
const defaults = { page:1, pageSize:25, sortBy:[{ key:'createdAt', order:'desc' }], filters:{ search:'', state:'' } }
const preferences = () => ({ userId:session.user.value?.id, viewKey:'logibooks-registers', memory:session.viewStateMemory,
  defaults, allowedSortKeys:LOGIBOOKS_SORT, normalizeFilters:normalizeLogibooksFilters })
const restored = readViewState(preferences())
const state = ref(restored.state), rows = ref([]), total = ref(0), ops = ref(null)
const preferenceProblem = ref(restored.unavailable ? createInternalProblem('viewPreferencesUnavailable') : null)
const task = useStaffRequest(session, () => { rows.value = []; total.value = 0; ops.value = null })
const { busy, problem } = task
const headers = [{ title:'Название', key:'fileName' }, { title:'Состояние', key:'state' }, { title:'Создан', key:'createdAt' },
  { title:'Всего', key:'total', sortable:false }, { title:'Создано', key:'created', sortable:false },
  { title:'Отклонено', key:'rejected', sortable:false }, { title:'Неизвестно', key:'unresolved', sortable:false },
  { title:'Таможенный реестр', key:'registerId', sortable:false }]
const states = computed(() => [{ title:'Все состояния', value:'' }, ...(ops.value?.states ?? []).map(x => ({ title:x.name, value:x.routeAlias }))])
const debounce = useListSearchDebounce(task.invalidate, load)
function persist() { if (!writeViewState({ ...preferences(), state:state.value })) preferenceProblem.value = createInternalProblem('viewPreferencesUnavailable') }
function load() {
  debounce.cancel()
  const requested = JSON.parse(JSON.stringify(state.value))
  return task.run(async () => {
    const metadata = validateLogibooksOps(await session.logibooksRequest(LOGIBOOKS_ROOT + '/ops'))
    const query = new globalThis.URLSearchParams({ page:requested.page, pageSize:requested.pageSize,
      sortBy:requested.sortBy[0].key, sortOrder:requested.sortBy[0].order, search:requested.filters.search.trim(), state:requested.filters.state })
    return { metadata, page:await validateOperationPage(await session.logibooksRequest(LOGIBOOKS_ROOT + '?' + query), requested) }
  }, async value => {
    ops.value = value.metadata
    const lastPage = Math.max(1, value.page.pagination.totalPages)
    if (requested.page > lastPage) { state.value.page = lastPage; persist(); return load() }
    rows.value = value.page.items; total.value = value.page.pagination.totalCount
  })
}
function filter(key, value) {
  task.invalidate(); state.value.filters[key] = key === 'search' ? String(value ?? '').slice(0, 200) : value
  state.value.page = 1; persist()
  if (key === 'search') debounce.schedule()
  else load()
}
function paging(key, value) {
  if (busy.value || !Number.isInteger(value) || value < 1 || key === 'pageSize' && !PAGE_SIZE_OPTIONS.includes(value)) return
  state.value[key] = value; if (key === 'pageSize') state.value.page = 1
  persist(); load()
}
function sort(value) {
  if (busy.value || value.length !== 1 || !LOGIBOOKS_SORT.includes(value[0].key) || !['asc', 'desc'].includes(value[0].order)) return
  state.value.sortBy = value; state.value.page = 1; persist(); load()
}
function open(item) { return task.run(() => router.push(LOGIBOOKS_ROOT + '/' + item.id)) }
onMounted(load)
onUnmounted(() => debounce.cancel())
</script>
<template>
  <section class="settings staff-list">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Таможенные реестры <span class="count">{{ total }}</span>
      </h1>
      <div class="header-actions">
        <ActionButton
          icon="$refresh"
          tooltip-text="Обновить реестры"
          :disabled="busy"
          @click="load"
        />
      </div>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="problem ?? preferenceProblem" />
    <ListFilterBar
      :search="state.filters.search"
      search-id="logibooks-search"
      @update:search="filter('search', $event)"
    >
      <v-select
        :model-value="state.filters.state"
        :items="states"
        class="filter-control"
        label="Состояние"
        variant="solo"
        density="compact"
        hide-details
        :disabled="busy"
        @update:model-value="filter('state', $event)"
      />
    </ListFilterBar>
    <v-card class="table-card">
      <v-data-table-server
        :headers="headers"
        :items="rows"
        :items-length="total"
        :loading="busy"
        item-value="id"
        :page="state.page"
        :items-per-page="state.pageSize"
        :sort-by="state.sortBy"
        :items-per-page-options="PAGE_SIZE_OPTIONS"
        density="compact"
        must-sort
        class="interlaced-table"
        height="var(--staff-table-height)"
        fixed-header
        no-data-text="Реестры не найдены."
        items-per-page-text="Реестров на странице"
        page-text="{0}-{1} из {2}"
        @update:page="paging('page', $event)"
        @update:items-per-page="paging('pageSize', $event)"
        @update:sort-by="sort"
      >
        <template #[`item.fileName`]="{ item }">
          <button
            class="text-link"
            @click="open(item)"
          >
            <ListText :text="item.fileName" />
          </button>
        </template>
        <template #[`item.state`]="{ item }">
          <ListText :text="operationLabel(item.state, ops)" />
        </template>
        <template #[`item.createdAt`]="{ item }">
          <ListText :text="moscowTime(item.createdAt)" />
        </template>
        <template
          v-for="key in ['total', 'created', 'rejected', 'unresolved', 'registerId']"
          :key="key"
          #[`item.${key}`]="{ item }"
        >
          <ListText :text="item[key] ?? '—'" />
        </template>
      </v-data-table-server>
    </v-card>
  </section>
</template>
