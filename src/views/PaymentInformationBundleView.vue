<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { isNavigationFailure, NavigationFailureType, useRoute, useRouter } from 'vue-router'
import EditorHeaderActions from '../components/EditorHeaderActions.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import FormField from '../components/FormField.vue'
import StaffFileInput from '../components/StaffFileInput.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import PaymentQrPreview from '../components/PaymentQrPreview.vue'
import { associatedFieldErrors, createInternalProblem, formPageProblem, INTERNAL_PROBLEM_TYPES, normalizeProblem } from '../errors/problem.js'
import { can } from '../roles.js'
import { storeIdentity } from '../storeCatalogue.js'
import { useSession } from '../stores/session.js'
import { useDiscardChanges } from '../useDiscardChanges.js'
import { useValidationFocus, validationFields } from '../validationFocus.js'
import { validateImageFile } from '../imageUpload.js'
import { PAYMENT_ROOT, PAYMENT_FIELDS, PAYMENT_CONFLICTS, validatePaymentOps, validatePaymentBundle, paymentForm, paymentPayload, paymentValidation } from '../paymentInformation.js'

const session = useSession(), route = useRoute(), router = useRouter()
const creating = computed(() => !route.params.id)
const details = ref(null), ops = ref(null), form = ref(null), file = shallowRef(null), invalidFile = shallowRef(null)
const baseline = ref(''), problem = ref(null), busy = ref(false), locked = ref(false), committed = ref(false), revision = ref(0), focusRoot = ref(null)
let generation = 0
const editable = computed(() => !committed.value && can(session.user.value, 'managePaymentInformation') && ops.value?.canManage && (creating.value || details.value?.canEdit))
const dirty = computed(() => !!form.value && (file.value !== null || JSON.stringify(form.value) !== baseline.value))
const { confirmation, confirmDiscard, finish } = useDiscardChanges(dirty)
const pageProblem = computed(() => formPageProblem(problem.value, form.value ? PAYMENT_FIELDS : []))
const errors = field => associatedFieldErrors(problem.value, field)
const fields = [
  ['recipientName', 'Получатель'], ['inn', 'ИНН'], ['kpp', 'КПП'], ['settlementAccount', 'Расчётный счёт'],
  ['bankName', 'Банк'], ['bik', 'БИК'], ['correspondentAccount', 'Корреспондентский счёт'], ['paymentLink', 'Платёжная ссылка']
]
function apply(value) {
  details.value = value; form.value = paymentForm(value); baseline.value = JSON.stringify(form.value)
  file.value = null; invalidFile.value = null; locked.value = false; revision.value++
}
async function load() {
  const current = ++generation
  if (!can(session.user.value, 'managePaymentInformation')) return
  busy.value = true; problem.value = null
  try {
    const metadata = validatePaymentOps(await session.paymentInformationRequest(PAYMENT_ROOT + '/ops'))
    if (current !== generation) return
    const value = creating.value ? null : validatePaymentBundle(await session.paymentInformationRequest(`${PAYMENT_ROOT}/${route.params.id}`), metadata, route.params.id)
    if (current !== generation) return
    ops.value = metadata; apply(value)
  } catch (value) { if (current === generation) problem.value = normalizeProblem(value) }
  finally { if (current === generation) busy.value = false }
}
async function back() {
  const current = generation
  try {
    const failure = await router.push(PAYMENT_ROOT)
    if (failure && !isNavigationFailure(failure, NavigationFailureType.aborted | NavigationFailureType.cancelled)) throw failure
  } catch (value) { if (current === generation) problem.value = normalizeProblem(value) }
}
async function refresh() {
  if (busy.value) return
  if (committed.value) return back()
  const current = generation
  if (await confirmDiscard() && current === generation) await load()
}
function previewProblem() {
  return createInternalProblem('invalidInput', { errors:{ qr:['Не удалось показать выбранный QR. Выберите корректный статический файл PNG, JPEG или WebP.'] } })
}
async function saveAction() {
  if (busy.value || locked.value || !editable.value || !form.value) return
  problem.value = invalidFile.value ? previewProblem() : paymentValidation(form.value, ops.value, file.value)
  if (problem.value) return
  const current = ++generation
  busy.value = true
  try {
    const result = await session.paymentInformationRequest(creating.value ? PAYMENT_ROOT : `${PAYMENT_ROOT}/${details.value.id}`, {
      method:creating.value ? 'POST' : 'PUT', body:paymentPayload(form.value, details.value?.version, file.value)
    })
    if (current !== generation) return
    const value = validatePaymentBundle(result, ops.value, details.value?.id)
    if (!value.canEdit || value.enabled) throw createInternalProblem('protocolError')
    apply(value); committed.value = true
    await back()
  } catch (value) {
    if (current === generation) {
      problem.value = normalizeProblem(value)
      if (PAYMENT_CONFLICTS.includes(problem.value.type) || problem.value.type === INTERNAL_PROBLEM_TYPES.protocolError) locked.value = true
    }
  } finally { if (current === generation) busy.value = false }
}
const focusAfter = useValidationFocus(focusRoot, { context:() => [storeIdentity(session.user.value), route.fullPath], active:() => !confirmation.value, ready:() => !busy.value })
function save() { return focusAfter(saveAction, () => validationFields(problem.value)) }
function selectQr(selected) {
  if (!selected || !editable.value || busy.value || locked.value) return
  return focusAfter(() => {
    problem.value = validateImageFile(selected, { contentTypes:ops.value.limits.qrContentTypes, maxBytes:ops.value.limits.qrMaxBytes }, 'qr')
    if (!problem.value) { invalidFile.value = null; file.value = selected }
  }, () => validationFields(problem.value))
}
function previewFailed(selected) {
  if (selected !== file.value || !editable.value) return
  return focusAfter(() => { invalidFile.value = selected; problem.value = previewProblem() }, () => ['qr'])
}
function clear() {
  generation++; details.value = null; ops.value = null; form.value = null; file.value = null; invalidFile.value = null
  baseline.value = ''; problem.value = null; busy.value = false; locked.value = false; committed.value = false; finish(false)
}
watch(() => storeIdentity(session.user.value), () => { clear(); load() }, { flush:'sync' })
watch(() => route.params.id, () => { clear(); load() }, { flush:'sync' })
watch(() => form.value?.recipientType, value => { if (value === 1 && editable.value) form.value.kpp = '' }, { flush:'sync' })
watch(form, () => { if (!locked.value) problem.value = null }, { deep:true, flush:'sync' })
onMounted(load)
onUnmounted(clear)
</script>
<template>
  <section class="settings table-wide">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        {{ creating ? 'Новые платёжные реквизитов' : 'Редактирование платёжных реквизитов' }}
      </h1>
      <EditorHeaderActions
        form="payment-bundle-form"
        :loaded="!!form || committed"
        :busy="busy"
        :show-save="editable"
        :save-disabled="locked || (!creating && !dirty)"
        save-tooltip="Сохранить черновик"
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
      Загрузка реквизитов…
    </p>
    <p
      v-if="locked"
      role="status"
    >
      Данные изменились. Обновите карточку перед сохранением.
    </p>
    <p
      v-if="committed"
      role="status"
    >
      Черновик сохранён.
    </p>
    <p v-if="form && !editable && !committed">
      Используемые реквизиты нельзя редактироать.
    </p>
    <form
      v-if="form"
      id="payment-bundle-form"
      ref="focusRoot"
      class="editor-form staff-form"
      novalidate
      @submit.prevent="save"
    >
      <fieldset :disabled="busy">
        <FormField
          name="recipientType"
          label="Тип получателя"
          :disabled="!editable || locked"
          :problem="problem"
        >
          <template #control="{ controlAttrs }">
            <select
              v-bind="controlAttrs"
              v-model="form.recipientType"
            >
              <option :value="null">
                Не выбран
              </option>
              <option
                v-for="item in ops.recipientTypes"
                :key="item.value"
                :value="item.value"
              >
                {{ item.name }}
              </option>
            </select>
          </template>
        </FormField>
        <FormField
          v-for="[key, label] in fields"
          :key="key"
          v-model="form[key]"
          :name="key"
          :label="label"
          :disabled="!editable || locked || (key === 'kpp' && form.recipientType === 1)"
          :problem="problem"
          :inputmode="['inn', 'kpp', 'settlementAccount', 'bik', 'correspondentAccount'].includes(key) ? 'numeric' : undefined"
          :hint="key === 'kpp' && form.recipientType === 1 ? 'Для ИП КПП не указывается.' : ''"
        />
        <div class="form-field">
          <label for="qr">QR СБП получателя</label>
          <div class="staff-form-control qr-control">
            <StaffFileInput
              v-if="editable"
              name="qr"
              :model-value="file"
              :disabled="busy || locked"
              :clearable="false"
              tooltip="Выбрать QR СБП"
              :accept="ops.limits.qrContentTypes.join(',')"
              :aria-invalid="errors('qr').length > 0"
              aria-describedby="qr-hint qr-error"
              @update:model-value="selectQr"
            />
            <PaymentQrPreview
              :url="details?.qrUrl"
              :file="file"
              :revision="revision"
              @invalid-file="previewFailed"
            />
          </div>
          <p
            id="qr-hint"
            class="field-hint"
          >
            Статический PNG, JPEG или WebP, до {{ ops.limits.qrMaxBytes }} байт.
            Не более {{ ops.limits.qrMaxDimension }} пикселей по стороне и {{ ops.limits.qrMaxPixels }} пикселей всего.
            Распакованные метаданные PNG — до {{ ops.limits.qrMaxMetadataBytes }} байт.
            Новый файл заменит QR при сохранении; без нового файла сохранённый QR остаётся.
          </p>
          <div
            id="qr-error"
            class="field-error"
          >
            <span
              v-for="error in errors('qr')"
              :key="error"
            >{{ error }}</span>
          </div>
        </div>
      </fieldset>
    </form>
    <ConfirmDialog
      :open="confirmation"
      title="Отменить изменения?"
      message="Несохранённые изменения будут потеряны."
      action="Не сохранять и продолжить"
      action-icon="$continue"
      @cancel="finish(false)"
      @confirm="finish(true)"
    />
  </section>
</template>
<style scoped>
.qr-control { display:flex; align-items:center; gap:8px; }
.qr-control > .staff-form-control { flex:1; min-width:0; }
@media(max-width:550px) { .header-with-actions { flex-wrap:wrap; } .header-with-actions h1 { flex-basis:100%; } }
</style>
