<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EditorHeaderActions from '../components/EditorHeaderActions.vue'
import FormField from '../components/FormField.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { moscowTime } from '../consentFormatting.js'
import { CORE_PROBLEM_TYPES, hasOnlyPresentedFieldErrors, normalizeProblem, problemFieldErrors } from '../errors/problem.js'
import { formatMoneyAmount } from '../moneyFormatting.js'
import { orderStatusName, safeOrderSource } from '../orderFormatting.js'
import { CUSTOMER_FIELDS, PRODUCT_FIELDS, priceCents, productForm, productPayload, productValidation, validateOrderDetails } from '../orderProduct.js'
import { can } from '../roles.js'
import { useSession } from '../stores/session.js'

const session = useSession()
const route = useRoute()
const router = useRouter()
const number = computed(() => route.params.orderNumber)
const details = ref(null)
const ops = ref(null)
const form = ref(null)
const baseline = ref('')
const busy = ref(false)
const problem = ref(null)
const confirmation = ref(false)
const locked = ref(false)
let version = 0
let confirmAction = null
const dirty = computed(() => form.value !== null && JSON.stringify(form.value) !== baseline.value)
const editable = computed(() => details.value?.canEditProduct && can(session.user.value, 'manualQuotes') && !locked.value)
const productEditingEnabled = computed(() => editable.value && details.value?.limitCheck.available)
const limitRatesUnavailable = computed(() => editable.value && details.value?.limitCheck.available === false)
const localProblem = computed(() => productEditingEnabled.value && form.value
  ? productValidation(form.value, ops.value.productLimits, details.value.limitCheck) : null)
const fieldProblem = computed(() => problem.value ?? localProblem.value)
const pageProblem = computed(() => hasOnlyPresentedFieldErrors(fieldProblem.value, PRODUCT_FIELDS) ? null : fieldProblem.value)
const total = computed(() => {
  const cents = priceCents(form.value?.sellerPrice ?? '')
  const quantity = Number(form.value?.quantity)
  return cents !== null && Number.isSafeInteger(quantity) && quantity > 0
    ? formatMoneyAmount(Number(cents * BigInt(quantity)) / 100) : '—'
})

function apply(value) {
  details.value = validateOrderDetails(value, ops.value, number.value)
  form.value = productForm(value.product, ops.value.productLimits)
  baseline.value = JSON.stringify(form.value)
  locked.value = false
}

async function load() {
  const current = ++version
  busy.value = true
  problem.value = null
  try {
    const catalog = await session.getOrderOps()
    if (current !== version) return
    ops.value = catalog
    const value = await session.orderRequest(`/orders/${number.value}`)
    if (current === version) apply(value)
  } catch (value) {
    if (current === version) problem.value = normalizeProblem(value)
  } finally { if (current === version) busy.value = false }
}

async function save() {
  if (busy.value || !productEditingEnabled.value || localProblem.value) return
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
      await back()
    }
  } catch (value) {
    if (current !== version) return
    problem.value = normalizeProblem(value)
    if ([CORE_PROBLEM_TYPES.orderUpdateConflict, CORE_PROBLEM_TYPES.orderNotEditable].includes(problem.value.type)) locked.value = true
  } finally { if (current === version) busy.value = false }
}

function ask(action) {
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
function acceptConfirmation() {
  confirmation.value = false
  const action = confirmAction
  confirmAction = null
  action?.(true)
}
function refresh() {
  if (busy.value) return
  ask(accepted => { if (accepted !== false) load() })
}
async function back() {
  try { await router.push('/orders') }
  catch (value) { problem.value = normalizeProblem(value) }
}
onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  return new Promise(resolve => ask(resolve))
})
onBeforeRouteUpdate((to, from) => {
  if (to.params.orderNumber === from.params.orderNumber || !dirty.value) return true
  return new Promise(resolve => ask(accepted => resolve(accepted !== false)))
})
function beforeUnload(event) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
function clear() {
  version += 1
  details.value = null
  form.value = null
  ops.value = null
  baseline.value = ''
  problem.value = null
  busy.value = false
  cancelConfirmation()
}
watch(() => session.user.value?.id, clear, { flush:'sync' })
watch(form, () => { if (!locked.value) problem.value = null }, { deep:true, flush:'sync' })
watch(() => route.params.orderNumber, (next, previous) => {
  if (next !== previous) load()
})
onMounted(() => { globalThis.addEventListener('beforeunload', beforeUnload); load() })
onUnmounted(() => { clear(); globalThis.removeEventListener('beforeunload', beforeUnload) })
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
        :save-disabled="!productEditingEnabled || !!localProblem || !dirty"
        @refresh="refresh"
        @cancel="back"
      />
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="pageProblem" />
    <p
      v-if="busy && !details"
      role="status"
    >
      Загрузка заказа…
    </p>
    <template v-if="details && form">
      <div class="order-meta">
        <span class="status-pill">{{ orderStatusName(details.status, ops) }}</span>
        <span>Создан: {{ moscowTime(details.createdAt) }}</span>
        <span>Обновлён: {{ moscowTime(details.updatedAt) }}</span>
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
        Исправление товара временно недоступно: не удалось получить общую пару курсов USD/RUB и EUR/RUB.
      </p>
      <p v-else-if="!editable">
        Заказ доступен только для просмотра.
      </p>
      <form
        id="order-product-form"
        class="editor-form staff-form order-editor"
        novalidate
        @submit.prevent="save"
      >
        <h2 class="primary-heading">
          Товар
        </h2>
        <fieldset
          class="product-grid"
          :disabled="busy || !productEditingEnabled"
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
              label="Цена за единицу, USD"
              inputmode="decimal"
              :problem="fieldProblem"
            />
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
          <div class="staff-form-row total-line">
            <span class="staff-form-label">Стоимость, USD</span>
            <span class="staff-form-value staff-form-value--readonly">{{ total }}</span>
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
      <h2 class="primary-heading buyer-heading">
        Покупатель
      </h2>
      <dl class="buyer-grid staff-form">
        <div
          v-for="(label, key) in CUSTOMER_FIELDS"
          :key="key"
          class="staff-form-row buyer-field"
          :class="{ 'full-width':key === 'address' }"
        >
          <dt class="staff-form-label">
            {{ label }}
          </dt><dd class="staff-form-value">
            {{ details.customer[key] || 'Не указано' }}
          </dd>
        </div>
      </dl>
    </template>
    <ConfirmDialog
      :open="confirmation"
      title="Отменить изменения?"
      message="Несохранённые изменения будут потеряны."
      action="Продолжить без сохранения"
      @cancel="cancelConfirmation"
      @confirm="acceptConfirmation"
    />
  </section>
</template>

<style scoped>
.order-meta { display:flex; flex-wrap:wrap; align-items:center; gap:12px 24px; margin-bottom:20px; color:#526a80; }
.product-page-link { margin-left:auto; color:#1976d2; font-weight:500; }
.product-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); grid-template-areas:"name name" "store price" "quantity total" "color size" "comment comment"; column-gap:24px; row-gap:16px; }
.buyer-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); column-gap:24px; }
.full-width { grid-column:1 / -1; }
.product-name-cell { grid-area:name; }
.store-cell { grid-area:store; }
.price-cell { grid-area:price; }
.quantity-cell { grid-area:quantity; }
.total-line { grid-area:total; }
.color-cell { grid-area:color; }
.size-cell { grid-area:size; }
.comment-cell { grid-area:comment; }
.product-grid :deep(.form-field), .total-line, .comment-cell, .buyer-field { grid-template-columns:minmax(220px, 280px) minmax(0, 1fr); }
.product-grid :deep(.form-field > input), .product-grid :deep(.field-error), .comment-cell textarea, .comment-cell .field-error { grid-column:2; }
.order-editor textarea { width:100%; resize:vertical; min-height:80px; }
.order-editor h2, .buyer-heading { font-size:20px; margin:12px 0; }
.buyer-heading { border-bottom:1px solid #dbe5ee; padding-bottom:8px; }
.buyer-grid { margin-top:12px; }
.buyer-grid dd { margin:0; overflow-wrap:anywhere; font-weight:400; }
.recognition { overflow-wrap:anywhere; }
.recognition img { max-width:160px; max-height:160px; object-fit:contain; }
@media(max-width:1100px) { .product-grid :deep(.form-field), .total-line, .comment-cell, .buyer-field { grid-template-columns:minmax(160px, 220px) minmax(0, 1fr); } }
@media(max-width:900px) { .product-grid { grid-template-columns:1fr; grid-template-areas:"name" "store" "price" "quantity" "total" "color" "size" "comment"; } .buyer-grid { grid-template-columns:1fr; } .full-width { grid-column:1; } .product-page-link { flex-basis:100%; margin-left:0; } }
@media(max-width:600px) { .product-grid :deep(.form-field), .total-line, .comment-cell, .buyer-field { grid-template-columns:1fr; gap:5px; align-items:start; } .product-grid :deep(.form-field > input), .product-grid :deep(.field-error), .comment-cell textarea, .comment-cell .field-error { grid-column:1; } }
@media(max-width:550px) { .header-with-actions { flex-wrap:wrap; } .header-with-actions h1 { flex-basis:100%; } }
</style>
