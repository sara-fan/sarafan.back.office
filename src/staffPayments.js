// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createInternalProblem } from './errors/problem.js'
import { validateOrderDetails } from './orderProduct.js'

export async function recordStaffPayment(session, number, details, ops, mainPayment) {
  const result = await session.orderRequest(`/orders/${number}/${mainPayment ? 'payment' : 'customs'}/paid`, {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ expectedUpdatedAt:details.updatedAt })
  })
  const paid = validateOrderDetails(result, ops, number)
  if (mainPayment ? paid.status !== 300 || paid.canMarkOrderPaid !== false
    : paid.customsPaid !== true || paid.canMarkCustomsPaid !== false) throw createInternalProblem('protocolError')
  return paid
}
