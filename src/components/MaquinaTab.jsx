import { useState, useEffect, useMemo, useRef } from "react";
import { usePersonal } from "../hooks/usePersonal.js";
import { useMaquina } from "../hooks/useMaquina.js";
import { registrarActividad } from "../hooks/useActividad.js";
import LimonLoader from "./LimonLoader.jsx";

const nombreUsuarioSesion = () => {
  try { return JSON.parse(localStorage.getItem("tp_session"))?.nombre || ""; } catch { return ""; }
};

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
  const padX = PLAT_W / 2 + 90;
  const padTop = PLAT_H / 2 + 260;    // espacio para el rótulo + fichas de personas (hasta 8 en una estación)
  const padBottom = PLAT_H / 2 + PLAT_DEPTH + 40;
  const minX = Math.min(...xs) - padX, maxX = Math.max(...xs) + padX;
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
function TunelLavadoEncSecado() {
  const iL = STAGES.findIndex(s => s.key === "lavado");
  const iS = STAGES.findIndex(s => s.key === "secado");
  const pL = LAYOUT.puntos[iL], pS = LAYOUT.puntos[iS];
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

// Bandeja azul en "espina de pescado" — nace angosta junto al eje central
// y se abre hacia afuera, como en la foto real de la calibradora.
function bandejaPoly(base, dir, largo, wNear, wFar) {
  const perp = { x: -dir.y, y: dir.x };
  const near1 = { x: base.x + perp.x * wNear / 2, y: base.y + perp.y * wNear / 2 };
  const near2 = { x: base.x - perp.x * wNear / 2, y: base.y - perp.y * wNear / 2 };
  const farC = { x: base.x + dir.x * largo, y: base.y + dir.y * largo };
  const far1 = { x: farC.x + perp.x * wFar / 2, y: farC.y + perp.y * wFar / 2 };
  const far2 = { x: farC.x - perp.x * wFar / 2, y: farC.y - perp.y * wFar / 2 };
  return { puntos: [[near1.x, near1.y], [far1.x, far1.y], [far2.x, far2.y], [near2.x, near2.y]], centro: farC };
}

// Máquina calibradora real: eje central de cadena con bandejas azules que
// se abren hacia los dos lados en diagonal ("espina de pescado"), como en
// las fotos de la planta — no la plataforma genérica de antes.
function MaquinaCalibradora() {
  const iF = STAGES.findIndex(s => s.key === "foto");
  const iE = STAGES.findIndex(s => s.key === "empaque");
  const iP = STAGES.findIndex(s => s.key === "pesaje");
  const pF = LAYOUT.puntos[iF], pE = LAYOUT.puntos[iE], pP = LAYOUT.puntos[iP];
  const dx = pP.x - pF.x, dy = pP.y - pF.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;   // a lo largo del eje (dirección del flujo)
  const px = -uy, py = ux;              // perpendicular
  const along = (t, w = 0) => ({ x: pE.x + ux * t + px * w, y: pE.y + uy * t + py * w });

  const SPINE_HALF = 88;
  const spineA = along(-SPINE_HALF), spineB = along(SPINE_HALF);
  const enEje = (t, w = 0) => {
    const b = { x: spineA.x + (spineB.x - spineA.x) * t, y: spineA.y + (spineB.y - spineA.y) * t };
    return { x: b.x + px * w, y: b.y + py * w };
  };

  const N = 4; // bandejas por lado (representativas de las 8 reales)
  const dirIzq = rotar(px, py, 32);
  const dirDer = rotar(-px, -py, -32);
  const bandejas = [];
  const tS = [];
  for (let k = 0; k < N; k++) {
    const t = 0.1 + ((k + 0.5) / N) * 0.8;
    tS.push(t);
    const base = enEje(t);
    bandejas.push({ ...bandejaPoly(base, dirIzq, 54, 9, 32), t });
    bandejas.push({ ...bandejaPoly(base, dirDer, 54, 9, 32), t });
  }
  // Divisores metálicos entre bandejas consecutivas del mismo lado.
  const divisores = [];
  for (let k = 0; k < N - 1; k++) {
    const tMid = (tS[k] + tS[k + 1]) / 2;
    [dirIzq, dirDer].forEach(dir => {
      const base = enEje(tMid);
      divisores.push([base, { x: base.x + dir.x * 44, y: base.y + dir.y * 44 }]);
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

  // Puesto de control: mesa + monitor inclinado + teclado + radio.
  const desk = along(SPINE_HALF - 10, 44);

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
          <polygon
            points={poly(b.puntos.map(([x, y], k) => {
              const cx0 = (b.puntos[0][0] + b.puntos[2][0]) / 2, cy0 = (b.puntos[0][1] + b.puntos[2][1]) / 2;
              const f = k === 0 || k === 3 ? 0.24 : 0.14;
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
        [[-7, -3], [3, 3], [8, -4], [-2, 5]].map(([ox, oy], j) => (
          <circle key={`${idx}-${j}`} cx={b.centro.x + ox} cy={b.centro.y + oy} r="2.6" fill="#84cc16" stroke="#4d7c0f" strokeWidth="0.4" />
        ))
      ))}

      {/* eje central de cadena */}
      <line x1={spineA.x} y1={spineA.y} x2={spineB.x} y2={spineB.y} stroke="#1f2937" strokeWidth="12" strokeLinecap="round" />
      <line x1={spineA.x} y1={spineA.y} x2={spineB.x} y2={spineB.y} stroke="#4b5563" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="4 5" />

      {/* puesto de control: mesa, monitor, teclado y radio */}
      <g transform={`translate(${desk.x},${desk.y})`}>
        <rect x="-16" y="6" width="32" height="6" rx="1" fill="#6b4a2c" stroke="#4a3218" strokeWidth="1" />
        <g transform="rotate(-12)">
          <rect x="-11" y="-15" width="22" height="16" rx="1.5" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
          <rect x="-9" y="-13" width="18" height="11" rx="1" fill="#0f172a" stroke="#38BDF8" strokeWidth="0.8" />
          <rect x="-8" y="-12" width="7" height="4" fill="#38BDF8" opacity="0.75">
            <animate attributeName="opacity" values="0.75;0.25;0.75" dur="1.3s" repeatCount="indefinite" />
          </rect>
          <rect x="0" y="-12" width="7" height="4" fill="#22c55e" opacity="0.6">
            <animate attributeName="opacity" values="0.4;0.8;0.4" dur="1.7s" repeatCount="indefinite" />
          </rect>
        </g>
        <rect x="-9" y="3" width="12" height="6" rx="1" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="0.8" />
        {[0, 1, 2].map(c => <circle key={c} cx={-6 + c * 4} cy={6} r="0.9" fill="#4b5563" />)}
        <circle cx="8" cy="5" r="3.2" fill="#dc2626" stroke="#7f1d1d" strokeWidth="0.8" />
      </g>
    </g>
  );
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
      const toP = LAYOUT.puntos[toIdx];
      const fromP = fromIdx >= 0 ? LAYOUT.puntos[fromIdx] : { x: LAYOUT.puntos[0].x - 80, y: LAYOUT.puntos[0].y - 55 };
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

  if (loadingPersonal || loadingMaquina) return <LimonLoader texto="Cargando la máquina" />;

  const chip = (emp, desde, areaActual) => {
    const desdeMs = desde ? new Date(desde).getTime() : null;
    const resaltado = !!resaltados[emp.num];
    return (
      <div
        key={emp.num}
        style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}
        onMouseEnter={() => setHoverNum(emp.num)}
        onMouseLeave={() => setHoverNum(v => (v === emp.num ? null : v))}
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
        <button
          onClick={() => setMenuAbierto(m => m === emp.num ? null : emp.num)}
          title={emp.nombre}
          style={{
            width: 22, height: 22, borderRadius: "50%", background: areaActual ? areaActual.color : "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.35)", color: "white", fontSize: 9, fontWeight: 800, padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
            animation: resaltado ? "mq-highlight 0.9s ease" : "none",
          }}
        >{iniciales(emp.nombre)}</button>
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
          </div>
        )}
      </div>
    );
  };

  return (
    <div onClick={() => menuAbierto && setMenuAbierto(null)}>
      <style>{CSS}</style>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: mob ? 18 : 22, fontWeight: 800, fontFamily: "'Syne',sans-serif", color: "white", letterSpacing: -0.5 }}>
          ⚙️ Máquina — Línea de Proceso
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.52)", marginTop: 2 }}>
          {personas.length > 0
            ? `${personas.length} empleados activos · ubícalos en la línea`
            : "No hay empleados activos registrados en Personal"}
        </div>
      </div>

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

      <div style={{
        background: "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.05), transparent 60%), linear-gradient(180deg, #191b24, #101119)",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: mob ? "10px" : 16,
        overflow: "auto",
      }}>
        <div style={{ position: "relative", width: LAYOUT.width, height: LAYOUT.height, margin: "0 auto" }}>
          <svg width={LAYOUT.width} height={LAYOUT.height} style={{ display: "block", position: "absolute", inset: 0 }}>
            <defs>
              <path id="mq-ruta-flujo" d={LAYOUT.ruta} fill="none" />
            </defs>

            {/* Túnel único de acero (Lavado -> Encerado -> Secado) — en la
                planta real es una sola máquina larga con paneles
                perforados, no tres bloques sueltos. */}
            <TunelLavadoEncSecado />

            {/* Calibradora real: eje de cadena + bandejas azules en espina
                de pescado, en vez de la plataforma genérica. */}
            <MaquinaCalibradora />

            {/* Plataformas / cuerpos de máquina: prisma isométrico por etapa
                (cara izq/der más oscuras que la superior). El túnel y la
                calibradora de arriba ya cubren lavado/encerado/secado y
                empaque, así que esos no dibujan su propio prisma — solo el
                detalle animado encima. */}
            {STAGES.map((s, i) => {
              const c = LAYOUT.puntos[i];
              const areaDb = s.tipo === "area" ? areaPorNombre[s.nombre] : null;
              const color = areaDb ? areaDb.color : COLOR_MAQUINA;
              const esTunel = s.tipo === "lavado" || s.tipo === "encerado" || s.tipo === "secado";
              const esCalibradora = s.key === "empaque";
              const top   = [[c.x, c.y - PLAT_H / 2], [c.x + PLAT_W / 2, c.y], [c.x, c.y + PLAT_H / 2], [c.x - PLAT_W / 2, c.y]];
              const left  = [[c.x - PLAT_W / 2, c.y], [c.x, c.y + PLAT_H / 2], [c.x, c.y + PLAT_H / 2 + PLAT_DEPTH], [c.x - PLAT_W / 2, c.y + PLAT_DEPTH]];
              const right = [[c.x, c.y + PLAT_H / 2], [c.x + PLAT_W / 2, c.y], [c.x + PLAT_W / 2, c.y + PLAT_DEPTH], [c.x, c.y + PLAT_H / 2 + PLAT_DEPTH]];
              return (
                <g key={s.key}>
                  {!esTunel && !esCalibradora && (
                    <>
                      <polygon points={poly(left)} fill={shade(color, 0.45)} />
                      <polygon points={poly(right)} fill={shade(color, 0.65)} />
                      <polygon points={poly(top)} fill={color} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
                    </>
                  )}
                  {s.tipo === "lavado" && <DetalleRodillos cx={c.x} cy={c.y} tinte="#38BDF8" />}
                  {s.tipo === "encerado" && <DetalleRodillos cx={c.x} cy={c.y} tinte="#eab308" />}
                  {s.tipo === "secado" && <DetalleHorno cx={c.x} cy={c.y} />}
                  {s.tipo === "foto" && <DetalleCamara cx={c.x} cy={c.y} />}
                  {s.key === "recepcion" && <DetalleCamion cx={c.x + 110} cy={c.y - 58} />}
                  {s.tipo === "area" && (porArea[areaDb?.id] || []).length > 0 && <DetalleTarea tarea={s.key} cx={c.x} cy={c.y} casco={color} />}
                </g>
              );
            })}

            {/* Banda transportadora — conecta cada etapa con la siguiente,
                incluido el giro en U entre Secado y Fotoselección. Se dibuja
                despues del túnel y las plataformas para que siempre quede
                visible por encima (nunca tapada por el cuerpo de la máquina). */}
            {STAGES.map((s, i) => {
              if (i === 0) return null;
              const p0 = LAYOUT.puntos[i - 1], p1 = LAYOUT.puntos[i];
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

            {/* Cajas de fruta viajando por toda la banda, en bucle continuo */}
            {[0, 1, 2].map(k => (
              <rect key={k} width="11" height="11" rx="2" fill="#F2C94C" stroke="#8a6d1a" strokeWidth="1">
                <animateMotion dur="9s" repeatCount="indefinite" begin={`${-k * 3}s`} rotate="auto">
                  <mpath href="#mq-ruta-flujo" />
                </animateMotion>
              </rect>
            ))}
          </svg>

          {/* Rótulo + personas de cada etapa, ancladas justo encima de su
              plataforma (position absolute + translate -100% = el borde
              inferior de este bloque queda fijo aunque crezca hacia arriba) */}
          {STAGES.map((s, i) => {
            const c = LAYOUT.puntos[i];
            const areaDb = s.tipo === "area" ? areaPorNombre[s.nombre] : null;
            const gente = areaDb ? (porArea[areaDb.id] || []) : [];
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
