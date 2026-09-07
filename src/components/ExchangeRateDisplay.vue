<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed } from 'vue'
import { exchangeRateDisplay, RATE_UNAVAILABLE_MESSAGE } from '../exchangeRates.js'

const props = defineProps({ rates: { type: Array, default: () => [] } })
const display = computed(() => exchangeRateDisplay(props.rates))
</script>

<template>
  <div
    class="exchange-rates"
    tabindex="0"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    :title="display ? 'Официальный курс ЦБ РФ, RUB' : RATE_UNAVAILABLE_MESSAGE"
  >
    <template v-if="display">
      <time :datetime="display.isoDate">{{ display.date }}</time>
      <strong class="text-green-darken-3">{{ display.label }} {{ display.value }}<span class="sr-only"> RUB, официальный курс ЦБ РФ</span></strong>
    </template>
    <template v-else>
      <strong class="text-green-darken-3">USD —</strong>
      <span class="sr-only">{{ RATE_UNAVAILABLE_MESSAGE }}</span>
    </template>
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
  overflow-x: auto;
  color: #1976d2;
  font-size: 0.875rem;
  white-space: nowrap;
}
.exchange-rates strong { font-weight: 700; }
</style>
