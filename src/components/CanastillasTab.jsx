import { useState, useEffect, useMemo, useRef } from "react";
import QRCode from "qrcode";
import LimonLoader from "./LimonLoader.jsx";
import CustomSelect from "./CustomSelect.jsx";
import { btnSecundario, btnPrimario, btnTablaEliminar } from "./buttonStyles.js";
import { useCanastillas } from "../hooks/useCanastillas.js";

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

const ACCIONES = [
  { value: "prestamo",   label: "Préstamo — sale a un proveedor" },
  { value: "devolucion", label: "Devolución — vuelve a bodega" },
  { value: "perdida",    label: "Reportar pérdida" },
  { value: "baja",       label: "Dar de baja (dañada)" },
];

const inp = { background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"7px 10px", color:"white", fontSize:11, fontFamily:"inherit", width:"100%", boxSizing:"border-box" };
const lbl = { fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:3 };

const hoyISO = () => new Date().toISOString().split("T")[0];

// Días transcurridos desde una fecha "YYYY-MM-DD" (local, sin líos de huso horario).
const diasDesde = (fechaISO) => {
  if (!fechaISO) return null;
  const [y, m, d] = fechaISO.split("-").map(Number);
  const entonces = new Date(y, m - 1, d);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((hoy - entonces) / 86400000);
};

const DIAS_PRESTAMO_VENCIDO = 20; // umbral simple para marcar un préstamo como "atrasado"

// ── Beep corto de confirmación al aceptar un escaneo ────────────────────────
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
  } catch {}
}

// ── Hoja de etiquetas imprimible (HTML autocontenido) ──────────────────────
function buildHojaEtiquetas(pares) {
  const unaEtiqueta = ({ codigo, dataUrl }) => `
    <div class="etq">
      <img src="${dataUrl}" alt="${codigo}" />
      <div class="cod">${codigo}</div>
    </div>`;
  // Cada canastilla se imprime dos veces seguidas (misma, repetida) antes de pasar a la siguiente.
  const celdas = pares.flatMap(p => [unaEtiqueta(p), unaEtiqueta(p)]).join("");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Etiquetas Canastillas</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;padding:16px;background:white}
  .grid{display:flex;flex-direction:column;align-items:center;gap:10px}
  .etq{border:1px dashed #999;border-radius:6px;padding:8px;text-align:center;page-break-inside:avoid;width:131px}
  .etq img{width:100%;max-width:107px;height:auto}
  .cod{font-size:11px;font-weight:700;margin-top:4px;color:#222;letter-spacing:0.5px}
  @media print{
    body{padding:0}
  }
</style></head>
<body><div class="grid">${celdas}</div></body></html>`;
}

const estiloInforme = `
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;padding:28px;color:#222;max-width:900px;margin:0 auto;font-size:12px}
  h1{color:#845EF7;margin-bottom:2px;font-size:20px}
  .hdr-row{display:flex;align-items:center;gap:12px;margin-bottom:2px}
  .hdr-row img{width:40px;height:40px;object-fit:contain}
  .meta{font-size:11px;color:#888;margin-bottom:18px}
  .cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
  .card{background:#f5f3ff;border:1px solid #e5deff;border-radius:10px;padding:12px 16px;min-width:110px;text-align:center}
  .card-val{font-size:20px;font-weight:800;color:#845EF7;line-height:1}
  .card-lbl{font-size:9px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:0.4px}
  h2{color:#845EF7;font-size:13px;font-weight:800;margin:20px 0 8px;border-bottom:2px solid #845EF730;padding-bottom:5px;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;margin-bottom:6px}
  th{background:#845EF7;color:white;padding:7px 10px;text-align:left;font-size:11px}
  td{padding:6px 10px;border-bottom:1px solid #eee}
  tr:nth-child(even) td{background:#faf9ff}
  .chips{display:flex;flex-wrap:wrap;gap:6px}
  .chip{background:#f5f3ff;border:1px solid #e5deff;border-radius:6px;padding:3px 8px;font-size:10px;color:#4c2f9e}
  .chip.warn{background:#fff7ed;border-color:#fed7aa;color:#c2410c}
  .footer{text-align:center;color:#bbb;margin-top:26px;font-size:10px;border-top:1px solid #eee;padding-top:12px}
`;

// ── Informe: préstamos vigentes por proveedor ───────────────────────────────
async function buildInformePrestamo(porProveedor, totalPrestadas) {
  const logoSrc  = await cargarLogoBase64();
  const fechaHoy = new Date().toLocaleDateString("es-CO");
  const filas = porProveedor.map(([proveedor, { codigos, diasMax }]) => `
    <tr>
      <td><b>${proveedor}</b></td>
      <td style="text-align:right">${codigos.length}</td>
      <td style="text-align:right${diasMax >= DIAS_PRESTAMO_VENCIDO ? ';color:#dc2626;font-weight:700' : ''}">${diasMax} días</td>
      <td><div class="chips">${codigos.map(c => `<span class="chip">${c}</span>`).join("")}</div></td>
    </tr>`).join("");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe de Préstamos — Canastillas</title>
<style>${estiloInforme}</style></head><body>
<div class="hdr-row">${logoSrc ? `<img src="${logoSrc}"/>` : ""}<h1>🤝 Informe de Préstamos — Canastillas</h1></div>
<div class="meta">Generado: ${fechaHoy}</div>
<div class="cards">
  <div class="card"><div class="card-val">${totalPrestadas}</div><div class="card-lbl">Canastillas prestadas</div></div>
  <div class="card"><div class="card-val">${porProveedor.length}</div><div class="card-lbl">Proveedores</div></div>
</div>
<h2>Detalle por proveedor</h2>
<table><thead><tr><th>Proveedor</th><th style="text-align:right">Cantidad</th><th style="text-align:right">Más antiguo</th><th>Códigos</th></tr></thead>
<tbody>${filas || `<tr><td colspan="4">No hay canastillas prestadas actualmente.</td></tr>`}</tbody></table>
<div class="footer">Tierra Prometida Trading 🍋 · JARVIS · ${fechaHoy}</div>
</body></html>`;
}

// ── Informe: ronda de conteo ─────────────────────────────────────────────────
async function buildInformeRonda({ ronda, encontradas, faltantes }) {
  const logoSrc  = await cargarLogoBase64();
  const fechaHoy = new Date().toLocaleDateString("es-CO");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe Ronda de Conteo ${ronda.fecha}</title>
<style>${estiloInforme}</style></head><body>
<div class="hdr-row">${logoSrc ? `<img src="${logoSrc}"/>` : ""}<h1>🔄 Informe — Ronda de Conteo</h1></div>
<div class="meta">Ronda del ${ronda.fecha} · Generado: ${fechaHoy}${ronda.obs ? ` · ${ronda.obs}` : ""}</div>
<div class="cards">
  <div class="card"><div class="card-val">${ronda.totalEsperadas}</div><div class="card-lbl">Esperadas</div></div>
  <div class="card"><div class="card-val">${encontradas.length}</div><div class="card-lbl">Encontradas</div></div>
  <div class="card"><div class="card-val">${faltantes.length}</div><div class="card-lbl">Faltantes</div></div>
</div>
<h2>✅ Encontradas (${encontradas.length})</h2>
<div class="chips">${encontradas.length ? encontradas.map(c => `<span class="chip">${c}</span>`).join("") : "<span>Ninguna.</span>"}</div>
<h2>❓ Faltantes (${faltantes.length})</h2>
<div class="chips">${faltantes.length ? faltantes.map(c => `<span class="chip warn">${c}</span>`).join("") : "<span>Ninguna — conteo completo.</span>"}</div>
<div class="footer">Tierra Prometida Trading 🍋 · JARVIS · ${fechaHoy}</div>
</body></html>`;
}

export default function CanastillasTab({ mob }) {
  const {
    canastillas, rondaActiva, rondas, loading,
    crearLote, reportarEstado, obtenerHistorial, buscarPorCodigo, confirmarLotePrestamo,
    iniciarRonda, registrarConteo, cerrarRonda, reabrirRonda, obtenerInformeRonda, eliminarRonda,
    eliminarCanastilla, eliminarTodasCanastillas, obtenerMovimientosRecientes,
  } = useCanastillas();

  const [vista, setVista] = useState("dashboard"); // dashboard | generar | escanear | ronda
  const [confirm, setConfirm] = useState(null);
  const pedir = (msg, fn) => setConfirm({ msg, fn });
  const [toast, setToast] = useState(null);
  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const [previewData, setPreviewData] = useState(null);
  const verPrevia = (html, filename) => setPreviewData({ url: URL.createObjectURL(new Blob([html], { type: "text/html" })), filename });
  useEffect(() => () => { if (previewData?.url) URL.revokeObjectURL(previewData.url); }, [previewData]);
  const iframeRef = useRef(null);

  if (loading) return <LimonLoader texto="Cargando canastillas" />;

  const VISTAS = [
    { id: "dashboard", icon: "📋", label: "Resumen" },
    { id: "generar",   icon: "🏷️", label: "Generar QR" },
    { id: "escanear",  icon: "🤝", label: "Préstamo / Devolución" },
    { id: "ronda",     icon: "🔄", label: "Ronda de conteo" },
  ];

  return (
    <div>
      {confirm && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.75)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"#1a1a2e", border:"1px solid rgba(255,255,255,0.17)", borderRadius:16, padding:24, maxWidth:320, width:"100%", textAlign:"center" }}>
            <div style={{ fontSize:32, marginBottom:10 }}>⚠️</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.7)", marginBottom:20, lineHeight:1.5 }}>{confirm.msg}</div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setConfirm(null)} style={{ flex:1, background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.17)", borderRadius:10, padding:"10px", fontSize:13, color:"rgba(255,255,255,0.68)", cursor:"pointer" }}>Cancelar</button>
              <button onClick={() => { confirm.fn(); setConfirm(null); }} style={{ flex:1, background:"linear-gradient(135deg,#845EF7,#6366F1)", border:"none", borderRadius:10, padding:"10px", fontSize:13, color:"white", cursor:"pointer", fontWeight:700 }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background: toast.ok ? "#064e3b" : "#450a0a", border:`1px solid ${toast.ok ? "#059669" : "#dc2626"}`, color: toast.ok ? "#6ee7b7" : "#fca5a5", borderRadius:10, padding:"10px 20px", fontSize:12, fontWeight:600, zIndex:9999, pointerEvents:"none", whiteSpace:"nowrap" }}>
          {toast.ok ? "✅" : "❌"} {toast.msg}
        </div>
      )}

      {previewData && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.88)", zIndex:9998, display:"flex", flexDirection:"column" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", background:"#12121f", borderBottom:"1px solid rgba(255,255,255,0.13)", flexShrink:0 }}>
            <span style={{ color:"white", fontWeight:700, fontSize:13 }}>👁 Vista Previa — {previewData.filename}</span>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => iframeRef.current?.contentWindow?.print()} style={{ background:"rgba(99,102,241,0.2)", border:"1px solid rgba(99,102,241,0.5)", borderRadius:8, padding:"7px 16px", fontSize:12, color:"#a5b4fc", cursor:"pointer", fontWeight:700 }}>🖨 Imprimir</button>
              <button onClick={() => { const a=document.createElement("a"); a.href=previewData.url; a.download=previewData.filename; a.click(); }} style={{ background:"linear-gradient(135deg,#1D6F42,#21A366)", border:"none", borderRadius:8, padding:"7px 16px", fontSize:12, color:"white", cursor:"pointer", fontWeight:700 }}>📥 Descargar</button>
              <button onClick={() => setPreviewData(null)} style={{ background:"rgba(255,255,255,0.10)", border:"1px solid rgba(255,255,255,0.20)", borderRadius:8, padding:"7px 14px", fontSize:12, color:"rgba(255,255,255,0.78)", cursor:"pointer" }}>✕ Cerrar</button>
            </div>
          </div>
          <iframe ref={iframeRef} src={previewData.url} style={{ flex:1, border:"none", background:"white" }} title="Hoja de etiquetas" />
        </div>
      )}

      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        {VISTAS.map(v => (
          <button key={v.id} onClick={() => setVista(v.id)}
            style={{ background: vista===v.id ? "rgba(132,94,247,0.2)" : "rgba(255,255,255,0.04)", border:`1px solid ${vista===v.id ? "rgba(132,94,247,0.5)" : "rgba(255,255,255,0.08)"}`, borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:11, color: vista===v.id ? "#a78bfa" : "rgba(255,255,255,0.4)", fontWeight: vista===v.id ? 700 : 400 }}>
            {v.icon} {v.label}{v.id==="ronda" && rondaActiva ? " ●" : ""}
          </button>
        ))}
      </div>

      {vista === "dashboard" && (
        <DashboardView mob={mob} canastillas={canastillas} obtenerHistorial={obtenerHistorial} buscarPorCodigo={buscarPorCodigo}
          pedir={pedir} showToast={showToast} reportarEstado={reportarEstado} registrarConteo={registrarConteo}
          rondaActiva={rondaActiva} verPrevia={verPrevia} eliminarCanastilla={eliminarCanastilla}
          obtenerMovimientosRecientes={obtenerMovimientosRecientes} />
      )}

      {vista === "generar" && (
        <GenerarView mob={mob} crearLote={crearLote} pedir={pedir} showToast={showToast} verPrevia={verPrevia}
          totalCanastillas={canastillas.length} eliminarTodasCanastillas={eliminarTodasCanastillas} canastillas={canastillas} />
      )}

      {vista === "escanear" && (
        <EscanearView mob={mob} buscarPorCodigo={buscarPorCodigo} confirmarLotePrestamo={confirmarLotePrestamo}
          pedir={pedir} showToast={showToast} />
      )}

      {vista === "ronda" && (
        <RondaView mob={mob} rondaActiva={rondaActiva} rondas={rondas} iniciarRonda={iniciarRonda} registrarConteo={registrarConteo}
          cerrarRonda={cerrarRonda} reabrirRonda={reabrirRonda} obtenerInformeRonda={obtenerInformeRonda} eliminarRonda={eliminarRonda}
          pedir={pedir} showToast={showToast} verPrevia={verPrevia} />
      )}
    </div>
  );
}

// ── Barra de acciones en lote — aparece cuando hay canastillas seleccionadas ──
function BarraAccionesLote({ cantidad, onAccion, onLimpiar }) {
  if (cantidad === 0) return null;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:6, background:"rgba(132,94,247,0.1)", border:"1px solid rgba(132,94,247,0.3)", borderRadius:8, padding:"6px 10px", marginBottom:8 }}>
      <span style={{ fontSize:10, color:"#a78bfa", fontWeight:700, marginRight:2 }}>{cantidad} seleccionada{cantidad !== 1 ? "s" : ""}</span>
      <button onClick={() => onAccion("disponible")} style={{ background:"rgba(0,201,167,0.15)", border:"1px solid rgba(0,201,167,0.35)", borderRadius:6, padding:"4px 9px", fontSize:10, color:"#00C9A7", cursor:"pointer", fontWeight:700 }}>
        ✅ Marcar disponible
      </button>
      <button onClick={() => onAccion("perdida")} style={{ background:"rgba(255,80,80,0.12)", border:"1px solid rgba(255,80,80,0.3)", borderRadius:6, padding:"4px 9px", fontSize:10, color:"#ff6b6b", cursor:"pointer", fontWeight:700 }}>
        ⚠️ Reportar pérdida
      </button>
      <button onClick={() => onAccion("baja")} style={{ background:"rgba(249,168,38,0.12)", border:"1px solid rgba(249,168,38,0.3)", borderRadius:6, padding:"4px 9px", fontSize:10, color:"#F9A826", cursor:"pointer", fontWeight:700 }}>
        🔧 Marcar dañada
      </button>
      <button onClick={onLimpiar} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:6, padding:"4px 9px", fontSize:10, color:"rgba(255,255,255,0.55)", cursor:"pointer" }}>
        ✕ Cancelar
      </button>
    </div>
  );
}

// ── Vista: Resumen ──────────────────────────────────────────────────────────
function DashboardView({ mob, canastillas, obtenerHistorial, buscarPorCodigo, pedir, showToast, reportarEstado, registrarConteo, rondaActiva, verPrevia, eliminarCanastilla, obtenerMovimientosRecientes }) {
  const [busqueda, setBusqueda]   = useState("");
  const [encontrada, setEncontrada] = useState(null); // canastilla o "not_found"
  const [historial, setHistorial] = useState([]);

  const [expandidoProv, setExpandidoProv] = useState(null);
  const [mostrarFaltantes, setMostrarFaltantes] = useState(false);
  const [selFaltantes, setSelFaltantes] = useState(new Set());

  const [mostrarExplorador, setMostrarExplorador] = useState(false);
  const [filtroExplorador, setFiltroExplorador] = useState("");
  const [estadoExplorador, setEstadoExplorador] = useState("todos");
  const [selExplorador, setSelExplorador] = useState(new Set());

  useEffect(() => { setSelExplorador(new Set()); }, [filtroExplorador, estadoExplorador]);

  const [mostrarActividad, setMostrarActividad] = useState(false);
  const [actividad, setActividad] = useState(null); // null = no cargada aún

  const stats = useMemo(() => ({
    total:      canastillas.length,
    disponible: canastillas.filter(c => c.estado === "disponible").length,
    prestada:   canastillas.filter(c => c.estado === "prestada").length,
    faltante:   canastillas.filter(c => c.estado === "faltante").length,
    baja:       canastillas.filter(c => c.estado === "perdida" || c.estado === "baja").length,
  }), [canastillas]);

  const faltantes = useMemo(() => canastillas.filter(c => c.estado === "faltante"), [canastillas]);

  const porProveedor = useMemo(() => {
    const mapa = {};
    canastillas.filter(c => c.estado === "prestada").forEach(c => {
      const p = c.proveedorActual || "Sin especificar";
      if (!mapa[p]) mapa[p] = { codigos: [], diasMax: 0 };
      mapa[p].codigos.push(c.codigo);
      const dias = diasDesde(c.fechaUltimoMovimiento) ?? 0;
      if (dias > mapa[p].diasMax) mapa[p].diasMax = dias;
    });
    return Object.entries(mapa).sort((a, b) => b[1].codigos.length - a[1].codigos.length);
  }, [canastillas]);

  const explorador = useMemo(() => {
    const q = filtroExplorador.trim().toUpperCase();
    return canastillas
      .filter(c => estadoExplorador === "todos" || c.estado === estadoExplorador)
      .filter(c => !q || c.codigo.toUpperCase().includes(q))
      .slice(0, 150);
  }, [canastillas, filtroExplorador, estadoExplorador]);

  const cargarActividad = async () => {
    setMostrarActividad(v => !v);
    if (actividad === null) setActividad(await obtenerMovimientosRecientes(60));
  };

  const buscar = async (codigoOverride) => {
    const codigo = codigoOverride ?? busqueda;
    const c = buscarPorCodigo(codigo);
    if (!c) { setEncontrada("not_found"); setHistorial([]); return; }
    setBusqueda(c.codigo);
    setEncontrada(c);
    setHistorial(await obtenerHistorial(c.codigo));
  };

  const reportar = (tipo) => {
    const codigo = encontrada.codigo;
    const label = tipo === "perdida" ? "reportar como perdida" : "marcar como dañada (dar de baja)";
    pedir(`¿Confirmas ${label} la canastilla ${codigo}?`, async () => {
      const ok = await reportarEstado(codigo, { tipo, fecha: hoyISO() });
      showToast(ok ? "Actualizado ✓" : "Error al actualizar", ok);
      if (ok) {
        setEncontrada(prev => (prev && prev !== "not_found" ? { ...prev, estado: tipo, proveedorActual: null } : prev));
        setHistorial(await obtenerHistorial(codigo));
      }
    });
  };

  const marcarEncontrada = (codigo) => {
    // Una canastilla "baja" (dañada) no la revive registrarConteo (es un
    // escaneo de ronda, no una reparación administrativa) — para esa hay que
    // usar reportarEstado directo, si no el botón "miente": dice que la
    // marcó disponible pero por dentro no cambia nada.
    const actual = buscarPorCodigo(codigo);
    const esBaja = actual?.estado === "baja";
    pedir(`¿Marcar ${codigo} como ${esBaja ? "reparada" : "encontrada"} (vuelve a "disponible")?`, async () => {
      const ok = esBaja
        ? await reportarEstado(codigo, { tipo: "disponible", fecha: hoyISO() })
        : (await registrarConteo(codigo, rondaActiva?.id || null)).ok;
      showToast(ok ? "Marcada como disponible ✓" : "Error", ok);
      if (ok && encontrada && encontrada !== "not_found" && encontrada.codigo === codigo) {
        setEncontrada(prev => ({ ...prev, estado: "disponible", proveedorActual: null }));
        setHistorial(await obtenerHistorial(codigo));
      }
    });
  };

  const toggleSel = (setSel, codigo) => setSel(prev => {
    const n = new Set(prev);
    n.has(codigo) ? n.delete(codigo) : n.add(codigo);
    return n;
  });

  // Acciones en lote: mismas opciones que ya existían por canastilla
  // (marcar disponible/reparada, reportar pérdida, dar de baja), aplicadas a
  // toda la selección de un tirón en vez de una por una en la barra de
  // búsqueda.
  const ejecutarEnLote = (codigos, tipo, limpiarSeleccion) => {
    const acciones = {
      disponible: {
        label: "marcar como disponible (encontrada / reparada)",
        correr: async (codigo) => {
          const c = buscarPorCodigo(codigo);
          if (c?.estado === "baja") return await reportarEstado(codigo, { tipo: "disponible", fecha: hoyISO() });
          const res = await registrarConteo(codigo, rondaActiva?.id || null);
          return res.ok;
        },
      },
      perdida: { label: "reportar como perdidas", correr: (codigo) => reportarEstado(codigo, { tipo: "perdida", fecha: hoyISO() }) },
      baja:    { label: "marcar como dañadas",    correr: (codigo) => reportarEstado(codigo, { tipo: "baja", fecha: hoyISO() }) },
    };
    const { label, correr } = acciones[tipo];
    pedir(`¿Vas a ${label} ${codigos.length} canastilla${codigos.length !== 1 ? "s" : ""}?`, async () => {
      let ok = 0;
      for (const codigo of codigos) {
        if (await correr(codigo)) ok++;
      }
      showToast(
        ok === codigos.length ? `${ok} actualizada${ok !== 1 ? "s" : ""} ✓` : `${ok}/${codigos.length} actualizadas — revisa las que fallaron`,
        ok === codigos.length
      );
      limpiarSeleccion();
    });
  };

  const eliminar = () => {
    const codigo = encontrada.codigo;
    pedir(`¿Eliminar por completo la canastilla ${codigo}? Esto borra el registro y todo su historial — no se puede deshacer (distinto de "dar de baja", que sí conserva el historial).`, async () => {
      const ok = await eliminarCanastilla(codigo);
      showToast(ok ? "Canastilla eliminada ✓" : "Error al eliminar", ok);
      if (ok) { setEncontrada(null); setBusqueda(""); setHistorial([]); }
    });
  };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns: mob ? "repeat(2,1fr)" : "repeat(5,1fr)", gap:8, marginBottom:14 }}>
        {[
          { icon:"📦", l:"Total",        v:stats.total,      c:"#845EF7" },
          { icon:"✅", l:"Disponibles",  v:stats.disponible, c:"#00C9A7" },
          { icon:"🤝", l:"Prestadas",    v:stats.prestada,   c:"#0EA5E9" },
          { icon:"❓", l:"Faltantes",    v:stats.faltante,   c:"#F9A826" },
          { icon:"⚠️", l:"Perdidas/Baja",v:stats.baja,       c:"#FF6B6B" },
        ].map((s, i) => (
          <div key={i} style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${s.c}22`, borderRadius:10, padding:"10px 8px", textAlign:"center" }}>
            <div style={{ fontSize:16 }}>{s.icon}</div>
            <div style={{ fontSize:16, fontWeight:800, color:s.c, marginTop:2 }}>{s.v}</div>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.42)", marginTop:2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, padding:12, marginBottom:14 }}>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", fontWeight:700, marginBottom:8 }}>🔍 Elegir / buscar canastilla</div>
        <div style={{ display:"flex", gap:6 }}>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} onKeyDown={e => e.key === "Enter" && buscar()}
            placeholder="Escribe o elige un código…" list="lista-codigos-canastillas" style={{ ...inp, flex:1 }} />
          <datalist id="lista-codigos-canastillas">
            {canastillas.map(c => <option key={c.id} value={c.codigo} />)}
          </datalist>
          <button onClick={() => buscar()} style={btnPrimario(false, false)}>Buscar</button>
        </div>
        {encontrada === "not_found" && (
          <div style={{ marginTop:10, fontSize:11, color:"rgba(255,255,255,0.4)" }}>No se encontró esa canastilla.</div>
        )}
        {encontrada && encontrada !== "not_found" && (
          <div style={{ marginTop:10, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <span style={{ fontSize:12, fontWeight:700, color:"white" }}>{encontrada.codigo}</span>
              <span style={{ fontSize:10, fontWeight:700, color: encontrada.estado==="disponible"?"#00C9A7":encontrada.estado==="faltante"?"#F9A826":"#FF6B6B" }}>
                {encontrada.estado.toUpperCase()}
              </span>
            </div>
            {historial.length === 0 ? (
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>Sin movimientos registrados.</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:8 }}>
                {historial.map(m => (
                  <div key={m.id} style={{ fontSize:10, color:"rgba(255,255,255,0.55)", display:"flex", justifyContent:"space-between" }}>
                    <span>{m.fecha} · {m.tipo}</span>
                    {m.obs && <span style={{ color:"rgba(255,255,255,0.35)" }}>{m.obs}</span>}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:"flex", gap:6 }}>
              {encontrada.estado !== "disponible" && (
                <button onClick={() => marcarEncontrada(encontrada.codigo)} style={{ background:"rgba(0,201,167,0.12)", border:"1px solid rgba(0,201,167,0.3)", borderRadius:6, padding:"4px 8px", fontSize:11, color:"#00C9A7", cursor:"pointer" }}>
                  {encontrada.estado === "baja" ? "🔧 Marcar reparada" : "Marcar encontrada"}
                </button>
              )}
              <button onClick={() => reportar("perdida")} style={btnTablaEliminar}>Reportar pérdida</button>
              <button onClick={() => reportar("baja")} style={btnTablaEliminar}>🔧 Marcar dañada</button>
              <button onClick={eliminar} style={{ background:"rgba(255,80,80,0.15)", border:"1px solid rgba(255,80,80,0.4)", borderRadius:6, padding:"4px 8px", fontSize:11, color:"#ff6b6b", cursor:"pointer", fontWeight:700 }}>🗑 Eliminar serial</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.38)", textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 }}>
          🤝 Prestadas por proveedor ({porProveedor.length})
        </div>
        <button onClick={async () => verPrevia(await buildInformePrestamo(porProveedor, stats.prestada), `Informe_Prestamos_Canastillas_${hoyISO()}.html`)}
          style={{ background:"rgba(14,165,233,0.12)", border:"1px solid rgba(14,165,233,0.3)", borderRadius:6, padding:"4px 10px", fontSize:10, color:"#38bdf8", cursor:"pointer" }}>
          📄 Informe
        </button>
      </div>
      {porProveedor.length === 0 ? (
        <div style={{ textAlign:"center", padding:"18px 0", color:"rgba(255,255,255,0.33)", fontSize:12 }}>No hay canastillas prestadas actualmente.</div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:16 }}>
          {porProveedor.map(([proveedor, { codigos, diasMax }]) => {
            const vencido = diasMax >= DIAS_PRESTAMO_VENCIDO;
            return (
              <div key={proveedor} style={{ border:`1px solid ${vencido ? "rgba(255,80,80,0.35)" : "rgba(255,255,255,0.11)"}`, borderRadius:10, overflow:"hidden" }}>
                <button onClick={() => setExpandidoProv(expandidoProv === proveedor ? null : proveedor)}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background: expandidoProv===proveedor ? "rgba(14,165,233,0.12)" : "rgba(255,255,255,0.03)", padding:"10px 14px", cursor:"pointer", textAlign:"left", width:"100%", border:"none" }}>
                  <span style={{ fontSize:12, fontWeight:700, color: expandidoProv===proveedor ? "#38bdf8" : "white" }}>
                    {proveedor}
                    {vencido && <span style={{ marginLeft:8, fontSize:9, background:"rgba(255,80,80,0.15)", color:"#ff6b6b", borderRadius:5, padding:"2px 6px", fontWeight:700 }}>⚠️ hace {diasMax} días</span>}
                  </span>
                  <span style={{ fontSize:12, fontWeight:800, color:"#38bdf8" }}>{codigos.length} canastilla{codigos.length!==1?"s":""}</span>
                </button>
                {expandidoProv === proveedor && (
                  <div style={{ padding:"8px 14px", background:"rgba(0,0,0,0.2)", display:"flex", flexWrap:"wrap", gap:6 }}>
                    {codigos.map(c => (
                      <span key={c} style={{ fontSize:10, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, padding:"3px 8px", color:"rgba(255,255,255,0.7)" }}>{c}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.38)", textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 }}>
          ❓ Faltantes desde la última ronda ({faltantes.length})
        </div>
        <button onClick={() => setMostrarFaltantes(v => !v)}
          style={{ background:"rgba(249,168,38,0.1)", border:"1px solid rgba(249,168,38,0.3)", borderRadius:6, padding:"4px 10px", fontSize:10, color:"#F9A826", cursor:"pointer" }}>
          {mostrarFaltantes ? "Ocultar" : "Mostrar canastillas faltantes"}
        </button>
      </div>
      {mostrarFaltantes && (
        faltantes.length === 0 ? (
          <div style={{ textAlign:"center", padding:"24px 0", color:"rgba(255,255,255,0.33)", fontSize:12 }}>No hay canastillas faltantes por revisar.</div>
        ) : (
          <>
            <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:6 }}>
              <button onClick={() => setSelFaltantes(selFaltantes.size === faltantes.length ? new Set() : new Set(faltantes.map(c => c.codigo)))}
                style={{ background:"transparent", border:"none", fontSize:9, color:"rgba(255,255,255,0.4)", cursor:"pointer", textDecoration:"underline" }}>
                {selFaltantes.size === faltantes.length ? "Deseleccionar todas" : "Seleccionar todas"}
              </button>
            </div>
            <BarraAccionesLote cantidad={selFaltantes.size}
              onAccion={(tipo) => ejecutarEnLote([...selFaltantes], tipo, () => setSelFaltantes(new Set()))}
              onLimpiar={() => setSelFaltantes(new Set())} />
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {faltantes.map(c => {
                const sel = selFaltantes.has(c.codigo);
                return (
                  <button key={c.id} onClick={() => toggleSel(setSelFaltantes, c.codigo)}
                    title="Tocar para seleccionar"
                    style={{ fontSize:10, background: sel ? "rgba(249,168,38,0.32)" : "rgba(249,168,38,0.1)", border:`1px solid ${sel ? "#F9A826" : "rgba(249,168,38,0.3)"}`, borderRadius:6, padding:"4px 8px", color:"#F9A826", cursor:"pointer", fontWeight: sel ? 700 : 400 }}>
                    {sel ? "☑" : "☐"} {c.codigo}
                  </button>
                );
              })}
            </div>
          </>
        )
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, marginTop:16 }}>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.38)", textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 }}>
          🔎 Explorador de canastillas
        </div>
        <button onClick={() => setMostrarExplorador(v => !v)}
          style={{ background:"rgba(132,94,247,0.1)", border:"1px solid rgba(132,94,247,0.3)", borderRadius:6, padding:"4px 10px", fontSize:10, color:"#a78bfa", cursor:"pointer" }}>
          {mostrarExplorador ? "Ocultar" : "Ver todas / filtrar"}
        </button>
      </div>
      {mostrarExplorador && (
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            <input value={filtroExplorador} onChange={e => setFiltroExplorador(e.target.value)}
              placeholder="Buscar por código…" style={{ ...inp, flex:1 }} />
            <CustomSelect value={estadoExplorador} onChange={e => setEstadoExplorador(e.target.value)} style={{ ...inp, width:140 }}>
              <option value="todos" style={{ background:"#1a1a2e" }}>Todos los estados</option>
              <option value="disponible" style={{ background:"#1a1a2e" }}>Disponible</option>
              <option value="prestada" style={{ background:"#1a1a2e" }}>Prestada</option>
              <option value="faltante" style={{ background:"#1a1a2e" }}>Faltante</option>
              <option value="perdida" style={{ background:"#1a1a2e" }}>Perdida</option>
              <option value="baja" style={{ background:"#1a1a2e" }}>Dañada / baja</option>
            </CustomSelect>
          </div>
          {explorador.length === 0 ? (
            <div style={{ textAlign:"center", padding:"18px 0", color:"rgba(255,255,255,0.33)", fontSize:12 }}>Sin resultados.</div>
          ) : (
            <>
              <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:6 }}>
                <button onClick={() => setSelExplorador(selExplorador.size === explorador.length ? new Set() : new Set(explorador.map(c => c.codigo)))}
                  style={{ background:"transparent", border:"none", fontSize:9, color:"rgba(255,255,255,0.4)", cursor:"pointer", textDecoration:"underline" }}>
                  {selExplorador.size === explorador.length ? "Deseleccionar todas" : "Seleccionar todas (visibles)"}
                </button>
              </div>
              <BarraAccionesLote cantidad={selExplorador.size}
                onAccion={(tipo) => ejecutarEnLote([...selExplorador], tipo, () => setSelExplorador(new Set()))}
                onLimpiar={() => setSelExplorador(new Set())} />
              <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:260, overflowY:"auto" }}>
                {explorador.map(c => {
                  const sel = selExplorador.has(c.codigo);
                  return (
                    <div key={c.id} style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <button onClick={() => toggleSel(setSelExplorador, c.codigo)}
                        title="Seleccionar"
                        style={{ flexShrink:0, width:22, height:22, borderRadius:5, border:`1px solid ${sel ? "#a78bfa" : "rgba(255,255,255,0.2)"}`, background: sel ? "rgba(132,94,247,0.35)" : "transparent", color:"#a78bfa", fontSize:11, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>
                        {sel ? "✓" : ""}
                      </button>
                      <button onClick={() => buscar(c.codigo)}
                        style={{ flex:1, display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, padding:"5px 10px", cursor:"pointer", textAlign:"left" }}>
                        <span style={{ fontSize:11, color:"white" }}>{c.codigo}</span>
                        <span style={{ fontSize:9, fontWeight:700, color: c.estado==="disponible"?"#00C9A7":c.estado==="prestada"?"#38bdf8":c.estado==="faltante"?"#F9A826":"#ff6b6b" }}>
                          {c.estado.toUpperCase()}{c.estado==="prestada" && c.proveedorActual ? ` · ${c.proveedorActual}` : ""}
                        </span>
                      </button>
                    </div>
                  );
                })}
                {canastillas.length > explorador.length && explorador.length === 150 && (
                  <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", textAlign:"center", padding:"4px 0" }}>Mostrando los primeros 150 — afina la búsqueda para ver otras.</div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.38)", textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 }}>
          🕓 Actividad reciente
        </div>
        <button onClick={cargarActividad}
          style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:6, padding:"4px 10px", fontSize:10, color:"rgba(255,255,255,0.7)", cursor:"pointer" }}>
          {mostrarActividad ? "Ocultar" : "Ver últimos movimientos"}
        </button>
      </div>
      {mostrarActividad && (
        actividad === null ? (
          <div style={{ textAlign:"center", padding:"18px 0", color:"rgba(255,255,255,0.33)", fontSize:12 }}>Cargando…</div>
        ) : actividad.length === 0 ? (
          <div style={{ textAlign:"center", padding:"18px 0", color:"rgba(255,255,255,0.33)", fontSize:12 }}>Sin movimientos registrados todavía.</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:260, overflowY:"auto" }}>
            {actividad.map(m => (
              <div key={m.id} style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"rgba(255,255,255,0.55)", background:"rgba(255,255,255,0.03)", borderRadius:6, padding:"5px 10px" }}>
                <span><b style={{ color:"white" }}>{m.codigo}</b> · {m.fecha} · {m.tipo}{m.proveedor ? ` · ${m.proveedor}` : ""}</span>
                {m.obs && <span style={{ color:"rgba(255,255,255,0.35)" }}>{m.obs}</span>}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ── Vista: Generar QR ────────────────────────────────────────────────────────
function GenerarView({ mob, crearLote, pedir, showToast, verPrevia, totalCanastillas, eliminarTodasCanastillas, canastillas }) {
  const [prefijo, setPrefijo]   = useState("TP-");
  const [cantidad, setCantidad] = useState(50);
  const [obs, setObs]           = useState("");
  const [generando, setGenerando] = useState(false);
  const [reseteando, setReseteando] = useState(false);

  // Mismo criterio que crearLote (orden de texto descendente de los códigos
  // con ese prefijo) para que el número mostrado coincida con el que
  // realmente se va a usar al generar.
  const siguienteConsecutivo = useMemo(() => {
    const pref = prefijo.trim();
    if (!pref) return null;
    const conPrefijo = canastillas
      .map(c => c.codigo)
      .filter(codigo => codigo.toUpperCase().startsWith(pref.toUpperCase()))
      .sort((a, b) => b.localeCompare(a));
    if (!conPrefijo.length) return 1;
    const m = conPrefijo[0].slice(pref.length).match(/\d+/);
    return m ? parseInt(m[0], 10) + 1 : 1;
  }, [prefijo, canastillas]);

  const generar = () => {
    const n = parseInt(cantidad, 10);
    if (!prefijo.trim() || !n || n <= 0) return;
    pedir(`¿Generar ${n} canastillas nuevas con prefijo "${prefijo.trim()}"? Se creará una hoja de etiquetas para imprimir.`, async () => {
      setGenerando(true);
      const { ok, codigos } = await crearLote({ prefijo: prefijo.trim(), cantidad: n, obs });
      if (!ok) { showToast("Error al generar el lote", false); setGenerando(false); return; }

      const pares = [];
      for (const codigo of codigos) {
        const dataUrl = await QRCode.toDataURL(codigo, { errorCorrectionLevel: "M", margin: 1, width: 300 });
        pares.push({ codigo, dataUrl });
      }
      const html = buildHojaEtiquetas(pares);
      verPrevia(html, `Etiquetas_Canastillas_${prefijo.trim()}_${n}.html`);
      showToast(`${n} canastilla${n!==1?"s":""} generada${n!==1?"s":""} ✓`);
      setGenerando(false);
    });
  };

  const resetear = () => {
    if (totalCanastillas === 0) return;
    pedir(`¿Eliminar TODAS las canastillas registradas (${totalCanastillas})? Esto borra para siempre todos los seriales y su historial completo — no se puede deshacer.`, async () => {
      setReseteando(true);
      const ok = await eliminarTodasCanastillas();
      showToast(ok ? "Todas las canastillas fueron eliminadas ✓" : "Error al eliminar", ok);
      setReseteando(false);
    });
  };

  return (
    <div style={{ maxWidth:420 }}>
      <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, padding:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#a78bfa", marginBottom:10 }}>🏷️ Generar nuevas canastillas</div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div>
            <div style={lbl}>Prefijo del código</div>
            <input value={prefijo} onChange={e => setPrefijo(e.target.value)} placeholder="TP-" style={inp} />
            {siguienteConsecutivo !== null && (
              <div style={{ fontSize:10, color:"#a78bfa", marginTop:4 }}>
                Vas por el consecutivo <b>{prefijo.trim()}{String(siguienteConsecutivo).padStart(6, "0")}</b> — el próximo lote empezará ahí.
              </div>
            )}
          </div>
          <div>
            <div style={lbl}>Cantidad a generar</div>
            <input type="number" min="1" value={cantidad} onChange={e => setCantidad(e.target.value)} style={inp} />
          </div>
          <div>
            <div style={lbl}>Observaciones (opcional)</div>
            <input value={obs} onChange={e => setObs(e.target.value)} style={inp} />
          </div>
          <button onClick={generar} disabled={generando} style={{ ...btnPrimario(false, generando), marginTop:4 }}>
            {generando ? "Generando…" : "✅ Generar y ver etiquetas"}
          </button>
        </div>
      </div>
      <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)", marginTop:10, lineHeight:1.5 }}>
        Cada canastilla queda registrada como "disponible" y se genera una hoja lista para imprimir y pegar en cada una.
      </div>

      <div style={{ background:"rgba(255,80,80,0.06)", border:"1px solid rgba(255,80,80,0.25)", borderRadius:12, padding:14, marginTop:20 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#ff6b6b", marginBottom:6 }}>⚠️ Zona de peligro</div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)", marginBottom:10, lineHeight:1.5 }}>
          Elimina todos los seriales de canastillas creados hasta ahora ({totalCanastillas}), junto con todo su historial. Úsalo solo para reiniciar de cero, por ejemplo tras hacer pruebas.
        </div>
        <button onClick={resetear} disabled={reseteando || totalCanastillas === 0}
          style={{ width:"100%", background:"rgba(255,80,80,0.15)", border:"1px solid rgba(255,80,80,0.4)", borderRadius:8, padding:"9px", fontSize:12, color:"#ff6b6b", cursor: totalCanastillas === 0 ? "not-allowed" : "pointer", fontWeight:700, opacity: totalCanastillas === 0 ? 0.5 : 1 }}>
          {reseteando ? "Eliminando…" : `🗑 Eliminar TODAS las canastillas (${totalCanastillas})`}
        </button>
      </div>
    </div>
  );
}

// ── Vista: Préstamo / Devolución ──────────────────────────────────────────────
function EscanearView({ mob, buscarPorCodigo, confirmarLotePrestamo, pedir, showToast }) {
  const [accion, setAccion]       = useState("prestamo");
  const [proveedor, setProveedor] = useState("");
  const [fecha, setFecha]         = useState(hoyISO());
  const [obs, setObs]             = useState("");
  const [escaneados, setEscaneados] = useState([]);
  const [manual, setManual]       = useState("");
  const [camActiva, setCamActiva] = useState(false);
  const [camError, setCamError]   = useState("");
  const [guardando, setGuardando] = useState(false);

  const html5QrRef = useRef(null);
  const READER_ID  = "qr-reader-canastillas";

  // Igual que en Ronda de conteo: la cámara mantiene fija esta función desde
  // que arranca, así que el chequeo de duplicados no puede depender del
  // state — se usa un ref, siempre al día.
  const escaneadosRef = useRef(new Set());

  const agregarCodigo = (codigoRaw) => {
    const codigo = (codigoRaw || "").trim().toUpperCase();
    if (!codigo || escaneadosRef.current.has(codigo)) return;
    escaneadosRef.current.add(codigo);
    playBeep();
    setEscaneados(prev => [...prev, { codigo, existe: !!buscarPorCodigo(codigo) }]);
  };

  const iniciarCamara = async () => {
    setCamError("");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const inst = new Html5Qrcode(READER_ID);
      html5QrRef.current = inst;
      await inst.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (decoded) => agregarCodigo(decoded),
        () => {}
      );
      setCamActiva(true);
    } catch {
      setCamError("No se pudo acceder a la cámara. Usa el campo manual de abajo.");
    }
  };

  const detenerCamara = async () => {
    try { await html5QrRef.current?.stop(); html5QrRef.current?.clear(); } catch {}
    html5QrRef.current = null;
    setCamActiva(false);
  };

  useEffect(() => () => { html5QrRef.current?.stop().then(() => html5QrRef.current?.clear()).catch(() => {}); }, []);

  const quitarCodigo = (codigo) => {
    escaneadosRef.current.delete(codigo);
    setEscaneados(prev => prev.filter(e => e.codigo !== codigo));
  };

  const guardarLote = () => {
    if (escaneados.length === 0) return;
    if (accion === "prestamo" && !proveedor.trim()) { showToast("Escribe el proveedor para registrar el préstamo", false); return; }
    pedir(`¿Guardar ${escaneados.length} canastilla${escaneados.length!==1?"s":""} como "${ACCIONES.find(a=>a.value===accion)?.label}"?`, async () => {
      setGuardando(true);
      const { actualizados, creados } = await confirmarLotePrestamo({
        codigos: escaneados.map(e => e.codigo), tipo: accion, proveedor: proveedor.trim() || null, fecha, obs,
      });
      showToast(`Lote guardado — ${actualizados} actualizadas, ${creados} nuevas registradas ✓`);
      escaneadosRef.current.clear();
      setEscaneados([]);
      setGuardando(false);
    });
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap:14 }}>
      <div>
        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, padding:14, marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#a78bfa", marginBottom:10 }}>🤝 Configurar préstamo/devolución</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <div>
              <div style={lbl}>Acción</div>
              <CustomSelect value={accion} onChange={e => setAccion(e.target.value)} style={inp}>
                {ACCIONES.map(a => <option key={a.value} value={a.value} style={{ background:"#1a1a2e" }}>{a.label}</option>)}
              </CustomSelect>
            </div>
            {(accion === "prestamo" || accion === "devolucion") && (
              <div>
                <div style={lbl}>Proveedor</div>
                <input value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Finca / proveedor" style={inp} />
              </div>
            )}
            <div>
              <div style={lbl}>Fecha</div>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} />
            </div>
            <div>
              <div style={lbl}>Observaciones (opcional)</div>
              <input value={obs} onChange={e => setObs(e.target.value)} style={inp} />
            </div>
          </div>
        </div>

        {!camActiva ? (
          <button onClick={iniciarCamara} style={{ ...btnPrimario(false, false), width:"100%" }}>▶️ Iniciar cámara</button>
        ) : (
          <button onClick={detenerCamara} style={{ ...btnSecundario, width:"100%" }}>⏹ Detener cámara</button>
        )}
        <div id={READER_ID} style={{ marginTop:10, borderRadius:10, overflow:"hidden", background: camActiva ? "black" : "transparent" }} />
        {camError && <div style={{ fontSize:11, color:"#FF6B6B", marginTop:8 }}>{camError}</div>}

        <div style={{ marginTop:12 }}>
          <div style={lbl}>O escribe el código manualmente</div>
          <div style={{ display:"flex", gap:6 }}>
            <input value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { agregarCodigo(manual); setManual(""); } }}
              placeholder="TP-000123" style={{ ...inp, flex:1 }} />
            <button onClick={() => { agregarCodigo(manual); setManual(""); }} style={btnSecundario}>Agregar</button>
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.38)", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6, fontWeight:700 }}>
          Escaneadas en esta sesión ({escaneados.length})
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:5, maxHeight:320, overflowY:"auto", marginBottom:12 }}>
          {escaneados.length === 0 && (
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.33)", padding:"12px 0" }}>Aún no has escaneado ninguna canastilla.</div>
          )}
          {escaneados.map(e => (
            <div key={e.codigo} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:8, padding:"6px 10px" }}>
              <span style={{ fontSize:11, color:"white" }}>{e.codigo}</span>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                {!e.existe && <span style={{ fontSize:9, color:"#F9A826", fontWeight:700 }}>nuevo — se registrará</span>}
                <button onClick={() => quitarCodigo(e.codigo)} style={{ background:"none", border:"none", color:"rgba(255,110,110,0.7)", cursor:"pointer", fontSize:12 }}>✕</button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={guardarLote} disabled={escaneados.length === 0 || guardando} style={{ ...btnPrimario(true, guardando), width:"100%" }}>
          {guardando ? "Guardando…" : `💾 Guardar lote (${escaneados.length})`}
        </button>
      </div>
    </div>
  );
}

// ── Vista: Ronda de conteo ───────────────────────────────────────────────────
function RondaView({ mob, rondaActiva, rondas, iniciarRonda, registrarConteo, cerrarRonda, reabrirRonda, obtenerInformeRonda, eliminarRonda, pedir, showToast, verPrevia }) {
  const [obsInicio, setObsInicio] = useState("");
  const [iniciando, setIniciando] = useState(false);
  const [cerrando, setCerrando]   = useState(false);
  const [reabriendoId, setReabriendoId] = useState(null);

  const [contadas, setContadas]   = useState([]); // {codigo, nueva} vistas en esta sesión de escaneo
  const [manual, setManual]       = useState("");
  const [camActiva, setCamActiva] = useState(false);
  const [camError, setCamError]   = useState("");
  const html5QrRef = useRef(null);
  const READER_ID  = "qr-reader-ronda";

  // La cámara mantiene fija la función de escaneo desde que arranca (no se
  // "refresca" con cada render), así que el chequeo de duplicados NO puede
  // depender del state `contadas` — quedaría viendo siempre la lista vieja
  // y dejaría pasar el mismo código varias veces si la cámara lo detecta
  // varias veces seguidas (p.ej. al quedarse quieta 1 seg sobre el mismo QR).
  // Por eso se usa un ref: se actualiza al instante, antes de cualquier
  // espera de red, y lo ven todas las llamadas sin importar de qué render
  // vinieron.
  const escaneadosRef = useRef(new Set());
  useEffect(() => { escaneadosRef.current = new Set(); setContadas([]); }, [rondaActiva?.id]);

  const empezar = () => {
    pedir("¿Iniciar una nueva ronda de conteo? Se tomará una foto de cuántas canastillas deberían estar disponibles ahora mismo.", async () => {
      setIniciando(true);
      const ronda = await iniciarRonda({ fecha: hoyISO(), obs: obsInicio });
      const msg = !ronda
        ? "Error al iniciar la ronda"
        : ronda.yaExistia
          ? `Ya había una ronda activa — te uniste a ella (${ronda.totalEsperadas} esperadas)`
          : `Ronda iniciada — ${ronda.totalEsperadas} canastillas esperadas`;
      showToast(msg, !!ronda);
      setIniciando(false);
    });
  };

  const escanear = async (codigoRaw) => {
    const codigo = (codigoRaw || "").trim().toUpperCase();
    if (!codigo || escaneadosRef.current.has(codigo)) return;
    escaneadosRef.current.add(codigo);
    playBeep();
    const res = await registrarConteo(codigo, rondaActiva.id);
    if (res.ok) {
      setContadas(prev => [{ codigo, nueva: res.nueva, duplicada: !!res.duplicada }, ...prev]);
      if (res.duplicada) showToast(`${codigo} ya había sido contada por alguien más`, true);
    } else if (res.cerrada) {
      escaneadosRef.current.delete(codigo);
      showToast("Esta ronda ya se cerró — este código no se contó. Inicia una ronda nueva.", false);
    } else {
      escaneadosRef.current.delete(codigo); // falló — permitir reintentar
    }
  };

  const iniciarCamara = async () => {
    setCamError("");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const inst = new Html5Qrcode(READER_ID);
      html5QrRef.current = inst;
      await inst.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (decoded) => escanear(decoded),
        () => {}
      );
      setCamActiva(true);
    } catch {
      setCamError("No se pudo acceder a la cámara. Usa el campo manual de abajo.");
    }
  };

  const detenerCamara = async () => {
    try { await html5QrRef.current?.stop(); html5QrRef.current?.clear(); } catch {}
    html5QrRef.current = null;
    setCamActiva(false);
  };

  const cerrar = () => {
    pedir(`¿Cerrar la ronda? Las canastillas esperadas que no se escanearon quedarán marcadas como "faltante" para revisar.`, async () => {
      setCerrando(true);
      await detenerCamara();
      const res = await cerrarRonda(rondaActiva.id);
      const msg = !res.ok
        ? "Error al cerrar la ronda"
        : res.yaEstabaCerrada
          ? `Alguien más ya había cerrado esta ronda — ${res.encontradas} encontradas, ${res.faltantes} faltantes`
          : `Ronda cerrada — ${res.encontradas} encontradas, ${res.faltantes} faltantes`;
      showToast(msg, res.ok);
      setContadas([]);
      setCerrando(false);
    });
  };

  const verInforme = async (ronda) => {
    const detalle = await obtenerInformeRonda(ronda);
    verPrevia(await buildInformeRonda(detalle), `Informe_Ronda_Conteo_${ronda.fecha}.html`);
  };

  const eliminarDelHistorial = (ronda) => {
    pedir(`¿Eliminar del historial la ronda del ${ronda.fecha}? Las canastillas que quedaron "faltante" por esta ronda vuelven a "disponible", y también se borran los movimientos que generó esta ronda (así no quedan sueltos en la actividad reciente) — el resto del historial de cada canastilla no se toca.`, async () => {
      const ok = await eliminarRonda(ronda.id);
      showToast(ok ? "Ronda eliminada del historial ✓" : "Error al eliminar", ok);
    });
  };

  const reabrir = (ronda) => {
    pedir(`¿Reabrir la ronda del ${ronda.fecha}? Podrás seguir escaneando canastillas sobre ella — cuando la vuelvas a cerrar, el informe se recalcula con lo nuevo que hayas encontrado.`, async () => {
      setReabriendoId(ronda.id);
      const res = await reabrirRonda(ronda.id);
      const msg = res.ok
        ? "Ronda reabierta ✓ — ya puedes seguir escaneando"
        : res.motivo === "hay_activa"
          ? "Ya hay otra ronda activa — ciérrala antes de reabrir esta."
          : "Error al reabrir la ronda";
      showToast(msg, res.ok);
      setReabriendoId(null);
    });
  };

  if (!rondaActiva) {
    return (
      <div style={{ maxWidth:480 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, padding:14, marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#a78bfa", marginBottom:10 }}>🔄 Nueva ronda de conteo</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginBottom:10, lineHeight:1.5 }}>
            Recorre la bodega y escanea todas las canastillas que encuentres. Al cerrar la ronda, las que no aparecieron quedan marcadas como "faltante" para que las revises.
          </div>
          <div>
            <div style={lbl}>Observaciones (opcional)</div>
            <input value={obsInicio} onChange={e => setObsInicio(e.target.value)} style={inp} />
          </div>
          <button onClick={empezar} disabled={iniciando} style={{ ...btnPrimario(false, iniciando), width:"100%", marginTop:10 }}>
            {iniciando ? "Iniciando…" : "▶️ Iniciar ronda de conteo"}
          </button>
        </div>

        <div style={{ fontSize:10, color:"rgba(255,255,255,0.38)", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6, fontWeight:700 }}>
          📜 Historial de rondas ({rondas.length})
        </div>
        {rondas.length === 0 ? (
          <div style={{ textAlign:"center", padding:"18px 0", color:"rgba(255,255,255,0.33)", fontSize:12 }}>Aún no se ha cerrado ninguna ronda.</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {rondas.map(r => (
              <div key={r.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:10, padding:"8px 12px" }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"white" }}>{r.fecha}</div>
                  <div style={{ fontSize:9, color:"rgba(255,255,255,0.42)", marginTop:1 }}>
                    {r.totalEncontradas} de {r.totalEsperadas} encontradas
                    {r.totalEsperadas - r.totalEncontradas > 0 && <span style={{ color:"#F9A826" }}> · {r.totalEsperadas - r.totalEncontradas} faltantes</span>}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={() => verInforme(r)} style={{ background:"rgba(132,94,247,0.12)", border:"1px solid rgba(132,94,247,0.3)", borderRadius:6, padding:"5px 10px", fontSize:10, color:"#a78bfa", cursor:"pointer" }}>
                    📄 Ver informe
                  </button>
                  <button onClick={() => reabrir(r)} disabled={reabriendoId === r.id} style={{ background:"rgba(0,201,167,0.12)", border:"1px solid rgba(0,201,167,0.3)", borderRadius:6, padding:"5px 10px", fontSize:10, color:"#00C9A7", cursor:"pointer" }}>
                    {reabriendoId === r.id ? "…" : "🔓 Reabrir"}
                  </button>
                  <button onClick={() => eliminarDelHistorial(r)} style={{ background:"rgba(255,80,80,0.12)", border:"1px solid rgba(255,80,80,0.3)", borderRadius:6, padding:"5px 8px", fontSize:10, color:"#ff6b6b", cursor:"pointer" }}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display:"grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap:14 }}>
      <div>
        <div style={{ background:"rgba(132,94,247,0.08)", border:"1px solid rgba(132,94,247,0.25)", borderRadius:12, padding:12, marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#a78bfa" }}>Ronda del {rondaActiva.fecha}</div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)", marginTop:2 }}>{rondaActiva.totalEsperadas} canastillas esperadas</div>
        </div>

        {!camActiva ? (
          <button onClick={iniciarCamara} style={{ ...btnPrimario(false, false), width:"100%" }}>▶️ Iniciar cámara</button>
        ) : (
          <button onClick={detenerCamara} style={{ ...btnSecundario, width:"100%" }}>⏹ Detener cámara</button>
        )}
        <div id={READER_ID} style={{ marginTop:10, borderRadius:10, overflow:"hidden", background: camActiva ? "black" : "transparent" }} />
        {camError && <div style={{ fontSize:11, color:"#FF6B6B", marginTop:8 }}>{camError}</div>}

        <div style={{ marginTop:12 }}>
          <div style={lbl}>O escribe el código manualmente</div>
          <div style={{ display:"flex", gap:6 }}>
            <input value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { escanear(manual); setManual(""); } }}
              placeholder="TP-000123" style={{ ...inp, flex:1 }} />
            <button onClick={() => { escanear(manual); setManual(""); }} style={btnSecundario}>Agregar</button>
          </div>
        </div>

        <button onClick={cerrar} disabled={cerrando} style={{ ...btnPrimario(true, cerrando), width:"100%", marginTop:16 }}>
          {cerrando ? "Cerrando…" : "🏁 Cerrar ronda"}
        </button>
      </div>

      <div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.38)", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6, fontWeight:700 }}>
          Contadas en esta sesión ({contadas.length})
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:5, maxHeight:400, overflowY:"auto" }}>
          {contadas.length === 0 && (
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.33)", padding:"12px 0" }}>Aún no has escaneado ninguna canastilla en esta ronda.</div>
          )}
          {contadas.map(c => (
            <div key={c.codigo} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:8, padding:"6px 10px" }}>
              <span style={{ fontSize:11, color:"white" }}>{c.codigo}</span>
              {c.nueva && <span style={{ fontSize:9, color:"#F9A826", fontWeight:700 }}>nueva — registrada</span>}
              {c.duplicada && <span style={{ fontSize:9, color:"#4ECDC4", fontWeight:700 }}>ya contada por otra persona</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
