import { useState, useRef, useEffect } from "react";
import LimonLoader from "./LimonLoader.jsx";
import CustomSelect from "./CustomSelect.jsx";
import { btnSecundario, btnPrimario, btnTablaEditar, btnTablaEliminar } from "./buttonStyles.js";
import { useSolicitudesPlanta } from "../hooks/useSolicitudesPlanta.js";
import { registrarActividad } from "../hooks/useActividad.js";
import { fechaLocalISO } from "../utils/dates.js";

// Mismos roles que ya tratan como "nivel administrador" en el resto de la
// app (ROL_COLORS en App.jsx trata "Administración" como alias viejo de
// "Administrador").
const PUEDE_APROBAR = ["Owner", "Administrador", "Administración"];

const ESTADO_COLOR = {
  Pendiente:  "#F9A826",
  Aprobado:   "#0EA5E9",
  Rechazado:  "#FF6B6B",
  Comprado:   "#845EF7",
  Entregado:  "#00C9A7",
};
const PRIORIDAD_COLOR  = { Baja: "#22C55E", Media: "#F9A826", Urgente: "#FF6B6B" };
const PRIORIDAD_ICONO  = { Baja: "🟢", Media: "🟡", Urgente: "🔴" };
const PRIORIDADES = ["Baja", "Media", "Urgente"];

const UNIDADES = ["Unidades", "Kilos", "Gramos", "Litros", "Metros cúbicos", "Cajas", "Paquetes", "Rollos", "Metros", "Milímetros", "Galones"];

const FILA_VACIA = () => ({ item: "", cantidad: "", unidad: UNIDADES[0] });

const nombreUsuarioSesion = () => {
  try { return JSON.parse(localStorage.getItem("tp_session"))?.nombre || ""; } catch { return ""; }
};

const inp = { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.13)", borderRadius: 8, padding: "9px 12px", color: "white", fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5, display: "block" };

function fmtFecha(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }); } catch { return iso; }
}

const nombresItems = (s) => s.items.map(it => it.item).join(", ");

// ─── REPORTE (informe HTML autocontenido) ─────────────────────
// Logo embebido en base64 para que el HTML descargado muestre el
// logo aunque se abra después sin conexión (mismo truco que Canastillas).
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

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const fmtFechaCorta = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-CO"); } catch { return iso; }
};

// Fecha local "YYYY-MM-DD" de un timestamp (para comparar contra los inputs
// date del filtro sin líos de huso horario — ver utils/dates.js).
const fechaLocalDe = (iso) => { try { return iso ? fechaLocalISO(new Date(iso)) : ""; } catch { return ""; } };

// Etiqueta legible del rango elegido ("" en un extremo = abierto).
const etiquetaRango = (desde, hasta) => {
  if (desde && hasta) return `${fmtFechaCorta(desde)} a ${fmtFechaCorta(hasta)}`;
  if (desde)          return `desde ${fmtFechaCorta(desde)}`;
  if (hasta)          return `hasta ${fmtFechaCorta(hasta)}`;
  return "todas las fechas";
};

// Estados en orden del flujo; peso para ordenar el detalle (abiertos primero).
const ESTADOS_FLUJO = ["Pendiente", "Aprobado", "Comprado", "Entregado", "Rechazado"];
const PESO_ESTADO   = { Pendiente: 0, Aprobado: 1, Comprado: 2, Entregado: 3, Rechazado: 4 };
const ESTADOS_ABIERTOS = ["Pendiente", "Aprobado", "Comprado"];

// Paleta del informe — morado/índigo de marca, sin naranja ni ámbar.
const EST_BG  = { Pendiente: "#EEF1F5", Aprobado: "#E0F2FE", Comprado: "#F3F0FF", Entregado: "#DCFCE7", Rechazado: "#FEE2E2" };
const EST_FG  = { Pendiente: "#475569", Aprobado: "#0369A1", Comprado: "#5B3FD6", Entregado: "#15803D", Rechazado: "#B91C1C" };
const PRIO_BG = { Baja: "#DCFCE7", Media: "#EEF1F5", Urgente: "#FEE2E2" };
const PRIO_FG = { Baja: "#15803D", Media: "#475569", Urgente: "#B91C1C" };

const ESTILO_REPORTE = `
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#222;max-width:960px;margin:0 auto;font-size:12px}
  h1{color:#5B3FD6;margin:0;font-size:20px}
  .hdr-row{display:flex;align-items:center;gap:12px;margin-bottom:4px}
  .hdr-row img{width:40px;height:40px;object-fit:contain}
  .meta{font-size:11px;color:#777;margin-bottom:18px}
  .cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:22px}
  .card{background:#F3F0FF;border:1px solid #E0D8FF;border-radius:10px;padding:12px 16px;min-width:118px;text-align:center}
  .card-val{font-size:22px;font-weight:800;color:#5B3FD6;line-height:1}
  .card-lbl{font-size:9px;color:#888;margin-top:5px;text-transform:uppercase;letter-spacing:0.4px}
  h2{color:#5B3FD6;font-size:12px;font-weight:800;margin:22px 0 8px;border-bottom:2px solid rgba(91,63,214,0.2);padding-bottom:5px;text-transform:uppercase;letter-spacing:0.5px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th{background:#5B3FD6;color:#fff;padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.3px}
  td{padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top}
  tr:nth-child(even) td{background:#FAF9FF}
  td.nowrap,th.nowrap{white-space:nowrap}
  .mini{max-width:460px}
  .bar{height:8px;background:#5B3FD6;border-radius:4px;display:block}
  ul.items{margin:0;padding-left:15px}
  ul.items li{margin:1px 0}
  .muted{color:#999}
  .obs{font-size:10px;color:#666;font-style:italic;margin-top:3px}
  .tag{display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;white-space:nowrap}
  tr.urg td{background:#FFF1F1}
  tr.urg td:first-child{border-left:3px solid #DC2626}
  .empty{color:#999;padding:14px 10px;font-style:italic}
  .footer{text-align:center;color:#bbb;margin-top:28px;font-size:10px;border-top:1px solid #eee;padding-top:12px}
  @media print{body{padding:0}h2{page-break-after:avoid}tr{page-break-inside:avoid}}
`;

const ultimoMovimiento = (s) => (s.trazabilidad?.length ? s.trazabilidad[s.trazabilidad.length - 1].fecha : s.createdAt);

async function buildInformePedidos(lista, scopeLabel) {
  const logoSrc  = await cargarLogoBase64();
  const fechaHoy = new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" });
  const total    = lista.length;

  const fechas = lista.map(s => s.createdAt).filter(Boolean).sort();
  const rango  = fechas.length
    ? (fechas[0] === fechas[fechas.length - 1]
        ? fmtFechaCorta(fechas[0])
        : `${fmtFechaCorta(fechas[0])} – ${fmtFechaCorta(fechas[fechas.length - 1])}`)
    : "—";

  const cuenta = (pred) => lista.filter(pred).length;
  const abiertos   = cuenta(s => ESTADOS_ABIERTOS.includes(s.estado));
  const entregados = cuenta(s => s.estado === "Entregado");
  const rechazados = cuenta(s => s.estado === "Rechazado");
  const totalItems = lista.reduce((acc, s) => acc + s.items.length, 0);

  const agrupar = (keyFn) => {
    const m = {};
    lista.forEach(s => { const k = keyFn(s) || "—"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const porEstado     = ESTADOS_FLUJO.map(e => [e, cuenta(s => s.estado === e)]).filter(([, n]) => n > 0);
  const porPrioridad  = PRIORIDADES.map(p => [p, cuenta(s => s.prioridad === p)]).filter(([, n]) => n > 0);
  const porArea       = agrupar(s => s.area && s.area.trim() ? s.area.trim() : "Sin área");
  const porSolicitante = agrupar(s => s.solicitadoPor && s.solicitadoPor.trim() ? s.solicitadoPor.trim() : "Sin registrar");

  const filaBreak = ([k, n]) => {
    const pct = total ? Math.round((n / total) * 100) : 0;
    return `<tr><td>${esc(k)}</td><td class="nowrap">${n} · ${pct}%</td><td><span class="bar" style="width:${pct}%"></span></td></tr>`;
  };
  const tablaBreak = (filas) => `<table class="mini"><tbody>${
    filas.length ? filas.map(filaBreak).join("") : `<tr><td colspan="3" class="empty">Sin datos.</td></tr>`
  }</tbody></table>`;

  const ordenados = [...lista].sort((a, b) =>
    (PESO_ESTADO[a.estado] ?? 9) - (PESO_ESTADO[b.estado] ?? 9) ||
    (b.createdAt || "").localeCompare(a.createdAt || "")
  );

  const filaPedido = (s) => {
    const urgente = s.prioridad === "Urgente" && ESTADOS_ABIERTOS.includes(s.estado);
    const items = s.items.map(it => {
      const cant = it.cantidad != null ? Number(it.cantidad).toLocaleString("es-CO") : "—";
      return `<li>${esc(it.item)} <span class="muted">— ${cant}${it.unidad ? " " + esc(it.unidad) : ""}</span></li>`;
    }).join("");
    return `<tr class="${urgente ? "urg" : ""}">
      <td class="nowrap">${fmtFecha(s.createdAt)}</td>
      <td><ul class="items">${items || "<li class='muted'>Sin ítems</li>"}</ul>${s.obs ? `<div class="obs">📝 ${esc(s.obs)}</div>` : ""}</td>
      <td>${esc(s.area || "—")}</td>
      <td>${esc(s.solicitadoPor || "—")}</td>
      <td><span class="tag" style="background:${PRIO_BG[s.prioridad] || "#EEF1F5"};color:${PRIO_FG[s.prioridad] || "#475569"}">${esc(s.prioridad || "—")}</span></td>
      <td><span class="tag" style="background:${EST_BG[s.estado] || "#EEF1F5"};color:${EST_FG[s.estado] || "#475569"}">${esc(s.estado || "—")}</span></td>
      <td class="nowrap">${fmtFecha(ultimoMovimiento(s))}</td>
    </tr>`;
  };

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte de Pedidos a Planta</title>
<style>${ESTILO_REPORTE}</style></head><body>
<div class="hdr-row">${logoSrc ? `<img src="${logoSrc}"/>` : ""}<h1>📊 Reporte de Pedidos a Planta</h1></div>
<div class="meta">${esc(scopeLabel)} · ${total} pedido${total !== 1 ? "s" : ""} · Rango: ${rango} · Generado: ${fechaHoy}</div>

<div class="cards">
  <div class="card"><div class="card-val">${total}</div><div class="card-lbl">Pedidos</div></div>
  <div class="card"><div class="card-val">${abiertos}</div><div class="card-lbl">En curso</div></div>
  <div class="card"><div class="card-val">${entregados}</div><div class="card-lbl">Entregados</div></div>
  <div class="card"><div class="card-val">${rechazados}</div><div class="card-lbl">Rechazados</div></div>
  <div class="card"><div class="card-val">${totalItems}</div><div class="card-lbl">Ítems solicitados</div></div>
</div>

<h2>Por estado</h2>
${tablaBreak(porEstado)}

<h2>Por prioridad</h2>
${tablaBreak(porPrioridad)}

<h2>Por área</h2>
${tablaBreak(porArea)}

<h2>Por solicitante</h2>
${tablaBreak(porSolicitante)}

<h2>Detalle de pedidos (${total})</h2>
<table>
  <thead><tr>
    <th class="nowrap">Fecha</th><th>Ítems</th><th>Área</th><th>Solicitante</th>
    <th>Prioridad</th><th>Estado</th><th class="nowrap">Últ. movim.</th>
  </tr></thead>
  <tbody>${ordenados.length ? ordenados.map(filaPedido).join("") : `<tr><td colspan="7" class="empty">No hay pedidos en este filtro.</td></tr>`}</tbody>
</table>

<div class="footer">Tierra Prometida Trading 🍋 · JARVIS · ${fechaHoy}</div>
</body></html>`;
}

export default function PedidosTab({ mob, usuario }) {
  const { solicitudes, loading, crear, actualizar, cambiarEstado, eliminar } = useSolicitudesPlanta();
  const [showForm, setShowForm] = useState(false);
  const [editandoId, setEditandoId] = useState(null); // null = creando nueva
  const [form, setForm] = useState({ items: [FILA_VACIA()], area: "", prioridad: "Media", obs: "" });
  const [filtro, setFiltro] = useState("Todas");
  const [expandidoId, setExpandidoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [preview, setPreview] = useState(null);   // { url, filename } | null
  const [generandoReporte, setGenerandoReporte] = useState(false);
  const [showReporte, setShowReporte] = useState(false);
  const [repDesde, setRepDesde] = useState("");
  const [repHasta, setRepHasta] = useState("");
  const iframeRef = useRef(null);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  const rol = usuario?.rol || "";
  const puedeAprobar = PUEDE_APROBAR.includes(rol);

  if (loading) return <LimonLoader texto="Cargando pedidos" />;

  const FILTROS = ["Todas", "Pendiente", "Aprobado", "Rechazado", "Comprado", "Entregado"];
  const visibles = filtro === "Todas" ? solicitudes : solicitudes.filter(s => s.estado === filtro);
  const hayItemValido = form.items.some(it => it.item.trim());

  const actualizarFila = (idx, campo, valor) => {
    setForm(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, [campo]: valor } : it) }));
  };
  const agregarFila = () => setForm(p => ({ ...p, items: [...p.items, FILA_VACIA()] }));
  const quitarFila = (idx) => setForm(p => ({ ...p, items: p.items.length === 1 ? [FILA_VACIA()] : p.items.filter((_, i) => i !== idx) }));

  const cerrarForm = () => {
    setShowForm(false);
    setEditandoId(null);
    setForm({ items: [FILA_VACIA()], area: "", prioridad: "Media", obs: "" });
  };

  const editarSolicitud = (s) => {
    setForm({
      items: s.items.map(it => ({ item: it.item, cantidad: it.cantidad != null ? String(it.cantidad) : "", unidad: it.unidad || UNIDADES[0] })),
      area: s.area, prioridad: s.prioridad, obs: s.obs,
    });
    setEditandoId(s.id);
    setShowForm(true);
  };

  const guardarSolicitud = async () => {
    const itemsValidos = form.items.filter(it => it.item.trim());
    if (!itemsValidos.length) return;
    setGuardando(true);
    const responsable = nombreUsuarioSesion();
    if (editandoId) {
      const ok = await actualizar(editandoId, { items: itemsValidos, area: form.area, prioridad: form.prioridad, obs: form.obs, responsable });
      if (ok) {
        registrarActividad({
          usuario: responsable, modulo: "Inventario", accion: "pedido_editado",
          detalle: `${responsable || "Alguien"} editó la solicitud: ${itemsValidos.map(it => it.item).join(", ")}`,
          referencia: itemsValidos.map(it => it.item).join(", "),
        });
        cerrarForm();
      }
    } else {
      const ok = await crear({ items: itemsValidos, area: form.area, prioridad: form.prioridad, obs: form.obs, solicitadoPor: responsable });
      if (ok) {
        registrarActividad({
          usuario: responsable, modulo: "Inventario", accion: "pedido_creado",
          detalle: `${responsable || "Alguien"} solicitó ${itemsValidos.length} ítem${itemsValidos.length !== 1 ? "s" : ""}: ${itemsValidos.map(it => it.item).join(", ")}`,
          referencia: itemsValidos.map(it => it.item).join(", "),
        });
        cerrarForm();
      }
    }
    setGuardando(false);
  };

  const avanzar = async (s, nuevoEstado, notaOpcional) => {
    const responsable = nombreUsuarioSesion();
    const ok = await cambiarEstado(s.id, nuevoEstado, { responsable, nota: notaOpcional });
    if (ok) {
      registrarActividad({
        usuario: responsable, modulo: "Inventario", accion: "pedido_" + nuevoEstado.toLowerCase(),
        detalle: `${responsable || "Alguien"} marcó "${nombresItems(s)}" como ${nuevoEstado}`,
        referencia: nombresItems(s),
      });
    }
  };

  const rechazar = (s) => {
    const motivo = window.prompt(`¿Por qué se rechaza "${nombresItems(s)}"? (opcional)`, "");
    if (motivo === null) return; // canceló el prompt
    avanzar(s, "Rechazado", motivo);
  };

  const confirmarEliminar = (s) => {
    if (window.confirm(`¿Eliminar la solicitud "${nombresItems(s)}"? Esta acción no se puede deshacer.`)) eliminar(s.id);
  };

  // Rango inválido: desde posterior a hasta.
  const rangoInvalido = repDesde && repHasta && repDesde > repHasta;

  // Pedidos del filtro de estado actual, acotados al rango de fechas elegido.
  const enRango = visibles.filter(s => {
    const f = fechaLocalDe(s.createdAt);
    if (!f) return !repDesde && !repHasta; // sin fecha: solo si no se pidió rango
    if (repDesde && f < repDesde) return false;
    if (repHasta && f > repHasta) return false;
    return true;
  });

  const presetRango = (dias) => {
    const hoy = fechaLocalISO();
    const desde = new Date();
    desde.setDate(desde.getDate() - (dias - 1));
    setRepDesde(fechaLocalISO(desde));
    setRepHasta(hoy);
  };
  const presetEsteMes = () => {
    const n = new Date();
    setRepDesde(fechaLocalISO(new Date(n.getFullYear(), n.getMonth(), 1)));
    setRepHasta(fechaLocalISO());
  };

  const generarReporte = async () => {
    if (!enRango.length || generandoReporte || rangoInvalido) return;
    setGenerandoReporte(true);
    try {
      const base  = filtro === "Todas" ? "Todos los pedidos" : `Pedidos en estado "${filtro}"`;
      const scope = (repDesde || repHasta) ? `${base} · ${etiquetaRango(repDesde, repHasta)}` : base;
      const sufFecha = repDesde || repHasta
        ? `_${repDesde || "inicio"}_a_${repHasta || fechaLocalISO()}`
        : `_${fechaLocalISO()}`;
      const html = await buildInformePedidos(enRango, scope);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      setPreview(prev => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url, filename: `Reporte_Pedidos${sufFecha}.html` };
      });
      setShowReporte(false);
    } finally {
      setGenerandoReporte(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "white" }}>📝 Pedidos a Planta</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", marginTop: 2 }}>Solicitudes de insumos: Pendiente → Aprobado/Rechazado → Comprado → Entregado</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setShowReporte(v => !v)}
            disabled={solicitudes.length === 0}
            title={solicitudes.length === 0 ? "No hay pedidos para reportar" : "Reporte detallado (con rango de fechas opcional)"}
            style={{ ...btnSecundario, opacity: solicitudes.length === 0 ? 0.5 : 1, cursor: solicitudes.length === 0 ? "not-allowed" : "pointer", ...(showReporte ? { borderColor: "#845EF7", color: "#a78bfa" } : null) }}
          >
            {showReporte ? "✕ Cerrar reporte" : "📊 Reporte"}
          </button>
          <button onClick={() => (showForm ? cerrarForm() : setShowForm(true))} style={btnPrimario(false, false)}>
            {showForm ? "✕ Cancelar" : "➕ Nueva solicitud"}
          </button>
        </div>
      </div>

      {showReporte && (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 3 }}>📊 Reporte detallado de pedidos</div>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.42)", marginBottom: 12 }}>
            Incluye el filtro de estado activo ({filtro}). Deja las fechas vacías para incluir todo el histórico.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "180px 180px", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Desde</label>
              <input type="date" style={inp} value={repDesde} max={repHasta || undefined} onChange={e => setRepDesde(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Hasta</label>
              <input type="date" style={inp} value={repHasta} min={repDesde || undefined} onChange={e => setRepHasta(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {[["Hoy", () => { const h = fechaLocalISO(); setRepDesde(h); setRepHasta(h); }],
              ["Últimos 7 días", () => presetRango(7)],
              ["Últimos 30 días", () => presetRango(30)],
              ["Este mes", presetEsteMes],
              ["Todo", () => { setRepDesde(""); setRepHasta(""); }]].map(([txt, fn]) => (
              <button key={txt} onClick={fn} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 10.5, color: "rgba(255,255,255,0.6)", fontFamily: "inherit" }}>
                {txt}
              </button>
            ))}
          </div>

          {rangoInvalido && (
            <div style={{ fontSize: 11, color: "#FF6B6B", marginBottom: 10 }}>La fecha "Desde" es posterior a "Hasta".</div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={generarReporte}
              disabled={generandoReporte || rangoInvalido || enRango.length === 0}
              style={{ ...btnPrimario(false, generandoReporte), opacity: (generandoReporte || rangoInvalido || enRango.length === 0) ? 0.5 : 1 }}
            >
              {generandoReporte ? "Generando…" : "📄 Generar reporte"}
            </button>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.42)" }}>
              {rangoInvalido ? "" : `${enRango.length} pedido${enRango.length !== 1 ? "s" : ""} en ${etiquetaRango(repDesde, repHasta)}`}
            </span>
          </div>
        </div>
      )}

      {preview && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.88)", zIndex: 9998, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 16px", background: "#12121f", borderBottom: "1px solid rgba(255,255,255,0.13)", flexShrink: 0, flexWrap: "wrap" }}>
            <span style={{ color: "white", fontWeight: 700, fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>👁 Vista previa — {preview.filename}</span>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={() => iframeRef.current?.contentWindow?.print()} style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.5)", borderRadius: 8, padding: "7px 16px", fontSize: 12, color: "#a5b4fc", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>🖨 Imprimir</button>
              <button onClick={() => { const a = document.createElement("a"); a.href = preview.url; a.download = preview.filename; a.click(); }} style={{ background: "linear-gradient(135deg,#1D6F42,#21A366)", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, color: "white", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>📥 Descargar</button>
              <button onClick={() => setPreview(null)} style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.20)", borderRadius: 8, padding: "7px 14px", fontSize: 12, color: "rgba(255,255,255,0.78)", cursor: "pointer", fontFamily: "inherit" }}>✕ Cerrar</button>
            </div>
          </div>
          <iframe ref={iframeRef} src={preview.url} style={{ flex: 1, border: "none", background: "white" }} title="Reporte de pedidos" />
        </div>
      )}

      {showForm && (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            {form.items.map((it, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr auto" : "2fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                <div style={{ gridColumn: mob ? "1 / -1" : "auto" }}>
                  {idx === 0 && <label style={lbl}>¿Qué se necesita?</label>}
                  <input style={inp} value={it.item} onChange={e => actualizarFila(idx, "item", e.target.value)} placeholder="Ej. Guantes de nitrilo talla M" />
                </div>
                <div>
                  {idx === 0 && <label style={lbl}>Cantidad</label>}
                  <input style={inp} type="number" value={it.cantidad} onChange={e => actualizarFila(idx, "cantidad", e.target.value)} placeholder="0" />
                </div>
                <div>
                  {idx === 0 && <label style={lbl}>Unidad</label>}
                  <CustomSelect style={inp} value={it.unidad} onChange={e => actualizarFila(idx, "unidad", e.target.value)}>
                    {UNIDADES.map(u => <option key={u} value={u} style={{ background: "#1a1c26" }}>{u}</option>)}
                  </CustomSelect>
                </div>
                <button onClick={() => quitarFila(idx)} title="Quitar ítem" style={{ ...btnTablaEliminar, opacity: (form.items.length === 1 && !it.item && !it.cantidad && !it.unidad) ? 0.35 : 1 }}>✕</button>
              </div>
            ))}
          </div>
          <button onClick={agregarFila} style={{ ...btnSecundario, marginBottom: 14 }}>➕ Agregar otro ítem</button>

          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Área que lo solicita</label>
              <input style={inp} value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))} placeholder="Ej. Empaque" />
            </div>
            <div>
              <label style={lbl}>Prioridad</label>
              <CustomSelect style={inp} value={form.prioridad} onChange={e => setForm(p => ({ ...p, prioridad: e.target.value }))}>
                {PRIORIDADES.map(p => <option key={p} value={p} style={{ background: "#1a1c26" }}>{PRIORIDAD_ICONO[p]} {p}</option>)}
              </CustomSelect>
            </div>
            <div style={{ gridColumn: mob ? "1" : "1 / -1" }}>
              <label style={lbl}>Observaciones</label>
              <input style={inp} value={form.obs} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} placeholder="Detalles adicionales (opcional)" />
            </div>
          </div>
          <button onClick={guardarSolicitud} disabled={guardando || !hayItemValido} style={{ ...btnPrimario(false, guardando), marginTop: 14 }}>
            {guardando ? "Guardando..." : editandoId ? "✅ Guardar cambios" : "✅ Enviar solicitud"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {FILTROS.map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            background: filtro === f ? `${ESTADO_COLOR[f] || "#845EF7"}22` : "rgba(255,255,255,0.04)",
            border: `1px solid ${filtro === f ? (ESTADO_COLOR[f] || "#845EF7") + "60" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700,
            color: filtro === f ? (ESTADO_COLOR[f] || "#a78bfa") : "rgba(255,255,255,0.4)",
          }}>
            {f} {f !== "Todas" ? `(${solicitudes.filter(s => s.estado === f).length})` : `(${solicitudes.length})`}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.33)", fontSize: 13 }}>
          {filtro === "Todas" ? "Todavía no hay pedidos registrados." : `No hay pedidos en estado "${filtro}".`}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibles.map(s => (
            <div key={s.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderLeft: `3px solid ${ESTADO_COLOR[s.estado] || "#64748B"}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "white", display: "flex", flexDirection: "column", gap: 2 }}>
                    {s.items.map((it, i) => (
                      <div key={i}>
                        {it.item}
                        {(it.cantidad != null || it.unidad) && (
                          <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500, fontSize: 11.5 }}>
                            {" "}— Cantidad: {it.cantidad != null ? it.cantidad.toLocaleString("es-CO") : "—"}{it.unidad ? ` · Unidad: ${it.unidad}` : ""}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.42)", marginTop: 5, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {s.solicitadoPor && <span>👤 {s.solicitadoPor}</span>}
                    {s.area && <span>🏭 {s.area}</span>}
                    <span>🕐 {fmtFecha(s.createdAt)}</span>
                  </div>
                  {s.obs && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 5, fontStyle: "italic" }}>{s.obs}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: PRIORIDAD_COLOR[s.prioridad] || "#94a3b8", background: `${PRIORIDAD_COLOR[s.prioridad] || "#64748B"}20`, padding: "2px 8px", borderRadius: 5 }}>{PRIORIDAD_ICONO[s.prioridad] || ""} {s.prioridad}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: ESTADO_COLOR[s.estado] || "#94a3b8", background: `${ESTADO_COLOR[s.estado] || "#64748B"}20`, padding: "2px 8px", borderRadius: 5 }}>{s.estado}</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
                {s.estado === "Pendiente" && puedeAprobar && (
                  <>
                    <button onClick={() => avanzar(s, "Aprobado")} style={{ ...btnSecundario, color: "#0EA5E9", borderColor: "#0EA5E960" }}>✅ Aprobar</button>
                    <button onClick={() => rechazar(s)} style={{ ...btnSecundario, color: "#FF6B6B", borderColor: "#FF6B6B60" }}>❌ Rechazar</button>
                  </>
                )}
                {s.estado === "Pendiente" && !puedeAprobar && (
                  <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)" }}>Esperando aprobación de un administrador</span>
                )}
                {s.estado === "Aprobado" && (
                  <button onClick={() => avanzar(s, "Comprado")} style={{ ...btnSecundario, color: "#845EF7", borderColor: "#845EF760" }}>🛒 Marcar comprado</button>
                )}
                {s.estado === "Comprado" && (
                  <button onClick={() => avanzar(s, "Entregado")} style={{ ...btnSecundario, color: "#00C9A7", borderColor: "#00C9A760" }}>📦 Marcar entregado</button>
                )}
                <button onClick={() => setExpandidoId(v => v === s.id ? null : s.id)} style={{ ...btnSecundario, marginLeft: "auto" }}>
                  {expandidoId === s.id ? "▲ Ocultar historial" : `▼ Historial (${s.trazabilidad.length})`}
                </button>
                {puedeAprobar && <button onClick={() => editarSolicitud(s)} style={btnTablaEditar}>✏️</button>}
                {puedeAprobar && <button onClick={() => confirmarEliminar(s)} style={btnTablaEliminar}>🗑</button>}
              </div>

              {expandidoId === s.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 6 }}>
                  {s.trazabilidad.map((ev, i) => (
                    <div key={i} style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)" }}>
                      <span style={{ color: "rgba(255,255,255,0.32)" }}>{fmtFecha(ev.fecha)}</span> — {ev.evento}{ev.responsable ? ` · ${ev.responsable}` : ""}{ev.detalle ? ` · "${ev.detalle}"` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
