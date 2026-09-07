<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import LegalDocumentReader from '../components/LegalDocumentReader.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { LEGAL_DOCUMENT_KIND, downloadBytes, moscowDate, moscowDateInput, moscowTime } from '../consentFormatting.js'
import { createInternalProblem, normalizeProblem } from '../errors/problem.js'
import { useSession } from '../stores/session.js'

const session = useSession()
const route = useRoute()
const router = useRouter()
const id = typeof route.params.id === 'string' ? route.params.id : ''
const creating = !id
const ops = ref(null)
const kinds = computed(() => (ops.value?.kinds || []).map(item => ({ value:item.value, title:item.name })))
const kindName = value => ops.value?.kinds.find(item => item.value === value)?.name
const cookieCategoryNames = computed(() => (ops.value?.cookieCategories || []).map(item => item.name).join(', '))
const selected = ref(null)
const preview = ref(null)
const previewPayload = ref(null)
const form = ref(null)
const file = ref(null)
const loaded = ref(false)
const busy = ref(false)
const problem = ref(null)
const confirmDelete = ref(false)
let inputVersion = 0
const BASE64_CHUNK_SIZE = 0x8000
const title = computed(() => creating ? 'Новый правовой документ' : 'Правовой документ')
const json = (method, body) => ({ method, headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body) })

function newDocument(kind) {
  return {
    kind,
    locale:'ru',
    title:kindName(kind),
    displayVersion:'',
    effectiveDate:moscowDateInput()
  }
}

function invalidatePreview() {
  inputVersion += 1
  preview.value = null
  previewPayload.value = null
}

watch(() => form.value && [
  form.value.kind,
  form.value.locale,
  form.value.title,
  form.value.effectiveDate
], invalidatePreview, { flush:'sync' })
watch(file, invalidatePreview, { deep:true, flush:'sync' })

async function perform(action) {
  busy.value = true
  problem.value = null
  try { return await action() }
  catch (value) { problem.value = normalizeProblem(value); return null }
  finally { busy.value = false }
}

async function load() {
  loaded.value = false
  await perform(async () => {
    ops.value = await session.getLegalDocumentOps()
    if (creating) {
      const queryKind = typeof route.query.kind === 'string' && /^\d+$/u.test(route.query.kind) ? Number(route.query.kind) : route.query.kind
      const initialKind = Number.isInteger(queryKind) && kindName(queryKind)
        ? queryKind
        : (kindName(LEGAL_DOCUMENT_KIND.PERSONAL_DATA_CONSENT) ? LEGAL_DOCUMENT_KIND.PERSONAL_DATA_CONSENT : ops.value.kinds[0].value)
      form.value = newDocument(initialKind)
    } else {
      selected.value = await session.consentRequest(`/legal-documents/${id}`)
      if (!Number.isInteger(selected.value?.kind) || !kindName(selected.value.kind)) throw createInternalProblem('protocolError')
    }
    loaded.value = true
  })
}

function changeKind(kind) {
  form.value.title = kindName(kind)
}

function uploadFile() {
  const value = Array.isArray(file.value) ? file.value[0] : file.value
  if (!value) {
    throw createInternalProblem('invalidInput', {
      detail:'Загрузите файл Markdown с расширением .md.'
    })
  }
  if (!value.name.toLowerCase().endsWith('.md')) throw createInternalProblem('invalidInput', {
    detail:'Выберите файл Markdown с расширением .md.'
  })
  if (value.size === 0) throw createInternalProblem('invalidInput', {
    detail:'Выбранный файл пуст. Добавьте текст и загрузите файл снова.'
  })
  if (value.size > 262144) throw createInternalProblem('invalidInput', {
    detail:'Размер файла не должен превышать 256 Кб.'
  })
  return value
}

async function requestPayload() {
  const upload = uploadFile()
  const bytes = new Uint8Array(await upload.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE))
  }
  return {
    ...form.value,
    source:globalThis.btoa(binary),
    fileName:upload.name
  }
}

async function previewDocument() {
  if (busy.value || !form.value) return
  await perform(async () => {
    const version = inputVersion
    const payload = await requestPayload()
    const rendered = await session.consentRequest('/legal-documents/preview', json('POST', payload))
    if (version !== inputVersion) return
    previewPayload.value = payload
    preview.value = rendered
  })
}

async function save() {
  if (busy.value || !previewPayload.value) return
  await perform(async () => {
    const payload = { ...previewPayload.value, displayVersion:form.value.displayVersion }
    const document = await session.consentRequest('/legal-documents', json('POST', payload))
    await router.replace(`/legal-documents/${document.id}`)
  })
}

async function deleteDocument() {
  confirmDelete.value = false
  busy.value = true
  problem.value = null
  try {
    await session.consentRequest(`/legal-documents/${selected.value.id}`, { method:'DELETE' })
    await router.push('/legal-documents')
  } catch (value) {
    const deletionProblem = normalizeProblem(value)
    if (deletionProblem.code === 'legal_document_already_effective') {
      try { selected.value = await session.consentRequest(`/legal-documents/${id}`) } catch { /* preserve the deletion error */ }
    }
    problem.value = deletionProblem
  } finally {
    busy.value = false
  }
}

async function download(document = selected.value) {
  await perform(async () => downloadBytes(
    await session.consentRequest(`/legal-documents/${document.id}/source`, {
      headers:{ Accept:'text/markdown, application/problem+json' }
    }, 'blob'),
    document.id
  ))
}

function createAnother() {
  router.push({ path:'/legal-documents/new', query:{ kind:selected.value.kind } })
}

function cancel() {
  router.push('/legal-documents')
}

onMounted(load)
</script>

<template>
  <section class="settings table-wide">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        {{ title }}
      </h1>
      <div class="header-actions">
        <ActionButton
          v-if="creating"
          icon="$eye"
          icon-size="28"
          tooltip-text="Предварительный просмотр"
          :loading="busy"
          @click="previewDocument"
        />
        <ActionButton
          v-if="creating"
          icon="$save"
          icon-size="28"
          variant="blue"
          tooltip-text="Сохранить документ"
          :disabled="busy || !previewPayload || !(form?.displayVersion || '').trim()"
          @click="save"
        />
        <ActionButton
          icon="$close"
          icon-size="28"
          tooltip-text="Вернуться к списку"
          :disabled="busy"
          @click="cancel"
        />
      </div>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="problem" />
    <p
      v-if="busy && !loaded"
      class="empty-state"
      role="status"
    >
      Загрузка документа…
    </p>
    <div
      v-else-if="problem && !loaded"
      class="empty-state"
    >
      <ActionButton
        icon="$refresh"
        label="Повторить загрузку"
        tooltip-text="Повторить загрузку"
        @click="load"
      />
    </div>

    <form
      v-if="form"
      id="legal-document-form"
      class="editor-form legal-workspace legal-document-form"
      @submit.prevent="previewDocument"
    >
      <fieldset
        class="legal-form-grid"
        :disabled="busy"
      >
        <v-select
          v-model="form.kind"
          :items="kinds"
          label="Тип"
          variant="outlined"
          density="compact"
          @update:model-value="changeKind"
        />
        <v-text-field
          v-model="form.title"
          label="Название"
          maxlength="200"
          variant="outlined"
          density="compact"
        />
        <v-text-field
          v-model="form.displayVersion"
          class="legal-version"
          label="Версия"
          maxlength="64"
          variant="outlined"
          density="compact"
        />
        <v-text-field
          v-model="form.effectiveDate"
          class="legal-effective-date"
          type="date"
          label="Дата начала действия"
          :min="moscowDateInput()"
          variant="outlined"
          density="compact"
        />
        <v-file-input
          v-model="file"
          class="legal-file"
          accept=".md,text/markdown"
          label="Исходный файл UTF-8 Markdown (до 256 Кб)"
          variant="outlined"
          density="compact"
        />
      </fieldset>
      <p class="format-note">
        Разрешены заголовки, абзацы, списки, выделение, ссылки и таблицы. HTML, изображения, скрипты, код и внешние стили не допускаются. После сохранения документ нельзя изменить.
      </p>
      <p
        v-if="form.kind === LEGAL_DOCUMENT_KIND.COOKIE_CONSENT"
        class="cookie-options"
      >
        Категория куки: {{ cookieCategoryNames }}
      </p>
    </form>

    <div
      v-if="preview"
      class="legal-preview-surface"
    >
      <LegalDocumentReader
        :document="preview"
        content-only
      />
    </div>

    <section
      v-if="selected"
      class="form-surface legal-workspace"
    >
      <header class="workspace-header document-summary">
        <div>
          <p class="workspace-eyebrow">
            Сохранённый документ
          </p>
          <h2>{{ selected.title }}</h2>
          <p>{{ kindName(selected.kind) }} · версия {{ selected.displayVersion }}</p>
          <p v-if="selected.kind === LEGAL_DOCUMENT_KIND.COOKIE_CONSENT">
            Категория куки: {{ cookieCategoryNames }}
          </p>
        </div>
      </header>
      <dl class="document-metadata">
        <div><dt>Идентификатор</dt><dd>{{ selected.id }}</dd></div>
        <div><dt>Дата начала действия</dt><dd>{{ moscowDate(selected.effectiveAt) }} ({{ moscowTime(selected.effectiveAt) }})</dd></div>
        <div><dt>SHA-256 исходника</dt><dd>{{ selected.sourceHash }}</dd></div>
        <div><dt>SHA-256 текста</dt><dd>{{ selected.contentHash }}</dd></div>
      </dl>
      <div class="reader-surface">
        <LegalDocumentReader
          :document="selected"
          @download="download"
        />
      </div>
      <div class="workspace-actions">
        <ActionButton
          icon="$add"
          label="Создать новый документ"
          tooltip-text="Создать новый документ"
          :disabled="busy"
          @click="createAnother"
        />
        <ActionButton
          v-if="selected.canDelete"
          icon="$delete"
          label="Удалить документ"
          tooltip-text="Удалить документ до даты начала действия"
          variant="red"
          :disabled="busy"
          @click="confirmDelete = true"
        />
      </div>
    </section>
    <ConfirmDialog
      :open="confirmDelete"
      message="Удалить этот документ? Действие доступно только до даты начала действия и будет записано в журнал."
      @cancel="confirmDelete = false"
      @confirm="deleteDocument"
    />
  </section>
</template>

<style scoped>
.legal-workspace { padding:20px; overflow-wrap:anywhere; }
.legal-document-form { padding:0; }
.legal-preview-surface { padding:18px; margin-top:18px; background:#fff; border:1px solid #dbe5ee; border-radius:4px; }
.workspace-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding-bottom:12px; margin-bottom:16px; border-bottom:1px solid #dbe5ee; }
.workspace-header h2 { margin:0; color:#1976d2; font-size:20px; font-weight:600; }
.workspace-header p { margin:4px 0 0; color:#64788b; font-size:13px; }
.workspace-eyebrow { margin:0 0 4px !important; color:#587086 !important; font-size:11px !important; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
.legal-form-grid { display:grid; grid-template-columns:minmax(340px, 1.25fr) minmax(280px, 1fr) minmax(160px, .55fr) minmax(210px, .7fr); gap:10px 12px; }
.legal-version { max-width:140px; }
.legal-effective-date { max-width:220px; }
.legal-file { grid-column:1 / -1; }
.format-note { padding:10px 12px; margin:0 0 10px; color:#526a80; font-size:12px; line-height:1.45; background:#f5f9fc; border-left:3px solid #8bc8e7; }
.cookie-options { margin:4px 0 10px; color:#526a80; font-size:13px; }
.workspace-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:14px; }
.document-metadata { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px 18px; margin:0 0 16px; }
.document-metadata div { min-width:0; }
.document-metadata dt { color:#64788b; font-size:11px; font-weight:700; text-transform:uppercase; }
.document-metadata dd { margin:3px 0 0; color:#294a69; font-family:ui-monospace, SFMono-Regular, Consolas, monospace; font-size:12px; overflow-wrap:anywhere; }
.reader-surface { padding:18px; background:#f7fafc; border:1px solid #dbe5ee; border-radius:4px; }
@media (max-width:1000px) {
  .legal-form-grid { grid-template-columns:1fr 1fr; }
  .legal-version, .legal-effective-date { max-width:none; }
}
@media (max-width:700px) {
  .legal-form-grid, .document-metadata { grid-template-columns:1fr; }
}
</style>
