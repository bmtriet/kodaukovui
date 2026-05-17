#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v cargo >/dev/null 2>&1 && [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "[ERROR] Rust/Cargo is required. Install Rust, then run: . \"\$HOME/.cargo/env\""
  exit 1
fi

if [ ! -d "webui/node_modules" ]; then
  echo "Installing React/Tauri dependencies..."
  (cd webui && npm install)
fi

echo "Starting KoDauKoVui with Tauri/Rust..."
(cd webui && npm run tauri:dev)
