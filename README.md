# Media Compressor

A Raycast extension for compressing images and videos on macOS. Full control over quality, codec, resolution, and audio — or just hit a keyboard shortcut and let it handle everything.

## Context

Compression on macOS tends to be slow, locked inside a GUI app, or limited to images. Raycast's built-in image tools and most store extensions cover the basics — resize, strip metadata, maybe a quality slider — but a handful of common cases fall outside that:

- Screen recordings, demo clips, and phone exports that need **video** compression
- **Keyboard-first workflows** — select a file in Finder, hit a shortcut, done, no form to click through
- **Fine-grained control** — picking a codec, CRF, target size %, resolution, or audio strategy
- **Drop-a-file, auto-compress** behavior — a watch folder that handles things in the background

This extension fills those gaps. Select files in Finder, hit **Quick Compress**, and they're done in the background with a native progress overlay — no Raycast window needed. Or open **Compress Media** when you want the full form with codec, CRF, target size %, resolution, and audio options.

## Commands

| Command | Description |
|---------|-------------|
| **Compress Media** | Form-based UI with full options. Auto-detects Finder selection or lets you pick files. Remembers your last settings. |
| **Quick Compress** | No-UI instant compression of Finder selection using your Quick Compress preferences. Bind to a shortcut. |
| **Compress Folder** | Batch compress all images in a folder with per-file stats and savings report. |
| **Manage Watch Folders** | Add folders that auto-compress new images silently in the background. |
| **Install Compression Tools** | One-click Homebrew installer for all dependencies. |

## Supported Formats

**Images:** PNG, JPEG, WebP (still images), GIF

**Videos:** MP4, MOV, MKV, AVI, WebM, M4V, WMV, FLV, 3GP, MTS, M2TS, TS

## How It Works

### Images

Each format goes through a dedicated tool, several files at a time:

- **pngquant** — lossy PNG quantization with quality range per preset
- **oxipng** — lossless PNG optimization (always runs after pngquant)
- **jpegoptim** — JPEG compression with progressive encoding and metadata stripping
- **cwebp** — WebP re-encoding (animated WebP isn't supported)
- **gifsicle** — GIF optimization, lossy above the Lossless preset

A result only replaces the original when it's smaller. Files that have already been compressed are tagged via `xattr` and skipped on future passes.

### Videos

Uses **FFmpeg** with three compression modes:

- **Quality (CRF)** — single-pass, constant rate factor. Best for general use.
- **Target size %** — aims for a percentage of the original file size.
- **Target size MB** — aims for an absolute file size.

Target-size modes use two-pass encoding for H.264 and H.265 at Balanced and Thorough speeds, and a single pass for AV1 and Fast.

**Codecs:** H.264, H.265 (tagged `hvc1` for Apple compatibility), AV1

**Encode speed:** Fast uses the Mac's hardware encoder (VideoToolbox, Apple Silicon) for H.264 and H.265 — about 3x quicker than Balanced, but files come out noticeably larger. Balanced and Thorough use the x264/x265 software encoders; AV1 always uses SVT-AV1.

**Resolution:** Original, 1080p, 720p, 480p (Lanczos downscaling, preserves aspect ratio)

**Audio:** Smart mode (copies AAC as-is, re-encodes other formats to AAC 128k), Copy original, AAC 128k, AAC 192k

**Output:** MP4, M4V and MOV keep their extension; everything else (MKV, WebM, AVI, …) becomes `.mp4`. AV1 output is always `.mp4`. An existing file is never overwritten — the new one gets a numbered name instead. All video output uses `-movflags +faststart` for web-optimized playback.

### Native Progress Overlay

Video compression runs through a compiled Swift binary that displays a floating macOS overlay window with progress — so you don't need to keep Raycast open while it works. Videos are queued: one overlay encodes them one after another and shows a combined summary at the end, and videos you add while it's running join the same queue. Closing the overlay cancels the current and queued videos.

The overlay is compiled from `assets/CompressOverlay.swift` and rebuilds itself automatically whenever that file changes.

## Quality Presets

**Images**

| Preset | PNG (pngquant) | JPEG (jpegoptim) | WebP (cwebp) | GIF (gifsicle) |
|--------|---------------|------------------|--------------|----------------|
| Lossless | skipped (oxipng only) | lossless | lossless | lossless |
| High | 85-100 | max 90 | quality 90 | lossy 20 |
| Medium | 70-90 | max 80 | quality 80 | lossy 60 |
| Low | 50-80 | max 70 | quality 70 | lossy 100 |

**Videos**

| Preset | H.264 CRF | H.265 CRF | AV1 CRF | Fast (hardware quality) |
|--------|-----------|-----------|---------|-------------------------|
| Lossless | 18 | 20 | 23 | 85 |
| High | 23 | 24 | 30 | 75 |
| Medium | 28 | 28 | 38 | 65 |
| Low | 32 | 32 | 45 | 55 |

## Watch Folders

Add any folder as a watch target and new images are automatically compressed in the background using a macOS `launchd` LaunchAgent. Each folder can have its own quality preset. Each run only looks at files that changed since the last one, and compresses them in parallel. Originals go to the Trash; if one can't be trashed, it's left untouched. Activity is logged to `~/.config/media-compressor/watcher.log`.

## Install

> **Note:** This would be published to the official Raycast Store, but the store doesn't allow the watch folder feature (background `launchd` LaunchAgents), and losing it would gut a big part of what this extension is for. So it lives here instead.

Install as a local development extension:

```bash
git clone https://github.com/kylezantos/media-compressor-raycast.git
cd media-compressor-raycast
npm install
npm run dev
```

With `npm run dev` running, Raycast will import the extension automatically. You can stop the dev process once the extension appears in Raycast — it stays installed.

To install a build without keeping the dev watcher running:

```bash
npm run install:raycast
```

This writes the build to `~/.config/raycast/extensions/media-compressor`, which Raycast 2 uses (it replaced Raycast 1 in place; the old Raycast 2 Beta `raycast-x` folder is gone).

Then run **Install Compression Tools** from Raycast to install the Homebrew dependencies and compile the Swift progress overlay.

## Requirements

- macOS on Apple Silicon (Raycast 2 requires it; hardware "Fast" encoding also needs it)
- [Raycast](https://raycast.com) 2
- [Homebrew](https://brew.sh)
- Xcode Command Line Tools, for compiling the overlay (`xcode-select --install`)
- Node.js 22.22.2 or newer (for the dev-mode install)

Dependencies (installed via the **Install Compression Tools** command):
- `pngquant`
- `oxipng`
- `jpegoptim`
- `webp` (provides `cwebp`)
- `gifsicle`
- `ffmpeg`

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Move originals to Trash | On | On: originals go to the macOS Trash and the compressed file takes their place. Off: originals are kept and the compressed file is saved beside them as `name-compressed.ext`. Watch folders always move originals to the Trash. |
| Quick Compress → Image Quality | High | Image preset Quick Compress uses. |
| Quick Compress → Video Codec | H.265 | Video codec Quick Compress uses. |
| Quick Compress → Video Encode Speed | Balanced | Fast uses the hardware encoder: about 3x quicker, larger files. |

## Publishing Note

Raycast validates the `author` field against a real Raycast user. Before publishing or running full Raycast lint successfully, update `package.json` with the correct Raycast username and log in with:

```bash
npx ray login
```

## License

MIT
