# CueLab Paste Assistant

Guided Safari Web Extension source for moving CueLab bridge data into the BeatPulse dashboard with a visible, human-reviewed paste queue.

## What It Does

- Imports the CueLab `Bridge JSON` from file or clipboard.
- Opens a small assistant panel on `app.beatpulse.com`.
- Shows a preflight report for section rows and matched dashboard fields.
- Builds a queue in BeatPulse dashboard order:
  - section timestamp
  - section type
  - narration
  - section instruments, one tag at a time
  - section vibe tags, one tag at a time
  - global fields
  - global genre and dominant instrument tags, one tag at a time
- Highlights the dashboard field that should receive the current value.
- Copies the current value on command.
- Detects a paste into the highlighted field, marks it done, advances to the next value, and tries to copy the next value.
- Adds missing section rows when requested, or automatically when the setting is enabled.
- Fills visible fields in one click using exact tag-option matching when you want the faster route.
- Commits instruments and vibe tags only when the requested BeatPulse option appears, avoiding incorrect first-suggestion inserts such as `808 Drums`.
- Confirms tag chips after insertion and reports unavailable or uncommitted tags instead of counting them as transferred.
- Verifies the dashboard against the bridge payload after transfer.
- Captures a completed BeatPulse form as CueLab-importable JSON for recovery, comparison or test runs.
- Displays Golden Check review notes embedded in the final bridge JSON.
- Preserves intentional blanks for uncertain Key or Chords rather than inventing values.
- Accepts the retained legacy `aural-grid-beatpulse-bridge-v1` schema used for compatibility and the `cuelab-beatpulse-bridge-v1` alias.
- Never submits the assignment.

## Recommended Workflow

1. In CueLab, use `Ready to Go`, review the `Golden Check`, then export the bridge JSON; it downloads the JSON and tries to copy it.
2. Open the BeatPulse assignment page.
3. Open the extension popup.
4. Click `Import From Clipboard`. If Safari blocks clipboard access, import the downloaded JSON file.
5. Use `Fill Exact Matches` for the fastest route, or click `Open Queue` for the manual paste queue.
6. Click `Verify Transfer`, review BeatPulse manually, then submit yourself.

The manual route is still available:

1. Click `Open Queue`.
2. If the dashboard does not have enough section rows, click `Prepare Rows`.
3. Press `Copy Current`, paste into the highlighted BeatPulse field, and continue.

With `Auto-advance after paste` and `Auto-copy next value after paste` enabled, the rhythm becomes:

1. Paste into highlighted field.
2. The assistant moves to the next queue item.
3. The next value is copied automatically.
4. Paste again.

For tag fields, the assistant waits for the matching BeatPulse option and commits only that exact value. If that value is not available, it leaves the field unchanged and asks you to review the tag.

## Capture Completed Form

Use `Capture JSON` after filling or editing the BeatPulse dashboard. It downloads a `section-analyst-pass-v1` JSON containing the visible section annotations and global fields. That file can be imported back into CueLab through `Import ChatGPT JSON`, giving you a quick recovery copy or a reliable comparison payload during bridge testing.

## Shortcuts

- `Command + Shift + Y`: Copy current value
- `Command + Shift + U`: Next queue item
- `Command + Shift + J`: Previous queue item
- `Command + Shift + L`: Show/hide the assistant panel

Safari may require you to confirm or adjust shortcut assignments in Safari extension settings.

## Loading In Safari

The bridge schema and saved extension keys retain compatibility with earlier installs, but the extension itself is CueLab Paste Assistant. Safari usually needs the Web Extension source wrapped through Xcode:

```sh
xcrun safari-web-extension-converter /path/to/cuelab-paste-assistant-extension
```

Then open the generated Xcode project, run it, and enable the extension in Safari settings.

## Safety Model

This is intentionally not a hidden autofill bot. It is local, visible, user-triggered, and review-first. It fills nothing unless you paste or explicitly click extension controls. It never calls BeatPulse APIs directly and never submits the assignment.
