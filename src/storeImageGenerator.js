// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export const STORE_IMAGE_WIDTH = 400
export const STORE_IMAGE_HEIGHT = 200
const HORIZONTAL_PADDING = 28
const VERTICAL_PADDING = 24
const MAX_FONT_SIZE = 76
const MIN_FONT_SIZE = 16
const FONT_STEP = 2
const FONT_FAMILY = '"Segoe UI Variable", "Segoe UI", sans-serif'
const graphemes = value => [...new Intl.Segmenter('ru', { granularity:'grapheme' }).segment(value)].map(item => item.segment)
export const storeImageName = value => value.trim()

function splitLongWord(context, word, maximumWidth) {
  const parts = []
  let part = ''
  for (const character of graphemes(word)) {
    const candidate = part + character
    if (part && context.measureText(candidate).width > maximumWidth) { parts.push(part); part = character }
    else part = candidate
  }
  if (part) parts.push(part)
  return parts
}

function wrap(context, value, maximumWidth) {
  const lines = []
  let line = ''
  for (const token of value.match(/\s+|\S+/gu) ?? []) {
    if (/^\s+$/u.test(token)) {
      const candidate = line + token
      if (line && context.measureText(candidate).width <= maximumWidth) line = candidate
      else if (line) { lines.push(line.trimEnd()); line = '' }
      continue
    }
    const word = token
    const parts = context.measureText(word).width > maximumWidth ? splitLongWord(context, word, maximumWidth) : [word]
    for (const part of parts) {
      const candidate = line + part
      if (line && context.measureText(candidate).width > maximumWidth) { lines.push(line.trimEnd()); line = part }
      else line = candidate
    }
  }
  if (line) lines.push(line.trimEnd())
  return lines
}

export function layoutStoreName(context, value) {
  const name = storeImageName(value)
  if (!name) throw new TypeError('Store name is required')
  const maximumWidth = STORE_IMAGE_WIDTH - HORIZONTAL_PADDING * 2
  const maximumHeight = STORE_IMAGE_HEIGHT - VERTICAL_PADDING * 2
  for (let fontSize = MAX_FONT_SIZE; fontSize >= MIN_FONT_SIZE; fontSize -= FONT_STEP) {
    context.font = `700 ${fontSize}px ${FONT_FAMILY}`
    const lines = wrap(context, name, maximumWidth)
    const lineHeight = Math.ceil(fontSize * 1.15)
    if (lines.length * lineHeight <= maximumHeight) return { fontSize, lineHeight, lines, name }
  }
  throw new RangeError('Store name does not fit')
}

export async function generateStoreImage(value, createCanvas = () => globalThis.document.createElement('canvas')) {
  if (globalThis.document?.fonts?.ready) await globalThis.document.fonts.ready
  const canvas = createCanvas()
  canvas.width = STORE_IMAGE_WIDTH
  canvas.height = STORE_IMAGE_HEIGHT
  const context = canvas.getContext?.('2d')
  if (!context) throw new TypeError('Canvas is unavailable')
  const gradient = context.createLinearGradient(0, 0, STORE_IMAGE_WIDTH, STORE_IMAGE_HEIGHT)
  gradient.addColorStop(0, '#e5f3fb')
  gradient.addColorStop(1, '#ffffff')
  context.fillStyle = gradient
  context.fillRect(0, 0, STORE_IMAGE_WIDTH, STORE_IMAGE_HEIGHT)
  const layout = layoutStoreName(context, value)
  context.fillStyle = '#2b6fb3'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `700 ${layout.fontSize}px ${FONT_FAMILY}`
  const top = (STORE_IMAGE_HEIGHT - layout.lines.length * layout.lineHeight) / 2
  layout.lines.forEach((line, index) => context.fillText(line, STORE_IMAGE_WIDTH / 2, top + (index + 0.5) * layout.lineHeight))
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!(blob instanceof globalThis.Blob) || !blob.size) throw new TypeError('PNG generation failed')
  return new globalThis.File([blob], 'store-image.png', { type:'image/png' })
}
