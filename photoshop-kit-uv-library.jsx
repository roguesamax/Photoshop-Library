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

    var PREVIEW_LAYER_PREFIX = "__KIT_PREVIEW__";
    var CACHE_FOLDER = new Folder(Folder.userData.fsName + "/kit_uv_preview_cache");
    var SETTINGS_FILE = new File(Folder.userData.fsName + "/kit_uv_last_source.txt");

    var state = {
        sourceFolder: null,
        items: [],
        filteredItems: [],
        activePreview: null,
        selectedCategory: "all"
    };

    function setStatus(text) { statusText.text = text; }
    function asNumber(value, fallback) { var n = Number(value); return isNaN(n) ? fallback : n; }
    function isAsset(name) { return /\.(png|jpg|jpeg|psd|tif|tiff)$/i.test(name); }
    function isPsd(name) { return /\.psd$/i.test(name); }
    function isPreviewableImage(name) { return /\.(png|jpg|jpeg)$/i.test(name); }
    function normalizePath(path) { return path.replace(/\\/g, "/"); }

    function ensureCacheFolder() {
        if (!CACHE_FOLDER.exists) CACHE_FOLDER.create();
    }

    function saveLastFolderPath(folderPath) {
        try {
            SETTINGS_FILE.encoding = "UTF8";
            SETTINGS_FILE.open("w");
            SETTINGS_FILE.write(folderPath);
            SETTINGS_FILE.close();
        } catch (e) {}
    }

    function loadLastFolderPath() {
        try {
            if (!SETTINGS_FILE.exists) return null;
            SETTINGS_FILE.encoding = "UTF8";
            SETTINGS_FILE.open("r");
            var txt = SETTINGS_FILE.read();
            SETTINGS_FILE.close();
            return txt || null;
        } catch (e) {
            return null;
        }
    }

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
                out.push({
                    name: item.name.replace(/\.[^.]+$/, ""),
                    fileName: item.name,
                    path: rel,
                    category: (category || "default").toLowerCase()
                });
            }
        }
    }

    function listSelectionItem() {
        if (!list.selection) return null;
        return state.filteredItems[list.selection.index] || null;
    }

    function setPreviewImageFromFile(file) {
        try {
            previewImage.image = ScriptUI.newImage(file);
            previewLabel.text = file.name;
        } catch (e) {
            previewImage.image = null;
            previewLabel.text = "Preview unavailable";
        }
    }

    function simpleHash(text) {
        var h = 5381;
        for (var i = 0; i < text.length; i++) {
            h = ((h << 5) + h) + text.charCodeAt(i);
            h = h & 0x7fffffff;
        }
        return String(h);
    }

    function cacheKeyFor(item) {
        return normalizePath(state.sourceFolder.fsName + "/" + item.path);
    }

    function cachedPreviewFileFor(item) {
        ensureCacheFolder();
        var key = cacheKeyFor(item);
        var hash = simpleHash(key);
        return new File(CACHE_FOLDER.fsName + "/" + hash + ".png");
    }

    function sourceMtimeToken(file) {
        try {
            return file.modified ? String(file.modified.getTime()) : "0";
        } catch (e) {
            return "0";
        }
    }

    function readCacheMeta(metaFile) {
        try {
            if (!metaFile.exists) return "";
            metaFile.encoding = "UTF8";
            metaFile.open("r");
            var v = metaFile.read();
            metaFile.close();
            return v || "";
        } catch (e) {
            return "";
        }
    }

    function generatePsdPreview(file, item) {
        var outFile = cachedPreviewFileFor(item);
        var metaFile = new File(outFile.fsName + ".meta");
        var srcToken = sourceMtimeToken(file) + "|v4";

        if (outFile.exists && readCacheMeta(metaFile) === srcToken) {
            return outFile;
        }

        var originalDoc = app.activeDocument;
        var src = null;
        var dup = null;

        try {
            src = app.open(file);
            dup = src.duplicate(item.name + "_preview", true);
            src.close(SaveOptions.DONOTSAVECHANGES);
            src = null;

            app.activeDocument = dup;
            dup.flatten();

            var originalUnits = app.preferences.rulerUnits;
            app.preferences.rulerUnits = Units.PIXELS;

            var target = 240;
            var w = dup.width.as("px");
            var h = dup.height.as("px");
            var ratio = w > h ? (target / w) : (target / h);
            if (ratio <= 0) ratio = 1;

            var resizedW = Math.max(1, Math.round(w * ratio));
            var resizedH = Math.max(1, Math.round(h * ratio));
            dup.resizeImage(UnitValue(resizedW, "px"), UnitValue(resizedH, "px"), null, ResampleMethod.BICUBIC);
            dup.resizeCanvas(UnitValue(target, "px"), UnitValue(target, "px"), AnchorPosition.MIDDLECENTER);

            app.preferences.rulerUnits = originalUnits;

            var pngOptions = new PNGSaveOptions();
            dup.saveAs(outFile, pngOptions, true);
            dup.close(SaveOptions.DONOTSAVECHANGES);
            dup = null;

            metaFile.encoding = "UTF8";
            metaFile.open("w");
            metaFile.write(srcToken);
            metaFile.close();
        } catch (e) {
            try { if (src) src.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
            try { if (dup) dup.close(SaveOptions.DONOTSAVECHANGES); } catch (e3) {}
            throw e;
        } finally {
            try { app.activeDocument = originalDoc; } catch (e4) {}
        }

        return outFile;
    }

    function refreshPreviewPane() {
        var item = listSelectionItem();
        if (!item || !state.sourceFolder) {
            previewImage.image = null;
            previewLabel.text = "Select an asset";
            return;
        }

        var file = new File(state.sourceFolder.fsName + "/" + item.path);
        if (!file.exists) {
            previewImage.image = null;
            previewLabel.text = "Missing file";
            return;
        }

        try {
            if (isPreviewableImage(file.name)) {
                setPreviewImageFromFile(file);
                return;
            }

            if (isPsd(file.name)) {
                var cached = generatePsdPreview(file, item);
                setPreviewImageFromFile(cached);
                return;
            }

            previewImage.image = null;
            previewLabel.text = "No thumbnail for this type";
        } catch (e) {
            previewImage.image = null;
            previewLabel.text = "Preview error";
        }
    }

    function refreshCategoryDropdown() {
        categoryDropdown.removeAll();
        categoryDropdown.add("item", "all");

        var cats = {};
        for (var i = 0; i < state.items.length; i++) {
            cats[state.items[i].category || "default"] = true;
        }

        var names = [];
        for (var k in cats) names.push(k);
        names.sort();

        for (var j = 0; j < names.length; j++) {
            categoryDropdown.add("item", names[j]);
        }

        var found = false;
        for (var n = 0; n < categoryDropdown.items.length; n++) {
            if (categoryDropdown.items[n].text === state.selectedCategory) {
                categoryDropdown.selection = n;
                found = true;
                break;
            }
        }
        if (!found) {
            state.selectedCategory = "all";
            categoryDropdown.selection = 0;
        }
    }

    function refreshList() {
        list.removeAll();
        if (!state.sourceFolder) return setStatus("Choose source folder first.");

        var q = (searchInput.text || "").toLowerCase();
        state.filteredItems = [];

        for (var i = 0; i < state.items.length; i++) {
            var item = state.items[i];
            var categoryOk = state.selectedCategory === "all" || item.category === state.selectedCategory;
            var queryOk = !q || item.name.toLowerCase().indexOf(q) !== -1 || item.path.toLowerCase().indexOf(q) !== -1;
            if (categoryOk && queryOk) {
                state.filteredItems.push(item);
                list.add("item", item.name + " (" + item.path + ")");
            }
        }

        if (state.filteredItems.length) {
            list.selection = 0;
        }
        refreshPreviewPane();
        setStatus(state.filteredItems.length ? (state.filteredItems.length + " item(s) visible.") : "No matching assets.");
    }

    function getSelectedItem() {
        if (!state.sourceFolder) throw new Error("Choose source folder first.");
        if (!list.selection) throw new Error("Select an asset.");
        return state.filteredItems[list.selection.index];
    }

    function removePreviewLayersRecursive(parent) {
        for (var i = parent.layers.length - 1; i >= 0; i--) {
            var lyr = parent.layers[i];
            if (lyr.typename === "LayerSet") {
                removePreviewLayersRecursive(lyr);
                if (lyr.name && lyr.name.indexOf(PREVIEW_LAYER_PREFIX) === 0) lyr.remove();
            } else if (lyr.name && lyr.name.indexOf(PREVIEW_LAYER_PREFIX) === 0) {
                lyr.remove();
            }
        }
    }

    function clearPreviewLayer() {
        try { removePreviewLayersRecursive(app.activeDocument); } catch (e) {}
        state.activePreview = null;
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

        if (!isPsd(item.fileName)) {
            var original = app.preferences.rulerUnits;
            app.preferences.rulerUnits = Units.PIXELS;
            var b = layer.bounds;
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
            app.preferences.rulerUnits = original;
        }

        if (previewOnly) {
            layer.opacity = 45;
            layer.name = PREVIEW_LAYER_PREFIX + " " + item.name;
            state.activePreview = { name: item.name, path: item.path };
        }
    }

    function finalizePreviewIfMatching(item) {
        if (!state.activePreview || state.activePreview.path !== item.path) return false;
        var doc = app.activeDocument;
        for (var i = 0; i < doc.layers.length; i++) {
            var lyr = doc.layers[i];
            if (lyr.name && lyr.name.indexOf(PREVIEW_LAYER_PREFIX + " " + item.name) === 0) {
                lyr.opacity = 100;
                lyr.name = item.name;
                state.activePreview = null;
                return true;
            }
        }
        return false;
    }

    function loadFolderByPath(path) {
        var folder = new Folder(path);
        if (!folder.exists) return false;
        state.sourceFolder = folder;
        state.items = [];
        scanFolder(folder, "", null, 0, state.items);
        refreshCategoryDropdown();
        refreshList();
        setStatus("Loaded " + state.items.length + " assets from saved folder.");
        return true;
    }

    var w = new Window("dialog", "KIT UV Library (Folder-based)");
    w.orientation = "column";
    w.alignChildren = ["fill", "top"];

    var chooseBtn = w.add("button", undefined, "Choose Source Folder");

    var searchGroup = w.add("group");
    searchGroup.add("statictext", undefined, "Search:");
    var searchInput = searchGroup.add("edittext", undefined, "");
    searchInput.characters = 28;
    searchGroup.add("statictext", undefined, "Folder:");
    var categoryDropdown = searchGroup.add("dropdownlist", undefined, []);
    categoryDropdown.preferredSize = [160, 24];

    var body = w.add("group");
    body.orientation = "row";

    var list = body.add("listbox", undefined, [], { multiselect: false });
    list.preferredSize = [520, 320];

    var previewPanel = body.add("panel", undefined, "Thumbnail");
    previewPanel.orientation = "column";
    previewPanel.alignChildren = ["center", "top"];
    previewPanel.preferredSize = [280, 340];
    var previewImage = previewPanel.add("image", undefined, undefined);
    previewImage.preferredSize = [240, 240];
    var previewLabel = previewPanel.add("statictext", undefined, "Select an asset", { multiline: true });
    previewLabel.preferredSize = [240, 70];

    var actions = w.add("group");
    var previewBtn = actions.add("button", undefined, "Preview On Document");
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
        refreshCategoryDropdown();
        refreshList();
        saveLastFolderPath(folder.fsName);
        setStatus("Loaded " + state.items.length + " assets.");
    };

    searchInput.onChanging = refreshList;

    categoryDropdown.onChange = function () {
        state.selectedCategory = categoryDropdown.selection ? categoryDropdown.selection.text : "all";
        refreshList();
    };

    list.onChange = function () {
        refreshPreviewPane();
    };

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
            var item = getSelectedItem();
            if (!finalizePreviewIfMatching(item)) {
                clearPreviewLayer();
                placeInternal(item, false);
            }
            setStatus("Placed " + item.name + ".");
        } catch (e) {
            setStatus("Error: " + e.message);
        }
    };

    closeBtn.onClick = function () { w.close(); };
    w.onClose = function () { clearPreviewLayer(); return true; };

    var saved = loadLastFolderPath();
    if (saved) {
        loadFolderByPath(saved);
    }

    w.center();
    w.show();
})();
