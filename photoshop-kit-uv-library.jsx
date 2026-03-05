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
        filteredItems: []
    };

    function setStatus(text) {
        statusText.text = text;
    }

    function asNumber(value, fallback) {
        var n = Number(value);
        return isNaN(n) ? fallback : n;
    }

    function getDocSizePx(doc) {
        var original = app.preferences.rulerUnits;
        app.preferences.rulerUnits = Units.PIXELS;
        var out = { width: doc.width.as("px"), height: doc.height.as("px") };
        app.preferences.rulerUnits = original;
        return out;
    }

    function isAsset(name) {
        return /\.(png|jpg|jpeg|psd|tif|tiff)$/i.test(name);
    }

    function isPreviewable(name) {
        return /\.(png|jpg|jpeg)$/i.test(name);
    }

    function normalizePath(path) {
        return path.replace(/\\/g, "/");
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
                out.push({
                    name: item.name.replace(/\.[^.]+$/, ""),
                    path: rel,
                    category: (category || "default").toLowerCase()
                });
            }
        }
    }

    function refreshPreview(item) {
        if (!item || !state.sourceFolder) {
            previewPanel.visible = false;
            return;
        }

        var file = new File(state.sourceFolder.fsName + "/" + item.path);
        if (!file.exists || !isPreviewable(file.name)) {
            previewText.text = "No preview for this file type.";
            previewImage.image = null;
            previewPanel.visible = true;
            return;
        }

        try {
            previewImage.image = ScriptUI.newImage(file);
            previewText.text = item.name + " (" + item.category + ")";
            previewPanel.visible = true;
        } catch (e) {
            previewText.text = "Preview failed: " + e.message;
            previewImage.image = null;
            previewPanel.visible = true;
        }
    }

    function refreshList() {
        list.removeAll();
        if (!state.sourceFolder) {
            setStatus("Choose source folder first.");
            return;
        }

        var q = (searchInput.text || "").toLowerCase();
        state.filteredItems = [];

        for (var i = 0; i < state.items.length; i++) {
            var item = state.items[i];
            if (!q || item.name.toLowerCase().indexOf(q) !== -1 || item.path.toLowerCase().indexOf(q) !== -1) {
                state.filteredItems.push(item);
                list.add("item", "[" + item.category + "] " + item.name + "  (" + item.path + ")");
            }
        }

        if (state.filteredItems.length) {
            list.selection = 0;
            refreshPreview(state.filteredItems[0]);
        } else {
            refreshPreview(null);
        }

        setStatus(state.filteredItems.length ? (state.filteredItems.length + " item(s) visible.") : "No matching assets.");
    }

    function placeItem(item) {
        var targetDoc = app.activeDocument;
        var docSize = getDocSizePx(targetDoc);
        var scaleX = docSize.width / REFERENCE_UV.width;
        var scaleY = docSize.height / REFERENCE_UV.height;
        var slot = UV_PRESETS[item.category] || UV_PRESETS["default"];

        var x = asNumber(slot.x, 0) * scaleX;
        var y = asNumber(slot.y, 0) * scaleY;
        var w = asNumber(slot.width, 1000) * scaleX;
        var h = asNumber(slot.height, 1000) * scaleY;

        var file = new File(state.sourceFolder.fsName + "/" + item.path);
        if (!file.exists) {
            throw new Error("Asset missing: " + file.fsName);
        }

        var src = app.open(file);
        src.activeLayer.name = item.name;
        src.activeLayer.duplicate(targetDoc, ElementPlacement.PLACEATBEGINNING);
        src.close(SaveOptions.DONOTSAVECHANGES);

        app.activeDocument = targetDoc;
        var layer = targetDoc.activeLayer;

        var original = app.preferences.rulerUnits;
        app.preferences.rulerUnits = Units.PIXELS;

        var b = layer.bounds;
        var currentW = b[2].as("px") - b[0].as("px");
        var currentH = b[3].as("px") - b[1].as("px");
        if (currentW <= 0 || currentH <= 0) {
            app.preferences.rulerUnits = original;
            throw new Error("Invalid bounds for: " + item.name);
        }

        layer.resize((w / currentW) * 100, (h / currentH) * 100, AnchorPosition.TOPLEFT);
        b = layer.bounds;
        layer.translate(UnitValue(x - b[0].as("px"), "px"), UnitValue(y - b[1].as("px"), "px"));

        app.preferences.rulerUnits = original;
    }

    var w = new Window("dialog", "KIT UV Library (Folder-based)");
    w.orientation = "column";
    w.alignChildren = ["fill", "top"];

    var chooseBtn = w.add("button", undefined, "Choose Source Folder");

    var searchGroup = w.add("group");
    searchGroup.orientation = "row";
    searchGroup.add("statictext", undefined, "Search:");
    var searchInput = searchGroup.add("edittext", undefined, "");
    searchInput.characters = 40;

    var bodyGroup = w.add("group");
    bodyGroup.orientation = "row";
    bodyGroup.alignChildren = ["fill", "fill"];

    var list = bodyGroup.add("listbox", undefined, [], { multiselect: false });
    list.preferredSize = [450, 280];

    var previewPanel = bodyGroup.add("panel", undefined, "Preview");
    previewPanel.orientation = "column";
    previewPanel.alignChildren = ["fill", "top"];
    previewPanel.preferredSize = [240, 280];
    var previewImage = previewPanel.add("image", undefined, undefined);
    previewImage.preferredSize = [220, 220];
    var previewText = previewPanel.add("statictext", undefined, "Select an asset");

    var actions = w.add("group");
    actions.orientation = "row";
    var placeBtn = actions.add("button", undefined, "Place Selected");
    var closeBtn = actions.add("button", undefined, "Close Tool");

    var statusText = w.add("statictext", undefined, "Choose source folder to begin.");

    chooseBtn.onClick = function () {
        var folder = Folder.selectDialog("Select source folder with subfolders (Collars, Shorts, etc)");
        if (!folder) return;

        state.sourceFolder = folder;
        state.items = [];
        scanFolder(folder, "", null, 0, state.items);
        refreshList();
        setStatus("Loaded " + state.items.length + " assets from " + folder.fsName);
    };

    searchInput.onChanging = refreshList;

    list.onChange = function () {
        if (!list.selection) return;
        refreshPreview(state.filteredItems[list.selection.index]);
    };

    placeBtn.onClick = function () {
        try {
            if (!state.sourceFolder) throw new Error("Choose source folder first.");
            if (!list.selection) throw new Error("Select an asset.");
            var item = state.filteredItems[list.selection.index];
            placeItem(item);
            setStatus("Placed " + item.name + " in " + item.category + " slot.");
        } catch (e) {
            setStatus("Error: " + e.message);
        }
    };

    closeBtn.onClick = function () {
        w.close();
    };

    w.onClose = function () {
        return true;
    };

    w.center();
    w.show();
})();
