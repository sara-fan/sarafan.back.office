<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed, onMounted, ref } from 'vue'
import { useSession } from '../stores/session.js'
import { DOCUMENT_KINDS, CONSENT_STATUSES, downloadBytes, moscowTime } from '../consentFormatting.js'
import { normalizeProblem, createInternalProblem } from '../errors/problem.js'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import ActionButton from '../components/ActionButton.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import LegalDocumentReader from '../components/LegalDocumentReader.vue'
const session = useSession()
const rows = ref([])
const filter = ref('')
const selected = ref(null)
const audit = ref([])
const form = ref(null)
const file = ref(null)
const busy = ref(false)
const problem = ref(null)
const confirmation = ref('')
const now = ref(true)
const effectiveDate = ref('')
const previewed = ref(false)
const kinds = Object.entries(DOCUMENT_KINDS).map(([value,title]) => ({ value,title }))
const visible = computed(() => rows.value.filter(x => !filter.value || x.kind === filter.value))
const json = (method, body) => ({ method, headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body) })
async function perform(action) {
  busy.value = true; problem.value = null
  try { await action() } catch (error) { problem.value = normalizeProblem(error) }
  finally { busy.value = false }
}
async function load() { await perform(async () => { rows.value = await session.consentRequest('/legal-documents') }) }
function create(kind = 'personal-data-consent') {
  selected.value = null; audit.value = []; file.value = null; previewed.value = false; problem.value = null
  form.value = { kind, locale:'ru', title:DOCUMENT_KINDS[kind], displayVersion:'', fileName:'', source:'', cookieCategories:[], revision:0 }
}
async function open(row) {
  await perform(async () => {
    const document = await session.consentRequest(`/legal-documents/${row.id}`)
    const history = await session.consentRequest(`/legal-documents/${row.id}/audit`)
    selected.value = document; audit.value = history; previewed.value = false; file.value = null
    form.value = document.state === 'draft' ? { ...document, source:'', fileName:'' } : null
  })
}
function copy() { const kind = selected.value.kind; create(kind) }
async function save() {
  await perform(async () => {
    const upload = Array.isArray(file.value) ? file.value[0] : file.value
    if (!upload || !upload.name.toLowerCase().endsWith('.md') || upload.size > 262144) throw createInternalProblem('invalidInput', { detail:'Выберите файл UTF-8 Markdown (.md) размером до 256 КиБ.' })
    const bytes = new Uint8Array(await upload.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const payload = { ...form.value, source:globalThis.btoa(binary), fileName:upload.name }
    const result = await session.consentRequest(`/legal-documents${selected.value ? '/' + selected.value.id : ''}`, json(selected.value ? 'PUT' : 'POST', payload))
    selected.value = result; form.value = { ...payload, revision:result.revision }; previewed.value = false
    rows.value = await session.consentRequest('/legal-documents')
    audit.value = await session.consentRequest(`/legal-documents/${result.id}/audit`)
  })
}
async function publishOrCancel() {
  const action = confirmation.value; confirmation.value = ''
  await perform(async () => {
    const payload = action === 'publish' ? { revision:selected.value.revision, now:now.value, effectiveDate:now.value ? null : effectiveDate.value } : { revision:selected.value.revision }
    selected.value = await session.consentRequest(`/legal-documents/${selected.value.id}/${action}`, json('POST', payload))
    form.value = null
    rows.value = await session.consentRequest('/legal-documents')
    audit.value = await session.consentRequest(`/legal-documents/${selected.value.id}/audit`)
  })
}
async function download() {
  await perform(async () => downloadBytes(await session.consentRequest(`/legal-documents/${selected.value.id}/source`, { headers:{ Accept:'text/markdown, application/problem+json' } }, 'blob'), selected.value.id))
}
onMounted(load)
</script>
<template>
  <section class="settings table-wide">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Правовые документы
      </h1><ActionButton
        icon="$refresh"
        tooltip-text="Обновить список"
        :disabled="busy"
        @click="load"
      />
    </header>
    <hr class="hr"><PageAlertRegion :problem="problem" />
    <p>Новый документ загружается как черновик. После публикации текст неизменяем. Даты вступления — 00:00 по Москве.</p>
    <v-select
      v-model="filter"
      :items="[{title:'Все типы', value:''}, ...kinds]"
      label="Тип документа"
      density="compact"
    />
    <ActionButton
      icon="$save"
      label="Новый черновик"
      tooltip-text="Создать новую версию"
      variant="blue"
      :disabled="busy"
      @click="create()"
    />
    <v-table density="compact">
      <thead><tr><th>Документ</th><th>Версия</th><th>Статус</th><th>Вступление (Москва)</th><th>Действия</th></tr></thead>
      <tbody>
        <tr
          v-for="row in visible"
          :key="row.id"
        >
          <td>{{ DOCUMENT_KINDS[row.kind] }}</td><td>{{ row.displayVersion }}</td><td>{{ CONSENT_STATUSES[row.state] }}</td><td>{{ moscowTime(row.effectiveAt) }}</td><td>
            <ActionButton
              icon="$edit"
              tooltip-text="Открыть документ"
              :disabled="busy"
              @click="open(row)"
            />
          </td>
        </tr>
      </tbody>
    </v-table>
    <form
      v-if="form"
      class="legal-editor"
      @submit.prevent="save"
    >
      <h2>{{ selected ? 'Редактирование черновика' : 'Новый черновик' }}</h2>
      <v-select
        v-model="form.kind"
        :items="kinds"
        label="Тип"
        :disabled="busy"
        @update:model-value="form.cookieCategories = []"
      />
      <v-text-field
        v-model="form.title"
        label="Название"
        maxlength="200"
        :disabled="busy"
      />
      <v-text-field
        v-model="form.displayVersion"
        label="Обозначение версии"
        maxlength="64"
        :disabled="busy"
      />
      <v-file-input
        v-model="file"
        accept=".md,text/markdown"
        label="Исходный файл UTF-8 Markdown (до 256 КиБ)"
        :disabled="busy"
      />
      <p>Заголовки, абзацы, списки, выделение, ссылки и таблицы. HTML, изображения, скрипты, код и внешние стили не допускаются. Для правки сохранённого черновика скачайте исходник, измените и загрузите его снова.</p>
      <template v-if="form.kind === 'cookie-consent'">
        <v-checkbox
          v-model="form.cookieCategories"
          value="analytics"
          label="Документ описывает аналитику"
        /><v-checkbox
          v-model="form.cookieCategories"
          value="marketing"
          label="Документ описывает маркетинг"
        />
      </template>
      <ActionButton
        type="submit"
        icon="$save"
        label="Сохранить черновик и проверить"
        tooltip-text="Сохранить черновик и сформировать канонический текст"
        variant="blue"
        :loading="busy"
      />
    </form>
    <section
      v-if="selected"
      class="legal-editor"
    >
      <h2>Канонический текст сохранённой версии</h2>
      <p>Идентификатор {{ selected.id }} · SHA-256 {{ selected.contentHash }}</p>
      <LegalDocumentReader
        :document="selected"
        @download="download"
      />
      <template v-if="selected.state === 'draft'">
        <v-checkbox
          v-model="previewed"
          label="Я проверил сохранённый текст, форматирование, реквизиты и основания обработки"
          :disabled="busy"
        />
        <v-checkbox
          v-model="now"
          label="Ввести в действие сейчас"
          :disabled="busy"
        />
        <v-text-field
          v-if="!now"
          v-model="effectiveDate"
          type="date"
          label="Дата вступления, 00:00 Москва"
          :disabled="busy"
        />
        <ActionButton
          icon="$save"
          label="Опубликовать"
          tooltip-text="После публикации текст нельзя изменить"
          variant="green"
          :disabled="busy || !previewed || (!now && !effectiveDate)"
          @click="confirmation = 'publish'"
        />
      </template>
      <ActionButton
        v-if="selected.state === 'scheduled'"
        icon="$close"
        label="Отменить запланированную версию"
        tooltip-text="Отмена доступна только до вступления в силу"
        :disabled="busy"
        @click="confirmation = 'cancel'"
      />
      <ActionButton
        icon="$save"
        label="Создать следующую версию"
        tooltip-text="Создать отдельный черновик этого типа"
        :disabled="busy"
        @click="copy"
      />
      <h3>Аудит</h3><ul>
        <li
          v-for="entry in audit"
          :key="entry.id"
        >
          {{ moscowTime(entry.at) }} · сотрудник {{ entry.actorId }} · {{ entry.action }}
        </li>
      </ul>
    </section>
    <ConfirmDialog
      :open="!!confirmation"
      :message="confirmation === 'publish' ? `Ввести версию ${selected?.displayVersion} в действие ${now ? 'сейчас' : effectiveDate + ' в 00:00 (Москва)'}? Потребуется новое согласие; текст станет неизменяемым.` : 'Отменить запланированную версию? Действующая версия останется доступна.'"
      @cancel="confirmation = ''"
      @confirm="publishOrCancel"
    />
  </section>
</template>
<style scoped>
.legal-editor { padding:1.2rem 0; border-top:1px solid #ccd9e8; margin-top:1rem; overflow-wrap:anywhere; }
.legal-editor h2 { color:#1976d2; font-size:1.2rem; margin-bottom:1rem; }
</style>
