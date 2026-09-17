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
// "Editar máquina" (se guardan en localStorage, por eso viven aparte).
const CALIB_CFG_KEY = "tp_maquina_calibradora_cfg";
const CALIB_CFG_DEFAULT = {
  angulo: 0,       // grados respecto a perpendicular al eje — 0 = recto
  largo: 40,       // largo de cada bandeja
  ancho: 25,       // ancho de cada bandeja (igual en ambos extremos = rectángulo)
  spineHalf: 88,   // medio largo del eje central
  deskAlong: -143, // posición del puesto de control a lo largo del eje (negativo = antes)
  deskPerp: 60,    // posición del puesto de control a un lado del eje
};
function cargarCalibCfg() {
  try {
    const raw = localStorage.getItem(CALIB_CFG_KEY);
    return raw ? { ...CALIB_CFG_DEFAULT, ...JSON.parse(raw) } : { ...CALIB_CFG_DEFAULT };
  } catch { return { ...CALIB_CFG_DEFAULT }; }
}

// Máquina calibradora real: eje central de cadena con bandejas azules a los
// dos lados, como en las fotos de la planta — no la plataforma genérica de
// antes. `cfg` viene del panel de edición (ver más abajo); si no se pasa,
// usa los valores por defecto.
function MaquinaCalibradora({ cfg }) {
  const c = { ...CALIB_CFG_DEFAULT, ...cfg };
  const iF = STAGES.findIndex(s => s.key === "foto");
  const iE = STAGES.findIndex(s => s.key === "empaque");
  const iP = STAGES.findIndex(s => s.key === "pesaje");
  const pF = LAYOUT.puntos[iF], pE = LAYOUT.puntos[iE], pP = LAYOUT.puntos[iP];
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

  // Puesto de control: mesa + monitor inclinado + teclado + radio.
  const desk = along(c.deskAlong, c.deskPerp);

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

// ── Ecosistema de objetos libres ───────────────────────────────────────────
// Piezas sueltas que el usuario agrega y acomoda a mano dentro del plano
// (pallets, básculas, cajas, muros, rejas, techos, sillas, canecas,
// montacargas, estibadores, tramos de banda extra) — independientes de las
// 7 estaciones fijas. Se guardan en este navegador.
const OBJ_KEY = "tp_maquina_objetos_libres";
const TIPOS_OBJETO = {
  pallet:      { label: "Pallet",       icono: "🟩", anchoDef: 46, altoDef: 66 },
  bascula:     { label: "Báscula",      icono: "⚖️", anchoDef: 34, altoDef: 34 },
  caja:        { label: "Caja",         icono: "📦", anchoDef: 20, altoDef: 16 },
  estiba:      { label: "Estiba vacía", icono: "🟫", anchoDef: 40, altoDef: 24 },
  muro:        { label: "Muro",         icono: "🧱", anchoDef: 70, altoDef: 12 },
  reja:        { label: "Reja",         icono: "🔲", anchoDef: 50, altoDef: 30 },
  techo:       { label: "Techo",        icono: "⛺", anchoDef: 60, altoDef: 28 },
  silla:       { label: "Silla",        icono: "🪑", anchoDef: 14, altoDef: 18 },
  caneca:      { label: "Caneca",       icono: "🗑️", anchoDef: 14, altoDef: 18 },
  montacargas: { label: "Montacargas",  icono: "🚜", anchoDef: 50, altoDef: 30 },
  estibador:   { label: "Estibador",    icono: "🧍", anchoDef: 20, altoDef: 34 },
  banda:       { label: "Banda extra",  icono: "➡️", anchoDef: 90, altoDef: 14 },
};

function cargarObjetos() {
  try {
    const raw = localStorage.getItem(OBJ_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function IconoPallet({ ancho, alto }) {
  const nFilas = 4;
  const filaAlto = (alto - 8) / nFilas;
  return (
    <g>
      <rect x={-ancho / 2} y={alto / 2 - 6} width={ancho} height="6" fill="#a16207" stroke="#78350f" strokeWidth="1" />
      {Array.from({ length: nFilas }).map((_, i) => (
        <rect key={i} x={-ancho / 2 + 1} y={alto / 2 - 6 - (i + 1) * filaAlto} width={ancho - 2} height={filaAlto - 1.5} fill="#15803d" stroke="#14532d" strokeWidth="0.8" />
      ))}
      {[0.25, 0.55, 0.85].map((f, i) => (
        <line key={i} x1={-ancho / 2} y1={alto / 2 - 6 - alto * f} x2={ancho / 2} y2={alto / 2 - 6 - alto * f} stroke="#111827" strokeWidth="1.8" />
      ))}
    </g>
  );
}
function IconoBascula({ ancho, alto }) {
  return (
    <g>
      <rect x={-ancho / 2} y={alto / 2 - 6} width={ancho} height="6" rx="1.5" fill="#374151" stroke="#1f2937" strokeWidth="1" />
      <rect x="-2" y={-alto / 2 + 4} width="4" height={alto - 16} fill="#9ca3af" />
      <rect x={-ancho * 0.28} y={-alto / 2} width={ancho * 0.56} height={alto * 0.22} rx="1.5" fill="#0f172a" stroke="#38BDF8" strokeWidth="1" />
    </g>
  );
}
function IconoCaja({ ancho, alto }) {
  return (
    <g>
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} rx="1.5" fill="#a16207" stroke="#78350f" strokeWidth="1" />
      <line x1={-ancho / 2} y1="0" x2={ancho / 2} y2="0" stroke="#78350f" strokeWidth="1" />
      <line x1="0" y1={-alto / 2} x2="0" y2="0" stroke="#78350f" strokeWidth="1" />
    </g>
  );
}
function IconoEstiba({ ancho, alto }) {
  const tablas = 5;
  return (
    <g>
      {Array.from({ length: tablas }).map((_, i) => (
        <rect key={i} x={-ancho / 2 + i * (ancho / tablas)} y={-alto / 2} width={ancho / tablas - 2} height={alto} fill="#a16207" stroke="#78350f" strokeWidth="0.8" />
      ))}
    </g>
  );
}
function IconoMuro({ ancho, alto }) {
  const nLineas = Math.max(2, Math.round(alto / 8));
  return (
    <g>
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} fill="#9a5b3f" stroke="#6b3d29" strokeWidth="1" />
      {Array.from({ length: nLineas }).map((_, i) => (
        <line key={i} x1={-ancho / 2} y1={-alto / 2 + (i + 1) * (alto / (nLineas + 1))} x2={ancho / 2} y2={-alto / 2 + (i + 1) * (alto / (nLineas + 1))} stroke="#6b3d29" strokeWidth="0.6" />
      ))}
    </g>
  );
}
function IconoReja({ ancho, alto }) {
  const barras = Math.max(3, Math.round(ancho / 8));
  return (
    <g>
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} fill="none" stroke="#6b7280" strokeWidth="1.4" />
      {Array.from({ length: barras }).map((_, i) => (
        <line key={i} x1={-ancho / 2 + i * (ancho / (barras - 1 || 1))} y1={-alto / 2} x2={-ancho / 2 + i * (ancho / (barras - 1 || 1))} y2={alto / 2} stroke="#6b7280" strokeWidth="1.2" />
      ))}
    </g>
  );
}
function IconoTecho({ ancho, alto }) {
  return <polygon points={`${-ancho / 2},${alto / 2} ${ancho / 2},${alto / 2} ${ancho / 2 - 8},${-alto / 2} ${-ancho / 2 + 8},${-alto / 2}`} fill="#4b5563" stroke="#1f2937" strokeWidth="1.2" />;
}
function IconoSilla({ ancho, alto }) {
  return (
    <g>
      <rect x={-ancho / 2} y={alto * 0.1} width={ancho} height={alto * 0.15} fill="#78350f" />
      <rect x={-ancho / 2} y={-alto / 2} width={ancho * 0.12} height={alto} fill="#78350f" />
      <line x1={-ancho / 2} y1={alto / 2 - 2} x2={-ancho / 2} y2={alto / 2 + 6} stroke="#451a03" strokeWidth="2" />
      <line x1={ancho / 2 - 2} y1={alto / 2 - 2} x2={ancho / 2 - 2} y2={alto / 2 + 6} stroke="#451a03" strokeWidth="2" />
    </g>
  );
}
function IconoCaneca({ ancho, alto }) {
  return (
    <g>
      <ellipse cx="0" cy={-alto / 2} rx={ancho / 2} ry={ancho / 6} fill="#4b5563" stroke="#1f2937" strokeWidth="1" />
      <path d={`M ${-ancho / 2},${-alto / 2} L ${-ancho * 0.4},${alto / 2} A ${ancho * 0.4} ${ancho / 8} 0 0 0 ${ancho * 0.4} ${alto / 2} L ${ancho / 2},${-alto / 2}`} fill="#374151" stroke="#1f2937" strokeWidth="1" />
    </g>
  );
}
function IconoMontacargas({ ancho, alto }) {
  return (
    <g>
      <rect x={-ancho * 0.15} y={-alto * 0.5} width={ancho * 0.5} height={alto * 0.55} rx="2" fill="#F9A826" stroke="#78350f" strokeWidth="1" />
      <rect x={-ancho / 2} y={alto * 0.05} width={ancho * 0.32} height={alto * 0.08} fill="#374151" />
      <line x1={ancho * 0.3} y1={-alto * 0.55} x2={ancho * 0.3} y2={alto * 0.2} stroke="#374151" strokeWidth="2.4" />
      <circle cx={-ancho * 0.25} cy={alto * 0.42} r={alto * 0.14} fill="#111827" stroke="#374151" strokeWidth="1" />
      <circle cx={ancho * 0.25} cy={alto * 0.42} r={alto * 0.14} fill="#111827" stroke="#374151" strokeWidth="1" />
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
    default: return null;
  }
}

// Objeto libre: se puede arrastrar con el mouse/dedo directo sobre el
// lienzo (pointer capture, sin necesitar listeners globales). El clic lo
// selecciona; arrastrar lo mueve; el resto de sus ajustes (ángulo, tamaño)
// salen del panel de edición. Al acabar de crearlo (`esNuevo`), se
// desplaza solo hasta quedar visible y destella un instante, para que no
// se pierda si el lienzo está grande o con scroll.
function ObjetoLibre({ obj, seleccionado, esNuevo, onSeleccionar, onMover }) {
  const dragRef = useRef(null);
  const gRef = useRef(null);
  useEffect(() => {
    if (esNuevo && gRef.current) {
      gRef.current.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }, [esNuevo]);
  return (
    <g
      ref={gRef}
      transform={`translate(${obj.x},${obj.y}) rotate(${obj.rot || 0})`}
      style={{ cursor: "grab", touchAction: "none" }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSeleccionar(obj.id);
        dragRef.current = { sx: e.clientX, sy: e.clientY, ox: obj.x, oy: obj.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragRef.current) return;
        const dx = e.clientX - dragRef.current.sx, dy = e.clientY - dragRef.current.sy;
        onMover(obj.id, dragRef.current.ox + dx, dragRef.current.oy + dy);
      }}
      onPointerUp={() => { dragRef.current = null; }}
      onClick={(e) => e.stopPropagation()}
    >
      <g transform={`scale(${obj.escala || 1})`} style={{ animation: esNuevo ? "mq-pop 0.35s ease" : "none" }}>
        <IconoObjeto tipo={obj.tipo} ancho={obj.ancho} alto={obj.alto} />
        {seleccionado && (
          <rect
            x={-obj.ancho / 2 - 4} y={-obj.alto / 2 - 4} width={obj.ancho + 8} height={obj.alto + 8}
            fill="none" stroke="#845EF7" strokeWidth={1.5 / (obj.escala || 1)} strokeDasharray="4 3"
            style={{ animation: esNuevo ? "mq-highlight 1.1s ease" : "none" }}
          />
        )}
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

  // Modo edición: ajustar a mano la forma de la calibradora (ángulo de
  // bandejas, posición del puesto de control, etc.) sin tener que
  // describirlo por chat — se guarda en este navegador.
  const [editando, setEditando] = useState(false);
  const [calibCfg, setCalibCfg] = useState(() => cargarCalibCfg());
  useEffect(() => {
    try { localStorage.setItem(CALIB_CFG_KEY, JSON.stringify(calibCfg)); } catch { /* noop */ }
  }, [calibCfg]);

  // Ecosistema de objetos libres (pallets, básculas, cajas, muros, rejas,
  // techos, sillas, canecas, montacargas, estibadores, banda extra) — el
  // usuario los agrega y arrastra a su gusto dentro del plano.
  const [objetos, setObjetos] = useState(() => cargarObjetos());
  const [seleccionId, setSeleccionId] = useState(null);
  const [nuevoId, setNuevoId] = useState(null); // objeto recién agregado — se desplaza a la vista y destella
  useEffect(() => {
    try { localStorage.setItem(OBJ_KEY, JSON.stringify(objetos)); } catch { /* noop */ }
  }, [objetos]);
  // Arranca después del id más alto ya guardado, para no chocar con
  // objetos de una sesión anterior al recargar la página.
  const idObjRef = useRef(objetos.reduce((max, o) => {
    const n = parseInt(String(o.id).replace(/^o/, ""), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0));

  const agregarObjeto = (tipo) => {
    const def = TIPOS_OBJETO[tipo];
    const id = `o${++idObjRef.current}`;
    const nuevo = {
      id, tipo, x: LAYOUT.width / 2, y: LAYOUT.height / 2,
      rot: 0, escala: 1, ancho: def.anchoDef, alto: def.altoDef,
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
    <div onClick={() => { if (menuAbierto) setMenuAbierto(null); if (seleccionId) setSeleccionId(null); }}>
      <style>{CSS}</style>

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
      </div>

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
              { key: "deskAlong", label: "Computador — adelante/atrás", min: -260, max: 0, step: 2, unidad: "px" },
              { key: "deskPerp", label: "Computador — a un lado", min: 0, max: 120, step: 2, unidad: "px" },
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
            🧩 Agregar objetos al plano
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(TIPOS_OBJETO).map(([tipo, def]) => (
              <button
                key={tipo}
                onClick={() => agregarObjeto(tipo)}
                style={{
                  display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "white",
                  padding: "6px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}
              >
                <span>{def.icono}</span>+ {def.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
            Arrástralos directo sobre el plano para acomodarlos. Haz clic en uno para ajustar su tamaño, ángulo o borrarlo.
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
                  { key: "rot", label: "Rotación °", min: 0, max: 359, step: 1 },
                  { key: "escala", label: "Escala", min: 0.4, max: 2.5, step: 0.05 },
                ].map(campo => (
                  <div key={campo.key}>
                    <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.55)", marginBottom: 3 }}>
                      {campo.label}: <b style={{ color: "white" }}>{objetoSeleccionado[campo.key]}</b>
                    </div>
                    <input
                      type="range" min={campo.min} max={campo.max} step={campo.step} value={objetoSeleccionado[campo.key]}
                      onChange={e => actualizarObjeto(objetoSeleccionado.id, { [campo.key]: Number(e.target.value) })}
                      style={{ width: "100%" }}
                    />
                  </div>
                ))}
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
            <MaquinaCalibradora cfg={calibCfg} />

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

            {/* Objetos libres del usuario (pallets, básculas, cajas, muros,
                rejas, techos, sillas, canecas, montacargas, estibadores...) */}
            {objetos.map(o => (
              <ObjetoLibre key={o.id} obj={o} seleccionado={o.id === seleccionId} esNuevo={o.id === nuevoId} onSeleccionar={setSeleccionId} onMover={moverObjeto} />
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
