<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
defineProps({ status:{ type:String, required:true } })
const statuses = {
  mandatory:{ icon:'$serviceMandatory', label:'Обязательная услуга' },
  ordered:{ icon:'$serviceOrdered', label:'Услуга заказана' },
  notOrdered:{ icon:'$serviceNotOrdered', label:'Услуга не заказана' }
}
</script>
<template>
  <v-tooltip
    :text="statuses[status].label"
    location="top"
  >
    <template #activator="{ props }">
      <span
        v-bind="props"
        role="img"
        :aria-label="statuses[status].label"
        tabindex="0"
      >
        <v-icon
          :icon="statuses[status].icon"
          size="20"
          aria-hidden="true"
        />
      </span>
    </template>
  </v-tooltip>
</template>
