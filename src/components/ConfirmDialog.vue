<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import ActionButton from './ActionButton.vue'
defineProps({
  open:Boolean,
  title:{ type:String, default:'Подтвердите действие' },
  message:{ type:String, required:true },
  action:{ type:String, default:'Подтвердить' },
  actionIcon:{ type:String, default:'$save' }
})
defineEmits(['confirm','cancel'])
</script>
<template>
  <v-dialog
    :model-value="open"
    max-width="480"
    @update:model-value="!$event && $emit('cancel')"
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

          icon="$close"
          label="Отмена"
          tooltip-text="Отмена"
          @click="$emit('cancel')"
        /><ActionButton
          variant="orange"
          :icon="actionIcon"
          :label="action"
          :tooltip-text="action"
          @click="$emit('confirm')"
        />
      </div>
    </section>
  </v-dialog>
</template>
