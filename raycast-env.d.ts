/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Trash Originals - Default: move originals to Trash after compression (can be overridden per operation) */
  "trashOriginals": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `compress` command */
  export type Compress = ExtensionPreferences & {}
  /** Preferences accessible in the `compress-quick` command */
  export type CompressQuick = ExtensionPreferences & {}
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

