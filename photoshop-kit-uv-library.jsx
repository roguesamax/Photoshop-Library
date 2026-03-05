#target photoshop
app.bringToFront();

(function () {
    if (!app.documents.length) {
        alert("Open your target PSD before running this script.");
        return;
    }

    var REFERENCE_UV = { width: 4096, height: 4096 };
    var UV_PRESETS = {
        collars: { x: 1540, y: 170, width: 1020, height: 430 },
        shorts: { x: 1450, y: 2800, width: 1200, height: 900 },
        sleeves: { x: 200, y: 900, width: 980, height: 1600 },
        sponsors: { x: 1520, y: 1300, width: 1060, height: 600 },
        numbers: { x: 1630, y: 1550, width: 840, height: 980 },
        "default": { x: 1500, y: 1500, width: 1000, height: 1000 }
    };

    var state = {
        sourceFolder: null,
        items: [],
        filteredItems: [],
        previewLayer: null
    };

    function setStatus(text) { statusText.text = text; }
    function asNumber(value, fallback) { var n = Number(value); return isNaN(n) ? fallback : n; }
    function isAsset(name) { return /\.(png|jpg|jpeg|psd|tif|tiff)$/i.test(name); }
    function isPsd(name) { return /\.psd$/i.test(name); }
    function normalizePath(path) { return path.replace(/\\/g, "/"); }

    function getDocSizePx(doc) {
        var original = app.preferences.rulerUnits;
        app.preferences.rulerUnits = Units.PIXELS;
        var out = { width: doc.width.as("px"), height: doc.height.as("px") };
        app.preferences.rulerUnits = original;
        return out;
    }

    function scanFolder(folder, relPrefix, category, depth, out) {
        var files = folder.getFiles();
        for (var i = 0; i < files.length; i++) {
            var item = files[i];
            var rel = relPrefix ? relPrefix + "/" + item.name : item.name;
            rel = normalizePath(rel);

            if (item instanceof Folder) {
                var nextCategory = depth === 0 ? item.name.toLowerCase() : category;
                scanFolder(item, rel, nextCategory, depth + 1, out);
            } else if (item instanceof File && isAsset(item.name)) {
                out.push({ name: item.name.replace(/\.[^.]+$/, ""), fileName: item.name, path: rel, category: (category || "default").toLowerCase() });
            }
        }
    }

    function refreshList() {
        list.removeAll();
        if (!state.sourceFolder) return setStatus("Choose source folder first.");

        var q = (searchInput.text || "").toLowerCase();
        state.filteredItems = [];

        for (var i = 0; i < state.items.length; i++) {
            var item = state.items[i];
            if (!q || item.name.toLowerCase().indexOf(q) !== -1 || item.path.toLowerCase().indexOf(q) !== -1) {
                state.filteredItems.push(item);
                list.add("item", "[" + item.category + "] " + item.name + " (" + item.path + ")");
            }
        }

        setStatus(state.filteredItems.length ? (state.filteredItems.length + " item(s) visible.") : "No matching assets.");
    }

    function getSelectedItem() {
        if (!state.sourceFolder) throw new Error("Choose source folder first.");
        if (!list.selection) throw new Error("Select an asset.");
        return state.filteredItems[list.selection.index];
    }

    function clearPreviewLayer() {
        if (state.previewLayer && state.previewLayer.isValid) {
            state.previewLayer.remove();
        }
        state.previewLayer = null;
    }

    function placeInternal(item, previewOnly) {
        var targetDoc = app.activeDocument;
        var docSize = getDocSizePx(targetDoc);
        var scaleX = docSize.width / REFERENCE_UV.width;
        var scaleY = docSize.height / REFERENCE_UV.height;
        var slot = UV_PRESETS[item.category] || UV_PRESETS["default"];

        var file = new File(state.sourceFolder.fsName + "/" + item.path);
        if (!file.exists) throw new Error("Asset missing: " + file.fsName);

        var src = app.open(file);
        src.activeLayer.name = item.name;
        src.activeLayer.duplicate(targetDoc, ElementPlacement.PLACEATBEGINNING);
        src.close(SaveOptions.DONOTSAVECHANGES);

        app.activeDocument = targetDoc;
        var layer = targetDoc.activeLayer;

        var original = app.preferences.rulerUnits;
        app.preferences.rulerUnits = Units.PIXELS;

        var b = layer.bounds;
        var left = b[0].as("px");
        var top = b[1].as("px");

        if (isPsd(item.fileName)) {
            layer.translate(UnitValue(-left, "px"), UnitValue(-top, "px"));
        } else {
            var currentW = b[2].as("px") - b[0].as("px");
            var currentH = b[3].as("px") - b[1].as("px");
            if (currentW <= 0 || currentH <= 0) {
                app.preferences.rulerUnits = original;
                throw new Error("Invalid bounds for: " + item.name);
            }

            var x = asNumber(slot.x, 0) * scaleX;
            var y = asNumber(slot.y, 0) * scaleY;
            var w = asNumber(slot.width, 1000) * scaleX;
            var h = asNumber(slot.height, 1000) * scaleY;

            layer.resize((w / currentW) * 100, (h / currentH) * 100, AnchorPosition.TOPLEFT);
            b = layer.bounds;
            layer.translate(UnitValue(x - b[0].as("px"), "px"), UnitValue(y - b[1].as("px"), "px"));
        }

        if (previewOnly) {
            layer.opacity = 45;
            layer.name = "__KIT_PREVIEW__ " + item.name;
            state.previewLayer = layer;
        }

        app.preferences.rulerUnits = original;
        return layer;
    }

    var w = new Window("dialog", "KIT UV Library (Folder-based)");
    w.orientation = "column";
    w.alignChildren = ["fill", "top"];

    var chooseBtn = w.add("button", undefined, "Choose Source Folder");

    var searchGroup = w.add("group");
    searchGroup.add("statictext", undefined, "Search:");
    var searchInput = searchGroup.add("edittext", undefined, "");
    searchInput.characters = 42;

    var list = w.add("listbox", undefined, [], { multiselect: false });
    list.preferredSize = [700, 300];

    var actions = w.add("group");
    var previewBtn = actions.add("button", undefined, "Preview Selected On Document");
    var placeBtn = actions.add("button", undefined, "Place Selected");
    var clearPreviewBtn = actions.add("button", undefined, "Clear Preview");
    var closeBtn = actions.add("button", undefined, "Close Tool");

    var statusText = w.add("statictext", undefined, "Choose source folder to begin.");

    chooseBtn.onClick = function () {
        var folder = Folder.selectDialog("Select source folder with subfolders (Collars, Shorts, etc)");
        if (!folder) return;
        state.sourceFolder = folder;
        state.items = [];
        scanFolder(folder, "", null, 0, state.items);
        refreshList();
        setStatus("Loaded " + state.items.length + " assets.");
    };

    searchInput.onChanging = refreshList;

    previewBtn.onClick = function () {
        try {
            clearPreviewLayer();
            var item = getSelectedItem();
            placeInternal(item, true);
            setStatus("Previewing " + item.name + " on active PSD.");
        } catch (e) {
            setStatus("Error: " + e.message);
        }
    };

    clearPreviewBtn.onClick = function () {
        try {
            clearPreviewLayer();
            setStatus("Preview cleared.");
        } catch (e) {
            setStatus("Error: " + e.message);
        }
    };

    placeBtn.onClick = function () {
        try {
            clearPreviewLayer();
            var item = getSelectedItem();
            placeInternal(item, false);
            setStatus("Placed " + item.name + ".");
        } catch (e) {
            setStatus("Error: " + e.message);
        }
    };

    closeBtn.onClick = function () { w.close(); };
    w.onClose = function () { clearPreviewLayer(); return true; };

    w.center();
    w.show();
})();
