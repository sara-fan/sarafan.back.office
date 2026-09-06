<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import ActionButton from './components/ActionButton.vue'
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { version } from '../package.json'
import { can, fullName, landing } from './roles.js'
import { useSession } from './stores/session.js'
import { suppressProblem } from './errors/problem.js'
import PageAlertRegion from './components/PageAlertRegion.vue'
const session = useSession()
const { user, ready, restoring, restoreProblem } = session
const router = useRouter()
const menu = ref(false)
const collapsed = ref(false)
const coreVersion = ref('')
async function retry() {
  await session.restoreSession()
  if (!restoreProblem.value) await router.replace(user.value ? landing(user.value) : '/login')
}
async function signOut() { await session.logout(); await router.replace('/login') }
watch(user, value => { if (!value && ready.value && !restoreProblem.value) router.replace('/login') })
watch(() => router.currentRoute.value.fullPath, () => { menu.value = false })
onMounted(async () => {
  try { const result = await session.getStatus(); coreVersion.value = result.appVersion || '' }
  catch (problem) { suppressProblem(problem, { operation:'status.version.load' }) }
})
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
    <div
      v-else
      :class="['app-frame', { 'nav-collapsed':collapsed }]"
      @keydown.esc="menu = false"
    >
      <button
        v-if="menu"
        class="drawer-backdrop"
        aria-label="Закрыть меню"
        @click="menu = false"
      />
      <aside :class="['sidebar', { 'is-open':menu }]">
        <RouterLink
          class="brand"
          to="/home"
          aria-label="Сарафан · Главная"
        >
          <img
            :src="'/sarafan-gzhel-icon.png'"
            alt=""
          ><span>САРАФАН<small>БЭК-ОФИС</small></span>
        </RouterLink>
        <p class="nav-label">
          РАБОЧЕЕ ПРОСТРАНСТВО
        </p><nav aria-label="Главная навигация">
          <RouterLink
            to="/home"
            aria-label="Главная"
            title="Главная"
          >
            <v-icon
              icon="$home"
              size="20"
            /><span>Главная</span>
          </RouterLink><RouterLink
            v-if="can(user, 'manageUsers')"
            to="/users"
            aria-label="Сотрудники"
            title="Сотрудники"
          >
            <v-icon
              icon="$profile"
              size="20"
            /><span>Сотрудники</span>
          </RouterLink><RouterLink
            to="/profile"
            aria-label="Мой профиль"
            title="Мой профиль"
          >
            <v-icon
              icon="$profile"
              size="20"
            /><span>Мой профиль</span>
          </RouterLink>
        </nav>
        <footer class="sidebar-footer">
          <ActionButton
            class="collapse-navigation"
            :icon="collapsed ? '$next' : '$previous'"
            :tooltip-text="collapsed ? 'Развернуть навигацию' : 'Свернуть навигацию'"
            :aria-expanded="!collapsed"
            @click="collapsed = !collapsed"
          />
          <span>Сарафан · Бэк-офис {{ version }}</span><span v-if="coreVersion">Core {{ coreVersion }}</span><span>Работаем с заботой о деталях</span>
        </footer>
      </aside>
      <div class="workspace">
        <header class="topbar">
          <ActionButton
            class="menu-button"
            icon="$menu"
            tooltip-text="Открыть меню"
            :aria-expanded="menu"
            @click="menu = !menu"
          /><span class="topbar-caption">Служебное пространство</span><div class="identity">
            <RouterLink to="/profile">
              {{ fullName(user) }}
            </RouterLink><ActionButton
              icon="$logout"
              label="Выйти"
              tooltip-text="Выйти"
              @click="signOut"
            />
          </div>
        </header><main
          id="main-content"
          class="page-content"
        >
          <RouterView :key="$route.path" />
        </main><footer class="workspace-footer">
          © 2026 Сарафан <span>Бэк-офис</span>
        </footer>
      </div>
    </div>
  </v-app>
</template>
