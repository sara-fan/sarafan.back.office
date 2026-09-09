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
import { LEGAL_DOCUMENT_KIND, downloadBytes, moscowDate, moscowDateInput } from '../consentFormatting.js'
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
const reader = ref(null)
const effectiveUntil = ref(null)
const loaded = ref(false)
const busy = ref(false)
const problem = ref(null)
const confirmDelete = ref(false)
const baseline = ref(null)
const refreshConfirmation = ref(false)
let inputVersion = 0
const BASE64_CHUNK_SIZE = 0x8000
const title = computed(() => creating
  ? 'Новый правовой документ'
  : (selected.value ? `${selected.value.title} · Версия ${selected.value.displayVersion}` : 'Правовой документ'))
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

function selectedFile() {
  return Array.isArray(file.value) ? file.value[0] : file.value
}

function formState() {
  const upload = selectedFile()
  return form.value && {
    ...form.value,
    file:upload ? {
      name:upload.name,
      size:upload.size,
      type:upload.type,
      lastModified:upload.lastModified
    } : null
  }
}

function captureBaseline() {
  baseline.value = formState()
}

const dirty = computed(() => creating && loaded.value && baseline.value !== null
  && JSON.stringify(formState()) !== JSON.stringify(baseline.value))

function clearCreationState() {
  form.value = null
  file.value = null
  preview.value = null
  previewPayload.value = null
  baseline.value = null
}

function findEffectiveUntil(documents, document) {
  const effectiveAt = Date.parse(document.effectiveAt)
  if (!Array.isArray(documents) || !Number.isFinite(effectiveAt)
    || documents.some(item => !Number.isInteger(item?.kind) || !kindName(item.kind)
      || typeof item.locale !== 'string' || !Number.isFinite(Date.parse(item.effectiveAt)))) {
    throw createInternalProblem('protocolError')
  }
  let next = null
  let nextTime = Number.POSITIVE_INFINITY
  for (const item of documents) {
    const time = Date.parse(item.effectiveAt)
    if (item.kind === document.kind && item.locale === document.locale && time > effectiveAt && time < nextTime) {
      next = item.effectiveAt
      nextTime = time
    }
  }
  return next
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
  if (creating) clearCreationState()
  await perform(async () => {
    ops.value = await session.getLegalDocumentOps()
    if (creating) {
      const queryKind = typeof route.query.kind === 'string' && /^\d+$/u.test(route.query.kind) ? Number(route.query.kind) : route.query.kind
      const initialKind = Number.isInteger(queryKind) && kindName(queryKind)
        ? queryKind
        : (kindName(LEGAL_DOCUMENT_KIND.PERSONAL_DATA_CONSENT) ? LEGAL_DOCUMENT_KIND.PERSONAL_DATA_CONSENT : ops.value.kinds[0].value)
      form.value = newDocument(initialKind)
      captureBaseline()
    } else {
      const document = await session.consentRequest(`/legal-documents/${id}`)
      if (!Number.isInteger(document?.kind) || !kindName(document.kind) || typeof document.locale !== 'string') throw createInternalProblem('protocolError')
      const documents = await session.consentRequest(`/legal-documents?kind=${document.kind}`)
      effectiveUntil.value = findEffectiveUntil(documents, document)
      selected.value = document
    }
    loaded.value = true
  })
}

function changeKind(kind) {
  form.value.title = kindName(kind)
}

function uploadFile() {
  const value = selectedFile()
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
    await session.consentRequest('/legal-documents', json('POST', payload))
    await router.replace('/legal-documents')
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

function printDocument() {
  reader.value?.printDocument()
}

function cancel() {
  router.push('/legal-documents')
}

function requestRefresh() {
  if (busy.value) return
  if (dirty.value) refreshConfirmation.value = true
  else load()
}

async function confirmRefresh() {
  refreshConfirmation.value = false
  await load()
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
          v-if="!creating"
          icon="$print"
          tooltip-text="Распечатать"
          :disabled="busy || !selected"
          @click="printDocument"
        /><ActionButton
          v-if="!creating"
          icon="$download"
          tooltip-text="Скачать"
          :disabled="busy || !selected"
          @click="download()"
        /><ActionButton
          v-if="!creating"
          icon="$delete"
          :tooltip-text="selected?.canDelete ? 'Удалить документ' : 'Удаление невозможно после начала действия документа'"
          :disabled="busy || !selected?.canDelete"
          variant="red"
          @click="confirmDelete = true"
        /><ActionButton
          icon="$refresh"
          tooltip-text="Обновить данные"
          :disabled="busy"
          @click="requestRefresh"
        /><ActionButton
          v-if="creating"
          icon="$eye"
          icon-size="28"
          tooltip-text="Предварительный просмотр"
          :loading="busy"
          :disabled="!loaded"
          @click="previewDocument"
        />
        <ActionButton
          v-if="creating"
          icon="$saveChanges"
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
      class="form-surface legal-workspace saved-document"
    >
      <dl class="document-summary">
        <div>
          <dt>Дата начала действия</dt>
          <dd>{{ moscowDate(selected.effectiveAt) }}</dd>
        </div>
        <div>
          <dt>Дата окончания действия</dt>
          <dd>{{ moscowDate(effectiveUntil) }}</dd>
        </div>
        <div v-if="selected.kind === LEGAL_DOCUMENT_KIND.COOKIE_CONSENT">
          <dt>Категория куки</dt>
          <dd>{{ cookieCategoryNames }}</dd>
        </div>
      </dl>
      <div class="reader-surface">
        <LegalDocumentReader
          ref="reader"
          :document="selected"
          content-only
        />
      </div>
    </section>
    <ConfirmDialog
      :open="refreshConfirmation"
      title="Обновить данные?"
      message="Несохранённые изменения будут потеряны."
      action="Сбросить и обновить"
      action-icon="$refresh"
      @cancel="refreshConfirmation = false"
      @confirm="confirmRefresh"
    />
    <ConfirmDialog
      :open="confirmDelete"
      message="Удалить этот документ? Действие доступно только до даты начала действия и будет записано в журнал."
      action="Удалить документ"
      action-icon="$delete"
      @cancel="confirmDelete = false"
      @confirm="deleteDocument"
    />
  </section>
</template>

<style scoped>
.legal-workspace { padding:20px; overflow-wrap:anywhere; }
.legal-document-form { padding:0; }
.legal-preview-surface { padding:18px; margin-top:18px; background:#fff; border:1px solid #dbe5ee; border-radius:4px; }
.legal-form-grid { display:grid; grid-template-columns:minmax(340px, 1.25fr) minmax(280px, 1fr) minmax(160px, .55fr) minmax(210px, .7fr); gap:10px 12px; }
.legal-version { max-width:140px; }
.legal-effective-date { max-width:220px; }
.legal-file { grid-column:1 / -1; }
.format-note { padding:10px 12px; margin:0 0 10px; color:#526a80; font-size:12px; line-height:1.45; background:#f5f9fc; border-left:3px solid #8bc8e7; }
.cookie-options { margin:4px 0 10px; color:#526a80; font-size:13px; }
.document-summary { display:flex; justify-content:flex-end; gap:24px; margin:0 0 14px; }
.document-summary div { min-width:180px; }
.document-summary dt { color:#64788b; font-size:11px; font-weight:700; text-transform:uppercase; }
.document-summary dd { margin:3px 0 0; color:#294a69; font-size:13px; }
.reader-surface { padding:18px; background:#f7fafc; border:1px solid #dbe5ee; border-radius:4px; }
.reader-surface :deep(.legal-document) { max-width:none; }
@media (max-width:1000px) {
  .legal-form-grid { grid-template-columns:1fr 1fr; }
  .legal-version, .legal-effective-date { max-width:none; }
}
@media (max-width:700px) {
  .legal-form-grid { grid-template-columns:1fr; }
  .document-summary { justify-content:flex-start; flex-direction:column; gap:10px; }
}
</style>
