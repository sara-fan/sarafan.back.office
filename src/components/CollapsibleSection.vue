<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { useId } from 'vue'
import ActionButton from './ActionButton.vue'

defineProps({ title:{ type:String, required:true } })
const expanded = defineModel({ type:Boolean, default:true })
const id = useId()
</script>

<template>
  <section
    :aria-labelledby="`${id}-heading`"
    class="staff-collapsible-section"
  >
    <h2
      :id="`${id}-heading`"
      class="primary-heading staff-section-heading"
    >
      {{ title }}
      <ActionButton
        :icon="expanded ? '$collapseSection' : '$expandSection'"
        :tooltip-text="`${expanded ? 'Свернуть' : 'Развернуть'} раздел «${title}»`"
        :aria-expanded="expanded"
        :aria-controls="`${id}-content`"
        @click="expanded = !expanded"
      />
    </h2>
    <div
      v-show="expanded"
      :id="`${id}-content`"
    >
      <slot />
    </div>
  </section>
</template>
