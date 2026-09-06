<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
defineProps({ forbidden:Boolean })
</script>
<template>
  <section class="status-card">
    <p class="eyebrow">
      {{ forbidden ? '403' : '404' }}
    </p><h1>{{ forbidden ? 'Недостаточно прав' : 'Страница не найдена' }}</h1><p>{{ forbidden ? 'Для этой операции необходимы права администратора.' : 'Проверьте адрес или вернитесь на главную.' }}</p><RouterLink
      class="text-link"
      to="/home"
    >
      На главную →
    </RouterLink>
  </section>
</template>
