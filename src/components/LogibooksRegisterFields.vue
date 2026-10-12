<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import FormField from './FormField.vue'
import { dateInputDisplay } from '../dateInput.js'
import { displayOptional, displayWeight } from '../logibooksPresentation.js'
const props = defineProps({ value:{ type:Object, required:true }, problem:{ type:Object, default:null },
  disabled:Boolean, readonly:Boolean })
defineEmits(['change'])
const fields = [
  { key:'dealNumber', label:'Номер сделки' },
  { key:'customerOrderNumber', label:'Номер заказа клиента' },
  { key:'invoiceNumber', label:'Номер накладной' },
  { key:'invoiceDate', label:'Дата накладной', type:'date' }
]
function display(field) {
  const value = props.value[field.key]
  return displayOptional(field.type === 'date' ? dateInputDisplay(value) : value)
}
</script>
<template>
  <div class="register-fields staff-form form-medium">
    <template
      v-for="field in fields"
      :key="field.key"
    >
      <FormField
        v-if="!readonly"
        :name="'register.' + field.key"
        :label="field.label"
        :type="field.type || 'text'"
        :model-value="value[field.key] || ''"
        :problem="problem"
        :disabled="disabled"
        @update:model-value="$emit('change', field.key, $event)"
      />
      <div
        v-else
        class="staff-form-row"
      >
        <span class="staff-form-label">{{ field.label }}</span>
        <span class="staff-form-value staff-form-value--readonly">{{ display(field) }}</span>
      </div>
    </template>
    <div class="staff-form-row">
      <span class="staff-form-label">Общий вес, кг</span>
      <span class="staff-form-value staff-form-value--readonly">{{ displayWeight(value.realWeightKg) }}</span>
    </div>
  </div>
</template>
<style scoped>
.register-fields { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 500px), 1fr)); column-gap:24px; }
</style>
