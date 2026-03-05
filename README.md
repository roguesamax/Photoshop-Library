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

## Key behavior for PSD workflows

- You can now **preview selected assets directly on top of the active PSD** (semi-transparent overlay) while browsing options.
- This works for **PSD assets**, so users can scroll through variants (e.g., 5 collars) and visually confirm the correct one.
- For PSD files, placement now uses **native PSD placement** (no UV preset resize), which avoids the previous “too big / wrong location” behavior.
- For non-PSD assets (PNG/JPG/TIFF), UV preset placement is still used.

## Option A: UXP panel (dark mode)

1. Photoshop → Plugins → Development → Load Unpacked.
2. Open **KIT UV Library** panel.
3. Click **Choose Source Folder**.
4. Use **Preview on document** to audition options.
5. Click **Place in document** when correct.
6. Use **Clear Preview Overlay** to remove temporary preview layer.

## Option B: No-login script route

1. Open PSD.
2. File → Scripts → Browse...
3. Select `photoshop-kit-uv-library.jsx`.
4. Choose source folder.
5. Use **Preview Selected On Document** while browsing.
6. Click **Place Selected** when final.
7. **Close Tool** exits cleanly.

## UV presets

- UXP: `main.js` → `UV_PRESETS`
- JSX: `photoshop-kit-uv-library.jsx` → `UV_PRESETS`

Reference UV size is `4096 x 4096` for non-PSD preset placement.
