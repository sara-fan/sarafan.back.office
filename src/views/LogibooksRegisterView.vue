<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import ListFilterBar from '../components/ListFilterBar.vue'
import LogibooksGoodsTable from '../components/LogibooksGoodsTable.vue'
import LogibooksRegisterFields from '../components/LogibooksRegisterFields.vue'
import LogibooksReconcileDialog from '../components/LogibooksReconcileDialog.vue'
import { createInternalProblem } from '../errors/problem.js'
import { useSession } from '../stores/session.js'
import { useStaffRequest } from '../useStaffRequest.js'
import { useListSearchDebounce } from '../listSearch.js'
import { PAGE_SIZE_OPTIONS, readViewState, writeViewState } from '../viewState.js'
import { LOGIBOOKS_ROOT, validateLogibooksOps, validateOperation, validateRows, validateRegisterDetails, operationLabel, canManageLogibooksRegisters, canReconcileLogibooksRegister } from '../logibooks.js'
const route = useRoute(), session = useSession()
const defaults = { page:1, pageSize:25, sortBy:[{ key:'rowNumber', order:'asc' }], filters:{ search:'' } }
const preferences = () => ({ userId:session.user.value?.id, viewKey:'logibooks-register-rows', memory:session.viewStateMemory,
  defaults, allowedSortKeys:['rowNumber'], normalizeFilters:value => value && typeof value.search === 'string' && value.search.length <= 200 ? { search:value.search } : null })
const restored = readViewState(preferences())
const state = ref(restored.state), preferenceProblem = ref(restored.unavailable ? createInternalProblem('viewPreferencesUnavailable') : null)
const operation = ref(null), details = ref(null), ops = ref(null), rows = ref([]), rowsLoaded = ref(false), total = ref(0), reconciling = ref(null)
let timer = null, active = true, generation = 0
function stop() { globalThis.clearTimeout(timer); timer = null }
function reset() { generation++; rowsLoaded.value = false; stop(); operation.value = null; details.value = null; ops.value = null; rows.value = []; total.value = 0; reconciling.value = null }
const task = useStaffRequest(session, reset), rowTask = useStaffRequest(session, reset)
const { busy, problem } = task
const busyRows = rowTask.busy
const visibleProblem = computed(() => problem.value ?? rowTask.problem.value ?? preferenceProblem.value ?? operation.value?.failure)
const canReconcile = computed(() => canManageLogibooksRegisters(session.user.value, ops.value)
  && canReconcileLogibooksRegister(operation.value))
function persist() { if (!writeViewState({ ...preferences(), state:state.value })) preferenceProblem.value = createInternalProblem('viewPreferencesUnavailable') }
const debounce = useListSearchDebounce(rowTask.invalidate, loadRows)
function loadRows() {
  debounce.cancel()
  rowsLoaded.value = false
  const id = route.params.id, current = state.value.page, size = state.value.pageSize, search = state.value.filters.search.trim()
  const query = new globalThis.URLSearchParams({ page:current, pageSize:size, search })
  return rowTask.run(async () => validateRows(await session.logibooksRequest(LOGIBOOKS_ROOT + '/' + id + '/rows?' + query), current, size, search),
    async value => {
      if (current > Math.max(1, value.pagination.totalPages)) {
        state.value.page = Math.max(1, value.pagination.totalPages); persist(); return loadRows()
      }
      rows.value = value.items; rowsLoaded.value = true; total.value = value.pagination.totalCount
    })
}
async function load() {
  const requested = ++generation
  stop()
  const id = route.params.id
  await task.run(async () => {
    const metadata = ops.value ?? validateLogibooksOps(await session.logibooksRequest(LOGIBOOKS_ROOT + '/ops'))
    const result = await validateOperation(await session.logibooksRequest(LOGIBOOKS_ROOT + '/' + id), id)
    const register = details.value ?? validateRegisterDetails(await session.logibooksRequest(LOGIBOOKS_ROOT + '/' + id + '/details'), result.fileName)
    return { metadata, operation:result, register }
  }, async value => {
    const changed = operation.value?.version !== value.operation.version
    ops.value = value.metadata; details.value = value.register
    if (changed) operation.value = value.operation
    if (changed || !rowsLoaded.value) await loadRows()
  })
  if (active && requested === generation && !reconciling.value && operation.value && ['Submitting', 'Unknown'].includes(operation.value.state) && !operation.value.investigationRequired)
    timer = globalThis.setTimeout(load, 2000)
}
function search(value) { rowTask.invalidate(); state.value.filters.search = String(value ?? '').slice(0, 200); state.value.page = 1; persist(); debounce.schedule() }
function paging(key, value) {
  if (busyRows.value || !Number.isInteger(value) || value < 1 || key === 'pageSize' && !PAGE_SIZE_OPTIONS.includes(value)) return
  state.value[key] = value; if (key === 'pageSize') state.value.page = 1
  persist(); loadRows()
}
function reconcile(row) { if (canReconcile.value && !busy.value && !busyRows.value) { stop(); reconciling.value = row } }
function close() { reconciling.value = null; load() }
watch(() => route.params.id, () => { task.invalidate(); rowTask.invalidate(); reset(); state.value.page = 1; load() })
onMounted(load)
onUnmounted(() => { active = false; stop(); debounce.cancel() })
</script>
<template>
  <section class="settings staff-list">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        {{ operation?.fileName ?? 'Таможенный реестр' }}
      </h1>
      <div class="header-actions">
        <ActionButton
          icon="$refresh"
          tooltip-text="Обновить реестр"
          :disabled="busy"
          @click="load"
        />
      </div>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="visibleProblem" />
    <template v-if="operation && ops">
      <p>
        {{ operationLabel(operation.state, ops) }}. Создано: {{ operation.created }}; отклонено: {{ operation.rejected }};
        результат неизвестен: {{ operation.unresolved }}. Таможенный реестр: {{ operation.registerId ?? '—' }}.
      </p>
      <LogibooksRegisterFields
        v-if="details"
        :value="details"
        readonly
      />
      <ListFilterBar
        :search="state.filters.search"
        search-id="logibooks-rows-search"
        @update:search="search"
      />
      <LogibooksGoodsTable
        :rows="rows"
        :currency-symbol="ops.unitPriceCurrency.symbol"
        :total="total"
        :page="state.page"
        :page-size="state.pageSize"
        :busy="busyRows"
        results
        :can-reconcile="canReconcile"
        @page="paging('page', $event)"
        @page-size="paging('pageSize', $event)"
        @reconcile="reconcile"
      />
      <LogibooksReconcileDialog
        :row="reconciling"
        :operation="operation"
        :ops="ops"
        @cancel="close"
        @saved="close"
        @refresh="close"
      />
    </template>
  </section>
</template>
