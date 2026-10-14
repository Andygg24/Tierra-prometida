import { useState } from "react";
import { KioscoRostro } from "./AsistenciaRostro.jsx";
import { useBiometrico } from "../hooks/useBiometrico.js";

const card = { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:14, marginBottom:12 };
const horaFmt = (iso) => new Date(iso).toLocaleTimeString("es-CO", { hour:"2-digit", minute:"2-digit" });
const duracionFmt = (ms) => { const min = Math.round(ms / 60000); return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`; };

// Logo embebido como base64 para que el informe funcione sin servidor.
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

// Resumen por persona: movimientos en orden, estado actual y tiempo adentro
// (suma de cada tramo entrada→salida; si sigue adentro, cuenta hasta ahora).
function resumirPorPersona(eventos) {
  const porEmp = new Map();
  eventos.forEach(e => { if (!porEmp.has(e.empNum)) porEmp.set(e.empNum, []); porEmp.get(e.empNum).push(e); });
  return Array.from(porEmp, ([num, evs]) => {
    evs.sort((a, b) => new Date(a.hora) - new Date(b.hora));
    let adentroMs = 0, desde = null;
    evs.forEach(e => {
      if (e.tipo === "entrada") desde = new Date(e.hora);
      else if (desde) { adentroMs += new Date(e.hora) - desde; desde = null; }
    });
    const sigueAdentro = evs[evs.length - 1].tipo === "entrada";
    if (sigueAdentro && desde) adentroMs += Date.now() - desde;
    const entradas = evs.filter(e => e.tipo === "entrada");
    const salidas  = evs.filter(e => e.tipo === "salida");
    return {
      num, eventos: evs, sigueAdentro, adentroMs,
      primeraEntrada: entradas[0]?.hora || null,
      ultimaSalida: salidas[salidas.length - 1]?.hora || null,
    };
  });
}

async function buildInformeBiometrico({ dia, eventos, nombreDe, docDe, contenedorDe }) {
  const logoSrc = await cargarLogoBase64();
  const fechaFmt = new Date(dia + "T12:00:00").toLocaleDateString("es-CO", { day:"2-digit", month:"long", year:"numeric" });
  const personas = resumirPorPersona(eventos).sort((a, b) => nombreDe(a.num).localeCompare(nombreDe(b.num)));
  const adentro = personas.filter(p => p.sigueAdentro).length;

  const filas = personas.map(p => {
    const movimientos = p.eventos.map(e =>
      `<span style="color:${e.tipo === "entrada" ? "#1D6F42" : "#e53935"}">${e.tipo === "entrada" ? "↳" : "↰"} ${horaFmt(e.hora)}</span>`
    ).join(" · ");
    return `<tr>
      <td><strong>${nombreDe(p.num)}</strong></td>
      <td style="color:#666">${docDe(p.num)}</td>
      <td style="text-align:center;font-weight:700;white-space:nowrap;color:${p.sigueAdentro ? "#1D6F42" : "#e53935"}">${p.sigueAdentro ? "🟢 Adentro" : "🔴 Salió"}</td>
      <td style="white-space:nowrap">${p.primeraEntrada ? horaFmt(p.primeraEntrada) : "—"}</td>
      <td style="white-space:nowrap">${p.ultimaSalida && !p.sigueAdentro ? horaFmt(p.ultimaSalida) : "—"}</td>
      <td style="white-space:nowrap;font-weight:700">${duracionFmt(p.adentroMs)}${p.sigueAdentro ? ' <span style="font-weight:400;color:#999">(en curso)</span>' : ""}</td>
      <td style="font-size:10px">${movimientos}</td>
    </tr>`;
  }).join("");

  const filasMov = [...eventos].sort((a, b) => new Date(a.hora) - new Date(b.hora)).map(e => `<tr>
      <td style="white-space:nowrap">${horaFmt(e.hora)}</td>
      <td><strong>${nombreDe(e.empNum)}</strong></td>
      <td style="color:${e.tipo === "entrada" ? "#1D6F42" : "#e53935"};font-weight:700">${e.tipo === "entrada" ? "↳ Entrada" : "↰ Salida"}</td>
      <td>${contenedorDe(e.sesionId)}</td>
      <td style="color:#666">${e.via === "rostro" ? "Rostro" : "QR"}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Biométrico ${dia}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#1a1a1a;padding:24px;font-size:12px}
  .header{text-align:center;border-bottom:3px solid #845EF7;padding-bottom:14px;margin-bottom:18px}
  .header img{width:38px;height:38px;object-fit:contain;margin:0 auto 4px}
  .htitle{color:#845EF7;font-size:20px;font-weight:800}
  .sub{color:#666;font-size:12px;margin-top:3px}
  .badge-curso{display:inline-block;background:#ede9fe;color:#6d28d9;padding:2px 10px;border-radius:20px;font-size:9px;font-weight:800;margin-top:6px}
  .stats{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
  .stat{flex:1;min-width:100px;background:#f5f3ff;border-radius:10px;padding:10px;text-align:center}
  .stl{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.4px}
  .stv{font-size:14px;font-weight:800;color:#1a1a1a;margin-top:2px}
  .sec{font-size:13px;font-weight:800;color:#6d28d9;background:#ede9fe;border-left:4px solid #6d28d9;padding:7px 12px;margin:18px 0 10px;border-radius:0 6px 6px 0}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#6d28d9;color:#fff;padding:7px 10px;text-align:left}
  td{padding:6px 10px;border-bottom:1px solid #eee;vertical-align:top}
  @media print{body{padding:10px}}
</style></head>
<body>
  <div class="header">
    ${logoSrc ? `<img src="${logoSrc}"/>` : ""}
    <div class="htitle">TIERRA PROMETIDA TRADING</div>
    <div class="sub">Informe del Biométrico — Entradas y salidas del día</div>
    <div class="badge-curso">⏱ CORTE A LAS ${horaFmt(new Date().toISOString())}</div>
  </div>

  <div class="stats">
    <div class="stat"><div class="stl">Fecha</div><div class="stv">${fechaFmt}</div></div>
    <div class="stat"><div class="stl">Personas que entraron</div><div class="stv">${personas.length}</div></div>
    <div class="stat"><div class="stl">Adentro ahora</div><div class="stv">${adentro}</div></div>
    <div class="stat"><div class="stl">Movimientos</div><div class="stv">${eventos.length}</div></div>
  </div>

  <div class="sec">Resumen por persona</div>
  <p style="font-size:9px;color:#999;margin-bottom:8px;font-style:italic">↳ entrada · ↰ salida — "Tiempo adentro" suma cada tramo entre una entrada y su salida.</p>
  <table>
    <thead><tr><th>Nombre</th><th>Documento</th><th style="text-align:center">Estado actual</th><th>Primera entrada</th><th>Última salida</th><th>Tiempo adentro</th><th>Movimientos</th></tr></thead>
    <tbody>${filas || `<tr><td colspan="7" style="text-align:center;color:#999;padding:16px">Nadie ha pasado por el biométrico hoy.</td></tr>`}</tbody>
  </table>

  ${filasMov ? `<div class="sec">Todos los movimientos en orden</div>
  <table>
    <thead><tr><th>Hora</th><th>Nombre</th><th>Movimiento</th><th>Contenedor</th><th>Vía</th></tr></thead>
    <tbody>${filasMov}</tbody>
  </table>` : ""}

  <div style="text-align:center;font-size:9px;color:#bbb;margin-top:24px;border-top:1px solid #f0f0f0;padding-top:10px">
    Generado el ${new Date().toLocaleDateString("es-CO")} a las ${horaFmt(new Date().toISOString())} · JARVIS · Tierra Prometida Trading
  </div>
</body></html>`;
}

// `gestion`: los controles del proceso (contenedor, asignados, ajustes y
// pagos — el mismo panel de Sesión/Pagos). Solo se muestran con la cámara
// apagada, para que en modo kiosco los trabajadores no vean los pagos.
export default function BiometricoPanel({ asisQR, procesos, empleados, rostros, verPrevia, playBeep, gestion }) {
  const bio = useBiometrico({ asisQR });
  const [estadoCam, setEstadoCam] = useState("cargando");
  const [feedback, setFeedback] = useState(null);
  const [generando, setGenerando] = useState(false);

  const nombreDe = (num) => empleados.find(e => e.num === num)?.nombre || num;
  const docDe    = (num) => num;
  const contenedorDe = (sesionId) => {
    if (!sesionId) return "—";
    const s = bio.sesionesHoy[sesionId] || (asisQR.sesionActiva?.id === sesionId ? asisQR.sesionActiva : null);
    if (!s) return "—";
    const c = procesos.find(p => p.id === s.contenedorId);
    return `${c?.numContenedor || `#${s.contenedorId}`} · ${s.turno}`;
  };

  const onResultado = (r) => {
    playBeep?.();
    setFeedback(r.ok
      ? { ok:true, nombre:r.nombre, tipo:r.tipo, hora:r.hora, msg: r.tipo === "entrada" ? "Entrada registrada" : "Salida registrada" }
      : { ok:false, msg:r.msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const verInforme = async () => {
    setGenerando(true);
    const html = await buildInformeBiometrico({ dia: bio.dia, eventos: bio.eventosHoy, nombreDe, docDe, contenedorDe });
    setGenerando(false);
    verPrevia(html, `Biometrico_${bio.dia}.html`);
  };

  const sesion = asisQR.sesionActiva;
  const contSesion = sesion ? procesos.find(p => p.id === sesion.contenedorId) : null;
  const personas = resumirPorPersona(bio.eventosHoy);
  const adentro = personas.filter(p => p.sigueAdentro).length;
  const recientes = [...bio.eventosHoy].sort((a, b) => new Date(b.hora) - new Date(a.hora));

  return (
    <div>
      <div style={{ ...card, textAlign:"center" }}>
        <div style={{ fontSize:13, fontWeight:800, color:"#a5b4fc", marginBottom:4 }}>🧬 Biométrico</div>
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginBottom:12 }}>
          {sesion
            ? <>Proceso abierto: <strong style={{ color:"#00C9A7" }}>{contSesion?.numContenedor || `#${sesion.contenedorId}`} · {sesion.turno}</strong> — las entradas también cuentan para ese contenedor.</>
            : "Sin proceso abierto — se registran las entradas y salidas del día."}
        </div>

        <KioscoRostro empleados={empleados} rostros={rostros} registrarEscaneo={bio.registrar} onResultado={onResultado} autoIniciar onEstadoCamara={setEstadoCam} />

        {feedback && (() => {
          const color = !feedback.ok ? "#FF6B6B" : feedback.tipo === "salida" ? "#a5b4fc" : "#00C9A7";
          return (
            <div style={{ marginTop:16, padding:"18px 14px", borderRadius:14, fontSize:18, fontWeight:800, background:`${color}22`, border:`1px solid ${color}66`, color }}>
              {feedback.ok ? `${feedback.tipo === "salida" ? "🚪" : "✅"} ${feedback.nombre}` : `❌ ${feedback.msg}`}
              {feedback.ok && <div style={{ fontSize:12, fontWeight:600, marginTop:4, opacity:0.85 }}>{feedback.msg} · {horaFmt(new Date(feedback.hora).toISOString())}</div>}
            </div>
          );
        })()}
      </div>

      {estadoCam === "apagada" && gestion && (
        <>
          <div style={{ fontSize:13, fontWeight:800, color:"#a5b4fc", margin:"4px 2px 10px" }}>
            ⚙️ Proceso, asignación y pagos <span style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.45)" }}>· visible solo con la cámara apagada</span>
          </div>
          {gestion}
        </>
      )}

      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:10 }}>
          <div style={{ fontSize:13, fontWeight:800, color:"#a5b4fc" }}>
            📋 Movimientos de hoy <span style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.5)" }}>· {personas.length} persona(s) · {adentro} adentro</span>
          </div>
          <button onClick={verInforme} disabled={generando} style={{ background:"rgba(0,201,167,0.12)", border:"1px solid rgba(0,201,167,0.35)", borderRadius:8, color:"#00C9A7", padding:"7px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
            {generando ? "Generando…" : "📄 Vista previa"}
          </button>
        </div>
        {bio.error && <div style={{ fontSize:12, color:"#FF6B6B", marginBottom:8 }}>{bio.error}</div>}
        {recientes.length === 0 ? (
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>Nadie ha pasado por el biométrico hoy.</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:5, maxHeight:360, overflowY:"auto" }}>
            {recientes.map(e => (
              <div key={e.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, fontSize:12, background:"rgba(255,255,255,0.04)", borderRadius:7, padding:"7px 10px" }}>
                <span style={{ color:"white" }}>
                  <span style={{ color:"rgba(255,255,255,0.5)", marginRight:8 }}>{horaFmt(e.hora)}</span>
                  {nombreDe(e.empNum)}
                </span>
                <span style={{ display:"flex", gap:8, alignItems:"center", whiteSpace:"nowrap" }}>
                  {e.sesionId && <span style={{ fontSize:10.5, color:"rgba(255,255,255,0.45)" }}>{contenedorDe(e.sesionId)}</span>}
                  <span style={{ fontSize:10.5, color:"rgba(255,255,255,0.35)" }}>{e.via === "rostro" ? "🙂" : "🔳"}</span>
                  <span style={{ fontWeight:700, color: e.tipo === "entrada" ? "#00C9A7" : "#FF6B6B" }}>{e.tipo === "entrada" ? "↳ Entrada" : "↰ Salida"}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
