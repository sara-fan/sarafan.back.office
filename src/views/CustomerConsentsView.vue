<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { ref } from 'vue'
import { useSession } from '../stores/session.js'
import { normalizeProblem, createInternalProblem } from '../errors/problem.js'
import { DOCUMENT_KINDS, CONSENT_STATUSES, moscowTime, downloadBytes } from '../consentFormatting.js'
import ActionButton from '../components/ActionButton.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import LegalDocumentReader from '../components/LegalDocumentReader.vue'
const session = useSession()
const customerId = ref('')
const data = ref(null)
const document = ref(null)
const problem = ref(null)
const busy = ref(false)
async function perform(action) {
  busy.value = true; problem.value = null
  try { await action() } catch (error) { problem.value = normalizeProblem(error) }
  finally { busy.value = false }
}
async function load() {
  data.value = null; document.value = null
  await perform(async () => {
    if (!/^[1-9]\d*$/.test(customerId.value)) throw createInternalProblem('invalidInput', { detail:'Введите положительный номер покупателя.' })
    data.value = await session.consentRequest(`/consents/customers/${customerId.value}`)
  })
}
async function read(id) { await perform(async () => { document.value = await session.consentRequest(`/legal-documents/${id}`) }) }
async function download() { await perform(async () => downloadBytes(await session.consentRequest(`/legal-documents/${document.value.id}/source`, { headers:{ Accept:'text/markdown, application/problem+json' } }, 'blob'), document.value.id)) }
</script>
<template>
  <section class="settings table-wide">
    <h1 class="primary-heading">
      Согласия покупателей
    </h1><hr class="hr"><PageAlertRegion :problem="problem" />
    <form @submit.prevent="load">
      <v-text-field
        v-model="customerId"
        label="Номер покупателя"
        inputmode="numeric"
        :disabled="busy"
      /><ActionButton
        type="submit"
        icon="$search"
        label="Открыть историю"
        tooltip-text="Найти историю согласий покупателя"
        :loading="busy"
      />
    </form>
    <template v-if="data">
      <h2>Покупатель № {{ data.customerId }}</h2>
      <p
        v-for="state in data.statuses"
        :key="state.kind"
      >
        {{ DOCUMENT_KINDS[state.kind] }}: {{ CONSENT_STATUSES[state.status] }} · требуемая версия {{ state.requiredVersion || 'не опубликована' }}
      </p>
      <p>История доступна только для чтения. Сотрудник не может дать согласие от имени покупателя. Связь cookie с аккаунтом фиксирует наблюдение браузера и не разрешает cookie на других устройствах.</p>
      <v-table density="compact">
        <thead><tr><th>Время (Москва)</th><th>Тип / версия</th><th>Решение</th><th>Категории</th><th>Источник / связь</th><th>Текст</th></tr></thead><tbody>
          <tr
            v-for="event in data.history"
            :key="event.id"
          >
            <td>{{ moscowTime(event.at) }}</td><td>{{ DOCUMENT_KINDS[event.kind] }} · {{ event.displayVersion }}</td><td>{{ CONSENT_STATUSES[event.decision] }}</td><td>{{ event.categories.join(', ') }}</td><td>
              {{ event.source }} · {{ event.scope }}<p v-if="event.associatedAt">
                {{ moscowTime(event.associatedAt) }}
              </p>
            </td><td>
              <ActionButton
                icon="$edit"
                tooltip-text="Прочитать принятую версию"
                :disabled="busy"
                @click="read(event.documentId)"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
      <h3>Обращения</h3><p
        v-for="item in data.rightsCases"
        :key="item.id"
      >
        № {{ item.id }} · {{ CONSENT_STATUSES[item.state] || 'Неизвестный статус' }} · срок {{ moscowTime(item.dueAt) }}
      </p><RouterLink to="/privacy-requests">
        Открыть обработку обращений
      </RouterLink>
    </template>
    <LegalDocumentReader
      v-if="document"
      :document="document"
      @download="download"
    />
  </section>
</template>
