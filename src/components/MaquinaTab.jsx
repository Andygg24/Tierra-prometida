import { useState, useEffect, useMemo, useRef, useCallback, useId } from "react";
import { usePersonal } from "../hooks/usePersonal.js";
import { useMaquina } from "../hooks/useMaquina.js";
import { useMaquinaDiseno } from "../hooks/useMaquinaDiseno.js";
import { registrarActividad } from "../hooks/useActividad.js";
import LimonLoader from "./LimonLoader.jsx";

const nombreUsuarioSesion = () => {
  try { return JSON.parse(localStorage.getItem("tp_session"))?.nombre || ""; } catch { return ""; }
};

// Antes de conectar el diseño del plano a Supabase, cada pieza vivía en el
// localStorage de este navegador bajo estas llaves. Se dejó de leer de ahí,
// pero lo que ya hubiera quedado guardado en este navegador sigue estando
// — esto lo detecta para poder recuperarlo con un clic y subirlo.
const LLAVES_RESPALDO_LOCAL = {
  calibCfg: "tp_maquina_calibradora_cfg",
  posCustom: "tp_maquina_posiciones_estaciones",
  posPersonas: "tp_maquina_posiciones_personas",
  objetos: "tp_maquina_objetos_libres",
  rutasPersonas: "tp_maquina_rutas_personas",
};
function leerRespaldoLocal() {
  try {
    const partes = {};
    let algo = false;
    for (const [campo, llave] of Object.entries(LLAVES_RESPALDO_LOCAL)) {
      const raw = localStorage.getItem(llave);
      if (!raw) continue;
      const val = JSON.parse(raw);
      const vacio = Array.isArray(val) ? val.length === 0 : Object.keys(val || {}).length === 0;
      partes[campo] = val;
      if (!vacio) algo = true;
    }
    return algo ? partes : null;
  } catch { return null; }
}

function fmtDur(ms) {
  if (ms == null || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function iniciales(nombre) {
  return (nombre || "").trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || "").join("");
}

const CSS = `
@keyframes mq-highlight {
  0%   { transform: scale(1.08); box-shadow: 0 0 0 2px rgba(0,201,167,0.7); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0,201,167,0); }
}
@keyframes mq-pop { from { opacity:0; transform: translateY(-6px) scale(0.92); } to { opacity:1; transform: translateY(0) scale(1); } }
`;

// ── Plano isométrico de la línea real ──────────────────────────────────────
// El recorrido real (según lo descrito): Recepción -> Alimentación ->
// Selección -> Lavado -> Encerado -> Secado -> [giro en U] ->
// Fotoselección -> Empaque y Calibración -> Pesaje -> Paletizado ->
// Patio de Pallets -> Cargue de Camión. La máquina tiene forma de "U"/"N":
// la primera mitad va en una fila, dobla, y la segunda mitad vuelve en
// paralelo — por eso la fila 0 y la fila 1 de la cuadrícula isométrica.
//
// Solo los tipo:"area" corresponden a filas reales de `maquina_areas` (ahí
// se ubica gente). Los demás son tramos 100% automáticos de la máquina:
// se dibujan con su propio detalle animado (rodillos, aspersor, horno,
// cámara) pero no aceptan personas.
const STAGES = [
  { key: "recepcion",    tipo: "area",     nombre: "Recepción",             icono: "🚚", col: 0, row: 0 },
  { key: "alimentacion", tipo: "area",     nombre: "Alimentación",          icono: "🍋", col: 1, row: 0 },
  { key: "seleccion",    tipo: "area",     nombre: "Selección",             icono: "🔍", col: 2, row: 0 },
  { key: "lavado",       tipo: "lavado",   nombre: "Lavado",                icono: "💧", col: 3, row: 0 },
  { key: "encerado",     tipo: "encerado", nombre: "Encerado",              icono: "🟡", col: 4, row: 0 },
  { key: "secado",       tipo: "secado",   nombre: "Secado",                icono: "🔥", col: 5, row: 0 },
  { key: "foto",         tipo: "foto",     nombre: "Fotoselección",         icono: "📸", col: 5, row: 1 },
  { key: "empaque",      tipo: "area",     nombre: "Empaque y Calibración", icono: "📦", col: 4, row: 1 },
  { key: "pesaje",       tipo: "area",     nombre: "Pesaje",                icono: "⚖️", col: 3, row: 1 },
  { key: "paletizado",   tipo: "area",     nombre: "Paletizado",            icono: "🏗️", col: 2, row: 1 },
  { key: "patio",        tipo: "patio",    nombre: "Patio de Pallets",      icono: "🟫", col: 1, row: 1 },
  { key: "cargue",       tipo: "area",     nombre: "Cargue de Camión",      icono: "🚛", col: 0, row: 1 },
];

const TILE_DX = 170, TILE_DY = 90;     // paso en píxeles por celda de la cuadrícula iso — bien separado para que las fichas de gente no se crucen entre estaciones
const PLAT_W = 90, PLAT_H = 48;        // tamaño del rombo (cara superior) de cada estación
const PLAT_DEPTH = 22;                 // alto de las caras laterales del prisma
const COLOR_MAQUINA = "#4b5563";       // gris acero para los tramos automáticos (no son "equipos")

function isoPoint(col, row) {
  // Espejo horizontal respecto a la versión anterior — la línea venía
  // dibujada al revés (izquierda/derecha invertidas).
  return { x: (row - col) * TILE_DX, y: (col + row) * TILE_DY };
}

// Convierte un punto en coordenadas de pantalla (clientX/Y) a coordenadas
// internas del SVG del plano — usa la matriz real del navegador (getScreenCTM)
// así que da la posición exacta sin importar si el plano está escalado por
// CSS (por ejemplo en móvil). Se usa para las asas de rotar/redimensionar.
function puntoSvg(svgEl, clientX, clientY) {
  if (!svgEl || !svgEl.createSVGPoint) return { x: clientX, y: clientY };
  const pt = svgEl.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const loc = pt.matrixTransform(ctm.inverse());
  return { x: loc.x, y: loc.y };
}

// Oscurece un color hex — para las caras laterales del prisma (más oscuras
// que la cara superior, como un cubo iluminado desde arriba).
function shade(hex, factor) {
  const h = (hex || "#666666").replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const num = parseInt(full, 16) || 0x666666;
  const r = Math.max(0, Math.min(255, Math.round(((num >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((num >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((num & 255) * factor)));
  return `rgb(${r},${g},${b})`;
}

function poly(pts) { return pts.map(p => `${p[0]},${p[1]}`).join(" "); }

// Rodillos giratorios + aspersor goteando — Lavado y Encerado.
function DetalleRodillos({ cx, cy, tinte = "#38BDF8" }) {
  const offsets = [-24, 0, 24];
  return (
    <g>
      {offsets.map((dx, i) => (
        <g key={`r${i}`} transform={`translate(${cx + dx},${cy + 2})`}>
          <circle r="8" fill="#cbd5e1" stroke="#475569" strokeWidth="1.5" />
          <g>
            <line x1="0" y1="0" x2="7" y2="0" stroke="#475569" strokeWidth="1.5" />
            <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="0.7s" repeatCount="indefinite" />
          </g>
        </g>
      ))}
      {offsets.map((dx, i) => (
        <circle key={`g${i}`} cx={cx + dx} cy={cy - 15} r="2.4" fill={tinte}>
          <animate attributeName="cy" values={`${cy - 15};${cy - 1};${cy - 15}`} dur="1.1s" repeatCount="indefinite" begin={`${i * 0.2}s`} />
          <animate attributeName="opacity" values="1;0.15;1" dur="1.1s" repeatCount="indefinite" begin={`${i * 0.2}s`} />
        </circle>
      ))}
    </g>
  );
}

// Horno que seca y endurece la cera — brillo pulsante.
function DetalleHorno({ cx, cy }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <circle r="11" fill="#f97316" opacity="0.45">
        <animate attributeName="r" values="9;13;9" dur="1s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.6;0.3" dur="1s" repeatCount="indefinite" />
      </circle>
      <circle r="5.5" fill="#fde68a">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="0.6s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

// Cabina de fotoselección — lente que destella periódicamente.
function DetalleCamara({ cx, cy }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <circle r="7.5" fill="#0f172a" stroke="#38BDF8" strokeWidth="1.5" />
      <circle r="3.4" fill="#38BDF8">
        <animate attributeName="opacity" values="1;1;0.1;1;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <circle r="7.5" fill="none" stroke="#fff" strokeWidth="2" opacity="0">
        <animate attributeName="opacity" values="0;0;0.9;0" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="r" values="7.5;7.5;14;14" dur="1.6s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

// Camión de reparto estacionado junto a Recepción, descargando — con humo
// de escape sutil para que no se sienta estático.
function DetalleCamion({ cx, cy }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <ellipse cx="0" cy="19" rx="36" ry="5" fill="rgba(0,0,0,0.35)" />
      <rect x="-34" y="-19" width="46" height="28" rx="2" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="1.2" />
      <rect x="-34" y="-19" width="46" height="8" fill="#cbd5e1" />
      <path d="M 12 -15 h 13 a 5 5 0 0 1 5 5 v 10 a 2 2 0 0 1 -2 2 h -16 z" fill="#1d4ed8" stroke="#1e3a8a" strokeWidth="1.2" />
      <rect x="17" y="-11" width="8" height="7" rx="1" fill="#bfdbfe" />
      <circle cx="-20" cy="10" r="5.5" fill="#111827" stroke="#374151" strokeWidth="1" />
      <circle cx="-2" cy="10" r="5.5" fill="#111827" stroke="#374151" strokeWidth="1" />
      <circle cx="22" cy="10" r="5.5" fill="#111827" stroke="#374151" strokeWidth="1" />
      <circle cx="31" cy="-17" r="2" fill="#cbd5e1" opacity="0.7">
        <animate attributeName="cy" values="-17;-28;-17" dur="2.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0;0.7" dur="2.2s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

// ── Gente física trabajando en cada estación ────────────────────────────
// Figurita de operario (casco + camisa + cabeza + piernas) con un brazo
// animado — se reutiliza en todas las escenas de abajo, cada una con su
// propia pose/objeto, para que se vea gente haciendo la tarea, no solo
// íconos sueltos. Los chips (con nombre/cronómetro) siguen aparte, arriba
// o abajo de la plataforma, para gestionar quién está y moverlo.
function Trabajador({ x, y, casco = "#fbbf24", espejo = false, brazoDesde = -15, brazoHasta = 35, dur = "1.3s", retraso = "0s", objeto = null }) {
  const s = espejo ? -1 : 1;
  return (
    <g transform={`translate(${x},${y}) scale(${s},1)`}>
      <line x1="-2.3" y1="9" x2="-2.7" y2="18" stroke="#334155" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="2.3" y1="9" x2="2.7" y2="18" stroke="#334155" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="-4" y="-7" width="8" height="16" rx="3" fill="#f1f5f9" />
      <circle cy="-11" r="3" fill="#e0ac7c" />
      <path d="M -3.2 -12.8 a 3.2 3.2 0 0 1 6.4 0 z" fill={casco} />
      <g transform="translate(3.6,-2)">
        <g>
          <animateTransform attributeName="transform" type="rotate" values={`${brazoDesde};${brazoHasta};${brazoDesde}`} dur={dur} begin={retraso} repeatCount="indefinite" />
          <line x1="0" y1="0" x2="6.5" y2="0" stroke="#f1f5f9" strokeWidth="2.4" strokeLinecap="round" />
          {objeto}
        </g>
      </g>
    </g>
  );
}

// Personaje que de verdad camina: piernas y brazos alternados en bucle
// (ciclo de caminata), para ponerlo sobre un <animateMotion> y que se vea
// una persona caminando por el plano, no solo una ficha deslizándose.
function TrabajadorCaminando({ casco = "#fbbf24", nombre = "" }) {
  const dur = "0.6s";
  return (
    <g>
      {/* piernas — cuelgan desde la cadera y se balancean adelante/atrás,
          una opuesta a la otra (paso normal, no un salto simétrico) */}
      <g transform="translate(-2.3,9)">
        <g>
          <animateTransform attributeName="transform" type="rotate" values="-26;26;-26" dur={dur} repeatCount="indefinite" />
          <line x1="0" y1="0" x2="0" y2="9" stroke="#334155" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      </g>
      <g transform="translate(2.3,9)">
        <g>
          <animateTransform attributeName="transform" type="rotate" values="26;-26;26" dur={dur} repeatCount="indefinite" />
          <line x1="0" y1="0" x2="0" y2="9" stroke="#334155" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      </g>
      <rect x="-4" y="-7" width="8" height="16" rx="3" fill="#f1f5f9" />
      <circle cy="-11" r="3" fill="#e0ac7c" />
      <path d="M -3.2 -12.8 a 3.2 3.2 0 0 1 6.4 0 z" fill={casco} />
      {/* brazos — cuelgan desde el hombro (no salen horizontales, si no
          parece que aletea) y se balancean opuestos a la pierna de su
          mismo lado, como al caminar de verdad */}
      <g transform="translate(-3.6,-3)">
        <g>
          <animateTransform attributeName="transform" type="rotate" values="20;-20;20" dur={dur} repeatCount="indefinite" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#f1f5f9" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      </g>
      <g transform="translate(3.6,-3)">
        <g>
          <animateTransform attributeName="transform" type="rotate" values="-20;20;-20" dur={dur} repeatCount="indefinite" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#f1f5f9" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      </g>
      {nombre && (
        <text y="-19" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="white" stroke="#0b0b0f" strokeWidth="2.2" paintOrder="stroke" style={{ pointerEvents: "none" }}>
          {nombre}
        </text>
      )}
    </g>
  );
}

const cajaChica = (
  <rect x="4" y="-4.5" width="8" height="7" rx="1.2" fill="#a16207" stroke="#78350f" strokeWidth="0.8" />
);
const limonChico = <circle cx="7.5" cy="-2" r="2.6" fill="#84cc16" />;

// Fase 1 — dos personas bajan canastillas del camión y las apilan; otra
// pesa la estiba ya armada en una báscula grande. El camión se dibuja
// aparte (DetalleCamion) en el mismo offset (cx+110, cy-58) — estas dos
// personas quedan justo a su lado, bajando la carga.
function TareaRecepcion({ cx, cy, casco }) {
  const tx = cx + 110, ty = cy - 58;
  return (
    <g>
      <Trabajador x={tx - 30} y={ty + 27} casco={casco} brazoDesde={-50} brazoHasta={5} dur="1.3s" objeto={cajaChica} />
      <Trabajador x={tx - 8} y={ty + 31} casco={casco} espejo brazoDesde={-10} brazoHasta={40} dur="1.3s" retraso="0.4s" objeto={cajaChica} />

      {/* báscula grande de piso, con una persona pesando la estiba */}
      <g transform={`translate(${cx - 48},${cy + 4})`}>
        <rect x="-17" y="7" width="34" height="7" rx="2" fill="#374151" stroke="#1f2937" strokeWidth="1" />
        <rect x="-3" y="-8" width="6" height="16" fill="#9ca3af" />
        <rect x="-8" y="-15" width="16" height="8" rx="1.5" fill="#0f172a" stroke="#38BDF8" strokeWidth="1" />
        <rect x="-10" y="-2" width="20" height="9" rx="1" fill="#a16207" stroke="#78350f" strokeWidth="0.8" />
      </g>
      <Trabajador x={cx - 20} y={cy + 6} casco={casco} espejo brazoDesde={-20} brazoHasta={20} dur="1.6s" />
    </g>
  );
}

// Fase 2 — dos personas cogen canastillas y las echan a la máquina.
function TareaAlimentacion({ cx, cy, casco }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <Trabajador x={-10} y={2} casco={casco} brazoDesde={-10} brazoHasta={55} dur="1.2s" objeto={cajaChica} />
      <Trabajador x={11} y={2} casco={casco} espejo brazoDesde={-10} brazoHasta={55} dur="1.2s" retraso="0.3s" objeto={cajaChica} />
    </g>
  );
}

// Fase 2b — dos personas seleccionando fruta buena/mala sobre la banda.
function TareaSeleccion({ cx, cy, casco }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <Trabajador x={-10} y={2} casco={casco} brazoDesde={-5} brazoHasta={35} dur="1s" objeto={limonChico} />
      <Trabajador x={11} y={2} casco={casco} espejo brazoDesde={-5} brazoHasta={35} dur="1s" retraso="0.4s" objeto={limonChico} />
    </g>
  );
}

// Fase 8 — persona empacando el limón calibrado en la caja.
function TareaEmpaque({ cx, cy, casco }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <rect x="-13" y="2" width="15" height="10" rx="1.5" fill="none" stroke="#d6d3d1" strokeWidth="1.3" />
      <Trabajador x={8} y={2} casco={casco} espejo brazoDesde={-30} brazoHasta={20} dur="1.1s" objeto={limonChico} />
    </g>
  );
}

// Fase 9 — persona pesando la caja ya empacada.
function TareaPesaje({ cx, cy, casco }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <line x1="-9" y1="8" x2="9" y2="8" stroke="#94a3b8" strokeWidth="1.6" />
      <rect x="-6" y="3" width="12" height="5" rx="1" fill="none" stroke="#94a3b8" strokeWidth="1.3" />
      <Trabajador x={12} y={2} casco={casco} espejo brazoDesde={-25} brazoHasta={15} dur="1.3s" objeto={cajaChica} />
    </g>
  );
}

// Fase 10 — persona envolviendo la estiba con zunchos.
function TareaPaletizado({ cx, cy, casco }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <rect x="-8" y="-6" width="16" height="16" rx="1.5" fill="none" stroke="#d6d3d1" strokeWidth="1.3" />
      <rect x="-10" y="-1" width="0" height="2.6" fill="#facc15">
        <animate attributeName="width" values="0;20;20;0" dur="1.6s" repeatCount="indefinite" />
      </rect>
      <Trabajador x={13} y={2} casco={casco} espejo brazoDesde={-15} brazoHasta={45} dur="1.6s" objeto={null} />
    </g>
  );
}

// Fase 12 — persona empujando la caja/pallet hacia el camión.
function TareaCargue({ cx, cy, casco }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <rect x="8" y="-13" width="14" height="16" rx="1.5" fill="#374151" stroke="#111827" strokeWidth="1" />
      <Trabajador x={-10} y={2} casco={casco} brazoDesde={-5} brazoHasta={35} dur="1.2s" objeto={cajaChica} />
    </g>
  );
}

function DetalleTarea({ tarea, cx, cy, casco }) {
  const Comp = {
    recepcion: TareaRecepcion, alimentacion: TareaAlimentacion, seleccion: TareaSeleccion,
    empaque: TareaEmpaque, pesaje: TareaPesaje, paletizado: TareaPaletizado, cargue: TareaCargue,
  }[tarea];
  return Comp ? <Comp cx={cx} cy={cy} casco={casco} /> : null;
}

// Ficha que viaja por la banda cuando alguien cambia de estación — arranca
// en la posición de origen y en el siguiente frame se anima hacia el
// destino (así el navegador sí anima el cambio, no lo salta).
function FichaViajera({ from, to, color }) {
  const [enDestino, setEnDestino] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEnDestino(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const p = enDestino ? to : from;
  return (
    <div style={{
      position: "absolute", top: p.y - 6, left: p.x - 6,
      width: 12, height: 12, borderRadius: "50%", background: color,
      boxShadow: `0 0 12px ${color}`, transition: "left 0.9s cubic-bezier(.4,0,.2,1), top 0.9s cubic-bezier(.4,0,.2,1)",
      pointerEvents: "none", zIndex: 6,
    }} />
  );
}

// Posiciones fijas de las 12 etapas — no dependen de los datos, así que se
// calculan una sola vez fuera del componente.
const LAYOUT = (() => {
  const crudos = STAGES.map(s => isoPoint(s.col, s.row));
  const xs = crudos.map(p => p.x), ys = crudos.map(p => p.y);
  // padLeft se deja igual a propósito: agrandarlo correría el origen y
  // desalinearía las posiciones ya guardadas (arrastradas a mano) en
  // localStorage. padRight y padBottom sí se pueden crecer libremente
  // porque no mueven el origen, solo agrandan el lienzo hacia ese lado.
  const padLeft = PLAT_W / 2 + 90;
  const padRight = PLAT_W / 2 + 280;
  const padTop = PLAT_H / 2 + 260;    // espacio para el rótulo + fichas de personas (hasta 8 en una estación)
  const padBottom = PLAT_H / 2 + PLAT_DEPTH + 220;
  const minX = Math.min(...xs) - padLeft, maxX = Math.max(...xs) + padRight;
  const minY = Math.min(...ys) - padTop, maxY = Math.max(...ys) + padBottom;
  const puntos = crudos.map(p => ({ x: p.x - minX, y: p.y - minY }));
  const ruta = puntos.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");
  return { puntos, width: maxX - minX, height: maxY - minY, ruta };
})();

// El túnel real de la planta hace Lavado + Encerado + Secado en una sola
// máquina larga de acero inoxidable con paneles perforados — no en tres
// cuerpos sueltos. Se dibuja como un solo prisma alargado que sigue la
// misma línea (ya son 3 puntos colineales del plano), desde un poco antes
// de Lavado hasta un poco después de Secado.
function TunelLavadoEncSecado({ puntos }) {
  const iL = STAGES.findIndex(s => s.key === "lavado");
  const iS = STAGES.findIndex(s => s.key === "secado");
  const pL = puntos[iL], pS = puntos[iS];
  const dx = pS.x - pL.x, dy = pS.y - pL.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;   // a lo largo del túnel
  const px = -uy, py = ux;              // perpendicular (ancho del túnel)
  const HALF_W = 46, DEPTH = 34;
  // Solo se extiende antes de Lavado (para que se vea como si la fruta
  // entrara al túnel) — del lado de Secado NO se pasa del punto real, así
  // la banda hacia Fotoselección queda claramente después del túnel, no
  // tapada por él.
  const start = { x: pL.x - ux * 55, y: pL.y - uy * 55 };
  const end = { x: pS.x, y: pS.y };
  // Punto a fracción `t` del recorrido (0=inicio, 1=fin), desplazado `w`
  // perpendicular al ancho del túnel.
  const along = (t, w) => ({
    x: start.x + (end.x - start.x) * t + px * w,
    y: start.y + (end.y - start.y) * t + py * w,
  });

  const a = along(0, -HALF_W), b = along(0, HALF_W), cc = along(1, HALF_W), d = along(1, -HALF_W);
  const top = [[a.x, a.y], [b.x, b.y], [cc.x, cc.y], [d.x, d.y]];
  const left = [[a.x, a.y], [d.x, d.y], [d.x, d.y + DEPTH], [a.x, a.y + DEPTH]];
  const right = [[b.x, b.y], [cc.x, cc.y], [cc.x, cc.y + DEPTH], [b.x, b.y + DEPTH]];

  const nSeg = 5;
  const costuras = Array.from({ length: nSeg - 1 }, (_, k) => {
    const t = (k + 1) / nSeg;
    return [along(t, -HALF_W), along(t, HALF_W)];
  });
  const remaches = [];
  for (let k = 0; k <= nSeg; k++) {
    const t = k / nSeg;
    remaches.push(along(t, -HALF_W + 6), along(t, HALF_W - 6));
  }

  // Ventana perforada solo en el último tramo, como en la máquina real.
  const agujeros = [];
  for (let t = 0.78; t < 0.97; t += 0.045) {
    [-HALF_W * 0.45, 0, HALF_W * 0.45].forEach(w => agujeros.push(along(t, w)));
  }

  // Patas de soporte en los dos extremos y el centro.
  const PATA_LARGO = 30;
  const patas = [0.06, 0.5, 0.94].map(t => [along(t, -HALF_W + 8), along(t, HALF_W - 8)]);

  // Panel de control con pantalla, cerca del inicio (como el de la foto real).
  const panel = along(0.015, HALF_W + 5);

  return (
    <g>
      {patas.map(([p1, p2], idx) => (
        <g key={`pata-${idx}`}>
          <line x1={p1.x} y1={p1.y + DEPTH} x2={p1.x} y2={p1.y + DEPTH + PATA_LARGO} stroke="#4b5563" strokeWidth="3.6" strokeLinecap="round" />
          <line x1={p2.x} y1={p2.y + DEPTH} x2={p2.x} y2={p2.y + DEPTH + PATA_LARGO} stroke="#4b5563" strokeWidth="3.6" strokeLinecap="round" />
        </g>
      ))}

      <polygon points={poly(left)} fill="#3f4652" />
      <polygon points={poly(right)} fill="#5b6572" />
      <polygon points={poly(top)} fill="#9aa5b1" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      <polygon points={poly(top)} fill="url(#mq-sheen)" pointerEvents="none" />

      {/* cresta central del techo */}
      <line x1={along(0.02, 0).x} y1={along(0.02, 0).y} x2={along(0.98, 0).x} y2={along(0.98, 0).y} stroke="rgba(255,255,255,0.5)" strokeWidth="2" />

      {/* costuras entre paneles + remaches */}
      {costuras.map(([p1, p2], idx) => (
        <line key={`costura-${idx}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(0,0,0,0.3)" strokeWidth="1.3" />
      ))}
      {remaches.map((p, idx) => <circle key={`rem-${idx}`} cx={p.x} cy={p.y} r="1.3" fill="#4b5563" />)}

      {/* ventana perforada */}
      {agujeros.map((p, idx) => <circle key={`ag-${idx}`} cx={p.x} cy={p.y} r="2.6" fill="#2b3138" opacity="0.55" />)}

      {/* panel de control con pantalla y luces */}
      <g transform={`translate(${panel.x},${panel.y})`}>
        <rect x="-8" y="-17" width="16" height="21" rx="1.5" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="1" />
        <rect x="-6" y="-14" width="12" height="7" rx="1" fill="#0f172a" stroke="#38BDF8" strokeWidth="0.8" />
        <circle cx="-4" cy="1" r="1.3" fill="#22c55e">
          <animate attributeName="opacity" values="1;0.25;1" dur="1.4s" repeatCount="indefinite" />
        </circle>
        <circle cx="0" cy="1" r="1.3" fill="#eab308" />
        <circle cx="4" cy="1" r="1.3" fill="#ef4444" />
      </g>
    </g>
  );
}

function rotar(vx, vy, deg) {
  const r = (deg * Math.PI) / 180;
  return { x: vx * Math.cos(r) - vy * Math.sin(r), y: vx * Math.sin(r) + vy * Math.cos(r) };
}

// Bandeja azul rectangular (cajón), no un abanico — nace junto al eje
// central y se proyecta hacia afuera en línea recta, con un ancho casi
// uniforme (solo un poco más angosta donde se une al eje), como en la
// foto real. Devuelve también su propio sistema local (dir/perp/base)
// para poder ubicar la fruta SIEMPRE dentro de su silueta.
function bandejaPoly(base, dir, largo, wNear, wFar) {
  const perp = { x: -dir.y, y: dir.x };
  const near1 = { x: base.x + perp.x * wNear / 2, y: base.y + perp.y * wNear / 2 };
  const near2 = { x: base.x - perp.x * wNear / 2, y: base.y - perp.y * wNear / 2 };
  const farC = { x: base.x + dir.x * largo, y: base.y + dir.y * largo };
  const far1 = { x: farC.x + perp.x * wFar / 2, y: farC.y + perp.y * wFar / 2 };
  const far2 = { x: farC.x - perp.x * wFar / 2, y: farC.y - perp.y * wFar / 2 };
  return {
    puntos: [[near1.x, near1.y], [far1.x, far1.y], [far2.x, far2.y], [near2.x, near2.y]],
    centro: { x: (farC.x + base.x) / 2, y: (farC.y + base.y) / 2 },
    base, dir, perp, largo, wNear, wFar,
  };
}

// Punto dentro de una bandeja a fracción `t` de su largo (0=junto al eje,
// 1=extremo afuera) y `s` de su ancho (-0.5..0.5) — así la fruta cae
// siempre dentro de la silueta real, sin importar el ángulo de la bandeja.
function puntoEnBandeja(b, t, s) {
  const w = b.wNear + (b.wFar - b.wNear) * t;
  return {
    x: b.base.x + b.dir.x * b.largo * t + b.perp.x * w * s,
    y: b.base.y + b.dir.y * b.largo * t + b.perp.y * w * s,
  };
}

// Valores por defecto de la calibradora — editables en vivo desde el botón
// "Editar máquina".
// Posiciones personalizadas de las 12 estaciones fijas — por defecto usan
// LAYOUT.puntos (el plano calculado), pero cualquiera se puede arrastrar y
// desde ahí queda con su propia posición guardada, igual que los objetos
// sueltos. Así "todo lo que está en el plano" se puede mover, no solo lo
// que se agrega después. Todo el diseño (esto, posiciones de personas,
// objetos, calibradora, rutas) se guarda en Supabase (tabla
// `maquina_diseno`, ver useMaquinaDiseno) para que se vea igual para
// cualquiera que entre a este módulo, no solo en este navegador.

// Rutas de caminata: recorrido visual (no afecta la ubicación real en
// Supabase de Asistencia) de una persona entre varias estaciones — va de
// la primera a la última en orden y, al llegar, se devuelve por el mismo
// camino, en bucle.
const VELOCIDAD_CAMINATA = 55; // px/s — a qué tan rápido recorre la ruta

const CALIB_CFG_DEFAULT = {
  angulo: 0,       // grados respecto a perpendicular al eje — 0 = recto
  largo: 40,       // largo de cada bandeja
  ancho: 25,       // ancho de cada bandeja (igual en ambos extremos = rectángulo)
  spineHalf: 88,   // medio largo del eje central
};

// Máquina calibradora real: eje central de cadena con bandejas azules a los
// dos lados, como en las fotos de la planta — no la plataforma genérica de
// antes. `cfg` viene del panel de edición (ver más abajo); si no se pasa,
// usa los valores por defecto.
function MaquinaCalibradora({ cfg, puntos }) {
  const c = { ...CALIB_CFG_DEFAULT, ...cfg };
  const iF = STAGES.findIndex(s => s.key === "foto");
  const iE = STAGES.findIndex(s => s.key === "empaque");
  const iP = STAGES.findIndex(s => s.key === "pesaje");
  const pF = puntos[iF], pE = puntos[iE], pP = puntos[iP];
  const dx = pP.x - pF.x, dy = pP.y - pF.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;   // a lo largo del eje (dirección del flujo)
  const px = -uy, py = ux;              // perpendicular
  const along = (t, w = 0) => ({ x: pE.x + ux * t + px * w, y: pE.y + uy * t + py * w });

  const SPINE_HALF = c.spineHalf;
  const spineA = along(-SPINE_HALF), spineB = along(SPINE_HALF);
  const enEje = (t, w = 0) => {
    const b = { x: spineA.x + (spineB.x - spineA.x) * t, y: spineA.y + (spineB.y - spineA.y) * t };
    return { x: b.x + px * w, y: b.y + py * w };
  };

  const N = 4; // bandejas por lado (representativas de las 8 reales)
  const dirIzq = rotar(px, py, c.angulo);
  const dirDer = rotar(-px, -py, -c.angulo);
  const bandejas = [];
  const tS = [];
  for (let k = 0; k < N; k++) {
    const t = 0.1 + ((k + 0.5) / N) * 0.8;
    tS.push(t);
    const base = enEje(t);
    bandejas.push({ ...bandejaPoly(base, dirIzq, c.largo, c.ancho, c.ancho), t });
    bandejas.push({ ...bandejaPoly(base, dirDer, c.largo, c.ancho, c.ancho), t });
  }
  // Divisores metálicos entre bandejas consecutivas del mismo lado.
  const divisores = [];
  for (let k = 0; k < N - 1; k++) {
    const tMid = (tS[k] + tS[k + 1]) / 2;
    [dirIzq, dirDer].forEach(dir => {
      const base = enEje(tMid);
      divisores.push([base, { x: base.x + dir.x * (c.largo + 4), y: base.y + dir.y * (c.largo + 4) }]);
    });
  }

  // Patas de soporte, elevando la máquina del piso (como la real).
  const PATA = 28;
  const patas = [0.08, 0.5, 0.92].map(t => {
    const b = enEje(t);
    return [{ x: b.x - px * 16, y: b.y - py * 16 }, { x: b.x + px * 16, y: b.y + py * 16 }];
  });

  // Tolva de entrada — embudo donde cae la fruta que viene de Fotoselección.
  const tolva = [
    [spineA.x - px * 20, spineA.y - py * 20],
    [spineA.x + px * 20, spineA.y + py * 20],
    [spineA.x - ux * 26 + px * 9, spineA.y - uy * 26 + py * 9],
    [spineA.x - ux * 26 - px * 9, spineA.y - uy * 26 - py * 9],
  ];

  return (
    <g>
      {/* patas de soporte */}
      {patas.map(([p1, p2], idx) => (
        <g key={`pata-${idx}`}>
          <line x1={p1.x} y1={p1.y} x2={p1.x} y2={p1.y + PATA} stroke="#4b5563" strokeWidth="3.4" strokeLinecap="round" />
          <line x1={p2.x} y1={p2.y} x2={p2.x} y2={p2.y + PATA} stroke="#4b5563" strokeWidth="3.4" strokeLinecap="round" />
          <line x1={p1.x - 6} y1={p1.y + PATA * 0.55} x2={p2.x + 6} y2={p2.y + PATA * 0.55} stroke="#374151" strokeWidth="1.6" />
        </g>
      ))}

      {/* tolva de entrada */}
      <polygon points={poly(tolva)} fill="#8b95a3" stroke="#4b5563" strokeWidth="1.2" />

      {/* pasarela angosta junto al eje, como una plataforma de acceso */}
      <polygon
        points={poly([
          [spineA.x - px * 7, spineA.y - py * 7], [spineB.x - px * 7, spineB.y - py * 7],
          [spineB.x - px * 15, spineB.y - py * 15], [spineA.x - px * 15, spineA.y - py * 15],
        ])}
        fill="#6b7280" stroke="#374151" strokeWidth="0.8"
      />

      {/* bandejas azules, con reborde interior y remaches en los divisores */}
      {bandejas.map((b, idx) => (
        <g key={idx}>
          <polygon points={poly(b.puntos)} fill="#2f5fdb" stroke="#16296b" strokeWidth="1.6" />
          <polygon points={poly(b.puntos)} fill="url(#mq-sheen)" pointerEvents="none" />
          <polygon
            points={poly(b.puntos.map(([x, y]) => {
              const cx0 = (b.puntos[0][0] + b.puntos[2][0]) / 2, cy0 = (b.puntos[0][1] + b.puntos[2][1]) / 2;
              const f = 0.16; // mismo factor en las 4 esquinas — reborde parejo, sin torcerse
              return [x + (cx0 - x) * f, y + (cy0 - y) * f];
            }))}
            fill="none" stroke="#5c85f0" strokeWidth="1" opacity="0.8"
          />
        </g>
      ))}
      {divisores.map(([p1, p2], idx) => (
        <g key={`div-${idx}`}>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#374151" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx={p1.x} cy={p1.y} r="1.4" fill="#9ca3af" />
        </g>
      ))}
      {bandejas.map((b, idx) => (
        [[0.42, -0.22], [0.58, 0.18], [0.75, -0.08], [0.68, 0.3], [0.5, 0.05]].map(([t, s], j) => {
          const p = puntoEnBandeja(b, t, s);
          return <circle key={`${idx}-${j}`} cx={p.x} cy={p.y} r="2.5" fill="#84cc16" stroke="#4d7c0f" strokeWidth="0.4" />;
        })
      ))}

      {/* eje central de cadena */}
      <line x1={spineA.x} y1={spineA.y} x2={spineB.x} y2={spineB.y} stroke="#1f2937" strokeWidth="12" strokeLinecap="round" />
      <line x1={spineA.x} y1={spineA.y} x2={spineB.x} y2={spineB.y} stroke="#4b5563" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="4 5" />
    </g>
  );
}

// ── Ecosistema de objetos libres ───────────────────────────────────────────
// Piezas sueltas que el usuario agrega y acomoda a mano dentro del plano
// (pallets, básculas, cajas, muros, rejas, techos, sillas, canecas,
// montacargas, estibadores, tramos de banda extra) — independientes de las
// 7 estaciones fijas.
// `largoDef` es una tercera medida (aparte de ancho/alto) que se dibuja como
// un bloque de profundidad debajo del objeto — para darle una noción de
// "largo" real (por ejemplo, cuánto se alarga un montacargas o un tramo de
// banda), no solo su huella ancho×alto en el plano.
const TIPOS_OBJETO = {
  pallet:      { label: "Pallet",       icono: "🟩", anchoDef: 46, altoDef: 66, largoDef: 12 },
  bascula:     { label: "Báscula",      icono: "⚖️", anchoDef: 34, altoDef: 34, largoDef: 10 },
  caja:        { label: "Caja",         icono: "📦", anchoDef: 20, altoDef: 16, largoDef: 16 },
  estiba:      { label: "Estiba vacía", icono: "🟫", anchoDef: 40, altoDef: 24, largoDef: 12 },
  muro:        { label: "Muro",         icono: "🧱", anchoDef: 70, altoDef: 12, largoDef: 10 },
  reja:        { label: "Reja",         icono: "🔲", anchoDef: 50, altoDef: 30, largoDef: 8 },
  techo:       { label: "Techo",        icono: "⛺", anchoDef: 60, altoDef: 28, largoDef: 16 },
  silla:       { label: "Silla",        icono: "🪑", anchoDef: 14, altoDef: 18, largoDef: 12 },
  caneca:      { label: "Caneca",       icono: "🗑️", anchoDef: 14, altoDef: 18, largoDef: 12 },
  montacargas: { label: "Montacargas",  icono: "🚜", anchoDef: 50, altoDef: 30, largoDef: 40 },
  estibador:   { label: "Estibador",    icono: "🧍", anchoDef: 20, altoDef: 34, largoDef: 10 },
  banda:       { label: "Banda extra",  icono: "➡️", anchoDef: 90, altoDef: 14, largoDef: 60 },
  computador:  { label: "Computador",   icono: "🖥️", anchoDef: 32, altoDef: 30, largoDef: 14 },
  armadora:    { label: "Armadora de cajas", icono: "📦", anchoDef: 74, altoDef: 40, largoDef: 30 },
  extintor:    { label: "Extintor",     icono: "🧯", anchoDef: 12, altoDef: 22, largoDef: 10 },
  botiquin:    { label: "Botiquín",     icono: "⛑️", anchoDef: 20, altoDef: 24, largoDef: 8 },
  lavamanos:   { label: "Lavamanos",    icono: "🚰", anchoDef: 28, altoDef: 30, largoDef: 14 },
  detector:    { label: "Detector de metales", icono: "🚪", anchoDef: 46, altoDef: 58, largoDef: 14 },
  envolvedora: { label: "Envolvedora de pallets", icono: "🌀", anchoDef: 54, altoDef: 54, largoDef: 20 },
  impresora:   { label: "Impresora de etiquetas", icono: "🖨️", anchoDef: 22, altoDef: 18, largoDef: 12 },
  estanteria:  { label: "Estantería",   icono: "🗄️", anchoDef: 60, altoDef: 50, largoDef: 16 },
  carreta:     { label: "Carreta/Zorra", icono: "🛒", anchoDef: 26, altoDef: 34, largoDef: 12 },
  ventilador:  { label: "Ventilador industrial", icono: "🌬️", anchoDef: 30, altoDef: 40, largoDef: 12 },
  cono:        { label: "Cono de seguridad", icono: "🚧", anchoDef: 14, altoDef: 20, largoDef: 8 },
  camara:      { label: "Cámara de seguridad", icono: "📹", anchoDef: 18, altoDef: 16, largoDef: 10 },
  reloj:       { label: "Reloj marcador", icono: "⏱️", anchoDef: 20, altoDef: 26, largoDef: 8 },
};

// Sombra de piso compartida — le da apoyo/volumen a cualquier objeto suelto
// en vez de sentirse "flotando" sobre el plano.
function SombraPiso({ ancho, alto }) {
  return <ellipse cx="0" cy={alto / 2 + 3} rx={ancho * 0.55} ry={Math.max(4, ancho * 0.15)} fill="url(#mq-sombra-suelo)" />;
}

function IconoPallet({ ancho, alto }) {
  const nFilas = 4;
  const filaAlto = (alto - 9) / nFilas;
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto} />
      {/* tablas de la estiba, con separación y veta */}
      {[0, 1, 2].map(i => (
        <rect key={i} x={-ancho / 2 + i * (ancho / 3)} y={alto / 2 - 7} width={ancho / 3 - 1.5} height="7" fill="#a16207" stroke="#5c3a0a" strokeWidth="0.8" />
      ))}
      {/* filas de cajas, cada una en dos mitades con costura al centro */}
      {Array.from({ length: nFilas }).map((_, i) => {
        const y0 = alto / 2 - 9 - (i + 1) * filaAlto;
        return (
          <g key={i}>
            <rect x={-ancho / 2 + 1} y={y0} width={ancho / 2 - 2} height={filaAlto - 1.6} fill="#16803d" stroke="#0f4023" strokeWidth="0.8" />
            <rect x={1} y={y0} width={ancho / 2 - 2} height={filaAlto - 1.6} fill="#15803d" stroke="#0f4023" strokeWidth="0.8" />
            <rect x={-ancho * 0.2} y={y0 + filaAlto * 0.25} width={ancho * 0.4} height={Math.max(2, filaAlto * 0.32)} fill="#eef7e6" opacity="0.85" rx="0.6" />
            <ellipse cx={-ancho / 4} cy={y0 + filaAlto / 2} rx="2" ry="1.1" fill="#0f4023" opacity="0.6" />
            <ellipse cx={ancho / 4} cy={y0 + filaAlto / 2} rx="2" ry="1.1" fill="#0f4023" opacity="0.6" />
            <polygon points={poly([[-ancho / 2 + 1, y0], [ancho / 2 - 1, y0], [ancho / 2 - 1, y0 + filaAlto - 1.6], [-ancho / 2 + 1, y0 + filaAlto - 1.6]])} fill="url(#mq-sheen)" pointerEvents="none" />
          </g>
        );
      })}
      {/* zunchos negros con brillo metálico */}
      {[0.22, 0.5, 0.8].map((f, i) => (
        <g key={i}>
          <line x1={-ancho / 2} y1={alto / 2 - 9 - alto * f} x2={ancho / 2} y2={alto / 2 - 9 - alto * f} stroke="#0b0b0f" strokeWidth="2.2" />
          <line x1={-ancho / 2} y1={alto / 2 - 10 - alto * f} x2={ancho / 2} y2={alto / 2 - 10 - alto * f} stroke="#4b5563" strokeWidth="0.7" opacity="0.7" />
        </g>
      ))}
    </g>
  );
}
function IconoBascula({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto} />
      <rect x={-ancho / 2} y={alto / 2 - 7} width={ancho} height="7" rx="1.5" fill="#4b5563" stroke="#1f2937" strokeWidth="1" />
      {[0.25, 0.5, 0.75].map((f, i) => <line key={i} x1={-ancho / 2 + ancho * f} y1={alto / 2 - 7} x2={-ancho / 2 + ancho * f} y2={alto / 2} stroke="#1f2937" strokeWidth="0.8" opacity="0.6" />)}
      <polygon points={poly([[-ancho / 2, alto / 2 - 7], [ancho / 2, alto / 2 - 7], [ancho / 2, alto / 2], [-ancho / 2, alto / 2]])} fill="url(#mq-sheen)" pointerEvents="none" />
      <rect x="-2.2" y={-alto / 2 + 5} width="4.4" height={alto - 17} fill="#9ca3af" stroke="#6b7280" strokeWidth="0.5" />
      <rect x={-ancho * 0.3} y={-alto / 2} width={ancho * 0.6} height={alto * 0.24} rx="1.5" fill="#0f172a" stroke="#38BDF8" strokeWidth="1" />
      <text x="0" y={-alto / 2 + alto * 0.17} fontSize={Math.max(5, alto * 0.14)} fill="#38BDF8" textAnchor="middle" fontWeight="700">00.0</text>
    </g>
  );
}
function IconoCaja({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto} />
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} rx="1" fill="#b3792c" stroke="#6b4416" strokeWidth="1" />
      <polygon points={poly([[-ancho / 2, -alto / 2], [ancho / 2, -alto / 2], [ancho / 2, alto / 2], [-ancho / 2, alto / 2]])} fill="url(#mq-sheen)" pointerEvents="none" />
      <line x1={-ancho / 2} y1={-alto * 0.1} x2={ancho / 2} y2={-alto * 0.1} stroke="#6b4416" strokeWidth="0.9" />
      <path d={`M -2 ${-alto / 2} L 0 ${-alto * 0.1} L 2 ${-alto / 2}`} fill="none" stroke="#6b4416" strokeWidth="0.7" />
      <rect x={-ancho * 0.28} y={alto * 0.02} width={ancho * 0.56} height={alto * 0.28} fill="#f1e6cf" opacity="0.9" rx="0.5" />
    </g>
  );
}
function IconoEstiba({ ancho, alto }) {
  const tablas = 5;
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto} />
      {Array.from({ length: tablas }).map((_, i) => {
        const x0 = -ancho / 2 + i * (ancho / tablas);
        const w = ancho / tablas - 2.4;
        return (
          <g key={i}>
            <rect x={x0} y={-alto / 2} width={w} height={alto} fill="#a16207" stroke="#5c3a0a" strokeWidth="0.8" />
            <line x1={x0 + w * 0.3} y1={-alto / 2 + 2} x2={x0 + w * 0.3} y2={alto / 2 - 2} stroke="#5c3a0a" strokeWidth="0.5" opacity="0.55" />
            <polygon points={poly([[x0, -alto / 2], [x0 + w, -alto / 2], [x0 + w, alto / 2], [x0, alto / 2]])} fill="url(#mq-sheen)" pointerEvents="none" />
          </g>
        );
      })}
    </g>
  );
}
function IconoMuro({ ancho, alto }) {
  const filaH = 7;
  const nFilas = Math.max(2, Math.round(alto / filaH));
  return (
    <g>
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} fill="#9a5b3f" stroke="#5c3623" strokeWidth="1" />
      {Array.from({ length: nFilas }).map((_, fila) => {
        const y = -alto / 2 + fila * filaH;
        const offset = fila % 2 === 0 ? 0 : ancho / 8;
        const ladrillos = [];
        for (let x = -ancho / 2 - ancho / 8 + offset; x < ancho / 2; x += ancho / 4) {
          ladrillos.push(x);
        }
        return (
          <g key={fila}>
            <line x1={-ancho / 2} y1={y} x2={ancho / 2} y2={y} stroke="#5c3623" strokeWidth="0.7" />
            {ladrillos.map((x, i) => <line key={i} x1={x} y1={y} x2={x} y2={y + filaH} stroke="#5c3623" strokeWidth="0.6" />)}
          </g>
        );
      })}
      <polygon points={poly([[-ancho / 2, -alto / 2], [ancho / 2, -alto / 2], [ancho / 2, alto / 2], [-ancho / 2, alto / 2]])} fill="url(#mq-sheen)" pointerEvents="none" />
    </g>
  );
}
function IconoReja({ ancho, alto }) {
  // id único por instancia — si no, dos rejas en el plano compartirían el
  // mismo <clipPath> y una de las dos quedaría sin recortar bien.
  const clipId = `mq-reja-clip-${useId()}`;
  const postes = Math.max(2, Math.round(ancho / 22));
  const diag = [];
  for (let x = -ancho / 2; x < ancho / 2 + alto; x += 9) diag.push(x);
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.3} />
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} fill="none" stroke="#94a3b8" strokeWidth="1.6" />
      <clipPath id={clipId}><rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} /></clipPath>
      <g clipPath={`url(#${clipId})`} opacity="0.85">
        {diag.map((x, i) => (
          <g key={i}>
            <line x1={x - alto} y1={-alto / 2} x2={x} y2={alto / 2} stroke="#64748b" strokeWidth="0.9" />
            <line x1={x} y1={-alto / 2} x2={x - alto} y2={alto / 2} stroke="#64748b" strokeWidth="0.9" />
          </g>
        ))}
      </g>
      {Array.from({ length: postes + 1 }).map((_, i) => (
        <rect key={i} x={-ancho / 2 + i * (ancho / postes) - 1.4} y={-alto / 2 - 3} width="2.8" height={alto + 6} fill="#94a3b8" stroke="#475569" strokeWidth="0.6" />
      ))}
    </g>
  );
}
function IconoTecho({ ancho, alto }) {
  const cresta = 8;
  const nCanales = Math.max(4, Math.round(ancho / 7));
  return (
    <g>
      <polygon points={`${-ancho / 2},${alto / 2} ${ancho / 2},${alto / 2} ${ancho / 2 - cresta},${-alto / 2} ${-ancho / 2 + cresta},${-alto / 2}`} fill="#5b6572" stroke="#1f2937" strokeWidth="1.2" />
      {Array.from({ length: nCanales }).map((_, i) => {
        const t = (i + 0.5) / nCanales;
        const xTop = -ancho / 2 + cresta + t * (ancho - 2 * cresta);
        const xBot = -ancho / 2 + t * ancho;
        return <line key={i} x1={xTop} y1={-alto / 2} x2={xBot} y2={alto / 2} stroke="#374151" strokeWidth="0.7" opacity="0.65" />;
      })}
      <line x1={-ancho / 2 + cresta} y1={-alto / 2} x2={ancho / 2 - cresta} y2={-alto / 2} stroke="#e2e8f0" strokeWidth="1.4" opacity="0.6" />
      <polygon points={`${-ancho / 2},${alto / 2} ${ancho / 2},${alto / 2} ${ancho / 2 - cresta},${-alto / 2} ${-ancho / 2 + cresta},${-alto / 2}`} fill="url(#mq-sheen)" pointerEvents="none" />
    </g>
  );
}
function IconoSilla({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.3} />
      <rect x={-ancho / 2} y={alto * 0.08} width={ancho} height={alto * 0.14} rx="1.5" fill="#92400e" stroke="#451a03" strokeWidth="0.8" />
      <rect x={-ancho / 2} y={-alto / 2} width={ancho * 0.13} height={alto * 0.62} rx="1.5" fill="#92400e" stroke="#451a03" strokeWidth="0.8" />
      {[0.15, 0.35].map((f, i) => <line key={i} x1={-ancho / 2 + ancho * 0.02} y1={-alto / 2 + alto * f} x2={-ancho / 2 + ancho * 0.11} y2={-alto / 2 + alto * f} stroke="#451a03" strokeWidth="1" opacity="0.7" />)}
      {[[-ancho / 2 + 1.5, alto / 2 - 1], [ancho / 2 - 3, alto / 2 - 1]].map(([x, y], i) => (
        <line key={i} x1={x} y1={y} x2={x} y2={y + 7} stroke="#3b1a04" strokeWidth="2.2" strokeLinecap="round" />
      ))}
    </g>
  );
}
function IconoCaneca({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.3} />
      <path d={`M ${-ancho / 2},${-alto / 2 + 3} L ${-ancho * 0.4},${alto / 2} A ${ancho * 0.4} ${ancho / 8} 0 0 0 ${ancho * 0.4} ${alto / 2} L ${ancho / 2},${-alto / 2 + 3}`} fill="#374151" stroke="#1f2937" strokeWidth="1" />
      {[0.3, 0.6].map((f, i) => (
        <line key={i} x1={-ancho / 2 + ancho * f} y1={-alto / 2 + 6} x2={-ancho * 0.4 + ancho * 0.8 * f} y2={alto / 2 - 3} stroke="#1f2937" strokeWidth="0.6" opacity="0.6" />
      ))}
      <ellipse cx="0" cy={-alto / 2 + 3} rx={ancho / 2} ry={ancho / 6} fill="#4b5563" stroke="#1f2937" strokeWidth="1" />
      <ellipse cx="0" cy={-alto / 2} rx={ancho * 0.42} ry={ancho / 8} fill="#6b7280" stroke="#1f2937" strokeWidth="0.8" />
    </g>
  );
}
function IconoMontacargas({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.5} />
      <rect x={-ancho * 0.15} y={-alto * 0.5} width={ancho * 0.5} height={alto * 0.55} rx="2" fill="#F9A826" stroke="#78350f" strokeWidth="1" />
      <polygon points={poly([[-ancho * 0.15, -alto * 0.5], [ancho * 0.35, -alto * 0.5], [ancho * 0.35, alto * 0.05], [-ancho * 0.15, alto * 0.05]])} fill="url(#mq-sheen)" pointerEvents="none" />
      <rect x={-ancho * 0.08} y={-alto * 0.42} width={ancho * 0.28} height={alto * 0.22} rx="1.5" fill="#bae6fd" opacity="0.8" stroke="#78350f" strokeWidth="0.6" />
      <circle cx={ancho * 0.32} cy={-alto * 0.5 - 2} r="2.4" fill="#F9A826" stroke="#78350f" strokeWidth="0.8">
        <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
      </circle>
      <rect x={-ancho / 2} y={alto * 0.05} width={ancho * 0.32} height={alto * 0.08} fill="#374151" />
      <line x1={ancho * 0.32} y1={-alto * 0.55} x2={ancho * 0.32} y2={alto * 0.22} stroke="#1f2937" strokeWidth="3" />
      <line x1={ancho * 0.32} y1={-alto * 0.55} x2={ancho * 0.32} y2={alto * 0.22} stroke="#9ca3af" strokeWidth="0.8" />
      <circle cx={-ancho * 0.25} cy={alto * 0.42} r={alto * 0.14} fill="#111827" stroke="#374151" strokeWidth="1" />
      <circle cx={-ancho * 0.25} cy={alto * 0.42} r={alto * 0.05} fill="#6b7280" />
      <circle cx={ancho * 0.25} cy={alto * 0.42} r={alto * 0.14} fill="#111827" stroke="#374151" strokeWidth="1" />
      <circle cx={ancho * 0.25} cy={alto * 0.42} r={alto * 0.05} fill="#6b7280" />
    </g>
  );
}
function IconoBanda({ ancho }) {
  return (
    <g>
      <line x1={-ancho / 2} y1="0" x2={ancho / 2} y2="0" stroke="rgba(255,255,255,0.12)" strokeWidth="13" strokeLinecap="round" />
      <line x1={-ancho / 2} y1="0" x2={ancho / 2} y2="0" stroke="#2a2e3a" strokeWidth="7.8" strokeLinecap="round" />
      <line x1={-ancho / 2} y1="0" x2={ancho / 2} y2="0" stroke="#38BDF8" strokeWidth="3.3" strokeLinecap="round" strokeDasharray="9 10.4" opacity="0.85">
        <animate attributeName="stroke-dashoffset" from="0" to="-39" dur="0.6s" repeatCount="indefinite" />
      </line>
    </g>
  );
}

// Puesto de control (mesa + monitor + teclado + radio) — antes venía fijo
// dentro de la calibradora; ahora es un objeto libre más, para ubicarlo
// donde realmente esté en la planta.
function IconoComputador({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.4} />
      <rect x={-ancho / 2} y={alto * 0.28} width={ancho} height={alto * 0.16} rx="1" fill="#6b4a2c" stroke="#4a3218" strokeWidth="1" />
      <polygon points={poly([[-ancho / 2, alto * 0.28], [ancho / 2, alto * 0.28], [ancho / 2, alto * 0.44], [-ancho / 2, alto * 0.44]])} fill="url(#mq-sheen)" pointerEvents="none" />
      <g transform="rotate(-12)">
        <rect x={-ancho * 0.34} y={-alto * 0.46} width={ancho * 0.68} height={alto * 0.5} rx="1.5" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
        <rect x={-ancho * 0.28} y={-alto * 0.4} width={ancho * 0.56} height={alto * 0.34} rx="1" fill="#0f172a" stroke="#38BDF8" strokeWidth="0.8" />
        <rect x={-ancho * 0.24} y={-alto * 0.36} width={ancho * 0.22} height={alto * 0.13} fill="#38BDF8" opacity="0.75">
          <animate attributeName="opacity" values="0.75;0.25;0.75" dur="1.3s" repeatCount="indefinite" />
        </rect>
        <rect x={0} y={-alto * 0.36} width={ancho * 0.22} height={alto * 0.13} fill="#22c55e" opacity="0.6">
          <animate attributeName="opacity" values="0.4;0.8;0.4" dur="1.7s" repeatCount="indefinite" />
        </rect>
      </g>
      <rect x={-ancho * 0.28} y={alto * 0.1} width={ancho * 0.38} height={alto * 0.18} rx="1" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="0.8" />
      {[0, 1, 2].map(c => <circle key={c} cx={-ancho * 0.19 + c * (ancho * 0.12)} cy={alto * 0.19} r={Math.max(alto * 0.03, 0.8)} fill="#4b5563" />)}
      <circle cx={ancho * 0.25} cy={alto * 0.16} r={Math.max(alto * 0.1, 2)} fill="#dc2626" stroke="#7f1d1d" strokeWidth="0.8" />
    </g>
  );
}

// Máquina armadora de cajas: entra cartón plano por un lado, un brazo lo
// va doblando (animado) sobre unos rodillos, y sale la caja ya armada por
// el otro — con luz indicadora parpadeante como el resto del equipo.
function IconoArmadora({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.55} />
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} rx="3" fill="#5b6572" stroke="#1f2937" strokeWidth="1.4" />
      <polygon points={poly([[-ancho / 2, -alto / 2], [ancho / 2, -alto / 2], [ancho / 2, alto / 2], [-ancho / 2, alto / 2]])} fill="url(#mq-sheen)" pointerEvents="none" />
      {/* pila de cartón plano entrando por la izquierda */}
      {[0, 1, 2, 3].map(i => (
        <rect key={i} x={-ancho / 2 - ancho * 0.09} y={-alto * 0.36 + i * (alto * 0.19)} width={ancho * 0.22} height={alto * 0.1} fill="#c99a5b" stroke="#7c5a29" strokeWidth="0.6" />
      ))}
      {/* rodillos centrales */}
      {[0, 1].map(i => (
        <circle key={i} cx={-ancho * 0.12 + i * (ancho * 0.2)} cy={alto * 0.2} r={alto * 0.14} fill="#9ca3af" stroke="#4b5563" strokeWidth="1" />
      ))}
      {/* brazo plegador, animado con un doblez de ida y vuelta */}
      <g transform={`translate(${-ancho * 0.02},${-alto * 0.08})`}>
        <g style={{ transformOrigin: "0px 0px" }}>
          <rect x="0" y="-2" width={ancho * 0.24} height="4" rx="1.5" fill="#F9A826" stroke="#78350f" strokeWidth="0.7">
            <animateTransform attributeName="transform" type="rotate" values="0;-38;0;0" keyTimes="0;0.35;0.7;1" dur="2.2s" repeatCount="indefinite" />
          </rect>
        </g>
      </g>
      {/* caja armada saliendo por la derecha */}
      <g transform={`translate(${ancho * 0.36},${alto * 0.02})`}>
        <rect x={-ancho * 0.11} y={-alto * 0.26} width={ancho * 0.22} height={alto * 0.5} rx="1" fill="#b3792c" stroke="#6b4416" strokeWidth="1" />
        <polygon points={poly([[-ancho * 0.11, -alto * 0.26], [ancho * 0.11, -alto * 0.26], [ancho * 0.11, alto * 0.24], [-ancho * 0.11, alto * 0.24]])} fill="url(#mq-sheen)" pointerEvents="none" />
        <line x1={-ancho * 0.11} y1={-alto * 0.01} x2={ancho * 0.11} y2={-alto * 0.01} stroke="#6b4416" strokeWidth="0.8" />
        <rect x={-ancho * 0.05} y={-alto * 0.26} width={ancho * 0.1} height={alto * 0.5 * 0.3} fill="#f1e6cf" opacity="0.9" />
      </g>
      <circle cx={ancho * 0.42} cy={-alto * 0.36} r={Math.max(alto * 0.06, 2)} fill="#22c55e">
        <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

// ── Ecosistema — dotación típica de una planta de maquila/empaque ──────────

function IconoExtintor({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.3} />
      <rect x={-ancho * 0.32} y={alto * 0.14} width={ancho * 0.64} height={alto * 0.4} rx={ancho * 0.28} fill="#dc2626" stroke="#7f1d1d" strokeWidth="1" />
      <polygon points={poly([[-ancho * 0.32, alto * 0.14], [ancho * 0.32, alto * 0.14], [ancho * 0.32, alto * 0.3], [-ancho * 0.32, alto * 0.3]])} fill="url(#mq-sheen)" pointerEvents="none" />
      <rect x={-ancho * 0.14} y={-alto * 0.06} width={ancho * 0.28} height={alto * 0.24} rx="1.5" fill="#374151" stroke="#1f2937" strokeWidth="0.8" />
      <circle cy={-alto * 0.14} r={Math.max(ancho * 0.06, 1.5)} fill="#e5e7eb" stroke="#374151" strokeWidth="0.6" />
      <path d={`M ${ancho * 0.1} ${-alto * 0.02} L ${ancho * 0.34} ${alto * 0.08}`} stroke="#1f2937" strokeWidth="2" strokeLinecap="round" fill="none" />
      <rect x={-ancho * 0.06} y={-alto * 0.26} width={ancho * 0.12} height={alto * 0.06} fill="#374151" />
    </g>
  );
}

function IconoBotiquin({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.3} />
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} rx="2" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.2" />
      <polygon points={poly([[-ancho / 2, -alto / 2], [ancho / 2, -alto / 2], [ancho / 2, alto / 2], [-ancho / 2, alto / 2]])} fill="url(#mq-sheen)" pointerEvents="none" />
      <rect x={-ancho * 0.09} y={-alto * 0.32} width={ancho * 0.18} height={alto * 0.64} fill="#dc2626" />
      <rect x={-ancho * 0.32} y={-alto * 0.09} width={ancho * 0.64} height={alto * 0.18} fill="#dc2626" />
    </g>
  );
}

function IconoLavamanos({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.3} />
      <rect x={-ancho * 0.08} y={alto * 0.08} width={ancho * 0.16} height={alto * 0.4} fill="#9ca3af" stroke="#4b5563" strokeWidth="0.8" />
      <ellipse cx="0" cy={alto * 0.08} rx={ancho / 2} ry={alto * 0.14} fill="#e5e7eb" stroke="#94a3b8" strokeWidth="1" />
      <ellipse cx="0" cy={alto * 0.06} rx={ancho * 0.38} ry={alto * 0.09} fill="#cbd5e1" />
      <path d={`M 0 ${-alto * 0.06} v ${-alto * 0.14} h ${ancho * 0.16}`} stroke="#6b7280" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <circle cx={ancho * 0.16} cy={-alto * 0.2} r={Math.max(ancho * 0.05, 1.4)} fill="#38BDF8" />
    </g>
  );
}

function IconoDetector({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.2} />
      <rect x={-ancho / 2} y={-alto / 2 + alto * 0.06} width={ancho * 0.12} height={alto * 0.94} rx="2" fill="#0EA5E9" stroke="#075985" strokeWidth="1" />
      <rect x={ancho / 2 - ancho * 0.12} y={-alto / 2 + alto * 0.06} width={ancho * 0.12} height={alto * 0.94} rx="2" fill="#0EA5E9" stroke="#075985" strokeWidth="1" />
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto * 0.14} rx="3" fill="#0EA5E9" stroke="#075985" strokeWidth="1" />
      <polygon points={poly([[-ancho / 2, -alto / 2], [ancho / 2, -alto / 2], [ancho / 2, -alto / 2 + alto * 0.14], [-ancho / 2, -alto / 2 + alto * 0.14]])} fill="url(#mq-sheen)" pointerEvents="none" />
      {[0, 1, 2].map(i => (
        <rect key={i} x={-ancho * 0.02} y={-alto * 0.3 + i * (alto * 0.22)} width={ancho * 0.04} height={alto * 0.12} fill="#38BDF8" opacity="0.7">
          <animate attributeName="opacity" values="0.7;0.2;0.7" dur="1.4s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
        </rect>
      ))}
    </g>
  );
}

function IconoEnvolvedora({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.5} />
      <ellipse cx="0" cy={alto * 0.4} rx={ancho * 0.42} ry={alto * 0.1} fill="#4b5563" stroke="#1f2937" strokeWidth="1" />
      <rect x={-ancho * 0.24} y={alto * 0.06} width={ancho * 0.48} height={alto * 0.36} fill="#c99a5b" stroke="#7c5a29" strokeWidth="1" />
      {[0.14, 0.26, 0.38].map((f, i) => (
        <line key={i} x1={-ancho * 0.24} y1={alto * 0.06 + alto * 0.36 * f} x2={ancho * 0.24} y2={alto * 0.06 + alto * 0.36 * f + alto * 0.05} stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" />
      ))}
      <line x1={ancho * 0.3} y1={alto * 0.4} x2={ancho * 0.3} y2={-alto * 0.42} stroke="#374151" strokeWidth="2.6" strokeLinecap="round" />
      <g transform={`translate(${ancho * 0.3},${-alto * 0.3})`}>
        <g>
          <animateTransform attributeName="transform" type="rotate" values="0;360" dur="1.6s" repeatCount="indefinite" />
          <ellipse rx={ancho * 0.12} ry={alto * 0.16} fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" />
        </g>
      </g>
    </g>
  );
}

function IconoImpresora({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.4} />
      <rect x={-ancho / 2} y={-alto * 0.1} width={ancho} height={alto * 0.5} rx="2" fill="#e5e7eb" stroke="#6b7280" strokeWidth="1" />
      <polygon points={poly([[-ancho / 2, -alto * 0.1], [ancho / 2, -alto * 0.1], [ancho / 2, alto * 0.1], [-ancho / 2, alto * 0.1]])} fill="url(#mq-sheen)" pointerEvents="none" />
      <rect x={-ancho * 0.36} y={-alto * 0.32} width={ancho * 0.72} height={alto * 0.24} fill="white" stroke="#9ca3af" strokeWidth="0.8" />
      <circle cx={ancho * 0.38} cy="0" r={Math.max(alto * 0.05, 1.4)} fill="#22c55e">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

function IconoEstanteria({ ancho, alto }) {
  const niveles = [0.32, 0, -0.32];
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.3} />
      <line x1={-ancho / 2} y1={-alto / 2} x2={-ancho / 2} y2={alto / 2} stroke="#6b7280" strokeWidth="3" />
      <line x1={ancho / 2} y1={-alto / 2} x2={ancho / 2} y2={alto / 2} stroke="#6b7280" strokeWidth="3" />
      {niveles.map((f, i) => (
        <g key={i}>
          <rect x={-ancho / 2} y={alto * f - 2} width={ancho} height="4" fill="#9ca3af" stroke="#4b5563" strokeWidth="0.6" />
          <rect x={-ancho * 0.34} y={alto * f - alto * 0.16} width={ancho * 0.24} height={alto * 0.14} fill="#b3792c" stroke="#6b4416" strokeWidth="0.6" />
          <rect x={ancho * 0.05} y={alto * f - alto * 0.13} width={ancho * 0.2} height={alto * 0.11} fill="#a16207" stroke="#78350f" strokeWidth="0.6" />
        </g>
      ))}
    </g>
  );
}

function IconoCarreta({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.3} />
      <path d={`M ${-ancho * 0.3} ${alto * 0.3} L ${-ancho * 0.3} ${-alto * 0.4} L ${ancho * 0.1} ${-alto * 0.4}`} stroke="#374151" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <rect x={-ancho * 0.34} y={alto * 0.24} width={ancho * 0.5} height={alto * 0.1} fill="#6b7280" stroke="#374151" strokeWidth="0.8" />
      <circle cx={-ancho * 0.18} cy={alto * 0.42} r={ancho * 0.14} fill="#111827" stroke="#374151" strokeWidth="1" />
      <circle cx={-ancho * 0.18} cy={alto * 0.42} r={ancho * 0.05} fill="#6b7280" />
      <rect x={-ancho * 0.34} y={-alto * 0.12} width={ancho * 0.24} height={alto * 0.32} fill="#b3792c" stroke="#6b4416" strokeWidth="0.8" />
    </g>
  );
}

function IconoVentilador({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.24} />
      <line x1="0" y1={alto * 0.4} x2="0" y2={-alto * 0.1} stroke="#4b5563" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="0" cy={alto * 0.4} rx={ancho * 0.4} ry={alto * 0.06} fill="#374151" />
      <circle cx="0" cy={-alto * 0.18} r={ancho * 0.44} fill="#1f2937" stroke="#0b0b0f" strokeWidth="1.4" />
      <g transform={`translate(0,${-alto * 0.18})`}>
        <g>
          <animateTransform attributeName="transform" type="rotate" values="0;360" dur="0.5s" repeatCount="indefinite" />
          {[0, 90, 180, 270].map(a => (
            <ellipse key={a} cx="0" cy="0" rx={ancho * 0.34} ry={ancho * 0.1} fill="#9ca3af" opacity="0.85" transform={`rotate(${a})`} />
          ))}
        </g>
        <circle r={ancho * 0.08} fill="#4b5563" stroke="#1f2937" strokeWidth="0.8" />
      </g>
    </g>
  );
}

function IconoCono({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.3} />
      <ellipse cx="0" cy={alto * 0.42} rx={ancho * 0.5} ry={alto * 0.1} fill="#374151" stroke="#1f2937" strokeWidth="0.8" />
      <polygon points={poly([[-ancho * 0.42, alto * 0.4], [ancho * 0.42, alto * 0.4], [ancho * 0.1, -alto * 0.42], [-ancho * 0.1, -alto * 0.42]])} fill="#F9A826" stroke="#78350f" strokeWidth="1" />
      <polygon points={poly([[-ancho * 0.28, alto * 0.06], [ancho * 0.28, alto * 0.06], [ancho * 0.19, -alto * 0.16], [-ancho * 0.19, -alto * 0.16]])} fill="#f8fafc" opacity="0.9" />
      <polygon points={poly([[-ancho * 0.42, alto * 0.4], [ancho * 0.42, alto * 0.4], [ancho * 0.1, -alto * 0.42], [-ancho * 0.1, -alto * 0.42]])} fill="url(#mq-sheen)" pointerEvents="none" />
    </g>
  );
}

function IconoCamara({ ancho, alto }) {
  return (
    <g>
      <line x1={-ancho * 0.4} y1={-alto * 0.4} x2="0" y2="0" stroke="#4b5563" strokeWidth="2.2" strokeLinecap="round" />
      <g transform="rotate(-18)">
        <rect x={-ancho * 0.32} y={-alto * 0.14} width={ancho * 0.64} height={alto * 0.28} rx="2" fill="#1f2937" stroke="#0b0b0f" strokeWidth="1" />
        <circle cx={ancho * 0.26} cy="0" r={alto * 0.12} fill="#0f172a" stroke="#38BDF8" strokeWidth="1" />
        <circle cx={ancho * 0.26} cy="0" r={alto * 0.05} fill="#38BDF8">
          <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
        </circle>
        <circle cx={-ancho * 0.2} cy={-alto * 0.08} r={Math.max(alto * 0.04, 1)} fill="#dc2626">
          <animate attributeName="opacity" values="1;0.2;1" dur="0.9s" repeatCount="indefinite" />
        </circle>
      </g>
    </g>
  );
}

function IconoReloj({ ancho, alto }) {
  return (
    <g>
      <SombraPiso ancho={ancho} alto={alto * 0.3} />
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} rx="3" fill="#374151" stroke="#1f2937" strokeWidth="1.2" />
      <polygon points={poly([[-ancho / 2, -alto / 2], [ancho / 2, -alto / 2], [ancho / 2, alto / 2], [-ancho / 2, alto / 2]])} fill="url(#mq-sheen)" pointerEvents="none" />
      <circle cx="0" cy={-alto * 0.12} r={ancho * 0.3} fill="#f8fafc" stroke="#0b0b0f" strokeWidth="1" />
      <line x1="0" y1={-alto * 0.12} x2="0" y2={-alto * 0.28} stroke="#0b0b0f" strokeWidth="1.4" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" values={`0 0 ${-alto * 0.12};360 0 ${-alto * 0.12}`} dur="6s" repeatCount="indefinite" />
      </line>
      <rect x={-ancho * 0.28} y={alto * 0.2} width={ancho * 0.56} height={alto * 0.16} rx="1" fill="#111827" stroke="#38BDF8" strokeWidth="0.8" />
    </g>
  );
}

function IconoObjeto({ tipo, ancho, alto }) {
  switch (tipo) {
    case "pallet": return <IconoPallet ancho={ancho} alto={alto} />;
    case "bascula": return <IconoBascula ancho={ancho} alto={alto} />;
    case "caja": return <IconoCaja ancho={ancho} alto={alto} />;
    case "estiba": return <IconoEstiba ancho={ancho} alto={alto} />;
    case "muro": return <IconoMuro ancho={ancho} alto={alto} />;
    case "reja": return <IconoReja ancho={ancho} alto={alto} />;
    case "techo": return <IconoTecho ancho={ancho} alto={alto} />;
    case "silla": return <IconoSilla ancho={ancho} alto={alto} />;
    case "caneca": return <IconoCaneca ancho={ancho} alto={alto} />;
    case "montacargas": return <IconoMontacargas ancho={ancho} alto={alto} />;
    case "estibador": return <Trabajador x={0} y={alto / 2} casco="#fbbf24" objeto={cajaChica} />;
    case "banda": return <IconoBanda ancho={ancho} alto={alto} />;
    case "computador": return <IconoComputador ancho={ancho} alto={alto} />;
    case "armadora": return <IconoArmadora ancho={ancho} alto={alto} />;
    case "extintor": return <IconoExtintor ancho={ancho} alto={alto} />;
    case "botiquin": return <IconoBotiquin ancho={ancho} alto={alto} />;
    case "lavamanos": return <IconoLavamanos ancho={ancho} alto={alto} />;
    case "detector": return <IconoDetector ancho={ancho} alto={alto} />;
    case "envolvedora": return <IconoEnvolvedora ancho={ancho} alto={alto} />;
    case "impresora": return <IconoImpresora ancho={ancho} alto={alto} />;
    case "estanteria": return <IconoEstanteria ancho={ancho} alto={alto} />;
    case "carreta": return <IconoCarreta ancho={ancho} alto={alto} />;
    case "ventilador": return <IconoVentilador ancho={ancho} alto={alto} />;
    case "cono": return <IconoCono ancho={ancho} alto={alto} />;
    case "camara": return <IconoCamara ancho={ancho} alto={alto} />;
    case "reloj": return <IconoReloj ancho={ancho} alto={alto} />;
    default: return null;
  }
}

// Objeto libre: se puede arrastrar con el mouse/dedo directo sobre el
// lienzo (pointer capture, sin necesitar listeners globales). El clic lo
// selecciona; arrastrar lo mueve en cualquier dirección. En modo edición,
// al seleccionarlo aparecen dos asas: una arriba para rotarlo (arrastrando
// alrededor del centro) y una en la esquina inferior derecha para cambiar
// ancho/alto arrastrándola — todo directo con el mouse, sin tener que
// entrar al panel. El panel sigue disponible para ajustes finos por número.
// Al acabar de crearlo (`esNuevo`), se desplaza solo hasta quedar visible y
// destella un instante, para que no se pierda si el lienzo está grande.
function ObjetoLibre({ obj, seleccionado, esNuevo, editando, onSeleccionar, onMover, onAjustar }) {
  const dragRef = useRef(null);
  const rotDragRef = useRef(null);
  const resizeDragRef = useRef(null);
  const largoDragRef = useRef(null);
  const gRef = useRef(null);
  useEffect(() => {
    if (esNuevo && gRef.current) {
      gRef.current.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }, [esNuevo]);
  const escala = obj.escala || 1;
  const rot = obj.rot || 0;
  const largo = obj.largo ?? TIPOS_OBJETO[obj.tipo]?.largoDef ?? 16;
  const hx = (obj.ancho / 2) * escala, hy = (obj.alto / 2) * escala;

  const onLargoPointerDown = (e) => {
    e.stopPropagation();
    const p = puntoSvg(e.currentTarget.ownerSVGElement, e.clientX, e.clientY);
    largoDragRef.current = { sx: p.x, sy: p.y, largo0: largo };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onLargoPointerMove = (e) => {
    const d = largoDragRef.current;
    if (!d) return;
    const p = puntoSvg(e.currentTarget.ownerSVGElement, e.clientX, e.clientY);
    const dxSvg = p.x - d.sx, dySvg = p.y - d.sy;
    const rad = (-rot * Math.PI) / 180;
    const localDy = (dxSvg * Math.sin(rad) + dySvg * Math.cos(rad)) / escala;
    const nuevoLargo = Math.min(140, Math.max(4, Math.round(d.largo0 + localDy)));
    onAjustar(obj.id, { largo: nuevoLargo });
  };

  const onRotPointerDown = (e) => {
    e.stopPropagation();
    const p = puntoSvg(e.currentTarget.ownerSVGElement, e.clientX, e.clientY);
    rotDragRef.current = { ang0: Math.atan2(p.y - obj.y, p.x - obj.x) * 180 / Math.PI, rot0: rot };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onRotPointerMove = (e) => {
    const d = rotDragRef.current;
    if (!d) return;
    const p = puntoSvg(e.currentTarget.ownerSVGElement, e.clientX, e.clientY);
    const ang = Math.atan2(p.y - obj.y, p.x - obj.x) * 180 / Math.PI;
    const nuevoRot = ((Math.round(d.rot0 + (ang - d.ang0)) % 360) + 360) % 360;
    onAjustar(obj.id, { rot: nuevoRot });
  };

  const onResizePointerDown = (e) => {
    e.stopPropagation();
    const p = puntoSvg(e.currentTarget.ownerSVGElement, e.clientX, e.clientY);
    resizeDragRef.current = { sx: p.x, sy: p.y, ancho0: obj.ancho, alto0: obj.alto };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onResizePointerMove = (e) => {
    const d = resizeDragRef.current;
    if (!d) return;
    const p = puntoSvg(e.currentTarget.ownerSVGElement, e.clientX, e.clientY);
    const dxSvg = p.x - d.sx, dySvg = p.y - d.sy;
    const rad = (-rot * Math.PI) / 180;
    const localDx = (dxSvg * Math.cos(rad) - dySvg * Math.sin(rad)) / escala;
    const localDy = (dxSvg * Math.sin(rad) + dySvg * Math.cos(rad)) / escala;
    const nuevoAncho = Math.min(160, Math.max(8, Math.round(d.ancho0 + localDx * 2)));
    const nuevoAlto  = Math.min(160, Math.max(8, Math.round(d.alto0 + localDy * 2)));
    onAjustar(obj.id, { ancho: nuevoAncho, alto: nuevoAlto });
  };

  return (
    <g
      ref={gRef}
      transform={`translate(${obj.x},${obj.y}) rotate(${rot})`}
      style={{ cursor: "grab", touchAction: "none" }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSeleccionar(obj.id);
        const p0 = puntoSvg(e.currentTarget.ownerSVGElement, e.clientX, e.clientY);
        dragRef.current = { sx: p0.x, sy: p0.y, ox: obj.x, oy: obj.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragRef.current) return;
        const p = puntoSvg(e.currentTarget.ownerSVGElement, e.clientX, e.clientY);
        const dx = p.x - dragRef.current.sx, dy = p.y - dragRef.current.sy;
        onMover(obj.id, dragRef.current.ox + dx, dragRef.current.oy + dy);
      }}
      onPointerUp={() => { dragRef.current = null; }}
      onClick={(e) => e.stopPropagation()}
    >
      <g transform={`scale(${escala})`} style={{ animation: esNuevo ? "mq-pop 0.35s ease" : "none" }}>
        <rect
          x={-obj.ancho / 2} y={obj.alto / 2} width={obj.ancho} height={largo}
          fill="rgba(0,0,0,0.32)" stroke="rgba(0,0,0,0.45)" strokeWidth={0.6}
        />
        <IconoObjeto tipo={obj.tipo} ancho={obj.ancho} alto={obj.alto} />
        {seleccionado && (
          <rect
            x={-obj.ancho / 2 - 4} y={-obj.alto / 2 - 4} width={obj.ancho + 8} height={obj.alto + 8}
            fill="none" stroke="#845EF7" strokeWidth={1.5 / escala} strokeDasharray="4 3"
            style={{ animation: esNuevo ? "mq-highlight 1.1s ease" : "none" }}
          />
        )}
      </g>
      {seleccionado && editando && (
        <>
          <line x1={0} y1={-hy - 6} x2={0} y2={-hy - 24} stroke="#845EF7" strokeWidth={1.5} />
          <circle
            cx={0} cy={-hy - 30} r={7} fill="#845EF7" stroke="white" strokeWidth={1.5}
            style={{ cursor: "grab", touchAction: "none" }}
            onPointerDown={onRotPointerDown} onPointerMove={onRotPointerMove}
            onPointerUp={() => { rotDragRef.current = null; }}
            onClick={(e) => e.stopPropagation()}
          />
          <rect
            x={hx - 6} y={hy - 6} width={12} height={12} rx={2} fill="#845EF7" stroke="white" strokeWidth={1.5}
            style={{ cursor: "nwse-resize", touchAction: "none" }}
            onPointerDown={onResizePointerDown} onPointerMove={onResizePointerMove}
            onPointerUp={() => { resizeDragRef.current = null; }}
            onClick={(e) => e.stopPropagation()}
          />
          <rect
            x={-6} y={hy + largo * escala + 2} width={12} height={12} rx={2} fill="#845EF7" stroke="white" strokeWidth={1.5}
            style={{ cursor: "ns-resize", touchAction: "none" }}
            onPointerDown={onLargoPointerDown} onPointerMove={onLargoPointerMove}
            onPointerUp={() => { largoDragRef.current = null; }}
            onClick={(e) => e.stopPropagation()}
          />
        </>
      )}
    </g>
  );
}

// ── Motor de simulación (estilo FlexSim, simplificado) ─────────────────────
// Simulación de eventos por pasos de tiempo: cada estación procesa unidades
// según su tiempo de proceso y su capacidad (cuántas puede tener ocupadas a
// la vez — usa la `capacidad` real de personal en las estaciones con gente,
// y "sin límite" en los tramos automáticos, que no forman cola en la vida
// real). Si llegan más unidades de las que caben, se acumulan en cola —
// eso es literalmente cómo se ve un cuello de botella.
const SIM_CFG_KEY = "tp_maquina_sim_cfg";
const SIM_TIEMPOS_DEFAULT = {
  recepcion: 60, alimentacion: 20, seleccion: 15, lavado: 25, encerado: 20, secado: 30,
  foto: 10, empaque: 25, pesaje: 10, paletizado: 40, patio: 5, cargue: 35,
};
const SIM_CAPACIDAD_AUTOMATICO = 999; // tramos automáticos: banda/túnel continuos, no forman cola
const SIM_VELOCIDADES = [1, 5, 20, 60];

function cargarSimCfg() {
  const base = { tiempos: { ...SIM_TIEMPOS_DEFAULT }, ritmoLlegadaSeg: 50, velocidad: 20 };
  try {
    const raw = localStorage.getItem(SIM_CFG_KEY);
    if (!raw) return base;
    const guardado = JSON.parse(raw);
    return { ...base, ...guardado, tiempos: { ...base.tiempos, ...(guardado.tiempos || {}) } };
  } catch { return base; }
}

function estacionSimVacia() {
  return { ocupados: [], cola: [], procesados: 0, tiempoOcupado: 0 };
}

function fmtRelojSim(seg) {
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = Math.floor(seg % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function MaquinaTab({ mob }) {
  const { empleados, loading: loadingPersonal } = usePersonal();
  const { areas, movimientos, loading: loadingMaquina, moverPersona } = useMaquina();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [menuAbierto, setMenuAbierto] = useState(null); // num del empleado con el selector de área abierto
  const [hoverNum, setHoverNum] = useState(null); // num del empleado con el widget de estadísticas visible (hover)
  const [resaltados, setResaltados] = useState({});
  const [viajero, setViajero] = useState(null); // ficha animada sobre la banda al mover a alguien
  const prevAreaRef = useRef({});
  const viajeIdRef = useRef(0);

  // Paneo de cámara: clic y arrastra sobre el lienzo para moverte por la
  // máquina, en vez de depender solo de las barras de scroll.
  const canvasScrollRef = useRef(null);
  const innerCanvasRef = useRef(null); // el div de tamaño LAYOUT.width/height — referencia para convertir clientX/Y a coordenadas del plano
  const panRef = useRef(null);

  // Zoom: Control + rueda del mouse, acercando o alejando el plano. El
  // lienzo interno mantiene sus coordenadas normales (LAYOUT.width/height)
  // y se escala con CSS transform — por eso las conversiones de mouse a
  // plano (posEnPlano, arrastrar estaciones/personas) dividen por `zoom`.
  const [zoom, setZoom] = useState(1);
  const onWheelZoom = (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(z => Math.min(2.2, Math.max(0.4, +(z - e.deltaY * 0.0015).toFixed(3))));
  };

  // Modo "colocar": al elegir un objeto de la paleta, va pegado al mouse
  // (fantasma semitransparente) hasta que se hace clic en el plano para
  // soltarlo ahí mismo — como poner un mueble.
  const [colocando, setColocando] = useState(null);
  const [mousePos, setMousePos] = useState(null);
  useEffect(() => {
    if (!colocando) return;
    const onKey = (e) => { if (e.key === "Escape") { setColocando(null); setMousePos(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [colocando]);

  const posEnPlano = (e) => {
    if (!innerCanvasRef.current) return null;
    const r = innerCanvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };

  const onCanvasPointerDown = (e) => {
    if (colocando || !canvasScrollRef.current) return; // en modo colocar, el clic suelta el objeto, no panea
    panRef.current = {
      startX: e.clientX, startY: e.clientY,
      scrollLeft: canvasScrollRef.current.scrollLeft, scrollTop: canvasScrollRef.current.scrollTop,
      movido: false,
    };
  };
  const onCanvasPointerMove = (e) => {
    if (colocando) { setMousePos(posEnPlano(e)); return; }
    if (!panRef.current || !canvasScrollRef.current) return;
    const dx = e.clientX - panRef.current.startX, dy = e.clientY - panRef.current.startY;
    if (!panRef.current.movido && Math.hypot(dx, dy) < 4) return;
    panRef.current.movido = true;
    canvasScrollRef.current.style.cursor = "grabbing";
    canvasScrollRef.current.scrollLeft = panRef.current.scrollLeft - dx;
    canvasScrollRef.current.scrollTop = panRef.current.scrollTop - dy;
  };
  const onCanvasClick = (e) => {
    if (!colocando) return;
    const p = posEnPlano(e);
    if (p) agregarObjeto(colocando, p.x, p.y);
    setColocando(null);
    setMousePos(null);
  };
  const onCanvasPointerUp = () => {
    panRef.current = null;
    if (canvasScrollRef.current) canvasScrollRef.current.style.cursor = colocando ? "crosshair" : "grab";
  };

  // Modo edición: ajustar a mano la forma de la calibradora (ángulo de
  // bandejas, posición del puesto de control, etc.) sin tener que
  // describirlo por chat.
  const [editando, setEditando] = useState(false);
  const { diseno, loading: loadingDiseno, guardarDiseno } = useMaquinaDiseno();
  const [respaldoLocal, setRespaldoLocal] = useState(() => leerRespaldoLocal());
  const [recuperando, setRecuperando] = useState(false);
  const recuperarRespaldoLocal = async () => {
    if (!respaldoLocal) return;
    setRecuperando(true);
    const ok = await guardarDiseno({
      calibCfg: { ...CALIB_CFG_DEFAULT, ...(respaldoLocal.calibCfg || {}) },
      posCustom: respaldoLocal.posCustom || {},
      posPersonas: respaldoLocal.posPersonas || {},
      objetos: respaldoLocal.objetos || [],
      rutasPersonas: respaldoLocal.rutasPersonas || {},
    }, nombreUsuarioSesion());
    setRecuperando(false);
    if (ok) {
      Object.values(LLAVES_RESPALDO_LOCAL).forEach(llave => { try { localStorage.removeItem(llave); } catch { /* noop */ } });
      setRespaldoLocal(null);
    }
  };
  const [calibCfg, setCalibCfg] = useState(() => ({ ...CALIB_CFG_DEFAULT }));

  // Posiciones personalizadas de las 12 estaciones fijas — todo lo que está
  // en el plano (no solo lo que se agrega) se puede arrastrar. `puntos` es
  // la posición efectiva de cada estación: la guardada a mano, o si no hay,
  // la calculada por defecto en LAYOUT.
  const [posCustom, setPosCustom] = useState({});
  const puntos = useMemo(
    () => LAYOUT.puntos.map((p, i) => posCustom[STAGES[i].key] || p),
    [posCustom]
  );
  // Fruta suelta (limones) en la banda desde Recepción hasta Empaque, que es
  // donde de verdad se calibra y se empaca — de ahí en adelante hasta
  // Paletizado ya lo que viaja son cajas armadas, no fruta suelta.
  const { rutaLimones, rutaCajas } = useMemo(() => {
    const iEmp = STAGES.findIndex(s => s.key === "empaque");
    const iPal = STAGES.findIndex(s => s.key === "paletizado");
    const sub = (desde, hasta) => puntos.slice(desde, hasta + 1).map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");
    return { rutaLimones: sub(0, iEmp), rutaCajas: sub(iEmp, iPal) };
  }, [puntos]);
  const moverEstacion = (key, x, y) => setPosCustom(prev => ({ ...prev, [key]: { x, y } }));
  const restablecerPosiciones = () => setPosCustom({});

  // Arrastrar una estación (plataforma, túnel o calibradora, según a qué
  // punto corresponda) directo sobre el plano — mismo patrón de pointer
  // capture que los objetos sueltos.
  const estacionDragRef = useRef(null);
  const onEstacionPointerDown = (e, key, p) => {
    e.stopPropagation();
    estacionDragRef.current = { key, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onEstacionPointerMove = (e) => {
    const d = estacionDragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / zoom, dy = (e.clientY - d.sy) / zoom;
    moverEstacion(d.key, d.ox + dx, d.oy + dy);
  };
  const onEstacionPointerUp = () => { estacionDragRef.current = null; };

  // Arrastrar a una persona dentro de su estación (solo en modo edición) —
  // guarda un desplazamiento (dx,dy) respecto a su posición automática, no
  // una coordenada absoluta, para que siga viendose bien aunque cambie de
  // estación después.
  const [posPersonas, setPosPersonas] = useState({});
  const personaDragRef = useRef(null);
  const onPersonaPointerDown = (e, empNum, offActual) => {
    if (!editando) return;
    e.stopPropagation();
    personaDragRef.current = { empNum, sx: e.clientX, sy: e.clientY, ox: offActual.dx, oy: offActual.dy };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPersonaPointerMove = (e) => {
    const d = personaDragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / zoom, dy = (e.clientY - d.sy) / zoom;
    setPosPersonas(prev => ({ ...prev, [d.empNum]: { dx: d.ox + dx, dy: d.oy + dy } }));
  };
  const onPersonaPointerUp = () => { personaDragRef.current = null; };
  const restablecerPosPersonas = () => setPosPersonas({});

  // Rutas de caminata (solo visual): cada persona puede tener una lista de
  // estaciones a recorrer en orden. `activa` la enciende/apaga sin perder
  // la ruta armada.
  const [rutasPersonas, setRutasPersonas] = useState({});
  const toggleRutaPunto = (empNum, stageKey) => {
    setRutasPersonas(prev => {
      const actual = prev[empNum]?.stages || [];
      // clic sobre la última parada ya puesta = quitarla (deshacer); si no,
      // se agrega al final del recorrido.
      const stages = actual[actual.length - 1] === stageKey ? actual.slice(0, -1) : [...actual, stageKey];
      return { ...prev, [empNum]: { ...prev[empNum], stages, activa: prev[empNum]?.activa && stages.length >= 2 } };
    });
  };
  const limpiarRuta = (empNum) => {
    setRutasPersonas(prev => ({ ...prev, [empNum]: { stages: [], activa: false } }));
  };
  const toggleActivaRuta = (empNum) => {
    setRutasPersonas(prev => {
      const r = prev[empNum];
      if (!r || r.stages.length < 2) return prev;
      return { ...prev, [empNum]: { ...r, activa: !r.activa } };
    });
  };

  // Ecosistema de objetos libres (pallets, básculas, cajas, muros, rejas,
  // techos, sillas, canecas, montacargas, estibadores, banda extra) — el
  // usuario los agrega y arrastra a su gusto dentro del plano.
  const [objetos, setObjetos] = useState([]);
  const [seleccionId, setSeleccionId] = useState(null);
  const [nuevoId, setNuevoId] = useState(null); // objeto recién agregado — se desplaza a la vista y destella
  // Arranca después del id más alto ya guardado, para no chocar con
  // objetos ya guardados en Supabase, para no chocar con uno existente.
  const agregarObjeto = (tipo, x, y) => {
    const def = TIPOS_OBJETO[tipo];
    const maxId = objetos.reduce((max, o) => {
      const n = parseInt(String(o.id).replace(/^o/, ""), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    const id = `o${maxId + 1}`;
    const nuevo = {
      id, tipo, x: x ?? LAYOUT.width / 2, y: y ?? LAYOUT.height / 2,
      rot: 0, escala: 1, ancho: def.anchoDef, alto: def.altoDef, largo: def.largoDef,
    };
    setObjetos(prev => [...prev, nuevo]);
    setSeleccionId(id);
    setNuevoId(id);
    setTimeout(() => setNuevoId(prev => (prev === id ? null : prev)), 1200);
  };
  const moverObjeto = (id, x, y) => setObjetos(prev => prev.map(o => o.id === id ? { ...o, x, y } : o));
  const actualizarObjeto = (id, cambios) => setObjetos(prev => prev.map(o => o.id === id ? { ...o, ...cambios } : o));
  const eliminarObjeto = (id) => {
    setObjetos(prev => prev.filter(o => o.id !== id));
    setSeleccionId(prev => (prev === id ? null : prev));
  };
  const objetoSeleccionado = objetos.find(o => o.id === seleccionId) || null;

  // El diseño se edita en local mientras se arrastra (para que sea fluido)
  // y este botón lo sube a Supabase — desde ahí sí lo ve cualquiera que
  // entre al módulo, no solo este navegador.
  const [guardadoMsg, setGuardadoMsg] = useState("");
  const [guardando, setGuardando] = useState(false);
  const guardarCambiosPlano = async () => {
    setGuardando(true);
    const ok = await guardarDiseno({ calibCfg, posCustom, posPersonas, objetos, rutasPersonas }, nombreUsuarioSesion());
    setGuardando(false);
    setGuardadoMsg(ok ? "✅ Cambios guardados — ya se ven en la web" : "⚠️ No se pudo guardar, intenta de nuevo");
    setTimeout(() => setGuardadoMsg(""), 2800);
  };

  // Aplica el diseño cargado (o actualizado en vivo por otra persona) al
  // estado local editable — salvo que estés editando en este momento, para
  // no pisarte una edición en curso si a alguien más le llega a guardar
  // algo. Es sincronizar estado local con una fuente externa (Supabase),
  // uno de los usos válidos de useEffect, por eso se apaga el lint aquí.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (editando) return;
    setCalibCfg({ ...CALIB_CFG_DEFAULT, ...diseno.calibCfg });
    setPosCustom(diseno.posCustom);
    setPosPersonas(diseno.posPersonas);
    setObjetos(diseno.objetos);
    setRutasPersonas(diseno.rutasPersonas);
  }, [diseno, editando]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Desligado de Asistencia por ahora: todos los empleados activos están
  // disponibles para ubicar a mano en la línea, sin depender de quién marcó
  // presente en el registro diario.
  const personas = empleados;

  const areaPorNombre = useMemo(() => {
    const m = {};
    areas.forEach(a => { m[a.nombre] = a; });
    return m;
  }, [areas]);

  // Índice de la etapa (0-11) donde vive cada área real de la base de datos
  // — así sabemos en qué punto del plano dibujar a cada persona.
  const stageIndexPorAreaId = useMemo(() => {
    const m = {};
    STAGES.forEach((s, i) => {
      if (s.tipo !== "area") return;
      const a = areaPorNombre[s.nombre];
      if (a) m[a.id] = i;
    });
    return m;
  }, [areaPorNombre]);

  // ── Simulación de flujo (estilo FlexSim) ──────────────────────────────
  const [simPanelAbierto, setSimPanelAbierto] = useState(false);
  const [simActiva, setSimActiva] = useState(false);
  const [simCfg, setSimCfg] = useState(() => cargarSimCfg());
  const [simSnapshot, setSimSnapshot] = useState(null);
  useEffect(() => {
    try { localStorage.setItem(SIM_CFG_KEY, JSON.stringify(simCfg)); } catch { /* noop */ }
  }, [simCfg]);

  const capacidadSim = useCallback((stageKey) => {
    const s = STAGES.find(x => x.key === stageKey);
    if (s.tipo !== "area") return SIM_CAPACIDAD_AUTOMATICO;
    return areaPorNombre[s.nombre]?.capacidad || 1;
  }, [areaPorNombre]);

  const simRef = useRef(null);
  if (simRef.current === null) {
    simRef.current = {
      reloj: 0, siguienteId: 1, proximaLlegadaEn: simCfg.ritmoLlegadaSeg,
      estaciones: Object.fromEntries(STAGES.map(s => [s.key, estacionSimVacia()])),
    };
  }

  const clonarSimSnapshot = useCallback(() => {
    const st = simRef.current;
    return {
      reloj: st.reloj,
      estaciones: Object.fromEntries(Object.entries(st.estaciones).map(([k, v]) => [
        k, { ocupados: v.ocupados.length, cola: v.cola.length, procesados: v.procesados, tiempoOcupado: v.tiempoOcupado },
      ])),
    };
  }, []);

  const reiniciarSim = useCallback(() => {
    simRef.current = {
      reloj: 0, siguienteId: 1, proximaLlegadaEn: simCfg.ritmoLlegadaSeg,
      estaciones: Object.fromEntries(STAGES.map(s => [s.key, estacionSimVacia()])),
    };
    setSimSnapshot(clonarSimSnapshot());
  }, [simCfg.ritmoLlegadaSeg, clonarSimSnapshot]);

  const avanzarSim = useCallback((dtSeg) => {
    const st = simRef.current;
    st.reloj += dtSeg;

    const primeraKey = STAGES[0].key;
    while (st.reloj >= st.proximaLlegadaEn) {
      st.estaciones[primeraKey].cola.push(st.siguienteId++);
      st.proximaLlegadaEn += Math.max(1, simCfg.ritmoLlegadaSeg);
    }

    STAGES.forEach((s, i) => {
      const est = st.estaciones[s.key];
      const terminados = est.ocupados.filter(o => o.finEn <= st.reloj);
      if (terminados.length) est.ocupados = est.ocupados.filter(o => o.finEn > st.reloj);
      terminados.forEach(o => {
        est.procesados++;
        const siguiente = STAGES[i + 1];
        if (siguiente) st.estaciones[siguiente.key].cola.push(o.id);
      });
      const cap = capacidadSim(s.key);
      while (est.cola.length > 0 && est.ocupados.length < cap) {
        const id = est.cola.shift();
        const dur = Math.max(1, simCfg.tiempos[s.key] ?? 20);
        est.ocupados.push({ id, finEn: st.reloj + dur });
      }
      est.tiempoOcupado += est.ocupados.length * dtSeg;
    });
  }, [simCfg, capacidadSim]);

  useEffect(() => {
    if (!simActiva) return;
    const REAL_MS = 200;
    const id = setInterval(() => {
      avanzarSim((REAL_MS / 1000) * simCfg.velocidad);
      setSimSnapshot(clonarSimSnapshot());
    }, REAL_MS);
    return () => clearInterval(id);
  }, [simActiva, simCfg.velocidad, avanzarSim, clonarSimSnapshot]);

  const simUltimaKey = STAGES[STAGES.length - 1].key;
  const simThroughputHora = simSnapshot && simSnapshot.reloj > 0
    ? (simSnapshot.estaciones[simUltimaKey].procesados / simSnapshot.reloj) * 3600
    : 0;
  const simWipTotal = simSnapshot
    ? Object.values(simSnapshot.estaciones).reduce((s, e) => s + e.ocupados + e.cola, 0)
    : 0;

  const ultimoMovPorEmp = useMemo(() => {
    const m = {};
    movimientos.forEach(mv => {
      const prev = m[mv.empNum];
      if (!prev || new Date(mv.hora) > new Date(prev.hora)) m[mv.empNum] = mv;
    });
    return m;
  }, [movimientos]);

  const movimientosPorEmp = useMemo(() => {
    const m = {};
    movimientos.forEach(mv => { (m[mv.empNum] ??= []).push(mv); });
    Object.values(m).forEach(list => list.sort((a, b) => new Date(a.hora) - new Date(b.hora)));
    return m;
  }, [movimientos]);

  // Resalta un instante el chip de quien acaba de cambiar de área.
  useEffect(() => {
    const nuevos = {};
    personas.forEach(e => {
      const areaActual = ultimoMovPorEmp[e.num]?.areaId ?? null;
      const anterior = prevAreaRef.current[e.num];
      if (anterior !== undefined && anterior !== areaActual) nuevos[e.num] = true;
      prevAreaRef.current[e.num] = areaActual;
    });
    if (!Object.keys(nuevos).length) return;
    setResaltados(prev => ({ ...prev, ...nuevos }));
    const t = setTimeout(() => {
      setResaltados(prev => {
        const c = { ...prev };
        Object.keys(nuevos).forEach(k => delete c[k]);
        return c;
      });
    }, 900);
    return () => clearTimeout(t);
  }, [personas, ultimoMovPorEmp]);

  const porArea = useMemo(() => {
    const m = {};
    areas.forEach(a => { m[a.id] = []; });
    personas.forEach(e => {
      const mv = ultimoMovPorEmp[e.num];
      if (mv && m[mv.areaId]) m[mv.areaId].push({ emp: e, desde: mv.hora });
    });
    return m;
  }, [areas, personas, ultimoMovPorEmp]);

  const sinAsignar = personas.filter(e => !ultimoMovPorEmp[e.num]);

  // Personas con ruta de caminata activa (>=2 paradas) — se sacan de la
  // lista fija de su estación y se dibujan aparte, caminando el recorrido.
  const caminantes = useMemo(() => {
    return personas
      .map(emp => {
        const r = rutasPersonas[emp.num];
        if (!r?.activa || (r.stages || []).length < 2) return null;
        const coords = r.stages.map(key => {
          const idx = STAGES.findIndex(s => s.key === key);
          return idx >= 0 ? puntos[idx] : null;
        }).filter(Boolean);
        if (coords.length < 2) return null;
        const d = coords.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");
        let largo = 0;
        for (let i = 1; i < coords.length; i++) largo += Math.hypot(coords[i].x - coords[i - 1].x, coords[i].y - coords[i - 1].y);
        const dur = Math.max(2, largo / VELOCIDAD_CAMINATA);
        const primeraStage = STAGES.find(s => s.key === r.stages[0]);
        const color = (primeraStage && areaPorNombre[primeraStage.nombre]?.color) || "#fbbf24";
        return { emp, d, dur, color };
      })
      .filter(Boolean);
  }, [personas, rutasPersonas, puntos, areaPorNombre]);
  const caminandoNums = useMemo(() => new Set(caminantes.map(c => c.emp.num)), [caminantes]);

  const resumenPorArea = useMemo(() => {
    const acc = {};
    areas.forEach(a => { acc[a.id] = { ms: 0, personas: new Set() }; });
    Object.values(movimientosPorEmp).forEach(list => {
      list.forEach((mv, i) => {
        const finMs = i + 1 < list.length ? new Date(list[i + 1].hora).getTime() : now;
        const dur = Math.max(0, finMs - new Date(mv.hora).getTime());
        if (acc[mv.areaId]) { acc[mv.areaId].ms += dur; acc[mv.areaId].personas.add(mv.empNum); }
      });
    });
    return acc;
  }, [movimientosPorEmp, areas, now]);

  const mover = async (emp, area) => {
    setMenuAbierto(null);
    const fromIdx = stageIndexPorAreaId[ultimoMovPorEmp[emp.num]?.areaId] ?? -1;
    const toIdx = stageIndexPorAreaId[area.id] ?? -1;
    if (toIdx >= 0) {
      const toP = puntos[toIdx];
      const fromP = fromIdx >= 0 ? puntos[fromIdx] : { x: puntos[0].x - 80, y: puntos[0].y - 55 };
      const viajeId = ++viajeIdRef.current;
      setViajero({ id: viajeId, from: fromP, to: toP, color: area.color });
      setTimeout(() => setViajero(v => (v?.id === viajeId ? null : v)), 1000);
    }
    const ok = await moverPersona(emp.num, area.id, { origen: "manual", registradoPor: nombreUsuarioSesion() });
    if (ok) {
      registrarActividad({
        usuario: nombreUsuarioSesion(), modulo: "Máquina", accion: "mover_area",
        detalle: `${emp.nombre} → ${area.nombre}`, referencia: emp.num,
      });
    }
  };

  if (loadingPersonal || loadingMaquina || loadingDiseno) return <LimonLoader texto="Cargando la máquina" />;

  const chip = (emp, desde, areaActual) => {
    const desdeMs = desde ? new Date(desde).getTime() : null;
    const resaltado = !!resaltados[emp.num];
    const off = posPersonas[emp.num] || { dx: 0, dy: 0 };
    const rutaEmp = rutasPersonas[emp.num] || { stages: [], activa: false };
    return (
      <div
        key={emp.num}
        style={{
          position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
          transform: (off.dx || off.dy) ? `translate(${off.dx}px, ${off.dy}px)` : undefined,
          cursor: editando ? "grab" : "default", touchAction: editando ? "none" : "auto",
        }}
        onMouseEnter={() => setHoverNum(emp.num)}
        onMouseLeave={() => setHoverNum(v => (v === emp.num ? null : v))}
        onPointerDown={(e) => onPersonaPointerDown(e, emp.num, off)}
        onPointerMove={onPersonaPointerMove}
        onPointerUp={onPersonaPointerUp}
      >
        {hoverNum === emp.num && menuAbierto !== emp.num && (
          <div style={{
            position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 6, zIndex: 15,
            background: "#1b1b26", border: `1px solid ${areaActual ? areaActual.color : "#666"}55`, borderRadius: 10,
            padding: "8px 11px", minWidth: 140, boxShadow: "0 10px 24px rgba(0,0,0,0.45)",
            pointerEvents: "none", animation: "mq-pop 0.15s ease",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "white", whiteSpace: "nowrap" }}>{emp.nombre}</div>
            {areaActual ? (
              <div style={{ fontSize: 9.5, fontWeight: 700, color: areaActual.color, marginTop: 3 }}>{areaActual.icono} {areaActual.nombre}</div>
            ) : (
              <div style={{ fontSize: 9.5, fontWeight: 700, color: "#F9A826", marginTop: 3 }}>⚠ sin ubicar</div>
            )}
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
              {desdeMs != null ? `⏱ ${fmtDur(now - desdeMs)} en esta estación` : "esperando ubicación"}
            </div>
          </div>
        )}
        <div style={{ position: "relative", width: 22, height: 22, flexShrink: 0 }}>
          <div style={{
            position: "absolute", left: "50%", bottom: -4, width: 20, height: 7, transform: "translateX(-50%)",
            borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 72%)",
            pointerEvents: "none",
          }} />
          <button
            onClick={() => setMenuAbierto(m => m === emp.num ? null : emp.num)}
            title={emp.nombre}
            style={{
              width: 22, height: 22, borderRadius: "50%", background: areaActual ? areaActual.color : "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.35)", color: "white", fontSize: 9, fontWeight: 800, padding: 0,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              animation: resaltado ? "mq-highlight 0.9s ease" : "none", position: "relative",
            }}
          >{iniciales(emp.nombre)}</button>
        </div>
        <span style={{ fontSize: 7.5, fontWeight: 600, color: "white", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 62 }}>
          {emp.nombre.split(" ")[0]}
        </span>
        {menuAbierto === emp.num && (
          <div style={{
            position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: 4, zIndex: 20,
            background: "#1b1b26", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10,
            padding: 6, minWidth: 170, boxShadow: "0 10px 30px rgba(0,0,0,0.4)", animation: "mq-pop 0.15s ease",
          }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", padding: "2px 8px 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>Mover a...</div>
            {areas.map(a => (
              <button
                key={a.id}
                disabled={areaActual?.id === a.id}
                onClick={() => mover(emp, a)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, width: "100%", background: "transparent",
                  border: "none", borderRadius: 6, padding: "6px 8px", cursor: areaActual?.id === a.id ? "default" : "pointer",
                  color: areaActual?.id === a.id ? "rgba(255,255,255,0.3)" : "white", fontSize: 11, fontWeight: 600,
                }}
              >
                <span>{a.icono}</span>{a.nombre}{areaActual?.id === a.id ? " (aquí)" : ""}
              </button>
            ))}
            <div style={{
              fontSize: 9, color: "rgba(255,255,255,0.4)", padding: "8px 8px 4px", textTransform: "uppercase",
              letterSpacing: 0.5, borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 4,
            }}>
              🚶 Ruta de caminata (solo visual)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 8px 6px" }}>
              {areas.map(a => {
                const stageKey = STAGES[stageIndexPorAreaId[a.id]]?.key;
                if (!stageKey) return null;
                const orden = (rutaEmp.stages || []).indexOf(stageKey);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleRutaPunto(emp.num, stageKey)}
                    title={a.nombre}
                    style={{
                      display: "flex", alignItems: "center", gap: 3,
                      background: orden >= 0 ? "rgba(132,94,247,0.25)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${orden >= 0 ? "#845EF7" : "rgba(255,255,255,0.15)"}`,
                      borderRadius: 6, color: "white", padding: "3px 6px", fontSize: 10.5, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {orden >= 0 && <span style={{ fontSize: 8, fontWeight: 800, color: "#a78bfa" }}>{orden + 1}</span>}
                    {a.icono}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6, padding: "0 8px 6px" }}>
              <button
                onClick={() => limpiarRuta(emp.num)}
                disabled={!(rutaEmp.stages || []).length}
                style={{
                  flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6,
                  color: (rutaEmp.stages || []).length ? "white" : "rgba(255,255,255,0.3)", padding: "5px 8px", fontSize: 10.5, fontWeight: 700,
                  cursor: (rutaEmp.stages || []).length ? "pointer" : "default",
                }}
              >
                Limpiar
              </button>
              <button
                onClick={() => toggleActivaRuta(emp.num)}
                disabled={(rutaEmp.stages || []).length < 2}
                style={{
                  flex: 1, background: rutaEmp.activa ? "rgba(255,107,107,0.15)" : "rgba(0,201,167,0.15)",
                  border: `1px solid ${(rutaEmp.stages || []).length < 2 ? "rgba(255,255,255,0.15)" : rutaEmp.activa ? "#FF6B6B" : "#00C9A7"}`,
                  borderRadius: 6, color: (rutaEmp.stages || []).length < 2 ? "rgba(255,255,255,0.3)" : rutaEmp.activa ? "#FF6B6B" : "#00C9A7",
                  padding: "5px 8px", fontSize: 10.5, fontWeight: 700, cursor: (rutaEmp.stages || []).length < 2 ? "default" : "pointer",
                }}
              >
                {rutaEmp.activa ? "⏹ Detener" : "▶ Iniciar"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      onClick={() => { if (menuAbierto) setMenuAbierto(null); if (seleccionId) setSeleccionId(null); }}
      style={editando ? { userSelect: "none", WebkitUserSelect: "none", MozUserSelect: "none" } : undefined}
    >
      <style>{CSS}</style>

      {respaldoLocal && (
        <div style={{
          background: "rgba(249,168,38,0.1)", border: "1px solid #F9A826", borderRadius: 12,
          padding: "12px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <div style={{ fontSize: 20 }}>💾</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#F9A826" }}>Hay un diseño guardado en este navegador que no se subió a la web</div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
              Es de antes de conectar el plano a Supabase. Recupéralo para que quede en la web, igual que lo dejaste aquí.
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); recuperarRespaldoLocal(); }}
            disabled={recuperando}
            style={{
              background: "rgba(0,201,167,0.15)", border: "1px solid #00C9A7", borderRadius: 8, color: "#00C9A7",
              padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: recuperando ? "wait" : "pointer", opacity: recuperando ? 0.6 : 1,
            }}
          >
            {recuperando ? "Recuperando..." : "♻️ Recuperar y subir a la web"}
          </button>
        </div>
      )}

      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: mob ? 18 : 22, fontWeight: 800, fontFamily: "'Syne',sans-serif", color: "white", letterSpacing: -0.5 }}>
            ⚙️ Máquina — Línea de Proceso
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.52)", marginTop: 2 }}>
            {personas.length > 0
              ? `${personas.length} empleados activos · ubícalos en la línea`
              : "No hay empleados activos registrados en Personal"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={(e) => { e.stopPropagation(); setSimPanelAbierto(v => !v); }}
            style={{
              background: simPanelAbierto ? "rgba(34,211,238,0.18)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${simPanelAbierto ? "#22D3EE" : "rgba(255,255,255,0.15)"}`,
              borderRadius: 8, color: simPanelAbierto ? "#67e8f9" : "rgba(255,255,255,0.7)",
              padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0,
            }}
          >
            📈 Simulación
          </button>
          {editando && (
            <button
              onClick={(e) => { e.stopPropagation(); guardarCambiosPlano(); }}
              disabled={guardando}
              style={{
                background: "rgba(0,201,167,0.15)", border: "1px solid #00C9A7", borderRadius: 8,
                color: "#00C9A7", padding: "7px 12px", fontSize: 11, fontWeight: 700,
                cursor: guardando ? "wait" : "pointer", flexShrink: 0, opacity: guardando ? 0.6 : 1,
              }}
            >
              {guardando ? "💾 Guardando..." : "💾 Guardar cambios"}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setEditando(v => !v); }}
            style={{
              background: editando ? "rgba(132,94,247,0.18)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${editando ? "#845EF7" : "rgba(255,255,255,0.15)"}`,
              borderRadius: 8, color: editando ? "#a78bfa" : "rgba(255,255,255,0.7)",
              padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0,
            }}
          >
            {editando ? "✅ Salir de edición" : "✏️ Editar máquina"}
          </button>
          {guardadoMsg && (
            <div style={{
              width: "100%", fontSize: 11, fontWeight: 700, color: guardadoMsg.startsWith("✅") ? "#00C9A7" : "#FF6B6B",
              marginTop: 2,
            }}>
              {guardadoMsg}
            </div>
          )}
        </div>
      </div>

      {simPanelAbierto && (
        <div style={{
          background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 12,
          padding: 14, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "#67e8f9", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>
              📈 Simulación de flujo — reloj {fmtRelojSim(simSnapshot?.reloj || 0)}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => setSimActiva(v => !v)}
                style={{
                  background: simActiva ? "rgba(255,107,107,0.15)" : "rgba(0,201,167,0.15)",
                  border: `1px solid ${simActiva ? "#FF6B6B" : "#00C9A7"}`, borderRadius: 8,
                  color: simActiva ? "#FF6B6B" : "#00C9A7", padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}
              >
                {simActiva ? "⏸️ Pausar" : "▶️ Correr"}
              </button>
              <button
                onClick={reiniciarSim}
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "rgba(255,255,255,0.7)", padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
              >
                🔄 Reiniciar
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {SIM_VELOCIDADES.map(v => (
                  <button
                    key={v}
                    onClick={() => setSimCfg(prev => ({ ...prev, velocidad: v }))}
                    style={{
                      background: simCfg.velocidad === v ? "#22D3EE" : "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6,
                      color: simCfg.velocidad === v ? "#0b1a1d" : "rgba(255,255,255,0.7)",
                      padding: "5px 9px", fontSize: 10.5, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    {v}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4, 1fr)", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>Throughput</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#67e8f9" }}>{simThroughputHora.toFixed(1)}</div>
              <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.35)" }}>unidades/hora simulada</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>En proceso ahora (WIP)</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "white" }}>{simWipTotal}</div>
              <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.35)" }}>unidades en el sistema</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>Ritmo de llegada</div>
              <input
                type="range" min="10" max="120" step="5" value={simCfg.ritmoLlegadaSeg}
                onChange={e => setSimCfg(prev => ({ ...prev, ritmoLlegadaSeg: Number(e.target.value) }))}
                style={{ width: "100%" }}
              />
              <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.5)" }}>1 unidad cada {simCfg.ritmoLlegadaSeg}s</div>
            </div>
          </div>

          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Tiempo de proceso por estación (segundos) y estado en vivo
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
              <thead>
                <tr style={{ color: "rgba(255,255,255,0.5)", textAlign: "left" }}>
                  <th style={{ padding: "4px 6px" }}>Estación</th>
                  <th style={{ padding: "4px 6px" }}>Tiempo (s)</th>
                  <th style={{ padding: "4px 6px" }}>Ocupado</th>
                  <th style={{ padding: "4px 6px" }}>En cola</th>
                  <th style={{ padding: "4px 6px" }}>Procesados</th>
                  <th style={{ padding: "4px 6px" }}>Utilización</th>
                </tr>
              </thead>
              <tbody>
                {STAGES.map(s => {
                  const est = simSnapshot?.estaciones[s.key];
                  const cap = capacidadSim(s.key);
                  const util = est && simSnapshot.reloj > 0 && cap < SIM_CAPACIDAD_AUTOMATICO
                    ? Math.min(100, (est.tiempoOcupado / (cap * simSnapshot.reloj)) * 100) : null;
                  const esCuello = util != null && util > 85;
                  return (
                    <tr key={s.key} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", color: "white" }}>
                      <td style={{ padding: "4px 6px" }}>{s.icono} {s.nombre}</td>
                      <td style={{ padding: "4px 6px" }}>
                        <input
                          type="number" min="1" max="600" value={simCfg.tiempos[s.key] ?? 20}
                          onChange={e => setSimCfg(prev => ({ ...prev, tiempos: { ...prev.tiempos, [s.key]: Math.max(1, Number(e.target.value) || 1) } }))}
                          style={{ width: 52, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 5, color: "white", padding: "2px 5px", fontSize: 10.5 }}
                        />
                      </td>
                      <td style={{ padding: "4px 6px" }}>{est ? `${est.ocupados}${cap < SIM_CAPACIDAD_AUTOMATICO ? `/${cap}` : ""}` : "—"}</td>
                      <td style={{ padding: "4px 6px", color: est?.cola > 0 ? "#F9A826" : "white", fontWeight: est?.cola > 0 ? 700 : 400 }}>{est?.cola ?? 0}</td>
                      <td style={{ padding: "4px 6px" }}>{est?.procesados ?? 0}</td>
                      <td style={{ padding: "4px 6px", color: esCuello ? "#FF6B6B" : "rgba(255,255,255,0.7)", fontWeight: esCuello ? 700 : 400 }}>
                        {util != null ? `${util.toFixed(0)}%${esCuello ? " ⚠️ cuello de botella" : ""}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editando && (
        <div style={{
          background: "rgba(132,94,247,0.06)", border: "1px solid rgba(132,94,247,0.3)", borderRadius: 12,
          padding: 14, marginBottom: 16,
        }}>
          <div style={{ fontSize: 10, color: "#a78bfa", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            🛠️ Ajustar la calibradora en vivo
          </div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)" }}>
            {[
              { key: "angulo", label: "Ángulo de bandejas (0 = recto)", min: -45, max: 45, step: 1, unidad: "°" },
              { key: "largo", label: "Largo de bandeja", min: 25, max: 70, step: 1, unidad: "px" },
              { key: "ancho", label: "Ancho de bandeja", min: 15, max: 40, step: 1, unidad: "px" },
              { key: "spineHalf", label: "Longitud del eje", min: 50, max: 140, step: 2, unidad: "px" },
            ].map(campo => (
              <div key={campo.key}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginBottom: 3 }}>
                  {campo.label}: <b style={{ color: "white" }}>{calibCfg[campo.key]}{campo.unidad}</b>
                </div>
                <input
                  type="range" min={campo.min} max={campo.max} step={campo.step} value={calibCfg[campo.key]}
                  onChange={e => setCalibCfg(prev => ({ ...prev, [campo.key]: Number(e.target.value) }))}
                  style={{ width: "100%" }}
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => setCalibCfg({ ...CALIB_CFG_DEFAULT })}
            style={{ marginTop: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "rgba(255,255,255,0.7)", padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
          >
            ↺ Restablecer a los valores originales
          </button>

          <div style={{ fontSize: 10, color: "#a78bfa", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, margin: "16px 0 10px" }}>
            🧲 Estaciones del plano
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
            Todas las estaciones (incluido el túnel y la calibradora, arrastrando su punto) se pueden mover directo con el mouse — no hace falta estar en este panel para hacerlo. Con "Editar máquina" activo, las personas dentro de cada estación también se pueden arrastrar para acomodarlas.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={restablecerPosiciones}
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "rgba(255,255,255,0.7)", padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
            >
              ↺ Restablecer posiciones de las estaciones
            </button>
            <button
              onClick={restablecerPosPersonas}
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "rgba(255,255,255,0.7)", padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
            >
              ↺ Restablecer posiciones de las personas
            </button>
          </div>

          <div style={{ fontSize: 10, color: "#a78bfa", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, margin: "16px 0 10px" }}>
            🧩 Agregar objetos al plano
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(TIPOS_OBJETO).map(([tipo, def]) => (
              <button
                key={tipo}
                onClick={() => setColocando(prev => (prev === tipo ? null : tipo))}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: colocando === tipo ? "rgba(132,94,247,0.25)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${colocando === tipo ? "#845EF7" : "rgba(255,255,255,0.15)"}`,
                  borderRadius: 8, color: "white",
                  padding: "6px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}
              >
                <span>{def.icono}</span>+ {def.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 9.5, color: colocando ? "#a78bfa" : "rgba(255,255,255,0.4)", marginTop: 6, fontWeight: colocando ? 700 : 400 }}>
            {colocando
              ? "Mueve el mouse sobre el plano y haz clic donde quieras soltarlo (Esc para cancelar)."
              : "Elige un objeto y luego haz clic en el plano para colocarlo. Ya puesto, arrástralo para moverlo libremente; al seleccionarlo aparecen tres asas moradas: la de arriba lo rota, la de la esquina cambia su ancho/alto, y la de abajo (sobre el bloque de sombra) ajusta su largo — todo arrastrando con el mouse. El panel de abajo sigue disponible para valores exactos."}
          </div>

          {objetoSeleccionado && (
            <div style={{ marginTop: 12, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 10, color: "white", fontWeight: 800, marginBottom: 8 }}>
                {TIPOS_OBJETO[objetoSeleccionado.tipo]?.icono} {TIPOS_OBJETO[objetoSeleccionado.tipo]?.label} seleccionado
              </div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: mob ? "1fr" : "repeat(4, 1fr)" }}>
                {[
                  { key: "ancho", label: "Ancho", min: 8, max: 160, step: 1 },
                  { key: "alto", label: "Alto", min: 8, max: 160, step: 1 },
                  { key: "largo", label: "Largo", min: 4, max: 140, step: 1 },
                  { key: "rot", label: "Rotación °", min: 0, max: 359, step: 1 },
                  { key: "escala", label: "Escala", min: 0.4, max: 2.5, step: 0.05 },
                ].map(campo => {
                  const valor = campo.key === "largo"
                    ? (objetoSeleccionado.largo ?? TIPOS_OBJETO[objetoSeleccionado.tipo]?.largoDef ?? 16)
                    : objetoSeleccionado[campo.key];
                  return (
                    <div key={campo.key}>
                      <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.55)", marginBottom: 3 }}>
                        {campo.label}: <b style={{ color: "white" }}>{valor}</b>
                      </div>
                      <input
                        type="range" min={campo.min} max={campo.max} step={campo.step} value={valor}
                        onChange={e => actualizarObjeto(objetoSeleccionado.id, { [campo.key]: Number(e.target.value) })}
                        style={{ width: "100%" }}
                      />
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => eliminarObjeto(objetoSeleccionado.id)}
                style={{ marginTop: 10, background: "rgba(255,107,107,0.12)", border: "1px solid #FF6B6B40", borderRadius: 8, color: "#FF6B6B", padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                🗑 Eliminar este objeto
              </button>
            </div>
          )}
        </div>
      )}

      {sinAsignar.length > 0 && (
        <div style={{
          background: "rgba(249,168,38,0.06)", border: "1px solid rgba(249,168,38,0.25)", borderRadius: 12,
          padding: 12, marginBottom: 16,
        }}>
          <div style={{ fontSize: 10, color: "#F9A826", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            ⚠️ Sin ubicar en la línea ({sinAsignar.length})
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {sinAsignar.map(e => chip(e, null, null))}
          </div>
        </div>
      )}

      <div style={{ position: "relative" }}>
        <div style={{
          position: "absolute", top: 10, right: 10, zIndex: 30, display: "flex", alignItems: "center", gap: 6,
          background: "rgba(10,10,16,0.85)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 20,
          padding: "5px 10px", fontSize: 10.5, color: "rgba(255,255,255,0.75)", fontWeight: 700,
        }}>
          🔍 {Math.round(zoom * 100)}%
          {zoom !== 1 && (
            <button
              onClick={() => setZoom(1)}
              style={{ background: "transparent", border: "none", color: "#a78bfa", fontSize: 10.5, fontWeight: 800, cursor: "pointer", padding: 0 }}
            >
              restablecer
            </button>
          )}
        </div>
        <div
          ref={canvasScrollRef}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerLeave={onCanvasPointerUp}
          onClick={onCanvasClick}
          onWheel={onWheelZoom}
          style={{
            background: "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.05), transparent 60%), linear-gradient(180deg, #191b24, #101119)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: mob ? "10px" : 16,
            overflow: "auto", cursor: colocando ? "crosshair" : "grab", touchAction: "none",
          }}
        >
        <div style={{ width: LAYOUT.width * zoom, height: LAYOUT.height * zoom, margin: "0 auto" }}>
        <div ref={innerCanvasRef} style={{ position: "relative", width: LAYOUT.width, height: LAYOUT.height, transform: `scale(${zoom})`, transformOrigin: "top left" }}>
          <svg width={LAYOUT.width} height={LAYOUT.height} style={{ display: "block", position: "absolute", inset: 0 }}>
            <defs>
              <path id="mq-ruta-limones" d={rutaLimones} fill="none" />
              <path id="mq-ruta-cajas" d={rutaCajas} fill="none" />
              {/* Barniz de luz reutilizable: se superpone a cualquier cara de
                  color plano para que se vea con volumen/brillo, como si le
                  pegara la luz desde arriba-izquierda — en vez de un relleno
                  liso de caricatura. */}
              <linearGradient id="mq-sheen" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
                <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
              </linearGradient>
              <radialGradient id="mq-sombra-suelo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#000000" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </radialGradient>
              {/* Textura del limón — degradado radial verde-amarillo con
                  brillo desplazado, más una veta para que no se vea un
                  círculo plano de un solo color. */}
              <radialGradient id="mq-limon-grad" cx="38%" cy="32%" r="70%">
                <stop offset="0%" stopColor="#f5f0a8" />
                <stop offset="35%" stopColor="#e3d61f" />
                <stop offset="75%" stopColor="#b7c221" />
                <stop offset="100%" stopColor="#7f9c1e" />
              </radialGradient>
            </defs>

            {/* Calibradora real: eje de cadena + bandejas azules en espina
                de pescado, en vez de la plataforma genérica. Va ANTES de la
                banda a propósito: es la única estación donde la banda debe
                seguir viéndose por encima (las demás la tapan). */}
            <MaquinaCalibradora cfg={calibCfg} puntos={puntos} />

            {/* Banda transportadora — conecta cada etapa con la siguiente.
                Se dibuja aquí (antes del túnel y las plataformas) para que
                ESOS la tapen donde pasan por encima — entra por un lado de
                la máquina y sale por el otro, en vez de atravesarla visible.
                El tramo de Secado -> Fotoselección (el giro en U) se dibuja
                aparte, DESPUÉS del túnel, para que quede claramente después
                de Secado y nunca tapado por el borde del túnel. */}
            {STAGES.map((s, i) => {
              if (i === 0 || s.key === "foto") return null;
              const p0 = puntos[i - 1], p1 = puntos[i];
              return (
                <g key={`banda-${s.key}`}>
                  <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="rgba(255,255,255,0.12)" strokeWidth="13" strokeLinecap="round" />
                  <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#2a2e3a" strokeWidth="7.8" strokeLinecap="round" />
                  <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#38BDF8" strokeWidth="3.3" strokeLinecap="round" strokeDasharray="9 10.4" opacity="0.85">
                    <animate attributeName="stroke-dashoffset" from="0" to="-39" dur="0.6s" repeatCount="indefinite" />
                  </line>
                </g>
              );
            })}

            {/* Túnel único de acero (Lavado -> Encerado -> Secado) — en la
                planta real es una sola máquina larga con paneles
                perforados, no tres bloques sueltos. Va después de la banda
                para taparla donde pasa por debajo (entra/sale por los lados). */}
            <TunelLavadoEncSecado puntos={puntos} />

            {/* Banda de unión Secado -> Fotoselección — se dibuja después
                del túnel a propósito, para que quede visible justo DESPUÉS
                de Secado (nunca antes, tapada por el borde del túnel). */}
            {(() => {
              const iSecado = STAGES.findIndex(s => s.key === "secado");
              const iFoto = STAGES.findIndex(s => s.key === "foto");
              const p0 = puntos[iSecado], p1 = puntos[iFoto];
              return (
                <g>
                  <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="rgba(255,255,255,0.12)" strokeWidth="13" strokeLinecap="round" />
                  <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#2a2e3a" strokeWidth="7.8" strokeLinecap="round" />
                  <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#38BDF8" strokeWidth="3.3" strokeLinecap="round" strokeDasharray="9 10.4" opacity="0.85">
                    <animate attributeName="stroke-dashoffset" from="0" to="-39" dur="0.6s" repeatCount="indefinite" />
                  </line>
                </g>
              );
            })()}

            {/* Plataformas / cuerpos de máquina: prisma isométrico por etapa
                (cara izq/der más oscuras que la superior). El túnel y la
                calibradora de arriba ya cubren lavado/encerado/secado y
                empaque, así que esos no dibujan su propio prisma — solo el
                detalle animado encima. */}
            {STAGES.map((s, i) => {
              const c = puntos[i];
              const areaDb = s.tipo === "area" ? areaPorNombre[s.nombre] : null;
              const color = areaDb ? areaDb.color : COLOR_MAQUINA;
              const esTunel = s.tipo === "lavado" || s.tipo === "encerado" || s.tipo === "secado";
              const esCalibradora = s.key === "empaque";
              const top   = [[c.x, c.y - PLAT_H / 2], [c.x + PLAT_W / 2, c.y], [c.x, c.y + PLAT_H / 2], [c.x - PLAT_W / 2, c.y]];
              const left  = [[c.x - PLAT_W / 2, c.y], [c.x, c.y + PLAT_H / 2], [c.x, c.y + PLAT_H / 2 + PLAT_DEPTH], [c.x - PLAT_W / 2, c.y + PLAT_DEPTH]];
              const right = [[c.x, c.y + PLAT_H / 2], [c.x + PLAT_W / 2, c.y], [c.x + PLAT_W / 2, c.y + PLAT_DEPTH], [c.x, c.y + PLAT_H / 2 + PLAT_DEPTH]];
              return (
                <g
                  key={s.key}
                  onPointerDown={(e) => onEstacionPointerDown(e, s.key, c)}
                  onPointerMove={onEstacionPointerMove}
                  onPointerUp={onEstacionPointerUp}
                  style={{ cursor: "grab", touchAction: "none" }}
                >
                  {!esTunel && !esCalibradora && (
                    <>
                      <polygon points={poly(left)} fill={shade(color, 0.45)} />
                      <polygon points={poly(right)} fill={shade(color, 0.65)} />
                      <polygon points={poly(top)} fill={color} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
                      <polygon points={poly(top)} fill="url(#mq-sheen)" pointerEvents="none" />
                    </>
                  )}
                  {(esTunel || esCalibradora) && (
                    // El túnel/calibradora dibujan su propio cuerpo aparte —
                    // esta área invisible es solo para poder agarrar y
                    // arrastrar el punto de la estación desde aquí también.
                    <circle cx={c.x} cy={c.y} r={PLAT_W / 2} fill="transparent" pointerEvents="all" />
                  )}
                  {s.tipo === "lavado" && <DetalleRodillos cx={c.x} cy={c.y} tinte="#38BDF8" />}
                  {s.tipo === "encerado" && <DetalleRodillos cx={c.x} cy={c.y} tinte="#eab308" />}
                  {s.tipo === "secado" && <DetalleHorno cx={c.x} cy={c.y} />}
                  {s.tipo === "foto" && <DetalleCamara cx={c.x} cy={c.y} />}
                  {s.key === "recepcion" && <DetalleCamion cx={c.x + 110} cy={c.y - 58} />}
                  {s.tipo === "area" && (porArea[areaDb?.id] || []).length > 0 && <DetalleTarea tarea={s.key} cx={c.x} cy={c.y} casco={color} />}
                  {simPanelAbierto && simSnapshot?.estaciones[s.key] && (
                    <g transform={`translate(${c.x - PLAT_W / 2 - 16},${c.y})`}>
                      {Array.from({ length: Math.min(simSnapshot.estaciones[s.key].ocupados, 6) }).map((_, idx) => (
                        <circle key={`o${idx}`} cx="0" cy={-idx * 9} r="3.4" fill="#22D3EE" stroke="#0b1a1d" strokeWidth="0.8" />
                      ))}
                      {Array.from({ length: Math.min(simSnapshot.estaciones[s.key].cola, 6) }).map((_, idx) => (
                        <circle key={`c${idx}`} cx="0" cy={9 + idx * 9} r="3" fill="#F9A826" opacity="0.75" />
                      ))}
                      {simSnapshot.estaciones[s.key].cola > 6 && (
                        <text x="0" y={9 + 6 * 9 + 10} fontSize="8" fill="#F9A826" textAnchor="middle">+{simSnapshot.estaciones[s.key].cola - 6}</text>
                      )}
                    </g>
                  )}
                </g>
              );
            })}

            {/* Limones sueltos viajando por la banda desde Recepción hasta
                Empaque — de ahí en adelante hasta Paletizado ya viajan
                cajas armadas, no fruta suelta. */}
            {[0, 1, 2].map(k => (
              <circle key={`limon-${k}`} r="5.5" fill="url(#mq-limon-grad)" stroke="#5b7515" strokeWidth="0.8">
                <animateMotion dur="8s" repeatCount="indefinite" begin={`${-k * (8 / 3)}s`} rotate="auto">
                  <mpath href="#mq-ruta-limones" />
                </animateMotion>
              </circle>
            ))}
            {/* Cajas ya armadas, desde Empaque hasta Paletizado. */}
            {[0, 1].map(k => (
              <rect key={`caja-${k}`} x="-6" y="-5" width="12" height="10" rx="1.5" fill="#b3792c" stroke="#6b4416" strokeWidth="1">
                <animateMotion dur="4s" repeatCount="indefinite" begin={`${-k * 2}s`} rotate="auto">
                  <mpath href="#mq-ruta-cajas" />
                </animateMotion>
              </rect>
            ))}

            {/* Personas con ruta de caminata activa: recorren su ruta con
                animateMotion — keyPoints "0;1;0" hace que vayan del primer
                punto al último y, al llegar, se devuelvan por el mismo
                camino, en bucle. rotate NO se usa (queda "0") para que el
                personaje se mantenga de pie, no acostado sobre el camino. */}
            {caminantes.map(({ emp, d, dur, color }) => (
              <g key={`camina-${emp.num}`}>
                <path id={`mq-ruta-camina-${emp.num}`} d={d} fill="none" />
                <g>
                  <animateMotion dur={`${dur}s`} repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear" rotate="0">
                    <mpath href={`#mq-ruta-camina-${emp.num}`} />
                  </animateMotion>
                  <TrabajadorCaminando casco={color} nombre={emp.nombre.split(" ")[0]} />
                </g>
              </g>
            ))}
          </svg>

          {/* Rótulo + personas de cada etapa, ancladas justo encima de su
              plataforma (position absolute + translate -100% = el borde
              inferior de este bloque queda fijo aunque crezca hacia arriba) */}
          {STAGES.map((s, i) => {
            const c = puntos[i];
            const areaDb = s.tipo === "area" ? areaPorNombre[s.nombre] : null;
            const gente = areaDb ? (porArea[areaDb.id] || []).filter(({ emp }) => !caminandoNums.has(emp.num)) : [];
            const color = areaDb ? areaDb.color : COLOR_MAQUINA;
            return (
              <div key={s.key} style={{
                position: "absolute", left: c.x, top: c.y - PLAT_H / 2 - 8,
                transform: "translate(-50%, -100%)", display: "flex", flexDirection: "column",
                alignItems: "center", gap: 8, width: 128,
              }}>
                {s.tipo === "area" ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 8px", alignItems: "flex-end", justifyContent: "center" }}>
                    {!areaDb ? (
                      <div style={{ fontSize: 8.5, color: "#F9A826", textAlign: "center" }}>⚠ corre la migración SQL</div>
                    ) : gente.length === 0 ? (
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>Sin nadie aquí</div>
                    ) : (
                      gente.map(({ emp, desde }) => chip(emp, desde, areaDb))
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>automático</div>
                )}
                <div style={{
                  display: "flex", alignItems: "center", gap: 5, background: "rgba(10,10,16,0.85)",
                  border: `1px solid ${color}55`, borderRadius: 20, padding: "3px 10px 3px 6px", whiteSpace: "nowrap",
                }}>
                  <span style={{ fontSize: 13 }}>{s.icono}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "white" }}>{s.nombre}</span>
                  {areaDb && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: "white", background: color, borderRadius: 20, padding: "0px 6px" }}>
                      {gente.length}{areaDb.capacidad ? `/${areaDb.capacidad}` : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {viajero && <FichaViajera from={viajero.from} to={viajero.to} color={viajero.color} />}

          {/* Objetos libres del usuario, en su propia capa POR ENCIMA de todo
              (incluidas las etiquetas/chips en HTML de arriba) — si no,
              quedaban tapados por esos fondos opacos al nacer en el centro
              del plano. */}
          <svg width={LAYOUT.width} height={LAYOUT.height} style={{ display: "block", position: "absolute", inset: 0, pointerEvents: "none" }}>
            <g style={{ pointerEvents: "auto" }}>
              {objetos.map(o => (
                <ObjetoLibre key={o.id} obj={o} seleccionado={o.id === seleccionId} esNuevo={o.id === nuevoId} editando={editando} onSeleccionar={setSeleccionId} onMover={moverObjeto} onAjustar={actualizarObjeto} />
              ))}
            </g>
            {colocando && mousePos && (
              <g transform={`translate(${mousePos.x},${mousePos.y})`} style={{ opacity: 0.55 }}>
                <IconoObjeto tipo={colocando} ancho={TIPOS_OBJETO[colocando].anchoDef} alto={TIPOS_OBJETO[colocando].altoDef} />
              </g>
            )}
          </svg>
        </div>
        </div>
        </div>
      </div>

      {areas.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "white", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
            📊 Resumen de hoy — tiempo acumulado por área
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            {areas.map(a => {
              const r = resumenPorArea[a.id] || { ms: 0, personas: new Set() };
              return (
                <div key={a.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>{a.icono} {a.nombre}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: a.color }}>{fmtDur(r.ms)}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>persona-tiempo acumulado · {r.personas.size} personas hoy</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
