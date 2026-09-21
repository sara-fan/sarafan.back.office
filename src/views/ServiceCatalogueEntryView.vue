<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { isNavigationFailure, NavigationFailureType, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EditorHeaderActions from '../components/EditorHeaderActions.vue'
import FormField from '../components/FormField.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { associatedFieldErrors, createInternalProblem, formPageProblem, normalizeProblem } from '../errors/problem.js'
import {
  SERVICE_CATALOGUE_CONFLICT,
  SERVICE_CATALOGUE_ERROR_OPTIONS,
  SERVICE_CATALOGUE_FIELDS,
  SERVICE_CATALOGUE_OVERLAP,
  SERVICE_CATALOGUE_VERSION_INVALID,
  serviceCatalogueAction,
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
let generation = 0

const method = computed(() => ops.value?.priceMethods.find(item => item.value === form.value?.priceMethod))
const editable = computed(() => !committed.value && serviceCatalogueAction(session.user.value, ops.value, creating.value ? 'create' : 'edit'))
const dirty = computed(() => !!form.value && JSON.stringify(form.value) !== baseline.value)
const overlapErrors = computed(() => form.value ? serviceCatalogueOverlapErrors(form.value, catalogue.value, details.value?.id) : {})
const fieldProblem = computed(() => problem.value ?? (Object.keys(overlapErrors.value).length ? createInternalProblem('invalidInput', { errors:overlapErrors.value }) : null))
const pageProblem = computed(() => formPageProblem(fieldProblem.value, form.value ? SERVICE_CATALOGUE_FIELDS : [], SERVICE_CATALOGUE_ERROR_OPTIONS))
const errors = field => associatedFieldErrors(fieldProblem.value, field, SERVICE_CATALOGUE_ERROR_OPTIONS)
const { confirmation, confirmDiscard, finish } = useDiscardChanges(dirty)

function apply(value, metadata) {
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
  if (method.value.routeAlias === 'percent') {
    form.value.amount = ''
  } else {
    form.value.percentage = ''
    form.value.minimumAmount = ''
    form.value.maximumAmount = ''
    if (method.value.routeAlias === 'manual') form.value.amount = ''
  }
  problem.value = null
}

async function saveAction() {
  if (busy.value || locked.value || !editable.value || !form.value) return
  problem.value = serviceCatalogueValidation(form.value, ops.value)
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
        {{ creating ? 'Новый тариф' : 'Тариф услуги' }}
      </h1>
      <EditorHeaderActions
        form="service-catalogue-form"
        :loaded="!!form || committed"
        :busy="busy"
        :show-save="editable"
        :save-disabled="locked || Object.keys(overlapErrors).length > 0 || (!creating && !dirty)"
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
        <div class="form-field">
          <label for="service">Услуга</label>
          <select
            id="service"
            v-model="form.service"
            name="service"
            :disabled="!editable || locked"
            :aria-invalid="errors('service').length > 0"
            aria-describedby="service-error"
          >
            <option
              v-for="item in ops.services"
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
              v-for="item in ops.priceMethods"
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
          :hint="`Больше 0 и не больше ${ops.limits.maximumPercentage}; до ${ops.limits.percentageDecimalPlaces} знаков после запятой.`"
          :problem="fieldProblem"
          :error-options="SERVICE_CATALOGUE_ERROR_OPTIONS"
        />
        <FormField
          v-if="method?.routeAlias === 'percent'"
          v-model="form.minimumAmount"
          name="minimumAmount"
          :disabled="!editable || locked"
          label="Минимум цены товара, USD"
          inputmode="decimal"
          hint="Необязательно. Неотрицательная сумма, до двух знаков после запятой."
          :problem="fieldProblem"
          :error-options="SERVICE_CATALOGUE_ERROR_OPTIONS"
        />
        <FormField
          v-if="method?.routeAlias === 'percent'"
          v-model="form.maximumAmount"
          name="maximumAmount"
          :disabled="!editable || locked"
          label="Максимум цены товара, USD"
          inputmode="decimal"
          hint="Необязательно. Не меньше минимума."
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
          hint="Неотрицательная сумма, до двух знаков после запятой."
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
              v-for="item in ops.currencies"
              :key="item.value"
              :value="item.value"
            >
              {{ item.name }}
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
        <FormField
          v-model="form.availableFrom"
          name="availableFrom"
          type="date"
          :disabled="!editable || locked"
          label="Действует с"
          hint="Календарная дата по московскому времени, включительно."
          :problem="fieldProblem"
          :error-options="SERVICE_CATALOGUE_ERROR_OPTIONS"
        />
        <FormField
          v-model="form.availableBy"
          name="availableBy"
          type="date"
          :disabled="!editable || locked"
          label="Действует по"
          hint="Необязательно. Конечная дата включается в период."
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
</style>
