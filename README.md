# KIT UV Library

This version is **folder-based** (no JSON needed).

## Folder structure

```text
KitAssets/
  Collars/
  Shorts/
  Sleeves/
  Sponsors/
  Numbers/
```

Top-level subfolder names are used as categories.

Assets are shown with folder separation controls:
- UXP panel: each folder appears as its own collapsible dropdown section.
- Script tool: a `Folder` dropdown filters the list by one folder at a time.

## What is fixed in this version

- **Removed Script zoom dropdown** because it was not reliable in ExtendScript; the preview pane now uses a larger fixed thumbnail area for clearer browsing.
- **Rebuild Thumb** button in Script tool to force-regenerate a broken/missing PSD thumbnail for the selected item.
- **Automatic preview cache warm-up** in Script tool when source folder is loaded/restored (only regenerates changed PSD thumbnails using modified-time token).
- **Category folder placement on final place** in Script tool: selected assets are moved into a layer group named after the source folder category (creates the group if missing). This now runs consistently for both direct place and preview-finalize flows.

- **PSD placement now transfers full layer stacks** (not a single flattened layer), so final placed assets preserve source layer structure.
- **Script tool now has an in-window thumbnail preview panel** (not just file names).
- For PSD assets, the script generates a cached PNG thumbnail in user data cache (with source modified-time tracking) so browsing collars is visual and fast after first preview. Thumbnails are cached as transparent PNG previews in user data without changing placement behavior in the working PSD.
- **Preview cleanup is automatic**: old preview layers are removed before a new preview.
- **Final place no longer keeps preview layers**.
- If the selected item is already previewed, `Place Selected` finalizes that exact preview layer (same position), instead of re-placing and shifting.
- **Source folder is remembered** between runs:
  - UXP uses a persistent folder token.
  - Script tool stores last folder path in user data.

## Option A: UXP panel (dark mode)

1. Photoshop → Plugins → Development → Load Unpacked.
2. Open **KIT UV Library** panel.
3. Choose source folder once (it will auto-restore next time if available).
4. Use **Preview on document** to audition options.
5. Use **Place in document** to confirm final.

## Option B: No-login script route

1. Open PSD.
2. File → Scripts → Browse...
3. Select `photoshop-kit-uv-library.jsx`.
4. Source folder auto-loads from previous run (if path still exists), or choose manually.
5. Select asset in list to see thumbnail in the script window.
6. Use **Preview On Document** while browsing.
7. Click **Place Selected** when final.

## UV presets

- UXP: `main.js` → `UV_PRESETS`
- JSX: `photoshop-kit-uv-library.jsx` → `UV_PRESETS`

Reference UV size is `4096 x 4096` for non-PSD preset placement.
