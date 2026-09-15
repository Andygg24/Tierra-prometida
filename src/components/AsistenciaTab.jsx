import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { supabase } from "../supabase.js";
import { useAsistencia } from "../hooks/useAsistencia.js";
import { usePersonal } from "../hooks/usePersonal.js";
import { useContenedores } from "../hooks/useContenedores.js";
import { useLiquidaciones } from "../hooks/useLiquidaciones.js";
import { useAsistenciaQR } from "../hooks/useAsistenciaQR.js";
import { comprimirImagen } from "../utils/imagenes.js";
import CustomSelect from "./CustomSelect.jsx";
import SearchableSelect from "./SearchableSelect.jsx";
import LimonLoader from "./LimonLoader.jsx";
import { btnPrimario, btnSecundario, btnTablaEliminar } from "./buttonStyles.js";

const fmtCOP = (v) => `$ ${Math.round(v || 0).toLocaleString("es-CO")}`;
const hoyISO = () => new Date().toISOString().split("T")[0];

// Logo embebido como base64 para que el informe/tirilla funcione sin servidor.
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

function mensajeErrorCamara(err) {
  if (!window.isSecureContext) {
    return "El navegador solo permite usar la cámara en sitios seguros (https://). Esta página se está abriendo sin HTTPS.";
  }
  const nombre = err?.name || "";
  if (nombre === "NotAllowedError" || nombre === "PermissionDeniedError") {
    return "El navegador bloqueó el permiso de cámara. Revisa los permisos del sitio y vuelve a intentar.";
  }
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
    return "No se encontró una cámara trasera en este dispositivo.";
  }
  if (nombre === "NotReadableError" || nombre === "TrackStartError") {
    return "La cámara está siendo usada por otra app o pestaña. Ciérrala e intenta de nuevo.";
  }
  return "No se pudo acceder a la cámara.";
}

function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx  = new Ctx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close();
  } catch {}
}

// ── QR de asistencia: "TPAS|FIJO|<num>" o "TPAS|TEMP|<num>" (num = documento) ──
const QR_ASIS_PREFIX = "TPAS";
const textoQrAsistencia = (tipo, num) => `${QR_ASIS_PREFIX}|${tipo}|${num}`;

// Tirilla individual (100x50mm) — para el registro rápido de un temporal o
// para reimprimir el QR fijo de una sola persona.
async function buildTirillaEmpleado({ nombre, num, tipo, contenedor, fecha }) {
  const logoSrc   = await cargarLogoBase64();
  const qrDataUrl = await QRCode.toDataURL(textoQrAsistencia(tipo, num), { errorCorrectionLevel: "M", margin: 1, width: 260 });
  const fechaFmt  = fecha ? new Date(fecha + "T12:00:00").toLocaleDateString("es-CO", { day:"2-digit", month:"short", year:"numeric" }) : "";
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>QR ${nombre}</title>
<style>
  *{box-sizing:border-box}
  @page{size:100mm 50mm;margin:0}
  html,body{margin:0;padding:0}
  body{font-family:Arial,sans-serif;color:#111;width:100mm;height:50mm}
  .box{width:100mm;height:50mm;padding:2mm;display:flex;gap:3mm;align-items:center}
  .left{flex:1;min-width:0}
  .brand{display:flex;align-items:center;gap:1.5mm;margin-bottom:2mm}
  .brand img{width:7mm;height:7mm;object-fit:contain}
  .brand .nom{font-size:3mm;font-weight:800}
  .nombre{font-size:5.2mm;font-weight:900;line-height:1.1;margin-bottom:1.5mm;word-break:break-word}
  .doc{font-size:3.2mm;color:#444;font-weight:700}
  .badge{display:inline-block;margin-top:2mm;padding:0.8mm 2.5mm;border-radius:2mm;font-size:2.6mm;font-weight:800;letter-spacing:0.3mm}
  .badge.fijo{background:#ede9fe;color:#6d28d9}
  .badge.temp{background:#fee2e2;color:#b91c1c}
  .proceso{margin-top:1.8mm;font-size:2.5mm;color:#333;font-weight:700;line-height:1.5}
  .proceso b{color:#111}
  .right{width:30mm;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1mm}
  .right img{width:28mm;height:28mm}
  .qr-lbl{font-size:1.9mm;color:#777;text-align:center;line-height:1.2;font-weight:600}
  @media print{ body{padding:0} }
</style></head>
<body>
  <div class="box">
    <div class="left">
      <div class="brand">${logoSrc ? `<img src="${logoSrc}"/>` : ""}<span class="nom">TIERRA PROMETIDA</span></div>
      <div class="nombre">${nombre}</div>
      <div class="doc">Doc. ${num}</div>
      <div class="badge ${tipo === "TEMP" ? "temp" : "fijo"}">${tipo === "TEMP" ? "TEMPORAL" : "TRABAJADOR AUTORIZADO"}</div>
      ${(contenedor || fechaFmt) ? `<div class="proceso">${contenedor ? `📦 Contenedor <b>${contenedor}</b>` : ""}${contenedor && fechaFmt ? " · " : ""}${fechaFmt ? `📅 <b>${fechaFmt}</b>` : ""}</div>` : ""}
    </div>
    <div class="right">
      <img src="${qrDataUrl}" alt="QR ${nombre}"/>
      <div class="qr-lbl">Escanear para asistencia</div>
    </div>
  </div>
</body></html>`;
}

// Link de WhatsApp con el chat de esa persona ya abierto y el mensaje
// escrito. WhatsApp no permite adjuntar una imagen por link (limitación de
// su click-to-chat, no del navegador) — por eso `compartirQR` intenta primero
// el "compartir" nativo del sistema (sí adjunta el archivo, en celular).
function linkWhatsAppTexto(tel, mensaje) {
  const limpio = String(tel || "").replace(/\D/g, "");
  if (limpio.length < 7) return null;
  const conCodigo = limpio.length <= 10 ? `57${limpio}` : limpio;
  return `https://wa.me/${conCodigo}?text=${encodeURIComponent(mensaje)}`;
}

async function compartirQR({ emp, tipo, contenedor, fecha }) {
  const mensaje = `Hola ${emp.nombre.split(" ")[0]}, este es tu código QR de asistencia${contenedor ? ` para el contenedor ${contenedor}` : ""}${fecha ? ` del ${fecha}` : ""}. Preséntalo al llegar 🍋`;
  try {
    if (navigator.share && navigator.canShare) {
      const qrDataUrl = await QRCode.toDataURL(textoQrAsistencia(tipo, emp.num), { errorCorrectionLevel:"M", margin:1, width:500 });
      const blob = await (await fetch(qrDataUrl)).blob();
      const file = new File([blob], `QR_${emp.nombre.replace(/\s+/g,"_")}.png`, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: mensaje });
        return { ok: true };
      }
    }
  } catch (err) {
    if (err?.name === "AbortError") return { ok: true }; // el usuario canceló el share, no es un error
  }
  const link = linkWhatsAppTexto(emp.tel, mensaje);
  if (!link) return { ok: false, msg: `${emp.nombre} no tiene celular registrado en Personal.` };
  window.open(link, "_blank");
  return { ok: true };
}

// ── Informe final del proceso: asistencia real vs. asignados, horarios,
// foto del grupo y pago por persona ──────────────────────────────────
async function buildInformeProceso({ contenedor, sesionActiva, horaCierre, asignados, miembrosActivos, pago, nombreDe, docDe }) {
  const logoSrc = await cargarLogoBase64();
  const fechaFmt = new Date(sesionActiva.fecha + "T12:00:00").toLocaleDateString("es-CO", { day:"2-digit", month:"long", year:"numeric" });
  const horaInicio = new Date(sesionActiva.abiertaEn).toLocaleTimeString("es-CO", { hour:"2-digit", minute:"2-digit" });
  const horaFin     = horaCierre ? new Date(horaCierre).toLocaleTimeString("es-CO", { hour:"2-digit", minute:"2-digit" }) : "—";
  const todas = Array.from(new Set([...asignados, ...miembrosActivos]));

  const filas = todas.map(num => {
    const asistio = miembrosActivos.includes(num);
    const d = pago?.detalle.find(x => x.num === num);
    return `<tr>
      <td><strong>${nombreDe(num)}</strong></td>
      <td style="color:#666">${docDe(num)}</td>
      <td style="text-align:center;color:${asistio ? "#1D6F42" : "#e53935"};font-weight:700">${asistio ? "✔ Asistió" : "✖ No llegó"}</td>
      <td style="text-align:right;font-weight:700">${d ? fmtCOP(d.total) : "—"}</td>
    </tr>`;
  }).join("");

  const fotosHtml = (sesionActiva.fotos || []).map(f => `<img src="${f}" style="width:140px;height:140px;object-fit:cover;border-radius:10px;margin:4px" />`).join("");
  const totalPagado = pago ? pago.detalle.reduce((s,d)=>s+d.total,0) : 0;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Informe Contenedor ${contenedor?.numContenedor || ""}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#1a1a1a;padding:24px;font-size:12px}
  .header{text-align:center;border-bottom:3px solid #845EF7;padding-bottom:14px;margin-bottom:18px}
  .header img{width:38px;height:38px;object-fit:contain;margin:0 auto 4px}
  .htitle{color:#845EF7;font-size:20px;font-weight:800}
  .sub{color:#666;font-size:12px;margin-top:3px}
  .stats{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
  .stat{flex:1;min-width:100px;background:#f5f3ff;border-radius:10px;padding:10px;text-align:center}
  .stl{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.4px}
  .stv{font-size:14px;font-weight:800;color:#1a1a1a;margin-top:2px}
  .sec{font-size:13px;font-weight:800;color:#6d28d9;background:#ede9fe;border-left:4px solid #6d28d9;padding:7px 12px;margin:18px 0 10px;border-radius:0 6px 6px 0}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#6d28d9;color:#fff;padding:7px 10px;text-align:left}
  td{padding:6px 10px;border-bottom:1px solid #eee}
  .fotos{display:flex;flex-wrap:wrap;margin-top:8px}
  .total{display:flex;justify-content:space-between;font-size:15px;font-weight:800;color:#6d28d9;border-top:2px solid #ede9fe;padding-top:10px;margin-top:10px}
  @media print{body{padding:10px}}
</style></head>
<body>
  <div class="header">
    ${logoSrc ? `<img src="${logoSrc}"/>` : ""}
    <div class="htitle">TIERRA PROMETIDA TRADING</div>
    <div class="sub">Informe de Proceso — Contenedor ${contenedor?.numContenedor || "—"}</div>
  </div>

  <div class="stats">
    <div class="stat"><div class="stl">Fecha</div><div class="stv">${fechaFmt}</div></div>
    <div class="stat"><div class="stl">Turno</div><div class="stv">${sesionActiva.turno}</div></div>
    <div class="stat"><div class="stl">Hora inicio</div><div class="stv">${horaInicio}</div></div>
    <div class="stat"><div class="stl">Hora fin</div><div class="stv">${horaFin}</div></div>
    <div class="stat"><div class="stl">Asistieron</div><div class="stv">${miembrosActivos.length} / ${todas.length || miembrosActivos.length}</div></div>
  </div>

  <div class="sec">Asistencia y pago por persona</div>
  <table>
    <thead><tr><th>Nombre</th><th>Documento</th><th style="text-align:center">Estado</th><th style="text-align:right">Pago</th></tr></thead>
    <tbody>${filas || `<tr><td colspan="4" style="text-align:center;color:#999;padding:16px">Nadie asignado ni escaneado en este proceso.</td></tr>`}</tbody>
  </table>
  <div class="total"><span>Total pagado</span><span>${fmtCOP(totalPagado)}</span></div>

  ${sesionActiva.fotos?.length ? `<div class="sec">Foto de evidencia del grupo</div><div class="fotos">${fotosHtml}</div>` : ""}

  <div style="text-align:center;font-size:9px;color:#bbb;margin-top:24px;border-top:1px solid #f0f0f0;padding-top:10px">
    Generado el ${new Date().toLocaleDateString("es-CO")} a las ${new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})} · JARVIS · Tierra Prometida Trading
  </div>
</body></html>`;
}

export default function AsistenciaTab() {
  const {
    registros, metaDia, loading: loadingAsis, cargarMes,
    setEmpField: setEmpFieldSB, toggleEstado: toggleEstadoSB,
    setMetaField: setMetaFieldSB, marcarTodos: marcarTodosSB, limpiarDia,
  } = useAsistencia();
  const { empleados, loading: loadingPersonal } = usePersonal();
  const { procesos, grupos, guardarGrupo, guardarContenedor, loading: loadingCont } = useContenedores();
  const { agregarLiquidacion } = useLiquidaciones();
  const asisQR = useAsistenciaQR({ procesos, grupos, guardarGrupo, guardarContenedor });

  const [modo, setModo]   = useState("manual"); // manual | sesion | escanear
  const [toast, setToast] = useState(null);
  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const [previewData, setPreviewData] = useState(null);
  const verPrevia = (html, filename) => setPreviewData({ url: URL.createObjectURL(new Blob([html], { type: "text/html" })), filename });
  useEffect(() => () => { if (previewData?.url) URL.revokeObjectURL(previewData.url); }, [previewData]);
  const iframeRef = useRef(null);

  if (loadingAsis || loadingPersonal || loadingCont || asisQR.loading) return <LimonLoader texto="Cargando asistencia" />;

  const MODOS = [
    { id: "manual",   icon: "📋", label: "Manual" },
    { id: "sesion",   icon: "📦", label: "Sesión / Pagos" },
    { id: "escanear", icon: "📷", label: "Escanear" },
  ];

  return (
    <div>
      {toast && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background: toast.ok ? "#064e3b" : "#450a0a", border:`1px solid ${toast.ok ? "#059669" : "#dc2626"}`, color: toast.ok ? "#6ee7b7" : "#fca5a5", borderRadius:10, padding:"10px 20px", fontSize:12, fontWeight:600, zIndex:9999, pointerEvents:"none", whiteSpace:"nowrap" }}>
          {toast.ok ? "✅" : "❌"} {toast.msg}
        </div>
      )}

      {previewData && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.88)", zIndex:9998, display:"flex", flexDirection:"column" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", background:"#12121f", borderBottom:"1px solid rgba(255,255,255,0.13)", flexShrink:0, flexWrap:"wrap", gap:8 }}>
            <span style={{ color:"white", fontWeight:700, fontSize:13 }}>👁 Vista Previa — {previewData.filename}</span>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => iframeRef.current?.contentWindow?.print()} style={{ background:"rgba(99,102,241,0.2)", border:"1px solid rgba(99,102,241,0.5)", borderRadius:8, padding:"7px 16px", fontSize:12, color:"#a5b4fc", cursor:"pointer", fontWeight:700 }}>🖨 Imprimir</button>
              <button onClick={() => { const a=document.createElement("a"); a.href=previewData.url; a.download=previewData.filename; a.click(); }} style={{ background:"linear-gradient(135deg,#845EF7,#6366F1)", border:"none", borderRadius:8, padding:"7px 16px", fontSize:12, color:"white", cursor:"pointer", fontWeight:700 }}>📥 Descargar</button>
              <button onClick={() => setPreviewData(null)} style={{ background:"rgba(255,255,255,0.10)", border:"1px solid rgba(255,255,255,0.20)", borderRadius:8, padding:"7px 14px", fontSize:12, color:"rgba(255,255,255,0.78)", cursor:"pointer" }}>✕ Cerrar</button>
            </div>
          </div>
          <iframe ref={iframeRef} src={previewData.url} style={{ flex:1, border:"none", background:"white" }} title="Vista previa QR" />
        </div>
      )}

      {/* Selector de modo */}
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        {MODOS.map(m => (
          <button key={m.id} onClick={() => setModo(m.id)} style={{
            flex:"1 1 100px", background: modo === m.id ? "linear-gradient(135deg,#845EF7,#6366F1)" : "rgba(255,255,255,0.06)",
            border: `1px solid ${modo === m.id ? "transparent" : "rgba(255,255,255,0.15)"}`, borderRadius:9,
            padding:"9px 6px", fontSize:12, fontWeight:700, color: modo === m.id ? "white" : "rgba(255,255,255,0.6)", cursor:"pointer",
          }}>
            {m.icon} {m.label}
            {m.id === "escanear" && asisQR.sesionActiva && modo !== "escanear" && (
              <span style={{ marginLeft:4, width:7, height:7, borderRadius:99, background:"#00C9A7", display:"inline-block" }} />
            )}
          </button>
        ))}
      </div>

      {modo === "manual" && (
        <AsistenciaManual
          registros={registros} metaDia={metaDia} cargarMes={cargarMes}
          empleados={empleados}
          setEmpFieldSB={setEmpFieldSB} toggleEstadoSB={toggleEstadoSB}
          setMetaFieldSB={setMetaFieldSB} marcarTodosSB={marcarTodosSB} limpiarDia={limpiarDia}
        />
      )}

      {modo === "sesion" && (
        <SesionPanel
          asisQR={asisQR} procesos={procesos} grupos={grupos} empleados={empleados}
          registros={registros} guardarContenedor={guardarContenedor}
          agregarLiquidacion={agregarLiquidacion}
          verPrevia={verPrevia} showToast={showToast}
        />
      )}

      {modo === "escanear" && (
        <EscanearPanel asisQR={asisQR} procesos={procesos} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODO MANUAL — igual al módulo de Asistencia que ya existía
// ═══════════════════════════════════════════════════════════════
function AsistenciaManual({ registros, metaDia, cargarMes, empleados, setEmpFieldSB, toggleEstadoSB, setMetaFieldSB, marcarTodosSB, limpiarDia }) {
  const hoy      = new Date();
  const fechaHoy = hoy.toISOString().split("T")[0];

  const [fecha,       setFecha]       = useState(fechaHoy);
  const [search,      setSearch]       = useState("");
  const [showReporte, setShowReporte]  = useState(false);
  const [mesReporte,  setMesReporte]   = useState(`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,"0")}`);
  const [expandedEmp, setExpandedEmp]  = useState(null);

  const ESTADOS = [
    { key:"P",  label:"Presente",  color:"#00C9A7", icon:"✅" },
    { key:"A",  label:"Ausente",   color:"#FF6B6B", icon:"❌" },
    { key:"T",  label:"Tardanza",  color:"#F9A826", icon:"⏰" },
    { key:"F",  label:"Festivo",   color:"#845EF7", icon:"🎉" },
    { key:"LP", label:"Lic/Perm",  color:"#4ECDC4", icon:"📋" },
  ];

  const empleadosActivos = empleados.filter(e =>
    !["Descargador","Owner / Propietario"].includes(e.area)
  );

  const filtrados = empleadosActivos.filter(e =>
    e.nombre.toLowerCase().includes(search.toLowerCase()) ||
    e.area.toLowerCase().includes(search.toLowerCase())
  );

  const getEmpReg = (nombre) => registros[fecha]?.[nombre] || {};
  const getEstado = (nombre) => getEmpReg(nombre).estado || null;
  const getMeta   = ()        => metaDia[fecha] || {};

  const setEmpField  = (nombre, field, value) => setEmpFieldSB(fecha, nombre, field, value);
  const toggleEstado = (nombre, nuevoEstado)  => toggleEstadoSB(fecha, nombre, nuevoEstado);
  const setMetaField = (field, value)         => setMetaFieldSB(fecha, field, value);
  const marcarTodos  = (estado)               => marcarTodosSB(fecha, filtrados, estado);

  const diaReg = registros[fecha] || {};
  const stats  = ESTADOS.reduce((acc, s) => {
    acc[s.key] = Object.values(diaReg).filter(v => v?.estado === s.key).length;
    return acc;
  }, {});
  const sinRegistro = empleadosActivos.length -
    Object.values(diaReg).filter(v => v?.estado).length;
  const meta = getMeta();

  const getDiasMes = (mesStr) => {
    const [y, m] = mesStr.split("-").map(Number);
    const total  = new Date(y, m, 0).getDate();
    const out    = [];
    for (let d = 1; d <= total; d++)
      out.push(`${mesStr}-${String(d).padStart(2,"0")}`);
    return out;
  };

  const generarReporteData = () => {
    const dias = getDiasMes(mesReporte);
    return empleadosActivos.map(emp => {
      let presente=0, ausente=0, tardanza=0, festivo=0, licencia=0;
      const detalleDias = {};
      dias.forEach(d => {
        const r   = registros[d]?.[emp.nombre] || {};
        const est = r.estado || "";
        detalleDias[d] = {
          estado:     est,
          contenedor: r.contenedor || "",
          obs:        r.obs        || "",
        };
        if      (est === "P")  presente++;
        else if (est === "A")  ausente++;
        else if (est === "T")  tardanza++;
        else if (est === "F")  festivo++;
        else if (est === "LP") licencia++;
      });
      const tieneRegistro = (presente+ausente+tardanza+festivo+licencia) > 0;
      return {
        nombre:   emp.nombre,
        area:     emp.area,
        docTipo:  emp.doc || "—",
        docNum:   emp.num || "—",
        presente, ausente, tardanza, festivo, licencia,
        detalleDias,
        tieneRegistro,
      };
    }).filter(r => r.tieneRegistro);
  };

  useEffect(() => { cargarMes(mesReporte); }, [mesReporte, cargarMes]);

  const inp   = { background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, padding:"7px 10px", color:"white", fontSize:12, fontFamily:"inherit", outline:"none" };
  const inpSm = { ...inp, padding:"5px 8px", fontSize:11 };

  const descargarInforme = async () => {
    const logoSrc = await cargarLogoBase64();
    const datos = generarReporteData();
    if (datos.length === 0) {
      alert("No hay registros para el mes seleccionado.\nMarca asistencia primero y vuelve aquí.");
      return;
    }
    const [y, m] = mesReporte.split("-");
    const MESES  = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const nomMes = MESES[parseInt(m)];
    const dias   = getDiasMes(mesReporte);

    const diasConReg = dias.filter(d =>
      datos.some(row => row.detalleDias[d]?.estado)
    );

    if (diasConReg.length === 0) {
      alert("No se encontraron días con registros de asistencia.");
      return;
    }

    const esc = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const DIAS_SEMANA = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

    const tablaMetaDias = diasConReg.map(d => {
      const dm  = metaDia[d] || {};
      const ds  = DIAS_SEMANA[new Date(d + "T12:00:00").getDay()];
      const nd  = parseInt(d.split("-")[2]);
      const turno       = dm.turno           || "—";
      const contDia     = dm.contenedorDia   || "—";
      const obsGral     = dm.obsGeneral      || "—";
      return `<tr>
        <td><strong>${ds} ${nd} ${nomMes}</strong></td>
        <td style="text-align:center">${esc(turno)}</td>
        <td style="text-align:center;color:#1D6F42;font-weight:700">${esc(contDia)}</td>
        <td style="font-style:italic;color:#444">${esc(obsGral)}</td>
      </tr>`;
    }).join("");

    const tablaResumen = datos.map((r, i) => `<tr>
      <td style="color:#999;text-align:center">${i+1}</td>
      <td><strong>${esc(r.nombre)}</strong></td>
      <td style="color:#555">${esc(r.docTipo)}</td>
      <td style="font-weight:600">${esc(r.docNum)}</td>
      <td>${esc(r.area)}</td>
      <td style="text-align:center;color:#1D6F42;font-weight:700">${r.presente}</td>
      <td style="text-align:center;color:#e53935;font-weight:700">${r.ausente}</td>
      <td style="text-align:center;color:#e67e00;font-weight:700">${r.tardanza}</td>
      <td style="text-align:center;color:#00897b;font-weight:700">${r.licencia}</td>
      <td style="text-align:center;color:#7b1fa2;font-weight:700">${r.festivo}</td>
    </tr>`).join("");

    const encabezadosDias = diasConReg.map(d => {
      const nd = parseInt(d.split("-")[2]);
      const ds = ["D","L","M","X","J","V","S"][new Date(d + "T12:00:00").getDay()];
      return `<th style="text-align:center;min-width:26px;font-size:9px;padding:3px 2px">${ds}<br/>${nd}</th>`;
    }).join("");

    const filasDetalle = datos.map(row => {
      const celdas  = diasConReg.map(d => {
        const dd  = row.detalleDias[d] || {};
        const est = dd.estado || "";
        const cont      = dd.contenedor || "";
        const obs       = dd.obs || "";
        const clsColor  = { P:"#1D6F42", A:"#e53935", T:"#e67e00", F:"#7b1fa2", LP:"#00897b" }[est] || "#ccc";
        const contHtml  = cont ? `<div style="font-size:7px;color:#666;margin-top:2px">C${esc(cont)}</div>` : "";
        const obsHtml   = obs  ? `<div style="font-size:7px;color:#888;font-style:italic;margin-top:1px">${esc(obs)}</div>` : "";
        return `<td style="text-align:center;vertical-align:top;padding:3px 2px">
          <span style="font-weight:700;color:${clsColor};font-size:10px">${est || "—"}</span>
          ${contHtml}${obsHtml}
        </td>`;
      }).join("");
      return `<tr>
        <td style="white-space:nowrap;font-weight:700;font-size:10px">${esc(row.nombre.split(" ").slice(0,2).join(" "))}</td>
        <td style="font-size:8px;color:#666;white-space:nowrap">${esc(row.docTipo)}<br/>${esc(row.docNum)}</td>
        <td style="font-size:9px;white-space:nowrap">${esc(row.area)}</td>
        ${celdas}
        <td style="text-align:center;font-weight:800;color:#1D6F42">${row.presente}</td>
        <td style="text-align:center;font-weight:800;color:#e53935">${row.ausente}</td>
        <td style="text-align:center;font-weight:800;color:#e67e00">${row.tardanza}</td>
        <td style="text-align:center;font-weight:800;color:#00897b">${row.licencia}</td>
        <td style="text-align:center;font-weight:800;color:#7b1fa2">${row.festivo}</td>
      </tr>`;
    }).join("");

    const filasObs = [];
    datos.forEach(row => {
      diasConReg.forEach(d => {
        const dd  = row.detalleDias[d] || {};
        const obs = dd.obs || "";
        const est = dd.estado || "";
        if (!obs) return;
        const nd = parseInt(d.split("-")[2]);
        const ds = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][new Date(d + "T12:00:00").getDay()];
        const colorEst = { P:"#1D6F42", A:"#e53935", T:"#e67e00", F:"#7b1fa2", LP:"#00897b" }[est] || "#555";
        filasObs.push(`<tr>
          <td style="white-space:nowrap;font-weight:700">${esc(row.nombre)}</td>
          <td style="font-size:9px;color:#666">${esc(row.docTipo)} ${esc(row.docNum)}</td>
          <td style="white-space:nowrap">${ds} ${nd} ${nomMes}</td>
          <td style="text-align:center;font-weight:700;color:${colorEst}">${est || "—"}</td>
          <td style="font-style:italic;color:#333">${esc(obs)}</td>
        </tr>`);
      });
    });
    const seccionObs = filasObs.length > 0 ? `
<div class="sec">Seccion 4 &mdash; Observaciones individuales por empleado</div>
<p class="nota">Novedades, permisos y motivos registrados por persona y dia.</p>
<table>
  <thead>
    <tr>
      <th>Empleado</th>
      <th>Documento</th>
      <th style="white-space:nowrap">Fecha</th>
      <th style="text-align:center">Estado</th>
      <th>Observacion</th>
    </tr>
  </thead>
  <tbody>
    ${filasObs.join("")}
  </tbody>
</table>` : `
<div class="sec">Seccion 4 &mdash; Observaciones individuales</div>
<p style="font-size:11px;color:#999;padding:10px 0;font-style:italic">No hay observaciones individuales registradas para este mes.</p>`;

    const totalP = datos.reduce((a,r)=>a+r.presente,0);
    const totalA = datos.reduce((a,r)=>a+r.ausente,0);
    const totalT = datos.reduce((a,r)=>a+r.tardanza,0);
    const totalL = datos.reduce((a,r)=>a+r.licencia,0);
    const totalF = datos.reduce((a,r)=>a+r.festivo,0);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Asistencia ${nomMes} ${y} - Tierra Prometida</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#1a1a1a;padding:20px;font-size:11px}
  .header{text-align:center;border-bottom:3px solid #1D6F42;padding-bottom:14px;margin-bottom:18px}
  .logo{font-size:34px;margin-bottom:4px}
  .logo img{width:38px;height:38px;object-fit:contain;display:block;margin:0 auto}
  .htitle{color:#1D6F42;font-size:20px;font-weight:800;letter-spacing:-0.5px}
  .sub{color:#666;font-size:12px;margin-top:3px}
  .badge{display:inline-block;background:#1D6F42;color:#fff;padding:3px 16px;border-radius:20px;font-size:9px;margin-top:6px;letter-spacing:0.5px}
  .stats{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
  .stat{flex:1;min-width:70px;background:#f5f5f5;border-radius:10px;padding:10px 6px;text-align:center}
  .stn{font-size:22px;font-weight:800}
  .stl{font-size:9px;color:#666;margin-top:2px}
  .sec{font-size:13px;font-weight:800;color:#1D6F42;background:#e8f5e9;border-left:4px solid #1D6F42;padding:7px 12px;margin:18px 0 10px;border-radius:0 6px 6px 0}
  table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:6px}
  th{background:#1D6F42;color:#fff;padding:6px 8px;text-align:left;border:1px solid #145a32;font-size:10px}
  td{padding:5px 8px;border:1px solid #e0e0e0;vertical-align:top}
  tr:nth-child(even) td{background:#fafafa}
  .footer{text-align:center;font-size:9px;color:#bbb;margin-top:16px;border-top:1px solid #f0f0f0;padding-top:10px}
  .nota{font-size:9px;color:#999;margin-bottom:8px;font-style:italic}
  @media print{body{padding:10px}.nota{display:none}}
</style>
</head>
<body>

<div class="header">
  <div class="logo">${logoSrc ? `<img src="${logoSrc}"/>` : "&#127819;"}</div>
  <div class="htitle">TIERRA PROMETIDA TRADING</div>
  <div class="sub">Informe de Asistencia &mdash; ${nomMes} ${y}</div>
  <div class="badge">JARVIS &bull; ${new Date().toLocaleDateString("es-CO")} ${new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}</div>
</div>

<div class="stats">
  <div class="stat"><div class="stn" style="color:#1D6F42">${totalP}</div><div class="stl">Presentes</div></div>
  <div class="stat"><div class="stn" style="color:#e53935">${totalA}</div><div class="stl">Ausencias</div></div>
  <div class="stat"><div class="stn" style="color:#e67e00">${totalT}</div><div class="stl">Tardanzas</div></div>
  <div class="stat"><div class="stn" style="color:#00897b">${totalL}</div><div class="stl">Licencias</div></div>
  <div class="stat"><div class="stn" style="color:#7b1fa2">${totalF}</div><div class="stl">Festivos</div></div>
  <div class="stat"><div class="stn" style="color:#1a237e">${datos.length}</div><div class="stl">Empleados</div></div>
  <div class="stat"><div class="stn" style="color:#37474f">${diasConReg.length}</div><div class="stl">Dias con reg.</div></div>
</div>

<div class="sec">Seccion 1 &mdash; Datos del dia: Turno, Contenedor y Observaciones</div>
<p class="nota">Solo dias con al menos un empleado marcado. Informacion ingresada en la cabecera del modulo.</p>
<table>
  <thead>
    <tr>
      <th style="min-width:110px">Fecha</th>
      <th style="text-align:center;min-width:60px">Turno</th>
      <th style="text-align:center;min-width:100px">Contenedor del dia</th>
      <th>Observacion general del dia</th>
    </tr>
  </thead>
  <tbody>
    ${tablaMetaDias}
  </tbody>
</table>

<div class="sec">Seccion 2 &mdash; Resumen por empleado &mdash; ${nomMes} ${y}</div>
<p class="nota">Solo empleados con al menos un dia marcado en el mes.</p>
<table>
  <thead>
    <tr>
      <th style="width:24px">#</th>
      <th>Empleado</th>
      <th>Tipo Doc.</th>
      <th>N&ordm; Documento</th>
      <th>Area</th>
      <th style="text-align:center">Pres.</th>
      <th style="text-align:center">Aus.</th>
      <th style="text-align:center">Tard.</th>
      <th style="text-align:center">Lic.</th>
      <th style="text-align:center">Fest.</th>
    </tr>
  </thead>
  <tbody>
    ${tablaResumen}
  </tbody>
</table>

<div class="sec">Seccion 3 &mdash; Detalle diario por empleado (contenedor y observacion por dia)</div>
<p class="nota">C = Numero de contenedor &bull; Texto en cursiva = Observacion individual</p>
<div style="overflow-x:auto">
<table style="font-size:9px">
  <thead>
    <tr>
      <th style="min-width:105px">Empleado</th>
      <th style="min-width:60px">Documento</th>
      <th style="min-width:80px">Area</th>
      ${encabezadosDias}
      <th style="text-align:center;background:#1B5E20;min-width:22px">P</th>
      <th style="text-align:center;background:#b71c1c;min-width:22px">A</th>
      <th style="text-align:center;background:#e65100;min-width:22px">T</th>
      <th style="text-align:center;background:#004d40;min-width:22px">L</th>
      <th style="text-align:center;background:#4a148c;min-width:22px">F</th>
    </tr>
  </thead>
  <tbody>
    ${filasDetalle}
  </tbody>
</table>
</div>

${seccionObs}

<div class="footer">
  Generado el ${new Date().toLocaleDateString("es-CO")} a las ${new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}
  &bull; JARVIS &bull; Tierra Prometida Trading &bull; ${nomMes} ${y}
</div>

</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `Asistencia_${nomMes}_${y}.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 600);
  };

  return (
    <div>
      {showReporte && (
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.9)",zIndex:9999,overflowY:"auto",padding:16}}>
          <div style={{background:"white",borderRadius:16,maxWidth:660,margin:"0 auto",padding:24,color:"#1a1a1a"}}>

            <div style={{textAlign:"center",borderBottom:"3px solid #1D6F42",paddingBottom:12,marginBottom:16}}>
              <div style={{fontSize:28}}>🍋</div>
              <div style={{fontSize:17,fontWeight:800,color:"#1D6F42"}}>TIERRA PROMETIDA TRADING</div>
              <div style={{fontSize:11,color:"#666"}}>Vista previa — Informe de Asistencia</div>
              <div style={{display:"inline-block",background:"#1D6F42",color:"white",padding:"2px 14px",borderRadius:20,fontSize:9,marginTop:4}}>JARVIS 🤖</div>
            </div>

            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,background:"#f0faf5",borderRadius:10,padding:"10px 14px"}}>
              <span style={{fontSize:12,fontWeight:700,color:"#1D6F42",whiteSpace:"nowrap"}}>📅 Mes:</span>
              <input
                type="month"
                value={mesReporte}
                onChange={e => setMesReporte(e.target.value)}
                style={{border:"1px solid #c8e6c9",borderRadius:6,padding:"5px 8px",fontSize:12,color:"#1a1a1a",background:"white"}}
              />
              <span style={{fontSize:10,color:"#999",marginLeft:"auto"}}>Solo empleados marcados</span>
            </div>

            {(() => {
              const datos = generarReporteData();
              if (datos.length === 0) return (
                <div style={{textAlign:"center",padding:"28px 20px",background:"#fafafa",borderRadius:10,marginBottom:14}}>
                  <div style={{fontSize:32,marginBottom:8}}>📭</div>
                  <div style={{fontSize:13,fontWeight:700,color:"#555"}}>Sin registros para este mes</div>
                  <div style={{fontSize:11,color:"#999",marginTop:4}}>Marca asistencia en el módulo y luego vuelve aquí.</div>
                </div>
              );

              const diasMes  = getDiasMes(mesReporte);
              const diasConR = diasMes.filter(d => datos.some(row => row.detalleDias[d]?.estado));
              const diasConMeta = diasConR.filter(d => metaDia[d]?.turno || metaDia[d]?.contenedorDia || metaDia[d]?.obsGeneral);

              return (
                <>
                  <div style={{display:"flex",gap:7,marginBottom:14,flexWrap:"wrap"}}>
                    {[
                      {v:datos.reduce((a,r)=>a+r.presente,0), l:"Presentes",  c:"#1D6F42"},
                      {v:datos.reduce((a,r)=>a+r.ausente,0),  l:"Ausencias",  c:"#e53935"},
                      {v:datos.reduce((a,r)=>a+r.tardanza,0), l:"Tardanzas",  c:"#e67e00"},
                      {v:datos.reduce((a,r)=>a+r.licencia,0), l:"Licencias",  c:"#00897b"},
                      {v:datos.length,                         l:"Empleados",  c:"#1a237e"},
                      {v:diasConR.length,                      l:"Días regist.",c:"#37474f"},
                    ].map((s,i) => (
                      <div key={i} style={{flex:1,minWidth:55,background:"#f5f5f5",borderRadius:8,padding:"8px 4px",textAlign:"center"}}>
                        <div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div>
                        <div style={{fontSize:8,color:"#666",marginTop:1}}>{s.l}</div>
                      </div>
                    ))}
                  </div>

                  {diasConMeta.length > 0 && (
                    <div style={{background:"#e8f5e9",borderRadius:10,padding:"10px 12px",marginBottom:12,border:"1px solid #c8e6c9"}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#1D6F42",marginBottom:6}}>
                        📦 Datos de turno/contenedor guardados ({diasConMeta.length} día{diasConMeta.length>1?"s":""})
                      </div>
                      {diasConMeta.slice(0,4).map(d => {
                        const dm = metaDia[d] || {};
                        const nd = parseInt(d.split("-")[2]);
                        const ds = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][new Date(d+"T12:00:00").getDay()];
                        return (
                          <div key={d} style={{fontSize:10,color:"#333",marginBottom:2,display:"flex",gap:10,flexWrap:"wrap"}}>
                            <span style={{fontWeight:700,minWidth:60}}>{ds} {nd}</span>
                            {dm.turno           && <span>🕐 {dm.turno}</span>}
                            {dm.contenedorDia   && <span>📦 C.{dm.contenedorDia}</span>}
                            {dm.obsGeneral      && <span style={{color:"#555",fontStyle:"italic"}}>📝 {dm.obsGeneral}</span>}
                          </div>
                        );
                      })}
                      {diasConMeta.length > 4 && <div style={{fontSize:9,color:"#999",marginTop:3}}>...y {diasConMeta.length-4} días más en el informe</div>}
                    </div>
                  )}

                  <div style={{fontSize:11,fontWeight:700,color:"#1D6F42",marginBottom:6,borderLeft:"3px solid #1D6F42",paddingLeft:8}}>
                    Resumen por empleado
                  </div>
                  <div style={{overflowX:"auto",marginBottom:12}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                      <thead>
                        <tr style={{background:"#1D6F42"}}>
                          {["Empleado","Tipo Doc","Documento","Área","P","A","T","Lic","Fest"].map(h => (
                            <th key={h} style={{padding:"5px 7px",textAlign:"left",color:"white",border:"1px solid #145a32",whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {datos.map((row, i) => (
                          <tr key={i} style={{background:i%2===0?"white":"#f9f9f9"}}>
                            <td style={{padding:"4px 7px",border:"1px solid #e0e0e0",fontWeight:600,whiteSpace:"nowrap"}}>{row.nombre.split(" ").slice(0,2).join(" ")}</td>
                            <td style={{padding:"4px 7px",border:"1px solid #e0e0e0",color:"#555",fontSize:9}}>{row.docTipo}</td>
                            <td style={{padding:"4px 7px",border:"1px solid #e0e0e0",fontSize:9,fontWeight:600}}>{row.docNum}</td>
                            <td style={{padding:"4px 7px",border:"1px solid #e0e0e0"}}>{row.area}</td>
                            <td style={{padding:"4px 7px",border:"1px solid #e0e0e0",color:"#1D6F42",fontWeight:700,textAlign:"center"}}>{row.presente}</td>
                            <td style={{padding:"4px 7px",border:"1px solid #e0e0e0",color:"#e53935",fontWeight:700,textAlign:"center"}}>{row.ausente}</td>
                            <td style={{padding:"4px 7px",border:"1px solid #e0e0e0",color:"#e67e00",fontWeight:700,textAlign:"center"}}>{row.tardanza}</td>
                            <td style={{padding:"4px 7px",border:"1px solid #e0e0e0",color:"#00897b",fontWeight:700,textAlign:"center"}}>{row.licencia}</td>
                            <td style={{padding:"4px 7px",border:"1px solid #e0e0e0",color:"#7b1fa2",fontWeight:700,textAlign:"center"}}>{row.festivo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{fontSize:10,color:"#888",marginBottom:12,textAlign:"center",background:"#f9f9f9",borderRadius:8,padding:"8px"}}>
                    El informe descargado incluye <strong>3 secciones</strong>: datos del día (turno, contenedor, observación), resumen por empleado (con documento) y detalle diario completo.
                  </div>
                </>
              );
            })()}

            <div style={{display:"flex",gap:10}}>
              <button
                onClick={descargarInforme}
                style={{flex:1,background:"linear-gradient(135deg,#1D6F42,#21A366)",border:"none",borderRadius:10,padding:"12px",fontSize:13,color:"white",cursor:"pointer",fontWeight:700}}>
                📥 Descargar Informe HTML
              </button>
              <button
                onClick={() => setShowReporte(false)}
                style={{background:"#f5f5f5",border:"1px solid #ddd",borderRadius:10,padding:"12px 18px",fontSize:13,color:"#555",cursor:"pointer",fontWeight:600}}>
                ✕ Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{background:"rgba(78,205,196,0.07)",border:"1px solid rgba(78,205,196,0.2)",borderRadius:12,padding:"10px 12px",marginBottom:10}}>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            style={{...inp, flex:1}}
          />
          <CustomSelect
            value={meta.turno || "Día"}
            onChange={e => setMetaField("turno", e.target.value)}
            style={{...inp, width:100, flexShrink:0}}>
            {["Día","Noche","Ambos"].map(t => <option key={t} style={{background:"#1a1a2e"}}>{t}</option>)}
          </CustomSelect>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <div style={{flex:1}}>
            <div style={{fontSize:9,color:"rgba(78,205,196,0.75)",marginBottom:3,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>
              📦 Contenedor del día
            </div>
            <input
              placeholder="Nº contenedor general"
              value={meta.contenedorDia || ""}
              onChange={e => setMetaField("contenedorDia", e.target.value)}
              style={{...inpSm, width:"100%", boxSizing:"border-box"}}
            />
          </div>
          <div style={{flex:2}}>
            <div style={{fontSize:9,color:"rgba(78,205,196,0.75)",marginBottom:3,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>
              📝 Observación general del día
            </div>
            <input
              placeholder="Novedad general del día..."
              value={meta.obsGeneral || ""}
              onChange={e => setMetaField("obsGeneral", e.target.value)}
              style={{...inpSm, width:"100%", boxSizing:"border-box"}}
            />
          </div>
        </div>
      </div>

      <div style={{display:"flex",gap:5,marginBottom:10}}>
        {ESTADOS.map(s => (
          <div key={s.key} style={{flex:1,background:`${s.color}15`,border:`1px solid ${s.color}30`,borderRadius:8,padding:"5px 3px",textAlign:"center"}}>
            <div style={{fontSize:14,fontWeight:800,color:s.color}}>{stats[s.key] || 0}</div>
            <div style={{fontSize:10}}>{s.icon}</div>
          </div>
        ))}
        <div style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:8,padding:"5px 3px",textAlign:"center"}}>
          <div style={{fontSize:14,fontWeight:800,color:"rgba(255,255,255,0.38)"}}>{sinRegistro}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.28)"}}>⬜</div>
        </div>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:8}}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Filtrar empleados o área..."
          style={{...inp, flex:1}}
        />
        <button
          onClick={() => { if (window.confirm("¿Marcar a TODOS los empleados visibles como Presente?")) marcarTodos("P"); }}
          style={{background:"rgba(0,201,167,0.15)",border:"1px solid rgba(0,201,167,0.3)",borderRadius:7,padding:"5px 8px",fontSize:10,color:"#00C9A7",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>
          ✅ Todos P
        </button>
        <button
          onClick={() => { if (window.confirm("¿Limpiar TODOS los registros de este día?")) limpiarDia(fecha); }}
          style={{background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.25)",borderRadius:7,padding:"5px 8px",fontSize:11,color:"#FF6B6B",cursor:"pointer",fontWeight:700}}>
          🗑
        </button>
      </div>

      <div style={{maxHeight:480,overflowY:"auto",marginBottom:10}}>
        {filtrados.map((emp, i) => {
          const estado    = getEstado(emp.nombre);
          const estadoObj = estado ? ESTADOS.find(s => s.key === estado) : null;
          const empReg    = getEmpReg(emp.nombre);
          const isExpand  = expandedEmp === emp.nombre;

          return (
            <div key={i} style={{
              borderRadius:12,
              marginBottom:8,
              background: estadoObj ? `${estadoObj.color}0e` : "rgba(255,255,255,0.03)",
              border: `1px solid ${estadoObj ? estadoObj.color+"45" : "rgba(255,255,255,0.08)"}`,
              overflow:"hidden",
              transition:"all 0.15s",
            }}>

              <div style={{padding:"12px 14px 10px", display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8}}>
                <div style={{minWidth:0, flex:1}}>
                  <div style={{display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:4}}>
                    <span style={{fontSize:14, color:"white", fontWeight:700, lineHeight:1.2}}>
                      {emp.nombre.split(" ").slice(0,2).join(" ")}
                    </span>
                    {emp.esTemporal && (
                      <span style={{fontSize:8, background:"rgba(255,107,107,0.18)", color:"#FF6B6B", borderRadius:5, padding:"1px 6px", fontWeight:700}}>TEMPORAL</span>
                    )}
                    {empReg.viaQr && (
                      <span style={{fontSize:8, background:"rgba(99,102,241,0.18)", color:"#a5b4fc", borderRadius:5, padding:"1px 6px", fontWeight:700}}>📷 QR {empReg.horaRegistro ? new Date(empReg.horaRegistro).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"}) : ""}</span>
                    )}
                  </div>
                  <div style={{fontSize:11, color:"rgba(255,255,255,0.48)", lineHeight:1.4}}>
                    {emp.area}
                    {emp.doc ? <span style={{color:"rgba(255,255,255,0.33)"}}> · </span> : null}
                    {emp.doc ? <span style={{color:"rgba(255,255,255,0.42)"}}>{emp.doc} {emp.num}</span> : null}
                  </div>
                </div>
                {estadoObj && (
                  <span style={{
                    fontSize:10, background:`${estadoObj.color}20`, color:estadoObj.color,
                    borderRadius:6, padding:"3px 8px", fontWeight:700, flexShrink:0,
                    border:`1px solid ${estadoObj.color}40`,
                  }}>
                    {estadoObj.icon} {estadoObj.label}
                  </span>
                )}
              </div>

              <div style={{
                display:"flex", borderTop:`1px solid rgba(255,255,255,0.06)`,
                padding:"4px 6px 6px",
              }}>
                {ESTADOS.map(s => {
                  const activo = estado === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => toggleEstado(emp.nombre, s.key)}
                      title={s.label}
                      style={{
                        flex:1,
                        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                        gap:3, padding:"8px 2px",
                        background: activo ? `${s.color}22` : "transparent",
                        border:"none",
                        borderRadius:8,
                        cursor:"pointer",
                        transition:"all 0.12s",
                        minHeight:52,
                      }}>
                      <span style={{fontSize:20, lineHeight:1}}>{s.icon}</span>
                      <span style={{
                        fontSize:9, fontWeight:700, lineHeight:1,
                        color: activo ? s.color : "rgba(255,255,255,0.25)",
                      }}>{s.label}</span>
                      {activo && <div style={{width:16, height:2, borderRadius:1, background:s.color, marginTop:1}} />}
                    </button>
                  );
                })}
                <button
                  onClick={() => setExpandedEmp(isExpand ? null : emp.nombre)}
                  title="Contenedor y observación"
                  style={{
                    flex:1,
                    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                    gap:3, padding:"8px 2px",
                    background: isExpand ? "rgba(78,205,196,0.15)" : "transparent",
                    border:"none",
                    borderRadius:8,
                    cursor:"pointer",
                    transition:"all 0.12s",
                    minHeight:52,
                  }}>
                  <span style={{fontSize:20, lineHeight:1}}>{isExpand ? "▲" : "⚙️"}</span>
                  <span style={{fontSize:9, fontWeight:700, color: isExpand ? "#4ECDC4" : "rgba(255,255,255,0.25)"}}>
                    {isExpand ? "Cerrar" : "Notas"}
                  </span>
                </button>
              </div>

              {isExpand && (
                <div style={{
                  padding:"10px 14px 12px",
                  display:"flex", flexDirection:"column", gap:10,
                  borderTop:"1px solid rgba(78,205,196,0.15)",
                  background:"rgba(78,205,196,0.04)",
                }}>
                  <div>
                    <div style={{fontSize:10, color:"rgba(78,205,196,0.8)", marginBottom:5, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5}}>
                      📦 Contenedor
                    </div>
                    <input
                      placeholder="Número de contenedor..."
                      value={empReg.contenedor || ""}
                      onChange={e => setEmpField(emp.nombre, "contenedor", e.target.value)}
                      style={{...inpSm, width:"100%", boxSizing:"border-box"}}
                    />
                  </div>
                  <div>
                    <div style={{fontSize:10, color:"rgba(255,255,255,0.58)", marginBottom:5, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5}}>
                      📝 Observación
                    </div>
                    <input
                      placeholder="Permiso, novedad, motivo..."
                      value={empReg.obs || ""}
                      onChange={e => setEmpField(emp.nombre, "obs", e.target.value)}
                      style={{...inpSm, width:"100%", boxSizing:"border-box"}}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
        {ESTADOS.map(s => (
          <div key={s.key} style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:"rgba(255,255,255,0.48)"}}>
            <span style={{color:s.color}}>{s.icon}</span>{s.label}
          </div>
        ))}
        <div style={{fontSize:10,color:"rgba(78,205,196,0.5)"}}>⚙ = contenedor y obs. individual</div>
      </div>

      <button
        onClick={() => setShowReporte(true)}
        style={{width:"100%",background:"linear-gradient(135deg,#1D6F42,#21A366)",border:"none",borderRadius:10,padding:"11px",fontSize:13,color:"white",cursor:"pointer",fontWeight:700,letterSpacing:0.3}}>
        📊 Generar Informe de Asistencia
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODO SESIÓN / PAGOS — encargado: abre/cierra el proceso, registra
// temporales, ajustes de pago y evidencia fotográfica
// ═══════════════════════════════════════════════════════════════
function SesionPanel({ asisQR, procesos, grupos, empleados, registros, guardarContenedor, agregarLiquidacion, verPrevia, showToast }) {
  const {
    sesionActiva, ajustes, abrirSesion, cerrarSesion, registrarTemporal,
    asignarPersona, quitarAsignado, subirFoto, agregarAjuste, eliminarAjuste, calcularPago,
  } = asisQR;

  const [contenedorSel, setContenedorSel] = useState("");
  const [turnoSel, setTurnoSel]           = useState("Día");
  const [valorBaseInput, setValorBaseInput] = useState("180000");
  const [mostrarNuevo, setMostrarNuevo]   = useState(false);
  const [numNuevo, setNumNuevo]           = useState("");
  const [fechaNuevo, setFechaNuevo]       = useState(hoyISO());

  const [asignarNum, setAsignarNum] = useState("");
  const [nombreTemp, setNombreTemp] = useState("");
  const [docTemp,    setDocTemp]    = useState("");

  const [ajusteConcepto, setAjusteConcepto] = useState("");
  const [ajusteMonto,    setAjusteMonto]    = useState("");
  const [ajusteEmpNum,   setAjusteEmpNum]   = useState("");

  const [metodoPago, setMetodoPago] = useState("Nequi");
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const inp = { background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, padding:"8px 10px", color:"white", fontSize:12, fontFamily:"inherit", outline:"none", width:"100%", boxSizing:"border-box" };
  const lbl = { fontSize:10, color:"rgba(255,255,255,0.55)", marginBottom:4, fontWeight:700, textTransform:"uppercase", letterSpacing:0.4 };
  const card = { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:14, marginBottom:12 };

  const crearContenedorRapido = async () => {
    if (!numNuevo.trim()) { showToast("Escribe el número de contenedor", false); return; }
    const fecha = fechaNuevo || hoyISO();
    const ok = await guardarContenedor({
      fecha, numContenedor: numNuevo.trim(), turno: turnoSel,
      estado: "En proceso", proveedor:"", producto:"", cajasSalida:"",
      operadores:"", transporte:"", placa:"", trailer:"", obs:"",
      grupoDia:"", grupoNoche:"", booking:"", naviera:"", vessel:"", destino:"",
      logisticaBookingId: null, trazabilidad: [],
    }, null);
    if (!ok) { showToast("No se pudo crear el contenedor", false); return; }
    const { data } = await supabase.from("contenedores").select("id")
      .eq("num_contenedor", numNuevo.trim()).eq("fecha", fecha)
      .order("id", { ascending: false }).limit(1).maybeSingle();
    if (data?.id) {
      setContenedorSel(String(data.id));
      setMostrarNuevo(false);
      setNumNuevo("");
      showToast("Contenedor creado");
    }
  };

  const onAbrirSesion = async () => {
    if (!contenedorSel) { showToast("Selecciona o crea un contenedor primero", false); return; }
    const r = await abrirSesion({ contenedorId: Number(contenedorSel), turno: turnoSel, valorBase: Number(valorBaseInput) || 180000 });
    if (!r.ok) showToast(r.msg || "No se pudo abrir la sesión", false);
    else showToast("Proceso iniciado — ya puedes asignar personas");
  };

  const onCerrarSesion = async () => {
    if (!window.confirm("¿Cerrar este proceso y ver el informe final? El personal temporal que participó quedará inactivo (su QR deja de servir) y podrás reactivarlo luego desde Personal si vuelve a trabajar con ustedes.")) return;
    const html = await buildInformeProceso({
      contenedor: contenedorActivo, sesionActiva, horaCierre: new Date().toISOString(),
      asignados: sesionActiva.asignados, miembrosActivos, pago, nombreDe, docDe,
    });
    verPrevia(html, `Informe_Contenedor_${contenedorActivo?.numContenedor || sesionActiva.contenedorId}.html`);
    const r = await cerrarSesion();
    if (r.ok) showToast("Proceso cerrado");
  };

  const onAsignar = async () => {
    if (!asignarNum) { showToast("Busca y selecciona una persona", false); return; }
    await asignarPersona(asignarNum);
    setAsignarNum("");
  };

  const onRegistroRapido = async () => {
    const r = await registrarTemporal({ nombre: nombreTemp, num: docTemp, doc: "CC Nacional" });
    if (!r.ok) { showToast(r.msg || "No se pudo registrar", false); return; }
    await asignarPersona(docTemp.trim());
    showToast(`${r.nombre} registrado`);
    const html = await buildTirillaEmpleado({ nombre: r.nombre, num: docTemp.trim(), tipo: "TEMP", contenedor: contenedorActivo?.numContenedor, fecha: sesionActiva?.fecha });
    verPrevia(html, `QR_${r.nombre.replace(/\s+/g,"_")}.html`);
    setNombreTemp(""); setDocTemp("");
  };

  const onGenerarQR = async (emp) => {
    const html = await buildTirillaEmpleado({ nombre: emp.nombre, num: emp.num, tipo: emp.esTemporal ? "TEMP" : "FIJO", contenedor: contenedorActivo?.numContenedor, fecha: sesionActiva?.fecha });
    verPrevia(html, `QR_${emp.nombre.replace(/\s+/g,"_")}.html`);
  };

  const onCompartirWhatsApp = async (emp) => {
    const r = await compartirQR({ emp, tipo: emp.esTemporal ? "TEMP" : "FIJO", contenedor: contenedorActivo?.numContenedor, fecha: sesionActiva?.fecha });
    if (!r.ok) showToast(r.msg, false);
  };

  const onFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoFoto(true);
    try {
      const dataUrl = await comprimirImagen(file);
      await subirFoto(dataUrl);
    } finally {
      setSubiendoFoto(false);
      e.target.value = "";
    }
  };

  const onAgregarAjuste = async () => {
    if (!ajusteConcepto.trim() || !ajusteMonto) { showToast("Falta el concepto o el monto", false); return; }
    const ok = await agregarAjuste({
      contenedorId: sesionActiva.contenedorId,
      empNum: ajusteEmpNum || null,
      concepto: ajusteConcepto.trim(),
      monto: Number(ajusteMonto),
    });
    if (ok) { setAjusteConcepto(""); setAjusteMonto(""); setAjusteEmpNum(""); }
  };

  const contenedorActivo = sesionActiva ? procesos.find(p => p.id === sesionActiva.contenedorId) : null;
  const grupoActivo       = sesionActiva ? grupos.find(g => g.id === sesionActiva.grupoTrabajoId) : null;
  const miembrosActivos   = grupoActivo?.miembros || [];
  const personasContenedor = sesionActiva ? Array.from(new Set([...sesionActiva.asignados, ...miembrosActivos])) : [];
  const pago = sesionActiva ? calcularPago(sesionActiva.contenedorId) : null;
  const fecha = hoyISO();

  const nombreDe = (num) => empleados.find(e => e.num === num)?.nombre || num;
  const docDe    = (num) => empleados.find(e => e.num === num)?.num || num;

  const generarLiquidacionesContenedor = async () => {
    if (!pago || !pago.detalle.length) { showToast("No hay personal registrado para liquidar", false); return; }
    if (!window.confirm(`¿Generar ${pago.detalle.length} liquidación(es) por un total de ${fmtCOP(pago.detalle.reduce((s,d)=>s+d.total,0))}?`)) return;
    let i = 0;
    for (const d of pago.detalle) {
      const emp = empleados.find(e => e.num === d.num);
      if (!emp) { i++; continue; }
      await agregarLiquidacion({
        id: Date.now() + i, empNum: emp.num, nombre: emp.nombre, area: emp.area,
        periodo: fecha, salBase: 0, devengado: d.total, totalDeduc: 0, neto: d.total,
        ausencias: 0, fecha, tipo: "contenedor", contenedores: 1, metodoPago, html: "",
      });
      i++;
    }
    showToast(`${pago.detalle.length} liquidaciones generadas`);
  };

  return (
    <div>
      {!sesionActiva ? (
        <div style={card}>
          <div style={{ fontSize:13, fontWeight:800, color:"#a5b4fc", marginBottom:4 }}>📦 Iniciar proceso</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", marginBottom:10 }}>Elige o crea el contenedor de hoy. Después de iniciar podrás asignar personas y ahí mismo generar y enviar el QR de cada una.</div>

          {!mostrarNuevo ? (
            <>
              <div style={lbl}>Contenedor</div>
              <CustomSelect value={contenedorSel} onChange={e => setContenedorSel(e.target.value)} style={{ ...inp, marginBottom:8 }}>
                <option value="" style={{background:"#1a1a2e"}}>Selecciona un contenedor...</option>
                {procesos.slice(0, 60).map(p => (
                  <option key={p.id} value={p.id} style={{background:"#1a1a2e"}}>
                    {p.numContenedor || `#${p.id}`} — {p.fecha} — {p.estado}
                  </option>
                ))}
              </CustomSelect>
              <button onClick={() => setMostrarNuevo(true)} style={{ ...btnSecundario, marginBottom:12 }}>+ Nuevo contenedor de hoy</button>
            </>
          ) : (
            <div style={{ marginBottom:12 }}>
              <div style={lbl}>Número de contenedor</div>
              <input value={numNuevo} onChange={e => setNumNuevo(e.target.value)} placeholder="Ej. TCLU1234567" style={{ ...inp, marginBottom:8 }} />
              <div style={lbl}>Fecha</div>
              <input type="date" value={fechaNuevo} onChange={e => setFechaNuevo(e.target.value)} style={{ ...inp, marginBottom:8 }} />
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={crearContenedorRapido} style={btnPrimario(false,false)}>Crear</button>
                <button onClick={() => setMostrarNuevo(false)} style={btnSecundario}>Cancelar</button>
              </div>
            </div>
          )}

          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <div style={{ flex:1 }}>
              <div style={lbl}>Turno</div>
              <CustomSelect value={turnoSel} onChange={e => setTurnoSel(e.target.value)} style={inp}>
                {["Día","Noche"].map(t => <option key={t} style={{background:"#1a1a2e"}}>{t}</option>)}
              </CustomSelect>
            </div>
            <div style={{ flex:1 }}>
              <div style={lbl}>Valor base del contenedor</div>
              <input type="number" value={valorBaseInput} onChange={e => setValorBaseInput(e.target.value)} style={inp} />
            </div>
          </div>

          <button onClick={onAbrirSesion} style={{ ...btnPrimario(false,false), width:"100%", padding:"11px", fontSize:13 }}>▶ Iniciar sesión de escaneo</button>
        </div>
      ) : (
        <>
          <div style={{ ...card, border:"1px solid rgba(0,201,167,0.35)", background:"rgba(0,201,167,0.06)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, flexWrap:"wrap", gap:6 }}>
              <div style={{ fontSize:14, fontWeight:800, color:"#00C9A7" }}>🟢 Proceso abierto — {contenedorActivo?.numContenedor || `#${sesionActiva.contenedorId}`} · {sesionActiva.turno}</div>
              <button onClick={onCerrarSesion} style={{ ...btnTablaEliminar, padding:"6px 12px", fontSize:11 }}>🏁 Cerrar y ver informe</button>
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>Valor base: {fmtCOP(sesionActiva.valorBase)} · Abierta por {sesionActiva.abiertaPor || "—"}</div>
          </div>

          <div style={card}>
            <div style={{ fontSize:13, fontWeight:800, color:"#a5b4fc", marginBottom:4 }}>1️⃣ Asignar personas y generar su QR</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", marginBottom:10 }}>Primero agrégalos aquí abajo (buscando o registrando uno nuevo) — cada persona que agregues aparece en la lista con sus propios botones para generar su QR y enviárselo por WhatsApp.</div>

            <div style={{ display:"flex", gap:8, marginBottom:10 }}>
              <SearchableSelect value={asignarNum} onChange={e => setAsignarNum(e.target.value)} placeholder="Escribe el nombre..." style={{ ...inp, flex:1 }}>
                <option value="">Buscar personal fijo...</option>
                {empleados.filter(e => !e.esTemporal && !personasContenedor.includes(e.num)).map(e => <option key={e.num} value={e.num}>{e.nombre}</option>)}
              </SearchableSelect>
              <button onClick={onAsignar} style={btnSecundario}>+ Agregar</button>
            </div>

            <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
              <input value={nombreTemp} onChange={e => setNombreTemp(e.target.value)} placeholder="Nombre (persona nueva)" style={{ ...inp, flex:2, minWidth:140 }} />
              <input value={docTemp} onChange={e => setDocTemp(e.target.value)} placeholder="Documento" style={{ ...inp, flex:1, minWidth:100 }} />
              <button onClick={onRegistroRapido} style={btnPrimario(false,false)}>➕ Registrar nuevo</button>
            </div>

            {personasContenedor.length === 0 ? (
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", textAlign:"center", padding:"14px 10px", background:"rgba(255,255,255,0.03)", borderRadius:8 }}>
                👆 Agrega a alguien arriba — ahí mismo te van a aparecer los botones para generar y enviar su QR.
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:320, overflowY:"auto" }}>
                {personasContenedor.map(num => {
                  const emp = empleados.find(e => e.num === num);
                  const asistio = miembrosActivos.includes(num);
                  const reg = registros[fecha]?.[nombreDe(num)] || {};
                  return (
                    <div key={num} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8, fontSize:12, color:"white", background:"rgba(255,255,255,0.04)", borderRadius:8, padding:"10px" }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontWeight:700 }}>{nombreDe(num)}</div>
                        <div style={{ fontSize:10, color: asistio ? "#00C9A7" : "rgba(255,255,255,0.4)", fontWeight:700 }}>
                          {asistio ? `✔ Asistió ${reg.horaRegistro ? new Date(reg.horaRegistro).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"}) : ""}` : "⏳ Asignado, falta escanear"}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:6, flexShrink:0, flexWrap:"wrap" }}>
                        {emp && <button onClick={() => onGenerarQR(emp)} style={{ ...btnPrimario(false,false), padding:"6px 10px", fontSize:11, whiteSpace:"nowrap" }}>📇 Generar QR</button>}
                        {emp && <button onClick={() => onCompartirWhatsApp(emp)} style={{ background:"rgba(37,211,102,0.15)", border:"1px solid rgba(37,211,102,0.4)", borderRadius:8, color:"#4ade80", padding:"6px 10px", fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>💬 WhatsApp</button>}
                        {!asistio && <button onClick={() => quitarAsignado(num)} title="Quitar de la lista" style={{ ...btnTablaEliminar, padding:"6px 9px" }}>✕</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={card}>
            <div style={{ fontSize:13, fontWeight:800, color:"#a5b4fc", marginBottom:10 }}>2️⃣ Foto de evidencia</div>
            <input type="file" accept="image/*" capture="environment" onChange={onFoto} disabled={subiendoFoto} style={{ fontSize:11, color:"rgba(255,255,255,0.6)", marginBottom:10 }} />
            {sesionActiva.fotos.length > 0 && (
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {sesionActiva.fotos.map((f, i) => (
                  <img key={i} src={f} alt={`Evidencia ${i+1}`} style={{ width:70, height:70, objectFit:"cover", borderRadius:8, border:"1px solid rgba(255,255,255,0.15)" }} />
                ))}
              </div>
            )}
          </div>

          <div style={card}>
            <div style={{ fontSize:13, fontWeight:800, color:"#a5b4fc", marginBottom:10 }}>3️⃣ Ajustes de pago — {contenedorActivo?.numContenedor}</div>
            <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" }}>
              <CustomSelect value={ajusteEmpNum} onChange={e => setAjusteEmpNum(e.target.value)} style={{ ...inp, flex:1, minWidth:140 }}>
                <option value="" style={{background:"#1a1a2e"}}>General del contenedor (se reparte)</option>
                {miembrosActivos.map(num => <option key={num} value={num} style={{background:"#1a1a2e"}}>{nombreDe(num)}</option>)}
              </CustomSelect>
              <input value={ajusteConcepto} onChange={e => setAjusteConcepto(e.target.value)} placeholder="Concepto (ej. bono, descuento)" style={{ ...inp, flex:1, minWidth:140 }} />
              <input type="number" value={ajusteMonto} onChange={e => setAjusteMonto(e.target.value)} placeholder="Monto (+/-)" style={{ ...inp, width:120 }} />
            </div>
            <button onClick={onAgregarAjuste} style={btnSecundario}>+ Agregar ajuste</button>

            {ajustes.length > 0 && (
              <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:5 }}>
                {ajustes.map(a => (
                  <div key={a.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:11, background:"rgba(255,255,255,0.04)", borderRadius:7, padding:"6px 10px" }}>
                    <span style={{ color:"white" }}>{a.concepto} <span style={{ color:"rgba(255,255,255,0.4)" }}>({a.empNum ? nombreDe(a.empNum) : "General"})</span></span>
                    <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ color: a.monto >= 0 ? "#00C9A7" : "#FF6B6B", fontWeight:700 }}>{a.monto >= 0 ? "+" : ""}{fmtCOP(a.monto)}</span>
                      <button onClick={() => eliminarAjuste(a.id)} style={{ ...btnTablaEliminar, padding:"2px 7px" }}>✕</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {pago && (
            <div style={card}>
              <div style={{ fontSize:13, fontWeight:800, color:"#a5b4fc", marginBottom:10 }}>💰 Resumen de pago</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginBottom:10 }}>
                Base {fmtCOP(pago.valorBase)} {pago.ajustesContenedor !== 0 && <>({pago.ajustesContenedor >= 0 ? "+" : ""}{fmtCOP(pago.ajustesContenedor)} ajustes)</>} ÷ {pago.miembros.length || 1} persona(s) = {fmtCOP(pago.porPersonaBase)} c/u
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:12 }}>
                {pago.detalle.map(d => (
                  <div key={d.num} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"white" }}>
                    <span>{nombreDe(d.num)}</span>
                    <span style={{ fontWeight:700 }}>{fmtCOP(d.total)}</span>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, fontWeight:800, color:"#00C9A7", borderTop:"1px solid rgba(255,255,255,0.1)", paddingTop:8, marginBottom:12 }}>
                <span>Total contenedor</span>
                <span>{fmtCOP(pago.detalle.reduce((s,d)=>s+d.total,0))}</span>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <CustomSelect value={metodoPago} onChange={e => setMetodoPago(e.target.value)} style={{ ...inp, flex:1 }}>
                  {["Nequi","Bancolombia","Efectivo"].map(m => <option key={m} style={{background:"#1a1a2e"}}>{m}</option>)}
                </CustomSelect>
                <button onClick={generarLiquidacionesContenedor} style={{ ...btnPrimario(false,false), whiteSpace:"nowrap" }}>💾 Generar liquidaciones</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODO ESCANEAR — pantalla de kiosco con cámara siempre activa
// ═══════════════════════════════════════════════════════════════
function EscanearPanel({ asisQR, procesos }) {
  const { sesionActiva, registrarEscaneo } = asisQR;
  const [camActiva, setCamActiva] = useState(false);
  const [camError,  setCamError]  = useState("");
  const [feedback,  setFeedback]  = useState(null);

  const html5QrRef      = useRef(null);
  const procesandoRef   = useRef(false);
  const registrarRef    = useRef(registrarEscaneo);
  useEffect(() => { registrarRef.current = registrarEscaneo; }, [registrarEscaneo]);
  const READER_ID = "qr-reader-asistencia";

  const onScan = async (decodedText) => {
    if (procesandoRef.current) return;
    const linea  = (decodedText || "").split("\n")[0].trim();
    const partes = linea.split("|");
    if (partes[0] !== QR_ASIS_PREFIX || partes.length < 3) return;
    procesandoRef.current = true;
    playBeep();
    const r = await registrarRef.current(partes[2]);
    setFeedback(r.ok
      ? { ok:true, nombre:r.nombre, msg: r.yaEstaba ? "ya estaba registrado" : "registrado" }
      : { ok:false, msg:r.msg });
    setTimeout(() => { setFeedback(null); procesandoRef.current = false; }, 1600);
  };

  const iniciarCamara = async () => {
    setCamError("");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const inst = new Html5Qrcode(READER_ID);
      html5QrRef.current = inst;
      await inst.start({ facingMode: "environment" }, { fps: 10, qrbox: 260 }, onScan, () => {});
      setCamActiva(true);
    } catch (err) {
      setCamError(mensajeErrorCamara(err));
    }
  };

  const detenerCamara = async () => {
    try { await html5QrRef.current?.stop(); html5QrRef.current?.clear(); } catch {}
    html5QrRef.current = null;
    setCamActiva(false);
  };

  useEffect(() => () => { html5QrRef.current?.stop().then(() => html5QrRef.current?.clear()).catch(() => {}); }, []);

  if (!sesionActiva) {
    return (
      <div style={{ textAlign:"center", padding:"40px 20px", background:"rgba(255,255,255,0.04)", borderRadius:14 }}>
        <div style={{ fontSize:36, marginBottom:10 }}>⏸️</div>
        <div style={{ fontSize:14, fontWeight:700, color:"white", marginBottom:6 }}>No hay proceso abierto</div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)" }}>Pide al encargado que inicie la sesión en la pestaña "Sesión / Pagos".</div>
      </div>
    );
  }

  const contenedor = procesos.find(p => p.id === sesionActiva.contenedorId);

  return (
    <div style={{ textAlign:"center" }}>
      <div style={{ fontSize:13, fontWeight:800, color:"#00C9A7", marginBottom:12 }}>
        📦 {contenedor?.numContenedor || `#${sesionActiva.contenedorId}`} · {sesionActiva.turno}
      </div>

      {!camActiva ? (
        <button onClick={iniciarCamara} style={{ ...btnPrimario(false,false), padding:"14px 24px", fontSize:14, marginBottom:12 }}>📷 Activar cámara</button>
      ) : (
        <button onClick={detenerCamara} style={{ ...btnSecundario, marginBottom:12 }}>Detener cámara</button>
      )}

      {camError && <div style={{ fontSize:12, color:"#FF6B6B", marginBottom:12, padding:"0 10px" }}>{camError}</div>}

      <div id={READER_ID} style={{ width:"100%", maxWidth:420, margin:"0 auto", borderRadius:14, overflow:"hidden" }} />

      {feedback && (
        <div style={{
          marginTop:16, padding:"18px 14px", borderRadius:14, fontSize:16, fontWeight:800,
          background: feedback.ok ? "rgba(0,201,167,0.15)" : "rgba(255,107,107,0.15)",
          border: `1px solid ${feedback.ok ? "rgba(0,201,167,0.4)" : "rgba(255,107,107,0.4)"}`,
          color: feedback.ok ? "#00C9A7" : "#FF6B6B",
        }}>
          {feedback.ok ? `✅ ${feedback.nombre}` : `❌ ${feedback.msg}`}
          {feedback.ok && <div style={{ fontSize:11, fontWeight:600, marginTop:4, opacity:0.8 }}>{feedback.msg}</div>}
        </div>
      )}
    </div>
  );
}
