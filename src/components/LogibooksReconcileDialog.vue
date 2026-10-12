<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { computed, ref, watch } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'
import FormField from './FormField.vue'
import ActionButton from './ActionButton.vue'
import PageAlertRegion from './PageAlertRegion.vue'
import { createInternalProblem, formPageProblem, CORE_PROBLEM_TYPES } from '../errors/problem.js'
import { useSession } from '../stores/session.js'
import { useStaffRequest } from '../useStaffRequest.js'
import { useValidationFocus, validationFields } from '../validationFocus.js'
import { LOGIBOOKS_ROOT, jsonCommand, validateOperation, canManageLogibooksRegisters, canReconcileLogibooksRegister } from '../logibooks.js'
const props = defineProps({ row:{ type:Object, default:null }, operation:{ type:Object, required:true }, ops:{ type:Object, required:true } })
const emit = defineEmits(['cancel', 'saved', 'refresh'])
const session = useSession(), created = ref(false), parcelId = ref(''), registerId = ref(''), note = ref(''), finished = ref(false), locked = ref(false), root = ref(null)
const task = useStaffRequest(session, () => emit('cancel'))
const { busy, problem } = task
const canSubmit = computed(() => canManageLogibooksRegisters(session.user.value, props.ops) && canReconcileLogibooksRegister(props.operation))
const disabled = computed(() => busy.value || locked.value || !canSubmit.value)
const pageProblem = computed(() => formPageProblem(problem.value, [...(created.value ? ['parcelId', 'registerId'] : []), 'note', 'originalAttemptFinished']))
watch(() => props.row, () => {
  task.invalidate(); problem.value = null; created.value = false; parcelId.value = ''; registerId.value = String(props.operation.registerId ?? '')
  note.value = ''; finished.value = false; locked.value = false
})
const focus = useValidationFocus(root, { context:() => [session.user.value?.id, props.operation.id, props.row?.rowNumber],
  active:() => !!props.row, ready:() => !busy.value })
function submit() {
  if (busy.value || locked.value || !props.row) return
  return focus(async () => {
    const success = await task.run(async () => {
      const errors = {}
      if (!note.value.trim() || note.value.trim().length > 2000) errors.note = ['Укажите основание проверки, до 2000 символов.']
      if (!finished.value) errors.originalAttemptFinished = ['Подтвердите завершение исходной попытки.']
      if (created.value) {
        if (!Number.isSafeInteger(Number(parcelId.value)) || Number(parcelId.value) < 1) errors.parcelId = ['Укажите положительный идентификатор посылки.']
        if (!Number.isSafeInteger(Number(registerId.value)) || Number(registerId.value) < 1) errors.registerId = ['Укажите положительный идентификатор реестра.']
      }
      if (Object.keys(errors).length) throw createInternalProblem('invalidInput', { errors })
      if (locked.value || !props.row || !canSubmit.value)
        throw createInternalProblem('invalidInput')
      const command = { version:props.operation.version, attemptId:props.operation.attemptId, originalAttemptFinished:finished.value,
        note:note.value.trim(), registerId:created.value ? Number(registerId.value) : null,
        rows:[{ rowNumber:props.row.rowNumber, created:created.value, parcelId:created.value ? Number(parcelId.value) : null }] }
      return validateOperation(await session.logibooksRequest(LOGIBOOKS_ROOT + '/' + props.operation.id + '/reconcile', jsonCommand(command)), props.operation.id)
    }, value => emit('saved', value))
    if (!success && problem.value?.type === CORE_PROBLEM_TYPES.logibooksUpdateConflict) locked.value = true
  }, () => validationFields(problem.value))
}
</script>
<template>
  <ConfirmDialog
    :open="!!row"
    :busy="busy"
    :action-disabled="disabled"
    title="Сверка таможенного реестра"
    :message="'Заказ ' + (row?.orderNumber ?? '') + '. Проверьте результат исходной попытки создания таможенного реестра.'"
    action="Записать результат"
    action-icon="$saveChanges"
    @confirm="submit"
    @cancel="emit('cancel')"
  >
    <div
      ref="root"
      class="staff-form"
    >
      <PageAlertRegion :problem="pageProblem" />
      <label class="check"><input
        v-model="created"
        type="checkbox"
        :disabled="disabled"
      >Посылка создана</label>
      <template v-if="created">
        <FormField
          v-model="registerId"
          name="registerId"
          label="Идентификатор реестра"
          :problem="problem"
          :disabled="disabled"
          inputmode="numeric"
        />
        <FormField
          v-model="parcelId"
          name="parcelId"
          label="Идентификатор посылки"
          :problem="problem"
          :disabled="disabled"
          inputmode="numeric"
        />
      </template>
      <FormField
        v-model="note"
        name="note"
        label="Основание проверки"
        :problem="problem"
        :disabled="disabled"
        maxlength="2000"
      />
      <FormField
        name="originalAttemptFinished"
        label="Подтверждение завершения"
        :problem="problem"
      >
        <template #control="{ controlAttrs }">
          <label class="check"><input
            v-bind="controlAttrs"
            v-model="finished"
            type="checkbox"
            :disabled="disabled"
          >
            Исходная попытка завершилась; результат подтверждён внешней проверкой.</label>
        </template>
      </FormField>
      <ActionButton
        v-if="locked"
        icon="$refresh"
        label="Обновить"
        tooltip-text="Обновить результат"
        @click="emit('refresh')"
      />
    </div>
  </ConfirmDialog>
</template>
