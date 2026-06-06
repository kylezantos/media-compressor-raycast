import { execSync } from "child_process";
import { statSync, copyFileSync, mkdirSync, existsSync } from "fs";
import { basename, dirname, extname, join } from "path";
import { tmpdir } from "os";
import {
  ImageQualityPreset,
  ImageCompressionResult,
  IMAGE_QUALITY_SETTINGS,
  XATTR_KEY,
} from "./constants";
import { getToolPath, ENV } from "./tools";

function fileSize(path: string): number {
  return statSync(path).size;
}

function isAlreadyCompressed(path: string): boolean {
  try {
    const result = execSync(`xattr -p ${XATTR_KEY} "${path}" 2>/dev/null`, {
      stdio: "pipe",
    })
      .toString()
      .trim();
    return result === "true";
  } catch {
    return false;
  }
}

function markCompressed(path: string): void {
  try {
    execSync(`xattr -w ${XATTR_KEY} true "${path}"`, { stdio: "pipe" });
  } catch {
    // non-critical
  }
}

function compressPNG(
  inputPath: string,
  outputPath: string,
  quality: ImageQualityPreset,
): void {
  const q = IMAGE_QUALITY_SETTINGS[quality];

  if (quality !== "lossless") {
    try {
      const pngquant = getToolPath("pngquant");
      execSync(
        `"${pngquant}" --quality=${q.pngMin}-${q.pngMax} --speed 1 --strip --force --output "${outputPath}" "${inputPath}"`,
        { env: ENV, stdio: "pipe", timeout: 60_000 },
      );
    } catch {
      copyFileSync(inputPath, outputPath);
    }
  } else {
    copyFileSync(inputPath, outputPath);
  }

  try {
    const oxipng = getToolPath("oxipng");
    execSync(`"${oxipng}" -o 4 --strip safe "${outputPath}"`, {
      env: ENV,
      stdio: "pipe",
      timeout: 120_000,
    });
  } catch {
    // oxipng failed, pngquant output may still be useful
  }
}

function compressJPEG(
  inputPath: string,
  outputPath: string,
  quality: ImageQualityPreset,
): void {
  const q = IMAGE_QUALITY_SETTINGS[quality];
  copyFileSync(inputPath, outputPath);

  try {
    const jpegoptim = getToolPath("jpegoptim");
    const qualityFlag = quality === "lossless" ? "" : `--max=${q.jpegMax}`;
    execSync(
      `"${jpegoptim}" --strip-all --all-progressive ${qualityFlag} "${outputPath}"`,
      { env: ENV, stdio: "pipe", timeout: 60_000 },
    );
  } catch {
    // keep original copy
  }
}

export function compressImage(
  imagePath: string,
  quality: ImageQualityPreset,
  trashOriginal: boolean,
): ImageCompressionResult {
  const ext = extname(imagePath).toLowerCase();
  const originalSize = fileSize(imagePath);

  if (isAlreadyCompressed(imagePath)) {
    return {
      path: imagePath,
      originalSize,
      compressedSize: originalSize,
      saved: 0,
      percent: 0,
      skipped: true,
    };
  }

  const tempDir = join(tmpdir(), "media-compressor");
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
  const tempOutput = join(
    tempDir,
    `compressed-${Date.now()}-${basename(imagePath)}`,
  );

  try {
    if (ext === ".png") {
      compressPNG(imagePath, tempOutput, quality);
    } else if (ext === ".jpg" || ext === ".jpeg") {
      compressJPEG(imagePath, tempOutput, quality);
    } else {
      copyFileSync(imagePath, tempOutput);
    }

    const compressedSize = fileSize(tempOutput);

    if (compressedSize >= originalSize) {
      markCompressed(imagePath);
      try {
        execSync(`rm -f "${tempOutput}"`, { stdio: "pipe" });
      } catch {
        /* */
      }
      return {
        path: imagePath,
        originalSize,
        compressedSize: originalSize,
        saved: 0,
        percent: 0,
        skipped: true,
      };
    }

    if (trashOriginal) {
      const dir = dirname(imagePath);
      const finalPath = join(dir, basename(imagePath));
      execSync(
        `osascript -e 'tell application "Finder" to delete POSIX file "${imagePath}"'`,
        { stdio: "pipe", timeout: 10_000 },
      );
      copyFileSync(tempOutput, finalPath);
      execSync(`rm -f "${tempOutput}"`, { stdio: "pipe" });
      markCompressed(finalPath);

      return {
        path: finalPath,
        originalSize,
        compressedSize,
        saved: originalSize - compressedSize,
        percent: Math.round(
          ((originalSize - compressedSize) / originalSize) * 100,
        ),
        skipped: false,
      };
    } else {
      copyFileSync(tempOutput, imagePath);
      execSync(`rm -f "${tempOutput}"`, { stdio: "pipe" });
      markCompressed(imagePath);

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
    }
  } catch (err) {
    try {
      execSync(`rm -f "${tempOutput}"`, { stdio: "pipe" });
    } catch {
      /* */
    }
    return {
      path: imagePath,
      originalSize,
      compressedSize: originalSize,
      saved: 0,
      percent: 0,
      skipped: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
