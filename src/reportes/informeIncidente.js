import { cargarLogoBase64 } from "./informesProceso.js";

// Informe imprimible del formato NUOCA (TP-DOP-REG-021) — misma estructura que
// el Word oficial: encabezado de control documental, 6 secciones y 3 firmas.
export const FORMATO_NUOCA = {
  titulo:      "REGISTRO DE AVISO DE INCIDENCIA INUSUAL Y ACCIONES CORRECTIVAS (NUOCA)",
  empresa:     "Tierra Prometida Trading S.A.S.",
  proceso:     "Sistema Administrativo de Inocuidad Alimentaria (SAIA) / Operaciones",
  estandar:    "PrimusGFS v3.2 - Módulo 1 (Aviso de Incidencia Inusual / NUOCA - 5 Puntos)",
  codigo:      "TP-DOP-REG-021",
  version:     "01",
  vigencia:    "30/06/2026",
  custodia:    "Coordinación de Inocuidad y Calidad / Mando Medio de Turno",
};

const esc = (v) => String(v ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const fmtFecha = (f) => {
  if (!f) return "";
  const [y, m, d] = f.split("-");
  return `${d}/${m}/${y}`;
};

export function nombreArchivoIncidente(inc) {
  return `NUOCA_${FORMATO_NUOCA.codigo}_${inc.fecha || "sin-fecha"}${inc.id && inc.id !== "new" ? `_${inc.id}` : ""}.html`;
}

export async function generarInformeIncidenteHtml(inc, tiposCatalogo) {
  const logoSrc = await cargarLogoBase64();
  const F = FORMATO_NUOCA;

  const tiposHtml = tiposCatalogo.map(t => {
    const on = inc.tipos.includes(t);
    const texto = t === "Otro" ? `Otro: ${on && inc.tipoOtro ? `<u>${esc(inc.tipoOtro)}</u>` : "__________________"}` : esc(t);
    return `<div class="tipo${on ? " on" : ""}"><span class="box">${on ? "X" : ""}</span>${texto}</div>`;
  }).join("");

  const bloqueTexto = (v) => `<div class="texto">${v ? esc(v) : `<span class="vacio">Sin diligenciar</span>`}</div>`;

  const firma = (titulo, nombre, cargo, fecha, img) => `
    <div class="firma">
      <div class="firma-tit">${esc(titulo)}</div>
      <div class="firma-campo"><b>Nombre:</b> ${esc(nombre) || "&nbsp;"}</div>
      <div class="firma-campo"><b>Cargo:</b> ${esc(cargo) || "&nbsp;"}</div>
      <div class="firma-img">${img ? `<img src="${img}" alt="Firma" />` : ""}</div>
      <div class="firma-campo linea"><b>Firma</b></div>
      <div class="firma-campo"><b>Fecha:</b> ${fmtFecha(fecha) || "&nbsp;"}</div>
    </div>`;

  const cerrado = !!inc.verificacionFecha;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>${esc(F.codigo)} — Incidente ${esc(fmtFecha(inc.fecha))}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,sans-serif;color:#1f2937;background:#eef0f3;font-size:11.5px}
.sheet{max-width:860px;margin:18px auto;background:#fff;padding:26px 30px;box-shadow:0 4px 18px rgba(0,0,0,0.08)}
table{width:100%;border-collapse:collapse}
td,th{border:1px solid #9ca3af;padding:6px 8px;vertical-align:middle}
.hdr td{font-size:10.5px}
.hdr .logo{width:120px;text-align:center}
.hdr .logo img{max-width:100px;max-height:70px;object-fit:contain}
.hdr .titulo{text-align:center;font-weight:800;font-size:13px;color:#173d1a;line-height:1.35}
.hdr .k{background:#f3f4f6;font-weight:700;width:150px;color:#374151}
.estado{display:inline-block;margin-top:10px;border-radius:6px;padding:4px 10px;font-weight:800;font-size:10.5px;letter-spacing:0.3px}
.estado.abierto{background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5}
.estado.cerrado{background:#dcfce7;color:#166534;border:1px solid #86efac}
.instr{margin-top:12px;background:#f9fafb;border:1px solid #d1d5db;border-left:4px solid #173d1a;padding:9px 12px;font-size:10.5px;line-height:1.5;color:#374151}
.instr b{display:block;margin-bottom:3px;color:#173d1a}
h2{margin:18px 0 0;background:#173d1a;color:#fff;font-size:11.5px;font-weight:800;padding:7px 10px;letter-spacing:0.3px}
.sec{border:1px solid #9ca3af;border-top:none;padding:10px 12px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px}
.campo{display:flex;gap:6px;border-bottom:1px solid #e5e7eb;padding:4px 0}
.campo b{white-space:nowrap;color:#374151}
.tipos{display:grid;grid-template-columns:1fr 1fr;gap:7px 18px}
.tipo{display:flex;align-items:center;gap:8px;color:#4b5563}
.tipo.on{color:#111827;font-weight:700}
.box{width:16px;height:16px;border:1.5px solid #374151;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;flex-shrink:0}
.lbl{font-weight:700;color:#374151;margin-bottom:6px}
.texto{white-space:pre-wrap;line-height:1.55;min-height:60px;color:#111827}
.vacio{color:#9ca3af;font-style:italic}
.firmas{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #9ca3af;border-top:none}
.firma{padding:10px 12px;border-right:1px solid #9ca3af;display:flex;flex-direction:column;gap:5px}
.firma:last-child{border-right:none}
.firma-tit{font-weight:800;color:#173d1a;font-size:10.5px;min-height:28px;text-transform:uppercase;letter-spacing:0.2px}
.firma-campo{font-size:10.5px}
.firma-img{height:70px;display:flex;align-items:flex-end;justify-content:center}
.firma-img img{max-height:70px;max-width:100%;object-fit:contain}
.linea{border-top:1.5px solid #374151;padding-top:3px;text-align:center}
.pie{margin-top:14px;font-size:9.5px;color:#6b7280;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
@media print{
  body{background:#fff}
  .sheet{margin:0;max-width:100%;box-shadow:none;padding:0}
  h2,.firmas,.sec{break-inside:avoid}
  h2{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .hdr .k,.estado,.instr{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4;margin:12mm}
}
</style></head><body>
<div class="sheet">

  <table class="hdr">
    <tr>
      <td class="logo" rowspan="4">${logoSrc ? `<img src="${logoSrc}" alt="Tierra Prometida" />` : esc(F.empresa)}</td>
      <td class="titulo" colspan="2">${esc(F.titulo)}</td>
    </tr>
    <tr><td class="k">Empresa</td><td>${esc(F.empresa)}</td></tr>
    <tr><td class="k">Proceso / Área</td><td>${esc(F.proceso)}</td></tr>
    <tr><td class="k">Estándar / Pregunta de Auditoría</td><td>${esc(F.estandar)}</td></tr>
  </table>
  <table class="hdr" style="border-top:none">
    <tr>
      <td class="k">Código del Formato</td><td>${esc(F.codigo)}</td>
      <td class="k" style="width:80px">Versión</td><td style="width:60px">${esc(F.version)}</td>
      <td class="k" style="width:80px">Vigencia</td><td style="width:100px">${esc(F.vigencia)}</td>
    </tr>
    <tr><td class="k">Responsable de Custodia</td><td colspan="5">${esc(F.custodia)}</td></tr>
  </table>

  <span class="estado ${cerrado ? "cerrado" : "abierto"}">${cerrado ? `CERRADO — verificado el ${fmtFecha(inc.verificacionFecha)}` : "ABIERTO — pendiente de verificación de Inocuidad"}</span>

  <div class="instr">
    <b>INSTRUCTIVO DE DILIGENCIAMIENTO RÁPIDO</b>
    Este formato debe ser diligenciado de manera inmediata por el supervisor, monitor de calidad u operario ante cualquier evento inusual o infrecuente que pueda comprometer la inocuidad del limón, la seguridad del personal o la continuidad de la planta.
  </div>

  <h2>1. DATOS GENERALES DEL INCIDENTE</h2>
  <div class="sec grid2">
    <div class="campo"><b>Fecha y Hora del Incidente:</b> ${esc(fmtFecha(inc.fecha))}${inc.hora ? ` — ${esc(inc.hora)}` : ""}</div>
    <div class="campo"><b>Lugar / Área Específica:</b> ${esc(inc.lugar)}</div>
    <div class="campo"><b>Nombre de Quien Reporta:</b> ${esc(inc.reportaNombre)}</div>
    <div class="campo"><b>Cargo de Quien Reporta:</b> ${esc(inc.reportaCargo)}</div>
    <div class="campo"><b>Lote de Fruta o Proceso Afectado:</b> ${esc(inc.loteAfectado)}</div>
    <div class="campo"><b>Línea / Maquinaria Involucrada:</b> ${esc(inc.lineaMaquinaria)}</div>
  </div>

  <h2>2. TIPO DE INCIDENCIA INUSUAL</h2>
  <div class="sec tipos">${tiposHtml}</div>

  <h2>3. DESCRIPCIÓN DETALLADA DEL EVENTO Y EVALUACIÓN DE INOCUIDAD</h2>
  <div class="sec">
    <div class="lbl">Descripción de lo Ocurrido (Causas preliminares, impacto observado y riesgo sobre la fruta):</div>
    ${bloqueTexto(inc.descripcion)}
  </div>

  <h2>4. ACCIONES CORRECTIVAS INMEDIATAS (CORRECCIÓN Y DISPOSICIÓN DEL PRODUCTO)</h2>
  <div class="sec">
    <div class="lbl">Medidas tomadas en el acto (Detención de línea, aislamiento de producto, retención, limpieza o descarte):</div>
    ${bloqueTexto(inc.accionesCorrectivas)}
  </div>

  <h2>5. ACCIONES PREVENTIVAS Y SEGUIMIENTO (PARA EVITAR REPETICIÓN)</h2>
  <div class="sec">
    <div class="lbl">Acciones a mediano plazo, cambios en procedimientos, capacitaciones o reparaciones requeridas:</div>
    ${bloqueTexto(inc.accionesPreventivas)}
  </div>

  <h2>6. VERIFICACIÓN, LIBERACIÓN Y FIRMAS DE CIERRE</h2>
  <div class="firmas">
    ${firma("Reportó Incidente", inc.reportaNombre, inc.reportaCargo, inc.fecha, inc.firmaReporta)}
    ${firma("Supervisión de Planta / Mantenimiento", inc.supervisionNombre, inc.supervisionCargo, inc.supervisionFecha, inc.firmaSupervision)}
    ${firma("Verificación e Inocuidad (Líder HACCP)", inc.verificacionNombre, inc.verificacionCargo, inc.verificacionFecha, inc.firmaVerificacion)}
  </div>

  <div class="pie">
    <span>${esc(F.codigo)} · Versión ${esc(F.version)} · Vigencia ${esc(F.vigencia)}</span>
    <span>${inc.registradoPor ? `Registrado por ${esc(inc.registradoPor)} · ` : ""}Generado el ${new Date().toLocaleString("es-CO")}</span>
  </div>
</div>
</body></html>`;
}
