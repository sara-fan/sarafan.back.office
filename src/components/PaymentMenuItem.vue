<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

defineProps({ title:{ type:String, required:true }, reason:{ type:String, default:'' } })
defineEmits(['click'])
</script>
<template>
  <v-tooltip
    :text="reason"
    :disabled="!reason"
    location="top"
  >
    <template #activator="{ props:activator }">
      <div
        v-bind="reason ? activator : {}"
        class="duty-payment-activator"
        :tabindex="reason ? 0 : undefined"
        :role="reason ? 'button' : undefined"
        :aria-disabled="reason ? 'true' : undefined"
        :aria-label="reason ? `${title}. ${reason}` : undefined"
      >
        <v-list-item
          :title="title"
          :disabled="!!reason"
          @click="$emit('click')"
        />
      </div>
    </template>
  </v-tooltip>
</template>
