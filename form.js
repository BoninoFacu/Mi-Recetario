// JS: formulario de recetas, ingredientes, pasos, tags e imagen.
// Abre el modal para crear una receta nueva.
function openAdd() {
    editId = null;
    curStars = 0;
    curTags = [];
    document.getElementById("formTitle").textContent = "Nueva receta";
    ["fName", "fTime", "fPort", "fNotes", "fPhoto", "fOrigin"].forEach(
        (id) => (document.getElementById(id).value = ""),
    );
    document.getElementById("fCatF").value = "Desayuno";
    document.getElementById("fDiff").value = "Fácil";
    document.getElementById("imgPrev").innerHTML = "🍽️";
    document.getElementById("ingList").innerHTML = "";
    document.getElementById("stepList").innerHTML = "";
    renderTagChips();
    updateStars();
    addIngRow();
    addIngRow();
    addIngRow();
    addStepRow();
    open2("formOv");
    const draft = JSON.parse(localStorage.getItem(LSD) || "null");

    if (draft) {
        document.getElementById("fName").value = draft.name || "";
        document.getElementById("fTime").value = draft.time || "";
        document.getElementById("fPort").value = draft.portions || "";
        document.getElementById("fNotes").value = draft.notes || "";
        document.getElementById("fPhoto").value = draft.photo || "";
        document.getElementById("fOrigin").value = draft.origin || "";
        document.getElementById("fCatF").value = draft.category || "Desayuno";
        document.getElementById("fDiff").value = draft.difficulty || "Fácil";

        curStars = draft.stars || 0;
        curTags = draft.tags || [];

        updateStars();
        renderTagChips();
        previewImg();
    }
    formDirty = false;
}

// Carga una receta existente dentro del formulario de edicion.

function openEdit(id) {
    const r = recipes.find((x) => x.id === id);
    if (!r) return;
    editId = id;
    curStars = r.stars || 0;
    curTags = [...(r.tags || [])];
    document.getElementById("formTitle").textContent = "Editar receta";
    document.getElementById("fName").value = r.name;
    document.getElementById("fTime").value = r.time || "";
    document.getElementById("fPort").value = r.portions || "";
    document.getElementById("fNotes").value = r.notes || "";
    document.getElementById("fPhoto").value = r.photo || "";
    document.getElementById("fOrigin").value = r.origin || "";
    document.getElementById("fCatF").value = r.category || "Otro";
    document.getElementById("fDiff").value = r.difficulty || "Media";
    document.getElementById("ingList").innerHTML = "";
    (r.ingredients || []).forEach((i) => addIngRow(i.qty, i.unit, i.name));
    if (!(r.ingredients || []).length) addIngRow();
    document.getElementById("stepList").innerHTML = "";
    normalizeSteps(r.steps).forEach((s) => addStepRow(s.text, s.timer));
    if (!(r.steps || []).length) addStepRow();
    renderTagChips();
    previewImg();
    updateStars();
    open2("formOv");
    formDirty = false;
}

// JS: guardado local, sincronizacion remota y borrado de recetas.
// Valida el formulario, arma el objeto receta y lo guarda.
async function saveRecipe() {
    const name = document.getElementById("fName").value.trim();
    if (!name) {
        toast("⚠️ El nombre es obligatorio");
        return;
    }
    const ingRows = document.querySelectorAll("#ingList .ingrow");
    const ingredients = [];
    ingRows.forEach((r) => {
        const ins = r.querySelectorAll("input");
        const n = ins[2].value.trim();
        if (n)
            ingredients.push({
                qty: parseFloat(ins[0].value) || "",
                unit: ins[1].value.trim(),
                name: n,
            });
    });
    const stepRows = document.querySelectorAll("#stepList .steprow");
    const steps = [];
    stepRows.forEach((r) => {
        const ta = r.querySelector("textarea"),
            ti = r.querySelector("input[type=number]");
        const txt = ta ? ta.value.trim() : "";
        if (txt) {
            txt.split("\n")
                .map((t) => t.trim())
                .filter(Boolean)
                .forEach((t) => {
                    steps.push({
                        text: t,
                        timer: parseInt(ti && ti.value) || 0,
                    });
                });
        }
    });
    const tagInput = document.getElementById("tagInput").value.trim();

    if (tagInput) {
        curTags.push(tagInput.toLowerCase());
    }
    const existing = editId ? recipes.find((x) => x.id === editId) : {};
    console.log("curTags antes de guardar:", curTags);
    const recipe = {
        id: editId || uid(),
        name,
        category: document.getElementById("fCatF").value,
        time: parseInt(document.getElementById("fTime").value) || 0,
        portions: parseInt(document.getElementById("fPort").value) || 4,
        difficulty: document.getElementById("fDiff").value,
        stars: curStars,
        photo: document.getElementById("fPhoto").value.trim(),
        origin: document.getElementById("fOrigin").value.trim(),
        tags: [
            ...new Set(
                (curTags || [])
                    .map((t) => t.toLowerCase().trim())
                    .filter(Boolean),
            ),
        ],
        ingredients,
        steps,
        notes: document.getElementById("fNotes").value.trim(),
        favorite: existing.favorite || false,
        cookHistory: existing.cookHistory || [],
        updatedAt: Date.now(),
    };
    if (editId) {
        recipes[recipes.findIndex((r) => r.id === editId)] = recipe;
        toast("✅ Receta actualizada", "success");
    } else {
        recipes.push(recipe);
        toast("✅ Receta guardada", "success");
    }
    saveLocal();

    formDirty = false;

    close2("formOv");

    document.getElementById("tagInput").value = "";
    curTags = [];

    renderGrid();
    await pushSave(recipe);
    localStorage.removeItem(LSD);
}

// Agrega una fila editable de ingrediente con drag and drop.
function addIngRow(qty = "", unit = "", name = "") {
    const d = document.createElement("div");
    d.className = "ingrow";
    d.draggable = true;
    d.innerHTML = `<span class="drag-handle" title="Arrastrar">⠿</span>
                <input type="number" class="qty" placeholder="Cant." value="${qty}" min="0" step="any">
                <input type="text" class="unit" placeholder="Unidad" value="${unit}">
                <input type="text" placeholder="Ingrediente *" value="${name}">
                <button class="rmbtn" onclick="this.parentElement.remove()">✕</button>`;
    d.addEventListener("dragstart", (e) => {
        dragSrc = d;
        e.dataTransfer.effectAllowed = "move";
    });
    d.addEventListener("dragover", (e) => {
        e.preventDefault();
        d.classList.add("drag-over");
    });
    d.addEventListener("dragleave", () => d.classList.remove("drag-over"));
    d.addEventListener("drop", (e) => {
        e.preventDefault();
        d.classList.remove("drag-over");
        if (dragSrc && dragSrc !== d) {
            const p = d.parentNode;
            const items = [...p.children];
            const si = items.indexOf(dragSrc),
                di = items.indexOf(d);
            if (si < di) p.insertBefore(dragSrc, d.nextSibling);
            else p.insertBefore(dragSrc, d);
        }
    });
    document.getElementById("ingList").appendChild(d);
}

// Agrega una fila editable de paso con timer opcional.
function addStepRow(text = "", timer = "") {
    stepCounter++;
    const d = document.createElement("div");
    d.className = "steprow";
    d.draggable = true;
    d.innerHTML = `<span class="drag-handle">⠿</span>
                <div style="flex:1">
                  <textarea placeholder="Describe este paso..." style="width:100%;min-height:56px;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:'Inter',sans-serif;font-size:.87rem;color:var(--tx);background:var(--bg);outline:none;resize:vertical">${text}</textarea>
                  <div class="step-time-wrap">
                    <input type="number" placeholder="0" value="${timer}" min="0" style="max-width:68px;padding:5px 9px;border:1.5px solid var(--border);border-radius:7px;font-family:'Inter',sans-serif;font-size:.82rem;color:var(--tx);background:var(--bg);outline:none">
                    <label>min de timer</label>
                  </div>
                </div>
                <button class="rmbtn" style="margin-top:8px" onclick="this.parentElement.remove();reindexSteps()">✕</button>`;
    d.addEventListener("dragstart", (e) => {
        dragStepSrc = d;
        e.dataTransfer.effectAllowed = "move";
    });
    d.addEventListener("dragover", (e) => {
        e.preventDefault();
        d.classList.add("drag-over");
    });
    d.addEventListener("dragleave", () => d.classList.remove("drag-over"));
    d.addEventListener("drop", (e) => {
        e.preventDefault();
        d.classList.remove("drag-over");
        if (dragStepSrc && dragStepSrc !== d) {
            const p = d.parentNode;
            const items = [...p.children];
            const si = items.indexOf(dragStepSrc),
                di = items.indexOf(d);
            if (si < di) p.insertBefore(dragStepSrc, d.nextSibling);
            else p.insertBefore(dragStepSrc, d);
        }
    });
    document.getElementById("stepList").appendChild(d);
}
