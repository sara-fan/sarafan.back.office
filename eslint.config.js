// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'

export default [
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**']
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{js,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        document: 'readonly'
      }
    },
    rules: {
      'no-console': 'error',
      'vue/multi-word-component-names': 'off'
    }
  },
  {
    files: ['tests/**/*.js'],
    rules: {
      'vue/one-component-per-file': 'off',
      'vue/require-prop-types': 'off'
    }
  },
  {
    files: ['src/observability/console-sink.js'],
    rules: {
      'no-console': 'off'
    }
  }
]
