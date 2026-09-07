<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import ActionButton from './components/ActionButton.vue'
import { ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { useRouter } from 'vue-router'
import { version } from '../package.json'
import { can, fullName, landing, profileRoute } from './roles.js'
import { useSession } from './stores/session.js'
import { suppressProblem } from './errors/problem.js'
import PageAlertRegion from './components/PageAlertRegion.vue'
import ExchangeRateDisplay from './components/ExchangeRateDisplay.vue'
const session = useSession()
const { user, ready, restoring, restoreProblem } = session
const router = useRouter()
const { mdAndUp } = useDisplay()
const drawer = ref(mdAndUp.value)
const coreVersion = ref('')
const exchangeRates = ref([])
async function retry() {
  await session.restoreSession()
  if (!restoreProblem.value) await router.replace(user.value ? landing(user.value) : '/login')
}
async function signOut() { await session.logout(); await router.replace('/login') }
watch(user, value => { if (!value && ready.value && !restoreProblem.value) router.replace('/login') })
watch(mdAndUp, value => { drawer.value = value })
watch(() => router.currentRoute.value.fullPath, () => { if (!mdAndUp.value) drawer.value = false })
watch(() => user.value?.id, async (id, _previous, onCleanup) => {
  let active = true
  onCleanup(() => { active = false })
  exchangeRates.value = []
  coreVersion.value = ''
  if (!id) return
  try {
    const result = await session.getStatus()
    if (!active) return
    coreVersion.value = typeof result?.appVersion === 'string' ? result.appVersion : ''
    exchangeRates.value = Array.isArray(result?.exchangeRates) ? result.exchangeRates : []
  } catch (problem) { if (active) suppressProblem(problem, { operation:'status.version.load' }) }
}, { immediate:true, flush:'sync' })
</script>
<template>
  <v-app class="sarafan-app">
    <main
      v-if="!ready || restoring || restoreProblem"
      class="restore-screen"
    >
      <img
        :src="'/sarafan-gzhel-icon.png'"
        alt="Сарафан"
      ><template v-if="restoreProblem">
        <h1>Не удалось восстановить сеанс</h1><PageAlertRegion :problem="restoreProblem" /><ActionButton
          variant="blue"
          icon="$refresh"
          label="Повторить"
          tooltip-text="Повторить"
          @click="retry"
        />
      </template><p
        v-else
        role="status"
      >
        Восстановление сеанса…
      </p>
    </main>
    <RouterView v-else-if="!user" />
    <template v-else>
      <v-app-bar
        class="app-bar"
        height="64"
        elevation="1"
      >
        <template #prepend>
          <v-app-bar-nav-icon
            color="primary"
            aria-label="Открыть меню"
            :aria-expanded="drawer"
            @click.stop="drawer = !drawer"
          />
        </template>
        <v-app-bar-title class="app-title">
          <span class="app-user">{{ fullName(user) }}</span>
        </v-app-bar-title>
        <ExchangeRateDisplay :rates="exchangeRates" />
      </v-app-bar>
      <v-navigation-drawer
        v-model="drawer"
        :permanent="mdAndUp"
        :temporary="!mdAndUp"
        elevation="4"
        width="256"
      >
        <template #prepend>
          <RouterLink
            class="drawer-brand"
            :to="landing(user)"
            aria-label="Сарафан · Офис"
          >
            <img
              :src="'/sarafan-gzhel-icon.png'"
              alt=""
            ><span>САРАФАН<small>ОФИС</small></span>
          </RouterLink>
        </template>
        <v-list aria-label="Главная навигация">
          <v-list-item
            v-if="can(user, 'manageUsers')"
            to="/users"
            class="drawer-link"
            prepend-icon="$staff"
            title="Пользователи"
          />
          <template v-if="can(user, 'manageLegalDocuments')">
            <v-list-item
              to="/legal-documents"
              title="Правовые документы"
              class="drawer-link"
            />
            <v-list-item
              to="/customer-consents"
              title="Согласия покупателей"
              class="drawer-link"
            />
            <v-list-item
              to="/privacy-requests"
              title="Обращения по данным"
              class="drawer-link"
            />
          </template>
          <v-list-item
            :to="profileRoute(user)"
            class="drawer-link"
            prepend-icon="$profile"
            title="Профиль"
          />
          <v-list-item
            tag="button"
            type="button"
            class="drawer-action"
            prepend-icon="$logout"
            title="Выход"
            aria-label="Выйти"
            @click="signOut"
          />
        </v-list>
        <template #append>
          <div class="version-info">
            <span>Клиент {{ version }}</span><span v-if="coreVersion">Сервер {{ coreVersion }}</span>
          </div>
        </template>
      </v-navigation-drawer>
      <v-main class="app-main">
        <main
          id="main-content"
          class="app-page-shell"
        >
          <RouterView :key="$route.path" />
        </main>
      </v-main>
    </template>
  </v-app>
</template>
