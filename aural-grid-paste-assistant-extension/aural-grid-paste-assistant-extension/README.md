# Aural Grid Paste Assistant

Guided Safari Web Extension source for moving Aural Grid bridge data into the Beatpulse dashboard with a visible, human-reviewed paste queue.

## What It Does

- Imports the Aural Grid `Bridge JSON`.
- Opens a small assistant panel on `app.beatpulse.com`.
- Builds a queue in Beatpulse dashboard order:
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
- Never submits the assignment.

## Recommended Workflow

1. In Aural Grid, use `Bridge JSON`, not the console bridge script.
2. Open the Beatpulse assignment page.
3. Open the extension popup.
4. Import the Aural Grid bridge JSON.
5. Click `Open Assistant`.
6. If the dashboard does not have enough section rows, click `Add Missing Rows`.
7. Press `Copy Current`, paste into the highlighted Beatpulse field, and continue.

With `Auto-advance after paste` and `Auto-copy next value after paste` enabled, the rhythm becomes:

1. Paste into highlighted field.
2. The assistant moves to the next queue item.
3. The next value is copied automatically.
4. Paste again.

For tag fields, paste the tag, press Enter if Beatpulse needs it, then paste the next highlighted/copied tag.

## Shortcuts

- `Command + Shift + Y`: Copy current value
- `Command + Shift + U`: Next queue item
- `Command + Shift + J`: Previous queue item
- `Command + Shift + L`: Show/hide the assistant panel

Safari may require you to confirm or adjust shortcut assignments in Safari extension settings.

## Loading In Safari

This folder is Web Extension source. Safari usually needs it wrapped through Xcode:

```sh
xcrun safari-web-extension-converter /path/to/aural-grid-paste-assistant-extension
```

Then open the generated Xcode project, run it, and enable the extension in Safari settings.

## Safety Model

This is intentionally not a hidden autofill bot. It is local, visible, user-triggered, and review-first. It fills nothing unless you paste or explicitly click extension controls. It never calls Beatpulse APIs directly and never submits the assignment.
