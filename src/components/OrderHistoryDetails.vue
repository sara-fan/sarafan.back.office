<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed } from 'vue'
import { orderStatusName } from '../orderFormatting.js'
import { formatMoneyAmount } from '../moneyFormatting.js'
import { priceHistoryRows } from '../orderPriceHistory.js'
import PriceTotalContext from './PriceTotalContext.vue'

const props = defineProps({ detail:{ type:Object, required:true }, orderOps:{ type:Object, required:true }, pricingOps:{ type:Object, required:true } })
const fields = { storeName:'Магазин', productName:'Товар', sellerPrice:'Цена продавца', quantity:'Количество', color:'Цвет', size:'Размер', comment:'Комментарий' }
const display = value => value === null || value === undefined ? '—' : typeof value === 'object'
  ? `${formatMoneyAmount(value.amount)}${props.orderOps.currencies.find(item => item.value === value.currency).symbol}` : String(value)
const status = value => value === null ? '—' : orderStatusName(value, props.orderOps)
const changes = computed(() => {
  const result = Object.entries(fields).filter(([key]) => JSON.stringify(props.detail.productBefore?.[key] ?? null) !== JSON.stringify(props.detail.productAfter?.[key] ?? null))
    .map(([key, name]) => ({ name, before:display(props.detail.productBefore?.[key]), after:display(props.detail.productAfter?.[key]) }))
  if (props.detail.statusBefore !== null || props.detail.statusAfter !== null) result.push({ name:'Статус', before:status(props.detail.statusBefore), after:status(props.detail.statusAfter) })
  if (props.detail.sourceUrl !== null) result.push({ name:'Страница товара', before:'—', after:props.detail.sourceUrl })
  if (props.detail.customsPaidAfter != null) result.push({ name:'Таможенная пошлина оплачена',
    before:'Нет', after:'Да' })
  return result
})
const priceRows = computed(() => priceHistoryRows(props.detail, props.pricingOps))
</script>
<template>
  <div class="history-details">
    <p v-if="detail.missingCreationDetails">
      Исходные данные заказа не были записаны. Известна только дата создания.
    </p>
    <p
      v-if="detail.cancellationReason"
      class="history-cancellation-reason"
    >
      <strong>Причина отмены:</strong> {{ detail.cancellationReason }}
    </p>
    <p v-if="detail.reviewReason">
      <strong>Причина:</strong> {{ detail.reviewReason }}
    </p>
    <p v-if="detail.checkoutDeliveryName">
      Данные получателя сохранены. Способ доставки: {{ detail.checkoutDeliveryName }}.
    </p>
    <v-table
      v-if="changes.length"
      density="compact"
      class="interlaced-table"
    >
      <thead><tr><th>Поле</th><th>Было</th><th>Стало</th></tr></thead>
      <tbody>
        <tr
          v-for="change in changes"
          :key="change.name"
        >
          <th scope="row">
            {{ change.name }}
          </th><td>{{ change.before }}</td><td>{{ change.after }}</td>
        </tr>
      </tbody>
    </v-table>
    <v-table
      v-if="priceRows.length"
      density="compact"
      class="interlaced-table price-comparison"
    >
      <caption>Изменение стоимости</caption>
      <thead>
        <tr>
          <th scope="col">
            Компонент
          </th><th scope="col">
            Было
          </th><th scope="col">
            Стало
          </th><th scope="col">
            Причина
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in priceRows"
          :key="row.key"
          :class="{ 'price-total':row.total }"
        >
          <th scope="row">
            <PriceTotalContext
              v-if="row.total && detail.pricingAfter"
              :confirmed="detail.validUntilAfter !== null"
              :exchange-rate="detail.pricingAfter.exchangeRate"
              :currencies="pricingOps.catalogue.currencies"
            />
            <template v-else>
              {{ row.name }}
            </template>
            <small
              v-if="row.extra"
              class="price-note"
            >
              Не входит в итог
            </small>
          </th>
          <td>{{ row.before }}</td><td>{{ row.after }}</td><td>{{ row.reason }}</td>
        </tr>
      </tbody>
    </v-table>
  </div>
</template>
<style scoped>
.history-details { padding:16px; overflow-wrap:anywhere; }
.history-details :deep(td) { white-space:pre-wrap; }
.price-comparison { margin-top:8px; }
.price-comparison :deep(table) { min-width:0; table-layout:auto; }
.price-comparison caption { text-align:left; font-weight:600; padding:8px 0; }
.price-total { font-weight:700; }
</style>
