import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { mkdir, rename, writeFile } from "fs/promises";
import { join, dirname, basename, extname } from "path";
import { promisify } from "util";
import { showToast, Toast } from "@raycast/api";
import {
  VideoCompressOptions,
  CompressConfig,
  PassConfig,
  VideoInfo,
  CRF_VALUES,
  CODEC_LIBS,
  HW_ENCODERS,
  HW_QUALITY,
  SPEED_PRESETS,
  RESOLUTION_MAP,
  TEMP_DIR,
  QUEUE_DIR,
} from "./constants";
import { getToolPath, ensureOverlay, ENV } from "./tools";
import { getVideoInfo } from "./probe";

const run = promisify(execFile);

// Keep stderr to real errors so the overlay's failure message is meaningful
const LOG_ARGS = ["-hide_banner", "-loglevel", "error"];

// Output is always MP4-family; these extensions can keep their name
const MP4_FAMILY = new Set([".mp4", ".m4v", ".mov"]);

function buildAudioArgs(mode: string, info: VideoInfo): string[] {
  switch (mode) {
    case "copy":
      return ["-c:a", "copy"];
    case "aac128":
      return ["-c:a", "aac", "-b:a", "128k"];
    case "aac192":
      return ["-c:a", "aac", "-b:a", "192k"];
    case "smart":
    default:
      if (info.audioCodec === "aac") return ["-c:a", "copy"];
      return ["-c:a", "aac", "-b:a", "128k"];
  }
}

function buildScaleFilter(resolution: string): string | undefined {
  const target = RESOLUTION_MAP[resolution];
  if (!target) return undefined;
  return `scale=${target.width}:-2:flags=lanczos`;
}

// VideoToolbox constant quality needs Apple Silicon; elsewhere "fast" stays software
function hardwareEncoder(options: VideoCompressOptions): string | undefined {
  if (options.speed !== "fast" || process.arch !== "arm64") return undefined;
  return HW_ENCODERS[options.codec];
}

function buildCRFPasses(
  info: VideoInfo,
  outputPath: string,
  options: VideoCompressOptions,
): PassConfig[] {
  const quality = options.quality || "high";
  const hw = hardwareEncoder(options);
  const audioArgs = buildAudioArgs(options.audioMode, info);
  const filter = buildScaleFilter(options.resolution);

  const args: string[] = [...LOG_ARGS, "-i", info.path];
  if (filter) args.push("-vf", filter);
  if (hw) {
    args.push("-c:v", hw, "-q:v", String(HW_QUALITY[quality]));
  } else {
    const crf = CRF_VALUES[options.codec][quality];
    const preset = SPEED_PRESETS[options.codec][options.speed];
    args.push("-c:v", CODEC_LIBS[options.codec], "-crf", String(crf));
    args.push("-preset", preset);
  }
  // hvc1 tag required for Apple/QuickTime H.265 playback
  if (options.codec === "h265") {
    args.push("-tag:v", "hvc1");
    if (!hw) args.push("-x265-params", "log-level=error");
  }
  args.push(
    ...audioArgs,
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-y",
    outputPath,
  );

  return [{ args, label: "Compressing..." }];
}

function buildTargetSizePasses(
  info: VideoInfo,
  outputPath: string,
  targetBytes: number,
  options: VideoCompressOptions,
  workDir: string,
): PassConfig[] {
  const hw = hardwareEncoder(options);
  const lib = hw ?? CODEC_LIBS[options.codec];
  const preset = SPEED_PRESETS[options.codec][options.speed];
  const filter = buildScaleFilter(options.resolution);

  const audioBitrate = 128;
  const videoBitrate = Math.max(
    100,
    Math.floor((targetBytes * 8) / (info.duration * 1000) - audioBitrate),
  );

  const passLogFile = join(workDir, "passlog");
  const baseArgs: string[] = [...LOG_ARGS, "-i", info.path];
  if (filter) baseArgs.push("-vf", filter);
  baseArgs.push("-c:v", lib, "-b:v", `${videoBitrate}k`);
  if (options.codec === "h265") baseArgs.push("-tag:v", "hvc1");

  const outputArgs = [
    "-c:a",
    "aac",
    "-b:a",
    `${audioBitrate}k`,
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-y",
    outputPath,
  ];

  // Hardware encoders and AV1: single pass at the target bitrate
  if (hw || options.codec === "av1") {
    const presetArgs = hw ? [] : ["-preset", preset];
    return [
      {
        args: [...baseArgs, ...presetArgs, ...outputArgs],
        label: "Compressing...",
      },
    ];
  }

  // H.264/H.265: two-pass. libx265 ignores ffmpeg's -pass/-passlogfile (pass 2
  // comes out identical to a single pass), so it gets its own stats settings.
  baseArgs.push("-preset", preset);
  const passArgs = (pass: 1 | 2): string[] =>
    options.codec === "h265"
      ? [
          "-x265-params",
          `pass=${pass}:stats=${passLogFile}:log-level=error` +
            (pass === 1 ? ":slow-firstpass=0" : ""),
        ]
      : ["-pass", String(pass), "-passlogfile", passLogFile];

  return [
    {
      args: [
        ...baseArgs,
        ...passArgs(1),
        "-an",
        "-f",
        "null",
        "-progress",
        "pipe:1",
        "-y",
        "-",
      ],
      label: "Pass 1: Analyzing...",
    },
    {
      args: [...baseArgs, ...passArgs(2), ...outputArgs],
      label: "Pass 2: Compressing...",
    },
  ];
}

async function buildJob(
  filePath: string,
  options: VideoCompressOptions,
  ffmpegPath: string,
): Promise<CompressConfig> {
  const info = await getVideoInfo(filePath);

  const ext = extname(filePath);
  const lowerExt = ext.toLowerCase();
  // The mov muxer keeps PCM audio from .mov sources but can't hold AV1,
  // so AV1 always goes into an .mp4
  const useMov = lowerExt === ".mov" && options.codec !== "av1";
  const keepsExt =
    options.codec === "av1" ? lowerExt === ".mp4" : MP4_FAMILY.has(lowerExt);
  const outExt = keepsExt ? ext : ".mp4";
  const base = basename(filePath, ext);
  const dir = dirname(filePath);
  const keepPath = join(dir, `${base}-compressed${outExt}`);
  const finalPath = options.trashOriginal
    ? join(dir, `${base}${outExt}`)
    : keepPath;

  // Kept short: x265 silently truncates its stats path at 255 characters
  const workDir = join(TEMP_DIR, `job-${randomUUID().slice(0, 13)}`);
  await mkdir(workDir, { recursive: true });
  const output = join(workDir, useMov ? "output.mov" : "output.mp4");

  let passes: PassConfig[];
  if (options.mode === "quality") {
    passes = buildCRFPasses(info, output, options);
  } else {
    const targetBytes =
      options.mode === "percent"
        ? Math.floor(info.size * ((options.targetPercent || 50) / 100))
        : Math.floor((options.targetSizeMB || 25) * 1024 * 1024);
    passes = buildTargetSizePasses(info, output, targetBytes, options, workDir);
  }

  return {
    input: filePath,
    output,
    finalPath,
    keepPath,
    workDir,
    duration: info.duration,
    originalSize: info.size,
    filename: basename(filePath),
    trashOriginal: options.trashOriginal,
    ffmpegPath,
    passes,
  };
}

// Started through a short-lived /bin/sh so the overlay is adopted by launchd
// once sh exits, rather than staying a child of Raycast's long-lived backend.
async function startOverlay(overlayPath: string): Promise<void> {
  await run(
    "/bin/sh",
    [
      "-c",
      '"$0" --queue "$1" </dev/null >/dev/null 2>&1 &',
      overlayPath,
      QUEUE_DIR,
    ],
    // ffmpeg inherits this; SVT-AV1 ignores -loglevel and needs its own quiet flag
    { env: { ...ENV, SVT_LOG: "1" } },
  );
}

export interface QueueResult {
  queued: number;
  failed: { path: string; error: string }[];
}

/**
 * Adds videos to the overlay's queue and makes sure an overlay is running.
 * One overlay encodes them one after another; files that can't be probed are
 * reported back instead of queued.
 */
async function queueVideoCompressions(
  paths: string[],
  options: VideoCompressOptions,
): Promise<QueueResult> {
  const ffmpegPath = getToolPath("ffmpeg");
  const overlayPath = await ensureOverlay();
  await mkdir(QUEUE_DIR, { recursive: true });

  const result: QueueResult = { queued: 0, failed: [] };
  for (const [i, filePath] of paths.entries()) {
    try {
      const job = await buildJob(filePath, options, ffmpegPath);
      // Sortable name keeps submission order; write-then-rename means the
      // overlay never reads a half-written job
      const name = `${Date.now()}-${String(i).padStart(4, "0")}-${randomUUID()}`;
      const tempPath = join(QUEUE_DIR, `${name}.tmp`);
      await writeFile(tempPath, JSON.stringify(job));
      await rename(tempPath, join(QUEUE_DIR, `${name}.json`));
      result.queued++;
    } catch (err) {
      result.failed.push({
        path: filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (result.queued > 0) await startOverlay(overlayPath);
  return result;
}

/**
 * Queues videos for the overlay, explaining any problem with a toast.
 * Returns undefined when nothing could be queued.
 */
export async function queueVideos(
  paths: string[],
  options: VideoCompressOptions,
): Promise<QueueResult | undefined> {
  let result: QueueResult;
  try {
    result = await queueVideoCompressions(paths, options);
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Couldn't start video compression",
      message: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }

  if (result.failed.length > 0) {
    const [first] = result.failed;
    await showToast({
      style: Toast.Style.Failure,
      title:
        result.failed.length === 1
          ? `Failed: ${basename(first.path)}`
          : `${result.failed.length} videos couldn't be read`,
      message: first.error,
    });
  }
  return result.queued > 0 ? result : undefined;
}
