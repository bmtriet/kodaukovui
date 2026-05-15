#!/bin/bash

# Navigate to script directory just in case it's called from outside
cd "$(dirname "$0")"

cleanup_stuck_processes() {
    local repo_dir
    repo_dir="$(pwd)"

    mapfile -t stale_pids < <(
        pgrep -af "python.*(main\.py|webview_host\.py|roi_capture\.py)" | while read -r pid cmd; do
            if [[ "$cmd" == *"$repo_dir"* ]]; then
                echo "$pid"
            fi
        done
    )

    if [ "${#stale_pids[@]}" -gt 0 ]; then
        echo "Killing stuck KoDauKoVui processes: ${stale_pids[*]}"
        kill "${stale_pids[@]}" 2>/dev/null || true
        sleep 1
        for pid in "${stale_pids[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        done
    fi
}

if [ ! -f "webui/dist/index.html" ]; then
    echo "Missing webui/dist/index.html. Please build the React UI first with:"
    echo "  cd webui && npm install && npm run build"
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment 'venv'..."
    python3 -m venv --system-site-packages venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip and install dependencies
echo "Checking and installing dependencies..."
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt
if [ -f "requirements-linux.txt" ]; then
    python -m pip install --quiet -r requirements-linux.txt
fi

cleanup_stuck_processes

# Run the application
echo "Starting the application..."
python main.py
