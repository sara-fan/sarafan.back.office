<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { isNavigationFailure, NavigationFailureType, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ActionButton from '../components/ActionButton.vue'
import EditorHeaderActions from '../components/EditorHeaderActions.vue'
import FormField from '../components/FormField.vue'
import InlineEditableField from '../components/InlineEditableField.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { associatedFieldErrors, createInternalProblem, formPageProblem, normalizeProblem } from '../errors/problem.js'
import {
  SERVICE_CATALOGUE_CONFLICT,
  SERVICE_CATALOGUE_ERROR_OPTIONS,
  SERVICE_CATALOGUE_FIELDS,
  SERVICE_CATALOGUE_OVERLAP,
  SERVICE_CATALOGUE_VERSION_INVALID,
  serviceCatalogueAction,
  serviceCatalogueBandAmountError,
  serviceCatalogueBandEndError,
  serviceCatalogueForm,
  serviceCatalogueIdentity,
  serviceCatalogueOverlapErrors,
  serviceCataloguePayload,
  serviceCatalogueValidation,
  validateServiceCatalogueEntry,
  validateServiceCatalogueList
} from '../serviceCatalogue.js'
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
const catalogue = ref([])
const form = ref(null)
const baseline = ref('')
const problem = ref(null)
const busy = ref(false)
const locked = ref(false)
const committed = ref(false)
const pendingBandEdits = reactive(new Map())
const bandEndEditors = new Map()
let pendingAddedBand = null
let generation = 0

const method = computed(() => ops.value?.priceMethods.find(item => item.value === form.value?.priceMethod))
const serviceName = computed(() => ops.value?.services.find(item => item.value === details.value?.service)?.name ?? '')
const selectableServices = computed(() => ops.value?.services.filter(item => !creating.value || item.routeAlias !== 'product') ?? [])
const chargeCurrencies = computed(() => ops.value?.currencies.filter(item =>
  ops.value.services.find(service => service.value === form.value?.service)?.allowedCurrencies.includes(item.value)) ?? [])
const priceMethods = computed(() => ops.value?.priceMethods.filter(item =>
  ops.value.services.find(service => service.value === form.value?.service)?.allowedPriceMethods.includes(item.value)) ?? [])
const bandHeaders = [
  { title:'', key:'actions', sortable:false, width:'80px' },
  { title:'Начало интервала', key:'from', sortable:false },
  { title:'Конец интервала', key:'by', sortable:false },
  { title:'Стоимость', key:'amount', sortable:false }
]

function changeService() {
  if (!chargeCurrencies.value.some(item => item.value === form.value.currency)) form.value.currency = chargeCurrencies.value[0]?.value
  if (!priceMethods.value.some(item => item.value === form.value.priceMethod)) {
    form.value.priceMethod = priceMethods.value[0]?.value
    resetMethodFields()
  }
  if (method.value?.routeAlias === 'percent') form.value.currency = 840
}
const editable = computed(() => !committed.value
  && (creating.value || !ops.value?.services.some(item => item.value === details.value?.service && item.routeAlias === 'product'))
  && serviceCatalogueAction(session.user.value, ops.value, creating.value ? 'create' : 'edit'))
const addBandRow = { isAdd:true }
const bandRows = computed(() => form.value ? [...form.value.bands, ...(editable.value ? [addBandRow] : [])] : [])
const bandFocusTarget = computed(() => {
  const bands = form.value?.bands
  if (!bands?.length || !ops.value) return null
  for (let index = 0; index < bands.length; index++) {
    if (index < bands.length - 1 && serviceCatalogueBandEndError(bands, index, bands[index].by, ops.value)) {
      return { item:bands[index], field:'by' }
    }
    if (serviceCatalogueBandAmountError(bands[index].amount, ops.value)) return { item:bands[index], field:'amount' }
  }
  return { item:bands[0], field:bands.length > 1 ? 'by' : 'amount' }
})
const bandFocusControlId = computed(() => {
  if (!bandFocusTarget.value) return 'bands'
  const index = form.value.bands.indexOf(bandFocusTarget.value.item)
  return `band${bandFocusTarget.value.field === 'by' ? 'By' : 'Amount'}${index}`
})
const dirty = computed(() => pendingBandEdits.size > 0 || !!form.value && JSON.stringify(form.value) !== baseline.value)
const overlapErrors = computed(() => form.value ? serviceCatalogueOverlapErrors(form.value, catalogue.value, details.value?.id) : {})
const fieldProblem = computed(() => problem.value ?? (Object.keys(overlapErrors.value).length ? createInternalProblem('invalidInput', { errors:overlapErrors.value }) : null))
const pageProblem = computed(() => formPageProblem(fieldProblem.value, form.value
  ? SERVICE_CATALOGUE_FIELDS.filter(field => (creating.value || field !== 'service')
    && (method.value?.routeAlias !== 'percent' || field !== 'currency')) : [], SERVICE_CATALOGUE_ERROR_OPTIONS))
const errors = field => associatedFieldErrors(fieldProblem.value, field, SERVICE_CATALOGUE_ERROR_OPTIONS)
const { confirmation, confirmDiscard, finish } = useDiscardChanges(dirty)

function setBandEditing(item, field, editing) {
  const fields = pendingBandEdits.get(item) ?? new Set()
  if (editing) {
    fields.add(field)
    pendingBandEdits.set(item, fields)
  } else {
    fields.delete(field)
    if (fields.size === 0) pendingBandEdits.delete(item)
  }
}
function bandIsFocusTarget(item, field) {
  return bandFocusTarget.value?.item === item && bandFocusTarget.value.field === field
}
function bandCellHasError(item, field) {
  return errors('bands').length > 0 && bandIsFocusTarget(item, field)
}
function setBandEndEditor(item, instance) {
  if (instance) bandEndEditors.set(item, instance)
  else bandEndEditors.delete(item)
}
function syncBandBoundaries() {
  const bands = form.value.bands
  for (let index = 0; index < bands.length; index++) {
    bands[index].from = index === 0 ? '' : bands[index - 1].by
  }
  bands.at(-1).by = ''
}
function setBandEnd(item, value) {
  const index = form.value.bands.indexOf(item)
  if (index < 0 || index >= form.value.bands.length - 1) return
  item.by = value
  form.value.bands[index + 1].from = value
}
function acceptBandEnd(item) {
  if (pendingAddedBand?.previous === item) pendingAddedBand = null
}
function rollbackAddedBand() {
  if (!pendingAddedBand || !form.value) return
  const added = pendingAddedBand.added
  pendingAddedBand = null
  const index = form.value.bands.indexOf(added)
  if (index >= 0) form.value.bands.splice(index, 1)
  syncBandBoundaries()
}
function cancelBandEnd(item) {
  if (pendingAddedBand?.previous === item) rollbackAddedBand()
}
function removeBand(item, index) {
  if (pendingBandEdits.size > 0 || form.value.bands.length <= 1) return
  pendingBandEdits.delete(item)
  form.value.bands.splice(index, 1)
  syncBandBoundaries()
}
async function addBand() {
  if (pendingBandEdits.size > 0 || pendingAddedBand || form.value.bands.length >= ops.value.limits.maximumBands) return
  const previous = form.value.bands.at(-1)
  form.value.bands.push({ from:'', by:'', amount:'' })
  const added = form.value.bands.at(-1)
  pendingAddedBand = { previous, added }
  await nextTick()
  if (pendingAddedBand?.added === added) bandEndEditors.get(previous)?.startEdit()
}

function apply(value, metadata) {
  pendingBandEdits.clear()
  bandEndEditors.clear()
  pendingAddedBand = null
  details.value = value
  form.value = serviceCatalogueForm(value, metadata)
  baseline.value = JSON.stringify(form.value)
  locked.value = false
}

async function load() {
  const current = ++generation
  busy.value = true
  problem.value = null
  try {
    const metadata = await session.getServiceCatalogueOps()
    if (!serviceCatalogueAction(session.user.value, metadata, creating.value ? 'create' : 'view')) {
      if (current === generation) await router.push('/forbidden')
      return
    }
    const [value, list] = await Promise.all([
      creating.value ? Promise.resolve(null) : session.serviceCatalogueRequest(`/service-catalogue/${route.params.id}`),
      session.serviceCatalogueRequest('/service-catalogue')
    ])
    if (current !== generation) return
    const validated = value === null ? null : validateServiceCatalogueEntry(value, metadata, route.params.id)
    ops.value = metadata
    catalogue.value = validateServiceCatalogueList(list, metadata)
    apply(validated, metadata)
  } catch (value) { if (current === generation) problem.value = normalizeProblem(value) }
  finally { if (current === generation) busy.value = false }
}

async function back() {
  const current = generation
  try {
    const failure = await router.push('/service-catalogue')
    if (failure && !isNavigationFailure(failure, NavigationFailureType.aborted | NavigationFailureType.cancelled)) throw failure
  } catch (value) { if (current === generation) problem.value = normalizeProblem(value) }
}

async function refresh() {
  if (busy.value) return
  if (committed.value) return back()
  const current = generation
  if (await confirmDiscard() && current === generation) await load()
}

function resetMethodFields() {
  if (!form.value || !method.value) return
  rollbackAddedBand()
  pendingBandEdits.clear()
  if (method.value.routeAlias === 'percent') {
    form.value.amount = ''
    form.value.currency = 840
  } else {
    form.value.percentage = ''
    form.value.minimumAmount = ''
    form.value.maximumAmount = ''
    if (method.value.routeAlias !== 'fixed') form.value.amount = ''
  }
  problem.value = null
}

async function saveAction() {
  if (busy.value || locked.value || !editable.value || !form.value || pendingBandEdits.size > 0) return
  problem.value = serviceCatalogueValidation(form.value, ops.value, creating.value, details.value)
  if (!problem.value && Object.keys(overlapErrors.value).length) problem.value = createInternalProblem('invalidInput', { errors:overlapErrors.value })
  if (problem.value) return
  const current = ++generation
  busy.value = true
  try {
    const result = await session.serviceCatalogueRequest(creating.value ? '/service-catalogue' : `/service-catalogue/${details.value.id}`, {
      method:creating.value ? 'POST' : 'PUT',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify(serviceCataloguePayload(form.value, ops.value, details.value?.version))
    })
    if (current !== generation) return
    apply(validateServiceCatalogueEntry(result, ops.value, details.value?.id), ops.value)
    committed.value = true
    await back()
  } catch (value) {
    if (current === generation) {
      problem.value = normalizeProblem(value)
      if ([SERVICE_CATALOGUE_CONFLICT, SERVICE_CATALOGUE_VERSION_INVALID, SERVICE_CATALOGUE_OVERLAP].includes(problem.value.type)) locked.value = true
    }
  } finally { if (current === generation) busy.value = false }
}

const focusAfter = useValidationFocus(focusRoot, {
  context:() => [serviceCatalogueIdentity(session.user.value), route.fullPath],
  active:() => !confirmation.value,
  ready:() => !busy.value
})
function save() { return focusAfter(saveAction, () => validationFields(problem.value, SERVICE_CATALOGUE_ERROR_OPTIONS)) }

function clear() {
  generation += 1
  pendingBandEdits.clear()
  bandEndEditors.clear()
  pendingAddedBand = null
  details.value = null; ops.value = null; catalogue.value = []; form.value = null; baseline.value = ''
  problem.value = null; busy.value = false; locked.value = false; committed.value = false; finish(false)
}
watch(() => serviceCatalogueIdentity(session.user.value), clear, { flush:'sync' })
watch(() => route.params.id, () => { clear(); load() })
watch(form, () => { if (!locked.value) problem.value = null }, { deep:true, flush:'sync' })
onMounted(load)
onUnmounted(clear)
</script>

<template>
  <section class="settings table-wide">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        {{ creating ? 'Новый тариф' : serviceName ? `Тариф для услуги «${serviceName}»` : 'Тариф для услуги' }}
      </h1>
      <EditorHeaderActions
        form="service-catalogue-form"
        :loaded="!!form || committed"
        :busy="busy"
        :show-save="editable"
        :save-disabled="locked || pendingBandEdits.size > 0 || Object.keys(overlapErrors).length > 0 || (!creating && !dirty)"
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
      Загрузка тарифа…
    </p>
    <p
      v-if="locked"
      role="status"
    >
      Тариф изменился или период занят. Обновите карточку перед сохранением.
    </p>
    <p
      v-if="committed"
      role="status"
    >
      Тариф сохранён. Вернитесь к списку тарифов.
    </p>
    <p v-if="form && !editable && !committed">
      Тариф доступен только для просмотра.
    </p>
    <form
      v-if="form"
      id="service-catalogue-form"
      ref="focusRoot"
      class="editor-form staff-form"
      novalidate
      @submit.prevent="save"
    >
      <fieldset :disabled="busy">
        <div
          v-if="creating"
          class="form-field"
        >
          <label for="service">Услуга</label>
          <select
            id="service"
            v-model="form.service"
            name="service"
            :disabled="!editable || locked"
            :aria-invalid="errors('service').length > 0"
            aria-describedby="service-error"
            @change="changeService"
          >
            <option
              v-for="item in selectableServices"
              :key="item.value"
              :value="item.value"
            >
              {{ item.name }}
            </option>
          </select>
          <div
            id="service-error"
            class="field-error"
          >
            <span
              v-for="error in errors('service')"
              :key="error"
            >{{ error }}</span>
          </div>
        </div>
        <div class="form-field">
          <label for="priceMethod">Способ расчёта</label>
          <select
            id="priceMethod"
            v-model="form.priceMethod"
            name="priceMethod"
            :disabled="!editable || locked"
            :aria-invalid="errors('priceMethod').length > 0"
            aria-describedby="priceMethod-error"
            @change="resetMethodFields"
          >
            <option
              v-for="item in priceMethods"
              :key="item.value"
              :value="item.value"
            >
              {{ item.name }}
            </option>
          </select>
          <div
            id="priceMethod-error"
            class="field-error"
          >
            <span
              v-for="error in errors('priceMethod')"
              :key="error"
            >{{ error }}</span>
          </div>
        </div>
        <FormField
          v-if="method?.routeAlias === 'percent'"
          v-model="form.percentage"
          name="percentage"
          :disabled="!editable || locked"
          label="Процент"
          inputmode="decimal"
          :problem="fieldProblem"
          :error-options="SERVICE_CATALOGUE_ERROR_OPTIONS"
        />
        <FormField
          v-if="method?.routeAlias === 'percent'"
          v-model="form.minimumAmount"
          name="minimumAmount"
          :disabled="!editable || locked"
          label="Минимальная стоимость услуги"
          inputmode="decimal"
          hint="Необязательно."
          :problem="fieldProblem"
          :error-options="SERVICE_CATALOGUE_ERROR_OPTIONS"
        />
        <FormField
          v-if="method?.routeAlias === 'percent'"
          v-model="form.maximumAmount"
          name="maximumAmount"
          :disabled="!editable || locked"
          label="Максимальная стоимость услуги"
          inputmode="decimal"
          hint="Необязательно."
          :problem="fieldProblem"
          :error-options="SERVICE_CATALOGUE_ERROR_OPTIONS"
        />
        <FormField
          v-if="method?.routeAlias === 'fixed'"
          v-model="form.amount"
          name="amount"
          :disabled="!editable || locked"
          label="Сумма"
          inputmode="decimal"
          :problem="fieldProblem"
          :error-options="SERVICE_CATALOGUE_ERROR_OPTIONS"
        />
        <div
          v-if="method?.routeAlias !== 'percent'"
          class="form-field"
        >
          <label for="currency">Валюта</label>
          <select
            id="currency"
            v-model="form.currency"
            name="currency"
            :disabled="!editable || locked"
            :aria-invalid="errors('currency').length > 0"
            aria-describedby="currency-error"
          >
            <option
              v-for="item in chargeCurrencies"
              :key="item.value"
              :value="item.value"
            >
              {{ item.name }} ({{ item.symbol }})
            </option>
          </select>
          <div
            id="currency-error"
            class="field-error"
          >
            <span
              v-for="error in errors('currency')"
              :key="error"
            >{{ error }}</span>
          </div>
        </div>
        <p
          v-if="method?.routeAlias === 'auto'"
          class="field-hint"
        >
          Сумма поступает из внешней системы. Ручное изменение импортированной суммы недоступно.
        </p>
        <template v-if="method?.routeAlias === 'stepped'">
          <div class="band-section">
            <FormField
              name="bands"
              label="Диапазоны и стоимость"
              :label-for="bandFocusControlId"
              :problem="fieldProblem"
              :error-options="SERVICE_CATALOGUE_ERROR_OPTIONS"
            >
              <template #control>
                <div class="staff-form-control">
                  <v-card class="table-card">
                    <v-data-table
                      :headers="bandHeaders"
                      :items="bandRows"
                      :items-per-page="-1"
                      hide-default-footer
                      density="compact"
                      class="interlaced-table band-table"
                    >
                      <template #[`item.actions`]="{ item, index }">
                        <div
                          v-if="item.isAdd"
                          class="header-actions"
                          role="group"
                          aria-label="Добавление интервалов"
                        >
                          <ActionButton
                            icon="fas fa-square-plus"
                            icon-size="28"
                            tooltip-text="Добавить интервал"
                            :disabled="busy || locked || pendingBandEdits.size > 0 || form.bands.length >= ops.limits.maximumBands"
                            @click="addBand"
                          />
                        </div>
                        <div
                          v-else
                          class="actions-container"
                        >
                          <ActionButton
                            v-if="editable"
                            icon="$delete"
                            tooltip-text="Удалить интервал"
                            :disabled="busy || locked || pendingBandEdits.size > 0 || form.bands.length === 1"
                            @click="removeBand(item, index)"
                          />
                        </div>
                      </template>
                      <template #[`item.from`]="{ item, index }">
                        <InlineEditableField
                          v-if="!item.isAdd"
                          :id="`bandFrom${index}`"
                          v-model="item.from"
                          :label="`Начало интервала ${index + 1}`"
                          edit-tooltip="Изменить начало интервала"
                        />
                      </template>
                      <template #[`item.by`]="{ item, index }">
                        <InlineEditableField
                          v-if="!item.isAdd"
                          :id="`bandBy${index}`"
                          :ref="instance => setBandEndEditor(item, instance)"
                          :validation-field="bandIsFocusTarget(item, 'by') ? 'bands' : undefined"
                          :model-value="item.by"
                          :label="`Изменить конец интервала ${index + 1}`"
                          edit-tooltip="Изменить конец интервала"
                          :editable="editable && index < form.bands.length - 1"
                          :disabled="busy || locked"
                          :validate="value => serviceCatalogueBandEndError(form.bands, index, value, ops)"
                          :invalid="bandCellHasError(item, 'by')"
                          :described-by="bandCellHasError(item, 'by') ? 'bands-error' : undefined"
                          inputmode="decimal"
                          @update:model-value="value => setBandEnd(item, value)"
                          @editing-change="editing => setBandEditing(item, 'by', editing)"
                          @accepted="acceptBandEnd(item)"
                          @cancelled="cancelBandEnd(item)"
                        />
                      </template>
                      <template #[`item.amount`]="{ item, index }">
                        <InlineEditableField
                          v-if="!item.isAdd"
                          :id="`bandAmount${index}`"
                          v-model="item.amount"
                          :validation-field="bandIsFocusTarget(item, 'amount') ? 'bands' : undefined"
                          :label="`Стоимость услуги для интервала ${index + 1}: `"
                          edit-tooltip="Изменить стоимость"
                          :editable="editable"
                          :disabled="busy || locked"
                          :invalid="bandCellHasError(item, 'amount')"
                          :described-by="bandCellHasError(item, 'amount') ? 'bands-error' : undefined"
                          inputmode="decimal"
                          @editing-change="editing => setBandEditing(item, 'amount', editing)"
                        />
                      </template>
                    </v-data-table>
                  </v-card>
                </div>
              </template>
            </FormField>
          </div>
        </template>
        <FormField
          v-model="form.availableFrom"
          name="availableFrom"
          type="date"
          :disabled="!editable || locked"
          label="Действует с"
          hint="Необязательно. Пустая дата означает любой день до даты окончания включительно."
          :problem="fieldProblem"
          :error-options="SERVICE_CATALOGUE_ERROR_OPTIONS"
        />
        <FormField
          v-model="form.availableBy"
          name="availableBy"
          type="date"
          :disabled="!editable || locked"
          label="Действует по"
          hint="Необязательно. Пустая дата означает отсутствие окончания срока действия."
          :problem="fieldProblem"
          :error-options="SERVICE_CATALOGUE_ERROR_OPTIONS"
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
@media(max-width:550px) { .header-with-actions { flex-wrap:wrap; } .header-with-actions h1 { flex-basis:100%; } }
.band-section :deep(.form-field) { align-items:start; }
.band-table :deep(table) { min-width:850px; }
.band-table :deep(th), .band-table :deep(td) { padding:6px 10px !important; }
</style>
