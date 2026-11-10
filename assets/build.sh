#!/usr/bin/env bash
# Runs the Blender asset build. Usage: assets/build.sh [build.py options]
# With no options it rebuilds the model pack and HUD portraits the game ships.
set -euo pipefail  # pipefail: a Python error in Blender fails the build
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BLENDER="${BLENDER:-$HOME/.local/opt/blender-5.2.1-linux-x64/blender}"
if ! [ -x "$BLENDER" ]; then
  BLENDER="$(command -v blender || true)"
fi
if [ -z "$BLENDER" ]; then
  echo "Blender not found. Set BLENDER=/path/to/blender" >&2
  exit 1
fi
if [ $# -eq 0 ]; then
  set -- --pack "$ROOT/public/models/models.kzm" --icons "$ROOT/public/art/icons"
fi
"$BLENDER" --background --python-exit-code 1 --python "$ROOT/assets/blender/build.py" -- "$@" 2>&1 | grep -v -E "^(libEGL|EGL Error|MESA)|^$|render +\| Saved"
