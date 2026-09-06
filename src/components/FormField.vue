<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { problemFieldErrors } from '../errors/problem.js'
defineOptions({ inheritAttrs:false })
defineProps({ name:{ type:String, required:true }, label:{ type:String, required:true }, problem:{ type:Object, default:null }, type:{ type:String, default:'text' } })
const model = defineModel({ type:String, default:'' })
</script>
<template>
  <div class="form-field">
    <label :for="name">{{ label }}</label>
    <input
      :id="name"
      v-model="model"
      v-bind="$attrs"
      :type="type"
      :name="name"
      :aria-invalid="problemFieldErrors(problem, name).length > 0"
      :aria-describedby="`${name}-error`"
    >
    <div
      :id="`${name}-error`"
      class="field-error"
    >
      <span
        v-for="error in problemFieldErrors(problem, name)"
        :key="error"
      >{{ error }}</span>
    </div>
  </div>
</template>
