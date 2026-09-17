<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import StoreLogo from '../components/StoreLogo.vue'
import { normalizeProblem } from '../errors/problem.js'
import { storeAction, storeIdentity, validateStoreList, validateStoreOps } from '../storeCatalogue.js'
import { useSession } from '../stores/session.js'

const session = useSession()
const router = useRouter()
const items = ref([])
const ops = ref(null)
const status = ref('')
const busy = ref(false)
const problem = ref(null)
const revision = ref(0)
const page = ref(1)
let generation = 0
const filtered = computed(() => items.value.filter(item => status.value === '' || item.status === status.value))
const statusItems = computed(() => [{ title:'Все статусы', value:'' }, ...(ops.value?.statuses ?? []).map(item => ({ title:item.name, value:item.value }))])
const headers = [
  { title:'', key:'actions', sortable:false }, { title:'Логотип', key:'logo', sortable:false },
  { title:'Название', key:'name', sortable:false }, { title:'Статус', key:'status', sortable:false },
  { title:'На главной', key:'showOnHome', sortable:false }, { title:'Порядок', key:'displayOrder', sortable:false }
]
async function load() {
  const current = ++generation
  busy.value = true
  problem.value = null
  try {
    const catalogue = validateStoreOps(await session.storeRequest('/stores/ops'))
    if (current !== generation) return
    const data = validateStoreList(await session.storeRequest('/stores'), catalogue)
    if (current !== generation) return
    ops.value = catalogue
    items.value = data
    page.value = 1
    revision.value += 1
  } catch (value) { if (current === generation) problem.value = normalizeProblem(value) }
  finally { if (current === generation) busy.value = false }
}
async function open(path) {
  const current = generation
  try { await router.push(path) }
  catch (value) { if (current === generation) problem.value = normalizeProblem(value) }
}
function clear() { generation += 1; items.value = []; ops.value = null; problem.value = null; busy.value = false; status.value = ''; page.value = 1 }
watch(() => storeIdentity(session.user.value), clear, { flush:'sync' })
watch(status, () => { page.value = 1 })
onMounted(load)
onUnmounted(clear)
</script>
<template>
  <section class="settings staff-list">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Магазины <span class="count">{{ filtered.length }}</span>
      </h1>
      <div class="header-actions">
        <ActionButton
          icon="$refresh"
          tooltip-text="Обновить список магазинов"
          :disabled="busy"
          @click="load"
        />
        <ActionButton
          v-if="storeAction(session.user.value, ops, 'create')"
          icon="$add"
          variant="blue"
          tooltip-text="Добавить магазин"
          :disabled="busy"
          @click="open('/stores/new')"
        />
      </div>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="problem" />
    <fieldset
      class="filter-bar"
      :aria-busy="busy"
    >
      <v-select
        v-model="status"
        :disabled="busy || !ops"
        class="filter-control"
        label="Статус"
        :items="statusItems"
        variant="solo"
        density="compact"
        active
        hide-details
      />
    </fieldset>
    <v-card class="table-card">
      <v-data-table
        v-model:page="page"
        :headers="headers"
        :items="filtered"
        :loading="busy"
        item-value="id"
        :items-per-page="10"
        :items-per-page-options="[10,25,50,100]"
        items-per-page-text="Магазинов на странице"
        page-text="{0}-{1} из {2}"
        no-data-text="Магазины не найдены."
        density="compact"
        class="interlaced-table"
        height="var(--staff-table-height)"
        fixed-header
      >
        <template #[`item.actions`]="{ item }">
          <ActionButton
            :icon="storeAction(session.user.value, ops, 'edit') ? '$edit' : '$eye'"
            tooltip-text="Открыть магазин"
            :disabled="busy"
            @click="open(`/stores/${item.id}`)"
          />
        </template>
        <template #[`item.logo`]="{ item }">
          <StoreLogo
            :url="item.logoUrl"
            :revision="revision"
          />
        </template>
        <template #[`item.status`]="{ item }">
          <span :class="['status-pill', { inactive:item.status === 0 }]">{{ ops.statuses.find(status => status.value === item.status).name }}</span>
        </template>
        <template #[`item.showOnHome`]="{ item }">
          {{ item.showOnHome ? 'Да' : 'Нет' }}
        </template>
      </v-data-table>
    </v-card>
  </section>
</template>
