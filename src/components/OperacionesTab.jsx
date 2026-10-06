import { useState, useEffect, useMemo, useRef } from "react";
import LimonLoader from "./LimonLoader.jsx";
import CustomSelect from "./CustomSelect.jsx";
import { btnSecundario, btnPrimario, btnTablaEditar, btnTablaEliminar } from "./buttonStyles.js";
import { useIncidentes } from "../hooks/useIncidentes.js";
import { registrarActividad } from "../hooks/useActividad.js";
import { fechaLocalISO } from "../utils/dates.js";
import { generarInformeIncidenteHtml, nombreArchivoIncidente } from "../reportes/informeIncidente.js";

const COLOR = "#F43F5E";

// Opciones de la sección 2 del formato NUOCA (TP-DOP-REG-021), en el mismo orden.
const TIPOS_INCIDENCIA = [
  "Derrame Químico",
  "Objeto Extraño en Fruta",
  "Rotura Cristal / Plástico",
  "Corte de Energía / Agua",
  "Falla Grave en Embalaje",
  "Incendio / Amago",
  "Inundación / Sismo",
  "Otro",
];

// Responsables de verificación que trae impresos el formato oficial.
const VERIFICACION_NOMBRE_FORMATO = "Cristian Jauregui / Lennix Vega";
const VERIFICACION_CARGO_FORMATO  = "Inocuidad / DAF";

const nombreUsuarioSesion = () => {
  try { return JSON.parse(localStorage.getItem("tp_session"))?.nombre || ""; } catch { return ""; }
};

function horaActual() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function incidenteVacio() {
  return {
    fecha: fechaLocalISO(), hora: horaActual(), lugar: "",
    reportaNombre: nombreUsuarioSesion(), reportaCargo: "",
    loteAfectado: "", lineaMaquinaria: "",
    tipos: [], tipoOtro: "",
    descripcion: "", accionesCorrectivas: "", accionesPreventivas: "",
    supervisionNombre: "", supervisionCargo: "", supervisionFecha: "",
    verificacionNombre: VERIFICACION_NOMBRE_FORMATO, verificacionCargo: VERIFICACION_CARGO_FORMATO, verificacionFecha: "",
    firmaReporta: "", firmaSupervision: "", firmaVerificacion: "",
    registradoPor: "",
  };
}

function fmtFechaCorta(f) {
  return f ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

// Firma dibujada con el dedo o el mouse. Se guarda sola al terminar cada
// trazo (sin botón de "confirmar firma" que se pueda olvidar); el formulario
// la persiste al darle Guardar incidente.
function FirmaPad({ value, onChange, m }) {
  const canvasRef  = useRef(null);
  const dibujando  = useRef(false);
  const huboTrazo  = useRef(false);

  // Al montar: fondo blanco y, si ya había firma guardada, se pinta encima.
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = value;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const iniciar = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dibujando.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const mover = (e) => {
    if (!dibujando.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
    huboTrazo.current = true;
  };
  const soltar = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    if (huboTrazo.current) onChange(canvasRef.current.toDataURL("image/png"));
    huboTrazo.current = false;
  };
  const borrar = () => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    onChange("");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400} height={160}
        style={{ width: "100%", height: m ? 130 : 110, background: "#fff", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", touchAction: "none", cursor: "crosshair", display: "block" }}
        onPointerDown={iniciar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} onPointerLeave={soltar}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5, gap: 6 }}>
        <span style={{ fontSize: m ? 10 : 9, color: value ? "#00C9A7" : "rgba(255,255,255,0.3)", fontWeight: value ? 700 : 400 }}>
          {value ? "✓ Firmado" : "Firma aquí con el dedo o el mouse"}
        </span>
        {value && (
          <button onClick={borrar} style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 6, color: "#FF6B6B", padding: m ? "6px 10px" : "3px 8px", fontSize: 10.5, cursor: "pointer", fontFamily: "inherit" }}>🧹 Borrar</button>
        )}
      </div>
    </div>
  );
}

const estaCerrado = (inc) => !!inc.verificacionFecha;
const textoTipos  = (inc) => inc.tipos.map(t => t === "Otro" && inc.tipoOtro ? `Otro: ${inc.tipoOtro}` : t).join(", ");

export default function OperacionesTab({ mob }) {
  const [isMobLocal, setIsMobLocal] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 680
  );
  useEffect(() => {
    const h = () => setIsMobLocal(window.innerWidth < 680);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  const m = mob || isMobLocal;

  const [tabOp, setTabOp] = useState(0);
  const TAB_OP = ["⚠️ Incidentes Inusuales"];

  const { incidentes, loading, errorCarga, recargar, guardarIncidente, cargarFirmas, eliminarIncidente } = useIncidentes();

  const inp = {
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8, padding: m ? "10px 11px" : "7px 10px", color: "white",
    fontSize: m ? 16 : 12, fontFamily: "inherit", width: "100%", minWidth: 0,
    boxSizing: "border-box", minHeight: m ? 44 : 32,
  };
  const area = { ...inp, minHeight: m ? 110 : 90, resize: "vertical", lineHeight: 1.45 };
  const lbl = { fontSize: m ? 11 : 9, color: "rgba(255,255,255,0.45)", marginBottom: 4, fontWeight: 600, letterSpacing: 0.3 };
  const cardS = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: m ? 14 : 16 };
  const seccion = { fontSize: 11.5, fontWeight: 800, color: COLOR, letterSpacing: 0.4, margin: "18px 0 8px", paddingBottom: 6, borderBottom: "1px solid rgba(244,63,94,0.2)" };
  const ayuda = { fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 };
  const campoBox = { minWidth: 0 };

  // ══════════════ Lista / detalle ══════════════
  const [sel, setSel]               = useState(null); // null = lista | "new" | id
  const [form, setForm]             = useState(incidenteVacio);
  const [guardando, setGuardando]   = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState("");
  // Firmas de un incidente existente: "cargando" | "ok" | "error". Mientras no
  // estén en "ok" no se deja guardar, para no pisar las firmas con vacío.
  const [firmasEstado, setFirmasEstado] = useState("ok");
  const selRef = useRef(null);

  const [busqueda, setBusqueda]         = useState("");
  const [filtroEstado, setFiltroEstado] = useState("Todos");

  const setCampo = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));
  const toggleTipo = (t) => setForm(f => ({ ...f, tipos: f.tipos.includes(t) ? f.tipos.filter(x => x !== t) : [...f.tipos, t] }));

  // Lugares y líneas ya usados — sugerencias para no digitar lo mismo cada vez.
  const lugaresUsados = useMemo(() => [...new Set(incidentes.map(i => i.lugar).filter(Boolean))].sort(), [incidentes]);
  const lineasUsadas  = useMemo(() => [...new Set(incidentes.map(i => i.lineaMaquinaria).filter(Boolean))].sort(), [incidentes]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return incidentes.filter(i => {
      if (filtroEstado === "Abiertos" && estaCerrado(i)) return false;
      if (filtroEstado === "Cerrados" && !estaCerrado(i)) return false;
      if (!q) return true;
      return [i.lugar, i.reportaNombre, i.loteAfectado, i.lineaMaquinaria, textoTipos(i), i.descripcion]
        .some(v => (v || "").toLowerCase().includes(q));
    });
  }, [incidentes, busqueda, filtroEstado]);

  const abiertos = incidentes.filter(i => !estaCerrado(i)).length;

  const nuevo = () => { selRef.current = "new"; setForm(incidenteVacio()); setSel("new"); setFirmasEstado("ok"); setErrorGuardado(""); setGuardadoOk(false); };
  const traerFirmas = async (id) => {
    setFirmasEstado("cargando");
    const r = await cargarFirmas(id);
    if (selRef.current !== id) return; // ya se abrió otro incidente
    if (r.ok) { setForm(f => ({ ...f, ...r.firmas })); setFirmasEstado("ok"); }
    else setFirmasEstado("error");
  };
  const abrir = (inc) => {
    selRef.current = inc.id;
    setForm({ ...incidenteVacio(), ...inc });
    setSel(inc.id); setErrorGuardado(""); setGuardadoOk(false);
    traerFirmas(inc.id);
  };
  const volverLista = () => { selRef.current = null; setSel(null); setErrorGuardado(""); setForm(incidenteVacio()); };

  const guardar = async () => {
    setErrorGuardado("");
    if (!form.fecha) { setErrorGuardado("Falta la fecha del incidente."); return; }
    if (!form.lugar.trim()) { setErrorGuardado("Falta el lugar / área del incidente."); return; }
    if (!form.reportaNombre.trim()) { setErrorGuardado("Falta el nombre de quien reporta."); return; }
    if (!form.tipos.length) { setErrorGuardado("Marca al menos un tipo de incidencia."); return; }
    if (form.tipos.includes("Otro") && !form.tipoOtro.trim()) { setErrorGuardado("Escribe cuál es el tipo de incidencia \"Otro\"."); return; }
    if (!form.descripcion.trim()) { setErrorGuardado("Falta la descripción de lo ocurrido."); return; }
    if (firmasEstado !== "ok") { setErrorGuardado("Las firmas de este incidente no han terminado de cargar."); return; }
    setGuardando(true);
    const esNuevo = sel === "new";
    const usuario = nombreUsuarioSesion();
    const { ok, id } = await guardarIncidente(
      { ...form, registradoPor: form.registradoPor || usuario },
      esNuevo ? null : sel
    );
    setGuardando(false);
    if (!ok) { setErrorGuardado("No se pudo guardar el incidente. Revisa tu conexión e intenta de nuevo."); return; }
    registrarActividad({
      usuario, modulo: "Operaciones",
      accion: esNuevo ? "nuevo_incidente" : "editar_incidente",
      detalle: `${esNuevo ? "Reportó" : "Editó"} incidente inusual: ${textoTipos(form)} — ${form.lugar}`,
      referencia: String(id),
    });
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2000);
    if (esNuevo && id) { selRef.current = id; setSel(id); }
  };

  const eliminar = async (inc) => {
    if (!window.confirm(`¿Eliminar el incidente del ${fmtFechaCorta(inc.fecha)} (${textoTipos(inc) || inc.id})? Esta acción no se puede deshacer.`)) return;
    const ok = await eliminarIncidente(inc.id);
    if (!ok) { window.alert("No se pudo eliminar el incidente. Revisa tu conexión."); return; }
    if (sel === inc.id) volverLista();
  };

  // ══════════════ Informe (vista previa / descarga) ══════════════
  // Se arma con lo que hay en pantalla en ese momento, aunque no se haya guardado.
  const [preview, setPreview]     = useState(null); // { url, filename }
  const [generando, setGenerando] = useState(false);
  const iframeRef = useRef(null);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  const armarInforme = async () => {
    const html = await generarInformeIncidenteHtml({ ...form, id: sel }, TIPOS_INCIDENCIA);
    return { url: URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })), filename: nombreArchivoIncidente({ ...form, id: sel }) };
  };
  const informe = async (modo) => {
    if (firmasEstado !== "ok") { setErrorGuardado("Las firmas de este incidente no han terminado de cargar."); return; }
    setGenerando(true);
    try {
      const r = await armarInforme();
      if (modo === "previa") { setPreview(r); return; }
      const a = document.createElement("a");
      a.href = r.url; a.download = r.filename; a.click();
      setTimeout(() => URL.revokeObjectURL(r.url), 4000);
      registrarActividad({
        usuario: nombreUsuarioSesion(), modulo: "Operaciones", accion: "informe_incidente",
        detalle: `Generó informe NUOCA del incidente del ${fmtFechaCorta(form.fecha)} — ${form.lugar || "sin lugar"}`,
        referencia: String(sel),
      });
    } finally {
      setGenerando(false);
    }
  };

  if (loading) return <LimonLoader texto="Cargando incidentes" />;

  const chipEstado = (cerrado) => (
    <span style={{
      fontSize: 10, fontWeight: 800, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap",
      background: cerrado ? "rgba(0,201,167,0.12)" : "rgba(244,63,94,0.12)",
      color: cerrado ? "#00C9A7" : COLOR,
      border: `1px solid ${cerrado ? "rgba(0,201,167,0.35)" : "rgba(244,63,94,0.35)"}`,
    }}>{cerrado ? "Cerrado" : "Abierto"}</span>
  );

  return (
    <div>
      {preview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9998, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 16px", background: "#12121f", borderBottom: "1px solid rgba(255,255,255,0.13)", flexShrink: 0 }}>
            <span style={{ color: "white", fontWeight: 700, fontSize: 13 }}>👁 Vista Previa — {preview.filename}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => iframeRef.current?.contentWindow?.print()} style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.5)", borderRadius: 8, padding: "7px 16px", fontSize: 12, color: "#a5b4fc", cursor: "pointer", fontWeight: 700 }}>🖨 Imprimir / PDF</button>
              <button onClick={() => { const a = document.createElement("a"); a.href = preview.url; a.download = preview.filename; a.click(); }} style={{ background: "linear-gradient(135deg,#845EF7,#6366F1)", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, color: "white", cursor: "pointer", fontWeight: 700 }}>📥 Descargar</button>
              <button onClick={() => setPreview(null)} style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.20)", borderRadius: 8, padding: "7px 14px", fontSize: 12, color: "rgba(255,255,255,0.78)", cursor: "pointer" }}>✕ Cerrar</button>
            </div>
          </div>
          <iframe ref={iframeRef} src={preview.url} style={{ flex: 1, border: "none", background: "white" }} title="Vista previa del informe NUOCA" />
        </div>
      )}

      {/* ── Sub-apartados ── */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 16, paddingBottom: 2 }}>
        {TAB_OP.map((t, i) => (
          <button key={i} onClick={() => setTabOp(i)} style={{
            background: tabOp === i ? "rgba(244,63,94,0.15)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${tabOp === i ? `${COLOR}90` : "rgba(255,255,255,0.07)"}`,
            borderTop: `2px solid ${tabOp === i ? COLOR : "transparent"}`,
            borderRadius: 8, padding: "8px 13px", cursor: "pointer",
            color: tabOp === i ? COLOR : "rgba(255,255,255,0.42)",
            fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", flexShrink: 0,
            fontFamily: "inherit",
          }}>{t}</button>
        ))}
      </div>

      {errorCarga && (
        <div style={{ fontSize: 12, color: "#ff8a8a", background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>No se pudieron cargar los incidentes ({errorCarga}).</span>
          <button onClick={recargar} style={btnSecundario}>↻ Reintentar</button>
        </div>
      )}

      {/* ═══ INCIDENTES INUSUALES ═══ */}
      {tabOp === 0 && (
        sel === null ? (
          /* ── Lista ── */
          <div style={cardS}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>⚠️ Avisos de Incidencia Inusual (NUOCA)</div>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>TP-DOP-REG-021 · PrimusGFS v3.2 Módulo 1</div>
              </div>
              <button onClick={nuevo} style={btnPrimario(false, false)}>+ Reportar incidente</button>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "8px 0 12px" }}>
              {incidentes.length} registrado{incidentes.length === 1 ? "" : "s"} · <span style={{ color: abiertos ? COLOR : "rgba(255,255,255,0.45)", fontWeight: abiertos ? 700 : 400 }}>{abiertos} abierto{abiertos === 1 ? "" : "s"}</span> (sin fecha de verificación de Inocuidad)
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar por lugar, tipo, lote, quien reporta..." style={{ ...inp, flex: "1 1 220px", minWidth: 160 }} />
              <div style={{ flex: m ? "1 1 100%" : "0 1 150px" }}>
                <div style={lbl}>Estado</div>
                <CustomSelect value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={inp}>
                  <option value="Todos">Todos</option>
                  <option value="Abiertos">Abiertos</option>
                  <option value="Cerrados">Cerrados</option>
                </CustomSelect>
              </div>
            </div>
            {filtrados.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>
                {busqueda.trim() || filtroEstado !== "Todos" ? "Ningún incidente coincide con lo buscado." : "Sin incidentes registrados todavía."}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
                      <th style={{ padding: "6px" }}>Fecha</th>
                      <th style={{ padding: "6px" }}>Tipo</th>
                      <th style={{ padding: "6px" }}>Lugar / Área</th>
                      {!m && <th style={{ padding: "6px" }}>Reportó</th>}
                      <th style={{ padding: "6px" }}>Estado</th>
                      <th style={{ padding: "6px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map(inc => (
                      <tr key={inc.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }} onClick={() => abrir(inc)}>
                        <td style={{ padding: "6px", whiteSpace: "nowrap" }}>{fmtFechaCorta(inc.fecha)}{inc.hora ? <span style={{ color: "rgba(255,255,255,0.4)" }}> · {inc.hora}</span> : null}</td>
                        <td style={{ padding: "6px", color: "white", fontWeight: 600 }}>{textoTipos(inc) || "—"}</td>
                        <td style={{ padding: "6px" }}>{inc.lugar || "—"}</td>
                        {!m && <td style={{ padding: "6px" }}>{inc.reportaNombre || "—"}</td>}
                        <td style={{ padding: "6px" }}>{chipEstado(estaCerrado(inc))}</td>
                        <td style={{ padding: "6px", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => abrir(inc)} style={btnTablaEditar}>Abrir</button>
                          <button onClick={() => eliminar(inc)} style={btnTablaEliminar}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* ── Formulario NUOCA ── */
          <div style={cardS}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>
                  ⚠️ {sel === "new" ? "Nuevo aviso de incidencia inusual" : `Incidente #${sel}`}
                </div>
                {sel !== "new" && chipEstado(estaCerrado(form))}
              </div>
              <button onClick={volverLista} style={btnSecundario}>← Volver a la lista</button>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.18)", borderRadius: 8, padding: "8px 11px" }}>
              Diligenciar de inmediato ante cualquier evento inusual que pueda comprometer la inocuidad del limón, la seguridad del personal o la continuidad de la planta.
            </div>

            <datalist id="inc-lugares">{lugaresUsados.map(v => <option key={v} value={v} />)}</datalist>
            <datalist id="inc-lineas">{lineasUsadas.map(v => <option key={v} value={v} />)}</datalist>

            {/* 1 */}
            <div style={seccion}>1. DATOS GENERALES DEL INCIDENTE</div>
            <div style={{ display: "grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
              <div style={campoBox}><div style={lbl}>Fecha del incidente *</div><input type="date" style={inp} value={form.fecha} onChange={e => setCampo("fecha", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>Hora</div><input type="time" style={inp} value={form.hora} onChange={e => setCampo("hora", e.target.value)} /></div>
              <div style={{ ...campoBox, gridColumn: m ? "1 / -1" : "span 2" }}><div style={lbl}>Lugar / Área específica *</div><input list="inc-lugares" style={inp} value={form.lugar} onChange={e => setCampo("lugar", e.target.value)} placeholder="Ej: Cuarto frío, zona de lavado..." /></div>
              <div style={{ ...campoBox, gridColumn: m ? "1 / -1" : "span 2" }}><div style={lbl}>Nombre de quien reporta *</div><input style={inp} value={form.reportaNombre} onChange={e => setCampo("reportaNombre", e.target.value)} /></div>
              <div style={{ ...campoBox, gridColumn: m ? "1 / -1" : "span 2" }}><div style={lbl}>Cargo de quien reporta</div><input style={inp} value={form.reportaCargo} onChange={e => setCampo("reportaCargo", e.target.value)} placeholder="Ej: Supervisor, Monitor de calidad..." /></div>
              <div style={{ ...campoBox, gridColumn: m ? "1 / -1" : "span 2" }}><div style={lbl}>Lote de fruta o proceso afectado</div><input style={inp} value={form.loteAfectado} onChange={e => setCampo("loteAfectado", e.target.value)} /></div>
              <div style={{ ...campoBox, gridColumn: m ? "1 / -1" : "span 2" }}><div style={lbl}>Línea / Maquinaria involucrada</div><input list="inc-lineas" style={inp} value={form.lineaMaquinaria} onChange={e => setCampo("lineaMaquinaria", e.target.value)} /></div>
            </div>

            {/* 2 */}
            <div style={seccion}>2. TIPO DE INCIDENCIA INUSUAL *</div>
            <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "repeat(4,1fr)", gap: 8 }}>
              {TIPOS_INCIDENCIA.map(t => {
                const on = form.tipos.includes(t);
                return (
                  <div key={t} onClick={() => toggleTipo(t)} style={{
                    display: "flex", alignItems: "center", gap: 9, cursor: "pointer", userSelect: "none",
                    background: on ? "rgba(244,63,94,0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${on ? "rgba(244,63,94,0.4)" : "rgba(255,255,255,0.1)"}`,
                    borderRadius: 8, padding: m ? "11px 12px" : "9px 11px",
                  }}>
                    <div style={{
                      width: 17, height: 17, borderRadius: 5, flexShrink: 0,
                      background: on ? COLOR : "transparent",
                      border: `2px solid ${on ? COLOR : "rgba(255,255,255,0.3)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "white", fontWeight: 900,
                    }}>{on ? "✓" : ""}</div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: on ? "white" : "rgba(255,255,255,0.65)" }}>{t}</span>
                  </div>
                );
              })}
            </div>
            {form.tipos.includes("Otro") && (
              <div style={{ marginTop: 10 }}>
                <div style={lbl}>¿Cuál? *</div>
                <input style={inp} value={form.tipoOtro} onChange={e => setCampo("tipoOtro", e.target.value)} placeholder="Describe el tipo de incidencia" />
              </div>
            )}

            {/* 3 */}
            <div style={seccion}>3. DESCRIPCIÓN DETALLADA DEL EVENTO Y EVALUACIÓN DE INOCUIDAD *</div>
            <div style={ayuda}>Descripción de lo ocurrido (causas preliminares, impacto observado y riesgo sobre la fruta):</div>
            <textarea style={area} value={form.descripcion} onChange={e => setCampo("descripcion", e.target.value)} />

            {/* 4 */}
            <div style={seccion}>4. ACCIONES CORRECTIVAS INMEDIATAS (CORRECCIÓN Y DISPOSICIÓN DEL PRODUCTO)</div>
            <div style={ayuda}>Medidas tomadas en el acto (detención de línea, aislamiento de producto, retención, limpieza o descarte):</div>
            <textarea style={area} value={form.accionesCorrectivas} onChange={e => setCampo("accionesCorrectivas", e.target.value)} />

            {/* 5 */}
            <div style={seccion}>5. ACCIONES PREVENTIVAS Y SEGUIMIENTO (PARA EVITAR REPETICIÓN)</div>
            <div style={ayuda}>Acciones a mediano plazo, cambios en procedimientos, capacitaciones o reparaciones requeridas:</div>
            <textarea style={area} value={form.accionesPreventivas} onChange={e => setCampo("accionesPreventivas", e.target.value)} />

            {/* 6 */}
            <div style={seccion}>6. VERIFICACIÓN, LIBERACIÓN Y CIERRE</div>
            <div style={ayuda}>Cada persona firma en su casilla (queda guardada al darle Guardar incidente). Al poner la fecha de verificación de Inocuidad el incidente queda <b style={{ color: "#00C9A7" }}>Cerrado</b>.</div>
            {firmasEstado === "cargando" && <div style={{ ...ayuda, color: "#a5b4fc" }}>Cargando firmas…</div>}
            {firmasEstado === "error" && (
              <div style={{ fontSize: 12, color: "#ff8a8a", background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span>No se pudieron cargar las firmas de este incidente.</span>
                <button onClick={() => traerFirmas(sel)} style={btnSecundario}>↻ Reintentar</button>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "repeat(3,1fr)", gap: 10, opacity: firmasEstado === "ok" ? 1 : 0.5, pointerEvents: firmasEstado === "ok" ? "auto" : "none" }}>
              {[
                { titulo: "Reportó incidente", firma: "firmaReporta", k: "rep", campos: [
                  { label: "Nombre", value: form.reportaNombre, soloLectura: true },
                  { label: "Cargo",  value: form.reportaCargo,  soloLectura: true },
                  { label: "Fecha",  value: fmtFechaCorta(form.fecha), soloLectura: true },
                ] },
                { titulo: "Supervisión de Planta / Mantenimiento", firma: "firmaSupervision", k: "sup", campos: [
                  { label: "Nombre", campo: "supervisionNombre" },
                  { label: "Cargo",  campo: "supervisionCargo" },
                  { label: "Fecha",  campo: "supervisionFecha", type: "date" },
                ] },
                { titulo: "Verificación e Inocuidad (Líder HACCP)", firma: "firmaVerificacion", k: "ver", campos: [
                  { label: "Nombre", campo: "verificacionNombre" },
                  { label: "Cargo",  campo: "verificacionCargo" },
                  { label: "Fecha de verificación", campo: "verificacionFecha", type: "date" },
                ] },
              ].map(caja => (
                // Las 3 cajas tienen la misma estructura (título de alto fijo + 3
                // campos del mismo alto + firma) para que las firmas queden alineadas.
                <div key={caja.k} style={{ ...cardS, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.75)", minHeight: m ? 0 : 30, lineHeight: 1.35 }}>{caja.titulo}</div>
                  {caja.campos.map(c => (
                    <div key={c.label}>
                      <div style={lbl}>{c.label}</div>
                      {c.soloLectura ? (
                        <input readOnly tabIndex={-1} title="Se toma de la sección 1" style={{ ...inp, background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.75)", cursor: "default" }} value={c.value || "—"} />
                      ) : (
                        <input type={c.type || "text"} style={inp} value={form[c.campo]} onChange={e => setCampo(c.campo, e.target.value)} />
                      )}
                    </div>
                  ))}
                  <div style={{ marginTop: "auto", paddingTop: 2 }}>
                    <div style={lbl}>Firma</div>
                    <FirmaPad key={`${sel}-${caja.k}-${firmasEstado}`} m={m} value={form[caja.firma]} onChange={v => setCampo(caja.firma, v)} />
                  </div>
                </div>
              ))}
            </div>

            {form.registradoPor && sel !== "new" && (
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", marginTop: 12 }}>Registrado en el sistema por {form.registradoPor}</div>
            )}

            {errorGuardado && (
              <div style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 8, padding: "10px 12px", marginTop: 14, fontSize: 12, color: "#FF6B6B" }}>
                ⚠️ {errorGuardado}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, paddingTop: 12, marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {sel !== "new" ? (
                <button onClick={() => eliminar({ ...form, id: sel })} style={btnTablaEliminar}>Eliminar incidente</button>
              ) : <span />}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => informe("previa")} disabled={generando} style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 8, color: "#a5b4fc", padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: generando ? "wait" : "pointer" }}>👁 Vista previa</button>
                <button onClick={() => informe("descargar")} disabled={generando} style={btnSecundario}>📄 Generar informe</button>
                <button onClick={guardar} disabled={guardando} style={btnPrimario(guardadoOk, guardando)}>
                  {guardadoOk ? "✓ Guardado" : guardando ? "Guardando..." : "Guardar incidente"}
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
