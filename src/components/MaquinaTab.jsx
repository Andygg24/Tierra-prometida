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

// ── Plano isométrico de la línea ──────────────────────────────────────────
// Cada estación es un "grid step" (col,row) proyectado a píxeles con la
// fórmula isométrica clásica 2:1. La ruta dobla en L (mitad en columnas,
// mitad en filas) para que se vea como una línea real con un giro, no una
// fila plana — inspirado en el molde "Nuevo modelo.jpeg".
const TILE_DX = 65, TILE_DY = 34;      // paso en píxeles por celda de la cuadrícula iso
const PLAT_W = 110, PLAT_H = 58;       // tamaño del rombo (cara superior) de cada estación
const PLAT_DEPTH = 26;                 // alto de las caras laterales del prisma

function generarRutaIso(n) {
  const primerTramo = Math.max(1, Math.ceil(n / 2));
  const pts = [];
  for (let i = 0; i < primerTramo; i++) pts.push([i, 0]);
  for (let i = 1; i <= n - primerTramo; i++) pts.push([primerTramo - 1, i]);
  return pts;
}

function isoPoint(col, row) {
  return { x: (col - row) * TILE_DX, y: (col + row) * TILE_DY };
}

// Oscurece/aclara un color hex — para las caras laterales del prisma
// (más oscuras que la cara superior, como un cubo iluminado desde arriba).
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

export default function MaquinaTab({ mob }) {
  const { empleados, loading: loadingPersonal } = usePersonal();
  const { areas, movimientos, loading: loadingMaquina, moverPersona } = useMaquina();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [menuAbierto, setMenuAbierto] = useState(null); // num del empleado con el selector de área abierto
  const [resaltados, setResaltados] = useState({});
  const [viajero, setViajero] = useState(null); // ficha animada sobre la banda al mover a alguien
  const prevAreaRef = useRef({});
  const viajeIdRef = useRef(0);

  // Desligado de Asistencia por ahora: todos los empleados activos están
  // disponibles para ubicar a mano en la línea, sin depender de quién marcó
  // presente en el registro diario.
  const personas = empleados;

  const ultimoMovPorEmp = useMemo(() => {
    const m = {};
    movimientos.forEach(mv => {
      const prev = m[mv.empNum];
      if (!prev || new Date(mv.hora) > new Date(prev.hora)) m[mv.empNum] = mv;
    });
    return m;
  }, [movimientos]);

  const primerMovPorEmp = useMemo(() => {
    const m = {};
    movimientos.forEach(mv => {
      const prev = m[mv.empNum];
      if (!prev || new Date(mv.hora) < new Date(prev.hora)) m[mv.empNum] = mv;
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

  // Posición en píxeles de cada estación (índice = mismo orden que `areas`,
  // que ya viene ordenado por `orden` desde la base de datos).
  const layout = useMemo(() => {
    const n = areas.length;
    if (!n) return null;
    const ruta = generarRutaIso(n);
    const crudos = ruta.map(([c, r]) => isoPoint(c, r));
    const xs = crudos.map(p => p.x), ys = crudos.map(p => p.y);
    const padX = PLAT_W / 2 + 55;
    const padTop = PLAT_H / 2 + 110;   // espacio para el rótulo + fichas de personas
    const padBottom = PLAT_H / 2 + PLAT_DEPTH + 30;
    const minX = Math.min(...xs) - padX, maxX = Math.max(...xs) + padX;
    const minY = Math.min(...ys) - padTop, maxY = Math.max(...ys) + padBottom;
    const puntos = crudos.map(p => ({ x: p.x - minX, y: p.y - minY }));
    return { puntos, width: maxX - minX, height: maxY - minY };
  }, [areas.length]);

  const mover = async (emp, area) => {
    setMenuAbierto(null);
    const fromIdx = areas.findIndex(a => a.id === ultimoMovPorEmp[emp.num]?.areaId);
    const toIdx = areas.findIndex(a => a.id === area.id);
    if (toIdx >= 0 && layout) {
      const toP = layout.puntos[toIdx];
      const fromP = fromIdx >= 0 ? layout.puntos[fromIdx] : { x: layout.puntos[0].x - 70, y: layout.puntos[0].y - 50 };
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

  const inicioTurno = (emp) => primerMovPorEmp[emp.num]?.hora || null;

  if (loadingPersonal || loadingMaquina) return <LimonLoader texto="Cargando la máquina" />;

  const chip = (emp, desde, areaActual) => {
    const desdeMs = desde ? new Date(desde).getTime() : null;
    const turnoMs = (() => {
      const ini = inicioTurno(emp);
      return ini ? now - new Date(ini).getTime() : null;
    })();
    const resaltado = !!resaltados[emp.num];
    return (
      <div key={emp.num} style={{ position: "relative" }}>
        <button
          onClick={() => setMenuAbierto(m => m === emp.num ? null : emp.num)}
          style={{
            display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "6px 10px 6px 6px",
            cursor: "pointer", textAlign: "left", animation: resaltado ? "mq-highlight 0.9s ease" : "none",
          }}
        >
          <span style={{
            width: 26, height: 26, borderRadius: "50%", background: areaActual ? areaActual.color : "rgba(255,255,255,0.15)",
            color: "white", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>{iniciales(emp.nombre)}</span>
          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "white", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{emp.nombre}</span>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>
              {desdeMs != null ? `⏱ ${fmtDur(now - desdeMs)}` : "sin ubicar"}
              {turnoMs != null ? ` · turno ${fmtDur(turnoMs)}` : ""}
            </span>
          </span>
        </button>
        {menuAbierto === emp.num && (
          <div style={{
            position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 20,
            background: "#1b1b26", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10,
            padding: 6, minWidth: 150, boxShadow: "0 10px 30px rgba(0,0,0,0.4)", animation: "mq-pop 0.15s ease",
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
        {layout && (
          <div style={{ position: "relative", width: layout.width, height: layout.height, margin: "0 auto" }}>
            <svg width={layout.width} height={layout.height} style={{ display: "block", position: "absolute", inset: 0 }}>
              {/* Banda transportadora — conecta cada estación con la siguiente */}
              {areas.map((a, i) => {
                if (i === 0) return null;
                const p0 = layout.puntos[i - 1], p1 = layout.puntos[i];
                return (
                  <g key={`banda-${a.id}`}>
                    <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="rgba(255,255,255,0.12)" strokeWidth="10" strokeLinecap="round" />
                    <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#2a2e3a" strokeWidth="6" strokeLinecap="round" />
                    <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="7 8" opacity="0.85">
                      <animate attributeName="stroke-dashoffset" from="0" to="-30" dur="0.6s" repeatCount="indefinite" />
                    </line>
                  </g>
                );
              })}

              {/* Plataformas: prisma isométrico por estación (cara izq/der más
                  oscuras que la superior, como un cubo iluminado desde arriba) */}
              {areas.map((a, i) => {
                const c = layout.puntos[i];
                const top    = [[c.x, c.y - PLAT_H / 2], [c.x + PLAT_W / 2, c.y], [c.x, c.y + PLAT_H / 2], [c.x - PLAT_W / 2, c.y]];
                const left   = [[c.x - PLAT_W / 2, c.y], [c.x, c.y + PLAT_H / 2], [c.x, c.y + PLAT_H / 2 + PLAT_DEPTH], [c.x - PLAT_W / 2, c.y + PLAT_DEPTH]];
                const right  = [[c.x, c.y + PLAT_H / 2], [c.x + PLAT_W / 2, c.y], [c.x + PLAT_W / 2, c.y + PLAT_DEPTH], [c.x, c.y + PLAT_H / 2 + PLAT_DEPTH]];
                return (
                  <g key={a.id}>
                    <polygon points={poly(left)} fill={shade(a.color, 0.45)} />
                    <polygon points={poly(right)} fill={shade(a.color, 0.65)} />
                    <polygon points={poly(top)} fill={a.color} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
                  </g>
                );
              })}
            </svg>

            {/* Rótulo + personas de cada estación, ancladas justo encima de
                su plataforma (position absolute + translate -100% = el borde
                inferior de este bloque queda fijo aunque crezca hacia arriba) */}
            {areas.map((a, i) => {
              const c = layout.puntos[i];
              const gente = porArea[a.id] || [];
              return (
                <div key={a.id} style={{
                  position: "absolute", left: c.x, top: c.y - PLAT_H / 2 - 8,
                  transform: "translate(-50%, -100%)", display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 6, maxWidth: 170,
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                    {gente.length === 0 ? (
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>Sin nadie aquí</div>
                    ) : (
                      gente.map(({ emp, desde }) => chip(emp, desde, a))
                    )}
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 5, background: "rgba(10,10,16,0.85)",
                    border: `1px solid ${a.color}55`, borderRadius: 20, padding: "3px 10px 3px 6px", whiteSpace: "nowrap",
                  }}>
                    <span style={{ fontSize: 13 }}>{a.icono}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: "white" }}>{a.nombre}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: "white", background: a.color, borderRadius: 20, padding: "0px 6px" }}>{gente.length}</span>
                  </div>
                </div>
              );
            })}

            {viajero && <FichaViajera from={viajero.from} to={viajero.to} color={viajero.color} />}
          </div>
        )}
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
