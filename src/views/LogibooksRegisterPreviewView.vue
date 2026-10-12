<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import EditorHeaderActions from '../components/EditorHeaderActions.vue'
import LogibooksRegisterFields from '../components/LogibooksRegisterFields.vue'
import LogibooksGoodsTable from '../components/LogibooksGoodsTable.vue'
import PageAlertRegion from '../components/PageAlertRegion.vue'
import { createInternalProblem, formPageProblem, CORE_PROBLEM_TYPES } from '../errors/problem.js'
import { useSession } from '../stores/session.js'
import { can } from '../roles.js'
import { useStaffRequest } from '../useStaffRequest.js'
import { useDiscardChanges } from '../useDiscardChanges.js'
import { useValidationFocus, validationFields } from '../validationFocus.js'
import { PAGE_SIZE_OPTIONS } from '../viewState.js'
import { LOGIBOOKS_ROOT, jsonCommand, uuidIsValid, validateLogibooksOps, validatePreview, validateOperation, REGISTER_INPUT_FIELDS, normalizeRegisterInput, registerInputErrors, canManageLogibooksRegisters, canCreateLogibooksRegister } from '../logibooks.js'
const session = useSession(), route = useRoute(), router = useRouter()
const preview = ref(null), ops = ref(null), fileName = ref(''), page = ref(1), pageSize = ref(25), committed = ref(false), root = ref(null)
const command = ref(null), registerFields = ref({}), previewCurrent = ref(false)
const task = useStaffRequest(session, () => { preview.value = null; command.value = null; fileName.value = ''; registerFields.value = {}; previewCurrent.value = false; committed.value = false })
const { busy, problem } = task
const draft = computed(() => session.logibooksDraft.value)
const operationId = computed(() => route.query.operationId)
function restoreCommand() {
  command.value = draft.value?.operationId === operationId.value ? draft.value.command ?? null : null
  const saved = draft.value?.operationId === operationId.value ? draft.value : null
  fileName.value = command.value?.fileName ?? saved?.fileName ?? ''
  registerFields.value = { ...(command.value?.register ?? saved?.register ?? {}) }
}
const canManage = computed(() => canManageLogibooksRegisters(session.user.value, ops.value))
const canSubmit = computed(() => command.value
  ? canManage.value || !ops.value && can(session.user.value, 'manageLogibooksRegisters')
  : !!preview.value && canCreateLogibooksRegister(session.user.value, ops.value))
const unavailable = () => createInternalProblem('invalidInput', { errors:{ orders:['Создание таможенного реестра недоступно.'] } })
async function requestOps() {
  if (!can(session.user.value, 'manageLogibooksRegisters')) throw unavailable()
  return validateLogibooksOps(await session.logibooksRequest(LOGIBOOKS_ROOT + '/ops'))
}
function refreshOps() { return task.run(requestOps, value => { ops.value = value }) }
const dirty = computed(() => (!!draft.value || !!command.value || !!fileName.value) && !committed.value)
const { confirmation, confirmDiscard, finish } = useDiscardChanges(dirty)
const pageProblem = computed(() => formPageProblem(problem.value, REGISTER_INPUT_FIELDS.map(key => 'register.' + key)))
const rows = computed(() => (preview.value?.parcels ?? []).slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  .map((goods, index) => ({ rowNumber:(page.value - 1) * pageSize.value + index + 1, orderNumber:goods.postingNumber, goods })))
const focus = useValidationFocus(root, { context:() => [session.user.value?.id, route.fullPath],
  active:() => !confirmation.value, ready:() => !busy.value })
async function openOperation(value) { committed.value = true; await router.replace(LOGIBOOKS_ROOT + '/' + value.id) }
function load() {
  return task.run(async () => {
    if (!uuidIsValid(operationId.value)) throw createInternalProblem('invalidInput', { errors:{ orders:['Выберите оплаченные заказы.'] } })
    if (!draft.value || draft.value.operationId !== operationId.value || command.value) {
      return { operation:await validateOperation(await session.logibooksRequest(LOGIBOOKS_ROOT + '/' + operationId.value), operationId.value) }
    }
    const errors = registerInputErrors(registerFields.value)
    if (Object.keys(errors).length) throw createInternalProblem('invalidInput', { errors })
    const request = { operationId:operationId.value, fileName:fileName.value || null, orders:draft.value.orders,
      register:normalizeRegisterInput(registerFields.value) }
    const metadata = await requestOps()
    if (!canCreateLogibooksRegister(session.user.value, metadata)) return { metadata }
    const result = validatePreview(await session.logibooksRequest(LOGIBOOKS_ROOT + '/preview', jsonCommand(request)), metadata, request)
    return { metadata, result }
  }, async value => {
    if (value.operation) return openOperation(value.operation)
    ops.value = value.metadata
    if (!value.result) { previewCurrent.value = false; throw unavailable() }
    preview.value = value.result; fileName.value = value.result.fileName
    registerFields.value = { ...normalizeRegisterInput(value.result.register) }; previewCurrent.value = true
    persistDraft()
  })
}
function persistDraft() {
  session.logibooksDraft.value = { ...draft.value, fileName:fileName.value, register:{ ...registerFields.value } }
}
function changeField(key, value) {
  if (busy.value || command.value || committed.value || !canManage.value) return
  if (!REGISTER_INPUT_FIELDS.includes(key)) return
  registerFields.value = { ...registerFields.value, [key]:value }
  previewCurrent.value = false
  persistDraft()
}
function send() {
  if (busy.value || committed.value) return
  return focus(async () => {
    if (!command.value && !previewCurrent.value && !await load()) return
    if (committed.value) return
    if (command.value && !ops.value && !await refreshOps()) return
    const admitted = await task.run(async () => {
      if (!canManage.value) throw unavailable()
      if (!command.value) {
        if (!previewCurrent.value || !preview.value || preview.value.fileName !== fileName.value.trim()
          || !canCreateLogibooksRegister(session.user.value, ops.value)) throw unavailable()
        command.value = { operationId:operationId.value, fileName:preview.value.fileName, orders:draft.value.orders,
          mappingVersion:preview.value.mappingVersion, fingerprint:preview.value.fingerprint, register:normalizeRegisterInput(preview.value.register) }
        session.logibooksDraft.value = { ...draft.value, command:command.value }
      }
      return validateOperation(await session.logibooksRequest(LOGIBOOKS_ROOT, jsonCommand(command.value)), operationId.value)
    }, openOperation)
    if (!admitted && problem.value?.type === CORE_PROBLEM_TYPES.logibooksPreviewChanged) {
      command.value = null; previewCurrent.value = false
      session.logibooksDraft.value = { ...draft.value, command:null }
    }
  }, () => validationFields(problem.value))
}
function refresh() {
  return focus(async () => {
    if (command.value && !await refreshOps()) return
    return load()
  }, () => validationFields(problem.value))
}
async function cancel() {
  if (!await confirmDiscard()) return
  committed.value = true
  await task.run(() => router.push('/orders'))
}
function paging(key, value) {
  if (Number.isInteger(value) && value > 0 && (key !== 'pageSize' || PAGE_SIZE_OPTIONS.includes(value))) {
    if (key === 'pageSize') { pageSize.value = value; page.value = 1 } else page.value = value
  }
}
watch(() => route.query.operationId, () => { task.invalidate(); preview.value = null; previewCurrent.value = false; fileName.value = ''; restoreCommand(); committed.value = false; load() })
onMounted(() => { restoreCommand(); load() })
</script>
<template>
  <section class="settings">
    <header class="header-with-actions">
      <h1 class="primary-heading">
        Новый таможенный реестр
      </h1>
      <EditorHeaderActions
        form="logibooks-preview"
        :busy="busy"
        :save-disabled="busy || committed || !canSubmit"
        save-tooltip="Создать таможенный реестр"
        @refresh="refresh"
        @cancel="cancel"
      />
    </header>
    <hr class="hr">
    <PageAlertRegion :problem="pageProblem" />
    <form
      id="logibooks-preview"
      ref="root"
      class="staff-form"
      @submit.prevent="send"
    >
      <LogibooksRegisterFields
        :value="{ ...registerFields, realWeightKg:preview?.register.realWeightKg }"
        :problem="problem"
        :disabled="busy || !!command || committed || !canManage"
        @change="changeField"
      />
    </form>
    <template v-if="preview">
      <LogibooksGoodsTable
        :rows="rows"
        :currency-symbol="ops.unitPriceCurrency.symbol"
        :total="preview.parcels.length"
        :page="page"
        :page-size="pageSize"
        :busy="busy"
        @page="paging('page', $event)"
        @page-size="paging('pageSize', $event)"
      />
    </template>
    <ConfirmDialog
      :open="confirmation"
      message="Отменить создание реестра?"
      action="Отменить создание"
      @confirm="finish(true)"
      @cancel="finish(false)"
    />
  </section>
</template>
