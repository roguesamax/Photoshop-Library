# KIT UV Library

You now have **two ways** to use this workflow:

1. **UXP plugin panel** (dark mode, modern panel UI) — requires Photoshop plugin developer mode setup.
2. **No-login JSX script** — runs from `File → Scripts → Browse...` and does **not** require creating a UXP developer plugin package.

---

## Option A: UXP plugin panel (dark mode)

Files used:
- `manifest.json`
- `index.html`
- `styles.css`
- `main.js`

### Install (Developer mode)
1. Photoshop → **Plugins → Development → Load Unpacked**.
2. Select this folder (`Photoshop-Library`).
3. Open **KIT UV Library** panel.

> If Photoshop asks for developer account/login in your environment, use **Option B** below.

---

## Option B: No Adobe developer login (JSX script)

File used:
- `photoshop-kit-uv-library.jsx`

### Run
1. Open your target PSD first.
2. Photoshop → **File → Scripts → Browse...**
3. Select `photoshop-kit-uv-library.jsx`.
4. In the script window:
   - Click **Load Library JSON**
   - Click **Choose Assets Folder**
   - Search/select an item
   - Click **Place Selected**

This script uses the same UV placement idea (`x`, `y`, `width`, `height`) and scales coordinates using `referenceDocument` when provided.

---

## Library JSON format

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

- `path` is relative to the assets folder you choose.
- `referenceDocument` is optional. If present, values are scaled to active PSD size.

---

## Important note about Adobe login

- For **UXP plugin development workflows**, Adobe may require account sign-in depending on your Photoshop build/policy.
- If your goal is to avoid that entirely, the included **JSX script path** is the practical workaround.
