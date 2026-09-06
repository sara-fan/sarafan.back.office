<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import ActionButton from '../components/ActionButton.vue'
import { useRouter } from 'vue-router'
import { computed, onMounted, ref, watch } from 'vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { normalizeProblem } from '../errors/problem.js'
import { fullName, roleLabel, ROLES } from '../roles.js'
import { useSession } from '../stores/session.js'
const session = useSession()
const router = useRouter()
const users = ref([])
const search = ref('')
const role = ref('')
const state = ref('')
const page = ref(1)
const itemsPerPage = ref(10)
const sortBy = ref([{ key:'displayName', order:'asc' }])
const busy = ref(false)
const problem = ref(null)
const selected = ref(null)
const roleItems = computed(() => [
  { title:'Все роли', value:'' },
  ...Object.entries(ROLES).map(([value,title]) => ({ title, value }))
])
const stateItems = [
  { title:'Все статусы', value:'' },
  { title:'Активные', value:'true' },
  { title:'Отключённые', value:'false' }
]
const lastAdministratorTooltip = 'Нельзя отключить последнего активного администратора'
const headers = [
  { title:'', key:'actions', sortable:false, width:'96px' },
  { title:'Пользователь', key:'displayName' },
  { title:'Электронная почта', key:'email' },
  { title:'Роли', key:'roles', sortable:false },
  { title:'Статус', key:'isActive' }
]
const filtered = computed(() => users.value.map(user => ({
  ...user,
  displayName:fullName(user)
})).filter(user => {
  const text = `${fullName(user)} ${user.email} ${user.roles.map(roleLabel).join(' ')}`.toLocaleLowerCase('ru')
  return text.includes(search.value.trim().toLocaleLowerCase('ru')) && (!role.value || user.roles.includes(role.value)) && (!state.value || String(user.isActive) === state.value)
}))
const activeAdministratorCount = computed(() => users.value.filter(user =>
  user.isActive && Array.isArray(user.roles) && user.roles.includes('administrator')
).length)
function isLastActiveAdministrator(user) {
  return Boolean(user?.isActive && user.roles?.includes('administrator') && activeAdministratorCount.value <= 1)
}
function disableTooltip(user) {
  return isLastActiveAdministrator(user) ? lastAdministratorTooltip : 'Отключить учётную запись'
}
watch([search, role, state], () => { page.value = 1 })
async function load() {
  busy.value = true
  problem.value = null
  try { users.value = await session.listUsers() }
  catch (value) { users.value = []; page.value = 1; problem.value = normalizeProblem(value) }
  finally { busy.value = false }
}
async function disable() {
  if (!selected.value || isLastActiveAdministrator(selected.value)) {
    selected.value = null
    return
  }
  const id = selected.value.id
  selected.value = null
  busy.value = true
  problem.value = null
  try {
    const current = await session.getUser(id)
    await session.saveUser(id, { email:current.email, firstName:current.firstName, lastName:current.lastName, patronymic:current.patronymic, roles:current.roles, isActive:false }, current)
    if (session.user.value) await load()
  } catch (value) { problem.value = normalizeProblem(value) }
  finally { busy.value = false }
}
onMounted(load)
</script>
<template>
  <section class="settings table-wide">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Пользователи <span class="count">{{ users.length }}</span>
      </h1>
      <div class="header-actions">
        <span
          v-if="busy"
          class="header-spinner"
          role="status"
          aria-label="Загрузка"
        />
        <ActionButton
          variant="blue"
          icon="$addUser"
          icon-size="28"
          tooltip-text="Добавить пользователя"
          :disabled="busy"
          @click="router.push('/users/new')"
        />
      </div>
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="problem" />
    <fieldset
      class="filter-bar"
      :disabled="busy"
    >
      <v-text-field
        id="user-search"
        v-model="search"
        class="filter-control filter-search"
        label="Поиск по любой информации о пользователе"
        prepend-inner-icon="$search"
        variant="solo"
        density="compact"
        active
        hide-details
        clearable
      />
      <v-select
        v-model="role"
        class="filter-control"
        label="Роль"
        :items="roleItems"
        variant="solo"
        density="compact"
        active
        hide-details
      />
      <v-select
        v-model="state"
        class="filter-control"
        label="Статус"
        :items="stateItems"
        variant="solo"
        density="compact"
        active
        hide-details
      />
    </fieldset>
    <div
      v-if="problem"
      class="empty-state"
    >
      <ActionButton
        icon="$refresh"
        label="Повторить загрузку"
        tooltip-text="Повторить загрузку"
        @click="load"
      />
    </div>
    <v-card
      v-else
      class="table-card"
    >
      <v-data-table
        v-model:page="page"
        v-model:items-per-page="itemsPerPage"
        v-model:sort-by="sortBy"
        :headers="headers"
        :items="filtered"
        :loading="busy"
        item-value="id"
        items-per-page-text="Пользователей на странице"
        page-text="{0}-{1} из {2}"
        no-data-text="Пользователи не найдены."
        density="compact"
        class="interlaced-table"
        height="var(--staff-table-height)"
        fixed-header
      >
        <template #[`item.actions`]="{ item }">
          <div class="actions-container">
            <ActionButton
              :item="item"
              icon="$edit"
              tooltip-text="Редактировать учётную запись"
              :disabled="busy"
              @click="router.push(`/users/${$event.id}`)"
            /><ActionButton
              v-if="item.isActive"
              :item="item"
              icon="$block"
              :tooltip-text="disableTooltip(item)"
              variant="red"
              :disabled="busy || isLastActiveAdministrator(item)"
              @click="selected = $event"
            />
          </div>
        </template>
        <template #[`item.displayName`]="{ item }">
          <span class="staff-name">{{ item.displayName }}</span><span
            v-if="item.id === session.user.value?.id"
            class="current-user"
          > (вы)</span>
        </template>
        <template #[`item.roles`]="{ item }">
          <div class="role-row">
            <span
              v-for="code in item.roles"
              :key="code"
              class="role-chip"
            >{{ roleLabel(code) }}</span>
          </div>
        </template>
        <template #[`item.isActive`]="{ item }">
          <span :class="['status-pill', { inactive:!item.isActive }]">{{ item.isActive ? 'Активен' : 'Отключён' }}</span>
        </template>
      </v-data-table>
    </v-card>
    <ConfirmDialog
      :open="Boolean(selected)"
      title="Отключить пользователя?"
      :message="`Пользователь ${fullName(selected)} потеряет доступ. Все его сеансы будут завершены.`"
      action="Отключить"
      @cancel="selected = null"
      @confirm="disable"
    />
  </section>
</template>
