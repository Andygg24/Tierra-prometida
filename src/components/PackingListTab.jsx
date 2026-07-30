import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import CustomSelect from "./CustomSelect.jsx";
import { usePackingList } from "../hooks/usePackingList.js";
import { useConfiguracion } from "../hooks/useConfiguracion.js";

const CALIBRES = [110, 150, 175, 200, 230, 250];
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

// ── Checklist "Control de Calidad y Cargue" — molde agregado en Moldes/ ──
const CHECKLIST_CALIDAD_CARGUE = [
  { cat:"Calidad del producto", icon:"🍋", items:[
    ["fruta_buen_estado",   "Fruta en buen estado"],
    ["calibre_conforme",    "Calibre conforme a pedido"],
    ["limpieza_producto",   "Limpieza del producto"],
    ["maduracion_adecuada", "Maduración adecuada"],
    ["sin_plagas",          "Sin plagas o cuerpos extraños"],
  ]},
  { cat:"Calidad de cajas", icon:"📦", items:[
    ["cajas_limpias_secas",  "Cajas limpias y secas"],
    ["cajas_sin_roturas",    "Cajas sin roturas"],
    ["resistencia_adecuada", "Resistencia adecuada"],
    ["cierre_correcto",      "Cierre correcto"],
  ]},
  { cat:"Etiquetas y marcación", icon:"🏷", items:[
    ["cajas_con_etiqueta",   "Cajas con etiqueta"],
    ["info_legible",         "Información legible"],
    ["marcacion_cajas",      "Marcación de cajas"],
    ["etiquetas_id_4_lados", "Etiquetas de ID en los 4 lados de la pallet"],
    ["etiquetas_plu",        "Etiquetas PLU en el producto"],
  ]},
  { cat:"Pallet", icon:"🧱", items:[
    ["estibas_buen_estado", "Estibas en buen estado"],
    ["estibas_estables",    "Estibas estables"],
    ["sellos_ica_visibles", "Sellos ICA visibles"],
    ["cantidad_sellos_ica", "Cantidad correcta de sellos ICA"],
  ]},
  { cat:"Temperatura", icon:"🌡", items:[
    ["temp_carga_ok",        "Temperatura de la carga (°C)"],
    ["temp_vehiculo_ok",     "Temperatura del vehículo (°C)"],
    ["termoregistro_activado","Termoregistro activado"],
  ]},
  { cat:"Condiciones del vehículo", icon:"🚛", items:[
    ["vehiculo_limpio",       "Vehículo limpio"],
    ["sin_olores",            "Sin olores"],
    ["sin_humedad",           "Sin humedad"],
    ["buen_estado_general",   "Buen estado general"],
    ["capacidad_20_pallets",  "Capacidad para 20 pallets"],
    ["talanqueras_adecuadas", "Talanqueras adecuadas"],
    ["sellos_seguridad",      "Sellos de seguridad"],
  ]},
];
const CHEQUEO_TOTAL_ITEMS = CHECKLIST_CALIDAD_CARGUE.reduce((s, g) => s + g.items.length, 0);

const COL_CAL = {
  110: { bg:"#3B82F6", light:"rgba(59,130,246,0.18)", border:"rgba(59,130,246,0.5)" },
  150: { bg:"#22C55E", light:"rgba(34,197,94,0.18)",  border:"rgba(34,197,94,0.5)"  },
  175: { bg:"#EAB308", light:"rgba(234,179,8,0.18)",  border:"rgba(234,179,8,0.5)"  },
  200: { bg:"#F97316", light:"rgba(249,115,22,0.18)", border:"rgba(249,115,22,0.5)" },
  230: { bg:"#EF4444", light:"rgba(239,68,68,0.18)",  border:"rgba(239,68,68,0.5)"  },
  250: { bg:"#8B5CF6", light:"rgba(139,92,246,0.18)", border:"rgba(139,92,246,0.5)" },
};

// ── Guardado por paso — cada paso solo escribe sus propios campos de
// admin_data, así dos personas en pasos distintos del mismo contenedor
// no se borran el trabajo entre sí. ──
const PASO1_ADMIN_KEYS = ["packingDate", "checklistPlanta", "checklistCalidad", "checklistResponsable", "checklistCargo", "checklistObs", "icaGeneral"];
const PASO2_ADMIN_KEYS = ["empresaTransporte", "placa", "conductor", "supervisorCargue", "horaCargue", "horaSalida", "fechaCargue", "termoregistroCamion", "termoregistroCamionPalletNo", "precintoCamion", "tempLlegadaCamion", "tempSalidaCamion", "icaCamion"];
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
    calibres: [{ size: 200, cajas: cpp, predio: "", ica: "", plu: false }],
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

// Pre-fill admin desde datos del contenedor
function adminDesdeContenedor(cont) {
  if (!cont) return {};
  return {
    container:         cont.numContenedor || "",
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
  const { cargarPorContenedor, guardar } = usePackingList();
  const { config: cfgSeguridad } = useConfiguracion();
  const claveRequerida = cfgSeguridad?.cfg_claves_acceso?.paso1_packing || "";
  const [paso1Ok,       setPaso1Ok]       = useState(false);
  const [claveInput,    setClaveInput]    = useState("");
  const [claveError,    setClaveError]    = useState("");

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
    conductor:"", horaCargue:"", horaSalida:"", supervisorCargue:"",
    // ── Paso 2 — Camión: termoregistro, precinto, temperaturas y pallet(s) con ICA ──
    termoregistroCamion:"", termoregistroCamionPalletNo:"", precintoCamion:"", tempLlegadaCamion:"", tempSalidaCamion:"",
    icaCamion:[{ ica:"", palletNo:"" }],
    growerAssignments:{}, growerETA:"", growerBL:"", growerContainer:"",
    ispm15:"CO-68-001 HT",
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
        setFase(data.fase || 1);
        setTotalCajas(data.total_cajas || 1400);
        setCajasInput(data.cajas_input || String(data.total_cajas || 1400));
        if (data.pallets?.length) setPallets(data.pallets);
        if (data.layout_camion?.left?.length) setLayoutCamion(data.layout_camion);
        if (data.layout_cont?.left?.length)   setLayout(data.layout_cont);
        if (data.admin_data)
          setAdmin(prev => ({ ...prev, ...data.admin_data }));
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
    if (!error && data?.id) setPlId(data.id);
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
    // Solo se redistribuye parejo (20 pallets, calibre 200 por defecto) si
    // nadie ha tocado todavía ningún pallet. En cuanto se edita un calibre,
    // se mezcla, o se asigna predio/ICA, cambiar el total NO debe borrar
    // ese trabajo — se deja el reparto tal cual y el indicador de cuadre
    // ("Faltan/Sobran X cajas") guía el ajuste manual de la diferencia.
    const sinTocar = pallets.every(p =>
      p.calibres.length === 1 && Number(p.calibres[0].size) === 200 &&
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
    const size = plu ? 230 : Number(opcion);
    setPallets(prev => prev.map((p, i) => i !== pi ? p : {
      ...p, calibres: p.calibres.map((c, j) => j !== ci ? c : { ...c, size, plu }),
    }));
  };
  const addCal = (pi) =>
    setPallets(prev => prev.map((p, i) => i !== pi ? p : {
      ...p, calibres: [...p.calibres, { size:200, cajas:0, predio:"", ica:"", plu:false }],
    }));
  const removeCal = (pi, ci) =>
    setPallets(prev => prev.map((p, i) => (i !== pi || p.calibres.length <= 1) ? p : {
      ...p, calibres: p.calibres.filter((_, j) => j !== ci),
    }));

  const palletSum  = (p)   => p.calibres.reduce((s, c) => s + Number(c.cajas || 0), 0);
  const palletById = (pid) => pallets.find(p => p.id === pid);
  const selPalletIdx = selPid !== null ? pallets.findIndex(p => p.id === selPid) : -1;

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
    const mainCal  = COL_CAL[p.calibres[0].size] || COL_CAL[200];
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
              const mainCal  = COL_CAL[p.calibres[0].size] || COL_CAL[200];
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
        <td class="pi">${(admin.ispm15 || "CO-68-001 HT").replace(" ", "<br>")}</td><td class="pd">${fmtDate(admin.packingDate)}</td>
        <td class="sep"></td>
        <td class="pc">Pallet ${pr.id}</td><td class="ps">${pr.size}</td>
        <td class="pi">${(admin.ispm15 || "CO-68-001 HT").replace(" ", "<br>")}</td><td class="pd">${fmtDate(admin.packingDate)}</td>
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
  const generarInformePlanta = async () => {
    setGenerandoInformePlanta(true);
    try {
      // ── Resumen de cajas por calibre — barras horizontales a color ──
      const sizeQty = Object.fromEntries(CALIBRES.map(c => [c, 0]));
      pallets.forEach(p => p.calibres.forEach(c => {
        const s = c.size !== "" && c.size != null ? Number(c.size) : null;
        if (s !== null) sizeQty[s] = (sizeQty[s] || 0) + Number(c.cajas || 0);
      }));
      const totalCal   = Object.values(sizeQty).reduce((a, b) => a + b, 0);
      const maxCal     = Math.max(...Object.values(sizeQty), 1);
      const calibresConCajas = CALIBRES.slice().sort((a, b) => b - a).filter(s => sizeQty[s] > 0);
      const filasCalibre = CALIBRES.slice().sort((a, b) => b - a).map(s => {
        const qty    = sizeQty[s];
        const pct    = totalCal ? Math.round(qty / totalCal * 100) : 0;
        const barPct = Math.round(qty / maxCal * 100);
        const col    = COL_CAL[s]?.bg || "#94a3b8";
        return `<div class="cal-row">
          <div class="cal-tag" style="background:${col}">${s}</div>
          <div class="cal-bar-track"><div class="cal-bar" style="width:${qty ? Math.max(barPct, 3) : 0}%;background:${col}"></div></div>
          <div class="cal-qty">${qty.toLocaleString("es-CO")} cj</div>
          <div class="cal-pct">${pct}%</div>
        </div>`;
      }).join("");
      const chipsCalibre = calibresConCajas.map(s =>
        `<span class="cal-chip" style="background:${COL_CAL[s]?.light || "#f1f5f9"};color:${COL_CAL[s]?.bg || "#475569"};border-color:${COL_CAL[s]?.border || "#cbd5e1"}">${s}</span>`
      ).join("");

      // ── Detalle por pallet — tarjetas, no tabla plana ──
      const pallCards = pallets.map(p => {
        const sum   = palletSum(p);
        const ok    = sum === cpp;
        const chips = p.calibres.map(c => {
          const col = COL_CAL[c.size]?.bg || "#94a3b8";
          return `<span class="pchip" style="border-color:${col}66;color:${col}">${c.plu ? `${c.size}PLU` : (c.size ?? "—")} <b>${c.cajas || 0}cj</b></span>`;
        }).join("");
        const observacion = p.calibres.find(c => c.predio)?.predio;
        // ICA del pallet: el propio de cada calibre si lo tiene, si no cae al
        // ICA general de Paso 1 — así un pallet con su propio registro no se
        // pisa, pero el resto queda cubierto sin escribirlo uno por uno.
        const icasPallet = [...new Set(p.calibres.map(c => c.ica || admin.icaGeneral).filter(Boolean))];
        return `<div class="pallet-card ${ok ? "" : "warn"}">
          <div class="pallet-top"><span class="pid">Pallet ${p.id}</span><span class="pflag">${ok ? "✓ cuadra" : `⚠ ${sum}/${cpp}`}</span></div>
          <div class="pchips">${chips}</div>
          ${observacion ? `<div class="ppredio">📝 ${observacion}</div>` : ""}
          ${icasPallet.length ? `<div class="pica">🏷 ICA ${icasPallet.join(" · ")}</div>` : ""}
        </div>`;
      }).join("");
      const pallOk = pallets.filter(p => palletSum(p) === cpp).length;

      // ── ICA(s) usados en todo el contenedor — para el encabezado ──
      const icasUsados = [...new Set(
        pallets.flatMap(p => p.calibres.map(c => c.ica || admin.icaGeneral)).filter(Boolean)
      )];
      const chipsIca = icasUsados.map(ica => `<span class="chip">🏷 ICA ${ica}</span>`).join("");

      // ── Checklist: por categoría, con contador propio y estado por ítem ──
      const chequeos    = admin.checklistCalidad || {};
      const marcados    = Object.values(chequeos).filter(Boolean).length;
      const conNo       = Object.values(chequeos).filter(v => v === "no").length;
      const pctRevisado = CHEQUEO_TOTAL_ITEMS ? Math.round(marcados / CHEQUEO_TOTAL_ITEMS * 100) : 0;
      const estadoGeneral = conNo > 0
        ? { txt: `⚠️ ${conNo} punto${conNo !== 1 ? "s" : ""} sin cumplir — requiere revisión`, col: "#c62828", bg: "#fdecea" }
        : marcados === CHEQUEO_TOTAL_ITEMS
          ? { txt: "✅ Checklist completo — todo en orden", col: "#1D6F42", bg: "#e9f7ef" }
          : { txt: `🕓 Checklist en curso — ${marcados}/${CHEQUEO_TOTAL_ITEMS} ítems revisados`, col: "#a06600", bg: "#fdf6e3" };

      const seccionesChequeo = CHECKLIST_CALIDAD_CARGUE.map(grupo => {
        const marcadosCat = grupo.items.filter(([k]) => chequeos[k]).length;
        const noCat       = grupo.items.filter(([k]) => chequeos[k] === "no").length;
        const filas = grupo.items.map(([key, label]) => {
          const val   = chequeos[key];
          const icon  = val === "si" ? "✅" : val === "no" ? "❌" : "▫️";
          const badge = val === "si" ? `<span class="ok">Sí cumple</span>`
                      : val === "no" ? `<span class="bad">No cumple</span>`
                      : `<span class="pend">Sin revisar</span>`;
          return `<div class="chk-row"><span class="chk-icon">${icon}</span><span class="chk-label">${label}</span>${badge}</div>`;
        }).join("");
        return `<div class="chk-cat ${noCat > 0 ? "hasbad" : ""}">
          <div class="chk-cat-hdr"><span>${grupo.icon} ${grupo.cat}</span><span class="chk-cat-count">${marcadosCat}/${grupo.items.length}</span></div>
          ${filas}
        </div>`;
      }).join("");

      // ── Logo (helper compartido) ──
      const logoSrc = await cargarLogoBase64();

      const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Informe Planta — ${admin.container || contenedor?.numContenedor || ""}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,sans-serif;color:#1e2b1e;background:#f4f7f3;font-size:12px}
.sheet{max-width:960px;margin:0 auto;background:#fff}

/* ── Banner ── */
.banner{background:linear-gradient(120deg,#173d1a,#2d7a2d 60%,#3fa142);color:#fff;padding:30px 34px 26px;position:relative;overflow:hidden}
.banner::after{content:"🍋";position:absolute;right:-10px;top:-22px;font-size:130px;opacity:0.12;transform:rotate(12deg)}
.banner-row{display:flex;align-items:center;justify-content:space-between;gap:16px;position:relative}
.banner img{width:58px;height:58px;object-fit:contain;background:#fff;border-radius:12px;padding:6px;box-shadow:0 4px 14px rgba(0,0,0,0.25)}
.banner h1{font-size:22px;font-weight:800;letter-spacing:0.2px}
.banner .sub{font-size:11.5px;opacity:0.88;margin-top:4px}
.banner .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;position:relative}
.banner .chip{background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.28);border-radius:20px;padding:5px 12px;font-size:10.5px;font-weight:600}

/* ── Estado general ── */
.estado-bar{margin:0 34px;margin-top:-16px;position:relative;background:${estadoGeneral.bg};border:1px solid ${estadoGeneral.col}33;color:${estadoGeneral.col};border-radius:12px;padding:12px 18px;font-weight:700;font-size:12.5px;box-shadow:0 6px 18px rgba(0,0,0,0.08)}

.content{padding:28px 34px 8px}

/* ── KPI cards ── */
.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:26px}
.card{background:#fbfdfb;border:1px solid #e2ede2;border-radius:12px;padding:14px 10px;text-align:center}
.card-ic{font-size:16px;margin-bottom:2px}
.card-val{font-size:18px;font-weight:800;color:#1f5c1f;line-height:1.15}
.card-lbl{font-size:8.5px;color:#4a564a;margin-top:4px;text-transform:uppercase;letter-spacing:0.4px;font-weight:700}
.card.warn .card-val{color:#c62828}

h2{display:flex;align-items:center;gap:8px;color:#173d1a;font-size:13.5px;font-weight:800;margin:26px 0 12px;text-transform:uppercase;letter-spacing:0.3px}
h2::after{content:"";flex:1;height:1px;background:#dfe8df}

/* ── Calibres: barras ── */
.cal-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.cal-chip{border:1px solid;border-radius:8px;padding:3px 10px;font-size:10.5px;font-weight:800}
.cal-row{display:flex;align-items:center;gap:10px;margin-bottom:7px}
.cal-tag{width:34px;height:24px;border-radius:6px;color:#fff;font-weight:800;font-size:10.5px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cal-bar-track{flex:1;height:14px;background:#eef2ee;border-radius:7px;overflow:hidden}
.cal-bar{height:100%;border-radius:7px}
.cal-qty{width:70px;text-align:right;font-size:10.5px;font-weight:700;color:#333;flex-shrink:0}
.cal-pct{width:36px;text-align:right;font-size:10.5px;color:#3f4a3f;font-weight:600;flex-shrink:0}
.cal-total{margin-top:10px;padding-top:10px;border-top:1px dashed #dfe8df;display:flex;justify-content:space-between;font-weight:800;font-size:12px;color:#173d1a}

/* ── Pallets: grid de tarjetas ── */
.pallet-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.pallet-card{border:1px solid #dfe8df;border-left:4px solid #2d8a2d;border-radius:10px;padding:9px 11px;background:#fbfdfb;break-inside:avoid}
.pallet-card.warn{border-left-color:#e08a1e;background:#fffaf2}
.pallet-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.pid{font-weight:800;font-size:11px;color:#173d1a}
.pflag{font-size:9px;font-weight:700;color:#2d8a2d}
.pallet-card.warn .pflag{color:#c9720e}
.pchips{display:flex;flex-wrap:wrap;gap:4px}
.pchip{border:1px solid;border-radius:6px;padding:2px 6px;font-size:9px;font-weight:600}
.ppredio{margin-top:6px;font-size:9px;color:#222;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pica{margin-top:3px;font-size:9px;color:#2d8a2d;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── Checklist ── */
.chk-cat{border:1px solid #dfe8df;border-left:4px solid #2d8a2d;border-radius:10px;padding:12px 16px;margin-bottom:10px;break-inside:avoid}
.chk-cat.hasbad{border-left-color:#c62828}
.chk-cat-hdr{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:11.5px;color:#173d1a;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.3px}
.chk-cat-count{background:#eef2ee;color:#3a4a3a;border-radius:10px;padding:2px 9px;font-size:10px;font-weight:700}
.chk-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f1f5f1;font-size:11px}
.chk-row:last-child{border-bottom:none}
.chk-icon{font-size:11px;flex-shrink:0}
.chk-label{flex:1;color:#333}
.ok{color:#1D6F42;font-weight:800;font-size:10.5px}
.bad{color:#c62828;font-weight:800;font-size:10.5px}
.pend{color:#6b6b6b;font-style:italic;font-weight:700;font-size:10.5px}

/* ── Observaciones + firma ── */
.obs{background:#fbfdfb;border:1px solid #e2ede2;border-left:4px solid #3fa142;border-radius:10px;padding:12px 16px;font-size:11.5px;margin-top:4px;white-space:pre-wrap;color:#333}
.firma-row{display:flex;gap:20px;margin-top:26px}
.firma-box{flex:1}
.firma-line{border-bottom:1.5px solid #b8c8b8;height:34px}
.firma-lbl{font-size:10px;color:#3a4a3a;margin-top:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px}
.firma-val{font-size:12px;color:#222;font-weight:600;margin-top:2px}

/* ── Footer ── */
.footer{background:#173d1a;color:rgba(255,255,255,0.85);text-align:center;font-size:10px;padding:16px;margin-top:30px}

@media print{
  body{background:#fff}
  .sheet{max-width:100%}
  .banner::after{display:none}
  @page{size:A4;margin:10mm}
}
</style></head><body>
<div class="sheet">

  <div class="banner">
    <div class="banner-row">
      <div>
        <h1>📦 Informe de Planta</h1>
        <div class="sub">Calibres, distribución de pallets y Control de Calidad y Cargue</div>
      </div>
      ${logoSrc ? `<img src="${logoSrc}" />` : ""}
    </div>
    <div class="chips">
      <span class="chip">🚢 ${admin.container || contenedor?.numContenedor || "—"}</span>
      <span class="chip">📅 ${fmtDate(admin.packingDate) || new Date().toLocaleDateString("es-CO")}</span>
      <span class="chip">🏭 ${admin.checklistPlanta || "Planta sin especificar"}</span>
      <span class="chip">🍋 ${contenedor?.producto || "Producto sin especificar"}</span>
      <span class="chip">➡️ ${admin.destino || "—"}</span>
      ${chipsIca}
    </div>
  </div>

  <div class="estado-bar">${estadoGeneral.txt}</div>

  <div class="content">

    <div class="cards">
      <div class="card"><div class="card-ic">📦</div><div class="card-val">${totalCajas.toLocaleString("es-CO")}</div><div class="card-lbl">Total cajas</div></div>
      <div class="card"><div class="card-ic">🧱</div><div class="card-val">${pallOk}/${pallets.length}</div><div class="card-lbl">Pallets cuadrados</div></div>
      <div class="card"><div class="card-ic">🎨</div><div class="card-val">${calibresConCajas.length}</div><div class="card-lbl">Calibres en uso</div></div>
      <div class="card"><div class="card-ic">✅</div><div class="card-val">${pctRevisado}%</div><div class="card-lbl">Checklist revisado</div></div>
      <div class="card ${conNo > 0 ? "warn" : ""}"><div class="card-ic">${conNo > 0 ? "⚠️" : "🎉"}</div><div class="card-val">${conNo}</div><div class="card-lbl">Puntos con "NO"</div></div>
    </div>

    <h2>📊 Resumen de cajas por calibre</h2>
    <div class="cal-chips">${chipsCalibre}</div>
    ${filasCalibre}
    <div class="cal-total"><span>TOTAL</span><span>${totalCal.toLocaleString("es-CO")} cajas</span></div>

    <h2>🧱 Distribución por pallet (${pallets.length})</h2>
    <div class="pallet-grid">${pallCards}</div>

    <h2>✅ Checklist Control de Calidad y Cargue</h2>
    ${seccionesChequeo}

    ${admin.checklistObs ? `<h2>📝 Observaciones generales</h2><div class="obs">${admin.checklistObs}</div>` : ""}

    <div class="firma-row">
      <div class="firma-box">
        <div class="firma-line"></div>
        <div class="firma-lbl">Responsable</div>
        <div class="firma-val">${admin.checklistResponsable || "—"}</div>
      </div>
      <div class="firma-box">
        <div class="firma-line"></div>
        <div class="firma-lbl">Cargo</div>
        <div class="firma-val">${admin.checklistCargo || "—"}</div>
      </div>
    </div>

  </div>

  <div class="footer">Tierra Prometida Trading 🍋 · JARVIS · Informe generado el ${new Date().toLocaleDateString("es-CO")}</div>
</div>
</body></html>`;

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `Informe-Planta-${admin.container || contenedor?.numContenedor || "packing"}.html`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(u);
    } finally {
      setGenerandoInformePlanta(false);
    }
  };

  // ── Informe general Paso 2 — Cargue del camión ──────────────────
  const [generandoInformeCargue, setGenerandoInformeCargue] = useState(false);
  const generarInformeCargue = async () => {
    setGenerandoInformeCargue(true);
    try {
      const logoSrc = await cargarLogoBase64();

      // Resumen de cajas por calibre (mismo cálculo que el informe de planta)
      const sizeQty = Object.fromEntries(CALIBRES.map(c => [c, 0]));
      pallets.forEach(p => p.calibres.forEach(c => {
        const s = c.size !== "" && c.size != null ? Number(c.size) : null;
        if (s !== null) sizeQty[s] = (sizeQty[s] || 0) + Number(c.cajas || 0);
      }));
      const totalCal = Object.values(sizeQty).reduce((a, b) => a + b, 0);
      const maxCal    = Math.max(...Object.values(sizeQty), 1);
      const calibresConCajas = CALIBRES.slice().sort((a, b) => b - a).filter(s => sizeQty[s] > 0);
      const filasCalibre = CALIBRES.slice().sort((a, b) => b - a).map(s => {
        const qty    = sizeQty[s];
        const pct    = totalCal ? Math.round(qty / totalCal * 100) : 0;
        const barPct = Math.round(qty / maxCal * 100);
        const col    = COL_CAL[s]?.bg || "#94a3b8";
        return `<div class="cal-row">
          <div class="cal-tag" style="background:${col}">${s}</div>
          <div class="cal-bar-track"><div class="cal-bar" style="width:${qty ? Math.max(barPct, 3) : 0}%;background:${col}"></div></div>
          <div class="cal-qty">${qty.toLocaleString("es-CO")} cj</div>
          <div class="cal-pct">${pct}%</div>
        </div>`;
      }).join("");
      const chipsCalibre = calibresConCajas.map(s =>
        `<span class="cal-chip" style="background:${COL_CAL[s]?.light || "#f1f5f9"};color:${COL_CAL[s]?.bg || "#475569"};border-color:${COL_CAL[s]?.border || "#cbd5e1"}">${s}</span>`
      ).join("");

      // Tarjeta de un pallet para el diagrama del camión (fondo → puerta)
      const palletCard = (pid) => {
        const p = palletById(pid);
        if (!p) return `<div class="tk-pallet tk-empty">— vacío —</div>`;
        const sum   = palletSum(p);
        const ok    = sum === cpp;
        const chips = p.calibres.map(c => {
          const col = COL_CAL[c.size]?.bg || "#94a3b8";
          return `<span class="pchip" style="border-color:${col}66;color:${col}">${c.plu ? `${c.size}PLU` : (c.size ?? "—")} <b>${c.cajas || 0}cj</b></span>`;
        }).join("");
        return `<div class="tk-pallet ${ok ? "" : "warn"}">
          <div class="tk-pallet-top"><span class="pid">Pallet ${p.id}</span><span class="pflag">${ok ? "✓" : `⚠ ${sum}/${cpp}`}</span></div>
          <div class="pchips">${chips}</div>
        </div>`;
      };
      const filasIzq = layoutCamion.left.map(palletCard).join("");
      const filasDer = layoutCamion.right.map(palletCard).join("");
      const pallOk   = pallets.filter(p => palletSum(p) === cpp).length;

      const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Informe Cargue Camión — ${admin.container || contenedor?.numContenedor || ""}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,sans-serif;color:#1e2b1e;background:#f4f7f3;font-size:12px}
.sheet{max-width:960px;margin:0 auto;background:#fff}

.banner{background:linear-gradient(120deg,#7a3d05,#c2620a 60%,#e8862c);color:#fff;padding:30px 34px 26px;position:relative;overflow:hidden}
.banner::after{content:"🚛";position:absolute;right:-6px;top:-14px;font-size:120px;opacity:0.14;transform:rotate(-8deg)}
.banner-row{display:flex;align-items:center;justify-content:space-between;gap:16px;position:relative}
.banner img{width:58px;height:58px;object-fit:contain;background:#fff;border-radius:12px;padding:6px;box-shadow:0 4px 14px rgba(0,0,0,0.25)}
.banner h1{font-size:22px;font-weight:800;letter-spacing:0.2px}
.banner .sub{font-size:11.5px;opacity:0.88;margin-top:4px}
.banner .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;position:relative}
.banner .chip{background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.28);border-radius:20px;padding:5px 12px;font-size:10.5px;font-weight:600}

.estado-bar{margin:0 34px;margin-top:-16px;position:relative;background:${todoCuadra ? "#e9f7ef" : "#fdf6e3"};border:1px solid ${todoCuadra ? "#1D6F42" : "#a06600"}33;color:${todoCuadra ? "#1D6F42" : "#a06600"};border-radius:12px;padding:12px 18px;font-weight:700;font-size:12.5px;box-shadow:0 6px 18px rgba(0,0,0,0.08)}

.content{padding:28px 34px 8px}

.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:26px}
.card{background:#fbfaf9;border:1px solid #ede4d9;border-radius:12px;padding:14px 10px;text-align:center}
.card-ic{font-size:16px;margin-bottom:2px}
.card-val{font-size:18px;font-weight:800;color:#c2620a;line-height:1.15}
.card-lbl{font-size:8.5px;color:#8a7c6f;margin-top:4px;text-transform:uppercase;letter-spacing:0.4px}

h2{display:flex;align-items:center;gap:8px;color:#7a3d05;font-size:13.5px;font-weight:800;margin:26px 0 12px;text-transform:uppercase;letter-spacing:0.3px}
h2::after{content:"";flex:1;height:1px;background:#ede4d9}

.info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:8px}
.info-item{background:#fbfaf9;border:1px solid #ede4d9;border-radius:10px;padding:10px 14px}
.info-item .l{font-size:9px;color:#8a7c6f;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px}
.info-item .v{font-size:13px;font-weight:700;color:#2b2013}

.cal-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.cal-chip{border:1px solid;border-radius:8px;padding:3px 10px;font-size:10.5px;font-weight:800}
.cal-row{display:flex;align-items:center;gap:10px;margin-bottom:7px}
.cal-tag{width:34px;height:24px;border-radius:6px;color:#fff;font-weight:800;font-size:10.5px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cal-bar-track{flex:1;height:14px;background:#f1ece5;border-radius:7px;overflow:hidden}
.cal-bar{height:100%;border-radius:7px}
.cal-qty{width:70px;text-align:right;font-size:10.5px;font-weight:700;color:#333;flex-shrink:0}
.cal-pct{width:36px;text-align:right;font-size:10.5px;color:#8a7c6f;flex-shrink:0}
.cal-total{margin-top:10px;padding-top:10px;border-top:1px dashed #ede4d9;display:flex;justify-content:space-between;font-weight:800;font-size:12px;color:#7a3d05}

.truck-label{text-align:center;font-size:10px;font-weight:800;color:#c2620a;letter-spacing:2px;margin:8px 0}
.truck-diagram{display:flex;gap:14px;background:#0f1522;border-radius:14px;padding:16px;border:2px solid #2a3a55}
.truck-col{flex:1;display:flex;flex-direction:column;gap:6px}
.truck-col-lbl{text-align:center;font-size:9px;font-weight:800;color:rgba(232,134,44,0.6);letter-spacing:2px;margin-bottom:2px}
.truck-aisle{width:6px;background:linear-gradient(180deg,rgba(232,134,44,0.15),rgba(232,134,44,0.05),rgba(232,134,44,0.15));border-radius:3px;flex-shrink:0}
.tk-pallet{border:1px solid #33415a;border-left:4px solid #e8862c;border-radius:9px;padding:8px 10px;background:#161d2b;break-inside:avoid}
.tk-pallet.warn{border-left-color:#f2b705}
.tk-pallet.tk-empty{color:rgba(255,255,255,0.25);text-align:center;font-size:10px;padding:12px;border-style:dashed}
.tk-pallet-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
.tk-pallet-top .pid{font-weight:800;font-size:10.5px;color:#f3e9dc}
.tk-pallet-top .pflag{font-size:8.5px;font-weight:700;color:#4ade80}
.tk-pallet.warn .pflag{color:#f2b705}
.pchips{display:flex;flex-wrap:wrap;gap:4px}
.pchip{border:1px solid;border-radius:6px;padding:2px 6px;font-size:8.5px;font-weight:600;background:rgba(255,255,255,0.04)}

.obs{background:#fbfaf9;border:1px solid #ede4d9;border-left:4px solid #e8862c;border-radius:10px;padding:12px 16px;font-size:11.5px;margin-top:4px;white-space:pre-wrap;color:#333}
.firma-row{display:flex;gap:20px;margin-top:26px}
.firma-box{flex:1}
.firma-line{border-bottom:1.5px solid #d8c8b8;height:34px}
.firma-lbl{font-size:10px;color:#8a7c6f;margin-top:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px}
.firma-val{font-size:12px;color:#222;font-weight:600;margin-top:2px}

.footer{background:#7a3d05;color:rgba(255,255,255,0.72);text-align:center;font-size:10px;padding:16px;margin-top:30px}

@media print{
  body{background:#fff}
  .sheet{max-width:100%}
  .banner::after{display:none}
  @page{size:A4;margin:10mm}
}
</style></head><body>
<div class="sheet">

  <div class="banner">
    <div class="banner-row">
      <div>
        <h1>🚛 Informe de Cargue del Camión</h1>
        <div class="sub">Distribución de pallets, calibres y datos de transporte</div>
      </div>
      ${logoSrc ? `<img src="${logoSrc}" />` : ""}
    </div>
    <div class="chips">
      <span class="chip">🚢 ${admin.container || contenedor?.numContenedor || "—"}</span>
      <span class="chip">📅 ${fmtDate(admin.fechaCargue) || new Date().toLocaleDateString("es-CO")}</span>
      <span class="chip">🚛 ${admin.empresaTransporte || "Transportadora sin especificar"}</span>
      <span class="chip">🪧 ${admin.placa || "Sin placa"}</span>
      <span class="chip">➡️ ${admin.destino || "—"}</span>
    </div>
  </div>

  <div class="estado-bar">${todoCuadra ? "✅ Distribución cuadrada — todas las cajas asignadas" : `⚠️ Faltan cuadrar cajas — ${totalConf}/${totalCajas} distribuidas`}</div>

  <div class="content">

    <div class="cards">
      <div class="card"><div class="card-ic">📦</div><div class="card-val">${totalCajas.toLocaleString("es-CO")}</div><div class="card-lbl">Total cajas</div></div>
      <div class="card"><div class="card-ic">🧱</div><div class="card-val">${pallOk}/${pallets.length}</div><div class="card-lbl">Pallets cuadrados</div></div>
      <div class="card"><div class="card-ic">🎨</div><div class="card-val">${calibresConCajas.length}</div><div class="card-lbl">Calibres en uso</div></div>
      <div class="card"><div class="card-ic">🕐</div><div class="card-val">${admin.horaCargue || "—"}</div><div class="card-lbl">Hora de cargue</div></div>
      <div class="card"><div class="card-ic">🕓</div><div class="card-val">${admin.horaSalida || "—"}</div><div class="card-lbl">Hora de salida</div></div>
    </div>

    <h2>🚚 Datos del transporte</h2>
    <div class="info-grid">
      <div class="info-item"><div class="l">Empresa transporte</div><div class="v">${admin.empresaTransporte || "—"}</div></div>
      <div class="info-item"><div class="l">Placa</div><div class="v">${admin.placa || "—"}</div></div>
      <div class="info-item"><div class="l">Trailer</div><div class="v">${admin.trailer || "—"}</div></div>
      <div class="info-item"><div class="l">Conductor</div><div class="v">${admin.conductor || "—"}</div></div>
      <div class="info-item"><div class="l">Supervisor de cargue</div><div class="v">${admin.supervisorCargue || "—"}</div></div>
      <div class="info-item"><div class="l">Fecha de cargue</div><div class="v">${fmtDate(admin.fechaCargue) || "—"}</div></div>
    </div>

    <h2>🌡 Termoregistro, precinto y temperatura</h2>
    <div class="info-grid">
      <div class="info-item"><div class="l">Termoregistro${admin.termoregistroCamionPalletNo ? ` — Pallet #${admin.termoregistroCamionPalletNo}` : ""}</div><div class="v">${admin.termoregistroCamion || "—"}</div></div>
      <div class="info-item"><div class="l">N° de precinto</div><div class="v">${admin.precintoCamion || "—"}</div></div>
      <div class="info-item"><div class="l">Temp. de llegada</div><div class="v">${admin.tempLlegadaCamion ? `${admin.tempLlegadaCamion}°C` : "—"}</div></div>
      <div class="info-item"><div class="l">Temp. de salida</div><div class="v">${admin.tempSalidaCamion ? `${admin.tempSalidaCamion}°C` : "—"}</div></div>
    </div>
    ${(admin.icaCamion || []).some(c => c.ica) ? `
    <div class="info-grid">
      ${admin.icaCamion.filter(c => c.ica).map(c => `<div class="info-item"><div class="l">ICA${c.palletNo ? ` — Pallet #${c.palletNo}` : ""}</div><div class="v">${c.ica}</div></div>`).join("")}
    </div>` : ""}

    <h2>📊 Resumen de cajas por calibre</h2>
    <div class="cal-chips">${chipsCalibre}</div>
    ${filasCalibre}
    <div class="cal-total"><span>TOTAL</span><span>${totalCal.toLocaleString("es-CO")} cajas</span></div>

    <h2>🚛 Distribución en el camión</h2>
    <div class="truck-label">▲ FONDO DEL CAMIÓN</div>
    <div class="truck-diagram">
      <div class="truck-col"><div class="truck-col-lbl">◀ IZQUIERDA</div>${filasIzq}</div>
      <div class="truck-aisle"></div>
      <div class="truck-col"><div class="truck-col-lbl">DERECHA ▶</div>${filasDer}</div>
    </div>
    <div class="truck-label">▼ PUERTA TRASERA</div>

    <div class="firma-row">
      <div class="firma-box">
        <div class="firma-line"></div>
        <div class="firma-lbl">Conductor</div>
        <div class="firma-val">${admin.conductor || "—"}</div>
      </div>
      <div class="firma-box">
        <div class="firma-line"></div>
        <div class="firma-lbl">Supervisor de cargue</div>
        <div class="firma-val">${admin.supervisorCargue || "—"}</div>
      </div>
    </div>

  </div>

  <div class="footer">Tierra Prometida Trading 🍋 · JARVIS · Informe generado el ${new Date().toLocaleDateString("es-CO")}</div>
</div>
</body></html>`;

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `Informe-Cargue-${admin.container || contenedor?.numContenedor || "packing"}.html`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(u);
    } finally {
      setGenerandoInformeCargue(false);
    }
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
                onClick={() => done && setFase(step.n)}
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
                  const mainCal = COL_CAL[p.calibres[0].size] || COL_CAL[200];
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
                <div style={{ fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.25)", marginTop:4 }}>Peso/caja: {PESO_STR} · LIMON TAHITI · Categoría 1</div>
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

            <button onClick={generarInformePlanta} disabled={generandoInformePlanta} style={{ width:"100%", background:"linear-gradient(135deg,#1f5c1f,#2d8a2d)", border:"none", borderRadius:10, padding: m ? "15px" : "11px", fontSize: m ? 15 : 12, color:"white", cursor: generandoInformePlanta ? "wait" : "pointer", fontWeight:700, opacity: generandoInformePlanta ? 0.7 : 1, minHeight: m ? 52 : 38, marginBottom: m ? 14 : 10 }}>
              {generandoInformePlanta ? "⏳ Generando..." : "📄 Descargar Informe General (Calibres + Checklist)"}
            </button>

            <div style={{ display:"flex", gap:8, paddingTop: m ? 0 : 0, alignItems:"center" }}>
              <SaveIndicator />
              <div style={{ flex:1, display:"flex", gap:8 }}>
                <NavBtn onClick={() => guardarPaso1(false)}>💾 Guardar</NavBtn>
                <NavBtn primary onClick={async () => { setSelPid(null); await guardarPaso1(true); setFase(2); }}>
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

          <button onClick={guardarYActualizarPaso2} disabled={guardando} style={{ width:"100%", background:"linear-gradient(135deg,#0EA5E9,#0284C7)", border:"none", borderRadius:10, padding: m ? "15px" : "11px", fontSize: m ? 15 : 12, color:"white", cursor: guardando ? "wait" : "pointer", fontWeight:700, opacity: guardando ? 0.7 : 1, minHeight: m ? 52 : 38, marginBottom: 4 }}>
            🔄 Guardar y actualizar información
          </button>
          <div style={{ fontSize: m ? 11 : 10, color: infoActualizada ? "#00C9A7" : "rgba(255,255,255,0.4)", textAlign:"center", marginBottom: m ? 14 : 10 }}>
            {infoActualizada ? "✅ Calibres y cajas actualizados desde Planta — el orden del camión no se movió" : "Trae los calibres/cajas más recientes de Planta sin mover el orden ya armado en el camión"}
          </div>

          <button onClick={generarInformeCargue} disabled={generandoInformeCargue} style={{ width:"100%", background:"linear-gradient(135deg,#c2620a,#e8862c)", border:"none", borderRadius:10, padding: m ? "15px" : "11px", fontSize: m ? 15 : 12, color:"white", cursor: generandoInformeCargue ? "wait" : "pointer", fontWeight:700, opacity: generandoInformeCargue ? 0.7 : 1, minHeight: m ? 52 : 38, marginBottom: m ? 14 : 10 }}>
            {generandoInformeCargue ? "⏳ Generando..." : "📄 Descargar Informe de Cargue"}
          </button>

          <div style={{ display:"flex", gap:8, paddingTop: m ? 0 : 0, alignItems:"center" }}>
            <SaveIndicator />
            <div style={{ flex:1, display:"flex", gap:8 }}>
              <NavBtn onClick={() => setFase(1)}>← Volver</NavBtn>
              <NavBtn onClick={() => guardarPaso2(false)}>💾 Guardar</NavBtn>
              <NavBtn primary onClick={async () => { await guardarPaso2(true); setFase(3); }}>
                Continuar a Contenedor →
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
                <input value={admin.ispm15} onChange={e => sa("ispm15", e.target.value)} placeholder="CO-68-001 HT" style={inp} />
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
              <NavBtn onClick={() => setFase(2)}>← Volver a Camión</NavBtn>
              <NavBtn onClick={() => guardarPaso3()}>💾 Guardar</NavBtn>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
