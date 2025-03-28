#!/bin/bash

# This script uses code2prompt (https://github.com/raphaelmansuy/code2prompt)
# to generate a comprehensive context file for AI agents working with this codebase.
# code2prompt is a powerful command-line tool that creates a markdown file containing
# the content and structure of your codebase, making it easier for AI models to
# understand and work with the project.

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if code2prompt exists
if ! command_exists code2prompt; then
    echo "code2prompt not found. Checking for pipx..."

    # Check if pipx exists
    if ! command_exists pipx; then
        echo "pipx not found. Installing pipx..."
        python3 -m pip install --user pipx
        python3 -m pipx ensurepath

        # Reload PATH to include pipx
        source ~/.bashrc

        if ! command_exists pipx; then
            echo "Failed to install pipx. Please install it manually."
            exit 1
        fi
    fi

    echo "Installing code2prompt using pipx..."
    pipx install code2prompt

    # Verify code2prompt installation
    if ! command_exists code2prompt; then
        echo "Failed to install code2prompt. Please install it manually."
        exit 1
    fi
fi

echo "code2prompt is available. Proceeding with context generation..."

# Remove existing context file if it exists
rm -f context-codebase.md

# Generate new context file
code2prompt -p src -p instrumentation.ts -p package.json -p biome.jsonc -p drizzle.config.ts -p next.config.js -p postcss.config.js -p tsconfig.json -p .env -p .env.example -o context-codebase.md
code context-codebase.md
