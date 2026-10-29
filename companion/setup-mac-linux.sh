#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Install Python 3.10 or newer first: https://www.python.org/downloads/' >&2
  exit 1
fi
if [ ! -d .venv ]; then
  echo 'Creating a private Python environment...'
  python3 -m venv .venv
fi
echo 'Installing dependencies...'
.venv/bin/python -m pip install -r requirements.txt
echo 'Starting Mightora Clicker...'
exec .venv/bin/python clicker.py
