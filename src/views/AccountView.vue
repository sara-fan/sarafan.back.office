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
import { hasOnlyPresentedFieldErrors, normalizeProblem, problemFieldErrors } from '../errors/problem.js'
import { accountPayload } from '../forms.js'
import { landing, roleLabel, ROLES } from '../roles.js'
import { useSession } from '../stores/session.js'
const session = useSession()
const route = useRoute()
const router = useRouter()
const profile = route.path === '/profile'
const id = profile ? null : Number(route.params.id) || null
const creating = !profile && !id
const title = profile ? 'Профиль' : (creating ? 'Регистрация пользователя' : 'Изменить информацию о пользователе')
const form = reactive({ firstName:'', lastName:'', patronymic:'', email:'', password:'', confirmation:'', roles:[], isActive:true })
const original = ref(null)
const catalogue = ref([])
const busy = ref(false)
const loaded = ref(false)
const problem = ref(null)
const message = ref('')
const pending = ref(null)
const baseline = ref(null)
const refreshConfirmation = ref(false)
const lastAdministrator = ref(false)
const roleErrors = computed(() => problemFieldErrors(problem.value, 'roles'))
const presentedErrorFields = ['firstName', 'lastName', 'patronymic', 'email', 'password', 'confirmation', ...(!profile ? ['roles'] : [])]
const pageProblem = computed(() => hasOnlyPresentedFieldErrors(problem.value, presentedErrorFields) ? null : problem.value)
const roleDescriptions = computed(() => lastAdministrator.value ? 'roles-error last-administrator-note' : 'roles-error')
const returnPath = computed(() => profile ? landing(session.user.value) : '/users')
const roleRank = new Map(Object.keys(ROLES).map((code, index) => [code, index]))
function isActiveAdministrator(value) {
  return Boolean(value?.isActive && value.roles?.includes('administrator'))
}
function resetForm(value) {
  Object.assign(form, {
    firstName:value?.firstName || '', lastName:value?.lastName || '', patronymic:value?.patronymic || '',
    email:value?.email || '', password:'', confirmation:'', roles:[...(value?.roles || [])], isActive:value?.isActive ?? true
  })
}
function formState() {
  return {
    firstName:form.firstName,
    lastName:form.lastName,
    patronymic:form.patronymic,
    email:form.email,
    password:form.password,
    confirmation:form.confirmation,
    roles:[...form.roles].sort(),
    isActive:form.isActive
  }
}
function captureBaseline() {
  baseline.value = formState()
}
const dirty = computed(() => loaded.value && baseline.value !== null
  && JSON.stringify(formState()) !== JSON.stringify(baseline.value))
async function load() {
  loaded.value = false
  busy.value = true
  problem.value = null
  message.value = ''
  lastAdministrator.value = false
  try {
    if (profile) original.value = session.user.value
    else {
      const [roles, user, users] = await Promise.all([
        session.getRoles(),
        id ? session.getUser(id) : Promise.resolve(null),
        id ? session.listUsers() : Promise.resolve([])
      ])
      catalogue.value = [...roles].sort((left, right) => (roleRank.get(left.code) ?? roleRank.size) - (roleRank.get(right.code) ?? roleRank.size))
      original.value = user
      lastAdministrator.value = isActiveAdministrator(user)
        && users.filter(isActiveAdministrator).length <= 1
    }
    resetForm(original.value)
    captureBaseline()
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
    else {
      original.value = {
        ...original.value,
        firstName:form.firstName,
        lastName:form.lastName,
        patronymic:form.patronymic
      }
      captureBaseline()
      message.value = 'Данные сохранены'
    }
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
function requestRefresh() {
  if (busy.value) return
  if (dirty.value) refreshConfirmation.value = true
  else load()
}
async function confirmRefresh() {
  refreshConfirmation.value = false
  await load()
}
function cancel() {
  if (returnPath.value === route.path) {
    problem.value = null
    message.value = ''
    resetForm(original.value)
    captureBaseline()
  } else router.push(returnPath.value)
}
onMounted(load)
</script>
<template>
  <section class="settings form-medium">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        {{ title }}
      </h1>
      <div class="header-actions">
        <ActionButton
          icon="$refresh"
          tooltip-text="Обновить данные"
          :disabled="busy"
          @click="requestRefresh"
        /><ActionButton
          v-if="loaded"
          type="submit"
          form="account-form"
          variant="blue"
          :loading="busy"
          icon="$saveChanges"
          icon-size="28"
          :tooltip-text="creating ? 'Создать пользователя' : 'Сохранить изменения'"
        /><ActionButton
          v-if="loaded"
          icon="$close"
          icon-size="28"
          tooltip-text="Отменить"
          :disabled="busy"
          @click="cancel"
        />
      </div>
    </header>
    <hr class="hr">
    <PageAlertRegion
      :problem="pageProblem"
      :message="message"
    />
    <p
      v-if="busy && !loaded"
      role="status"
      class="empty-state"
    >
      Загрузка данных…
    </p>
    <form
      v-if="loaded"
      id="account-form"
      class="account-form"
      novalidate
      @submit.prevent="submit"
    >
      <fieldset :disabled="busy">
        <FormField
          v-model="form.lastName"
          name="lastName"
          label="Фамилия:"
          placeholder="Фамилия"
          maxlength="100"
          autocomplete="family-name"
          :problem="problem"
        /><FormField
          v-model="form.firstName"
          name="firstName"
          label="Имя:"
          placeholder="Имя"
          maxlength="100"
          autocomplete="given-name"
          :problem="problem"
        /><FormField
          v-model="form.patronymic"
          name="patronymic"
          label="Отчество:"
          placeholder="Отчество"
          maxlength="100"
          autocomplete="additional-name"
          :problem="problem"
        /><FormField
          v-model="form.email"
          name="email"
          label="Адрес электронной почты:"
          placeholder="Адрес электронной почты"
          type="email"
          :readonly="profile"
          maxlength="254"
          autocomplete="username"
          :problem="problem"
        /><FormField
          v-model="form.password"
          name="password"
          label="Пароль:"
          placeholder="Пароль"
          type="password"
          autocomplete="new-password"
          revealable
          :hint="creating ? 'От 8 до 18 символов.' : 'Оставьте пустым, чтобы сохранить текущий пароль. От 8 до 18 символов.'"
          :problem="problem"
        /><FormField
          v-model="form.confirmation"
          name="confirmation"
          label="Пароль ещё раз:"
          placeholder="Пароль"
          type="password"
          autocomplete="new-password"
          revealable
          :problem="problem"
        />
        <div class="account-form-row">
          <span class="account-form-label">Права:</span>
          <div class="account-form-control">
            <p
              v-if="lastAdministrator"
              id="last-administrator-note"
              class="protection-note"
            >
              Последнего активного администратора нельзя отключить или лишить роли.
            </p><div
              v-if="profile"
              class="role-row"
            >
              <span
                v-for="role in form.roles"
                :key="role"
                class="role-chip"
              >{{ roleLabel(role) }}</span>
            </div><template v-else>
              <div
                class="role-options"
                role="group"
                aria-label="Роли пользователя"
                :aria-describedby="roleDescriptions"
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
                  :disabled="lastAdministrator && role.code === 'administrator'"
                  :aria-describedby="lastAdministrator && role.code === 'administrator' ? 'last-administrator-note' : undefined"
                >{{ roleLabel(role.code) }}</label>
              </div><div
                id="roles-error"
                class="field-error"
              >
                <span
                  v-for="error in roleErrors"
                  :key="error"
                >{{ error }}</span>
              </div>
            </template>
          </div>
        </div>
        <div
          v-if="!profile && !creating"
          class="account-form-row"
        >
          <span class="account-form-label">Статус:</span><label class="check"><input
            v-model="form.isActive"
            type="checkbox"
            name="isActive"
            :disabled="lastAdministrator"
            :aria-describedby="lastAdministrator ? 'last-administrator-note' : undefined"
          >Учётная запись активна</label>
        </div>
      </fieldset>
    </form>
    <ConfirmDialog
      :open="refreshConfirmation"
      title="Обновить данные?"
      message="Несохранённые изменения будут потеряны."
      action="Сбросить и обновить"
      action-icon="$refresh"
      @cancel="refreshConfirmation = false"
      @confirm="confirmRefresh"
    />
    <ConfirmDialog
      :open="Boolean(pending)"
      title="Изменить данные доступа?"
      message="Все сеансы пользователя будут завершены. Для продолжения работы потребуется войти повторно."
      action="Сохранить изменения"
      @cancel="pending = null"
      @confirm="save(pending)"
    />
  </section>
</template>
