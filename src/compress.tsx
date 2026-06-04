import {
  ActionPanel,
  Action,
  Form,
  showHUD,
  showToast,
  Toast,
  getSelectedFinderItems,
  getPreferenceValues,
  popToRoot,
} from "@raycast/api";
import { useState, useEffect } from "react";
import { extname, basename } from "path";
import {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  Preferences,
  ImageQualityPreset,
  VideoCompressOptions,
  formatBytes,
} from "./lib/constants";
import { compressImage } from "./lib/image-compress";
import { launchVideoCompression } from "./lib/video-compress";
import { ensureImageTools, ensureVideoTools } from "./lib/tools";

export default function Compress() {
  const prefs = getPreferenceValues<Preferences>();
  const [finderImages, setFinderImages] = useState<string[]>([]);
  const [finderVideos, setFinderVideos] = useState<string[]>([]);
  const [source, setSource] = useState<"finder" | "picker">("finder");
  const [showImageSection, setShowImageSection] = useState(false);
  const [showVideoSection, setShowVideoSection] = useState(false);
  const [videoMode, setVideoMode] = useState("quality");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const items = await getSelectedFinderItems();
        const paths = items.map((i) => i.path);
        const imgs = paths.filter((p) =>
          IMAGE_EXTENSIONS.has(extname(p).toLowerCase()),
        );
        const vids = paths.filter((p) =>
          VIDEO_EXTENSIONS.has(extname(p).toLowerCase()),
        );

        if (imgs.length > 0 || vids.length > 0) {
          setFinderImages(imgs);
          setFinderVideos(vids);
          setSource("finder");
          setShowImageSection(imgs.length > 0);
          setShowVideoSection(vids.length > 0);
        } else {
          setSource("picker");
          setShowImageSection(true);
          setShowVideoSection(true);
        }
      } catch {
        setSource("picker");
        setShowImageSection(true);
        setShowVideoSection(true);
      }
      setIsLoading(false);
    })();
  }, []);

  function handleFilesChange(paths: string[]) {
    const imgs = paths.filter((p) =>
      IMAGE_EXTENSIONS.has(extname(p).toLowerCase()),
    );
    const vids = paths.filter((p) =>
      VIDEO_EXTENSIONS.has(extname(p).toLowerCase()),
    );
    const hasAny = imgs.length > 0 || vids.length > 0;
    setShowImageSection(imgs.length > 0 || !hasAny);
    setShowVideoSection(vids.length > 0 || !hasAny);
  }

  async function handleSubmit(
    values: Record<string, string | string[] | boolean>,
  ) {
    let images: string[];
    let videos: string[];

    if (source === "finder") {
      images = finderImages;
      videos = finderVideos;
    } else {
      const allFiles = (values.files as string[]) || [];
      images = allFiles.filter((p) =>
        IMAGE_EXTENSIONS.has(extname(p).toLowerCase()),
      );
      videos = allFiles.filter((p) =>
        VIDEO_EXTENSIONS.has(extname(p).toLowerCase()),
      );
    }

    if (images.length === 0 && videos.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No media files selected",
      });
      return;
    }

    const trashOriginals = values.trashOriginals as boolean;
    const imageQuality = (values.imageQuality as ImageQualityPreset) || "high";

    // ── Compress images (inline, fast) ──
    if (images.length > 0) {
      const ready = await ensureImageTools();
      if (!ready) return;

      const toast = await showToast({
        style: Toast.Style.Animated,
        title: `Compressing ${images.length} image${images.length > 1 ? "s" : ""}...`,
      });

      let totalSaved = 0;
      let compressed = 0;
      let skipped = 0;

      for (let i = 0; i < images.length; i++) {
        toast.message = `${i + 1}/${images.length}: ${basename(images[i])}`;
        const result = compressImage(images[i], imageQuality, trashOriginals);
        if (result.error || result.skipped) {
          skipped++;
        } else {
          compressed++;
          totalSaved += result.saved;
        }
      }

      if (videos.length === 0) {
        const parts: string[] = [];
        if (compressed > 0)
          parts.push(
            `${compressed} compressed, saved ${formatBytes(totalSaved)}`,
          );
        if (skipped > 0) parts.push(`${skipped} already optimal`);
        await showHUD(parts.join(" · ") || "Done");
        await popToRoot();
        return;
      }

      toast.hide();
    }

    // ── Launch video compressions (via overlay, background) ──
    if (videos.length > 0) {
      const ready = await ensureVideoTools();
      if (!ready) return;

      const videoOptions: VideoCompressOptions = {
        mode: (values.videoMode as VideoCompressOptions["mode"]) || "quality",
        quality:
          (values.videoQuality as VideoCompressOptions["quality"]) || "high",
        codec: (values.codec as VideoCompressOptions["codec"]) || "h265",
        resolution:
          (values.resolution as VideoCompressOptions["resolution"]) ||
          "original",
        speed: (values.speed as VideoCompressOptions["speed"]) || "balanced",
        audioMode:
          (values.audioMode as VideoCompressOptions["audioMode"]) || "smart",
        targetPercent: values.targetPercent
          ? parseInt(values.targetPercent as string)
          : 50,
        targetSizeMB: values.targetSizeMB
          ? parseFloat(values.targetSizeMB as string)
          : undefined,
        trashOriginal: trashOriginals,
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
    }

    const parts: string[] = [];
    if (images.length > 0)
      parts.push(`${images.length} image${images.length > 1 ? "s" : ""} done`);
    if (videos.length > 0)
      parts.push(
        `${videos.length} video${videos.length > 1 ? "s" : ""} compressing...`,
      );
    await showHUD(parts.join(", "));
    await popToRoot();
  }

  // Build selection summary
  const selectionSummary = (() => {
    const parts: string[] = [];
    if (finderImages.length > 0)
      parts.push(
        `${finderImages.length} image${finderImages.length > 1 ? "s" : ""}`,
      );
    if (finderVideos.length > 0)
      parts.push(
        `${finderVideos.length} video${finderVideos.length > 1 ? "s" : ""}`,
      );
    return parts.join(", ");
  })();

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Compress" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      {/* ── File Selection + Global Options ── */}
      {source === "finder" ? (
        <Form.Description title="Selected" text={selectionSummary} />
      ) : (
        <Form.FilePicker
          id="files"
          title="Files"
          allowMultipleSelection
          canChooseDirectories={false}
          onChange={handleFilesChange}
        />
      )}

      <Form.Checkbox
        id="trashOriginals"
        label="Move originals to Trash"
        defaultValue={prefs.trashOriginals}
        info="Recoverable from macOS Trash."
      />

      {/* ── Image Settings ── */}
      {showImageSection && (
        <>
          <Form.Separator />
          <Form.Dropdown
            id="imageQuality"
            title="Image Quality"
            defaultValue="high"
            info="Higher settings preserve more detail. 'High' is visually identical to the original for most images."
          >
            <Form.Dropdown.Item
              value="lossless"
              title="Lossless (5-30% smaller)"
            />
            <Form.Dropdown.Item value="high" title="High (40-60% smaller)" />
            <Form.Dropdown.Item
              value="medium"
              title="Medium (50-70% smaller)"
            />
            <Form.Dropdown.Item value="low" title="Low (60-80% smaller)" />
          </Form.Dropdown>
        </>
      )}

      {/* ── Video Settings ── */}
      {showVideoSection && (
        <>
          <Form.Separator />
          <Form.Dropdown
            id="videoMode"
            title="Compress By"
            value={videoMode}
            onChange={setVideoMode}
          >
            <Form.Dropdown.Item value="quality" title="Quality" />
            <Form.Dropdown.Item value="percent" title="Target Size (%)" />
            <Form.Dropdown.Item value="size" title="Target Size (MB)" />
          </Form.Dropdown>

          {videoMode === "quality" && (
            <Form.Dropdown
              id="videoQuality"
              title="Quality"
              defaultValue="high"
              info="'High' typically cuts 50-70% with no visible difference. 'Lossless' preserves every detail."
            >
              <Form.Dropdown.Item value="lossless" title="Lossless" />
              <Form.Dropdown.Item value="high" title="High" />
              <Form.Dropdown.Item value="medium" title="Medium" />
              <Form.Dropdown.Item value="low" title="Low" />
            </Form.Dropdown>
          )}

          {videoMode === "percent" && (
            <Form.TextField
              id="targetPercent"
              title="Target (%)"
              defaultValue="50"
              info="50 = half the original file size. Uses two-pass encoding."
            />
          )}

          {videoMode === "size" && (
            <Form.TextField
              id="targetSizeMB"
              title="Target (MB)"
              placeholder="25"
              info="Exact output size. Uses two-pass encoding."
            />
          )}

          <Form.Dropdown
            id="codec"
            title="Codec"
            defaultValue="h265"
            info="H.265 is 25-50% smaller than H.264 but slower to encode. AV1 compresses best but is slowest."
          >
            <Form.Dropdown.Item value="h264" title="H.264" />
            <Form.Dropdown.Item value="h265" title="H.265" />
            <Form.Dropdown.Item value="av1" title="AV1" />
          </Form.Dropdown>

          <Form.Dropdown
            id="resolution"
            title="Resolution"
            defaultValue="original"
            info="Downscaling to 1080p from 4K can save 70%+ on its own."
          >
            <Form.Dropdown.Item value="original" title="Original" />
            <Form.Dropdown.Item value="1080p" title="1080p" />
            <Form.Dropdown.Item value="720p" title="720p" />
            <Form.Dropdown.Item value="480p" title="480p" />
          </Form.Dropdown>

          <Form.Dropdown
            id="speed"
            title="Encode Speed"
            defaultValue="balanced"
            info="Slower encoding finds more efficient compression. Same quality, smaller file."
          >
            <Form.Dropdown.Item value="fast" title="Fast" />
            <Form.Dropdown.Item value="balanced" title="Balanced" />
            <Form.Dropdown.Item value="quality" title="Thorough" />
          </Form.Dropdown>

          <Form.Dropdown
            id="audioMode"
            title="Audio"
            defaultValue="smart"
            info="'Smart' keeps AAC audio as-is, re-encodes everything else to AAC 128k."
          >
            <Form.Dropdown.Item value="smart" title="Smart" />
            <Form.Dropdown.Item value="copy" title="Keep Original" />
            <Form.Dropdown.Item value="aac128" title="AAC 128k" />
            <Form.Dropdown.Item value="aac192" title="AAC 192k" />
          </Form.Dropdown>
        </>
      )}
    </Form>
  );
}
