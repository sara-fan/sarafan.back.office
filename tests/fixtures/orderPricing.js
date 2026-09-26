// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { serviceCatalogueOps, manualEntry } from './serviceCatalogue.js'

export const pricingOps = { catalogue:serviceCatalogueOps, validityHours:24, canManage:true,
  componentStates:[{ value:0, name:'Рассчитана', routeAlias:'calculated' }, { value:100, name:'Не рассчитана', routeAlias:'not-calculated' }, { value:200, name:'Не применяется', routeAlias:'not-applicable' }] }
const tariff = { ...manualEntry, service:100, id:10 }
const calculation = {
  calculatedAt:'2026-09-24T10:00:00Z', totalRub:8998.4,
  exchangeRate:{ id:1, provider:'CBR', baseCurrency:840, quoteCurrency:643, nominal:1, officialRate:80, sourceEffectiveDate:'2026-09-24' },
  inputs:{ manualAmounts:{ 100:0 }, selectedServices:[], domesticDeliveryRub:null, customsRub:null },
  components:serviceCatalogueOps.services.map(item => {
    const amounts = { 0:[100, 8000], 100:[0, 0], 200:[1.23, 98.4], 400:[900, 900] }
    return { service:item.value, state:item.value === 300 ? 100 : amounts[item.value] ? 0 : 200,
      currency:[0, 100, 200].includes(item.value) ? 840 : 643,
      amount:amounts[item.value]?.[0] ?? null, amountRub:amounts[item.value]?.[1] ?? null, tariff:item.value === 100 ? tariff : null }
  })
}
export const pricingDetails = { orderNumber:'12345678-1', updatedAt:'2026-09-24T10:00:00Z', canEdit:true, canConfirm:true,
  confirmed:false, expired:false, validUntil:null, calculation, activeTariffs:[tariff],
  history:[{ id:1, at:calculation.calculatedAt, validUntil:null, actorId:null, actorName:null, calculation }] }
