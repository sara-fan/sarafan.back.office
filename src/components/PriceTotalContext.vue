<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed } from 'vue'
import { moscowDate } from '../consentFormatting.js'

const props = defineProps({ confirmed:Boolean, exchangeRate:{ type:Object, default:null }, currencies:{ type:Array, required:true } })
const usd = computed(() => props.currencies.find(item => item.routeAlias === 'usd').symbol)
const rub = computed(() => props.currencies.find(item => item.routeAlias === 'rub').symbol)
</script>

<template>
  <span class="price-total-context">
    Итого, {{ confirmed ? 'утверждённая стоимость' : 'прогнозная стоимость' }}
    <small class="price-note price-total-rate">
      <template v-if="exchangeRate">{{ usd }} {{ (exchangeRate.officialRate / exchangeRate.nominal).toFixed(4) }} {{ rub }} (ЦБ РФ, {{ moscowDate(exchangeRate.sourceEffectiveDate) }})</template>
      <template v-else>курс недоступен.</template>
    </small>
  </span>
</template>

<style scoped>
.price-total-context { display:block; }
</style>
