<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed } from 'vue'
import { landing } from '../roles.js'
import { useSession } from '../stores/session.js'
defineProps({ forbidden:Boolean })
const { user } = useSession()
const returnTo = computed(() => landing(user.value))
</script>
<template>
  <section class="status-card">
    <p class="status-code">
      {{ forbidden ? '403' : '404' }}
    </p><h1 class="primary-heading">
      {{ forbidden ? 'Недостаточно прав' : 'Страница не найдена' }}
    </h1><hr class="hr"><p>{{ forbidden ? 'Для этой операции необходимы права администратора.' : 'Проверьте адрес или вернитесь к работе.' }}</p><RouterLink
      class="text-link"
      :to="returnTo"
    >
      Вернуться <v-icon
        icon="$next"
        size="14"
        aria-hidden="true"
      />
    </RouterLink>
  </section>
</template>
