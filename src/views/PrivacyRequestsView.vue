<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { onMounted, ref } from 'vue'
import { useSession } from '../stores/session.js'
import { normalizeProblem } from '../errors/problem.js'
import { moscowTime } from '../consentFormatting.js'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import ActionButton from '../components/ActionButton.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
const session = useSession()
const rows = ref([])
const selected = ref(null)
const busy = ref(false)
const problem = ref(null)
const confirm = ref(false)
const states = [{value:'open',title:'Получено'}, {value:'in-progress',title:'В работе'}, {value:'completed',title:'Завершено'}]
const stateLabel = value => states.find(x => x.value === value)?.title || value
async function perform(action) {
  busy.value = true; problem.value = null
  try { await action() } catch (error) { problem.value = normalizeProblem(error) }
  finally { busy.value = false }
}
async function load() { await perform(async () => { rows.value = await session.consentRequest('/consents/rights') }) }
function edit(row) { selected.value = { ...row, extend:false }; problem.value = null }
async function save() {
  confirm.value = false
  await perform(async () => {
    const value = selected.value
    const payload = { revision:value.revision, state:value.state, responsibleStaffId:value.responsibleStaffId || null, retentionBasis:value.retentionBasis, completionEvidence:value.completionEvidence, extend:value.extend, extensionReason:value.extensionReason }
    const result = await session.consentRequest(`/consents/rights/${value.id}`, { method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) })
    selected.value = { ...result, extend:false }
    rows.value = await session.consentRequest('/consents/rights')
  })
}
onMounted(load)
</script>
<template>
  <section class="settings table-wide">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Обращения по персональным данным
      </h1><ActionButton
        icon="$refresh"
        tooltip-text="Обновить обращения"
        :disabled="busy"
        @click="load"
      />
    </header><hr class="hr"><PageAlertRegion :problem="problem" />
    <p>Проверьте прекращение операций, удаления у обработчиков и основания сохранения. Завершение обращения фиксирует результат работы; само по себе оно не удаляет данные. Результат и причина продления видны покупателю.</p>
    <v-table density="compact">
      <thead><tr><th>Покупатель</th><th>Вид</th><th>Получено</th><th>Срок (Москва)</th><th>Статус</th><th>Действия</th></tr></thead><tbody>
        <tr
          v-for="row in rows"
          :key="row.id"
        >
          <td>{{ row.customerId }}</td><td>{{ row.kind === 'withdrawal' ? 'Отзыв согласия' : 'Прекращение обработки' }}</td><td>{{ moscowTime(row.receivedAt) }}</td><td>{{ moscowTime(row.dueAt) }} <strong v-if="row.state !== 'completed' && Date.parse(row.dueAt) < Date.now()">Просрочено</strong></td><td>{{ stateLabel(row.state) }}</td><td>
            <ActionButton
              icon="$edit"
              tooltip-text="Открыть обращение"
              :disabled="busy"
              @click="edit(row)"
            />
          </td>
        </tr>
      </tbody>
    </v-table>
    <form
      v-if="selected"
      @submit.prevent="confirm = true"
    >
      <h2>Обращение № {{ selected.id }}</h2>
      <fieldset :disabled="busy || !!selected.completedAt">
        <v-select
          v-model="selected.state"
          :items="states"
          label="Статус"
        />
        <v-text-field
          v-model.number="selected.responsibleStaffId"
          label="Номер ответственного администратора"
          type="number"
          min="1"
        />
        <v-textarea
          v-model="selected.retentionBasis"
          label="Какие данные сохраняются, цель, законное основание и срок"
          maxlength="2000"
        />
        <v-textarea
          v-model="selected.completionEvidence"
          label="Выполненные действия и доказательства (обязательно для завершения)"
          maxlength="2000"
        />
        <template v-if="selected.kind === 'stop-processing' && !selected.extended">
          <v-checkbox
            v-model="selected.extend"
            label="Продлить на 5 рабочих дней (однократно, до истечения срока)"
          /><v-textarea
            v-if="selected.extend"
            v-model="selected.extensionReason"
            label="Мотивированная причина продления для покупателя"
            maxlength="1000"
          />
        </template>
        <ActionButton
          type="submit"
          icon="$save"
          label="Сохранить результат"
          tooltip-text="Сохранить обработку обращения"
          variant="blue"
          :disabled="busy || !!selected.completedAt"
        />
      </fieldset>
    </form>
    <ConfirmDialog
      :open="confirm"
      message="Сохранить результат обработки? Покупатель увидит основание хранения, результат и причину продления. Завершённое обращение нельзя изменить."
      @cancel="confirm = false"
      @confirm="save"
    />
  </section>
</template>
