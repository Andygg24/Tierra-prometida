import { useState, useEffect, useMemo, useRef } from "react";
import QRCode from "qrcode";
import LimonLoader from "./LimonLoader.jsx";
import CustomSelect from "./CustomSelect.jsx";
import { btnSecundario, btnPrimario, btnTablaEliminar } from "./buttonStyles.js";
import { useCanastillas } from "../hooks/useCanastillas.js";

const ACCIONES = [
  { value: "prestamo",   label: "Préstamo — sale a un proveedor" },
  { value: "devolucion", label: "Devolución — vuelve a bodega" },
  { value: "perdida",    label: "Reportar pérdida" },
  { value: "baja",       label: "Dar de baja (dañada)" },
];

const inp = { background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"7px 10px", color:"white", fontSize:11, fontFamily:"inherit", width:"100%", boxSizing:"border-box" };
const lbl = { fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:3 };

const hoyISO = () => new Date().toISOString().split("T")[0];

// ── Hoja de etiquetas imprimible (HTML autocontenido) ──────────────────────
function buildHojaEtiquetas(pares) {
  const celdas = pares.map(({ codigo, dataUrl }) => `
    <div class="etq">
      <img src="${dataUrl}" alt="${codigo}" />
      <div class="cod">${codigo}</div>
    </div>`).join("");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Etiquetas Canastillas</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;padding:16px;background:white}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  .etq{border:1px dashed #999;border-radius:6px;padding:8px;text-align:center;page-break-inside:avoid}
  .etq img{width:100%;max-width:140px;height:auto}
  .cod{font-size:11px;font-weight:700;margin-top:4px;color:#222;letter-spacing:0.5px}
  @media print{
    body{padding:0}
    .grid{grid-template-columns:repeat(4,1fr)}
  }
</style></head>
<body><div class="grid">${celdas}</div></body></html>`;
}

export default function CanastillasTab({ mob }) {
  const { canastillas, loading, crearLote, confirmarLoteEscaneo, reportarEstado, obtenerHistorial, buscarPorCodigo } = useCanastillas();

  const [vista, setVista] = useState("dashboard"); // dashboard | generar | escanear
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
    { id: "escanear",  icon: "📷", label: "Escanear" },
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
            {v.icon} {v.label}
          </button>
        ))}
      </div>

      {vista === "dashboard" && (
        <DashboardView mob={mob} canastillas={canastillas} obtenerHistorial={obtenerHistorial} buscarPorCodigo={buscarPorCodigo}
          pedir={pedir} showToast={showToast} reportarEstado={reportarEstado} />
      )}

      {vista === "generar" && (
        <GenerarView mob={mob} crearLote={crearLote} pedir={pedir} showToast={showToast} verPrevia={verPrevia} />
      )}

      {vista === "escanear" && (
        <EscanearView mob={mob} buscarPorCodigo={buscarPorCodigo} confirmarLoteEscaneo={confirmarLoteEscaneo}
          pedir={pedir} showToast={showToast} />
      )}
    </div>
  );
}

// ── Vista: Resumen ──────────────────────────────────────────────────────────
function DashboardView({ mob, canastillas, obtenerHistorial, buscarPorCodigo, pedir, showToast, reportarEstado }) {
  const [busqueda, setBusqueda]   = useState("");
  const [encontrada, setEncontrada] = useState(null); // canastilla o "not_found"
  const [historial, setHistorial] = useState([]);
  const [expandido, setExpandido] = useState(null);

  const stats = useMemo(() => ({
    total:      canastillas.length,
    disponible: canastillas.filter(c => c.estado === "disponible").length,
    prestada:   canastillas.filter(c => c.estado === "prestada").length,
    baja:       canastillas.filter(c => c.estado === "perdida" || c.estado === "baja").length,
  }), [canastillas]);

  const porProveedor = useMemo(() => {
    const mapa = {};
    canastillas.filter(c => c.estado === "prestada").forEach(c => {
      const p = c.proveedorActual || "Sin especificar";
      if (!mapa[p]) mapa[p] = [];
      mapa[p].push(c.codigo);
    });
    return Object.entries(mapa).sort((a, b) => b[1].length - a[1].length);
  }, [canastillas]);

  const buscar = async () => {
    const c = buscarPorCodigo(busqueda);
    if (!c) { setEncontrada("not_found"); setHistorial([]); return; }
    setEncontrada(c);
    setHistorial(await obtenerHistorial(c.codigo));
  };

  const reportar = (tipo) => {
    const label = tipo === "perdida" ? "reportar como perdida" : "dar de baja";
    pedir(`¿Confirmas ${label} la canastilla ${encontrada.codigo}?`, async () => {
      const ok = await reportarEstado(encontrada.codigo, { tipo, fecha: hoyISO() });
      showToast(ok ? "Actualizado ✓" : "Error al actualizar", ok);
      if (ok) buscar();
    });
  };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns: mob ? "repeat(2,1fr)" : "repeat(4,1fr)", gap:8, marginBottom:14 }}>
        {[
          { icon:"📦", l:"Total",        v:stats.total,      c:"#845EF7" },
          { icon:"✅", l:"Disponibles",  v:stats.disponible, c:"#00C9A7" },
          { icon:"🤝", l:"Prestadas",    v:stats.prestada,   c:"#F9A826" },
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
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", fontWeight:700, marginBottom:8 }}>🔍 Buscar canastilla por código</div>
        <div style={{ display:"flex", gap:6 }}>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} onKeyDown={e => e.key === "Enter" && buscar()}
            placeholder="TP-000123" style={{ ...inp, flex:1 }} />
          <button onClick={buscar} style={btnPrimario(false, false)}>Buscar</button>
        </div>
        {encontrada === "not_found" && (
          <div style={{ marginTop:10, fontSize:11, color:"rgba(255,255,255,0.4)" }}>No se encontró esa canastilla.</div>
        )}
        {encontrada && encontrada !== "not_found" && (
          <div style={{ marginTop:10, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <span style={{ fontSize:12, fontWeight:700, color:"white" }}>{encontrada.codigo}</span>
              <span style={{ fontSize:10, fontWeight:700, color: encontrada.estado==="disponible"?"#00C9A7":encontrada.estado==="prestada"?"#F9A826":"#FF6B6B" }}>
                {encontrada.estado.toUpperCase()}{encontrada.proveedorActual ? ` · ${encontrada.proveedorActual}` : ""}
              </span>
            </div>
            {historial.length === 0 ? (
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>Sin movimientos registrados.</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:8 }}>
                {historial.map(m => (
                  <div key={m.id} style={{ fontSize:10, color:"rgba(255,255,255,0.55)", display:"flex", justifyContent:"space-between" }}>
                    <span>{m.fecha} · {m.tipo}{m.proveedor ? ` · ${m.proveedor}` : ""}</span>
                    {m.obs && <span style={{ color:"rgba(255,255,255,0.35)" }}>{m.obs}</span>}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={() => reportar("perdida")} style={btnTablaEliminar}>Reportar pérdida</button>
              <button onClick={() => reportar("baja")} style={btnTablaEliminar}>Dar de baja</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize:10, color:"rgba(255,255,255,0.38)", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6, fontWeight:700 }}>
        🤝 Prestadas por proveedor ({porProveedor.length})
      </div>
      {porProveedor.length === 0 ? (
        <div style={{ textAlign:"center", padding:"24px 0", color:"rgba(255,255,255,0.33)", fontSize:12 }}>No hay canastillas prestadas actualmente.</div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {porProveedor.map(([proveedor, codigos]) => (
            <div key={proveedor} style={{ border:"1px solid rgba(255,255,255,0.11)", borderRadius:10, overflow:"hidden" }}>
              <button onClick={() => setExpandido(expandido === proveedor ? null : proveedor)}
                style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background: expandido===proveedor ? "rgba(249,168,38,0.12)" : "rgba(255,255,255,0.03)", padding:"10px 14px", cursor:"pointer", textAlign:"left", width:"100%", border:"none" }}>
                <span style={{ fontSize:12, fontWeight:700, color: expandido===proveedor ? "#F9A826" : "white" }}>{proveedor}</span>
                <span style={{ fontSize:12, fontWeight:800, color:"#F9A826" }}>{codigos.length} canastilla{codigos.length!==1?"s":""}</span>
              </button>
              {expandido === proveedor && (
                <div style={{ padding:"8px 14px", background:"rgba(0,0,0,0.2)", display:"flex", flexWrap:"wrap", gap:6 }}>
                  {codigos.map(c => (
                    <span key={c} style={{ fontSize:10, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, padding:"3px 8px", color:"rgba(255,255,255,0.7)" }}>{c}</span>
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

// ── Vista: Generar QR ────────────────────────────────────────────────────────
function GenerarView({ mob, crearLote, pedir, showToast, verPrevia }) {
  const [prefijo, setPrefijo]   = useState("TP-");
  const [cantidad, setCantidad] = useState(50);
  const [obs, setObs]           = useState("");
  const [generando, setGenerando] = useState(false);

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

  return (
    <div style={{ maxWidth:420 }}>
      <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, padding:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#a78bfa", marginBottom:10 }}>🏷️ Generar nuevas canastillas</div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div>
            <div style={lbl}>Prefijo del código</div>
            <input value={prefijo} onChange={e => setPrefijo(e.target.value)} placeholder="TP-" style={inp} />
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
    </div>
  );
}

// ── Vista: Escanear ──────────────────────────────────────────────────────────
function EscanearView({ mob, buscarPorCodigo, confirmarLoteEscaneo, pedir, showToast }) {
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

  const agregarCodigo = (codigoRaw) => {
    const codigo = (codigoRaw || "").trim().toUpperCase();
    if (!codigo) return;
    setEscaneados(prev => prev.some(e => e.codigo === codigo) ? prev : [...prev, { codigo, existe: !!buscarPorCodigo(codigo) }]);
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
    } catch (err) {
      setCamError("No se pudo acceder a la cámara. Usa el campo manual de abajo.");
    }
  };

  const detenerCamara = async () => {
    try { await html5QrRef.current?.stop(); html5QrRef.current?.clear(); } catch {}
    html5QrRef.current = null;
    setCamActiva(false);
  };

  useEffect(() => () => { html5QrRef.current?.stop().then(() => html5QrRef.current?.clear()).catch(() => {}); }, []);

  const quitarCodigo = (codigo) => setEscaneados(prev => prev.filter(e => e.codigo !== codigo));

  const guardarLote = () => {
    if (escaneados.length === 0) return;
    if ((accion === "prestamo") && !proveedor.trim()) { showToast("Escribe el proveedor para registrar el préstamo", false); return; }
    pedir(`¿Guardar ${escaneados.length} canastilla${escaneados.length!==1?"s":""} como "${ACCIONES.find(a=>a.value===accion)?.label}"?`, async () => {
      setGuardando(true);
      const { actualizados, creados } = await confirmarLoteEscaneo({
        codigos: escaneados.map(e => e.codigo), tipo: accion, proveedor: proveedor.trim() || null, fecha, obs,
      });
      showToast(`Lote guardado — ${actualizados} actualizadas, ${creados} nuevas registradas ✓`);
      setEscaneados([]);
      setGuardando(false);
    });
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap:14 }}>
      <div>
        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, padding:14, marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#a78bfa", marginBottom:10 }}>📷 Configurar escaneo</div>
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
