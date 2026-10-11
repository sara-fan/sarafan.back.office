// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createInternalProblem } from './errors/problem.js'
import { validateOrderDetails } from './orderProduct.js'
import { nextFulfilmentStage } from './orderLifecycle.js'

export async function recordOrderStage(session, number, details, ops) {
  const target = validateOrderDetails(details, ops, number).nextStage
  if (target === null) throw createInternalProblem('protocolError')
  const result = await session.orderRequest('/orders/' + number + '/fulfilment', {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ expectedUpdatedAt:details.updatedAt, status:target })
  })
  const advanced = validateOrderDetails(result, ops, number)
  if (advanced.status !== target || advanced.mainPaymentPaid !== details.mainPaymentPaid
    || result.nextStage !== nextFulfilmentStage(target) || advanced.nextStage !== result.nextStage) throw createInternalProblem('protocolError')
  return advanced
}
