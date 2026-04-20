// Persiste recetas en localStorage y refresca datos derivados.

function saveLocal() {
    localStorage.setItem(LS, JSON.stringify(recipes));
}

// Envia una receta al Sheet sin bloquear el guardado local.
async function pushSave(r) {
    if (!sheetUrl) return;

    r.updatedAt = r.updatedAt || Date.now();
    setSync("spin", "Guardando...");
    try {
        await fetch(sheetUrl, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "save", recipe: r }),
        });
        setSync("ok", "Guardado ✓");
    } catch (e) {
        console.error("pushSave error:", e);
        setSync("err", "Error al guardar");
        toast("⚠️ No se pudo guardar en el sheet", "error");
    }
}

// Borra una receta del Sheet cuando hay sincronizacion activa.
async function pushDelete(id) {
    if (!sheetUrl) return;
    try {
        await fetch(sheetUrl, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", id }),
        });
    } catch {}
}

// Trae recetas del Sheet y las fusiona con los datos locales.
async function loadSheet() {
    if (!sheetUrl) return;
    setSync("spin", "Sincronizando...");
    try {
        const res = await fetch(sheetUrl);
        const data = await res.json();
        if (!data.ok) throw new Error("Sheet respondió ok:false");

        const sheetRecipes = data.data || [];
        const local = JSON.parse(localStorage.getItem(LS) || "[]");

        const sheetMap = {};
        sheetRecipes.forEach((r) => (sheetMap[r.id] = r));
        const localMap = {};
        local.forEach((r) => (localMap[r.id] = r));

        const allIds = new Set([
            ...Object.keys(sheetMap),
            ...Object.keys(localMap),
        ]);
        const merged = [];
        const localOnly = [];

        allIds.forEach((id) => {
            const sr = sheetMap[id];
            const lr = localMap[id];
            if (sr && lr) {
                merged.push(
                    (lr.updatedAt || 0) > (sr.updatedAt || 0) ? lr : sr,
                );
            } else if (sr) {
                merged.push(sr);
            } else {
                merged.push(lr);
                localOnly.push(lr);
            }
        });

        merged.forEach((r, i) => {
            if (r.order === undefined) r.order = i;
        });
        recipes = merged;
        localStorage.setItem(LS, JSON.stringify(recipes));
        setSync("ok", "Conectado ✓");
        markBannerOk();
        renderGrid();
        toast("✅ " + recipes.length + " recetas cargadas", "success");

        for (const r of localOnly) await pushSave(r);
    } catch (e) {
        console.error("loadSheet error:", e);

        const local = JSON.parse(localStorage.getItem(LS) || "[]");
        if (local.length) {
            recipes = local;
            renderGrid();
            setSync("err", "Sin conexión — mostrando datos locales");
            toast("⚠️ Sheet no disponible, usando datos locales", "error");
        } else {
            setSync("err", "Error de conexión");
            toast("❌ No se pudo conectar y no hay datos locales", "error");
        }
    }
}

// Guarda la URL del Apps Script y lanza la primera carga remota.
async function connectSheet() {
    const url = document.getElementById("sheetUrlInput").value.trim();
    if (!url) {
        toast("⚠️ Pegá la URL primero");
        return;
    }
    sheetUrl = url;
    localStorage.setItem(LSU, url);
    await loadSheet();
}
