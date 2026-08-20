import { useState, useEffect, useMemo, useRef } from "react";
import QRCode from "qrcode";
import CustomSelect from "./CustomSelect.jsx";
import LimonLoader from "./LimonLoader.jsx";
import { btnSecundario, btnPrimario, btnTablaEditar, btnTablaEliminar } from "./buttonStyles.js";
import { useRecepciones } from "../hooks/useRecepciones.js";
import { fechaLocalISO } from "../utils/dates.js";

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

// Mismos helpers de cámara que usa Verificación de Pallets — se duplican
// aquí (son pequeños y sin dependencias) en vez de exportarlos, para no
// acoplar este módulo al de Packing List.
function mensajeErrorCamara(err) {
  if (!window.isSecureContext) {
    return "El navegador solo permite usar la cámara en sitios seguros (https://). Esta página se está abriendo sin HTTPS.";
  }
  const nombre = err?.name || "";
  if (nombre === "NotAllowedError" || nombre === "PermissionDeniedError") {
    return "El navegador bloqueó el permiso de cámara. Revisa los permisos del sitio (ícono de candado o ajustes del navegador) y vuelve a intentar.";
  }
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
    return "No se encontró una cámara trasera en este dispositivo.";
  }
  if (nombre === "NotReadableError" || nombre === "TrackStartError") {
    return "La cámara está siendo usada por otra app o pestaña. Ciérrala e intenta de nuevo.";
  }
  return "No se pudo acceder a la cámara.";
}

function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close();
  } catch { /* beep opcional — si el navegador bloquea audio, seguimos sin sonido */ }
}

const nombreUsuarioSesion = () => {
  try { return JSON.parse(localStorage.getItem("tp_session"))?.nombre || ""; } catch { return ""; }
};

const TIPOS = [
  { value: "entrada", label: "Entrada de fruta" },
  { value: "salida",  label: "Salida de fruta"  },
];

const TIPOS_CANASTILLA = [
  { value: "2",   label: "2 kg"   },
  { value: "2.4", label: "2.4 kg" },
];

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function nuevaTipoCanastilla() {
  return { tipo: "2", cantidad: "" };
}

// Compatibilidad con estibas guardadas antes de soportar mezcla de tipos
// (tenían un solo tipoCanastilla/cantCanastillas en vez del arreglo canastillas).
function canastillasDeEstiba(e) {
  if (Array.isArray(e.canastillas) && e.canastillas.length) return e.canastillas;
  if (e.tipoCanastilla != null || e.cantCanastillas != null) {
    return [{ tipo: e.tipoCanastilla ?? "2", cantidad: e.cantCanastillas ?? "" }];
  }
  return [nuevaTipoCanastilla()];
}

function pesoCanastillasEstiba(e) {
  return canastillasDeEstiba(e).reduce((s, c) => s + num(c.cantidad) * num(c.tipo), 0);
}

// El descuento de la estiba es el resultado de sumar peso canastillas + peso estiba
function descuentoEstiba(e) {
  return pesoCanastillasEstiba(e) + num(e.pesoEstiba);
}

function pesoNetoEstiba(e) {
  return num(e.pesoBruto) - descuentoEstiba(e);
}

function nuevaEstiba(numero) {
  return {
    numero,
    pesoBruto: "",
    estibaPlastica: "no",
    canastillas: [nuevaTipoCanastilla()],
    pesoEstiba: "",
    usada: false, usadaPor: "", usadaEn: "",
  };
}

// Prefijo propio del QR de la tirilla de estiba (distinto al "TPQR" de las
// tirillas de pallet), para que el escáner sepa a qué se está leyendo.
const QR_ESTIBA_PREFIX = "TPRE";
function textoQrEstiba(recepcionId, numeroEstiba) {
  return `${QR_ESTIBA_PREFIX}|${recepcionId}|${numeroEstiba}`;
}

function formVacio() {
  const hoy = fechaLocalISO();
  return {
    remision: "", fecha: hoy, tipo: "entrada",
    placa: "", conductor: "", cedulaConductor: "", origen: "", proveedor: "", supervisor: "",
    horaInicio: "", horaFin: "", observaciones: "",
    estibas: [nuevaEstiba(1)],
  };
}

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c])); }

const kg = (n) => Number(n || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 });

// Paleta por tipo — entrada en verde (tema histórico del módulo), salida en
// ámbar (mismo acento que ya usa el chip "Salida" del historial y el informe
// de Cargue de Camión), así entradas y salidas se distinguen de un vistazo
// aunque se impriman sin el chip de color.
const TEMA_RECEPCION = {
  entrada: {
    dark:"#173d1a", mid:"#1D6F42", light:"#3fa142",
    estadoBg:"#e9f7ef", totalboxBg:"#e8f5e9", echipBg:"#eef7ee", echipBorder:"#cfe3cf",
    divider:"#dfe8df", label:"⬇️ Informe de Entrada de Fruta", tituloDoc:"Entrada de Fruta",
  },
  salida: {
    dark:"#7a3d05", mid:"#c2620a", light:"#e8862c",
    estadoBg:"#fdf3e7", totalboxBg:"#fdf0e0", echipBg:"#fdf3e7", echipBorder:"#f3d9b8",
    divider:"#f0e3d3", label:"⬆️ Informe de Salida de Fruta", tituloDoc:"Salida de Fruta",
  },
};

async function generarInformeHTML(r) {
  const logoSrc  = await cargarLogoBase64();
  const fmtFecha = r.fecha ? new Date(r.fecha + "T12:00:00").toLocaleDateString("es-CO", { day:"2-digit", month:"long", year:"numeric" }) : "—";
  const t = TEMA_RECEPCION[r.tipo] || TEMA_RECEPCION.entrada;

  const pesoBrutoTotal = r.estibas.reduce((s, e) => s + num(e.pesoBruto), 0);
  const descuentoTotal = r.estibas.reduce((s, e) => s + descuentoEstiba(e), 0);
  const canastillasTotal = r.estibas.reduce((s, e) => s + canastillasDeEstiba(e).reduce((a, c) => a + num(c.cantidad), 0), 0);

  const estibaCards = r.estibas.map(e => {
    const tipos  = canastillasDeEstiba(e);
    const chips  = tipos.filter(c => num(c.cantidad) > 0).map(c =>
      `<span class="echip">${num(c.tipo).toLocaleString("es-CO",{maximumFractionDigits:1})} kg × ${num(c.cantidad)}</span>`
    ).join("");
    return `<div class="estiba-card">
      <div class="estiba-top"><span class="eid">Estiba #${esc(e.numero)}</span><span class="eneto">${kg(pesoNetoEstiba(e))} kg neto</span></div>
      ${chips ? `<div class="echips">${chips}</div>` : ""}
      <div class="erow"><span>Peso bruto</span><b>${kg(e.pesoBruto)} kg</b></div>
      <div class="erow"><span>Estiba plástica</span><b>${e.estibaPlastica==="si" ? "Sí" : "No"}</b></div>
      <div class="erow"><span>Peso canastillas</span><b>${kg(pesoCanastillasEstiba(e))} kg</b></div>
      <div class="erow"><span>Peso estiba</span><b>${kg(e.pesoEstiba)} kg</b></div>
      <div class="erow"><span>Descuento total</span><b>${kg(descuentoEstiba(e))} kg</b></div>
    </div>`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t.tituloDoc} ${esc(r.remision || r.id)} - Tierra Prometida</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,sans-serif;color:#1e2b1e;background:#f4f7f3;font-size:12px}
.sheet{max-width:960px;margin:0 auto;background:#fff}

.banner{background:linear-gradient(120deg,${t.dark},${t.mid} 60%,${t.light});color:#fff;padding:30px 34px 26px;position:relative;overflow:hidden}
.banner::after{content:"🍋";position:absolute;right:-10px;top:-22px;font-size:130px;opacity:0.12;transform:rotate(12deg)}
.banner-row{display:flex;align-items:center;justify-content:space-between;gap:16px;position:relative}
.banner img{width:58px;height:58px;object-fit:contain;background:#fff;border-radius:12px;padding:6px;box-shadow:0 4px 14px rgba(0,0,0,0.25)}
.banner h1{font-size:22px;font-weight:800;letter-spacing:0.2px}
.banner .sub{font-size:11.5px;opacity:0.88;margin-top:4px}
.banner .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;position:relative}
.banner .chip{background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.28);border-radius:20px;padding:5px 12px;font-size:10.5px;font-weight:600}

.estado-bar{margin:0 34px;margin-top:-16px;position:relative;background:${t.estadoBg};border:1px solid ${t.mid}33;color:${t.mid};border-radius:12px;padding:12px 18px;font-weight:700;font-size:12.5px;box-shadow:0 6px 18px rgba(0,0,0,0.08)}

.content{padding:28px 34px 8px}

.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:26px}
.card{background:#fbfdfb;border:1px solid #e2ede2;border-radius:12px;padding:14px 10px;text-align:center}
.card-ic{font-size:16px;margin-bottom:2px}
.card-val{font-size:18px;font-weight:800;color:${t.mid};line-height:1.15}
.card-lbl{font-size:8.5px;color:#5a5a5a;margin-top:4px;text-transform:uppercase;letter-spacing:0.4px}

h2{display:flex;align-items:center;gap:8px;color:${t.dark};font-size:13.5px;font-weight:800;margin:26px 0 12px;text-transform:uppercase;letter-spacing:0.3px}
h2::after{content:"";flex:1;height:1px;background:${t.divider}}

.info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:8px}
.info-item{background:#fbfdfb;border:1px solid #e2ede2;border-radius:10px;padding:10px 14px}
.info-item .l{font-size:9px;color:#5a5a5a;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px}
.info-item .v{font-size:13px;font-weight:700;color:#1a1a1a}

.estiba-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.estiba-card{border:1px solid ${t.divider};border-left:4px solid ${t.mid};border-radius:10px;padding:12px 14px;background:#fbfdfb;break-inside:avoid}
.estiba-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.eid{font-weight:800;font-size:12px;color:${t.dark}}
.eneto{font-size:11px;font-weight:800;color:${t.mid}}
.echips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.echip{border:1px solid ${t.echipBorder};background:${t.echipBg};color:${t.mid};border-radius:6px;padding:2px 8px;font-size:9.5px;font-weight:700}
.erow{display:flex;justify-content:space-between;font-size:10.5px;color:#555;padding:3px 0;border-bottom:1px dashed #eef2ee}
.erow:last-child{border-bottom:none}
.erow b{color:#222}

.total{display:flex;justify-content:flex-end;margin-top:20px;gap:10px;flex-wrap:wrap}
.totalbox{background:${t.totalboxBg};border:2px solid ${t.mid};border-radius:10px;padding:12px 22px;text-align:right}
.totalbox.alt{background:#fbfdfb;border:1px solid #e2ede2}
.totalbox .l{font-size:10px;color:${t.mid};text-transform:uppercase;letter-spacing:0.5px}
.totalbox.alt .l{color:#5a5a5a}
.totalbox .v{font-size:22px;font-weight:800;color:${t.mid}}
.totalbox.alt .v{font-size:16px;color:#333;font-weight:800}

.obs{background:#fbfdfb;border:1px solid #e2ede2;border-left:4px solid ${t.light};border-radius:10px;padding:12px 16px;font-size:11.5px;margin-top:4px;white-space:pre-wrap;color:#333}
.firma-row{display:flex;gap:20px;margin-top:26px}
.firma-box{flex:1}
.firma-line{border-bottom:1.5px solid #b8c8b8;height:34px}
.firma-lbl{font-size:10px;color:#4a4a4a;margin-top:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px}
.firma-val{font-size:12px;color:#222;font-weight:600;margin-top:2px}

.footer{background:${t.dark};color:rgba(255,255,255,0.85);text-align:center;font-size:10px;padding:16px;margin-top:30px}

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
        <h1>🍋 ${t.label}</h1>
        <div class="sub">Detalle de estibas, canastillas y descuentos de peso</div>
      </div>
      ${logoSrc ? `<img src="${logoSrc}" />` : ""}
    </div>
    <div class="chips">
      <span class="chip">${r.tipo === "entrada" ? "⬇️ ENTRADA DE FRUTA" : "⬆️ SALIDA DE FRUTA"}</span>
      <span class="chip">📋 Remisión ${esc(r.remision) || "—"}</span>
      <span class="chip">📅 ${fmtFecha}</span>
      <span class="chip">🪧 ${esc(r.placa) || "Sin placa"}</span>
    </div>
  </div>

  <div class="estado-bar">✅ ${r.estibas.length} estiba${r.estibas.length !== 1 ? "s" : ""} registrada${r.estibas.length !== 1 ? "s" : ""} · ${kg(r.total)} kg netos en total</div>

  <div class="content">

    <div class="cards">
      <div class="card"><div class="card-ic">🧱</div><div class="card-val">${r.estibas.length}</div><div class="card-lbl">Estibas</div></div>
      <div class="card"><div class="card-ic">📦</div><div class="card-val">${canastillasTotal.toLocaleString("es-CO")}</div><div class="card-lbl">Canastillas</div></div>
      <div class="card"><div class="card-ic">⚖️</div><div class="card-val">${kg(pesoBrutoTotal)}</div><div class="card-lbl">Peso bruto (kg)</div></div>
      <div class="card"><div class="card-ic">✅</div><div class="card-val">${kg(r.total)}</div><div class="card-lbl">Peso neto (kg)</div></div>
    </div>

    <h2>🚚 Datos del transporte</h2>
    <div class="info-grid">
      <div class="info-item"><div class="l">Conductor</div><div class="v">${esc(r.conductor) || "—"}</div></div>
      <div class="info-item"><div class="l">Cédula conductor</div><div class="v">${esc(r.cedulaConductor) || "—"}</div></div>
      <div class="info-item"><div class="l">Origen</div><div class="v">${esc(r.origen) || "—"}</div></div>
      <div class="info-item"><div class="l">Proveedor</div><div class="v">${esc(r.proveedor) || "—"}</div></div>
      <div class="info-item"><div class="l">Supervisor</div><div class="v">${esc(r.supervisor) || "—"}</div></div>
      <div class="info-item"><div class="l">Hora inicio — Hora fin</div><div class="v">${esc(r.horaInicio) || "—"} — ${esc(r.horaFin) || "—"}</div></div>
    </div>

    <h2>🧱 Detalle de estibas</h2>
    <div class="estiba-grid">
      ${estibaCards}
    </div>

    <div class="total">
      <div class="totalbox alt"><div class="l">Peso bruto</div><div class="v">${kg(pesoBrutoTotal)} kg</div></div>
      <div class="totalbox alt"><div class="l">Descuento total</div><div class="v">${kg(descuentoTotal)} kg</div></div>
      <div class="totalbox"><div class="l">Total peso neto</div><div class="v">${kg(r.total)} kg</div></div>
    </div>

    ${r.observaciones ? `
    <h2>📝 Observaciones</h2>
    <div class="obs">${esc(r.observaciones).replace(/\n/g,"<br>")}</div>
    ` : ""}

    <div class="firma-row">
      <div class="firma-box">
        <div class="firma-line"></div>
        <div class="firma-lbl">Conductor</div>
        <div class="firma-val">${esc(r.conductor) || "—"}</div>
      </div>
      <div class="firma-box">
        <div class="firma-line"></div>
        <div class="firma-lbl">Supervisor</div>
        <div class="firma-val">${esc(r.supervisor) || "—"}</div>
      </div>
    </div>

  </div>

  <div class="footer">Tierra Prometida Trading 🍋 · JARVIS · Informe generado el ${new Date().toLocaleDateString("es-CO")} a las ${new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}</div>
</div>
</body></html>`;
  return html;
}

async function generarInformeGeneralHTML(recs, desde, hasta, tipo) {
  const logoSrc = await cargarLogoBase64();
  const t = TEMA_RECEPCION[tipo] || TEMA_RECEPCION.entrada;
  const nombrePlural = tipo === "salida" ? "Salidas" : "Entradas";
  const fmt = (f) => f ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day:"2-digit", month:"long", year:"numeric" }) : "";
  const totalNeto    = recs.reduce((a, r) => a + num(r.total), 0);
  const totalEstibas = recs.reduce((a, r) => a + (r.estibas?.length || 0), 0);
  const totalCanastillas = recs.reduce((a, r) => a + (r.estibas || []).reduce((s, e) => s + canastillasDeEstiba(e).reduce((x, c) => x + num(c.cantidad), 0), 0), 0);
  const promedio      = recs.length ? totalNeto / recs.length : 0;

  const filas = recs.map(r => `
    <tr>
      <td>${esc(r.remision) || "—"}</td>
      <td>${esc(r.fecha) || "—"}</td>
      <td>${esc(r.placa) || "—"}</td>
      <td>${esc(r.proveedor) || "—"}</td>
      <td>${esc(r.supervisor) || "—"}</td>
      <td style="text-align:center">${r.estibas?.length || 0}</td>
      <td style="text-align:right;font-weight:700;color:${t.mid}">${kg(r.total)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe General de ${nombrePlural} - Tierra Prometida</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,sans-serif;color:#1e2b1e;background:#f4f7f3;font-size:12px}
.sheet{max-width:960px;margin:0 auto;background:#fff}

.banner{background:linear-gradient(120deg,${t.dark},${t.mid} 60%,${t.light});color:#fff;padding:30px 34px 26px;position:relative;overflow:hidden}
.banner::after{content:"🍋";position:absolute;right:-10px;top:-22px;font-size:130px;opacity:0.12;transform:rotate(12deg)}
.banner-row{display:flex;align-items:center;justify-content:space-between;gap:16px;position:relative}
.banner img{width:58px;height:58px;object-fit:contain;background:#fff;border-radius:12px;padding:6px;box-shadow:0 4px 14px rgba(0,0,0,0.25)}
.banner h1{font-size:22px;font-weight:800;letter-spacing:0.2px}
.banner .sub{font-size:11.5px;opacity:0.88;margin-top:4px}
.banner .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;position:relative}
.banner .chip{background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.28);border-radius:20px;padding:5px 12px;font-size:10.5px;font-weight:600}

.content{padding:28px 34px 8px}

.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:26px;margin-top:-16px;position:relative}
.card{background:#fbfdfb;border:1px solid #e2ede2;border-radius:12px;padding:14px 10px;text-align:center;box-shadow:0 6px 18px rgba(0,0,0,0.05)}
.card-ic{font-size:16px;margin-bottom:2px}
.card-val{font-size:18px;font-weight:800;color:${t.mid};line-height:1.15}
.card-lbl{font-size:8.5px;color:#5a5a5a;margin-top:4px;text-transform:uppercase;letter-spacing:0.4px}

h2{display:flex;align-items:center;gap:8px;color:${t.dark};font-size:13.5px;font-weight:800;margin:26px 0 12px;text-transform:uppercase;letter-spacing:0.3px}
h2::after{content:"";flex:1;height:1px;background:${t.divider}}

table{width:100%;border-collapse:collapse;font-size:11px}
th{background:${t.mid};color:#fff;padding:8px 9px;text-align:left;border:1px solid ${t.dark}}
td{padding:7px 9px;border:1px solid #e2ede2}
tr:nth-child(even) td{background:#fbfdfb}
tfoot td{background:${t.totalboxBg};font-weight:800;border-top:2px solid ${t.mid}}

.footer{background:${t.dark};color:rgba(255,255,255,0.85);text-align:center;font-size:10px;padding:16px;margin-top:30px}

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
        <h1>${tipo === "salida" ? "⬆️" : "⬇️"} Informe General de ${nombrePlural}</h1>
        <div class="sub">${nombrePlural} de fruta, estibas y peso neto</div>
      </div>
      ${logoSrc ? `<img src="${logoSrc}" />` : ""}
    </div>
    <div class="chips">
      <span class="chip">📅 ${desde || hasta ? `${fmt(desde) || "Inicio"} — ${fmt(hasta) || "Hoy"}` : "Todas las fechas"}</span>
      <span class="chip">${tipo === "salida" ? "⬆️" : "⬇️"} ${recs.length} ${nombrePlural.toLowerCase()}</span>
    </div>
  </div>

  <div class="content">

    <div class="cards">
      <div class="card"><div class="card-ic">🍋</div><div class="card-val">${recs.length}</div><div class="card-lbl">${nombrePlural}</div></div>
      <div class="card"><div class="card-ic">🧱</div><div class="card-val">${totalEstibas}</div><div class="card-lbl">Estibas totales</div></div>
      <div class="card"><div class="card-ic">📦</div><div class="card-val">${totalCanastillas.toLocaleString("es-CO")}</div><div class="card-lbl">Canastillas totales</div></div>
      <div class="card"><div class="card-ic">⚖️</div><div class="card-val">${totalNeto.toLocaleString("es-CO",{maximumFractionDigits:1})}</div><div class="card-lbl">Kg netos totales</div></div>
      <div class="card"><div class="card-ic">📊</div><div class="card-val">${kg(promedio)}</div><div class="card-lbl">Kg promedio</div></div>
    </div>

    <h2>📋 Detalle de ${nombrePlural.toLowerCase()}</h2>
    <table>
      <thead>
        <tr>
          <th>Remisión</th><th>Fecha</th><th>Placa</th><th>Proveedor</th><th>Supervisor</th><th style="text-align:center">Estibas</th><th style="text-align:right">Peso neto</th>
        </tr>
      </thead>
      <tbody>
        ${filas || `<tr><td colspan="7" style="text-align:center;color:#999;padding:16px">Sin ${nombrePlural.toLowerCase()} en el rango seleccionado</td></tr>`}
      </tbody>
      ${recs.length ? `<tfoot><tr><td colspan="6" style="text-align:right">TOTAL · Promedio ${kg(promedio)} kg/recepción</td><td style="text-align:right;color:${t.mid}">${kg(totalNeto)} kg</td></tr></tfoot>` : ""}
    </table>

  </div>

  <div class="footer">Tierra Prometida Trading 🍋 · JARVIS · Informe generado el ${new Date().toLocaleDateString("es-CO")} a las ${new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}</div>
</div>
</body></html>`;
  return html;
}

// Datos comunes a las dos versiones de tirilla (Rollo y Word) — el QR
// necesita el id ya guardado en Supabase, sin él no se podría buscar después.
async function datosTirillaEstiba(form, e, recepcionId) {
  const logoSrc = await cargarLogoBase64();
  const cantCanastillas = canastillasDeEstiba(e).reduce((s, c) => s + num(c.cantidad), 0);
  const qrTexto   = textoQrEstiba(recepcionId, e.numero);
  const qrDataUrl = await QRCode.toDataURL(qrTexto, { errorCorrectionLevel: "M", margin: 1, width: 320 });
  const fechaFmt  = form.fecha ? new Date(form.fecha + "T12:00:00").toLocaleDateString("es-CO", { day:"2-digit", month:"2-digit", year:"numeric" }) : "—";
  const filas = [
    ["Fecha de ingreso", fechaFmt],
    ["Hora", form.horaInicio || "—"],
    ["Remisión N°", form.remision || "—"],
    ["N° de Estiba", e.numero],
    ["N° de Canastillas", cantCanastillas.toLocaleString("es-CO")],
    ["Proveedor", form.proveedor || "—"],
    ["Peso Neto", `${kg(pesoNetoEstiba(e))} kg`],
  ];
  return { logoSrc, qrDataUrl, filas };
}

// Tirilla para impresora de rollo (Rollo) — formato angosto tipo térmica
// (100x50mm), idénticas medidas a las que ya usamos en el QR de pallets.
async function buildTirillaEstibaRollo(form, e, recepcionId) {
  const { logoSrc, qrDataUrl, filas } = await datosTirillaEstiba(form, e, recepcionId);
  const filasHtml = filas.map(([l, v]) => `<div class="frow"><span class="flbl">${esc(l)}</span><span class="fval">${esc(v)}</span></div>`).join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Tirilla Estiba ${recepcionId}-${e.numero}</title>
<style>
  *{box-sizing:border-box}
  @page{size:100mm 50mm;margin:0}
  html,body{margin:0;padding:0}
  body{font-family:Arial,sans-serif;color:#111;width:100mm;height:50mm}
  .box{width:100mm;height:50mm;padding:1.8mm;display:flex;gap:2.5mm;overflow:hidden}
  .left{flex:1;min-width:0;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:0.5mm solid #111;padding-bottom:0.4mm;margin-bottom:1mm}
  .brand{display:flex;align-items:center;gap:1.3mm;min-width:0}
  .brand img{width:6.5mm;height:6.5mm;object-fit:contain;flex-shrink:0}
  .brand .nom{font-size:2.8mm;font-weight:800;line-height:1.15}
  .brand .sub{font-size:2mm;color:#555;font-weight:600}
  .estiba-no{text-align:right;flex-shrink:0}
  .estiba-no .lbl{font-size:2mm;color:#555;font-weight:800;letter-spacing:0.3mm}
  .estiba-no .num{font-size:8mm;font-weight:900;line-height:0.85}
  .frow{display:flex;justify-content:space-between;align-items:baseline;padding:0.5mm 0;border-bottom:0.25mm solid #ddd}
  .flbl{font-size:2.4mm;color:#555;font-weight:700}
  .fval{font-size:2.9mm;font-weight:800;color:#111;text-align:right}
  .right{width:30mm;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1mm}
  .right img{width:28mm;height:28mm}
  .qr-lbl{font-size:1.9mm;color:#777;text-align:center;line-height:1.2;font-weight:600}
  @media print{ body{padding:0} }
</style></head>
<body>
  <div class="box">
    <div class="left">
      <div class="top">
        <div class="brand">
          ${logoSrc ? `<img src="${logoSrc}"/>` : ""}
          <div>
            <div class="nom">TIERRA PROMETIDA</div>
            <div class="sub">Recepción de fruta</div>
          </div>
        </div>
        <div class="estiba-no">
          <div class="lbl">ESTIBA</div>
          <div class="num">${e.numero}</div>
        </div>
      </div>
      ${filasHtml}
    </div>

    <div class="right">
      <img src="${qrDataUrl}" alt="QR estiba ${e.numero}" />
      <div class="qr-lbl">Escanear al usar la estiba</div>
    </div>
  </div>
</body></html>`;
}

// Tirilla para impresora normal (Word) — hoja carta con la etiqueta
// ocupando 1/6 de página (2 columnas x 3 filas), el resto de la hoja queda
// en blanco. Pensada para imprimirse desde cualquier impresora de oficina.
async function buildTirillaEstibaWord(form, e, recepcionId) {
  const { logoSrc, qrDataUrl, filas } = await datosTirillaEstiba(form, e, recepcionId);
  const filasHtml = filas.map(([l, v]) => `<div class="frow"><span class="flbl">${esc(l)}</span><span class="fval">${esc(v)}</span></div>`).join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Tirilla Estiba ${recepcionId}-${e.numero} (hoja carta)</title>
<style>
  *{box-sizing:border-box}
  @page{size:letter;margin:0}
  html,body{margin:0;padding:0}
  body{font-family:Arial,sans-serif;color:#111}
  .page{width:8.5in;height:11in;display:grid;grid-template-columns:repeat(2,4.25in);grid-template-rows:repeat(3,3.6667in)}
  .cell{padding:0.2in;overflow:hidden}
  .label{width:100%;height:100%;border:1px solid #ccc;border-radius:0.08in;padding:0.18in;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #111;padding-bottom:0.06in;margin-bottom:0.1in}
  .brand{display:flex;align-items:center;gap:0.08in;min-width:0}
  .brand img{width:0.35in;height:0.35in;object-fit:contain;flex-shrink:0}
  .brand .nom{font-size:13px;font-weight:800;line-height:1.15}
  .brand .sub{font-size:10px;color:#555;font-weight:600}
  .estiba-no{text-align:right;flex-shrink:0}
  .estiba-no .lbl{font-size:9px;color:#555;font-weight:800;letter-spacing:0.5px}
  .estiba-no .num{font-size:30px;font-weight:900;line-height:0.85}
  .body-row{flex:1;display:flex;gap:0.14in}
  .info{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center}
  .frow{display:flex;justify-content:space-between;align-items:baseline;padding:0.04in 0;border-bottom:1px solid #ddd}
  .flbl{font-size:10px;color:#555;font-weight:700}
  .fval{font-size:12px;font-weight:800;color:#111;text-align:right}
  .qrbox{width:1.5in;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.06in}
  .qrbox img{width:1.4in;height:1.4in}
  .qr-lbl{font-size:8px;color:#777;text-align:center;line-height:1.2;font-weight:600}
  @media print{ body{padding:0} }
</style></head>
<body>
  <div class="page">
    <div class="cell">
      <div class="label">
        <div class="top">
          <div class="brand">
            ${logoSrc ? `<img src="${logoSrc}"/>` : ""}
            <div>
              <div class="nom">TIERRA PROMETIDA</div>
              <div class="sub">Recepción de fruta</div>
            </div>
          </div>
          <div class="estiba-no">
            <div class="lbl">ESTIBA</div>
            <div class="num">${e.numero}</div>
          </div>
        </div>
        <div class="body-row">
          <div class="info">${filasHtml}</div>
          <div class="qrbox">
            <img src="${qrDataUrl}" alt="QR estiba ${e.numero}" />
            <div class="qr-lbl">Escanear al usar la estiba</div>
          </div>
        </div>
      </div>
    </div>
    <div class="cell"></div><div class="cell"></div>
    <div class="cell"></div><div class="cell"></div><div class="cell"></div>
  </div>
</body></html>`;
}

export default function RecepcionesTab({ mob, logisticaBookings }) {
  const bookingsLog = logisticaBookings || [];
  const labelBookingLog = (b) => b ? (b.numeroContenedor || b.numeroBooking || `#${b.id}`) : "—";
  // contenedorId null = reserva (canastillas apartadas sin contenedor todavía).
  const labelAsignacionDestino = (a) => a.contenedorId == null ? "🗄 Reserva" : `🚢 ${labelBookingLog(bookingsLog.find(b=>b.id===a.contenedorId))}`;
  const [isMobLocal, setIsMobLocal] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 680
  );
  const [isLandscape, setIsLandscape] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-height: 500px) and (orientation: landscape)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-height: 500px) and (orientation: landscape)");
    const h = () => {
      setIsMobLocal(window.innerWidth < 680);
      setIsLandscape(mq.matches);
    };
    window.addEventListener("resize", h);
    mq.addEventListener ? mq.addEventListener("change", h) : mq.addListener(h);
    return () => {
      window.removeEventListener("resize", h);
      mq.removeEventListener ? mq.removeEventListener("change", h) : mq.removeListener(h);
    };
  }, []);
  const m = mob || isMobLocal;

  const { recepciones, asignaciones, loading, guardarRecepcion, eliminarRecepcion, actualizarEstibas, guardarAsignacion, eliminarAsignacion } = useRecepciones();

  const [form,       setForm]       = useState(formVacio);
  const [editId,     setEditId]     = useState(null);
  const [guardando,  setGuardando]  = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [preview,    setPreview]    = useState(null); // { url, filename }
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [tipoTab,     setTipoTab]     = useState("entrada"); // pestaña del historial: entradas o salidas por separado
  const [seccion,     setSeccion]     = useState("form"); // "stats" muestra las tarjetas KPI, ocultas por defecto; formulario e historial siempre visibles
  const [tabRec,      setTabRec]      = useState(0); // 0 = Recepciones, 1 = Verificación de Estibas

  // ── Estilos ───────────────────────────────────────────────────
  const inp = {
    background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)",
    borderRadius:8, padding: isLandscape ? "7px 10px" : (m ? "10px 11px" : "7px 10px"), color:"white",
    fontSize: m ? 16 : 12, fontFamily:"inherit", width:"100%", minWidth:0,
    boxSizing:"border-box", minHeight: isLandscape ? 36 : (m ? 44 : 32),
  };
  const lbl = {
    fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.45)",
    marginBottom:4, fontWeight:600, letterSpacing:0.3,
  };
  // Variante compacta de `inp` para las filas de tipo/cantidad de canastilla:
  // ahí caben varias filas cuando la estiba es mixta, así que necesitan menos
  // alto/relleno que un campo normal del formulario.
  const inpCan = {
    ...inp,
    padding: isLandscape ? "4px 7px" : (m ? "7px 9px" : "4px 7px"),
    minHeight: isLandscape ? 28 : (m ? 34 : 26),
  };
  const cardS = {
    background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
    borderRadius:10, padding: isLandscape ? 10 : (m ? 14 : 16),
  };
  // minWidth:0 en los items del grid: por defecto un <input>/<select> le da a su
  // celda un tamaño mínimo automático basado en su ancho intrínseco, que en
  // landscape (4 columnas angostas) hace que las celdas se desborden y los
  // bordes de los campos se superpongan.
  const campoBox = { minWidth: 0 };
  // En landscape mobile hay mucho ancho pero poca altura: usar grid de 4
  // columnas (igual que desktop) en vez del de 2 columnas de portrait.
  // minmax(132px,1fr) evita que input[type=time] se achique más de lo que
  // Safari/iOS necesita para su control nativo (hora + AM/PM); por debajo de
  // ese piso Safari no lo encoge y termina dibujándolo fuera de su celda,
  // "pegando" visualmente los dos campos de hora.
  const camposCols = isLandscape ? "repeat(4, minmax(132px, 1fr))" : (m ? "1fr 1fr" : "repeat(4,1fr)");

  const totalNeto = useMemo(
    () => form.estibas.reduce((acc, e) => acc + pesoNetoEstiba(e), 0),
    [form.estibas]
  );

  const setCampo = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const setEstiba = (idx, campo, valor) => {
    setForm(f => ({
      ...f,
      estibas: f.estibas.map((e, i) => i === idx ? { ...e, [campo]: valor } : e),
    }));
  };

  // Una estiba es "mixta" cuando trae más de un tipo de canastilla (p.ej.
  // x canastillas de 2 kg + x de 2.4 kg). setCanastilla edita un tipo puntual;
  // agregar/quitarTipoCanastilla arman o deshacen la mezcla.
  const setCanastilla = (idxEstiba, idxTipo, campo, valor) => {
    setForm(f => ({
      ...f,
      estibas: f.estibas.map((e, i) => i !== idxEstiba ? e : {
        ...e,
        canastillas: canastillasDeEstiba(e).map((c, j) => j !== idxTipo ? c : { ...c, [campo]: valor }),
      }),
    }));
  };

  const agregarTipoCanastilla = (idxEstiba) => {
    setForm(f => ({
      ...f,
      estibas: f.estibas.map((e, i) => i !== idxEstiba ? e : {
        ...e,
        canastillas: [...canastillasDeEstiba(e), nuevaTipoCanastilla()],
      }),
    }));
  };

  const quitarTipoCanastilla = (idxEstiba, idxTipo) => {
    setForm(f => ({
      ...f,
      estibas: f.estibas.map((e, i) => {
        if (i !== idxEstiba) return e;
        const tipos = canastillasDeEstiba(e);
        return tipos.length <= 1 ? e : { ...e, canastillas: tipos.filter((_, j) => j !== idxTipo) };
      }),
    }));
  };

  const agregarEstiba = () => {
    setForm(f => ({ ...f, estibas: [...f.estibas, nuevaEstiba(f.estibas.length + 1)] }));
  };

  const quitarEstiba = (idx) => {
    setForm(f => {
      const restantes = f.estibas.filter((_, i) => i !== idx).map((e, i) => ({ ...e, numero: i + 1 }));
      return { ...f, estibas: restantes.length ? restantes : [nuevaEstiba(1)] };
    });
  };

  const cancelarEdicion = () => { setForm(formVacio()); setEditId(null); };

  const editarRecepcion = (r) => {
    setForm({
      remision: r.remision, fecha: r.fecha, tipo: r.tipo,
      placa: r.placa, conductor: r.conductor, cedulaConductor: r.cedulaConductor || "", origen: r.origen || "",
      proveedor: r.proveedor, supervisor: r.supervisor,
      horaInicio: r.horaInicio, horaFin: r.horaFin, observaciones: r.observaciones || "",
      estibas: r.estibas.length
        ? r.estibas.map(e => ({
            numero: e.numero, pesoBruto: e.pesoBruto, estibaPlastica: e.estibaPlastica,
            pesoEstiba: e.pesoEstiba, canastillas: canastillasDeEstiba(e),
            usada: !!e.usada, usadaPor: e.usadaPor || "", usadaEn: e.usadaEn || "",
          }))
        : [nuevaEstiba(1)],
    });
    setEditId(r.id);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const verInforme = async (r) => {
    const html = await generarInformeHTML(r);
    const url  = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev.url); return { url, filename: `Recepcion_${r.remision || r.id}.html` }; });
  };

  const recepcionesFiltradas = useMemo(() => {
    return recepciones.filter(r => {
      if (r.tipo !== tipoTab) return false;
      if (filtroDesde && r.fecha < filtroDesde) return false;
      if (filtroHasta && r.fecha > filtroHasta) return false;
      return true;
    });
  }, [recepciones, filtroDesde, filtroHasta, tipoTab]);

  const verInformeGeneral = async () => {
    const html = await generarInformeGeneralHTML(recepcionesFiltradas, filtroDesde, filtroHasta, tipoTab);
    const url  = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const sufijo = filtroDesde || filtroHasta ? `${filtroDesde || "inicio"}_a_${filtroHasta || "hoy"}` : "todas";
    const nombreTipo = tipoTab === "salida" ? "Salidas" : "Entradas";
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev.url); return { url, filename: `Informe_General_${nombreTipo}_${sufijo}.html` }; });
  };

  // Solo disponible reabriendo (Editar) una recepción ya guardada — el QR
  // necesita el id real en Supabase para poder buscarla después al escanear.
  // formato: "rollo" (100x50mm térmica) | "word" (hoja carta, 1/6 página).
  const imprimirTirillaEstiba = async (e, formato) => {
    if (!editId) return;
    const html = formato === "word"
      ? await buildTirillaEstibaWord(form, e, editId)
      : await buildTirillaEstibaRollo(form, e, editId);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    setPreview(prev => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { url, filename: `Tirilla-Estiba-${editId}-${e.numero}-${formato}.html`, titulo: `Tirilla — Estiba #${e.numero} (${formato === "word" ? "hoja carta" : "rollo"})` };
    });
  };

  const descargarInforme = () => {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview.url;
    a.download = preview.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const cerrarPreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const guardar = async () => {
    if (!form.fecha) {
      alert("Falta la fecha de la recepción.");
      return;
    }
    setGuardando(true);
    const estibasCalc = form.estibas.map(e => ({ ...e, descuentoEstiba: descuentoEstiba(e), pesoNeto: pesoNetoEstiba(e) }));
    const ok = await guardarRecepcion({ ...form, estibas: estibasCalc, total: totalNeto }, editId);
    setGuardando(false);
    if (ok) {
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2000);
      cancelarEdicion();
    }
  };

  // ══════════════ VERIFICACIÓN DE ESTIBAS (se escanea la tirilla al usarla) ══════════════
  // Las tirillas se pegan a la estiba física; cuando el operario la usa, la
  // quita y la echa al buzón. Al final del proceso se recogen y se escanean
  // una por una para marcar cada estiba como "usada" — así se concilia cuáles
  // de las registradas realmente se usaron.
  const [camActiva, setCamActiva]         = useState(false);
  const [camError, setCamError]           = useState("");
  const [resultadoEstiba, setResultadoEstiba] = useState(null); // null | {estado:"no-encontrado"|"ok", recepcion, estiba}
  const [marcandoUsada, setMarcandoUsada] = useState(false);
  const html5QrRef    = useRef(null);
  const procesandoRef = useRef(false);
  const ignoradoRef   = useRef(null);
  const READER_ID_ESTIBA = "qr-reader-estiba-verification";

  const detenerCamaraEstiba = async () => {
    try { await html5QrRef.current?.stop(); html5QrRef.current?.clear(); } catch { /* ya se había detenido */ }
    html5QrRef.current = null;
    setCamActiva(false);
  };
  useEffect(() => () => { html5QrRef.current?.stop().then(() => html5QrRef.current?.clear()).catch(() => { /* ya se había detenido */ }); }, []);

  const buscarEstibaPorQr = (recepcionIdRaw, numeroRaw) => {
    const recepcion = recepciones.find(r => r.id === Number(recepcionIdRaw));
    const estiba = recepcion?.estibas?.find(e => e.numero === Number(numeroRaw));
    setResultadoEstiba(recepcion && estiba ? { estado: "ok", recepcion, estiba } : { estado: "no-encontrado" });
  };

  const onScanEstiba = async (decodedText) => {
    if (procesandoRef.current) return;
    const primeraLinea = (decodedText || "").split("\n")[0].trim();
    const partes = primeraLinea.split("|");
    if (partes[0] !== QR_ESTIBA_PREFIX || partes.length < 3) {
      ignoradoRef.current = primeraLinea;
      return;
    }
    ignoradoRef.current = null;
    procesandoRef.current = true;
    playBeep();
    await detenerCamaraEstiba();
    buscarEstibaPorQr(partes[1], partes[2]);
    procesandoRef.current = false;
  };

  const iniciarCamaraEstiba = async () => {
    setCamError("");
    setResultadoEstiba(null);
    ignoradoRef.current = null;
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const inst = new Html5Qrcode(READER_ID_ESTIBA);
      html5QrRef.current = inst;
      await inst.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (decoded) => onScanEstiba(decoded),
        () => {}
      );
      setCamActiva(true);
    } catch (err) {
      setCamError(mensajeErrorCamara(err));
    }
  };

  const marcarEstibaUsada = async () => {
    if (resultadoEstiba?.estado !== "ok") return;
    setMarcandoUsada(true);
    const { recepcion, estiba } = resultadoEstiba;
    const nuevasEstibas = recepcion.estibas.map(e => e.numero !== estiba.numero ? e : {
      ...e, usada: true, usadaPor: nombreUsuarioSesion() || "Sin nombre", usadaEn: new Date().toISOString(),
    });
    const ok = await actualizarEstibas(recepcion.id, nuevasEstibas);
    setMarcandoUsada(false);
    if (ok) {
      setResultadoEstiba({ estado: "ok", recepcion: { ...recepcion, estibas: nuevasEstibas }, estiba: nuevasEstibas.find(e => e.numero === estiba.numero) });
    }
  };

  const escanearOtraEstiba = () => { setResultadoEstiba(null); iniciarCamaraEstiba(); };

  // ══════════════ ASOCIAR CONTENEDOR (canastillas de una estiba → contenedor) ══════════════
  // Una estiba puede repartirse entre varios contenedores (sobra fruta y se
  // usa en otro) — por eso se asigna por cantidad de canastillas, no la
  // estiba completa. "Revisión de Canastillas" concilia, por contenedor,
  // qué remisiones/estibas se usaron y cuántas canastillas de cada una.
  const [subVistaAsoc, setSubVistaAsoc]     = useState("asignar"); // "asignar" | "revision"
  const [busquedaAsoc, setBusquedaAsoc]     = useState("");
  const [filtroDesdeAsoc, setFiltroDesdeAsoc] = useState("");
  const [filtroHastaAsoc, setFiltroHastaAsoc] = useState("");
  const [recepcionAsocSel, setRecepcionAsocSel] = useState(null); // id de recepción elegida para asignar
  const [asigContenedorId, setAsigContenedorId] = useState({}); // { [numeroEstiba]: contenedorId }
  const [asigCantidad, setAsigCantidad]     = useState({});     // { [numeroEstiba]: cantidad }
  const [guardandoAsig, setGuardandoAsig]   = useState({});     // { [numeroEstiba]: bool }
  const [errorAsig, setErrorAsig]           = useState({});     // { [numeroEstiba]: mensaje }
  const [contenedorRevisionId, setContenedorRevisionId] = useState("");

  const asignacionesPorEstiba = (recepcionId, numeroEstiba) =>
    asignaciones.filter(a => a.recepcionId === recepcionId && a.numeroEstiba === numeroEstiba);
  const cantidadAsignadaEstiba = (recepcionId, numeroEstiba) =>
    asignacionesPorEstiba(recepcionId, numeroEstiba).reduce((s, a) => s + (Number(a.cantidadCanastillas) || 0), 0);

  const recepcionesAsocFiltradas = useMemo(() => {
    const q = busquedaAsoc.trim().toLowerCase();
    return recepciones.filter(r => {
      if (filtroDesdeAsoc && r.fecha < filtroDesdeAsoc) return false;
      if (filtroHastaAsoc && r.fecha > filtroHastaAsoc) return false;
      if (!q) return true;
      return [r.remision, r.proveedor, r.placa].some(v => (v || "").toLowerCase().includes(q));
    });
  }, [recepciones, busquedaAsoc, filtroDesdeAsoc, filtroHastaAsoc]);

  const recepcionAsoc = recepcionAsocSel ? recepciones.find(r => r.id === recepcionAsocSel) : null;

  const asignarCanastillas = async (numeroEstiba, disponibles) => {
    const contenedorId = asigContenedorId[numeroEstiba];
    const cantidad = Number(asigCantidad[numeroEstiba]);
    setErrorAsig(p => ({ ...p, [numeroEstiba]: "" }));
    if (!contenedorId) { setErrorAsig(p => ({ ...p, [numeroEstiba]: "Elige un contenedor." })); return; }
    if (!cantidad || cantidad <= 0) { setErrorAsig(p => ({ ...p, [numeroEstiba]: "Falta la cantidad de canastillas." })); return; }
    if (cantidad > disponibles) { setErrorAsig(p => ({ ...p, [numeroEstiba]: `Solo quedan ${disponibles} canastillas disponibles de esta estiba.` })); return; }
    setGuardandoAsig(p => ({ ...p, [numeroEstiba]: true }));
    const ok = await guardarAsignacion({
      recepcionId: recepcionAsocSel, numeroEstiba, contenedorId: Number(contenedorId),
      cantidadCanastillas: cantidad, registradoPor: nombreUsuarioSesion(),
    });
    setGuardandoAsig(p => ({ ...p, [numeroEstiba]: false }));
    if (ok) {
      setAsigContenedorId(p => ({ ...p, [numeroEstiba]: "" }));
      setAsigCantidad(p => ({ ...p, [numeroEstiba]: "" }));
    } else {
      setErrorAsig(p => ({ ...p, [numeroEstiba]: "No se pudo guardar la asignación. Intenta de nuevo." }));
    }
  };

  const asignacionesDelContenedor = useMemo(() => {
    if (!contenedorRevisionId) return [];
    const match = contenedorRevisionId === "reserva"
      ? (a) => a.contenedorId == null
      : (a) => a.contenedorId === Number(contenedorRevisionId);
    return asignaciones
      .filter(match)
      .map(a => ({ ...a, recepcion: recepciones.find(r => r.id === a.recepcionId) || null }))
      .sort((a, b) => (a.recepcion?.fecha || "").localeCompare(b.recepcion?.fecha || ""));
  }, [asignaciones, recepciones, contenedorRevisionId]);

  const totalCanastillasContenedor = useMemo(
    () => asignacionesDelContenedor.reduce((s, a) => s + (Number(a.cantidadCanastillas) || 0), 0),
    [asignacionesDelContenedor]
  );

  // ── Excedente al validar uso (Verificación de Estibas) ──────────────────
  // Al confirmar que una estiba se usó, si no todas sus canastillas quedaron
  // asignadas a un contenedor, se pregunta qué hacer con las que sobran:
  // asignarlas a otro contenedor ahí mismo, o dejarlas en reserva.
  const [modoSobranteEstiba, setModoSobranteEstiba] = useState(null); // null | "elegir"
  const [contenedorSobranteId, setContenedorSobranteId] = useState("");
  const [guardandoSobrante, setGuardandoSobrante]       = useState(false);

  const dejarSobranteComoReserva = async (recepcionId, numeroEstiba, cantidad) => {
    setGuardandoSobrante(true);
    await guardarAsignacion({
      recepcionId, numeroEstiba, contenedorId: null, cantidadCanastillas: cantidad,
      registradoPor: nombreUsuarioSesion(), obs: "Reserva (excedente al validar uso)",
    });
    setGuardandoSobrante(false);
  };

  const asignarSobranteAContenedor = async (recepcionId, numeroEstiba, cantidad) => {
    if (!contenedorSobranteId) return;
    setGuardandoSobrante(true);
    const ok = await guardarAsignacion({
      recepcionId, numeroEstiba, contenedorId: contenedorSobranteId, cantidadCanastillas: cantidad,
      registradoPor: nombreUsuarioSesion(),
    });
    setGuardandoSobrante(false);
    if (ok) { setModoSobranteEstiba(null); setContenedorSobranteId(""); }
  };

  if (loading) return <LimonLoader texto="Cargando recepciones" />;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* ── Tab strip ── */}
      <div style={{ display:"flex", gap:4, overflowX:"auto", paddingBottom:2 }}>
        {["📋 Recepciones", "🔎 Verificación de Estibas", "📦 Asociar Contenedor"].map((t, i) => (
          <button key={i} onClick={() => { setTabRec(i); if (i !== 1) detenerCamaraEstiba(); }} style={{
            background: tabRec === i ? "rgba(132,94,247,0.15)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${tabRec === i ? "#845EF790" : "rgba(255,255,255,0.07)"}`,
            borderTop: `2px solid ${tabRec === i ? "#845EF7" : "transparent"}`,
            borderRadius:8, padding:"8px 13px", cursor:"pointer",
            color: tabRec === i ? "#a78bfa" : "rgba(255,255,255,0.42)",
            fontWeight:700, fontSize:12, whiteSpace:"nowrap", flexShrink:0, fontFamily:"inherit",
          }}>{t}</button>
        ))}
      </div>

      {tabRec === 0 && (<>

      {/* ── Botón discreto para revelar estadísticas — ocultas por defecto,
          el operario las abre solo si las necesita ── */}
      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <button
          onClick={()=>setSeccion(seccion === "stats" ? "form" : "stats")}
          style={{
            padding:"6px 12px", borderRadius:20, fontSize:11, fontWeight:600, cursor:"pointer",
            background: seccion === "stats" ? "#6366F122" : "rgba(255,255,255,0.03)",
            border: `1px solid ${seccion === "stats" ? "#6366F166" : "rgba(255,255,255,0.12)"}`,
            color: seccion === "stats" ? "#a5b4fc" : "rgba(255,255,255,0.45)",
          }}
        >
          {seccion === "stats" ? "✕ Ocultar estadísticas" : "👁 Ver estadísticas"}
        </button>
      </div>

      {seccion === "stats" && (<>

      {/* ── KPIs ── */}
      <div style={{ display:"grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(4,1fr)", gap:10 }}>
        {[
          { l:"Recepciones", v:recepciones.length, c:"#00C9A7", i:"🍋" },
          { l:"Entradas",    v:recepciones.filter(r=>r.tipo==="entrada").length, c:"#845EF7", i:"⬇️" },
          { l:"Salidas",     v:recepciones.filter(r=>r.tipo==="salida").length,  c:"#F9A826", i:"⬆️" },
          { l:"Kg netos totales", v:recepciones.reduce((a,r)=>a+num(r.total),0).toLocaleString("es-CO",{maximumFractionDigits:1}), c:"#6366F1", i:"⚖️" },
        ].map((s,i)=>(
          <div key={i} style={{...cardS, display:"flex", alignItems:"center", gap:10}}>
            <div style={{ fontSize:20 }}>{s.i}</div>
            <div>
              <div style={{ fontSize: m?18:20, fontWeight:800, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)" }}>{s.l}</div>
            </div>
          </div>
        ))}
      </div>

      </>)}

      {/* ── Formulario ── */}
      <div style={cardS}>
        <div style={{ fontSize:13, fontWeight:700, color:"white", marginBottom:12 }}>
          {editId ? "✏️ Editar recepción" : "🍋 Nueva recepción"}
        </div>

        <div style={{ display:"grid", gridTemplateColumns: camposCols, gap:10, marginBottom:12 }}>
          <div style={campoBox}>
            <div style={lbl}>Remisión #</div>
            <input style={inp} value={form.remision} onChange={e=>setCampo("remision", e.target.value)} placeholder="Ej: 00123" />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Fecha</div>
            <input type="date" style={inp} value={form.fecha} onChange={e=>setCampo("fecha", e.target.value)} />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Tipo</div>
            <CustomSelect value={form.tipo} onChange={e=>setCampo("tipo", e.target.value)} style={inp}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </CustomSelect>
          </div>
          <div style={campoBox}>
            <div style={lbl}>Placa</div>
            <input style={inp} value={form.placa} onChange={e=>setCampo("placa", e.target.value.toUpperCase())} placeholder="ABC123" />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Conductor</div>
            <input style={inp} value={form.conductor} onChange={e=>setCampo("conductor", e.target.value)} placeholder="Nombre del conductor" />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Cédula conductor</div>
            <input style={inp} value={form.cedulaConductor} onChange={e=>setCampo("cedulaConductor", e.target.value)} placeholder="N° de cédula" />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Origen</div>
            <input style={inp} value={form.origen} onChange={e=>setCampo("origen", e.target.value)} placeholder="Lugar de origen" />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Proveedor</div>
            <input style={inp} value={form.proveedor} onChange={e=>setCampo("proveedor", e.target.value)} placeholder="Predio / proveedor" />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Supervisor</div>
            <input style={inp} value={form.supervisor} onChange={e=>setCampo("supervisor", e.target.value)} placeholder="Quién recibió / despachó" />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Hora inicio</div>
            <input type="time" style={inp} value={form.horaInicio} onChange={e=>setCampo("horaInicio", e.target.value)} />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Hora fin</div>
            <input type="time" style={inp} value={form.horaFin} onChange={e=>setCampo("horaFin", e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom:12 }}>
          <div style={lbl}>Observaciones</div>
          <textarea
            style={{ ...inp, minHeight: isLandscape ? 44 : (m ? 70 : 56), resize:"vertical", fontFamily:"inherit" }}
            value={form.observaciones}
            onChange={e=>setCampo("observaciones", e.target.value)}
            placeholder="Notas adicionales sobre la recepción..."
          />
        </div>

        {/* ── Estibas ── */}
        <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.6)", marginBottom:8 }}>Estibas</div>

        {m ? (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {form.estibas.map((e, idx) => (
              <div key={idx} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, flexWrap:"wrap", gap:6 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#845EF7" }}>
                    Estiba #{e.numero}
                    {canastillasDeEstiba(e).length > 1 && (
                      <span style={{ marginLeft:8, fontSize:9, fontWeight:700, color:"#F9A826", background:"rgba(249,168,38,0.14)", borderRadius:20, padding:"2px 8px" }}>MIXTA</span>
                    )}
                    {editId && (
                      <span style={{ marginLeft:8, fontSize:9, fontWeight:700, color: e.usada ? "#00C9A7" : "rgba(255,255,255,0.35)", background: e.usada ? "rgba(0,201,167,0.14)" : "rgba(255,255,255,0.06)", borderRadius:20, padding:"2px 8px" }}>
                        {e.usada ? "✓ USADA" : "SIN USAR"}
                      </span>
                    )}
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {editId && <button onClick={()=>imprimirTirillaEstiba(e,"rollo")} style={btnTablaEditar}>🖨 Rollo</button>}
                    {editId && <button onClick={()=>imprimirTirillaEstiba(e,"word")} style={btnTablaEditar}>📝 Word</button>}
                    <button onClick={()=>quitarEstiba(idx)} style={btnTablaEliminar}>Quitar</button>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div><div style={lbl}>Peso bruto</div><input type="number" min="0" style={inp} value={e.pesoBruto} onChange={ev=>setEstiba(idx,"pesoBruto",ev.target.value)} /></div>
                  <div><div style={lbl}>Estiba plástica</div>
                    <CustomSelect value={e.estibaPlastica} onChange={ev=>setEstiba(idx,"estibaPlastica",ev.target.value)} style={inp}>
                      <option value="si">Sí</option><option value="no">No</option>
                    </CustomSelect>
                  </div>
                </div>

                <div style={{ marginTop:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:5 }}>
                    <div style={lbl}>Canastillas</div>
                    <div style={{ fontSize:10.5, color:"rgba(255,255,255,0.5)" }}>
                      Total: <b style={{ color:"rgba(255,255,255,0.8)" }}>{pesoCanastillasEstiba(e).toLocaleString("es-CO",{maximumFractionDigits:2})} kg</b>
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                    {canastillasDeEstiba(e).map((c, ci) => {
                      const multi = canastillasDeEstiba(e).length > 1;
                      const pesoLinea = num(c.cantidad) * num(c.tipo);
                      return (
                        <div key={ci} style={{ display:"grid", gridTemplateColumns: multi ? "84px 1fr 60px auto" : "84px 1fr 60px", gap:5, alignItems:"center" }}>
                          <CustomSelect value={c.tipo} onChange={ev=>setCanastilla(idx,ci,"tipo",ev.target.value)} style={inpCan}>
                            {TIPOS_CANASTILLA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </CustomSelect>
                          <input type="number" min="0" style={inpCan} placeholder="Cantidad" value={c.cantidad} onChange={ev=>setCanastilla(idx,ci,"cantidad",ev.target.value)} />
                          <div style={{ fontSize:11, color:"rgba(255,255,255,0.55)", textAlign:"right", whiteSpace:"nowrap" }}>{pesoLinea.toLocaleString("es-CO",{maximumFractionDigits:2})}</div>
                          {multi && (
                            <button onClick={()=>quitarTipoCanastilla(idx,ci)} style={{ ...btnTablaEliminar, padding:"3px 7px" }}>✕</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={()=>agregarTipoCanastilla(idx)} style={{ marginTop:5, background:"rgba(249,168,38,0.10)", border:"1px solid rgba(249,168,38,0.3)", borderRadius:6, color:"#F9A826", padding:"4px 9px", fontSize:10.5, fontWeight:600, cursor:"pointer" }}>
                    + Mezclar otro tipo
                  </button>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8 }}>
                  <div><div style={lbl}>Peso estiba</div><input type="number" min="0" style={inp} value={e.pesoEstiba} onChange={ev=>setEstiba(idx,"pesoEstiba",ev.target.value)} /></div>
                  <div><div style={lbl}>Descuento estiba</div><div style={{...inp, background:"rgba(255,255,255,0.04)", color:"rgba(255,255,255,0.7)", display:"flex", alignItems:"center"}}>{descuentoEstiba(e).toLocaleString("es-CO",{maximumFractionDigits:2})}</div></div>
                  <div style={{ gridColumn:"1 / -1" }}><div style={lbl}>Peso neto</div><div style={{...inp, background: pesoNetoEstiba(e) < 0 ? "rgba(240,68,56,0.12)" : "rgba(0,201,167,0.1)", color: pesoNetoEstiba(e) < 0 ? "#F04438" : "#00C9A7", fontWeight:700, display:"flex", alignItems:"center"}}>{pesoNetoEstiba(e).toLocaleString("es-CO",{maximumFractionDigits:2})}{pesoNetoEstiba(e) < 0 ? " ⚠️" : ""}</div></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11.5 }}>
              <thead>
                <tr style={{ color:"rgba(255,255,255,0.45)", textAlign:"left" }}>
                  <th style={{ padding:"4px 6px" }}>#</th>
                  <th style={{ padding:"4px 6px" }}>Peso bruto</th>
                  <th style={{ padding:"4px 6px" }}>Estiba plástica</th>
                  <th style={{ padding:"4px 6px", minWidth:210 }}>Canastillas (tipo · cant. · peso)</th>
                  <th style={{ padding:"4px 6px" }}>Peso canastillas</th>
                  <th style={{ padding:"4px 6px" }}>Peso estiba</th>
                  <th style={{ padding:"4px 6px" }}>Descuento estiba</th>
                  <th style={{ padding:"4px 6px" }}>Peso neto</th>
                  {editId && <th style={{ padding:"4px 6px" }}>Usada</th>}
                  <th style={{ padding:"4px 6px" }}></th>
                </tr>
              </thead>
              <tbody>
                {form.estibas.map((e, idx) => (
                  <tr key={idx} style={{ borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding:"6px", color:"white", fontWeight:700 }}>{e.numero}</td>
                    <td style={{ padding:"6px" }}><input type="number" min="0" style={inp} value={e.pesoBruto} onChange={ev=>setEstiba(idx,"pesoBruto",ev.target.value)} /></td>
                    <td style={{ padding:"6px", minWidth:100 }}>
                      <CustomSelect value={e.estibaPlastica} onChange={ev=>setEstiba(idx,"estibaPlastica",ev.target.value)} style={inp}>
                        <option value="si">Sí</option><option value="no">No</option>
                      </CustomSelect>
                    </td>
                    <td style={{ padding:"6px", minWidth:210 }}>
                      <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                        {canastillasDeEstiba(e).map((c, ci) => {
                          const multi = canastillasDeEstiba(e).length > 1;
                          const pesoLinea = num(c.cantidad) * num(c.tipo);
                          return (
                            <div key={ci} style={{ display:"grid", gridTemplateColumns: multi ? "70px 56px 46px auto" : "70px 56px 46px", gap:3, alignItems:"center" }}>
                              <CustomSelect value={c.tipo} onChange={ev=>setCanastilla(idx,ci,"tipo",ev.target.value)} style={inpCan}>
                                {TIPOS_CANASTILLA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </CustomSelect>
                              <input type="number" min="0" style={inpCan} placeholder="Cant." value={c.cantidad} onChange={ev=>setCanastilla(idx,ci,"cantidad",ev.target.value)} />
                              <div style={{ fontSize:10.5, color:"rgba(255,255,255,0.5)", textAlign:"right", whiteSpace:"nowrap" }}>{pesoLinea.toLocaleString("es-CO",{maximumFractionDigits:1})}</div>
                              {multi && (
                                <button onClick={()=>quitarTipoCanastilla(idx,ci)} style={{ ...btnTablaEliminar, padding:"2px 6px" }}>✕</button>
                              )}
                            </div>
                          );
                        })}
                        <button onClick={()=>agregarTipoCanastilla(idx)} style={{ background:"rgba(249,168,38,0.10)", border:"1px solid rgba(249,168,38,0.3)", borderRadius:6, color:"#F9A826", padding:"2px 7px", fontSize:10, fontWeight:600, cursor:"pointer", alignSelf:"flex-start" }}>
                          + Mezclar tipo
                        </button>
                      </div>
                    </td>
                    <td style={{ padding:"6px", color:"rgba(255,255,255,0.7)" }}>{pesoCanastillasEstiba(e).toLocaleString("es-CO",{maximumFractionDigits:2})}</td>
                    <td style={{ padding:"6px" }}><input type="number" min="0" style={inp} value={e.pesoEstiba} onChange={ev=>setEstiba(idx,"pesoEstiba",ev.target.value)} /></td>
                    <td style={{ padding:"6px", color:"rgba(255,255,255,0.7)" }}>{descuentoEstiba(e).toLocaleString("es-CO",{maximumFractionDigits:2})}</td>
                    <td style={{ padding:"6px", color: pesoNetoEstiba(e) < 0 ? "#F04438" : "#00C9A7", fontWeight:700 }}>{pesoNetoEstiba(e).toLocaleString("es-CO",{maximumFractionDigits:2})}{pesoNetoEstiba(e) < 0 ? " ⚠️" : ""}</td>
                    {editId && (
                      <td style={{ padding:"6px" }}>
                        <span style={{ fontSize:9, fontWeight:700, color: e.usada ? "#00C9A7" : "rgba(255,255,255,0.35)", background: e.usada ? "rgba(0,201,167,0.14)" : "rgba(255,255,255,0.06)", borderRadius:20, padding:"2px 8px", whiteSpace:"nowrap" }}>
                          {e.usada ? "✓ Usada" : "Sin usar"}
                        </span>
                      </td>
                    )}
                    <td style={{ padding:"6px", whiteSpace:"nowrap" }}>
                      {editId && <button onClick={()=>imprimirTirillaEstiba(e,"rollo")} style={btnTablaEditar} title="Tirilla — impresora Rollo">🖨</button>}
                      {editId && <button onClick={()=>imprimirTirillaEstiba(e,"word")} style={btnTablaEditar} title="Tirilla — hoja carta (Word)">📝</button>}
                      <button onClick={()=>quitarEstiba(idx)} style={btnTablaEliminar}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button onClick={agregarEstiba} style={{ marginTop:10, background:"rgba(132,94,247,0.12)", border:"1px solid rgba(132,94,247,0.35)", borderRadius:8, color:"#a78bfa", padding:"7px 12px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
          + Agregar estiba
        </button>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:16, paddingTop:12, borderTop:"1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)" }}>Total peso neto</div>
            <div style={{ fontSize: m?20:22, fontWeight:800, color:"#00C9A7" }}>{totalNeto.toLocaleString("es-CO",{maximumFractionDigits:2})} kg</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {editId && (
              <button onClick={cancelarEdicion} style={btnSecundario}>
                Cancelar
              </button>
            )}
            <button onClick={()=>verInforme({ ...form, id: editId || "preview", total: totalNeto })} style={{ background:"rgba(0,201,167,0.12)", border:"1px solid rgba(0,201,167,0.35)", borderRadius:8, color:"#00C9A7", padding:"9px 16px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              📄 Vista previa
            </button>
            <button onClick={guardar} disabled={guardando} style={btnPrimario(guardadoOk, guardando)}>
              {guardadoOk ? "✓ Guardado" : guardando ? "Guardando..." : editId ? "Guardar cambios" : "Guardar recepción"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Historial ── */}
      <div style={cardS}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, flexWrap:"wrap", gap:8 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"white" }}>📋 Recepciones registradas</div>
        </div>

        {/* Entradas y salidas se ven, filtran e informan por separado — cada
            una es un flujo de negocio distinto (fruta que entra vs. que sale). */}
        <div style={{ display:"flex", gap:6, marginBottom:14 }}>
          {[
            { id:"entrada", label:"⬇️ Entradas", color:"#845EF7" },
            { id:"salida",  label:"⬆️ Salidas",  color:"#F9A826" },
          ].map(tb => (
            <button
              key={tb.id}
              onClick={()=>setTipoTab(tb.id)}
              style={{
                flex: m ? 1 : "0 0 auto", padding:"8px 18px", borderRadius:8, fontSize:12.5, fontWeight:700, cursor:"pointer",
                background: tipoTab===tb.id ? `${tb.color}22` : "rgba(255,255,255,0.03)",
                border: `1px solid ${tipoTab===tb.id ? `${tb.color}66` : "rgba(255,255,255,0.1)"}`,
                color: tipoTab===tb.id ? tb.color : "rgba(255,255,255,0.45)",
              }}
            >
              {tb.label} ({recepciones.filter(r=>r.tipo===tb.id).length})
            </button>
          ))}
        </div>

        <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"flex-end", marginBottom:14 }}>
          <div style={{ flex: m ? "1 1 100%" : "0 1 160px" }}>
            <div style={lbl}>Desde</div>
            <input type="date" style={inp} value={filtroDesde} onChange={e=>setFiltroDesde(e.target.value)} />
          </div>
          <div style={{ flex: m ? "1 1 100%" : "0 1 160px" }}>
            <div style={lbl}>Hasta</div>
            <input type="date" style={inp} value={filtroHasta} onChange={e=>setFiltroHasta(e.target.value)} />
          </div>
          {(filtroDesde || filtroHasta) && (
            <button onClick={()=>{setFiltroDesde("");setFiltroHasta("");}} style={{ ...btnSecundario, padding:"0 14px", height: isLandscape?36:(m?44:32), display:"flex", alignItems:"center", justifyContent:"center" }}>
              ✕ Limpiar
            </button>
          )}
          <button onClick={verInformeGeneral} disabled={recepcionesFiltradas.length===0} style={{ marginLeft: m ? 0 : "auto", background:"rgba(0,201,167,0.12)", border:"1px solid rgba(0,201,167,0.35)", borderRadius:8, color: recepcionesFiltradas.length===0 ? "rgba(0,201,167,0.4)" : "#00C9A7", padding:"0 16px", fontSize:12, fontWeight:700, cursor: recepcionesFiltradas.length===0 ? "default" : "pointer", height: isLandscape?36:(m?44:32), display:"flex", alignItems:"center", justifyContent:"center" }}>
            📄 Informe general de {tipoTab === "salida" ? "Salidas" : "Entradas"} ({recepcionesFiltradas.length})
          </button>
        </div>

        {recepcionesFiltradas.length === 0 ? (
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", padding:"12px 0" }}>
            {recepciones.length === 0 ? "Sin recepciones registradas todavía." : `Ninguna ${tipoTab === "salida" ? "salida" : "entrada"} cae en el rango de fechas seleccionado.`}
          </div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ color:"rgba(255,255,255,0.45)", textAlign:"left" }}>
                  <th style={{ padding:"6px" }}>Remisión</th>
                  <th style={{ padding:"6px" }}>Fecha</th>
                  <th style={{ padding:"6px" }}>Placa</th>
                  <th style={{ padding:"6px" }}>Proveedor</th>
                  <th style={{ padding:"6px" }}>Supervisor</th>
                  <th style={{ padding:"6px" }}>Estibas</th>
                  <th style={{ padding:"6px" }}>Total neto</th>
                  <th style={{ padding:"6px" }}></th>
                </tr>
              </thead>
              <tbody>
                {recepcionesFiltradas.map(r => (
                  <tr key={r.id} style={{ borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding:"6px", color:"white", fontWeight:600 }}>{r.remision || "—"}</td>
                    <td style={{ padding:"6px" }}>{r.fecha}</td>
                    <td style={{ padding:"6px" }}>{r.placa || "—"}</td>
                    <td style={{ padding:"6px" }}>{r.proveedor || "—"}</td>
                    <td style={{ padding:"6px" }}>{r.supervisor || "—"}</td>
                    <td style={{ padding:"6px", textAlign:"center" }}>
                      {r.estibas.filter(e => e.usada).length}/{r.estibas.length}
                    </td>
                    <td style={{ padding:"6px", color:"#00C9A7", fontWeight:700 }}>{num(r.total).toLocaleString("es-CO",{maximumFractionDigits:2})} kg</td>
                    <td style={{ padding:"6px", whiteSpace:"nowrap" }}>
                      <button onClick={()=>verInforme(r)} style={{ background:"rgba(0,201,167,0.12)", border:"1px solid rgba(0,201,167,0.3)", borderRadius:6, color:"#00C9A7", padding:"4px 8px", fontSize:11, cursor:"pointer", marginRight:6 }}>📄 Informe</button>
                      <button onClick={()=>editarRecepcion(r)} style={btnTablaEditar}>Editar</button>
                      <button onClick={()=>{ if (window.confirm(`¿Eliminar la recepción con remisión "${r.remision || r.id}"? Esta acción no se puede deshacer.`)) eliminarRecepcion(r.id); }} style={btnTablaEliminar}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </>)}

      {/* ═══ TAB 1 — VERIFICACIÓN DE ESTIBAS ═══ */}
      {tabRec === 1 && (
        <div style={{ maxWidth:460, margin:"0 auto" }}>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)", marginBottom:16, lineHeight:1.5 }}>
            🧱 Escanea el QR de la tirilla de una estiba (la que quitaste al usarla) para marcarla como usada.
          </div>

          {!resultadoEstiba && (
            <div style={cardS}>
              {!camActiva && (
                <button onClick={iniciarCamaraEstiba} style={{ ...btnPrimario(false,false), width:"100%", padding: m ? "14px" : "10px", fontSize: m ? 14 : 12 }}>
                  ▶️ Iniciar cámara
                </button>
              )}
              {camActiva && (
                <button onClick={detenerCamaraEstiba} style={{ ...btnSecundario, width:"100%", padding: m ? "14px" : "10px", fontSize: m ? 14 : 12 }}>
                  ⏹ Detener cámara
                </button>
              )}
              {camError && (
                <div style={{ marginTop:10, fontSize:11, color:"#fca5a5", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:10 }}>
                  {camError}
                </div>
              )}
              <div id={READER_ID_ESTIBA} style={{ marginTop:10, borderRadius:10, overflow:"hidden", background: camActiva ? "black" : "transparent" }} />
            </div>
          )}

          {resultadoEstiba?.estado === "no-encontrado" && (
            <div style={{ ...cardS, textAlign:"center" }}>
              <div style={{ fontSize:30, marginBottom:8 }}>❓</div>
              <div style={{ fontSize:13, fontWeight:700, color:"#F9A826", marginBottom:4 }}>Estiba no encontrada</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", marginBottom:16 }}>
                El QR no corresponde a ninguna recepción/estiba guardada en el sistema.
              </div>
              <button onClick={escanearOtraEstiba} style={{ ...btnPrimario(false,false), width:"100%" }}>🔄 Escanear otra</button>
            </div>
          )}

          {resultadoEstiba?.estado === "ok" && (() => {
            const { recepcion, estiba } = resultadoEstiba;
            return (
              <div style={cardS}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                  <div>
                    <div style={lbl}>REMISIÓN</div>
                    <div style={{ fontSize:16, color:"white", fontWeight:700 }}>{recepcion.remision || "—"}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={lbl}>ESTIBA</div>
                    <div style={{ fontSize:30, fontWeight:900, color:"#a5b4fc", lineHeight:1 }}>{estiba.numero}</div>
                  </div>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                  <div><div style={lbl}>Fecha de ingreso</div><div style={{ fontSize:13, color:"white", fontWeight:700 }}>{recepcion.fecha}</div></div>
                  <div><div style={lbl}>Hora</div><div style={{ fontSize:13, color:"white", fontWeight:700 }}>{recepcion.horaInicio || "—"}</div></div>
                  <div><div style={lbl}>Proveedor</div><div style={{ fontSize:13, color:"white", fontWeight:700 }}>{recepcion.proveedor || "—"}</div></div>
                  <div><div style={lbl}>N° de Canastillas</div><div style={{ fontSize:13, color:"white", fontWeight:700 }}>{canastillasDeEstiba(estiba).reduce((s,c)=>s+num(c.cantidad),0)}</div></div>
                  <div style={{ gridColumn:"1 / -1" }}><div style={lbl}>Peso Neto</div><div style={{ fontSize:14, color:"#00C9A7", fontWeight:800 }}>{kg(pesoNetoEstiba(estiba))} kg</div></div>
                </div>

                {estiba.usada ? (
                  <>
                    <div style={{ background:"rgba(0,201,167,0.1)", border:"1px solid rgba(0,201,167,0.35)", borderRadius:9, padding:"10px 12px", marginBottom:10 }}>
                      <div style={{ fontSize:12, fontWeight:800, color:"#00C9A7", marginBottom:2 }}>✓ Usada</div>
                      <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)" }}>
                        {estiba.usadaPor ? `Por ${estiba.usadaPor} · ` : ""}{estiba.usadaEn ? new Date(estiba.usadaEn).toLocaleString("es-CO",{dateStyle:"short",timeStyle:"short"}) : ""}
                      </div>
                    </div>

                    {(() => {
                      const totalCant    = canastillasDeEstiba(estiba).reduce((s,c)=>s+num(c.cantidad),0);
                      const asignadoCant = cantidadAsignadaEstiba(recepcion.id, estiba.numero);
                      const sobrante     = totalCant - asignadoCant;
                      if (sobrante <= 0) {
                        return (
                          <div style={{ background:"rgba(0,201,167,0.08)", border:"1px solid rgba(0,201,167,0.25)", borderRadius:9, padding:"9px 12px", marginBottom:10, fontSize:11.5, color:"#00C9A7" }}>
                            ✓ Las {totalCant} canastillas de esta estiba ya están asignadas a contenedor.
                          </div>
                        );
                      }
                      return (
                        <div style={{ background:"rgba(249,168,38,0.1)", border:"1px solid rgba(249,168,38,0.35)", borderRadius:9, padding:"10px 12px", marginBottom:10 }}>
                          <div style={{ fontSize:12, fontWeight:800, color:"#F9A826", marginBottom:6 }}>
                            ⚠️ Sobran {sobrante} canastillas de esta estiba (de {totalCant} totales) sin asignar a un contenedor.
                          </div>
                          {modoSobranteEstiba !== "elegir" ? (
                            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                              <button onClick={()=>setModoSobranteEstiba("elegir")} style={btnPrimario(false,false)}>Asignar a otro contenedor</button>
                              <button onClick={()=>dejarSobranteComoReserva(recepcion.id, estiba.numero, sobrante)} disabled={guardandoSobrante} style={btnSecundario}>
                                {guardandoSobrante ? "Guardando..." : "🗄 Dejar como reserva"}
                              </button>
                            </div>
                          ) : (
                            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-end" }}>
                              <div style={{ flex:"1 1 160px", minWidth:0 }}>
                                <CustomSelect value={contenedorSobranteId} onChange={ev=>setContenedorSobranteId(ev.target.value)} style={inp}>
                                  <option value="">Selecciona un contenedor...</option>
                                  {bookingsLog.map(b => <option key={b.id} value={b.id}>{labelBookingLog(b)}</option>)}
                                </CustomSelect>
                              </div>
                              <button onClick={()=>asignarSobranteAContenedor(recepcion.id, estiba.numero, sobrante)} disabled={guardandoSobrante} style={btnPrimario(false,guardandoSobrante)}>
                                {guardandoSobrante ? "Guardando..." : "Confirmar"}
                              </button>
                              <button onClick={()=>{ setModoSobranteEstiba(null); setContenedorSobranteId(""); }} style={btnSecundario}>Cancelar</button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <button
                    onClick={marcarEstibaUsada}
                    disabled={marcandoUsada}
                    style={{ width:"100%", background:"linear-gradient(135deg,#0f766e,#14b8a6)", border:"none", borderRadius:9, padding: m ? "14px" : "11px", fontSize: m ? 14 : 12, color:"white", cursor: marcandoUsada ? "wait" : "pointer", fontWeight:700, opacity: marcandoUsada ? 0.7 : 1, marginBottom:10, fontFamily:"inherit" }}
                  >
                    {marcandoUsada ? "Guardando..." : "✓ Marcar como Usada"}
                  </button>
                )}

                <button onClick={escanearOtraEstiba} style={{ ...btnSecundario, width:"100%" }}>🔄 Escanear otra estiba</button>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══ TAB 2 — ASOCIAR CONTENEDOR ═══ */}
      {tabRec === 2 && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {[["asignar","➕ Asignar Canastillas"],["revision","📊 Revisión por Contenedor"]].map(([id,label]) => (
              <button key={id} onClick={()=>setSubVistaAsoc(id)} style={{
                background: subVistaAsoc===id ? "rgba(0,201,167,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${subVistaAsoc===id ? "#00C9A790" : "rgba(255,255,255,0.1)"}`,
                borderRadius:8, padding:"7px 14px", cursor:"pointer",
                color: subVistaAsoc===id ? "#00C9A7" : "rgba(255,255,255,0.45)",
                fontWeight:700, fontSize:12, fontFamily:"inherit",
              }}>{label}</button>
            ))}
          </div>

          {subVistaAsoc === "asignar" && (
            recepcionAsocSel === null ? (
              <div style={cardS}>
                <div style={{ fontSize:13, fontWeight:700, color:"white", marginBottom:10 }}>📦 Elige una remisión para asignar sus estibas a un contenedor</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"flex-end", marginBottom:10 }}>
                  <input value={busquedaAsoc} onChange={e=>setBusquedaAsoc(e.target.value)} placeholder="🔍 Buscar por remisión, proveedor o placa..." style={{ ...inp, flex:"1 1 200px" }} />
                  <div style={{ flex:"0 1 150px" }}>
                    <div style={lbl}>Desde</div>
                    <input type="date" style={inp} value={filtroDesdeAsoc} onChange={e=>setFiltroDesdeAsoc(e.target.value)} />
                  </div>
                  <div style={{ flex:"0 1 150px" }}>
                    <div style={lbl}>Hasta</div>
                    <input type="date" style={inp} value={filtroHastaAsoc} onChange={e=>setFiltroHastaAsoc(e.target.value)} />
                  </div>
                  {(filtroDesdeAsoc || filtroHastaAsoc) && (
                    <button onClick={()=>{setFiltroDesdeAsoc("");setFiltroHastaAsoc("");}} style={btnSecundario}>✕ Limpiar</button>
                  )}
                </div>
                {recepcionesAsocFiltradas.length === 0 ? (
                  <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>Sin recepciones registradas.</div>
                ) : (
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                      <thead>
                        <tr style={{ color:"rgba(255,255,255,0.45)", textAlign:"left" }}>
                          <th style={{ padding:"6px" }}>Remisión</th><th style={{ padding:"6px" }}>Fecha</th>
                          <th style={{ padding:"6px" }}>Proveedor</th><th style={{ padding:"6px" }}>Estibas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recepcionesAsocFiltradas.map(r => (
                          <tr key={r.id} style={{ borderTop:"1px solid rgba(255,255,255,0.06)", cursor:"pointer" }} onClick={()=>setRecepcionAsocSel(r.id)}>
                            <td style={{ padding:"6px", color:"white", fontWeight:600 }}>{r.remision || "—"}</td>
                            <td style={{ padding:"6px" }}>{r.fecha}</td>
                            <td style={{ padding:"6px" }}>{r.proveedor || "—"}</td>
                            <td style={{ padding:"6px" }}>{r.estibas.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : !recepcionAsoc ? null : (
              <div style={cardS}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"white" }}>📦 {recepcionAsoc.remision || `#${recepcionAsoc.id}`} — {recepcionAsoc.proveedor || "—"}</div>
                  <button onClick={()=>setRecepcionAsocSel(null)} style={btnSecundario}>← Volver</button>
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {recepcionAsoc.estibas.map(e => {
                    const total       = canastillasDeEstiba(e).reduce((s,c)=>s+num(c.cantidad),0);
                    const asignadas   = cantidadAsignadaEstiba(recepcionAsoc.id, e.numero);
                    const disponibles = total - asignadas;
                    const asigsEstiba = asignacionesPorEstiba(recepcionAsoc.id, e.numero);
                    return (
                      <div key={e.numero} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:10 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, flexWrap:"wrap", gap:6 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:"#845EF7" }}>Estiba #{e.numero}</div>
                          <div style={{ fontSize:10.5, color:"rgba(255,255,255,0.5)" }}>
                            Total <b style={{ color:"white" }}>{total}</b> · Asignadas <b style={{ color:"#F9A826" }}>{asignadas}</b> · Disponibles <b style={{ color: disponibles>0 ? "#00C9A7" : "rgba(255,255,255,0.4)" }}>{disponibles}</b>
                          </div>
                        </div>

                        {asigsEstiba.length > 0 && (
                          <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:8 }}>
                            {asigsEstiba.map(a => (
                              <div key={a.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:11, background:"rgba(255,255,255,0.03)", borderRadius:6, padding:"5px 8px" }}>
                                <span style={{ color:"rgba(255,255,255,0.7)" }}>{labelAsignacionDestino(a)} — <b style={{ color:"white" }}>{a.cantidadCanastillas}</b> canastillas{a.registradoPor ? ` · ${a.registradoPor}` : ""}</span>
                                <button onClick={()=>eliminarAsignacion(a.id)} style={{ background:"none", border:"none", color:"#FF6B6B", cursor:"pointer", fontSize:11, padding:0, fontFamily:"inherit" }}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}

                        {disponibles > 0 && (
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"flex-end" }}>
                            <div style={{ flex:"1 1 160px", minWidth:0 }}>
                              <div style={lbl}>Contenedor</div>
                              <CustomSelect value={asigContenedorId[e.numero]||""} onChange={ev=>setAsigContenedorId(p=>({...p,[e.numero]:ev.target.value}))} style={inp}>
                                <option value="">Selecciona...</option>
                                {bookingsLog.map(b => <option key={b.id} value={b.id}>{labelBookingLog(b)}</option>)}
                              </CustomSelect>
                            </div>
                            <div style={{ width:110 }}>
                              <div style={lbl}>Canastillas</div>
                              <input type="number" min="0" max={disponibles} style={inp} value={asigCantidad[e.numero]||""} onChange={ev=>setAsigCantidad(p=>({...p,[e.numero]:ev.target.value}))} placeholder={`Máx ${disponibles}`} />
                            </div>
                            <button onClick={()=>asignarCanastillas(e.numero, disponibles)} disabled={guardandoAsig[e.numero]} style={btnPrimario(false, guardandoAsig[e.numero])}>
                              {guardandoAsig[e.numero] ? "Guardando..." : "Asignar"}
                            </button>
                          </div>
                        )}
                        {errorAsig[e.numero] && (
                          <div style={{ color:"#FF6B6B", fontSize:11, marginTop:6, fontWeight:600 }}>⚠️ {errorAsig[e.numero]}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {subVistaAsoc === "revision" && (
            <div style={cardS}>
              <div style={{ fontSize:13, fontWeight:700, color:"white", marginBottom:10 }}>📊 Revisión de Canastillas por Contenedor</div>
              <div style={{ marginBottom:14, maxWidth:320 }}>
                <div style={lbl}>Contenedor</div>
                <CustomSelect value={contenedorRevisionId} onChange={e=>setContenedorRevisionId(e.target.value)} style={inp}>
                  <option value="">Selecciona un contenedor...</option>
                  <option value="reserva">🗄 Reserva (sin contenedor)</option>
                  {bookingsLog.map(b => <option key={b.id} value={b.id}>{labelBookingLog(b)}</option>)}
                </CustomSelect>
              </div>

              {!contenedorRevisionId ? (
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>Elige un contenedor para ver sus asignaciones.</div>
              ) : asignacionesDelContenedor.length === 0 ? (
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>Todavía no hay canastillas asignadas a este contenedor.</div>
              ) : (
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead>
                      <tr style={{ color:"rgba(255,255,255,0.45)", textAlign:"left" }}>
                        <th style={{ padding:"6px" }}>Remisión</th><th style={{ padding:"6px" }}>Fecha</th>
                        <th style={{ padding:"6px" }}>Proveedor</th><th style={{ padding:"6px" }}>Estiba</th>
                        <th style={{ padding:"6px" }}>Canastillas</th><th style={{ padding:"6px" }}>Registrado por</th>
                        <th style={{ padding:"6px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {asignacionesDelContenedor.map(a => (
                        <tr key={a.id} style={{ borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                          <td style={{ padding:"6px", color:"white", fontWeight:600 }}>{a.recepcion?.remision || "—"}</td>
                          <td style={{ padding:"6px" }}>{a.recepcion?.fecha || "—"}</td>
                          <td style={{ padding:"6px" }}>{a.recepcion?.proveedor || "—"}</td>
                          <td style={{ padding:"6px" }}>#{a.numeroEstiba}</td>
                          <td style={{ padding:"6px", fontWeight:700, color:"#00C9A7" }}>{a.cantidadCanastillas}</td>
                          <td style={{ padding:"6px" }}>{a.registradoPor || "—"}</td>
                          <td style={{ padding:"6px" }}>
                            <button onClick={()=>eliminarAsignacion(a.id)} style={btnTablaEliminar}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop:"2px solid rgba(255,255,255,0.12)" }}>
                        <td colSpan={4} style={{ padding:"8px 6px", fontWeight:700, color:"rgba(255,255,255,0.6)" }}>Total canastillas</td>
                        <td style={{ padding:"8px 6px", fontWeight:800, color:"#00C9A7" }}>{totalCanastillasContenedor}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Modal vista previa del informe ── */}
      {preview && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.75)", zIndex:9999, display:"flex", flexDirection:"column", padding: m ? 8 : 24 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ color:"white", fontSize:13, fontWeight:700 }}>📄 {preview.titulo || "Vista previa — Informe de Recepción"}</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={descargarInforme} style={{ background:"linear-gradient(135deg,#845EF7,#6366F1)", border:"none", borderRadius:8, color:"white", padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                ⬇ Descargar
              </button>
              <button onClick={cerrarPreview} style={{ background:"rgba(255,255,255,0.10)", border:"1px solid rgba(255,255,255,0.20)", borderRadius:8, padding:"8px 14px", fontSize:12, color:"rgba(255,255,255,0.78)", cursor:"pointer" }}>
                ✕ Cerrar
              </button>
            </div>
          </div>
          <iframe src={preview.url} style={{ flex:1, border:"none", borderRadius:10, background:"white" }} title="Vista previa del informe" />
        </div>
      )}
    </div>
  );
}
