import { spawn } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { tmpdir } from "os";
import {
  VideoCompressOptions,
  CompressConfig,
  PassConfig,
  VideoInfo,
  CRF_VALUES,
  CODEC_LIBS,
  SPEED_PRESETS,
  RESOLUTION_MAP,
} from "./constants";
import { getToolPath, ENV } from "./tools";
import { getVideoInfo } from "./probe";

const TEMP_DIR = join(tmpdir(), "media-compressor");

function ensureTempDir(): void {
  if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });
}

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

function buildCRFPasses(
  info: VideoInfo,
  outputPath: string,
  options: VideoCompressOptions,
): PassConfig[] {
  const quality = options.quality || "high";
  const crf = CRF_VALUES[options.codec][quality];
  const lib = CODEC_LIBS[options.codec];
  const preset = SPEED_PRESETS[options.codec][options.speed];
  const audioArgs = buildAudioArgs(options.audioMode, info);
  const filter = buildScaleFilter(options.resolution);

  const args: string[] = ["-i", info.path];
  if (filter) args.push("-vf", filter);
  args.push("-c:v", lib, "-crf", String(crf), "-preset", preset);
  // hvc1 tag required for Apple/QuickTime H.265 playback
  if (options.codec === "h265") args.push("-tag:v", "hvc1");
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
): PassConfig[] {
  const lib = CODEC_LIBS[options.codec];
  const preset = SPEED_PRESETS[options.codec][options.speed];
  const filter = buildScaleFilter(options.resolution);

  const audioBitrate = 128;
  const videoBitrate = Math.max(
    100,
    Math.floor((targetBytes * 8) / (info.duration * 1000) - audioBitrate),
  );

  const passLogFile = join(TEMP_DIR, `passlog-${Date.now()}`);
  const baseArgs: string[] = ["-i", info.path];
  if (filter) baseArgs.push("-vf", filter);
  baseArgs.push("-c:v", lib, "-b:v", `${videoBitrate}k`);
  if (options.codec === "h265") baseArgs.push("-tag:v", "hvc1");

  // AV1: single-pass with target bitrate
  if (options.codec === "av1") {
    return [
      {
        args: [
          ...baseArgs,
          "-preset",
          preset,
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
        ],
        label: "Compressing...",
      },
    ];
  }

  // H.264/H.265: two-pass
  baseArgs.push("-preset", preset, "-passlogfile", passLogFile);
  return [
    {
      args: [
        ...baseArgs,
        "-pass",
        "1",
        "-an",
        "-f",
        "mp4",
        "-progress",
        "pipe:1",
        "-y",
        "/dev/null",
      ],
      label: "Pass 1: Analyzing...",
    },
    {
      args: [
        ...baseArgs,
        "-pass",
        "2",
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
      ],
      label: "Pass 2: Compressing...",
    },
  ];
}

export async function launchVideoCompression(
  filePath: string,
  options: VideoCompressOptions,
): Promise<void> {
  ensureTempDir();

  const ffmpegPath = getToolPath("ffmpeg");
  const overlayPath = getToolPath("compress-overlay");
  const info = await getVideoInfo(filePath);

  const id = Date.now();
  const tempOutput = join(TEMP_DIR, `output-${id}.mp4`);
  const ext = extname(filePath);
  const base = basename(filePath, ext);
  const dir = dirname(filePath);
  const finalPath = options.trashOriginal
    ? filePath
    : join(dir, `${base}-compressed${ext}`);

  let passes: PassConfig[];
  if (options.mode === "quality") {
    passes = buildCRFPasses(info, tempOutput, options);
  } else {
    let targetBytes: number;
    if (options.mode === "percent") {
      targetBytes = Math.floor(
        info.size * ((options.targetPercent || 50) / 100),
      );
    } else {
      targetBytes = Math.floor((options.targetSizeMB || 25) * 1024 * 1024);
    }
    passes = buildTargetSizePasses(info, tempOutput, targetBytes, options);
  }

  const config: CompressConfig = {
    input: filePath,
    output: tempOutput,
    finalPath,
    duration: info.duration,
    originalSize: info.size,
    filename: basename(filePath),
    trashOriginal: options.trashOriginal,
    ffmpegPath,
    passes,
  };

  const configPath = join(TEMP_DIR, `config-${id}.json`);
  writeFileSync(configPath, JSON.stringify(config));

  const child = spawn(overlayPath, ["--config", configPath], {
    detached: true,
    stdio: "ignore",
    env: ENV,
  });
  child.unref();
}
