<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed, ref } from 'vue'
import { PaidIndicator } from '../paidIndicator.js'
import { associatedFieldErrors } from '../errors/problem.js'
import { formatMoneyAmount } from '../moneyFormatting.js'
import ListText from './ListText.vue'
import CollapsibleSection from './CollapsibleSection.vue'
import ServiceStatusIcon from './ServiceStatusIcon.vue'
import InlineEditableField from './InlineEditableField.vue'
import PriceTotalContext from './PriceTotalContext.vue'
import { manualPricingTariffs, pricingPayload, optionalServices } from '../orderPricing.js'

const props = defineProps({ pricing:{ type:Object, default:null }, ops:{ type:Object, default:null }, loading:Boolean, draft:{ type:Object, default:null }, editable:Boolean, disabled:Boolean, customsPaid:Boolean, problem:{ type:Object, default:null } })
const expanded = defineModel({ type:Boolean, default:true })
const errors = computed(() => associatedFieldErrors(props.problem, 'manualAmounts'))
const emit = defineEmits(['editing-change', 'amount-change'])
const editing = ref(new Set())
const editors = new Map()
function editorRef(service, value) { if (value) editors.set(service, value); else editors.delete(service) }
function applyEdits() {
  expanded.value = true
  for (const editor of editors.values()) if (!editor.validateEdit()) return false
  for (const editor of editors.values()) editor.applyEdit()
  return true
}
function cancelEdits() { for (const editor of editors.values()) editor.cancelEdit() }
defineExpose({ applyEdits, cancelEdits })
function editChanged(service, active) {
  if (active) editing.value.add(service)
  else editing.value.delete(service)
  emit('editing-change', editing.value.size > 0)
}
function manual(component, alias) {
  return props.draft && serviceStatus(component.service) !== 'notOrdered' && manualPricingTariffs(props.pricing, props.ops).some(item => item.service === component.service && item.currency === currency(alias).value)
}
function validateAmount(value, service) {
  try { pricingPayload({ selectedServices:[], manualAmounts:{ [service]:value } }, props.pricing.updatedAt, props.ops); return '' }
  catch { return 'Укажите неотрицательную сумму с двумя дробными знаками.' }
}
const currency = alias => props.ops.catalogue.currencies.find(item => item.routeAlias === alias)
const money = amount => amount === null ? '—' : formatMoneyAmount(amount)
const service = value => props.ops.catalogue.services.find(item => item.value === value)
const isCustoms = component => service(component.service).routeAlias === 'customs-payments'
const state = component => isCustoms(component) && component.state === 0 && component.amountRub === 0
  ? 'Не ожидаются' : props.ops.componentStates.find(item => item.value === component.state).name
function serviceStatus(value) {
  if (!optionalServices(props.ops).some(item => item.value === value)) return 'mandatory'
  return props.pricing.calculation.inputs.selectedServices.includes(value) ? 'ordered' : 'notOrdered'
}
const components = computed(() => props.pricing.calculation.components.filter(item => service(item.service).includedInTotal))
const excludedComponents = computed(() => props.pricing.calculation.components.filter(item => !service(item.service).includedInTotal))
function toUsd(amount) {
  const rate = props.pricing.calculation.exchangeRate
  return amount === null || rate === null ? null : amount * rate.nominal / rate.officialRate
}
function prices(component) {
  const originalCurrency = component.tariff?.currency ?? component.currency
  return [
    { alias:'usd', amount:component.currency === currency('usd').value ? component.amount : toUsd(component.amountRub) },
    { alias:'rub', amount:component.amountRub }
  ].map(item => ({ ...item, original:item.amount !== null && currency(item.alias).value === originalCurrency }))
}
</script>

<template>
  <CollapsibleSection
    v-model="expanded"
    title="Услуги и стоимость"
  >
    <template v-if="pricing && ops">
      <p
        v-if="pricing.expired"
        role="status"
      >
        Срок расчёта истёк. Показаны сохранённые финансовые значения.
      </p>
      <p
        v-if="editable"
        class="field-hint"
      >
        Для таможенных платежей 0 означает, что платежи не ожидаются.
      </p>
      <div class="table-card staff-form">
        <v-table
          class="interlaced-table cost-table"
          density="compact"
        >
          <thead>
            <tr>
              <th scope="col">
                Услуга
              </th>
              <th
                scope="col"
                class="service-status-column"
                aria-label="Статус услуги"
              />
              <th scope="col">
                Состояние
              </th>
              <th scope="col">
                Стоимость, {{ currency('usd').symbol }}
              </th>
              <th scope="col">
                Стоимость, {{ currency('rub').symbol }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="component in components"
              :key="component.service"
            >
              <th scope="row">
                <ListText :text="service(component.service).name" />
              </th>
              <td class="service-status-column">
                <ServiceStatusIcon :status="serviceStatus(component.service)" />
              </td>
              <td><ListText :text="state(component)" /></td>
              <td
                v-for="price in prices(component)"
                :key="price.alias"
                :class="{ 'original-price':price.original }"
                :aria-label="price.original ? `${money(price.amount)} — исходная стоимость` : undefined"
              >
                <div class="paid-amount">
                  <InlineEditableField
                    v-if="editable && manual(component, price.alias)"
                    :id="`manualAmount${component.service}`"
                    :ref="value => editorRef(component.service, value)"
                    :model-value="draft.manualAmounts[component.service]"
                    :label="`${service(component.service).name}, ${currency(price.alias).symbol}`"
                    :edit-tooltip="`Изменить стоимость: ${service(component.service).name}`"
                    inputmode="decimal"
                    editable
                    :disabled="disabled"
                    :validate="value => validateAmount(value, component.service)"
                    validation-field="manualAmounts"
                    :invalid="errors.length > 0"
                    described-by="manual-amounts-error"
                    @update:model-value="emit('amount-change', component.service, $event === '' ? '' : Number($event.replace(',', '.')).toFixed(2).replace('.', ','))"
                    @editing-change="editChanged(component.service, $event)"
                  />
                  <ListText
                    v-else
                    :text="money(price.amount)"
                  />
                  <PaidIndicator
                    :paid="customsPaid && isCustoms(component) && price.alias === 'rub'"
                    label="Таможенная пошлина оплачена"
                  />
                </div>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="table-total-row">
              <th
                scope="row"
                colspan="3"
              >
                <PriceTotalContext
                  :confirmed="pricing.confirmed"
                  :exchange-rate="pricing.calculation.exchangeRate"
                  :currencies="ops.catalogue.currencies"
                />
              </th>
              <td>{{ money(toUsd(pricing.calculation.totalRub)) }}</td>
              <td>{{ money(pricing.calculation.totalRub) }}</td>
            </tr>
            <tr
              v-for="component in excludedComponents"
              :key="component.service"
            >
              <th scope="row">
                <ListText :text="service(component.service).name" />
                <small class="price-note">Не входит в итог</small>
              </th>
              <td class="service-status-column">
                <ServiceStatusIcon :status="serviceStatus(component.service)" />
              </td>
              <td><ListText :text="state(component)" /></td>
              <td
                v-for="price in prices(component)"
                :key="price.alias"
                :class="{ 'original-price':price.original }"
                :aria-label="price.original ? `${money(price.amount)} — исходная стоимость` : undefined"
              >
                <div class="paid-amount">
                  <InlineEditableField
                    v-if="editable && manual(component, price.alias)"
                    :id="`manualAmount${component.service}`"
                    :ref="value => editorRef(component.service, value)"
                    :model-value="draft.manualAmounts[component.service]"
                    :label="`${service(component.service).name}, ${currency(price.alias).symbol}`"
                    :edit-tooltip="`Изменить стоимость: ${service(component.service).name}`"
                    inputmode="decimal"
                    editable
                    :disabled="disabled"
                    :validate="value => validateAmount(value, component.service)"
                    validation-field="manualAmounts"
                    :invalid="errors.length > 0"
                    described-by="manual-amounts-error"
                    @update:model-value="emit('amount-change', component.service, $event === '' ? '' : Number($event.replace(',', '.')).toFixed(2).replace('.', ','))"
                    @editing-change="editChanged(component.service, $event)"
                  />
                  <ListText
                    v-else
                    :text="money(price.amount)"
                  />
                  <PaidIndicator
                    :paid="customsPaid && isCustoms(component) && price.alias === 'rub'"
                    label="Таможенная пошлина оплачена"
                  />
                </div>
              </td>
            </tr>
          </tfoot>
        </v-table>
      </div>
      <div
        v-if="editable"
        id="manual-amounts-error"
        class="field-error"
      >
        <span
          v-for="error in errors"
          :key="error"
        >{{ error }}</span>
      </div>
    </template>
    <p
      v-else
      role="status"
    >
      {{ loading ? 'Загрузка стоимости…' : 'Стоимость недоступна. Обновите заказ, чтобы повторить загрузку.' }}
    </p>
  </CollapsibleSection>
</template>

<style scoped>
.cost-table :deep(table) { min-width:560px; table-layout:fixed; }
.cost-table :deep(th:first-child) { width:34%; }
.cost-table .service-status-column { width:52px; text-align:center; }
.original-price { font-weight:700; }
.paid-amount { display:flex; align-items:center; }
</style>
