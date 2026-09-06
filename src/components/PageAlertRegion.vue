<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { presentProblem } from '../errors/problem.js'
defineProps({ problem:{ type:Object, default:null }, message:{ type:String, default:'' } })
</script>
<template>
  <div
    v-if="problem"
    class="page-alert"
    role="alert"
  >
    {{ presentProblem(problem) }}
  </div>
  <div
    v-else-if="message"
    class="page-notice"
    role="status"
  >
    {{ message }}
  </div>
</template>
