<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { onUnmounted, ref, watch } from 'vue'
import { createInternalProblem, normalizeProblem, presentProblem } from '../errors/problem.js'
import { useSession } from '../stores/session.js'

const props = defineProps({ url:{ type:String, default:null }, file:{ type:Object, default:null }, revision:{ type:Number, default:0 } })
const emit = defineEmits(['invalid-file'])
const session = useSession()
const source = ref('')
const problem = ref(null)
let generation = 0
function clear() {
  generation += 1
  if (source.value) globalThis.URL.revokeObjectURL(source.value)
  source.value = ''
  problem.value = null
}
watch([() => props.url, () => props.file, () => props.revision, () => session.user.value?.id], async () => {
  clear()
  if (!session.user.value || (!props.file && !props.url)) return
  const current = generation
  try {
    if (!props.file && !/^\/api\/v1\/backoffice\/stores\/[1-9]\d*\/logo\?v=[0-9a-f]{64}$/u.test(props.url)) throw createInternalProblem('protocolError')
    const blob = props.file ?? await session.storeRequest(props.url.slice('/api/v1/backoffice'.length), {}, 'blob')
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
  <div class="store-logo">
    <img
      v-if="source"
      :key="source"
      :src="source"
      alt="Изображение магазина"
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
.store-logo img { max-width:100px; max-height:80px; object-fit:contain; }
.store-logo { font-size:0.875rem; overflow-wrap:anywhere; }
</style>
