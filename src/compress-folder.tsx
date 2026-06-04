import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import { readdirSync } from "fs";
import { extname, join } from "path";
import {
  IMAGE_EXTENSIONS,
  ImageCompressionResult,
  ImageQualityPreset,
  getPrefs,
  formatBytes,
} from "./lib/constants";
import { compressImage } from "./lib/image-compress";
import { hasImageTools, ensureImageTools } from "./lib/tools";

function ResultsView({ results }: { results: ImageCompressionResult[] }) {
  const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalCompressed = results.reduce((sum, r) => sum + r.compressedSize, 0);
  const totalSaved = totalOriginal - totalCompressed;
  const overallPercent =
    totalOriginal > 0 ? Math.round((totalSaved / totalOriginal) * 100) : 0;

  const compressed = results.filter((r) => !r.skipped && !r.error);
  const skipped = results.filter((r) => r.skipped);
  const errors = results.filter((r) => r.error);

  let md = `# Compression Results\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total files | ${results.length} |\n`;
  md += `| Compressed | ${compressed.length} |\n`;
  md += `| Skipped | ${skipped.length} |\n`;
  md += `| Errors | ${errors.length} |\n`;
  md += `| Original size | ${formatBytes(totalOriginal)} |\n`;
  md += `| Compressed size | ${formatBytes(totalCompressed)} |\n`;
  md += `| **Saved** | **${formatBytes(totalSaved)} (${overallPercent}%)** |\n\n`;

  if (compressed.length > 0) {
    md += `## Compressed Files\n\n`;
    for (const r of compressed) {
      const name = r.path.split("/").pop();
      md += `- **${name}**: ${formatBytes(r.originalSize)} → ${formatBytes(r.compressedSize)} (-${r.percent}%)\n`;
    }
    md += "\n";
  }

  if (errors.length > 0) {
    md += `## Errors\n\n`;
    for (const r of errors) {
      const name = r.path.split("/").pop();
      md += `- **${name}**: ${r.error}\n`;
    }
  }

  return (
    <Detail
      markdown={md}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy Summary"
            content={`Compressed ${compressed.length} files, saved ${formatBytes(totalSaved)} (${overallPercent}%)`}
          />
        </ActionPanel>
      }
    />
  );
}

export default function CompressFolder() {
  const { push } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(values: {
    folder: string[];
    imageQuality: string;
    trashOriginals: boolean;
  }) {
    if (!hasImageTools()) {
      await ensureImageTools();
      return;
    }

    const folderPath = values.folder?.[0];
    if (!folderPath) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No folder selected",
      });
      return;
    }

    setIsLoading(true);

    let files: string[];
    try {
      files = readdirSync(folderPath)
        .filter((f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()))
        .map((f) => join(folderPath, f));
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Can't read folder",
        message: String(err),
      });
      setIsLoading(false);
      return;
    }

    if (files.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No images found in folder",
      });
      setIsLoading(false);
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Compressing ${files.length} images...`,
    });

    const quality = (values.imageQuality || "high") as ImageQualityPreset;
    const results: ImageCompressionResult[] = [];

    for (let i = 0; i < files.length; i++) {
      toast.message = `${i + 1}/${files.length}: ${files[i].split("/").pop()}`;
      results.push(compressImage(files[i], quality, values.trashOriginals));
    }

    toast.hide();
    setIsLoading(false);
    push(<ResultsView results={results} />);
  }

  const prefs = getPrefs();

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Compress Folder"
            icon={Icon.Download}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="folder"
        title="Folder"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
      />
      <Form.Dropdown
        id="imageQuality"
        title="Image Quality"
        defaultValue="high"
      >
        <Form.Dropdown.Item
          value="lossless"
          title="Lossless — optimization only (5-30% smaller)"
        />
        <Form.Dropdown.Item
          value="high"
          title="High — visually identical (40-60% smaller)"
        />
        <Form.Dropdown.Item
          value="medium"
          title="Medium — good quality (50-70% smaller)"
        />
        <Form.Dropdown.Item
          value="low"
          title="Low — max compression (60-80% smaller)"
        />
      </Form.Dropdown>
      <Form.Checkbox
        id="trashOriginals"
        label="Move originals to Trash"
        defaultValue={prefs.trashOriginals}
      />
    </Form>
  );
}
