import { useState, useEffect, useMemo } from "react";
import CustomSelect from "./CustomSelect.jsx";
import LimonLoader from "./LimonLoader.jsx";
import { btnSecundario, btnPrimario, btnTablaEditar, btnTablaEliminar } from "./buttonStyles.js";
import { useControlExpo } from "../hooks/useControlExpo.js";

// Logo de Tierra Prometida embebido como base64 — así el informe HTML
// descargado muestra el logo aunque se abra después, sin servidor.
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

const ESTADOS_DEX = ["Pendiente", "Radicado", "Cancelado"];
const COLOR_ESTADO_DEX = { Pendiente: "#F9A826", Radicado: "#00C9A7", Cancelado: "#FF6B6B" };

function dexVacio() {
  return { numeroExpo: "", numeroDex: "", estado: "Pendiente", valorDexUsd: "", facturaComercial: "", fecha: "", obs: "" };
}

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function fmtFechaCorta(f) { return f ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—"; }
function fmtFechaLarga(f) { return f ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" }) : ""; }
function usd(n) { return n === "" || n == null ? "—" : Number(n).toLocaleString("es-CO", { maximumFractionDigits: 2 }); }

async function generarInformeControlExpoHTML(regs, desde, hasta) {
  const logoSrc = await cargarLogoBase64();
  const totalUsd = regs.reduce((a, r) => a + (Number(r.valorDexUsd) || 0), 0);
  const verificados = regs.filter(r => r.verificado).length;
  const radicados = regs.filter(r => r.estado === "Radicado").length;

  const filas = regs.map(r => `
    <tr>
      <td>${esc(r.numeroExpo) || "—"}</td>
      <td>${esc(r.numeroDex) || "—"}</td>
      <td>${esc(r.estado)}</td>
      <td>${esc(r.facturaComercial) || "—"}</td>
      <td style="text-align:right">${usd(r.valorDexUsd)}</td>
      <td>${fmtFechaCorta(r.fecha)}</td>
      <td style="text-align:center">${r.verificado ? "✔" : "—"}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe Control Expo - Tierra Prometida</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,sans-serif;color:#1e231e;background:#f4f7f3;font-size:12px}
.sheet{max-width:960px;margin:0 auto;background:#fff}

.banner{background:linear-gradient(120deg,#064e3b,#059669 60%,#34d399);color:#fff;padding:30px 34px 26px;position:relative;overflow:hidden}
.banner::after{content:"🛃";position:absolute;right:-10px;top:-22px;font-size:130px;opacity:0.12;transform:rotate(12deg)}
.banner-row{display:flex;align-items:center;justify-content:space-between;gap:16px;position:relative}
.banner img{width:58px;height:58px;object-fit:contain;background:#fff;border-radius:12px;padding:6px;box-shadow:0 4px 14px rgba(0,0,0,0.25)}
.banner h1{font-size:22px;font-weight:800;letter-spacing:0.2px}
.banner .sub{font-size:11.5px;opacity:0.88;margin-top:4px}
.banner .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;position:relative}
.banner .chip{background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.28);border-radius:20px;padding:5px 12px;font-size:10.5px;font-weight:600}

.content{padding:28px 34px 8px}

.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:26px;margin-top:-16px;position:relative}
.card{background:#fbfdfb;border:1px solid #e2ede2;border-radius:12px;padding:14px 10px;text-align:center;box-shadow:0 6px 18px rgba(0,0,0,0.05)}
.card-ic{font-size:16px;margin-bottom:2px}
.card-val{font-size:18px;font-weight:800;color:#059669;line-height:1.15}
.card-lbl{font-size:8.5px;color:#5a5a5a;margin-top:4px;text-transform:uppercase;letter-spacing:0.4px}

h2{display:flex;align-items:center;gap:8px;color:#064e3b;font-size:13.5px;font-weight:800;margin:26px 0 12px;text-transform:uppercase;letter-spacing:0.3px}
h2::after{content:"";flex:1;height:1px;background:#dfe8df}

table{width:100%;border-collapse:collapse;font-size:11px}
th{background:#059669;color:#fff;padding:8px 9px;text-align:left;border:1px solid #064e3b}
td{padding:7px 9px;border:1px solid #e2ede2}
tr:nth-child(even) td{background:#fbfdfb}
tfoot td{background:#e8f5ee;font-weight:800;border-top:2px solid #059669}

.footer{background:#064e3b;color:rgba(255,255,255,0.85);text-align:center;font-size:10px;padding:16px;margin-top:30px}

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
        <h1>🛃 Informe Control Expo — DEX</h1>
        <div class="sub">Seguimiento de Declaraciones de Exportación</div>
      </div>
      ${logoSrc ? `<img src="${logoSrc}" />` : ""}
    </div>
    <div class="chips">
      <span class="chip">📅 ${desde || hasta ? `${fmtFechaLarga(desde) || "Inicio"} — ${fmtFechaLarga(hasta) || "Hoy"}` : "Todas las fechas"}</span>
      <span class="chip">🛃 ${regs.length} DEX</span>
    </div>
  </div>

  <div class="content">

    <div class="cards">
      <div class="card"><div class="card-ic">🛃</div><div class="card-val">${regs.length}</div><div class="card-lbl">Total DEX</div></div>
      <div class="card"><div class="card-ic">✔</div><div class="card-val">${verificados}</div><div class="card-lbl">Verificados</div></div>
      <div class="card"><div class="card-ic">📄</div><div class="card-val">${radicados}</div><div class="card-lbl">Radicados</div></div>
      <div class="card"><div class="card-ic">💵</div><div class="card-val">${totalUsd.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</div><div class="card-lbl">Valor total USD</div></div>
    </div>

    <h2>📋 Detalle de DEX</h2>
    <table>
      <thead>
        <tr>
          <th>N° Expo</th><th>N° DEX</th><th>Estado</th><th>Factura</th><th style="text-align:right">Valor USD</th><th>Fecha</th><th style="text-align:center">Verificado</th>
        </tr>
      </thead>
      <tbody>
        ${filas || `<tr><td colspan="7" style="text-align:center;color:#999;padding:16px">Sin registros en el rango seleccionado</td></tr>`}
      </tbody>
      ${regs.length ? `<tfoot><tr><td colspan="4" style="text-align:right">TOTAL</td><td style="text-align:right;color:#059669">${totalUsd.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</td><td colspan="2"></td></tr></tfoot>` : ""}
    </table>

  </div>

  <div class="footer">Tierra Prometida Trading 🍋 · JARVIS · Informe generado el ${new Date().toLocaleDateString("es-CO")} a las ${new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</div>
</div>
</body></html>`;
}

export default function ControlExpoTab({ mob }) {
  const [isMobLocal, setIsMobLocal] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 680
  );
  useEffect(() => {
    const h = () => setIsMobLocal(window.innerWidth < 680);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  const m = mob || isMobLocal;

  const { registros, loading, guardarDex, eliminarDex, toggleVerificado } = useControlExpo();

  const [form, setForm]           = useState(dexVacio);
  const [editId, setEditId]       = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState("");

  const [busqueda, setBusqueda]     = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroDesde, setFiltroDesde]   = useState("");
  const [filtroHasta, setFiltroHasta]   = useState("");
  const [orden, setOrden] = useState("expo_desc");

  const [preview, setPreview] = useState(null);

  const setCampo = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const nuevoDex = () => {
    setForm(dexVacio());
    setEditId(null);
    setErrorGuardado("");
    setMostrarForm(true);
  };
  const editarDex = (r) => {
    setForm({ ...dexVacio(), ...r });
    setEditId(r.id);
    setErrorGuardado("");
    setMostrarForm(true);
  };
  const cerrarForm = () => {
    setMostrarForm(false);
    setForm(dexVacio());
    setEditId(null);
    setErrorGuardado("");
  };

  const guardar = async () => {
    setErrorGuardado("");
    if (!form.numeroExpo && !form.numeroDex && !form.facturaComercial) {
      setErrorGuardado("Falta el número de expo, el número de DEX o la factura comercial.");
      return;
    }
    setGuardando(true);
    const ok = await guardarDex(form, editId);
    setGuardando(false);
    if (ok) {
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 1500);
      cerrarForm();
    } else {
      setErrorGuardado("No se pudo guardar el registro. Revisa tu conexión e intenta de nuevo.");
    }
  };

  const eliminar = (r) => {
    if (window.confirm(`¿Eliminar el registro de la expo "${r.numeroExpo || r.numeroDex || r.id}"? Esta acción no se puede deshacer.`)) {
      eliminarDex(r.id);
    }
  };

  const filtrados = useMemo(() => {
    let list = registros.filter(r => {
      if (filtroEstado && r.estado !== filtroEstado) return false;
      if (filtroDesde && (!r.fecha || r.fecha < filtroDesde)) return false;
      if (filtroHasta && (!r.fecha || r.fecha > filtroHasta)) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        const hay = [String(r.numeroExpo || ""), r.numeroDex, r.facturaComercial].some(v => (v || "").toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (orden === "fecha_desc") return (b.fecha || "").localeCompare(a.fecha || "");
      if (orden === "fecha_asc")  return (a.fecha || "").localeCompare(b.fecha || "");
      return (Number(b.numeroExpo) || 0) - (Number(a.numeroExpo) || 0);
    });
    return list;
  }, [registros, filtroEstado, filtroDesde, filtroHasta, busqueda, orden]);

  const kpis = useMemo(() => ({
    total:       registros.length,
    verificados: registros.filter(r => r.verificado).length,
    pendientes:  registros.filter(r => r.estado === "Pendiente").length,
    valorTotal:  registros.reduce((a, r) => a + (Number(r.valorDexUsd) || 0), 0),
  }), [registros]);

  const verInforme = async () => {
    const html = await generarInformeControlExpoHTML(filtrados, filtroDesde, filtroHasta);
    const url  = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const sufijo = filtroDesde || filtroHasta ? `${filtroDesde || "inicio"}_a_${filtroHasta || "hoy"}` : "todos";
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev.url); return { url, filename: `Informe_Control_Expo_${sufijo}.html` }; });
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

  const inp = {
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8, padding: m ? "10px 11px" : "7px 10px", color: "white",
    fontSize: m ? 16 : 12, fontFamily: "inherit", width: "100%", minWidth: 0,
    boxSizing: "border-box", minHeight: m ? 44 : 32,
  };
  const lbl = { fontSize: m ? 11 : 9, color: "rgba(255,255,255,0.45)", marginBottom: 4, fontWeight: 600, letterSpacing: 0.3 };
  const cardS = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: m ? 14 : 16 };
  const camposCols = m ? "1fr 1fr" : "repeat(4,1fr)";

  if (loading) return <LimonLoader texto="Cargando Control Expo" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
        {[
          { l: "Total DEX",    v: kpis.total,                                  c: "#059669", i: "🛃" },
          { l: "Verificados",  v: kpis.verificados,                            c: "#00C9A7", i: "✔" },
          { l: "Pendientes",   v: kpis.pendientes,                             c: "#F9A826", i: "⏳" },
          { l: "Valor total USD", v: `$${kpis.valorTotal.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`, c: "#845EF7", i: "💵" },
        ].map((s, i) => (
          <div key={i} style={{ ...cardS, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 20 }}>{s.i}</div>
            <div>
              <div style={{ fontSize: m ? 16 : 20, fontWeight: 800, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{s.l}</div>
            </div>
          </div>
        ))}
      </div>

      {!mostrarForm ? (
        /* ── Lista maestra ── */
        <div style={cardS}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>🛃 Control Expo — DEX</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={verInforme} style={{ background: "rgba(0,201,167,0.12)", border: "1px solid rgba(0,201,167,0.35)", borderRadius: 8, color: "#00C9A7", padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                📄 Informe
              </button>
              <button onClick={nuevoDex} style={btnPrimario(false, false)}>➕ Nuevo DEX</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar N° expo, N° DEX, factura..." style={{ ...inp, flex: 1, minWidth: 160 }} />
            <CustomSelect value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...inp, width: m ? "100%" : 160 }}>
              <option value="">Todos los estados</option>
              {ESTADOS_DEX.map(x => <option key={x} value={x}>{x}</option>)}
            </CustomSelect>
            <CustomSelect value={orden} onChange={e => setOrden(e.target.value)} style={{ ...inp, width: m ? "100%" : 190 }}>
              <option value="expo_desc">Ordenar: N° Expo</option>
              <option value="fecha_desc">Ordenar: Fecha (reciente)</option>
              <option value="fecha_asc">Ordenar: Fecha (antigua)</option>
            </CustomSelect>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>Rango de fechas:</div>
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} style={{ ...inp, width: m ? "100%" : 150 }} />
            <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} style={{ ...inp, width: m ? "100%" : 150 }} />
            {(filtroDesde || filtroHasta) && (
              <button onClick={() => { setFiltroDesde(""); setFiltroHasta(""); }} style={btnSecundario}>Limpiar fechas</button>
            )}
          </div>

          {filtrados.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>Sin registros de DEX para estos filtros.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
                    <th style={{ padding: "6px" }}>N° Expo</th><th style={{ padding: "6px" }}>N° DEX</th><th style={{ padding: "6px" }}>Estado</th>
                    <th style={{ padding: "6px" }}>Factura</th><th style={{ padding: "6px" }}>Valor USD</th>
                    <th style={{ padding: "6px" }}>Fecha</th><th style={{ padding: "6px", textAlign: "center" }}>Verificado</th><th style={{ padding: "6px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(r => (
                    <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }} onClick={() => editarDex(r)}>
                      <td style={{ padding: "6px", color: "white", fontWeight: 600 }}>{r.numeroExpo || "—"}</td>
                      <td style={{ padding: "6px" }}>{r.numeroDex || "—"}</td>
                      <td style={{ padding: "6px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: `${COLOR_ESTADO_DEX[r.estado]}22`, color: COLOR_ESTADO_DEX[r.estado] }}>{r.estado}</span>
                      </td>
                      <td style={{ padding: "6px" }}>{r.facturaComercial || "—"}</td>
                      <td style={{ padding: "6px" }}>{usd(r.valorDexUsd)}</td>
                      <td style={{ padding: "6px" }}>{fmtFechaCorta(r.fecha)}</td>
                      <td style={{ padding: "6px", textAlign: "center" }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => toggleVerificado(r.id)}
                          title={r.verificado ? "Verificado — clic para desmarcar" : "Marcar como verificado"}
                          style={{
                            background: r.verificado ? "rgba(0,201,167,0.15)" : "rgba(255,255,255,0.06)",
                            border: `1px solid ${r.verificado ? "#00C9A7" : "rgba(255,255,255,0.2)"}`,
                            borderRadius: 6, width: 26, height: 26, fontSize: 13, fontWeight: 800,
                            color: r.verificado ? "#00C9A7" : "rgba(255,255,255,0.25)", cursor: "pointer",
                          }}>
                          {r.verificado ? "✓" : ""}
                        </button>
                      </td>
                      <td style={{ padding: "6px", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => editarDex(r)} style={btnTablaEditar}>Editar</button>
                        <button onClick={() => eliminar(r)} style={btnTablaEliminar}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ── Formulario nuevo / editar ── */
        <div style={cardS}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>
              {editId ? `✏️ Expo ${form.numeroExpo || "—"}` : "🛃 Nuevo DEX"}
            </div>
            <button onClick={cerrarForm} style={btnSecundario}>← Volver a la lista</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 14 }}>
            <div><div style={lbl}>Número de Expo</div><input type="number" style={inp} value={form.numeroExpo} onChange={e => setCampo("numeroExpo", e.target.value)} placeholder="Ej: 180" /></div>
            <div><div style={lbl}>Número de DEX</div><input style={inp} value={form.numeroDex} onChange={e => setCampo("numeroDex", e.target.value)} placeholder="Ej: 6007782389888" /></div>
            <div><div style={lbl}>Estado</div>
              <CustomSelect value={form.estado} onChange={e => setCampo("estado", e.target.value)} style={inp}>
                {ESTADOS_DEX.map(x => <option key={x} value={x}>{x}</option>)}
              </CustomSelect>
            </div>
            <div><div style={lbl}>Factura comercial</div><input style={inp} value={form.facturaComercial} onChange={e => setCampo("facturaComercial", e.target.value)} placeholder="Ej: BAQ-754" /></div>
            <div><div style={lbl}>Valor del DEX (USD)</div><input type="number" style={inp} value={form.valorDexUsd} onChange={e => setCampo("valorDexUsd", e.target.value)} placeholder="Ej: 23520" /></div>
            <div><div style={lbl}>Fecha</div><input type="date" style={inp} value={form.fecha} onChange={e => setCampo("fecha", e.target.value)} /></div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={lbl}>Observaciones</div>
            <textarea style={{ ...inp, minHeight: m ? 70 : 56, resize: "vertical", fontFamily: "inherit" }} value={form.obs} onChange={e => setCampo("obs", e.target.value)} placeholder="Notas sobre este DEX..." />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {errorGuardado && (
              <span style={{ color: "#FF6B6B", fontSize: 12, marginRight: "auto" }}>{errorGuardado}</span>
            )}
            <button onClick={guardar} disabled={guardando} style={btnPrimario(guardadoOk, guardando)}>
              {guardadoOk ? "✓ Guardado" : guardando ? "Guardando..." : editId ? "Guardar cambios" : "Guardar DEX"}
            </button>
          </div>
        </div>
      )}

      {/* ── Modal vista previa del informe ── */}
      {preview && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, display: "flex", flexDirection: "column", padding: m ? 8 : 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ color: "white", fontSize: 13, fontWeight: 700 }}>📄 Vista previa — Informe Control Expo</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={descargarInforme} style={{ background: "linear-gradient(135deg,#845EF7,#6366F1)", border: "none", borderRadius: 8, color: "white", padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                ⬇ Descargar
              </button>
              <button onClick={cerrarPreview} style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.20)", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "rgba(255,255,255,0.78)", cursor: "pointer" }}>
                ✕ Cerrar
              </button>
            </div>
          </div>
          <iframe src={preview.url} style={{ flex: 1, border: "none", borderRadius: 10, background: "white" }} title="Vista previa del informe" />
        </div>
      )}
    </div>
  );
}
