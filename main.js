const { app, action, core } = require("photoshop");
const fs = require("uxp").storage.localFileSystem;

const state = {
  library: null,
  assetsFolder: null,
  filteredItems: []
};

const statusEl = document.getElementById("status");
const listEl = document.getElementById("assetList");
const searchInput = document.getElementById("searchInput");
const libraryMeta = document.getElementById("libraryMeta");
const assetsMeta = document.getElementById("assetsMeta");

document.getElementById("loadLibraryBtn").addEventListener("click", loadLibrary);
document
  .getElementById("chooseAssetsFolderBtn")
  .addEventListener("click", chooseAssetsFolder);
searchInput.addEventListener("input", renderItems);

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function validateLibrary(data) {
  if (!data || !Array.isArray(data.items)) {
    throw new Error("Library JSON must contain an items array.");
  }

  data.items.forEach((item, i) => {
    const required = ["name", "path", "x", "y", "width", "height"];
    required.forEach((field) => {
      if (item[field] === undefined || item[field] === null) {
        throw new Error(`Item ${i + 1} is missing field: ${field}`);
      }
    });
  });
}

async function loadLibrary() {
  try {
    const file = await fs.getFileForOpening({ types: ["json"] });
    if (!file) {
      return;
    }

    const raw = await file.read();
    const data = JSON.parse(raw);
    validateLibrary(data);

    state.library = data;
    state.filteredItems = data.items;

    const ref = data.referenceDocument;
    const refText = ref ? ` | Ref UV ${ref.width}x${ref.height}` : "";
    libraryMeta.textContent = `Loaded: ${data.name || file.name} (${data.items.length} items)${refText}`;

    renderItems();
    setStatus("Library loaded.");
  } catch (error) {
    setStatus(`Load failed: ${error.message}`, true);
  }
}

async function chooseAssetsFolder() {
  try {
    const folder = await fs.getFolder();
    if (!folder) {
      return;
    }

    state.assetsFolder = folder;
    assetsMeta.textContent = `Assets: ${folder.name}`;
    setStatus("Assets folder selected.");
  } catch (error) {
    setStatus(`Folder selection failed: ${error.message}`, true);
  }
}

function renderItems() {
  listEl.innerHTML = "";

  if (!state.library) {
    listEl.innerHTML = '<div class="hint">Load a library JSON to begin.</div>';
    return;
  }

  const query = searchInput.value.trim().toLowerCase();
  const items = state.library.items.filter((item) => {
    if (!query) {
      return true;
    }
    return item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query);
  });

  if (!items.length) {
    listEl.innerHTML = '<div class="hint">No matching assets.</div>';
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = "item";

    row.innerHTML = `
      <div class="item-title">${item.name}</div>
      <div class="meta">${item.path}</div>
      <div class="meta">UV: x ${item.x}, y ${item.y}, w ${item.width}, h ${item.height}</div>
    `;

    const button = document.createElement("button");
    button.textContent = "Place in document";
    button.addEventListener("click", () => placeItem(item));
    row.appendChild(button);

    listEl.appendChild(row);
  });
}

async function getActiveDocumentPixels() {
  if (!app.activeDocument) {
    throw new Error("Open a document first.");
  }

  const [widthResult, heightResult] = await action.batchPlay(
    [
      {
        _obj: "get",
        _target: [{ _property: "width" }, { _ref: "document", _enum: "ordinal", _value: "targetEnum" }]
      },
      {
        _obj: "get",
        _target: [{ _property: "height" }, { _ref: "document", _enum: "ordinal", _value: "targetEnum" }]
      }
    ],
    {}
  );

  return {
    width: widthResult.width._value,
    height: heightResult.height._value
  };
}

async function placeItem(item) {
  if (!state.library) {
    setStatus("Load a library first.", true);
    return;
  }

  if (!state.assetsFolder) {
    setStatus("Choose the assets folder first.", true);
    return;
  }

  try {
    const file = await state.assetsFolder.getEntry(item.path);
    const token = await fs.createSessionToken(file);

    await core.executeAsModal(async () => {
      const doc = await getActiveDocumentPixels();
      const ref = state.library.referenceDocument || doc;
      const scaleX = doc.width / ref.width;
      const scaleY = doc.height / ref.height;

      const placeResult = await action.batchPlay(
        [
          {
            _obj: "placeEvent",
            null: {
              _path: token,
              _kind: "local"
            },
            linked: true,
            freeTransformCenterState: {
              _enum: "quadCenterState",
              _value: "QCSAverage"
            },
            offset: {
              _obj: "offset",
              horizontal: { _unit: "pixelsUnit", _value: item.x * scaleX },
              vertical: { _unit: "pixelsUnit", _value: item.y * scaleY }
            },
            width: { _unit: "pixelsUnit", _value: item.width * scaleX },
            height: { _unit: "pixelsUnit", _value: item.height * scaleY }
          }
        ],
        {}
      );

      const layerId = placeResult?.[0]?.ID;
      if (layerId) {
        await action.batchPlay(
          [
            {
              _obj: "move",
              _target: [{ _ref: "layer", _id: layerId }],
              to: {
                _obj: "offset",
                horizontal: { _unit: "pixelsUnit", _value: item.x * scaleX },
                vertical: { _unit: "pixelsUnit", _value: item.y * scaleY }
              }
            }
          ],
          {}
        );
      }
    }, { commandName: `Place ${item.name}` });

    setStatus(`Placed ${item.name} at UV coordinates.`);
  } catch (error) {
    setStatus(`Place failed: ${error.message}`, true);
  }
}

renderItems();
