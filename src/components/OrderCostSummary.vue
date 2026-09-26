<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed } from 'vue'
import { formatMoneyAmount } from '../moneyFormatting.js'
import { moscowDate } from '../consentFormatting.js'
import ListText from './ListText.vue'
import CollapsibleSection from './CollapsibleSection.vue'
import ServiceStatusIcon from './ServiceStatusIcon.vue'
import { optionalServices } from '../orderPricing.js'

const props = defineProps({ pricing:{ type:Object, default:null }, ops:{ type:Object, default:null }, loading:Boolean })
const currency = alias => props.ops.catalogue.currencies.find(item => item.routeAlias === alias)
const money = amount => amount === null ? '—' : formatMoneyAmount(amount)
const service = value => props.ops.catalogue.services.find(item => item.value === value)
const state = value => props.ops.componentStates.find(item => item.value === value).name
function serviceStatus(value) {
  if (!optionalServices(props.ops).some(item => item.value === value)) return 'mandatory'
  return props.pricing.calculation.inputs.selectedServices.includes(value) ? 'ordered' : 'notOrdered'
}
const components = computed(() => props.pricing.calculation.components.filter(item => service(item.service).routeAlias !== 'domestic-delivery'))
const domesticDelivery = computed(() => props.pricing.calculation.components.find(item => service(item.service).routeAlias === 'domestic-delivery'))
const customsState = computed(() => props.ops.componentStates.find(item => item.routeAlias === (
  props.pricing.calculation.inputs.customsRub === null ? 'not-calculated' : 'calculated'
)).name)
const customs = computed(() => ({ amount:props.pricing.calculation.inputs.customsRub,
  amountRub:props.pricing.calculation.inputs.customsRub, currency:currency('rub').value }))
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
  <CollapsibleSection title="Услуги и стоимость">
    <template v-if="pricing && ops">
      <p>{{ pricing.confirmed ? 'Подтверждённая стоимость' : 'Прогнозная стоимость' }}</p>
      <p
        v-if="pricing.calculation.exchangeRate"
        class="field-hint"
      >
        Курс расчёта стоимости: {{ pricing.calculation.exchangeRate.nominal }} USD = {{ pricing.calculation.exchangeRate.officialRate }} RUB
        (ЦБ РФ, {{ moscowDate(pricing.calculation.exchangeRate.sourceEffectiveDate) }}).
      </p>
      <p
        v-else
        class="field-hint"
      >
        Курс недоступен.
      </p>
      <p
        v-if="pricing.expired"
        role="status"
      >
        Срок расчёта истёк. Показаны сохранённые финансовые значения.
      </p>
      <div class="table-card">
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
              <td><ListText :text="state(component.state)" /></td>
              <td
                v-for="price in prices(component)"
                :key="price.alias"
                :class="{ 'original-price':price.original }"
                :aria-label="price.original ? `${money(price.amount)} — исходная стоимость` : undefined"
              >
                <ListText :text="money(price.amount)" />
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="table-total-row">
              <th
                scope="row"
                colspan="3"
              >
                Итого
              </th>
              <td>{{ money(toUsd(pricing.calculation.totalRub)) }}</td>
              <td>{{ money(pricing.calculation.totalRub) }}</td>
            </tr>
            <tr>
              <th
                scope="row"
              >
                <ListText text="Таможенная пошлина" />
              </th>
              <td class="service-status-column">
                <ServiceStatusIcon status="mandatory" />
              </td>
              <td><ListText :text="customsState" /></td>
              <td
                v-for="price in prices(customs)"
                :key="price.alias"
                :class="{ 'original-price':price.original }"
                :aria-label="price.original ? `${money(price.amount)} — исходная стоимость` : undefined"
              >
                <ListText :text="money(price.amount)" />
              </td>
            </tr>
            <tr>
              <th
                scope="row"
              >
                <ListText text="Доставка по РФ" />
              </th>
              <td class="service-status-column">
                <ServiceStatusIcon status="mandatory" />
              </td>
              <td><ListText :text="state(domesticDelivery.state)" /></td>
              <td
                v-for="price in prices(domesticDelivery)"
                :key="price.alias"
                :class="{ 'original-price':price.original }"
                :aria-label="price.original ? `${money(price.amount)} — исходная стоимость` : undefined"
              >
                <ListText :text="money(price.amount)" />
              </td>
            </tr>
          </tfoot>
        </v-table>
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
</style>
