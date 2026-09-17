<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ListText from '../components/ListText.vue'
import ActionButton from '../components/ActionButton.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ListFilterBar from '../components/ListFilterBar.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import StoreLogo from '../components/StoreLogo.vue'
import { normalizeProblem } from '../errors/problem.js'
import { STORE_CONFLICT, STORE_VERSION_INVALID, safeStoreUrl, storeAction, storeIdentity, validateStoreList, validateStoreOps } from '../storeCatalogue.js'
import { useSession } from '../stores/session.js'

const session = useSession()
const router = useRouter()
const items = ref([])
const ops = ref(null)
const status = ref('')
const search = ref('')
const busy = ref(false)
const problem = ref(null)
const revision = ref(0)
const page = ref(1)
const pendingDelete = ref(null)
const deleting = ref(false)
const deleteLocked = ref(false)
let generation = 0
const statusName = value => ops.value.statuses.find(status => status.value === value).name
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('ru')
  return items.value.filter(item => (status.value === '' || item.status === status.value)
    && [item.name, statusName(item.status), String(item.displayOrder)]
      .some(value => value.toLocaleLowerCase('ru').includes(query)))
})
const statusItems = computed(() => [{ title:'Все статусы', value:'' }, ...(ops.value?.statuses ?? []).map(item => ({ title:item.name, value:item.value }))])
const headers = [
  { title:'', key:'actions', sortable:false }, { title:'Логотип', key:'logo', sortable:false },
  { title:'Название', key:'name', sortable:false }, { title:'Статус', key:'status', sortable:false },
  { title:'Порядок', key:'displayOrder', sortable:false }
]
function storeCellProps({ item, column }) {
  if (['actions', 'logo'].includes(column.key)) return {}
  return {
    class:'list-card-cell', tabindex:0, role:'link',
    onClick:() => { if (!busy.value) open(`/stores/${item.id}`) },
    onKeydown:event => {
      if (event.key === 'Enter' && !busy.value) { event.preventDefault(); open(`/stores/${item.id}`) }
    }
  }
}
async function load() {
  if (deleting.value) return
  pendingDelete.value = null
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
    deleteLocked.value = false
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
async function remove() {
  if (!pendingDelete.value || busy.value || deleteLocked.value || !storeAction(session.user.value, ops.value, 'delete')) return
  const target = pendingDelete.value
  pendingDelete.value = null
  const current = ++generation
  busy.value = true
  deleting.value = true
  problem.value = null
  try {
    await session.storeRequest(`/stores/${target.id}`, { method:'DELETE', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ version:target.version }) })
    if (current !== generation) return
    items.value = items.value.filter(item => item.id !== target.id)
    page.value = 1
  } catch (value) {
    if (current === generation) {
      problem.value = normalizeProblem(value)
      if ([STORE_CONFLICT, STORE_VERSION_INVALID].includes(problem.value.type)) deleteLocked.value = true
    }
  } finally { if (current === generation) { busy.value = false; deleting.value = false } }
}
function clear() { generation += 1; items.value = []; ops.value = null; problem.value = null; busy.value = false; status.value = ''; search.value = ''; page.value = 1; pendingDelete.value = null; deleting.value = false; deleteLocked.value = false }
watch(() => storeIdentity(session.user.value), clear, { flush:'sync' })
watch([search, status], () => { page.value = 1 })
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
    <ListFilterBar
      v-model:search="search"
      search-id="store-search"
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
    </ListFilterBar>
    <v-card class="table-card">
      <v-data-table
        v-model:page="page"
        :headers="headers"
        :cell-props="storeCellProps"
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
        <template #[`item.name`]="{ item }">
          <ListText :text="item.name" />
        </template>
        <template #[`item.displayOrder`]="{ item }">
          <ListText :text="item.displayOrder" />
        </template>
        <template #[`item.actions`]="{ item }">
          <div class="actions-container">
            <ActionButton
              :icon="storeAction(session.user.value, ops, 'edit') ? '$edit' : '$eye'"
              tooltip-text="Открыть магазин"
              :disabled="busy"
              @click="open(`/stores/${item.id}`)"
            />
            <ActionButton
              v-if="storeAction(session.user.value, ops, 'delete')"
              icon="$delete"
              variant="red"
              tooltip-text="Удалить магазин"
              :disabled="busy || deleteLocked"
              @click="pendingDelete = item"
            />
          </div>
        </template>
        <template #[`item.logo`]="{ item }">
          <component
            :is="safeStoreUrl(item.officialUrl) && item.logoUrl ? 'a' : 'span'"
            :href="safeStoreUrl(item.officialUrl) && item.logoUrl ? item.officialUrl : undefined"
            :aria-label="`Открыть сайт магазина ${item.name}`"
            target="_blank"
            rel="noopener noreferrer"
            @click.stop
          >
            <StoreLogo
              class="store-list-logo"
              :url="item.logoUrl"
              :revision="revision"
            />
          </component>
        </template>
        <template #[`item.status`]="{ item }">
          <span :class="['status-pill', { inactive:item.status === 0 }]"><ListText :text="statusName(item.status)" /></span>
        </template>
      </v-data-table>
    </v-card>
    <p
      v-if="deleteLocked"
      role="status"
    >
      Данные магазина изменились. Обновите список перед удалением.
    </p>
    <ConfirmDialog
      :open="!!pendingDelete"
      title="Удалить магазин?"
      :message="`Магазин «${pendingDelete?.name ?? ''}» и логотип будут удалены навсегда.`"
      action="Удалить магазин"
      action-icon="$delete"
      @cancel="pendingDelete = null"
      @confirm="remove"
    />
  </section>
</template>

<style scoped>
.store-list-logo :deep(img) { display:block; width:auto; height:calc(var(--staff-table-row-height) * 0.5); max-height:calc(var(--staff-table-row-height) * 0.5); object-fit:contain; }
</style>
