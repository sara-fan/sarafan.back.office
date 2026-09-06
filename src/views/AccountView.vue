<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import ActionButton from '../components/ActionButton.vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FormField from '../components/FormField.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { normalizeProblem, problemFieldErrors } from '../errors/problem.js'
import { accountPayload } from '../forms.js'
import { roleLabel } from '../roles.js'
import { useSession } from '../stores/session.js'
const session = useSession()
const route = useRoute()
const router = useRouter()
const profile = route.path === '/profile'
const id = profile ? null : Number(route.params.id) || null
const creating = !profile && !id
const title = profile ? 'Мой профиль' : creating ? 'Новый сотрудник' : 'Карточка сотрудника'
const form = reactive({ firstName:'', lastName:'', patronymic:'', email:'', password:'', confirmation:'', roles:[], isActive:true })
const original = ref(null)
const catalogue = ref([])
const busy = ref(false)
const loaded = ref(false)
const problem = ref(null)
const message = ref('')
const pending = ref(null)
const roleErrors = computed(() => problemFieldErrors(problem.value, 'roles'))
async function load() {
  loaded.value = false
  busy.value = true
  problem.value = null
  try {
    if (profile) original.value = session.user.value
    else {
      const [roles, user] = await Promise.all([session.getRoles(), id ? session.getUser(id) : Promise.resolve(null)])
      catalogue.value = roles
      original.value = user
    }
    if (original.value) Object.assign(form, original.value, { patronymic:original.value.patronymic || '', roles:[...original.value.roles] })
    loaded.value = true
  } catch (value) { problem.value = normalizeProblem(value) }
  finally { busy.value = false }
}
async function save(payload) {
  pending.value = null
  busy.value = true
  try {
    if (profile) await session.saveProfile(payload)
    else await session.saveUser(id, payload, original.value)
    form.password = ''; form.confirmation = ''
    if (!session.user.value) await router.replace('/login')
    else if (!profile) await router.push('/users')
    else message.value = 'Данные сохранены'
  } catch (value) { problem.value = normalizeProblem(value) }
  finally { busy.value = false }
}
async function submit() {
  if (busy.value || !loaded.value) return
  problem.value = null
  message.value = ''
  try {
    const payload = accountPayload(form, { profile, creating })
    const securityChanged = !creating && (Boolean(payload.password) || (!profile && (
      payload.isActive !== original.value.isActive || payload.email.toLowerCase() !== original.value.email.toLowerCase()
      || [...payload.roles].sort().join() !== [...original.value.roles].sort().join())))
    if (securityChanged) pending.value = payload
    else await save(payload)
  } catch (value) { problem.value = normalizeProblem(value) }
}
onMounted(load)
</script>
<template>
  <section>
    <header class="page-heading">
      <div>
        <p class="eyebrow">
          {{ profile ? 'ЛИЧНЫЙ КАБИНЕТ' : 'УПРАВЛЕНИЕ КОМАНДОЙ' }}
        </p><h1>{{ title }}</h1><p class="muted">
          {{ profile ? 'Ваши данные и безопасность учётной записи' : 'Личные данные, роли и доступ сотрудника' }}
        </p>
      </div><RouterLink
        :to="profile ? '/home' : '/users'"
        class="text-link"
      >
        ← Назад
      </RouterLink>
    </header>
    <PageAlertRegion
      :problem="problem"
      :message="message"
    />
    <p
      v-if="busy && !loaded"
      role="status"
      class="empty-state"
    >
      Загрузка данных…
    </p>
    <ActionButton
      v-else-if="!loaded"

      icon="$refresh"
      label="Повторить загрузку"
      tooltip-text="Повторить загрузку"
      @click="load"
    />
    <form
      v-else
      novalidate
      class="account-form"
      @submit.prevent="submit"
    >
      <fieldset :disabled="busy">
        <section class="form-card">
          <h2>Личные данные</h2><p class="muted">
            Имя и фамилия обязательны для заполнения
          </p><div class="form-grid">
            <FormField
              v-model="form.lastName"
              name="lastName"
              label="Фамилия"
              maxlength="100"
              autocomplete="family-name"
              :problem="problem"
            /><FormField
              v-model="form.firstName"
              name="firstName"
              label="Имя"
              maxlength="100"
              autocomplete="given-name"
              :problem="problem"
            /><FormField
              v-model="form.patronymic"
              name="patronymic"
              label="Отчество · необязательно"
              maxlength="100"
              autocomplete="additional-name"
              :problem="problem"
            /><FormField
              v-model="form.email"
              name="email"
              label="Электронная почта"
              type="email"
              :readonly="profile"
              maxlength="254"
              autocomplete="username"
              :problem="problem"
            />
          </div>
        </section>
        <section class="form-card">
          <h2>Безопасность</h2><p class="muted">
            {{ creating ? 'Задайте пароль для первого входа сотрудника.' : 'Оставьте поля пустыми, чтобы сохранить текущий пароль.' }} Не менее 12 символов, не более 72 байт UTF-8.
          </p><div class="form-grid">
            <FormField
              v-model="form.password"
              name="password"
              :label="creating ? 'Пароль' : 'Новый пароль'"
              type="password"
              autocomplete="new-password"
              :problem="problem"
            /><FormField
              v-model="form.confirmation"
              name="confirmation"
              label="Повторите пароль"
              type="password"
              autocomplete="new-password"
              :problem="problem"
            />
          </div>
        </section>
        <section class="form-card">
          <h2>Роли и доступ</h2><div
            v-if="profile"
            class="role-row"
          >
            <span
              v-for="role in form.roles"
              :key="role"
              class="role-chip"
            >{{ roleLabel(role) }}</span>
          </div><template v-else>
            <p class="muted">
              Можно выбрать несколько ролей. Управлять сотрудниками может только администратор.
            </p><div
              class="role-options"
              role="group"
              aria-label="Роли сотрудника"
              aria-describedby="roles-error"
            >
              <label
                v-for="role in catalogue"
                :key="role.code"
                class="check"
              ><input
                v-model="form.roles"
                type="checkbox"
                name="roles"
                :value="role.code"
              >{{ roleLabel(role.code) }}</label>
            </div><div
              id="roles-error"
              class="field-error"
            >
              <span
                v-for="error in roleErrors"
                :key="error"
              >{{ error }}</span>
            </div><label
              v-if="!creating"
              class="check active-check"
            ><input
              v-model="form.isActive"
              type="checkbox"
            >Учётная запись активна</label>
          </template>
        </section>
        <div class="form-actions">
          <ActionButton

            icon="$close"
            label="Отмена"
            tooltip-text="Отмена"
            @click="router.push(profile ? '/home' : '/users')"
          /><ActionButton
            type="submit"
            variant="blue"
            :loading="busy"
            icon="$save"
            :label="creating ? 'Создать сотрудника' : 'Сохранить изменения'"
            :tooltip-text="creating ? 'Создать сотрудника' : 'Сохранить изменения'"
          />
        </div>
      </fieldset>
    </form>
    <ConfirmDialog
      :open="Boolean(pending)"
      title="Изменить данные доступа?"
      message="Все сеансы сотрудника будут завершены. Для продолжения работы потребуется войти повторно."
      action="Сохранить изменения"
      @cancel="pending = null"
      @confirm="save(pending)"
    />
  </section>
</template>
