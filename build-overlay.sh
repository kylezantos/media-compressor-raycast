#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="$HOME/.config/media-compressor"

mkdir -p "$CONFIG_DIR"

echo "Building compress-overlay..."
swiftc -O \
  -o "$CONFIG_DIR/compress-overlay" \
  "$SCRIPT_DIR/assets/CompressOverlay.swift"

echo "Built: $CONFIG_DIR/compress-overlay"
