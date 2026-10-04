<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { useValidationFocus, validationFields } from '../validationFocus.js'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EditorHeaderActions from '../components/EditorHeaderActions.vue'
import FormField from '../components/FormField.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import OrderCostSummary from '../components/OrderCostSummary.vue'
import OrderStatusBadge from '../components/OrderStatusBadge.vue'
import CollapsibleSection from '../components/CollapsibleSection.vue'
import { moscowDate, moscowTime } from '../consentFormatting.js'
import { manualPricingTariffs, optionalServices, pricingForm, pricingPayload, validateOrderPricing, validatePricingOps } from '../orderPricing.js'
import { CORE_PROBLEM_TYPES, createInternalProblem, formPageProblem, normalizeProblem, problemFieldErrors } from '../errors/problem.js'
import { formatMoneyAmount } from '../moneyFormatting.js'
import { safeOrderSource } from '../orderFormatting.js'
import { CUSTOMER_FIELDS, PRODUCT_FIELDS, productExceedsLimit, priceCents, productForm, productPayload, productValidation, validateOrderDetails } from '../orderProduct.js'
import { can } from '../roles.js'
import { useSession } from '../stores/session.js'

const rejectionOpen = ref(false), rejectionReason = ref(''), rejectionRoot = ref(null)
const focusRoot = ref(null)
const costSummary = ref(null), continuing = ref(false)
const productExpanded = ref(true)
const pricingExpanded = ref(true), pricingFocusRoot = ref(null)

const session = useSession()
const route = useRoute()
const router = useRouter()
const number = computed(() => route.params.orderNumber)
const details = ref(null)
const ops = ref(null)
const pricing = ref(null)
const pricingOps = ref(null)
const dollarSymbol = computed(() => ops.value?.currencies.find(item => item.routeAlias === 'usd')?.symbol ?? '')
const rubSymbol = computed(() => ops.value?.currencies.find(item => item.routeAlias === 'rub')?.symbol ?? '')
const euroSymbol = computed(() => ops.value?.currencies.find(item => item.routeAlias === 'eur')?.symbol ?? '')
const pricingDraft = ref(null), pricingBaseline = ref(''), pricingEditing = ref(false), confirmingPrice = ref(false)
const pricingDirty = computed(() => !!pricingDraft.value && JSON.stringify(pricingDraft.value) !== pricingBaseline.value)
const productDirty = computed(() => form.value !== null && JSON.stringify(form.value) !== baseline.value)
const statusMetadata = computed(() => ops.value?.statuses.find(item => item.value === details.value?.status))
const visibleReviewReason = computed(() => statusMetadata.value && statusMetadata.value.routeAlias !== 'cannot_deliver' ? null : details.value?.reviewReason)
const canRejectReview = computed(() => statusMetadata.value?.routeAlias === 'under_review'
  && can(session.user.value, 'manageOrderPricing'))
const pricingEditable = computed(() => canRejectReview.value && pricing.value?.canEdit && pricingOps.value?.canManage)
const canConfirmPrice = computed(() => pricingEditable.value && pricing.value?.canConfirm && !dirty.value && !locked.value)
const form = ref(null)
const baseline = ref('')
const busy = ref(false)
const problem = ref(null)
const confirmation = ref(false)
const historyContinuation = ref(false)
const locked = ref(false)
let version = 0
let confirmAction = null
const dirty = computed(() => productDirty.value || pricingDirty.value || pricingEditing.value)
const editable = computed(() => details.value?.canEditProduct && can(session.user.value, 'manualQuotes') && !locked.value)
const productEditingEnabled = computed(() => editable.value)
const productSavingEnabled = computed(() => editable.value && (details.value?.limitCheck.available))
const limitRatesUnavailable = computed(() => editable.value && details.value?.limitCheck.available === false)
const localProblem = computed(() => productEditingEnabled.value && form.value
  ? productValidation(form.value, ops.value.productLimits, details.value.limitCheck) : null)
const fieldProblem = computed(() => problem.value ?? localProblem.value)
const valueLimitExceeded = computed(() => productEditingEnabled.value && form.value && productExceedsLimit(form.value, details.value.limitCheck))
const productSaveBlocked = computed(() => !productSavingEnabled.value || !!localProblem.value || valueLimitExceeded.value)
const totalLimitProblem = computed(() => valueLimitExceeded.value
  && !problemFieldErrors(fieldProblem.value, 'sellerPrice').length
  ? createInternalProblem('invalidInput', { errors:{ sellerTotal:[details.value.limitCheck.exceededMessage] } }) : null)
const pricingFields = computed(() => pricingEditable.value && pricing.value && manualPricingTariffs(pricing.value, pricingOps.value).some(item =>
  !optionalServices(pricingOps.value).some(service => service.value === item.service) || pricing.value.calculation.inputs.selectedServices.includes(item.service)) ? ['manualAmounts'] : [])
const pageProblem = computed(() => formPageProblem(fieldProblem.value, [...(details.value && form.value ? PRODUCT_FIELDS : []), ...pricingFields.value]))
const rejectionPageProblem = computed(() => formPageProblem(problem.value, ['reason']))
const customerValue = key => key === 'passportIssueDate' && details.value.customer[key]
  ? moscowDate(details.value.customer[key]) : details.value.customer[key] || 'Не указано'
const informationBlocks = computed(() => details.value ? [
  { kind:'customer', title:'Покупатель', fields:Object.entries(CUSTOMER_FIELDS).map(([key, label]) => ({ key, label, value:customerValue(key) })) },
  { kind:'delivery', title:'Адрес доставки', fields:[
    { key:'method', label:'Способ доставки', value:details.value.delivery?.name ?? 'Не выбран' },
    ...(details.value.delivery ? [{ key:'destination', label:details.value.delivery.routeAlias === 'pickup' ? 'Адрес ПВЗ' : 'Адрес покупателя',
      value:details.value.delivery.destination, wide:true }] : [])
  ] }
] : [])
const total = computed(() => {
  const cents = priceCents(form.value?.sellerPrice ?? '')
  const quantity = Number(form.value?.quantity)
  return cents !== null && Number.isSafeInteger(quantity) && quantity > 0
    ? formatMoneyAmount(Number(cents * BigInt(quantity)) / 100) : '—'
})

function applyPricing(value) {
  pricing.value = validateOrderPricing(value, pricingOps.value, number.value)
  pricingDraft.value = pricingForm(value, pricingOps.value)
  pricingBaseline.value = JSON.stringify(pricingDraft.value)
}
async function mutatePricing(confirm = false) {
  if (busy.value || locked.value || !pricingEditable.value || productDirty.value || pricingEditing.value || confirm && !canConfirmPrice.value) return
  const current = ++version
  busy.value = true
  problem.value = null
  try {
    const payload = confirm ? { expectedUpdatedAt:pricing.value.updatedAt }
      : pricingPayload({ ...pricingDraft.value, selectedServices:pricing.value.calculation.inputs.selectedServices }, pricing.value.updatedAt, pricingOps.value)
    const result = await session.orderRequest(`/orders/${number.value}/pricing${confirm ? '/confirm' : ''}`, {
      method:confirm ? 'POST' : 'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload)
    })
    if (current !== version) return
    applyPricing(result)
    // Pricing advances the shared order version and confirmation changes its status/capabilities.
    locked.value = true
    const order = await session.orderRequest(`/orders/${number.value}`)
    if (current === version) {
      details.value = validateOrderDetails(order, ops.value, number.value)
      form.value = productForm(order.product, ops.value.productLimits)
      baseline.value = JSON.stringify(form.value)
      locked.value = false
      return true
    }
  } catch (value) {
    if (current !== version) return
    problem.value = normalizeProblem(value)
    if ([CORE_PROBLEM_TYPES.orderUpdateConflict, CORE_PROBLEM_TYPES.orderNotEditable, CORE_PROBLEM_TYPES.orderReviewUnavailable].includes(problem.value.type)) locked.value = true
  } finally { if (current === version) busy.value = false }
}
function calculatePrice() {
  pricingExpanded.value = true
  return pricingFocusAfter(() => mutatePricing(), () => validationFields(problem.value))
}
async function confirmPrice() {
  confirmingPrice.value = false
  pricingExpanded.value = true
  await pricingFocusAfter(() => mutatePricing(true), () => validationFields(problem.value))
}
function apply(value) {
  details.value = validateOrderDetails(value, ops.value, number.value)
  pricing.value = null
  form.value = productForm(value.product, ops.value.productLimits)
  baseline.value = JSON.stringify(form.value)
  locked.value = false
}

async function load() {
  rejectionOpen.value = false
  const current = ++version
  busy.value = true
  problem.value = null
  pricing.value = null
  pricingOps.value = null
  pricingDraft.value = null; pricingBaseline.value = ''; pricingEditing.value = false
  try {
    const catalog = await session.getOrderOps()
    if (current !== version) return
    ops.value = catalog
    const value = await session.orderRequest(`/orders/${number.value}`)
    if (current !== version) return
    apply(value)
    const metadata = await session.orderRequest('/orders/pricing/ops')
    if (current !== version) return
    pricingOps.value = validatePricingOps(metadata)
    const calculation = await session.orderRequest(`/orders/${number.value}/pricing`)
    if (current === version) applyPricing(calculation)
  } catch (value) {
    if (current === version) problem.value = normalizeProblem(value)
  } finally { if (current === version) busy.value = false }
}

async function saveAction() {
  if (busy.value || productSaveBlocked.value || pricingDirty.value || pricingEditing.value) return
  const current = ++version
  busy.value = true
  problem.value = null
  try {
    const result = await session.orderRequest(`/orders/${number.value}/product`, {
      method:'PUT', headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify(productPayload(form.value, ops.value.productLimits, details.value.updatedAt))
    })
    if (current === version) {
      apply(result)
      return true
    }
  } catch (value) {
    if (current !== version) return
    problem.value = normalizeProblem(value)
    if ([CORE_PROBLEM_TYPES.orderUpdateConflict, CORE_PROBLEM_TYPES.orderNotEditable, CORE_PROBLEM_TYPES.orderReviewUnavailable].includes(problem.value.type)) locked.value = true
  } finally { if (current === version) busy.value = false }
}

async function rejectReview() {
  if (busy.value || locked.value || dirty.value || !canRejectReview.value || !rejectionOpen.value) return
  const reason = rejectionReason.value.trim()
  if (!reason || reason.length > 2000) {
    problem.value = createInternalProblem('invalidInput', { errors:{ reason:[!reason ? 'Укажите причину.' : 'Причина не должна превышать 2000 символов.'] } })
    return
  }
  const current = ++version
  busy.value = true; problem.value = null
  try {
    const result = await session.orderRequest(`/orders/${number.value}/review/reject`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ expectedUpdatedAt:details.value.updatedAt, reason })
    })
    if (current !== version) return
    const rejected = validateOrderDetails(result, ops.value, number.value)
    if (rejected.status !== 600) throw createInternalProblem('protocolError')
    apply(rejected); rejectionOpen.value = false; rejectionReason.value = ""
    await load()
  } catch (value) {
    if (current === version) { problem.value = normalizeProblem(value); if ([CORE_PROBLEM_TYPES.orderUpdateConflict, CORE_PROBLEM_TYPES.orderNotEditable, CORE_PROBLEM_TYPES.orderReviewUnavailable].includes(problem.value.type)) locked.value = true }
  } finally { if (current === version) busy.value = false }
}
const rejectionFocus = useValidationFocus(rejectionRoot, { context:() => [session.user.value?.id, number.value], active:() => rejectionOpen.value, ready:() => !busy.value })
function submitRejection() { return rejectionFocus(rejectReview, () => validationFields(problem.value)) }

function ask(action, history = false) {
  cancelConfirmation()
  historyContinuation.value = history
  if (!dirty.value) return action()
  confirmation.value = true
  confirmAction = action
}
function cancelConfirmation() {
  confirmation.value = false
  const action = confirmAction
  confirmAction = null
  action?.(false)
}
function discardDrafts() {
  costSummary.value?.cancelEdits()
  if (form.value) form.value = JSON.parse(baseline.value)
  if (pricingDraft.value) pricingDraft.value = JSON.parse(pricingBaseline.value)
  pricingEditing.value = false
}
function acceptConfirmation() {
  if (continuing.value) return
  discardDrafts()
  confirmation.value = false
  const action = confirmAction
  confirmAction = null
  action?.(true)
}
async function saveAndContinue() {
  if (!historyContinuation.value || !confirmAction || continuing.value || busy.value) return
  const action = confirmAction
  confirmation.value = false
  continuing.value = true
  let saved = false
  try {
    await nextTick()
    if (action !== confirmAction) return
    if (pricingEditing.value && !costSummary.value?.applyEdits()) return
    if (productDirty.value) { productExpanded.value = true; saved = await focusAfter(() => saveAction(), productValidationFields) }
    else if (pricingDirty.value) saved = await calculatePrice()
    else saved = !locked.value
  } finally {
    continuing.value = false
    if (action === confirmAction) {
      confirmAction = null
      action?.(saved === true)
    }
  }
}
async function openHistory() {
  try { await router.push(`/orders/${number.value}/history`) }
  catch (value) { problem.value = normalizeProblem(value) }
}
function refresh() {
  if (busy.value || continuing.value) return
  ask(accepted => { if (accepted !== false) load() })
}
async function back() {
  try { await router.push('/orders') }
  catch (value) { problem.value = normalizeProblem(value) }
}
onBeforeRouteLeave(to => {
  if (busy.value || continuing.value) return false
  if (!dirty.value) return true
  return new Promise(resolve => ask(resolve, to?.path === `/orders/${number.value}/history`))
})
onBeforeRouteUpdate((to, from) => {
  if (busy.value || continuing.value) return false
  if (to.params.orderNumber === from.params.orderNumber || !dirty.value) return true
  return new Promise(resolve => ask(accepted => resolve(accepted !== false)))
})
function beforeUnload(event) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
function clear() {
  rejectionOpen.value = false; rejectionReason.value = ""
  version += 1
  details.value = null
  form.value = null
  ops.value = null
  pricing.value = null
  pricingOps.value = null
  pricingDraft.value = null; pricingBaseline.value = ''; pricingEditing.value = false; confirmingPrice.value = false
  baseline.value = ''
  problem.value = null
  busy.value = false
  cancelConfirmation()
}
watch(() => JSON.stringify([session.user.value?.id, session.user.value?.roles]), clear, { flush:'sync' })
watch(form, () => { if (!locked.value) problem.value = null }, { deep:true, flush:'sync' })
watch(() => route.params.orderNumber, () => {
  clear()
  load()
}, { flush:'sync' })
onMounted(() => { globalThis.addEventListener('beforeunload', beforeUnload); load() })
onUnmounted(() => { clear(); globalThis.removeEventListener('beforeunload', beforeUnload) })
function productValidationFields() {
  return [...validationFields(fieldProblem.value), ...validationFields(totalLimitProblem.value, { aliases:{ sellerTotal:'sellerPrice' } })]
}
async function save() {
  productExpanded.value = true
  const saved = await focusAfter(saveAction, productValidationFields)
  if (saved) await back()
  return saved
}

const pricingFocusAfter = useValidationFocus(pricingFocusRoot, { context:() => [session.user.value?.id, route.fullPath], active:() => !confirmation.value && !confirmingPrice.value, ready:() => !busy.value })
const focusAfter = useValidationFocus(focusRoot, { context:() => [session.user.value?.id, route.fullPath], active:() => !confirmation.value, ready:() => !busy.value })
</script>

<template>
  <section class="settings table-wide">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Заказ {{ number }}
      </h1>
      <EditorHeaderActions
        form="order-product-form"
        :loaded="!!details"
        :busy="busy"
        :show-save="!!details?.canEditProduct && can(session.user.value, 'manualQuotes')"
        :save-disabled="productSaveBlocked || !productDirty || pricingDirty || pricingEditing"
        @refresh="refresh"
        @cancel="back"
      >
        <template #leading>
          <div
            v-if="canRejectReview"
            class="header-actions"
          >
            <ActionButton
              v-if="pricingEditable"
              icon="$orderPricing"
              tooltip-text="Рассчитать и сохранить стоимость"
              :disabled="busy || locked || productDirty || pricingEditing"
              @click="calculatePrice"
            />
            <ActionButton
              v-if="pricingEditable"
              icon="$confirmQuote"
              tooltip-text="Подтвердить сохранённый расчёт"
              :disabled="busy || !canConfirmPrice"
              @click="confirmingPrice = true"
            />
            <ActionButton
              icon="$cannotDeliver"
              tooltip-text="Не можем привезти"
              :disabled="busy || dirty || locked"
              @click="rejectionOpen = true; rejectionReason = ''; problem = null"
            />
          </div>
        </template>
        <template #before>
          <ActionButton
            icon="$audit"
            tooltip-text="История заказа"
            :disabled="busy || continuing || !details"
            @click="openHistory"
          />
        </template>
      </EditorHeaderActions>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="rejectionOpen ? null : pageProblem" />
    <p
      v-if="busy && !details"
      role="status"
    >
      Загрузка заказа…
    </p>
    <p v-if="visibleReviewReason">
      Причина: {{ visibleReviewReason }}
    </p>
    <template v-if="details && form">
      <div class="order-meta">
        <OrderStatusBadge
          class="order-state"
          :status="details.status"
          :ops="ops"
        >
          <span
            v-if="pricing?.confirmed && !pricing.expired"
            class="order-validity"
          >действует до {{ moscowTime(pricing.validUntil) }}</span>
        </OrderStatusBadge>
        <span class="order-dates">Заказ создан: {{ moscowTime(details.createdAt) }}, обновлён: {{ moscowTime(details.updatedAt) }}</span>
        <a
          v-if="safeOrderSource(details.sourceUrl)"
          class="product-page-link"
          :href="safeOrderSource(details.sourceUrl)"
          :title="details.sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
        >Страница товара</a>
        <span
          v-else
          class="product-page-link"
        >Страница товара недоступна</span>
      </div>
      <p
        v-if="locked"
        role="status"
      >
        Данные заказа изменились. Обновите карточку перед сохранением.
      </p>
      <p
        v-else-if="limitRatesUnavailable"
        role="status"
      >
        Исправление товара временно недоступно: не удалось получить общую пару курсов {{ dollarSymbol }}/{{ rubSymbol }} и {{ euroSymbol }}/{{ rubSymbol }}.
      </p>
      <CollapsibleSection
        v-model="productExpanded"
        title="Товар"
      >
        <form
          id="order-product-form"
          ref="focusRoot"
          class="editor-form staff-form order-editor"
          novalidate
          @submit.prevent="save"
        >
          <fieldset
            class="product-grid staff-form-grid"
            :disabled="busy || !productEditingEnabled || pricingDirty || pricingEditing"
          >
            <div class="product-name-cell">
              <FormField
                v-model="form.productName"
                name="productName"
                label="Название товара"
                :problem="fieldProblem"
              />
            </div>
            <div class="store-cell">
              <FormField
                v-model="form.storeName"
                name="storeName"
                label="Магазин"
                :problem="fieldProblem"
              />
            </div>
            <div class="price-cell">
              <FormField
                v-model="form.sellerPrice"
                name="sellerPrice"
                :label="`Цена за единицу, ${dollarSymbol}`"
                inputmode="decimal"
                :problem="fieldProblem"
              >
                <template #control="{ controlAttrs }">
                  <input
                    v-model="form.sellerPrice"
                    v-bind="controlAttrs"
                    :aria-invalid="controlAttrs['aria-invalid'] || !!totalLimitProblem"
                    :aria-describedby="`${controlAttrs['aria-describedby']} sellerTotal-error`"
                  >
                </template>
              </FormField>
            </div>
            <div class="quantity-cell">
              <FormField
                v-model="form.quantity"
                name="quantity"
                label="Количество"
                inputmode="numeric"
                :problem="fieldProblem"
              />
            </div>
            <div class="total-line">
              <FormField
                name="sellerTotal"
                :label="`Общая цена, ${dollarSymbol}`"
                :problem="totalLimitProblem"
              >
                <template #control="{ controlAttrs }">
                  <output
                    v-bind="controlAttrs"
                    class="staff-form-value staff-form-value--readonly"
                  >{{ total }}</output>
                </template>
              </FormField>
            </div>
            <div class="color-cell">
              <FormField
                v-model="form.color"
                name="color"
                label="Цвет"
                :problem="fieldProblem"
              />
            </div>
            <div class="size-cell">
              <FormField
                v-model="form.size"
                name="size"
                label="Размер"
                :problem="fieldProblem"
              />
            </div>
            <div class="form-field comment-cell">
              <label for="comment">Комментарий</label>
              <textarea
                id="comment"
                v-model="form.comment"
                name="comment"
                rows="3"
                :aria-invalid="problemFieldErrors(fieldProblem, 'comment').length > 0"
                aria-describedby="comment-error"
              />
              <div
                id="comment-error"
                class="field-error"
              >
                <span
                  v-for="error in problemFieldErrors(fieldProblem, 'comment')"
                  :key="error"
                >{{ error }}</span>
              </div>
            </div>
          </fieldset>
        </form>
        <div class="recognition">
          <img
            v-if="safeOrderSource(details.imageUrl)"
            :src="safeOrderSource(details.imageUrl)"
            alt="Изображение товара"
            referrerpolicy="no-referrer"
            loading="lazy"
          >
          <p v-if="details.dimensions">
            Габариты: {{ details.dimensions.lengthCm }} × {{ details.dimensions.widthCm }} × {{ details.dimensions.heightCm }} см
          </p>
          <dl v-if="details.characteristics">
            <div
              v-for="(value, key) in details.characteristics"
              :key="key"
            >
              <dt>{{ key }}</dt><dd>{{ value }}</dd>
            </div>
          </dl>
        </div>
      </CollapsibleSection>
      <div ref="pricingFocusRoot">
        <OrderCostSummary
          ref="costSummary"
          v-model="pricingExpanded"
          :pricing="pricing"
          :ops="pricingOps"
          :loading="busy"
          :draft="pricingDraft"
          :editable="!!pricingEditable"
          :disabled="busy || locked || productDirty"
          :problem="pricingFields.length ? problem : null"
          @editing-change="pricingEditing = $event"
          @amount-change="(service, value) => pricingDraft.manualAmounts[service] = value"
        />
      </div>
      <CollapsibleSection
        v-for="block in informationBlocks"
        :key="block.kind"
        :title="block.title"
      >
        <dl
          class="information-grid staff-form staff-form-grid"
          :data-information="block.kind"
        >
          <div
            v-for="field in block.fields"
            :key="field.key"
            class="staff-form-row information-field"
            :class="[block.kind === 'customer' ? 'buyer-field' : 'delivery-field', { 'full-width':field.wide }]"
          >
            <dt class="staff-form-label">
              {{ field.label }}
            </dt><dd class="staff-form-value staff-form-value--readonly">
              {{ field.value }}
            </dd>
          </div>
        </dl>
      </CollapsibleSection>
    </template>
    <v-dialog
      v-model="rejectionOpen"
      :persistent="busy"
      max-width="560"
      aria-labelledby="review-rejection-title"
    >
      <section
        ref="rejectionRoot"
        class="confirm-card"
      >
        <h2 id="review-rejection-title">
          Не можем привезти
        </h2>
        <PageAlertRegion :problem="rejectionPageProblem" />
        <p v-if="locked">
          Заказ изменился. Обновите данные заказа перед повторной проверкой.
        </p>
        <ActionButton
          v-if="locked"
          label="Обновить заказ"
          icon="$refresh"
          tooltip-text="Обновить заказ"
          :disabled="busy"
          @click="load"
        />
        <FormField
          v-model="rejectionReason"
          name="reason"
          label="Причина"
          :problem="problem"
          :disabled="busy"
        />
        <ActionButton
          label="Отмена"
          icon="$close"
          tooltip-text="Отмена"
          :disabled="busy"
          @click="rejectionOpen = false"
        />
        <ActionButton
          label="Завершить проверку"
          icon="$save"
          tooltip-text="Завершить проверку"
          :disabled="busy || locked || !rejectionReason.trim()"
          @click="submitRejection"
        />
      </section>
    </v-dialog>
    <ConfirmDialog
      :open="confirmation"
      :title="historyContinuation ? 'Сохранить изменения?' : 'Отменить изменения?'"
      :message="historyContinuation ? 'Сохраните изменения перед продолжением?' : 'Несохранённые изменения будут потеряны.'"
      :action="historyContinuation ? 'Сохранить и продолжить' : 'Не сохранять и продолжить'"
      :action-variant="historyContinuation ? 'blue' : 'orange'"
      :secondary-action="historyContinuation ? 'Не сохранять и продолжить' : ''"
      :action-icon="historyContinuation ? '$saveChanges' : '$continue'"
      :busy="busy || continuing"
      :action-disabled="historyContinuation && productDirty && productSaveBlocked"
      @cancel="cancelConfirmation"
      @confirm="historyContinuation ? saveAndContinue() : acceptConfirmation()"
      @secondary="acceptConfirmation"
    />
    <ConfirmDialog
      :open="confirmingPrice"
      title="Подтвердить расчёт?"
      :message="`Сохранённые компоненты, курс и сумма будут зафиксированы на ${pricingOps?.validityHours ?? ''} ч. Дальнейшее изменение недоступно.`"
      action="Подтвердить"
      action-icon="$confirmQuote"
      @cancel="confirmingPrice = false"
      @confirm="confirmPrice"
    />
  </section>
</template>

<style scoped>
.order-meta { display:flex; flex-wrap:wrap; align-items:center; gap:12px 24px; margin-bottom:20px; color:#526a80; }
.order-validity { color:inherit; font-size:14px; font-weight:500; }
.order-dates { color:#68798b; font-size:13px; }
.product-page-link { margin-left:auto; color:#1976d2; font-size:13px; font-weight:500; }
.product-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); grid-template-areas:"name name" "store price" "quantity total" "color size" "comment comment"; column-gap:24px; }
.information-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); column-gap:24px; }
.full-width { grid-column:1 / -1; }
.product-name-cell { grid-area:name; }
.store-cell { grid-area:store; }
.price-cell { grid-area:price; }
.quantity-cell { grid-area:quantity; }
.total-line { grid-area:total; }
.color-cell { grid-area:color; }
.size-cell { grid-area:size; }
.comment-cell { grid-area:comment; }
.product-grid :deep(.form-field), .total-line, .comment-cell, .information-field { grid-template-columns:minmax(220px, 280px) minmax(0, 1fr); }
.product-grid :deep(.form-field > input), .product-grid :deep(.field-error), .comment-cell textarea, .comment-cell .field-error { grid-column:2; }
.order-editor textarea { width:100%; resize:vertical; min-height:80px; }
.information-grid { margin-top:12px; }
.information-grid dd { margin:0; overflow-wrap:anywhere; font-weight:400; }
.recognition { overflow-wrap:anywhere; }
.recognition img { max-width:160px; max-height:160px; object-fit:contain; }
@media(max-width:1100px) { .product-grid :deep(.form-field), .total-line, .comment-cell, .information-field { grid-template-columns:minmax(160px, 220px) minmax(0, 1fr); } }
@media(max-width:900px) { .product-grid { grid-template-columns:1fr; grid-template-areas:"name" "store" "price" "quantity" "total" "color" "size" "comment"; } .information-grid { grid-template-columns:1fr; } .full-width { grid-column:1; } .product-page-link { flex-basis:100%; margin-left:0; } }
@media(max-width:600px) { .product-grid :deep(.form-field), .total-line, .comment-cell, .information-field { grid-template-columns:1fr; gap:5px; align-items:start; } .product-grid :deep(.form-field > input), .product-grid :deep(.field-error), .comment-cell textarea, .comment-cell .field-error { grid-column:1; } }
@media(max-width:550px) { .header-with-actions { flex-wrap:wrap; } .header-with-actions h1 { flex-basis:100%; } }
</style>
