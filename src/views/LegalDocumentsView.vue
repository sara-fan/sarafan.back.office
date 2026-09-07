<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { moscowDate } from '../consentFormatting.js'
import { createInternalProblem, normalizeProblem } from '../errors/problem.js'
import { useSession } from '../stores/session.js'

const session = useSession()
const router = useRouter()
const rows = ref([])
const ops = ref(null)
const search = ref('')
const kind = ref(null)
const page = ref(1)
const itemsPerPage = ref(10)
const sortBy = ref([{ key:'title', order:'asc' }])
const busy = ref(false)
const problem = ref(null)
const kindItems = computed(() => [{ title:'Все типы', value:null }, ...(ops.value?.kinds || []).map(item => ({ value:item.value, title:item.name }))])
const kindName = value => ops.value?.kinds.find(item => item.value === value)?.name
const headers = [
  { title:'', key:'actions', sortable:false, width:'64px' },
  { title:'Документ', key:'title' },
  { title:'Версия', key:'displayVersion' },
  { title:'Дата начала действия', key:'effectiveAt' }
]
const filtered = computed(() => rows.value.map(document => ({
  ...document,
  title:document.title || kindName(document.kind),
  kindTitle:kindName(document.kind)
})).filter(document => {
  const text = `${document.title} ${document.kindTitle} ${document.displayVersion}`.toLocaleLowerCase('ru')
  return text.includes(search.value.trim().toLocaleLowerCase('ru')) &&
    (kind.value === null || document.kind === kind.value)
}))

watch([search, kind], () => { page.value = 1 })

async function load() {
  busy.value = true
  problem.value = null
  try {
    const [catalogue, documents] = await Promise.all([session.getLegalDocumentOps(), session.consentRequest('/legal-documents')])
    ops.value = catalogue
    if (!Array.isArray(documents) || documents.some(document => !Number.isInteger(document.kind) || !kindName(document.kind))) throw createInternalProblem('protocolError')
    rows.value = documents
  } catch (value) { rows.value = []; page.value = 1; problem.value = normalizeProblem(value) }
  finally { busy.value = false }
}
onMounted(load)
</script>

<template>
  <section class="settings table-wide">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Правовые документы <span class="count">{{ rows.length }}</span>
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
          tooltip-text="Обновить список"
          :disabled="busy"
          @click="load"
        />
        <ActionButton
          icon="$audit"
          tooltip-text="Открыть журнал действий"
          :disabled="busy"
          @click="router.push('/legal-documents/audit')"
        />
        <ActionButton
          icon="$add"
          icon-size="28"
          tooltip-text="Создать новый документ"
          variant="blue"
          :disabled="busy"
          @click="router.push('/legal-documents/new')"
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
        id="legal-document-search"
        v-model="search"
        class="filter-control filter-search"
        label="Поиск по документу или версии"
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
        v-model:page="page"
        v-model:items-per-page="itemsPerPage"
        v-model:sort-by="sortBy"
        :headers="headers"
        :items="filtered"
        :loading="busy"
        item-value="id"
        items-per-page-text="Документов на странице"
        page-text="{0}-{1} из {2}"
        no-data-text="Правовые документы не найдены."
        density="compact"
        class="interlaced-table legal-documents-table"
        height="var(--staff-table-height)"
        fixed-header
      >
        <template #[`item.actions`]="{ item }">
          <div class="actions-container">
            <ActionButton
              :item="item"
              icon="$edit"
              tooltip-text="Открыть документ"
              :disabled="busy"
              @click="router.push(`/legal-documents/${$event.id}`)"
            />
          </div>
        </template>
        <template #[`item.title`]="{ item }">
          <span class="document-title">{{ item.title }}</span>
          <span class="document-kind">{{ item.kindTitle }}</span>
        </template>
        <template #[`item.effectiveAt`]="{ item }">
          {{ moscowDate(item.effectiveAt) }}
        </template>
      </v-data-table>
    </v-card>
  </section>
</template>

<style scoped>
.legal-documents-table { --staff-table-height:max(320px, calc(100vh - 350px)); }
.document-title { display:block; color:#203c58; font-weight:650; }
.document-kind { display:block; margin-top:2px; color:#6b7f92; font-size:11px; }
</style>
