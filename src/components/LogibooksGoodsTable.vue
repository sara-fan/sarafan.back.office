<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed } from 'vue'
import ActionButton from './ActionButton.vue'
import ListText from './ListText.vue'
import { goodsColumns, goodsCell } from '../logibooksPresentation.js'
import { PAGE_SIZE_OPTIONS } from '../viewState.js'
import { rowLabel } from '../logibooks.js'
const props = defineProps({ rows:{ type:Array, required:true }, total:{ type:Number, required:true },
  page:{ type:Number, required:true }, pageSize:{ type:Number, required:true }, currencySymbol:{ type:String, required:true }, busy:Boolean, results:Boolean, canReconcile:Boolean })
defineEmits(['page', 'pageSize', 'reconcile'])
const headers = computed(() => [
  ...(props.results ? [{ title:'', key:'actions', sortable:false }] : []),
  ...goodsColumns,
  ...(props.results ? [{ title:'Результат', key:'outcome' }, { title:'Посылка', key:'parcelId' }, { title:'Замечания', key:'issues' }] : [])
].map(x => ({ ...x, sortable:false })))
</script>
<template>
  <v-card class="table-card goods-table">
    <v-data-table-server
      :headers="headers"
      :items="rows"
      :items-length="total"
      :page="page"
      :items-per-page="pageSize"
      :items-per-page-options="PAGE_SIZE_OPTIONS"
      :loading="busy"
      item-value="rowNumber"
      density="compact"
      class="interlaced-table"
      height="var(--staff-table-height, 400px)"
      fixed-header
      items-per-page-text="Строк на странице"
      page-text="{0}-{1} из {2}"
      no-data-text="Строки не найдены."
      @update:page="$emit('page', $event)"
      @update:items-per-page="$emit('pageSize', $event)"
    >
      <template
        v-for="column in goodsColumns"
        :key="column.key"
        #[`item.${column.key}`]="{ item }"
      >
        <ListText :text="goodsCell(item.goods, column.key, currencySymbol)" />
      </template>
      <template #[`item.outcome`]="{ item }">
        <ListText :text="rowLabel(item)" />
      </template>
      <template #[`item.parcelId`]="{ item }">
        <ListText :text="item.parcelId ?? '—'" />
      </template>
      <template #[`item.issues`]="{ item }">
        <ListText :text="item.issues.map(x => x.msg).join('; ') || '—'" />
      </template>
      <template #[`item.actions`]="{ item }">
        <ActionButton
          v-if="canReconcile && item.outcome === 'Unresolved'"
          icon="$audit"
          tooltip-text="Сверить результат"
          :disabled="busy"
          @click="$emit('reconcile', item)"
        />
      </template>
    </v-data-table-server>
  </v-card>
</template>

<style scoped>
.goods-table { min-width:0; max-width:100%; }
.goods-table :deep(th), .goods-table :deep(td) { white-space:nowrap; }
</style>
