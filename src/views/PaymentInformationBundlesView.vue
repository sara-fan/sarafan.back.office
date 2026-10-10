<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ListFilterBar from '../components/ListFilterBar.vue'
import ListText from '../components/ListText.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { moscowTime } from '../consentFormatting.js'
import { createInternalProblem, INTERNAL_PROBLEM_TYPES, normalizeProblem } from '../errors/problem.js'
import { useSession } from '../stores/session.js'
import { can } from '../roles.js'
import { storeIdentity } from '../storeCatalogue.js'
import { useListSearchDebounce } from '../listSearch.js'
import { PAGE_SIZE_OPTIONS, readViewState, writeViewState } from '../viewState.js'
import { PAYMENT_ROOT, PAYMENT_SORT_KEYS, PAYMENT_CONFLICTS, paymentDefaults, normalizePaymentFilters, validatePaymentOps, validatePaymentPage, validatePaymentBundle } from '../paymentInformation.js'

const session = useSession(), router = useRouter()
const stateOptions = () => ({ userId:session.user.value?.id, viewKey:'payment-information-bundles', defaults:paymentDefaults, allowedSortKeys:PAYMENT_SORT_KEYS, normalizeFilters:normalizePaymentFilters, memory:session.viewStateMemory })
const restored = readViewState(stateOptions())
const state = ref(restored.state), rows = ref([]), total = ref(0), ops = ref(null), enabled = ref(null)
const busy = ref(false), mutating = ref(false), locked = ref(false), removing = ref(null), problem = ref(null)
const preferenceProblem = ref(restored.unavailable ? createInternalProblem('viewPreferencesUnavailable') : null)
const allowed = computed(() => can(session.user.value, 'managePaymentInformation') && ops.value?.canManage)
const searchDebounce = useListSearchDebounce(invalidate, load)
let generation = 0
const headers = [
  { title:'', key:'actions', sortable:false, width:220 },
  { title:'Получатель', key:'recipientName' },
  { title:'ИНН', key:'inn', width:155 }, { title:'Банк', key:'bankName' },
  { title:'Состояние', key:'state', width:145 }, { title:'Созданы', key:'createdAt', width:180 }
]
function persist() {
  if (!writeViewState({ ...stateOptions(), state:state.value })) preferenceProblem.value = createInternalProblem('viewPreferencesUnavailable')
}
function invalidate() { generation++; searchDebounce.cancel() }
async function load() {
  if (mutating.value) return
  invalidate()
  const current = generation
  if (!can(session.user.value, 'managePaymentInformation')) return
  busy.value = true; problem.value = null; removing.value = null
  const request = JSON.parse(JSON.stringify(state.value))
  try {
    const metadata = ops.value ?? validatePaymentOps(await session.paymentInformationRequest(PAYMENT_ROOT + '/ops'))
    if (current !== generation) return
    const sorting = request.sortBy[0]
    const query = new globalThis.URLSearchParams({ page:String(request.page), pageSize:String(request.pageSize), sortBy:sorting.key, sortOrder:sorting.order })
    if (request.filters.search.trim()) query.set('search', request.filters.search.trim())
    if (request.filters.state) query.set('state', request.filters.state)
    const result = validatePaymentPage(await session.paymentInformationRequest(`${PAYMENT_ROOT}?${query}`), metadata, request)
    if (current !== generation) return
    ops.value = metadata
    const last = Math.max(1, result.pagination.totalPages)
    if (request.page > last) { state.value.page = last; persist(); return load() }
    rows.value = result.items; total.value = result.pagination.totalCount; enabled.value = result.enabledBundle; locked.value = false
  } catch (value) { if (current === generation) { rows.value = []; total.value = 0; problem.value = normalizeProblem(value) } }
  finally { if (current === generation) busy.value = false }
}
function filter(key, value) {
  if (mutating.value) return
  invalidate(); state.value.filters[key] = key === 'search' ? String(value ?? '').slice(0, 200) : value
  state.value.page = 1; persist()
  if (key === 'search') searchDebounce.schedule()
  else load()
}
function page(value) { if (!mutating.value && Number.isInteger(value) && value > 0 && value !== state.value.page) { state.value.page = value; persist(); load() } }
function pageSize(value) { if (!mutating.value && PAGE_SIZE_OPTIONS.includes(value) && value !== state.value.pageSize) { state.value.pageSize = value; state.value.page = 1; persist(); load() } }
function sort(value) {
  if (mutating.value || value.length !== 1 || !PAYMENT_SORT_KEYS.includes(value[0].key) || !['asc', 'desc'].includes(value[0].order)) return
  state.value.sortBy = value; state.value.page = 1; persist(); load()
}
async function open(id = 'new') {
  const current = generation
  try { await router.push(`${PAYMENT_ROOT}/${id}`) }
  catch (value) { if (current === generation) problem.value = normalizeProblem(value) }
}
function enableTooltip(item) {
  return item.canEnable ? 'Использовать реквизиты '
    : 'Для использования заполните все реквизиты'
}
function requestDeletion(item) {
  if (allowed.value && !busy.value && !mutating.value && !locked.value && item.canDelete) removing.value = item
}
async function mutate(item, action) {
  const capability = { copy:'canCopy', enable:'canEnable', disable:'canDisable', delete:'canDelete' }[action]
  if (!allowed.value || busy.value || mutating.value || locked.value || !item[capability]) return
  invalidate()
  const current = generation
  mutating.value = true; problem.value = null
  let copied = null, completed = false
  try {
    const body = { version:item.version }
    if (action === 'enable') body.expectedEnabled = enabled.value
    const result = await session.paymentInformationRequest(`${PAYMENT_ROOT}/${item.id}${action === 'delete' ? '' : '/' + action}`, {
      method:action === 'delete' ? 'DELETE' : 'POST', body:JSON.stringify(body), headers:{ 'Content-Type':'application/json' }
    })
    if (current !== generation) return
    if (action !== 'delete') {
      const value = validatePaymentBundle(result, ops.value, action === 'copy' ? undefined : item.id)
      if ((action === 'enable' && !value.enabled) || (action === 'disable' && value.enabled)
        || (action === 'copy' && (!value.canEdit || value.enabled || value.id === item.id))) throw createInternalProblem('protocolError')
      if (action === 'copy') copied = value.id
    }
    completed = true; removing.value = null
  } catch (value) {
    if (current === generation) {
      problem.value = normalizeProblem(value); removing.value = null
      if (PAYMENT_CONFLICTS.includes(problem.value.type) || problem.value.type === INTERNAL_PROBLEM_TYPES.protocolError) locked.value = true
    }
  } finally { if (current === generation) mutating.value = false }
  if (completed && current === generation) {
    const identity = storeIdentity(session.user.value)
    const refreshing = load()
    const refreshGeneration = generation
    await refreshing
    if (copied && refreshGeneration === generation && identity === storeIdentity(session.user.value)) await open(copied)
  }
}
watch(() => storeIdentity(session.user.value), () => {
  invalidate(); rows.value = []; total.value = 0; ops.value = null; enabled.value = null; removing.value = null; busy.value = false; mutating.value = false; locked.value = false; problem.value = null
  const restored = readViewState(stateOptions()); state.value = restored.state
  preferenceProblem.value = restored.unavailable ? createInternalProblem('viewPreferencesUnavailable') : null
  load()
}, { flush:'sync' })
onMounted(load)
onUnmounted(invalidate)
</script>
<template>
  <section class="settings staff-list">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Платёжные реквизиты <span class="count">{{ total }}</span>
      </h1>
      <div class="header-actions">
        <ActionButton
          icon="$refresh"
          tooltip-text="Обновить список"
          :disabled="busy || mutating"
          @click="load"
        />
        <ActionButton
          icon="$add"
          tooltip-text="Создать реквизиты"
          :disabled="!allowed || mutating"
          @click="open()"
        />
      </div>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="problem ?? preferenceProblem" />
    <p
      v-if="locked"
      role="status"
    >
      Данные изменились. Обновите список перед следующим действием.
    </p>
    <ListFilterBar
      :search="state.filters.search"
      search-id="payment-information-search"
      :aria-busy="busy"
      :disabled="mutating"
      @update:search="filter('search', $event)"
    >
      <v-select
        :model-value="state.filters.state"
        :items="[{ title:'Все состояния', value:null }, ...(ops?.states ?? []).map(item => ({ title:item.name, value:item.value }))]"
        label="Состояние"
        :disabled="mutating || !ops"
        class="filter-control"
        variant="solo"
        density="compact"
        hide-details
        @update:model-value="filter('state', $event)"
      />
    </ListFilterBar>
    <v-card class="table-card">
      <v-data-table-server
        :headers="headers"
        :items="rows"
        :items-length="total"
        :page="state.page"
        :items-per-page="state.pageSize"
        :sort-by="state.sortBy"
        :loading="busy || mutating"
        item-value="id"
        :items-per-page-options="PAGE_SIZE_OPTIONS"
        items-per-page-text="Реквизитов на странице"
        page-text="{0}-{1} из {2}"
        no-data-text="Реквизиты не найдены."
        density="compact"
        must-sort
        class="interlaced-table payment-table"
        height="var(--staff-table-height)"
        fixed-header
        @update:page="page"
        @update:items-per-page="pageSize"
        @update:sort-by="sort"
      >
        <template #[`item.actions`]="{ item }">
          <div class="row-actions">
            <ActionButton
              :icon="item.canEdit ? '$edit' : '$eye'"
              :tooltip-text="item.canEdit ? 'Редактировать реквизиты' : 'Открыть реквизиты'"
              :disabled="mutating"
              @click="open(item.id)"
            />
            <ActionButton
              v-if="item.canCopy"
              icon="$copy"
              tooltip-text="Копировать в новый черновик"
              :disabled="busy || mutating || locked || !allowed"
              @click="mutate(item, 'copy')"
            />
            <ActionButton
              v-if="!item.enabled"
              icon="$enable"
              :tooltip-text="enableTooltip(item)"
              :disabled="!item.canEnable || busy || mutating || locked || !allowed"
              @click="mutate(item, 'enable')"
            />
            <ActionButton
              v-else
              icon="$disable"
              tooltip-text="Прекратить использование"
              :disabled="busy || mutating || locked || !allowed"
              @click="mutate(item, 'disable')"
            />
            <ActionButton
              icon="$delete"
              :tooltip-text="item.canDelete ? 'Удалить реквизиты' : 'Перед удалением прекратите использование'"
              :disabled="!item.canDelete || busy || mutating || locked || !allowed"
              @click="requestDeletion(item)"
            />
          </div>
        </template>
        <template #[`item.recipientName`]="{ item }">
          <ListText :text="item.information.recipientName ?? '—'" />
        </template>
        <template #[`item.inn`]="{ item }">
          <ListText :text="item.information.inn ?? '—'" />
        </template>
        <template #[`item.bankName`]="{ item }">
          <ListText :text="item.information.bankName ?? '—'" />
        </template>
        <template #[`item.state`]="{ item }">
          <ListText :text="ops.states.find(state => state.value === item.state).name" />
        </template>
        <template #[`item.createdAt`]="{ item }">
          <ListText :text="moscowTime(item.createdAt)" />
        </template>
      </v-data-table-server>
    </v-card>
    <ConfirmDialog
      :open="!!removing"
      :busy="mutating"
      title="Удалить реквизиты?"
      message="Реквизиты будут удалены без возможности восстановления."
      action="Удалить"
      action-icon="$delete"
      action-variant="red"
      @cancel="removing = null"
      @confirm="mutate(removing, 'delete')"
    />
  </section>
</template>
<style scoped>
.payment-table :deep(> .v-table__wrapper > table) { min-width:1030px; table-layout:fixed; }
.row-actions { display:flex; gap:2px; }
</style>
