<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import ActionButton from './ActionButton.vue'
defineProps({
  open:Boolean,
  busy:Boolean,
  actionDisabled:Boolean,
  actionVariant:{ type:String, default:'orange' },
  secondaryAction:{ type:String, default:'' },
  title:{ type:String, default:'Подтвердите действие' },
  message:{ type:String, required:true },
  action:{ type:String, default:'Подтвердить' },
  actionIcon:{ type:String, default:'$save' }
})
defineEmits(['confirm','cancel','secondary'])
</script>
<template>
  <v-dialog
    :model-value="open"
    :max-width="secondaryAction ? 760 : 480"
    @update:model-value="!$event && !busy && $emit('cancel')"
  >
    <section
      class="confirm-card"
      role="alertdialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
    >
      <h2 id="confirm-title">
        {{ title }}
      </h2>
      <p id="confirm-message">
        {{ message }}
      </p>
      <div class="form-actions">
        <ActionButton
          :disabled="busy"
          icon="$close"
          label="Отмена"
          tooltip-text="Отмена"
          @click="$emit('cancel')"
        />
        <ActionButton
          v-if="secondaryAction"
          icon="$continue"
          :label="secondaryAction"
          :tooltip-text="secondaryAction"
          :disabled="busy"
          variant="orange"
          @click="$emit('secondary')"
        />
        <ActionButton
          :disabled="busy || actionDisabled"
          :variant="actionVariant"
          :icon="actionIcon"
          :label="action"
          :tooltip-text="action"
          @click="$emit('confirm')"
        />
      </div>
    </section>
  </v-dialog>
</template>
<style scoped>
.form-actions { display:flex; flex-wrap:wrap; gap:12px; }
</style>
