import { execFile } from "child_process";
import { createHash, randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import { extname, join } from "path";
import { promisify } from "util";
import { showToast, Toast, environment } from "@raycast/api";
import { CONFIG_DIR, OVERLAY_BIN } from "./constants";

const run = promisify(execFile);

const SEARCH_PATHS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
];
const PATH = SEARCH_PATHS.join(":");
export const ENV = { ...process.env, PATH };

export function getToolPath(tool: string): string {
  for (const dir of SEARCH_PATHS) {
    const fullPath = join(dir, tool);
    if (existsSync(fullPath)) return fullPath;
  }

  throw new Error(`${tool} not found. Run 'Install Compression Tools'.`);
}

function isInstalled(command: string): boolean {
  for (const dir of SEARCH_PATHS) {
    if (existsSync(join(dir, command))) return true;
  }
  return false;
}

// ── Image Tools ──

export function hasImageTools(): boolean {
  return isInstalled("oxipng");
}

// Binary name -> Homebrew package that provides it
const IMAGE_TOOL_PACKAGES: Record<string, string> = {
  pngquant: "pngquant",
  oxipng: "oxipng",
  jpegoptim: "jpegoptim",
  cwebp: "webp",
  gifsicle: "gifsicle",
};

// Tool each format can't be compressed without (pngquant is optional for PNG)
const EXTENSION_TOOLS: Record<string, string> = {
  ".png": "oxipng",
  ".jpg": "jpegoptim",
  ".jpeg": "jpegoptim",
  ".webp": "cwebp",
  ".gif": "gifsicle",
};

export function getMissingImageTools(): string[] {
  return Object.keys(IMAGE_TOOL_PACKAGES).filter((t) => !isInstalled(t));
}

function getBrewPath(): string {
  for (const brew of ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]) {
    if (existsSync(brew)) return brew;
  }
  throw new Error("Homebrew not found. Install it from https://brew.sh first.");
}

// ── Video Tools ──

// The overlay isn't checked here: ensureOverlay() builds it on demand
export function hasVideoTools(): boolean {
  return isInstalled("ffmpeg") && isInstalled("ffprobe");
}

export function getMissingVideoTools(): string[] {
  return ["ffmpeg", "ffprobe"].filter((t) => !isInstalled(t));
}

// ── Progress Overlay ──

// Records which Swift source the current binary was built from
const OVERLAY_STAMP = `${OVERLAY_BIN}.sha256`;

function overlaySourcePath(): string {
  return join(environment.assetsPath, "CompressOverlay.swift");
}

async function overlaySourceHash(): Promise<string> {
  const source = await readFile(overlaySourcePath());
  return createHash("sha256").update(source).digest("hex");
}

/** Compiles the bundled Swift source into OVERLAY_BIN. */
export async function buildOverlay(): Promise<void> {
  const source = overlaySourcePath();
  if (!existsSync(source)) {
    throw new Error("Swift source not found in extension assets.");
  }
  const hash = await overlaySourceHash();

  await mkdir(CONFIG_DIR, { recursive: true });
  // Unique per call so two commands rebuilding at once don't share a temp file
  const building = `${OVERLAY_BIN}.${process.pid}.${randomUUID()}.building`;
  try {
    await run("/usr/bin/swiftc", ["-O", "-o", building, source], {
      env: ENV,
      timeout: 180_000,
    });
  } catch (err) {
    await rm(building, { force: true });
    const stderr = (err as { stderr?: string }).stderr?.trim().split("\n")[0];
    throw new Error(
      `Couldn't build the progress overlay${stderr ? `: ${stderr}` : ""}. ` +
        "It needs the Xcode Command Line Tools (xcode-select --install).",
    );
  }
  // rename swaps the binary atomically, so a running overlay isn't disturbed
  await rename(building, OVERLAY_BIN);
  await writeFile(OVERLAY_STAMP, hash);
}

/**
 * Returns the overlay binary, rebuilding it first when the bundled Swift
 * source has changed since the last build (e.g. after an extension update).
 */
export async function ensureOverlay(): Promise<string> {
  const hash = await overlaySourceHash();
  const builtFrom = await readFile(OVERLAY_STAMP, "utf8").catch(() => "");
  if (existsSync(OVERLAY_BIN) && builtFrom.trim() === hash) return OVERLAY_BIN;

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Updating progress overlay...",
  });
  await buildOverlay();
  await toast.hide();
  return OVERLAY_BIN;
}

// ── Combined ──

/** Checks the tools these particular files need, e.g. cwebp for .webp. */
export async function ensureImageTools(paths: string[]): Promise<boolean> {
  const required = new Set(
    paths
      .map((p) => EXTENSION_TOOLS[extname(p).toLowerCase()])
      .filter((tool): tool is string => Boolean(tool)),
  );

  const missing = Object.keys(IMAGE_TOOL_PACKAGES).filter(
    (tool) => required.has(tool) && !isInstalled(tool),
  );
  if (missing.length === 0) return true;

  await showToast({
    style: Toast.Style.Failure,
    title: "Missing image tools",
    message: `Run 'Install Compression Tools': ${missing.join(", ")}`,
  });
  return false;
}

export async function ensureVideoTools(): Promise<boolean> {
  if (hasVideoTools()) return true;
  const missing = getMissingVideoTools();
  await showToast({
    style: Toast.Style.Failure,
    title: "Missing video tools",
    message: `Run 'Install Compression Tools': ${missing.join(", ")}`,
  });
  return false;
}

export async function installAllTools(
  onStep?: (step: string) => void,
): Promise<void> {
  const brew = getBrewPath();
  const options = { env: ENV, maxBuffer: 16 * 1024 * 1024 };

  // Image tools
  const missingImage = getMissingImageTools();
  if (missingImage.length > 0) {
    const packages = missingImage.map((t) => IMAGE_TOOL_PACKAGES[t]);
    onStep?.(`Installing ${packages.join(", ")}...`);
    await run(brew, ["install", ...packages], { ...options, timeout: 300_000 });
  }

  // Video tools (ffmpeg includes ffprobe)
  if (!isInstalled("ffmpeg")) {
    onStep?.("Installing ffmpeg...");
    await run(brew, ["install", "ffmpeg"], { ...options, timeout: 600_000 });
  }

  onStep?.("Building progress overlay...");
  await buildOverlay();
}
