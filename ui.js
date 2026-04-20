// JS: render de tarjetas, busqueda y filtros principales.
// Construye la grilla visible aplicando busqueda, filtros y orden manual.
function renderGrid() {
    function getVal(id) {
        return document.getElementById(id)?.value || "";
    }

    const q = (
        document.getElementById("searchInput")?.value || ""
    ).toLowerCase();
    const cat = getVal("fCat");
    const tag = getVal("fTag").toLowerCase();
    const minS = parseInt(getVal("fStars")) || 0;
    const favOnly = getVal("fFav");

    const list = [...recipes]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .filter((r) => {
            if (cat && r.category !== cat) return false;
            if (
                tag &&
                !(r.tags || []).some((t) => (t || "").toLowerCase() === tag)
            )
                return false;
            if (minS && (r.stars || 0) < minS) return false;
            if (favOnly === "1" && !r.favorite) return false;
            if (q) {
                const ib = Array.isArray(r.ingredients)
                    ? r.ingredients
                          .map((i) => i.name || "")
                          .join(" ")
                          .toLowerCase()
                    : "";
                const tb = (r.tags || []).join(" ").toLowerCase();
                if (
                    !(
                        r.name +
                        r.category +
                        ib +
                        r.steps +
                        r.notes +
                        tb +
                        (r.origin || "")
                    )
                        .toLowerCase()
                        .includes(q)
                )
                    return false;
            }
            if (cookFilter === "1" && !(r.cookHistory || []).length)
                return false;
            if (cookFilter === "0" && (r.cookHistory || []).length)
                return false;
            return true;
        });
    list.sort((a, b) => {
        if (a.favorite !== b.favorite) {
            return b.favorite - a.favorite;
        }
        return (b.stars || 0) - (a.stars || 0);
    });

    document.getElementById("countPill").textContent =
        list.length + " receta" + (list.length !== 1 ? "s" : "");
    const csBtn = document.getElementById("clearSearch");
    if (csBtn) csBtn.style.display = q ? "block" : "none";
    refreshTagSelect();

    const grid = document.getElementById("grid");
    if (!list.length) {
        grid.innerHTML = `<div class="empty"><div class="ei">${recipes.length ? "🔍" : "🍳"}</div>
                  <h3>${recipes.length ? "Sin resultados" : "¡Tu recetario está vacío!"}</h3>
                  <p style="font-size:.86rem;margin-top:5px">${recipes.length ? "Probá otros filtros." : "Agregá tu primera receta arriba."}</p></div>`;
        return;
    }

    const favs = list.filter((r) => r.favorite);
    const normal = list.filter((r) => !r.favorite);

    function renderCard(r) {
        return `
    <div class="card" onclick="openView('${r.id}')">
      <div class="cthumb">
        ${r.photo ? `<img src="${r.photo}" alt="${r.name}" onerror="this.style.display='none'">` : catEmoji(r.category)}
        ${r.favorite ? '<span class="fav-badge">❤️</span>' : ""}
        ${(r.cookHistory || []).length ? `<span class="cook-count">🍳 ×${r.cookHistory.length}</span>` : ""}
      </div>
      <div class="cbody">
        <div class="ctags">
          <span class="tag tag-cat">${r.category}</span>
          ${(r.tags || [])
              .slice(0, 2)
              .map((t) => `<span class="tag tag-custom">${t}</span>`)
              .join("")}
        </div>
        <div class="cname">${r.name}</div>
        <div class="cmeta">
${r.time ? `<span>⏱ ${r.time}m</span>` : ""}
${r.portions ? `<span>👥 ${r.portions}</span>` : ""}
<span>🎯 ${r.difficulty || "Media"}</span>
        </div>
        ${starsHtml(r.stars)}
<div class="cfoot">
    <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openEdit('${r.id}')">✏️</button>
    <button class="btn btn-gold btn-sm" onclick="event.stopPropagation();startCookMode('${r.id}')">👨‍🍳</button>
    <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();delRecipe('${r.id}')">🗑️</button>
    <button
            onclick="event.stopPropagation();toggleCooked('${r.id}')"
            style="
                margin-left:auto;
                width:36px;
                height:36px;
                border-radius:10px;
                border:1px solid ${(r.cookHistory || []).length ? "#4caf50" : "#ccc"};
                background:${(r.cookHistory || []).length ? "#4caf50" : "transparent"};
                color:${(r.cookHistory || []).length ? "white" : "#555"};
                font-weight:bold;
                display:flex;
                align-items:center;
                justify-content:center;
                cursor:pointer;
            "
            >
            ${(r.cookHistory || []).length ? "✔" : "▢"}
    </button>
</div>
        </div>
    </div>`;
    }

    let html = "";

    if (favs.length) {
        html += `
    <div style="grid-column:1/-1; margin-bottom:10px;">
        <h3 style="font-family:'Inter',serif; font-size:1.1rem;">❤️ Favoritas</h3>
    </div>
    ${favs.map(renderCard).join("")}
    `;
    }

    if (normal.length) {
        html += `
    <div style="grid-column:1/-1; margin:10px 0;">
        <h3 style="font-family:'Inter',serif; font-size:1.1rem;">📖 Todas</h3>
    </div>
    ${normal.map(renderCard).join("")}
    `;
    }

    grid.innerHTML = html;
    updateFilterCount();
    updateFooterStats();
}

// Renderiza hero, tabs, ingredientes, pasos e historial.

function renderView(r) {
    const ratio = vPort / (r.portions || 4);
    const steps = normalizeSteps(r.steps || []);
    const hasIng = (r.ingredients || []).length > 0;
    const hasSteps = steps.length > 0;
    const hasHistory = (r.cookHistory || []).length > 0;

    const thumbHtml = r.photo
        ? `<div class="thumb"><img src="${r.photo}" alt="${r.name}" onerror="this.parentElement.innerHTML='${catEmoji(r.category)}'"></div>`
        : `<div class="thumb">${catEmoji(r.category)}</div>`;

    const heroHtml = `
        <div class="vhero-compact">
            ${thumbHtml}
            <div class="info">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
                    <div>${starsHtml(r.stars, ".95rem")}</div>
                    <button style="background:none;border:none;font-size:1.3rem;cursor:pointer;padding:0;line-height:1" onclick="toggleFav('${r.id}')" title="${r.favorite ? "Quitar favorita" : "Marcar favorita"}">${r.favorite ? "❤️" : "🤍"}</button>
                </div>
                <div class="vmeta-row" style="margin-top:6px">
                    ${r.time ? `<span class="vmeta-chip">⏱ ${r.time}m</span>` : ""}
                    <span class="vmeta-chip">👥 ${r.portions || 4}</span>
                    <span class="vmeta-chip">🎯 ${r.difficulty || "Media"}</span>
                    ${hasHistory ? `<span class="vmeta-chip">🍳 ×${r.cookHistory.length}</span>` : ""}
                </div>
                ${r.origin ? `<div style="font-size:.75rem;color:var(--tx3);margin-top:3px">📍 ${r.origin}</div>` : ""}
                ${(r.tags || []).length ? `<div class="vtags" style="margin-top:6px">${r.tags.map((t) => `<span class="tag tag-custom">${t}</span>`).join("")}</div>` : ""}
            </div>
        </div>`;

    const tabs = [
        hasIng ? { id: "ing", label: "🥗 Ingredientes" } : null,
        hasSteps ? { id: "steps", label: "👨‍🍳 Preparación" } : null,
        hasHistory ? { id: "hist", label: "📅 Historial" } : null,
        { id: "info", label: "ℹ️ Info" },
    ].filter(Boolean);

    if (!tabs.some((t) => t.id === vActiveTab)) vActiveTab = tabs[0].id;

    const tabBar = `<div class="view-tabs">${tabs
        .map(
            (t) =>
                `<button class="view-tab${vActiveTab === t.id ? " active" : ""}" data-tab="${t.id}" onclick="switchViewTab('${t.id}')">${t.label}</button>`,
        )
        .join("")}</div>`;

    const panelInfo = `<div class="view-panel${vActiveTab === "info" ? " active" : ""}" data-panel="info">
        ${
            r.notes
                ? `<div class="notesbox">📝 ${r.notes}</div>`
                : `<div class="empty-info">No hay información.</div>`
        }
    </div>`;

    const panelIng = hasIng
        ? `<div class="view-panel${vActiveTab === "ing" ? " active" : ""}" data-panel="ing">
        <div class="pctrl">
            <button onclick="chgPort(-1)">−</button>
            <span>👥 ${vPort} porción${vPort !== 1 ? "es" : ""}</span>
            <button onclick="chgPort(1)">+</button>
        </div>
        <ul class="inglist">${r.ingredients
            .map((i) => {
                let q = "";
                if (i.qty) {
                    const v = i.qty * ratio;
                    q = (Number.isInteger(v) ? v : +v.toFixed(2)) + " ";
                }
                return `<li>${q}${i.unit ? i.unit + " " : ""}<strong>${i.name}</strong></li>`;
            })
            .join("")}</ul>
    </div>`
        : "";

    const panelSteps = hasSteps
        ? `<div class="view-panel${vActiveTab === "steps" ? " active" : ""}" data-panel="steps">
        ${steps
            .map(
                (s, idx) => `
            <div class="vstep">
                <div class="vstep-num">${idx + 1}</div>
                <div class="vstep-body">
                    <div>${s.text}</div>
                    ${s.timer ? `<div class="vstep-timer"><button class="timer-btn" id="tbtn_${vId}_${idx}" onclick="toggleTimer('${vId}',${idx},${s.timer})">⏱ ${s.timer} min</button><span class="timer-display" id="tdisp_${vId}_${idx}"></span></div>` : ""}
                </div>
            </div>`,
            )
            .join("")}
    </div>`
        : "";

    const panelHist = hasHistory
        ? `<div class="view-panel${vActiveTab === "hist" ? " active" : ""}" data-panel="hist">
        <div class="cooklog">
            ${r.cookHistory
                .slice(-10)
                .reverse()
                .map((item, idx) => {
                    const date = item.date || item;
                    return `<div class="cooklog-item">
                    <div>
                        <span>🍳 ${new Date(date).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                        ${item.note ? `<div style="font-size:.75rem;color:var(--tx3)">📝 ${item.note}</div>` : ""}
                    </div>
                    <button class="rmbtn" onclick="removeCook('${r.id}', ${idx})">✕</button>
                </div>`;
                })
                .join("")}
        </div>
    </div>`
        : "";

    const viewActions = `<div class="view-actions">
        <button class="btn btn-gold btn-sm" onclick="close2('viewOv');startCookMode('${r.id}')">👨‍🍳 Modo cocina</button>
        <button class="btn btn-primary btn-sm" onclick="openEdit('${r.id}');close2('viewOv')">✏️ Editar</button>
        <button class="btn btn-green btn-sm" onclick="openPanel();close2('viewOv')">🛒 Lista compras</button>
        <button class="btn btn-outline btn-sm" onclick="logCook('${r.id}')">✅ Cocinada hoy</button>
        <button class="btn btn-outline btn-sm" onclick="printRecipe('${r.id}')">🖨️ Imprimir</button>
    </div>`;

    document.getElementById("vBody").innerHTML =
        heroHtml +
        tabBar +
        panelIng +
        panelSteps +
        panelHist +
        panelInfo +
        viewActions;
}

// Regenera el selector de etiquetas segun las recetas existentes.

function refreshTagSelect() {
    const all = new Set();
    recipes.forEach((r) =>
        (r.tags || []).forEach((t) => all.add(t.toLowerCase())),
    );
    const sel = document.getElementById("fTag");
    const cur = sel ? sel.value : "";
    sel.innerHTML =
        '<option value="">Todas las etiquetas</option>' +
        [...all]
            .sort()
            .map(
                (t) =>
                    `<option ${t === cur ? "selected" : ""} value="${t}">
  ${t
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")}
</option>`,
            )
            .join("");
}
