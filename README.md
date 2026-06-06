# Media Compressor


Compress selected images and videos from Raycast with configurable quality, size, codec, and cleanup settings.

## Requirements

- Raycast for macOS or Raycast 2 Beta
- Node.js and npm
- Compression tools installed through the extension's **Install Compression Tools** command

## Install

Install dependencies first:

```bash
npm install
```

For active development, start the Raycast dev server:

```bash
npm run dev
```

With current `@raycast/api` versions, `ray develop` opens in Raycast 2 when Raycast 2 is running and falls back to Raycast 1 otherwise.

For a manual Raycast 2 Beta install without keeping the dev watcher running:

```bash
npm run install:raycast-beta
```

For a manual stable Raycast install:

```bash
npm run install:raycast
```

## Commands

- **Compress Media**: Pick image and video compression settings.
- **Quick Compress**: Compress selected media with defaults.
- **Compress Folder**: Compress images in a selected folder.
- **Manage Watch Folders**: Configure folders for automatic image compression.
- **Install Compression Tools**: Install image and video compression dependencies.

## Publishing Note

Raycast validates the `author` field against a real Raycast user. Before publishing or running full Raycast lint successfully, update `package.json` with the correct Raycast username and log in with:

```bash
npx ray login
```

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
| **Compress Media** | Form-based UI with full options. Auto-detects Finder selection or lets you pick files. |
| **Quick Compress** | No-UI instant compression of Finder selection using smart defaults. Bind to a shortcut. |
| **Compress Folder** | Batch compress all images in a folder with per-file stats and savings report. |
| **Manage Watch Folders** | Add folders that auto-compress new images silently in the background. |
| **Install Compression Tools** | One-click Homebrew installer for all dependencies. |

## Supported Formats

**Images:** PNG, JPEG, WebP, GIF, TIFF, BMP

**Videos:** MP4, MOV, MKV, AVI, WebM, M4V, WMV, FLV, 3GP, MTS, M2TS, TS

## How It Works

### Images

Three tools work together for optimal compression:

- **pngquant** — lossy PNG quantization with quality range per preset
- **oxipng** — lossless PNG optimization (always runs after pngquant)
- **jpegoptim** — JPEG compression with progressive encoding and metadata stripping

Files that have already been compressed are tagged via `xattr` and skipped on future passes.

### Videos

Uses **FFmpeg** with three compression modes:

- **Quality (CRF)** — single-pass, constant rate factor. Best for general use.
- **Target size %** — two-pass encoding to hit a percentage of the original file size.
- **Target size MB** — two-pass encoding to hit an absolute file size.

**Codecs:** H.264, H.265 (tagged `hvc1` for Apple compatibility), AV1

**Resolution:** Original, 1080p, 720p, 480p (Lanczos downscaling, preserves aspect ratio)

**Audio:** Smart mode (copies AAC as-is, re-encodes other formats to AAC 128k), Copy original, AAC 128k, AAC 192k

All video output uses `-movflags +faststart` for web-optimized playback.

### Native Progress Overlay

Video compression runs through a compiled Swift binary that displays a floating macOS overlay window with progress — so you don't need to keep Raycast open while it works.

## Quality Presets

| Preset | PNG (pngquant) | JPEG (jpegoptim) | H.264 CRF | H.265 CRF | AV1 CRF |
|--------|---------------|------------------|-----------|-----------|---------|
| Lossless | skipped (oxipng only) | lossless | 18 | 20 | 23 |
| High | 85-100 | max 90 | 23 | 24 | 30 |
| Medium | 70-90 | max 80 | 28 | 28 | 38 |
| Low | 50-80 | max 70 | 32 | 32 | 45 |

## Watch Folders

Add any folder as a watch target and new images are automatically compressed in the background using a macOS `launchd` LaunchAgent. Each folder can have its own quality preset. Activity is logged to `~/.config/media-compressor/watcher.log`.

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

Then run **Install Compression Tools** from Raycast to install the Homebrew dependencies (`pngquant`, `oxipng`, `jpegoptim`, `ffmpeg`) and compile the Swift progress overlay.

## Requirements

- macOS
- [Raycast](https://raycast.com)
- [Homebrew](https://brew.sh)
- Node.js (for the initial dev-mode install)

Dependencies (installed via the **Install Compression Tools** command):
- `pngquant`
- `oxipng`
- `jpegoptim`
- `ffmpeg`

The Swift overlay binary is compiled from source during installation — no additional Swift dependencies needed.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Move originals to Trash | On | Replaces originals with compressed versions. Originals are recoverable from macOS Trash. |

## License

MIT