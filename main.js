const { app, action, core } = require("photoshop");
const uxp = require("uxp");
const fs = uxp.storage.localFileSystem;
const formats = uxp.storage.formats;

const REFERENCE_UV = { width: 4096, height: 4096 };
const UV_PRESETS = {
  collars: { x: 1540, y: 170, width: 1020, height: 430 },
  shorts: { x: 1450, y: 2800, width: 1200, height: 900 },
  sleeves: { x: 200, y: 900, width: 980, height: 1600 },
  sponsors: { x: 1520, y: 1300, width: 1060, height: 600 },
  numbers: { x: 1630, y: 1550, width: 840, height: 980 },
  default: { x: 1500, y: 1500, width: 1000, height: 1000 }
};

const state = {
  sourceFolder: null,
  items: [],
  previewLayerId: null
};

const statusEl = document.getElementById("status");
const listEl = document.getElementById("assetList");
const searchInput = document.getElementById("searchInput");
const sourceMeta = document.getElementById("sourceMeta");
const clearPreviewBtn = document.getElementById("clearPreviewBtn");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function isAssetFile(name) {
  return /\.(png|jpg|jpeg|psd|tif|tiff)$/i.test(name);
}

function isPreviewableImage(name) {
  return /\.(png|jpg|jpeg)$/i.test(name);
}

function isPsd(name) {
  return /\.psd$/i.test(name);
}

function base64FromUint8(uint8) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    const chunk = uint8.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function buildThumbnail(file, fileName) {
  if (!isPreviewableImage(fileName)) return null;
  try {
    const bytes = await file.read({ format: formats.binary });
    const mime = fileName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${base64FromUint8(bytes)}`;
  } catch {
    return null;
  }
}

async function scanFolder(folder, parentPath = "", category = null, depth = 0) {
  const out = [];
  const entries = await folder.getEntries();

  for (const entry of entries) {
    const rel = parentPath ? `${parentPath}/${entry.name}` : entry.name;

    if (entry.isFile && isAssetFile(entry.name)) {
      out.push({
        name: entry.name.replace(/\.[^.]+$/, ""),
        fileName: entry.name,
        path: rel,
        entry,
        category: (category || "default").toLowerCase(),
        thumbnail: await buildThumbnail(entry, entry.name)
      });
    }

    if (entry.isFolder) {
      const nextCategory = depth === 0 ? entry.name : category;
      out.push(...(await scanFolder(entry, rel, nextCategory, depth + 1)));
    }
  }

  return out;
}

async function chooseSourceFolder() {
  try {
    const folder = await fs.getFolder();
    if (!folder) return;

    state.sourceFolder = folder;
    setStatus("Scanning folder...");
    state.items = await scanFolder(folder);

    sourceMeta.textContent = `Source: ${folder.name} (${state.items.length} assets)`;
    renderItems();
    setStatus("Source folder loaded.");
  } catch (error) {
    setStatus(`Source folder failed: ${error.message}`, true);
  }
}

function renderItems() {
  listEl.innerHTML = "";

  if (!state.sourceFolder) {
    listEl.innerHTML = '<div class="hint">Choose a source folder to begin.</div>';
    return;
  }

  const query = searchInput.value.trim().toLowerCase();
  const items = state.items.filter((item) => !query || item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query));

  if (!items.length) {
    listEl.innerHTML = '<div class="hint">No matching assets.</div>';
    return;
  }

  items.forEach((item) => {
    const preset = UV_PRESETS[item.category] || UV_PRESETS.default;
    const row = document.createElement("article");
    row.className = "item";

    const thumb = item.thumbnail
      ? `<img class="thumb" src="${item.thumbnail}" alt="${item.name}" />`
      : `<div class="thumb thumb-placeholder">${isPsd(item.fileName) ? "PSD" : "No preview"}</div>`;

    row.innerHTML = `
      <div class="item-layout">
        ${thumb}
        <div>
          <div class="item-title">${item.name}</div>
          <div class="meta">${item.path}</div>
          <div class="meta">${isPsd(item.fileName) ? "PSD native placement" : `UV slot ${preset.x},${preset.y},${preset.width},${preset.height}`}</div>
        </div>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const previewBtn = document.createElement("button");
    previewBtn.textContent = "Preview on document";
    previewBtn.addEventListener("click", () => previewItem(item));

    const placeBtn = document.createElement("button");
    placeBtn.textContent = "Place in document";
    placeBtn.addEventListener("click", () => placeItem(item));

    actions.appendChild(previewBtn);
    actions.appendChild(placeBtn);
    row.appendChild(actions);

    listEl.appendChild(row);
  });
}

async function getActiveDocumentPixels() {
  if (!app.activeDocument) throw new Error("Open a document first.");

  const [widthResult, heightResult] = await action.batchPlay(
    [
      { _obj: "get", _target: [{ _property: "width" }, { _ref: "document", _enum: "ordinal", _value: "targetEnum" }] },
      { _obj: "get", _target: [{ _property: "height" }, { _ref: "document", _enum: "ordinal", _value: "targetEnum" }] }
    ],
    {}
  );

  return { width: widthResult.width._value, height: heightResult.height._value };
}

async function getLayerBounds(layerId) {
  const [result] = await action.batchPlay(
    [{ _obj: "get", _target: [{ _ref: "layer", _id: layerId }], _options: { dialogOptions: "dontDisplay" } }],
    {}
  );
  const b = result.boundsNoEffects || result.bounds;
  return {
    left: b.left._value,
    top: b.top._value,
    right: b.right._value,
    bottom: b.bottom._value
  };
}

async function deleteLayerById(layerId) {
  if (!layerId) return;
  await action.batchPlay(
    [{ _obj: "delete", _target: [{ _ref: "layer", _id: layerId }] }],
    {}
  );
}

async function placeRaw(item, isPreview = false) {
  const token = await fs.createSessionToken(item.entry);
  const doc = await getActiveDocumentPixels();
  const scaleX = doc.width / REFERENCE_UV.width;
  const scaleY = doc.height / REFERENCE_UV.height;
  const slot = UV_PRESETS[item.category] || UV_PRESETS.default;

  if (isPsd(item.fileName)) {
    const [placed] = await action.batchPlay(
      [
        {
          _obj: "placeEvent",
          null: { _path: token, _kind: "local" },
          linked: true
        }
      ],
      {}
    );

    const layerId = placed.ID;
    const b = await getLayerBounds(layerId);

    await action.batchPlay(
      [
        {
          _obj: "move",
          _target: [{ _ref: "layer", _id: layerId }],
          to: {
            _obj: "offset",
            horizontal: { _unit: "pixelsUnit", _value: -b.left },
            vertical: { _unit: "pixelsUnit", _value: -b.top }
          }
        }
      ],
      {}
    );

    if (isPreview) {
      await action.batchPlay(
        [
          {
            _obj: "set",
            _target: [{ _ref: "layer", _id: layerId }],
            to: { _obj: "layer", opacity: { _unit: "percentUnit", _value: 45 } }
          }
        ],
        {}
      );
    }

    return layerId;
  }

  const [placed] = await action.batchPlay(
    [
      {
        _obj: "placeEvent",
        null: { _path: token, _kind: "local" },
        linked: true,
        offset: {
          _obj: "offset",
          horizontal: { _unit: "pixelsUnit", _value: slot.x * scaleX },
          vertical: { _unit: "pixelsUnit", _value: slot.y * scaleY }
        },
        width: { _unit: "pixelsUnit", _value: slot.width * scaleX },
        height: { _unit: "pixelsUnit", _value: slot.height * scaleY }
      }
    ],
    {}
  );

  if (isPreview) {
    await action.batchPlay(
      [
        {
          _obj: "set",
          _target: [{ _ref: "layer", _id: placed.ID }],
          to: { _obj: "layer", opacity: { _unit: "percentUnit", _value: 45 } }
        }
      ],
      {}
    );
  }

  return placed.ID;
}

async function clearPreview() {
  if (!state.previewLayerId) return;

  await core.executeAsModal(async () => {
    await deleteLayerById(state.previewLayerId);
    state.previewLayerId = null;
  }, { commandName: "Clear KIT Preview" });

  setStatus("Preview cleared.");
}

async function previewItem(item) {
  if (!state.sourceFolder) {
    setStatus("Choose a source folder first.", true);
    return;
  }

  try {
    await core.executeAsModal(async () => {
      if (state.previewLayerId) {
        await deleteLayerById(state.previewLayerId);
        state.previewLayerId = null;
      }

      state.previewLayerId = await placeRaw(item, true);
    }, { commandName: `Preview ${item.name}` });

    setStatus(`Previewing ${item.name}. Scroll and preview other options.`);
  } catch (error) {
    setStatus(`Preview failed: ${error.message}`, true);
  }
}

async function placeItem(item) {
  if (!state.sourceFolder) {
    setStatus("Choose a source folder first.", true);
    return;
  }

  try {
    await core.executeAsModal(async () => {
      if (state.previewLayerId) {
        await deleteLayerById(state.previewLayerId);
        state.previewLayerId = null;
      }
      await placeRaw(item, false);
    }, { commandName: `Place ${item.name}` });

    setStatus(`Placed ${item.name}.`);
  } catch (error) {
    setStatus(`Place failed: ${error.message}`, true);
  }
}

document.getElementById("chooseSourceFolderBtn").addEventListener("click", chooseSourceFolder);
searchInput.addEventListener("input", renderItems);
clearPreviewBtn.addEventListener("click", clearPreview);

renderItems();
