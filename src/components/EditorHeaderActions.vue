<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import ActionButton from './ActionButton.vue'

defineProps({
  form:{ type:String, required:true },
  loaded:{ type:Boolean, default:true },
  busy:Boolean,
  saveDisabled:Boolean,
  showSave:{ type:Boolean, default:true },
  saveTooltip:{ type:String, default:'Сохранить изменения' },
  cancelTooltip:{ type:String, default:'Отменить' }
})
const emit = defineEmits(['refresh', 'cancel'])
</script>

<template>
  <div class="header-action-groups">
    <div
      v-if="$slots.before"
      class="header-actions"
    >
      <slot name="before" />
    </div>
    <div class="header-actions">
      <ActionButton
        icon="$refresh"
        tooltip-text="Обновить данные"
        :disabled="busy"
        @click="emit('refresh')"
      /><ActionButton
        v-if="loaded && showSave"
        type="submit"
        :form="form"
        variant="blue"
        :loading="busy"
        :disabled="saveDisabled"
        icon="$saveChanges"
        icon-size="28"
        :tooltip-text="saveTooltip"
      /><ActionButton
        v-if="loaded"
        icon="$close"
        icon-size="28"
        :tooltip-text="cancelTooltip"
        :disabled="busy"
        @click="emit('cancel')"
      />
    </div>
  </div>
</template>
