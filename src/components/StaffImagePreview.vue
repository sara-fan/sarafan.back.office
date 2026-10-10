<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { onUnmounted, ref, watch } from 'vue'
import { createInternalProblem, normalizeProblem, presentProblem } from '../errors/problem.js'

const props = defineProps({ url:{ type:String, default:null }, file:{ type:Object, default:null }, revision:{ type:Number, default:0 }, identity:{ type:String, default:'' }, load:{ type:Function, required:true }, alt:{ type:String, required:true } })
const emit = defineEmits(['invalid-file'])
const source = ref('')
const problem = ref(null)
let generation = 0
function clear() {
  generation += 1
  if (source.value) globalThis.URL.revokeObjectURL(source.value)
  source.value = ''
  problem.value = null
}
watch([() => props.url, () => props.file, () => props.revision, () => props.identity], async () => {
  clear()
  if (!props.identity || (!props.file && !props.url)) return
  const current = generation
  try {
    const blob = props.file ?? await props.load(props.url)
    if (current !== generation) return
    if (!(blob instanceof globalThis.Blob) || !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || !blob.size) throw createInternalProblem('protocolError')
    source.value = globalThis.URL.createObjectURL(blob)
  } catch (value) {
    if (current !== generation) return
    if (props.file) emit('invalid-file', props.file)
    else problem.value = normalizeProblem(value)
  }
}, { immediate:true, flush:'sync' })
function failed(event) {
  if (event.target.getAttribute('src') !== source.value) return
  clear()
  if (props.file) emit('invalid-file', props.file)
  else problem.value = createInternalProblem('protocolError')
}
onUnmounted(clear)
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
