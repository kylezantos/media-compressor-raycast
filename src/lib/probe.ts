import { execFileSync } from "child_process";
import { statSync } from "fs";
import { VideoInfo } from "./constants";
import { getToolPath, ENV } from "./tools";

export async function getVideoInfo(filePath: string): Promise<VideoInfo> {
  const ffprobe = getToolPath("ffprobe");

  const output = execFileSync(
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
  ).toString();

  const data = JSON.parse(output);
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
    size: statSync(filePath).size,
  };
}
