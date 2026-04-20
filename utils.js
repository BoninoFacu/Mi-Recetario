// JS: helpers de formato usados por varias vistas.
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const catEmoji = (c) =>
    ({
        Desayuno: "☕",
        Almuerzo: "🥗",
        Cena: "🍽️",
        Postre: "🍰",
        Snack: "🥨",
        Bebida: "🥤",
        Otro: "🍴",
    })[c] || "🍴";
const starsHtml = (n, size = "") =>
    `<span class="stars" ${size ? `style="font-size:${size}"` : ""}>${"★".repeat(n || 0)}${"☆".repeat(5 - (n || 0))}</span>`;

// JS: normalizacion defensiva de pasos guardados o escritos manualmente.
// Convierte pasos viejos a un formato uniforme.
function normalizeSteps(steps) {
    if (!steps) return [];

    if (typeof steps === "string") {
        return steps
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => ({ text: s, timer: 0 }));
    }

    if (!Array.isArray(steps)) {
        try {
            if (typeof steps === "object") {
                return Object.values(steps)
                    .map((s) => String(s).trim())
                    .filter(Boolean)
                    .map((s) => ({ text: s, timer: 0 }));
            }
            return [];
        } catch {
            return [];
        }
    }

    return steps.flatMap((s) => {
        if (!s) return [];

        if (typeof s === "string") {
            return s
                .split("\n")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((t) => ({ text: t, timer: 0 }));
        }

        if (typeof s === "object") {
            if (s.text && s.text.includes("\n")) {
                return s.text
                    .split("\n")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((t) => ({
                        text: t,
                        timer: s.timer || 0,
                    }));
            }

            return [
                {
                    text: (s.text || "").toString().trim(),
                    timer: s.timer || 0,
                },
            ];
        }

        return [];
    });
}

// Normaliza cantidades grandes como gramos a kilos o mililitros a litros.
function normalizeUnit(qty, unit) {
    if (!qty) return { qty, unit };

    const u = unit.toLowerCase();

    if (u === "gr" || u === "g") {
        if (qty >= 1000) {
            return { qty: (qty / 1000).toFixed(2), unit: "kg" };
        }
        return { qty, unit: "gr" };
    }

    if (u === "ml") {
        if (qty >= 1000) {
            return { qty: (qty / 1000).toFixed(2), unit: "L" };
        }
        return { qty, unit: "ml" };
    }

    return { qty, unit };
}
