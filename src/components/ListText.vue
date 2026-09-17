<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
const props = defineProps({ text:{ type:[String, Number], default:'' } })
const element = ref(null)
const truncated = ref(false)
let observer
let frame
function measure() {
  const node = element.value
  truncated.value = !!node && node.scrollWidth > node.clientWidth + 1
}
onMounted(() => {
  if (globalThis.ResizeObserver) {
    observer = new globalThis.ResizeObserver(() => {
      globalThis.cancelAnimationFrame(frame)
      frame = globalThis.requestAnimationFrame(measure)
    })
    observer.observe(element.value)
  }
  globalThis.addEventListener('resize', measure)
  measure()
})
watch(() => props.text, async () => { await nextTick(); measure() })
onUnmounted(() => { observer?.disconnect(); globalThis.cancelAnimationFrame(frame); globalThis.removeEventListener('resize', measure) })
</script>
<template>
  <v-tooltip
    :disabled="!truncated"
    :text="String(text)"
    location="top"
    :open-delay="300"
    max-width="320"
    content-class="staff-tooltip-content"
  >
    <template #activator="{ props: activator }">
      <span
        v-bind="activator"
        ref="element"
        class="list-text"
        :tabindex="truncated ? 0 : undefined"
      >{{ text }}</span>
    </template>
  </v-tooltip>
</template>
