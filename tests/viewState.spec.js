// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isPageResult, readViewState, writeViewState } from '../src/viewState.js'

const defaults = {
  page:1,
  pageSize:10,
  sortBy:[{ key:'processed', order:'asc' }],
  filters:{ search:'', processed:'' }
}
const normalizeFilters = value => typeof value?.search === 'string' && /^\d{0,10}$/u.test(value.search)
  && ['', 'false', 'true'].includes(value?.processed)
  ? { search:value.search, processed:value.processed }
  : null
const read = (userId, viewKey = 'privacy-requests') => readViewState({
  userId,
  viewKey,
  defaults,
  allowedSortKeys:['processed', 'requestedAt'],
  normalizeFilters
})

describe('persistent view state', () => {
  beforeEach(() => globalThis.localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('persists independently for every staff user and view across later reads', () => {
    expect(writeViewState({
      userId:1,
      viewKey:'privacy-requests',
      state:{ page:3, pageSize:50, sortBy:[{ key:'requestedAt', order:'desc' }], filters:{ search:'17', processed:'false' } }
    })).toBe(true)
    expect(writeViewState({
      userId:1,
      viewKey:'legal-document-audit',
      state:{ page:2, pageSize:25, sortBy:[{ key:'processed', order:'asc' }], filters:{ search:'7', processed:'true' } }
    })).toBe(true)
    expect(writeViewState({
      userId:2,
      viewKey:'privacy-requests',
      state:{ page:4, pageSize:100, sortBy:[{ key:'processed', order:'desc' }], filters:{ search:'42', processed:'' } }
    })).toBe(true)

    expect(read(1).state).toEqual({ page:3, pageSize:50, sortBy:[{ key:'requestedAt', order:'desc' }], filters:{ search:'17', processed:'false' } })
    expect(read(2).state).toEqual({ page:4, pageSize:100, sortBy:[{ key:'processed', order:'desc' }], filters:{ search:'42', processed:'' } })
    expect(read(1, 'legal-document-audit').state.page).toBe(2)
    expect(read(3).state).toEqual(defaults)
  })

  it('falls back completely for obsolete or partially invalid persisted records', () => {
    globalThis.localStorage.setItem('sarafan.backoffice.view-state.v1.1.privacy-requests', JSON.stringify({
      version:1,
      page:0,
      pageSize:500,
      sortBy:[{ key:'unknown', order:'sideways' }],
      filters:{ search:'customer', processed:'unknown' }
    }))
    expect(read(1).state).toEqual(defaults)

    globalThis.localStorage.setItem('sarafan.backoffice.view-state.v1.1.privacy-requests', JSON.stringify({
      version:1,
      page:8,
      pageSize:25,
      sortBy:null,
      filters:{ search:'7', processed:'false' }
    }))
    expect(read(1).state).toEqual(defaults)

    globalThis.localStorage.setItem('sarafan.backoffice.view-state.v1.1.privacy-requests', JSON.stringify({
      version:1,
      page:8,
      pageSize:25,
      sortBy:[{ key:'requestedAt', order:'desc' }],
      filters:{ search:'private text', processed:'false' }
    }))
    expect(read(1).state).toEqual(defaults)

    globalThis.localStorage.setItem('sarafan.backoffice.view-state.v1.1.privacy-requests', JSON.stringify({ version:0, page:9 }))
    expect(read(1).state).toEqual(defaults)
    globalThis.localStorage.setItem('sarafan.backoffice.view-state.v1.1.privacy-requests', '{bad json')
    expect(read(1)).toEqual({ state:defaults, unavailable:false })
    expect(globalThis.localStorage.getItem('sarafan.backoffice.view-state.v1.1.privacy-requests')).toBeNull()
  })

  it('keeps storage failures non-throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem:vi.fn(() => { throw new globalThis.DOMException('blocked') }),
      setItem:vi.fn(() => { throw new globalThis.DOMException('full') }),
      removeItem:vi.fn()
    })
    expect(read(1)).toEqual({ state:defaults, unavailable:true })
    expect(writeViewState({ userId:1, viewKey:'privacy-requests', state:defaults })).toBe(false)
  })

  it('never reads or writes a staff record before an authenticated ID is known', () => {
    const readStorage = vi.spyOn(globalThis.localStorage, 'getItem')
    const writeStorage = vi.spyOn(globalThis.localStorage, 'setItem')
    expect(read(undefined)).toEqual({ state:defaults, unavailable:false })
    expect(writeViewState({ userId:null, viewKey:'privacy-requests', state:defaults })).toBe(true)
    expect(readStorage).not.toHaveBeenCalled()
    expect(writeStorage).not.toHaveBeenCalled()

    expect(read(1, 'Invalid View')).toEqual({ state:defaults, unavailable:false })
    expect(writeViewState({ userId:1, viewKey:'Invalid View', state:defaults })).toBe(true)
    expect(readStorage).not.toHaveBeenCalled()
    expect(writeStorage).not.toHaveBeenCalled()
  })

  it('validates complete server page metadata', () => {
    const value = {
      items:[{ id:1 }],
      pagination:{ currentPage:1, pageSize:10, totalCount:11, totalPages:2, hasNextPage:true, hasPreviousPage:false },
      sorting:{ sortBy:'processed', sortOrder:'asc' },
      search:null
    }
    expect(isPageResult(value, ['processed'], item => item.id === 1)).toBe(true)
    expect(isPageResult({ ...value, pagination:{ ...value.pagination, totalPages:3 } }, ['processed'], () => true)).toBe(false)
    expect(isPageResult({ ...value, sorting:{ sortBy:'other', sortOrder:'asc' } }, ['processed'], () => true)).toBe(false)
    expect(isPageResult({ ...value, items:[{ id:2 }] }, ['processed'], item => item.id === 1)).toBe(false)
    expect(isPageResult({ ...value, items:Array.from({ length:11 }, (_, index) => ({ id:index })) }, ['processed'], () => true)).toBe(false)
    expect(isPageResult({ ...value, search:7 }, ['processed'], () => true)).toBe(false)
  })
})
