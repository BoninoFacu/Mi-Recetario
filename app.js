// JS: estado global y claves de localStorage.
const LS = "recetario_v4";
const LSD = "recetario_draft";
const LSU = "recetario_url";
let recipes = JSON.parse(localStorage.getItem(LS) || "[]");
recipes.forEach((r, i) => {
    if (r.order === undefined) r.order = i;
});
let selectedRecipes = [];
let formDirty = false;
let dragId = null;
let sheetUrl = localStorage.getItem(LSU) || "";
let editId = null;
let curStars = 0;
let curTags = [];
let vPort = 1;
let vId = null;
let shopChk = {};
let shopRecipeFilter = [];
let cmStepIdx = 0;
let cmRecipe = null;
let timers = {};
let cookFilter = "";

// JS: Apps Script que el usuario copia en Google Sheets para sincronizar recetas.
const SCRIPT = `


// Apps Script: obtiene o crea la hoja Recetas.

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Recetas");
  if (!sheet) {
    sheet = ss.insertSheet("Recetas");
    sheet.getRange(1,1,1,11).setValues([[
      "ID","JSON","Nombre","Categoría","⭐","⏱ Min","👥 Porciones","🏷️ Etiquetas","❤️ Fav","🍳 Cocinada","🕐 Actualizado"
    ]]);
    sheet.setFrozenRows(1);
    sheet.getRange("A:B").setHorizontalAlignment("left");
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 60);
    sheet.hideColumns(2);
  }
  return sheet;
}

// Apps Script: convierte una receta en la fila visible de la planilla.

function humanRow(r) {
  return [
    r.id,
    JSON.stringify(r),
    r.name || "",
    r.category || "",
    r.stars || 0,
    r.time || 0,
    r.portions || 4,
    (r.tags || []).join(", "),
    r.favorite ? "❤️" : "",
    (r.cookHistory || []).length,
    r.updatedAt ? new Date(r.updatedAt).toLocaleString("es-AR") : ""
  ];
}

// Apps Script: devuelve todas las recetas al HTML.

function doGet(e) {
  var sheet = getSheet();
  var rows = sheet.getDataRange().getValues();
  var data = [];
  for (var i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    try { data.push(JSON.parse(rows[i][1])); } catch(ex) {}
  }
  return ContentService
    .createTextOutput(JSON.stringify({ok: true, data: data}))
    .setMimeType(ContentService.MimeType.JSON);
}

// Apps Script: guarda o borra recetas segun la accion recibida.

function doPost(e) {
  var sheet = getSheet();
  var params = JSON.parse(e.postData.contents);

  if (params.action === "save") {
    var recipe = params.recipe;
    recipe.tags = recipe.tags || [];
    recipe.favorite = recipe.favorite || false;
    recipe.cookHistory = recipe.cookHistory || [];

    var rows = sheet.getDataRange().getValues();
    var found = false;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === recipe.id) {
        sheet.getRange(i+1, 1, 1, 11).setValues([humanRow(recipe)]);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow(humanRow(recipe));
    }
    return ContentService.createTextOutput(JSON.stringify({ok: true}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (params.action === "delete") {
    var rows = sheet.getDataRange().getValues();
    for (var i = rows.length - 1; i >= 1; i--) {
      if (rows[i][0] === params.id) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ok: true}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ok: false, error: "Unknown action"}))
    .setMimeType(ContentService.MimeType.JSON);
}`;
document.getElementById("scriptBox").textContent = SCRIPT;

// JS: sincronizacion con Google Sheets.
// Actualiza el indicador visual de sincronizacion.
function setSync(state, txt) {
    document.getElementById("syncDot").className = "dot " + state;
    document.getElementById("syncTxt").textContent = txt;
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

// Marca el banner como conectado y oculta la configuracion inicial.
function markBannerOk() {
    const b = document.getElementById("setupBanner");
    b.classList.add("banner-ok");
    b.innerHTML = `<span>✅ Conectado a Google Sheets — tus recetas se sincronizan automáticamente</span>
                <button class="ban-btn" onclick="disconnectSheet()">Desconectar</button>
                <a href="#" onclick="showHelp();return false" style="color:rgba(255,255,255,.7);font-size:.81rem">Instrucciones</a>`;
}
// Desconecta Google Sheets y vuelve a modo local.
function disconnectSheet() {
    sheetUrl = "";
    localStorage.removeItem(LSU);
    location.reload();
}

// Marca o desmarca una receta como cocinada desde la tarjeta.

function toggleCooked(id) {
    const r = recipes.find((x) => x.id === id);
    if (!r) return;

    r.cooked = !r.cooked;

    saveLocal();
    renderGrid();

    toast(r.cooked ? "✔ Marcada como cocinada" : "❌ Desmarcada");
}

let dragSrc = null;

let dragStepSrc = null;
let stepCounter = 0;

// Hook reservado para renumerar pasos si se agregan indices visibles.
function reindexSteps() {}

// Convierte Enter o coma en una etiqueta nueva.

function handleTagKey(e) {
    if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const v = e.target.value.trim().replace(/,/g, "");
        if (v && !curTags.includes(v)) {
            curTags.push(v);
            renderTagChips();
        }
        e.target.value = "";
    }
}
// Quita una etiqueta del formulario actual.
function removeTag(t) {
    curTags = curTags.filter((x) => x !== t);
    renderTagChips();
}
// Pinta las etiquetas elegidas como chips dentro del formulario.
function renderTagChips() {
    const wrap = document.getElementById("tagsWrap");
    const input = document.getElementById("tagInput");
    wrap.innerHTML = "";
    curTags.forEach((t) => {
        const chip = document.createElement("span");
        chip.className = "tag-chip";
        chip.innerHTML = `${t}<button onclick="removeTag('${t}')">×</button>`;
        wrap.appendChild(chip);
    });
    wrap.appendChild(input);
}

// Actualiza la calificacion temporal del formulario.

function setStar(n) {
    curStars = n;
    updateStars();
}
// Refresca el estado visual de las estrellas.
function updateStars() {
    document
        .querySelectorAll("#starRow span")
        .forEach((s, i) => s.classList.toggle("on", i < curStars));
}
// Muestra u oculta la previsualizacion de foto por URL.
function previewImg() {
    const url = document.getElementById("fPhoto").value.trim();
    document.getElementById("imgPrev").innerHTML = url
        ? `<img src="${url}" alt="" onerror="this.parentElement.innerHTML='🖼️'">`
        : "🍽️";
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

// Confirma y elimina una receta local y remota usando modal custom.
async function delRecipe(id) {
    confirmDelete("¿Eliminar esta receta?", async () => {
        recipes = recipes.filter((r) => r.id !== id);
        saveLocal();
        renderGrid();
        toast("🗑️ Receta eliminada");
        s;
        await pushDelete(id);
    });
}

// JS: vista de detalle, porciones, favoritos e historial de coccion.
// Abre el modal de detalle de una receta.
function openView(id) {
    const r = recipes.find((x) => x.id === id);
    if (!r) return;
    vId = id;
    vPort = r.portions || 4;
    vActiveTab = getDefaultViewTab(r);
    document.getElementById("vTitle").textContent =
        catEmoji(r.category) + " " + r.name;
    renderView(r);
    open2("viewOv");
}

let vActiveTab = "info";
// Elige la primera pestana util al abrir el detalle.
function getDefaultViewTab(r) {
    const steps = normalizeSteps(r.steps || []);
    if ((r.ingredients || []).length) return "ing";
    if (steps.length) return "steps";
    if ((r.cookHistory || []).length) return "hist";
    return "info";
}

// Cambia la pestana activa del detalle.
function switchViewTab(tab) {
    vActiveTab = tab;
    document
        .querySelectorAll(".view-tab")
        .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document
        .querySelectorAll(".view-panel")
        .forEach((p) => p.classList.toggle("active", p.dataset.panel === tab));
}

// Ajusta porciones y recalcula cantidades visibles.

function chgPort(d) {
    const r = recipes.find((x) => x.id === vId);
    if (!r) return;
    vPort = Math.max(1, vPort + d);
    renderView(r);
}

// Alterna favorito y sincroniza el cambio.

function toggleFav(id) {
    const r = recipes.find((x) => x.id === id);
    if (!r) return;
    r.favorite = !r.favorite;
    r.updatedAt = Date.now();
    saveLocal();
    renderGrid();
    renderView(r);
    toast(r.favorite ? "❤️ Marcada como favorita" : "💔 Quitada de favoritas");
    pushSave(r);
}

// Agrega una entrada al historial de coccion.

function logCook(id, note = "") {
    const r = recipes.find((x) => x.id === id);
    if (!r) return;

    r.cookHistory = r.cookHistory || [];
    r.updatedAt = Date.now();

    r.cookHistory.push({
        date: Date.now(),
        note: note,
    });

    saveLocal();
    renderGrid();
    renderView(r);

    toast("✅ Cocción registrada");
    pushSave(r);
}

// JS: timers dentro de recetas y modo cocina.
// Inicia o detiene timers pequenos en la vista de receta.
function toggleTimer(recipeId, stepIdx, minutes) {
    const key = recipeId + "_" + stepIdx;
    const btn = document.getElementById("tbtn_" + recipeId + "_" + stepIdx);
    const disp = document.getElementById("tdisp_" + recipeId + "_" + stepIdx);
    if (timers[key]) {
        clearInterval(timers[key].interval);
        delete timers[key];
        btn.className = "timer-btn";
        btn.textContent = `⏱ ${minutes} min`;
        disp.textContent = "";
        return;
    }
    let secs = minutes * 60;
    btn.className = "timer-btn running";
    btn.textContent = "⏹ Detener";
    const tick = () => {
        if (secs <= 0) {
            clearInterval(timers[key].interval);
            delete timers[key];
            btn.className = "timer-btn";
            btn.textContent = `⏱ ${minutes} min`;
            disp.textContent = "";
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            toast("⏰ ¡Tiempo!");
            return;
        }
        const m = Math.floor(secs / 60),
            s = secs % 60;
        disp.textContent = `${m}:${s.toString().padStart(2, "0")}`;
        secs--;
    };
    tick();
    timers[key] = { interval: setInterval(tick, 1000) };
}

// JS: modo cocina de pantalla completa.
// Abre el modo cocina y recupera progreso si existe.
function startCookMode(id) {
    const r = recipes.find((x) => x.id === id);
    if (!r) return;
    cmRecipe = r;
    cmStepIdx = 0;
    document.getElementById("cmTitle").textContent = r.name;

    if (navigator.wakeLock)
        navigator.wakeLock.request("screen").catch(() => {});
    renderCookStep();
    document.getElementById("cookMode").classList.add("open");
    document.getElementById("cmBody").onclick = (e) => {
        if (e.target.tagName !== "BUTTON") {
            cmNav(1);
        }
    };
    document.body.style.overflow = "hidden";
    document.getElementById("cookMode").onclick = (e) => {
        if (e.target.tagName !== "BUTTON") {
            cmNav(1);
        }
    };
    const cmContainer = document.getElementById("cookMode");

    cmContainer.ontouchstart = (e) => {
        touchStartX = e.changedTouches[0].screenX;
    };

    cmContainer.ontouchend = (e) => {
        const diff = e.changedTouches[0].screenX - touchStartX;

        if (Math.abs(diff) < 30) return;

        if (diff > 50) cmNav(-1);
        if (diff < -50) cmNav(1);
    };
    const saved = JSON.parse(localStorage.getItem("cook_progress") || "null");

    if (saved && saved.id === id) {
        cmStepIdx = saved.step;
    }
}
// Cierra modo cocina y libera bloqueo de pantalla si aplica.
function closeCookMode() {
    document.body.style.overflow = "";
    document.getElementById("cookMode").classList.remove("open");
    cmRecipe = null;
}

// Pinta el paso actual del modo cocina.

function renderCookStep() {
    const r = cmRecipe;
    const steps = normalizeSteps(r.steps);
    const body = document.getElementById("cmBody");
    document.getElementById("cmStepIndicator").textContent = steps.length
        ? `Paso ${cmStepIdx + 1} de ${steps.length}`
        : "";
    const prevBtn = document.getElementById("cmPrevBtn");

    if (cmStepIdx === 0) {
        prevBtn.style.display = "none";
    } else {
        prevBtn.style.display = "inline-block";
    }
    document.getElementById("cmPrevBtn").disabled = cmStepIdx === 0;
    document.getElementById("cmNextBtn").textContent =
        cmStepIdx === steps.length - 1 ? "✅ Finalizar" : "Siguiente →";

    let html = "";

    if (cmStepIdx === 0 && (r.ingredients || []).length) {
        html += `<div class="cm-ings"><h3>Ingredientes</h3>
                  ${r.ingredients.map((i) => `<div class="cm-ing-item"><span style="color:var(--accent)">◆</span><span>${i.qty ? i.qty + " " : ""}${i.unit ? i.unit + " " : ""}<strong>${i.name}</strong></span></div>`).join("")}
                </div>`;
    }
    if (steps.length) {
        const s = steps[cmStepIdx];
        html += `<div class="cm-step fade-in">
                  <div class="cm-step-num">Paso ${cmStepIdx + 1}</div>
                  <div class="cm-step-text">${s.text}</div>
                  ${s.timer ? `<div class="cm-step-timer"><button class="timer-btn" id="cm_tbtn" onclick="cmToggleTimer(${s.timer})">⏱ ${s.timer} min</button><span class="timer-display" id="cm_tdisp"></span></div>` : ""}
                </div>`;
    } else {
        html += `<div class="cm-step fade-in"><div class="cm-step-text" style="font-style:normal;font-size:1.1rem;color:var(--tx3)">Esta receta no tiene pasos cargados.<br>¡Agregalos editando la receta!</div></div>`;
    }
    body.innerHTML = html;
}

let cmTimer = null;
// Controla el timer del paso actual en modo cocina.
function cmToggleTimer(minutes) {
    const btn = document.getElementById("cm_tbtn");
    const disp = document.getElementById("cm_tdisp");
    if (cmTimer) {
        clearInterval(cmTimer);
        cmTimer = null;
        btn.className = "timer-btn";
        btn.textContent = `⏱ ${minutes} min`;
        disp.textContent = "";
        return;
    }
    let secs = minutes * 60;
    btn.className = "timer-btn running";
    btn.textContent = "⏹ Detener";
    const tick = () => {
        if (secs <= 0) {
            clearInterval(cmTimer);
            cmTimer = null;
            btn.className = "timer-btn";
            btn.textContent = `⏱ ${minutes} min`;
            disp.textContent = "";
            toast("⏰ ¡Tiempo!");
            return;
        }
        const m = Math.floor(secs / 60),
            s = secs % 60;
        disp.textContent = `${m}:${s.toString().padStart(2, "0")}`;
        secs--;
    };
    tick();
    cmTimer = setInterval(tick, 1000);
}

// Avanza o retrocede en modo cocina y registra el final.

function cmNav(dir) {
    if (window._cmLock) return;
    window._cmLock = true;
    setTimeout(() => (window._cmLock = false), 200);
    const steps = normalizeSteps(cmRecipe.steps);
    if (cmTimer) {
        clearInterval(cmTimer);
        cmTimer = null;
    }
    if (dir === 1 && cmStepIdx >= steps.length - 1) {
        const note = prompt("📝 Observación de esta cocción (opcional):");

        logCook(cmRecipe.id, note || "");

        closeCookMode();
        toast("🎉 ¡Receta completada!");
        return;
    }
    cmStepIdx = Math.max(0, Math.min(steps.length - 1, cmStepIdx + dir));
    renderCookStep();
    cmStepIdx += dir;
    saveCookProgress();
}

// JS: lista de compras generada desde recetas seleccionadas.
// Abre la lista de compras y la recalcula.
function openPanel() {
    buildShop();
    document.getElementById("shopPanel").classList.add("open");
}
// Cierra el panel de compras.
function closePanel() {
    document.getElementById("shopPanel").classList.remove("open");
}

// JS: diccionario para agrupar ingredientes en la lista de compras.
const ingCategories = {
    lácteos: [
        "leche",
        "crema",
        "queso",
        "manteca",
        "mantequilla",
        "yogur",
        "ricota",
        "cheddar",
        "mozzarella",
    ],
    carnes: [
        "pollo",
        "carne",
        "cerdo",
        "ternera",
        "pescado",
        "atún",
        "salmón",
        "camarón",
        "jamón",
        "panceta",
    ],
    verduras: [
        "cebolla",
        "ajo",
        "tomate",
        "zanahoria",
        "papa",
        "zapallo",
        "espinaca",
        "lechuga",
        "apio",
        "pimiento",
        "puerro",
        "berenjena",
        "zucchini",
    ],
    frutas: [
        "manzana",
        "banana",
        "naranja",
        "limón",
        "frutilla",
        "pera",
        "durazno",
        "mango",
        "uva",
    ],
    almacén: [
        "harina",
        "azúcar",
        "sal",
        "aceite",
        "vinagre",
        "arroz",
        "pasta",
        "fideos",
        "lentejas",
        "garbanzos",
        "avena",
    ],
    especias: [
        "pimienta",
        "orégano",
        "comino",
        "pimentón",
        "canela",
        "nuez moscada",
        "curry",
        "tomillo",
        "romero",
        "albahaca",
    ],
    huevos: ["huevo", "huevos"],
};
// Detecta la categoria visual de un ingrediente.
function getIngCategory(name) {
    const n = name.toLowerCase();
    for (const [cat, words] of Object.entries(ingCategories)) {
        if (words.some((w) => n.includes(w))) return cat;
    }
    return "otros";
}

// Devuelve las recetas que alimentan la lista de compras actual.
function getShopRecipes() {
    const search = (
        document.getElementById("shopSearch")?.value || ""
    ).toLowerCase();
    const base = selectedRecipes.length
        ? recipes.filter((r) => selectedRecipes.includes(r.id))
        : recipes;

    if (!search) return base;
    return base.filter((r) => r.name.toLowerCase().includes(search));
}

// Agrupa ingredientes repetidos para mostrar y compartir una lista limpia.
function getShopItems(sourceRecipes) {
    const map = {};

    sourceRecipes.forEach((r) => {
        (r.ingredients || []).forEach((i) => {
            if (!i.name) return;

            const key = i.name.toLowerCase().replace(/s$/, "");

            if (!map[key]) {
                map[key] = {
                    name: i.name,
                    unit: i.unit || "",
                    qty: 0,
                };
            }

            const val = parseFloat(i.qty) || 0;
            map[key].qty += val;
        });
    });

    return Object.values(map).map((i) => ({
        ...i,
        ...normalizeUnit(i.qty, i.unit),
    }));
}

// Arma el encabezado del mensaje segun las recetas seleccionadas.
function getShopShareTitle(sourceRecipes) {
    const search = (document.getElementById("shopSearch")?.value || "").trim();
    const isAllRecipes = !selectedRecipes.length && !search;

    if (isAllRecipes) return "🛒 *Lista de compras - Todas las recetas*";
    if (sourceRecipes.length === 1)
        return `🛒 *Compras para ${sourceRecipes[0].name}*`;

    return [
        "🛒 *Compras para:*",
        ...sourceRecipes.map((r) => `• ${r.name}`),
    ].join("\n");
}

// Consolida ingredientes y renderiza la lista de compras.
function buildShop() {
    const filter = document.getElementById("shopFilter");
    const body = document.getElementById("panelBody");

    filter.innerHTML =
        `<button class="${selectedRecipes.length === 0 ? "active" : ""}" onclick="selectedRecipes=[];buildShop()">Todas</button>` +
        recipes
            .filter((r) => (r.ingredients || []).length)
            .map(
                (r) => `
        <button class="${selectedRecipes.includes(r.id) ? "active" : ""}"
          onclick="toggleShopSelect('${r.id}');buildShop()">
          ${r.name.slice(0, 14)}${r.name.length > 14 ? "…" : ""}
        </button>
      `,
            )
            .join("");

    const items = getShopItems(getShopRecipes());

    if (!items.length) {
        body.innerHTML = `<p style="color:var(--tx3);font-size:.87rem">No hay ingredientes.</p>`;
        return;
    }

    body.innerHTML = items
        .map(
            (i) => `
    <div class="sitem">
      <label style="flex:1">
        ${i.qty ? i.qty + " " : ""}
        ${i.unit ? i.unit + " " : ""}
        <strong>${i.name}</strong>
      </label>
    </div>
  `,
        )
        .join("");
}

// Aplica un conjunto de recetas como filtro de compras.

function shopSetFilter(arr) {
    shopRecipeFilter = arr;
}
// Activa o desactiva una receta del filtro de compras.
function shopToggleFilter(id) {
    if (shopRecipeFilter.includes(id))
        shopRecipeFilter = shopRecipeFilter.filter((x) => x !== id);
    else shopRecipeFilter.push(id);
}
// Marca un item de compra como hecho.
function togShop(k) {
    shopChk[k] = !shopChk[k];
    const el = document.getElementById("si_" + k);
    if (el) el.classList.toggle("done", shopChk[k]);
}
// Elimina de la vista los items ya marcados.
function clearDone() {
    Object.keys(shopChk).forEach((k) => {
        if (shopChk[k]) delete shopChk[k];
    });
    buildShop();
}

// Prepara la lista de compras para compartir por WhatsApp.

function exportShopWhatsApp() {
    const sourceRecipes = getShopRecipes();
    const items = getShopItems(sourceRecipes);

    if (!items.length) {
        toast("⚠️ No hay ingredientes para compartir");
        return;
    }

    let msg = getShopShareTitle(sourceRecipes) + "\n\n";

    items.forEach((i) => {
        msg += `• ${i.qty ? i.qty + " " : ""}${i.unit ? i.unit + " " : ""}${i.name}\n`;
    });

    window.open("https://wa.me/?text=" + encodeURIComponent(msg));
}

// JS: ayuda, copiado de Apps Script y manejo generico de overlays.
// Abre la ayuda de configuracion.
function showHelp() {
    open2("helpOv");
}
// Copia el Apps Script al portapapeles.
function copyScript() {
    navigator.clipboard
        .writeText(SCRIPT)
        .then(() => toast("📋 Script copiado"));
}

// Abre un overlay y configura cierre por gesto tactil.

function open2(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("open");

    if (id === "viewOv") {
        let ts = 0,
            ty = 0;
        const modal = el.querySelector(".modal");
        if (modal) {
            modal.ontouchstart = (e) => {
                ts = e.touches[0].clientY;
                ty = 0;
            };
            modal.ontouchmove = (e) => {
                ty = e.touches[0].clientY - ts;
            };
            modal.ontouchend = () => {
                if (ty > 80) close2("viewOv");
                ty = 0;
            };
        }
    }
}
// Cierra un overlay cuidando cambios sin guardar.
function close2(id) {
    if (id === "formOv" && formDirty) {
        const salir = confirm("Tenés cambios sin guardar. ¿Salir igual?");
        if (!salir) return;
    }

    document.getElementById(id).classList.remove("open");

    if (id === "formOv") {
        formDirty = false;
    }
}
// Cierra un overlay cuando el click cae fuera del modal.
function ovOut(e, id) {
    if (e.target === document.getElementById(id)) close2(id);
}

// JS: notificaciones tipo toast.
let _tt;
// Muestra un mensaje temporal en pantalla.
function toast(msg, type = "default") {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.style.background =
        type === "error"
            ? "var(--red)"
            : type === "success"
              ? "var(--green)"
              : "var(--tx)";
    t.classList.add("show");
    clearTimeout(_tt);
    _tt = setTimeout(() => t.classList.remove("show"), 2800);
}

// JS: impresion de una receta en una ventana limpia.
// Genera una vista imprimible de una receta.
function printRecipe(id) {
    const r = recipes.find((x) => x.id === id);
    if (!r) return;
    const steps = normalizeSteps(r.steps || []);
    const win = window.open("", "_blank");
    win.document
        .write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>${r.name}</title>
    <style>
        body{font-family:Georgia,serif;max-width:680px;margin:40px auto;padding:0 20px;color:#1e1209}
        h1{font-size:2rem;margin-bottom:6px}
        .meta{display:flex;gap:16px;font-size:.85rem;color:#7a5c45;margin-bottom:20px;flex-wrap:wrap}
        .stars{color:#c4903a}
        h2{font-size:1.1rem;border-bottom:2px solid #e2d5c5;padding-bottom:4px;margin:20px 0 12px}
        ul{list-style:none;padding:0}
        ul li{padding:6px 0;border-bottom:1px solid #f3ece0;font-size:.92rem}
        ul li::before{content:"◆ ";color:#c05228;font-size:.5rem;vertical-align:middle}
        ol{padding-left:20px}
        ol li{padding:8px 0;border-bottom:1px solid #f3ece0;font-size:.92rem;line-height:1.5}
        .notes{background:#f3ece0;border-radius:8px;padding:12px;font-size:.88rem;margin-top:16px}
        .origin{font-style:italic;color:#a8876e;font-size:.85rem}
        @media print{body{margin:20px}}
    </style></head><body>
    <h1>${r.name}</h1>
    ${r.origin ? `<div class="origin">📍 ${r.origin}</div>` : ""}
    <div class="meta">
        ${r.time ? `<span>⏱ ${r.time} min</span>` : ""}
        <span>👥 ${r.portions || 4} porciones</span>
        <span>🎯 ${r.difficulty || "Media"}</span>
        ${r.stars ? `<span class="stars">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}</span>` : ""}
    </div>
    ${(r.ingredients || []).length ? `<h2>Ingredientes</h2><ul>${r.ingredients.map((i) => `<li>${i.qty ? i.qty + " " : ""}${i.unit ? i.unit + " " : ""}<strong>${i.name}</strong></li>`).join("")}</ul>` : ""}
    ${steps.length ? `<h2>Preparación</h2><ol>${steps.map((s) => `<li>${s.text}${s.timer ? ` <em>(${s.timer} min)</em>` : ""}</li>`).join("")}</ol>` : ""}
    ${r.notes ? `<div class="notes">📝 ${r.notes}</div>` : ""}
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
}

// JS: atajos de teclado, borrador automatico y proteccion al salir.
document.addEventListener("keydown", (e) => {
    if (
        e.key === "/" &&
        document.activeElement.tagName !== "INPUT" &&
        document.activeElement.tagName !== "TEXTAREA"
    ) {
        e.preventDefault();
        const si = document.getElementById("searchInput");
        if (si) si.focus();
    }
    if (e.key === "Escape") {
        ["formOv", "viewOv", "helpOv"].forEach((id) => {
            const el = document.getElementById(id);
            if (el && el.classList.contains("open")) close2(id);
        });
        const cm = document.getElementById("cookMode");
        if (cm && cm.classList.contains("open")) closeCookMode();
    }

    if (
        e.key === "n" &&
        !e.ctrlKey &&
        !e.metaKey &&
        document.activeElement.tagName !== "INPUT" &&
        document.activeElement.tagName !== "TEXTAREA"
    ) {
        const anyOpen = ["formOv", "viewOv", "helpOv"].some((id) =>
            document.getElementById(id)?.classList.contains("open"),
        );
        if (!anyOpen) openAdd();
    }
});

document.addEventListener("input", (e) => {
    const form = document.getElementById("formOv");
    if (form && form.classList.contains("open") && !editId) {
        saveDraft();
    }
});

window.addEventListener("beforeunload", (e) => {
    if (recipes.length && sheetUrl) return;
    if (recipes.length && !sheetUrl) {
        e.preventDefault();
        e.returnValue = "";
    }
});

// JS: arranque de la app. Primero pinta local y despues sincroniza si hay URL guardada.
renderGrid();
if (sheetUrl) {
    document.getElementById("sheetUrlInput").value = sheetUrl;

    loadSheet();
}
// JS: reordenamiento de tarjetas por drag and drop.
let dragCardId = null;

// Inicia el arrastre de una tarjeta.

function dragCardStart(e, id) {
    dragId = id;
    e.dataTransfer.effectAllowed = "move";
}

// Permite soltar una tarjeta sobre otra.

function dragCardOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add("drag-over");
}

// Limpia el estado visual del destino de arrastre.

function dragCardLeave(e) {
    e.currentTarget.classList.remove("drag-over");
}

// Reordena recetas y guarda el nuevo orden.

function dropCard(e, targetId) {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");

    if (!dragId || dragId === targetId) return;

    const fromIndex = recipes.findIndex((r) => r.id === dragId);
    const toIndex = recipes.findIndex((r) => r.id === targetId);

    if (fromIndex === -1 || toIndex === -1) return;

    const moved = recipes.splice(fromIndex, 1)[0];
    recipes.splice(toIndex, 0, moved);

    recipes.forEach((r, i) => (r.order = i));

    saveLocal();
    renderGrid();

    recipes.forEach((r) => pushSave(r));
}
// JS: carga de imagenes, historial, borradores y filtros avanzados.
// Convierte una imagen local a base64 para guardarla en la receta.
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (evt) {
        const base64 = evt.target.result;

        document.getElementById("fPhoto").value = base64;

        document.getElementById("imgPrev").innerHTML =
            `<img src="${base64}" alt="">`;
    };

    reader.readAsDataURL(file);
}
// Borra todo el historial de la receta que se esta editando.
function clearHistory() {
    if (!editId) return;

    if (!confirm("¿Borrar todo el historial de cocción?")) return;

    const r = recipes.find((x) => x.id === editId);
    if (!r) return;

    r.cookHistory = [];

    saveLocal();

    pushSave(r);

    toast("🗑️ Historial eliminado");
}
// Borra una entrada puntual del historial.
function removeCook(id, idxFromView) {
    const r = recipes.find((x) => x.id === id);
    if (!r || !r.cookHistory) return;

    const realIndex = r.cookHistory.length - 1 - idxFromView;

    r.cookHistory.splice(realIndex, 1);

    saveLocal();
    renderView(r);
    renderGrid();
    pushSave(r);

    toast("🗑️ Registro eliminado");
}
// Agrega o quita una receta de la seleccion de compras.
function toggleShopSelect(id) {
    if (selectedRecipes.includes(id)) {
        selectedRecipes = selectedRecipes.filter((x) => x !== id);
    } else {
        selectedRecipes.push(id);
    }

    toast("🛒 " + selectedRecipes.length + " receta(s) seleccionadas");
}
// Guarda un borrador simple de receta nueva.
function saveDraft() {
    const draft = {
        name: document.getElementById("fName").value,
        time: document.getElementById("fTime").value,
        portions: document.getElementById("fPort").value,
        notes: document.getElementById("fNotes").value,
        photo: document.getElementById("fPhoto").value,
        origin: document.getElementById("fOrigin").value,
        category: document.getElementById("fCatF").value,
        difficulty: document.getElementById("fDiff").value,
        stars: curStars,
        tags: curTags,
    };

    localStorage.setItem(LSD, JSON.stringify(draft));
}
// Recuerda el paso actual del modo cocina.
function saveCookProgress() {
    localStorage.setItem(
        "cook_progress",
        JSON.stringify({
            id: cmRecipe?.id,
            step: cmStepIdx,
        }),
    );
}
// Reconstruye opciones de etiquetas para filtros.
function buildTagOptions() {
    const sel = document.getElementById("fTag");
    if (!sel) return;

    const tags = new Set();

    recipes.forEach((r) => {
        (r.tags || []).forEach((t) => {
            if (t) tags.add(t.toLowerCase());
        });
    });

    const sorted = [...tags].sort();

    sel.innerHTML =
        `<option value="">Todas las etiquetas</option>` +
        sorted.map((t) => `<option value="${t}">${t}</option>`).join("");
}

// Cambia el filtro de recetas cocinadas.

function setCookFilter(val, el) {
    cookFilter = val;

    document.querySelectorAll("#cookFilter .cf-btn").forEach((b) => {
        b.classList.remove("active");
    });

    el.classList.add("active");

    renderGrid();
}
// Abre o cierra el panel movil de filtros.
function toggleFilters() {
    const el = document.getElementById("filtersPanel");
    if (!el) return;

    if (!el.classList.contains("open")) {
        syncFilterPanel();
    }

    el.classList.toggle("open");
}
// Sincroniza controles ocultos con el panel visible de filtros.
function syncFilterPanel() {
    const cat = document.getElementById("fCat");
    const tag = document.getElementById("fTag");
    const fav = document.getElementById("fFav");

    const pCat = document.getElementById("panelCat");
    const pTag = document.getElementById("panelTag");
    const pFav = document.getElementById("panelFav");
    const pCook = document.getElementById("panelCook");

    if (cat && pCat) {
        pCat.innerHTML = cat.innerHTML;
        pCat.value = cat.value;
    }
    if (tag && pTag) {
        pTag.innerHTML = tag.innerHTML;
        pTag.value = tag.value;
    }
    if (fav && pFav) pFav.value = fav.value;
    if (pCook) pCook.value = cookFilter;
}
// Aplica filtros elegidos en el panel movil.
function applyPanelFilters() {
    const pCat = document.getElementById("panelCat");
    const pTag = document.getElementById("panelTag");
    const pCook = document.getElementById("panelCook");
    const pFav = document.getElementById("panelFav");

    const cat = document.getElementById("fCat");
    const tag = document.getElementById("fTag");
    const fav = document.getElementById("fFav");

    if (cat && pCat) cat.value = pCat.value;
    if (tag && pTag) tag.value = pTag.value;
    if (fav && pFav) fav.value = pFav.value;
    if (pCook) cookFilter = pCook.value;

    renderGrid();
    updateFilterCount();
}
// Restablece todos los filtros.
function clearFilters() {
    const ids = ["panelCat", "panelTag", "panelCook", "panelFav"];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    ["fCat", "fTag", "fStars", "fFav"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    cookFilter = "";
    renderGrid();
    updateFilterCount();
}
// Muestra cuantos filtros estan activos.
function updateFilterCount() {
    let count = 0;
    const getV = (id) => document.getElementById(id)?.value || "";
    if (getV("fCat")) count++;
    if (getV("fTag")) count++;
    if (getV("fStars")) count++;
    if (getV("fFav")) count++;
    if (cookFilter) count++;
    const el = document.getElementById("filterCount");
    if (!el) return;
    el.textContent = count ? ` (${count})` : "";

    const fb = el.closest("button");
    if (fb) fb.style.borderColor = count ? "var(--accent)" : "";
}

// JS: footer, boton de subir y detalles auxiliares del navegador.
// Actualiza cantidad total de recetas y recetas cocinadas.
function updateFooterStats() {
    const total = recipes.length;
    const cooked = recipes.filter((r) => r && r.cooked === true).length;
    const el = document.getElementById("footerStats");
    if (el)
        el.textContent = `© ${new Date().getFullYear()} Mi recetario • ${total} recetas • ${cooked} cocinadas`;
}

window.addEventListener("DOMContentLoaded", () => {
    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    updateFooterStats();
});

// JS: detalle oculto del footer. No afecta datos ni sincronizacion.
let eggClicks = 0;

const egg = document.getElementById("easterEgg");

if (egg) {
    egg.addEventListener("click", () => {
        eggClicks++;

        if (eggClicks < 4) return;
        eggClicks = 0;

        const duck = document.createElement("div");
        duck.textContent = "🦆❤️";

        duck.style.position = "fixed";
        duck.style.bottom = "120px";
        duck.style.left = "-120px";
        duck.style.fontSize = "1.8rem";
        duck.style.zIndex = "9999";
        duck.style.transition = "left 4s linear";

        document.body.appendChild(duck);

        setTimeout(() => {
            duck.style.left = "110%";
        }, 50);

        let up = true;
        const bounce = setInterval(() => {
            duck.style.transform = up ? "translateY(-10px)" : "translateY(0)";
            up = !up;
        }, 300);

        setTimeout(() => {
            clearInterval(bounce);
            duck.remove();
        }, 4000);
    });
}
