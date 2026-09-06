<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import ActionButton from '../components/ActionButton.vue'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FormField from '../components/FormField.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { createInternalProblem, normalizeProblem } from '../errors/problem.js'
import { safeReturn } from '../roles.js'
import { useSession } from '../stores/session.js'
const session = useSession()
const route = useRoute()
const router = useRouter()
const email = ref('')
const password = ref('')
const reveal = ref(false)
const busy = ref(false)
const problem = ref(null)
async function submit() {
  if (busy.value) return
  problem.value = null
  busy.value = true
  try {
    const errors = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.value.trim())) errors.email = ['Укажите корректный адрес электронной почты']
    if (!password.value) errors.password = ['Введите пароль']
    if (Object.keys(errors).length) throw createInternalProblem('invalidInput', { errors })
    const user = await session.login(email.value, password.value)
    if (user) await router.replace(safeReturn(route.query.return, user))
  } catch (value) { problem.value = normalizeProblem(value) }
  finally { busy.value = false }
}
</script>
<template>
  <main class="login-layout">
    <section class="login-story">
      <a
        class="brand"
        href="/login"
      ><img
        :src="'/sarafan-gzhel-icon.png'"
        alt=""
      ><span>САРАФАН<small>БЭК-ОФИС</small></span></a>
      <div>
        <p class="eyebrow">
          КОМАНДА САРАФАНА
        </p><h1>Всё начинается<br>с нашей команды.</h1><p>Единое пространство для сотрудников.<br>Ваши задачи, доступы и рабочие инструменты.</p>
      </div>
      <span class="login-caption">Забота о деталях. На каждом шаге.</span>
    </section>
    <section class="login-form-area">
      <form
        class="login-card"
        novalidate
        @submit.prevent="submit"
      >
        <p class="eyebrow">
          СЛУЖЕБНЫЙ ВХОД
        </p><h2>Добро пожаловать</h2><p class="muted">
          Войдите с учётной записью сотрудника
        </p>
        <PageAlertRegion
          :problem="problem"
          :message="session.notice.value"
        />
        <fieldset :disabled="busy">
          <FormField
            v-model="email"
            name="email"
            label="Электронная почта"
            type="email"
            autocomplete="username"
            maxlength="254"
            :problem="problem"
          />
          <FormField
            v-model="password"
            name="password"
            label="Пароль"
            :type="reveal ? 'text' : 'password'"
            autocomplete="current-password"
            :problem="problem"
          />
          <label class="check"><input
            v-model="reveal"
            type="checkbox"
          >Показать пароль</label>
          <ActionButton
            class="login-submit"
            type="submit"
            variant="blue"
            :loading="busy"
            icon="$login"
            label="Войти"
            tooltip-text="Войти"
          />
        </fieldset>
        <p class="login-help">
          Для получения доступа обратитесь<br>к администратору вашей команды.
        </p>
      </form>
    </section>
  </main>
</template>
