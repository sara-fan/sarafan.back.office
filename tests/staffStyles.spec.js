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
})
