import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { showToast, Toast, environment } from "@raycast/api";
import { CONFIG_DIR, OVERLAY_BIN } from "./constants";

const SEARCH_PATHS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
];
const PATH = SEARCH_PATHS.join(":");
export const ENV = { ...process.env, PATH };

export function getToolPath(tool: string): string {
  if (tool === "compress-overlay") {
    if (existsSync(OVERLAY_BIN)) return OVERLAY_BIN;
    throw new Error(
      "Compression overlay not built. Run 'Install Compression Tools'.",
    );
  }

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

export function hasVideoTools(): boolean {
  return (
    isInstalled("ffmpeg") && isInstalled("ffprobe") && existsSync(OVERLAY_BIN)
  );
}

export function getMissingVideoTools(): string[] {
  const missing: string[] = [];
  if (!isInstalled("ffmpeg")) missing.push("ffmpeg");
  if (!isInstalled("ffprobe")) missing.push("ffprobe");
  if (!existsSync(OVERLAY_BIN)) missing.push("compress-overlay");
  return missing;
}

// ── Combined ──

export async function ensureImageTools(): Promise<boolean> {
  if (hasImageTools()) return true;
  await showToast({
    style: Toast.Style.Failure,
    title: "Missing image tools",
    message: "Run 'Install Compression Tools' first",
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

export async function installAllTools(): Promise<void> {
  const brew = getBrewPath();

  // Image tools
  const missingImage = getMissingImageTools();
  if (missingImage.length > 0) {
    const packages = missingImage.map((t) => IMAGE_TOOL_PACKAGES[t]).join(" ");
    execSync(`${brew} install ${packages}`, {
      env: ENV,
      stdio: "pipe",
      timeout: 120_000,
    });
  }

  // Video tools (ffmpeg includes ffprobe)
  if (!isInstalled("ffmpeg")) {
    execSync(`${brew} install ffmpeg`, {
      env: ENV,
      stdio: "pipe",
      timeout: 300_000,
    });
  }

  // Build overlay binary
  const swiftSource = join(environment.assetsPath, "CompressOverlay.swift");
  if (!existsSync(swiftSource)) {
    throw new Error("Swift source not found in extension assets.");
  }

  execSync(`mkdir -p "${CONFIG_DIR}"`, { stdio: "pipe" });
  execSync(`swiftc -O -o "${OVERLAY_BIN}" "${swiftSource}"`, {
    env: ENV,
    stdio: "pipe",
    timeout: 120_000,
  });
}
