<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { can, fullName, roleLabel } from '../roles.js'
import { useSession } from '../stores/session.js'
const { user } = useSession()
</script>
<template>
  <section>
    <header class="page-heading">
      <div>
        <p class="eyebrow">
          РАБОЧЕЕ ПРОСТРАНСТВО
        </p><h1>Главная</h1>
      </div>
    </header>
    <div class="welcome-card">
      <div>
        <p class="eyebrow">
          РАДЫ ВАС ВИДЕТЬ
        </p><h2>{{ fullName(user) }}</h2><p>Ваш доступ к рабочему пространству активен.</p><div class="role-row">
          <span
            v-for="role in user.roles"
            :key="role"
            class="role-chip"
          >{{ roleLabel(role) }}</span>
        </div>
      </div><img
        :src="'/sarafan-gzhel-icon.png'"
        alt=""
        class="welcome-mark"
      >
    </div>
    <div class="home-actions">
      <RouterLink
        to="/profile"
        class="action-card"
      >
        <span>Личный кабинет</span><h2>Мой профиль ↗</h2><p>Данные сотрудника и изменение пароля</p>
      </RouterLink><RouterLink
        v-if="can(user, 'manageUsers')"
        to="/users"
        class="action-card"
      >
        <span>Управление командой</span><h2>Сотрудники ↗</h2><p>Учётные записи, роли и права доступа</p>
      </RouterLink>
    </div>
  </section>
</template>
