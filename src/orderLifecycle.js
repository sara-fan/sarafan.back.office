// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export const FULFILMENT_TRANSITIONS = Object.freeze({
  1100:Object.freeze({ from:300, to:350 }),
  1200:Object.freeze({ from:350, to:400 })
})

export const nextFulfilmentStage = status => Object.values(FULFILMENT_TRANSITIONS).find(item => item.from === status)?.to ?? null
