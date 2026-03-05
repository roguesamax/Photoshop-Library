const { app, action, core } = require("photoshop");
const fs = require("uxp").storage.localFileSystem;

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
  items: []
};

const statusEl = document.getElementById("status");
const listEl = document.getElementById("assetList");
const searchInput = document.getElementById("searchInput");
const sourceMeta = document.getElementById("sourceMeta");

document.getElementById("chooseSourceFolderBtn").addEventListener("click", chooseSourceFolder);
searchInput.addEventListener("input", renderItems);

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function isAssetFile(name) {
  return /\.(png|jpg|jpeg|psd|tif|tiff)$/i.test(name);
}

async function scanFolder(folder, parentPath = "", category = null, depth = 0) {
  const out = [];
  const entries = await folder.getEntries();

  for (const entry of entries) {
    const rel = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    if (entry.isFile && isAssetFile(entry.name)) {
      out.push({
        name: entry.name.replace(/\.[^.]+$/, ""),
        path: rel,
        category: (category || "default").toLowerCase()
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
  const items = state.items.filter((item) => {
    if (!query) return true;
    return item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query);
  });

  if (!items.length) {
    listEl.innerHTML = '<div class="hint">No matching assets.</div>';
    return;
  }

  items.forEach((item) => {
    const preset = UV_PRESETS[item.category] || UV_PRESETS.default;
    const row = document.createElement("article");
    row.className = "item";
    row.innerHTML = `
      <div class="item-title">${item.name}</div>
      <div class="meta">${item.path}</div>
      <div class="meta">Category: ${item.category} · UV slot ${preset.x},${preset.y},${preset.width},${preset.height}</div>
    `;

    const button = document.createElement("button");
    button.textContent = "Place in document";
    button.addEventListener("click", () => placeItem(item));
    row.appendChild(button);
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

async function getEntryByPath(rootFolder, relativePath) {
  const parts = relativePath.split("/").filter(Boolean);
  let current = rootFolder;

  for (let i = 0; i < parts.length; i++) {
    current = await current.getEntry(parts[i]);
  }

  return current;
}

async function placeItem(item) {
  if (!state.sourceFolder) {
    setStatus("Choose a source folder first.", true);
    return;
  }

  try {
    const file = await getEntryByPath(state.sourceFolder, item.path);
    const token = await fs.createSessionToken(file);

    await core.executeAsModal(async () => {
      const doc = await getActiveDocumentPixels();
      const scaleX = doc.width / REFERENCE_UV.width;
      const scaleY = doc.height / REFERENCE_UV.height;
      const slot = UV_PRESETS[item.category] || UV_PRESETS.default;

      await action.batchPlay(
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
    }, { commandName: `Place ${item.name}` });

    setStatus(`Placed ${item.name} in ${item.category} UV slot.`);
  } catch (error) {
    setStatus(`Place failed: ${error.message}`, true);
  }
}

renderItems();
