<!-- Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
All rights reserved.
This file is a part of the Sarafan application -->

<template>
  <fieldset class="filter-bar date-range-filter-bar">
    <slot />
  </fieldset>
</template>

<style scoped>
.staff-list .date-range-filter-bar {
  grid-template-columns:minmax(260px, 1fr) minmax(240px, 320px) minmax(150px, 190px) minmax(150px, 190px);
}
@media (max-width:1100px) {
  .staff-list .date-range-filter-bar { grid-template-columns:1fr 1fr; }
  .date-range-filter-bar :slotted(.filter-search) { grid-column:1 / -1; }
}
@media (max-width:600px) {
  .staff-list .date-range-filter-bar { grid-template-columns:1fr; }
  .date-range-filter-bar :slotted(.filter-search) { grid-column:auto; }
}
</style>
