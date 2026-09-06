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
const sort = ref('name')
const page = ref(1)
const busy = ref(false)
const problem = ref(null)
const selected = ref(null)
const filtered = computed(() => users.value.filter(user => {
  const text = `${fullName(user)} ${user.email} ${user.roles.map(roleLabel).join(' ')}`.toLocaleLowerCase('ru')
  return text.includes(search.value.trim().toLocaleLowerCase('ru')) && (!role.value || user.roles.includes(role.value)) && (!state.value || String(user.isActive) === state.value)
}).sort((a,b) => (sort.value === 'email' ? a.email : fullName(a)).localeCompare(sort.value === 'email' ? b.email : fullName(b), 'ru')))
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 10)))
const visible = computed(() => filtered.value.slice((page.value - 1) * 10, page.value * 10))
watch([search, role, state, sort], () => { page.value = 1 })
async function load() {
  busy.value = true
  problem.value = null
  try { users.value = await session.listUsers(); page.value = Math.min(page.value, pages.value) }
  catch (value) { users.value = []; page.value = 1; problem.value = normalizeProblem(value) }
  finally { busy.value = false }
}
async function disable() {
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
  <section>
    <header class="page-heading">
      <div>
        <p class="eyebrow">
          УПРАВЛЕНИЕ КОМАНДОЙ
        </p><h1>Сотрудники <span class="count">{{ users.length }}</span></h1><p class="muted">
          Учётные записи и доступ к рабочему пространству
        </p>
      </div><ActionButton
        variant="blue"
        icon="$add"
        label="Добавить сотрудника"
        tooltip-text="Добавить сотрудника"
        @click="router.push('/users/new')"
      />
    </header>
    <PageAlertRegion :problem="problem" />
    <div class="table-card">
      <fieldset
        class="table-filters"
        :disabled="busy"
      >
        <label class="search-field">Поиск<input
          v-model="search"
          type="search"
          placeholder="Имя, почта или роль"
        ></label><label>Роль<select v-model="role"><option value="">Все роли</option><option
          v-for="(label, code) in ROLES"
          :key="code"
          :value="code"
        >{{ label }}</option></select></label><label>Статус<select v-model="state"><option value="">Все статусы</option><option value="true">Активные</option><option value="false">Отключённые</option></select></label><label>Сортировка<select v-model="sort"><option value="name">По имени</option><option value="email">По почте</option></select></label>
      </fieldset>
      <p
        v-if="busy"
        class="empty-state"
        role="status"
      >
        Загрузка сотрудников…
      </p>
      <div
        v-else-if="problem"
        class="empty-state"
      >
        <ActionButton

          icon="$refresh"
          label="Повторить загрузку"
          tooltip-text="Повторить загрузку"
          @click="load"
        />
      </div>
      <template v-else>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Сотрудник</th><th>Роли</th><th>Статус</th><th><span class="sr-only">Действия</span></th></tr></thead><tbody>
              <tr
                v-for="user in visible"
                :key="user.id"
              >
                <td>
                  <div class="staff-name">
                    {{ fullName(user) }} <span
                      v-if="user.id === session.user.value?.id"
                      class="muted"
                    >(вы)</span>
                  </div><div class="muted">
                    {{ user.email }}
                  </div>
                </td><td>
                  <div class="role-row">
                    <span
                      v-for="code in user.roles"
                      :key="code"
                      class="role-chip"
                    >{{ roleLabel(code) }}</span>
                  </div>
                </td><td><span :class="['status-pill', { inactive:!user.isActive }]">{{ user.isActive ? 'Активен' : 'Отключён' }}</span></td><td class="row-actions">
                  <ActionButton
                    :item="user"
                    icon="$edit"
                    tooltip-text="Редактировать учётную запись"
                    :disabled="busy"
                    @click="router.push(`/users/${$event.id}`)"
                  /><ActionButton
                    v-if="user.isActive"
                    :item="user"
                    icon="$block"
                    tooltip-text="Отключить учётную запись"
                    variant="red"
                    :disabled="busy"
                    @click="selected = $event"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          v-if="!visible.length"
          class="empty-state"
        >
          Сотрудники не найдены. Попробуйте изменить фильтры.
        </p>
        <footer class="pagination">
          <span>Найдено: {{ filtered.length }}</span><div>
            <ActionButton
              icon="$previous"
              tooltip-text="Предыдущая страница"
              :disabled="page === 1"
              @click="page--"
            /><span>{{ page }} / {{ pages }}</span><ActionButton
              icon="$next"
              tooltip-text="Следующая страница"
              :disabled="page === pages"
              @click="page++"
            />
          </div>
        </footer>
      </template>
    </div>
    <ConfirmDialog
      :open="Boolean(selected)"
      title="Отключить сотрудника?"
      :message="`Сотрудник ${fullName(selected)} потеряет доступ. Все его сеансы будут завершены.`"
      action="Отключить"
      @cancel="selected = null"
      @confirm="disable"
    />
  </section>
</template>
