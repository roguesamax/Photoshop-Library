#target photoshop
app.bringToFront();

(function () {
    if (!app.documents.length) {
        alert("Open your target PSD before running this script.");
        return;
    }

    var state = {
        library: null,
        assetsFolder: null,
        filteredItems: []
    };

    function asNumber(value, fallback) {
        var n = Number(value);
        return isNaN(n) ? fallback : n;
    }

    function validateLibrary(data) {
        if (!data || !data.items || !(data.items instanceof Array)) {
            throw new Error("Library JSON must contain an items array.");
        }

        for (var i = 0; i < data.items.length; i++) {
            var item = data.items[i];
            var fields = ["name", "path", "x", "y", "width", "height"];
            for (var f = 0; f < fields.length; f++) {
                var key = fields[f];
                if (item[key] === undefined || item[key] === null) {
                    throw new Error("Item " + (i + 1) + " missing field: " + key);
                }
            }
        }
    }

    function readJsonFile(file) {
        file.encoding = "UTF8";
        if (!file.open("r")) {
            throw new Error("Unable to open JSON file.");
        }
        var raw = file.read();
        file.close();
        var data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            throw new Error("Invalid JSON: " + e.message);
        }
        validateLibrary(data);
        return data;
    }

    function getDocSizePx(doc) {
        var original = app.preferences.rulerUnits;
        app.preferences.rulerUnits = Units.PIXELS;
        var out = {
            width: doc.width.as("px"),
            height: doc.height.as("px")
        };
        app.preferences.rulerUnits = original;
        return out;
    }

    function setStatus(text) {
        statusText.text = text;
    }

    function refreshList() {
        list.removeAll();

        if (!state.library) {
            setStatus("Load a library JSON first.");
            return;
        }

        var q = (searchInput.text || "").toLowerCase();
        state.filteredItems = [];

        for (var i = 0; i < state.library.items.length; i++) {
            var item = state.library.items[i];
            if (!q || item.name.toLowerCase().indexOf(q) !== -1 || item.path.toLowerCase().indexOf(q) !== -1) {
                state.filteredItems.push(item);
                list.add("item", item.name + "  [" + item.path + "]");
            }
        }

        if (!state.filteredItems.length) {
            setStatus("No matching assets.");
        } else {
            setStatus("Ready. " + state.filteredItems.length + " item(s) visible.");
        }
    }

    function placeItem(item) {
        if (!state.assetsFolder) {
            throw new Error("Select assets folder first.");
        }

        var targetDoc = app.activeDocument;
        var docSize = getDocSizePx(targetDoc);
        var ref = state.library.referenceDocument || docSize;

        var scaleX = docSize.width / asNumber(ref.width, docSize.width);
        var scaleY = docSize.height / asNumber(ref.height, docSize.height);

        var x = asNumber(item.x, 0) * scaleX;
        var y = asNumber(item.y, 0) * scaleY;
        var w = asNumber(item.width, 0) * scaleX;
        var h = asNumber(item.height, 0) * scaleY;

        var file = new File(state.assetsFolder.fsName + "/" + item.path);
        if (!file.exists) {
            throw new Error("Asset not found: " + file.fsName);
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
            throw new Error("Invalid layer bounds for: " + item.name);
        }

        var resizeX = (w / currentW) * 100;
        var resizeY = (h / currentH) * 100;
        layer.resize(resizeX, resizeY, AnchorPosition.TOPLEFT);

        b = layer.bounds;
        var left = b[0].as("px");
        var top = b[1].as("px");
        var dx = x - left;
        var dy = y - top;
        layer.translate(UnitValue(dx, "px"), UnitValue(dy, "px"));

        app.preferences.rulerUnits = original;
    }

    var w = new Window("dialog", "KIT UV Library (No Adobe Login)");
    w.orientation = "column";
    w.alignChildren = ["fill", "top"];

    var loadBtn = w.add("button", undefined, "Load Library JSON");
    var assetsBtn = w.add("button", undefined, "Choose Assets Folder");

    var searchGroup = w.add("group");
    searchGroup.orientation = "row";
    searchGroup.alignChildren = ["fill", "center"];
    searchGroup.add("statictext", undefined, "Search:");
    var searchInput = searchGroup.add("edittext", undefined, "");
    searchInput.characters = 36;

    var list = w.add("listbox", undefined, [], { multiselect: false });
    list.preferredSize = [560, 260];

    var placeBtn = w.add("button", undefined, "Place Selected");
    var statusText = w.add("statictext", undefined, "Load a library to start.");

    loadBtn.onClick = function () {
        try {
            var file = File.openDialog("Choose library JSON", "*.json");
            if (!file) return;
            state.library = readJsonFile(file);
            refreshList();
            setStatus("Loaded " + (state.library.name || file.name) + " with " + state.library.items.length + " items.");
        } catch (e) {
            setStatus("Error: " + e.message);
        }
    };

    assetsBtn.onClick = function () {
        var folder = Folder.selectDialog("Choose assets folder");
        if (!folder) return;
        state.assetsFolder = folder;
        setStatus("Assets folder: " + folder.fsName);
    };

    searchInput.onChanging = refreshList;

    placeBtn.onClick = function () {
        try {
            if (!state.library) {
                throw new Error("Load a library first.");
            }
            if (!list.selection) {
                throw new Error("Select an item from the list.");
            }
            var item = state.filteredItems[list.selection.index];
            placeItem(item);
            setStatus("Placed: " + item.name);
        } catch (e) {
            setStatus("Error: " + e.message);
        }
    };

    w.center();
    w.show();
})();
