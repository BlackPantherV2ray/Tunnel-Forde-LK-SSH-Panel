#!/usr/bin/env bash
# ==============================================================================
# Tunnel Forde LK - License Bot Service Runner
# ==============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "Starting Tunnel Forde LK License Bot..."
node bot.js
