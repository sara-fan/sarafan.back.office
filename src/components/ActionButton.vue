<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { computed, useAttrs } from 'vue'
defineOptions({ inheritAttrs:false })
const props = defineProps({
  item:{ type:[Object, String, Number], default:null }, icon:{ type:String, required:true }, tooltipText:{ type:String, required:true },
  iconSize:{ type:[String, Number], default:20 }, disabled:Boolean, loading:Boolean,
  variant:{ type:String, default:'default' }, label:{ type:String, default:'' }, type:{ type:String, default:'button' }
})
const emit = defineEmits(['click'])
const attrs = useAttrs()
const inactive = computed(() => props.disabled || props.loading)
const disabledExplanation = computed(() => inactive.value && Boolean(props.tooltipText.trim()))
function forwarded() { const rest = { ...attrs }; delete rest.class; return rest }
function activate() { if (!inactive.value) emit('click', props.item) }
</script>
<template>
  <v-tooltip
    :disabled="!tooltipText"
    :open-delay="300"
  >
    <template #activator="{ props: activator }">
      <span
        class="action-button-activator"
        :class="{ 'action-button-disabled':disabledExplanation }"
        v-bind="disabledExplanation ? activator : {}"
        :tabindex="disabledExplanation ? 0 : undefined"
        :role="disabledExplanation ? 'button' : undefined"
        :aria-disabled="disabledExplanation ? 'true' : undefined"
        :aria-label="disabledExplanation ? tooltipText : undefined"
      >
        <button
          v-bind="{ ...(disabledExplanation ? {} : activator), ...forwarded() }"
          :type="type"
          :class="['action-button', `action-button--${variant}`, { 'action-button--labelled':label }, attrs.class]"
          :disabled="inactive"
          :aria-label="tooltipText || label"
          :aria-busy="loading"
          @click="activate"
        >
          <v-progress-circular
            v-if="loading"
            indeterminate
            :size="iconSize"
            :width="2"
            aria-hidden="true"
          />
          <v-icon
            v-else
            :icon="icon"
            :size="iconSize"
            aria-hidden="true"
          />
          <span v-if="label">{{ label }}</span>
        </button>
      </span>
    </template>
    <span class="action-tooltip">{{ tooltipText }}</span>
  </v-tooltip>
</template>
<style scoped>
.action-button-activator { display:inline-flex; }
.action-button { display:inline-flex; align-items:center; justify-content:center; gap:9px; min-width:38px; min-height:38px; padding:8px; border:0; background:transparent; border-radius:9px; color:#5f748c; cursor:pointer; transition:background .15s,color .15s; }
.action-button:not(:disabled):hover { background:#e6f2fb; color:#2478b8; }
.action-button--labelled { padding:11px 18px; font-size:13px; font-weight:600; border:1px solid currentColor; }
.action-button--blue { color:#2478b8; }.action-button--green { color:#207762; }.action-button--orange { color:#a65b1c; }.action-button--red { color:#b4234d; }
.action-button--blue.action-button--labelled { color:white; background:#2478b8; border-color:#2478b8; }
.action-button--blue.action-button--labelled:not(:disabled):hover { color:white; background:#1d3e85; }
.action-button:disabled { opacity:.5; cursor:not-allowed; }.action-tooltip { white-space:pre-line; }
@media(prefers-reduced-motion:reduce){.action-button{transition:none}}
</style>
