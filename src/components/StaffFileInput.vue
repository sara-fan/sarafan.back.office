<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { ref } from 'vue'
import ActionButton from './ActionButton.vue'

defineOptions({ inheritAttrs:false })
defineProps({
  modelValue:{ type:[Object, Array], default:null },
  name:{ type:String, required:true },
  disabled:Boolean,
  clearable:{ type:Boolean, default:true },
  tooltip:{ type:String, required:true }
})
const emit = defineEmits(['update:modelValue'])
const input = ref(null)
function select(value) {
  emit('update:modelValue', Array.isArray(value) ? value[0] ?? null : value)
  // Permit selecting the same rejected file again while retaining the accepted model.
  input.value.value = ''
}
</script>
<template>
  <v-file-input
    :id="name"
    ref="input"
    v-bind="$attrs"
    :name="name"
    :model-value="modelValue"
    :disabled="disabled"
    :clearable="clearable"
    :truncate-length="Infinity"
    :data-validation-field="name"
    class="staff-form-control"
    variant="outlined"
    density="compact"
    hide-details
    @update:model-value="select"
  >
    <template #prepend>
      <ActionButton
        icon="$file"
        :tooltip-text="tooltip"
        :disabled="disabled"
        :aria-invalid="$attrs['aria-invalid']"
        :aria-describedby="$attrs['aria-describedby']"
        @click="input.click()"
      />
    </template>
  </v-file-input>
</template>
<style scoped>
:deep(.v-input__prepend) { margin-inline-end:var(--staff-input-action-gap); }
</style>
