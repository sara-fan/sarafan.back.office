// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createInternalProblem } from './errors/problem.js'

export function validateImageFile(file, { contentTypes, maxBytes }, field) {
  if (!file) return null
  const message = !contentTypes.includes(file.type) ? 'Выберите файл PNG, JPEG или WebP.'
    : file.size <= 0 || file.size > maxBytes ? `Размер файла должен быть от 1 до ${maxBytes} байт.` : null
  return message ? createInternalProblem('invalidInput', { errors:{ [field]:[message] } }) : null
}
