import { useState, useEffect, useMemo } from "react";
import CustomSelect from "./CustomSelect.jsx";
import LimonLoader from "./LimonLoader.jsx";
import { btnSecundario, btnPrimario, btnTablaEditar, btnTablaEliminar } from "./buttonStyles.js";
import { useConfiguracion } from "../hooks/useConfiguracion.js";
import { fechaLocalISO } from "../utils/dates.js";
import {
  calcularHitos, calcularAlertasLogistica, diasLibresRestantes, buscarNaviera, diferenciaDias,
  rangoPeriodoOperativo, calcularEstadisticasPeriodo,
} from "../hooks/useLogistica.js";

const ESTADOS_BOOKING       = ["Pendiente", "Confirmado", "Cancelado", "Roll Over", "Finalizado"];
const PLANTAS = [
  "Planta Tierra Prometida", "Planta Chocoita", "Planta Jhon Blanco", "Planta Claudia",
  "Planta Ropero", "Planta Rocisan", "Planta Frulat", "Planta Gramaluz",
];
const ESTADOS_CONTENEDOR    = ["Posicionado", "Lleno", "Embarcado"];
const ENTIDADES_INSPECCION  = ["PONAL", "DIAN", "ICA"];
const RESULTADOS_INSPECCION = ["Física", "Documental", "Libre"];

const COLOR_ESTADO_BOOKING = {
  Pendiente: "#F9A826", Confirmado: "#00C9A7", Cancelado: "#FF6B6B", "Roll Over": "#845EF7", Finalizado: "#6366F1",
};
const COLOR_ESTADO_CONTENEDOR = {
  Posicionado: "#0EA5E9", Lleno: "#00C9A7", Embarcado: "#845EF7",
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

// Logo embebido como base64 — así el informe HTML descargado lo muestra
// aunque se abra después, sin servidor detrás.
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

const PERIODOS_INFORME = [
  { id: "semanal", label: "Semanal" },
  { id: "mensual", label: "Mensual" },
  { id: "anual",   label: "Anual" },
  { id: "personalizado", label: "Personalizado" },
];

// Rango [desde, hasta] (ISO) + etiqueta legible para el período elegido.
function rangoPeriodoInforme(tipo, fechaDesde, fechaHasta) {
  const hoy = new Date();
  if (tipo === "semanal") {
    const dow = hoy.getDay();
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - ((dow + 6) % 7));
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return { desde: fechaLocalISO(lunes), hasta: fechaLocalISO(domingo), label: `Semana del ${lunes.toLocaleDateString("es-CO")} al ${domingo.toLocaleDateString("es-CO")}` };
  }
  if (tipo === "mensual") {
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const fin    = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    return { desde: fechaLocalISO(inicio), hasta: fechaLocalISO(fin), label: inicio.toLocaleDateString("es-CO", { month: "long", year: "numeric" }) };
  }
  if (tipo === "anual") {
    const inicio = new Date(hoy.getFullYear(), 0, 1);
    const fin    = new Date(hoy.getFullYear(), 11, 31);
    return { desde: fechaLocalISO(inicio), hasta: fechaLocalISO(fin), label: `Año ${hoy.getFullYear()}` };
  }
  // Personalizado
  return {
    desde: fechaDesde || "0000-01-01",
    hasta: fechaHasta || "9999-12-31",
    label: fechaDesde && fechaHasta ? `${new Date(fechaDesde+"T00:00:00").toLocaleDateString("es-CO")} al ${new Date(fechaHasta+"T00:00:00").toLocaleDateString("es-CO")}` : "Todo el histórico",
  };
}

// ══════════════ GRÁFICAS EN SVG PURO (sin librerías) ══════════════
// Se usan tal cual tanto en el dashboard en vivo (embebidas con
// dangerouslySetInnerHTML) como en el informe descargable (interpoladas
// directamente en el HTML) — una sola implementación, un solo resultado
// visual en los dos lugares. Reciben colores explícitos porque el
// dashboard es oscuro y el informe es claro.
function escSvg(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function truncar(s, n) {
  const str = String(s ?? "");
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

// Donut de composición (2-4 categorías con color propio, no paleta cíclica)
// — pensado para "reservas llenadas / canceladas / en proceso".
function svgDonut(segmentos, { size = 150, holeColor, textColor, centerLabel = "", centerSub = "" } = {}) {
  const R = size / 2, r = R * 0.6, cx = R, cy = R;
  const total = segmentos.reduce((a, s) => a + s.value, 0);
  let acc = 0;
  const arcos = segmentos.filter(s => s.value > 0).map(s => {
    const f0 = total ? acc / total : 0;
    acc += s.value;
    const f1 = total ? acc / total : 0;
    if (f1 - f0 >= 0.9999) {
      // Un solo segmento con el 100% — un arco completo degenera (mismo
      // punto inicio/fin), así que se dibuja como círculo entero.
      return `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${s.color}" stroke-width="${R - r}"><title>${escSvg(s.label)}: ${s.value} (100%)</title></circle>`;
    }
    const a0 = f0 * 2 * Math.PI - Math.PI / 2, a1 = f1 * 2 * Math.PI - Math.PI / 2;
    const x0o = cx + R * Math.cos(a0), y0o = cy + R * Math.sin(a0);
    const x1o = cx + R * Math.cos(a1), y1o = cy + R * Math.sin(a1);
    const x0i = cx + r * Math.cos(a1), y0i = cy + r * Math.sin(a1);
    const x1i = cx + r * Math.cos(a0), y1i = cy + r * Math.sin(a0);
    const large = (f1 - f0) > 0.5 ? 1 : 0;
    const pct = total ? Math.round(((f1 - f0)) * 1000) / 10 : 0;
    const d = `M ${x0o} ${y0o} A ${R} ${R} 0 ${large} 1 ${x1o} ${y1o} L ${x0i} ${y0i} A ${r} ${r} 0 ${large} 0 ${x1i} ${y1i} Z`;
    return `<path d="${d}" fill="${s.color}" stroke="${holeColor}" stroke-width="1.5"><title>${escSvg(s.label)}: ${s.value} (${pct}%)</title></path>`;
  }).join("");
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    ${arcos}
    <circle cx="${cx}" cy="${cy}" r="${r - 2}" fill="${holeColor}" />
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="${Math.round(size * 0.19)}" font-weight="800" fill="${textColor}" font-family="Arial,sans-serif">${escSvg(centerLabel)}</text>
    <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="${Math.round(size * 0.075)}" fill="${textColor}" opacity="0.55" font-family="Arial,sans-serif">${escSvg(centerSub)}</text>
  </svg>`;
}

// Barras horizontales con pista de referencia (eje al 100% del máximo) —
// para los rankings de puertos/destinos/navieras/transportadores.
function svgBarrasH(datos, { width = 360, barH = 20, gap = 9, color, textColor, trackColor } = {}) {
  if (!datos.length) return "";
  const max = Math.max(1, ...datos.map(d => d.value));
  const labelW = 118, valW = 76;
  const areaW = Math.max(40, width - labelW - valW);
  const height = datos.length * (barH + gap) - gap;
  const filas = datos.map((d, i) => {
    const y = i * (barH + gap);
    const w = max ? Math.max((d.value / max) * areaW, d.value > 0 ? 3 : 0) : 0;
    const c = d.color || color;
    return `<g>
      <text x="0" y="${y + barH / 2 + 4}" font-size="11" fill="${textColor}" font-family="Arial,sans-serif">${escSvg(truncar(d.label, 17))}</text>
      <rect x="${labelW}" y="${y}" width="${areaW}" height="${barH}" rx="4" fill="${trackColor}" />
      <rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="4" fill="${c}"><title>${escSvg(d.label)}: ${d.value}${d.pct != null ? ` (${d.pct}%)` : ""}</title></rect>
      <text x="${labelW + areaW + 8}" y="${y + barH / 2 + 4}" font-size="11" font-weight="700" fill="${textColor}" font-family="Arial,sans-serif">${d.value}${d.pct != null ? ` (${d.pct}%)` : ""}</text>
    </g>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}">${filas}</svg>`;
}

// Línea + área para la evolución mensual de inspecciones, con grilla,
// puntos con tooltip nativo (title) y etiquetas de mes.
function svgLinea(puntos, { width = 480, height = 150, color, textColor, gridColor } = {}) {
  const padL = 26, padB = 20, padT = 10, padR = 10;
  const w = Math.max(10, width - padL - padR), h = Math.max(10, height - padT - padB);
  const n = puntos.length;
  const max = Math.max(1, ...puntos.map(p => p.cantidad));
  const x = (i) => padL + (n > 1 ? (i / (n - 1)) * w : w / 2);
  const y = (v) => padT + h - (v / max) * h;
  const linePath = puntos.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.cantidad).toFixed(1)}`).join(" ");
  const areaPath = n ? `${linePath} L ${x(n - 1).toFixed(1)} ${(padT + h).toFixed(1)} L ${x(0).toFixed(1)} ${(padT + h).toFixed(1)} Z` : "";
  const grid = [0, 0.5, 1].map(f => {
    const gy = padT + h - f * h;
    return `<line x1="${padL}" y1="${gy}" x2="${padL + w}" y2="${gy}" stroke="${gridColor}" stroke-width="1"/>
      <text x="${padL - 5}" y="${gy + 3}" font-size="8.5" fill="${textColor}" opacity="0.5" text-anchor="end" font-family="Arial,sans-serif">${Math.round(f * max)}</text>`;
  }).join("");
  const puntosSvg = puntos.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.cantidad).toFixed(1)}" r="3.5" fill="${color}"><title>${escSvg(p.label)}: ${p.cantidad}</title></circle>`).join("");
  const labelsX = puntos.map((p, i) => `<text x="${x(i).toFixed(1)}" y="${height - 4}" font-size="9" fill="${textColor}" opacity="0.6" text-anchor="middle" font-family="Arial,sans-serif" style="text-transform:capitalize">${escSvg(p.label)}</text>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
    ${grid}
    ${n ? `<path d="${areaPath}" fill="${color}" opacity="0.14"/><path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
    ${puntosSvg}
    ${labelsX}
  </svg>`;
}

function BarraLista({ items }) {
  const max = Math.max(1, ...items.map(it => it.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((it, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: "rgba(255,255,255,0.75)" }}>{it.label}</span>
            <span style={{ color: it.color, fontWeight: 700 }}>{it.display ?? it.value}</span>
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
    numeroBooking: "", numeroContenedor: "", numeroExportacion: "", numeroProforma: "", estado: "Pendiente",
    planta: "",
    puertoOrigen: "", puertoDestino: "", naviera: "", motonave: "",
    consignee: "", numeroCajas: "",
    siCutoffFecha: "", siCutoffHora: "", cyCutoffFecha: "", cyCutoffHora: "",
    documentosCompletos: false, etaActual: "",
    estadoContenedor: "Posicionado", fechaIngresoPuerto: "", fechaAsignacion: "",
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

// Valores del molde "Costo contenedor.xlsx" — sólo de respaldo, mientras
// Configuración → Costo Venta no se haya guardado todavía (ver cfg_costo_venta).
const TIPOS_CAJA_FALLBACK = [
  { tipo: "Princesa",  precio: 6113 },
  { tipo: "Del Monte", precio: 7112 },
];
const MARGEN_DEFECTO           = 1.5;
const COSTO_TRANSPORTE_DEFECTO = 6000000;
const COSTO_PUERTO_DEFECTO     = 6500000;
const COSTO_AGENCIA_DEFECTO    = 1300000;

// cfg = config.cfg_costo_venta (Configuración → Costo Venta) — todo editable
// ahí; esto sólo precarga un costeo nuevo, cada contenedor lo puede cambiar.
function costoVentaVacio(cfg = {}) {
  return {
    tmr: "", kilos: "", precioKg: "", tipoCaja: "", precioCaja: "",
    costoTransporte: cfg.costoTransporte ?? COSTO_TRANSPORTE_DEFECTO,
    costoPuerto:     cfg.costoPuerto     ?? COSTO_PUERTO_DEFECTO,
    costoAgencia:    cfg.costoAgencia    ?? COSTO_AGENCIA_DEFECTO,
    margen:          cfg.margen          ?? MARGEN_DEFECTO,
    obs: "",
  };
}

// Réplica de las fórmulas del molde "Costo contenedor.xlsx":
// costoFruta = kilos × precioKg · costoCajas = precioCaja × cajas
// costoTotal = suma de los 5 costos · CU = costoTotal / cajas / TRM (USD/caja)
// PV = CU × (1 + margen%) · PV total = PV × cajas · venta COP = PV total × TRM
// ganancia = venta COP − costoTotal
function calcularCostoVenta(cajas, form) {
  const tmr         = Number(form?.tmr) || 0;
  const costoFruta  = (Number(form?.kilos) || 0) * (Number(form?.precioKg) || 0);
  const costoCajas  = (Number(form?.precioCaja) || 0) * cajas;
  const costoTotal  = costoFruta + costoCajas
    + (Number(form?.costoTransporte) || 0) + (Number(form?.costoPuerto) || 0) + (Number(form?.costoAgencia) || 0);
  const cu          = cajas > 0 && tmr > 0 ? (costoTotal / cajas) / tmr : 0;
  const margen      = Number(form?.margen) || 0;
  const pv           = Math.round(cu * (1 + margen / 100) * 10) / 10;
  const pvTotal      = pv * cajas;
  const ventaCop     = pvTotal * tmr;
  const ganancia     = ventaCop - costoTotal;
  const gananciaUsd  = tmr > 0 ? ganancia / tmr : 0;
  return { cajas, tmr, costoFruta, costoCajas, costoTotal, cu, pv, pvTotal, ventaCop, ganancia, gananciaUsd };
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
  const costoVentaCfg      = config.cfg_costo_venta || {};
  const tiposCajaCfg       = costoVentaCfg.tiposCaja?.length ? costoVentaCfg.tiposCaja : TIPOS_CAJA_FALLBACK;
  // ?? (no ||) porque "" guardado explícitamente en Configuración significa
  // "sin restricción" — sólo cuando la clave nunca se ha configurado (undefined)
  // cae al valor por defecto.
  const claveEstadisticasCv = config.cfg_claves_acceso?.costo_venta_stats ?? "1002207784";

  const [tabLog, setTabLog] = useState(0);
  const TAB_LOG = ["📋 Operaciones", "💰 Costo de Venta", "🔔 Alertas", "📊 Estadísticas", "📄 Contratos"];

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

    return { porEstado, porEstadoContenedor, porResultadoInspeccion, porAlerta, promedioDiasPuerto, pctDocsCompletos, porMes };
  }, [log.bookings, log.inspecciones, alertas]);

  // ══════════════ INDICADORES OPERATIVOS POR PERÍODO (pedido del jefe) ══════════
  // Trimestre / Semestre / Año / Mes — reservas, puertos, transportadores,
  // inspecciones, navieras y destinos, todo recortado al período elegido.
  const aniosConDatos = useMemo(() => {
    const anioActual = new Date().getFullYear();
    const set = new Set([anioActual]);
    log.bookings.forEach(b => { if (b.createdAt) set.add(new Date(b.createdAt).getFullYear()); });
    return Array.from(set).sort((a, b) => b - a);
  }, [log.bookings]);

  const [tipoPeriodoOp, setTipoPeriodoOp] = useState("trimestre"); // "mes" | "trimestre" | "semestre" | "año"
  const [anioOp,        setAnioOp]        = useState(() => new Date().getFullYear());
  const [subPeriodoOp,  setSubPeriodoOp]  = useState(() => Math.floor(new Date().getMonth() / 3) + 1);

  // Al cambiar de tipo de período, el sub-período (mes/trimestre/semestre)
  // puede quedar fuera de rango (ej. trimestre 4 no existe para "semestre")
  // — se recalcula al valor correspondiente a hoy para ese tipo.
  const cambiarTipoPeriodoOp = (tipo) => {
    setTipoPeriodoOp(tipo);
    const mesActual = new Date().getMonth();
    if (tipo === "mes") setSubPeriodoOp(mesActual + 1);
    else if (tipo === "trimestre") setSubPeriodoOp(Math.floor(mesActual / 3) + 1);
    else if (tipo === "semestre") setSubPeriodoOp(Math.floor(mesActual / 6) + 1);
  };

  const rangoOp = useMemo(
    () => rangoPeriodoOperativo(tipoPeriodoOp, anioOp, subPeriodoOp),
    [tipoPeriodoOp, anioOp, subPeriodoOp]
  );

  const statsOp = useMemo(
    () => calcularEstadisticasPeriodo(log.bookings, log.transporte, log.inspecciones, rangoOp, anioOp),
    [log.bookings, log.transporte, log.inspecciones, rangoOp, anioOp]
  );

  // ══════════════ INFORME DE INDICADORES OPERATIVOS (a petición, por el período elegido arriba) ══════════════
  const [generandoInformeOp, setGenerandoInformeOp] = useState(false);

  const generarInformeOperativo = async (modo = "descargar") => {
    setGenerandoInformeOp(true);
    try {
      const logoSrc  = await cargarLogoBase64();
      const fechaHoy = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
      const horaHoy  = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

      const filaRanking = (r, i) => `<tr>
        <td style="text-align:right;color:#999">${i + 1}</td>
        <td><b>${r.nombre}</b></td>
        <td style="text-align:right">${r.cantidad}</td>
        <td style="text-align:right">${r.pct}%</td>
      </tr>`;

      // Colores de las gráficas en el informe (documento claro/imprimible,
      // a diferencia del dashboard oscuro) — mismas funciones de src/components/LogisticaTab.jsx.
      // Un color distinto por sección para que el informe se vea variado
      // (cada sección es una categoría propia: puertos, destinos, navieras,
      // transportadores, inspecciones), manteniendo un solo color dentro de
      // cada gráfica individual (correcto para magnitud por categoría).
      const PALETA = {
        puertos:         { main: "#2563EB", soft: "#EAF1FE", border: "#BFD7FB" }, // azul
        destinos:        { main: "#16A34A", soft: "#E9F8EF", border: "#BEEACE" }, // verde
        navieras:        { main: "#6D4FC7", soft: "#F2EEFC", border: "#DCD0F5" }, // morado
        transportadores: { main: "#CA8A04", soft: "#FDF6E3", border: "#F3DFA0" }, // amarillo
        inspecciones:    { main: "#DC2626", soft: "#FDEDED", border: "#F5C6C6" }, // rojo
      };

      const tablaRanking = (titulo, icono, ranking, colHead, colorKey) => {
        const c = PALETA[colorKey] || { main: "var(--accent)", soft: "var(--accent-soft)" };
        return `
<h2 style="color:${c.main};border-bottom-color:${c.main}">${icono} ${titulo}</h2>
${ranking.length === 0 ? `<p style="color:#888">Sin datos en este período.</p>` : `
<table><thead><tr><th style="background:${c.main}">#</th><th style="background:${c.main}">${colHead}</th><th style="background:${c.main};text-align:right">Operaciones</th><th style="background:${c.main};text-align:right">% Participación</th></tr></thead>
<tbody>${ranking.map(filaRanking).join("")}</tbody></table>`}`;
      };

      // Gráficas de barras agrupadas al final del informe (separadas de sus
      // tablas de ranking) para que el cuerpo del informe se vea menos denso.
      const graficaBarra = (titulo, icono, ranking, colorKey) => {
        const c = PALETA[colorKey] || { main: "var(--accent)", soft: "var(--accent-soft)" };
        if (!ranking.length) return "";
        return `
<div class="grafica-titulo" style="color:${c.main}">${icono} ${titulo}</div>
${svgBarrasH(ranking.slice(0, 8).map(r => ({ label: r.nombre, value: r.cantidad, pct: r.pct })), { width: 480, color: c.main, textColor: "var(--ink)", trackColor: c.soft })}`;
      };

      const tarjetaPrincipal = (l, r, color) => `
<div class="principal" style="border-top:3px solid ${color}">
  <div class="l">${l}</div>
  <div class="v">${r?.nombre || "—"}</div>
  ${r ? `<div class="s" style="color:${color}">${r.cantidad} ops · ${r.pct}%</div>` : ""}
</div>`;

      const donutHtml = svgDonut([
        { label: "Llenadas",   value: statsOp.llenadas,   color: "#16a34a" },
        { label: "Canceladas", value: statsOp.canceladas, color: "#dc2626" },
        { label: "En proceso", value: statsOp.enProceso,  color: "#94a3b8" },
      ], { size: 150, holeColor: "#fff", textColor: "#2A2733", centerLabel: String(statsOp.totalReservas), centerSub: "reservas" });

      const evolucionFilas = statsOp.inspecciones.evolucion
        .map(mes => `<tr><td style="text-transform:capitalize">${mes.label} ${anioOp}</td><td style="text-align:right">${mes.cantidad}</td></tr>`)
        .join("");
      const evolucionSvg = svgLinea(statsOp.inspecciones.evolucion.map(mes => ({ label: mes.label, cantidad: mes.cantidad })), { width: 300, height: 130, color: "#0369A1", textColor: "var(--ink)", gridColor: "var(--line)" });

      const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe Operativo — ${rangoOp.label}</title>
<style>
  :root{
    --accent:#6D4FC7; --accent-soft:#F2EEFC; --accent-border:#DCD0F5; --accent-strong:#4C3494;
    --ink:#2A2733; --ink-soft:#847E99; --line:#E9E5F2;
  }
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;line-height:1.55;padding:0;color:var(--ink);background:#F5F3FA;font-size:13px}
  .sheet{max-width:1080px;margin:0 auto;background:#fff;padding:44px 52px 36px}
  h1{color:var(--accent-strong);margin:0 0 6px;font-size:23px;letter-spacing:-0.2px}
  h2{color:var(--accent-strong);font-size:13.5px;font-weight:800;margin:40px 0 18px;padding-bottom:9px;border-bottom:2px solid var(--accent-border);text-transform:uppercase;letter-spacing:0.6px}
  h2:first-of-type{margin-top:8px}
  .hdr-row{display:flex;align-items:center;gap:16px;margin-bottom:6px}
  .hdr-row img{width:50px;height:50px;object-fit:contain;flex-shrink:0}
  .meta{font-size:11.5px;color:var(--ink-soft);margin-bottom:8px}
  .cards{display:flex;gap:16px;flex-wrap:wrap;margin:28px 0 8px}
  .card{background:var(--accent-soft);border:1px solid var(--accent-border);border-radius:12px;padding:18px 22px;min-width:170px;flex:1;text-align:center}
  .card-val{font-size:21px;font-weight:800;color:var(--accent);line-height:1.2}
  .card-lbl{font-size:10px;color:var(--ink-soft);margin-top:6px;text-transform:uppercase;letter-spacing:0.5px}
  .card.ok .card-val{color:#15803d} .card.danger .card-val{color:#b91c1c}
  .donut-row{display:flex;align-items:center;gap:36px;margin-bottom:8px;flex-wrap:wrap;padding:20px 4px}
  .donut-legend{display:flex;flex-direction:column;gap:10px;font-size:12.5px;color:var(--ink)}
  .donut-legend .dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px}
  .principales{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  .principal{background:#FAF8F5;border:1px solid var(--line);border-radius:10px;padding:14px 16px}
  .principal .l{font-size:9px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
  .principal .v{font-size:13.5px;font-weight:700;color:var(--ink)}
  .principal .s{font-size:10.5px;color:var(--accent);margin-top:3px;font-weight:600}
  table{width:100%;border-collapse:collapse;margin:14px 0 6px;border:1px solid var(--line);border-radius:8px;overflow:hidden}
  th{background:var(--accent);color:#fff;padding:10px 14px;text-align:left;font-size:10.5px;font-weight:700;white-space:nowrap;letter-spacing:0.3px}
  td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:12px}
  tbody tr:last-child td{border-bottom:none}
  tr:nth-child(even) td{background:#FBF8F4}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:12px}
  .grid2 h2{margin-top:8px}
  .grafica-item{background:#FAF8F5;border:1px solid var(--line);border-radius:10px;padding:16px 18px}
  .grafica-titulo{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px}
  .footer{text-align:center;color:#B5AFC7;margin-top:48px;font-size:10px;border-top:1px solid var(--line);padding-top:18px}
  @media print{
    body{background:#fff}
    .sheet{max-width:100%;padding:14px 6px}
    .footer{position:fixed;bottom:0;width:100%}
  }
</style></head><body>
<div class="sheet">

<div class="hdr-row">${logoSrc ? `<img src="${logoSrc}"/>` : ""}<h1>📊 Informe de Indicadores Operativos — Tierra Prometida Trading</h1></div>
<div class="meta">Período: <b style="text-transform:capitalize">${rangoOp.label}</b> &nbsp;·&nbsp; Generado: ${fechaHoy} ${horaHoy}</div>

<div class="cards">
  <div class="card" style="background:${PALETA.navieras.soft};border-color:${PALETA.navieras.border}"><div class="card-val" style="color:${PALETA.navieras.main}">${statsOp.totalReservas}</div><div class="card-lbl">Total reservas gestionadas</div></div>
  <div class="card ok"><div class="card-val">${statsOp.llenadas} (${statsOp.pctLlenadas}%)</div><div class="card-lbl">Reservas llenadas</div></div>
  <div class="card danger"><div class="card-val">${statsOp.canceladas} (${statsOp.pctCanceladas}%)</div><div class="card-lbl">Reservas canceladas</div></div>
  <div class="card" style="background:${PALETA.puertos.soft};border-color:${PALETA.puertos.border}"><div class="card-val" style="color:${PALETA.puertos.main}">${statsOp.inspecciones.contenedoresInspeccionados}</div><div class="card-lbl">Contenedores inspeccionados (Física)</div></div>
</div>

${statsOp.totalReservas === 0 ? `<p style="color:#888">No hay reservas registradas en este período.</p>` : `
<h2>🧩 Composición de reservas</h2>
<div class="donut-row">
  <div>${donutHtml}</div>
  <div class="donut-legend">
    <div><span class="dot" style="background:#16a34a"></span>Llenadas — <b>${statsOp.llenadas}</b> (${statsOp.pctLlenadas}%)</div>
    <div><span class="dot" style="background:#dc2626"></span>Canceladas — <b>${statsOp.canceladas}</b> (${statsOp.pctCanceladas}%)</div>
    <div><span class="dot" style="background:#94a3b8"></span>En proceso — <b>${statsOp.enProceso}</b> (${statsOp.pctEnProceso}%)</div>
  </div>
</div>

<h2>🏆 Principales del período</h2>
<div class="principales">
  ${tarjetaPrincipal("Puerto principal", statsOp.puertos[0], PALETA.puertos.main)}
  ${tarjetaPrincipal("Naviera principal", statsOp.navieras[0], PALETA.navieras.main)}
  ${tarjetaPrincipal("Transportador principal", statsOp.transportadores[0], PALETA.transportadores.main)}
  ${tarjetaPrincipal("Destino principal", statsOp.destinos[0], PALETA.destinos.main)}
</div>

<div class="grid2">
  <div>${tablaRanking("Puertos utilizados", "⚓", statsOp.puertos, "Puerto de origen", "puertos")}</div>
  <div>${tablaRanking("Destinos de exportación", "🌎", statsOp.destinos, "Destino", "destinos")}</div>
</div>
<div class="grid2">
  <div>${tablaRanking("Navieras", "🚢", statsOp.navieras, "Naviera", "navieras")}</div>
  <div>${tablaRanking("Transportadores", "🚛", statsOp.transportadores, "Transportador", "transportadores")}</div>
</div>

<h2 style="color:${PALETA.inspecciones.main};border-bottom-color:${PALETA.inspecciones.main}">🔍 Inspecciones de contenedores en puerto (solo Física)</h2>
<div class="meta">${statsOp.inspecciones.contenedoresInspeccionados} contenedor(es) inspeccionado(s) · ${statsOp.inspecciones.total} inspección(es) en total</div>
<div class="grid2">
  <div>${tablaRanking("Por puerto", "📍", statsOp.inspecciones.porPuerto, "Puerto", "inspecciones")}</div>
  <div>
    <h2 style="color:${PALETA.inspecciones.main};border-bottom-color:${PALETA.inspecciones.main}">📈 Evolución en el período</h2>
    ${statsOp.inspecciones.total === 0
      ? `<p style="color:#888">Sin inspecciones en este período.</p>`
      : `<table><thead><tr><th style="background:${PALETA.inspecciones.main}">Mes</th><th style="background:${PALETA.inspecciones.main};text-align:right">Inspecciones</th></tr></thead><tbody>${evolucionFilas}</tbody></table>`}
  </div>
</div>

<h2>📊 Gráficas del período</h2>
<div class="grid2">
  <div class="grafica-item">${graficaBarra("Puertos utilizados", "⚓", statsOp.puertos, "puertos")}</div>
  <div class="grafica-item">${graficaBarra("Destinos de exportación", "🌎", statsOp.destinos, "destinos")}</div>
</div>
<div class="grid2">
  <div class="grafica-item">${graficaBarra("Navieras", "🚢", statsOp.navieras, "navieras")}</div>
  <div class="grafica-item">${graficaBarra("Transportadores", "🚛", statsOp.transportadores, "transportadores")}</div>
</div>
<div class="grid2">
  <div class="grafica-item">${graficaBarra("Inspecciones por puerto", "📍", statsOp.inspecciones.porPuerto, "inspecciones")}</div>
  <div class="grafica-item">
    ${statsOp.inspecciones.total === 0 ? "" : `<div class="grafica-titulo" style="color:${PALETA.inspecciones.main}">📈 Evolución en el período</div>${evolucionSvg}`}
  </div>
</div>`}

<div class="footer">Tierra Prometida Trading 🍋 · JARVIS · ${fechaHoy} — Documento de uso interno.</div>
</div>
</body></html>`;

      const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      if (modo === "previsualizar") {
        window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        const subPeriodoParte = tipoPeriodoOp !== "año" ? `-${subPeriodoOp}` : "";
        a.download = `Informe-Operativo-${tipoPeriodoOp}-${anioOp}${subPeriodoParte}.html`;
        a.click();
        URL.revokeObjectURL(blobUrl);
      }
    } finally {
      setGenerandoInformeOp(false);
    }
  };

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
        setForm(f => ({ ...f, estadoContenedor: "Posicionado", fechaIngresoPuerto: "", fechaAsignacion: "" }));
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

  // Ordenado por N° Expo de mayor a menor (la más reciente primero) — los
  // bookings sin número de exportación quedan al final.
  const bookingsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return log.bookings
      .filter(b => {
        if (filtroEstado && b.estado !== filtroEstado) return false;
        if (!q) return true;
        return [b.numeroBooking, b.numeroContenedor, b.naviera, b.puertoOrigen, b.puertoDestino, b.planta]
          .some(v => (v || "").toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const na = a.numeroExportacion !== "" && a.numeroExportacion != null ? Number(a.numeroExportacion) : -Infinity;
        const nb = b.numeroExportacion !== "" && b.numeroExportacion != null ? Number(b.numeroExportacion) : -Infinity;
        return nb - na;
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

  // ══════════════ COSTO DE VENTA (pestaña propia, 1:1 con un booking/contenedor) ══════════════
  const [cvBookingSel, setCvBookingSel] = useState(null); // null = lista | id de booking
  const [cvForm, setCvForm]             = useState(() => costoVentaVacio(costoVentaCfg));
  const [guardandoCv, setGuardandoCv]   = useState(false);
  const [guardadoOkCv, setGuardadoOkCv] = useState(false);
  const [busquedaCv, setBusquedaCv]     = useState("");
  const [cvCajasInput, setCvCajasInput] = useState(""); // N° de Cajas — vive en el booking, editable aquí para no obligar a pasar por Operaciones
  const setCampoCv = (campo, valor) => setCvForm(f => ({ ...f, [campo]: valor }));

  // Estadísticas protegidas por clave (Configuración → Seguridad → Claves de Acceso)
  const [statsCvOk, setStatsCvOk]           = useState(false);
  const [statsCvPidiendo, setStatsCvPidiendo] = useState(false);
  const [statsCvInput, setStatsCvInput]     = useState("");
  const [statsCvError, setStatsCvError]     = useState("");
  const verificarClaveStatsCv = () => {
    if (statsCvInput === claveEstadisticasCv) {
      setStatsCvOk(true);
      setStatsCvError("");
      setStatsCvInput("");
    } else {
      setStatsCvError("Clave incorrecta");
    }
  };

  const cvBooking = useMemo(
    () => log.bookings.find(b => b.id === cvBookingSel) || null,
    [log.bookings, cvBookingSel]
  );

  const abrirCostoVenta = (b) => {
    setCvBookingSel(b.id);
    const cv = log.costoVenta.find(c => c.bookingId === b.id);
    setCvForm({ ...costoVentaVacio(costoVentaCfg), ...(cv || {}) });
    setCvCajasInput(b.numeroCajas ?? "");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const volverListaCv = () => {
    setCvBookingSel(null);
    setCvForm(costoVentaVacio(costoVentaCfg));
    setCvCajasInput("");
  };
  const elegirTipoCaja = (tipo) => {
    const preset = tiposCajaCfg.find(t => t.tipo === tipo);
    setCvForm(f => ({ ...f, tipoCaja: tipo, precioCaja: preset ? preset.precio : f.precioCaja }));
  };

  const guardarCv = async () => {
    if (!cvBookingSel) return;
    setGuardandoCv(true);
    // El N° de Cajas es un campo del booking (Operaciones), no del costeo —
    // si lo cambiaron aquí, hay que guardarlo ahí también antes de calcular.
    if (cvBooking && Number(cvCajasInput || 0) !== Number(cvBooking.numeroCajas || 0)) {
      await log.guardarBooking({ ...cvBooking, numeroCajas: cvCajasInput }, cvBookingSel);
    }
    const ok = await log.guardarCostoVenta(cvBookingSel, cvForm);
    setGuardandoCv(false);
    if (ok) { setGuardadoOkCv(true); setTimeout(() => setGuardadoOkCv(false), 2000); }
  };

  const cvCalc = useMemo(
    () => calcularCostoVenta(Number(cvCajasInput) || 0, cvForm),
    [cvForm, cvCajasInput]
  );

  const costoVentaPorBooking = useMemo(() => {
    const mapa = {};
    log.costoVenta.forEach(c => { mapa[c.bookingId] = c; });
    return mapa;
  }, [log.costoVenta]);

  // ── "Añadir Costo" — atajo desde la lista para cargar sólo el precio/kg
  // sin entrar al detalle completo; queda precargado cuando luego se Abre. ──
  const [modalCostoBookingId, setModalCostoBookingId] = useState(null);
  const [modalCostoValor, setModalCostoValor]         = useState("");
  const [guardandoModalCosto, setGuardandoModalCosto] = useState(false);

  const abrirModalCosto = (b) => {
    const cv = costoVentaPorBooking[b.id];
    setModalCostoBookingId(b.id);
    setModalCostoValor(cv?.precioKg ?? "");
  };
  const cerrarModalCosto = () => {
    setModalCostoBookingId(null);
    setModalCostoValor("");
  };
  const guardarModalCosto = async () => {
    if (!modalCostoBookingId) return;
    setGuardandoModalCosto(true);
    const cv = costoVentaPorBooking[modalCostoBookingId];
    const form = { ...costoVentaVacio(costoVentaCfg), ...(cv || {}), precioKg: modalCostoValor };
    const ok = await log.guardarCostoVenta(modalCostoBookingId, form);
    setGuardandoModalCosto(false);
    if (ok) cerrarModalCosto();
  };

  const costoVentaFiltrados = useMemo(() => {
    const q = busquedaCv.trim().toLowerCase();
    return log.bookings.filter(b => {
      if (!q) return true;
      return [b.numeroBooking, b.numeroContenedor, b.naviera, String(b.numeroExportacion || "")]
        .some(v => (v || "").toLowerCase().includes(q));
    });
  }, [log.bookings, busquedaCv]);

  // Resultados agregados de todos los contenedores con costeo cargado —
  // alimenta la sección "Costo de Venta" de la pestaña Estadísticas.
  const estadisticasCV = useMemo(() => {
    const filas = log.bookings
      .map(b => {
        const cv = costoVentaPorBooking[b.id];
        if (!cv) return null;
        const calc = calcularCostoVenta(Number(b.numeroCajas) || 0, cv);
        if (!calc.costoTotal) return null; // costeo abierto pero sin datos reales todavía
        return { booking: b, cv, calc };
      })
      .filter(Boolean);

    const suma = (fn) => filas.reduce((a, f) => a + fn(f), 0);
    const totalCostoTotal   = suma(f => f.calc.costoTotal);
    const totalVentaCop     = suma(f => f.calc.ventaCop);
    const totalVentaUsd     = suma(f => f.calc.pvTotal);
    const totalGananciaCop  = suma(f => f.calc.ganancia);
    const totalGananciaUsd  = suma(f => f.calc.gananciaUsd);
    const margenRealizado   = totalCostoTotal ? (totalGananciaCop / totalCostoTotal) * 100 : 0;

    const desgloseCostos = [
      { label: "Fruta",      value: Math.round(suma(f => f.calc.costoFruta)) },
      { label: "Cajas",      value: Math.round(suma(f => f.calc.costoCajas)) },
      { label: "Transporte", value: Math.round(suma(f => Number(f.cv.costoTransporte) || 0)) },
      { label: "Puerto",     value: Math.round(suma(f => Number(f.cv.costoPuerto) || 0)) },
      { label: "Agencia",    value: Math.round(suma(f => Number(f.cv.costoAgencia) || 0)) },
    ].map((it, i) => ({ ...it, color: PALETA_CATEGORICA[i], display: `$${it.value.toLocaleString("es-CO")}` }));

    const gananciaPorNavieraMapa = {};
    filas.forEach(f => {
      const key = f.booking.naviera || "Sin naviera";
      gananciaPorNavieraMapa[key] = (gananciaPorNavieraMapa[key] || 0) + f.calc.ganancia;
    });
    const gananciaPorNaviera = Object.entries(gananciaPorNavieraMapa)
      .sort((a, b) => b[1] - a[1])
      .map(([naviera, valor]) => ({
        label: naviera,
        value: Math.abs(Math.round(valor)),
        display: `${valor < 0 ? "-" : ""}$${Math.abs(Math.round(valor)).toLocaleString("es-CO")}`,
        color: valor >= 0 ? "#00C9A7" : "#FF6B6B",
      }));

    const ventaUsdPorNavieraMapa = {};
    filas.forEach(f => {
      const key = f.booking.naviera || "Sin naviera";
      ventaUsdPorNavieraMapa[key] = (ventaUsdPorNavieraMapa[key] || 0) + f.calc.pvTotal;
    });
    const ventaUsdPorNaviera = Object.entries(ventaUsdPorNavieraMapa)
      .sort((a, b) => b[1] - a[1])
      .map(([naviera, valor]) => ({
        label: naviera,
        value: Math.round(valor),
        display: `$${Math.round(valor).toLocaleString("es-CO")}`,
        color: "#845EF7",
      }));

    const hoy = new Date();
    const ventaUsdPorMes = Array.from({ length: 6 }, (_, idx) => {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - (5 - idx), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("es-CO", { month: "short" }).replace(".", "");
      const value = Math.round(suma(f => ((f.booking.fechaZarpe || f.booking.createdAt || "").slice(0, 7)) === key ? f.calc.pvTotal : 0));
      return { key, label, value };
    });

    return { filas, totalCostoTotal, totalVentaCop, totalVentaUsd, totalGananciaCop, totalGananciaUsd, margenRealizado, desgloseCostos, gananciaPorNaviera, ventaUsdPorNaviera, ventaUsdPorMes };
  }, [log.bookings, costoVentaPorBooking]);

  // ══════════════ INFORME DE COSTO DE VENTA (semanal / mensual / anual / personalizado) ══════════════
  const [periodoInforme, setPeriodoInforme]     = useState("mensual");
  const [desdeInforme, setDesdeInforme]         = useState("");
  const [hastaInforme, setHastaInforme]         = useState("");
  const [generandoInforme, setGenerandoInforme] = useState(false);

  const generarInformeCV = async (modo = "descargar") => {
    setGenerandoInforme(true);
    const { desde, hasta, label } = rangoPeriodoInforme(periodoInforme, desdeInforme, hastaInforme);

    const filas = log.bookings
      .map(b => {
        const cv = costoVentaPorBooking[b.id];
        if (!cv) return null;
        const fecha = (b.fechaZarpe || b.createdAt || "").slice(0, 10);
        if (fecha && (fecha < desde || fecha > hasta)) return null;
        const calc = calcularCostoVenta(Number(b.numeroCajas) || 0, cv);
        if (!calc.costoTotal) return null;
        return { booking: b, cv, calc, fecha };
      })
      .filter(Boolean)
      .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));

    const logoSrc  = await cargarLogoBase64();
    const fechaHoy = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
    const horaHoy  = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

    const suma = (fn) => filas.reduce((a, f) => a + fn(f), 0);
    const totalCostoTotal  = suma(f => f.calc.costoTotal);
    const totalVentaCop    = suma(f => f.calc.ventaCop);
    const totalVentaUsd    = suma(f => f.calc.pvTotal);
    const totalGananciaCop = suma(f => f.calc.ganancia);
    const totalGananciaUsd = suma(f => f.calc.gananciaUsd);
    const margenReal       = totalCostoTotal ? (totalGananciaCop / totalCostoTotal) * 100 : 0;

    const desglose = [
      { label: "Fruta",      value: suma(f => f.calc.costoFruta) },
      { label: "Cajas",      value: suma(f => f.calc.costoCajas) },
      { label: "Transporte", value: suma(f => Number(f.cv.costoTransporte) || 0) },
      { label: "Puerto",     value: suma(f => Number(f.cv.costoPuerto) || 0) },
      { label: "Agencia",    value: suma(f => Number(f.cv.costoAgencia) || 0) },
    ];

    const porNavieraMapa = {};
    filas.forEach(f => {
      const key = f.booking.naviera || "Sin naviera";
      if (!porNavieraMapa[key]) porNavieraMapa[key] = { contenedores: 0, ventaUsd: 0, ventaCop: 0, costoTotal: 0, gananciaCop: 0, gananciaUsd: 0 };
      const n = porNavieraMapa[key];
      n.contenedores++; n.ventaUsd += f.calc.pvTotal; n.ventaCop += f.calc.ventaCop;
      n.costoTotal += f.calc.costoTotal; n.gananciaCop += f.calc.ganancia; n.gananciaUsd += f.calc.gananciaUsd;
    });
    const porNaviera = Object.entries(porNavieraMapa).sort((a, b) => b[1].gananciaCop - a[1].gananciaCop);

    const cop = (v) => `$${Math.round(v || 0).toLocaleString("es-CO")}`;
    const usd = (v) => `$${Math.round(v || 0).toLocaleString("es-CO")}`;

    const filaDetalle = (f) => `<tr>
      <td>${f.fecha || "—"}</td>
      <td><b>${f.booking.numeroBooking || "—"}</b></td>
      <td>${f.booking.numeroContenedor || "—"}</td>
      <td>${f.booking.naviera || "—"}</td>
      <td style="text-align:right">${f.booking.numeroCajas || 0}</td>
      <td style="text-align:right">${f.cv.tmr || "—"}</td>
      <td style="text-align:right">${f.cv.kilos || "—"}</td>
      <td style="text-align:right">${f.cv.precioKg ? cop(f.cv.precioKg) : "—"}</td>
      <td style="text-align:right">${cop(f.calc.costoFruta)}</td>
      <td>${f.cv.tipoCaja || "—"}</td>
      <td style="text-align:right">${f.cv.precioCaja ? cop(f.cv.precioCaja) : "—"}</td>
      <td style="text-align:right">${cop(f.calc.costoCajas)}</td>
      <td style="text-align:right">${cop(Number(f.cv.costoTransporte) || 0)}</td>
      <td style="text-align:right">${cop(Number(f.cv.costoPuerto) || 0)}</td>
      <td style="text-align:right">${cop(Number(f.cv.costoAgencia) || 0)}</td>
      <td style="text-align:right;font-weight:700">${cop(f.calc.costoTotal)}</td>
      <td style="text-align:right">$${f.calc.cu.toFixed(2)}</td>
      <td style="text-align:right">${(Number(f.cv.margen) || 0).toFixed(1)}%</td>
      <td style="text-align:right">$${f.calc.pv.toFixed(1)}</td>
      <td style="text-align:right">${usd(f.calc.pvTotal)}</td>
      <td style="text-align:right">${cop(f.calc.ventaCop)}</td>
      <td style="text-align:right;font-weight:700;color:${f.calc.ganancia >= 0 ? "#16a34a" : "#dc2626"}">${cop(f.calc.ganancia)}</td>
      <td style="text-align:right;font-weight:700;color:${f.calc.gananciaUsd >= 0 ? "#16a34a" : "#dc2626"}">${usd(f.calc.gananciaUsd)}</td>
      <td style="font-size:10px;color:#888">${f.cv.obs || "—"}</td>
    </tr>`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe Costo de Venta — ${label}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;padding:28px;color:#222;max-width:1500px;margin:0 auto;font-size:12px}
  h1{color:#845EF7;margin-bottom:2px;font-size:22px}
  h2{color:#845EF7;font-size:13px;font-weight:800;margin:22px 0 6px;border-bottom:2px solid #845EF730;padding-bottom:5px;text-transform:uppercase;letter-spacing:0.5px}
  .hdr-row{display:flex;align-items:center;gap:12px;margin-bottom:2px}
  .hdr-row img{width:46px;height:46px;object-fit:contain}
  .meta{font-size:11px;color:#888;margin-bottom:16px}
  .cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
  .card{background:#f7f4ff;border:1px solid #d8d0ff;border-radius:10px;padding:14px 18px;min-width:130px;text-align:center}
  .card-val{font-size:22px;font-weight:800;color:#845EF7;line-height:1}
  .card-lbl{font-size:10px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px}
  .card.ok .card-val{color:#16a34a} .card.danger .card-val{color:#dc2626} .card.warn .card-val{color:#d97706}
  table{width:100%;border-collapse:collapse;margin-bottom:4px}
  th{background:#845EF7;color:white;padding:7px 9px;text-align:left;font-size:10px;white-space:nowrap}
  td{padding:6px 9px;border-bottom:1px solid #f0eeff;vertical-align:middle;white-space:nowrap}
  tr:nth-child(even) td{background:#faf8ff}
  .tot-row td{background:#f0ebff!important;font-weight:700;border-top:2px solid #845EF740}
  .detalle-wrap{overflow-x:auto}
  .footer{text-align:center;color:#bbb;margin-top:28px;font-size:10px;border-top:1px solid #eee;padding-top:14px}
  @media print{body{padding:10px}.footer{position:fixed;bottom:0;width:100%}@page{size:landscape}}
</style></head><body>

<div class="hdr-row">${logoSrc ? `<img src="${logoSrc}"/>` : ""}<h1>💰 Informe de Costo de Venta — Tierra Prometida Trading</h1></div>
<div class="meta">Período: <b>${label}</b> &nbsp;·&nbsp; Generado: ${fechaHoy} ${horaHoy} &nbsp;·&nbsp; ${filas.length} contenedor(es) con costeo cargado</div>

<div class="cards">
  <div class="card"><div class="card-val">${filas.length}</div><div class="card-lbl">Contenedores</div></div>
  <div class="card"><div class="card-val">${usd(totalVentaUsd)}</div><div class="card-lbl">Venta Total USD</div></div>
  <div class="card"><div class="card-val">${cop(totalVentaCop)}</div><div class="card-lbl">Venta Total COP</div></div>
  <div class="card warn"><div class="card-val">${cop(totalCostoTotal)}</div><div class="card-lbl">Costo Total COP</div></div>
  <div class="card ${totalGananciaCop >= 0 ? "ok" : "danger"}"><div class="card-val">${cop(totalGananciaCop)}</div><div class="card-lbl">GOU COP</div></div>
  <div class="card ${totalGananciaUsd >= 0 ? "ok" : "danger"}"><div class="card-val">${usd(totalGananciaUsd)}</div><div class="card-lbl">GOU USD</div></div>
  <div class="card"><div class="card-val">${margenReal.toFixed(1)}%</div><div class="card-lbl">Margen realizado</div></div>
</div>

${filas.length === 0 ? `<p style="color:#888">Sin costeos registrados en este período.</p>` : `
<h2>📦 Desglose de costos</h2>
<table><thead><tr><th>Categoría</th><th style="text-align:right">Monto (COP)</th><th style="text-align:right">% del total</th></tr></thead>
<tbody>
${desglose.map(d => `<tr><td>${d.label}</td><td style="text-align:right">${cop(d.value)}</td><td style="text-align:right">${totalCostoTotal ? ((d.value / totalCostoTotal) * 100).toFixed(1) : "0.0"}%</td></tr>`).join("")}
<tr class="tot-row"><td>Total</td><td style="text-align:right">${cop(totalCostoTotal)}</td><td style="text-align:right">100.0%</td></tr>
</tbody></table>

<h2>⚓ Resultados por naviera</h2>
<table><thead><tr><th>Naviera</th><th style="text-align:right">Contenedores</th><th style="text-align:right">Venta USD</th><th style="text-align:right">Venta COP</th><th style="text-align:right">Costo Total COP</th><th style="text-align:right">GOU COP</th><th style="text-align:right">GOU USD</th></tr></thead>
<tbody>
${porNaviera.map(([naviera, n]) => `<tr>
  <td><b>${naviera}</b></td>
  <td style="text-align:right">${n.contenedores}</td>
  <td style="text-align:right">${usd(n.ventaUsd)}</td>
  <td style="text-align:right">${cop(n.ventaCop)}</td>
  <td style="text-align:right">${cop(n.costoTotal)}</td>
  <td style="text-align:right;font-weight:700;color:${n.gananciaCop >= 0 ? "#16a34a" : "#dc2626"}">${cop(n.gananciaCop)}</td>
  <td style="text-align:right;font-weight:700;color:${n.gananciaUsd >= 0 ? "#16a34a" : "#dc2626"}">${usd(n.gananciaUsd)}</td>
</tr>`).join("")}
</tbody></table>

<h2>📋 Detalle por contenedor (${filas.length})</h2>
<div class="detalle-wrap">
<table><thead><tr>
  <th>Fecha</th><th>Booking</th><th>Contenedor</th><th>Naviera</th><th style="text-align:right">Cajas</th>
  <th style="text-align:right">TRM</th><th style="text-align:right">Kilos</th><th style="text-align:right">Precio/Kg</th><th style="text-align:right">Costo Fruta</th>
  <th>Tipo Caja</th><th style="text-align:right">Precio Caja</th><th style="text-align:right">Costo Cajas</th>
  <th style="text-align:right">Transporte</th><th style="text-align:right">Puerto</th><th style="text-align:right">Agencia</th>
  <th style="text-align:right">Costo Total</th><th style="text-align:right">CU (USD)</th><th style="text-align:right">Margen</th>
  <th style="text-align:right">PV (USD)</th><th style="text-align:right">Venta Total USD</th><th style="text-align:right">Venta Total COP</th>
  <th style="text-align:right">GOU COP</th><th style="text-align:right">GOU USD</th><th>Obs.</th>
</tr></thead>
<tbody>
${filas.map(filaDetalle).join("")}
<tr class="tot-row">
  <td colspan="15">Total</td>
  <td style="text-align:right">${cop(totalCostoTotal)}</td>
  <td></td><td></td><td></td>
  <td style="text-align:right">${usd(totalVentaUsd)}</td>
  <td style="text-align:right">${cop(totalVentaCop)}</td>
  <td style="text-align:right">${cop(totalGananciaCop)}</td>
  <td style="text-align:right">${usd(totalGananciaUsd)}</td>
  <td></td>
</tr>
</tbody></table>
</div>
`}

<div class="footer">Tierra Prometida Trading 🍋 · JARVIS · ${fechaHoy} — Documento de uso interno.</div>
</body></html>`;

    const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    if (modo === "previsualizar") {
      window.open(blobUrl, "_blank");
    } else {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `CostoVenta_${periodoInforme}_${fechaLocalISO()}.html`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    }
    setGenerandoInforme(false);
  };

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
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar booking, contenedor, naviera, planta..." style={{ ...inp, flex: 1, minWidth: 160 }} />
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
                        <th style={{ padding: "6px" }}>Booking</th><th style={{ padding: "6px" }}>Contenedor</th><th style={{ padding: "6px" }}>N° Expo</th><th style={{ padding: "6px" }}>Estado</th>
                        <th style={{ padding: "6px" }}>Planta</th>
                        <th style={{ padding: "6px" }}>Naviera</th><th style={{ padding: "6px" }}>Motonave</th><th style={{ padding: "6px" }}>Estado contenedor</th>
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
                            <td style={{ padding: "6px" }}>{b.numeroExportacion || "—"}</td>
                            <td style={{ padding: "6px" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: `${COLOR_ESTADO_BOOKING[b.estado]}22`, color: COLOR_ESTADO_BOOKING[b.estado] }}>{b.estado}</span>
                            </td>
                            <td style={{ padding: "6px" }}>{b.planta || "—"}</td>
                            <td style={{ padding: "6px" }}>{b.naviera || "—"}</td>
                            <td style={{ padding: "6px" }}>{b.motonave || "—"}</td>
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
                  <div style={campoBox}><div style={lbl}>N° Exportación</div><input type="number" style={inp} value={form.numeroExportacion} onChange={e => setCampo("numeroExportacion", e.target.value)} placeholder="Ej: 180" /></div>
                  <div style={campoBox}><div style={lbl}>N° Proforma</div><input type="number" style={inp} value={form.numeroProforma} onChange={e => setCampo("numeroProforma", e.target.value)} placeholder="Ej: 693" /></div>
                  <div style={campoBox}><div style={lbl}>Estado</div>
                    <CustomSelect value={form.estado} onChange={e => setCampo("estado", e.target.value)} style={inp}>
                      {ESTADOS_BOOKING.map(x => <option key={x} value={x}>{x}</option>)}
                    </CustomSelect>
                  </div>
                  <div style={campoBox}><div style={lbl}>Planta</div>
                    <CustomSelect value={form.planta} onChange={e => setCampo("planta", e.target.value)} style={inp}>
                      <option value="">Seleccionar...</option>
                      {PLANTAS.map(p => <option key={p} value={p}>{p}</option>)}
                    </CustomSelect>
                  </div>
                  <div style={campoBox}><div style={lbl}>Naviera</div>
                    <CustomSelect value={form.naviera} onChange={e => setCampo("naviera", e.target.value)} style={inp}>
                      <option value="">Seleccionar...</option>
                      {navierasCfg.map(n => <option key={n.id} value={n.nombre}>{n.nombre}</option>)}
                    </CustomSelect>
                  </div>
                  <div style={campoBox}><div style={lbl}>Motonave</div><input style={inp} value={form.motonave} onChange={e => setCampo("motonave", e.target.value)} placeholder="Ej: MSC SERENA" /></div>
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

      {/* ═══ TAB 1 — COSTO DE VENTA ═══ */}
      {tabLog === 1 && (
        cvBookingSel === null ? (
          /* ── Lista maestra ── */
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={cardS}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>📊 Resumen general</div>
                {claveEstadisticasCv && !statsCvOk && !statsCvPidiendo && (
                  <button onClick={() => setStatsCvPidiendo(true)} style={btnSecundario}>🔒 Ver estadísticas</button>
                )}
                {claveEstadisticasCv && statsCvOk && (
                  <button onClick={() => { setStatsCvOk(false); setStatsCvPidiendo(false); }} style={btnSecundario}>🙈 Ocultar estadísticas</button>
                )}
              </div>

              {claveEstadisticasCv && !statsCvOk ? (
                statsCvPidiendo ? (
                  <div style={{ textAlign: "center", maxWidth: 280, margin: "16px auto", padding: "10px 0" }}>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>Ingresa la clave de acceso para ver las estadísticas.</div>
                    <input
                      type="password" autoFocus value={statsCvInput}
                      onChange={e => { setStatsCvInput(e.target.value); setStatsCvError(""); }}
                      onKeyDown={e => e.key === "Enter" && verificarClaveStatsCv()}
                      placeholder="Clave" style={{ ...inp, textAlign: "center", fontSize: 16, letterSpacing: 3 }}
                    />
                    {statsCvError && <div style={{ color: "#FF6B6B", fontSize: 11, marginTop: 8, fontWeight: 700 }}>{statsCvError}</div>}
                    <button onClick={verificarClaveStatsCv} style={{ marginTop: 12, width: "100%", ...btnPrimario(false, false) }}>🔓 Desbloquear</button>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>Estadísticas protegidas — pulsa "Ver estadísticas" para desbloquearlas.</div>
                )
              ) : (
                <>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>{estadisticasCV.filas.length} contenedor(es) con costeo cargado</div>
              {estadisticasCV.filas.length === 0 ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Sin costeos registrados todavía — abre un contenedor abajo y cárgalo.</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(4,1fr)", gap: 10, marginBottom: 18 }}>
                    {[
                      { l: "Venta Total (USD)", v: `$${Math.round(estadisticasCV.totalVentaUsd).toLocaleString("es-CO")}`, c: "#845EF7" },
                      { l: "Venta Total (COP)", v: `$${Math.round(estadisticasCV.totalVentaCop).toLocaleString("es-CO")}`, c: "#845EF7" },
                      { l: "Costo Total (COP)", v: `$${Math.round(estadisticasCV.totalCostoTotal).toLocaleString("es-CO")}`, c: "#F9A826" },
                      { l: "Margen realizado",  v: `${estadisticasCV.margenRealizado.toFixed(1)}%`, c: "#0EA5E9" },
                      { l: "GOU (COP)",         v: `$${Math.round(estadisticasCV.totalGananciaCop).toLocaleString("es-CO")}`, c: estadisticasCV.totalGananciaCop >= 0 ? "#00C9A7" : "#FF6B6B" },
                      { l: "GOU (USD)",         v: `$${Math.round(estadisticasCV.totalGananciaUsd).toLocaleString("es-CO")}`, c: estadisticasCV.totalGananciaUsd >= 0 ? "#00C9A7" : "#FF6B6B" },
                    ].map((s, i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 10, textAlign: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: s.c }}>{s.v}</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{s.l}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "repeat(3,1fr)", gap: 16, marginBottom: 18 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 10 }}>Desglose de costos</div>
                      <BarraLista items={estadisticasCV.desgloseCostos} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 10 }}>GOU por naviera</div>
                      <BarraLista items={estadisticasCV.gananciaPorNaviera} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 10 }}>Venta Total USD por naviera</div>
                      <BarraLista items={estadisticasCV.ventaUsdPorNaviera} />
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 12 }}>Venta Total (USD) por mes</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 110 }}>
                      {estadisticasCV.ventaUsdPorMes.map((mes, i) => {
                        const max = Math.max(1, ...estadisticasCV.ventaUsdPorMes.map(x => x.value));
                        const barH = mes.value ? Math.max(6, (mes.value / max) * 90) : 2;
                        const esActual = i === estadisticasCV.ventaUsdPorMes.length - 1;
                        const color = esActual ? "#845EF7" : "rgba(132,94,247,0.35)";
                        return (
                          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6, height: "100%" }}>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", minHeight: 14, textAlign: "center" }}>
                              {mes.value ? `$${mes.value.toLocaleString("es-CO")}` : ""}
                            </div>
                            <div style={{ width: "60%", height: barH, background: color, borderRadius: "4px 4px 0 0", transition: "height 0.3s" }} />
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "capitalize" }}>{mes.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
                </>
              )}
            </div>

            <div style={cardS}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>📄 Informe detallado</div>
                {claveEstadisticasCv && !statsCvOk && !statsCvPidiendo && (
                  <button onClick={() => setStatsCvPidiendo(true)} style={btnSecundario}>🔒 Ver informe</button>
                )}
                {claveEstadisticasCv && statsCvOk && (
                  <button onClick={() => { setStatsCvOk(false); setStatsCvPidiendo(false); }} style={btnSecundario}>🙈 Ocultar informe</button>
                )}
              </div>

              {claveEstadisticasCv && !statsCvOk ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>Informe protegido — pulsa "Ver informe" para desbloquearlo (misma clave que las estadísticas).</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ minWidth: 140 }}>
                      <div style={lbl}>Período</div>
                      <CustomSelect value={periodoInforme} onChange={e => setPeriodoInforme(e.target.value)} style={inp}>
                        {PERIODOS_INFORME.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </CustomSelect>
                    </div>
                    {periodoInforme === "personalizado" && (
                      <>
                        <div><div style={lbl}>Desde</div><input type="date" style={inp} value={desdeInforme} onChange={e => setDesdeInforme(e.target.value)} /></div>
                        <div><div style={lbl}>Hasta</div><input type="date" style={inp} value={hastaInforme} onChange={e => setHastaInforme(e.target.value)} /></div>
                      </>
                    )}
                    <button onClick={() => generarInformeCV("previsualizar")} disabled={generandoInforme} style={btnSecundario}>
                      👁 Vista previa
                    </button>
                    <button onClick={() => generarInformeCV("descargar")} disabled={generandoInforme} style={btnPrimario(false, generandoInforme)}>
                      {generandoInforme ? "Generando..." : "📥 Descargar informe"}
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 10 }}>Incluye resumen, desglose de costos, resultados por naviera y el detalle completo (fruta, cajas, transporte, puerto, agencia, CU, PV, GOU...) de cada contenedor costeado en el período elegido — según la fecha de zarpe, o la fecha de creación del booking si aún no ha zarpado.</div>
                </>
              )}
            </div>

            <div style={cardS}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>💰 Costo de Venta por contenedor</div>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                <input value={busquedaCv} onChange={e => setBusquedaCv(e.target.value)} placeholder="🔍 Buscar booking, contenedor, naviera, N° expo..." style={{ ...inp, flex: 1, minWidth: 160 }} />
              </div>
              {costoVentaFiltrados.length === 0 ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>Sin operaciones registradas todavía. Crea un booking en Operaciones primero.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
                        <th style={{ padding: "6px" }}>Booking</th><th style={{ padding: "6px" }}>Contenedor</th>
                        <th style={{ padding: "6px" }}>N° Expo</th><th style={{ padding: "6px" }}>Naviera</th>
                        <th style={{ padding: "6px" }}>Costo Total (COP)</th>
                        <th style={{ padding: "6px" }}>PV (USD/caja)</th>
                        <th style={{ padding: "6px" }}>Venta Total (USD)</th>
                        <th style={{ padding: "6px" }}>Venta Total (COP)</th>
                        <th style={{ padding: "6px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {costoVentaFiltrados.map(b => {
                        const cv = costoVentaPorBooking[b.id];
                        const cajas = Number(b.numeroCajas) || 0;
                        const calc = cv ? calcularCostoVenta(cajas, cv) : null;
                        return (
                          <tr key={b.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }} onClick={() => abrirCostoVenta(b)}>
                            <td style={{ padding: "6px", color: "white", fontWeight: 600 }}>{b.numeroBooking || "—"}</td>
                            <td style={{ padding: "6px" }}>{b.numeroContenedor || "—"}</td>
                            <td style={{ padding: "6px" }}>{b.numeroExportacion || "—"}</td>
                            <td style={{ padding: "6px" }}>{b.naviera || "—"}</td>
                            <td style={{ padding: "6px", color: calc?.costoTotal ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)" }}>
                              {calc?.costoTotal ? `$${Math.round(calc.costoTotal).toLocaleString("es-CO")}` : "—"}
                            </td>
                            <td style={{ padding: "6px", color: calc?.pv ? "#0EA5E9" : "rgba(255,255,255,0.3)" }}>
                              {calc?.pv ? `$${calc.pv.toFixed(1)}` : "—"}
                            </td>
                            <td style={{ padding: "6px", color: calc?.pvTotal ? "#845EF7" : "rgba(255,255,255,0.3)", fontWeight: 600 }}>
                              {calc?.pvTotal ? `$${Math.round(calc.pvTotal).toLocaleString("es-CO")}` : "—"}
                            </td>
                            <td style={{ padding: "6px", color: calc?.ventaCop ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)" }}>
                              {calc?.ventaCop ? `$${Math.round(calc.ventaCop).toLocaleString("es-CO")}` : "—"}
                            </td>
                            <td style={{ padding: "6px", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => abrirModalCosto(b)} style={btnTablaEditar}>➕ Añadir Costo</button>
                              <button onClick={() => abrirCostoVenta(b)} style={btnTablaEditar}>Abrir</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {modalCostoBookingId && (() => {
              const bModal = log.bookings.find(b => b.id === modalCostoBookingId);
              return (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 8888, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={cerrarModalCosto}>
                  <div style={{ background: "#181a26", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 24, maxWidth: 320, width: "100%" }} onClick={e => e.stopPropagation()}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 4 }}>➕ Añadir Costo</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 16 }}>{labelBooking(bModal)}</div>
                    <div style={lbl}>Valor unitario por Kg (COP)</div>
                    <input
                      type="number" autoFocus value={modalCostoValor}
                      onChange={e => setModalCostoValor(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && guardarModalCosto()}
                      placeholder="Ej: 3800" style={inp}
                    />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
                      <button onClick={cerrarModalCosto} style={btnSecundario}>Cancelar</button>
                      <button onClick={guardarModalCosto} disabled={guardandoModalCosto} style={btnPrimario(false, guardandoModalCosto)}>
                        {guardandoModalCosto ? "Guardando..." : "Guardar"}
                      </button>
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 12 }}>Este valor queda precargado cuando abras el costeo completo de este contenedor.</div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          /* ── Detalle del costeo del contenedor ── */
          <div style={cardS}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>💰 {labelBooking(cvBooking)}</div>
              <button onClick={volverListaCv} style={btnSecundario}>← Volver a la lista</button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
              <span>🛃 Expo <b style={{ color: "white" }}>{cvBooking?.numeroExportacion || "—"}</b></span>
              <span>· 🧾 Proforma <b style={{ color: "white" }}>{cvBooking?.numeroProforma || "—"}</b></span>
              <span>· 🚢 {cvBooking?.naviera || "—"}</span>
              <span>· 📍 {cvBooking?.puertoDestino || "—"}</span>
            </div>

            {!cvCajasInput && (
              <div style={{ background: "rgba(249,168,38,0.1)", border: "1px solid rgba(249,168,38,0.35)", borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: 11, color: "#F9A826", display: "flex", alignItems: "center", gap: 8 }}>
                <span>⚠️</span> Sin N° de Cajas, Costo de Cajas, CU, PV y Venta Total quedan en $0. Complétalo abajo.
              </div>
            )}

            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Fruta y cajas</div>
            <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 14 }}>
              <div style={campoBox}><div style={lbl}>N° de Cajas</div><input type="number" style={inp} value={cvCajasInput} onChange={e => setCvCajasInput(e.target.value)} placeholder="Ej: 1400" /></div>
              <div style={campoBox}><div style={lbl}>TRM (tasa de cambio)</div><input type="number" style={inp} value={cvForm.tmr} onChange={e => setCampoCv("tmr", e.target.value)} placeholder="Ej: 3127.51" /></div>
              <div style={campoBox}><div style={lbl}>Kilos del contenedor</div><input type="number" style={inp} value={cvForm.kilos} onChange={e => setCampoCv("kilos", e.target.value)} placeholder="Ej: 23240" /></div>
              <div style={campoBox}><div style={lbl}>Precio por Kg (COP)</div><input type="number" style={inp} value={cvForm.precioKg} onChange={e => setCampoCv("precioKg", e.target.value)} placeholder="Ej: 3800" /></div>
              <div style={campoBox}><div style={lbl}>Tipo de caja</div>
                <CustomSelect value={cvForm.tipoCaja} onChange={e => elegirTipoCaja(e.target.value)} style={inp}>
                  <option value="">Seleccionar...</option>
                  {tiposCajaCfg.map(t => <option key={t.tipo} value={t.tipo}>{t.tipo}</option>)}
                </CustomSelect>
              </div>
              <div style={campoBox}><div style={lbl}>Precio unitario caja (COP)</div><input type="number" style={inp} value={cvForm.precioCaja} onChange={e => setCampoCv("precioCaja", e.target.value)} placeholder="0" /></div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Otros costos (COP) y margen</div>
            <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 14 }}>
              <div style={campoBox}><div style={lbl}>Transporte</div><input type="number" style={inp} value={cvForm.costoTransporte} onChange={e => setCampoCv("costoTransporte", e.target.value)} placeholder="0" /></div>
              <div style={campoBox}><div style={lbl}>Puerto</div><input type="number" style={inp} value={cvForm.costoPuerto} onChange={e => setCampoCv("costoPuerto", e.target.value)} placeholder="0" /></div>
              <div style={campoBox}><div style={lbl}>Agencia</div><input type="number" style={inp} value={cvForm.costoAgencia} onChange={e => setCampoCv("costoAgencia", e.target.value)} placeholder="0" /></div>
              <div style={campoBox}><div style={lbl}>Margen de venta (%)</div><input type="number" style={inp} value={cvForm.margen} onChange={e => setCampoCv("margen", e.target.value)} placeholder="1.5" /></div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Resultado</div>
            <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 14 }}>
              {[
                { l: "Costo Fruta (COP)",  v: cvCalc.costoFruta ? `$${Math.round(cvCalc.costoFruta).toLocaleString("es-CO")}` : "—", c: "#F9A826" },
                { l: "Costo Cajas (COP)",  v: cvCalc.costoCajas ? `$${Math.round(cvCalc.costoCajas).toLocaleString("es-CO")}` : "—", c: "#F9A826" },
                { l: "Costo Total (COP)",  v: cvCalc.costoTotal ? `$${Math.round(cvCalc.costoTotal).toLocaleString("es-CO")}` : "—", c: "#F9A826" },
                { l: "Costo Unit. (USD)",  v: cvCalc.cu ? `$${cvCalc.cu.toFixed(2)}` : "—", c: "#0EA5E9" },
                { l: "Precio Venta (USD/caja)", v: cvCalc.pv ? `$${cvCalc.pv.toFixed(1)}` : "—", c: "#845EF7" },
                { l: "Venta Total (USD)",  v: cvCalc.pvTotal ? `$${cvCalc.pvTotal.toLocaleString("es-CO")}` : "—", c: "#845EF7" },
                { l: "Venta Total (COP)",  v: cvCalc.ventaCop ? `$${Math.round(cvCalc.ventaCop).toLocaleString("es-CO")}` : "—", c: "#845EF7" },
                { l: "GOU — Ganancia (COP)", v: cvCalc.costoTotal ? `$${Math.round(cvCalc.ganancia).toLocaleString("es-CO")}` : "—", c: cvCalc.ganancia >= 0 ? "#00C9A7" : "#FF6B6B" },
                { l: "GOU — Ganancia (USD)", v: cvCalc.costoTotal ? `$${Math.round(cvCalc.gananciaUsd).toLocaleString("es-CO")}` : "—", c: cvCalc.gananciaUsd >= 0 ? "#00C9A7" : "#FF6B6B" },
              ].map((s, i) => (
                <div key={i} style={{ ...campoBox, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{s.l}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={lbl}>Observaciones</div>
              <textarea style={{ ...inp, minHeight: isLandscape ? 44 : (m ? 70 : 56), resize: "vertical", fontFamily: "inherit" }} value={cvForm.obs} onChange={e => setCampoCv("obs", e.target.value)} placeholder="Notas sobre este costeo..." />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <button onClick={guardarCv} disabled={guardandoCv} style={btnPrimario(guardadoOkCv, guardandoCv)}>
                {guardadoOkCv ? "✓ Guardado" : guardandoCv ? "Guardando..." : "Guardar Costo de Venta"}
              </button>
            </div>
          </div>
        )
      )}

      {/* ═══ TAB 2 — ALERTAS ═══ */}
      {tabLog === 2 && (
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

      {/* ═══ TAB 3 — ESTADÍSTICAS ═══ */}
      {tabLog === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Selector de período ── */}
          <div style={cardS}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 10 }}>📆 Período a consultar</div>
            <div style={{ display: "grid", gridTemplateColumns: m ? "1fr 1fr" : tipoPeriodoOp === "año" ? "1fr 1fr" : "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <div style={lbl}>Tipo de período</div>
                <CustomSelect value={tipoPeriodoOp} onChange={e => cambiarTipoPeriodoOp(e.target.value)} style={inp}>
                  <option value="mes">Mes</option>
                  <option value="trimestre">Trimestre</option>
                  <option value="semestre">Semestre</option>
                  <option value="año">Año</option>
                </CustomSelect>
              </div>
              <div>
                <div style={lbl}>Año</div>
                <CustomSelect value={anioOp} onChange={e => setAnioOp(Number(e.target.value))} style={inp}>
                  {aniosConDatos.map(a => <option key={a} value={a}>{a}</option>)}
                </CustomSelect>
              </div>
              {tipoPeriodoOp !== "año" && (
                <div>
                  <div style={lbl}>{tipoPeriodoOp === "mes" ? "Mes" : tipoPeriodoOp === "trimestre" ? "Trimestre" : "Semestre"}</div>
                  <CustomSelect value={subPeriodoOp} onChange={e => setSubPeriodoOp(Number(e.target.value))} style={inp}>
                    {tipoPeriodoOp === "mes" && Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i + 1}>{new Date(anioOp, i, 1).toLocaleDateString("es-CO", { month: "long" })}</option>
                    ))}
                    {tipoPeriodoOp === "trimestre" && [1, 2, 3, 4].map(t => (
                      <option key={t} value={t}>Trimestre {t} ({new Date(anioOp, (t - 1) * 3, 1).toLocaleDateString("es-CO", { month: "short" })}–{new Date(anioOp, (t - 1) * 3 + 2, 1).toLocaleDateString("es-CO", { month: "short" })})</option>
                    ))}
                    {tipoPeriodoOp === "semestre" && [1, 2].map(s => (
                      <option key={s} value={s}>Semestre {s} ({new Date(anioOp, (s - 1) * 6, 1).toLocaleDateString("es-CO", { month: "short" })}–{new Date(anioOp, (s - 1) * 6 + 5, 1).toLocaleDateString("es-CO", { month: "short" })})</option>
                    ))}
                  </CustomSelect>
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "#fb923c", fontWeight: 700, textTransform: "capitalize" }}>📍 {rangoOp.label}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => generarInformeOperativo("previsualizar")} disabled={generandoInformeOp} style={btnSecundario}>
                  👁 Previsualizar informe
                </button>
                <button onClick={() => generarInformeOperativo("descargar")} disabled={generandoInformeOp} style={btnPrimario(false, generandoInformeOp)}>
                  {generandoInformeOp ? "Generando..." : "📥 Descargar informe"}
                </button>
              </div>
            </div>
          </div>

          {/* ── Consolidado general del período ── */}
          <div style={{ display: "grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
            {[
              { l: "Total reservas gestionadas", v: statsOp.totalReservas, c: "#F97316", i: "📋" },
              { l: "Reservas llenadas",   v: `${statsOp.llenadas} (${statsOp.pctLlenadas}%)`, c: "#00C9A7", i: "✅" },
              { l: "Reservas canceladas", v: `${statsOp.canceladas} (${statsOp.pctCanceladas}%)`, c: "#FF6B6B", i: "❌" },
              { l: "Contenedores inspeccionados (Física)", v: statsOp.inspecciones.contenedoresInspeccionados, c: "#0EA5E9", i: "🔍" },
            ].map((s, i) => (
              <div key={i} style={{ ...cardS, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 20 }}>{s.i}</div>
                <div>
                  <div style={{ fontSize: m ? 16 : 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{s.l}</div>
                </div>
              </div>
            ))}
          </div>

          {statsOp.totalReservas === 0 ? (
            <div style={{ ...cardS, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
              No hay reservas registradas en este período.
            </div>
          ) : (
            <>
              {/* ── Composición de reservas (donut) + Principales del período ── */}
              <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "260px 1fr", gap: 16 }}>
                <div style={{ ...cardS, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 10, alignSelf: "flex-start" }}>🧩 Composición de reservas</div>
                  <div dangerouslySetInnerHTML={{ __html: svgDonut([
                    { label: "Llenadas",   value: statsOp.llenadas,   color: "#00C9A7" },
                    { label: "Canceladas", value: statsOp.canceladas, color: "#FF6B6B" },
                    { label: "En proceso", value: statsOp.enProceso,  color: "#64748B" },
                  ], { size: 148, holeColor: "#121316", textColor: "#fff", centerLabel: String(statsOp.totalReservas), centerSub: "reservas" }) }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", marginTop: 12 }}>
                    {[
                      { l: "Llenadas",   v: statsOp.llenadas,   pct: statsOp.pctLlenadas,   c: "#00C9A7" },
                      { l: "Canceladas", v: statsOp.canceladas, pct: statsOp.pctCanceladas, c: "#FF6B6B" },
                      { l: "En proceso", v: statsOp.enProceso,  pct: statsOp.pctEnProceso,  c: "#64748B" },
                    ].map((x, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11 }}>
                        <div style={{ width: 9, height: 9, borderRadius: 2, background: x.c, flexShrink: 0 }} />
                        <div style={{ flex: 1, color: "rgba(255,255,255,0.7)" }}>{x.l}</div>
                        <div style={{ fontWeight: 700, color: "white" }}>{x.v} <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>({x.pct}%)</span></div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={cardS}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 10 }}>🏆 Principales del período</div>
                  <div style={{ display: "grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(2,1fr)", gap: 10 }}>
                    {[
                      { l: "Puerto principal",         r: statsOp.puertos[0] },
                      { l: "Naviera principal",        r: statsOp.navieras[0] },
                      { l: "Transportador principal",  r: statsOp.transportadores[0] },
                      { l: "Destino principal",        r: statsOp.destinos[0] },
                    ].map((x, i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{x.l}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "white" }}>{x.r?.nombre || "—"}</div>
                        {x.r && <div style={{ fontSize: 10, color: "#fb923c" }}>{x.r.cantidad} ops · {x.r.pct}%</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Rankings: puertos / destinos / navieras / transportadores ── */}
              <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "1fr 1fr", gap: 16 }}>
                <div style={cardS}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>⚓ Puertos utilizados</div>
                  {statsOp.puertos.length === 0
                    ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Sin puerto de origen registrado en este período.</div>
                    : <div dangerouslySetInnerHTML={{ __html: svgBarrasH(statsOp.puertos.slice(0, 8).map(r => ({ label: r.nombre, value: r.cantidad, pct: r.pct })), { color: "#F97316", textColor: "#e2e8f0", trackColor: "rgba(255,255,255,0.07)" }) }} />}
                </div>
                <div style={cardS}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>🌎 Destinos de exportación</div>
                  {statsOp.destinos.length === 0
                    ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Sin puerto de destino registrado en este período.</div>
                    : <div dangerouslySetInnerHTML={{ __html: svgBarrasH(statsOp.destinos.slice(0, 8).map(r => ({ label: r.nombre, value: r.cantidad, pct: r.pct })), { color: "#0EA5E9", textColor: "#e2e8f0", trackColor: "rgba(255,255,255,0.07)" }) }} />}
                </div>
                <div style={cardS}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>🚢 Navieras</div>
                  {statsOp.navieras.length === 0
                    ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Sin naviera registrada en este período.</div>
                    : <div dangerouslySetInnerHTML={{ __html: svgBarrasH(statsOp.navieras.slice(0, 8).map(r => ({ label: r.nombre, value: r.cantidad, pct: r.pct })), { color: "#845EF7", textColor: "#e2e8f0", trackColor: "rgba(255,255,255,0.07)" }) }} />}
                </div>
                <div style={cardS}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>🚛 Transportadores</div>
                  {statsOp.transportadores.length === 0
                    ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Sin transporte registrado en este período.</div>
                    : <div dangerouslySetInnerHTML={{ __html: svgBarrasH(statsOp.transportadores.slice(0, 8).map(r => ({ label: r.nombre, value: r.cantidad, pct: r.pct })), { color: "#F9A826", textColor: "#e2e8f0", trackColor: "rgba(255,255,255,0.07)" }) }} />}
                </div>
              </div>

              {/* ── Inspecciones de contenedores en puerto ── */}
              <div style={cardS}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>🔍 Inspecciones de contenedores en puerto <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.4)", fontSize: 11 }}>(solo Física)</span></div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                    <b style={{ color: "#0EA5E9" }}>{statsOp.inspecciones.contenedoresInspeccionados}</b> contenedores · <b style={{ color: "#0EA5E9" }}>{statsOp.inspecciones.total}</b> inspecciones
                  </div>
                </div>
                {statsOp.inspecciones.total === 0 ? (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Sin inspecciones registradas en este período.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "1fr 1fr", gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>Por puerto</div>
                      <div dangerouslySetInnerHTML={{ __html: svgBarrasH(statsOp.inspecciones.porPuerto.slice(0, 8).map(r => ({ label: r.nombre, value: r.cantidad, pct: r.pct })), { color: "#0EA5E9", textColor: "#e2e8f0", trackColor: "rgba(255,255,255,0.07)" }) }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>Evolución en el período</div>
                      <div dangerouslySetInnerHTML={{ __html: svgLinea(statsOp.inspecciones.evolucion.map(mes => ({ label: mes.label, cantidad: mes.cantidad })), { color: "#0EA5E9", textColor: "#e2e8f0", gridColor: "rgba(255,255,255,0.08)" }) }} />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Información adicional — histórico completo, no depende del período elegido arriba ── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 6 }}>
            Información adicional (histórico completo)
          </div>

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
              <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>🔍 Inspecciones por resultado</div>
              {log.inspecciones.length === 0
                ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Sin inspecciones registradas.</div>
                : <BarraLista items={estadisticas.porResultadoInspeccion} />}
            </div>
            {estadisticas.porAlerta.length > 0 && (
              <div style={cardS}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>🔔 Alertas activas por tipo</div>
                <BarraLista items={estadisticas.porAlerta} />
              </div>
            )}
          </div>

          <div style={cardS}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>📈 Operaciones creadas por mes (últimos 6 meses)</div>
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
        </div>
      )}

      {/* ═══ TAB 4 — CONTRATOS CON NAVIERAS ═══ */}
      {tabLog === 4 && (
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
