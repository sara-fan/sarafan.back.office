<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { isNavigationFailure, NavigationFailureType, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EditorHeaderActions from '../components/EditorHeaderActions.vue'
import FormField from '../components/FormField.vue'
import StaffFileInput from '../components/StaffFileInput.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import StoreLogo from '../components/StoreLogo.vue'
import ActionButton from '../components/ActionButton.vue'
import { normalizeStoreAddress } from '../storeAddress.js'
import { generateStoreImage, storeImageName } from '../storeImageGenerator.js'
import { associatedFieldErrors, createInternalProblem, formPageProblem, normalizeProblem } from '../errors/problem.js'
import { STORE_CONFLICT, STORE_VERSION_INVALID, STORE_FIELDS, STORE_ERROR_OPTIONS, storeAction, storeIdentity, validateStoreList, nextStoreOrder, storePlacementErrors, storeForm, storePayload, storeValidation, logoValidation, validateStore, validateStoreOps } from '../storeCatalogue.js'
import { useSession } from '../stores/session.js'
import { useDiscardChanges } from '../useDiscardChanges.js'
import { useValidationFocus, validationFields } from '../validationFocus.js'

const session = useSession()
const route = useRoute()
const router = useRouter()
const focusRoot = ref(null)
const creating = computed(() => !route.params.id)
const website = computed(() => ops.value && form.value ? normalizeStoreAddress(form.value.officialUrl, ops.value.officialUrlRules) : null)
function normalizeWebsite() { if (website.value) form.value.officialUrl = website.value }
function openWebsite() {
  if (!website.value) return
  const address = website.value
  if (editable.value) normalizeWebsite()
  globalThis.open(address, '_blank', 'noopener,noreferrer')
}
const details = ref(null)
const ops = ref(null)
const catalogue = ref([])
const form = ref(null)
const file = shallowRef(null)
const generatedForName = ref('')
const invalidFile = shallowRef(null)
const baseline = ref('')
const problem = ref(null)
const busy = ref(false)
const generating = ref(false)
const locked = ref(false)
const committed = ref('')
const revision = ref(0)
let generation = 0
const dirty = computed(() => !!form.value && (file.value !== null || JSON.stringify(form.value) !== baseline.value))
const { confirmation, confirmDiscard, finish } = useDiscardChanges(dirty)
const editable = computed(() => !committed.value && storeAction(session.user.value, ops.value, creating.value ? 'create' : 'edit'))
const placementErrors = computed(() => form.value && ops.value ? storePlacementErrors(form.value, catalogue.value, details.value?.id, ops.value.limits.maxPriorityStores) : {})
const priorityFull = computed(() => catalogue.value.filter(item => item.id !== details.value?.id && item.status === 2).length >= (ops.value?.limits.maxPriorityStores ?? 0))
const fieldProblem = computed(() => problem.value ?? (Object.keys(placementErrors.value).length ? createInternalProblem("invalidInput", { errors:placementErrors.value }) : null))
const errors = field => associatedFieldErrors(fieldProblem.value, field, STORE_ERROR_OPTIONS)
const pageProblem = computed(() => formPageProblem(fieldProblem.value, form.value ? STORE_FIELDS : [], STORE_ERROR_OPTIONS))
function apply(value) {
  details.value = value
  form.value = storeForm(value)
  baseline.value = JSON.stringify(form.value)
  file.value = null
  generatedForName.value = ''
  invalidFile.value = null
  locked.value = false
  revision.value += 1
}
async function load() {
  const current = ++generation
  busy.value = true
  problem.value = null
  try {
    const metadata = validateStoreOps(await session.storeRequest('/stores/ops'))
    if (current !== generation) return
    const value = creating.value ? null : validateStore(await session.storeRequest(`/stores/${route.params.id}`), metadata, route.params.id)
    if (current !== generation) return
    const stores = validateStoreList(await session.storeRequest("/stores"), metadata)
    if (current !== generation) return
    ops.value = metadata
    catalogue.value = stores
    apply(value)
    if (!value) { form.value.displayOrder = String(nextStoreOrder(stores)); baseline.value = JSON.stringify(form.value) }
  } catch (value) { if (current === generation) problem.value = normalizeProblem(value) }
  finally { if (current === generation) busy.value = false }
}
async function back() {
  const current = generation
  try {
    const failure = await router.push('/stores')
    if (failure && !isNavigationFailure(failure, NavigationFailureType.aborted | NavigationFailureType.cancelled)) throw failure
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
  if (busy.value || generating.value || locked.value || !editable.value || !form.value) return
  normalizeWebsite()
  problem.value = invalidFile.value ? previewProblem() : storeValidation(form.value, ops.value, file.value, {
    existing:Boolean(details.value?.logoUrl),
    generatedStale:Boolean(generatedForName.value && generatedForName.value !== storeImageName(form.value.name))
  })
  if (!problem.value && Object.keys(placementErrors.value).length) problem.value = createInternalProblem("invalidInput", { errors:placementErrors.value })
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
    if (!problem.value) { invalidFile.value = null; generatedForName.value = ''; file.value = selected }
  }, () => validationFields(problem.value, STORE_ERROR_OPTIONS))
}
async function generateLogoAction() {
  if (!editable.value || busy.value || generating.value || locked.value || !form.value || !storeImageName(form.value.name)) return
  const current = generation
  const name = storeImageName(form.value.name)
  problem.value = null
  generating.value = true
  try {
    const selected = await generateStoreImage(name)
    if (current !== generation) return
    problem.value = logoValidation(selected, ops.value.limits)
    if (!problem.value) { invalidFile.value = null; generatedForName.value = name; file.value = selected }
  } catch {
    if (current === generation) problem.value = createInternalProblem('invalidInput', {
      errors:{ logo:['Не удалось сформировать изображение. Повторите попытку или загрузите готовый файл.'] }
    })
  } finally { if (current === generation) generating.value = false }
}
function generateLogo() { return focusAfter(generateLogoAction, () => validationFields(problem.value, STORE_ERROR_OPTIONS)) }
function previewProblem() {
  return createInternalProblem('invalidInput', { errors:{ logo:['Не удалось показать выбранное изображение. Выберите корректный файл PNG, JPEG или WebP.'] } })
}
function previewFailed(selected) {
  if (selected !== file.value || !editable.value) return
  return focusAfter(() => { invalidFile.value = selected; problem.value = previewProblem() }, () => ['logo'])
}
function clear() {
  generation += 1
  details.value = null; form.value = null; ops.value = null; file.value = null; generatedForName.value = ''
  invalidFile.value = null
  catalogue.value = []
  baseline.value = ''; problem.value = null; busy.value = false; generating.value = false; locked.value = false
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
        :save-disabled="generating || locked || Object.keys(placementErrors).length > 0 || (!creating && !dirty)"
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
      <fieldset :disabled="busy">
        <FormField
          v-model="form.name"
          name="name"
          :disabled="!editable || locked"
          label="Название"
          :problem="fieldProblem"
          :error-options="STORE_ERROR_OPTIONS"
        />
        <FormField
          v-model="form.description"
          name="description"
          :disabled="!editable || locked"
          label="Описание"
          :hint="`${form.description.length} / ${ops.limits.descriptionMaxLength}. Рекомендуется не более ${ops.limits.descriptionRecommendedLength} символов.`"
          :problem="fieldProblem"
          :error-options="STORE_ERROR_OPTIONS"
        >
          <template #control="{ controlAttrs }">
            <textarea
              v-bind="controlAttrs"
              v-model="form.description"
              rows="3"
            />
          </template>
        </FormField>
        <FormField
          v-model="form.officialUrl"
          name="officialUrl"
          :disabled="!editable || locked"
          label="Официальный сайт"
          :problem="fieldProblem"
          :error-options="STORE_ERROR_OPTIONS"
        >
          <template #control="{ controlAttrs }">
            <div class="staff-form-control store-website-control">
              <ActionButton
                icon="$link"
                tooltip-text="Открыть сайт магазина"
                :disabled="!website"
                @click="openWebsite"
              />
              <input
                v-bind="controlAttrs"
                v-model="form.officialUrl"
                @blur="normalizeWebsite"
              >
            </div>
          </template>
        </FormField>
        <div class="form-field">
          <div class="store-image-label">
            <label for="logo">Изображение магазина</label>
            <ActionButton
              icon="$info"
              :icon-size="16"
              tooltip-text="Убедитесь, что изображение не нарушает авторские права"
            />
          </div>
          <div class="staff-form-control store-logo-control">
            <ActionButton
              v-if="editable"
              icon="$generateImage"
              tooltip-text="Сформировать изображение из названия"
              :disabled="busy || generating || locked || !storeImageName(form.name)"
              :loading="generating"
              :aria-invalid="errors('logo').length > 0"
              aria-describedby="logo-hint logo-error"
              @click="generateLogo"
            />
            <StaffFileInput
              v-if="editable"
              name="logo"
              :model-value="file"
              :disabled="busy || generating || locked"
              :clearable="false"
              tooltip="Выбрать изображение магазина"
              :accept="ops.limits.logoContentTypes.join(',')"
              :aria-invalid="errors('logo').length > 0"
              aria-describedby="logo-hint logo-error"
              @update:model-value="selectLogo"
            />
            <StoreLogo
              :url="details?.logoUrl"
              :file="file"
              :revision="revision"
              class="store-logo-preview"
              @invalid-file="previewFailed"
            />
          </div>
          <p
            v-if="editable"
            id="logo-hint"
            class="field-hint"
          >
            Статичный PNG, JPEG или WebP, до {{ ops.limits.logoMaxBytes }} байт.
            Не более {{ ops.limits.logoMaxDimension }} пикселей по каждой стороне и {{ ops.limits.logoMaxPixels }} пикселей всего.
            Анимация WebP: до {{ ops.limits.logoMaxFrames }} кадров; сумма площадей холста по всем кадрам — до {{ ops.limits.logoMaxAnimationPixels }} пикселей.
            Распакованные метаданные PNG — до {{ ops.limits.logoMaxMetadataBytes }} байт. Новый файл заменит изображение при сохранении.
            Изображение обязательно: загрузите готовый файл или сформируйте его из названия магазина.
          </p>
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
            :disabled="!editable || locked"
            :aria-invalid="errors('status').length > 0"
            aria-describedby="status-error"
          >
            <option
              v-for="status in ops.statuses"
              :key="status.value"
              :value="status.value"
              :disabled="status.routeAlias === 'priority' && priorityFull && form.status !== status.value"
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
        <FormField
          v-model="form.displayOrder"
          name="displayOrder"
          :disabled="!editable || locked"
          label="Порядок показа"
          inputmode="numeric"
          :hint="`Меньшее число — раньше в общем списке и на главной странице. Номер должен быть уникален для всех магазинов, включая скрытые. На главной странице можно показывать не более ${ops.limits.maxPriorityStores} магазинов.`"
          :problem="fieldProblem"
          :error-options="STORE_ERROR_OPTIONS"
        />
      </fieldset>
    </form>
    <ConfirmDialog
      :open="confirmation"
      title="Отменить изменения?"
      message="Несохранённые изменения будут потеряны."
      action="Продолжить без сохранения"
      action-icon="$continue"
      @cancel="finish(false)"
      @confirm="finish(true)"
    />
  </section>
</template>

<style scoped>
.store-website-control { display:flex; align-items:center; gap:var(--staff-input-action-gap); }
.store-website-control input { flex:1; }
.store-logo-control { display:flex; align-items:center; gap:8px; }
.store-image-label { display:flex; align-items:center; gap:4px; }
.store-logo-control > .staff-form-control { flex:1; min-width:0; }
.store-logo-preview { flex:0 1 auto; max-width:30%; }
.store-logo-preview :deep(img) { display:block; width:auto; height:calc(var(--staff-form-control-height) * 0.7); max-width:100%; max-height:calc(var(--staff-form-control-height) * 0.7); object-fit:contain; }
@media(max-width:550px) { .header-with-actions { flex-wrap:wrap; } .header-with-actions h1 { flex-basis:100%; } }
</style>
