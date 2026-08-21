import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import CustomSelect from "./CustomSelect.jsx";
import { usePackingList } from "../hooks/usePackingList.js";
import { useConfiguracion } from "../hooks/useConfiguracion.js";
import {
  generarInformePlantaHtml, generarInformeCargueHtml,
  CALIBRES, COL_CAL, CHECKLIST_CALIDAD_CARGUE, CHEQUEO_TOTAL_ITEMS,
} from "../reportes/informesProceso.js";

const DESTINOS = ["Philadelphia", "Miami, FL", "San Juan"];

const PREDIOS = [
  { registro:"430003503", nombre:"La Esperanza",  dir:"Vereda Palogordo", ciudad:"Chocoita", dpto:"Santander" },
  { registro:"650002801", nombre:"El Molino",      dir:"Vereda Chocoita",  ciudad:"Chocoita", dpto:"Santander" },
  { registro:"580004907", nombre:"La Esmeralda",   dir:"Vereda Chocoita",  ciudad:"Chocoita", dpto:"Santander" },
  { registro:"980005905", nombre:"Las Brisas",     dir:"Vereda Palogordo", ciudad:"Chocoita", dpto:"Santander" },
  { registro:"590004304", nombre:"La Ponderosa",   dir:"Vereda Chocoita",  ciudad:"Chocoita", dpto:"Santander" },
  { registro:"350001906", nombre:"Los Charcos",    dir:"Vereda Chocoita",  ciudad:"Chocoita", dpto:"Santander" },
  { registro:"15000896",  nombre:"Los Almendros",  dir:"Vereda Peñas",     ciudad:"Chocoita", dpto:"Santander" },
  { registro:"55000592",  nombre:"Villa Isabel",   dir:"Vereda Chocoita",  ciudad:"Chocoita", dpto:"Santander" },
  { registro:"25000843",  nombre:"San Nicolás",    dir:"Vereda El Pilón",  ciudad:"Zapatoca", dpto:"Santander" },
  { registro:"180003708", nombre:"Vista Hermosa",  dir:"Vereda Palogordo", ciudad:"Chocoita", dpto:"Santander" },
  { registro:"790004802", nombre:"La Arenosa",     dir:"Vereda Chocoita",  ciudad:"Chocoita", dpto:"Santander" },
];
const PESO_STR = "16.2 KG";

// Fallback neutro para pallets sin calibre asignado todavía (no debe
// verse como si tuvieran un calibre real preseleccionado).
const COL_CAL_VACIO = { bg:"#94a3b8", light:"rgba(148,163,184,0.12)", border:"rgba(148,163,184,0.35)" };

// ── Guardado por paso — cada paso solo escribe sus propios campos de
// admin_data, así dos personas en pasos distintos del mismo contenedor
// no se borran el trabajo entre sí. ──
const PASO1_ADMIN_KEYS = ["packingDate", "checklistPlanta", "checklistCalidad", "checklistResponsable", "checklistCargo", "checklistObs", "icaGeneral"];
const PASO2_ADMIN_KEYS = ["empresaTransporte", "placa", "conductor", "cedulaConductor", "supervisorCargue", "horaCargue", "horaSalida", "fechaCargue", "termoregistroCamion", "termoregistroCamionPalletNo", "precintoCamion", "tempLlegadaCamion", "tempSalidaCamion", "icaCamion", "firmaConductor", "firmaSupervisor"];
const PASO3_ADMIN_KEYS = ["consecutivo", "plNo", "container", "vessel", "finalStamps", "destino", "fechaCargue", "palletCerts", "tempRecorder", "tempRecorderPalletNo", "ispm15", "port", "puertoManual", "moviad", "temperatura", "growerETA", "growerBL", "growerContainer", "growerAssignments"];

function pick(obj, keys) {
  const out = {};
  keys.forEach(k => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

function initPallets(total) {
  const cpp = Math.floor(total / 20);
  return Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    calibres: [{ size: "", cajas: cpp, predio: "", ica: "", plu: false }],
    listo: false,
  }));
}
// El camión/contenedor arranca vacío — el operario lo va llenando
// pallet por pallet, en vez de partir de un orden por defecto a corregir.
function initLayout() {
  return { left: Array(10).fill(null), right: Array(10).fill(null) };
}
function fmtDate(d) {
  if (!d) return "";
  const [y, mo, dd] = d.split("-");
  return `${mo}-${dd}-${y}`;
}

// Logo de Tierra Prometida embebido como base64 — así los informes HTML
// descargados muestran el logo aunque se abran después, sin servidor.
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

// Firma escaneada del representante legal, para la Carta de Responsabilidad.
async function cargarFirmaBase64() {
  try {
    const res  = await fetch("/firma-abuchaibe.jpeg");
    const blob = await res.blob();
    return await new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  } catch { return ""; }
}

// Texto que va dentro del QR — solo el identificador técnico
// ("TPQR|<id del packing list en Supabase>|<n° de pallet>") que usa la
// pantalla "Pallet Verification" para buscar el pallet real y en vivo (el
// mismo prefijo se usa en PalletVerificationTab.jsx para parsearlo, deben
// mantenerse sincronizados).
//
// Antes el QR llevaba además todo el resumen legible del pallet, pero eso
// lo volvía un QR versión 11 (61x61 módulos) — a 28mm de impresión cada
// módulo medía <0.5mm y el celular no lo leía de forma confiable. Con solo
// el identificador queda en versión 2 (25x25), mucho más grande y rápido
// de escanear; la info completa igual se ve al escanear, porque
// Verificación la trae en vivo desde Supabase.
export const QR_PALLET_PREFIX = "TPQR";
function textoQrPallet(plId, palletId) {
  return `${QR_PALLET_PREFIX}|${plId}|${palletId}`;
}

// Tirilla imprimible de un pallet (paso 1) — formato angosto tipo térmica
// (100x50mm), con toda la info del pallet excepto observación e ICA, más
// el QR de verificación con esos mismos datos. `plId` es el id ya guardado
// del packing list en Supabase — sin él el QR no se podría buscar después.
async function buildTirillaPallet(p, admin, plId) {
  const logoSrc   = await cargarLogoBase64();
  const sumaCajas = p.calibres.reduce((s, c) => s + Number(c.cajas || 0), 0);
  const pesoCaja  = parseFloat(PESO_STR) || 0;
  const pesoTotal = pesoCaja * sumaCajas;
  const qrTexto   = textoQrPallet(plId, p.id);
  const qrDataUrl = await QRCode.toDataURL(qrTexto, { errorCorrectionLevel: "M", margin: 1, width: 260 });

  const filasCalibres = p.calibres.map(c => `
    <div class="cal-row">
      <span class="cal-num">${c.plu ? `${c.size}PLU` : (c.size || "—")}</span>
      <span class="cal-cajas">${Number(c.cajas || 0).toLocaleString("es-CO")}</span>
    </div>`).join("");

  // Formato horizontal 100x50mm (tirilla térmica tipo shipping label) — dos
  // columnas: datos del pallet a la izquierda, QR grande a la derecha, todo
  // en unidades mm para que imprima al tamaño físico exacto. Sin contenedor
  // (queda solo en el QR/Verificación) para dejar más espacio a letras grandes.
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Tirilla Pallet ${p.id}</title>
<style>
  *{box-sizing:border-box}
  @page{size:100mm 50mm;margin:0}
  html,body{margin:0;padding:0}
  body{font-family:Arial,sans-serif;color:#111;width:100mm;height:50mm}
  .box{width:100mm;height:50mm;padding:1.8mm;display:flex;gap:2.5mm;overflow:hidden}
  .left{flex:1;min-width:0;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:0.5mm solid #111;padding-bottom:0.4mm;margin-bottom:0.7mm}
  .brand{display:flex;align-items:center;gap:1.3mm;min-width:0}
  .brand img{width:6.5mm;height:6.5mm;object-fit:contain;flex-shrink:0}
  .brand .nom{font-size:3mm;font-weight:800;line-height:1.15}
  .brand .sub{font-size:2.2mm;color:#555;font-weight:600}
  .pallet-no{text-align:right;flex-shrink:0}
  .pallet-no .lbl{font-size:2.2mm;color:#555;font-weight:800;letter-spacing:0.3mm}
  .pallet-no .num{font-size:10.5mm;font-weight:900;line-height:0.85}
  .pallet-no .fecha-mini{font-size:2mm;color:#777;font-weight:700;margin-top:0.3mm}
  .cal-title{display:flex;justify-content:space-between;font-size:2.6mm;font-weight:800;letter-spacing:0.3mm;color:#555;text-transform:uppercase;border-bottom:0.4mm solid #111;padding-bottom:0.4mm;margin-bottom:0.4mm}
  .cal-row{display:flex;justify-content:space-between;align-items:baseline;padding:0.4mm 0;border-bottom:0.25mm solid #ddd}
  .cal-row .cal-num{font-size:4.6mm;font-weight:900}
  .cal-row .cal-cajas{font-size:3.6mm;font-weight:700;color:#333}
  .cal-row.total{border-top:0.5mm solid #111;border-bottom:none;margin-top:0.2mm;padding-top:0.5mm}
  .cal-row.total .cal-num,.cal-row.total .cal-cajas{font-size:4mm;font-weight:900;color:#111}
  .bottom-row{margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:2mm}
  .peso{font-size:2.5mm;font-weight:700;color:#333}
  .estado{text-align:center;padding:0.8mm 2.2mm;border-radius:1.5mm;font-size:2.6mm;font-weight:800;white-space:nowrap}
  .estado.ok{background:#dcfce7;color:#166534}
  .estado.pend{background:#fef3c7;color:#92400e}
  .right{width:30mm;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1mm}
  .right img{width:28mm;height:28mm}
  .qr-lbl{font-size:1.9mm;color:#777;text-align:center;line-height:1.2;font-weight:600}
  @media print{ body{padding:0} }
</style></head>
<body>
  <div class="box">
    <div class="left">
      <div class="top">
        <div class="brand">
          ${logoSrc ? `<img src="${logoSrc}"/>` : ""}
          <div>
            <div class="nom">TIERRA PROMETIDA</div>
            <div class="sub">Limón Tahití · Cat 1</div>
          </div>
        </div>
        <div class="pallet-no">
          <div class="lbl">PALLET</div>
          <div class="num">${p.id}</div>
          <div class="fecha-mini">${fmtDate(admin.packingDate) || "—"}</div>
        </div>
      </div>

      <div class="cal-title"><span>Calibre</span><span>Cajas</span></div>
      <div class="cal-list">
        ${filasCalibres}
        <div class="cal-row total"><span class="cal-num">TOTAL</span><span class="cal-cajas">${sumaCajas.toLocaleString("es-CO")}</span></div>
      </div>

      <div class="bottom-row">
        <div class="peso">${PESO_STR}/cj · ${pesoTotal.toFixed(1)} KG</div>
        <div class="estado ${p.listo ? "ok" : "pend"}">${p.listo ? "✓ LISTO" : "⚠ PENDIENTE"}</div>
      </div>
    </div>

    <div class="right">
      <img src="${qrDataUrl}" alt="QR pallet ${p.id}" />
      <div class="qr-lbl">Escanear para verificar</div>
    </div>
  </div>
</body></html>`;
}

// Firma dibujada a mano (dedo o mouse) sobre un <canvas> — se usa para la
// firma del conductor y la del supervisor, cada una con su propio campo
// en `admin` (ej. "firmaConductor" / "firmaSupervisor").
function useFirmaPad(sa, campo) {
  const canvasRef      = useRef(null);
  const drawingRef     = useRef(false);
  const tieneTrazoRef  = useRef(false);

  const setCanvasRef = (el) => {
    if (el && !el.dataset.init) {
      const ctx = el.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, el.width, el.height);
      el.dataset.init = "1";
    }
    canvasRef.current = el;
  };

  const pos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const iniciar = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    drawingRef.current = true;
    const { x, y } = pos(e, canvas);
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const mover = (e) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const { x, y } = pos(e, canvas);
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
    tieneTrazoRef.current = true;
  };

  const soltar = () => { drawingRef.current = false; };

  const limpiar = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    tieneTrazoRef.current = false;
  };

  const guardar = () => {
    const canvas = canvasRef.current;
    if (!canvas || !tieneTrazoRef.current) return;
    sa(campo, canvas.toDataURL("image/png"));
  };

  const eliminar = () => {
    sa(campo, "");
    tieneTrazoRef.current = false;
  };

  return { setCanvasRef, iniciar, mover, soltar, limpiar, guardar, eliminar };
}

// Pre-fill admin desde datos del contenedor
function adminDesdeContenedor(cont) {
  if (!cont) return {};
  return {
    container:         cont.numContenedor || "",
    vessel:            cont.vessel        || "",
    empresaTransporte: cont.transporte    || "",
    placa:             cont.placa         || "",
    trailer:           cont.trailer       || "",
    destino:           DESTINOS.includes(cont.destino) ? cont.destino : "Philadelphia",
    fechaCargue:       cont.fecha         || new Date().toISOString().split("T")[0],
    packingDate:       cont.fecha         || new Date().toISOString().split("T")[0],
    supervisorCargue:  cont.operadores    || "",
  };
}


export default function PackingListTab({ mob, contenedor, onClose }) {
  const [isMobLocal, setIsMobLocal] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 680
  );
  useEffect(() => {
    const h = () => setIsMobLocal(window.innerWidth < 680);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  const m = mob || isMobLocal;

  const hoy = new Date().toISOString().split("T")[0];
  const { cargarPorContenedor, guardar, actualizarFase } = usePackingList();
  const { config: cfgSeguridad } = useConfiguracion();
  const claveRequerida = cfgSeguridad?.cfg_claves_acceso?.paso1_packing || "";
  const [paso1Ok,       setPaso1Ok]       = useState(false);
  const [claveInput,    setClaveInput]    = useState("");
  const [claveError,    setClaveError]    = useState("");

  // ── Vista previa de informes (Planta / Cargue / Tirilla de pallet) ──
  const [previewInforme, setPreviewInforme] = useState(null); // { url, filename }
  useEffect(() => () => { if (previewInforme?.url) URL.revokeObjectURL(previewInforme.url); }, [previewInforme]);
  const previewInformeIframeRef = useRef(null);

  // ── Carta de Responsabilidad ─────────────────────────────────────
  const [cartaResp, setCartaResp] = useState(null); // null = cerrada; objeto = formulario abierto

  // ── Estilos ───────────────────────────────────────────────────
  const inp = {
    background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)",
    borderRadius:8, padding: m ? "10px 11px" : "7px 10px", color:"white",
    fontSize: m ? 16 : 12, fontFamily:"inherit", width:"100%",
    boxSizing:"border-box", minHeight: m ? 44 : 32,
  };
  const lbl = {
    fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.45)",
    marginBottom:4, fontWeight:600, letterSpacing:0.3,
  };
  const cardS = {
    background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
    borderRadius:10, padding: m ? 14 : 10,
  };
  // Deja solo dígitos, un signo "-" al inicio y un punto decimal — así el
  // campo de temperatura siempre guarda un número limpio y el "°C" se
  // muestra aparte (no se escribe junto al número).
  const soloNumeroTemp = (v) => {
    let s = String(v).replace(/[^0-9.-]/g, "").replace(/(?!^)-/g, "");
    const partes = s.split(".");
    return partes.length > 2 ? `${partes[0]}.${partes.slice(1).join("")}` : s;
  };
  const campoTemperatura = (label, value, onChange, placeholder) => (
    <div>
      <div style={lbl}>{label}</div>
      <div style={{ position:"relative" }}>
        <input
          value={value}
          onChange={e => onChange(soloNumeroTemp(e.target.value))}
          inputMode="decimal"
          placeholder={placeholder}
          style={{ ...inp, paddingRight:34 }}
        />
        <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", fontSize: m ? 13 : 11, color:"rgba(255,255,255,0.42)", fontWeight:700, pointerEvents:"none" }}>°C</span>
      </div>
    </div>
  );

  // ── Persistencia ─────────────────────────────────────────────
  const [plId,       setPlId]       = useState(null);
  const [guardando,  setGuardando]  = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [cargando,   setCargando]   = useState(true);
  // Espejo síncrono de plId — setPlId() no se refleja de inmediato en este
  // closure tras un await (React agrupa el re-render), y la tirilla necesita
  // el id recién guardado apenas termina guardarPaso1(), no en el próximo render.
  const plIdRef = useRef(null);

  // ── Fases ─────────────────────────────────────────────────────
  const [fase, setFase] = useState(1);

  // ── Fase 1 ────────────────────────────────────────────────────
  const [totalCajas, setTotalCajas] = useState(1400);
  const [cajasInput, setCajasInput] = useState("1400");
  const [pallets,    setPallets]    = useState(() => initPallets(1400));
  const [selPid,     setSelPid]     = useState(null);

  // ── Fase 2 ────────────────────────────────────────────────────
  const [layoutCamion,  setLayoutCamion]  = useState(initLayout);

  // ── Fase 3 ────────────────────────────────────────────────────
  const [layout,  setLayout]  = useState(initLayout);

  // ── Ubicar pallets: toca uno (de la bandeja o ya puesto) para
  // "armarlo", luego toca la casilla donde va — funciona igual con
  // mouse o con el dedo, sin depender de arrastrar ni de mantener
  // presionado. Se resetea al cambiar de paso.
  const [armadoPid, setArmadoPid] = useState(null);
  useEffect(() => { setArmadoPid(null); }, [fase]);

  // ── Admin ─────────────────────────────────────────────────────
  const adminInicial = {
    plNo:"", consecutivo:"", fechaCargue:hoy, container:"", destino:"Philadelphia",
    vessel:"", palletCerts:[{ ica:"", palletNo:"" }],
    tempRecorder:"", tempRecorderPalletNo:"", finalStamps:"",
    packingDate:hoy, empresaTransporte:"", placa:"", trailer:"",
    conductor:"", cedulaConductor:"", firmaConductor:"", horaCargue:"", horaSalida:"", supervisorCargue:"", firmaSupervisor:"",
    // ── Paso 2 — Camión: termoregistro, precinto, temperaturas y pallet(s) con ICA ──
    termoregistroCamion:"", termoregistroCamionPalletNo:"", precintoCamion:"", tempLlegadaCamion:"", tempSalidaCamion:"",
    icaCamion:[{ ica:"", palletNo:"" }],
    growerAssignments:{}, growerETA:"", growerBL:"", growerContainer:"",
    ispm15:"CO-68-009 HT",
    // ── Formato ID Pallet — campos sin fuente en otro paso ──
    port:"", puertoManual:"", moviad:"", temperatura:"",
    // ── Checklist Control de Calidad y Cargue (Paso 1 — Packing Planta) ──
    checklistPlanta:"", checklistCalidad:{}, checklistResponsable:"", checklistCargo:"", checklistObs:"",
    // ICA general de Paso 1: aplica a todos los pallets salvo que un pallet
    // tenga su propio Registro ICA (ver "Registro ICA" por calibre, que lo pisa).
    icaGeneral:"",
    ...adminDesdeContenedor(contenedor),
  };
  const [admin, setAdmin] = useState(adminInicial);
  const sa = (k, v) => setAdmin(a => ({ ...a, [k]: v }));
  const setPalletCert    = (i, f, v) =>
    setAdmin(a => ({ ...a, palletCerts: a.palletCerts.map((c, ci) => ci !== i ? c : { ...c, [f]: v }) }));
  const addPalletCert    = ()  =>
    setAdmin(a => ({ ...a, palletCerts: [...a.palletCerts, { ica:"", palletNo:"" }] }));
  const removePalletCert = (i) =>
    setAdmin(a => ({ ...a, palletCerts: a.palletCerts.filter((_, ci) => ci !== i) }));
  const setIcaCamion    = (i, f, v) =>
    setAdmin(a => ({ ...a, icaCamion: a.icaCamion.map((c, ci) => ci !== i ? c : { ...c, [f]: v }) }));
  const addIcaCamion    = ()  =>
    setAdmin(a => ({ ...a, icaCamion: [...a.icaCamion, { ica:"", palletNo:"" }] }));
  const removeIcaCamion = (i) =>
    setAdmin(a => ({ ...a, icaCamion: a.icaCamion.filter((_, ci) => ci !== i) }));

  // ── Firmas (conductor / supervisor) — canvas dibujado a mano ──
  const firmaConductorPad  = useFirmaPad(sa, "firmaConductor");
  const firmaSupervisorPad = useFirmaPad(sa, "firmaSupervisor");

  const renderFirmaPad = (valor, pad, quien) => (
    <div style={{ ...cardS, marginBottom: m ? 14 : 12 }}>
      <div style={{ fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.4)", marginBottom: m ? 10 : 8, fontWeight:700 }}>✍️ FIRMA {quien.toUpperCase()}</div>
      {valor ? (
        <div>
          <img src={valor} alt={`Firma ${quien}`} style={{ width:"100%", maxWidth:400, height:140, objectFit:"contain", background:"#fff", borderRadius:8, border:"1px solid rgba(255,255,255,0.15)", display:"block" }} />
          <button onClick={pad.eliminar} style={{ marginTop:8, background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding: m ? "10px 14px" : "7px 12px", color:"#fca5a5", cursor:"pointer", fontSize: m ? 12 : 11, fontWeight:600, fontFamily:"inherit" }}>
            🗑 Eliminar firma
          </button>
        </div>
      ) : (
        <div>
          <canvas
            ref={pad.setCanvasRef}
            width={500} height={180}
            style={{ width:"100%", maxWidth:500, height:140, background:"#fff", borderRadius:8, border:"1px solid rgba(255,255,255,0.15)", touchAction:"none", cursor:"crosshair", display:"block" }}
            onMouseDown={pad.iniciar} onMouseMove={pad.mover} onMouseUp={pad.soltar} onMouseLeave={pad.soltar}
            onTouchStart={pad.iniciar} onTouchMove={pad.mover} onTouchEnd={pad.soltar}
          />
          <div style={{ fontSize: m ? 10 : 9, color:"rgba(255,255,255,0.3)", marginTop:4 }}>Firma aquí con el dedo (o el mouse)</div>
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            <button onClick={pad.limpiar} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, padding: m ? "10px 14px" : "7px 12px", color:"rgba(255,255,255,0.7)", cursor:"pointer", fontSize: m ? 12 : 11, fontWeight:600, fontFamily:"inherit" }}>
              🧹 Limpiar
            </button>
            <button onClick={pad.guardar} style={{ background:"rgba(0,201,167,0.15)", border:"1px solid rgba(0,201,167,0.4)", borderRadius:8, padding: m ? "10px 14px" : "7px 12px", color:"#00C9A7", cursor:"pointer", fontSize: m ? 12 : 11, fontWeight:700, fontFamily:"inherit" }}>
              ✓ Guardar firma
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Toca de nuevo el mismo valor para desmarcar (vuelve a "sin revisar").
  const setChequeo = (key, val) => setAdmin(a => ({
    ...a,
    checklistCalidad: { ...(a.checklistCalidad || {}), [key]: a.checklistCalidad?.[key] === val ? null : val },
  }));

  // ── Cargar PL existente al montar ────────────────────────────
  useEffect(() => {
    if (!contenedor?.id) { setCargando(false); return; }
    cargarPorContenedor(contenedor.id).then(({ data }) => {
      if (data) {
        setPlId(data.id);
        plIdRef.current = data.id;
        setFase(data.fase || 1);
        setTotalCajas(data.total_cajas || 1400);
        setCajasInput(data.cajas_input || String(data.total_cajas || 1400));
        if (data.pallets?.length) setPallets(data.pallets);
        if (data.layout_camion?.left?.length) setLayoutCamion(data.layout_camion);
        if (data.layout_cont?.left?.length)   setLayout(data.layout_cont);
        if (data.admin_data)
          // Si el Packing List se guardó antes de que existiera el precargado
          // automático del vessel, admin_data.vessel puede venir vacío — en
          // ese caso no debe pisar el valor real que ya está en el contenedor.
          setAdmin(prev => ({ ...prev, ...data.admin_data, vessel: data.admin_data.vessel || contenedor.vessel || prev.vessel }));
      }
      setCargando(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenedor?.id]);

  // ── Guardar progreso por paso ──────────────────────────────────
  // Cada paso sube SOLO sus propios campos (pallets en Paso 1, layout_camion
  // en Paso 2, layout_cont en Paso 3), y el fragmento de admin_data que le
  // corresponde — leyendo primero el registro más reciente para no pisar
  // lo que otra persona ya haya guardado en un paso distinto mientras
  // trabajaban al mismo tiempo. La fase nunca retrocede: si alguien ya
  // avanzó más lejos, guardar un paso anterior no lo hace retroceder.
  const [infoActualizada, setInfoActualizada] = useState(false);

  const guardarParcial = async ({ faseFinal, adminKeys, extra }) => {
    if (!contenedor?.id) return false;
    setGuardando(true);
    const { data: fresh, error: errorFresh } = await cargarPorContenedor(contenedor.id);
    if (errorFresh && plId) {
      // No se pudo leer el registro más reciente antes de guardar — mejor
      // no arriesgarse a pisar con admin_data vacío lo que otro paso ya
      // tenga guardado. Se reintenta con el próximo guardado.
      setGuardando(false);
      return false;
    }
    const row = {
      id:            plId || fresh?.id || Date.now(),
      contenedor_id: contenedor.id,
      fase:          Math.max(fresh?.fase || 1, faseFinal),
      admin_data:    { ...(fresh?.admin_data || {}), ...pick(admin, adminKeys) },
      ...extra,
    };
    const { data, error } = await guardar(row);
    if (!error && data?.id) { setPlId(data.id); plIdRef.current = data.id; }
    setGuardando(false);
    if (!error) {
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2500);
    }
    return !error;
  };

  const guardarPaso1 = (avanzar) => guardarParcial({
    faseFinal: avanzar ? 2 : fase,
    adminKeys: PASO1_ADMIN_KEYS,
    extra: { total_cajas: totalCajas, cajas_input: cajasInput, pallets },
  });

  const guardarPaso2 = (avanzar) => guardarParcial({
    faseFinal: avanzar ? 3 : 2,
    adminKeys: PASO2_ADMIN_KEYS,
    extra: { layout_camion: layoutCamion },
  });

  // "← Volver" es una acción explícita: el usuario decide retroceder de
  // paso, así que a diferencia de guardarParcial esto sí debe bajar la
  // fase guardada. Si no se persiste, al reabrir el Packing List (p.ej.
  // porque se apagó el celular) vuelve a saltar al paso más avanzado que
  // se haya alcanzado alguna vez, aunque el usuario ya lo haya dejado
  // atrás a propósito para corregir algo.
  const volverAPaso = async (nuevaFase) => {
    setFase(nuevaFase);
    if (!plIdRef.current) return;
    const { error } = await actualizarFase(plIdRef.current, nuevaFase);
    if (error) alert("No se pudo guardar que volviste a un paso anterior. Si se cierra la app antes de reintentar, puede volver a aparecer en el paso más avanzado.");
  };

  // Guarda el acomodo del camión tal cual está (no lo toca) y además trae
  // de la base de datos los calibres/cantidad de cajas más recientes que
  // se hayan guardado en Paso 1, refrescando el contenido de cada pallet
  // sin mover su posición dentro del camión.
  const guardarYActualizarPaso2 = async () => {
    const ok = await guardarPaso2(false);
    if (ok) {
      const { data: fresh } = await cargarPorContenedor(contenedor.id);
      if (fresh?.pallets?.length) setPallets(fresh.pallets);
      if (fresh?.total_cajas) {
        setTotalCajas(fresh.total_cajas);
        setCajasInput(fresh.cajas_input || String(fresh.total_cajas));
      }
      setInfoActualizada(true);
      setTimeout(() => setInfoActualizada(false), 3000);
    }
  };

  const guardarPaso3 = () => guardarParcial({
    faseFinal: 3,
    adminKeys: PASO3_ADMIN_KEYS,
    extra: { layout_cont: layout },
  });

  const cpp = Math.floor(totalCajas / 20);

  const changeTotalCajas = (v) => {
    const n = Number(v);
    if (!n || n <= 0) return;
    setTotalCajas(n);
    setCajasInput(String(n));
    // Solo se redistribuye parejo (20 pallets vacíos, sin calibre) si
    // nadie ha tocado todavía ningún pallet. En cuanto se edita un calibre,
    // se mezcla, o se asigna predio/ICA, cambiar el total NO debe borrar
    // ese trabajo — se deja el reparto tal cual y el indicador de cuadre
    // ("Faltan/Sobran X cajas") guía el ajuste manual de la diferencia.
    const sinTocar = pallets.every(p =>
      p.calibres.length === 1 && !p.calibres[0].size &&
      !p.calibres[0].predio && !p.calibres[0].ica && !p.calibres[0].plu
    );
    if (sinTocar) setPallets(initPallets(n));
    setSelPid(null);
  };

  const setPF = (pi, ci, field, val) =>
    setPallets(prev => prev.map((p, i) => i !== pi ? p : {
      ...p, calibres: p.calibres.map((c, j) => j !== ci ? c : { ...c, [field]: val }),
    }));
  // "listo" es del pallet completo (lo marca el supervisor al terminar de
  // revisarlo en Paso 1), no de un calibre puntual — por eso va aparte de setPF.
  const setPalletField = (pi, field, val) =>
    setPallets(prev => prev.map((p, i) => i !== pi ? p : { ...p, [field]: val }));
  // El selector de Calibre/Size incluye "230PLU" como opción aparte de "230" —
  // internamente sigue siendo size:230, solo cambia la bandera plu, para que
  // toda la lógica que hace Number(size) en otros lugares no se rompa.
  const setCalOpcion = (pi, ci, opcion) => {
    const plu  = opcion === "230PLU";
    const size = plu ? 230 : (opcion === "" ? "" : Number(opcion));
    setPallets(prev => prev.map((p, i) => i !== pi ? p : {
      ...p, calibres: p.calibres.map((c, j) => j !== ci ? c : { ...c, size, plu }),
    }));
  };
  const addCal = (pi) =>
    setPallets(prev => prev.map((p, i) => i !== pi ? p : {
      ...p, calibres: [...p.calibres, { size:"", cajas:0, predio:"", ica:"", plu:false }],
    }));
  const removeCal = (pi, ci) =>
    setPallets(prev => prev.map((p, i) => (i !== pi || p.calibres.length <= 1) ? p : {
      ...p, calibres: p.calibres.filter((_, j) => j !== ci),
    }));

  const palletSum  = (p)   => p.calibres.reduce((s, c) => s + Number(c.cajas || 0), 0);
  const palletById = (pid) => pallets.find(p => p.id === pid);
  const selPalletIdx = selPid !== null ? pallets.findIndex(p => p.id === selPid) : -1;

  // ── Tirilla de pallet (Paso 1) — imprime info del pallet + QR de verificación ──
  const [generandoTirilla, setGenerandoTirilla] = useState(false);
  const imprimirTirillaPallet = async (p) => {
    setGenerandoTirilla(true);
    try {
      // El QR necesita el id real del packing list en Supabase para que
      // "Pallet Verification" pueda buscarlo después — se guarda lo que haya
      // en pantalla (igual que el botón "Guardar" de este paso) antes de
      // generar la tirilla, así lo impreso coincide con lo que quedó guardado.
      await guardarPaso1(false);
      if (!plIdRef.current) {
        alert("No se pudo guardar el packing list antes de generar la tirilla. Intenta de nuevo.");
        return;
      }
      const html = await buildTirillaPallet(p, admin, plIdRef.current);
      const url  = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      setPreviewInforme({ url, filename: `Tirilla-Pallet-${p.id}-${admin.container || contenedor?.numContenedor || "packing"}.html` });
    } finally {
      setGenerandoTirilla(false);
    }
  };

  // Coloca/mueve un pallet a una casilla (col, idx). Si esa casilla ya
  // tenía otro pallet, ese pallet queda desplazado — si el que se mueve
  // venía de una posición, el desplazado toma su lugar (intercambio); si
  // venía de la bandeja de pendientes, el desplazado vuelve a la bandeja.
  const makeMover = (setFn) => (pid, col, idx) =>
    setFn(prev => {
      const next = { left:[...prev.left], right:[...prev.right] };
      const li = next.left.indexOf(pid), ri = next.right.indexOf(pid);
      const fromCol = li >= 0 ? "left" : (ri >= 0 ? "right" : null);
      const fromIdx = li >= 0 ? li : ri;
      if (fromCol === col && fromIdx === idx) return prev;
      const desplazado = next[col][idx];
      next[col][idx] = pid;
      if (fromCol !== null) next[fromCol][fromIdx] = desplazado ?? null;
      return next;
    });
  const moverCamion    = makeMover(setLayoutCamion);
  const moverContainer = makeMover(setLayout);

  // Quita un pallet ya ubicado y lo devuelve a la bandeja de pendientes.
  const makeQuitar = (setFn) => (pid) =>
    setFn(prev => {
      const next = { left:[...prev.left], right:[...prev.right] };
      const li = next.left.indexOf(pid);  if (li >= 0) next.left[li]  = null;
      const ri = next.right.indexOf(pid); if (ri >= 0) next.right[ri] = null;
      return next;
    });
  const quitarCamion    = makeQuitar(setLayoutCamion);
  const quitarContainer = makeQuitar(setLayout);

  // Quita todos los pallets ya ubicados de un solo golpe — todos vuelven a la bandeja.
  const makeQuitarTodos = (setFn) => () => setFn({ left: Array(10).fill(null), right: Array(10).fill(null) });
  const quitarTodosCamion    = makeQuitarTodos(setLayoutCamion);
  const quitarTodosContainer = makeQuitarTodos(setLayout);

  const resumen = CALIBRES.map(size => ({
    size,
    cajas: pallets.reduce((s, p) =>
      s + p.calibres.filter(c => Number(c.size) === size)
                    .reduce((ss, c) => ss + Number(c.cajas || 0), 0), 0),
  }));
  const totalConf  = pallets.reduce((s, p) => s + palletSum(p), 0);
  const todoCuadra = totalConf === totalCajas;

  // ── Tarjeta de pallet (layout) ───────────────────────────────
  // Toca un pallet (de la bandeja de pendientes o ya ubicado) para
  // "armarlo", y luego toca la casilla destino — reemplaza al arrastre,
  // que no era confiable en tablet.
  // permitirArrastre habilita arrastre nativo con mouse (drag & drop) además
  // del "tocar para armar y luego tocar destino" — solo se usa en Paso 3
  // (Contenedor); Paso 2 (Camión) queda igual que antes, solo con toque.
  // mostrarListo pinta el badge "LISTO" — solo se activa en Paso 2 (Camión),
  // para que el operario vea qué pallets ya aprobó el supervisor en Paso 1.
  const renderPalletCard = (pid, idx, col, moverFn, permitirArrastre = false, mostrarListo = false) => {
    const soltar = (e) => {
      if (!permitirArrastre) return;
      e.preventDefault();
      const draggedPid = Number(e.dataTransfer.getData("text/plain"));
      if (draggedPid) { moverFn(draggedPid, col, idx); setArmadoPid(null); }
    };
    const sobreVolar = (e) => { if (permitirArrastre) e.preventDefault(); };

    if (pid === null) {
      const puedeColocar = armadoPid !== null;
      return (
        <div
          key={`${col}-${idx}-vacio`}
          onClick={() => { if (armadoPid !== null) { moverFn(armadoPid, col, idx); setArmadoPid(null); } }}
          onDragOver={sobreVolar}
          onDrop={soltar}
          style={{
            background: puedeColocar ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.02)",
            border: `1.5px dashed ${puedeColocar ? "#22C55E" : "rgba(255,255,255,0.15)"}`,
            borderRadius: m ? 8 : 6, padding: m ? "8px 7px" : "5px 6px",
            cursor: puedeColocar ? "pointer" : "default",
            minHeight: m ? 64 : 54, display:"flex", alignItems:"center", justifyContent:"center",
            transition:"all 0.12s", WebkitTapHighlightColor:"transparent",
          }}
        >
          <span style={{ fontSize: m ? 10 : 9, color: puedeColocar ? "#22C55E" : "rgba(255,255,255,0.25)", fontWeight:700 }}>
            {puedeColocar ? "+ Colocar" : "Vacío"}
          </span>
        </div>
      );
    }
    const p = palletById(pid); if (!p) return null;
    const isMixed  = p.calibres.length > 1;
    const mainCal  = COL_CAL[p.calibres[0].size] || COL_CAL_VACIO;
    const isArmado = armadoPid === pid;
    const sum = palletSum(p);
    const ok  = sum === cpp;
    let bg = "rgba(255,255,255,0.05)";
    let border = `1px solid ${mainCal.border}`;
    if (isMixed) {
      bg = `linear-gradient(135deg,${p.calibres.map((c, i) => `${COL_CAL[c.size]?.bg||"#888"}${i===0?"55":"33"}`).join(",")})`;
      border = "1px solid rgba(255,255,255,0.25)";
    }
    if (isArmado) { bg = "rgba(99,102,241,0.2)"; border = "2px solid #6366F1"; }
    const marcadoListo = mostrarListo && !!p.listo;
    return (
      <div
        key={pid}
        draggable={permitirArrastre}
        onDragStart={e => {
          if (!permitirArrastre) return;
          e.dataTransfer.setData("text/plain", String(pid));
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={sobreVolar}
        onDrop={soltar}
        onClick={() => {
          if (armadoPid === pid) setArmadoPid(null);
          else if (armadoPid !== null) { moverFn(armadoPid, col, idx); setArmadoPid(null); }
          else setArmadoPid(pid);
        }}
        style={{
          background:bg, border, borderRadius: m ? 8 : 6, padding: m ? "8px 7px" : "5px 6px",
          cursor: permitirArrastre ? "grab" : "pointer", position:"relative",
          transition:"all 0.12s",
          minHeight: m ? 64 : 54, display:"flex", flexDirection:"column", justifyContent:"space-between",
          transform: isArmado ? "scale(1.04)" : "none",
          boxShadow: isArmado ? "0 0 0 3px rgba(99,102,241,0.3)" : (marcadoListo ? "0 0 0 2px rgba(0,201,167,0.55)" : "none"),
          WebkitTapHighlightColor:"transparent", userSelect:"none",
        }}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize: m ? 12 : 11, fontWeight:800, color:"rgba(255,255,255,0.55)" }}>P{pid}</span>
          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
            {!ok && <span style={{ fontSize: m ? 9 : 8, color:"#F9A826" }}>⚠</span>}
            {marcadoListo && (
              <span style={{ fontSize: m ? 8 : 7, fontWeight:800, color:"#00C9A7", background:"rgba(0,201,167,0.18)", border:"1px solid rgba(0,201,167,0.5)", borderRadius:4, padding:"1px 4px", letterSpacing:0.3, lineHeight:1.4 }}>LISTO</span>
            )}
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
          {p.calibres.map((c, ci) => (
            <div key={ci} style={{ display:"flex", alignItems:"center", gap:3 }}>
              <span style={{ fontSize: m ? 13 : 10, fontWeight:700, color:COL_CAL[c.size]?.bg||"#fff", lineHeight:1 }}>{c.plu ? `${c.size}PLU` : c.size}</span>
              <span style={{ fontSize: m ? 11 : 10, color:"rgba(255,255,255,0.5)", lineHeight:1 }}>{c.cajas}cj</span>
            </div>
          ))}
        </div>
        {p.calibres[0].predio && (
          <div style={{ fontSize: m ? 8 : 7, color:"rgba(255,255,255,0.3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {p.calibres[0].predio}
          </div>
        )}
      </div>
    );
  };

  // ── Grid visual del vehículo ─────────────────────────────────
  const renderVehicleGrid = (currentLayout, moverFn, quitarFn, quitarTodosFn, vehicleIcon, vehicleLabel, hint, permitirArrastre = false, mostrarListo = false) => {
    const ubicados      = [...currentLayout.left, ...currentLayout.right].filter(pid => pid !== null);
    const pendientes    = pallets.filter(p => !ubicados.includes(p.id));
    const armadoEnGrid  = armadoPid !== null && ubicados.includes(armadoPid);
    const armadoEnTray  = armadoPid !== null && pendientes.some(p => p.id === armadoPid);
    return (
    <div style={{ background:"rgba(0,0,0,0.3)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding: m ? 12 : 14, marginBottom: m ? 14 : 12 }}>
      <div style={{ display:"flex", flexWrap:"wrap", gap: m ? 8 : 6, marginBottom: m ? 12 : 10, alignItems:"center" }}>
        {resumen.filter(r => r.cajas > 0).map(r => (
          <div key={r.size} style={{ background:COL_CAL[r.size].light, border:`1px solid ${COL_CAL[r.size].border}`, borderRadius:6, padding: m ? "5px 11px" : "3px 9px", fontSize: m ? 14 : 12, fontWeight:700, display:"flex", gap:5, alignItems:"center" }}>
            <span style={{ color:COL_CAL[r.size].bg }}>{r.size}</span>
            <span style={{ color:"rgba(255,255,255,0.6)" }}>{r.cajas.toLocaleString("es-CO")}</span>
          </div>
        ))}
        <div style={{ marginLeft:"auto", fontSize: m ? 16 : 13, fontWeight:700, color: todoCuadra ? "#00C9A7" : "#F9A826" }}>
          {todoCuadra ? `✓ ${totalCajas.toLocaleString("es-CO")}` : `⚠ ${totalConf}/${totalCajas}`}
        </div>
      </div>

      {/* ── Bandeja de pallets sin ubicar ── */}
      <div
        onDragOver={e => { if (permitirArrastre) e.preventDefault(); }}
        onDrop={e => {
          if (!permitirArrastre) return;
          e.preventDefault();
          const draggedPid = Number(e.dataTransfer.getData("text/plain"));
          if (draggedPid) { quitarFn(draggedPid); setArmadoPid(null); }
        }}
        style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding: m ? 10 : 8, marginBottom:10 }}
      >
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:8 }}>
          <div style={{ fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.4)", fontWeight:700 }}>
            📥 Pallets sin ubicar ({pendientes.length}/{pallets.length})
          </div>
          {ubicados.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm(`¿Quitar los ${ubicados.length} pallets ya ubicados y devolverlos todos a la bandeja?`)) {
                  quitarTodosFn();
                  setArmadoPid(null);
                }
              }}
              style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:6, padding: m ? "6px 10px" : "4px 8px", color:"#fca5a5", cursor:"pointer", fontSize: m ? 11 : 10, fontWeight:700, fontFamily:"inherit", flexShrink:0 }}
            >
              🗑️ Quitar todos
            </button>
          )}
        </div>
        {pendientes.length === 0 ? (
          <div style={{ fontSize: m ? 12 : 11, color:"#00C9A7", fontWeight:700 }}>✅ Todos los pallets están ubicados</div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: m ? 8 : 6 }}>
            {pendientes.map(p => {
              const isMixed  = p.calibres.length > 1;
              const mainCal  = COL_CAL[p.calibres[0].size] || COL_CAL_VACIO;
              const isArmado = armadoPid === p.id;
              const sum = palletSum(p);
              const ok  = sum === cpp;
              let bg = "rgba(255,255,255,0.05)";
              let border = `1px solid ${mainCal.border}`;
              if (isMixed) {
                bg = `linear-gradient(135deg,${p.calibres.map((c, i) => `${COL_CAL[c.size]?.bg||"#888"}${i===0?"55":"33"}`).join(",")})`;
                border = "1px solid rgba(255,255,255,0.25)";
              }
              if (isArmado) { bg = "rgba(99,102,241,0.2)"; border = "2px solid #6366F1"; }
              const marcadoListo = mostrarListo && !!p.listo;
              return (
                <button
                  key={p.id}
                  draggable={permitirArrastre}
                  onDragStart={e => {
                    if (!permitirArrastre) return;
                    e.dataTransfer.setData("text/plain", String(p.id));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => setArmadoPid(prev => prev === p.id ? null : p.id)}
                  style={{
                    background:bg, border, borderRadius: m ? 8 : 6, padding: m ? "8px 7px" : "5px 6px",
                    cursor: permitirArrastre ? "grab" : "pointer", position:"relative", textAlign:"left", fontFamily:"inherit",
                    transition:"all 0.12s",
                    minHeight: m ? 64 : 54, display:"flex", flexDirection:"column", justifyContent:"space-between",
                    transform: isArmado ? "scale(1.04)" : "none",
                    boxShadow: isArmado ? "0 0 0 3px rgba(99,102,241,0.3)" : (marcadoListo ? "0 0 0 2px rgba(0,201,167,0.55)" : "none"),
                    WebkitTapHighlightColor:"transparent",
                  }}
                >
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize: m ? 12 : 11, fontWeight:800, color:"rgba(255,255,255,0.55)" }}>P{p.id}</span>
                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                      {!ok && <span style={{ fontSize: m ? 9 : 8, color:"#F9A826" }}>⚠</span>}
                      {ok  && <span style={{ fontSize: m ? 9 : 8, color:"#00C9A7" }}>✓</span>}
                      {marcadoListo && (
                        <span style={{ fontSize: m ? 8 : 7, fontWeight:800, color:"#00C9A7", background:"rgba(0,201,167,0.18)", border:"1px solid rgba(0,201,167,0.5)", borderRadius:4, padding:"1px 4px", letterSpacing:0.3, lineHeight:1.4 }}>LISTO</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                    {p.calibres.map((c, ci) => (
                      <div key={ci} style={{ display:"flex", alignItems:"center", gap:3 }}>
                        <span style={{ fontSize: m ? 13 : 10, fontWeight:700, color:COL_CAL[c.size]?.bg||"#fff", lineHeight:1 }}>{c.plu ? `${c.size}PLU` : c.size}</span>
                        <span style={{ fontSize: m ? 11 : 10, color:"rgba(255,255,255,0.5)", lineHeight:1 }}>{c.cajas}cj</span>
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {(armadoEnGrid || armadoEnTray) && (
        <div style={{ background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.35)", borderRadius:8, padding:"7px 12px", marginBottom:10, fontSize:12, color:"#a5b4fc", textAlign:"center", display:"flex", alignItems:"center", justifyContent:"center", gap:10, flexWrap:"wrap" }}>
          <span>
            👉 Pallet {armadoPid} seleccionado — toca la casilla {armadoEnGrid ? "a la que quieres moverlo" : "donde va"} (o vuelve a tocarlo para cancelar)
          </span>
          {armadoEnGrid && (
            <button onClick={() => { quitarFn(armadoPid); setArmadoPid(null); }} style={{ background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.4)", borderRadius:6, padding:"4px 10px", color:"#fca5a5", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>
              🗑 Quitar
            </button>
          )}
        </div>
      )}
      {m ? (
        <div style={{ display:"flex", flexDirection:"column", gap:0, alignItems:"stretch" }}>
          {/* ═══ CABINA (frente) ═══ */}
          <div style={{ display:"flex", alignItems:"stretch", gap:2, marginBottom:3 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:2, paddingTop:6 }}>
              {[0,1].map(i => (
                <div key={i} style={{ width:10, height:16, background:"linear-gradient(90deg,#1a1a1a,#444,#1a1a1a)", borderRadius:3, border:"1px solid #666", position:"relative" }}>
                  <div style={{ position:"absolute", inset:3, background:"#2a2a2a", borderRadius:1, border:"1px solid #505050" }} />
                </div>
              ))}
            </div>
            <div style={{ flex:1, background:"linear-gradient(180deg,#3d4a5c 0%,#2a3545 60%,#1a2230 100%)", border:"2px solid #5a7a9a", borderRadius:"12px 12px 4px 4px", overflow:"hidden", boxShadow:"0 -4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)" }}>
              <div style={{ display:"flex", alignItems:"center", padding:"7px 10px 5px", gap:5 }}>
                <div style={{ width:14, height:10, background:"linear-gradient(135deg,#fffaaa,#ffdd00)", borderRadius:"3px 6px 6px 3px", boxShadow:"0 0 8px rgba(255,230,0,0.8)", border:"1px solid #bba" }} />
                <div style={{ flex:1, height:22, background:"linear-gradient(180deg,rgba(120,200,255,0.3),rgba(80,160,230,0.12))", borderRadius:4, border:"1px solid rgba(120,200,255,0.22)", display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                  <div style={{ fontSize:16 }}>{vehicleIcon}</div>
                  <div style={{ fontSize:7, fontWeight:700, color:"rgba(255,255,255,0.3)", letterSpacing:1 }}>{vehicleLabel}</div>
                </div>
                <div style={{ width:14, height:10, background:"linear-gradient(225deg,#fffaaa,#ffdd00)", borderRadius:"6px 3px 3px 6px", boxShadow:"0 0 8px rgba(255,230,0,0.8)", border:"1px solid #bba" }} />
              </div>
              <div style={{ background:"linear-gradient(180deg,#1e2a38,#141e28)", borderTop:"1px solid #3a5a7a", padding:"3px 10px 4px", display:"flex", flexDirection:"column", gap:2 }}>
                {[0,1].map(i => (
                  <div key={i} style={{ height:2, background:"linear-gradient(90deg,transparent 5%,#3a5a7a 20%,#5a8aaa 50%,#3a5a7a 80%,transparent 95%)", borderRadius:1 }} />
                ))}
                <div style={{ display:"flex", justifyContent:"center" }}>
                  <div style={{ fontSize:7, fontWeight:800, color:"rgba(90,160,210,0.5)", letterSpacing:2 }}>TP</div>
                </div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:2, paddingTop:6 }}>
              {[0,1].map(i => (
                <div key={i} style={{ width:10, height:16, background:"linear-gradient(90deg,#1a1a1a,#444,#1a1a1a)", borderRadius:3, border:"1px solid #666", position:"relative" }}>
                  <div style={{ position:"absolute", inset:3, background:"#2a2a2a", borderRadius:1, border:"1px solid #505050" }} />
                </div>
              ))}
            </div>
          </div>
          {/* ═══ CARROCERÍA ═══ */}
          <div style={{ display:"flex", gap:0, alignItems:"stretch" }}>
            <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-around", padding:"4px 1px", background:"linear-gradient(90deg,#0d0d0d,#161616)", borderTop:"1px solid #2a3a4a", borderBottom:"1px solid #2a3a4a" }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  {[0,1].map(j => (
                    <div key={j} style={{ width:10, height:14, background:"linear-gradient(90deg,#111,#3a3a3a,#111)", borderRadius:3, border:"1px solid #555", position:"relative" }}>
                      <div style={{ position:"absolute", inset:3, background:"#252525", borderRadius:2, border:"1px solid #404040" }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ width:5, background:"linear-gradient(90deg,#1e3040,#2a4560)", borderTop:"3px solid #3a6080", borderBottom:"3px solid #3a6080" }} />
            <div style={{ flex:1, background:"linear-gradient(180deg,#0a0e14 0%,#111827 40%,#0d1520 100%)", position:"relative", overflow:"hidden", borderTop:"3px solid #3a6080", borderBottom:"3px solid #3a6080" }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ position:"absolute", top:`${(i+1)*14}%`, left:0, right:0, height:1, background:"rgba(255,255,255,0.02)", pointerEvents:"none" }} />
              ))}
              <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:5 }}>
                <div style={{ fontSize:9, fontWeight:700, color:"rgba(90,160,210,0.4)", textAlign:"center", letterSpacing:3 }}>▲ FONDO</div>
                <div style={{ display:"flex", gap:5 }}>
                  <div style={{ display:"flex", flexDirection:"column", gap:3, flex:1 }}>
                    <div style={{ fontSize:8, fontWeight:800, color:"rgba(99,179,237,0.45)", textAlign:"center", letterSpacing:2 }}>IZQ</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:5 }}>
                      {currentLayout.left.map((pid, idx) => renderPalletCard(pid, idx, "left", moverFn, permitirArrastre, mostrarListo))}
                    </div>
                  </div>
                  <div style={{ width:7, background:"linear-gradient(180deg,rgba(90,160,210,0.08),rgba(90,160,210,0.03),rgba(90,160,210,0.08))", borderRadius:3, border:"1px solid rgba(90,160,210,0.1)", flexShrink:0 }} />
                  <div style={{ display:"flex", flexDirection:"column", gap:3, flex:1 }}>
                    <div style={{ fontSize:8, fontWeight:800, color:"rgba(99,179,237,0.45)", textAlign:"center", letterSpacing:2 }}>DER</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:5 }}>
                      {currentLayout.right.map((pid, idx) => renderPalletCard(pid, idx, "right", moverFn, permitirArrastre, mostrarListo))}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize:9, fontWeight:700, color:"rgba(90,160,210,0.4)", textAlign:"center", letterSpacing:3 }}>▼ PUERTA</div>
              </div>
            </div>
            <div style={{ width:5, background:"linear-gradient(90deg,#2a4560,#1e3040)", borderTop:"3px solid #3a6080", borderBottom:"3px solid #3a6080" }} />
            <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-around", padding:"4px 1px", background:"linear-gradient(90deg,#161616,#0d0d0d)", borderTop:"1px solid #2a3a4a", borderBottom:"1px solid #2a3a4a" }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  {[0,1].map(j => (
                    <div key={j} style={{ width:10, height:14, background:"linear-gradient(90deg,#111,#3a3a3a,#111)", borderRadius:3, border:"1px solid #555", position:"relative" }}>
                      <div style={{ position:"absolute", inset:3, background:"#252525", borderRadius:2, border:"1px solid #404040" }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          {/* ═══ PUERTA TRASERA ═══ */}
          <div style={{ display:"flex", alignItems:"stretch", gap:2, marginTop:3 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:2, paddingBottom:6 }}>
              {[0,1].map(i => (
                <div key={i} style={{ width:10, height:16, background:"linear-gradient(90deg,#1a1a1a,#444,#1a1a1a)", borderRadius:3, border:"1px solid #666", position:"relative" }}>
                  <div style={{ position:"absolute", inset:3, background:"#2a2a2a", borderRadius:1, border:"1px solid #505050" }} />
                </div>
              ))}
            </div>
            <div style={{ flex:1, background:"linear-gradient(180deg,#1e2a38,#141e28)", border:"2px solid #3a5a7a", borderRadius:"4px 4px 12px 12px", overflow:"hidden", boxShadow:"0 4px 12px rgba(0,0,0,0.5)" }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ height:6, background: i%2===0 ? "linear-gradient(180deg,#243040,#1e2838)" : "linear-gradient(180deg,#1a2430,#141e28)", borderBottom:"1px solid rgba(90,140,180,0.08)" }} />
              ))}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"3px 12px" }}>
                <div style={{ width:5, height:5, background:"#3a5a7a", borderRadius:"50%", border:"1px solid #5a8aaa", boxShadow:"0 0 4px rgba(90,160,210,0.4)" }} />
                <div style={{ flex:1, height:2, background:"linear-gradient(90deg,transparent,rgba(90,140,180,0.3),transparent)", margin:"0 8px" }} />
                <div style={{ width:5, height:5, background:"#3a5a7a", borderRadius:"50%", border:"1px solid #5a8aaa", boxShadow:"0 0 4px rgba(90,160,210,0.4)" }} />
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:2, paddingBottom:6 }}>
              {[0,1].map(i => (
                <div key={i} style={{ width:10, height:16, background:"linear-gradient(90deg,#1a1a1a,#444,#1a1a1a)", borderRadius:3, border:"1px solid #666", position:"relative" }}>
                  <div style={{ position:"absolute", inset:3, background:"#2a2a2a", borderRadius:1, border:"1px solid #505050" }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:0, alignItems:"stretch" }}>
          {/* ═══ CABINA (frente) ═══ */}
          <div style={{ display:"flex", alignItems:"stretch", gap:3, marginBottom:3 }}>
            {/* Ruedas delanteras izq */}
            <div style={{ display:"flex", flexDirection:"column", gap:2, paddingTop:8 }}>
              {[0,1].map(i => (
                <div key={i} style={{ width:11, height:18, background:"linear-gradient(90deg,#1a1a1a,#444,#1a1a1a)", borderRadius:3, border:"1px solid #666", boxShadow:"inset 0 1px 2px rgba(255,255,255,0.12)", position:"relative" }}>
                  <div style={{ position:"absolute", inset:3, background:"#2a2a2a", borderRadius:1, border:"1px solid #505050" }} />
                </div>
              ))}
            </div>
            {/* Frente del camión */}
            <div style={{ flex:1, background:"linear-gradient(180deg,#3d4a5c 0%,#2a3545 60%,#1a2230 100%)", border:"2px solid #5a7a9a", borderRadius:"12px 12px 4px 4px", overflow:"hidden", boxShadow:"0 -6px 18px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)" }}>
              {/* Parabrisas + faros */}
              <div style={{ display:"flex", alignItems:"center", padding:"8px 10px 5px", gap:6 }}>
                <div style={{ width:16, height:11, background:"linear-gradient(135deg,#fffaaa,#ffdd00)", borderRadius:"4px 7px 7px 4px", boxShadow:"0 0 10px rgba(255,230,0,0.8), 0 0 20px rgba(255,230,0,0.3)", border:"1px solid #bba" }} />
                <div style={{ flex:1, height:24, background:"linear-gradient(180deg,rgba(120,200,255,0.3),rgba(80,160,230,0.12))", borderRadius:5, border:"1px solid rgba(120,200,255,0.25)", display:"flex", alignItems:"center", justifyContent:"center", gap:6, boxShadow:"inset 0 1px 4px rgba(0,0,0,0.4)" }}>
                  <div style={{ fontSize:18 }}>{vehicleIcon}</div>
                  <div style={{ fontSize:7, fontWeight:700, color:"rgba(255,255,255,0.35)", letterSpacing:1 }}>{vehicleLabel}</div>
                </div>
                <div style={{ width:16, height:11, background:"linear-gradient(225deg,#fffaaa,#ffdd00)", borderRadius:"7px 4px 4px 7px", boxShadow:"0 0 10px rgba(255,230,0,0.8), 0 0 20px rgba(255,230,0,0.3)", border:"1px solid #bba" }} />
              </div>
              {/* Parrilla */}
              <div style={{ background:"linear-gradient(180deg,#1e2a38,#141e28)", borderTop:"1px solid #3a5a7a", padding:"4px 10px 5px", display:"flex", flexDirection:"column", gap:2 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ height:2, background:"linear-gradient(90deg,transparent 5%,#3a5a7a 20%,#5a8aaa 50%,#3a5a7a 80%,transparent 95%)", borderRadius:1 }} />
                ))}
                {/* Logo / placa */}
                <div style={{ display:"flex", justifyContent:"center", marginTop:1 }}>
                  <div style={{ fontSize:7, fontWeight:800, color:"rgba(90,160,210,0.6)", letterSpacing:2 }}>TP</div>
                </div>
              </div>
            </div>
            {/* Ruedas delanteras der */}
            <div style={{ display:"flex", flexDirection:"column", gap:2, paddingTop:8 }}>
              {[0,1].map(i => (
                <div key={i} style={{ width:11, height:18, background:"linear-gradient(90deg,#1a1a1a,#444,#1a1a1a)", borderRadius:3, border:"1px solid #666", boxShadow:"inset 0 1px 2px rgba(255,255,255,0.12)", position:"relative" }}>
                  <div style={{ position:"absolute", inset:3, background:"#2a2a2a", borderRadius:1, border:"1px solid #505050" }} />
                </div>
              ))}
            </div>
          </div>

          {/* ═══ CARROCERÍA ═══ */}
          <div style={{ display:"flex", gap:0, alignItems:"stretch" }}>
            {/* Ruedas izquierda */}
            <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-around", padding:"6px 2px", gap:3, background:"linear-gradient(90deg,#0d0d0d,#161616)", borderTop:"1px solid #2a3a4a", borderBottom:"1px solid #2a3a4a" }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  {[0,1].map(j => (
                    <div key={j} style={{ width:11, height:15, background:"linear-gradient(90deg,#111,#3a3a3a,#111)", borderRadius:3, border:"1px solid #555", position:"relative", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.07)" }}>
                      <div style={{ position:"absolute", inset:3, background:"#252525", borderRadius:2, border:"1px solid #404040" }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {/* Pared lateral izq */}
            <div style={{ width:6, background:"linear-gradient(90deg,#1e3040,#2a4560)", borderTop:"3px solid #3a6080", borderBottom:"3px solid #3a6080" }} />
            {/* Interior */}
            <div style={{ flex:1, background:"linear-gradient(180deg,#0a0e14 0%,#111827 40%,#0d1520 100%)", position:"relative", overflow:"hidden", borderTop:"3px solid #3a6080", borderBottom:"3px solid #3a6080" }}>
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{ position:"absolute", top:`${(i+1)*11}%`, left:0, right:0, height:1, background:"rgba(255,255,255,0.02)", pointerEvents:"none" }} />
              ))}
              <div style={{ padding:"10px 12px", display:"flex", flexDirection:"column", gap:6 }}>
                <div style={{ fontSize:9, fontWeight:700, color:"rgba(90,160,210,0.4)", textAlign:"center", letterSpacing:3, textTransform:"uppercase" }}>▲ FONDO</div>
                <div style={{ display:"flex", gap:6 }}>
                  <div style={{ display:"flex", flexDirection:"column", gap:4, flex:1 }}>
                    <div style={{ fontSize:8, fontWeight:800, color:"rgba(99,179,237,0.45)", textAlign:"center", letterSpacing:2 }}>IZQ</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:4 }}>
                      {currentLayout.left.map((pid, idx) => renderPalletCard(pid, idx, "left", moverFn, permitirArrastre, mostrarListo))}
                    </div>
                  </div>
                  <div style={{ width:8, background:"linear-gradient(180deg,rgba(90,160,210,0.08),rgba(90,160,210,0.03),rgba(90,160,210,0.08))", borderRadius:3, border:"1px solid rgba(90,160,210,0.1)", flexShrink:0 }} />
                  <div style={{ display:"flex", flexDirection:"column", gap:4, flex:1 }}>
                    <div style={{ fontSize:8, fontWeight:800, color:"rgba(99,179,237,0.45)", textAlign:"center", letterSpacing:2 }}>DER</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:4 }}>
                      {currentLayout.right.map((pid, idx) => renderPalletCard(pid, idx, "right", moverFn, permitirArrastre, mostrarListo))}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize:9, fontWeight:700, color:"rgba(90,160,210,0.4)", textAlign:"center", letterSpacing:3, textTransform:"uppercase" }}>▼ PUERTA</div>
              </div>
            </div>
            {/* Pared lateral der */}
            <div style={{ width:6, background:"linear-gradient(90deg,#2a4560,#1e3040)", borderTop:"3px solid #3a6080", borderBottom:"3px solid #3a6080" }} />
            {/* Ruedas derecha */}
            <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-around", padding:"6px 2px", gap:3, background:"linear-gradient(90deg,#161616,#0d0d0d)", borderTop:"1px solid #2a3a4a", borderBottom:"1px solid #2a3a4a" }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  {[0,1].map(j => (
                    <div key={j} style={{ width:11, height:15, background:"linear-gradient(90deg,#111,#3a3a3a,#111)", borderRadius:3, border:"1px solid #555", position:"relative", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.07)" }}>
                      <div style={{ position:"absolute", inset:3, background:"#252525", borderRadius:2, border:"1px solid #404040" }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ═══ PUERTA TRASERA ═══ */}
          <div style={{ display:"flex", alignItems:"stretch", gap:3, marginTop:3 }}>
            {/* Ruedas traseras izq */}
            <div style={{ display:"flex", flexDirection:"column", gap:2, paddingBottom:8 }}>
              {[0,1].map(i => (
                <div key={i} style={{ width:11, height:18, background:"linear-gradient(90deg,#1a1a1a,#444,#1a1a1a)", borderRadius:3, border:"1px solid #666", position:"relative" }}>
                  <div style={{ position:"absolute", inset:3, background:"#2a2a2a", borderRadius:1, border:"1px solid #505050" }} />
                </div>
              ))}
            </div>
            {/* Panel puerta trasera */}
            <div style={{ flex:1, background:"linear-gradient(180deg,#1e2a38,#141e28)", border:"2px solid #3a5a7a", borderRadius:"4px 4px 12px 12px", overflow:"hidden", boxShadow:"0 6px 18px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(255,255,255,0.05)" }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ height:6, background: i % 2 === 0 ? "linear-gradient(180deg,#243040,#1e2838)" : "linear-gradient(180deg,#1a2430,#141e28)", borderBottom:"1px solid rgba(90,140,180,0.08)" }} />
              ))}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"3px 14px" }}>
                <div style={{ width:5, height:5, background:"#3a5a7a", borderRadius:"50%", border:"1px solid #5a8aaa", boxShadow:"0 0 4px rgba(90,160,210,0.4)" }} />
                <div style={{ flex:1, height:2, background:"linear-gradient(90deg,transparent,rgba(90,140,180,0.3),transparent)", margin:"0 8px" }} />
                <div style={{ width:5, height:5, background:"#3a5a7a", borderRadius:"50%", border:"1px solid #5a8aaa", boxShadow:"0 0 4px rgba(90,160,210,0.4)" }} />
              </div>
            </div>
            {/* Ruedas traseras der */}
            <div style={{ display:"flex", flexDirection:"column", gap:2, paddingBottom:8 }}>
              {[0,1].map(i => (
                <div key={i} style={{ width:11, height:18, background:"linear-gradient(90deg,#1a1a1a,#444,#1a1a1a)", borderRadius:3, border:"1px solid #666", position:"relative" }}>
                  <div style={{ position:"absolute", inset:3, background:"#2a2a2a", borderRadius:1, border:"1px solid #505050" }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div style={{ fontSize: m ? 11 : 8, color:"rgba(255,255,255,0.2)", textAlign:"center", marginTop: m ? 10 : 8 }}>{hint}</div>
    </div>
    );
  };

  // ── Excel / PDF ───────────────────────────────────────────────
  const [generandoExcel, setGenerandoExcel] = useState(false);
  const generarExcel = async () => {
    setGenerandoExcel(true);
    try {
      const payload = {
        plNo:              admin.plNo || admin.container || `PL-${hoy}`,
        destino:           admin.destino     || "Philadelphia",
        fechaCargue:       admin.fechaCargue || "",
        empresaTransporte: admin.empresaTransporte || "",
        placa:             admin.placa       || "",
        tempRecorder:      admin.tempRecorder || "",
        finalStamps:       admin.finalStamps  || "",
        totalCajas,
        pallets: pallets.map(p => ({
          id:       p.id,
          calibres: p.calibres.map(c => {
            const cal      = c.size ? Number(c.size) : null;
            const registro = cal ? ((admin.growerAssignments || {})[cal] || "") : "";
            const predio   = PREDIOS.find(pr => pr.registro === registro);
            return {
              size:     c.size ? Number(c.size) : "",
              cajas:    Number(c.cajas || 0),
              predio:   predio?.nombre || c.predio || "",
              registro: predio?.registro || "",
              ica:      c.ica || "",
            };
          }),
        })),
      };

      const res = await fetch("/api/packing-list", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `Packing-List-${admin.plNo || admin.container || "export"}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Error generando Packing List: " + e.message);
    } finally {
      setGenerandoExcel(false);
    }
  };

  const [generandoIdPallet, setGenerandoIdPallet] = useState(false);
  const generarIdPallet = async () => {
    setGenerandoIdPallet(true);
    try {
      const payload = {
        fechaCargue:  admin.fechaCargue  || "",
        port:         admin.port         || "",
        vessel:       admin.vessel       || "",
        destino:      admin.destino      || "",
        container:    admin.container    || "",
        temperatura:  admin.temperatura ? `${admin.temperatura}°C` : "",
        tempRecorder: admin.tempRecorder || "",
        finalStamps:  admin.finalStamps  || "",
        moviad:       admin.moviad       || "",
        puertoManual: admin.puertoManual || "",
        pallets: pallets.map(p => ({
          id:       p.id,
          calibres: p.calibres.map(c => ({ size: c.size ? Number(c.size) : "", cajas: Number(c.cajas || 0), plu: !!c.plu })),
        })),
      };

      const res = await fetch("/api/id-pallet", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(e.error || res.statusText);
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `ID-Pallet-${admin.container || "export"}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Error generando Formato ID Pallet: " + e.message);
    } finally {
      setGenerandoIdPallet(false);
    }
  };

  const [generandoGrower, setGenerandoGrower] = useState(false);
  const generarGrowerList = async () => {
    const assignments = admin.growerAssignments || {};

    // Cajas por calibre
    const cajasPerCal = {};
    pallets.forEach(p => p.calibres.forEach(c => {
      const cal = c.size ? Number(c.size) : null;
      if (cal) cajasPerCal[cal] = (cajasPerCal[cal] || 0) + Number(c.cajas || 0);
    }));

    // ETA → DD-MM-YY
    const etaFmt = (() => {
      const d = admin.growerETA || admin.fechaCargue || "";
      if (!d) return "";
      const [y, mo, dd] = d.split("-");
      return `${dd}-${mo}-${y.slice(2)}`;
    })();

    // Construir lista de predios ordenada por calibre desc
    const growers = CALIBRES.slice().reverse()
      .filter(cal => assignments[cal] && cajasPerCal[cal] > 0)
      .map(cal => {
        const predio = PREDIOS.find(p => p.registro === assignments[cal]);
        if (!predio) return null;
        return { ...predio, cajas: cajasPerCal[cal] };
      })
      .filter(Boolean);

    if (!growers.length) {
      alert("Asigna al menos un predio en la sección Grower List antes de generar.");
      return;
    }

    setGenerandoGrower(true);
    try {
      const payload = {
        importer:  "PRINCESSES KINGDOM CORP",
        eta:       etaFmt,
        exporter:  "TIERRA PROMETIDA TRADING S.A.S.",
        destino:   (admin.destino || "").toUpperCase(),
        booking:   admin.growerBL || "",
        container: admin.growerContainer || admin.container || "",
        growers,
      };

      const res = await fetch("/api/grower-list", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(e.error || res.statusText);
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `Grower-List-${admin.container || "export"}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Error generando Grower List: " + e.message);
    } finally {
      setGenerandoGrower(false);
    }
  };

  const generarPDF = async () => {
    const G  = "#1f5c1f";   // verde oscuro del molde
    const GB = "#2d7a2d";   // verde medio

    // ── Resumen de cajas por calibre (panel izquierdo) ────────────
    // Siempre muestra todos los calibres de la lista, aunque sean 0
    const sizeQty = Object.fromEntries(CALIBRES.map(c => [c, 0]));
    pallets.forEach(p => p.calibres.forEach(c => {
      const s = c.size !== "" && c.size != null ? Number(c.size) : null;
      if (s !== null) sizeQty[s] = (sizeQty[s] || 0) + Number(c.cajas || 0);
    }));
    const totalReal = Object.values(sizeQty).reduce((a, b) => a + b, 0);
    const summaryRows = Object.keys(sizeQty)
      .map(Number).sort((a, b) => b - a)
      .map(s => `<tr><td class="sc">${s}</td><td class="sq">${sizeQty[s].toLocaleString("es-CO")}</td></tr>`)
      .join("") +
    `<tr class="stot"><td>TOTAL</td><td>${totalReal.toLocaleString("es-CO")}</td></tr>`;

    // ── Distribución en contenedor (panel derecho) ─────────────────
    const pcell = (pid) => {
      const p = pallets.find(pp => pp.id === pid);
      if (!p) return { id: pid ?? "—", size: "" };
      const sz = p.calibres.length > 1
        ? p.calibres.map(c => `${c.cajas}/${c.size ?? ""}`).join("<br>")
        : `${p.calibres[0]?.size ?? ""}`;
      return { id: pid, size: sz };
    };
    const contRows = Array.from({ length: 10 }, (_, i) => {
      const pl = pcell(layout.left[i]);
      const pr = pcell(layout.right[i]);
      return `<tr>
        <td class="pc">Pallet ${pl.id}</td><td class="ps">${pl.size}</td>
        <td class="pi">${(admin.ispm15 || "CO-68-009 HT").replace(" ", "<br>")}</td><td class="pd">${fmtDate(admin.packingDate)}</td>
        <td class="sep"></td>
        <td class="pc">Pallet ${pr.id}</td><td class="ps">${pr.size}</td>
        <td class="pi">${(admin.ispm15 || "CO-68-009 HT").replace(" ", "<br>")}</td><td class="pd">${fmtDate(admin.packingDate)}</td>
      </tr>`;
    }).join("");

    // ── Pallet Certificates (todos los ICA) ──────────────────────
    const certText = admin.palletCerts
      .filter(c => c.ica)
      .map(c => `${c.ica}${c.palletNo ? ` — Pallet #${c.palletNo}` : ""}`)
      .join("<br>") || "";

    // ── Logo Tierra Prometida (PNG embebido como base64) ──────────
    const logoSrc = await cargarLogoBase64();
    const logo = logoSrc
      ? `<img src="${logoSrc}" style="width:82px;height:82px;object-fit:contain;display:block" />`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>Packing List ${admin.container || ""}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:10px;color:#111;background:#fff;padding:16px 20px}

/* ── Título + logo ── */
.title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.title-row h1{font-size:22px;font-weight:900;text-align:center;flex:1}
.title-row .logo{width:82px;flex-shrink:0;text-align:right}

/* ── Tabla de encabezado (2 filas × 8 cols) ── */
.hdr{width:100%;border-collapse:collapse;border:2px solid ${G};margin-bottom:14px}
.hdr td{border:1px solid ${G};padding:6px 10px;font-size:10.5px}
.hdr .lbl{background:${G};color:#fff;font-weight:800;white-space:nowrap;min-width:90px}
.hdr .val{font-weight:700;background:#fff;min-width:100px}

/* ── Cuerpo: dos paneles ── */
.body{display:flex;gap:10px;align-items:flex-start}

/* ── Panel izquierdo: PACKING LIST ── */
.pl-panel{width:140px;flex-shrink:0;border:2px solid ${G};border-collapse:collapse}
.pl-panel .pl-hdr td{background:${G};color:#fff;font-weight:900;font-size:11px;
  padding:8px 10px;text-align:center;letter-spacing:.5px;border-bottom:2px solid ${G}}
.pl-panel table{width:100%;border-collapse:collapse}
.pl-panel td{padding:6px 10px;font-weight:700;font-size:12px;text-align:center;
  border-bottom:1px solid #c8e6c9}
.pl-panel td.sc{text-align:center;font-size:13px}
.pl-panel td.sq{text-align:center;font-size:13px}
.pl-panel .stot td{border-top:2px solid ${G};font-size:13px;font-weight:900}

/* ── Panel derecho: CONTAINER ── */
.ct-panel{flex:1;border:2px solid ${G};border-collapse:collapse}
.ct-hdr{background:${G};color:#fff;font-weight:900;font-size:11px;
  padding:8px 12px;display:flex;align-items:center;gap:8px;letter-spacing:.5px}
.ct-hdr .arrow{flex:1;border-top:2px dashed rgba(255,255,255,0.6);margin:0 8px}
.ct-hdr .truck{font-size:18px}
.ct-table{width:100%;border-collapse:collapse}
.ct-table th{background:#f0f7f0;padding:5px 8px;font-size:9px;font-weight:700;
  border:1px solid #a5d6a7;text-align:center}
.ct-table td{padding:5px 8px;font-size:9.5px;border:1px solid #c8e6c9;text-align:center;font-weight:600}
.ct-table td.pc{font-weight:700}
.ct-table td.ps{font-weight:800}
.ct-table td.pi{font-size:8.5px;color:#444}
.ct-table td.pd{font-weight:700}
.ct-table td.sep{width:8px;background:#f5f5f5;border-top:none;border-bottom:none;padding:0}
.ct-table .door td{background:${G};color:#fff;font-weight:800;font-size:10px;
  text-align:center;padding:6px;border:1px solid ${G}}

/* ── Footer ── */
.footer{margin-top:16px;text-align:center;font-size:10px;color:#333;
  border-top:1px solid #ddd;padding-top:10px;font-weight:500}

@media print{body{padding:8px 12px}@page{size:A4 landscape;margin:6mm}}
</style>
</head><body>

<!-- TÍTULO + LOGO -->
<div class="title-row">
  <div style="width:82px;flex-shrink:0"></div>
  <h1>Pallet Distribution Inside Container</h1>
  ${logo ? `<div class="logo">${logo}</div>` : `<div style="width:82px;flex-shrink:0"></div>`}
</div>

<!-- ENCABEZADO (2 filas) -->
<table class="hdr">
  <tr>
    <td class="lbl">DATE:</td>
    <td class="val">${fmtDate(admin.fechaCargue)}</td>
    <td class="lbl">PORT:</td>
    <td class="val">SP CARTAGENA</td>
    <td class="lbl">PALLET CERTIFICATE:</td>
    <td class="val">${certText}</td>
    <td class="lbl">VESSEL:</td>
    <td class="val">${admin.vessel || ""}</td>
  </tr>
  <tr>
    <td class="lbl">CONTAINER:</td>
    <td class="val">${admin.container || ""}</td>
    <td class="lbl">DESTINATION:</td>
    <td class="val">${(admin.destino || "").toUpperCase()}</td>
    <td class="lbl">TEMP RECORDER:</td>
    <td class="val">${admin.tempRecorder || ""}<br>In Pallet # ${admin.tempRecorderPalletNo || ""}</td>
    <td class="lbl">FINAL STAMPS:</td>
    <td class="val">${admin.finalStamps || ""}</td>
  </tr>
</table>

<!-- CUERPO: dos paneles -->
<div class="body">

  <!-- Panel izquierdo: resumen por calibre -->
  <table class="pl-panel">
    <tr class="pl-hdr"><td colspan="2">PACKING LIST</td></tr>
    ${summaryRows}
  </table>

  <!-- Panel derecho: distribución en contenedor -->
  <div class="ct-panel">
    <div class="ct-hdr">
      <span>CONTAINER</span>
      <span class="arrow"></span>
      <span class="truck">&#x1F69A;</span>
    </div>
    <table class="ct-table">
      <thead><tr>
        <th>Pallet ID #</th><th>Size</th><th>Pallet ISPM-15</th><th>Packing Date</th>
        <th class="sep"></th>
        <th>Pallet ID #</th><th>Size</th><th>Pallet ISPM-15</th><th>Packing Date</th>
      </tr></thead>
      <tbody>${contRows}</tbody>
      <tr class="door">
        <td colspan="4">LEFT CONTAINER DOOR</td>
        <td class="sep"></td>
        <td colspan="4">RIGHT CONTAINER DOOR</td>
      </tr>
    </table>
  </div>

</div>

<!-- FOOTER -->
<div class="footer">
  <p>1001 S. Dairy Ashford, Suite 100-163 Houston, TX 77077</p>
  <p>gerencia@princesseskingdom.com</p>
</div>
</body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `PL-Container-${admin.container || "XXXX"}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(u);
  };

  // ── Informe general Paso 1 — Calibres + Checklist Calidad y Cargue ──
  const [generandoInformePlanta, setGenerandoInformePlanta] = useState(false);
  const generarInformePlanta = async (modo = "descargar") => {
    setGenerandoInformePlanta(true);
    try {
      const html = await generarInformePlantaHtml({ pallets, admin, contenedor, totalCajas });

      if (modo === "html") return html;

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const u = URL.createObjectURL(blob);
      const filename = `Informe-Planta-${admin.container || contenedor?.numContenedor || "packing"}.html`;

      if (modo === "previsualizar") {
        setPreviewInforme({ url: u, filename });
        return;
      }

      const a = document.createElement("a");
      a.href = u;
      a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(u);
    } finally {
      setGenerandoInformePlanta(false);
    }
  };

  // ── Informe general Paso 2 — Cargue del camión ──────────────────
  const [generandoInformeCargue, setGenerandoInformeCargue] = useState(false);
  const generarInformeCargue = async (modo = "descargar") => {
    setGenerandoInformeCargue(true);
    try {
      const html = await generarInformeCargueHtml({ pallets, admin, contenedor, totalCajas, layoutCamion });

      if (modo === "html") return html;

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const u = URL.createObjectURL(blob);
      const filename = `Informe-Cargue-${admin.container || contenedor?.numContenedor || "packing"}.html`;

      if (modo === "previsualizar") {
        setPreviewInforme({ url: u, filename });
        return;
      }

      const a = document.createElement("a");
      a.href = u;
      a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(u);
    } finally {
      setGenerandoInformeCargue(false);
    }
  };

  // ── Carta de Responsabilidad — datos fijos de la empresa/representante,
  // no cambian por envío, así que van directo en el HTML sin pasar por el
  // formulario ──────────────────────────────────────────────────
  const CARTA_FIJOS = {
    representanteNombre: "JUAN ABUCHAIBE",
    representanteFirma:  "Juan Alberto Abuchaibe Raheb",
    representanteCedula: "1140828407",
    representanteExpedida: "Campo de la Cruz - Atlántico",
    empresaNombre: "Tierra Prometida Trading",
    empresaNit:    "901078532-0",
  };

  const abrirCartaResp = () => {
    setCartaResp({
      fecha: hoy,
      facturaProforma: "",
      motonave:      contenedor?.vessel || admin.vessel || "",
      puertoDestino: admin.destino || "",
      contenedor:    admin.container || "",
      precintos:     admin.precintoCamion || "",
      porcentajeVacio: "5%",
      mercancia: "LIMON TAHITI",
      empaque:   `${pallets.length} PALLETS`,
      pesoNeto:  "22.226",
      pesoBruto: "22.226",
      importadorNombre:    "PRINCESSES KINGDOM CORP",
      importadorDireccion: "1001 S. Dairy Ashford, Suite 100-163 Houston, TX 77077",
      transportadora: admin.empresaTransporte || "",
      placa:          admin.placa || "",
      conductor:      admin.conductor || "",
      cedulaConductor: admin.cedulaConductor || "",
      agenciaAduanas: "AGENCIA DE ADUANAS MOVIADUANAS SAS NIVEL 1.",
      nitAduanas:     "802.000.259-1",
      vuce: "SI",
    });
  };

  const setCartaCampo = (campo, valor) => setCartaResp(c => ({ ...c, [campo]: valor }));

  const generarCartaRespHTML = async (c) => {
    const logoSrc  = await cargarLogoBase64();
    const firmaSrc = await cargarFirmaBase64();
    const fechaFmt = c.fecha
      ? new Date(c.fecha + "T12:00:00").toLocaleDateString("es-CO", { day:"2-digit", month:"long", year:"numeric" })
      : "";
    const campo = (label, valor) => `<div class="fila"><div class="lbl">${label}:</div><div class="val">${valor || "—"}</div></div>`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>Carta de Responsabilidad ${admin.container || contenedor?.numContenedor || ""}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,sans-serif;color:#1a1a1a;background:#f4f7f3;font-size:12.5px;line-height:1.5}
.sheet{max-width:800px;margin:0 auto;background:#fff;padding:40px 46px}
.logo{width:64px;height:64px;object-fit:contain;margin-bottom:18px}
.fecha{margin-bottom:16px}
.destinatario{margin-bottom:14px}
.destinatario b{display:block}
.ref{font-weight:800;margin-bottom:14px}
p{text-align:justify;margin-bottom:14px}
.campos{margin:18px 0}
.fila{display:flex;gap:6px;padding:3px 0}
.fila .lbl{width:260px;flex-shrink:0;font-weight:700}
.fila .val{font-weight:400}
.campos .grupo{margin-bottom:10px}
.legal{font-size:11px;color:#333;text-align:justify;margin-top:18px}
.firma{margin-top:40px}
.firma-img{height:70px;object-fit:contain;display:block;margin-top:10px}
.firma-nombre{margin-top:10px;font-weight:700}
@media print{
  body{background:#fff}
  .sheet{max-width:100%;padding:20mm}
  @page{size:A4;margin:0}
}
</style></head><body>
<div class="sheet">

  ${logoSrc ? `<img class="logo" src="${logoSrc}" />` : ""}

  <div class="fecha">Barranquilla, ${fechaFmt}</div>

  <div class="destinatario">
    Señores:<br>
    <b>POLICÍA ANTINARCÓTICOS</b>
    <b>COMPAÑÍA ANTINARCÓTICOS</b>
    <b>PUERTO CARTAGENA</b>
    Ciudad
  </div>

  <div class="ref">REF: CARTA DE RESPONSABILIDAD</div>

  <p>Yo, ${CARTA_FIJOS.representanteNombre}, identificado con cédula de ciudadanía Nº. ${CARTA_FIJOS.representanteCedula} expedida en ${CARTA_FIJOS.representanteExpedida}, en condición de representante de la empresa <b>${CARTA_FIJOS.empresaNombre}</b> con NIT: <b>${CARTA_FIJOS.empresaNit}</b>, certifico que el contenido de la presente carga se ajusta a lo declarado en la factura proforma Nº <b>${c.facturaProforma || "—"}</b>, correspondiente a nuestro despacho así:</p>

  <div class="campos">
    ${campo("NOMBRE MOTONAVE Y NUMERO DE VIAJE", c.motonave)}
    ${campo("PUERTO DE DESTINO", c.puertoDestino)}
    ${campo("PREFIJO DEL CONTENEDOR", c.contenedor)}
    ${campo("NUMERO DE PRECINTOS", c.precintos)}
    ${campo("PORCENTAJE VACIO", c.porcentajeVacio)}
    ${campo("DESCRIPCION DE LA MERCANCIA", c.mercancia)}
    ${campo("EMPAQUE", c.empaque)}
    ${campo("PESO NETO", c.pesoNeto ? `${c.pesoNeto} KGS` : "")}
    ${campo("PESO BRUTO", c.pesoBruto ? `${c.pesoBruto} KGS` : "")}
    <div class="fila"><div class="lbl">IMPORTADOR (DIRECCIÓN):</div><div class="val">${c.importadorNombre || "—"}<br>${c.importadorDireccion || ""}</div></div>
  </div>

  <div class="campos">
    ${campo("EMPRESA TRANSPORTADORA", c.transportadora)}
    ${campo("PLACA", c.placa)}
    ${campo("NOMBRE DEL CONDUCTOR", c.conductor)}
    ${campo("NUMERO DE CEDULA", c.cedulaConductor)}
    ${campo("NOMBRE AGENCIA DE ADUANAS", c.agenciaAduanas)}
    ${campo("NIT", c.nitAduanas)}
  </div>

  <div class="fila"><div class="lbl">ALCANCE POR LA VUCE:</div><div class="val">SI ${c.vuce === "SI" ? "_X_" : "___"} NO ${c.vuce === "NO" ? "_X_" : "___"}</div></div>

  <p class="legal">Nos hacemos responsables por el contenido de esta carga ante las autoridades colombianas, extranjeras y ante el transportador, en caso que se encuentren sustancias o elementos narcóticos, explosivo, ilícitos o prohibidos (estipulado en las normas internacionales excepción de aquellos que expresamente se han declarado como tal), armas, o partes de ellas, municiones, material de guerra o sus partes u otros elementos que no cumplan con las obligaciones legales establecidas para este tipo de carga, siempre que se conserve sus empaques, características y sellos originales con las que sea entregada al transportador. El embarque ha sido preparado en lugares con óptimas condiciones de seguridad y protegido de toda intervención ilícita durante su preparación, embalaje, almacenamiento y transporte hacia las instalaciones portuarias y cumple con todos los requisitos exigidos por la ley.</p>

  <div class="firma">
    Atentamente,
    ${firmaSrc ? `<img class="firma-img" src="${firmaSrc}" />` : ""}
    <div class="firma-nombre">NOMBRE: ${CARTA_FIJOS.representanteFirma}</div>
    <div>C.C. ${CARTA_FIJOS.representanteCedula} REPRESENTANTE LEGAL</div>
  </div>

</div>
</body></html>`;
    return html;
  };

  const generarYVerCarta = async (modo = "previsualizar") => {
    const html = await generarCartaRespHTML(cartaResp);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const u = URL.createObjectURL(blob);
    const filename = `Carta-Responsabilidad-${admin.container || contenedor?.numContenedor || "packing"}.html`;

    if (modo === "previsualizar") {
      setPreviewInforme({ url: u, filename });
      return;
    }

    const a = document.createElement("a");
    a.href = u;
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(u);
  };

  // ── Botones nav ───────────────────────────────────────────────
  const SaveIndicator = () => (
    <div style={{ display:"flex", alignItems:"center", gap:6, fontSize: m ? 12 : 10, color: guardadoOk ? "#00C9A7" : guardando ? "#F9A826" : "rgba(255,255,255,0.3)" }}>
      {guardando ? "💾 Guardando..." : guardadoOk ? "✅ Guardado" : plId ? "☁️ Guardado en la nube" : "Sin guardar"}
    </div>
  );

  const verificarClave = () => {
    if (claveInput === claveRequerida) {
      setPaso1Ok(true);
      setClaveError("");
      setClaveInput("");
    } else {
      setClaveError("Clave incorrecta");
    }
  };

  const NavBtn = ({ onClick, children, primary, disabled }) => (
    <button onClick={onClick} disabled={disabled} style={{
      flex:1, background: primary ? "linear-gradient(135deg,#00C9A7,#00a88e)" : "rgba(255,255,255,0.06)",
      border: primary ? "none" : "1px solid rgba(255,255,255,0.12)",
      borderRadius:10, padding: m ? "14px" : "10px 18px", color:"white",
      fontSize: m ? 14 : 12, fontWeight:700, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1, fontFamily:"inherit",
    }}>{children}</button>
  );

  // ── Loading ───────────────────────────────────────────────────
  if (cargando) return (
    <div style={{ textAlign:"center", padding:"40px 0", color:"rgba(255,255,255,0.4)", fontSize:14 }}>
      ⏳ Cargando packing list...
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div>

      {/* ── Header con contenedor vinculado ── */}
      {contenedor && (
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom: m ? 16 : 12, background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.25)", borderRadius:10, padding: m ? "10px 14px" : "8px 14px" }}>
          {onClose && (
            <button onClick={onClose} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding: m ? "8px 12px" : "5px 10px", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize: m ? 14 : 12, fontFamily:"inherit", flexShrink:0 }}>
              ← Volver
            </button>
          )}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize: m ? 13 : 11, fontWeight:700, color:"#a5b4fc" }}>📦 Packing List — {contenedor.numContenedor}</div>
            <div style={{ fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.4)", marginTop:2 }}>
              {[contenedor.transporte, contenedor.placa, contenedor.destino].filter(Boolean).join(" · ")}
            </div>
          </div>
          <SaveIndicator />
        </div>
      )}

      {/* ── Barra de progreso ── */}
      <div style={{ display:"flex", alignItems:"center", gap: m ? 4 : 6, marginBottom: m ? 18 : 14 }}>
        {[
          { n:1, label:"Packing Planta",    short:"Planta",     icon:"📦" },
          { n:2, label:"Carga Camión",       short:"Camión",     icon:"🚛" },
          { n:3, label:"Packing Contenedor", short:"Contenedor", icon:"🚢" },
        ].map((step, i) => {
          const done   = fase > step.n;
          const active = fase === step.n;
          return (
            <div key={step.n} style={{ display:"flex", alignItems:"center", flex:"1 1 auto" }}>
              <button
                onClick={() => done && volverAPaso(step.n)}
                style={{
                  flex:1, display:"flex", alignItems:"center", gap: m ? 6 : 8,
                  background: active ? "rgba(0,201,167,0.12)" : done ? "rgba(0,201,167,0.06)" : "rgba(255,255,255,0.03)",
                  border:`1px solid ${active ? "#00C9A7" : done ? "rgba(0,201,167,0.35)" : "rgba(255,255,255,0.08)"}`,
                  borderTop:`2px solid ${active ? "#00C9A7" : done ? "rgba(0,201,167,0.5)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius:10, padding: m ? "8px 10px" : "7px 14px",
                  cursor: done ? "pointer" : "default",
                }}
              >
                <span style={{ fontSize: m ? 16 : 15 }}>{done ? "✅" : step.icon}</span>
                <div style={{ textAlign:"left" }}>
                  <div style={{ fontSize: m ? 10 : 9, color:"rgba(255,255,255,0.35)", fontWeight:600 }}>PASO {step.n}</div>
                  <div style={{ fontSize: m ? 11 : 10, fontWeight:700, color: active ? "#00C9A7" : done ? "rgba(0,201,167,0.7)" : "rgba(255,255,255,0.38)" }}>
                    {m ? step.short : step.label}
                  </div>
                </div>
              </button>
              {i < 2 && <div style={{ width: m ? 12 : 16, height:2, background: done ? "rgba(0,201,167,0.4)" : "rgba(255,255,255,0.07)", flexShrink:0, margin:"0 2px" }} />}
            </div>
          );
        })}
      </div>

      {/* ══ FASE 1 — PACKING PLANTA ══ */}
      {fase === 1 && claveRequerida && !paso1Ok && (
        <div style={{ ...cardS, textAlign:"center", maxWidth:340, margin:"30px auto", padding: m ? "34px 22px" : "40px 30px" }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🔒</div>
          <div style={{ fontSize: m ? 14 : 13, fontWeight:700, marginBottom:6 }}>Paso 1 protegido</div>
          <div style={{ fontSize: m ? 12 : 11, color:"rgba(255,255,255,0.5)", marginBottom:18, lineHeight:1.5 }}>
            Ingresa la clave de acceso para ver calibres y el checklist de calidad y cargue.
          </div>
          <input
            type="password" autoFocus value={claveInput}
            onChange={e => { setClaveInput(e.target.value); setClaveError(""); }}
            onKeyDown={e => e.key === "Enter" && verificarClave()}
            placeholder="Clave"
            style={{ ...inp, textAlign:"center", fontSize:18, letterSpacing:4 }}
          />
          {claveError && <div style={{ color:"#FF6B6B", fontSize:11, marginTop:8, fontWeight:700 }}>{claveError}</div>}
          <button onClick={verificarClave} style={{ marginTop:16, width:"100%", background:"linear-gradient(135deg,#00C9A7,#00a88e)", border:"none", borderRadius:10, padding: m ? "13px" : "10px", color:"white", fontSize: m ? 14 : 13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            🔓 Desbloquear
          </button>
        </div>
      )}

      {fase === 1 && (!claveRequerida || paso1Ok) && (() => {
        const selP   = selPalletIdx >= 0 ? pallets[selPalletIdx] : null;
        const selSum = selP ? palletSum(selP) : 0;
        const selOk  = selSum === cpp;
        return (
          <div>
            <div style={{ display:"grid", gridTemplateColumns: m ? "1fr 1fr" : "1fr 1fr 1fr", gap: m ? 10 : 8, marginBottom: m ? 14 : 12 }}>
              <div>
                <div style={lbl}>Total cajas</div>
                <input
                  type="number" inputMode="numeric" min={20}
                  value={cajasInput}
                  onChange={e => setCajasInput(e.target.value)}
                  onBlur={e => changeTotalCajas(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && changeTotalCajas(cajasInput)}
                  placeholder="Ej: 1480"
                  style={inp}
                />
              </div>
              <div>
                <div style={lbl}>Packing Date</div>
                <input type="date" value={admin.packingDate} onChange={e => sa("packingDate", e.target.value)} style={inp} />
              </div>
              <div>
                <div style={lbl}>ICA general (todos los pallets)</div>
                <input value={admin.icaGeneral} onChange={e => sa("icaGeneral", e.target.value)} placeholder="980005905" style={inp} />
              </div>
              <div style={{ display:"flex", alignItems:"flex-end", gridColumn: m ? "1 / -1" : "auto" }}>
                <div style={{ flex:1, background: todoCuadra ? "rgba(0,201,167,0.08)" : "rgba(249,115,22,0.08)", border:`1px solid ${todoCuadra ? "rgba(0,201,167,0.3)" : "rgba(249,115,22,0.3)"}`, borderRadius:8, padding:"7px 14px", display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize: m ? 18 : 15 }}>{todoCuadra ? "✅" : "⚠️"}</span>
                  <div>
                    <div style={{ fontSize: m ? 12 : 10, fontWeight:700, color: todoCuadra ? "#00C9A7" : "#F9A826" }}>
                      {todoCuadra ? "Cuadra perfecto" : totalConf > totalCajas ? `Sobran ${totalConf - totalCajas} cajas` : `Faltan ${totalCajas - totalConf} cajas`}
                    </div>
                    <div style={{ fontSize: m ? 10 : 9, color:"rgba(255,255,255,0.35)" }}>{totalConf}/{totalCajas} distribuidas</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display:"flex", flexWrap:"wrap", gap: m ? 8 : 6, marginBottom: m ? 12 : 10 }}>
              {resumen.filter(r => r.cajas > 0).map(r => (
                <div key={r.size} style={{ background:COL_CAL[r.size].light, border:`1px solid ${COL_CAL[r.size].border}`, borderRadius:6, padding: m ? "5px 11px" : "3px 9px", fontSize: m ? 12 : 10, fontWeight:700, display:"flex", gap:5, alignItems:"center" }}>
                  <span style={{ color:COL_CAL[r.size].bg }}>{r.size}</span>
                  <span style={{ color:"rgba(255,255,255,0.6)" }}>{r.cajas.toLocaleString("es-CO")}</span>
                </div>
              ))}
            </div>

            <div style={{ background:"rgba(0,0,0,0.2)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding: m ? 10 : 12, marginBottom: m ? 14 : 12 }}>
              <div style={{ fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.35)", marginBottom: m ? 10 : 8, fontWeight:600 }}>
                📦 PALLETS — toca para editar calibre y cajas
              </div>
              <div style={{ display:"grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: m ? 8 : 6 }}>
                {pallets.map((p) => {
                  const isMixed = p.calibres.length > 1;
                  const mainCal = COL_CAL[p.calibres[0].size] || COL_CAL_VACIO;
                  const isSel   = selPid === p.id;
                  const sum     = palletSum(p);
                  const ok      = sum === cpp;
                  const bg      = isMixed
                    ? `linear-gradient(135deg,${p.calibres.map((c,i) => `${COL_CAL[c.size]?.bg||"#888"}${i===0?"55":"33"}`).join(",")})`
                    : isSel ? mainCal.light : "rgba(255,255,255,0.05)";
                  const brd     = isSel ? `2px solid ${isMixed?"white":mainCal.bg}` : isMixed ? "1px solid rgba(255,255,255,0.25)" : `1px solid ${mainCal.border}`;
                  return (
                    <div key={p.id} onClick={() => setSelPid(prev => prev === p.id ? null : p.id)}
                      style={{ background:bg, border:brd, borderRadius: m ? 8 : 6, padding: m ? "10px 8px" : "6px 7px", cursor:"pointer", position:"relative", transition:"all 0.12s", minHeight: m ? 72 : 58, display:"flex", flexDirection:"column", justifyContent:"space-between", boxShadow: isSel ? "0 0 0 1px rgba(255,255,255,0.3) inset" : "none" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize: m ? 10 : 9, fontWeight:800, color:"rgba(255,255,255,0.55)" }}>P{p.id}</span>
                        {!ok && <span style={{ fontSize: m ? 9 : 8, color:"#F9A826" }}>⚠</span>}
                        {ok  && <span style={{ fontSize: m ? 9 : 8, color:"#00C9A7" }}>✓</span>}
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                        {p.calibres.map((c, ci) => (
                          <div key={ci} style={{ display:"flex", alignItems:"center", gap:3 }}>
                            <span style={{ fontSize: m ? 12 : 9, fontWeight:700, color:COL_CAL[c.size]?.bg||"#fff", lineHeight:1 }}>{c.plu ? `${c.size}PLU` : c.size}</span>
                            <span style={{ fontSize: m ? 10 : 8, color:"rgba(255,255,255,0.5)", lineHeight:1 }}>{c.cajas}cj</span>
                          </div>
                        ))}
                      </div>
                      {p.calibres[0].predio && <div style={{ fontSize: m ? 8 : 7, color:"rgba(255,255,255,0.3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.calibres[0].predio}</div>}
                      {isSel && <div style={{ position:"absolute", bottom:-1, left:"50%", transform:"translateX(-50%)", width:0, height:0, borderLeft:"5px solid transparent", borderRight:"5px solid transparent", borderBottom:"5px solid white" }} />}
                    </div>
                  );
                })}
              </div>
            </div>

            {selPid !== null && selP && (
              <div style={{ background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:12, padding: m ? 16 : 14, marginBottom: m ? 14 : 12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: m ? 14 : 12 }}>
                  <div style={{ fontSize: m ? 14 : 12, fontWeight:700, color:"#a5b4fc" }}>
                    ✏️ Editando Pallet {selPid}
                    {!selOk && <span style={{ color:"#F9A826", fontSize: m ? 12 : 10, marginLeft:8 }}>⚠ {selSum}/{cpp}</span>}
                    {selOk  && <span style={{ color:"#00C9A7", fontSize: m ? 12 : 10, marginLeft:8 }}>✓ Cuadra</span>}
                  </div>
                  <button onClick={() => setSelPid(null)} style={{ background:"transparent", border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", fontSize: m ? 24 : 18, lineHeight:1, padding:"4px 8px", minWidth: m ? 44 : 28, minHeight: m ? 44 : 28 }}>✕</button>
                </div>

                <div
                  onClick={() => setPalletField(selPalletIdx, "listo", !selP.listo)}
                  style={{
                    display:"flex", alignItems:"center", gap:9, cursor:"pointer", userSelect:"none",
                    background: selP.listo ? "rgba(0,201,167,0.12)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${selP.listo ? "rgba(0,201,167,0.4)" : "rgba(255,255,255,0.12)"}`,
                    borderRadius:8, padding: m ? "10px 12px" : "7px 10px", marginBottom:10,
                  }}
                >
                  <div style={{
                    width: m ? 20 : 17, height: m ? 20 : 17, borderRadius:5, flexShrink:0,
                    background: selP.listo ? "#00C9A7" : "transparent",
                    border: `2px solid ${selP.listo ? "#00C9A7" : "rgba(255,255,255,0.3)"}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize: m ? 13 : 11, color:"#0b1a16", fontWeight:900,
                  }}>{selP.listo ? "✓" : ""}</div>
                  <span style={{ fontSize: m ? 13 : 11.5, fontWeight:700, color: selP.listo ? "#00C9A7" : "rgba(255,255,255,0.65)" }}>
                    {selP.listo ? "✓ Marcado como listo para cargar" : "Marcar como listo para cargar"}
                  </span>
                </div>

                {selP.calibres.map((c, ci) => (
                  <div key={ci} style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${COL_CAL[c.size]?.border||"rgba(255,255,255,0.1)"}`, borderRadius:10, padding: m ? 14 : 10, marginBottom:10 }}>
                    {m ? (
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                          <div><div style={lbl}>Calibre / Size</div>
                            <CustomSelect value={c.plu ? "230PLU" : c.size} onChange={e => setCalOpcion(selPalletIdx, ci, e.target.value)} style={{ ...inp, background:COL_CAL[c.size]?.light||"rgba(255,255,255,0.07)", cursor:"pointer" }}>
                              <option value="">— Seleccionar —</option>
                              {CALIBRES.flatMap(cal => cal === 230
                                ? [<option key={cal} value={cal}>{cal}</option>, <option key="230PLU" value="230PLU">230PLU</option>]
                                : [<option key={cal} value={cal}>{cal}</option>])}
                            </CustomSelect>
                          </div>
                          <div><div style={lbl}>N° Cajas</div><input type="number" inputMode="numeric" min={0} value={c.cajas} onChange={e => setPF(selPalletIdx, ci, "cajas", e.target.value)} style={inp} /></div>
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                          <div><div style={lbl}>Observación</div><input value={c.predio} onChange={e => setPF(selPalletIdx, ci, "predio", e.target.value)} placeholder="Observación de este calibre" style={inp} /></div>
                          <div><div style={lbl}>Registro ICA (este pallet)</div><input value={c.ica} onChange={e => setPF(selPalletIdx, ci, "ica", e.target.value)} placeholder={admin.icaGeneral || "980005905"} style={inp} /></div>
                        </div>
                        <div>{ci === 0
                          ? <button onClick={() => addCal(selPalletIdx)} style={{ width:"100%", background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.4)", borderRadius:8, padding:"12px", color:"#a5b4fc", cursor:"pointer", fontSize:14, fontWeight:600, minHeight:44 }}>➕ Agregar calibre mixto</button>
                          : <button onClick={() => removeCal(selPalletIdx, ci)} style={{ width:"100%", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"12px", color:"#fca5a5", cursor:"pointer", fontSize:14, fontWeight:600, minHeight:44 }}>✕ Quitar calibre</button>
                        }</div>
                      </div>
                    ) : (
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 1fr 1fr auto", gap:8, alignItems:"end" }}>
                        <div><div style={lbl}>Calibre / Size</div>
                          <CustomSelect value={c.plu ? "230PLU" : c.size} onChange={e => setCalOpcion(selPalletIdx, ci, e.target.value)} style={{ ...inp, background:COL_CAL[c.size]?.light||"rgba(255,255,255,0.07)", cursor:"pointer" }}>
                            {CALIBRES.flatMap(cal => cal === 230
                              ? [<option key={cal} value={cal}>{cal}</option>, <option key="230PLU" value="230PLU">230PLU</option>]
                              : [<option key={cal} value={cal}>{cal}</option>])}
                          </CustomSelect>
                        </div>
                        <div><div style={lbl}>N° Cajas</div><input type="number" min={0} value={c.cajas} onChange={e => setPF(selPalletIdx, ci, "cajas", e.target.value)} style={inp} /></div>
                        <div><div style={lbl}>Observación</div><input value={c.predio} onChange={e => setPF(selPalletIdx, ci, "predio", e.target.value)} placeholder="Observación de este calibre" style={inp} /></div>
                        <div><div style={lbl}>Registro ICA</div><input value={c.ica} onChange={e => setPF(selPalletIdx, ci, "ica", e.target.value)} placeholder="980005905" style={inp} /></div>
                        <div style={{ paddingBottom:1 }}>{ci === 0
                          ? <button onClick={() => addCal(selPalletIdx)} style={{ background:"rgba(99,102,241,0.2)", border:"1px solid rgba(99,102,241,0.4)", borderRadius:7, padding:"6px 10px", color:"#a5b4fc", cursor:"pointer", fontSize:12, width:"100%" }}>➕</button>
                          : <button onClick={() => removeCal(selPalletIdx, ci)} style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7, padding:"6px 10px", color:"#fca5a5", cursor:"pointer", fontSize:12, width:"100%" }}>✕</button>
                        }</div>
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.25)", marginTop:4, marginBottom:10 }}>Peso/caja: {PESO_STR} · LIMON TAHITI · Categoría 1</div>

                <button
                  onClick={() => imprimirTirillaPallet(selP)}
                  disabled={generandoTirilla}
                  style={{
                    width:"100%", background:"linear-gradient(135deg,#0f766e,#14b8a6)", border:"none",
                    borderRadius:9, padding: m ? "13px" : "10px", fontSize: m ? 14 : 12, color:"white",
                    cursor: generandoTirilla ? "wait" : "pointer", fontWeight:700,
                    opacity: generandoTirilla ? 0.7 : 1, minHeight: m ? 48 : 38, fontFamily:"inherit",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                  }}
                >
                  🏷️ {generandoTirilla ? "Generando..." : "Imprimir tirilla + QR"}
                </button>
              </div>
            )}

            {/* ── CHECKLIST CONTROL DE CALIDAD Y CARGUE ─────────────── */}
            {(() => {
              const chequeos      = admin.checklistCalidad || {};
              const marcados      = Object.values(chequeos).filter(Boolean).length;
              const conNo         = Object.values(chequeos).filter(v => v === "no").length;
              const completo      = marcados === CHEQUEO_TOTAL_ITEMS;
              return (
                <div style={{ ...cardS, marginBottom: m ? 14 : 12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: m ? 10 : 8, flexWrap:"wrap", gap:6 }}>
                    <div style={{ fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.4)", fontWeight:700 }}>✅ CHECKLIST CONTROL DE CALIDAD Y CARGUE</div>
                    <div style={{ fontSize: m ? 11 : 10, fontWeight:700, color: conNo > 0 ? "#EF4444" : completo ? "#00C9A7" : "rgba(255,255,255,0.4)" }}>
                      {marcados}/{CHEQUEO_TOTAL_ITEMS} revisados{conNo > 0 ? ` · ${conNo} con NO ⚠️` : completo ? " · Todo cumple ✓" : ""}
                    </div>
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(3,1fr)", gap: m ? 10 : 8, marginBottom: m ? 12 : 10 }}>
                    <div><div style={lbl}>Planta</div><input value={admin.checklistPlanta} onChange={e => sa("checklistPlanta", e.target.value)} placeholder="Nombre de la planta" style={inp} /></div>
                    <div><div style={lbl}>Producto</div><input value={contenedor?.producto || ""} disabled style={{ ...inp, opacity:0.55, cursor:"not-allowed" }} /></div>
                    <div><div style={lbl}>Cant. cajas</div><input value={totalCajas} disabled style={{ ...inp, opacity:0.55, cursor:"not-allowed" }} /></div>
                  </div>

                  {CHECKLIST_CALIDAD_CARGUE.map(grupo => (
                    <div key={grupo.cat} style={{ marginBottom: m ? 12 : 10 }}>
                      <div style={{ fontSize: m ? 10 : 9, color:"rgba(255,255,255,0.45)", fontWeight:700, marginBottom:6 }}>{grupo.icon} {grupo.cat.toUpperCase()}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                        {grupo.items.map(([key, label]) => {
                          const val = chequeos[key] || null;
                          return (
                            <div key={key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:8, padding: m ? "8px 10px" : "6px 10px", gap:8 }}>
                              <span style={{ fontSize: m ? 12 : 11, color:"rgba(255,255,255,0.8)", flex:1 }}>{label}</span>
                              <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                                <button onClick={() => setChequeo(key, "si")} style={{ background: val==="si" ? "rgba(0,201,167,0.25)" : "rgba(255,255,255,0.05)", border:`1px solid ${val==="si" ? "#00C9A7" : "rgba(255,255,255,0.15)"}`, borderRadius:6, padding: m ? "7px 14px" : "4px 10px", color: val==="si" ? "#00C9A7" : "rgba(255,255,255,0.4)", cursor:"pointer", fontSize: m ? 12 : 11, fontWeight:700, minWidth: m ? 48 : 32, fontFamily:"inherit" }}>Sí</button>
                                <button onClick={() => setChequeo(key, "no")} style={{ background: val==="no" ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.05)", border:`1px solid ${val==="no" ? "#EF4444" : "rgba(255,255,255,0.15)"}`, borderRadius:6, padding: m ? "7px 14px" : "4px 10px", color: val==="no" ? "#EF4444" : "rgba(255,255,255,0.4)", cursor:"pointer", fontSize: m ? 12 : 11, fontWeight:700, minWidth: m ? 48 : 32, fontFamily:"inherit" }}>No</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <div style={{ display:"grid", gridTemplateColumns: m ? "1fr" : "1fr 1fr", gap: m ? 10 : 8 }}>
                    <div><div style={lbl}>Responsable</div><input value={admin.checklistResponsable} onChange={e => sa("checklistResponsable", e.target.value)} placeholder="Nombre" style={inp} /></div>
                    <div><div style={lbl}>Cargo</div><input value={admin.checklistCargo} onChange={e => sa("checklistCargo", e.target.value)} placeholder="Cargo" style={inp} /></div>
                  </div>
                  <div style={{ marginTop: m ? 10 : 8 }}>
                    <div style={lbl}>Observaciones generales</div>
                    <textarea value={admin.checklistObs} onChange={e => sa("checklistObs", e.target.value)} rows={2} placeholder="Novedades del chequeo..." style={{ ...inp, resize:"vertical", fontFamily:"inherit" }} />
                  </div>
                </div>
              );
            })()}

            <div style={{ display:"flex", gap:8, marginBottom: m ? 14 : 10 }}>
              <button onClick={() => generarInformePlanta("descargar")} disabled={generandoInformePlanta} style={{ flex:1, background:"linear-gradient(135deg,#1f5c1f,#2d8a2d)", border:"none", borderRadius:10, padding: m ? "15px" : "11px", fontSize: m ? 15 : 12, color:"white", cursor: generandoInformePlanta ? "wait" : "pointer", fontWeight:700, opacity: generandoInformePlanta ? 0.7 : 1, minHeight: m ? 52 : 38 }}>
                {generandoInformePlanta ? "⏳ Generando..." : "📄 Descargar Informe General (Calibres + Checklist)"}
              </button>
              <button onClick={() => generarInformePlanta("previsualizar")} disabled={generandoInformePlanta} style={{ background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.4)", borderRadius:10, padding: m ? "0 18px" : "0 14px", fontSize: m ? 15 : 12, color:"#a5b4fc", cursor: generandoInformePlanta ? "wait" : "pointer", fontWeight:700, opacity: generandoInformePlanta ? 0.7 : 1, minHeight: m ? 52 : 38, fontFamily:"inherit" }}>
                👁 Vista previa
              </button>
            </div>

            <div style={{ display:"flex", gap:8, paddingTop: m ? 0 : 0, alignItems:"center" }}>
              <SaveIndicator />
              <div style={{ flex:1, display:"flex", gap:8 }}>
                <NavBtn onClick={() => guardarPaso1(false)}>💾 Guardar</NavBtn>
                <NavBtn primary onClick={async () => {
                  setSelPid(null);
                  const ok = await guardarPaso1(true);
                  if (ok) setFase(2);
                  else alert("No se pudo guardar el Paso 1. Revisa tu conexión e intenta de nuevo antes de continuar.");
                }}>
                  Continuar a Carga Camión →
                </NavBtn>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ FASE 2 — CARGA CAMIÓN ══ */}
      {fase === 2 && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(3,1fr)", gap: m ? 10 : 8, marginBottom: m ? 10 : 8 }}>
            <div><div style={lbl}>Empresa transporte</div><input value={admin.empresaTransporte} onChange={e => sa("empresaTransporte", e.target.value)} placeholder="Transportando Express" style={inp} /></div>
            <div><div style={lbl}>Placa</div><input value={admin.placa} onChange={e => sa("placa", e.target.value)} placeholder="QJN678" style={inp} /></div>
            <div><div style={lbl}>Conductor</div><input value={admin.conductor} onChange={e => sa("conductor", e.target.value)} placeholder="Nombre del conductor" style={inp} /></div>
            <div><div style={lbl}>Cédula del conductor</div><input value={admin.cedulaConductor} onChange={e => sa("cedulaConductor", e.target.value)} placeholder="Ej: 88.171.056" style={inp} /></div>
            <div><div style={lbl}>Supervisor de cargue</div><input value={admin.supervisorCargue} onChange={e => sa("supervisorCargue", e.target.value)} placeholder="Nombre del supervisor" style={inp} /></div>
            <div><div style={lbl}>Hora de cargue</div><input type="time" value={admin.horaCargue} onChange={e => sa("horaCargue", e.target.value)} style={inp} /></div>
            <div><div style={lbl}>Hora de salida</div><input type="time" value={admin.horaSalida} onChange={e => sa("horaSalida", e.target.value)} style={inp} /></div>
            <div style={{ gridColumn: m ? "1 / -1" : "auto" }}><div style={lbl}>Fecha de cargue</div><input type="date" value={admin.fechaCargue} onChange={e => sa("fechaCargue", e.target.value)} style={inp} /></div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns: m ? "1fr" : "repeat(2,1fr)", gap: m ? 10 : 8, marginBottom: m ? 14 : 12 }}>
            <div style={cardS}>
              <div style={{ fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.4)", marginBottom: m ? 10 : 6, fontWeight:700 }}>🌡 TERMOREGISTRO / PRECINTO / TEMPERATURA</div>
              <div style={{ display:"grid", gridTemplateColumns: m ? "1fr 90px" : "1fr 90px 1fr", gap: m ? 10 : 6, marginBottom: m ? 8 : 6 }}>
                <div><div style={lbl}>Termoregistro</div><input value={admin.termoregistroCamion} onChange={e => sa("termoregistroCamion", e.target.value)} placeholder="N° de termoregistro" style={inp} /></div>
                <div><div style={lbl}>En pallet #</div><input type="number" inputMode="numeric" min={1} max={20} value={admin.termoregistroCamionPalletNo} onChange={e => sa("termoregistroCamionPalletNo", e.target.value)} style={inp} /></div>
                <div style={{ gridColumn: m ? "1 / -1" : "auto" }}><div style={lbl}>N° de precinto</div><input value={admin.precintoCamion} onChange={e => sa("precintoCamion", e.target.value)} placeholder="Precinto de seguridad" style={inp} /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap: m ? 10 : 6 }}>
                {campoTemperatura("Temp. de llegada", admin.tempLlegadaCamion, v => sa("tempLlegadaCamion", v), "6.5")}
                {campoTemperatura("Temp. de salida",   admin.tempSalidaCamion,  v => sa("tempSalidaCamion", v),  "5.8")}
              </div>
            </div>

            <div style={cardS}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: m ? 10 : 6 }}>
                <div style={{ fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.4)", fontWeight:700 }}>🏷 PALLET CON ICA</div>
                <button onClick={addIcaCamion} style={{ background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.4)", borderRadius:7, padding: m ? "6px 12px" : "4px 10px", color:"#a5b4fc", cursor:"pointer", fontSize: m ? 13 : 11, fontWeight:700, fontFamily:"inherit" }}>
                  ➕ Agregar ICA
                </button>
              </div>
              {admin.icaCamion.map((cert, ci) => (
                <div key={ci} style={{ display:"grid", gridTemplateColumns:"1fr 90px auto", gap: m ? 8 : 6, marginBottom: ci < admin.icaCamion.length - 1 ? (m ? 8 : 6) : 0, alignItems:"end" }}>
                  <div><div style={lbl}>Número ICA{admin.icaCamion.length > 1 ? ` #${ci + 1}` : ""}</div><input value={cert.ica} onChange={e => setIcaCamion(ci, "ica", e.target.value)} placeholder="ICA 05-007-26" style={inp} /></div>
                  <div><div style={lbl}>En pallet #</div><input type="number" inputMode="numeric" min={1} max={20} value={cert.palletNo} onChange={e => setIcaCamion(ci, "palletNo", e.target.value)} style={inp} /></div>
                  <div style={{ paddingBottom:1 }}>{admin.icaCamion.length > 1
                    ? <button onClick={() => removeIcaCamion(ci)} style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7, padding: m ? "10px" : "7px 10px", color:"#fca5a5", cursor:"pointer", fontSize:13, minHeight: m ? 44 : 32, fontFamily:"inherit" }}>✕</button>
                    : <div style={{ minHeight: m ? 44 : 32 }} />
                  }</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background:"rgba(249,115,22,0.07)", border:"1px solid rgba(249,115,22,0.25)", borderRadius:10, padding: m ? "10px 14px" : "8px 14px", marginBottom: m ? 12 : 10, fontSize: m ? 12 : 11, color:"rgba(249,115,22,0.9)" }}>
            🚛 Arrastra los pallets para reflejar cómo quedaron físicamente dentro del camión (fondo → puerta trasera).
          </div>

          {renderVehicleGrid(layoutCamion, moverCamion, quitarCamion, quitarTodosCamion, "🚛", "CAMIÓN",
            "Toca un pallet de la lista (o ya ubicado) y luego la casilla donde va",
            false, true
          )}

          {renderFirmaPad(admin.firmaConductor, firmaConductorPad, "del conductor")}
          {renderFirmaPad(admin.firmaSupervisor, firmaSupervisorPad, "del supervisor")}

          <button onClick={guardarYActualizarPaso2} disabled={guardando} style={{ width:"100%", background:"linear-gradient(135deg,#0EA5E9,#0284C7)", border:"none", borderRadius:10, padding: m ? "15px" : "11px", fontSize: m ? 15 : 12, color:"white", cursor: guardando ? "wait" : "pointer", fontWeight:700, opacity: guardando ? 0.7 : 1, minHeight: m ? 52 : 38, marginBottom: 4 }}>
            🔄 Guardar y actualizar información
          </button>
          <div style={{ fontSize: m ? 11 : 10, color: infoActualizada ? "#00C9A7" : "rgba(255,255,255,0.4)", textAlign:"center", marginBottom: m ? 14 : 10 }}>
            {infoActualizada ? "✅ Calibres y cajas actualizados desde Planta — el orden del camión no se movió" : "Trae los calibres/cajas más recientes de Planta sin mover el orden ya armado en el camión"}
          </div>

          <div style={{ display:"flex", gap:8, marginBottom: m ? 14 : 10 }}>
            <button onClick={() => generarInformeCargue("descargar")} disabled={generandoInformeCargue} style={{ flex:1, background:"linear-gradient(135deg,#c2620a,#e8862c)", border:"none", borderRadius:10, padding: m ? "15px" : "11px", fontSize: m ? 15 : 12, color:"white", cursor: generandoInformeCargue ? "wait" : "pointer", fontWeight:700, opacity: generandoInformeCargue ? 0.7 : 1, minHeight: m ? 52 : 38 }}>
              {generandoInformeCargue ? "⏳ Generando..." : "📄 Descargar Informe de Cargue"}
            </button>
            <button onClick={() => generarInformeCargue("previsualizar")} disabled={generandoInformeCargue} style={{ background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.4)", borderRadius:10, padding: m ? "0 18px" : "0 14px", fontSize: m ? 15 : 12, color:"#a5b4fc", cursor: generandoInformeCargue ? "wait" : "pointer", fontWeight:700, opacity: generandoInformeCargue ? 0.7 : 1, minHeight: m ? 52 : 38, fontFamily:"inherit" }}>
              👁 Vista previa
            </button>
          </div>

          <button onClick={abrirCartaResp} style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:10, padding: m ? "15px" : "11px", fontSize: m ? 15 : 12, color:"rgba(255,255,255,0.85)", cursor:"pointer", fontWeight:700, minHeight: m ? 52 : 38, marginBottom: m ? 14 : 10 }}>
            📋 Crear Carta de Responsabilidad
          </button>

          <div style={{ display:"flex", gap:8, paddingTop: m ? 0 : 0, alignItems:"center" }}>
            <SaveIndicator />
            <div style={{ flex:1, display:"flex", gap:8 }}>
              <NavBtn onClick={() => volverAPaso(1)}>← Volver</NavBtn>
              <NavBtn onClick={() => guardarPaso2(false)}>💾 Guardar</NavBtn>
              <NavBtn primary onClick={async () => {
                const ok = await guardarPaso2(true);
                if (ok) setFase(3);
                else alert("No se pudo guardar el Paso 2. Revisa tu conexión e intenta de nuevo antes de continuar.");
              }}>
                🔓 Autorizar contenedor →
              </NavBtn>
            </div>
          </div>
        </div>
      )}

      {/* ══ FASE 3 — PACKING CONTENEDOR ══ */}
      {fase === 3 && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(5,1fr)", gap: m ? 10 : 8, marginBottom: m ? 12 : 10 }}>
            <div>
              <div style={lbl}>Consecutivo</div>
              <input
                type="number" inputMode="numeric" min={1}
                value={admin.consecutivo}
                onChange={e => {
                  const cons = e.target.value;
                  const año  = new Date().getFullYear();
                  sa("consecutivo", cons);
                  if (cons) sa("plNo", `${año}-${cons}`);
                }}
                placeholder="175"
                style={inp}
              />
            </div>
            {[
              { l:"Packing List No. / DEAL", v:admin.plNo,        k:"plNo",        ph:"2026-175"            },
              { l:"N° Container",            v:admin.container,   k:"container",   ph:"TLLU1194289"         },
              { l:"Vessel / Motonave",       v:admin.vessel,      k:"vessel",      ph:"SPIRIT OF MELBOURNE" },
              { l:"Final Stamps",            v:admin.finalStamps, k:"finalStamps", ph:"005743–SQ83066"      },
            ].map(f => (
              <div key={f.k}><div style={lbl}>{f.l}</div><input value={f.v} onChange={e => sa(f.k, e.target.value)} placeholder={f.ph} style={inp} /></div>
            ))}
          </div>

          <div style={{ display:"grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(2,1fr)", gap: m ? 10 : 8, marginBottom: m ? 12 : 10 }}>
            <div><div style={lbl}>Puerto destino</div>
              <CustomSelect value={admin.destino} onChange={e => sa("destino", e.target.value)} style={{ ...inp, cursor:"pointer" }}>
                {DESTINOS.map(d => <option key={d} value={d}>{d}</option>)}
              </CustomSelect>
            </div>
            <div><div style={lbl}>Fecha de cargue</div><input type="date" value={admin.fechaCargue} onChange={e => sa("fechaCargue", e.target.value)} style={inp} /></div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns: m ? "1fr" : "repeat(2,1fr)", gap: m ? 10 : 8, marginBottom: m ? 14 : 12 }}>
            <div style={cardS}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: m ? 10 : 6 }}>
                <div style={{ fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.4)", fontWeight:700 }}>🏷 PALLET CERTIFICATE ICA</div>
                <button onClick={addPalletCert} style={{ background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.4)", borderRadius:7, padding: m ? "6px 12px" : "4px 10px", color:"#a5b4fc", cursor:"pointer", fontSize: m ? 13 : 11, fontWeight:700, fontFamily:"inherit" }}>
                  ➕ Agregar ICA
                </button>
              </div>
              {admin.palletCerts.map((cert, ci) => (
                <div key={ci} style={{ display:"grid", gridTemplateColumns:"1fr 90px auto", gap: m ? 8 : 6, marginBottom: ci < admin.palletCerts.length - 1 ? (m ? 8 : 6) : 0, alignItems:"end" }}>
                  <div><div style={lbl}>Número ICA{admin.palletCerts.length > 1 ? ` #${ci + 1}` : ""}</div><input value={cert.ica} onChange={e => setPalletCert(ci, "ica", e.target.value)} placeholder="ICA 05-007-26" style={inp} /></div>
                  <div><div style={lbl}>En pallet #</div><input type="number" inputMode="numeric" min={1} max={20} value={cert.palletNo} onChange={e => setPalletCert(ci, "palletNo", e.target.value)} style={inp} /></div>
                  <div style={{ paddingBottom:1 }}>{admin.palletCerts.length > 1
                    ? <button onClick={() => removePalletCert(ci)} style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7, padding: m ? "10px" : "7px 10px", color:"#fca5a5", cursor:"pointer", fontSize:13, minHeight: m ? 44 : 32, fontFamily:"inherit" }}>✕</button>
                    : <div style={{ minHeight: m ? 44 : 32 }} />
                  }</div>
                </div>
              ))}
            </div>
            <div style={cardS}>
              <div style={{ fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.4)", marginBottom: m ? 10 : 6, fontWeight:700 }}>🌡 TEMP RECORDER / ISPM-15</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 90px", gap: m ? 10 : 6, marginBottom: m ? 8 : 6 }}>
                <div><div style={lbl}>Número Datalogger</div><input value={admin.tempRecorder} onChange={e => sa("tempRecorder", e.target.value)} placeholder="V1-0041573" style={inp} /></div>
                <div><div style={lbl}>En pallet #</div><input type="number" inputMode="numeric" min={1} max={20} value={admin.tempRecorderPalletNo} onChange={e => sa("tempRecorderPalletNo", e.target.value)} style={inp} /></div>
              </div>
              <div>
                <div style={lbl}>Código ISPM-15 (Pallet Certificate)</div>
                <input value={admin.ispm15} onChange={e => sa("ispm15", e.target.value)} placeholder="CO-68-009 HT" style={inp} />
              </div>
            </div>
          </div>

          {/* ── FORMATO ID PALLET — campos manuales sin otra fuente ─── */}
          <div style={{ ...cardS, marginBottom: m ? 14 : 12 }}>
            <div style={{ fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.4)", marginBottom: m ? 10 : 6, fontWeight:700 }}>🆔 FORMATO ID PALLET</div>
            <div style={{ display:"grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(4,1fr)", gap: m ? 10 : 8 }}>
              <div><div style={lbl}>Port</div><input value={admin.port} onChange={e => sa("port", e.target.value)} placeholder="SP CARTAGENA" style={inp} /></div>
              <div><div style={lbl}>Puerto</div><input value={admin.puertoManual} onChange={e => sa("puertoManual", e.target.value)} style={inp} /></div>
              <div><div style={lbl}>Moviad</div><input value={admin.moviad} onChange={e => sa("moviad", e.target.value)} style={inp} /></div>
              {campoTemperatura("Temperature", admin.temperatura, v => sa("temperatura", v), "7.2")}
            </div>
          </div>

          {/* ── GROWER LIST ─────────────────────────────────────────── */}
          <div style={{ ...cardS, marginBottom: m ? 14 : 12 }}>
            <div style={{ fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.4)", marginBottom: m ? 12 : 8, fontWeight:700 }}>🌿 GROWER LIST — Asignación de Predios</div>

            <div style={{ display:"grid", gridTemplateColumns: m ? "1fr 1fr" : "1fr 1fr 1fr", gap: m ? 10 : 8, marginBottom: m ? 12 : 10 }}>
              <div>
                <div style={lbl}>ETA (fecha llegada puerto)</div>
                <input type="date" value={admin.growerETA} onChange={e => sa("growerETA", e.target.value)} style={inp} />
              </div>
              <div>
                <div style={lbl}>Booking / B/L</div>
                <input value={admin.growerBL} onChange={e => sa("growerBL", e.target.value)} placeholder="ZIMUCRT914086" style={inp} />
              </div>
              <div>
                <div style={lbl}>Contenedor</div>
                <input
                  value={admin.growerContainer ?? admin.container ?? ""}
                  onChange={e => sa("growerContainer", e.target.value)}
                  placeholder={admin.container || "TLLU1194289"}
                  style={{ ...inp, color: admin.growerContainer ? undefined : "rgba(255,255,255,0.45)" }}
                />
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"64px 1fr 114px", gap: m ? 8 : 6, marginBottom: m ? 6 : 4 }}>
              {["CALIBRE","PREDIO","REGISTRO"].map(h => (
                <div key={h} style={{ fontSize: m ? 10 : 8, color:"rgba(255,255,255,0.3)", fontWeight:700 }}>{h}</div>
              ))}
            </div>

            {CALIBRES.slice().reverse().filter(cal =>
              pallets.some(p => p.calibres.some(c => Number(c.size) === cal && Number(c.cajas) > 0))
            ).map(cal => {
              const assignments = admin.growerAssignments || {};
              const assigned    = assignments[cal] || "";
              const usados      = Object.entries(assignments).filter(([k]) => Number(k) !== cal).map(([,v]) => v).filter(Boolean);
              const predio      = PREDIOS.find(p => p.registro === assigned);
              const colores     = COL_CAL[cal] || { bg:"#94a3b8", light:"rgba(148,163,184,0.15)", border:"rgba(148,163,184,0.4)" };
              return (
                <div key={cal} style={{ display:"grid", gridTemplateColumns:"64px 1fr 114px", gap: m ? 8 : 6, marginBottom: m ? 8 : 6, alignItems:"center" }}>
                  <div style={{ background:colores.light, border:`1px solid ${colores.border}`, borderRadius:6, padding: m ? "6px 4px" : "4px 4px", textAlign:"center", fontWeight:800, fontSize: m ? 14 : 12, color:colores.bg }}>
                    {cal}
                  </div>
                  <CustomSelect
                    value={assigned}
                    onChange={e => sa("growerAssignments", { ...(admin.growerAssignments || {}), [cal]: e.target.value })}
                    style={{ ...inp, cursor:"pointer" }}
                  >
                    <option value="">— Seleccionar —</option>
                    {PREDIOS.filter(p => !usados.includes(p.registro)).map(p => (
                      <option key={p.registro} value={p.registro}>{p.nombre}</option>
                    ))}
                  </CustomSelect>
                  <div style={{ fontSize: m ? 11 : 10, color: assigned ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)", fontFamily:"monospace", background:"rgba(255,255,255,0.04)", borderRadius:6, padding: m ? "8px 6px" : "6px 6px", textAlign:"center" }}>
                    {predio?.registro || "—"}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ background:"rgba(14,165,233,0.07)", border:"1px solid rgba(14,165,233,0.25)", borderRadius:10, padding: m ? "10px 14px" : "8px 14px", marginBottom: m ? 12 : 10, fontSize: m ? 12 : 11, color:"rgba(14,165,233,0.9)" }}>
            🚢 Ajusta el orden final de los pallets tal como quedaron cargados dentro del contenedor.
          </div>

          {renderVehicleGrid(layout, moverContainer, quitarContainer, quitarTodosContainer, "🚢", "CONT.",
            "Toca un pallet de la lista (o ya ubicado) y luego la casilla donde va — o arrástralo con el mouse",
            true
          )}

          <div style={{ display:"flex", flexDirection: m ? "column" : "row", gap: m ? 10 : 8, paddingTop: m ? 14 : 12, borderTop:"1px solid rgba(255,255,255,0.06)", marginBottom: m ? 10 : 8 }}>
            <button onClick={generarExcel} disabled={generandoExcel} style={{ flex:1, background:"linear-gradient(135deg,#22C55E,#16A34A)", border:"none", borderRadius:10, padding: m ? "15px" : "11px", fontSize: m ? 15 : 12, color:"white", cursor: generandoExcel ? "wait" : "pointer", fontWeight:700, opacity: generandoExcel ? 0.7 : 1, minHeight: m ? 52 : 38 }}>
              {generandoExcel ? "⏳ Generando..." : "📊 Descargar Excel (Planta)"}
            </button>
            <button onClick={generarGrowerList} disabled={generandoGrower} style={{ flex:1, background:"linear-gradient(135deg,#059669,#047857)", border:"none", borderRadius:10, padding: m ? "15px" : "11px", fontSize: m ? 15 : 12, color:"white", cursor: generandoGrower ? "wait" : "pointer", fontWeight:700, opacity: generandoGrower ? 0.7 : 1, minHeight: m ? 52 : 38 }}>
              {generandoGrower ? "⏳ Generando..." : "🌿 Grower List"}
            </button>
            <button onClick={() => generarPDF()} style={{ flex:1, background:"linear-gradient(135deg,#1a5c1a,#2d8a2d)", border:"none", borderRadius:10, padding: m ? "15px" : "11px", fontSize: m ? 15 : 12, color:"white", cursor:"pointer", fontWeight:700, minHeight: m ? 52 : 38 }}>
              📄 Descargar PDF
            </button>
            <button onClick={generarIdPallet} disabled={generandoIdPallet} style={{ flex:1, background:"linear-gradient(135deg,#6366F1,#4338CA)", border:"none", borderRadius:10, padding: m ? "15px" : "11px", fontSize: m ? 15 : 12, color:"white", cursor: generandoIdPallet ? "wait" : "pointer", fontWeight:700, opacity: generandoIdPallet ? 0.7 : 1, minHeight: m ? 52 : 38 }}>
              {generandoIdPallet ? "⏳ Generando..." : "🆔 Formato ID Pallet"}
            </button>
          </div>

          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <SaveIndicator />
            <div style={{ flex:1, display:"flex", gap:8 }}>
              <NavBtn onClick={() => volverAPaso(2)}>← Volver a Camión</NavBtn>
              <NavBtn onClick={() => guardarPaso3()}>💾 Guardar</NavBtn>
            </div>
          </div>
        </div>
      )}

      {cartaResp && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:9999, display:"flex", flexDirection:"column", padding: m ? 0 : 24 }}>
          <div style={{ background:"#1a1a2e", borderRadius: m ? 0 : 14, border: m ? "none" : "1px solid rgba(255,255,255,0.1)", maxWidth:720, width:"100%", margin:"0 auto", maxHeight:"100%", overflowY:"auto", padding: m ? 16 : 22 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:14, fontWeight:700, color:"white" }}>📋 Carta de Responsabilidad</div>
              <button onClick={() => setCartaResp(null)} style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:7, padding:"5px 10px", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:12 }}>✕</button>
            </div>

            <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginBottom:12 }}>
              Se precargó lo que ya está registrado en este contenedor. Revisa y completa lo que falte antes de generar.
            </div>

            <div style={{ display:"grid", gridTemplateColumns: m ? "1fr" : "1fr 1fr", gap:8, marginBottom:8 }}>
              <div><div style={lbl}>Fecha</div><input type="date" style={inp} value={cartaResp.fecha} onChange={e=>setCartaCampo("fecha", e.target.value)} /></div>
              <div><div style={lbl}>N° Factura Proforma</div><input style={inp} value={cartaResp.facturaProforma} onChange={e=>setCartaCampo("facturaProforma", e.target.value)} placeholder="Ej: 621" /></div>
              <div><div style={lbl}>Nombre motonave y N° de viaje</div><input style={inp} value={cartaResp.motonave} onChange={e=>setCartaCampo("motonave", e.target.value)} placeholder="Ej: NEWYORKER" /></div>
              <div><div style={lbl}>Puerto de destino</div><input style={inp} value={cartaResp.puertoDestino} onChange={e=>setCartaCampo("puertoDestino", e.target.value)} placeholder="Ej: MIAMI FL" /></div>
              <div><div style={lbl}>Prefijo del contenedor</div><input style={inp} value={cartaResp.contenedor} onChange={e=>setCartaCampo("contenedor", e.target.value)} /></div>
              <div><div style={lbl}>N° de precintos</div><input style={inp} value={cartaResp.precintos} onChange={e=>setCartaCampo("precintos", e.target.value)} /></div>
              <div><div style={lbl}>Porcentaje vacío</div><input style={inp} value={cartaResp.porcentajeVacio} onChange={e=>setCartaCampo("porcentajeVacio", e.target.value)} placeholder="Ej: 5%" /></div>
              <div><div style={lbl}>Descripción de la mercancía</div><input style={inp} value={cartaResp.mercancia} onChange={e=>setCartaCampo("mercancia", e.target.value)} /></div>
              <div><div style={lbl}>Empaque</div><input style={inp} value={cartaResp.empaque} onChange={e=>setCartaCampo("empaque", e.target.value)} /></div>
              <div><div style={lbl}>Peso neto (KGS)</div><input style={inp} value={cartaResp.pesoNeto} onChange={e=>setCartaCampo("pesoNeto", e.target.value)} /></div>
              <div><div style={lbl}>Peso bruto (KGS)</div><input style={inp} value={cartaResp.pesoBruto} onChange={e=>setCartaCampo("pesoBruto", e.target.value)} /></div>
              <div><div style={lbl}>Empresa transportadora</div><input style={inp} value={cartaResp.transportadora} onChange={e=>setCartaCampo("transportadora", e.target.value)} /></div>
              <div><div style={lbl}>Placa</div><input style={inp} value={cartaResp.placa} onChange={e=>setCartaCampo("placa", e.target.value)} /></div>
              <div><div style={lbl}>Nombre del conductor</div><input style={inp} value={cartaResp.conductor} onChange={e=>setCartaCampo("conductor", e.target.value)} /></div>
              <div><div style={lbl}>N° de cédula del conductor</div><input style={inp} value={cartaResp.cedulaConductor} onChange={e=>setCartaCampo("cedulaConductor", e.target.value)} placeholder="Ej: 88.171.056" /></div>
            </div>

            <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:0.5, margin:"12px 0 6px" }}>Importador</div>
            <div style={{ display:"grid", gridTemplateColumns: m ? "1fr" : "1fr 1fr", gap:8, marginBottom:8 }}>
              <div><div style={lbl}>Nombre</div><input style={inp} value={cartaResp.importadorNombre} onChange={e=>setCartaCampo("importadorNombre", e.target.value)} /></div>
              <div><div style={lbl}>Dirección</div><input style={inp} value={cartaResp.importadorDireccion} onChange={e=>setCartaCampo("importadorDireccion", e.target.value)} /></div>
            </div>

            <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:0.5, margin:"12px 0 6px" }}>Agencia de aduanas</div>
            <div style={{ display:"grid", gridTemplateColumns: m ? "1fr" : "1fr 1fr", gap:8, marginBottom:8 }}>
              <div><div style={lbl}>Nombre</div><input style={inp} value={cartaResp.agenciaAduanas} onChange={e=>setCartaCampo("agenciaAduanas", e.target.value)} /></div>
              <div><div style={lbl}>NIT</div><input style={inp} value={cartaResp.nitAduanas} onChange={e=>setCartaCampo("nitAduanas", e.target.value)} /></div>
            </div>

            <div style={{ marginBottom:14 }}>
              <div style={lbl}>Alcance por la VUCE</div>
              <CustomSelect value={cartaResp.vuce} onChange={e=>setCartaCampo("vuce", e.target.value)} style={{ ...inp, maxWidth:160 }}>
                <option value="SI">SI</option>
                <option value="NO">NO</option>
              </CustomSelect>
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => generarYVerCarta("previsualizar")} style={{ flex:1, background:"rgba(0,201,167,0.15)", border:"1px solid rgba(0,201,167,0.4)", borderRadius:8, color:"#00C9A7", padding:"10px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                👁 Vista previa
              </button>
              <button onClick={() => generarYVerCarta("descargar")} style={{ flex:1, background:"linear-gradient(135deg,#6366F1,#8B5CF6)", border:"none", borderRadius:8, color:"white", padding:"10px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                📥 Descargar
              </button>
            </div>
          </div>
        </div>
      )}

      {previewInforme && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:9999, display:"flex", flexDirection:"column" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding: m ? "12px 16px" : "10px 18px", background:"#1a1a2e", borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ color:"white", fontWeight:700, fontSize: m ? 12 : 13 }}>👁 Vista previa — {previewInforme.filename}</span>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => previewInformeIframeRef.current?.contentWindow?.print()} style={{ background:"rgba(99,102,241,0.2)", border:"1px solid rgba(99,102,241,0.5)", borderRadius:8, padding: m ? "8px 14px" : "7px 16px", fontSize: m ? 11 : 12, color:"#a5b4fc", cursor:"pointer", fontWeight:700, fontFamily:"inherit" }}>🖨 Imprimir</button>
              <button onClick={() => { const a = document.createElement("a"); a.href = previewInforme.url; a.download = previewInforme.filename; a.click(); }} style={{ background:"linear-gradient(135deg,#845EF7,#6366F1)", border:"none", borderRadius:8, padding: m ? "8px 14px" : "7px 16px", fontSize: m ? 11 : 12, color:"white", cursor:"pointer", fontWeight:700, fontFamily:"inherit" }}>📥 Descargar</button>
              <button onClick={() => setPreviewInforme(null)} style={{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:8, padding: m ? "8px 14px" : "7px 16px", fontSize: m ? 11 : 12, color:"white", cursor:"pointer", fontWeight:700, fontFamily:"inherit" }}>✕ Cerrar</button>
            </div>
          </div>
          <iframe ref={previewInformeIframeRef} src={previewInforme.url} style={{ flex:1, border:"none", background:"white" }} title="Vista previa del informe" />
        </div>
      )}

    </div>
  );
}
