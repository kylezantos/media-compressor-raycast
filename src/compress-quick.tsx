import { showHUD, showToast, Toast, getSelectedFinderItems } from "@raycast/api";
import { extname, basename } from "path";
import {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  VideoCompressOptions,
  getPrefs,
  formatBytes,
} from "./lib/constants";
import { compressImage } from "./lib/image-compress";
import { launchVideoCompression } from "./lib/video-compress";
import { ensureImageTools, ensureVideoTools, hasImageTools, hasVideoTools } from "./lib/tools";

export default async function CompressQuick() {
  const prefs = getPrefs();

  let items: { path: string }[];
  try {
    items = await getSelectedFinderItems();
  } catch {
    await showHUD("No files selected in Finder");
    return;
  }

  const images = items.map((i) => i.path).filter((p) => IMAGE_EXTENSIONS.has(extname(p).toLowerCase()));
  const videos = items.map((i) => i.path).filter((p) => VIDEO_EXTENSIONS.has(extname(p).toLowerCase()));

  if (images.length === 0 && videos.length === 0) {
    await showHUD("No media files in selection");
    return;
  }

  const resultParts: string[] = [];

  // ── Images ──
  if (images.length > 0) {
    if (!hasImageTools()) {
      await ensureImageTools();
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Compressing ${images.length} image${images.length > 1 ? "s" : ""}...`,
    });

    let totalSaved = 0;
    let compressed = 0;
    let skipped = 0;

    for (let i = 0; i < images.length; i++) {
      toast.message = `${i + 1}/${images.length}: ${basename(images[i])}`;
      const result = compressImage(images[i], "high", prefs.trashOriginals);
      if (result.error || result.skipped) {
        skipped++;
      } else {
        compressed++;
        totalSaved += result.saved;
      }
    }

    toast.hide();
    if (compressed > 0) resultParts.push(`${compressed} images, saved ${formatBytes(totalSaved)}`);
    if (skipped > 0) resultParts.push(`${skipped} already optimal`);
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
      codec: "h265",
      resolution: "original",
      speed: "balanced",
      audioMode: "smart",
      trashOriginal: prefs.trashOriginals,
    };

    for (const vid of videos) {
      try {
        await launchVideoCompression(vid, videoOptions);
      } catch (err) {
        await showToast({
          style: Toast.Style.Failure,
          title: `Failed: ${basename(vid)}`,
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }
    }

    resultParts.push(`${videos.length} video${videos.length > 1 ? "s" : ""} compressing...`);
  }

  await showHUD(resultParts.join(" · ") || "Done");
}
