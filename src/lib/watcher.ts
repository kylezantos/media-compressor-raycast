import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import {
  CONFIG_DIR,
  WATCHERS_FILE,
  LAUNCH_AGENT_DIR,
  LAUNCH_AGENT_NAME,
  LAUNCH_AGENT_PLIST,
  ImageQualityPreset,
  XATTR_KEY,
} from "./constants";

export interface WatchedFolder {
  path: string;
  mode: ImageQualityPreset;
  addedAt: string;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

export function loadWatchers(): WatchedFolder[] {
  ensureConfigDir();
  if (!existsSync(WATCHERS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(WATCHERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

export function saveWatchers(watchers: WatchedFolder[]): void {
  ensureConfigDir();
  writeFileSync(WATCHERS_FILE, JSON.stringify(watchers, null, 2));
}

export function addWatcher(path: string, mode: ImageQualityPreset): WatchedFolder[] {
  const watchers = loadWatchers();
  if (watchers.some((w) => w.path === path)) return watchers;
  watchers.push({ path, mode, addedAt: new Date().toISOString() });
  saveWatchers(watchers);
  updateLaunchAgent(watchers);
  return watchers;
}

export function removeWatcher(path: string): WatchedFolder[] {
  let watchers = loadWatchers();
  watchers = watchers.filter((w) => w.path !== path);
  saveWatchers(watchers);
  if (watchers.length === 0) {
    uninstallLaunchAgent();
  } else {
    updateLaunchAgent(watchers);
  }
  return watchers;
}

function getScriptPath(): string {
  return `${CONFIG_DIR}/watch-compress.sh`;
}

function generatePlist(watchers: WatchedFolder[]): string {
  const watchPaths = watchers
    .map((w) => `      <string>${w.path}</string>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCH_AGENT_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${getScriptPath()}</string>
    </array>
    <key>WatchPaths</key>
    <array>
${watchPaths}
    </array>
    <key>StandardOutPath</key>
    <string>${CONFIG_DIR}/watcher.log</string>
    <key>StandardErrorPath</key>
    <string>${CONFIG_DIR}/watcher-error.log</string>
    <key>ThrottleInterval</key>
    <integer>5</integer>
</dict>
</plist>`;
}

function generateWatchScript(): string {
  return `#!/bin/bash
# Media Compressor — Image Watcher
# Triggered by launchd WatchPaths when files change

set -euo pipefail

CONFIG_DIR="$HOME/.config/media-compressor"
WATCHERS_FILE="$CONFIG_DIR/watchers.json"
LOCK_FILE="$CONFIG_DIR/watcher.lock"
XATTR_KEY="${XATTR_KEY}"

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
        exit 0
    fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

if ! command -v oxipng &>/dev/null; then
    echo "oxipng not found" >&2
    exit 1
fi

HAS_PNGQUANT=false
command -v pngquant &>/dev/null && HAS_PNGQUANT=true

HAS_JPEGOPTIM=false
command -v jpegoptim &>/dev/null && HAS_JPEGOPTIM=true

if [ ! -f "$WATCHERS_FILE" ]; then
    exit 0
fi

python3 -c "
import json, sys
with open('$WATCHERS_FILE') as f:
    watchers = json.load(f)
for w in watchers:
    print(w['path'] + '|' + w.get('mode', 'high'))
" | while IFS='|' read -r FOLDER MODE; do
    [ -d "$FOLDER" ] || continue

    find "$FOLDER" -maxdepth 1 -type f \\( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \\) | while read -r IMG; do
        MARKED=$(xattr -p "$XATTR_KEY" "$IMG" 2>/dev/null || echo "")
        [ "$MARKED" = "true" ] && continue

        ORIG_SIZE=$(stat -f%z "$IMG")
        EXT=$(echo "\${IMG##*.}" | tr '[:upper:]' '[:lower:]')
        TEMP_FILE=$(mktemp "/tmp/mediacomp-XXXXXX.$EXT")

        COMPRESSED=false

        if [ "$EXT" = "png" ]; then
            case "$MODE" in
                lossless) PNG_QUAL="" ;;
                high)     PNG_QUAL="85-100" ;;
                medium)   PNG_QUAL="70-90" ;;
                low)      PNG_QUAL="50-80" ;;
                *)        PNG_QUAL="85-100" ;;
            esac

            if [ "$HAS_PNGQUANT" = true ] && [ -n "$PNG_QUAL" ]; then
                if pngquant --quality="$PNG_QUAL" --speed 1 --strip --force --output "$TEMP_FILE" "$IMG" 2>/dev/null; then
                    COMPRESSED=true
                fi
            fi

            if [ "$COMPRESSED" = false ]; then
                cp "$IMG" "$TEMP_FILE"
            fi

            oxipng -o 4 --strip safe "$TEMP_FILE" 2>/dev/null || true

        elif [ "$EXT" = "jpg" ] || [ "$EXT" = "jpeg" ]; then
            if [ "$HAS_JPEGOPTIM" = true ]; then
                cp "$IMG" "$TEMP_FILE"
                case "$MODE" in
                    lossless)  jpegoptim --strip-all --all-progressive "$TEMP_FILE" 2>/dev/null || true ;;
                    high)      jpegoptim --strip-all --max=90 --all-progressive "$TEMP_FILE" 2>/dev/null || true ;;
                    medium)    jpegoptim --strip-all --max=80 --all-progressive "$TEMP_FILE" 2>/dev/null || true ;;
                    low)       jpegoptim --strip-all --max=70 --all-progressive "$TEMP_FILE" 2>/dev/null || true ;;
                esac
            else
                cp "$IMG" "$TEMP_FILE"
            fi
        else
            rm -f "$TEMP_FILE"
            continue
        fi

        NEW_SIZE=$(stat -f%z "$TEMP_FILE")

        if [ "$NEW_SIZE" -lt "$ORIG_SIZE" ]; then
            osascript -e "tell application \\"Finder\\" to delete POSIX file \\"$IMG\\"" &>/dev/null || true
            mv "$TEMP_FILE" "$IMG"
            xattr -w "$XATTR_KEY" true "$IMG" 2>/dev/null || true

            SAVED=$((ORIG_SIZE - NEW_SIZE))
            PERCENT=$((SAVED * 100 / ORIG_SIZE))
            echo "$(date): Compressed $(basename "$IMG"): $(($ORIG_SIZE/1024))KB -> $(($NEW_SIZE/1024))KB (-\${PERCENT}%)"
        else
            rm -f "$TEMP_FILE"
            xattr -w "$XATTR_KEY" true "$IMG" 2>/dev/null || true
        fi
    done
done
`;
}

export function installWatchScript(): void {
  ensureConfigDir();
  writeFileSync(getScriptPath(), generateWatchScript(), { mode: 0o755 });
}

function updateLaunchAgent(watchers: WatchedFolder[]): void {
  if (watchers.length === 0) {
    uninstallLaunchAgent();
    return;
  }

  installWatchScript();

  try {
    execSync(`launchctl unload "${LAUNCH_AGENT_PLIST}" 2>/dev/null`, { stdio: "pipe" });
  } catch {
    // might not exist yet
  }

  if (!existsSync(LAUNCH_AGENT_DIR)) mkdirSync(LAUNCH_AGENT_DIR, { recursive: true });
  writeFileSync(LAUNCH_AGENT_PLIST, generatePlist(watchers));
  execSync(`launchctl load "${LAUNCH_AGENT_PLIST}"`, { stdio: "pipe" });
}

function uninstallLaunchAgent(): void {
  try { execSync(`launchctl unload "${LAUNCH_AGENT_PLIST}" 2>/dev/null`, { stdio: "pipe" }); } catch { /* */ }
  try { execSync(`rm -f "${LAUNCH_AGENT_PLIST}"`, { stdio: "pipe" }); } catch { /* */ }
}

export function isWatcherRunning(): boolean {
  try {
    const result = execSync(`launchctl list | grep ${LAUNCH_AGENT_NAME}`, { stdio: "pipe" }).toString();
    return result.includes(LAUNCH_AGENT_NAME);
  } catch {
    return false;
  }
}
