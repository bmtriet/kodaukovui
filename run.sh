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

check_linux_prereqs() {
  if [ "$(uname -s)" != "Linux" ]; then
    return 0
  fi

  if ! command -v pkg-config >/dev/null 2>&1; then
    echo "[ERROR] pkg-config is required for Tauri Linux builds."
    echo "Install prerequisites:"
    echo "  sudo apt update"
    echo "  sudo apt install -y pkg-config libglib2.0-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev xdotool gnome-screenshot"
    exit 1
  fi

  missing_pc=()
  for module in gobject-2.0 gtk+-3.0 libsoup-3.0 javascriptcoregtk-4.1 webkit2gtk-4.1; do
    if ! pkg-config --exists "$module"; then
      missing_pc+=("$module")
    fi
  done

  if [ "${#missing_pc[@]}" -gt 0 ]; then
    echo "[ERROR] Missing Linux development packages for Tauri:"
    printf '  - %s\n' "${missing_pc[@]}"
    echo
    echo "Install prerequisites:"
    echo "  sudo apt update"
    echo "  sudo apt install -y pkg-config libglib2.0-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev xdotool gnome-screenshot"
    exit 1
  fi
}

if [ ! -d "webui/node_modules" ]; then
  echo "Installing React/Tauri dependencies..."
  (cd webui && npm install)
fi

check_linux_prereqs

echo "Starting clipBo with Tauri/Rust..."
(cd webui && npm run tauri:dev)
