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

const ESTADOS_DEX = ["Pendiente", "Verificado", "Radicado", "Cancelado"];
const COLOR_ESTADO_DEX = { Pendiente: "#F9A826", Verificado: "#845EF7", Radicado: "#00C9A7", Cancelado: "#FF6B6B" };
const COLOR_ESTADO_PAGO = { Pagado: "#00C9A7", Parcial: "#F9A826", "Sin abonos": "rgba(255,255,255,0.4)" };

function estadoPagoDex(valorDexUsd, totalPagado) {
  const valor = Number(valorDexUsd) || 0;
  if (totalPagado <= 0) return "Sin abonos";
  if (valor > 0 && totalPagado >= valor) return "Pagado";
  return "Parcial";
}

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

  const {
    registros, pagos, declaraciones, asignaciones, loading, guardarDex, eliminarDex, toggleVerificado, agregarPago, eliminarPago, actualizarPago,
    crearDeclaracion, actualizarDeclaracion, eliminarDeclaracion, asignarDexADeclaracion, quitarAsignacion, actualizarValorAsignacion,
  } = useControlExpo();

  const [vista, setVista] = useState("registro"); // registro | liquidacion

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

      {/* ── Tabs de sección ── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          { id: "registro",     label: "🛃 Registro DEX" },
          { id: "liquidacion",  label: "💵 Liquidación de DEX" },
          { id: "declaracion",  label: "💱 Declaración de Cambio" },
        ].map(t => (
          <button key={t.id} onClick={() => setVista(t.id)}
            style={{
              background: vista === t.id ? "rgba(132,94,247,0.2)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${vista === t.id ? "rgba(132,94,247,0.5)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 12,
              color: vista === t.id ? "#a78bfa" : "rgba(255,255,255,0.5)", fontWeight: vista === t.id ? 700 : 500,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {vista === "liquidacion" ? (
        <SeccionLiquidacion m={m} registros={registros} pagos={pagos} agregarPago={agregarPago} eliminarPago={eliminarPago} actualizarPago={actualizarPago}
          inp={inp} lbl={lbl} cardS={cardS} />
      ) : vista === "declaracion" ? (
        <SeccionDeclaracionCambio m={m} registros={registros} declaraciones={declaraciones} asignaciones={asignaciones}
          crearDeclaracion={crearDeclaracion} actualizarDeclaracion={actualizarDeclaracion} eliminarDeclaracion={eliminarDeclaracion}
          asignarDexADeclaracion={asignarDexADeclaracion} quitarAsignacion={quitarAsignacion}
          actualizarValorAsignacion={actualizarValorAsignacion}
          inp={inp} lbl={lbl} cardS={cardS} />
      ) : (
      <>
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
      </>
      )}
    </div>
  );
}

/* ══════════════ Sección: Liquidación de DEX ══════════════ */

async function generarInformeLiquidacionHTML(filas, filtroEstadoPago) {
  const logoSrc = await cargarLogoBase64();
  const valorTotal  = filas.reduce((a, r) => a + (Number(r.valor) || 0), 0);
  const pagadoTotal = filas.reduce((a, r) => a + (Number(r.pagado) || 0), 0);
  const pendiente   = valorTotal - pagadoTotal;
  const pagados     = filas.filter(r => r.estadoPago === "Pagado").length;

  const filasHtml = filas.map(r => `
    <tr>
      <td>${esc(r.numeroExpo) || "—"}</td>
      <td>${esc(r.numeroDex) || "—"}</td>
      <td style="text-align:right">${usd(r.valor)}</td>
      <td style="text-align:right">${usd(r.pagado)}</td>
      <td style="text-align:right">${usd(r.saldo)}</td>
      <td>${esc(r.estadoPago)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe Liquidación de DEX - Tierra Prometida</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,sans-serif;color:#1e231e;background:#f4f7f3;font-size:12px}
.sheet{max-width:960px;margin:0 auto;background:#fff}

.banner{background:linear-gradient(120deg,#064e3b,#059669 60%,#34d399);color:#fff;padding:30px 34px 26px;position:relative;overflow:hidden}
.banner::after{content:"💵";position:absolute;right:-10px;top:-22px;font-size:130px;opacity:0.12;transform:rotate(12deg)}
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
.card-val{font-size:16px;font-weight:800;color:#059669;line-height:1.15}
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
        <h1>💵 Informe Liquidación de DEX</h1>
        <div class="sub">Control de pagos y saldos por Declaración de Exportación</div>
      </div>
      ${logoSrc ? `<img src="${logoSrc}" />` : ""}
    </div>
    <div class="chips">
      <span class="chip">📅 ${new Date().toLocaleDateString("es-CO")}</span>
      <span class="chip">🛃 ${filas.length} DEX</span>
      ${filtroEstadoPago ? `<span class="chip">Filtro: ${esc(filtroEstadoPago)}</span>` : ""}
    </div>
  </div>

  <div class="content">

    <div class="cards">
      <div class="card"><div class="card-ic">💵</div><div class="card-val">${valorTotal.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</div><div class="card-lbl">Valor total USD</div></div>
      <div class="card"><div class="card-ic">✅</div><div class="card-val">${pagadoTotal.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</div><div class="card-lbl">Pagado USD</div></div>
      <div class="card"><div class="card-ic">⏳</div><div class="card-val">${pendiente.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</div><div class="card-lbl">Saldo pendiente USD</div></div>
      <div class="card"><div class="card-ic">🛃</div><div class="card-val">${pagados}/${filas.length}</div><div class="card-lbl">DEX pagados</div></div>
    </div>

    <h2>📋 Detalle de liquidación</h2>
    <table>
      <thead>
        <tr>
          <th>N° Expo</th><th>N° DEX</th><th style="text-align:right">Valor USD</th><th style="text-align:right">Pagado USD</th><th style="text-align:right">Saldo USD</th><th>Estado pago</th>
        </tr>
      </thead>
      <tbody>
        ${filasHtml || `<tr><td colspan="6" style="text-align:center;color:#999;padding:16px">Sin registros para estos filtros</td></tr>`}
      </tbody>
      ${filas.length ? `<tfoot><tr><td colspan="2" style="text-align:right">TOTAL</td><td style="text-align:right;color:#059669">${valorTotal.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</td><td style="text-align:right;color:#059669">${pagadoTotal.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</td><td style="text-align:right;color:#059669">${pendiente.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</td><td></td></tr></tfoot>` : ""}
    </table>

  </div>

  <div class="footer">Tierra Prometida Trading 🍋 · JARVIS · Informe generado el ${new Date().toLocaleDateString("es-CO")} a las ${new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</div>
</div>
</body></html>`;
}

function saldoDex(r, totalPagadoPorDex) {
  const valor  = Number(r.valorDexUsd) || 0;
  const pagado = totalPagadoPorDex[r.id] || 0;
  return { valor, pagado, saldo: valor - pagado };
}

function SeccionLiquidacion({ m, registros, pagos, agregarPago, eliminarPago, actualizarPago, inp, lbl, cardS }) {
  const [busqueda, setBusqueda]         = useState("");
  const [filtroEstadoPago, setFiltroEstadoPago] = useState("");
  const [dexAbono, setDexAbono]         = useState(null); // registro seleccionado para abonar
  const [formAbono, setFormAbono]       = useState({ fecha: "", montoUsd: "", obs: "" });
  const [editAbonoId, setEditAbonoId]   = useState(null); // abono en edición (null = abono nuevo)
  const [guardando, setGuardando]       = useState(false);
  const [errorAbono, setErrorAbono]     = useState("");
  const [preview, setPreview]           = useState(null);

  const totalPagadoPorDex = useMemo(() => {
    const acc = {};
    for (const p of pagos) acc[p.dexId] = (acc[p.dexId] || 0) + p.montoUsd;
    return acc;
  }, [pagos]);

  const filas = useMemo(() => {
    return registros
      .map(r => {
        const { valor, pagado, saldo } = saldoDex(r, totalPagadoPorDex);
        const estadoPago = estadoPagoDex(valor, pagado);
        return { ...r, valor, pagado, saldo, estadoPago };
      })
      .filter(r => {
        if (filtroEstadoPago && r.estadoPago !== filtroEstadoPago) return false;
        if (busqueda) {
          const q = busqueda.toLowerCase();
          const hay = [String(r.numeroExpo || ""), r.numeroDex, r.facturaComercial].some(v => (v || "").toLowerCase().includes(q));
          if (!hay) return false;
        }
        return true;
      })
      .sort((a, b) => (Number(b.numeroExpo) || 0) - (Number(a.numeroExpo) || 0));
  }, [registros, totalPagadoPorDex, filtroEstadoPago, busqueda]);

  const kpis = useMemo(() => {
    const conValor = registros.filter(r => Number(r.valorDexUsd) > 0);
    const valorTotal  = conValor.reduce((a, r) => a + (Number(r.valorDexUsd) || 0), 0);
    const pagadoTotal = pagos.reduce((a, p) => a + p.montoUsd, 0);
    const pendiente   = valorTotal - pagadoTotal;
    const pagadosCompletos = conValor.filter(r => estadoPagoDex(r.valorDexUsd, totalPagadoPorDex[r.id] || 0) === "Pagado").length;
    return { valorTotal, pagadoTotal, pendiente, pagadosCompletos, totalConValor: conValor.length };
  }, [registros, pagos, totalPagadoPorDex]);

  const abrirAbono = (r) => {
    setDexAbono(r);
    setFormAbono({ fecha: new Date().toISOString().slice(0, 10), montoUsd: "", obs: "" });
    setEditAbonoId(null);
    setErrorAbono("");
  };
  const cerrarAbono = () => { setDexAbono(null); setEditAbonoId(null); setErrorAbono(""); };

  const editarAbono = (p) => {
    setFormAbono({ fecha: p.fecha, montoUsd: String(p.montoUsd), obs: p.obs });
    setEditAbonoId(p.id);
    setErrorAbono("");
  };
  const cancelarEdicionAbono = () => {
    setFormAbono({ fecha: new Date().toISOString().slice(0, 10), montoUsd: "", obs: "" });
    setEditAbonoId(null);
    setErrorAbono("");
  };

  const registrarAbono = async () => {
    setErrorAbono("");
    if (!formAbono.montoUsd || Number(formAbono.montoUsd) <= 0) {
      setErrorAbono("Ingresa un monto en USD mayor a 0.");
      return;
    }
    setGuardando(true);
    const ok = editAbonoId ? await actualizarPago(editAbonoId, formAbono) : await agregarPago(dexAbono.id, formAbono);
    setGuardando(false);
    if (ok) {
      setFormAbono({ fecha: new Date().toISOString().slice(0, 10), montoUsd: "", obs: "" });
      setEditAbonoId(null);
    } else {
      setErrorAbono(editAbonoId ? "No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo." : "No se pudo registrar el abono. Revisa tu conexión e intenta de nuevo.");
    }
  };

  const pagarCompleto = async (r) => {
    const { saldo } = saldoDex(r, totalPagadoPorDex);
    if (saldo <= 0) return;
    if (!window.confirm(`¿Registrar pago completo de $${saldo.toLocaleString("es-CO")} USD para la expo "${r.numeroExpo || r.numeroDex || r.id}"?`)) return;
    await agregarPago(r.id, { fecha: new Date().toISOString().slice(0, 10), montoUsd: saldo, obs: "Pago completo" });
  };

  const borrarAbono = (p) => {
    if (window.confirm(`¿Eliminar el abono de $${p.montoUsd.toLocaleString("es-CO")}? Esta acción no se puede deshacer.`)) {
      eliminarPago(p.id);
    }
  };

  const anularPago = async (r) => {
    const pagosDex = pagos.filter(p => p.dexId === r.id);
    if (pagosDex.length === 0) return;
    if (!window.confirm(`¿Anular el pago de la expo "${r.numeroExpo || r.numeroDex || r.id}"? Se eliminarán ${pagosDex.length} abono(s) por un total de $${r.pagado.toLocaleString("es-CO")} USD. Esta acción no se puede deshacer.`)) return;
    for (const p of pagosDex) await eliminarPago(p.id);
  };

  const pagosDelDex = dexAbono ? pagos.filter(p => p.dexId === dexAbono.id).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")) : [];
  const dexAbonoCalc = dexAbono ? saldoDex(dexAbono, totalPagadoPorDex) : null;

  const verInforme = async () => {
    const html = await generarInformeLiquidacionHTML(filas, filtroEstadoPago);
    const url  = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const sufijo = filtroEstadoPago ? filtroEstadoPago.toLowerCase().replace(/\s+/g, "_") : "todos";
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev.url); return { url, filename: `Informe_Liquidacion_DEX_${sufijo}.html` }; });
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── KPIs de liquidación ── */}
      <div style={{ display: "grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
        {[
          { l: "Valor total USD",   v: `$${kpis.valorTotal.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`, c: "#845EF7", i: "💵" },
          { l: "Pagado USD",        v: `$${kpis.pagadoTotal.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`, c: "#00C9A7", i: "✅" },
          { l: "Saldo pendiente USD", v: `$${kpis.pendiente.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`, c: kpis.pendiente > 0 ? "#F9A826" : "#00C9A7", i: "⏳" },
          { l: "DEX pagados",       v: `${kpis.pagadosCompletos}/${kpis.totalConValor}`, c: "#059669", i: "🛃" },
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

      {/* ── Lista de DEX con saldo ── */}
      <div style={cardS}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>💵 Liquidación de DEX</div>
          <button onClick={verInforme} style={{ background: "rgba(0,201,167,0.12)", border: "1px solid rgba(0,201,167,0.35)", borderRadius: 8, color: "#00C9A7", padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            📄 Informe
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar N° expo, N° DEX, factura..." style={{ ...inp, flex: 1, minWidth: 160 }} />
          <CustomSelect value={filtroEstadoPago} onChange={e => setFiltroEstadoPago(e.target.value)} style={{ ...inp, width: m ? "100%" : 180 }}>
            <option value="">Todos los estados de pago</option>
            <option value="Pagado">Pagado</option>
            <option value="Parcial">Parcial</option>
            <option value="Sin abonos">Sin abonos</option>
          </CustomSelect>
        </div>

        {filas.length === 0 ? (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>Sin registros de DEX para estos filtros.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
                  <th style={{ padding: "6px" }}>N° Expo</th><th style={{ padding: "6px" }}>N° DEX</th>
                  <th style={{ padding: "6px" }}>Valor USD</th><th style={{ padding: "6px" }}>Pagado USD</th>
                  <th style={{ padding: "6px" }}>Saldo USD</th><th style={{ padding: "6px" }}>Estado pago</th><th style={{ padding: "6px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filas.map(r => (
                  <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "6px", color: "white", fontWeight: 600 }}>{r.numeroExpo || "—"}</td>
                    <td style={{ padding: "6px" }}>{r.numeroDex || "—"}</td>
                    <td style={{ padding: "6px" }}>{usd(r.valor)}</td>
                    <td style={{ padding: "6px", color: r.pagado > 0 ? "#00C9A7" : "inherit" }}>{usd(r.pagado)}</td>
                    <td style={{ padding: "6px", color: r.saldo > 0 ? "#F9A826" : "rgba(255,255,255,0.5)", fontWeight: 700 }}>{usd(r.saldo)}</td>
                    <td style={{ padding: "6px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: `${COLOR_ESTADO_PAGO[r.estadoPago]}22`, color: COLOR_ESTADO_PAGO[r.estadoPago] }}>{r.estadoPago}</span>
                    </td>
                    <td style={{ padding: "6px", whiteSpace: "nowrap" }}>
                      <button onClick={() => abrirAbono(r)} style={btnTablaEditar}>💵 Abonar</button>
                      <button onClick={() => pagarCompleto(r)} disabled={r.saldo <= 0}
                        style={{ background: "rgba(0,201,167,0.12)", border: "1px solid rgba(0,201,167,0.35)", borderRadius: 6, color: "#00C9A7", padding: "4px 8px", fontSize: 11, cursor: r.saldo > 0 ? "pointer" : "not-allowed", opacity: r.saldo > 0 ? 1 : 0.4, marginRight: 6 }}>
                        ✅ Pagado
                      </button>
                      <button onClick={() => anularPago(r)} disabled={r.estadoPago !== "Pagado"}
                        style={{ background: "rgba(255,107,107,0.12)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 6, color: "#FF6B6B", padding: "4px 8px", fontSize: 11, cursor: r.estadoPago === "Pagado" ? "pointer" : "not-allowed", opacity: r.estadoPago === "Pagado" ? 1 : 0.4 }}>
                        ↩ Anular pago
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal de abono ── */}
      {dexAbono && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: m ? 8 : 24 }}>
          <div style={{ background: "#1a1f1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: m ? 16 : 22, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "white" }}>💵 Abonar — Expo {dexAbono.numeroExpo || dexAbono.numeroDex || "—"}</div>
              <button onClick={cerrarAbono} style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.20)", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "rgba(255,255,255,0.78)", cursor: "pointer" }}>✕</button>
            </div>
            {dexAbono.numeroDex && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>N° DEX: {dexAbono.numeroDex}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
              <div style={{ ...cardS, padding: 10, textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#845EF7" }}>{usd(dexAbonoCalc.valor)}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>Valor USD</div>
              </div>
              <div style={{ ...cardS, padding: 10, textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#00C9A7" }}>{usd(dexAbonoCalc.pagado)}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>Pagado USD</div>
              </div>
              <div style={{ ...cardS, padding: 10, textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: dexAbonoCalc.saldo > 0 ? "#F9A826" : "#00C9A7" }}>{usd(dexAbonoCalc.saldo)}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>Saldo USD</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div><div style={lbl}>Fecha</div><input type="date" style={inp} value={formAbono.fecha} onChange={e => setFormAbono(f => ({ ...f, fecha: e.target.value }))} /></div>
              <div><div style={lbl}>Monto (USD)</div><input type="number" style={inp} value={formAbono.montoUsd} onChange={e => setFormAbono(f => ({ ...f, montoUsd: e.target.value }))} placeholder="Ej: 10000" /></div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={lbl}>Observaciones</div>
              <input style={inp} value={formAbono.obs} onChange={e => setFormAbono(f => ({ ...f, obs: e.target.value }))} placeholder="Referencia, banco, etc. (opcional)" />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 16 }}>
              {errorAbono && <span style={{ color: "#FF6B6B", fontSize: 11, marginRight: "auto" }}>{errorAbono}</span>}
              {editAbonoId && <button onClick={cancelarEdicionAbono} style={btnSecundario}>Cancelar</button>}
              <button onClick={registrarAbono} disabled={guardando} style={btnPrimario(false, guardando)}>
                {guardando ? "Guardando..." : editAbonoId ? "Guardar cambios" : "➕ Registrar abono"}
              </button>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 8, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>Historial de abonos</div>
            {pagosDelDex.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Sin abonos registrados todavía.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pagosDelDex.map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "8px 10px" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#00C9A7" }}>{usd(p.montoUsd)} USD</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{fmtFechaCorta(p.fecha)}{p.obs ? ` · ${p.obs}` : ""}</div>
                    </div>
                    <div style={{ whiteSpace: "nowrap" }}>
                      <button onClick={() => editarAbono(p)} style={btnTablaEditar}>Editar</button>
                      <button onClick={() => borrarAbono(p)} style={btnTablaEliminar}>Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal vista previa del informe ── */}
      {preview && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, display: "flex", flexDirection: "column", padding: m ? 8 : 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ color: "white", fontSize: 13, fontWeight: 700 }}>📄 Vista previa — Informe Liquidación de DEX</div>
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

function declaracionVacia() {
  return { numero: "", banco: "", valorUsd: "", fecha: new Date().toISOString().slice(0, 10), obs: "" };
}

// Nombre corto para mostrar un DEX en las listas: número real del DEX (si
// ya lo tiene, es decir, ya radicado) y el número de expo interno juntos,
// para que siempre se sepa a qué operación corresponde.
function nombreCortoDex(r) {
  const partes = [];
  if (r.numeroDex) partes.push(r.numeroDex);
  if (r.numeroExpo) partes.push(`Expo ${r.numeroExpo}`);
  if (!partes.length) partes.push(`#${r.id}`);
  return partes.join(" · ");
}

function SeccionDeclaracionCambio({ m, registros, declaraciones, asignaciones, crearDeclaracion, actualizarDeclaracion, eliminarDeclaracion, asignarDexADeclaracion, quitarAsignacion, actualizarValorAsignacion, inp, lbl, cardS }) {
  const [form, setForm]               = useState(declaracionVacia);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoDeclaracionId, setEditandoDeclaracionId] = useState(null); // null = creando nueva
  const [guardando, setGuardando]     = useState(false);
  const [errorForm, setErrorForm]     = useState("");
  const [pickerAbiertoId, setPickerAbiertoId] = useState(null);
  const [buscaPicker, setBuscaPicker] = useState("");
  const [valorPorFila, setValorPorFila] = useState({}); // { [dexId]: "texto del input" } — valores a asignar en el picker
  const [editandoId, setEditandoId] = useState(null); // id de la asignación cuyo valor se está ajustando
  const [valorEditado, setValorEditado] = useState("");

  const setCampo = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const dexById = useMemo(() => {
    const map = {};
    registros.forEach(r => { map[r.id] = r; });
    return map;
  }, [registros]);

  const asignacionesPorDeclaracion = useMemo(() => {
    const map = {};
    asignaciones.forEach(a => { (map[a.declaracionCambioId] ||= []).push(a); });
    return map;
  }, [asignaciones]);

  // Un mismo DEX puede repartirse entre varias declaraciones — esto suma
  // cuánto de cada DEX ya está usado en total, para saber cuánto le queda
  // libre a la hora de asignarlo de nuevo.
  const usadoPorDex = useMemo(() => {
    const map = {};
    asignaciones.forEach(a => { map[a.dexId] = (map[a.dexId] || 0) + a.valorUsd; });
    return map;
  }, [asignaciones]);

  const disponiblesFiltrados = useMemo(() => {
    const q = buscaPicker.toLowerCase();
    const yaEnEstaDeclaracion = new Set((asignacionesPorDeclaracion[pickerAbiertoId] || []).map(a => a.dexId));
    return registros
      .filter(r => !yaEnEstaDeclaracion.has(r.id))
      .filter(r => !q || [String(r.numeroExpo || ""), r.numeroDex, r.facturaComercial].some(v => (v || "").toLowerCase().includes(q)))
      .sort((a, b) => (Number(b.valorDexUsd) || 0) - (Number(a.valorDexUsd) || 0));
  }, [registros, buscaPicker, asignacionesPorDeclaracion, pickerAbiertoId]);

  const nuevaDeclaracion = () => { setForm(declaracionVacia()); setEditandoDeclaracionId(null); setErrorForm(""); setMostrarForm(true); };
  const editarDeclaracion = (d) => {
    setForm({ numero: d.numero, banco: d.banco, valorUsd: String(d.valorUsd), fecha: d.fecha, obs: d.obs });
    setEditandoDeclaracionId(d.id);
    setErrorForm("");
    setMostrarForm(true);
  };
  const cerrarForm = () => { setMostrarForm(false); setForm(declaracionVacia()); setEditandoDeclaracionId(null); setErrorForm(""); };

  const guardar = async () => {
    setErrorForm("");
    if (!form.valorUsd || Number(form.valorUsd) <= 0) {
      setErrorForm("Ingresa el valor de la declaración en USD.");
      return;
    }
    setGuardando(true);
    const ok = editandoDeclaracionId
      ? await actualizarDeclaracion(editandoDeclaracionId, form)
      : await crearDeclaracion(form);
    setGuardando(false);
    if (ok) cerrarForm();
    else setErrorForm("No se pudo guardar. Intenta de nuevo.");
  };

  const eliminar = (d) => {
    if (window.confirm(`¿Eliminar la declaración "${d.numero || d.id}"? Los DEX asignados quedan libres.`)) eliminarDeclaracion(d.id);
  };

  const togglePicker = (id) => { setPickerAbiertoId(prev => prev === id ? null : id); setBuscaPicker(""); setValorPorFila({}); };

  const asignar = (r, declaracionId) => {
    const restante = (Number(r.valorDexUsd) || 0) - (usadoPorDex[r.id] || 0);
    const porDefecto = restante > 0 ? restante : (Number(r.valorDexUsd) || 0);
    const valor = valorPorFila[r.id] !== undefined && valorPorFila[r.id] !== "" ? Number(valorPorFila[r.id]) : porDefecto;
    asignarDexADeclaracion(r.id, declaracionId, valor);
    setValorPorFila(prev => { const n = { ...prev }; delete n[r.id]; return n; });
  };

  const empezarEdicion = (a) => { setEditandoId(a.id); setValorEditado(String(a.valorUsd)); };
  const guardarEdicion = (a) => {
    const v = Number(valorEditado);
    if (!isNaN(v) && v >= 0) actualizarValorAsignacion(a.id, v);
    setEditandoId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "white" }}>💱 Declaraciones de Cambio</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", marginTop: 2 }}>Cada declaración se llena asignándole uno o varios DEX hasta cuadrar su valor total — un mismo DEX se puede repartir entre varias declaraciones</div>
        </div>
        <button onClick={mostrarForm ? cerrarForm : nuevaDeclaracion} style={btnPrimario(false, false)}>
          {mostrarForm ? "✕ Cancelar" : "➕ Nueva declaración"}
        </button>
      </div>

      {mostrarForm && (
        <div style={cardS}>
          <div style={{ display: "grid", gridTemplateColumns: m ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>N° / referencia</label>
              <input style={inp} value={form.numero} onChange={e => setCampo("numero", e.target.value)} placeholder="Opcional" />
            </div>
            <div>
              <label style={lbl}>Banco / intermediario</label>
              <input style={inp} value={form.banco} onChange={e => setCampo("banco", e.target.value)} placeholder="Opcional" />
            </div>
            <div>
              <label style={lbl}>Valor USD *</label>
              <input style={inp} type="number" value={form.valorUsd} onChange={e => setCampo("valorUsd", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label style={lbl}>Fecha</label>
              <input style={inp} type="date" value={form.fecha} onChange={e => setCampo("fecha", e.target.value)} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Observaciones</label>
              <input style={inp} value={form.obs} onChange={e => setCampo("obs", e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          {errorForm && <div style={{ color: "#FF6B6B", fontSize: 11, marginTop: 8 }}>{errorForm}</div>}
          <button onClick={guardar} disabled={guardando} style={{ ...btnPrimario(false, guardando), marginTop: 12 }}>
            {guardando ? "Guardando..." : editandoDeclaracionId ? "✅ Guardar cambios" : "✅ Registrar declaración"}
          </button>
        </div>
      )}

      {declaraciones.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.33)", fontSize: 13 }}>
          Todavía no hay declaraciones de cambio registradas.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {declaraciones.map(d => {
            const asig = asignacionesPorDeclaracion[d.id] || [];
            const sumaAsignada = asig.reduce((s, a) => s + a.valorUsd, 0);
            const saldo = d.valorUsd - sumaAsignada;
            const completa = Math.abs(saldo) < 0.01;
            return (
              <div key={d.id} style={{ ...cardS, borderLeft: `3px solid ${completa ? "#00C9A7" : "#F9A826"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "white" }}>
                      {d.numero ? `Declaración ${d.numero}` : `Declaración #${d.id}`}
                      {d.banco ? <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500 }}> — {d.banco}</span> : null}
                    </div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.42)", marginTop: 3 }}>
                      {d.fecha ? `🕐 ${fmtFechaCorta(d.fecha)}` : ""}
                    </div>
                    {d.obs && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 5, fontStyle: "italic" }}>{d.obs}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "white" }}>US$ {usd(d.valorUsd)}</div>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: completa ? "#00C9A7" : "#F9A826", background: `${completa ? "#00C9A7" : "#F9A826"}20`, padding: "2px 8px", borderRadius: 5 }}>
                      {completa ? "✓ Completa" : saldo > 0 ? `Falta US$ ${usd(saldo)}` : `Sobra US$ ${usd(Math.abs(saldo))}`}
                    </span>
                  </div>
                </div>

                {asig.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 6 }}>
                    {asig.map(a => {
                      const dex = dexById[a.dexId];
                      if (!dex) return null;
                      const parcial = Math.abs(a.valorUsd - (Number(dex.valorDexUsd) || 0)) > 0.005;
                      return (
                        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, color: "rgba(255,255,255,0.75)", gap: 8 }}>
                          <span style={{ minWidth: 0 }}>🛃 {nombreCortoDex(dex)}{parcial ? <span style={{ color: "rgba(255,255,255,0.4)" }}> · DEX real US$ {usd(dex.valorDexUsd)}</span> : null}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            {editandoId === a.id ? (
                              <>
                                <input type="number" autoFocus value={valorEditado} onChange={e => setValorEditado(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") guardarEdicion(a); if (e.key === "Escape") setEditandoId(null); }}
                                  style={{ ...inp, width: 100, padding: "3px 6px" }} />
                                <button onClick={() => guardarEdicion(a)} style={{ ...btnSecundario, padding: "2px 7px" }}>✓</button>
                              </>
                            ) : (
                              <span onClick={() => empezarEdicion(a)} title="Clic para editar el valor usado" style={{ fontWeight: 700, color: parcial ? "#F9A826" : "#00C9A7", cursor: "pointer", borderBottom: "1px dashed currentColor" }}>
                                US$ {usd(a.valorUsd)}
                              </span>
                            )}
                            <button onClick={() => quitarAsignacion(a.id)} style={{ ...btnTablaEliminar, padding: "2px 7px" }}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => togglePicker(d.id)} style={btnSecundario}>
                    {pickerAbiertoId === d.id ? "▲ Cerrar" : "➕ Asignar DEX"}
                  </button>
                  <button onClick={() => editarDeclaracion(d)} style={{ ...btnTablaEditar, marginLeft: "auto" }}>✏️ Editar</button>
                  <button onClick={() => eliminar(d)} style={btnTablaEliminar}>🗑 Eliminar</button>
                </div>

                {pickerAbiertoId === d.id && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <input style={{ ...inp, marginBottom: 8 }} value={buscaPicker} onChange={e => setBuscaPicker(e.target.value)} placeholder="Buscar DEX por número, expo o factura..." />
                    {disponiblesFiltrados.length === 0 ? (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "10px 0" }}>No hay más DEX para asignar.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
                        {disponiblesFiltrados.map(r => {
                          const restante = (Number(r.valorDexUsd) || 0) - (usadoPorDex[r.id] || 0);
                          return (
                            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, fontSize: 11.5, gap: 8 }}>
                              <span style={{ minWidth: 0 }}>
                                🛃 {nombreCortoDex(r)} <span style={{ color: "rgba(255,255,255,0.4)" }}>· {r.estado} · real US$ {usd(r.valorDexUsd)}</span>
                                {usadoPorDex[r.id] ? <span style={{ color: restante > 0 ? "#F9A826" : "#FF6B6B" }}> · libre US$ {usd(restante)}</span> : null}
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                <input type="number" value={valorPorFila[r.id] ?? (restante > 0 ? restante : r.valorDexUsd) ?? ""} onChange={e => setValorPorFila(prev => ({ ...prev, [r.id]: e.target.value }))}
                                  style={{ ...inp, width: 100, padding: "3px 6px" }} placeholder="Valor a usar" />
                                <button onClick={() => asignar(r, d.id)} style={{ ...btnSecundario, color: "#00C9A7", borderColor: "#00C9A760" }}>Asignar</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
