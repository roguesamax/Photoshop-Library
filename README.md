# KIT UV Library

This version is **folder-based** (no JSON needed).

## What changed

You only select one source folder, and the plugin/script auto-builds your library from subfolders like:

```text
KitAssets/
  Collars/
  Shorts/
  Sleeves/
  Sponsors/
  Numbers/
```

Each top-level subfolder is treated as an element category, and assets are placed into that category's UV slot.

## New usability improvements

- **Close button added in the JSX tool** (`Close Tool`) so the modal window can be exited explicitly.
- **Thumbnail previews added**:
  - UXP panel shows inline image thumbnails for PNG/JPG/JPEG files.
  - JSX script shows a preview panel when an item is selected (PNG/JPG/JPEG).

## Option A: UXP panel (dark mode)

Files:
- `manifest.json`
- `index.html`
- `styles.css`
- `main.js`

### Use
1. Photoshop → Plugins → Development → Load Unpacked.
2. Open **KIT UV Library** panel.
3. Click **Choose Source Folder**.
4. Search an item and click **Place in document**.

## Option B: No-login script route

File:
- `photoshop-kit-uv-library.jsx`

### Use
1. Open PSD.
2. File → Scripts → Browse...
3. Select `photoshop-kit-uv-library.jsx`.
4. Click **Choose Source Folder**.
5. Select an item to see preview.
6. Click **Place Selected** or **Close Tool**.

## UV slot presets

Category-to-UV slots are currently defined in code:
- UXP: `main.js` → `UV_PRESETS`
- JSX: `photoshop-kit-uv-library.jsx` → `UV_PRESETS`

Reference UV size is `4096 x 4096`; placement scales to the current PSD size.
