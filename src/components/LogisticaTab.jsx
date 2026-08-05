import { useState, useEffect, useMemo } from "react";
import CustomSelect from "./CustomSelect.jsx";
import LimonLoader from "./LimonLoader.jsx";
import { btnSecundario, btnPrimario, btnTablaEditar, btnTablaEliminar } from "./buttonStyles.js";
import { useConfiguracion } from "../hooks/useConfiguracion.js";
import { fechaLocalISO } from "../utils/dates.js";
import {
  calcularHitos, calcularAlertasLogistica, diasLibresRestantes, buscarNaviera, diferenciaDias,
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

// Paleta categórica validada (orden fijo — dataviz skill, pasos "dark" contra
// superficie oscura). No reordenar: el orden es lo que garantiza que colores
// adyacentes se distingan también para daltonismo.
const PALETA_CATEGORICA = ["#3987e5", "#008300", "#d55181", "#c98500", "#199e70", "#d95926", "#9085e9", "#e66767"];

const ALERTA_TIPO_META = {
  si_cutoff:          { label: "SI Cut Off",           color: "#F9A826" },
  cy_cutoff:           { label: "CY Cut Off",           color: "#F9A826" },
  documentacion:       { label: "Documentación",        color: "#F9A826" },
  roll_over:           { label: "Roll Over",             color: "#845EF7" },
  sin_ingreso_puerto:  { label: "Sin ingreso a puerto",  color: "#FF6B6B" },
  eta_cambio:          { label: "Cambio de ETA",         color: "#0EA5E9" },
  dias_libres:         { label: "Días libres",           color: "#FF6B6B" },
  contrato_vencimiento: { label: "Contrato",             color: "#F9A826" },
};

function BarraLista({ items }) {
  const max = Math.max(1, ...items.map(it => it.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((it, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: "rgba(255,255,255,0.75)" }}>{it.label}</span>
            <span style={{ color: it.color, fontWeight: 700 }}>{it.value}</span>
          </div>
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 8, overflow: "hidden" }}>
            <div style={{ width: `${(it.value / max) * 100}%`, height: "100%", background: it.color, borderRadius: 4, transition: "width 0.3s" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function hoyISO() { return fechaLocalISO(); }

function bookingVacio() {
  return {
    numeroBooking: "", numeroContenedor: "", estado: "Pendiente",
    puertoOrigen: "", puertoDestino: "", naviera: "",
    consignee: "", numeroCajas: "",
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
function contratoVacio() {
  return { naviera: "", numeroContrato: "", fechaInicio: "", fechaFin: "", destinosTexto: "", obs: "" };
}

function labelBooking(b) {
  if (!b) return "—";
  const partes = [b.numeroBooking, b.numeroContenedor].filter(Boolean);
  return partes.length ? partes.join(" / ") : `#${b.id}`;
}

export default function LogisticaTab({ mob, logistica }) {
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

  const log = logistica;
  const { config } = useConfiguracion();
  const navierasCfg       = config.cfg_exportacion?.navieras       || [];
  const puertosCfg        = config.cfg_exportacion?.puertos        || [];
  const puertosOrigenCfg  = config.cfg_exportacion?.puertosOrigen  || [];
  const transportadorasCfg = config.cfg_exportacion?.transportadoras || [];
  const consigneesCfg      = config.cfg_exportacion?.consignees      || [];

  const [tabLog, setTabLog] = useState(0);
  const TAB_LOG = ["📋 Operaciones", "🔔 Alertas", "📊 Estadísticas", "📄 Contratos"];

  const alertas = useMemo(
    () => calcularAlertasLogistica(log.bookings, log.transporte, navierasCfg, log.contratos),
    [log.bookings, log.transporte, navierasCfg, log.contratos]
  );

  const estadisticas = useMemo(() => {
    const bookings = log.bookings;

    const porEstado = ESTADOS_BOOKING.map(e => ({
      label: e, value: bookings.filter(b => b.estado === e).length, color: COLOR_ESTADO_BOOKING[e],
    }));

    const porEstadoContenedor = ESTADOS_CONTENEDOR.map(e => ({
      label: e, value: bookings.filter(b => b.numeroContenedor && b.estadoContenedor === e).length, color: COLOR_ESTADO_CONTENEDOR[e],
    }));

    // Color por naviera asignado en orden alfabético estable (identidad fija),
    // luego se ordena por cantidad solo para la presentación.
    const navierasCount = {};
    bookings.forEach(b => { if (b.naviera) navierasCount[b.naviera] = (navierasCount[b.naviera] || 0) + 1; });
    const porNaviera = Object.keys(navierasCount).sort()
      .map((n, i) => ({ label: n, value: navierasCount[n], color: PALETA_CATEGORICA[i % PALETA_CATEGORICA.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const porResultadoInspeccion = RESULTADOS_INSPECCION.map(r => ({
      label: r, value: log.inspecciones.filter(i => i.resultado === r).length,
      color: r === "Libre" ? "#00C9A7" : r === "Física" ? "#FF6B6B" : "#F9A826",
    }));

    const alertasPorTipo = {};
    alertas.forEach(a => { alertasPorTipo[a.tipo] = (alertasPorTipo[a.tipo] || 0) + 1; });
    const porAlerta = Object.entries(alertasPorTipo)
      .map(([tipo, value]) => ({ label: ALERTA_TIPO_META[tipo]?.label || tipo, value, color: ALERTA_TIPO_META[tipo]?.color || "rgba(255,255,255,0.4)" }))
      .sort((a, b) => b.value - a.value);

    const tiemposPuerto = bookings
      .filter(b => b.fechaIngresoPuerto && b.fechaZarpe)
      .map(b => diferenciaDias(b.fechaIngresoPuerto, b.fechaZarpe))
      .filter(d => d != null && d >= 0);
    const promedioDiasPuerto = tiemposPuerto.length
      ? Math.round((tiemposPuerto.reduce((a, b) => a + b, 0) / tiemposPuerto.length) * 10) / 10
      : null;

    const pctDocsCompletos = bookings.length
      ? Math.round(100 * bookings.filter(b => b.documentosCompletos).length / bookings.length)
      : 0;

    // Tendencia: operaciones creadas por mes, últimos 6 meses
    const hoy = new Date();
    const porMes = Array.from({ length: 6 }, (_, idx) => {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - (5 - idx), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("es-CO", { month: "short" }).replace(".", "");
      return { key, label, value: bookings.filter(b => (b.createdAt || "").slice(0, 7) === key).length };
    });

    return { porEstado, porEstadoContenedor, porNaviera, porResultadoInspeccion, porAlerta, promedioDiasPuerto, pctDocsCompletos, porMes };
  }, [log.bookings, log.inspecciones, alertas]);

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

  // ══════════════ OPERACIONES (Booking + Contenedores + Transporte + Portuaria + Seguimiento, todo por operación) ══════════════
  const [form, setForm]           = useState(bookingVacio);
  const [editId, setEditId]       = useState(null);
  const [operacionSel, setOperacionSel] = useState(null); // null = lista | "new" | id de un booking existente
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState("");
  const [busqueda, setBusqueda]   = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const setCampo = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  // Al cambiar de operación hay que soltar cualquier edición de transporte/
  // novedad/inspección en curso — si no, un "Guardar" posterior reasignaría
  // ese registro a la operación recién abierta en vez de crear uno nuevo.
  const soltarEdicionesHijas = () => {
    cancelarTrans();
    cancelarNov();
    cancelarInsp();
  };

  const nuevaOperacion = () => {
    soltarEdicionesHijas();
    setForm(bookingVacio());
    setEditId(null);
    setOperacionSel("new");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const abrirOperacion = (b) => {
    soltarEdicionesHijas();
    setForm({ ...bookingVacio(), ...b });
    setEditId(b.id);
    setOperacionSel(b.id);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const volverALista = () => {
    soltarEdicionesHijas();
    setForm(bookingVacio());
    setEditId(null);
    setOperacionSel(null);
  };

  const guardar = async () => {
    setErrorGuardado("");
    if (!form.numeroBooking && !form.numeroContenedor) {
      setErrorGuardado("Falta el número de booking o el número de contenedor.");
      return;
    }
    setGuardando(true);
    const eraNueva = !editId;
    const previo = editId ? log.bookings.find(b => b.id === editId) : null;
    const rollOverContenedor = !!(previo && previo.numeroContenedor && form.numeroContenedor && form.numeroContenedor !== previo.numeroContenedor);
    const ok = await log.guardarBooking(form, editId);
    setGuardando(false);
    if (ok) {
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2000);
      // Si era una operación nueva volvemos a la lista; si era una edición nos
      // quedamos en el detalle para seguir agregando transporte/novedades.
      if (eraNueva) volverALista();
      // Reasignaron el número de contenedor (Roll Over): guardarBooking ya limpió
      // esos campos en la base de datos, pero el formulario abierto sigue mostrando
      // lo que se acaba de escribir — hay que reflejar el reseteo aquí también.
      else if (rollOverContenedor) {
        setForm(f => ({ ...f, estadoContenedor: "Vacío", fechaIngresoPuerto: "", fechaAsignacion: "" }));
      }
    } else {
      setErrorGuardado("No se pudo guardar la operación. Revisa tu conexión e intenta de nuevo.");
    }
  };

  const navieraSel = buscarNaviera(navierasCfg, form.naviera);
  const campoDiasLibres = navieraSel?.diasLibresDesde;

  // Agrupado una sola vez: calcularHitos(booking, transporteDeEseBooking) evita
  // que cada fila de la lista re-escanee TODO el transporte de la empresa.
  const transportePorBooking = useMemo(() => {
    const mapa = {};
    log.transporte.forEach(t => { (mapa[t.bookingId] ||= []).push(t); });
    return mapa;
  }, [log.transporte]);

  const bookingsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return log.bookings.filter(b => {
      if (filtroEstado && b.estado !== filtroEstado) return false;
      if (!q) return true;
      return [b.numeroBooking, b.numeroContenedor, b.naviera, b.puertoOrigen, b.puertoDestino]
        .some(v => (v || "").toLowerCase().includes(q));
    });
  }, [log.bookings, busqueda, filtroEstado]);

  // ══════════════ TRANSPORTE (scoped a la operación abierta) ══════════════
  const [transForm, setTransForm]   = useState(transporteVacio);
  const [transEditId, setTransEditId] = useState(null);
  const setCampoTrans = (campo, valor) => setTransForm(f => ({ ...f, [campo]: valor }));
  const cancelarTrans = () => { setTransForm(transporteVacio()); setTransEditId(null); };
  const editarTransporte = (t) => { setTransForm({ ...transporteVacio(), ...t }); setTransEditId(t.id); };
  const guardarTrans = async () => {
    if (!editId) return;
    const ok = await log.guardarTransporte({ ...transForm, bookingId: editId }, transEditId);
    if (ok) cancelarTrans();
  };
  const transporteDeOperacion = useMemo(
    () => log.transporte.filter(t => t.bookingId === editId),
    [log.transporte, editId]
  );

  // ══════════════ OPERACIÓN PORTUARIA (scoped a la operación abierta) ══════════════
  const [novForm, setNovForm]   = useState(novedadVacia);
  const [novEditId, setNovEditId] = useState(null);
  const cancelarNov = () => { setNovForm(novedadVacia()); setNovEditId(null); };
  const editarNovedad = (n) => { setNovForm({ ...novedadVacia(), ...n }); setNovEditId(n.id); };
  const guardarNov = async () => {
    if (!editId || !novForm.descripcion) return;
    const ok = await log.guardarNovedad({ ...novForm, bookingId: editId }, novEditId);
    if (ok) cancelarNov();
  };
  const novedadesDeOperacion = useMemo(
    () => log.novedades.filter(n => n.bookingId === editId),
    [log.novedades, editId]
  );

  const [inspForm, setInspForm]   = useState(inspeccionVacia);
  const [inspEditId, setInspEditId] = useState(null);
  const cancelarInsp = () => { setInspForm(inspeccionVacia()); setInspEditId(null); };
  const editarInspeccion = (i) => { setInspForm({ ...inspeccionVacia(), ...i }); setInspEditId(i.id); };
  const guardarInsp = async () => {
    if (!editId) return;
    const ok = await log.guardarInspeccion({ ...inspForm, bookingId: editId }, inspEditId);
    if (ok) cancelarInsp();
  };
  const inspeccionesDeOperacion = useMemo(
    () => log.inspecciones.filter(i => i.bookingId === editId),
    [log.inspecciones, editId]
  );

  // ══════════════ CONTRATOS CON NAVIERAS ══════════════
  const [contratoForm, setContratoForm] = useState(contratoVacio);
  const [contratoEditId, setContratoEditId] = useState(null);
  const cancelarContrato = () => { setContratoForm(contratoVacio()); setContratoEditId(null); };
  const editarContrato = (c) => {
    setContratoForm({ ...contratoVacio(), ...c, destinosTexto: (c.destinos || []).join("\n") });
    setContratoEditId(c.id);
  };
  const guardarContrato = async () => {
    if (!contratoForm.naviera || !contratoForm.fechaFin) return;
    const destinos = contratoForm.destinosTexto.split(/[\n,]/).map(d => d.trim()).filter(Boolean);
    const ok = await log.guardarContrato({ ...contratoForm, destinos }, contratoEditId);
    if (ok) cancelarContrato();
  };

  // Si la operación abierta desaparece de log.bookings (se eliminó desde otra
  // pestaña/usuario, o localmente) hay que salir del detalle — si no, "Guardar"
  // quedaría como un UPDATE silencioso sobre 0 filas que igual muestra "✓ Guardado".
  useEffect(() => {
    if (!editId) return;
    if (!log.bookings.some(b => b.id === editId)) volverALista();
  }, [log.bookings, editId]);

  if (log.loading) return <LimonLoader texto="Cargando logística" />;

  const bookingActual = editId ? log.bookings.find(b => b.id === editId) : null;
  const hitosActual = bookingActual ? calcularHitos(bookingActual, transportePorBooking[bookingActual.id] || []) : [];

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

      {/* ═══ TAB 0 — OPERACIONES ═══ */}
      {tabLog === 0 && (
        <>
          {operacionSel === null ? (
            /* ── Lista maestra ── */
            <div style={cardS}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>📋 Operaciones</div>
                <button onClick={nuevaOperacion} style={btnPrimario(false, false)}>➕ Nueva operación</button>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar booking, contenedor, naviera..." style={{ ...inp, flex: 1, minWidth: 160 }} />
                <CustomSelect value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...inp, width: m ? "100%" : 180 }}>
                  <option value="">Todos los estados</option>
                  {ESTADOS_BOOKING.map(x => <option key={x} value={x}>{x}</option>)}
                </CustomSelect>
              </div>
              {bookingsFiltrados.length === 0 ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>Sin operaciones registradas todavía.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
                        <th style={{ padding: "6px" }}>Booking</th><th style={{ padding: "6px" }}>Contenedor</th><th style={{ padding: "6px" }}>Estado</th>
                        <th style={{ padding: "6px" }}>Naviera</th><th style={{ padding: "6px" }}>Estado contenedor</th>
                        <th style={{ padding: "6px" }}>Días libres</th><th style={{ padding: "6px" }}>Hitos</th><th style={{ padding: "6px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookingsFiltrados.map(b => {
                        const restantes = diasLibresRestantes(b, navierasCfg);
                        const completados = calcularHitos(b, transportePorBooking[b.id] || []).filter(h => h.completado).length;
                        return (
                          <tr key={b.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }} onClick={() => abrirOperacion(b)}>
                            <td style={{ padding: "6px", color: "white", fontWeight: 600 }}>{b.numeroBooking || "—"}</td>
                            <td style={{ padding: "6px" }}>{b.numeroContenedor || "—"}</td>
                            <td style={{ padding: "6px" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: `${COLOR_ESTADO_BOOKING[b.estado]}22`, color: COLOR_ESTADO_BOOKING[b.estado] }}>{b.estado}</span>
                            </td>
                            <td style={{ padding: "6px" }}>{b.naviera || "—"}</td>
                            <td style={{ padding: "6px" }}>
                              {b.numeroContenedor
                                ? <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,0.08)", color: COLOR_ESTADO_CONTENEDOR[b.estadoContenedor] }}>{b.estadoContenedor}</span>
                                : "—"}
                            </td>
                            <td style={{ padding: "6px" }}>
                              {restantes == null ? "—" : (
                                <span style={{ fontWeight: 700, color: restantes < 0 ? "#FF6B6B" : restantes <= 3 ? "#F9A826" : "#00C9A7" }}>
                                  {restantes < 0 ? `Vencido (${Math.abs(restantes)}d)` : `${restantes}d`}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "6px" }}>
                              <span style={{ fontWeight: 700, color: completados === 12 ? "#00C9A7" : "rgba(255,255,255,0.6)" }}>{completados}/12</span>
                            </td>
                            <td style={{ padding: "6px", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => log.eliminarBooking(b.id)} style={btnTablaEliminar}>Eliminar</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* ── Detalle de la operación ── */
            <>
              <div style={cardS}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>
                    {editId ? `✏️ ${labelBooking(form)}` : "📋 Nueva operación"}
                  </div>
                  <button onClick={volverALista} style={btnSecundario}>← Volver a la lista</button>
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Datos del booking</div>
                <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 14 }}>
                  <div style={campoBox}><div style={lbl}>Número booking {!form.numeroBooking && !form.numeroContenedor && <span style={{ color: "#FF6B6B" }}>*</span>}</div><input style={inp} value={form.numeroBooking} onChange={e => setCampo("numeroBooking", e.target.value)} placeholder="Ej: BK-00123" /></div>
                  <div style={campoBox}><div style={lbl}>Número contenedor {!form.numeroBooking && !form.numeroContenedor && <span style={{ color: "#FF6B6B" }}>*</span>}</div><input style={inp} value={form.numeroContenedor} onChange={e => setCampo("numeroContenedor", e.target.value.toUpperCase())} placeholder="MSKU1234567" /></div>
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
                  <div style={campoBox}><div style={lbl}>Número de cajas</div><input type="number" style={inp} value={form.numeroCajas} onChange={e => setCampo("numeroCajas", e.target.value)} placeholder="0" /></div>
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Consignee</div>
                <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "1fr 2fr", gap: 10, marginBottom: 14 }}>
                  <div style={campoBox}>
                    <div style={lbl}>Predefinido</div>
                    <CustomSelect value="" onChange={e => { const c = consigneesCfg.find(x => String(x.id) === String(e.target.value)); if (c) setCampo("consignee", c.texto); }} style={inp}>
                      <option value="">Seleccionar y llenar abajo...</option>
                      {consigneesCfg.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </CustomSelect>
                  </div>
                  <div style={campoBox}>
                    <div style={lbl}>Datos completos</div>
                    <textarea style={{ ...inp, minHeight: isLandscape ? 60 : (m ? 90 : 72), resize: "vertical", fontFamily: "inherit" }} value={form.consignee} onChange={e => setCampo("consignee", e.target.value)} placeholder="Nombre, Tax ID, dirección, teléfono..." />
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
                  <div style={campoBox}>
                    <div style={lbl}>Fecha de asignación</div>
                    <input type="date" style={inp} value={form.fechaAsignacion} onChange={e => setCampo("fechaAsignacion", e.target.value)} />
                  </div>
                  <div style={campoBox}>
                    <div style={lbl}>Fecha de ingreso al puerto</div>
                    <input type="date" style={inp} value={form.fechaIngresoPuerto} onChange={e => setCampo("fechaIngresoPuerto", e.target.value)} />
                  </div>
                  {!campoDiasLibres && form.naviera && (
                    <div style={campoBox}><div style={lbl}>Días libres</div><div style={{ ...inp, display: "flex", alignItems: "center", color: "rgba(255,255,255,0.4)" }}>No configurado para {form.naviera}</div></div>
                  )}
                </div>
                {campoDiasLibres && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: -6, marginBottom: 14 }}>
                    "{campoDiasLibres === "asignacion" ? "Fecha de asignación" : "Fecha de ingreso al puerto"}" se usa para calcular los días libres de {form.naviera}.
                  </div>
                )}

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

                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  {errorGuardado && (
                    <span style={{ color: "#FF6B6B", fontSize: 12, marginRight: "auto" }}>{errorGuardado}</span>
                  )}
                  <button onClick={guardar} disabled={guardando} style={btnPrimario(guardadoOk, guardando)}>
                    {guardadoOk ? "✓ Guardado" : guardando ? "Guardando..." : editId ? "Guardar cambios" : "Guardar booking"}
                  </button>
                </div>
              </div>

              {!editId ? (
                <div style={{ ...cardS, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                  Guarda el booking primero para poder agregar transporte, novedades, inspecciones y ver la línea de tiempo.
                </div>
              ) : (
                <>
                  {/* Seguimiento (resumen de hitos de esta operación) */}
                  <div style={cardS}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>🕒 Seguimiento</div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: hitosActual.filter(h => h.completado).length === 12 ? "#00C9A7" : "#F9A826" }}>
                        {hitosActual.filter(h => h.completado).length}/12
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10 }}>
                      {hitosActual.map((h, i) => (
                        <div key={i} style={{ ...campoBox, background: h.completado ? "rgba(0,201,167,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${h.completado ? "rgba(0,201,167,0.25)" : "rgba(255,255,255,0.06)"}`, borderRadius: 8, padding: 10 }}>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 3 }}>{i + 1}. {h.label}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: h.completado ? "#00C9A7" : "rgba(255,255,255,0.35)" }}>{h.fecha || "Pendiente"}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Transporte terrestre */}
                  <div style={cardS}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>{transEditId ? "✏️ Editar transporte" : "🚛 Nuevo registro de transporte"}</div>
                    <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 12 }}>
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
                        <div style={lbl}>&nbsp;</div>
                        <div style={{ ...inp, display: "flex", alignItems: "center", gap: 6 }}>
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
                    {transporteDeOperacion.length > 0 && (
                      <div style={{ overflowX: "auto", marginTop: 14 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
                              <th style={{ padding: "6px" }}>Placa</th><th style={{ padding: "6px" }}>Conductor</th>
                              <th style={{ padding: "6px" }}>Cargue</th><th style={{ padding: "6px" }}>Descargue</th><th style={{ padding: "6px" }}>Stand By</th><th style={{ padding: "6px" }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {transporteDeOperacion.map(t => (
                              <tr key={t.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
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

                  {/* Operación Portuaria: Novedades */}
                  <div style={cardS}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>⚓ Novedades</div>
                    <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 12 }}>
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
                    {novedadesDeOperacion.length > 0 && (
                      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                        {novedadesDeOperacion.map(n => (
                          <div key={n.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: 10, display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{n.fecha}{n.responsable ? ` — ${n.responsable}` : ""}</div>
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

                  {/* Operación Portuaria: Inspecciones */}
                  <div style={cardS}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>🔍 Inspecciones (PONAL / DIAN / ICA)</div>
                    <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 12 }}>
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
                    {inspeccionesDeOperacion.length > 0 && (
                      <div style={{ overflowX: "auto", marginTop: 14 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
                              <th style={{ padding: "6px" }}>Fecha</th><th style={{ padding: "6px" }}>Entidad</th><th style={{ padding: "6px" }}>Resultado</th><th style={{ padding: "6px" }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {inspeccionesDeOperacion.map(i => (
                              <tr key={i.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
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
            </>
          )}
        </>
      )}

      {/* ═══ TAB 1 — ALERTAS ═══ */}
      {tabLog === 1 && (
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

      {/* ═══ TAB 2 — ESTADÍSTICAS ═══ */}
      {tabLog === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
            {[
              { l: "Operaciones totales",    v: log.bookings.length, c: "#F97316", i: "📋" },
              { l: "Prom. días en puerto",   v: estadisticas.promedioDiasPuerto != null ? `${estadisticas.promedioDiasPuerto}d` : "—", c: "#0EA5E9", i: "⏱️" },
              { l: "Documentos completos",   v: `${estadisticas.pctDocsCompletos}%`, c: "#00C9A7", i: "📄" },
              { l: "Alertas activas",        v: alertas.length, c: alertas.length ? "#FF6B6B" : "#845EF7", i: "🔔" },
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

          <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "1fr 1fr", gap: 16 }}>
            <div style={cardS}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>📋 Bookings por estado</div>
              <BarraLista items={estadisticas.porEstado} />
            </div>
            <div style={cardS}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>🚢 Contenedores por estado</div>
              <BarraLista items={estadisticas.porEstadoContenedor} />
            </div>
            <div style={cardS}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>⚓ Operaciones por naviera</div>
              {estadisticas.porNaviera.length === 0
                ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Sin datos todavía.</div>
                : <BarraLista items={estadisticas.porNaviera} />}
            </div>
            <div style={cardS}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>🔍 Inspecciones por resultado</div>
              {log.inspecciones.length === 0
                ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Sin inspecciones registradas.</div>
                : <BarraLista items={estadisticas.porResultadoInspeccion} />}
            </div>
          </div>

          <div style={cardS}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>📈 Operaciones creadas por mes</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 110 }}>
              {estadisticas.porMes.map((mes, i) => {
                const max = Math.max(1, ...estadisticas.porMes.map(x => x.value));
                const barH = mes.value ? Math.max(6, (mes.value / max) * 90) : 2;
                const esActual = i === estadisticas.porMes.length - 1;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6, height: "100%" }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", minHeight: 14 }}>{mes.value || ""}</div>
                    <div style={{ width: "60%", height: barH, background: esActual ? "#F97316" : "rgba(249,115,22,0.35)", borderRadius: "4px 4px 0 0", transition: "height 0.3s" }} />
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "capitalize" }}>{mes.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {estadisticas.porAlerta.length > 0 && (
            <div style={cardS}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>🔔 Alertas activas por tipo</div>
              <BarraLista items={estadisticas.porAlerta} />
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB 3 — CONTRATOS CON NAVIERAS ═══ */}
      {tabLog === 3 && (
        <>
          <div style={cardS}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>
              {contratoEditId ? "✏️ Editar contrato" : "📄 Nuevo contrato"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 12 }}>
              <div style={campoBox}><div style={lbl}>Naviera</div>
                <CustomSelect value={contratoForm.naviera} onChange={e => setContratoForm(f => ({ ...f, naviera: e.target.value }))} style={inp}>
                  <option value="">Seleccionar...</option>
                  {navierasCfg.map(n => <option key={n.id} value={n.nombre}>{n.nombre}</option>)}
                </CustomSelect>
              </div>
              <div style={campoBox}><div style={lbl}>Número de contrato</div><input style={inp} value={contratoForm.numeroContrato} onChange={e => setContratoForm(f => ({ ...f, numeroContrato: e.target.value }))} placeholder="Ej: 10132273_2" /></div>
              <div style={campoBox}><div style={lbl}>Fecha de inicio</div><input type="date" style={inp} value={contratoForm.fechaInicio} onChange={e => setContratoForm(f => ({ ...f, fechaInicio: e.target.value }))} /></div>
              <div style={campoBox}><div style={lbl}>Fecha de finalización</div><input type="date" style={inp} value={contratoForm.fechaFin} onChange={e => setContratoForm(f => ({ ...f, fechaFin: e.target.value }))} /></div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={lbl}>Destinos contratados (uno por línea)</div>
              <textarea style={{ ...inp, minHeight: isLandscape ? 60 : (m ? 90 : 72), resize: "vertical", fontFamily: "inherit" }} value={contratoForm.destinosTexto} onChange={e => setContratoForm(f => ({ ...f, destinosTexto: e.target.value }))} placeholder={"Miami Fl\nSan Juan, PR\nPhiladelphia"} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={lbl}>Observaciones</div>
              <textarea style={{ ...inp, minHeight: isLandscape ? 44 : (m ? 70 : 56), resize: "vertical", fontFamily: "inherit" }} value={contratoForm.obs} onChange={e => setContratoForm(f => ({ ...f, obs: e.target.value }))} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {contratoEditId && <button onClick={cancelarContrato} style={btnSecundario}>Cancelar</button>}
              <button onClick={guardarContrato} style={btnPrimario(false, false)}>{contratoEditId ? "Guardar cambios" : "Guardar contrato"}</button>
            </div>
          </div>

          <div style={cardS}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>📋 Contratos registrados</div>
            {log.contratos.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>Sin contratos registrados todavía.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {log.contratos.map(c => {
                  const restantes = c.fechaFin ? diferenciaDias(hoyISO(), c.fechaFin) : null;
                  return (
                    <div key={c.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{c.naviera}{c.numeroContrato ? ` — ${c.numeroContrato}` : ""}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{c.fechaInicio || "—"} → {c.fechaFin || "—"}</div>
                          {c.destinos.length > 0 && (
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>Destinos: {c.destinos.join(", ")}</div>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          {restantes != null && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: restantes < 0 ? "#FF6B6B" : restantes <= 30 ? "#F9A826" : "#00C9A7" }}>
                              {restantes < 0 ? `Vencido (${Math.abs(restantes)}d)` : `${restantes}d restantes`}
                            </span>
                          )}
                          <button onClick={() => editarContrato(c)} style={btnTablaEditar}>Editar</button>
                          <button onClick={() => log.eliminarContrato(c.id)} style={btnTablaEliminar}>Eliminar</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
