import { getPreferenceValues } from "@raycast/api";
import { homedir, tmpdir } from "os";
import { join } from "path";

// ── File Extensions ──

// Only formats with a real in-format compressor. TIFF/BMP were listed before
// but only ever got copied, so they're no longer offered.
export const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
]);

export const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".mkv",
  ".avi",
  ".webm",
  ".m4v",
  ".wmv",
  ".flv",
  ".3gp",
  ".mts",
  ".m2ts",
  ".ts",
]);

// ── Image Types ──

export type ImageQualityPreset = "lossless" | "high" | "medium" | "low";

export interface ImageCompressionResult {
  path: string;
  originalSize: number;
  compressedSize: number;
  saved: number;
  percent: number;
  skipped: boolean;
  error?: string;
}

// webpQuality is cwebp -q (lossless uses -lossless instead); gifLossy is
// gifsicle --lossy (0 = lossless optimization only)
export const IMAGE_QUALITY_SETTINGS: Record<
  ImageQualityPreset,
  {
    pngMin: number;
    pngMax: number;
    jpegMax: number;
    webpQuality: number;
    gifLossy: number;
  }
> = {
  lossless: {
    pngMin: 100,
    pngMax: 100,
    jpegMax: 100,
    webpQuality: 100,
    gifLossy: 0,
  },
  high: { pngMin: 85, pngMax: 100, jpegMax: 90, webpQuality: 90, gifLossy: 20 },
  medium: {
    pngMin: 70,
    pngMax: 90,
    jpegMax: 80,
    webpQuality: 80,
    gifLossy: 60,
  },
  low: { pngMin: 50, pngMax: 80, jpegMax: 70, webpQuality: 70, gifLossy: 100 },
};

// ── Video Types ──

export type VideoCompressMode = "quality" | "percent" | "size";
export type VideoQualityPreset = "lossless" | "high" | "medium" | "low";
export type Codec = "h264" | "h265" | "av1";
export type Resolution = "original" | "1080p" | "720p" | "480p";
export type Speed = "fast" | "balanced" | "quality";
export type AudioMode = "smart" | "copy" | "aac128" | "aac192";

export interface VideoCompressOptions {
  mode: VideoCompressMode;
  quality?: VideoQualityPreset;
  codec: Codec;
  resolution: Resolution;
  speed: Speed;
  audioMode: AudioMode;
  targetPercent?: number;
  targetSizeMB?: number;
  trashOriginal: boolean;
}

export interface VideoInfo {
  path: string;
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  size: number;
}

export interface PassConfig {
  args: string[];
  label: string;
}

// One queued video job, read by the overlay (assets/CompressOverlay.swift)
export interface CompressConfig {
  input: string;
  output: string;
  // Where the result goes; keepPath is used instead if trashing the original fails
  finalPath: string;
  keepPath: string;
  // Holds the output and pass logs; the overlay deletes it after the job
  workDir: string;
  duration: number;
  originalSize: number;
  filename: string;
  trashOriginal: boolean;
  ffmpegPath: string;
  passes: PassConfig[];
}

// CRF values per codec per quality preset
export const CRF_VALUES: Record<Codec, Record<VideoQualityPreset, number>> = {
  h264: { lossless: 18, high: 23, medium: 28, low: 32 },
  h265: { lossless: 20, high: 24, medium: 28, low: 32 },
  av1: { lossless: 23, high: 30, medium: 38, low: 45 },
};

export const CODEC_LIBS: Record<Codec, string> = {
  h264: "libx264",
  h265: "libx265",
  av1: "libsvtav1",
};

// "Fast" uses the Apple Silicon media engine: ~3x faster than libx265, but
// files come out several times larger at similar quality. No AV1 encoder.
export const HW_ENCODERS: Partial<Record<Codec, string>> = {
  h264: "h264_videotoolbox",
  h265: "hevc_videotoolbox",
};

// VideoToolbox -q:v (1-100, higher = better) per quality preset
export const HW_QUALITY: Record<VideoQualityPreset, number> = {
  lossless: 75,
  high: 65,
  medium: 55,
  low: 45,
};

export const SPEED_PRESETS: Record<Codec, Record<Speed, string>> = {
  h264: { fast: "fast", balanced: "medium", quality: "slow" },
  h265: { fast: "fast", balanced: "medium", quality: "slow" },
  av1: { fast: "8", balanced: "6", quality: "4" },
};

export const RESOLUTION_MAP: Record<string, { width: number }> = {
  "1080p": { width: 1920 },
  "720p": { width: 1280 },
  "480p": { width: 854 },
};

// ── Preferences ──

export interface Preferences {
  trashOriginals: boolean;
}

export function getPrefs(): Preferences {
  return getPreferenceValues<Preferences>();
}

// ── Paths ──

export const TEMP_DIR = join(tmpdir(), "media-compressor");
// Video jobs waiting for the overlay; one overlay drains it in order
export const QUEUE_DIR = join(TEMP_DIR, "queue");
export const CONFIG_DIR = join(homedir(), ".config", "media-compressor");
export const WATCHERS_FILE = join(CONFIG_DIR, "watchers.json");
export const OVERLAY_BIN = join(CONFIG_DIR, "compress-overlay");
export const LAUNCH_AGENT_DIR = join(homedir(), "Library", "LaunchAgents");
export const LAUNCH_AGENT_NAME = "com.mediacompressor.watcher";
export const LAUNCH_AGENT_PLIST = join(
  LAUNCH_AGENT_DIR,
  `${LAUNCH_AGENT_NAME}.plist`,
);
export const XATTR_KEY = "com.mediacompressor.compressed";

// ── Helpers ──

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function isImage(path: string): boolean {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export function isVideo(path: string): boolean {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}
