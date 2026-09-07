<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { AUDIT_ACTIONS, moscowDate, moscowTime } from '../consentFormatting.js'
import { createInternalProblem, normalizeProblem } from '../errors/problem.js'
import { useSession } from '../stores/session.js'

const session = useSession()
const router = useRouter()
const rows = ref([])
const ops = ref(null)
const total = ref(0)
const page = ref(1)
const pageSize = ref(25)
const search = ref('')
const kind = ref(null)
const action = ref('')
const busy = ref(false)
const problem = ref(null)
let loadVersion = 0
const kindItems = computed(() => [{ title:'Все типы', value:null }, ...(ops.value?.kinds || []).map(item => ({ value:item.value, title:item.name }))])
const kindName = value => ops.value?.kinds.find(item => item.value === value)?.name
const actionItems = [{ title:'Все действия', value:'' }, ...Object.entries(AUDIT_ACTIONS).map(([value,title]) => ({ value,title }))]
const headers = [
  { title:'Дата и время', key:'at', sortable:false, width:'170px' },
  { title:'Действие', key:'action', sortable:false, width:'120px' },
  { title:'Документ', key:'title', sortable:false },
  { title:'Версия', key:'displayVersion', sortable:false, width:'120px' },
  { title:'Дата начала действия', key:'effectiveAt', sortable:false, width:'170px' },
  { title:'Администратор', key:'actorName', sortable:false, width:'220px' }
]

async function load() {
  const version = ++loadVersion
  busy.value = true
  problem.value = null
  const query = new globalThis.URLSearchParams({ page:String(page.value), pageSize:String(pageSize.value) })
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
    if (!Array.isArray(result?.items) || result.items.some(item => !Number.isInteger(item.kind) || !kindName(item.kind))) throw createInternalProblem('protocolError')
    rows.value = result.items
    total.value = result.total
  } catch (value) {
    if (version !== loadVersion) return
    rows.value = []
    total.value = 0
    problem.value = normalizeProblem(value)
  } finally {
    if (version === loadVersion) busy.value = false
  }
}

function previousPage() {
  if (page.value > 1) page.value -= 1
}

function nextPage() {
  if (page.value * pageSize.value < total.value) page.value += 1
}

watch([search, kind, action], () => {
  page.value = 1
  load()
})
watch([page, pageSize], load)
onMounted(load)
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
    <PageAlertRegion :problem="problem" />
    <fieldset
      class="filter-bar"
      :disabled="busy"
    >
      <v-text-field
        v-model="search"
        class="filter-control filter-search"
        label="Поиск по документу, версии или идентификатору"
        prepend-inner-icon="$search"
        variant="solo"
        density="compact"
        active
        hide-details
        clearable
      />
      <v-select
        v-model="kind"
        class="filter-control"
        :items="kindItems"
        label="Тип документа"
        variant="solo"
        density="compact"
        active
        hide-details
      />
      <v-select
        v-model="action"
        class="filter-control"
        :items="actionItems"
        label="Действие"
        variant="solo"
        density="compact"
        active
        hide-details
      />
    </fieldset>
    <div
      v-if="problem"
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
        :headers="headers"
        :items="rows"
        :loading="busy"
        :items-per-page="-1"
        item-value="id"
        hide-default-footer
        no-data-text="Записи журнала не найдены."
        density="compact"
        class="interlaced-table audit-table"
        height="var(--staff-table-height)"
        fixed-header
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
      </v-data-table>
      <footer class="audit-pagination">
        <ActionButton
          icon="$previous"
          tooltip-text="Предыдущая страница"
          :disabled="busy || page <= 1"
          @click="previousPage"
        />
        <span>Страница {{ page }} · {{ rows.length }} из {{ total }}</span>
        <ActionButton
          icon="$next"
          tooltip-text="Следующая страница"
          :disabled="busy || page * pageSize >= total"
          @click="nextPage"
        />
      </footer>
    </v-card>
  </section>
</template>

<style scoped>
.audit-table { --staff-table-height:max(320px, calc(100vh - 390px)); }
.document-title { display:block; color:#203c58; font-weight:650; }
.document-kind, .document-id { display:block; margin-top:2px; color:#6b7f92; font-size:11px; }
.document-id { font-family:ui-monospace, SFMono-Regular, Consolas, monospace; }
.audit-pagination { display:flex; align-items:center; justify-content:flex-end; gap:10px; min-height:48px; padding:6px 12px; color:#526a80; font-size:12px; border-top:1px solid #dbe5ee; }
</style>
