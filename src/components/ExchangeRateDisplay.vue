<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed, ref } from 'vue'
import ActionButton from './ActionButton.vue'
import { exchangeRateDisplay, RATE_UNAVAILABLE_MESSAGE } from '../exchangeRates.js'

const props = defineProps({
  rates: { type: Array, default: () => [] },
  currencies: { type: Array, default: () => [] }
})
const displays = computed(() => ['usd', 'eur'].map(alias => ({
  alias, rate:exchangeRateDisplay(props.rates, props.currencies, alias)
})))
const commonDate = computed(() => displays.value[0].rate?.isoDate === displays.value[1].rate?.isoDate ? displays.value[0].rate : null)
const expanded = ref(false)
</script>

<template>
  <div
    class="exchange-rates"
    tabindex="0"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    :title="displays.some(item => item.rate) ? 'Официальный курс ЦБ РФ, RUB' : RATE_UNAVAILABLE_MESSAGE"
  >
    <span class="rates-toggle"><ActionButton
      icon="$rates"
      :tooltip-text="expanded ? 'Свернуть курсы' : 'Показать курсы USD / EUR'"
      :aria-expanded="expanded"
      aria-controls="official-rates"
      @click="expanded = !expanded"
    /></span>
    <div
      id="official-rates"
      class="rates-content"
      :class="{ expanded }"
    >
      <time
        v-if="commonDate"
        :datetime="commonDate.isoDate"
      >{{ commonDate.date }}</time>
      <span
        v-for="item in displays"
        :key="item.alias"
        class="rate-item"
      >
        <time
          v-if="item.rate && !commonDate"
          :datetime="item.rate.isoDate"
        >{{ item.rate.date }}</time>
        <strong :class="item.alias === 'usd' ? 'text-green-darken-3' : 'text-purple-darken-2'">{{ item.rate ? `${item.rate.label} ${item.rate.value}` : `${item.alias.toUpperCase()} —` }}<span class="sr-only">{{ item.rate ? ' RUB, официальный курс ЦБ РФ' : ` ${RATE_UNAVAILABLE_MESSAGE}` }}</span></strong>
      </span>
    </div>
  </div>
</template>

<style scoped>
.exchange-rates {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  max-width: calc(100% - 80px);
  margin: 0 16px 0 8px;
  color: #1976d2;
  font-size: 0.875rem;
  white-space: nowrap;
}
.exchange-rates strong { font-weight: 700; }
.rates-content, .rate-item { display:flex; align-items:center; gap:0.75rem; }
.rates-toggle { display:none; color:#1976d2; padding:8px; border:1px solid #dbe5ee; border-radius:4px; }
@media(max-width:700px) {
  .rates-toggle { display:block; }
  .rates-content { display:none; }
  .rates-content.expanded { display:flex; position:absolute; top:64px; right:8px; flex-wrap:wrap; max-width:calc(100vw - 16px); padding:12px; background:white; box-shadow:0 2px 6px #0003; }
}
</style>
