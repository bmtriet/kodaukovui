#!/usr/bin/env bash

# Navigate to script directory just in case it's called from outside
cd "$(dirname "$0")"

OS_NAME="$(uname -s)"

choose_python() {
    for candidate in python3.13 python3.12 python3.11 python3.10 python3; do
        if command -v "$candidate" >/dev/null 2>&1; then
            "$candidate" - <<'PY'
import sys
raise SystemExit(0 if (3, 10) <= sys.version_info[:2] < (3, 14) else 1)
PY
            if [ "$?" -eq 0 ]; then
                command -v "$candidate"
                return 0
            fi
        fi
    done
    return 1
}

cleanup_stuck_processes() {
    local repo_dir
    local stale_pids
    repo_dir="$(pwd)"

    stale_pids="$(
        ps -axo pid=,command= | while read -r pid cmd; do
            case "$cmd" in
                *"$repo_dir"*)
                    case "$cmd" in
                        *python*"main.py"*|*python*"webview_host.py"*|*python*"roi_capture.py"*) echo "$pid" ;;
                    esac
                    ;;
            esac
        done
    )"

    if [ -n "$stale_pids" ]; then
        echo "Killing stuck KoDauKoVui processes: $stale_pids"
        echo "$stale_pids" | xargs kill 2>/dev/null || true
        sleep 1
        for pid in $stale_pids; do
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        done
    fi
}

PYTHON_BIN="$(choose_python)"
if [ -z "$PYTHON_BIN" ]; then
    echo "[ERROR] KoDauKoVui needs Python 3.10-3.13."
    echo "On macOS, install one with: brew install python@3.12"
    exit 1
fi

if [ ! -d "webui/node_modules" ]; then
    echo "Installing React UI dependencies..."
    (cd webui && npm install)
fi

if [ ! -f "webui/dist/index.html" ]; then
    echo "Building React UI..."
    (cd webui && npm run build)
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment 'venv'..."
    "$PYTHON_BIN" -m venv --system-site-packages venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip and install dependencies
echo "Checking and installing dependencies..."
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt
if [ "$OS_NAME" = "Linux" ] && [ -f "requirements-linux.txt" ]; then
    python -m pip install --quiet -r requirements-linux.txt
fi

cleanup_stuck_processes

# Set IME environment variables before launching Python
# This ensures the broker subprocess inherits the correct fcitx5 config
if [ "$OS_NAME" = "Linux" ]; then
    if command -v fcitx5-remote &>/dev/null || command -v fcitx-remote &>/dev/null; then
        export QT_IM_MODULE=fcitx
        export GTK_IM_MODULE=fcitx
        export XMODIFIERS="@im=fcitx"
    else
        export QT_IM_MODULE=ibus
        export GTK_IM_MODULE=ibus
        export XMODIFIERS="@im=ibus"
    fi

    # Point Qt to the venv's PyQt5 plugin directory (contains fcitx5 input context plugin)
    VENV_QT_PLUGINS="$(python - <<'PY'
import site
from pathlib import Path
for base in site.getsitepackages():
    plugins = Path(base) / "PyQt5" / "Qt5" / "plugins"
    if plugins.exists():
        print(plugins)
        break
PY
)"
    if [ -n "$VENV_QT_PLUGINS" ]; then
        export QT_PLUGIN_PATH="$VENV_QT_PLUGINS${QT_PLUGIN_PATH:+:$QT_PLUGIN_PATH}"
    fi
fi

# Run the application
echo "Starting the application..."
python main.py
