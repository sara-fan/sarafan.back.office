// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { describe, expect, it } from 'vitest'
import { normalizeStoreAddress } from '../src/storeAddress.js'
import { ops } from './fixtures/stores.js'

describe('store website normalization', () => {
  it.each([
    [' example.com ', 'https://example.com/'], ['//example.com/a', 'https://example.com/a'],
    ['HTTP://EXAMPLE.COM', 'http://example.com/'], ['example.com:8080/a', 'https://example.com:8080/a'],
    ['магазин.рф', 'https://xn--80aairftm.xn--p1ai/'], ['https://example.com./', 'https://example.com./']
  ])('normalizes %s', (input, expected) => expect(normalizeStoreAddress(input, ops.officialUrlRules)).toBe(expected))
  it.each([null, '', ' ', 'example.invalid', '127.0.0.1', 'https://[::1]', 'localhost',
    'ftp://example.com', 'javascript:alert(1)', 'https://user:pass@example.com', 'https:///example.com',
    'https://', 'https://?example.com', 'https://#example.com', 'example.com/a b', 'example.com/\n',
    'example.com/\u007f', 'example.com\\a', 'https://[bad', '-bad.com', 'bad_.com',
    `${'a'.repeat(64)}.com`, `${'a.'.repeat(130)}com`, 'a'.repeat(2049), `example.com/${'я'.repeat(400)}`
  ])('rejects %s', input => expect(normalizeStoreAddress(input, ops.officialUrlRules)).toBeNull())
  it('supports syntax checking without catalogue and enforces the supplied canonical length', () => {
    expect(normalizeStoreAddress('example.com')).toBe('https://example.com/')
    expect(normalizeStoreAddress('example.com', { ...ops.officialUrlRules, maximumLength:15 })).toBeNull()
  })
})
