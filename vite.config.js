// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vuetify from 'vite-plugin-vuetify'
export default defineConfig({ plugins: [vue(), vuetify({ autoImport:true })], server: { port:5174, strictPort:true, proxy: { '/api/v1': { target: globalThis.process.env.SARAFAN_API_TARGET || 'http://localhost:8080', changeOrigin:true } } } })
