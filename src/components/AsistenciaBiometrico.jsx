import { useState } from "react";
import { KioscoRostro } from "./AsistenciaRostro.jsx";
import { useBiometrico } from "../hooks/useBiometrico.js";

const card = { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:14, marginBottom:12 };
const btnSecundarioDia = { background:"rgba(132,94,247,0.15)", border:"1px solid rgba(132,94,247,0.5)", borderRadius:8, color:"#c4b5fd", padding:"9px 16px", fontSize:12, fontWeight:700, cursor:"pointer" };
const btnFiltro = { background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, color:"rgba(255,255,255,0.7)", padding:"6px 10px", fontSize:12, fontWeight:600, cursor:"pointer" };
const btnFiltroActivo = { background:"rgba(132,94,247,0.2)", border:"1px solid rgba(132,94,247,0.6)", color:"white" };
const btnAccion = { background:"rgba(0,201,167,0.12)", border:"1px solid rgba(0,201,167,0.35)", borderRadius:8, color:"#00C9A7", padding:"6px 12px", fontSize:12, fontWeight:700, cursor:"pointer" };
// Título de cada paso del Biométrico (número, o ✓ si ya se hizo).
export function PasoTitulo({ n, titulo, sub, hecho = false }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ width:22, height:22, borderRadius:99, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800,
          background: hecho ? "#00C9A7" : "#845EF7", color:"white" }}>{hecho ? "✓" : n}</span>
        <span style={{ fontSize:14, fontWeight:800, color:"white" }}>Paso {n} · {titulo}</span>
      </div>
      {sub && <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginTop:4, marginLeft:30, lineHeight:1.45 }}>{sub}</div>}
    </div>
  );
}

const horaFmt = (iso) => new Date(iso).toLocaleTimeString("es-CO", { hour:"2-digit", minute:"2-digit" });
const fechaHoraFmt = (iso) => new Date(iso).toLocaleString("es-CO", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });
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

// `fin`: hora de cierre del día, o null si la jornada sigue abierta (vista previa).
// `etiqueta`: si viene, reemplaza el aviso de jornada (vista de un día elegido).
async function buildInformeBiometrico({ inicio, fin, eventos, nombreDe, docDe, contenedorDe, etiqueta }) {
  const logoSrc = await cargarLogoBase64();
  const personas = resumirPorPersona(eventos).sort((a, b) => nombreDe(a.num).localeCompare(nombreDe(b.num)));
  const adentro = personas.filter(p => p.sigueAdentro).length;

  // Contenedores en los que marcó cada persona (y todos los del periodo).
  const contsDe = (evs) => [...new Set(evs.filter(e => e.sesionId).map(e => contenedorDe(e.sesionId)))];
  const contenedores = contsDe(eventos);
  const filas = personas.map(p => {
    const movimientos = p.eventos.map(e =>
      `<span style="color:${e.tipo === "entrada" ? "#1D6F42" : "#e53935"}">${e.tipo === "entrada" ? "↳" : "↰"} ${horaFmt(e.hora)}</span>`
    ).join(" · ");
    return `<tr>
      <td><strong>${nombreDe(p.num)}</strong></td>
      <td style="color:#666">${docDe(p.num)}</td>
      <td style="white-space:nowrap">${contsDe(p.eventos).join("<br>") || "—"}</td>
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
<title>Biométrico ${fechaHoraFmt(inicio)}</title>
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
    <div class="sub">Informe del Biométrico — Entradas y salidas de la jornada</div>
    <div class="badge-curso">${etiqueta || (fin ? "🌙 DÍA CERRADO" : `⏱ JORNADA EN CURSO — CORTE A LAS ${horaFmt(new Date().toISOString())}`)}</div>
  </div>

  <div class="stats">
    <div class="stat"><div class="stl">Desde</div><div class="stv">${fechaHoraFmt(inicio)}</div></div>
    <div class="stat"><div class="stl">Hasta</div><div class="stv">${fin ? fechaHoraFmt(fin) : "En curso"}</div></div>
    <div class="stat"><div class="stl">Personas que entraron</div><div class="stv">${personas.length}</div></div>
    <div class="stat"><div class="stl">Adentro ahora</div><div class="stv">${adentro}</div></div>
    <div class="stat"><div class="stl">Movimientos</div><div class="stv">${eventos.length}</div></div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stl">Contenedor${contenedores.length > 1 ? "es" : ""} procesado${contenedores.length > 1 ? "s" : ""}</div><div class="stv">${contenedores.length ? contenedores.join("<br>") : "Sin proceso de contenedor"}</div></div>
  </div>

  <div class="sec">Resumen por persona</div>
  <p style="font-size:9px;color:#999;margin-bottom:8px;font-style:italic">↳ entrada · ↰ salida — "Tiempo adentro" suma cada tramo entre una entrada y su salida.</p>
  <table>
    <thead><tr><th>Nombre</th><th>Documento</th><th>Contenedor</th><th style="text-align:center">Estado actual</th><th>Primera entrada</th><th>Última salida</th><th>Tiempo adentro</th><th>Movimientos</th></tr></thead>
    <tbody>${filas || `<tr><td colspan="8" style="text-align:center;color:#999;padding:16px">Nadie ha pasado por el biométrico en esta jornada.</td></tr>`}</tbody>
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

// Orden de uso: 1 abrir el proceso → 2 marcar (cámara) → 3 revisar quién
// vino → 4 pagar y cerrar el proceso → 5 cerrar el día.
// `gestion(seccion)`: los controles del proceso ("inicio" = paso 1,
// "resto" = pasos 3 y 4). Solo se muestran con la cámara apagada, para que
// en modo kiosco los trabajadores no vean los pagos. La cámara siempre queda
// en el mismo lugar del árbol para que no se reinicie al mostrar u ocultar.
export default function BiometricoPanel({ asisQR, procesos, empleados, rostros, verPrevia, playBeep, gestion }) {
  const bio = useBiometrico({ asisQR });
  // La cámara arranca apagada: se prende solo con "Activar reconocimiento".
  const [estadoCam, setEstadoCam] = useState("apagada");
  const [feedback, setFeedback] = useState(null);
  const [generando, setGenerando] = useState(false);

  // Vista de movimientos: "" = jornada actual (en vivo); "AAAA-MM-DD" = ese día.
  const [fechaVista, setFechaVista] = useState("");
  const [vistaDia,   setVistaDia]   = useState(null); // { eventos, sesiones, desde, hasta }
  const [cargandoDia, setCargandoDia] = useState(false);
  const [errorDia,   setErrorDia]   = useState("");
  const elegirFecha = async (fecha) => {
    setFechaVista(fecha); setErrorDia("");
    if (!fecha) { setVistaDia(null); return; }
    setCargandoDia(true);
    const r = await bio.consultarDia(fecha);
    setCargandoDia(false);
    if (!r.ok) { setVistaDia(null); setErrorDia(`No se pudieron cargar los movimientos: ${r.msg}`); return; }
    setVistaDia(r);
  };
  const eventosVista = fechaVista ? (vistaDia?.eventos || []) : bio.eventosHoy;

  const [eliminando, setEliminando] = useState(false);
  const eliminarDia = async () => {
    const n = vistaDia?.eventos?.length || 0;
    if (!n) return;
    if (!window.confirm(`¿Eliminar los ${n} movimiento(s) del ${fechaLarga(fechaVista)}?

También se quita el "Presente" que el biométrico marcó solo ese día. Lo marcado a mano en Asistencia Manual no se toca. Esto no se puede deshacer.`)) return;
    setEliminando(true);
    const r = await bio.eliminarDia(fechaVista);
    setEliminando(false);
    if (!r.ok) { setErrorDia(`No se pudo eliminar: ${r.msg}`); return; }
    await elegirFecha(fechaVista);
  };
  const fechaLarga = (f) => new Date(f + "T12:00:00").toLocaleDateString("es-CO", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });

  const nombreDe = (num) => empleados.find(e => e.num === num)?.nombre || num;
  const docDe    = (num) => num;
  const contenedorDe = (sesionId) => {
    if (!sesionId) return "—";
    const s = vistaDia?.sesiones?.[sesionId] || bio.sesionesHoy[sesionId] || (asisQR.sesionActiva?.id === sesionId ? asisQR.sesionActiva : null);
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

  const nombreArchivo = (ext = "html") => `Biometrico_${fechaVista || bio.inicioJornada.slice(0, 10)}.${ext}`;

  const informeVista = () => fechaVista
    ? buildInformeBiometrico({ inicio: vistaDia.desde, fin: vistaDia.hasta, eventos: eventosVista, nombreDe, docDe, contenedorDe, etiqueta: `📅 MOVIMIENTOS DEL ${fechaLarga(fechaVista).toUpperCase()}` })
    : buildInformeBiometrico({ inicio: bio.inicioJornada, fin: null, eventos: bio.eventosHoy, nombreDe, docDe, contenedorDe });

  const verInforme = async () => {
    setGenerando(true);
    const html = await informeVista();
    setGenerando(false);
    verPrevia(html, nombreArchivo());
  };

  const descargarHtml = async () => {
    const html = await informeVista();
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = nombreArchivo(); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const descargarExcel = async () => {
    const XLSX = await import("xlsx");
    const filas = [...eventosVista].sort((a, b) => new Date(a.hora) - new Date(b.hora)).map(e => ({
      Fecha: new Date(e.hora).toLocaleDateString("es-CO"),
      Hora: horaFmt(e.hora),
      Nombre: nombreDe(e.empNum),
      Documento: e.empNum,
      Movimiento: e.tipo === "entrada" ? "Entrada" : "Salida",
      Contenedor: contenedorDe(e.sesionId),
      Vía: e.via === "rostro" ? "Rostro" : "QR",
    }));
    const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ Fecha: "", Hora: "", Nombre: "Sin movimientos", Documento: "", Movimiento: "", Contenedor: "", Vía: "" }]);
    ws["!cols"] = [{ wch: 11 }, { wch: 9 }, { wch: 30 }, { wch: 14 }, { wch: 11 }, { wch: 20 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, nombreArchivo("xlsx"));
  };

  const sesion = asisQR.sesionActiva;
  const contSesion = sesion ? procesos.find(p => p.id === sesion.contenedorId) : null;

  // Cerrar día: informe final de la jornada y registro nuevo desde cero.
  // El proceso del contenedor se cierra antes con su propio botón, para no
  // perder su informe de pagos.
  const [cerrandoDia, setCerrandoDia] = useState(false);
  const onCerrarDia = async () => {
    if (sesion) {
      setFeedback({ ok:false, msg:`Primero cierra el proceso del contenedor ${contSesion?.numContenedor || ""} con "🏁 Cerrar y ver informe".` });
      setTimeout(() => setFeedback(null), 5000);
      return;
    }
    if (!window.confirm(`¿Cerrar el día? Se abre el informe de la jornada (desde ${fechaHoraFmt(bio.inicioJornada)}) y el Biométrico empieza un registro nuevo: la lista queda vacía y el próximo escaneo de cada persona cuenta como entrada.`)) return;
    setCerrandoDia(true);
    const fin = new Date().toISOString();
    const html = await buildInformeBiometrico({ inicio: bio.inicioJornada, fin, eventos: bio.eventosHoy, nombreDe, docDe, contenedorDe });
    const r = await bio.cerrarDia();
    setCerrandoDia(false);
    if (!r.ok) { setFeedback({ ok:false, msg:`No se pudo cerrar el día: ${r.msg}` }); setTimeout(() => setFeedback(null), 5000); return; }
    verPrevia(html, nombreArchivo());
  };
  const personas = resumirPorPersona(eventosVista);
  const adentro = personas.filter(p => p.sigueAdentro).length;
  const recientes = [...eventosVista].sort((a, b) => new Date(b.hora) - new Date(a.hora));

  const camaraPrendida = estadoCam !== "apagada";
  const marcoAlguien = sesion ? asisQR.eventos.length > 0 : false;
  const pasos = [
    { n:1, t:"Abrir el proceso", hecho: !!sesion },
    { n:2, t:"Activar el reconocimiento", hecho: marcoAlguien },
    { n:3, t:"Revisar quién vino" },
    { n:4, t:"Pagar y cerrar el proceso" },
    { n:5, t:"Cerrar el día" },
  ];
  const actual = !sesion ? 1 : !marcoAlguien ? 2 : 3;

  return (
    <div>
      {!camaraPrendida && (
        <div style={{ ...card, padding:"10px 12px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.5)", marginBottom:8 }}>CÓMO SE USA</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {pasos.map(p => {
              const activo = p.n === actual;
              const color = p.hecho ? "#00C9A7" : activo ? "#c4b5fd" : "rgba(255,255,255,0.45)";
              return (
                <div key={p.n} style={{ flex:"1 1 130px", display:"flex", alignItems:"center", gap:7, padding:"7px 9px", borderRadius:9,
                  background: activo ? "rgba(132,94,247,0.18)" : "rgba(255,255,255,0.03)", border:`1px solid ${activo ? "rgba(132,94,247,0.55)" : "rgba(255,255,255,0.07)"}` }}>
                  <span style={{ width:20, height:20, borderRadius:99, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800,
                    background: p.hecho ? "#00C9A7" : activo ? "#845EF7" : "rgba(255,255,255,0.1)", color: p.hecho || activo ? "white" : "rgba(255,255,255,0.6)" }}>{p.hecho ? "✓" : p.n}</span>
                  <span style={{ fontSize:11, fontWeight:700, color }}>{p.t}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!camaraPrendida && gestion?.("inicio")}

      <div style={{ ...card, textAlign:"center" }}>
        <div style={{ textAlign:"left" }}>
          <PasoTitulo n={2} hecho={marcoAlguien} titulo="Marcar entrada y salida"
            sub={sesion
              ? <>Activa la cámara y deja el equipo frente a la entrada. Cada marcación cuenta para <strong style={{ color:"#00C9A7" }}>{contSesion?.numContenedor || `#${sesion.contenedorId}`} · {sesion.turno}</strong>. Para ver los pagos, apaga la cámara.</>
              : "Sin proceso abierto la gente igual puede marcar: después, al abrir el proceso, las pasas a ese contenedor."} />
        </div>

        <KioscoRostro empleados={empleados} rostros={rostros} registrarEscaneo={bio.registrar} onResultado={onResultado} onEstadoCamara={setEstadoCam} />

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

      {!camaraPrendida && gestion?.("resto")}

      {!camaraPrendida && (
        <div style={card}>
          <PasoTitulo n={5} titulo="Cerrar el día"
            sub={<>Al final de la jornada (va desde <strong style={{ color:"white" }}>{fechaHoraFmt(bio.inicioJornada)}</strong>): sale el informe del día y mañana el Biométrico arranca limpio.{sesion && <> Primero cierra el proceso (paso 4).</>}</>} />
          <button onClick={onCerrarDia} disabled={cerrandoDia} style={{ ...btnSecundarioDia, opacity: cerrandoDia ? 0.6 : 1 }}>
            {cerrandoDia ? "Cerrando…" : "🌙 Cerrar día"}
          </button>
        </div>
      )}

      <div style={card}>
        <div style={{ fontSize:13, fontWeight:800, color:"#a5b4fc", marginBottom:8 }}>
          📋 {fechaVista ? `Movimientos del ${fechaLarga(fechaVista)}` : "Movimientos e informes de la jornada"}
          <span style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.5)" }}>
            {!fechaVista && <> · desde {fechaHoraFmt(bio.inicioJornada)}</>} · {personas.length} persona(s){!fechaVista && <> · {adentro} adentro</>}
          </span>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:10 }}>
          <button onClick={() => elegirFecha("")} style={{ ...btnFiltro, ...(fechaVista ? {} : btnFiltroActivo) }}>En vivo (jornada)</button>
          <input type="date" value={fechaVista} max={new Date().toLocaleDateString("en-CA")} onChange={e => elegirFecha(e.target.value)}
            style={{ ...btnFiltro, ...(fechaVista ? btnFiltroActivo : {}), colorScheme:"dark", fontFamily:"inherit" }} />
          <span style={{ flex:1 }} />
          <button onClick={verInforme} disabled={generando || cargandoDia} style={btnAccion}>{generando ? "Generando…" : "📄 Vista previa"}</button>
          <button onClick={descargarHtml} disabled={cargandoDia} style={btnAccion}>📥 Informe</button>
          <button onClick={descargarExcel} disabled={cargandoDia} style={btnAccion}>📊 Excel</button>
        </div>
        {fechaVista && recientes.length > 0 && !cargandoDia && (
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:10 }}>
            <button onClick={eliminarDia} disabled={eliminando} style={{ background:"rgba(255,107,107,0.1)", border:"1px solid rgba(255,107,107,0.4)", borderRadius:8, color:"#FF6B6B", padding:"6px 12px", fontSize:12, fontWeight:700, cursor:"pointer", opacity: eliminando ? 0.6 : 1 }}>
              {eliminando ? "Eliminando…" : `🗑 Eliminar movimientos de este día (${recientes.length})`}
            </button>
          </div>
        )}
        {bio.error && !fechaVista && <div style={{ fontSize:12, color:"#FF6B6B", marginBottom:8 }}>{bio.error}</div>}
        {errorDia && <div style={{ fontSize:12, color:"#FF6B6B", marginBottom:8 }}>{errorDia}</div>}
        {cargandoDia ? (
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)" }}>Cargando movimientos…</div>
        ) : recientes.length === 0 ? (
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>{fechaVista ? "No hubo movimientos ese día." : "Nadie ha pasado por el biométrico en esta jornada."}</div>
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
