#!/bin/bash

# Navigate to script directory just in case it's called from outside
cd "$(dirname "$0")"

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

# Run the application
echo "Starting the application..."
python main.py
