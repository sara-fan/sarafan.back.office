<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { nextTick, onUnmounted, ref } from 'vue'
import ActionButton from './ActionButton.vue'

const props = defineProps({
  id:{ type:String, required:true },
  validationField:{ type:String, default:undefined },
  label:{ type:String, required:true },
  editTooltip:{ type:String, required:true },
  editable:Boolean,
  disabled:Boolean,
  inputmode:{ type:String, default:'text' },
  validate:{ type:Function, default:null },
  invalid:Boolean,
  describedBy:{ type:String, default:undefined },
  emptyText:{ type:String, default:'—' }
})
const model = defineModel({ type:String, default:'' })
const emit = defineEmits(['editing-change', 'accepted', 'cancelled'])
const root = ref(null)
const editing = ref(false)
const draft = ref('')
const editError = ref('')
const vFocus = { mounted:element => element.focus() }

function startEdit() {
  if (!props.editable || props.disabled || editing.value) return
  draft.value = String(model.value ?? '')
  editError.value = ''
  editing.value = true
  emit('editing-change', true)
}
function finishEdit() {
  editing.value = false
  editError.value = ''
  emit('editing-change', false)
  nextTick(() => root.value?.querySelector('button')?.focus())
}
function acceptEdit() {
  if (!editing.value || props.disabled) return
  const value = draft.value.trim()
  editError.value = props.validate?.(value) ?? ''
  if (editError.value) return
  model.value = value
  emit('accepted', value)
  finishEdit()
}
function cancelEdit() {
  if (editing.value) {
    emit('cancelled')
    finishEdit()
  }
}

onUnmounted(() => {
  if (editing.value) emit('editing-change', false)
})
defineExpose({ startEdit })
</script>

<template>
  <div
    ref="root"
    class="inline-editable-field"
  >
    <template v-if="editing">
      <input
        :id="id"
        v-model="draft"
        v-focus
        :name="validationField || id"
        :aria-label="label"
        :aria-invalid="invalid || !!editError"
        :aria-describedby="[describedBy, editError ? `${id}-edit-error` : null].filter(Boolean).join(' ') || undefined"
        :disabled="disabled"
        :inputmode="inputmode"
        @input="editError = ''"
        @keydown.enter.prevent="acceptEdit"
        @keydown.esc.prevent="cancelEdit"
      >
      <ActionButton
        icon="fas fa-check"
        tooltip-text="Применить"
        :disabled="disabled"
        @click="acceptEdit"
      />
      <ActionButton
        icon="$close"
        tooltip-text="Отменить"
        @click="cancelEdit"
      />
      <span
        v-if="editError"
        :id="`${id}-edit-error`"
        class="field-error inline-editable-field__error"
        role="alert"
      >{{ editError }}</span>
    </template>
    <template v-else>
      <ActionButton
        v-if="editable"
        :id="id"
        :name="validationField || id"
        icon="fas fa-pen"
        :tooltip-text="editTooltip"
        :aria-invalid="invalid"
        :aria-describedby="describedBy"
        :disabled="disabled"
        :icon-size="16"
        @click="startEdit"
      />
      <span class="inline-editable-field__value">{{ model || emptyText }}</span>
    </template>
  </div>
</template>

<style scoped>
.inline-editable-field { display:flex; align-items:center; flex-wrap:wrap; gap:4px; min-width:0; }
.inline-editable-field input { flex:1 1 90px; min-width:90px; }
.inline-editable-field__value { overflow-wrap:anywhere; }
.inline-editable-field__error { flex-basis:100%; }
</style>
