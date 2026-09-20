// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { describe, expect, it, vi } from 'vitest'
import { generateStoreImage, layoutStoreName, storeImageName, STORE_IMAGE_HEIGHT, STORE_IMAGE_WIDTH } from '../src/storeImageGenerator.js'

function surface(width = text => [...text].length * 20) {
  const gradient = { addColorStop:vi.fn() }
  const context = {
    font:'', fillStyle:'', textAlign:'', textBaseline:'',
    measureText:vi.fn(text => ({ width:width(text, Number(context.font.match(/(\d+)px/u)?.[1]) || 16) })),
    createLinearGradient:vi.fn(() => gradient), fillRect:vi.fn(), fillText:vi.fn()
  }
  const canvas = { width:0, height:0, getContext:vi.fn(() => context), toBlob:vi.fn(callback => callback(new globalThis.Blob(['png'], { type:'image/png' }))) }
  return { canvas, context, gradient }
}

describe('store image generator', () => {
  it('normalizes display whitespace and fits Cyrillic, Latin and long grapheme-safe names', () => {
    expect(storeImageName('  Магазин   Alpha  ')).toBe('Магазин   Alpha')
    const { context } = surface((text, size) => [...text].length * size * 0.55)
    const short = layoutStoreName(context, 'Магазин Alpha')
    expect(short.name).toBe('Магазин Alpha')
    expect(short.lines.join(' ')).toBe('Магазин Alpha')
    const long = layoutStoreName(context, 'ОченьДлинноеНазвание🧑‍💻'.repeat(8))
    expect(long.fontSize).toBeLessThan(short.fontSize)
    expect(long.lines.join('')).toContain('🧑‍💻')
    expect(() => layoutStoreName(context, '   ')).toThrow(TypeError)
    expect(() => layoutStoreName(surface(() => Number.POSITIVE_INFINITY).context, 'x'.repeat(200))).toThrow(RangeError)
  })

  it('creates a compact PNG containing only the supplied store name', async () => {
    const { canvas, context, gradient } = surface((text, size) => [...text].length * size * 0.45)
    vi.spyOn(globalThis.document, 'createElement').mockReturnValue(canvas)
    const file = await generateStoreImage('  iHerb Магазин  ')
    expect([canvas.width, canvas.height]).toEqual([STORE_IMAGE_WIDTH, STORE_IMAGE_HEIGHT])
    expect([STORE_IMAGE_WIDTH, STORE_IMAGE_HEIGHT]).toEqual([400, 200])
    expect(file).toBeInstanceOf(globalThis.File)
    expect(file.name).toBe('store-image.png')
    expect(file.type).toBe('image/png')
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 400, 200)
    expect(gradient.addColorStop).toHaveBeenCalledTimes(2)
    expect(context.fillText.mock.calls.map(call => call[0]).join(' ')).toBe('iHerb Магазин')
    expect(context.fillText.mock.calls.flat().join(' ')).not.toContain('example.com')
  })

  it('rejects unavailable canvas and empty PNG results', async () => {
    await expect(generateStoreImage('Shop', () => ({ getContext:() => null }))).rejects.toThrow(TypeError)
    const { canvas } = surface()
    canvas.toBlob = callback => callback(null)
    await expect(generateStoreImage('Shop', () => canvas)).rejects.toThrow(TypeError)
  })
})
