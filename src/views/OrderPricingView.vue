<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import EditorHeaderActions from '../components/EditorHeaderActions.vue'
import FormField from '../components/FormField.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { formPageProblem, normalizeProblem, PROBLEM_TYPE_ROOT } from '../errors/problem.js'
import { useSession } from '../stores/session.js'
import { can } from '../roles.js'
import { serviceCatalogueIdentity } from '../serviceCatalogue.js'
import { manualPricingTariffs, optionalServices, pricingForm, pricingPayload, validateOrderPricing, validatePricingOps } from '../orderPricing.js'
import { useDiscardChanges } from '../useDiscardChanges.js'
import { useValidationFocus, validationFields } from '../validationFocus.js'
import { formatMoneyAmount } from '../moneyFormatting.js'
import { moscowTime } from '../consentFormatting.js'

const session = useSession(), route = useRoute(), router = useRouter()
const number = computed(() => route.params.orderNumber)
const details = ref(null), ops = ref(null), form = ref(null), baseline = ref(''), problem = ref(null)
const busy = ref(false), locked = ref(false), confirming = ref(false), focusRoot = ref(null)
let generation = 0
const dirty = computed(() => !!form.value && JSON.stringify(form.value) !== baseline.value)
const editable = computed(() => details.value?.canEdit && ops.value?.canManage && can(session.user.value, 'manageOrderPricing'))
const canConfirm = computed(() => editable.value && details.value?.canConfirm && !dirty.value && !locked.value)
const manual = computed(() => details.value && ops.value ? manualPricingTariffs(details.value, ops.value) : [])
const fields = ['domesticDeliveryRub', 'customsRub', 'manualAmounts', 'selectedServices']
const pageProblem = computed(() => formPageProblem(problem.value, form.value ? fields : []))
const { confirmation, confirmDiscard, finish } = useDiscardChanges(dirty)
const focusAfter = useValidationFocus(focusRoot, { context:() => [serviceCatalogueIdentity(session.user.value), route.fullPath], active:() => !confirming.value && !confirmation.value, ready:() => !busy.value })
const serviceName = value => ops.value.catalogue.services.find(item => item.value === value).name
const stateName = value => ops.value.componentStates.find(item => item.value === value).name
const currencySymbol = value => ops.value.catalogue.currencies.find(item => item.value === value).symbol
const rubSymbol = computed(() => ops.value?.catalogue.currencies.find(item => item.routeAlias === 'rub')?.symbol ?? '')
const usdSymbol = computed(() => ops.value?.catalogue.currencies.find(item => item.routeAlias === 'usd')?.symbol ?? '')
const money = value => value === null ? '—' : formatMoneyAmount(value)

function apply(value) {
  details.value = validateOrderPricing(value, ops.value, number.value)
  form.value = pricingForm(value, ops.value)
  baseline.value = JSON.stringify(form.value)
  locked.value = false
}
async function load() {
  const current = ++generation
  busy.value = true; problem.value = null
  try {
    const metadata = await session.orderRequest('/orders/pricing/ops')
    if (current !== generation) return
    ops.value = validatePricingOps(metadata)
    const value = await session.orderRequest(`/orders/${number.value}/pricing`)
    if (current === generation) apply(value)
  } catch (error) { if (current === generation) problem.value = normalizeProblem(error) }
  finally { if (current === generation) busy.value = false }
}
async function refresh() {
  if (busy.value) return
  const current = generation
  if (await confirmDiscard() && current === generation) await load()
}
async function mutate(confirm) {
  if (busy.value || locked.value || !editable.value || confirm && !canConfirm.value) return
  const current = ++generation
  problem.value = null
  try {
    const payload = confirm ? { expectedUpdatedAt:details.value.updatedAt } : pricingPayload(form.value, details.value.updatedAt, ops.value)
    busy.value = true
    const value = await session.orderRequest(`/orders/${number.value}/pricing${confirm ? '/confirm' : ''}`, {
      method:confirm ? 'POST' : 'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload)
    })
    if (current === generation) apply(value)
  } catch (error) {
    if (current === generation) {
      problem.value = normalizeProblem(error)
      if (['order-update-conflict', 'order-not-editable'].some(code => problem.value.type === `${PROBLEM_TYPE_ROOT}${code}`)) locked.value = true
    }
  } finally { if (current === generation) busy.value = false }
}
function save() { return focusAfter(() => mutate(false), () => validationFields(problem.value)) }
async function confirm() { confirming.value = false; await mutate(true) }
async function back() {
  try { await router.push(`/orders/${number.value}`) }
  catch (error) { problem.value = normalizeProblem(error) }
}
function clear() {
  generation++; details.value = null; ops.value = null; form.value = null; baseline.value = ''; problem.value = null
  busy.value = false; locked.value = false; confirming.value = false; finish(false)
}
watch(() => serviceCatalogueIdentity(session.user.value), clear, { flush:'sync' })
watch(number, () => { clear(); load() })
onMounted(load)
onUnmounted(clear)
</script>

<template>
  <section class="settings table-wide">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Расчёт заказа {{ number }}
      </h1>
      <EditorHeaderActions
        form="order-pricing-form"
        :loaded="!!details"
        :busy="busy"
        :show-save="!!editable"
        :save-disabled="locked"
        @refresh="refresh"
        @cancel="back"
      >
        <template #before>
          <ActionButton
            v-if="editable"
            icon="$confirmQuote"
            tooltip-text="Подтвердить сохранённый расчёт"
            :disabled="busy || !canConfirm"
            @click="confirming = true"
          />
        </template>
      </EditorHeaderActions>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="pageProblem" />
    <p
      v-if="locked"
      role="status"
    >
      Заказ изменился. Обновите расчёт перед сохранением.
    </p>
    <p
      v-if="busy && !details"
      role="status"
    >
      Загрузка расчёта…
    </p>
    <template v-if="details && ops && form">
      <h2>{{ details.confirmed ? 'Подтверждённая стоимость' : 'Прогнозная стоимость' }}: {{ money(details.calculation.totalRub) }}{{ rubSymbol }}</h2>
      <p v-if="details.calculation.exchangeRate">
        ЦБ РФ: {{ details.calculation.exchangeRate.nominal }}{{ currencySymbol(details.calculation.exchangeRate.baseCurrency) }} = {{ details.calculation.exchangeRate.officialRate }}{{ currencySymbol(details.calculation.exchangeRate.quoteCurrency) }}; {{ details.calculation.exchangeRate.sourceEffectiveDate }}
      </p>
      <p v-else>
        {{ usdSymbol }} — не удалось получить курс
      </p>
      <p v-if="details.confirmed">
        {{ details.expired ? 'Срок расчёта истёк' : 'Расчёт действует до' }} {{ moscowTime(details.validUntil) }}. Финансовые значения сохранены.
      </p>
      <div class="staff-form">
        <div
          v-for="component in details.calculation.components"
          :key="component.service"
          class="form-field"
        >
          <label>{{ serviceName(component.service) }}</label>
          <span>{{ stateName(component.state) }}: {{ money(component.amount) }}{{ currencySymbol(component.currency) }} / {{ money(component.amountRub) }}{{ rubSymbol }}</span>
        </div>
      </div>
      <form
        id="order-pricing-form"
        ref="focusRoot"
        class="editor-form staff-form"
        novalidate
        @submit.prevent="save"
      >
        <fieldset :disabled="busy || locked || !editable">
          <legend>Параметры расчёта</legend>
          <div
            v-for="item in optionalServices(ops)"
            :key="item.value"
            class="form-field"
          >
            <label :for="`selected-${item.value}`">{{ item.name }}</label>
            <input
              :id="`selected-${item.value}`"
              v-model="form.selectedServices"
              class="check"
              name="selectedServices"
              type="checkbox"
              :value="item.value"
            >
          </div>
          <FormField
            v-for="(item, index) in manual"
            :key="item.id"
            v-model="form.manualAmounts[item.service]"
            :name="index === 0 ? 'manualAmounts' : `manualAmount${item.service}`"
            :label="`${serviceName(item.service)}, ${currencySymbol(item.currency)}`"
            inputmode="decimal"
            :problem="problem"
          />
          <FormField
            v-model="form.domesticDeliveryRub"
            name="domesticDeliveryRub"
            :label="`Доставка по РФ, ${rubSymbol}`"
            inputmode="decimal"
            :problem="problem"
            hint="Отдельный расход; не входит в стоимость расчёта. Покупателю доступен после ввода адреса или выбора ПВЗ."
          />
          <FormField
            v-model="form.customsRub"
            name="customsRub"
            :label="`Таможенная пошлина, ${rubSymbol}`"
            inputmode="decimal"
            :problem="problem"
            hint="Отдельный расход; не входит в стоимость расчёта. Покупателю доступен после положительной проверки."
          />
        </fieldset>
      </form>
      <details>
        <summary>История расчётов</summary>
        <div
          v-for="item in details.history"
          :key="item.id"
        >
          <p>{{ moscowTime(item.at) }} — {{ item.actorName ?? 'Система' }} — {{ item.validUntil ? 'Подтверждён' : 'Прогноз' }}: {{ money(item.calculation.totalRub) }}{{ rubSymbol }}</p>
        </div>
      </details>
    </template>
    <ConfirmDialog
      :open="confirmation"
      title="Отменить изменения?"
      message="Несохранённые параметры будут потеряны."
      action="Продолжить без сохранения"
      action-icon="$continue"
      @cancel="finish(false)"
      @confirm="finish(true)"
    />
    <ConfirmDialog
      :open="confirming"
      title="Подтвердить расчёт?"
      :message="`Сохранённые компоненты, курс и сумма будут зафиксированы на ${ops?.validityHours ?? ''} ч. Дальнейшее изменение недоступно.`"
      action="Подтвердить"
      action-icon="$confirmQuote"
      @cancel="confirming = false"
      @confirm="confirm"
    />
  </section>
</template>
