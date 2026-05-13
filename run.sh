#!/bin/bash

# Navigate to script directory just in case it's called from outside
cd "$(dirname "$0")"

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
pip install --quiet --upgrade pip
pip install --quiet python-dotenv pynput pyperclip google-genai openai Pillow cairosvg pywebview

# Run the application
echo "Starting the application..."
python3 main.py
