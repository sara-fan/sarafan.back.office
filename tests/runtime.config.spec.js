// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { describe, expect, it } from 'vitest'

import { resolveRuntimeConfig } from '../src/config/runtime.js'

describe('runtime configuration', () => {
  it.each([
    [true, true],
    [false, false],
    ['true', true],
    ['false', false]
  ])('accepts the documented logging value %s', (value, expected) => {
    expect(resolveRuntimeConfig({ runtime: { loggingEnabled: value } }).loggingEnabled)
      .toBe(expected)
  })

  it.each(['TRUE', 'yes', 1, null, '', undefined])(
    'fails closed for invalid runtime logging value %s',
    (value) => {
      const config = resolveRuntimeConfig({
        runtime: { loggingEnabled: value },
        developmentLogging: 'true'
      })
      expect(config.loggingEnabled).toBe(false)
    }
  )

  it('permits the development-only fallback only when runtime configuration is absent', () => {
    expect(resolveRuntimeConfig({ runtime: {}, developmentLogging: 'true' }).loggingEnabled).toBe(true)
    expect(resolveRuntimeConfig({ runtime: null, developmentLogging: 'false' }).loggingEnabled).toBe(false)
    expect(resolveRuntimeConfig({ runtime: {} }).minimumSeverity).toBe('DEBUG')
  })
})
