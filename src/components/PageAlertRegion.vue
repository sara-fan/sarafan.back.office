<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { ref, watch } from 'vue'
import { presentProblem } from '../errors/problem.js'

const props = defineProps({ problem:{ type:Object, default:null }, message:{ type:String, default:'' } })
const dismissed = ref(false)

watch([() => props.problem, () => props.message], () => { dismissed.value = false })
</script>
<template>
  <div
    v-if="problem && !dismissed"
    class="page-alert"
    role="alert"
  >
    <span>{{ presentProblem(problem) }}</span>
    <button
      class="alert-close"
      type="button"
      aria-label="Закрыть сообщение"
      title="Закрыть сообщение"
      @click="dismissed = true"
    >
      <v-icon
        icon="$close"
        size="18"
        aria-hidden="true"
      />
    </button>
  </div>
  <div
    v-else-if="message && !dismissed"
    class="page-notice"
    role="status"
  >
    <span>{{ message }}</span>
    <button
      class="alert-close"
      type="button"
      aria-label="Закрыть сообщение"
      title="Закрыть сообщение"
      @click="dismissed = true"
    >
      <v-icon
        icon="$close"
        size="18"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
