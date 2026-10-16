import { cargarLogoBase64 } from "./informesProceso.js";
import { fechaLocalISO } from "../utils/dates.js";

// Registro de Inspección Pre-Operacional Diario — misma estructura que el
// Excel oficial (Moldes/5.13.08): áreas con sus ítems, Lun..Dom, iniciales del
// encargado, observaciones y 3 firmas.
export const FORMATO_PREOP = {
  titulo:   "REGISTRO DE INSPECCIÓN PRE OPERACIONAL DIARIO",
  empresa:  "Tierra Prometida Trading S.A.S",
  codigo:   "TP-DOP-FOR-001",
  version:  "02",
  vigencia: "30/09/2026",
};

// Responsables que trae impresos el formato oficial.
export const FIRMAS_FORMATO_PREOP = {
  inocuidadNombre: "Cristian Jauregui / Luz Elena Bueno",
  inocuidadCargo:  "Coordinador Inocuidad / Sup. BPM",
  jefeNombre:      "Jose Luis Garcia Munive",
  jefeCargo:       "Jefe de Planta / Operaciones",
};

export const DIAS_PREOP = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

// Los id de cada ítem son lo que se guarda en `marcas`; no cambiarlos aunque
// cambie el texto del ítem, o se pierden las marcas de semanas anteriores.
export const AREAS_PREOP = [
  { area: "RECEPCIÓN", items: [
    ["rec-1", "Piso barrido sin agua estancada, libre de basura, tarimas y bandejas rotas o sucias."],
    ["rec-2", "Paredes y techos limpios, libres de telarañas."],
    ["rec-3", "Sistema de drenaje limpio y libre de olores."],
    ["rec-4", "Botes de basura vacíos y limpios."],
    ["rec-5", "Luminaria protegida, limpia, libre de insectos."],
  ] },
  { area: "BODEGA DE MATERIAL DE EMPAQUE", items: [
    ["bme-1", "Piso barrido, libre de basura, tarimas rotas o sucias."],
    ["bme-2", "Paredes y techos limpios, libres de telarañas, hoyos y cuarteaduras."],
    ["bme-3", "Luminaria protegida, limpia, libre de insectos."],
    ["bme-4", "Paredes no permiten el ingreso de animales."],
  ] },
  { area: "BODEGA DE PRODUCTOS QUÍMICOS Y LIMPIEZA", items: [
    ["bpq-1", "Piso limpio y libre de basura."],
    ["bpq-2", "Paredes y techos limpios, libres de telarañas, hoyos y cuarteaduras."],
    ["bpq-3", "Botas, guantes, visores, delantales, etc. de los empleados, adecuadamente guardados."],
    ["bpq-4", "Equipo para control de derrames completo (arena, escoba, recogedor)."],
  ] },
  { area: "SALA DE EMPAQUE", items: [
    ["emp-1", "Piso barrido sin agua estancada, libre de basura, tarimas rotas o sucias."],
    ["emp-2", "Drenajes limpios y libres de desperdicios del producto."],
    ["emp-3", "Paredes y techos limpios, libres de telarañas, hoyos y cuarteaduras."],
    ["emp-4", "Luminaria protegida, limpia, libre de insectos."],
    ["emp-5", "Equipo limpio, sanitizado y libre de desperdicio de producto."],
    ["emp-6", "Ningún reparo momentáneo o lubricación excesiva de equipo."],
    ["emp-7", "Botes de basura vacíos y limpios."],
    ["emp-8", "Estaciones de alcohol gel llenas y operativas."],
  ] },
  { area: "CUARTOS FRÍOS", items: [
    ["cf-1", "Piso limpio, libre de lodo, basura y desperdicio de producto."],
    ["cf-2", "Paredes y techos limpios y libres de hongo."],
    ["cf-3", "No cajas ni paletas por debajo del equipo de frío."],
    ["cf-4", "Cortinas plásticas limpias e intactas."],
    ["cf-5", "Luminaria protegida, limpia, libre de insectos."],
  ] },
  { area: "SERVICIOS HIGIÉNICOS", items: [
    ["sh-1", "Pisos limpios y libres de basura."],
    ["sh-2", "Lavamanos, excusados y urinarios limpios y operativos."],
    ["sh-3", "Espejos limpios e intactos."],
    ["sh-4", "Jabón y toallas de papel para mano disponibles."],
    ["sh-5", "Botes de basura vacíos y limpios."],
    ["sh-6", "Papel de baño en lugar adecuado solamente."],
  ] },
  { area: "ÁREA DE LAVADO DE MANOS", items: [
    ["lm-1", "Pisos limpios y libres de basura."],
    ["lm-2", "Estaciones de alcohol gel llenas y operativas."],
    ["lm-3", "Jabón y toallas de papel para mano disponibles."],
    ["lm-4", "Botes de basura vacíos y limpios."],
    ["lm-5", "Pediluvio operativo con agua y cloro."],
    ["lm-6", "Luminaria protegida, limpia, libre de insectos."],
  ] },
  { area: "ÁREA DE INGRESO DE PERSONAL", items: [
    ["ip-1", "Pisos limpios y libres de basura."],
    ["ip-2", "Lavabotas limpio con cepillo y detergente."],
  ] },
  { area: "VESTIDORES", items: [
    ["ves-1", "Pisos limpios y libres de basura."],
    ["ves-2", "Paredes y techos."],
    ["ves-3", "Uniformes ordenados."],
  ] },
  { area: "BODEGA", items: [
    ["bod-1", "Piso limpio y libre de basura."],
  ] },
  { area: "ÁREA DE DESCARTE", items: [
    ["des-1", "Pisos libres de desperdicios, desechos y malos olores."],
    ["des-2", "Piso libre de agua estancada."],
    ["des-3", "Libre de canastas plásticas rotas y sucias."],
    ["des-4", "Libre de tarimas rotas y sucias."],
  ] },
];

export const TOTAL_ITEMS_PREOP = AREAS_PREOP.reduce((s, a) => s + a.items.length, 0);

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const aFecha = (iso) => new Date(iso + "T12:00:00");

// Lunes de la semana de cualquier fecha ISO.
export function lunesDe(iso) {
  if (!iso) return "";
  const d = aFecha(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return fechaLocalISO(d);
}

// Las 7 fechas ISO (Lun..Dom) de la semana que empieza en `lunesISO`.
export function fechasSemana(lunesISO) {
  if (!lunesISO) return [];
  return DIAS_PREOP.map((_, i) => { const d = aFecha(lunesISO); d.setDate(d.getDate() + i); return fechaLocalISO(d); });
}

// "Semana del 12 al 18 de octubre de 2026" (o "del 28 de septiembre al 4 de octubre de 2026").
export function textoSemana(lunesISO) {
  if (!lunesISO) return "Semana sin definir";
  const f = fechasSemana(lunesISO).map(aFecha);
  const [a, b] = [f[0], f[6]];
  if (a.getFullYear() !== b.getFullYear())
    return `Semana del ${a.getDate()} de ${MESES[a.getMonth()]} de ${a.getFullYear()} al ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`;
  if (a.getMonth() !== b.getMonth())
    return `Semana del ${a.getDate()} de ${MESES[a.getMonth()]} al ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`;
  return `Semana del ${a.getDate()} al ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`;
}

// Conteos de una inspección: ítems que no cumplen y días con al menos una marca.
export function resumenPreop(marcas) {
  let noCumple = 0;
  const diasConMarca = new Set();
  for (const fila of Object.values(marcas || {})) {
    (fila || []).forEach((v, i) => {
      if (v) diasConMarca.add(i);
      if (v === "NC") noCumple++;
    });
  }
  return { noCumple, diasInspeccionados: diasConMarca.size };
}

const esc = (v) => String(v ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const fmtFecha = (f) => {
  if (!f) return "";
  const [y, m, d] = f.split("-");
  return `${d}/${m}/${y}`;
};

export function nombreArchivoPreop(insp) {
  return `${FORMATO_PREOP.codigo}_Inspeccion-PreOperacional_${insp.semanaInicio || "sin-semana"}.html`;
}

export async function generarInformePreopHtml(insp) {
  const logoSrc = await cargarLogoBase64();
  const F = FORMATO_PREOP;
  const fechas = fechasSemana(insp.semanaInicio);
  const marcas = insp.marcas || {};

  const celda = (v) => v === "C" ? `<td class="c ok">✓</td>` : v === "NC" ? `<td class="c nc">✗</td>` : `<td class="c"></td>`;

  const filas = AREAS_PREOP.map(a => `
    <tr class="area"><td colspan="8">${esc(a.area)}</td></tr>
    ${a.items.map(([id, texto]) => `<tr><td class="item">${esc(texto)}</td>${DIAS_PREOP.map((_, i) => celda(marcas[id]?.[i])).join("")}</tr>`).join("")}`).join("");

  const firma = (titulo, nombre, cargo, fecha, img) => `
    <div class="firma">
      <div class="firma-tit">${esc(titulo)}</div>
      <div class="firma-campo"><b>Nombre:</b> ${esc(nombre) || "&nbsp;"}</div>
      <div class="firma-campo"><b>Cargo:</b> ${esc(cargo) || "&nbsp;"}</div>
      <div class="firma-img">${img ? `<img src="${img}" alt="Firma" />` : ""}</div>
      <div class="firma-campo linea"><b>Firma</b></div>
      <div class="firma-campo"><b>Fecha:</b> ${fmtFecha(fecha) || "&nbsp;"}</div>
    </div>`;

  const { noCumple } = resumenPreop(marcas);

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>${esc(F.codigo)} — ${esc(textoSemana(insp.semanaInicio))}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,sans-serif;color:#1f2937;background:#eef0f3;font-size:10.5px}
.sheet{max-width:860px;margin:18px auto;background:#fff;padding:24px 28px;box-shadow:0 4px 18px rgba(0,0,0,0.08)}
table{width:100%;border-collapse:collapse}
td,th{border:1px solid #9ca3af;padding:3px 6px;vertical-align:middle}
.hdr td{font-size:10.5px}
.hdr .logo{width:130px;text-align:center}
.hdr .logo img{max-width:110px;max-height:62px;object-fit:contain}
.hdr .titulo{text-align:center;font-weight:800;font-size:13px;color:#173d1a;line-height:1.35}
.hdr .k{width:170px;font-weight:700;color:#374151;background:#f3f4f6}
.semana{margin:12px 0 8px;font-weight:700;font-size:11.5px;color:#111827}
.insp th{background:#173d1a;color:#fff;font-size:10px;font-weight:800;text-align:center}
.insp th.item{text-align:left}
.insp th small{display:block;font-weight:600;opacity:0.85}
.insp .area td{background:#eaf3e5;font-weight:800;color:#173d1a;font-size:10px;letter-spacing:0.2px}
.insp .item{line-height:1.3}
.insp .c{width:44px;text-align:center;font-weight:900;font-size:12px}
.insp .ok{color:#166534}
.insp .nc{color:#b91c1c;background:#fee2e2}
.insp .ini td{background:#eaf3e5;font-weight:800}
.insp .ini td.c{background:#fff;font-size:10px;font-weight:700}
.leyenda{margin-top:5px;font-size:9.5px;color:#4b5563}
h2{margin:14px 0 0;background:#173d1a;color:#fff;font-size:11px;font-weight:800;padding:6px 10px;letter-spacing:0.3px}
.sec{border:1px solid #9ca3af;border-top:none;padding:9px 12px}
.texto{white-space:pre-wrap;line-height:1.5;min-height:50px;color:#111827}
.vacio{color:#9ca3af;font-style:italic}
.firmas{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #9ca3af;border-top:none}
.firma{padding:9px 11px;border-right:1px solid #9ca3af;display:flex;flex-direction:column;gap:5px}
.firma:last-child{border-right:none}
.firma-tit{font-weight:800;color:#173d1a;font-size:10px;min-height:26px;text-transform:uppercase;letter-spacing:0.2px}
.firma-campo{font-size:10px}
.firma-img{height:62px;display:flex;align-items:flex-end;justify-content:center}
.firma-img img{max-height:62px;max-width:100%;object-fit:contain}
.linea{border-top:1.5px solid #374151;padding-top:3px;text-align:center}
.pie{margin-top:12px;font-size:9.5px;color:#6b7280;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
@media print{
  body{background:#fff}
  .sheet{margin:0;max-width:100%;box-shadow:none;padding:0}
  .insp tr,.firmas,.sec,h2{break-inside:avoid}
  .insp thead{display:table-header-group}
  .insp th,.insp .area td,.insp .nc,.insp .ini td,h2,.hdr .k{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4;margin:10mm}
}
</style></head><body>
<div class="sheet">

  <table class="hdr">
    <tr>
      <td class="logo" rowspan="3">${logoSrc ? `<img src="${logoSrc}" alt="Tierra Prometida" />` : esc(F.empresa)}</td>
      <td class="titulo" rowspan="3">${esc(F.titulo)}</td>
      <td class="k">CÓDIGO: ${esc(F.codigo)}</td>
    </tr>
    <tr><td class="k">VERSIÓN: ${esc(F.version)}</td></tr>
    <tr><td class="k">VIGENCIA: ${esc(F.vigencia)}</td></tr>
  </table>

  <div class="semana">${esc(textoSemana(insp.semanaInicio))}${noCumple ? ` · <span style="color:#b91c1c">${noCumple} ítem${noCumple === 1 ? "" : "s"} no cumple${noCumple === 1 ? "" : "n"}</span>` : ""}</div>

  <table class="insp">
    <thead>
      <tr>
        <th class="item">ÁREA</th>
        ${DIAS_PREOP.map((d, i) => `<th class="c">${d}<small>${fechas[i] ? aFecha(fechas[i]).getDate() : ""}</small></th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${filas}
      <tr class="ini"><td>INICIALES DEL ENCARGADO</td>${DIAS_PREOP.map((_, i) => `<td class="c">${esc(insp.iniciales?.[i] || "")}</td>`).join("")}</tr>
    </tbody>
  </table>
  <div class="leyenda">✓ Cumple · ✗ No cumple · casilla vacía: no se inspeccionó ese día</div>

  <h2>OBSERVACIONES</h2>
  <div class="sec"><div class="texto">${insp.observaciones ? esc(insp.observaciones) : `<span class="vacio">Sin observaciones</span>`}</div></div>

  <h2>FIRMAS</h2>
  <div class="firmas">
    ${firma("Realizó la actividad (Operario / Inspector)", insp.realizoNombre, insp.realizoCargo, insp.realizoFecha, insp.firmaRealizo)}
    ${firma("Visto bueno de Inocuidad y Calidad", insp.inocuidadNombre, insp.inocuidadCargo, insp.inocuidadFecha, insp.firmaInocuidad)}
    ${firma("Aprobación Jefe de Planta / Operaciones", insp.jefeNombre, insp.jefeCargo, insp.jefeFecha, insp.firmaJefe)}
  </div>

  <div class="pie">
    <span>Documento controlado | ${esc(F.empresa)} | ${esc(F.codigo)} | V${esc(F.version)}</span>
    <span>${insp.registradoPor ? `Registrado por ${esc(insp.registradoPor)} · ` : ""}Generado el ${new Date().toLocaleString("es-CO")}</span>
  </div>
</div>
</body></html>`;
}
