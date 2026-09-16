<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed, ref } from 'vue'
import ActionButton from './ActionButton.vue'
import { associatedFieldErrors } from '../errors/problem.js'
defineOptions({ inheritAttrs:false })
const props = defineProps({
  name:{ type:String, required:true }, label:{ type:String, required:true }, problem:{ type:Object, default:null },
  type:{ type:String, default:'text' }, hint:{ type:String, default:'' }, revealable:Boolean,
  errorOptions:{ type:Object, default:() => ({}) }
})
const errors = computed(() => associatedFieldErrors(props.problem, props.name, props.errorOptions))
const model = defineModel({ type:String, default:'' })
const reveal = ref(false)
</script>
<template>
  <div class="form-field">
    <label :for="name">{{ label }}</label>
    <div
      v-if="revealable"
      class="password-control"
    >
      <input
        :id="name"
        v-model="model"
        v-bind="$attrs"
        :type="reveal ? 'text' : type"
        :name="name"
        :aria-invalid="errors.length > 0"
        :aria-describedby="`${hint ? `${name}-hint ` : ''}${name}-error`"
      >
      <ActionButton
        :icon="reveal ? '$eyeOff' : '$eye'"
        :tooltip-text="reveal ? 'Скрыть пароль' : 'Показать пароль'"
        @click="reveal = !reveal"
      />
    </div><input
      v-else
      :id="name"
      v-model="model"
      v-bind="$attrs"
      :type="type"
      :name="name"
      :aria-invalid="errors.length > 0"
      :aria-describedby="`${hint ? `${name}-hint ` : ''}${name}-error`"
    ><p
      v-if="hint"
      :id="`${name}-hint`"
      class="field-hint"
    >
      {{ hint }}
    </p>
    <div
      :id="`${name}-error`"
      class="field-error"
    >
      <span
        v-for="error in errors"
        :key="error"
      >{{ error }}</span>
    </div>
  </div>
</template>
