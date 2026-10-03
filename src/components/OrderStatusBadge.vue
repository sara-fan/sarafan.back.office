<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed } from 'vue'
import ListText from './ListText.vue'

const props = defineProps({
  status:{ type:Number, required:true },
  ops:{ type:Object, default:null },
  compact:{ type:Boolean, default:false }
})
const tones = new Map([
  ['under_review', ['#854D0E', '#FEF9C3']],
  ['quote_ready', ['#1D4ED8', '#DBEAFE']],
  ['quote_expired', ['#9A3412', '#FED7AA']],
  ['in_progress', ['#4338CA', '#E0E7FF']],
  ['received', ['#166534', '#DCFCE7']],
  ['cancelled', ['#475569', '#F1F5F9']]
])
const metadata = computed(() => props.ops?.statuses.find(item => item.value === props.status))
const label = computed(() => metadata.value?.name ?? '—')
const colors = computed(() => {
  const tone = tones.get(metadata.value?.routeAlias) ?? tones.get(metadata.value?.upperStatusRouteAlias) ?? tones.get('cancelled')
  return { '--order-status-text':tone[0], '--order-status-background':tone[1] }
})
</script>

<template>
  <span
    class="order-status-display"
    :class="{ 'order-status-display--compact': compact }"
    :style="colors"
  >
    <span class="order-status-pill">
      <ListText
        v-if="compact"
        :text="label"
      />
      <template v-else>{{ label }}</template>
    </span>
    <slot />
  </span>
</template>

<style scoped>
.order-status-display { display:inline-flex; flex-wrap:wrap; align-items:center; gap:8px 12px; color:var(--order-status-text); }
.order-status-pill { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; color:var(--order-status-text); background:var(--order-status-background); border-radius:12px; font-size:14px; font-weight:600; white-space:nowrap; }
.order-status-pill::before { width:6px; height:6px; flex-shrink:0; content:""; background:currentcolor; border-radius:50%; }
.order-status-display--compact .order-status-pill { padding:4px 8px; font-size:11px; font-weight:400; }
</style>
