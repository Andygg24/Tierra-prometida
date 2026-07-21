import { useState, useEffect, useMemo } from "react";
import CustomSelect from "./CustomSelect.jsx";
import LimonLoader from "./LimonLoader.jsx";
import { useConfiguracion } from "../hooks/useConfiguracion.js";
import {
  useLogistica, calcularHitos, calcularAlertasLogistica, diasLibresRestantes, buscarNaviera,
} from "../hooks/useLogistica.js";

const ESTADOS_BOOKING       = ["Pendiente", "Confirmado", "Cancelado", "Roll Over", "Finalizado"];
const ESTADOS_CONTENEDOR    = ["Vacío", "Cargado", "En tránsito", "Puerto", "Embarcado"];
const ENTIDADES_INSPECCION  = ["PONAL", "DIAN", "ICA"];
const RESULTADOS_INSPECCION = ["Física", "Documental", "Libre"];

const COLOR_ESTADO_BOOKING = {
  Pendiente: "#F9A826", Confirmado: "#00C9A7", Cancelado: "#FF6B6B", "Roll Over": "#845EF7", Finalizado: "#6366F1",
};
const COLOR_ESTADO_CONTENEDOR = {
  "Vacío": "rgba(255,255,255,0.5)", Cargado: "#00C9A7", "En tránsito": "#0EA5E9", Puerto: "#F9A826", Embarcado: "#845EF7",
};

const btnSecundario = {
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8,
  color: "rgba(255,255,255,0.7)", padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
};
function btnPrimario(ok, loading) {
  return {
    background: ok ? "#00C9A7" : "linear-gradient(135deg,#845EF7,#6366F1)", border: "none", borderRadius: 8,
    color: "white", padding: "9px 18px", fontSize: 12, fontWeight: 700,
    cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1,
  };
}
const btnTablaEditar = {
  background: "rgba(132,94,247,0.12)", border: "1px solid rgba(132,94,247,0.3)", borderRadius: 6,
  color: "#a78bfa", padding: "4px 8px", fontSize: 11, cursor: "pointer", marginRight: 6,
};
const btnTablaEliminar = {
  background: "rgba(255,107,107,0.12)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 6,
  color: "#FF6B6B", padding: "4px 8px", fontSize: 11, cursor: "pointer",
};

function hoyISO() { return new Date().toISOString().split("T")[0]; }

function bookingVacio() {
  return {
    numeroBooking: "", numeroContenedor: "", estado: "Pendiente",
    puertoOrigen: "", puertoDestino: "", naviera: "",
    siCutoffFecha: "", siCutoffHora: "", cyCutoffFecha: "", cyCutoffHora: "",
    documentosCompletos: false, etaActual: "",
    estadoContenedor: "Vacío", fechaIngresoPuerto: "", fechaAsignacion: "",
    fechaOrdenRecibida: "", fechaProduccion: "", fechaPackingTerminado: "",
    fechaZarpe: "", fechaLlegadaDestino: "", fechaEntregaFinal: "",
    obs: "",
  };
}
function transporteVacio() {
  return {
    bookingId: "", placa: "", conductor: "", transportadora: "", trailer: "",
    fechaCargue: "", fechaDescargue: "", standBy: false, costoAdicional: "", comentarios: "",
  };
}
function novedadVacia() {
  return { bookingId: "", fecha: hoyISO(), descripcion: "", responsable: "" };
}
function inspeccionVacia() {
  return { bookingId: "", fecha: hoyISO(), entidad: "PONAL", resultado: "Física", observaciones: "" };
}

function labelBooking(b) {
  if (!b) return "—";
  const partes = [b.numeroBooking, b.numeroContenedor].filter(Boolean);
  return partes.length ? partes.join(" / ") : `#${b.id}`;
}

export default function LogisticaTab({ mob }) {
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

  const log = useLogistica();
  const { config } = useConfiguracion();
  const navierasCfg       = config.cfg_exportacion?.navieras       || [];
  const puertosCfg        = config.cfg_exportacion?.puertos        || [];
  const puertosOrigenCfg  = config.cfg_exportacion?.puertosOrigen  || [];
  const transportadorasCfg = config.cfg_exportacion?.transportadoras || [];

  const [tabLog, setTabLog] = useState(0);
  const TAB_LOG = ["📋 Booking", "🚢 Contenedores", "🚛 Transporte", "⚓ Op. Portuaria", "🕒 Seguimiento", "🔔 Alertas"];

  const alertas = useMemo(
    () => calcularAlertasLogistica(log.bookings, log.transporte, navierasCfg),
    [log.bookings, log.transporte, navierasCfg]
  );

  // ── Estilos (mismo patrón que RecepcionesTab) ──
  const inp = {
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8, padding: isLandscape ? "7px 10px" : (m ? "10px 11px" : "7px 10px"), color: "white",
    fontSize: m ? 16 : 12, fontFamily: "inherit", width: "100%", minWidth: 0,
    boxSizing: "border-box", minHeight: isLandscape ? 36 : (m ? 44 : 32),
  };
  const lbl = {
    fontSize: m ? 11 : 9, color: "rgba(255,255,255,0.45)",
    marginBottom: 4, fontWeight: 600, letterSpacing: 0.3,
  };
  const cardS = {
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10, padding: isLandscape ? 10 : (m ? 14 : 16),
  };
  const campoBox = { minWidth: 0 };
  const camposCols = isLandscape ? "repeat(4, minmax(132px, 1fr))" : (m ? "1fr 1fr" : "repeat(4,1fr)");

  // ══════════════ BOOKING + CONTENEDORES (misma tabla, dos vistas) ══════════════
  const [form, setForm]           = useState(bookingVacio);
  const [editId, setEditId]       = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [busqueda, setBusqueda]   = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const setCampo = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));
  const cancelarEdicion = () => { setForm(bookingVacio()); setEditId(null); };

  const editarBooking = (b) => {
    setForm({ ...bookingVacio(), ...b });
    setEditId(b.id);
    setTabLog(0);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const guardar = async () => {
    if (!form.numeroBooking && !form.numeroContenedor) return;
    setGuardando(true);
    const ok = await log.guardarBooking(form, editId);
    setGuardando(false);
    if (ok) {
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2000);
      cancelarEdicion();
    }
  };

  const navieraSel = buscarNaviera(navierasCfg, form.naviera);
  const campoDiasLibres = navieraSel?.diasLibresDesde;

  const bookingsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return log.bookings.filter(b => {
      if (filtroEstado && b.estado !== filtroEstado) return false;
      if (!q) return true;
      return [b.numeroBooking, b.numeroContenedor, b.naviera, b.puertoOrigen, b.puertoDestino]
        .some(v => (v || "").toLowerCase().includes(q));
    });
  }, [log.bookings, busqueda, filtroEstado]);

  const contenedoresActivos = useMemo(
    () => log.bookings.filter(b => b.numeroContenedor && b.estado !== "Finalizado" && b.estado !== "Cancelado"),
    [log.bookings]
  );

  // ══════════════ TRANSPORTE ══════════════
  const [transForm, setTransForm]   = useState(transporteVacio);
  const [transEditId, setTransEditId] = useState(null);
  const setCampoTrans = (campo, valor) => setTransForm(f => ({ ...f, [campo]: valor }));
  const cancelarTrans = () => { setTransForm(transporteVacio()); setTransEditId(null); };
  const editarTransporte = (t) => { setTransForm({ ...transporteVacio(), ...t }); setTransEditId(t.id); };
  const guardarTrans = async () => {
    if (!transForm.bookingId) return;
    const ok = await log.guardarTransporte(transForm, transEditId);
    if (ok) cancelarTrans();
  };

  // ══════════════ OPERACIÓN PORTUARIA ══════════════
  const [novForm, setNovForm]   = useState(novedadVacia);
  const [novEditId, setNovEditId] = useState(null);
  const cancelarNov = () => { setNovForm(novedadVacia()); setNovEditId(null); };
  const editarNovedad = (n) => { setNovForm({ ...novedadVacia(), ...n }); setNovEditId(n.id); };
  const guardarNov = async () => {
    if (!novForm.bookingId || !novForm.descripcion) return;
    const ok = await log.guardarNovedad(novForm, novEditId);
    if (ok) cancelarNov();
  };

  const [inspForm, setInspForm]   = useState(inspeccionVacia);
  const [inspEditId, setInspEditId] = useState(null);
  const cancelarInsp = () => { setInspForm(inspeccionVacia()); setInspEditId(null); };
  const editarInspeccion = (i) => { setInspForm({ ...inspeccionVacia(), ...i }); setInspEditId(i.id); };
  const guardarInsp = async () => {
    if (!inspForm.bookingId) return;
    const ok = await log.guardarInspeccion(inspForm, inspEditId);
    if (ok) cancelarInsp();
  };

  // ══════════════ SEGUIMIENTO ══════════════
  const [seguimientoAbierto, setSeguimientoAbierto] = useState(null);

  if (log.loading) return <LimonLoader texto="Cargando logística" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
        {[
          { l: "Bookings",        v: log.bookings.length,                                       c: "#00C9A7", i: "📋" },
          { l: "Confirmados",     v: log.bookings.filter(b => b.estado === "Confirmado").length, c: "#845EF7", i: "✅" },
          { l: "Roll Over",       v: log.bookings.filter(b => b.estado === "Roll Over").length,  c: "#F9A826", i: "🔄" },
          { l: "Alertas activas", v: alertas.length, c: alertas.length ? "#FF6B6B" : "#6366F1",  i: "🔔" },
        ].map((s, i) => (
          <div key={i} style={{ ...cardS, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 20 }}>{s.i}</div>
            <div>
              <div style={{ fontSize: m ? 18 : 20, fontWeight: 800, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{s.l}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(255,255,255,0.10)", paddingBottom: 10, overflowX: "auto", flexWrap: "nowrap", scrollbarWidth: "none" }}>
        {TAB_LOG.map((t, i) => (
          <button key={i} onClick={() => setTabLog(i)}
            style={{
              background: tabLog === i ? "rgba(249,115,22,0.2)" : "transparent",
              border: tabLog === i ? "1px solid rgba(249,115,22,0.5)" : "1px solid transparent",
              borderRadius: 8, padding: "6px 12px", fontSize: 11,
              color: tabLog === i ? "#fb923c" : "rgba(255,255,255,0.4)",
              cursor: "pointer", fontWeight: tabLog === i ? 700 : 400, whiteSpace: "nowrap", flexShrink: 0,
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* ═══ TAB 0 — BOOKING ═══ */}
      {tabLog === 0 && (
        <>
          <div style={cardS}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>
              {editId ? "✏️ Editar booking" : "📋 Nuevo booking"}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Datos del booking</div>
            <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 14 }}>
              <div style={campoBox}><div style={lbl}>Número booking</div><input style={inp} value={form.numeroBooking} onChange={e => setCampo("numeroBooking", e.target.value)} placeholder="Ej: BK-00123" /></div>
              <div style={campoBox}><div style={lbl}>Número contenedor</div><input style={inp} value={form.numeroContenedor} onChange={e => setCampo("numeroContenedor", e.target.value.toUpperCase())} placeholder="MSKU1234567" /></div>
              <div style={campoBox}><div style={lbl}>Estado</div>
                <CustomSelect value={form.estado} onChange={e => setCampo("estado", e.target.value)} style={inp}>
                  {ESTADOS_BOOKING.map(x => <option key={x} value={x}>{x}</option>)}
                </CustomSelect>
              </div>
              <div style={campoBox}><div style={lbl}>Naviera</div>
                <CustomSelect value={form.naviera} onChange={e => setCampo("naviera", e.target.value)} style={inp}>
                  <option value="">Seleccionar...</option>
                  {navierasCfg.map(n => <option key={n.id} value={n.nombre}>{n.nombre}</option>)}
                </CustomSelect>
              </div>
              <div style={campoBox}><div style={lbl}>Puerto de origen</div>
                <CustomSelect value={form.puertoOrigen} onChange={e => setCampo("puertoOrigen", e.target.value)} style={inp}>
                  <option value="">Seleccionar...</option>
                  {puertosOrigenCfg.map((p, i) => <option key={i} value={p}>{p}</option>)}
                </CustomSelect>
              </div>
              <div style={campoBox}><div style={lbl}>Puerto de destino</div>
                <CustomSelect value={form.puertoDestino} onChange={e => setCampo("puertoDestino", e.target.value)} style={inp}>
                  <option value="">Seleccionar...</option>
                  {puertosCfg.map((p, i) => <option key={i} value={p}>{p}</option>)}
                </CustomSelect>
              </div>
              <div style={campoBox}>
                <div style={lbl}>ETA</div>
                <input type="date" style={inp} value={form.etaActual} onChange={e => setCampo("etaActual", e.target.value)} />
                {form.etaAnterior && form.etaAnterior !== form.etaActual && (
                  <div style={{ fontSize: 9, color: "#0EA5E9", marginTop: 3 }}>Antes: {form.etaAnterior}</div>
                )}
              </div>
              <div style={campoBox}>
                <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, marginTop: m ? 10 : 6 }}>
                  <input type="checkbox" checked={form.documentosCompletos} onChange={e => setCampo("documentosCompletos", e.target.checked)} style={{ width: 16, height: 16 }} />
                  Documentos completos
                </div>
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Cut Offs</div>
            <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 14 }}>
              <div style={campoBox}><div style={lbl}>SI Cut Off — fecha</div><input type="date" style={inp} value={form.siCutoffFecha} onChange={e => setCampo("siCutoffFecha", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>SI Cut Off — hora</div><input type="time" style={inp} value={form.siCutoffHora} onChange={e => setCampo("siCutoffHora", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>CY Cut Off — fecha</div><input type="date" style={inp} value={form.cyCutoffFecha} onChange={e => setCampo("cyCutoffFecha", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>CY Cut Off — hora</div><input type="time" style={inp} value={form.cyCutoffHora} onChange={e => setCampo("cyCutoffHora", e.target.value)} /></div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Gestión de contenedores</div>
            <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 14 }}>
              <div style={campoBox}><div style={lbl}>Estado del contenedor</div>
                <CustomSelect value={form.estadoContenedor} onChange={e => setCampo("estadoContenedor", e.target.value)} style={inp}>
                  {ESTADOS_CONTENEDOR.map(x => <option key={x} value={x}>{x}</option>)}
                </CustomSelect>
              </div>
              {campoDiasLibres === "ingreso_puerto" && (
                <div style={campoBox}><div style={lbl}>Fecha de ingreso al puerto</div><input type="date" style={inp} value={form.fechaIngresoPuerto} onChange={e => setCampo("fechaIngresoPuerto", e.target.value)} /></div>
              )}
              {campoDiasLibres === "asignacion" && (
                <div style={campoBox}><div style={lbl}>Fecha de asignación</div><input type="date" style={inp} value={form.fechaAsignacion} onChange={e => setCampo("fechaAsignacion", e.target.value)} /></div>
              )}
              {!campoDiasLibres && form.naviera && (
                <div style={campoBox}><div style={lbl}>Días libres</div><div style={{ ...inp, display: "flex", alignItems: "center", color: "rgba(255,255,255,0.4)" }}>No configurado para {form.naviera}</div></div>
              )}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Línea de tiempo (hitos manuales)</div>
            <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 14 }}>
              <div style={campoBox}><div style={lbl}>Orden recibida</div><input type="date" style={inp} value={form.fechaOrdenRecibida} onChange={e => setCampo("fechaOrdenRecibida", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>Producción</div><input type="date" style={inp} value={form.fechaProduccion} onChange={e => setCampo("fechaProduccion", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>Packing terminado</div><input type="date" style={inp} value={form.fechaPackingTerminado} onChange={e => setCampo("fechaPackingTerminado", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>Zarpe</div><input type="date" style={inp} value={form.fechaZarpe} onChange={e => setCampo("fechaZarpe", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>Llegó a destino</div><input type="date" style={inp} value={form.fechaLlegadaDestino} onChange={e => setCampo("fechaLlegadaDestino", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>Entrega final</div><input type="date" style={inp} value={form.fechaEntregaFinal} onChange={e => setCampo("fechaEntregaFinal", e.target.value)} /></div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={lbl}>Observaciones</div>
              <textarea style={{ ...inp, minHeight: isLandscape ? 44 : (m ? 70 : 56), resize: "vertical", fontFamily: "inherit" }} value={form.obs} onChange={e => setCampo("obs", e.target.value)} placeholder="Notas sobre esta operación..." />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {editId && <button onClick={cancelarEdicion} style={btnSecundario}>Cancelar</button>}
              <button onClick={guardar} disabled={guardando} style={btnPrimario(guardadoOk, guardando)}>
                {guardadoOk ? "✓ Guardado" : guardando ? "Guardando..." : editId ? "Guardar cambios" : "Guardar booking"}
              </button>
            </div>
          </div>

          <div style={cardS}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>📋 Bookings registrados</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar booking, contenedor, naviera..." style={{ ...inp, flex: 1, minWidth: 160 }} />
              <CustomSelect value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...inp, width: m ? "100%" : 180 }}>
                <option value="">Todos los estados</option>
                {ESTADOS_BOOKING.map(x => <option key={x} value={x}>{x}</option>)}
              </CustomSelect>
            </div>
            {bookingsFiltrados.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>Sin bookings registrados todavía.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
                      <th style={{ padding: "6px" }}>Booking</th><th style={{ padding: "6px" }}>Contenedor</th><th style={{ padding: "6px" }}>Estado</th>
                      <th style={{ padding: "6px" }}>Naviera</th><th style={{ padding: "6px" }}>Destino</th><th style={{ padding: "6px" }}>ETA</th><th style={{ padding: "6px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookingsFiltrados.map(b => (
                      <tr key={b.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "6px", color: "white", fontWeight: 600 }}>{b.numeroBooking || "—"}</td>
                        <td style={{ padding: "6px" }}>{b.numeroContenedor || "—"}</td>
                        <td style={{ padding: "6px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: `${COLOR_ESTADO_BOOKING[b.estado]}22`, color: COLOR_ESTADO_BOOKING[b.estado] }}>{b.estado}</span>
                        </td>
                        <td style={{ padding: "6px" }}>{b.naviera || "—"}</td>
                        <td style={{ padding: "6px" }}>{b.puertoDestino || "—"}</td>
                        <td style={{ padding: "6px" }}>{b.etaActual || "—"}</td>
                        <td style={{ padding: "6px", whiteSpace: "nowrap" }}>
                          <button onClick={() => editarBooking(b)} style={btnTablaEditar}>Editar</button>
                          <button onClick={() => log.eliminarBooking(b.id)} style={btnTablaEliminar}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ TAB 1 — CONTENEDORES ═══ */}
      {tabLog === 1 && (
        <div style={cardS}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 4 }}>🚢 Estado de contenedores</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>Solo operaciones activas (no Finalizado/Cancelado) con número de contenedor asignado.</div>
          {contenedoresActivos.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>Sin contenedores activos.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
                    <th style={{ padding: "6px" }}>Contenedor</th><th style={{ padding: "6px" }}>Naviera</th><th style={{ padding: "6px" }}>Estado</th>
                    <th style={{ padding: "6px" }}>Fecha relevante</th><th style={{ padding: "6px" }}>Días libres</th><th style={{ padding: "6px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {contenedoresActivos.map(b => {
                    const naviera = buscarNaviera(navierasCfg, b.naviera);
                    const campo = naviera?.diasLibresDesde;
                    const fechaRelevante = campo === "ingreso_puerto" ? b.fechaIngresoPuerto : campo === "asignacion" ? b.fechaAsignacion : "";
                    const restantes = diasLibresRestantes(b, navierasCfg);
                    return (
                      <tr key={b.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "6px", color: "white", fontWeight: 600 }}>{b.numeroContenedor}</td>
                        <td style={{ padding: "6px" }}>{b.naviera || "—"}</td>
                        <td style={{ padding: "6px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,0.08)", color: COLOR_ESTADO_CONTENEDOR[b.estadoContenedor] }}>{b.estadoContenedor}</span>
                        </td>
                        <td style={{ padding: "6px" }}>
                          {fechaRelevante || "—"}
                          {campo && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{campo === "ingreso_puerto" ? "ingreso a puerto" : "asignación"}</div>}
                        </td>
                        <td style={{ padding: "6px" }}>
                          {restantes == null ? "—" : (
                            <span style={{ fontWeight: 700, color: restantes < 0 ? "#FF6B6B" : restantes <= 3 ? "#F9A826" : "#00C9A7" }}>
                              {restantes < 0 ? `Vencido (${Math.abs(restantes)}d)` : `${restantes}d`}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "6px" }}><button onClick={() => editarBooking(b)} style={btnTablaEditar}>Editar</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB 2 — TRANSPORTE ═══ */}
      {tabLog === 2 && (
        <>
          <div style={cardS}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>{transEditId ? "✏️ Editar transporte" : "🚛 Nuevo registro de transporte"}</div>
            <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 12 }}>
              <div style={campoBox}><div style={lbl}>Booking / Contenedor</div>
                <CustomSelect value={transForm.bookingId} onChange={e => setCampoTrans("bookingId", e.target.value)} style={inp}>
                  <option value="">Seleccionar...</option>
                  {log.bookings.map(b => <option key={b.id} value={b.id}>{labelBooking(b)}</option>)}
                </CustomSelect>
              </div>
              <div style={campoBox}><div style={lbl}>Placa</div><input style={inp} value={transForm.placa} onChange={e => setCampoTrans("placa", e.target.value.toUpperCase())} placeholder="ABC123" /></div>
              <div style={campoBox}><div style={lbl}>Conductor</div><input style={inp} value={transForm.conductor} onChange={e => setCampoTrans("conductor", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>Transportadora</div>
                <CustomSelect value={transForm.transportadora} onChange={e => setCampoTrans("transportadora", e.target.value)} style={inp}>
                  <option value="">Seleccionar...</option>
                  {transportadorasCfg.map((t, i) => <option key={i} value={t}>{t}</option>)}
                </CustomSelect>
              </div>
              <div style={campoBox}><div style={lbl}>Trailer</div><input style={inp} value={transForm.trailer} onChange={e => setCampoTrans("trailer", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>Fecha de cargue</div><input type="date" style={inp} value={transForm.fechaCargue} onChange={e => setCampoTrans("fechaCargue", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>Fecha de descargue</div><input type="date" style={inp} value={transForm.fechaDescargue} onChange={e => setCampoTrans("fechaDescargue", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>Costo adicional</div><input type="number" style={inp} value={transForm.costoAdicional} onChange={e => setCampoTrans("costoAdicional", e.target.value)} placeholder="0" /></div>
              <div style={campoBox}>
                <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, marginTop: m ? 10 : 6 }}>
                  <input type="checkbox" checked={transForm.standBy} onChange={e => setCampoTrans("standBy", e.target.checked)} style={{ width: 16, height: 16 }} /> Generó Stand By
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={lbl}>Comentarios</div>
              <textarea style={{ ...inp, minHeight: isLandscape ? 44 : (m ? 70 : 56), resize: "vertical", fontFamily: "inherit" }} value={transForm.comentarios} onChange={e => setCampoTrans("comentarios", e.target.value)} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {transEditId && <button onClick={cancelarTrans} style={btnSecundario}>Cancelar</button>}
              <button onClick={guardarTrans} style={btnPrimario(false, false)}>{transEditId ? "Guardar cambios" : "Guardar registro"}</button>
            </div>
          </div>

          <div style={cardS}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>📋 Registros de transporte</div>
            {log.transporte.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>Sin registros todavía.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
                      <th style={{ padding: "6px" }}>Operación</th><th style={{ padding: "6px" }}>Placa</th><th style={{ padding: "6px" }}>Conductor</th>
                      <th style={{ padding: "6px" }}>Cargue</th><th style={{ padding: "6px" }}>Descargue</th><th style={{ padding: "6px" }}>Stand By</th><th style={{ padding: "6px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.transporte.map(t => (
                      <tr key={t.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "6px", color: "white" }}>{labelBooking(log.bookings.find(b => b.id === t.bookingId))}</td>
                        <td style={{ padding: "6px" }}>{t.placa || "—"}</td>
                        <td style={{ padding: "6px" }}>{t.conductor || "—"}</td>
                        <td style={{ padding: "6px" }}>{t.fechaCargue || "—"}</td>
                        <td style={{ padding: "6px" }}>{t.fechaDescargue || "—"}</td>
                        <td style={{ padding: "6px" }}>{t.standBy ? "Sí" : "No"}</td>
                        <td style={{ padding: "6px", whiteSpace: "nowrap" }}>
                          <button onClick={() => editarTransporte(t)} style={btnTablaEditar}>Editar</button>
                          <button onClick={() => log.eliminarTransporte(t.id)} style={btnTablaEliminar}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ TAB 3 — OPERACIÓN PORTUARIA ═══ */}
      {tabLog === 3 && (
        <>
          <div style={cardS}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>⚓ Novedades</div>
            <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 12 }}>
              <div style={campoBox}><div style={lbl}>Booking / Contenedor</div>
                <CustomSelect value={novForm.bookingId} onChange={e => setNovForm(f => ({ ...f, bookingId: e.target.value }))} style={inp}>
                  <option value="">Seleccionar...</option>
                  {log.bookings.map(b => <option key={b.id} value={b.id}>{labelBooking(b)}</option>)}
                </CustomSelect>
              </div>
              <div style={campoBox}><div style={lbl}>Fecha</div><input type="date" style={inp} value={novForm.fecha} onChange={e => setNovForm(f => ({ ...f, fecha: e.target.value }))} /></div>
              <div style={campoBox}><div style={lbl}>Responsable</div><input style={inp} value={novForm.responsable} onChange={e => setNovForm(f => ({ ...f, responsable: e.target.value }))} /></div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={lbl}>Descripción de la novedad</div>
              <textarea style={{ ...inp, minHeight: isLandscape ? 44 : (m ? 70 : 56), resize: "vertical", fontFamily: "inherit" }} value={novForm.descripcion} onChange={e => setNovForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="¿Qué ocurrió?" />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {novEditId && <button onClick={cancelarNov} style={btnSecundario}>Cancelar</button>}
              <button onClick={guardarNov} style={btnPrimario(false, false)}>{novEditId ? "Guardar cambios" : "Registrar novedad"}</button>
            </div>
            {log.novedades.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {log.novedades.map(n => (
                  <div key={n.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: 10, display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{n.fecha} — {labelBooking(log.bookings.find(b => b.id === n.bookingId))}{n.responsable ? ` — ${n.responsable}` : ""}</div>
                      <div style={{ fontSize: 12, color: "white", marginTop: 2 }}>{n.descripcion}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => editarNovedad(n)} style={btnTablaEditar}>Editar</button>
                      <button onClick={() => log.eliminarNovedad(n.id)} style={btnTablaEliminar}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={cardS}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>🔍 Inspecciones (PONAL / DIAN / ICA)</div>
            <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 12 }}>
              <div style={campoBox}><div style={lbl}>Booking / Contenedor</div>
                <CustomSelect value={inspForm.bookingId} onChange={e => setInspForm(f => ({ ...f, bookingId: e.target.value }))} style={inp}>
                  <option value="">Seleccionar...</option>
                  {log.bookings.map(b => <option key={b.id} value={b.id}>{labelBooking(b)}</option>)}
                </CustomSelect>
              </div>
              <div style={campoBox}><div style={lbl}>Fecha</div><input type="date" style={inp} value={inspForm.fecha} onChange={e => setInspForm(f => ({ ...f, fecha: e.target.value }))} /></div>
              <div style={campoBox}><div style={lbl}>Entidad</div>
                <CustomSelect value={inspForm.entidad} onChange={e => setInspForm(f => ({ ...f, entidad: e.target.value }))} style={inp}>
                  {ENTIDADES_INSPECCION.map(x => <option key={x} value={x}>{x}</option>)}
                </CustomSelect>
              </div>
              <div style={campoBox}><div style={lbl}>Resultado</div>
                <CustomSelect value={inspForm.resultado} onChange={e => setInspForm(f => ({ ...f, resultado: e.target.value }))} style={inp}>
                  {RESULTADOS_INSPECCION.map(x => <option key={x} value={x}>{x}</option>)}
                </CustomSelect>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={lbl}>Observaciones</div>
              <textarea style={{ ...inp, minHeight: isLandscape ? 44 : (m ? 70 : 56), resize: "vertical", fontFamily: "inherit" }} value={inspForm.observaciones} onChange={e => setInspForm(f => ({ ...f, observaciones: e.target.value }))} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {inspEditId && <button onClick={cancelarInsp} style={btnSecundario}>Cancelar</button>}
              <button onClick={guardarInsp} style={btnPrimario(false, false)}>{inspEditId ? "Guardar cambios" : "Registrar inspección"}</button>
            </div>
            {log.inspecciones.length > 0 && (
              <div style={{ overflowX: "auto", marginTop: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
                      <th style={{ padding: "6px" }}>Operación</th><th style={{ padding: "6px" }}>Fecha</th><th style={{ padding: "6px" }}>Entidad</th><th style={{ padding: "6px" }}>Resultado</th><th style={{ padding: "6px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.inspecciones.map(i => (
                      <tr key={i.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "6px", color: "white" }}>{labelBooking(log.bookings.find(b => b.id === i.bookingId))}</td>
                        <td style={{ padding: "6px" }}>{i.fecha}</td>
                        <td style={{ padding: "6px" }}>{i.entidad}</td>
                        <td style={{ padding: "6px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: i.resultado === "Libre" ? "rgba(0,201,167,0.15)" : "rgba(249,168,38,0.15)", color: i.resultado === "Libre" ? "#00C9A7" : "#F9A826" }}>{i.resultado}</span>
                        </td>
                        <td style={{ padding: "6px", whiteSpace: "nowrap" }}>
                          <button onClick={() => editarInspeccion(i)} style={btnTablaEditar}>Editar</button>
                          <button onClick={() => log.eliminarInspeccion(i.id)} style={btnTablaEliminar}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ TAB 4 — SEGUIMIENTO ═══ */}
      {tabLog === 4 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {log.bookings.length === 0 ? (
            <div style={cardS}><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Sin operaciones registradas.</div></div>
          ) : log.bookings.map(b => {
            const hitos = calcularHitos(b, log.transporte);
            const completados = hitos.filter(h => h.completado).length;
            const abierto = seguimientoAbierto === b.id;
            return (
              <div key={b.id} style={cardS}>
                <div onClick={() => setSeguimientoAbierto(abierto ? null : b.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{labelBooking(b)}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{b.naviera || "Sin naviera"} · {b.estado}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: completados === 12 ? "#00C9A7" : "#F9A826" }}>{completados}/12</span>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>{abierto ? "▲" : "▼"}</span>
                  </div>
                </div>
                {abierto && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)", display: "grid", gridTemplateColumns: camposCols, gap: 10 }}>
                    {hitos.map((h, i) => (
                      <div key={i} style={{ ...campoBox, background: h.completado ? "rgba(0,201,167,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${h.completado ? "rgba(0,201,167,0.25)" : "rgba(255,255,255,0.06)"}`, borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 3 }}>{i + 1}. {h.label}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: h.completado ? "#00C9A7" : "rgba(255,255,255,0.35)" }}>{h.fecha || "Pendiente"}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ TAB 5 — ALERTAS ═══ */}
      {tabLog === 5 && (
        <div style={cardS}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>🔔 Alertas activas</div>
          {alertas.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>Sin alertas activas por ahora.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {alertas.map((a, i) => (
                <div key={i} style={{ background: `${a.color}12`, border: `1px solid ${a.color}30`, borderRadius: 10, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ fontSize: 18 }}>{a.icon}</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: a.color }}>{a.titulo}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{a.detalle}</div>
                    </div>
                  </div>
                  {a.accion === "marcarEtaVista" && (
                    <button onClick={() => log.marcarEtaVista(a.bookingId)} style={{ ...btnSecundario, flexShrink: 0 }}>Marcar visto</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
