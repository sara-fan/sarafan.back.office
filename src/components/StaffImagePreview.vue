<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { onUnmounted, ref, watch } from 'vue'
import { createImagePreview } from '@sara-fan/ui-shared/image-preview'
import { createInternalProblem, normalizeProblem, presentProblem } from '../errors/problem.js'

const props = defineProps({ url:{ type:String, default:null }, file:{ type:Object, default:null }, revision:{ type:Number, default:0 }, identity:{ type:String, default:'' }, load:{ type:Function, required:true }, alt:{ type:String, required:true } })
const emit = defineEmits(['invalid-file'])
const source = ref('')
const problem = ref(null)
const preview = createImagePreview({
  load:url => props.load(url),
  publish:({ source:value, error }) => { source.value = value; problem.value = error ? normalizeProblem(error) : null },
  invalidFile:file => emit('invalid-file', file),
  protocolError:() => createInternalProblem('protocolError')
})
watch([() => props.url, () => props.file, () => props.revision, () => props.identity],
  () => preview.update(props), { immediate:true, flush:'sync' })
function failed(event) { preview.failed(event.target.getAttribute('src')) }
onUnmounted(preview.dispose)
</script>
<template>
  <div class="staff-image-preview">
    <img
      v-if="source"
      :key="source"
      :src="source"
      :alt="alt"
      @error="failed"
    >
    <span
      v-else-if="problem"
      role="status"
    >Изображение недоступно. {{ presentProblem(problem) }}</span>
    <span v-else>Изображение не выбрано</span>
  </div>
</template>
<style scoped>
.staff-image-preview img { max-width:100px; max-height:80px; object-fit:contain; }
.staff-image-preview { font-size:0.875rem; overflow-wrap:anywhere; }
</style>
