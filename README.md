# KIT UV Library (Photoshop UXP Plugin)

A dark-mode Photoshop panel for kit-design libraries where each asset is placed using saved UV coordinates.

## Why this solves your issue

Default drag/drop into Photoshop Libraries often loses the original UV position context. This plugin places assets by explicit `x`, `y`, `width`, and `height` values from your library data, so a collar lands where a collar belongs.

## Features

- Dark mode, simple panel UI.
- Search/filter assets quickly.
- Works with modern Photoshop (manifest v5, `minVersion` 25).
- UV-aware placement with optional scaling based on a reference document size.

## Install (Developer mode)

1. In Photoshop, open **Plugins → Development → Load Unpacked**.
2. Select this folder (`Photoshop-Library`).
3. Open the **KIT UV Library** panel.

## Library JSON format

Create a JSON file like:

```json
{
  "name": "My Kit",
  "referenceDocument": { "width": 4096, "height": 4096 },
  "items": [
    {
      "name": "Home Collar",
      "path": "collars/home-collar.png",
      "x": 1630,
      "y": 210,
      "width": 820,
      "height": 350
    }
  ]
}
```

- `path` is relative to the **Assets Folder** you choose inside the plugin.
- `referenceDocument` is optional. If provided, coordinates are scaled to the current PSD size.

## Usage

1. Load your library JSON.
2. Choose the assets folder.
3. Open a PSD.
4. Click **Place in document** on an asset.

