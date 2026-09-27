import {
  showHUD,
  showToast,
  Toast,
  getPreferenceValues,
  getSelectedFinderItems,
} from "@raycast/api";
import { extname } from "path";
import {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  VideoCompressOptions,
  formatBytes,
} from "./lib/constants";
import { compressImages, summarizeImages } from "./lib/image-compress";
import { queueVideos } from "./lib/video-compress";
import { ensureImageTools, ensureVideoTools, hasVideoTools } from "./lib/tools";

export default async function CompressQuick() {
  const prefs = getPreferenceValues<Preferences.CompressQuick>();

  let items: { path: string }[];
  try {
    items = await getSelectedFinderItems();
  } catch {
    await showHUD("No files selected in Finder");
    return;
  }

  const images = items
    .map((i) => i.path)
    .filter((p) => IMAGE_EXTENSIONS.has(extname(p).toLowerCase()));
  const videos = items
    .map((i) => i.path)
    .filter((p) => VIDEO_EXTENSIONS.has(extname(p).toLowerCase()));

  if (images.length === 0 && videos.length === 0) {
    await showHUD("No media files in selection");
    return;
  }

  const resultParts: string[] = [];

  // ── Images ──
  if (images.length > 0) {
    const ready = await ensureImageTools(images);
    if (!ready) return;

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Compressing ${images.length} image${images.length > 1 ? "s" : ""}...`,
    });

    const results = await compressImages(
      images,
      prefs.quickImageQuality,
      prefs.trashOriginals,
      (done, total) => {
        toast.message = `${done}/${total}`;
      },
    );
    const { compressed, skipped, failed, saved } = summarizeImages(results);

    toast.hide();
    if (compressed > 0)
      resultParts.push(`${compressed} images, saved ${formatBytes(saved)}`);
    if (skipped > 0) resultParts.push(`${skipped} already optimal`);
    if (failed > 0) resultParts.push(`${failed} failed`);
  }

  // ── Videos ──
  if (videos.length > 0) {
    if (!hasVideoTools()) {
      await ensureVideoTools();
      return;
    }

    const videoOptions: VideoCompressOptions = {
      mode: "quality",
      quality: "high",
      codec: prefs.quickVideoCodec,
      resolution: "original",
      speed: prefs.quickVideoSpeed,
      audioMode: "smart",
      trashOriginal: prefs.trashOriginals,
    };

    const queue = await queueVideos(videos, videoOptions);
    if (!queue) return;
    const { queued, failed } = queue;
    if (queued > 0)
      resultParts.push(
        `${queued} video${queued > 1 ? "s" : ""} compressing...`,
      );
    if (failed.length > 0)
      resultParts.push(`${failed.length} couldn't be read`);
  }

  await showHUD(resultParts.join(" · ") || "Done");
}
