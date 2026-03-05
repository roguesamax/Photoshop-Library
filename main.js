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

const PREVIEW_LAYER_PREFIX = "__KIT_PREVIEW__";
const SOURCE_FOLDER_TOKEN_KEY = "kitUVSourceFolderToken";

const state = {
  sourceFolder: null,
  items: [],
  activePreview: null // {layerId, path}
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

const isAssetFile = (name) => /\.(png|jpg|jpeg|psd|tif|tiff)$/i.test(name);
const isPreviewableImage = (name) => /\.(png|jpg|jpeg)$/i.test(name);
const isPsd = (name) => /\.psd$/i.test(name);

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
  for (const entry of await folder.getEntries()) {
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

async function setSourceFolder(folder, persist = true) {
  state.sourceFolder = folder;
  setStatus("Scanning folder...");
  state.items = await scanFolder(folder);
  sourceMeta.textContent = `Source: ${folder.name} (${state.items.length} assets)`;
  renderItems();
  setStatus("Source folder loaded.");

  if (persist) {
    const token = await fs.createPersistentToken(folder);
    localStorage.setItem(SOURCE_FOLDER_TOKEN_KEY, token);
  }
}

async function chooseSourceFolder() {
  try {
    const folder = await fs.getFolder();
    if (!folder) return;
    await setSourceFolder(folder, true);
  } catch (error) {
    setStatus(`Source folder failed: ${error.message}`, true);
  }
}

async function restoreSourceFolder() {
  const token = localStorage.getItem(SOURCE_FOLDER_TOKEN_KEY);
  if (!token) return;

  try {
    const folder = await fs.getEntryForPersistentToken(token);
    if (folder?.isFolder) {
      await setSourceFolder(folder, false);
      setStatus(`Restored source folder: ${folder.name}`);
    }
  } catch {
    localStorage.removeItem(SOURCE_FOLDER_TOKEN_KEY);
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

  for (const item of items) {
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
          <div class="meta">${isPsd(item.fileName) ? "PSD keeps native position/scale" : `UV slot ${preset.x},${preset.y},${preset.width},${preset.height}`}</div>
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

    actions.append(previewBtn, placeBtn);
    row.appendChild(actions);
    listEl.appendChild(row);
  }
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

async function collectPreviewLayerIds() {
  const result = [];
  const walk = (layers) => {
    for (const layer of layers || []) {
      if (layer?.name && layer.name.startsWith(PREVIEW_LAYER_PREFIX) && layer.id) {
        result.push(layer.id);
      }
      if (layer?.layers?.length) walk(layer.layers);
    }
  };

  try {
    walk(app.activeDocument?.layers || []);
  } catch {
    return result;
  }

  return result;
}

async function deleteLayerById(layerId) {
  await action.batchPlay([{ _obj: "delete", _target: [{ _ref: "layer", _id: layerId }] }], {});
}

async function clearAllPreviewLayersUnsafe() {
  const ids = await collectPreviewLayerIds();
  for (const id of ids) {
    try {
      await deleteLayerById(id);
    } catch {
      // continue
    }
  }
  state.activePreview = null;
}

async function setLayerOpacity(layerId, opacity) {
  await action.batchPlay(
    [{ _obj: "set", _target: [{ _ref: "layer", _id: layerId }], to: { _obj: "layer", opacity: { _unit: "percentUnit", _value: opacity } } }],
    {}
  );
}

async function setLayerName(layerId, name) {
  await action.batchPlay([{ _obj: "set", _target: [{ _ref: "layer", _id: layerId }], to: { _obj: "layer", name } }], {});
}

async function placeRaw(item, isPreview = false) {
  const token = await fs.createSessionToken(item.entry);

  if (isPsd(item.fileName)) {
    const [placed] = await action.batchPlay([{ _obj: "placeEvent", null: { _path: token, _kind: "local" }, linked: true }], {});
    if (isPreview) {
      await setLayerName(placed.ID, `${PREVIEW_LAYER_PREFIX} ${item.name}`);
      await setLayerOpacity(placed.ID, 45);
      state.activePreview = { layerId: placed.ID, path: item.path };
    }
    return placed.ID;
  }

  const doc = await getActiveDocumentPixels();
  const scaleX = doc.width / REFERENCE_UV.width;
  const scaleY = doc.height / REFERENCE_UV.height;
  const slot = UV_PRESETS[item.category] || UV_PRESETS.default;

  const [placed] = await action.batchPlay(
    [{
      _obj: "placeEvent",
      null: { _path: token, _kind: "local" },
      linked: true,
      offset: { _obj: "offset", horizontal: { _unit: "pixelsUnit", _value: slot.x * scaleX }, vertical: { _unit: "pixelsUnit", _value: slot.y * scaleY } },
      width: { _unit: "pixelsUnit", _value: slot.width * scaleX },
      height: { _unit: "pixelsUnit", _value: slot.height * scaleY }
    }],
    {}
  );

  if (isPreview) {
    await setLayerName(placed.ID, `${PREVIEW_LAYER_PREFIX} ${item.name}`);
    await setLayerOpacity(placed.ID, 45);
    state.activePreview = { layerId: placed.ID, path: item.path };
  }

  return placed.ID;
}

async function finalizeActivePreview(item) {
  if (!state.activePreview || state.activePreview.path !== item.path) return false;
  await setLayerOpacity(state.activePreview.layerId, 100);
  await setLayerName(state.activePreview.layerId, item.name);
  state.activePreview = null;
  return true;
}

async function clearPreview() {
  try {
    await core.executeAsModal(async () => {
      await clearAllPreviewLayersUnsafe();
    }, { commandName: "Clear KIT Preview" });
    setStatus("Preview cleared.");
  } catch (error) {
    setStatus(`Clear preview failed: ${error.message}`, true);
  }
}

async function previewItem(item) {
  if (!state.sourceFolder) return setStatus("Choose a source folder first.", true);

  try {
    await core.executeAsModal(async () => {
      await clearAllPreviewLayersUnsafe();
      await placeRaw(item, true);
    }, { commandName: `Preview ${item.name}` });
    setStatus(`Previewing ${item.name}. Previous preview removed automatically.`);
  } catch (error) {
    setStatus(`Preview failed: ${error.message}`, true);
  }
}

async function placeItem(item) {
  if (!state.sourceFolder) return setStatus("Choose a source folder first.", true);

  try {
    await core.executeAsModal(async () => {
      const usedPreview = await finalizeActivePreview(item);
      if (!usedPreview) {
        await clearAllPreviewLayersUnsafe();
        await placeRaw(item, false);
      }
    }, { commandName: `Place ${item.name}` });
    setStatus(`Placed ${item.name}. Only final layer kept.`);
  } catch (error) {
    setStatus(`Place failed: ${error.message}`, true);
  }
}

document.getElementById("chooseSourceFolderBtn").addEventListener("click", chooseSourceFolder);
searchInput.addEventListener("input", renderItems);
clearPreviewBtn.addEventListener("click", clearPreview);

renderItems();
restoreSourceFolder();
