import { execFile } from "child_process";
import { stat } from "fs/promises";
import { promisify } from "util";
import { VideoInfo } from "./constants";
import { getToolPath, ENV } from "./tools";

const run = promisify(execFile);

export async function getVideoInfo(filePath: string): Promise<VideoInfo> {
  const ffprobe = getToolPath("ffprobe");

  let stdout: string;
  try {
    ({ stdout } = await run(
      ffprobe,
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath,
      ],
      { env: ENV, timeout: 30_000 },
    ));
  } catch {
    throw new Error("Not a readable video file.");
  }

  const data = JSON.parse(stdout);
  const videoStream = data.streams?.find(
    (s: { codec_type: string }) => s.codec_type === "video",
  );
  const audioStream = data.streams?.find(
    (s: { codec_type: string }) => s.codec_type === "audio",
  );
  const format = data.format || {};

  const duration = parseFloat(format.duration || "0");
  if (duration <= 0) {
    throw new Error("Could not determine video duration. File may be corrupt.");
  }

  return {
    path: filePath,
    duration,
    width: videoStream?.width || 0,
    height: videoStream?.height || 0,
    videoCodec: videoStream?.codec_name || "unknown",
    audioCodec: audioStream?.codec_name || "unknown",
    size: (await stat(filePath)).size,
  };
}
