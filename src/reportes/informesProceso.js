// Calibres, colores y checklist de "Control de Calidad y Cargue" — se
// definen aquí (en vez de en PackingListTab.jsx) para que este módulo no
// dependa de montar ese componente, y PackingListTab los importa de vuelta.
export const CALIBRES = [110, 150, 175, 200, 230, 250];

// ── Checklist "Control de Calidad y Cargue" — molde agregado en Moldes/ ──
export const CHECKLIST_CALIDAD_CARGUE = [
  { cat:"Calidad del producto", icon:"🍋", items:[
    ["fruta_buen_estado",   "Fruta en buen estado"],
    ["calibre_conforme",    "Calibre conforme a pedido"],
    ["limpieza_producto",   "Limpieza del producto"],
    ["maduracion_adecuada", "Maduración adecuada"],
    ["sin_plagas",          "Sin plagas o cuerpos extraños"],
  ]},
  { cat:"Calidad de cajas", icon:"📦", items:[
    ["cajas_limpias_secas",  "Cajas limpias y secas"],
    ["cajas_sin_roturas",    "Cajas sin roturas"],
    ["resistencia_adecuada", "Resistencia adecuada"],
    ["cierre_correcto",      "Cierre correcto"],
  ]},
  { cat:"Etiquetas y marcación", icon:"🏷", items:[
    ["cajas_con_etiqueta",   "Cajas con etiqueta"],
    ["info_legible",         "Información legible"],
    ["marcacion_cajas",      "Marcación de cajas"],
    ["etiquetas_id_4_lados", "Etiquetas de ID en los 4 lados de la pallet"],
    ["etiquetas_plu",        "Etiquetas PLU en el producto"],
  ]},
  { cat:"Pallet", icon:"🧱", items:[
    ["estibas_buen_estado", "Estibas en buen estado"],
    ["estibas_estables",    "Estibas estables"],
    ["sellos_ica_visibles", "Sellos ICA visibles"],
    ["cantidad_sellos_ica", "Cantidad correcta de sellos ICA"],
  ]},
  { cat:"Temperatura", icon:"🌡", items:[
    ["temp_carga_ok",        "Temperatura de la carga (°C)"],
    ["temp_vehiculo_ok",     "Temperatura del vehículo (°C)"],
    ["termoregistro_activado","Termoregistro activado"],
  ]},
  { cat:"Condiciones del vehículo", icon:"🚛", items:[
    ["vehiculo_limpio",       "Vehículo limpio"],
    ["sin_olores",            "Sin olores"],
    ["sin_humedad",           "Sin humedad"],
    ["buen_estado_general",   "Buen estado general"],
    ["capacidad_20_pallets",  "Capacidad para 20 pallets"],
    ["talanqueras_adecuadas", "Talanqueras adecuadas"],
    ["sellos_seguridad",      "Sellos de seguridad"],
  ]},
];
export const CHEQUEO_TOTAL_ITEMS = CHECKLIST_CALIDAD_CARGUE.reduce((s, g) => s + g.items.length, 0);

export const COL_CAL = {
  110: { bg:"#3B82F6", light:"rgba(59,130,246,0.18)", border:"rgba(59,130,246,0.5)" },
  150: { bg:"#22C55E", light:"rgba(34,197,94,0.18)",  border:"rgba(34,197,94,0.5)"  },
  175: { bg:"#EAB308", light:"rgba(234,179,8,0.18)",  border:"rgba(234,179,8,0.5)"  },
  200: { bg:"#F97316", light:"rgba(249,115,22,0.18)", border:"rgba(249,115,22,0.5)" },
  230: { bg:"#EF4444", light:"rgba(239,68,68,0.18)",  border:"rgba(239,68,68,0.5)"  },
  250: { bg:"#8B5CF6", light:"rgba(139,92,246,0.18)", border:"rgba(139,92,246,0.5)" },
};

function fmtDate(d) {
  if (!d) return "";
  const [y, mo, dd] = d.split("-");
  return `${mo}-${dd}-${y}`;
}

// Logo de Tierra Prometida embebido como base64 — así los informes HTML
// descargados muestran el logo aunque se abran después, sin servidor.
async function cargarLogoBase64() {
  try {
    const res  = await fetch("/logo-tp.png");
    const blob = await res.blob();
    return await new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  } catch { return ""; }
}

// ── Informe de Planta y de Cargue como funciones puras — extraídas de
// PackingListTab (Paso 1 y Paso 2) para poder generarlas también desde
// "Informe General de Proceso" sin montar ese componente completo:
// reciben los mismos datos que ya guarda cada paso (pallets, admin_data,
// total_cajas, layout_camion) tal cual quedan en la fila de packing_lists.
export async function generarInformePlantaHtml({ pallets, admin, contenedor, totalCajas }) {
  const cpp = Math.floor(totalCajas / 20);
  const palletSum = (p) => p.calibres.reduce((s, c) => s + Number(c.cajas || 0), 0);

  const sizeQty = Object.fromEntries(CALIBRES.map(c => [c, 0]));
  pallets.forEach(p => p.calibres.forEach(c => {
    const s = c.size !== "" && c.size != null ? Number(c.size) : null;
    if (s !== null) sizeQty[s] = (sizeQty[s] || 0) + Number(c.cajas || 0);
  }));
  const totalCal   = Object.values(sizeQty).reduce((a, b) => a + b, 0);
  const maxCal     = Math.max(...Object.values(sizeQty), 1);
  const calibresConCajas = CALIBRES.slice().sort((a, b) => b - a).filter(s => sizeQty[s] > 0);
  const filasCalibre = CALIBRES.slice().sort((a, b) => b - a).map(s => {
    const qty    = sizeQty[s];
    const pct    = totalCal ? Math.round(qty / totalCal * 100) : 0;
    const barPct = Math.round(qty / maxCal * 100);
    const col    = COL_CAL[s]?.bg || "#94a3b8";
    return `<div class="cal-row">
      <div class="cal-tag" style="background:${col}">${s}</div>
      <div class="cal-bar-track"><div class="cal-bar" style="width:${qty ? Math.max(barPct, 3) : 0}%;background:${col}"></div></div>
      <div class="cal-qty">${qty.toLocaleString("es-CO")} cj</div>
      <div class="cal-pct">${pct}%</div>
    </div>`;
  }).join("");
  const chipsCalibre = calibresConCajas.map(s =>
    `<span class="cal-chip" style="background:${COL_CAL[s]?.light || "#f1f5f9"};color:${COL_CAL[s]?.bg || "#475569"};border-color:${COL_CAL[s]?.border || "#cbd5e1"}">${s}</span>`
  ).join("");

  const sizesPorPallet = pallets.map(p =>
    [...new Set(p.calibres.filter(c => Number(c.cajas || 0) > 0).map(c => Number(c.size)))]
  );
  const filasPalletsCalibre = calibresConCajas.map(s => {
    const nPallets = sizesPorPallet.filter(sizes => sizes.length === 1 && sizes[0] === s).length;
    const col = COL_CAL[s]?.bg || "#94a3b8";
    return `<div class="cal-pallet-row">
      <div class="cal-tag" style="background:${col}">${s}</div>
      <div class="cal-pallet-count"><b>${nPallets}</b> pallet${nPallets !== 1 ? "s" : ""}</div>
    </div>`;
  }).join("");
  const mixtosMap = {};
  sizesPorPallet.forEach(sizes => {
    if (sizes.length > 1) {
      const key = sizes.slice().sort((a, b) => a - b).join(" + ");
      mixtosMap[key] = (mixtosMap[key] || 0) + 1;
    }
  });
  const filasPalletsMixtos = Object.entries(mixtosMap).map(([combo, n]) => `<div class="cal-pallet-row">
      <div class="cal-tag" style="background:#94a3b8;font-size:8.5px;padding:0 3px">${combo}</div>
      <div class="cal-pallet-count"><b>${n}</b> pallet${n !== 1 ? "s" : ""} mixto${n !== 1 ? "s" : ""}</div>
    </div>`).join("");

  const pallCards = pallets.map(p => {
    const sum   = palletSum(p);
    const ok    = sum === cpp;
    const chips = p.calibres.map(c => {
      const col = COL_CAL[c.size]?.bg || "#94a3b8";
      return `<span class="pchip" style="border-color:${col}66;color:${col}">${c.plu ? `${c.size}PLU` : (c.size || "—")} <b>${c.cajas || 0}cj</b></span>`;
    }).join("");
    const observacion = p.calibres.find(c => c.predio)?.predio;
    const icasPallet = [...new Set(p.calibres.map(c => (c.ica || admin.icaGeneral || "").trim()).filter(Boolean))];
    return `<div class="pallet-card ${ok ? "" : "warn"}">
      <div class="pallet-top"><span class="pid">Pallet ${p.id}</span><span class="pflag">${ok ? "✓ cuadra" : `⚠ ${sum}/${cpp}`}</span></div>
      <div class="pchips">${chips}</div>
      ${observacion ? `<div class="ppredio">📝 ${observacion}</div>` : ""}
      ${icasPallet.length ? `<div class="pica">🏷 ${icasPallet.join(" · ")}</div>` : ""}
    </div>`;
  }).join("");
  const pallOk = pallets.filter(p => palletSum(p) === cpp).length;

  const chequeos    = admin.checklistCalidad || {};
  const marcados    = Object.values(chequeos).filter(Boolean).length;
  const conNo       = Object.values(chequeos).filter(v => v === "no").length;
  const pctRevisado = CHEQUEO_TOTAL_ITEMS ? Math.round(marcados / CHEQUEO_TOTAL_ITEMS * 100) : 0;
  const estadoGeneral = conNo > 0
    ? { txt: `⚠️ ${conNo} punto${conNo !== 1 ? "s" : ""} sin cumplir`, col: "#c62828", bg: "#fdecea" }
    : marcados === CHEQUEO_TOTAL_ITEMS
      ? { txt: "✅ Checklist completo — todo en orden", col: "#1D6F42", bg: "#e9f7ef" }
      : { txt: `🕓 Checklist en curso — ${marcados}/${CHEQUEO_TOTAL_ITEMS} ítems revisados`, col: "#a06600", bg: "#fdf6e3" };

  const seccionesChequeo = CHECKLIST_CALIDAD_CARGUE.map(grupo => {
    const marcadosCat = grupo.items.filter(([k]) => chequeos[k]).length;
    const noCat       = grupo.items.filter(([k]) => chequeos[k] === "no").length;
    const filas = grupo.items.map(([key, label]) => {
      const val   = chequeos[key];
      const icon  = val === "si" ? "✅" : val === "no" ? "❌" : "▫️";
      const badge = val === "si" ? `<span class="ok">Sí cumple</span>`
                  : val === "no" ? `<span class="bad">No cumple</span>`
                  : `<span class="pend">Sin revisar</span>`;
      return `<div class="chk-row"><span class="chk-icon">${icon}</span><span class="chk-label">${label}</span>${badge}</div>`;
    }).join("");
    return `<div class="chk-cat ${noCat > 0 ? "hasbad" : ""}">
      <div class="chk-cat-hdr"><span>${grupo.icon} ${grupo.cat}</span><span class="chk-cat-count">${marcadosCat}/${grupo.items.length}</span></div>
      ${filas}
    </div>`;
  }).join("");

  const logoSrc = await cargarLogoBase64();

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>Informe Planta — ${admin.container || contenedor?.numContenedor || ""}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,sans-serif;color:#1e2b1e;background:#f4f7f3;font-size:12px}
.sheet{max-width:960px;margin:0 auto;background:#fff}

/* ── Banner ── */
.banner{background:linear-gradient(120deg,#173d1a,#2d7a2d 60%,#3fa142);color:#fff;padding:30px 34px 26px;position:relative;overflow:hidden}
.banner::after{content:"🍋";position:absolute;right:-10px;top:-22px;font-size:130px;opacity:0.12;transform:rotate(12deg)}
.banner-row{display:flex;align-items:center;justify-content:space-between;gap:16px;position:relative}
.banner img{width:98px;height:98px;object-fit:contain;background:#fff;border-radius:12px;padding:6px;box-shadow:0 4px 14px rgba(0,0,0,0.25)}
.banner h1{font-size:22px;font-weight:800;letter-spacing:0.2px}
.banner .sub{font-size:11.5px;opacity:0.88;margin-top:4px}
.banner .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;position:relative}
.banner .chip{background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.28);border-radius:20px;padding:5px 12px;font-size:10.5px;font-weight:600}

/* ── Estado general ── */
.estado-bar{margin:0 34px;margin-top:-16px;position:relative;background:${estadoGeneral.bg};border:1px solid ${estadoGeneral.col}33;color:${estadoGeneral.col};border-radius:12px;padding:12px 18px;font-weight:700;font-size:12.5px;box-shadow:0 6px 18px rgba(0,0,0,0.08)}

.content{padding:28px 34px 8px}

/* ── KPI cards ── */
.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:26px}
.card{background:#fbfdfb;border:1px solid #e2ede2;border-radius:12px;padding:14px 10px;text-align:center}
.card-ic{font-size:16px;margin-bottom:2px}
.card-val{font-size:18px;font-weight:800;color:#1f5c1f;line-height:1.15}
.card-lbl{font-size:8.5px;color:#4a564a;margin-top:4px;text-transform:uppercase;letter-spacing:0.4px;font-weight:700}
.card.warn .card-val{color:#c62828}

h2{display:flex;align-items:center;gap:8px;color:#173d1a;font-size:13.5px;font-weight:800;margin:26px 0 12px;text-transform:uppercase;letter-spacing:0.3px}
h2::after{content:"";flex:1;height:1px;background:#dfe8df}

/* ── Calibres: barras ── */
.cal-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.cal-chip{border:1px solid;border-radius:8px;padding:3px 10px;font-size:10.5px;font-weight:800}
.cal-row{display:flex;align-items:center;gap:10px;margin-bottom:7px}
.cal-tag{width:34px;height:24px;border-radius:6px;color:#fff;font-weight:800;font-size:10.5px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cal-bar-track{flex:1;height:14px;background:#eef2ee;border-radius:7px;overflow:hidden}
.cal-bar{height:100%;border-radius:7px}
.cal-qty{width:70px;text-align:right;font-size:10.5px;font-weight:700;color:#333;flex-shrink:0}
.cal-pct{width:36px;text-align:right;font-size:10.5px;color:#3f4a3f;font-weight:600;flex-shrink:0}
.cal-total{margin-top:10px;padding-top:10px;border-top:1px dashed #dfe8df;display:flex;justify-content:space-between;font-weight:800;font-size:12px;color:#173d1a}
.cal-split{display:grid;grid-template-columns:1fr 210px;gap:22px;align-items:start}
.cal-col-right{background:#fbfdfb;border:1px solid #e2ede2;border-radius:12px;padding:14px 14px 6px}
.cal-col-title{font-size:9.5px;color:#4a564a;text-transform:uppercase;letter-spacing:0.4px;font-weight:800;margin-bottom:10px}
.cal-pallet-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.cal-pallet-count{font-size:11px;color:#333;font-weight:600}
.cal-pallet-count b{font-size:13px;color:#173d1a;font-weight:800}

/* ── Pallets: grid de tarjetas ── */
.pallet-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.pallet-card{border:1px solid #dfe8df;border-left:4px solid #2d8a2d;border-radius:10px;padding:9px 11px;background:#fbfdfb;break-inside:avoid}
.pallet-card.warn{border-left-color:#e08a1e;background:#fffaf2}
.pallet-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.pid{font-weight:800;font-size:11px;color:#173d1a}
.pflag{font-size:9px;font-weight:700;color:#2d8a2d}
.pallet-card.warn .pflag{color:#c9720e}
.pchips{display:flex;flex-wrap:wrap;gap:4px}
.pchip{border:1px solid;border-radius:6px;padding:2px 6px;font-size:9px;font-weight:600}
.ppredio{margin-top:6px;font-size:9px;color:#222;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pica{margin-top:3px;font-size:9px;color:#2d8a2d;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── Checklist ── */
.chk-cat{border:1px solid #dfe8df;border-left:4px solid #2d8a2d;border-radius:10px;padding:12px 16px;margin-bottom:10px;break-inside:avoid}
.chk-cat.hasbad{border-left-color:#c62828}
.chk-cat-hdr{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:11.5px;color:#173d1a;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.3px}
.chk-cat-count{background:#eef2ee;color:#3a4a3a;border-radius:10px;padding:2px 9px;font-size:10px;font-weight:700}
.chk-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f1f5f1;font-size:11px}
.chk-row:last-child{border-bottom:none}
.chk-icon{font-size:11px;flex-shrink:0}
.chk-label{flex:1;color:#333}
.ok{color:#1D6F42;font-weight:800;font-size:10.5px}
.bad{color:#c62828;font-weight:800;font-size:10.5px}
.pend{color:#6b6b6b;font-style:italic;font-weight:700;font-size:10.5px}

/* ── Observaciones + firma ── */
.obs{background:#fbfdfb;border:1px solid #e2ede2;border-left:4px solid #3fa142;border-radius:10px;padding:12px 16px;font-size:11.5px;margin-top:4px;white-space:pre-wrap;color:#333}
.firma-row{display:flex;gap:20px;margin-top:26px}
.firma-box{flex:1}
.firma-line{border-bottom:1.5px solid #b8c8b8;height:34px}
.firma-lbl{font-size:10px;color:#3a4a3a;margin-top:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px}
.firma-val{font-size:12px;color:#222;font-weight:600;margin-top:2px}

/* ── Footer ── */
.footer{background:#173d1a;color:rgba(255,255,255,0.85);text-align:center;font-size:10px;padding:16px;margin-top:30px}

@media print{
  body{background:#fff}
  .sheet{max-width:100%}
  .banner::after{display:none}
  @page{size:A4;margin:10mm}
}
</style></head><body>
<div class="sheet">

  <div class="banner">
    <div class="banner-row">
      <div>
        <h1>📦 Informe de Planta</h1>
        <div class="sub">Calibres, distribución de pallets y Control de Calidad y Cargue</div>
      </div>
      ${logoSrc ? `<img src="${logoSrc}" />` : ""}
    </div>
    <div class="chips">
      <span class="chip">🚢 ${admin.container || contenedor?.numContenedor || "—"}</span>
      <span class="chip">📅 ${fmtDate(admin.packingDate) || new Date().toLocaleDateString("es-CO")}</span>
      <span class="chip">🏭 ${admin.checklistPlanta || "Planta sin especificar"}</span>
      <span class="chip">🍋 ${contenedor?.producto || "Producto sin especificar"}</span>
      <span class="chip">➡️ ${admin.destino || "—"}</span>
    </div>
  </div>

  <div class="estado-bar">${estadoGeneral.txt}</div>

  <div class="content">

    <div class="cards">
      <div class="card"><div class="card-ic">📦</div><div class="card-val">${totalCajas.toLocaleString("es-CO")}</div><div class="card-lbl">Total cajas</div></div>
      <div class="card"><div class="card-ic">🧱</div><div class="card-val">${pallOk}/${pallets.length}</div><div class="card-lbl">Pallets cuadrados</div></div>
      <div class="card"><div class="card-ic">🎨</div><div class="card-val">${calibresConCajas.length}</div><div class="card-lbl">Calibres en uso</div></div>
      <div class="card"><div class="card-ic">✅</div><div class="card-val">${pctRevisado}%</div><div class="card-lbl">Checklist revisado</div></div>
      <div class="card ${conNo > 0 ? "warn" : ""}"><div class="card-ic">${conNo > 0 ? "⚠️" : "🎉"}</div><div class="card-val">${conNo}</div><div class="card-lbl">Puntos con "NO"</div></div>
    </div>

    <h2>📊 Resumen de cajas por calibre</h2>
    <div class="cal-split">
      <div>
        <div class="cal-chips">${chipsCalibre}</div>
        ${filasCalibre}
        <div class="cal-total"><span>TOTAL</span><span>${totalCal.toLocaleString("es-CO")} cajas</span></div>
      </div>
      <div class="cal-col-right">
        <div class="cal-col-title">Pallets por calibre</div>
        ${filasPalletsCalibre}
        ${filasPalletsMixtos ? `<div class="cal-col-title" style="margin-top:10px">Pallets mixtos</div>${filasPalletsMixtos}` : ""}
      </div>
    </div>

    <h2>🧱 Distribución por pallet (${pallets.length})</h2>
    <div class="pallet-grid">${pallCards}</div>

    <h2>✅ Checklist Control de Calidad y Cargue</h2>
    ${seccionesChequeo}

    ${admin.checklistObs ? `<h2>📝 Observaciones generales</h2><div class="obs">${admin.checklistObs}</div>` : ""}

    <div class="firma-row">
      <div class="firma-box">
        <div class="firma-line"></div>
        <div class="firma-lbl">Responsable</div>
        <div class="firma-val">${admin.checklistResponsable || "—"}</div>
      </div>
      <div class="firma-box">
        <div class="firma-line"></div>
        <div class="firma-lbl">Cargo</div>
        <div class="firma-val">${admin.checklistCargo || "—"}</div>
      </div>
    </div>

  </div>

  <div class="footer">Tierra Prometida Trading 🍋 · JARVIS · Informe generado el ${new Date().toLocaleDateString("es-CO")}</div>
</div>
</body></html>`;
}

export async function generarInformeCargueHtml({ pallets, admin, contenedor, totalCajas, layoutCamion }) {
  const cpp = Math.floor(totalCajas / 20);
  const palletSum  = (p)   => p.calibres.reduce((s, c) => s + Number(c.cajas || 0), 0);
  const palletById = (pid) => pallets.find(p => p.id === pid);
  const totalConf  = pallets.reduce((s, p) => s + palletSum(p), 0);
  const todoCuadra = totalConf === totalCajas;

  const logoSrc = await cargarLogoBase64();

  const sizeQty = Object.fromEntries(CALIBRES.map(c => [c, 0]));
  pallets.forEach(p => p.calibres.forEach(c => {
    const s = c.size !== "" && c.size != null ? Number(c.size) : null;
    if (s !== null) sizeQty[s] = (sizeQty[s] || 0) + Number(c.cajas || 0);
  }));
  const totalCal = Object.values(sizeQty).reduce((a, b) => a + b, 0);
  const maxCal    = Math.max(...Object.values(sizeQty), 1);
  const calibresConCajas = CALIBRES.slice().sort((a, b) => b - a).filter(s => sizeQty[s] > 0);
  const filasCalibre = CALIBRES.slice().sort((a, b) => b - a).map(s => {
    const qty    = sizeQty[s];
    const pct    = totalCal ? Math.round(qty / totalCal * 100) : 0;
    const barPct = Math.round(qty / maxCal * 100);
    const col    = COL_CAL[s]?.bg || "#94a3b8";
    return `<div class="cal-row">
      <div class="cal-tag" style="background:${col}">${s}</div>
      <div class="cal-bar-track"><div class="cal-bar" style="width:${qty ? Math.max(barPct, 3) : 0}%;background:${col}"></div></div>
      <div class="cal-qty">${qty.toLocaleString("es-CO")} cj</div>
      <div class="cal-pct">${pct}%</div>
    </div>`;
  }).join("");
  const chipsCalibre = calibresConCajas.map(s =>
    `<span class="cal-chip" style="background:${COL_CAL[s]?.light || "#f1f5f9"};color:${COL_CAL[s]?.bg || "#475569"};border-color:${COL_CAL[s]?.border || "#cbd5e1"}">${s}</span>`
  ).join("");

  const palletCard = (pid) => {
    const p = palletById(pid);
    if (!p) return `<div class="tk-pallet tk-empty">— vacío —</div>`;
    const sum   = palletSum(p);
    const ok    = sum === cpp;
    const chips = p.calibres.map(c => {
      const col = COL_CAL[c.size]?.bg || "#94a3b8";
      return `<span class="pchip" style="border-color:${col}66;color:${col}">${c.plu ? `${c.size}PLU` : (c.size || "—")} <b>${c.cajas || 0}cj</b></span>`;
    }).join("");
    return `<div class="tk-pallet ${ok ? "" : "warn"}">
      <div class="tk-pallet-top"><span class="pid">Pallet ${p.id}</span><span class="pflag">${ok ? "✓" : `⚠ ${sum}/${cpp}`}</span></div>
      <div class="pchips">${chips}</div>
    </div>`;
  };
  const filasIzq = (layoutCamion?.left  || []).map(palletCard).join("");
  const filasDer = (layoutCamion?.right || []).map(palletCard).join("");
  const pallOk   = pallets.filter(p => palletSum(p) === cpp).length;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>Informe Cargue Camión — ${admin.container || contenedor?.numContenedor || ""}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,sans-serif;color:#1e2b1e;background:#f4f7f3;font-size:12px}
.sheet{max-width:960px;margin:0 auto;background:#fff}

.banner{background:linear-gradient(120deg,#7a3d05,#c2620a 60%,#e8862c);color:#fff;padding:30px 34px 26px;position:relative;overflow:hidden}
.banner::after{content:"🚛";position:absolute;right:-6px;top:-14px;font-size:120px;opacity:0.14;transform:rotate(-8deg)}
.banner-row{display:flex;align-items:center;justify-content:space-between;gap:16px;position:relative}
.banner img{width:105px;height:105px;object-fit:contain;background:#fff;border-radius:12px;padding:6px;box-shadow:0 4px 14px rgba(0,0,0,0.25)}
.banner h1{font-size:22px;font-weight:800;letter-spacing:0.2px}
.banner .sub{font-size:11.5px;opacity:0.88;margin-top:4px}
.banner .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;position:relative}
.banner .chip{background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.28);border-radius:20px;padding:5px 12px;font-size:10.5px;font-weight:600}

.estado-bar{margin:0 34px;margin-top:-16px;position:relative;background:${todoCuadra ? "#e9f7ef" : "#fdf6e3"};border:1px solid ${todoCuadra ? "#1D6F42" : "#a06600"}33;color:${todoCuadra ? "#1D6F42" : "#a06600"};border-radius:12px;padding:12px 18px;font-weight:700;font-size:12.5px;box-shadow:0 6px 18px rgba(0,0,0,0.08)}

.content{padding:28px 34px 8px}

.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:26px}
.card{background:#fbfaf9;border:1px solid #ede4d9;border-radius:12px;padding:14px 10px;text-align:center}
.card-ic{font-size:16px;margin-bottom:2px}
.card-val{font-size:18px;font-weight:800;color:#c2620a;line-height:1.15}
.card-lbl{font-size:8.5px;color:#8a7c6f;margin-top:4px;text-transform:uppercase;letter-spacing:0.4px}

h2{display:flex;align-items:center;gap:8px;color:#7a3d05;font-size:13.5px;font-weight:800;margin:26px 0 12px;text-transform:uppercase;letter-spacing:0.3px}
h2::after{content:"";flex:1;height:1px;background:#ede4d9}

.info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:8px}
.info-item{background:#fbfaf9;border:1px solid #ede4d9;border-radius:10px;padding:10px 14px}
.info-item .l{font-size:9px;color:#8a7c6f;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px}
.info-item .v{font-size:13px;font-weight:700;color:#2b2013}

.cal-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.cal-chip{border:1px solid;border-radius:8px;padding:3px 10px;font-size:10.5px;font-weight:800}
.cal-row{display:flex;align-items:center;gap:10px;margin-bottom:7px}
.cal-tag{width:34px;height:24px;border-radius:6px;color:#fff;font-weight:800;font-size:10.5px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cal-bar-track{flex:1;height:14px;background:#f1ece5;border-radius:7px;overflow:hidden}
.cal-bar{height:100%;border-radius:7px}
.cal-qty{width:70px;text-align:right;font-size:10.5px;font-weight:700;color:#333;flex-shrink:0}
.cal-pct{width:36px;text-align:right;font-size:10.5px;color:#8a7c6f;flex-shrink:0}
.cal-total{margin-top:10px;padding-top:10px;border-top:1px dashed #ede4d9;display:flex;justify-content:space-between;font-weight:800;font-size:12px;color:#7a3d05}

.truck-label{text-align:center;font-size:10px;font-weight:800;color:#c2620a;letter-spacing:2px;margin:8px 0}
.truck-diagram{display:flex;gap:14px;background:#0f1522;border-radius:14px;padding:16px;border:2px solid #2a3a55}
.truck-col{flex:1;display:flex;flex-direction:column;gap:6px}
.truck-col-lbl{text-align:center;font-size:9px;font-weight:800;color:rgba(232,134,44,0.6);letter-spacing:2px;margin-bottom:2px}
.truck-aisle{width:6px;background:linear-gradient(180deg,rgba(232,134,44,0.15),rgba(232,134,44,0.05),rgba(232,134,44,0.15));border-radius:3px;flex-shrink:0}
.tk-pallet{border:1px solid #33415a;border-left:4px solid #e8862c;border-radius:9px;padding:8px 10px;background:#161d2b;break-inside:avoid}
.tk-pallet.warn{border-left-color:#f2b705}
.tk-pallet.tk-empty{color:rgba(255,255,255,0.25);text-align:center;font-size:10px;padding:12px;border-style:dashed}
.tk-pallet-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
.tk-pallet-top .pid{font-weight:800;font-size:10.5px;color:#f3e9dc}
.tk-pallet-top .pflag{font-size:8.5px;font-weight:700;color:#4ade80}
.tk-pallet.warn .pflag{color:#f2b705}
.pchips{display:flex;flex-wrap:wrap;gap:4px}
.pchip{border:1px solid;border-radius:6px;padding:2px 6px;font-size:8.5px;font-weight:600;background:rgba(255,255,255,0.04)}

.obs{background:#fbfaf9;border:1px solid #ede4d9;border-left:4px solid #e8862c;border-radius:10px;padding:12px 16px;font-size:11.5px;margin-top:4px;white-space:pre-wrap;color:#333}
.firma-row{display:flex;gap:20px;margin-top:26px}
.firma-box{flex:1}
.firma-line{border-bottom:1.5px solid #d8c8b8;height:34px}
.firma-img{height:56px;object-fit:contain;display:block;border-bottom:1.5px solid #d8c8b8}
.firma-lbl{font-size:10px;color:#8a7c6f;margin-top:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px}
.firma-val{font-size:12px;color:#222;font-weight:600;margin-top:2px}

.footer{background:#7a3d05;color:rgba(255,255,255,0.72);text-align:center;font-size:10px;padding:16px;margin-top:30px}

@media print{
  body{background:#fff}
  .sheet{max-width:100%}
  .banner::after{display:none}
  @page{size:A4;margin:10mm}
}
</style></head><body>
<div class="sheet">

  <div class="banner">
    <div class="banner-row">
      <div>
        <h1>🚛 Informe de Cargue del Camión</h1>
        <div class="sub">Distribución de pallets, calibres y datos de transporte</div>
      </div>
      ${logoSrc ? `<img src="${logoSrc}" />` : ""}
    </div>
    <div class="chips">
      <span class="chip">🚢 ${admin.container || contenedor?.numContenedor || "—"}</span>
      <span class="chip">📅 ${fmtDate(admin.fechaCargue) || new Date().toLocaleDateString("es-CO")}</span>
      <span class="chip">🚛 ${admin.empresaTransporte || "Transportadora sin especificar"}</span>
      <span class="chip">🪧 ${admin.placa || "Sin placa"}</span>
      <span class="chip">➡️ ${admin.destino || "—"}</span>
    </div>
  </div>

  <div class="estado-bar">${todoCuadra ? "✅ Distribución cuadrada — todas las cajas asignadas" : `⚠️ Faltan cuadrar cajas — ${totalConf}/${totalCajas} distribuidas`}</div>

  <div class="content">

    <div class="cards">
      <div class="card"><div class="card-ic">📦</div><div class="card-val">${totalCajas.toLocaleString("es-CO")}</div><div class="card-lbl">Total cajas</div></div>
      <div class="card"><div class="card-ic">🧱</div><div class="card-val">${pallOk}/${pallets.length}</div><div class="card-lbl">Pallets cuadrados</div></div>
      <div class="card"><div class="card-ic">🎨</div><div class="card-val">${calibresConCajas.length}</div><div class="card-lbl">Calibres en uso</div></div>
      <div class="card"><div class="card-ic">🕐</div><div class="card-val">${admin.horaCargue || "—"}</div><div class="card-lbl">Hora de cargue</div></div>
      <div class="card"><div class="card-ic">🕓</div><div class="card-val">${admin.horaSalida || "—"}</div><div class="card-lbl">Hora de salida</div></div>
    </div>

    <h2>🚚 Datos del transporte</h2>
    <div class="info-grid">
      <div class="info-item"><div class="l">Empresa transporte</div><div class="v">${admin.empresaTransporte || "—"}</div></div>
      <div class="info-item"><div class="l">Placa</div><div class="v">${admin.placa || "—"}</div></div>
      <div class="info-item"><div class="l">Trailer</div><div class="v">${admin.trailer || "—"}</div></div>
      <div class="info-item"><div class="l">Conductor</div><div class="v">${admin.conductor || "—"}</div></div>
      <div class="info-item"><div class="l">Supervisor de cargue</div><div class="v">${admin.supervisorCargue || "—"}</div></div>
      <div class="info-item"><div class="l">Fecha de cargue</div><div class="v">${fmtDate(admin.fechaCargue) || "—"}</div></div>
    </div>

    <h2>🌡 Termoregistro, precinto y temperatura</h2>
    <div class="info-grid">
      <div class="info-item"><div class="l">Termoregistro${admin.termoregistroCamionPalletNo ? ` — Pallet #${admin.termoregistroCamionPalletNo}` : ""}</div><div class="v">${admin.termoregistroCamion || "—"}</div></div>
      <div class="info-item"><div class="l">N° de precinto</div><div class="v">${admin.precintoCamion || "—"}</div></div>
      <div class="info-item"><div class="l">Temp. de llegada</div><div class="v">${admin.tempLlegadaCamion ? `${admin.tempLlegadaCamion}°C` : "—"}</div></div>
      <div class="info-item"><div class="l">Temp. de salida</div><div class="v">${admin.tempSalidaCamion ? `${admin.tempSalidaCamion}°C` : "—"}</div></div>
    </div>
    ${(admin.icaCamion || []).some(c => c.ica) ? `
    <div class="info-grid">
      ${admin.icaCamion.filter(c => c.ica).map(c => `<div class="info-item"><div class="l">ICA${c.palletNo ? ` — Pallet #${c.palletNo}` : ""}</div><div class="v">${c.ica}</div></div>`).join("")}
    </div>` : ""}

    <h2>📊 Resumen de cajas por calibre</h2>
    <div class="cal-chips">${chipsCalibre}</div>
    ${filasCalibre}
    <div class="cal-total"><span>TOTAL</span><span>${totalCal.toLocaleString("es-CO")} cajas</span></div>

    <h2>🚛 Distribución en el camión</h2>
    <div class="truck-label">▲ FONDO DEL CAMIÓN</div>
    <div class="truck-diagram">
      <div class="truck-col"><div class="truck-col-lbl">◀ IZQUIERDA</div>${filasIzq}</div>
      <div class="truck-aisle"></div>
      <div class="truck-col"><div class="truck-col-lbl">DERECHA ▶</div>${filasDer}</div>
    </div>
    <div class="truck-label">▼ PUERTA TRASERA</div>

    <div class="firma-row">
      <div class="firma-box">
        ${admin.firmaConductor ? `<img class="firma-img" src="${admin.firmaConductor}" />` : `<div class="firma-line"></div>`}
        <div class="firma-lbl">Conductor</div>
        <div class="firma-val">${admin.conductor || "—"}</div>
      </div>
      <div class="firma-box">
        ${admin.firmaSupervisor ? `<img class="firma-img" src="${admin.firmaSupervisor}" />` : `<div class="firma-line"></div>`}
        <div class="firma-lbl">Supervisor de cargue</div>
        <div class="firma-val">${admin.supervisorCargue || "—"}</div>
      </div>
    </div>

  </div>

  <div class="footer">Tierra Prometida Trading 🍋 · JARVIS · Informe generado el ${new Date().toLocaleDateString("es-CO")}</div>
</div>
</body></html>`;
}

// ── Informe de Rendimiento — extraído de ContenedoresDemo (pestaña
// Rendimientos en App.jsx) por el mismo motivo: generarlo desde "Informe
// General de Proceso" sin montar esa pestaña. Recibe el contenedor y sus
// registros de rendimiento ya filtrados (rendimientos.filter(r => r.contId === cont.id)).
const KG_DEL_MONTE_REND = 16.8;
const KG_PRINCESS_REND  = 15.7;

function parseProveedoresRend(str) {
  if (!str) return [];
  try { const p = JSON.parse(str); return Array.isArray(p) ? p.filter(Boolean) : [str]; }
  catch { return str.split(/[,|]/).map(s => s.trim()).filter(Boolean); }
}

export async function generarInformeRendimientoHtml({ cont, rendsDelCont }) {
  const KG_DEL_MONTE = KG_DEL_MONTE_REND;
  const KG_PRINCESS  = KG_PRINCESS_REND;

  // Merma = (kilos procesados − kg empacados − kg devueltos) / kilos procesados.
  const calcRend = (r) => {
    const kgDM  = r.cajasDelMonte * KG_DEL_MONTE;
    const kgPri = r.cajasPrincess * KG_PRINCESS;
    const kgEmp = kgDM + kgPri;
    const proc  = r.kilosProcesados;
    const rendGen = proc > 0 ? (kgEmp / proc) * 100 : 0;
    const rendDM  = proc > 0 ? (kgDM  / proc) * 100 : 0;
    const rendPri = proc > 0 ? (kgPri / proc) * 100 : 0;
    const merma   = proc > 0 ? ((proc - kgEmp - r.kilosDevueltos) / proc) * 100 : 0;
    return { kgDM, kgPri, kgEmp, rendGen, rendDM, rendPri, merma };
  };

  const totales = rendsDelCont.reduce((acc, r) => {
    const c = calcRend(r);
    return {
      kilosIngresados:   acc.kilosIngresados   + (r.kilosIngresados || 0),
      kilosNoProcesados: acc.kilosNoProcesados + (r.kilosNoProcesados || 0),
      kilosProcesados: acc.kilosProcesados + r.kilosProcesados,
      kilosDevueltos:  acc.kilosDevueltos  + r.kilosDevueltos,
      kilosPrimeraDevueltos: acc.kilosPrimeraDevueltos + (r.kilosPrimeraDevueltos || 0),
      kgEmp:           acc.kgEmp           + c.kgEmp,
      cajasDelMonte:   acc.cajasDelMonte   + r.cajasDelMonte,
      cajasPrincess:   acc.cajasPrincess   + r.cajasPrincess,
    };
  }, { kilosIngresados: 0, kilosNoProcesados: 0, kilosProcesados: 0, kilosDevueltos: 0, kilosPrimeraDevueltos: 0, kgEmp: 0, cajasDelMonte: 0, cajasPrincess: 0 });

  const rendGeneralTotal = totales.kilosProcesados > 0
    ? (totales.kgEmp / totales.kilosProcesados) * 100 : 0;
  const rendDMTotal  = totales.kilosProcesados > 0
    ? ((totales.cajasDelMonte * KG_DEL_MONTE) / totales.kilosProcesados) * 100 : 0;
  const rendPriTotal = totales.kilosProcesados > 0
    ? ((totales.cajasPrincess * KG_PRINCESS)  / totales.kilosProcesados) * 100 : 0;
  const mermaTotal = totales.kilosProcesados > 0
    ? ((totales.kilosProcesados - totales.kgEmp - totales.kilosDevueltos) / totales.kilosProcesados) * 100 : 0;

  const proveedoresCont = parseProveedoresRend(cont?.proveedor);

  const statsPorProveedor = proveedoresCont.map(pv => {
    const recs = rendsDelCont.filter(r => r.proveedor === pv);
    const kgProc = recs.reduce((s,r) => s + r.kilosProcesados, 0);
    const kgDev  = recs.reduce((s,r) => s + r.kilosDevueltos,  0);
    const kgDM   = recs.reduce((s,r) => s + r.cajasDelMonte * KG_DEL_MONTE, 0);
    const kgPri  = recs.reduce((s,r) => s + r.cajasPrincess * KG_PRINCESS,  0);
    const kgEmp  = kgDM + kgPri;
    const rdto   = kgProc > 0 ? (kgEmp / kgProc) * 100 : 0;
    const merma  = kgProc > 0 ? ((kgProc - kgEmp - kgDev) / kgProc) * 100 : 0;
    const cajDM  = recs.reduce((s,r) => s + r.cajasDelMonte, 0);
    const cajPri = recs.reduce((s,r) => s + r.cajasPrincess, 0);
    return { pv, camiones: recs.length, kgProc, kgDev, kgEmp, rdto, merma, cajDM, cajPri };
  });

  const logoSrc = await cargarLogoBase64();
  const fechaHoy = new Date().toLocaleDateString("es-CO", { day:"2-digit", month:"long", year:"numeric" });

  // ── Colores por rendimiento ────────────────────────────────
  const gColor = rendGeneralTotal >= 80 ? "#16a34a" : rendGeneralTotal >= 60 ? "#ca8a04" : "#dc2626";
  const gLabel = rendGeneralTotal >= 80 ? "Excelente" : rendGeneralTotal >= 60 ? "Regular" : "Bajo";

  // ── Medidor CSS (sin SVG) ──────────────────────────────────
  const gaugeBox = `
<div style="text-align:center;padding:22px 16px 18px;">
  <div style="font-size:9px;color:#6b7280;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">Rendimiento General</div>
  <div style="font-size:60px;font-weight:900;color:${gColor};line-height:1;margin-bottom:6px;font-family:'Segoe UI',Arial,sans-serif;">${rendGeneralTotal.toFixed(1)}<span style="font-size:30px;font-weight:700;">%</span></div>
  <div style="margin-bottom:20px;"></div>
  <div style="background:#f0f0f0;border-radius:999px;height:18px;margin:0 6px 5px;overflow:hidden;">
    <div style="height:100%;width:${Math.min(rendGeneralTotal,100).toFixed(2)}%;background:linear-gradient(90deg,#fbbf24 0%,#22c55e 65%,#16a34a 100%);border-radius:999px;"></div>
  </div>
  <div style="display:flex;justify-content:space-between;padding:0 6px;font-size:8px;color:#d1d5db;margin-bottom:16px;font-family:'Segoe UI',Arial,sans-serif;">
    <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
  </div>
  <div style="display:inline-block;padding:5px 20px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;background:${gColor}15;color:${gColor};border:1.5px solid ${gColor}60;font-family:'Segoe UI',Arial,sans-serif;">${gLabel}</div>
</div>`;

  // ── Mini barra para DM/Princesses ────────────────────────────
  const miniGauge = (pct, color, label) => `
<div style="padding:4px 0;">
  <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">${label}</div>
  <div style="font-size:20px;font-weight:800;color:${color};margin-bottom:6px;font-family:'Segoe UI',Arial,sans-serif;">${pct.toFixed(1)}%</div>
  <div style="background:#f0f0f0;border-radius:999px;height:8px;overflow:hidden;">
    <div style="height:100%;width:${Math.min(pct,100).toFixed(2)}%;background:${color};border-radius:999px;"></div>
  </div>
</div>`;

  // ── Info extra del contenedor ────────────────────────────────
  const infoItems = [
    cont.booking    ? `<span><b>Booking:</b> ${cont.booking}</span>`       : "",
    cont.naviera    ? `<span><b>Naviera:</b> ${cont.naviera}</span>`       : "",
    cont.destino    ? `<span><b>Destino:</b> ${cont.destino}</span>`       : "",
    cont.transporte ? `<span><b>Transporte:</b> ${cont.transporte}</span>` : "",
    cont.placa      ? `<span><b>Placa:</b> ${cont.placa}</span>`           : "",
    cont.turno      ? `<span><b>Turno:</b> ${cont.turno}</span>`           : "",
  ].filter(Boolean).join('<span style="color:#cbd5e1;margin:0 6px;">·</span>');

  // ── Split bar DM vs Princesses ─────────────────────────────────
  const totalCajas = totales.cajasDelMonte + totales.cajasPrincess;
  const pctDMc  = totalCajas > 0 ? (totales.cajasDelMonte / totalCajas * 100) : 50;
  const pctPric = 100 - pctDMc;

  // ── Tabla por proveedor ──────────────────────────────────────
  const providerSection = proveedoresCont.length > 1 ? `
<h2>🚚 Rendimiento por proveedor</h2>
<table>
  <thead><tr><th>Proveedor</th><th>Contenedores</th><th>Kg procesados</th><th>Kg devueltos</th><th>Kg empacados</th><th>Cajas</th><th>Rendimiento</th><th>Merma</th></tr></thead>
  <tbody>
  ${statsPorProveedor.map(s => {
    const sc = s.rdto >= 80 ? "#15803d" : s.rdto >= 60 ? "#b45309" : "#b91c1c";
    const mc = s.merma <= 20 ? "#15803d" : s.merma <= 40 ? "#b45309" : "#b91c1c";
    return `<tr>
      <td><span class="pv-badge">${s.pv}</span></td>
      <td>${s.camiones}</td>
      <td>${s.kgProc.toLocaleString("es-CO")} kg</td>
      <td style="color:#b45309;">${s.kgDev.toLocaleString("es-CO")} kg</td>
      <td style="color:#15803d;font-weight:600;">${s.kgEmp.toFixed(1)} kg</td>
      <td>${s.cajDM + s.cajPri} <span class="dim">(${s.cajDM} DM · ${s.cajPri} PRI)</span></td>
      <td><div class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="width:${Math.min(s.rdto,100).toFixed(1)}%;background:${sc};"></div></div><span style="font-weight:700;color:${sc};">${s.rdto.toFixed(1)}%</span></div></td>
      <td style="font-weight:700;color:${mc};">${s.merma.toFixed(1)}%</td>
    </tr>`;
  }).join("")}
  </tbody>
</table>` : "";

  // ── Gráfico de barras por camión ─────────────────────────────
  const truckBars = rendsDelCont.map((r, i) => {
    const c = calcRend(r);
    const rc = c.rendGen >= 80 ? "#15803d" : c.rendGen >= 60 ? "#b45309" : "#b91c1c";
    return `<div style="display:grid;grid-template-columns:140px 1fr 110px;gap:10px;align-items:center;padding:5px 0;border-bottom:1px solid #f8fafc;">
  <div>
    <span style="font-size:11px;font-weight:600;color:#374151;">Contenedor ${i+1}</span>
    ${r.proveedor ? `<span style="background:#ede9fe;color:#6d28d9;border-radius:10px;padding:1px 7px;font-size:9px;font-weight:700;margin-left:4px;">${r.proveedor}</span>` : ""}
    <div style="font-size:9px;color:#94a3b8;">${r.fecha}</div>
  </div>
  <div style="background:#f1f5f9;border-radius:5px;height:16px;overflow:hidden;position:relative;">
    <div style="background:${rc};width:${Math.min(c.rendGen,100).toFixed(1)}%;height:100%;border-radius:5px;opacity:0.85;"></div>
  </div>
  <div style="text-align:right;">
    <span style="font-size:10px;color:#64748b;">${r.kilosProcesados.toLocaleString("es-CO")} kg &nbsp;</span>
    <span style="font-size:13px;font-weight:700;color:${rc};">${c.rendGen.toFixed(1)}%</span>
  </div>
</div>`;
  }).join("");

  // ── Calibres agregados (todos los camiones) ──────────────────
  const calibreAgg = {};
  rendsDelCont.forEach(r => {
    (r.calibres || []).forEach(cal => {
      const calKg = cal.tipo === "cajas"
        ? cal.cantidad * (cal.marca === "Del Monte" ? KG_DEL_MONTE : KG_PRINCESS)
        : Number(cal.cantidad);
      if (!calibreAgg[cal.nombre]) calibreAgg[cal.nombre] = 0;
      calibreAgg[cal.nombre] += calKg;
    });
  });
  const calibreEntries = Object.entries(calibreAgg).sort(([a],[b]) => a.localeCompare(b));

  const calibreSection = calibreEntries.length > 0 ? `
<h2>🎨 Desglose por calibre</h2>
<div class="chart-wrap">
  <div class="calibre-note">ℹ️ Los dos porcentajes usan bases distintas: <b>% procesado</b> es sobre el total de kg procesados; <b>% empacado</b> es sobre el total de kg que <b>quedaron en caja</b>.</div>
  <div class="calibre-grid">
    ${calibreEntries.map(([nombre, kg]) => {
      const pctPro = totales.kilosProcesados > 0 ? (kg / totales.kilosProcesados) * 100 : 0;
      const pctEmp = totales.kgEmp > 0 ? (kg / totales.kgEmp) * 100 : 0;
      const cc = pctPro >= 80 ? "#15803d" : pctPro >= 60 ? "#b45309" : "#374151";
      return `
    <div class="calibre-card">
      <div class="calibre-head">
        <span class="calibre-name">${nombre}</span>
        <span class="calibre-kg">${kg.toFixed(1)} kg</span>
      </div>
      <div class="bar-cell">
        <div class="bar-bg" style="flex:1;width:auto;height:14px;" title="% sobre el total procesado"><div class="bar-fill" style="width:${Math.min(pctPro,100).toFixed(1)}%;background:${cc};"></div></div>
        <span style="font-weight:800;color:${cc};min-width:46px;text-align:right;flex-shrink:0;" title="% sobre el total procesado">${pctPro.toFixed(1)}%</span>
      </div>
      <div class="calibre-sub"><span title="% sobre el total de kg que entraron">% del total procesado (kg crudo)</span> &nbsp;·&nbsp; <b style="color:#6366f1;" title="% sobre el total de kg que quedaron empacados">${pctEmp.toFixed(1)}%</b> del total empacado (kg en caja)</div>
    </div>`;
    }).join("")}
  </div>
</div>` : "";

  // ── Tabla detalle con observaciones ─────────────────────────
  const truckRows = rendsDelCont.map((r, i) => {
    const c = calcRend(r);
    const rc = c.rendGen >= 80 ? "#15803d" : c.rendGen >= 60 ? "#b45309" : "#b91c1c";
    const obsChips = (r.observaciones || []).map(o => `<span class="obs-chip">${o}</span>`).join(" ");
    const obsDetalle = r.obsDetalle ? `<div style="margin-top:3px;font-style:italic;color:#64748b;font-size:10px;">${r.obsDetalle}</div>` : "";
    const obsCell = (obsChips || obsDetalle) ? `${obsChips}${obsDetalle}` : `<span class="dim">—</span>`;
    const calChips = (r.calibres || []).map(cal => {
      const calKg = cal.tipo === "cajas" ? cal.cantidad * (cal.marca === "Del Monte" ? KG_DEL_MONTE : KG_PRINCESS) : Number(cal.cantidad);
      const pct = r.kilosProcesados > 0 ? (calKg / r.kilosProcesados * 100).toFixed(1) : "0.0";
      return `<span style="background:#ede9fe;color:#4c1d95;border-radius:4px;padding:1px 7px;font-size:9px;font-weight:700;margin-right:3px;display:inline-block;">${cal.nombre}: ${pct}%</span>`;
    }).join("");
    const mc = c.merma <= 20 ? "#15803d" : c.merma <= 40 ? "#b45309" : "#b91c1c";
    return `<tr>
  <td class="num-cell">${i+1}</td>
  <td>${r.fecha}</td>
  <td>${r.proveedor ? `<span class="pv-badge">${r.proveedor}</span>` : `<span class="dim">—</span>`}</td>
  <td>${r.kilosProcesados.toLocaleString("es-CO")} kg${r.kilosIngresados > 0 ? `<div style="font-size:9px;color:#94a3b8;font-weight:400;">${r.kilosIngresados.toLocaleString("es-CO")} ingr. − ${(r.kilosNoProcesados || 0).toLocaleString("es-CO")} no proc.</div>` : ""}</td>
  <td style="color:#b45309;">${r.kilosDevueltos.toLocaleString("es-CO")} kg${r.kilosPrimeraDevueltos > 0 ? `<div style="font-size:9px;color:#94a3b8;font-weight:400;">de primera: ${r.kilosPrimeraDevueltos.toLocaleString("es-CO")} kg</div>` : ""}</td>
  <td style="color:#15803d;font-weight:600;">${c.kgEmp.toFixed(1)} kg</td>
  <td>${r.cajasDelMonte > 0 ? `<span class="tag-dm">${r.cajasDelMonte}</span>` : ""}${r.cajasPrincess > 0 ? `<span class="tag-pri">${r.cajasPrincess}</span>` : ""}</td>
  <td><div class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="width:${Math.min(c.rendGen,100).toFixed(1)}%;background:${rc};"></div></div><span style="font-weight:700;color:${rc};">${c.rendGen.toFixed(1)}%</span></div></td>
  <td style="font-weight:700;color:${mc};">${c.merma.toFixed(1)}%</td>
  <td>${calChips || `<span class="dim">—</span>`}</td>
  <td>${obsCell}</td>
</tr>`;
  }).join("");

  // ── HTML completo ────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe de Rendimiento — ${cont.numContenedor}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; color:#111; background:#fff; font-size:13px; }
  .hdr { background:linear-gradient(120deg,#173d1a,#2d7a2d 60%,#3fa142); color:#fff; padding:30px 36px 26px; position:relative; overflow:hidden; }
  .hdr::after { content:"📊"; position:absolute; right:-10px; top:-22px; font-size:130px; opacity:0.12; transform:rotate(12deg); }
  .hdr h1 { font-size:26px; font-weight:800; letter-spacing:-.3px; margin-bottom:4px; position:relative; }
  .hdr .sub { font-size:11px; color:rgba(255,255,255,0.75); margin-top:4px; position:relative; }
  .hdr .badge { display:inline-block; background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.28); border-radius:20px; padding:3px 14px; font-size:10px; font-weight:700; letter-spacing:.5px; margin-bottom:10px; }
  .hdr-top { display:flex; justify-content:space-between; align-items:flex-start; position:relative; }
  .hdr-logo { width:112px; height:112px; object-fit:contain; background:#fff; border-radius:12px; padding:6px; flex-shrink:0; box-shadow:0 4px 14px rgba(0,0,0,0.25); }
  .hdr .pv-tag { display:inline-block; background:rgba(255,255,255,0.14); border:1px solid rgba(255,255,255,0.28); border-radius:20px; padding:3px 11px; font-size:10px; font-weight:600; margin-right:4px; position:relative; }
  .infobar { background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:11px 36px; font-size:11.5px; color:#475569; }
  .body { padding:32px 40px; }
  h2 { font-size:14px; font-weight:700; color:#14532d; margin:34px 0 16px; padding-bottom:8px; border-bottom:2px solid #bbf7d0; text-transform:uppercase; letter-spacing:.5px; }
  h2:first-of-type { margin-top:0; }
  .summary-row { display:grid; grid-template-columns:260px 1fr; gap:28px; margin-bottom:30px; align-items:start; }
  .gauge-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:22px 18px 16px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
  .gauge-sub { font-size:10px; color:#64748b; margin-top:6px; }
  .gauge-types { display:flex; justify-content:center; gap:20px; margin-top:12px; }
  .cards { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .card { border:1px solid #e2e8f0; border-left:3px solid #cbd5e1; border-radius:12px; padding:16px 18px; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
  .card .lbl { font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:.5px; margin-bottom:6px; }
  .card .val { font-size:23px; font-weight:800; color:#1e1b4b; }
  .card .sub2 { font-size:10px; color:#94a3b8; margin-top:4px; }
  .split-wrap { margin-bottom:30px; }
  .split-bar { display:flex; gap:2px; height:16px; border-radius:7px; overflow:hidden; margin-top:9px; background:#fff; }
  .split-bar > div { border-radius:3px; }
  .split-legend { display:flex; gap:20px; font-size:11.5px; }
  .split-dot { width:10px; height:10px; border-radius:2px; display:inline-block; margin-right:4px; vertical-align:middle; }
  table { width:100%; border-collapse:collapse; margin-bottom:8px; }
  th { background:#f1f5f9; text-align:left; padding:10px 14px; font-size:10px; color:#475569; font-weight:700; text-transform:uppercase; letter-spacing:.3px; }
  td { padding:11px 14px; border-bottom:1px solid #f8fafc; font-size:12px; vertical-align:top; }
  tbody tr:nth-child(even) td { background:#fafbfc; }
  tr:hover td { background:#f0fdf4; }
  .num-cell { color:#94a3b8; font-size:11px; font-weight:600; }
  .pv-badge { background:#f0fdf4; color:#15803d; border-radius:10px; padding:2px 8px; font-size:10px; font-weight:700; white-space:nowrap; border:1px solid #bbf7d0; }
  .tag-dm  { background:#dcfce7; color:#15803d; border-radius:4px; padding:1px 7px; font-size:10px; font-weight:700; margin-right:3px; display:inline-block; }
  .tag-pri { background:#fef9c3; color:#854d0e; border-radius:4px; padding:1px 7px; font-size:10px; font-weight:700; display:inline-block; }
  .obs-chip { background:#fef3c7; color:#92400e; border-radius:10px; padding:1px 8px; font-size:9px; font-weight:600; margin-right:3px; display:inline-block; margin-bottom:2px; }
  .dim { color:#cbd5e1; }
  .bar-cell { display:flex; align-items:center; gap:10px; }
  .bar-bg { background:#f1f5f9; border-radius:4px; height:10px; width:70px; overflow:hidden; flex-shrink:0; }
  .bar-fill { height:100%; border-radius:4px; }
  .chart-wrap { background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:22px 24px; margin-bottom:26px; }
  .calibre-note { font-size:10.5px; color:#64748b; background:#eef2f7; border:1px solid #dbe3ec; border-radius:8px; padding:9px 12px; margin-bottom:16px; line-height:1.5; }
  .calibre-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px 28px; }
  .calibre-card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px 18px; }
  .calibre-head { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px; }
  .calibre-name { font-size:16px; font-weight:800; color:#1e1b4b; }
  .calibre-kg { font-size:12px; font-weight:600; color:#15803d; }
  .calibre-sub { font-size:10px; color:#94a3b8; margin-top:8px; }
  .footer { margin-top:36px; padding:18px 36px; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:10px; display:flex; justify-content:space-between; background:#f8fafc; }
  @media print {
    .hdr { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    body { font-size:11.5px; }
    .body { padding:20px 28px; }
    .calibre-grid { grid-template-columns:1fr 1fr; }
  }
</style>
</head>
<body>

<div class="hdr">
  <div class="hdr-top">
    <div class="badge">📊 INFORME DE RENDIMIENTO</div>
    ${logoSrc ? `<img class="hdr-logo" src="${logoSrc}"/>` : ""}
  </div>
  <h1>${cont.numContenedor}</h1>
  <div style="margin-top:8px;">
    ${proveedoresCont.map(p => `<span class="pv-tag">${p}</span>`).join("")}
    ${cont.producto ? `<span class="pv-tag">${cont.producto}</span>` : ""}
    ${cont.estado   ? `<span class="pv-tag">${cont.estado}</span>`   : ""}
  </div>
  <div class="sub">Fecha contenedor: ${cont.fecha} &nbsp;·&nbsp; Generado: ${fechaHoy} &nbsp;·&nbsp; ${rendsDelCont.length} contenedor${rendsDelCont.length !== 1 ? "es" : ""} registrado${rendsDelCont.length !== 1 ? "s" : ""}</div>
</div>

${infoItems ? `<div class="infobar">${infoItems}</div>` : ""}

<div class="body">

<h2>📊 Resumen general</h2>
<div class="summary-row">
  <div class="gauge-box">
    ${gaugeBox}
    ${(totales.cajasDelMonte > 0 || totales.cajasPrincess > 0) ? `
    <div style="border-top:1px solid #f0f0f0;padding:14px 16px 6px;display:grid;grid-template-columns:${(totales.cajasDelMonte > 0 && totales.cajasPrincess > 0) ? "1fr 1fr" : "1fr"};gap:16px;">
      ${totales.cajasDelMonte > 0 ? miniGauge(rendDMTotal,  "#16a34a", "Del Monte") : ""}
      ${totales.cajasPrincess > 0 ? miniGauge(rendPriTotal, "#ca8a04", "Princesses") : ""}
    </div>` : ""}
  </div>
  <div class="cards">
    <div class="card" style="border-left-color:#6366f1;"><div class="lbl">Total cajas</div><div class="val">${totales.cajasDelMonte + totales.cajasPrincess}</div><div class="sub2">${[totales.cajasDelMonte > 0 ? `${totales.cajasDelMonte} Del Monte` : "", totales.cajasPrincess > 0 ? `${totales.cajasPrincess} Princesses` : ""].filter(Boolean).join(" · ")}</div></div>
    ${totales.kilosIngresados > 0 ? `<div class="card" style="border-left-color:#64748b;"><div class="lbl">Kg ingresados total</div><div class="val">${totales.kilosIngresados.toLocaleString("es-CO")}</div><div class="sub2">total del camión</div></div>` : ""}
    ${totales.kilosNoProcesados > 0 ? `<div class="card" style="border-left-color:#64748b;"><div class="lbl">Kg no procesados total</div><div class="val">${totales.kilosNoProcesados.toLocaleString("es-CO")}</div><div class="sub2">no entró a la máquina</div></div>` : ""}
    <div class="card" style="border-left-color:#94a3b8;"><div class="lbl">Kg procesados total</div><div class="val">${totales.kilosProcesados.toLocaleString("es-CO")}</div><div class="sub2">ingresados − no procesados</div></div>
    <div class="card" style="border-left-color:#15803d;"><div class="lbl">Kg empacados total</div><div class="val" style="color:#15803d;">${totales.kgEmp.toFixed(1)}</div><div class="sub2">kg salida</div></div>
    <div class="card" style="border-left-color:#b45309;"><div class="lbl">Devolución del proceso</div><div class="val" style="color:#b45309;">${totales.kilosDevueltos.toLocaleString("es-CO")}</div><div class="sub2">informativo, no afecta el rendimiento</div></div>
    <div class="card" style="border-left-color:${mermaTotal <= 20 ? "#15803d" : mermaTotal <= 40 ? "#ca8a04" : "#dc2626"};"><div class="lbl">Merma</div><div class="val" style="color:${mermaTotal <= 20 ? "#15803d" : mermaTotal <= 40 ? "#ca8a04" : "#dc2626"};">${mermaTotal.toFixed(1)}%</div><div class="sub2">procesado − empacado − devuelto</div></div>
    ${totales.kilosPrimeraDevueltos > 0 ? `<div class="card" style="border-left-color:#94a3b8;"><div class="lbl">Kilos de limón de primera devueltos</div><div class="val">${totales.kilosPrimeraDevueltos.toLocaleString("es-CO")}</div><div class="sub2">procesados y aptos, devueltos por espacio</div></div>` : ""}
  </div>
</div>

${(totales.cajasDelMonte > 0 && totales.cajasPrincess > 0) ? `
<div class="split-wrap">
  <div class="split-legend">
    <span><span class="split-dot" style="background:#6366f1;"></span>Del Monte: <b>${totales.cajasDelMonte} cajas</b> (${pctDMc.toFixed(1)}%)</span>
    <span><span class="split-dot" style="background:#a855f7;"></span>Princesses: <b>${totales.cajasPrincess} cajas</b> (${pctPric.toFixed(1)}%)</span>
  </div>
  <div class="split-bar">
    <div style="background:#6366f1;width:${pctDMc.toFixed(1)}%;"></div>
    <div style="background:#a855f7;width:${pctPric.toFixed(1)}%;"></div>
  </div>
</div>` : ""}

${providerSection}

${calibreSection}

<h2>📈 Rendimiento del proceso</h2>
<div class="chart-wrap">
  ${truckBars}
</div>

<h2>📋 Detalle del contenedor</h2>
<table>
  <thead>
    <tr>
      <th>#</th><th>Fecha</th><th>Proveedor</th><th>Kg proc.</th><th>Devueltos</th>
      <th>Kg emp.</th><th>Cajas</th><th>Rdto.</th><th>Merma</th><th>Calibres</th><th>Observaciones</th>
    </tr>
  </thead>
  <tbody>${truckRows}</tbody>
</table>

</div>

<div class="footer">
  <span>🍋 Tierra Prometida Trading · JARVIS</span>
  <span>Informe generado el ${fechaHoy}</span>
</div>

</body></html>`;
}
