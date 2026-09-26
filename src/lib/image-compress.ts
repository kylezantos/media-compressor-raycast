import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { copyFile, mkdir, rm, stat } from "fs/promises";
import { cpus, tmpdir } from "os";
import { extname, join } from "path";
import { promisify } from "util";
import { trash } from "@raycast/api";
import {
  ImageQualityPreset,
  ImageCompressionResult,
  IMAGE_QUALITY_SETTINGS,
  XATTR_KEY,
} from "./constants";
import { getToolPath, ENV } from "./tools";

const run = promisify(execFile);

const TEMP_DIR = join(tmpdir(), "media-compressor");

// pngquant is single-threaded and oxipng already uses several threads, so
// half the cores keeps the machine busy without thrashing.
const CONCURRENCY = Math.max(2, Math.min(6, Math.floor(cpus().length / 2)));

async function runTool(
  tool: string,
  args: string[],
  timeout: number,
): Promise<void> {
  await run(getToolPath(tool), args, { env: ENV, timeout });
}

async function isAlreadyCompressed(path: string): Promise<boolean> {
  try {
    const { stdout } = await run("/usr/bin/xattr", ["-p", XATTR_KEY, path]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

async function markCompressed(path: string): Promise<void> {
  try {
    await run("/usr/bin/xattr", ["-w", XATTR_KEY, "true", path]);
  } catch {
    // non-critical
  }
}

async function compressPNG(
  inputPath: string,
  outputPath: string,
  quality: ImageQualityPreset,
): Promise<void> {
  const q = IMAGE_QUALITY_SETTINGS[quality];
  let quantized = false;

  if (quality !== "lossless") {
    try {
      await runTool(
        "pngquant",
        [
          `--quality=${q.pngMin}-${q.pngMax}`,
          "--speed",
          "1",
          "--strip",
          "--force",
          "--output",
          outputPath,
          inputPath,
        ],
        60_000,
      );
      quantized = true;
    } catch {
      // Quality floor not reachable — fall back to lossless optimization
    }
  }
  if (!quantized) await copyFile(inputPath, outputPath);

  try {
    await runTool(
      "oxipng",
      ["-o", "4", "--strip", "safe", outputPath],
      120_000,
    );
  } catch {
    // oxipng failed, pngquant output may still be useful
  }
}

async function compressJPEG(
  inputPath: string,
  outputPath: string,
  quality: ImageQualityPreset,
): Promise<void> {
  const q = IMAGE_QUALITY_SETTINGS[quality];
  await copyFile(inputPath, outputPath);

  try {
    const qualityArgs = quality === "lossless" ? [] : [`--max=${q.jpegMax}`];
    await runTool(
      "jpegoptim",
      ["-q", "--strip-all", "--all-progressive", ...qualityArgs, outputPath],
      60_000,
    );
  } catch {
    // keep original copy
  }
}

export async function compressImage(
  imagePath: string,
  quality: ImageQualityPreset,
  trashOriginal: boolean,
): Promise<ImageCompressionResult> {
  const ext = extname(imagePath).toLowerCase();
  // Keep the extension so each tool recognizes the format
  const tempOutput = join(TEMP_DIR, `${randomUUID()}${ext}`);
  let originalSize = 0;

  try {
    originalSize = (await stat(imagePath)).size;
    const unchanged: ImageCompressionResult = {
      path: imagePath,
      originalSize,
      compressedSize: originalSize,
      saved: 0,
      percent: 0,
      skipped: true,
    };

    if (await isAlreadyCompressed(imagePath)) return unchanged;

    await mkdir(TEMP_DIR, { recursive: true });
    if (ext === ".png") {
      await compressPNG(imagePath, tempOutput, quality);
    } else if (ext === ".jpg" || ext === ".jpeg") {
      await compressJPEG(imagePath, tempOutput, quality);
    } else {
      throw new Error(`Unsupported image type: ${ext}`);
    }

    const compressedSize = (await stat(tempOutput)).size;
    if (compressedSize >= originalSize) {
      await markCompressed(imagePath);
      return unchanged;
    }

    // Trash first so the original stays recoverable; if trashing fails we
    // bail out before touching the file.
    if (trashOriginal) await trash(imagePath);
    await copyFile(tempOutput, imagePath);
    await markCompressed(imagePath);

    return {
      path: imagePath,
      originalSize,
      compressedSize,
      saved: originalSize - compressedSize,
      percent: Math.round(
        ((originalSize - compressedSize) / originalSize) * 100,
      ),
      skipped: false,
    };
  } catch (err) {
    return {
      path: imagePath,
      originalSize,
      compressedSize: originalSize,
      saved: 0,
      percent: 0,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await rm(tempOutput, { force: true });
  }
}

/** Compress several images in parallel. Results come back in input order. */
export async function compressImages(
  paths: string[],
  quality: ImageQualityPreset,
  trashOriginal: boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<ImageCompressionResult[]> {
  const results = new Array<ImageCompressionResult>(paths.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < paths.length) {
      const i = next++;
      results[i] = await compressImage(paths[i], quality, trashOriginal);
      onProgress?.(++done, paths.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker),
  );
  return results;
}

export interface ImageSummary {
  compressed: number;
  skipped: number;
  failed: number;
  saved: number;
}

export function summarizeImages(
  results: ImageCompressionResult[],
): ImageSummary {
  const summary: ImageSummary = {
    compressed: 0,
    skipped: 0,
    failed: 0,
    saved: 0,
  };
  for (const r of results) {
    if (r.error) summary.failed++;
    else if (r.skipped) summary.skipped++;
    else {
      summary.compressed++;
      summary.saved += r.saved;
    }
  }
  return summary;
}
