// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createVuetify } from 'vuetify'
import { aliases, fa } from 'vuetify/iconsets/fa'

export const sarafanAliases = {
  ...aliases,
  add: 'fas fa-plus',
  addUser: 'fas fa-user-plus',
  audit: 'fas fa-clock-rotate-left',
  block: 'fas fa-user-slash',
  close: 'fas fa-xmark',
  delete: 'fas fa-trash-can',
  edit: 'fas fa-pen-to-square',
  eye: 'fas fa-eye',
  eyeOff: 'fas fa-eye-slash',
  legalDocuments: 'fas fa-file-contract',
  login: 'fas fa-right-to-bracket',
  logout: 'fas fa-right-from-bracket',
  privacyRequests: 'fas fa-clipboard-list',
  profile: 'fas fa-user',
  refresh: 'fas fa-rotate-right',
  save: 'fas fa-floppy-disk',
  saveChanges: 'fas fa-check-double',
  search: 'fas fa-magnifying-glass',
  staff: 'fas fa-users'
}

export function createSarafanVuetify() {
  return createVuetify({
    icons: {
      defaultSet: 'fa',
      aliases: sarafanAliases,
      sets: { fa }
    },
    theme: {
      defaultTheme: 'sarafanLight',
      themes: {
        sarafanLight: {
          dark: false,
          colors: {
            primary: '#1ca3e4',
            secondary: '#2b6fb3',
            background: '#f3f9fd',
            surface: '#ffffff',
            'surface-variant': '#e5f3fb',
            error: '#b4234d',
            info: '#2478b8',
            success: '#167d9a',
            warning: '#8a63b8'
          }
        }
      }
    }
  })
}
