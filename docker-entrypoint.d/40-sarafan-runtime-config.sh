#!/bin/sh
# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of the Sarafan application

set -eu

case "${SARAFAN_BACKOFFICE_LOGGING_ENABLED:-}" in
  true|false) sarafan_logging_enabled="$SARAFAN_BACKOFFICE_LOGGING_ENABLED" ;;
  *) sarafan_logging_enabled="false" ;;
esac

sarafan_runtime_file="/usr/share/nginx/html/runtime-config.js"
sarafan_runtime_temp="${sarafan_runtime_file}.tmp"

{
  echo '// Generated when the container starts. Do not edit.'
  echo "globalThis.__SARAFAN_BACKOFFICE_RUNTIME_CONFIG__ = Object.freeze({ loggingEnabled: ${sarafan_logging_enabled} })"
} > "$sarafan_runtime_temp"

mv "$sarafan_runtime_temp" "$sarafan_runtime_file"
