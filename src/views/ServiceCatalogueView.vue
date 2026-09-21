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
import { normalizeProblem } from '../errors/problem.js'
import {
  SERVICE_CATALOGUE_CONFLICT,
  SERVICE_CATALOGUE_VERSION_INVALID,
  formatServiceCatalogueAvailability,
  formatServiceCatalogueParameters,
  serviceCatalogueAction,
  serviceCatalogueIdentity,
  validateServiceCatalogueList
} from '../serviceCatalogue.js'
import { useSession } from '../stores/session.js'

const session = useSession()
const router = useRouter()
const items = ref([])
const ops = ref(null)
const search = ref('')
const service = ref('')
const priceMethod = ref('')
const page = ref(1)
const busy = ref(false)
const problem = ref(null)
const pendingDelete = ref(null)
const deleteLocked = ref(false)
let generation = 0

const serviceName = value => ops.value?.services.find(item => item.value === value)?.name ?? ''
const methodName = value => ops.value?.priceMethods.find(item => item.value === value)?.name ?? ''
const serviceItems = computed(() => [{ title:'Все услуги', value:'' }, ...(ops.value?.services ?? []).map(item => ({ title:item.name, value:item.value }))])
const methodItems = computed(() => [{ title:'Все способы', value:'' }, ...(ops.value?.priceMethods ?? []).map(item => ({ title:item.name, value:item.value }))])
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('ru')
  return items.value.filter(item => (service.value === '' || item.service === service.value)
    && (priceMethod.value === '' || item.priceMethod === priceMethod.value)
    && [serviceName(item.service), methodName(item.priceMethod), formatServiceCatalogueParameters(item, ops.value), formatServiceCatalogueAvailability(item)]
      .some(value => value.toLocaleLowerCase('ru').includes(query)))
})
const headers = [
  { title:'', key:'actions', sortable:false, width:'100px' },
  { title:'Услуга', key:'service', sortable:false },
  { title:'Способ расчёта', key:'priceMethod', sortable:false },
  { title:'Параметры', key:'parameters', sortable:false },
  { title:'Период действия', key:'availability', sortable:false }
]

function cellProps({ item, column }) {
  if (column.key === 'actions') return {}
  return {
    class:'list-card-cell', tabindex:0, role:'link',
    onClick:() => { if (!busy.value) open(`/service-catalogue/${item.id}`) },
    onKeydown:event => {
      if (event.key === 'Enter' && !busy.value) { event.preventDefault(); open(`/service-catalogue/${item.id}`) }
    }
  }
}

async function load() {
  const current = ++generation
  busy.value = true
  problem.value = null
  pendingDelete.value = null
  try {
    const metadata = await session.getServiceCatalogueOps()
    if (!serviceCatalogueAction(session.user.value, metadata, 'view')) {
      if (current === generation) await router.push('/forbidden')
      return
    }
    const catalogue = validateServiceCatalogueList(await session.serviceCatalogueRequest('/service-catalogue'), metadata)
    if (current !== generation) return
    ops.value = metadata
    items.value = catalogue
    deleteLocked.value = false
    page.value = 1
  } catch (value) { if (current === generation) problem.value = normalizeProblem(value) }
  finally { if (current === generation) busy.value = false }
}

async function open(path) {
  const current = generation
  try { await router.push(path) }
  catch (value) { if (current === generation) problem.value = normalizeProblem(value) }
}

async function remove() {
  if (!pendingDelete.value || busy.value || deleteLocked.value || !serviceCatalogueAction(session.user.value, ops.value, 'delete')) return
  const target = pendingDelete.value
  pendingDelete.value = null
  const current = ++generation
  busy.value = true
  problem.value = null
  try {
    await session.serviceCatalogueRequest(`/service-catalogue/${target.id}`, {
      method:'DELETE', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ version:target.version })
    })
    if (current !== generation) return
    items.value = items.value.filter(item => item.id !== target.id)
    page.value = 1
  } catch (value) {
    if (current === generation) {
      problem.value = normalizeProblem(value)
      if ([SERVICE_CATALOGUE_CONFLICT, SERVICE_CATALOGUE_VERSION_INVALID].includes(problem.value.type)) deleteLocked.value = true
    }
  } finally { if (current === generation) busy.value = false }
}

function clear() {
  generation += 1
  items.value = []; ops.value = null; search.value = ''; service.value = ''; priceMethod.value = ''
  page.value = 1; busy.value = false; problem.value = null; pendingDelete.value = null; deleteLocked.value = false
}
watch(() => serviceCatalogueIdentity(session.user.value), clear, { flush:'sync' })
watch([search, service, priceMethod], () => { page.value = 1 })
onMounted(load)
onUnmounted(clear)
</script>

<template>
  <section class="settings staff-list">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Тарифы услуг <span class="count">{{ filtered.length }}</span>
      </h1>
      <div class="header-action-groups">
        <div class="header-actions">
          <ActionButton
            v-if="serviceCatalogueAction(session.user.value, ops, 'audit')"
            icon="$audit"
            tooltip-text="Открыть журнал изменений"
            :disabled="busy || !ops"
            @click="open('/service-catalogue/audit')"
          />
        </div>
        <div class="header-actions">
          <ActionButton
            icon="$refresh"
            tooltip-text="Обновить тарифы"
            :disabled="busy"
            @click="load"
          />
          <ActionButton
            v-if="serviceCatalogueAction(session.user.value, ops, 'create')"
            icon="$add"
            variant="blue"
            tooltip-text="Добавить тариф"
            :disabled="busy"
            @click="open('/service-catalogue/new')"
          />
        </div>
      </div>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="problem" />
    <ListFilterBar
      v-model:search="search"
      search-id="service-catalogue-search"
      :aria-busy="busy"
    >
      <v-select
        v-model="service"
        :disabled="busy || !ops"
        class="filter-control"
        label="Услуга"
        :items="serviceItems"
        variant="solo"
        density="compact"
        active
        hide-details
      />
      <v-select
        v-model="priceMethod"
        :disabled="busy || !ops"
        class="filter-control"
        label="Способ расчёта"
        :items="methodItems"
        variant="solo"
        density="compact"
        active
        hide-details
      />
    </ListFilterBar>
    <v-card class="table-card">
      <v-data-table
        v-model:page="page"
        :headers="headers"
        :cell-props="cellProps"
        :items="filtered"
        :loading="busy"
        item-value="id"
        :items-per-page="10"
        :items-per-page-options="[10,25,50,100]"
        items-per-page-text="Тарифов на странице"
        page-text="{0}-{1} из {2}"
        no-data-text="Тарифы не найдены."
        density="compact"
        class="interlaced-table"
        height="var(--staff-table-height)"
        fixed-header
      >
        <template #[`item.actions`]="{ item }">
          <div class="actions-container">
            <ActionButton
              :icon="serviceCatalogueAction(session.user.value, ops, 'edit') ? '$edit' : '$eye'"
              tooltip-text="Открыть тариф"
              :disabled="busy"
              @click="open(`/service-catalogue/${item.id}`)"
            />
            <ActionButton
              v-if="serviceCatalogueAction(session.user.value, ops, 'delete')"
              icon="$delete"
              variant="red"
              tooltip-text="Удалить тариф"
              :disabled="busy || deleteLocked"
              @click="pendingDelete = item"
            />
          </div>
        </template>
        <template #[`item.service`]="{ item }">
          <ListText :text="serviceName(item.service)" />
        </template>
        <template #[`item.priceMethod`]="{ item }">
          <ListText :text="methodName(item.priceMethod)" />
        </template>
        <template #[`item.parameters`]="{ item }">
          <ListText :text="formatServiceCatalogueParameters(item, ops)" />
        </template>
        <template #[`item.availability`]="{ item }">
          <ListText :text="formatServiceCatalogueAvailability(item)" />
        </template>
      </v-data-table>
    </v-card>
    <p
      v-if="deleteLocked"
      role="status"
    >
      Тариф изменился. Обновите список перед удалением.
    </p>
    <ConfirmDialog
      :open="!!pendingDelete"
      title="Удалить тариф?"
      :message="`Тариф услуги «${serviceName(pendingDelete?.service)}» будет удалён. Запись останется в журнале.`"
      action="Удалить тариф"
      action-icon="$delete"
      @cancel="pendingDelete = null"
      @confirm="remove"
    />
  </section>
</template>
