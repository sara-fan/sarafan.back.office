<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed, onMounted, ref, watch } from 'vue'
import ActionButton from '../components/ActionButton.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { moscowTime } from '../consentFormatting.js'
import { normalizeProblem } from '../errors/problem.js'
import { useSession } from '../stores/session.js'

const session = useSession()
const rows = ref([])
const search = ref('')
const processed = ref('')
const page = ref(1)
const itemsPerPage = ref(10)
const sortBy = ref([{ key:'processed', order:'asc' }, { key:'requestedAt', order:'desc' }])
const busy = ref(false)
const processingKey = ref('')
const problem = ref(null)
const statusItems = [
  { title:'Все статусы', value:'' },
  { title:'Ожидают обработки', value:'false' },
  { title:'Обработанные', value:'true' }
]
const headers = [
  { title:'Действия', key:'actions', sortable:false, width:'150px' },
  { title:'Покупатель', key:'customerId' },
  { title:'Время запроса', key:'requestedAt' },
  { title:'Статус', key:'processed' }
]
const rowKey = request => `${request.customerId}:${request.requestedAt}`
const filtered = computed(() => rows.value.filter(request =>
  String(request.customerId).includes(search.value.trim()) &&
  (!processed.value || String(request.processed) === processed.value)
))

watch([search, processed], () => { page.value = 1 })
async function load() {
  busy.value = true
  problem.value = null
  try { rows.value = await session.consentRequest('/consents/withdrawal-requests') }
  catch (value) { rows.value = []; page.value = 1; problem.value = normalizeProblem(value) }
  finally { busy.value = false }
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
    rows.value = rows.value.map(item => rowKey(item) === rowKey(request) ? result : item)
  } catch (value) { problem.value = normalizeProblem(value) }
  finally { processingKey.value = '' }
}
onMounted(load)
</script>

<template>
  <section class="settings table-wide">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Запросы на удаление персональных данных <span class="count">{{ rows.length }}</span>
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
    <PageAlertRegion :problem="problem" />
    <fieldset
      class="filter-bar"
      :disabled="busy || Boolean(processingKey)"
    >
      <v-text-field
        id="privacy-request-search"
        v-model="search"
        class="filter-control filter-search"
        label="Поиск по номеру покупателя"
        prepend-inner-icon="$search"
        variant="solo"
        density="compact"
        active
        hide-details
        clearable
      />
      <v-select
        v-model="processed"
        class="filter-control"
        :items="statusItems"
        label="Статус"
        variant="solo"
        density="compact"
        active
        hide-details
      />
    </fieldset>
    <div
      v-if="problem && !rows.length"
      class="empty-state"
    >
      <ActionButton
        icon="$refresh"
        label="Повторить загрузку"
        tooltip-text="Повторить загрузку"
        @click="load"
      />
    </div>
    <v-card
      v-else
      class="table-card"
    >
      <v-data-table
        v-model:page="page"
        v-model:items-per-page="itemsPerPage"
        v-model:sort-by="sortBy"
        :headers="headers"
        :items="filtered"
        :loading="busy"
        :item-value="rowKey"
        items-per-page-text="Обращений на странице"
        page-text="{0}-{1} из {2}"
        no-data-text="Обращения не найдены."
        density="compact"
        class="interlaced-table privacy-requests-table"
        height="var(--staff-table-height)"
        fixed-header
      >
        <template #[`item.actions`]="{ item }">
          <div class="actions-container">
            <ActionButton
              :item="item"
              icon="$saveChanges"
              label="Выполнить"
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
      </v-data-table>
    </v-card>
  </section>
</template>

<style scoped>
.privacy-requests-table { --staff-table-height:max(320px, calc(100vh - 300px)); }
.customer-id { color:#203c58; font-weight:650; }
</style>
