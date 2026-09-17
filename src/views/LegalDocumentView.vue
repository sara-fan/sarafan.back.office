<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { useValidationFocus, validationFields } from '../validationFocus.js'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import EditorHeaderActions from '../components/EditorHeaderActions.vue'
import FormField from '../components/FormField.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import LegalDocumentReader from '../components/LegalDocumentReader.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { LEGAL_DOCUMENT_KIND, documentNodes, downloadBytes, moscowDate, moscowDateInput } from '../consentFormatting.js'
import { createInternalProblem, formPageProblem, normalizeProblem } from '../errors/problem.js'
import { useSession } from '../stores/session.js'

const legalFocusOptions = {
  aliases:{ source:'file', fileName:'file' },
  types:{
    'https://sarafan.sw.consulting/problems/invalid-legal-document-kind':['kind'],
    'https://sarafan.sw.consulting/problems/invalid-legal-document-title':['title'],
    'https://sarafan.sw.consulting/problems/invalid-legal-document-version':['displayVersion'],
    'https://sarafan.sw.consulting/problems/legal-document-version-conflict':['displayVersion'],
    'https://sarafan.sw.consulting/problems/invalid-effective-date':['effectiveDate'],
    'https://sarafan.sw.consulting/problems/legal-document-effective-date-conflict':['effectiveDate'],
    'https://sarafan.sw.consulting/problems/legal-document-file-required':['file'],
    'https://sarafan.sw.consulting/problems/legal-document-file-too-large':['file'],
    'https://sarafan.sw.consulting/problems/legal-document-file-type':['file'],
    'https://sarafan.sw.consulting/problems/legal-document-encoding':['file'],
    'https://sarafan.sw.consulting/problems/legal-document-text-required':['file'],
    'https://sarafan.sw.consulting/problems/legal-document-control-character':['file'],
    'https://sarafan.sw.consulting/problems/legal-document-html-not-allowed':['file'],
    'https://sarafan.sw.consulting/problems/legal-document-code-not-allowed':['file'],
    'https://sarafan.sw.consulting/problems/legal-document-quote-not-allowed':['file'],
    'https://sarafan.sw.consulting/problems/legal-document-separator-not-allowed':['file'],
    'https://sarafan.sw.consulting/problems/legal-document-image-not-allowed':['file'],
    'https://sarafan.sw.consulting/problems/legal-document-link-not-allowed':['file']
  }
}
const focusRoot = ref(null)

const session = useSession()
const route = useRoute()
const router = useRouter()
const id = typeof route.params.id === 'string' ? route.params.id : ''
const creating = !id
const ops = ref(null)
const kinds = computed(() => (ops.value?.kinds || []).map(item => ({ value:item.value, title:item.name })))
const kindName = value => ops.value?.kinds.find(item => item.value === value)?.name
const selected = ref(null)
const preview = ref(null)
const previewPayload = ref(null)
const form = ref(null)
const file = ref(null)
const uploadInput = ref(null)
const reader = ref(null)
const effectiveUntil = ref(null)
const loaded = ref(false)
const busy = ref(false)
const problem = ref(null)
const pageProblem = computed(() => formPageProblem(problem.value, form.value ? ['kind', 'title', 'displayVersion', 'effectiveDate', 'file'] : [], legalFocusOptions))
const baseline = ref(null)
const refreshConfirmation = ref(false)
let inputVersion = 0
let previewTimer = null
let disposed = false
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
  if (previewTimer) globalThis.clearTimeout(previewTimer)
  previewTimer = null
  inputVersion += 1
  preview.value = null
  previewPayload.value = null
}

function schedulePreview() {
  invalidatePreview()
  problem.value = null
  if (creating && !disposed && form.value?.title?.trim() && selectedFile()) {
    previewTimer = globalThis.setTimeout(previewDocument, 300)
  }
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
  form.value.displayVersion,
  form.value.effectiveDate
], schedulePreview, { flush:'sync' })
watch(file, schedulePreview, { deep:true, flush:'sync' })
watch(() => session.user.value?.id, () => { clearCreationState(); invalidatePreview() }, { flush:'sync' })
onUnmounted(() => { disposed = true; invalidatePreview() })

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
      detail:'Загрузите файл Markdown с расширением .md.', errors:{ file:['Загрузите файл Markdown с расширением .md.'] }
    })
  }
  if (!value.name.toLowerCase().endsWith('.md')) throw createInternalProblem('invalidInput', {
    detail:'Выберите файл Markdown с расширением .md.', errors:{ file:['Выберите файл Markdown с расширением .md.'] }
  })
  if (value.size === 0) throw createInternalProblem('invalidInput', {
    detail:'Выбранный файл пуст. Добавьте текст и загрузите файл снова.', errors:{ file:['Выбранный файл пуст. Добавьте текст и загрузите файл снова.'] }
  })
  if (value.size > 262144) throw createInternalProblem('invalidInput', {
    detail:'Размер файла не должен превышать 256 Кб.', errors:{ file:['Размер файла не должен превышать 256 Кб.'] }
  })
  return value
}

async function requestPayload() {
  const fields = { ...form.value }
  const upload = uploadFile()
  const bytes = new Uint8Array(await upload.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE))
  }
  return {
    ...fields,
    source:globalThis.btoa(binary),
    fileName:upload.name
  }
}

async function previewDocument() {
  if (previewTimer) globalThis.clearTimeout(previewTimer)
  previewTimer = null
  if (disposed || busy.value || !form.value?.title?.trim() || !selectedFile()) return
  const version = ++inputVersion
  preview.value = null
  previewPayload.value = null
  problem.value = null
  try {
    const payload = await requestPayload()
    if (version !== inputVersion || disposed) return
    const rendered = await session.consentRequest('/legal-documents/preview', json('POST', payload))
    if (version !== inputVersion || disposed) return
    documentNodes(rendered?.html)
    previewPayload.value = payload
    preview.value = rendered
  } catch (value) { if (version === inputVersion && !disposed) problem.value = normalizeProblem(value) }
}

async function saveAction() {
  if (busy.value || !previewPayload.value) return
  await perform(async () => {
    const payload = { ...previewPayload.value }
    await session.consentRequest('/legal-documents', json('POST', payload))
    await router.replace('/legal-documents')
  })
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

function save(...args) { return focusAfter(() => saveAction(...args), () => validationFields(problem.value, legalFocusOptions)) }

const focusAfter = useValidationFocus(focusRoot, { context:() => [session.user.value?.id, route.fullPath], ready:() => !busy.value })
</script>

<template>
  <section class="settings form-medium">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        {{ title }}
      </h1>
      <EditorHeaderActions
        form="legal-document-form"
        :loaded="loaded"
        :busy="busy"
        :show-save="creating"
        :save-disabled="!previewPayload || !(form?.displayVersion || '').trim()"
        save-tooltip="Сохранить документ"
        cancel-tooltip="Вернуться к списку"
        @refresh="requestRefresh"
        @cancel="cancel"
      >
        <template
          v-if="!creating"
          #before
        >
          <ActionButton
            v-if="!creating"
            icon="$print"
            tooltip-text="Распечатать"
            :disabled="busy || !selected"
            @click="printDocument"
          />
          <ActionButton
            v-if="!creating"
            icon="$download"
            tooltip-text="Скачать"
            :disabled="busy || !selected"
            @click="download()"
          />
        </template>
      </EditorHeaderActions>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="pageProblem" />
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
      ref="focusRoot"
      class="editor-form staff-form legal-workspace legal-document-form"
      @submit.prevent="save"
    >
      <fieldset
        class="legal-form-grid staff-form-grid"
        :disabled="busy"
      >
        <FormField
          name="kind"
          label="Тип документа:"
          :problem="problem"
          :error-options="legalFocusOptions"
        >
          <template #control="{ controlAttrs }">
            <select
              v-bind="controlAttrs"
              v-model="form.kind"
              @change="changeKind(form.kind)"
            >
              <option
                v-for="kind in kinds"
                :key="kind.value"
                :value="kind.value"
              >
                {{ kind.title }}
              </option>
            </select>
          </template>
        </FormField>
        <FormField
          v-model="form.title"
          name="title"
          label="Название:"
          maxlength="200"
          :problem="problem"
          :error-options="legalFocusOptions"
        />

        <FormField
          v-model="form.displayVersion"
          name="displayVersion"
          label="Версия:"
          maxlength="64"
          :problem="problem"
          :error-options="legalFocusOptions"
        />
        <FormField
          v-model="form.effectiveDate"
          name="effectiveDate"
          type="date"
          label="Дата начала действия:"
          :min="moscowDateInput()"
          :problem="problem"
          :error-options="legalFocusOptions"
        />
        <FormField
          name="file"
          label="Исходный файл:"
          :problem="problem"
          :error-options="legalFocusOptions"
        >
          <template #control="{ controlAttrs }">
            <v-file-input
              ref="uploadInput"
              v-model="file"
              v-bind="controlAttrs"
              class="staff-form-control"
              data-validation-field="file"
              :aria-describedby="'legal-file-guidance ' + controlAttrs['aria-describedby']"
              accept=".md,text/markdown"
              variant="outlined"
              density="compact"
              hide-details
            >
              <template #prepend>
                <ActionButton
                  icon="$file"
                  tooltip-text="Выбрать файл Markdown"
                  :disabled="busy"
                  :aria-invalid="controlAttrs['aria-invalid']"
                  :aria-describedby="'legal-file-guidance ' + controlAttrs['aria-describedby']"
                  @click="uploadInput.click()"
                />
              </template>
            </v-file-input>
          </template>
        </FormField>
      </fieldset>
      <p
        id="legal-file-guidance"
        class="format-note"
      >
        UTF-8 Markdown, до 256 Кб. Разрешены заголовки, абзацы, списки, выделение, ссылки и таблицы. HTML, изображения, скрипты, код и внешние стили не допускаются. После сохранения документ нельзя изменить.
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
  </section>
</template>

<style scoped>
.legal-workspace { padding:20px; overflow-wrap:anywhere; }
.legal-document-form { padding:0; }
.legal-preview-surface { padding:18px; margin-top:18px; background:#fff; border:1px solid #dbe5ee; border-radius:4px; }
.legal-form-grid { grid-template-columns:minmax(0, 1fr); }
.format-note { padding:10px 12px; margin:0 0 10px; color:#526a80; font-size:12px; line-height:1.45; background:#f5f9fc; border-left:3px solid #8bc8e7; }
.document-summary { display:flex; justify-content:flex-end; gap:24px; margin:0 0 14px; }
.document-summary div { min-width:180px; }
.document-summary dt { color:#64788b; font-size:11px; font-weight:700; text-transform:uppercase; }
.document-summary dd { margin:3px 0 0; color:#294a69; font-size:13px; }
.reader-surface { padding:18px; background:#f7fafc; border:1px solid #dbe5ee; border-radius:4px; }
.reader-surface :deep(.legal-document) { max-width:none; }
@media (max-width:700px) {
  .document-summary { justify-content:flex-start; flex-direction:column; gap:10px; }
}
</style>
