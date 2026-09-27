#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="$HOME/.config/media-compressor"
SOURCE="$SCRIPT_DIR/assets/CompressOverlay.swift"

mkdir -p "$CONFIG_DIR"

echo "Building compress-overlay..."
swiftc -O \
  -o "$CONFIG_DIR/compress-overlay" \
  "$SOURCE"

# Same stamp the extension checks, so it won't rebuild this binary again
shasum -a 256 "$SOURCE" | awk '{printf "%s", $1}' > "$CONFIG_DIR/compress-overlay.sha256"

echo "Built: $CONFIG_DIR/compress-overlay"
