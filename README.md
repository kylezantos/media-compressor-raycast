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
