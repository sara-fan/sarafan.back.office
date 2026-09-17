// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

const viewsDirectory = resolve(cwd(), 'src', 'views')
const views = readdirSync(viewsDirectory).filter(name => name.endsWith('.vue')).map(name => ({
  name,
  source:readFileSync(resolve(viewsDirectory, name), 'utf8')
}))

describe('shared staff screen styles', () => {
  it('uses the shared header for all entity forms and keeps deletion in lists', () => {
    for (const name of ['AccountView.vue', 'OrderView.vue', 'StoreView.vue', 'LegalDocumentView.vue']) {
      const view = views.find(item => item.name === name)
      expect(view.source, name).toContain('<EditorHeaderActions')
      expect(view.source, name).not.toContain('icon="$delete"')
    }
  })
  it('applies the staff form set to every form view', () => {
    for (const view of views) {
      for (const form of view.source.match(/<form\b[\s\S]*?>/gu) ?? []) {
        expect(form, view.name).toMatch(/class="[^"]*\bstaff-form\b[^"]*"/u)
      }
    }
  })

  it('applies the staff list set to every data-table view', () => {
    for (const view of views.filter(item => item.source.includes('<v-data-table'))) {
      expect(view.source, view.name).toMatch(/<section class="[^"]*\bstaff-list\b[^"]*"/u)
    }
  })

  it.each([
    ['OrderView.vue', 'product-grid'],
    ['OrderView.vue', 'buyer-grid'],
    ['LegalDocumentView.vue', 'legal-form-grid']
  ])('uses shared condensed row spacing in %s / %s', (name, section) => {
    const view = views.find(item => item.name === name)
    const sections = view.source.match(/<(?:fieldset|dl)\b[^>]*>/gu)
    const element = sections.find(tag => tag.includes(section))
    expect(element).toMatch(/class="[^"]*\bstaff-form-grid\b[^"]*"/u)
  })
})
