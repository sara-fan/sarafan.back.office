<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import ActionButton from '../components/ActionButton.vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FormField from '../components/FormField.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { createInternalProblem, hasOnlyPresentedFieldErrors, normalizeProblem, problemFieldErrors } from '../errors/problem.js'
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
const passwordErrors = computed(() => problemFieldErrors(problem.value, 'password'))
const pageProblem = computed(() => hasOnlyPresentedFieldErrors(problem.value, ['email', 'password']) ? null : problem.value)
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
    <section
      class="login-panel"
      aria-labelledby="login-title"
    >
      <a
        class="login-brand"
        href="/login"
        aria-label="Сарафан · Офис"
      ><img
        :src="'/sarafan-gzhel-icon.png'"
        alt=""
      ><span>САРАФАН<small>ОФИС</small></span></a>
      <form
        class="login-card"
        novalidate
        @submit.prevent="submit"
      >
        <h1
          id="login-title"
          class="primary-heading"
        >
          Вход
        </h1>
        <hr class="hr">
        <PageAlertRegion
          :problem="pageProblem || session.loginProblem.value"
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
          <div class="form-field login-password-field">
            <label for="password">Пароль</label>
            <div class="password-control">
              <input
                id="password"
                v-model="password"
                name="password"
                :type="reveal ? 'text' : 'password'"
                autocomplete="current-password"
                :aria-invalid="passwordErrors.length > 0"
                aria-describedby="password-error"
              >
              <ActionButton
                :icon="reveal ? '$eyeOff' : '$eye'"
                :tooltip-text="reveal ? 'Скрыть пароль' : 'Показать пароль'"
                :disabled="busy"
                @click="reveal = !reveal"
              />
            </div>
            <div
              id="password-error"
              class="field-error"
            >
              <span
                v-for="error in passwordErrors"
                :key="error"
              >{{ error }}</span>
            </div>
          </div>
          <div class="login-actions">
            <ActionButton
              class="login-submit"
              type="submit"
              variant="blue"
              :loading="busy"
              icon="$login"
              label="Войти"
              tooltip-text="Войти"
            />
          </div>
        </fieldset>
      </form>
    </section>
  </main>
</template>
