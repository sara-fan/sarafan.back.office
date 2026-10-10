<script setup>
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import StaffImagePreview from './StaffImagePreview.vue'
import { createInternalProblem } from '../errors/problem.js'
import { useSession } from '../stores/session.js'
import { storeIdentity } from '../storeCatalogue.js'

defineProps({ url:{ type:String, default:null }, file:{ type:Object, default:null }, revision:{ type:Number, default:0 } })
const emit = defineEmits(['invalid-file'])
const session = useSession()
function load(url) {
  if (!/^\/api\/v1\/backoffice\/payment-information-bundles\/[1-9]\d*\/qr\?v=[0-9a-f]{64}$/u.test(url)) throw createInternalProblem('protocolError')
  return session.paymentInformationRequest(url.slice('/api/v1/backoffice'.length), {}, 'blob')
}
</script>
<template>
  <StaffImagePreview
    :url="url"
    :file="file"
    :revision="revision"
    :identity="storeIdentity(session.user.value)"
    :load="load"
    alt="QR СБП получателя"
    @invalid-file="emit('invalid-file', $event)"
  />
</template>
