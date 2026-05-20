#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "============================================"
echo " clipBo Linux Build Script"
echo "============================================"
echo ""

# ── Rust / Cargo check ──────────────────────────────────────
if ! command -v cargo >/dev/null 2>&1 && [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Rust/Cargo is required.${NC}"
  echo "Install Rust: https://rustup.rs"
  exit 1
fi

echo -e "${GREEN}[OK]${NC} Cargo $(cargo --version | awk '{print $2}')"

# ── Node.js check ───────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Node.js is required.${NC}"
  echo "Install Node.js: https://nodejs.org"
  exit 1
fi

echo -e "${GREEN}[OK]${NC} Node $(node --version)"

# ── Linux build prerequisites ───────────────────────────────
if [ "$(uname -s)" != "Linux" ]; then
  echo -e "${RED}[ERROR] This script must run on Linux (Ubuntu recommended).${NC}"
  exit 1
fi

echo ""
echo "Checking build dependencies..."

if ! command -v pkg-config >/dev/null 2>&1; then
  echo -e "${RED}[MISSING] pkg-config${NC}"
  echo ""
  echo "Install build prerequisites:"
  echo "  sudo apt update"
  echo "  sudo apt install -y pkg-config libglib2.0-dev libgtk-3-dev libsoup-3.0-dev \\"
  echo "    libjavascriptcoregtk-4.1-dev libwebkit2gtk-4.1-dev \\"
  echo "    libssl-dev libayatana-appindicator3-dev librsvg2-dev"
  exit 1
fi

missing_pc=()
for module in gobject-2.0 gtk+-3.0 libsoup-3.0 javascriptcoregtk-4.1 webkit2gtk-4.1; do
  if ! pkg-config --exists "$module"; then
    missing_pc+=("$module")
  fi
done

if [ "${#missing_pc[@]}" -gt 0 ]; then
  echo -e "${RED}[MISSING] pkg-config modules:${NC}"
  printf '  - %s\n' "${missing_pc[@]}"
  echo ""
  echo "Install build prerequisites:"
  echo "  sudo apt update"
  echo "  sudo apt install -y pkg-config libglib2.0-dev libgtk-3-dev libsoup-3.0-dev \\"
  echo "    libjavascriptcoregtk-4.1-dev libwebkit2gtk-4.1-dev \\"
  echo "    libssl-dev libayatana-appindicator3-dev librsvg2-dev"
  exit 1
fi

echo -e "${GREEN}[OK]${NC} Build dependencies satisfied"

# ── Runtime tool hints ──────────────────────────────────────
echo ""
echo "Runtime tool checks (optional but recommended):"

runtime_tools=("gnome-screenshot" "flameshot" "scrot" "xrandr")
for tool in "${runtime_tools[@]}"; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo -e "  ${GREEN}[OK]${NC} $tool"
  else
    echo -e "  ${YELLOW}[--]${NC} $tool (missing — some features may be limited)"
  fi
done

# ── Install npm dependencies ────────────────────────────────
echo ""
echo "Installing npm dependencies..."
(cd webui && npm install)

# ── Build ───────────────────────────────────────────────────
echo ""
echo "Building clipBo for Linux..."
(cd webui && npm run tauri:build)

# ── Results ─────────────────────────────────────────────────
echo ""
echo "============================================"
echo -e " ${GREEN}Build complete!${NC}"
echo "============================================"
echo ""

bundle_dir="webui/src-tauri/target/release/bundle"
if [ -d "$bundle_dir" ]; then
  echo "Output artifacts:"
  find "$bundle_dir" -maxdepth 2 -type f \( -name "*.AppImage" -o -name "*.deb" \) 2>/dev/null | while read -r f; do
    size=$(du -h "$f" | cut -f1)
    echo "  $f ($size)"
  done
else
  echo "Bundle directory not found. Check build output above for errors."
fi

echo ""
echo "Tips:"
echo "  - Install gnome-screenshot for ROI screen capture:"
echo "      sudo apt install gnome-screenshot"
echo "  - For Wayland screen capture, install grim+slurp:"
echo "      sudo apt install grim slurp"
echo "  - Alternative capture tools: flameshot, scrot"
