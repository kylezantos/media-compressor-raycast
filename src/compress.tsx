import {
  ActionPanel,
  Action,
  Form,
  showHUD,
  showToast,
  Toast,
  getSelectedFinderItems,
  getPreferenceValues,
  LocalStorage,
  popToRoot,
} from "@raycast/api";
import { useState, useEffect } from "react";
import { extname } from "path";
import {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  Preferences,
  ImageQualityPreset,
  VideoCompressOptions,
  formatBytes,
} from "./lib/constants";
import { compressImages, summarizeImages } from "./lib/image-compress";
import { queueVideos } from "./lib/video-compress";
import { ensureImageTools, ensureVideoTools } from "./lib/tools";

// Last-used settings are restored next time. Stored manually rather than with
// storeValue, which has been reported to render blank fields in Raycast 2.
const SETTINGS_KEY = "last-settings";
const SETTING_FIELDS = [
  "imageQuality",
  "videoMode",
  "videoQuality",
  "targetPercent",
  "targetSizeMB",
  "codec",
  "resolution",
  "speed",
  "audioMode",
] as const;
type Settings = Record<(typeof SETTING_FIELDS)[number], string>;
const DEFAULT_SETTINGS: Settings = {
  imageQuality: "high",
  videoMode: "quality",
  videoQuality: "high",
  targetPercent: "50",
  targetSizeMB: "",
  codec: "h265",
  resolution: "original",
  speed: "balanced",
  audioMode: "smart",
};

async function loadSettings(): Promise<Settings> {
  try {
    const saved = await LocalStorage.getItem<string>(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(saved ? JSON.parse(saved) : {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function Compress() {
  const prefs = getPreferenceValues<Preferences>();
  const [finderImages, setFinderImages] = useState<string[]>([]);
  const [finderVideos, setFinderVideos] = useState<string[]>([]);
  const [source, setSource] = useState<"finder" | "picker">("finder");
  const [showImageSection, setShowImageSection] = useState(false);
  const [showVideoSection, setShowVideoSection] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [videoMode, setVideoMode] = useState(DEFAULT_SETTINGS.videoMode);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const savedSettings = loadSettings();
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
      const saved = await savedSettings;
      setSettings(saved);
      setVideoMode(saved.videoMode);
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

    const nextSettings = { ...settings };
    for (const key of SETTING_FIELDS) {
      const value = values[key];
      if (typeof value === "string") nextSettings[key] = value;
    }
    await LocalStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings));

    const trashOriginals = values.trashOriginals as boolean;
    const imageQuality = (values.imageQuality as ImageQualityPreset) || "high";

    // ── Compress images (inline, fast) ──
    if (images.length > 0) {
      const ready = await ensureImageTools(images);
      if (!ready) return;

      const toast = await showToast({
        style: Toast.Style.Animated,
        title: `Compressing ${images.length} image${images.length > 1 ? "s" : ""}...`,
      });

      const results = await compressImages(
        images,
        imageQuality,
        trashOriginals,
        (done, total) => {
          toast.message = `${done}/${total}`;
        },
      );
      const { compressed, skipped, failed, saved } = summarizeImages(results);

      if (videos.length === 0) {
        const parts: string[] = [];
        if (compressed > 0)
          parts.push(`${compressed} compressed, saved ${formatBytes(saved)}`);
        if (skipped > 0) parts.push(`${skipped} already optimal`);
        if (failed > 0) parts.push(`${failed} failed`);
        await showHUD(parts.join(" · ") || "Done");
        await popToRoot();
        return;
      }

      toast.hide();
    }

    // ── Queue video compressions (via overlay, background) ──
    let queuedVideos = 0;
    let failedVideos = 0;
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

      const queue = await queueVideos(videos, videoOptions);
      if (!queue) return;
      queuedVideos = queue.queued;
      failedVideos = queue.failed.length;
    }

    const parts: string[] = [];
    if (images.length > 0)
      parts.push(`${images.length} image${images.length > 1 ? "s" : ""} done`);
    if (queuedVideos > 0)
      parts.push(
        `${queuedVideos} video${queuedVideos > 1 ? "s" : ""} compressing...`,
      );
    if (failedVideos > 0) parts.push(`${failedVideos} couldn't be read`);
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
      {/* Fields mount after settings load so their defaultValues apply */}
      {!isLoading && (
        <>
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
            info="When off, originals are kept and the compressed copy is saved beside them as name-compressed. When on, originals go to the macOS Trash."
          />

          {/* ── Image Settings ── */}
          {showImageSection && (
            <>
              <Form.Separator />
              <Form.Dropdown
                id="imageQuality"
                title="Image Quality"
                defaultValue={settings.imageQuality}
                info="Higher settings preserve more detail. 'High' is visually identical to the original for most images."
              >
                <Form.Dropdown.Item
                  value="lossless"
                  title="Lossless (5-30% smaller)"
                />
                <Form.Dropdown.Item
                  value="high"
                  title="High (40-60% smaller)"
                />
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
                  defaultValue={settings.videoQuality}
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
                  defaultValue={settings.targetPercent}
                  info="50 = half the original file size."
                />
              )}

              {videoMode === "size" && (
                <Form.TextField
                  id="targetSizeMB"
                  title="Target (MB)"
                  placeholder="25"
                  defaultValue={settings.targetSizeMB}
                  info="Aims for this output size."
                />
              )}

              <Form.Dropdown
                id="codec"
                title="Codec"
                defaultValue={settings.codec}
                info="H.265 is 25-50% smaller than H.264 but slower to encode. AV1 compresses best but is slowest."
              >
                <Form.Dropdown.Item value="h264" title="H.264" />
                <Form.Dropdown.Item value="h265" title="H.265" />
                <Form.Dropdown.Item value="av1" title="AV1" />
              </Form.Dropdown>

              <Form.Dropdown
                id="resolution"
                title="Resolution"
                defaultValue={settings.resolution}
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
                defaultValue={settings.speed}
                info="Fast uses the Mac's hardware encoder: about 3x quicker, but bigger files. Thorough takes longer to find smaller files at the same quality."
              >
                <Form.Dropdown.Item value="fast" title="Fast" />
                <Form.Dropdown.Item value="balanced" title="Balanced" />
                <Form.Dropdown.Item value="quality" title="Thorough" />
              </Form.Dropdown>

              <Form.Dropdown
                id="audioMode"
                title="Audio"
                defaultValue={settings.audioMode}
                info="'Smart' keeps AAC audio as-is, re-encodes everything else to AAC 128k."
              >
                <Form.Dropdown.Item value="smart" title="Smart" />
                <Form.Dropdown.Item value="copy" title="Keep Original" />
                <Form.Dropdown.Item value="aac128" title="AAC 128k" />
                <Form.Dropdown.Item value="aac192" title="AAC 192k" />
              </Form.Dropdown>
            </>
          )}
        </>
      )}
    </Form>
  );
}
