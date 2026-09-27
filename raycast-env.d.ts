/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Trash Originals - Default for the Move originals to Trash checkbox. On: originals go to the Trash and the compressed file takes their place. Off: originals are kept and the compressed copy is saved beside them. */
  "trashOriginals": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `compress` command */
  export type Compress = ExtensionPreferences & {}
  /** Preferences accessible in the `compress-quick` command */
  export type CompressQuick = ExtensionPreferences & {
  /** Image Quality - Quality Quick Compress uses for images */
  "quickImageQuality": "lossless" | "high" | "medium" | "low",
  /** Video Codec - Codec Quick Compress uses for videos */
  "quickVideoCodec": "h264" | "h265" | "av1",
  /** Video Encode Speed - Fast uses the hardware encoder: about 3x faster, but larger files */
  "quickVideoSpeed": "fast" | "balanced" | "quality"
}
  /** Preferences accessible in the `compress-folder` command */
  export type CompressFolder = ExtensionPreferences & {}
  /** Preferences accessible in the `manage-watchers` command */
  export type ManageWatchers = ExtensionPreferences & {}
  /** Preferences accessible in the `install-tools` command */
  export type InstallTools = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `compress` command */
  export type Compress = {}
  /** Arguments passed to the `compress-quick` command */
  export type CompressQuick = {}
  /** Arguments passed to the `compress-folder` command */
  export type CompressFolder = {}
  /** Arguments passed to the `manage-watchers` command */
  export type ManageWatchers = {}
  /** Arguments passed to the `install-tools` command */
  export type InstallTools = {}
}

