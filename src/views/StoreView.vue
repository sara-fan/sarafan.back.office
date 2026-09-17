<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EditorHeaderActions from '../components/EditorHeaderActions.vue'
import FormField from '../components/FormField.vue'
import StaffFileInput from '../components/StaffFileInput.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import StoreLogo from '../components/StoreLogo.vue'
import { associatedFieldErrors, createInternalProblem, formPageProblem, normalizeProblem } from '../errors/problem.js'
import { STORE_CONFLICT, STORE_VERSION_INVALID, STORE_FIELDS, STORE_ERROR_OPTIONS, storeAction, storeIdentity, storeForm, storePayload, storeValidation, logoValidation, validateStore, validateStoreOps } from '../storeCatalogue.js'
import { useSession } from '../stores/session.js'
import { useDiscardChanges } from '../useDiscardChanges.js'
import { useValidationFocus, validationFields } from '../validationFocus.js'

const session = useSession()
const route = useRoute()
const router = useRouter()
const focusRoot = ref(null)
const creating = computed(() => !route.params.id)
const details = ref(null)
const ops = ref(null)
const form = ref(null)
const file = shallowRef(null)
const invalidFile = shallowRef(null)
const baseline = ref('')
const problem = ref(null)
const busy = ref(false)
const locked = ref(false)
const committed = ref('')
const revision = ref(0)
let generation = 0
const dirty = computed(() => !!form.value && (file.value !== null || JSON.stringify(form.value) !== baseline.value))
const { confirmation, confirmDiscard, finish } = useDiscardChanges(dirty)
const editable = computed(() => !committed.value && storeAction(session.user.value, ops.value, creating.value ? 'create' : 'edit'))
const errors = field => associatedFieldErrors(problem.value, field, STORE_ERROR_OPTIONS)
const pageProblem = computed(() => formPageProblem(problem.value, form.value ? STORE_FIELDS : [], STORE_ERROR_OPTIONS))
function apply(value) {
  details.value = value
  form.value = storeForm(value)
  baseline.value = JSON.stringify(form.value)
  file.value = null
  invalidFile.value = null
  locked.value = false
  revision.value += 1
}
async function load() {
  const current = ++generation
  busy.value = true
  problem.value = null
  try {
    const catalogue = validateStoreOps(await session.storeRequest('/stores/ops'))
    if (current !== generation) return
    const value = creating.value ? null : validateStore(await session.storeRequest(`/stores/${route.params.id}`), catalogue, route.params.id)
    if (current !== generation) return
    ops.value = catalogue
    apply(value)
  } catch (value) { if (current === generation) problem.value = normalizeProblem(value) }
  finally { if (current === generation) busy.value = false }
}
async function back() {
  const current = generation
  try {
    const failure = await router.push('/stores')
    if (failure) throw failure
  }
  catch (value) { if (current === generation) problem.value = normalizeProblem(value) }
}
async function refresh() {
  if (busy.value) return
  if (committed.value) return back()
  const current = generation
  if (await confirmDiscard() && current === generation) await load()
}
function failure(value) {
  problem.value = normalizeProblem(value)
  if ([STORE_CONFLICT, STORE_VERSION_INVALID].includes(problem.value.type)) locked.value = true
}
async function saveAction() {
  if (busy.value || locked.value || !editable.value || !form.value) return
  problem.value = invalidFile.value ? previewProblem() : storeValidation(form.value, ops.value, file.value, !!details.value?.logoUrl)
  if (problem.value) return
  const current = ++generation
  busy.value = true
  try {
    const result = await session.storeRequest(creating.value ? '/stores' : `/stores/${details.value.id}`, {
      method:creating.value ? 'POST' : 'PUT', body:storePayload(form.value, details.value?.version, file.value)
    })
    if (current !== generation) return
    apply(validateStore(result, ops.value, details.value?.id))
    committed.value = 'saved'
    await back()
  } catch (value) { if (current === generation) failure(value) }
  finally { if (current === generation) busy.value = false }
}
const focusAfter = useValidationFocus(focusRoot, { context:() => [storeIdentity(session.user.value), route.fullPath], active:() => !confirmation.value, ready:() => !busy.value })
function save() { return focusAfter(saveAction, () => validationFields(problem.value, STORE_ERROR_OPTIONS)) }
async function selectLogo(selected) {
  if (!selected || !editable.value || busy.value || locked.value) return
  return focusAfter(() => {
    problem.value = logoValidation(selected, ops.value.limits)
    if (!problem.value) { invalidFile.value = null; file.value = selected }
  }, () => validationFields(problem.value, STORE_ERROR_OPTIONS))
}
function previewProblem() {
  return createInternalProblem('invalidInput', { errors:{ logo:['Не удалось показать выбранное изображение. Выберите корректный файл PNG, JPEG или WebP.'] } })
}
function previewFailed(selected) {
  if (selected !== file.value || !editable.value) return
  return focusAfter(() => { invalidFile.value = selected; problem.value = previewProblem() }, () => ['logo'])
}
function clear() {
  generation += 1
  details.value = null; form.value = null; ops.value = null; file.value = null
  invalidFile.value = null
  baseline.value = ''; problem.value = null; busy.value = false; locked.value = false
  committed.value = ''
  finish(false)
}
watch(() => storeIdentity(session.user.value), clear, { flush:'sync' })
watch(() => route.params.id, () => { clear(); load() })
watch(form, () => { if (!locked.value) problem.value = null }, { deep:true, flush:'sync' })
onMounted(load)
onUnmounted(clear)
</script>
<template>
  <section class="settings table-wide">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        {{ creating ? 'Новый магазин' : 'Магазин' }}
      </h1>
      <EditorHeaderActions
        form="store-form"
        :loaded="!!form || !!committed"
        :busy="busy"
        :show-save="editable"
        :save-disabled="locked || (!creating && !dirty)"
        @refresh="refresh"
        @cancel="back"
      />
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="pageProblem" />
    <p
      v-if="busy && !form"
      role="status"
    >
      Загрузка магазина…
    </p>
    <p
      v-if="locked"
      role="status"
    >
      Данные магазина изменились. Обновите карточку перед сохранением.
    </p>
    <p
      v-if="committed"
      role="status"
    >
      Магазин сохранён. Вернитесь к списку магазинов.
    </p>
    <p v-if="form && !editable && !committed">
      Магазин доступен только для просмотра.
    </p>
    <form
      v-if="form"
      id="store-form"
      ref="focusRoot"
      class="editor-form staff-form"
      novalidate
      @submit.prevent="save"
    >
      <fieldset :disabled="busy || !editable || locked">
        <FormField
          v-model="form.name"
          name="name"
          label="Название"
          :problem="problem"
          :error-options="STORE_ERROR_OPTIONS"
        />
        <div class="form-field">
          <label for="description">Описание</label>
          <textarea
            id="description"
            v-model="form.description"
            name="description"
            rows="3"
            :aria-invalid="errors('description').length > 0"
            aria-describedby="description-hint description-error"
          />
          <p
            id="description-hint"
            class="field-hint"
          >
            {{ form.description.length }} / {{ ops.limits.descriptionMaxLength }}. Рекомендуется не более {{ ops.limits.descriptionRecommendedLength }} символов.
          </p>
          <div
            id="description-error"
            class="field-error"
          >
            <span
              v-for="error in errors('description')"
              :key="error"
            >{{ error }}</span>
          </div>
        </div>
        <FormField
          v-model="form.officialUrl"
          name="officialUrl"
          label="Официальный сайт"
          :problem="problem"
          :error-options="STORE_ERROR_OPTIONS"
        />
        <div class="form-field">
          <label for="logo">Логотип</label>
          <StaffFileInput
            v-if="editable"
            name="logo"
            :model-value="file"
            :disabled="busy || locked"
            :clearable="false"
            tooltip="Выбрать логотип"
            :accept="ops.limits.logoContentTypes.join(',')"
            :aria-invalid="errors('logo').length > 0"
            aria-describedby="logo-hint logo-error"
            @update:model-value="selectLogo"
          />
          <p
            v-if="editable"
            id="logo-hint"
            class="field-hint"
          >
            Статичный PNG, JPEG или WebP, до {{ ops.limits.logoMaxBytes }} байт.
            Не более {{ ops.limits.logoMaxDimension }} пикселей по каждой стороне и {{ ops.limits.logoMaxPixels }} пикселей всего.
            Анимация WebP: до {{ ops.limits.logoMaxFrames }} кадров; сумма площадей холста по всем кадрам — до {{ ops.limits.logoMaxAnimationPixels }} пикселей.
            Распакованные метаданные PNG — до {{ ops.limits.logoMaxMetadataBytes }} байт. Новый файл заменит логотип при сохранении.
          </p>
          <StoreLogo
            :url="details?.logoUrl"
            :file="file"
            :revision="revision"
            class="staff-form-value"
            @invalid-file="previewFailed"
          />
          <div
            id="logo-error"
            class="field-error"
          >
            <span
              v-for="error in errors('logo')"
              :key="error"
            >{{ error }}</span>
          </div>
        </div>
        <div class="form-field">
          <label for="status">Статус</label>
          <select
            id="status"
            v-model="form.status"
            name="status"
            :aria-invalid="errors('status').length > 0"
            aria-describedby="status-error"
          >
            <option
              v-for="status in ops.statuses"
              :key="status.value"
              :value="status.value"
            >
              {{ status.name }}
            </option>
          </select>
          <div
            id="status-error"
            class="field-error"
          >
            <span
              v-for="error in errors('status')"
              :key="error"
            >{{ error }}</span>
          </div>
        </div>
        <label class="check"><input
          v-model="form.showOnHome"
          name="showOnHome"
          type="checkbox"
          :aria-invalid="errors('showOnHome').length > 0"
          aria-describedby="showOnHome-error"
        >Показывать на главной</label>
        <div
          id="showOnHome-error"
          class="field-error"
        >
          <span
            v-for="error in errors('showOnHome')"
            :key="error"
          >{{ error }}</span>
        </div>
        <FormField
          v-model="form.displayOrder"
          name="displayOrder"
          label="Порядок показа"
          inputmode="numeric"
          :problem="problem"
          :error-options="STORE_ERROR_OPTIONS"
        />
      </fieldset>
      <p class="field-hint">
        Меньшее число — раньше в рекомендуемом каталоге и на главной. При равенстве первым идёт магазин с меньшим ID. На главной показываются первые шесть активных выбранных магазинов. Алфавитная сортировка покупателя не меняет сохранённый порядок.
      </p>
    </form>
    <ConfirmDialog
      :open="confirmation"
      title="Отменить изменения?"
      message="Несохранённые изменения будут потеряны."
      action="Продолжить без сохранения"
      @cancel="finish(false)"
      @confirm="finish(true)"
    />
  </section>
</template>

<style scoped>
@media(max-width:550px) { .header-with-actions { flex-wrap:wrap; } .header-with-actions h1 { flex-basis:100%; } }
</style>
