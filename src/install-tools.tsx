import { showHUD, showToast, Toast } from "@raycast/api";
import { installAllTools } from "./lib/tools";

export default async function InstallTools() {
  await showToast({
    style: Toast.Style.Animated,
    title: "Installing compression tools...",
  });

  try {
    await installAllTools();
    await showHUD(
      "Installed: pngquant, oxipng, jpegoptim, ffmpeg, compress-overlay",
    );
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Installation failed",
      message: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
  }
}
