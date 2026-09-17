<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
defineProps({
  search:{ type:String, required:true },
  searchId:{ type:String, required:true },
  inputmode:{ type:String, default:'text' }
})
defineEmits(['update:search'])
</script>

<template>
  <fieldset
    class="filter-bar"
    aria-label="Фильтры списка"
  >
    <v-text-field
      :id="searchId"
      :model-value="search"
      :inputmode="inputmode"
      class="filter-control filter-search"
      label="Поиск"
      prepend-inner-icon="$search"
      variant="solo"
      density="compact"
      active
      hide-details
      clearable
      @update:model-value="$emit('update:search', $event ?? '')"
    />
    <slot />
  </fieldset>
</template>
