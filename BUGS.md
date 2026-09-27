# Known issues and follow-ups

Deferred from the 2026-09-26 performance/reliability pass (branch `claude/repo-performance-review-5bd93b`).

## Needs a product decision

- **"Move originals to Trash" off overwrites images in place.** With the checkbox off, a compressed image replaces the original with no copy kept anywhere (`src/lib/image-compress.ts`, `compressImage`). Videos behave differently: they keep the original and save `name-compressed.ext` beside it. Decide whether "off" should mean "replace permanently" (then say so in the checkbox and README) or "keep the original alongside, like videos". Predates this branch.

## Bugs

- **H.264 from 10-bit sources won't play in QuickTime.** libx264 keeps 10-bit input (e.g. iPhone HDR) as High 10 profile, which QuickTime and most Apple apps can't play. Add `-pix_fmt yuv420p` for H.264 software encodes, or steer 10-bit sources to H.265. Predates this branch.
- **A queued video is lost if the overlay dies mid-job.** `JobQueue.claimNext` deletes the job file before encoding, so a crash, force-quit or restart drops that video silently. The original is untouched. Could rename the job to `.running` and delete it after `finish`.

## Hardening

- **Old watch scripts only update when Manage Watch Folders opens.** `syncWatchScript()` runs on that command's mount. Also calling it from the compress commands or Install Compression Tools would reach users who never reopen it.
- **`launchctl load`/`unload` are legacy.** `src/lib/watcher.ts` could move to `launchctl bootstrap gui/<uid>` / `bootout`. They still work on macOS 26.
- **Closing the overlay mid-save briefly blocks its UI.** `dismiss()` waits on the in-flight save (by design, so the file lands) and then clears the queue on the main thread.
- **Watched folders may need file-access permission.** A launchd agent running `/bin/bash` over `~/Desktop`, `~/Documents` or `~/Downloads` can be blocked by macOS privacy controls. Unverified; worth checking on a fresh setup.

## Testing

- The repo has no test runner. The paths that protect originals (overlay `finish()`, image trash-then-replace, the generated watch script's trash and stamp logic) were verified by hand and with scratch harnesses only. Smallest useful start: vitest for `buildJob` output naming and `generateWatchScript`, and a `bash -n` plus stubbed-trash run of the generated script.
