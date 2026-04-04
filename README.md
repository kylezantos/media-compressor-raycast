# Media Compressor

A Raycast extension for compressing images and videos on macOS. Full control over quality, codec, resolution, and audio — or just hit a keyboard shortcut and let it handle everything.

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

## Requirements

- macOS
- [Raycast](https://raycast.com)
- [Homebrew](https://brew.sh)

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
