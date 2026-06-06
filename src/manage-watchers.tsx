import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
  Form,
} from "@raycast/api";
import { useState, useCallback } from "react";
import {
  loadWatchers,
  addWatcher,
  removeWatcher,
  isWatcherRunning,
  WatchedFolder,
  installWatchScript,
} from "./lib/watcher";
import { ImageQualityPreset } from "./lib/constants";
import { hasImageTools } from "./lib/tools";

function AddWatcherForm({ onAdd }: { onAdd: () => void }) {
  const { pop } = useNavigation();

  async function handleSubmit(values: { folder: string[]; mode: string }) {
    const folderPath = values.folder?.[0];
    if (!folderPath) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No folder selected",
      });
      return;
    }

    if (!hasImageTools()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Missing tools",
        message: "Run 'Install Compression Tools' first",
      });
      return;
    }

    try {
      addWatcher(folderPath, values.mode as ImageQualityPreset);
      await showToast({
        style: Toast.Style.Success,
        title: "Folder added",
        message: `Now watching ${folderPath}`,
      });
      onAdd();
      pop();
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to add watcher",
        message: String(err),
      });
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Watch Folder"
            icon={Icon.Plus}
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
      <Form.Dropdown id="mode" title="Image Quality" defaultValue="high">
        <Form.Dropdown.Item title="Lossless" value="lossless" />
        <Form.Dropdown.Item title="High (recommended)" value="high" />
        <Form.Dropdown.Item title="Medium" value="medium" />
        <Form.Dropdown.Item title="Low — max compression" value="low" />
      </Form.Dropdown>
    </Form>
  );
}

const MODE_COLORS: Record<string, Color> = {
  lossless: Color.Green,
  high: Color.Blue,
  medium: Color.Orange,
  low: Color.Red,
};

export default function ManageWatchers() {
  const [watchers, setWatchers] = useState<WatchedFolder[]>(loadWatchers);
  const running = isWatcherRunning();

  const refresh = useCallback(() => {
    setWatchers(loadWatchers());
  }, []);

  async function handleRemove(path: string) {
    if (
      await confirmAlert({
        title: "Remove Watch Folder?",
        message: `Stop watching ${path}?`,
        primaryAction: {
          title: "Remove",
          style: Alert.ActionStyle.Destructive,
        },
      })
    ) {
      removeWatcher(path);
      refresh();
      await showToast({ style: Toast.Style.Success, title: "Folder removed" });
    }
  }

  async function handleReinstallScript() {
    try {
      installWatchScript();
      await showToast({
        style: Toast.Style.Success,
        title: "Watch script updated",
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to update script",
        message: String(err),
      });
    }
  }

  return (
    <List
      searchBarPlaceholder="Search watch folders..."
      actions={
        <ActionPanel>
          <Action.Push
            title="Add Watch Folder"
            icon={Icon.Plus}
            target={<AddWatcherForm onAdd={refresh} />}
          />
        </ActionPanel>
      }
    >
      <List.Section
        title="Watch Folders (Images)"
        subtitle={running ? "Watcher active" : "No watcher"}
      >
        {watchers.length === 0 ? (
          <List.EmptyView
            title="No Watch Folders"
            description="Add a folder to auto-compress images dropped into it"
            icon={Icon.Folder}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Add Watch Folder"
                  icon={Icon.Plus}
                  target={<AddWatcherForm onAdd={refresh} />}
                />
              </ActionPanel>
            }
          />
        ) : (
          watchers.map((w) => (
            <List.Item
              key={w.path}
              title={w.path.split("/").pop() || w.path}
              subtitle={w.path}
              accessories={[
                {
                  tag: {
                    value: w.mode,
                    color: MODE_COLORS[w.mode] || Color.SecondaryText,
                  },
                },
                {
                  text: new Date(w.addedAt).toLocaleDateString(),
                  tooltip: "Added",
                },
              ]}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Add Watch Folder"
                    icon={Icon.Plus}
                    target={<AddWatcherForm onAdd={refresh} />}
                  />
                  <Action
                    title="Remove Watch Folder"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    onAction={() => handleRemove(w.path)}
                  />
                  <Action.ShowInFinder path={w.path} />
                  <Action
                    title="Reinstall Watch Script"
                    icon={Icon.ArrowClockwise}
                    onAction={handleReinstallScript}
                  />
                </ActionPanel>
              }
            />
          ))
        )}
      </List.Section>
    </List>
  );
}
