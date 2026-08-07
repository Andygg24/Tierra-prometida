import { useState, useRef, useEffect, useMemo, createContext, useContext } from "react";
import { supabase } from "./supabase.js";
import { usePersonal } from "./hooks/usePersonal.js";
import { useAsistencia } from "./hooks/useAsistencia.js";
import { useContenedores } from "./hooks/useContenedores.js";
import { useInventario } from "./hooks/useInventario.js";
import { useLiquidaciones } from "./hooks/useLiquidaciones.js";
import { useConfiguracion } from "./hooks/useConfiguracion.js";
import PackingListTab from "./components/PackingListTab.jsx";
import RecepcionesTab from "./components/RecepcionesTab.jsx";
import LogisticaTab from "./components/LogisticaTab.jsx";
import ControlExpoTab from "./components/ControlExpoTab.jsx";
import CanastillasTab from "./components/CanastillasTab.jsx";
import PalletVerificationTab from "./components/PalletVerificationTab.jsx";
import { usePackingList } from "./hooks/usePackingList.js";
import { useLogistica, calcularAlertasLogistica } from "./hooks/useLogistica.js";
import { fechaLocalISO, diferenciaDiasLocal } from "./utils/dates.js";
import CustomSelect from "./components/CustomSelect.jsx";
import LimonLoader from "./components/LimonLoader.jsx";

// ─── CONTEXTO RESPONSIVE ─────────────────────────────────────
const MobCtx   = createContext(false);
const SmallCtx = createContext(false);
const useM = () => useContext(MobCtx);
const useS = () => useContext(SmallCtx);

// ─── UTILIDADES ──────────────────────────────────────────────
const fmtCOP = (v) => `$ ${Math.round(v).toLocaleString("es-CO")}`;

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

// ─── DATOS BASE ───────────────────────────────────────────────
const VALOR_CONTENEDOR = 180000;
const QUINCENA_DESCARGUE = 1000000;
const SALARIO_MINIMO = 1750000;

const PROCESO_BASE = [
  { name: "Miguel Rodríguez", area: "Alimentador", banco: "Nequi", cuenta: "3203228384" },
  { name: "Yuliana Castillo", area: "Selección", banco: "Nequi", cuenta: "3203352730" },
  { name: "Yanet Bautista", area: "Selección", banco: "Nequi", cuenta: "3001767022" },
  { name: "YoxeLis Marcano", area: "Empaque", banco: "Nequi", cuenta: "3009991749" },
  { name: "Elvis López", area: "Empaque", banco: "Nequi", cuenta: "3136447114" },
  { name: "Daniela Bracho", area: "Empaque", banco: "Nequi", cuenta: "3183289317" },
  { name: "Jessimar Terán", area: "Empaque", banco: "Nequi", cuenta: "3170202942" },
  { name: "Yumilys Marcano", area: "Empaque", banco: "Nequi", cuenta: "3172434608" },
  { name: "Edimar Hernández", area: "Empaque", banco: "Nequi", cuenta: "3106228123" },
  { name: "Gisela Sánchez", area: "Empaque", banco: "Nequi", cuenta: "3153686197" },
  { name: "Milena Garridos", area: "Empaque", banco: "Nequi", cuenta: "3143363829" },
  { name: "Jesus Quintero", area: "Pesador", banco: "Nequi", cuenta: "3158951478" },
  { name: "Dairo Pérez", area: "Pesador", banco: "Nequi", cuenta: "3244309535" },
  { name: "Gerardo Jiménez", area: "Cajas", banco: "Nequi", cuenta: "3245425578" },
  { name: "Sebastian García", area: "Paletizador", banco: "Nequi", cuenta: "3507810901" },
  { name: "Yerson Cárdenas", area: "Paletizador", banco: "Nequi", cuenta: "3138773881" },
  { name: "Oscar Perez", area: "Empaque", banco: "Bancolombia", cuenta: "3184591161" },
  { name: "Pablo Sierra", area: "Empaque", banco: "Bancolombia", cuenta: "3124566428" },
];

const EMPLEADOS_DB = [
  { no:1, nombre:"Miguel Angel Rodriguez Rincon", doc:"CC Venezuela", num:"26694253", tel:"3203228384", area:"Alimentador", banco:"Nequi", cuenta:"3203228384" },
  { no:2, nombre:"Yuliana Andrea Castillo Molina", doc:"CC Nacional", num:"1007413088", tel:"3189647338", area:"Selección", banco:"Nequi", cuenta:"3203352730" },
  { no:3, nombre:"Yrma Rosa Hernandez Alvarez", doc:"PPT", num:"6439889", tel:"3023371700", area:"PLU", banco:"Nequi", cuenta:"3222386672" },
  { no:4, nombre:"Roger Jose Brito Rosas", doc:"CC Venezuela", num:"24501119", tel:"3244046005", area:"Cajas", banco:"Nequi", cuenta:"3188429126" },
  { no:5, nombre:"Maria Jose Suarez Serrano", doc:"CC Nacional", num:"1099736037", tel:"3152290981", area:"Cajas", banco:"Nequi", cuenta:"3152290981" },
  { no:6, nombre:"YoxeLis Teresa Marcano Gutierrez", doc:"CC Venezuela", num:"20312508", tel:"3118472208", area:"Empaque", banco:"Nequi", cuenta:"3009991749" },
  { no:7, nombre:"Elvis Gabriel Lopez Lopez", doc:"PPT", num:"993452", tel:"3136447114", area:"Empaque", banco:"Nequi", cuenta:"3136447114" },
  { no:8, nombre:"Gehiner Daniela Bracho Lopez", doc:"PPT", num:"3403729", tel:"3183289317", area:"Empaque", banco:"Nequi", cuenta:"3183289317" },
  { no:9, nombre:"Jessimar Karina Teran Diaz", doc:"PPT", num:"4583258", tel:"3101977950", area:"Empaque", banco:"Nequi", cuenta:"3170202942" },
  { no:10, nombre:"Yumilys Susana Marcano Gutierrez", doc:"CC Venezuela", num:"20312506", tel:"3187400888", area:"Empaque", banco:"Nequi", cuenta:"3172434608" },
  { no:11, nombre:"Edimar Luzmari Hernandez Sanchez", doc:"PPT", num:"5648489", tel:"3106228123", area:"Empaque", banco:"Nequi", cuenta:"3106228123" },
  { no:12, nombre:"Gisela Josefina Sanchez", doc:"PPT", num:"5407490", tel:"3153686197", area:"Empaque", banco:"Nequi", cuenta:"3153686197" },
  { no:13, nombre:"Sandra Milena Garridos Lizcano", doc:"CC Nacional", num:"1098686754", tel:"3143363829", area:"Empaque", banco:"Nequi", cuenta:"3143363829" },
  { no:14, nombre:"Jesus Manuel Quintero", doc:"PPT", num:"6647779", tel:"3134933691", area:"Pesador", banco:"Nequi", cuenta:"3158951478" },
  { no:15, nombre:"Dairo Andres Perez Alvarez", doc:"CC Nacional", num:"10993704", tel:"3244309535", area:"Pesador", banco:"Nequi", cuenta:"3244309535" },
  { no:16, nombre:"Gerardo José Jimenéz Castañeda", doc:"PPT", num:"4990236", tel:"3245425578", area:"Cajas", banco:"Nequi", cuenta:"3245425578" },
  { no:17, nombre:"Sebastian García Arismendi", doc:"PPT", num:"6945629", tel:"3507810901", area:"Paletizador", banco:"Nequi", cuenta:"3507810901" },
  { no:18, nombre:"Yerson Cárdenas Gómez", doc:"CC Nacional", num:"1065909514", tel:"3175521445", area:"Paletizador", banco:"Nequi", cuenta:"3138773881" },
  { no:19, nombre:"Yaneth Bautista Guevara", doc:"CC Nacional", num:"1099367342", tel:"3152293848", area:"Selección", banco:"Nequi", cuenta:"3001767022" },
  { no:20, nombre:"Roxana Yamileth Hernandez Rivera", doc:"PPT", num:"22553558", tel:"3181558410", area:"Empaque", banco:"Nequi", cuenta:"3161693312" },
  { no:21, nombre:"Oscar Perez Rios", doc:"CC Nacional", num:"109937629", tel:"3184591161", area:"Empaque", banco:"Bancolombia", cuenta:"3184591161" },
  { no:22, nombre:"Jhanneth Gutierrez", doc:"CC Nacional", num:"228822356", tel:"1099354423", area:"Empaque", banco:"Nequi", cuenta:"3148674711" },
  { no:23, nombre:"Emily Sulimar Zanez", doc:"PPT", num:"7123487", tel:"3503064571", area:"Empaque", banco:"Nequi", cuenta:"3503064571" },
  { no:24, nombre:"Yolis Tibisay Ortiz Lopéz", doc:"PPT", num:"1552095", tel:"3162068305", area:"Empaque", banco:"Nequi", cuenta:"3224410126" },
  { no:25, nombre:"Thaisscha Nayleth Lara Hernandez", doc:"PPT", num:"6347776", tel:"3222386672", area:"Empaque", banco:"Nequi", cuenta:"3222386672" },
  { no:26, nombre:"Daniel Landinez", doc:"CC Nacional", num:"1005322656", tel:"3170626375", area:"Empaque", banco:"Nequi", cuenta:"3186970998" },
  { no:27, nombre:"Jose Luis Unda", doc:"PPT", num:"5648441", tel:"3112704726", area:"Empaque", banco:"Nequi", cuenta:"3112704726" },
  { no:28, nombre:"Michell Nohemí Castillo Aguilar", doc:"PPT", num:"6370122", tel:"3175724729", area:"Empaque", banco:"Nequi", cuenta:"3175724729" },
  { no:29, nombre:"Rosa America Lopez", doc:"PPT", num:"12425232", tel:"-", area:"Empaque", banco:"Nequi", cuenta:"-" },
  { no:30, nombre:"Jhon Anderson Ortiz Gutierrez", doc:"CC Nacional", num:"1006097443", tel:"-", area:"Descargador", banco:"Nequi", cuenta:"-" },
  { no:31, nombre:"Dainy Jose Alvarado", doc:"CC Venezuela", num:"34327999", tel:"-", area:"Descargador", banco:"Nequi", cuenta:"-" },
  { no:32, nombre:"Robert Pinto", doc:"PPT", num:"7228447", tel:"-", area:"Descargador", banco:"Nequi", cuenta:"-" },
  { no:33, nombre:"Cristian David Sarmiento Ayala", doc:"CC Nacional", num:"1098629911", tel:"-", area:"Empaque", banco:"Nequi", cuenta:"-" },
  { no:34, nombre:"Anyer Daniel Castillo Seco", doc:"CC Venezuela", num:"32914737", tel:"3138703023", area:"Empaque", banco:"Nequi", cuenta:"-" },
  { no:35, nombre:"Jonny Alejandro Rangel León", doc:"CC Nacional", num:"1097498343", tel:"3003312555", area:"Empaque", banco:"Nequi", cuenta:"-" },
  { no:36, nombre:"Angela Maria Lopez Lopez", doc:"PPT", num:"1149724", tel:"3177616701", area:"Empaque", banco:"Nequi", cuenta:"3177616701" },
  { no:37, nombre:"Janeth Gomez Saavedra", doc:"CC Nacional", num:"37862715", tel:"3214049035", area:"Empaque", banco:"Nequi", cuenta:"3214049035" },
  { no:38, nombre:"Ludy Gomez Saavedra", doc:"CC Nacional", num:"1098603576", tel:"3225033891", area:"Empaque", banco:"Nequi", cuenta:"3170515267" },
  { no:39, nombre:"Kleiderbe José Milde Lopez", doc:"PPT", num:"5943", tel:"3188265614", area:"Empaque", banco:"Nequi", cuenta:"3188265614" },
  { no:40, nombre:"Pablo Antonio Sierra Huertas", doc:"CC Nacional", num:"1006594377", tel:"3124566428", area:"Empaque", banco:"Bancolombia", cuenta:"3124566428" },
  { no:41, nombre:"Michael Andres Garcia Rojas", doc:"CC Nacional", num:"1007740745", tel:"3183925876", area:"Empaque", banco:"Nequi", cuenta:"3228778485" },
  { no:42, nombre:"Ismael Jesús Villarreal", doc:"PPT", num:"6286546", tel:"3168150582", area:"Empaque", banco:"Nequi", cuenta:"3168150582" },
  { no:43, nombre:"Juan Carlos Quijano Guitierrez", doc:"CC Nacional", num:"1102385242", tel:"3212319004", area:"Empaque", banco:"Nequi", cuenta:"3212319004" },
  { no:44, nombre:"Junior Rodriguez Gamarra", doc:"CC Nacional", num:"1024684884", tel:"3202636657", area:"Empaque", banco:"Nequi", cuenta:"-" },
  { no:45, nombre:"Zarith Diaz Carreño", doc:"CC Nacional", num:"1098629602", tel:"3177443821", area:"Empaque", banco:"Nequi", cuenta:"-" },
  { no:46, nombre:"Andrea Katherine Ayala Duarte", doc:"CC Nacional", num:"1102714297", tel:"3228834617", area:"Nueva", banco:"Nequi", cuenta:"-" },
  { no:47, nombre:"Karen Almeida", doc:"CC Nacional", num:"-", tel:"-", area:"PLU", banco:"Nequi", cuenta:"-" },
  { no:48, nombre:"Roxana Hernandez", doc:"PPT", num:"-", tel:"3181558410", area:"Empaque", banco:"Nequi", cuenta:"-" },
  { no:49, nombre:"Lennix Vega", doc:"CC Nacional", num:"63557421", tel:"3016366258", area:"Administración", banco:"Nequi", cuenta:"-" },
  { no:50, nombre:"Juan Abuchaibe", doc:"CC Nacional", num:"123456789", tel:"+17867102522", area:"Owner / Propietario", banco:"-", cuenta:"-" },
];

// ─── MODAL CONFIRMACIÓN ───────────────────────────────────────
function ConfirmModal({ mensaje, onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.75)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#1a1a2e", border:"1px solid rgba(255,255,255,0.17)", borderRadius:16, padding:24, maxWidth:300, width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:32, marginBottom:10 }}>⚠️</div>
        <div style={{ fontSize:14, color:"white", fontWeight:600, marginBottom:8 }}>¿Estás seguro?</div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.62)", marginBottom:20, lineHeight:1.5 }}>{mensaje}</div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onCancel} style={{ flex:1, background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.17)", borderRadius:10, padding:"10px", fontSize:13, color:"rgba(255,255,255,0.68)", cursor:"pointer" }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex:1, background:"linear-gradient(135deg,#FF6B6B,#845EF7)", border:"none", borderRadius:10, padding:"10px", fontSize:13, color:"white", cursor:"pointer", fontWeight:700 }}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

// ─── MÓDULO PERSONAL ──────────────────────────────────────────
const DOC_TIPOS_PERS = [
  { key:"cedula",   label:"Copia Cédula",        icon:"🪪" },
  { key:"contrato", label:"Contrato firmado",     icon:"📄" },
  { key:"foto",     label:"Foto documento",       icon:"📷" },
  { key:"eps",      label:"Ficha EPS",            icon:"🏥" },
  { key:"arl",      label:"Ficha ARL",            icon:"🦺" },
];
const CRITERIOS_DESEMP = ["puntualidad","calidad","actitud","productividad"];

function PersonalDemo() {
  const mob = useM();
  // ── Tab principal ──
  const [tabPers, setTabPers] = useState(0);

  // ── Tab 0: Directorio ──
  const [search, setSearch] = useState("");
  const [filterDoc, setFilterDoc] = useState("Todos");
  const [showForm, setShowForm] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [selected, setSelected] = useState([]);
  const [hora, setHora] = useState("6:00 AM");
  const [nuevoEmp, setNuevoEmp] = useState({ nombre:"", doc:"CC Nacional", num:"", tel:"", area:"" });
  const [confirm, setConfirm] = useState(null);
  const [editando, setEditando] = useState(null);
  const [editForm, setEditForm] = useState({});
  const pedir = (msg, fn) => setConfirm({ msg, fn });

  // ── Filtros por tab ──
  const [busqContrato,      setBusqContrato]      = useState("");
  const [filtroContrato,    setFiltroContrato]    = useState("Todos");
  const [busqDoc,           setBusqDoc]           = useState("");
  const [filtroDocEstado,   setFiltroDocEstado]   = useState("Todos");
  const [filtroMesDesemp,   setFiltroMesDesemp]   = useState("");
  const [busqSS,            setBusqSS]            = useState("");
  const [filtroSS,          setFiltroSS]          = useState("Todos");

  // ── Supabase: Personal ──
  const {
    empleados,
    contratos,  docs,     desempeno, seguridad,
    loading:    loadingPersonal,
    agregarEmpleado, editarEmpleado, eliminarEmpleado,
    upsertContrato,
    toggleDoc:  toggleDocSB, agregarEval: agregarEvalSB, eliminarEval: eliminarEvalSB, upsertSeguridad,
  } = usePersonal();

  // ── Tab 1: Contratos ──
  const [contratoEmp, setContratoEmp]   = useState(null);
  const [contratoForm, setContratoForm] = useState({ tipo:"OPS", fechaInicio:"", fechaFin:"", notas:"" });

  const saveContrato = () => { upsertContrato(contratoEmp, contratoForm); setContratoEmp(null); };
  const diasRestantes = (f) => diferenciaDiasLocal(fechaLocalISO(), f);
  const contColor = (d) => d===null?"rgba(255,255,255,0.2)":d<0?"#FF6B6B":d<30?"#FF6B6B":d<90?"#F9A826":"#00C9A7";

  // ── Tab 2: Documentos ──
  const toggleDoc = (num, key) => toggleDocSB(num, key);

  // ── Tab 3: Desempeño ──
  const [selEmpDesemp, setSelEmpDesemp]   = useState(null);
  const [showFormDesemp, setShowFormDesemp] = useState(false);
  const [formDesemp, setFormDesemp]       = useState({ fecha:"", puntualidad:4, calidad:4, actitud:4, productividad:4, nota:"" });

  const agregarEval = () => {
    if(!formDesemp.fecha) return;
    agregarEvalSB(selEmpDesemp || empleados[0]?.num, formDesemp);
    setFormDesemp({ fecha:"", puntualidad:4, calidad:4, actitud:4, productividad:4, nota:"" }); setShowFormDesemp(false);
  };

  // ── Tab 4: Seguridad Social ──
  const [editSeg, setEditSeg]   = useState(null);
  const [formSeg, setFormSeg]   = useState({ eps:"", fechaEPS:"", arl:"", fechaARL:"", estado:"Activo" });

  const saveSeg = () => { upsertSeguridad(editSeg, formSeg); setEditSeg(null); };
  const docColors = { "CC Nacional":"#00C9A7", "CC Venezuela":"#F9A826", "PPT":"#845EF7" };
  const docTypes  = ["Todos","CC Nacional","CC Venezuela","PPT"];
  const inp = { background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"7px 10px", color:"white", fontSize:11, fontFamily:"inherit", width:"100%", boxSizing:"border-box" };

  const guardarEdicion = () => {
    editarEmpleado(editando, editForm);
    setEditando(null);
  };
  const guardar = () => {
    if (!nuevoEmp.nombre || !nuevoEmp.num || !nuevoEmp.tel) return;
    pedir(`¿Agregar a "${nuevoEmp.nombre}"?`, () => {
      agregarEmpleado({ ...nuevoEmp, no: empleados.length + 1 });
      setNuevoEmp({ nombre:"", doc:"CC Nacional", num:"", tel:"", area:"" });
      setShowForm(false);
    });
  };
  const toggleSelect = (emp) => setSelected(prev =>
    prev.find(e => e.num === emp.num) ? prev.filter(e => e.num !== emp.num) : [...prev, emp]
  );
  const stats = { total:empleados.length, cc:empleados.filter(e=>e.doc==="CC Nacional").length, ven:empleados.filter(e=>e.doc==="CC Venezuela").length, ppt:empleados.filter(e=>e.doc==="PPT").length };
  const filtered = empleados.filter(e => (e.nombre.toLowerCase().includes(search.toLowerCase())||e.num.includes(search)) && (filterDoc==="Todos"||e.doc===filterDoc));

  const TABS_PERS = [
    { icon:"👥", label:"Directorio"    },
    { icon:"📄", label:"Contratos"     },
    { icon:"📁", label:"Documentos"    },
    { icon:"⭐", label:"Desempeño"     },
    { icon:"🏥", label:"Seg. Social"   },
  ];

  const empDesempActual= selEmpDesemp|| empleados[0]?.num || "";

  if (loadingPersonal) return <LimonLoader texto="Cargando equipo" />;

  return (
    <div>
      {confirm && <ConfirmModal mensaje={confirm.msg} onConfirm={() => { confirm.fn(); setConfirm(null); }} onCancel={() => setConfirm(null)} />}

      {/* ── Modal editar empleado ── */}
      {editando && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.8)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"#1a1a2e", border:"1px solid rgba(0,201,167,0.3)", borderRadius:16, padding:24, maxWidth:380, width:"100%", maxHeight:"calc(100vh - 40px)", overflowY:"auto" }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#00C9A7", marginBottom:14 }}>✏️ Editar empleado</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <input placeholder="Nombre" value={editForm.nombre||""} onChange={e=>setEditForm(f=>({...f,nombre:e.target.value}))} style={inp} />
              <div style={{ display:"flex", gap:6 }}>
                <CustomSelect value={editForm.doc||"CC Nacional"} onChange={e=>setEditForm(f=>({...f,doc:e.target.value}))} style={{...inp,flex:1}}>
                  <option style={{background:"#1a1a2e"}}>CC Nacional</option><option style={{background:"#1a1a2e"}}>CC Venezuela</option><option style={{background:"#1a1a2e"}}>PPT</option>
                </CustomSelect>
                <input placeholder="Cédula" value={editForm.num||""} onChange={e=>setEditForm(f=>({...f,num:e.target.value}))} style={{...inp,flex:1}} />
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <input placeholder="Teléfono" value={editForm.tel||""} onChange={e=>setEditForm(f=>({...f,tel:e.target.value}))} style={{...inp,flex:1}} />
                <input placeholder="Área"     value={editForm.area||""} onChange={e=>setEditForm(f=>({...f,area:e.target.value}))} style={{...inp,flex:1}} />
              </div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", textTransform:"uppercase", letterSpacing:0.5, marginTop:4 }}>📍 Dirección</div>
              <input placeholder="Dirección" value={editForm.direccion||""} onChange={e=>setEditForm(f=>({...f,direccion:e.target.value}))} style={inp} />
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", textTransform:"uppercase", letterSpacing:0.5, marginTop:4 }}>🚨 Contacto de emergencia</div>
              <div style={{ display:"flex", gap:6 }}>
                <input placeholder="Nombre" value={editForm.contactoEmergencia||""} onChange={e=>setEditForm(f=>({...f,contactoEmergencia:e.target.value}))} style={{...inp,flex:1}} />
                <input placeholder="Teléfono" value={editForm.telEmergencia||""} onChange={e=>setEditForm(f=>({...f,telEmergencia:e.target.value}))} style={{...inp,flex:1}} />
              </div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", textTransform:"uppercase", letterSpacing:0.5, marginTop:4 }}>🏦 Cuenta de pago</div>
              <div style={{ display:"flex", gap:6 }}>
                <input placeholder="Banco" value={editForm.banco||""} onChange={e=>setEditForm(f=>({...f,banco:e.target.value}))} style={{...inp,flex:1}} />
                <input placeholder="Número de cuenta" value={editForm.cuenta||""} onChange={e=>setEditForm(f=>({...f,cuenta:e.target.value}))} style={{...inp,flex:1}} />
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <input placeholder="Titular de la cuenta" value={editForm.titularNombre||""} onChange={e=>setEditForm(f=>({...f,titularNombre:e.target.value}))} style={{...inp,flex:1}} />
                <input placeholder="Doc. titular" value={editForm.titularDoc||""} onChange={e=>setEditForm(f=>({...f,titularDoc:e.target.value}))} style={{...inp,flex:1}} />
                <input placeholder="N° doc. titular" value={editForm.titularDocNum||""} onChange={e=>setEditForm(f=>({...f,titularDocNum:e.target.value}))} style={{...inp,flex:1}} />
              </div>
              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                <button onClick={()=>pedir("¿Guardar cambios?",guardarEdicion)} style={{ flex:1, background:"linear-gradient(135deg,#845EF7,#6366F1)", border:"none", borderRadius:8, padding:"9px", fontSize:12, color:"white", cursor:"pointer", fontWeight:700 }}>✅ Guardar</button>
                <button onClick={()=>setEditando(null)} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"9px 14px", fontSize:12, color:"rgba(255,255,255,0.58)", cursor:"pointer" }}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal contrato ── */}
      {contratoEmp && (() => {
        const emp = empleados.find(e=>e.num===contratoEmp);
        return (
          <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.82)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
            <div style={{ background:"#1a1a2e", border:"1px solid rgba(249,168,38,0.35)", borderRadius:16, padding:24, maxWidth:340, width:"100%", maxHeight:"calc(100vh - 40px)", overflowY:"auto" }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#F9A826", marginBottom:3 }}>📄 Contrato</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.48)", marginBottom:14 }}>{emp?.nombre}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <div>
                  <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Tipo de contrato</div>
                  <CustomSelect value={contratoForm.tipo} onChange={e=>setContratoForm(f=>({...f,tipo:e.target.value}))} style={inp}>
                    {["OPS","Término fijo","Término indefinido","Obra o labor","Aprendizaje"].map(t=><option key={t} style={{background:"#1a1a2e"}}>{t}</option>)}
                  </CustomSelect>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Fecha inicio</div>
                    <input type="date" value={contratoForm.fechaInicio} onChange={e=>setContratoForm(f=>({...f,fechaInicio:e.target.value}))} style={inp} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Fecha vencimiento</div>
                    <input type="date" value={contratoForm.fechaFin} onChange={e=>setContratoForm(f=>({...f,fechaFin:e.target.value}))} style={inp} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Notas</div>
                  <input placeholder="Observaciones..." value={contratoForm.notas} onChange={e=>setContratoForm(f=>({...f,notas:e.target.value}))} style={inp} />
                </div>
                <div style={{ display:"flex", gap:8, marginTop:4 }}>
                  <button onClick={saveContrato} style={{ flex:1, background:"linear-gradient(135deg,#F9A826,#845EF7)", border:"none", borderRadius:8, padding:"9px", fontSize:12, color:"white", cursor:"pointer", fontWeight:700 }}>✅ Guardar</button>
                  <button onClick={()=>setContratoEmp(null)} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"9px 14px", fontSize:12, color:"rgba(255,255,255,0.58)", cursor:"pointer" }}>Cancelar</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal seguridad social ── */}
      {editSeg && (() => {
        const emp = empleados.find(e=>e.num===editSeg);
        return (
          <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.82)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
            <div style={{ background:"#1a1a2e", border:"1px solid rgba(255,107,107,0.35)", borderRadius:16, padding:24, maxWidth:340, width:"100%", maxHeight:"calc(100vh - 40px)", overflowY:"auto" }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#FF6B6B", marginBottom:3 }}>🏥 Seguridad Social</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.48)", marginBottom:14 }}>{emp?.nombre}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <div style={{ display:"flex", gap:6 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>EPS</div>
                    <input placeholder="Sura, Nueva EPS..." value={formSeg.eps} onChange={e=>setFormSeg(f=>({...f,eps:e.target.value}))} style={inp} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Fecha afiliación EPS</div>
                    <input type="date" value={formSeg.fechaEPS} onChange={e=>setFormSeg(f=>({...f,fechaEPS:e.target.value}))} style={inp} />
                  </div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>ARL</div>
                    <input placeholder="Sura, Colmena..." value={formSeg.arl} onChange={e=>setFormSeg(f=>({...f,arl:e.target.value}))} style={inp} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Fecha afiliación ARL</div>
                    <input type="date" value={formSeg.fechaARL} onChange={e=>setFormSeg(f=>({...f,fechaARL:e.target.value}))} style={inp} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Estado</div>
                  <CustomSelect value={formSeg.estado} onChange={e=>setFormSeg(f=>({...f,estado:e.target.value}))} style={inp}>
                    {["Activo","Inactivo","En trámite","Sin afiliación"].map(s=><option key={s} style={{background:"#1a1a2e"}}>{s}</option>)}
                  </CustomSelect>
                </div>
                <div style={{ display:"flex", gap:8, marginTop:4 }}>
                  <button onClick={saveSeg} style={{ flex:1, background:"linear-gradient(135deg,#FF6B6B,#845EF7)", border:"none", borderRadius:8, padding:"9px", fontSize:12, color:"white", cursor:"pointer", fontWeight:700 }}>✅ Guardar</button>
                  <button onClick={()=>setEditSeg(null)} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"9px 14px", fontSize:12, color:"rgba(255,255,255,0.58)", cursor:"pointer" }}>Cancelar</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Tabs ── */}
      <div style={{ display:"flex", gap:3, marginBottom:12, flexWrap:"wrap" }}>
        {TABS_PERS.map((t,i)=>(
          <button key={i} onClick={()=>setTabPers(i)}
            style={{ background:tabPers===i?"rgba(132,94,247,0.18)":"rgba(255,255,255,0.04)", border:`1px solid ${tabPers===i?"rgba(132,94,247,0.5)":"rgba(255,255,255,0.08)"}`, borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:10, color:tabPers===i?"#845EF7":"rgba(255,255,255,0.4)", fontWeight:tabPers===i?700:400 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══ TAB 0: DIRECTORIO ══ */}
      {tabPers===0 && (
        <div>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            {[{l:"Total",v:stats.total,c:"rgba(255,255,255,0.6)"},{l:"CC Col",v:stats.cc,c:"#00C9A7"},{l:"Venezuela",v:stats.ven,c:"#F9A826"},{l:"PPT",v:stats.ppt,c:"#845EF7"}].map((s,i)=>(
              <div key={i} style={{ flex:1, background:"rgba(255,255,255,0.06)", borderRadius:8, padding:"6px 8px", textAlign:"center" }}>
                <div style={{ fontSize:16, fontWeight:700, color:s.c }}>{s.v}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)" }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
            <button onClick={()=>{setShowForm(!showForm);setShowBroadcast(false);}} style={{ background:showForm?"rgba(132,94,247,0.25)":"rgba(132,94,247,0.1)", border:"1px solid rgba(132,94,247,0.4)", borderRadius:8, padding:"5px 11px", fontSize:11, color:"#845EF7", cursor:"pointer", fontWeight:700 }}>➕ Nuevo empleado</button>
            <button onClick={()=>{setShowBroadcast(!showBroadcast);setShowForm(false);}} style={{ background:showBroadcast?"rgba(37,211,102,0.25)":"rgba(37,211,102,0.1)", border:"1px solid rgba(37,211,102,0.4)", borderRadius:8, padding:"5px 11px", fontSize:11, color:"#25D366", cursor:"pointer", fontWeight:700 }}>📢 Broadcast {selected.length>0?`(${selected.length})`:""}</button>
          </div>
          {showForm && (
            <div style={{ background:"rgba(132,94,247,0.06)", border:"1px solid rgba(132,94,247,0.2)", borderRadius:12, padding:14, marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#845EF7", marginBottom:10 }}>👤 Nuevo empleado</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <input placeholder="Nombre completo *" value={nuevoEmp.nombre} onChange={e=>setNuevoEmp({...nuevoEmp,nombre:e.target.value})} style={inp} />
                <div style={{ display:"flex", gap:6 }}>
                  <CustomSelect value={nuevoEmp.doc} onChange={e=>setNuevoEmp({...nuevoEmp,doc:e.target.value})} style={{...inp,flex:1}}>
                    <option style={{background:"#1a1a2e"}}>CC Nacional</option><option style={{background:"#1a1a2e"}}>CC Venezuela</option><option style={{background:"#1a1a2e"}}>PPT</option>
                  </CustomSelect>
                  <input placeholder="Cédula *" value={nuevoEmp.num} onChange={e=>setNuevoEmp({...nuevoEmp,num:e.target.value})} style={{...inp,flex:1}} />
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <input placeholder="Teléfono *" value={nuevoEmp.tel} onChange={e=>setNuevoEmp({...nuevoEmp,tel:e.target.value})} style={{...inp,flex:1}} />
                  <input placeholder="Área" value={nuevoEmp.area} onChange={e=>setNuevoEmp({...nuevoEmp,area:e.target.value})} style={{...inp,flex:1}} />
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={guardar} style={{ flex:1, background:"linear-gradient(135deg,#845EF7,#6366F1)", border:"none", borderRadius:8, padding:"8px", fontSize:12, color:"white", cursor:"pointer", fontWeight:700 }}>✅ Guardar</button>
                  <button onClick={()=>setShowForm(false)} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"8px 12px", fontSize:12, color:"rgba(255,255,255,0.58)", cursor:"pointer" }}>Cancelar</button>
                </div>
              </div>
            </div>
          )}
          {showBroadcast && (
            <div style={{ background:"rgba(37,211,102,0.06)", border:"1px solid rgba(37,211,102,0.2)", borderRadius:12, padding:14, marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#25D366", marginBottom:8 }}>📢 Notificación de turno</div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <span style={{ fontSize:11, color:"rgba(255,255,255,0.58)" }}>⏰ Hora:</span>
                <input value={hora} onChange={e=>setHora(e.target.value)} style={{...inp,width:100}} />
              </div>
              {selected.length>0 && selected.map((emp,i)=>{
                const msg=`Hola ${emp.nombre.split(" ")[0]} 👋, se te informa que hoy debes asistir a tu turno de las ${hora}. Te esperamos! — JARVIS 🍋`;
                return (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(255,255,255,0.06)", borderRadius:8, padding:"7px 10px", marginBottom:5 }}>
                    <div style={{ fontSize:12, color:"white" }}>{emp.nombre.split(" ")[0]} {emp.nombre.split(" ")[1]}</div>
                    <a href={`https://wa.me/57${emp.tel}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" style={{ background:"linear-gradient(135deg,#25D366,#128C7E)", borderRadius:7, padding:"4px 10px", fontSize:11, color:"white", textDecoration:"none", fontWeight:700 }}>💬 Enviar</a>
                  </div>
                );
              })}
              {selected.length===0 && <div style={{ fontSize:11, color:"rgba(255,255,255,0.48)" }}>Selecciona empleados abajo 👇</div>}
              {selected.length>0 && <button onClick={()=>setSelected([])} style={{ marginTop:6, background:"rgba(255,100,100,0.1)", border:"1px solid rgba(255,100,100,0.3)", borderRadius:6, padding:"5px 10px", fontSize:11, color:"#ff6b6b", cursor:"pointer" }}>🗑 Limpiar</button>}
            </div>
          )}
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar nombre o cédula..." style={{...inp,flex:1}} />
            <CustomSelect value={filterDoc} onChange={e=>setFilterDoc(e.target.value)} style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"6px 8px", color:"white", fontSize:11, fontFamily:"inherit", width:130, flexShrink:0 }}>
              {docTypes.map(d=><option key={d} value={d} style={{background:"#1a1a2e"}}>{d}</option>)}
            </CustomSelect>
          </div>
          <div style={{ maxHeight:420, overflowY:"auto" }}>
            {filtered.map((emp,i)=>{
              const isSel   = showBroadcast && selected.find(e=>e.num===emp.num);
              const isExtra = !EMPLEADOS_DB.find(e=>e.num===emp.num);
              const docColor= docColors[emp.doc]||"#aaa";
              const cont    = contratos[emp.num];
              const dias    = cont?.fechaFin ? diasRestantes(cont.fechaFin) : null;
              const seg     = seguridad[emp.num];
              const nDocs   = DOC_TIPOS_PERS.filter(t=>docs[emp.num]?.[t.key]).length;
              return (
                <div key={i} onClick={()=>showBroadcast&&emp.tel!=="-"&&toggleSelect(emp)}
                  style={{ borderRadius:12, marginBottom:8, background:isSel?"rgba(37,211,102,0.08)":"rgba(255,255,255,0.03)", border:`1px solid ${isSel?"rgba(37,211,102,0.35)":"rgba(255,255,255,0.07)"}`, cursor:showBroadcast?"pointer":"default", overflow:"hidden" }}>
                  <div style={{ padding:"12px 14px 10px", display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                    <div style={{ minWidth:0, flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3, flexWrap:"wrap" }}>
                        {showBroadcast && <span style={{ fontSize:16, color:isSel?"#25D366":"rgba(255,255,255,0.2)" }}>{isSel?"☑️":"⬜"}</span>}
                        <span style={{ fontSize:13, color:"white", fontWeight:700 }}>{emp.nombre}</span>
                        {isExtra && <span style={{ fontSize:9, background:"rgba(132,94,247,0.2)", color:"#845EF7", borderRadius:5, padding:"2px 6px", fontWeight:700 }}>NUEVO</span>}
                      </div>
                      <div style={{ fontSize:11, color:"rgba(255,255,255,0.52)", lineHeight:1.6 }}>
                        <span style={{ color:"rgba(255,255,255,0.62)" }}>{emp.area}</span>
                        {emp.num!=="-" && <><span style={{ color:"rgba(255,255,255,0.28)" }}> · </span><span>{emp.num}</span></>}
                        {emp.tel!=="-" && <><span style={{ color:"rgba(255,255,255,0.28)" }}> · </span><span>📞 {emp.tel}</span></>}
                      </div>
                      {(emp.contactoEmergencia || emp.banco) && (
                        <div style={{ fontSize:10, color:"rgba(255,255,255,0.38)", lineHeight:1.6 }}>
                          {emp.contactoEmergencia && <span>🚨 {emp.contactoEmergencia}{emp.telEmergencia?` (${emp.telEmergencia})`:""}</span>}
                          {emp.contactoEmergencia && emp.banco && <span style={{ color:"rgba(255,255,255,0.22)" }}> · </span>}
                          {emp.banco && <span>🏦 {emp.banco}{emp.cuenta?` ${emp.cuenta}`:""}</span>}
                        </div>
                      )}
                      <div style={{ display:"flex", gap:4, marginTop:5, flexWrap:"wrap" }}>
                        {cont && <span style={{ fontSize:8, background:`${contColor(dias)}15`, color:contColor(dias), borderRadius:4, padding:"1px 6px", fontWeight:700, border:`1px solid ${contColor(dias)}28` }}>📄 {cont.tipo}{dias!==null?` · ${dias<0?"VENCIDO":`${dias}d`}`:""}</span>}
                        {seg?.eps && <span style={{ fontSize:8, background:"rgba(255,107,107,0.1)", color:"#FF6B6B", borderRadius:4, padding:"1px 6px", fontWeight:700 }}>🏥 {seg.eps}</span>}
                        {seg?.arl && <span style={{ fontSize:8, background:"rgba(249,168,38,0.1)", color:"#F9A826", borderRadius:4, padding:"1px 6px", fontWeight:700 }}>🦺 {seg.arl}</span>}
                        {nDocs>0 && <span style={{ fontSize:8, background:"rgba(99,102,241,0.1)", color:"#6366F1", borderRadius:4, padding:"1px 6px", fontWeight:700 }}>📁 {nDocs}/{DOC_TIPOS_PERS.length} docs</span>}
                      </div>
                    </div>
                    <span style={{ fontSize:10, background:`${docColor}20`, color:docColor, borderRadius:6, padding:"3px 8px", fontWeight:700, border:`1px solid ${docColor}30`, flexShrink:0 }}>{emp.doc}</span>
                  </div>
                  {!showBroadcast && (
                    <div style={{ borderTop:"1px solid rgba(255,255,255,0.09)", display:"flex" }}>
                      <button onClick={e=>{e.stopPropagation();setEditando(emp.num);setEditForm({nombre:emp.nombre,doc:emp.doc,num:emp.num,tel:emp.tel,area:emp.area,banco:emp.banco,cuenta:emp.cuenta,direccion:emp.direccion,contactoEmergencia:emp.contactoEmergencia,telEmergencia:emp.telEmergencia,titularNombre:emp.titularNombre,titularDoc:emp.titularDoc,titularDocNum:emp.titularDocNum});}}
                        style={{ flex:1, background:"rgba(255,255,255,0.05)", border:"none", borderRight:"1px solid rgba(255,255,255,0.09)", padding:"9px", fontSize:11, color:"rgba(255,255,255,0.58)", cursor:"pointer", fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:3 }}>
                        ✏️ Editar
                      </button>
                      <button onClick={()=>{setContratoEmp(emp.num);setContratoForm(contratos[emp.num]||{tipo:"OPS",fechaInicio:"",fechaFin:"",notas:""});}}
                        style={{ flex:1, background:"rgba(249,168,38,0.04)", border:"none", borderRight:"1px solid rgba(255,255,255,0.09)", padding:"9px", fontSize:11, color:"rgba(249,168,38,0.7)", cursor:"pointer", fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:3 }}>
                        📄 Contrato
                      </button>
                      <button onClick={()=>{setEditSeg(emp.num);setFormSeg(seguridad[emp.num]||{eps:"",fechaEPS:"",arl:"",fechaARL:"",estado:"Activo"});}}
                        style={{ flex:1, background:"rgba(255,107,107,0.04)", border:"none", borderRight:isExtra?"1px solid rgba(255,255,255,0.09)":"none", padding:"9px", fontSize:11, color:"rgba(255,107,107,0.7)", cursor:"pointer", fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:3 }}>
                        🏥 EPS/ARL
                      </button>
                      {isExtra && (
                        <button onClick={e=>{e.stopPropagation();pedir(`¿Eliminar a "${emp.nombre}"?`,()=>eliminarEmpleado(emp.num));}}
                          style={{ flex:1, background:"rgba(255,80,80,0.05)", border:"none", padding:"9px", fontSize:11, color:"rgba(255,100,100,0.7)", cursor:"pointer", fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:3 }}>
                          🗑 Eliminar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ TAB 1: CONTRATOS ══ */}
      {tabPers===1 && (() => {
        const vencidos   = empleados.filter(e=>{const d=diasRestantes(contratos[e.num]?.fechaFin);return d!==null&&d<0;});
        const porVencer  = empleados.filter(e=>{const d=diasRestantes(contratos[e.num]?.fechaFin);return d!==null&&d>=0&&d<30;});
        const sinCont    = empleados.filter(e=>!contratos[e.num]);
        return (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:mob?"repeat(2,1fr)":"repeat(4,1fr)", gap:8, marginBottom:12 }}>
              {[
                { icon:"📄", l:"Con contrato",  v:Object.keys(contratos).length, c:"#00C9A7" },
                { icon:"⏰", l:"Por vencer",    v:porVencer.length,               c:"#F9A826" },
                { icon:"❌", l:"Vencidos",       v:vencidos.length,                c:"#FF6B6B" },
                { icon:"❓", l:"Sin contrato",   v:sinCont.length,                 c:"rgba(255,255,255,0.35)" },
              ].map((k,i)=>(
                <div key={i} style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${k.c}22`, borderRadius:12, padding:"10px 6px", textAlign:"center" }}>
                  <div style={{ fontSize:18 }}>{k.icon}</div>
                  <div style={{ fontSize:18, fontWeight:800, color:k.c, marginTop:2 }}>{k.v}</div>
                  <div style={{ fontSize:8, color:"rgba(255,255,255,0.42)", marginTop:2 }}>{k.l}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:6, marginBottom:10 }}>
              <input value={busqContrato} onChange={e=>setBusqContrato(e.target.value)} placeholder="🔍 Buscar empleado..." style={{...inp, flex:1}} />
              <CustomSelect value={filtroContrato} onChange={e=>setFiltroContrato(e.target.value)} style={{...inp, width:"auto"}}>
                {["Todos","Con contrato","Por vencer","Vencidos","Sin contrato"].map(o=><option key={o} style={{background:"#1a1a2e"}}>{o}</option>)}
              </CustomSelect>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:480, overflowY:"auto" }}>
              {empleados.filter(emp=>{
                const c    = contratos[emp.num];
                const dias = c?.fechaFin ? diasRestantes(c.fechaFin) : null;
                const nombre = emp.nombre.toLowerCase().includes(busqContrato.toLowerCase());
                if (!nombre) return false;
                if (filtroContrato==="Con contrato") return !!c;
                if (filtroContrato==="Por vencer") return dias!==null&&dias>=0&&dias<30;
                if (filtroContrato==="Vencidos") return dias!==null&&dias<0;
                if (filtroContrato==="Sin contrato") return !c;
                return true;
              }).map((emp,i)=>{
                const c    = contratos[emp.num];
                const dias = c?.fechaFin ? diasRestantes(c.fechaFin) : null;
                const col  = contColor(dias);
                return (
                  <div key={i} style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${c?col+"28":"rgba(255,255,255,0.06)"}`, borderRadius:10, padding:"10px 12px", display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"white", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{emp.nombre}</div>
                      <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:4 }}>{emp.area}</div>
                      {c ? (
                        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                          <span style={{ fontSize:9, background:`${col}14`, color:col, borderRadius:4, padding:"1px 6px", fontWeight:700 }}>{c.tipo}</span>
                          {c.fechaInicio && <span style={{ fontSize:9, color:"rgba(255,255,255,0.42)" }}>Desde {c.fechaInicio}</span>}
                          {dias !== null && (
                            <span style={{ fontSize:9, background:dias<0?"rgba(255,107,107,0.14)":dias<30?"rgba(249,168,38,0.14)":"rgba(0,201,167,0.1)", color:col, borderRadius:4, padding:"1px 6px", fontWeight:700 }}>
                              {dias<0?`Vencido hace ${Math.abs(dias)}d`:dias===0?"Vence hoy":`${dias}d restantes`}
                            </span>
                          )}
                          {c.notas && <span style={{ fontSize:9, color:"rgba(249,168,38,0.6)", fontStyle:"italic" }}>{c.notas}</span>}
                        </div>
                      ) : (
                        <span style={{ fontSize:9, color:"rgba(255,255,255,0.33)" }}>Sin contrato registrado</span>
                      )}
                    </div>
                    <button onClick={()=>{setContratoEmp(emp.num);setContratoForm(c||{tipo:"OPS",fechaInicio:"",fechaFin:"",notas:""});}}
                      style={{ background:"rgba(249,168,38,0.1)", border:"1px solid rgba(249,168,38,0.25)", borderRadius:7, padding:"5px 10px", fontSize:10, color:"#F9A826", cursor:"pointer", fontWeight:700, flexShrink:0 }}>
                      {c?"✏️ Editar":"➕ Registrar"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ══ TAB 2: DOCUMENTOS ══ */}
      {tabPers===2 && (() => {
        const getN = emp => DOC_TIPOS_PERS.filter(t=>docs[emp.num]?.[t.key]).length;
        return (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:mob?"repeat(2,1fr)":"repeat(3,1fr)", gap:8, marginBottom:12 }}>
              {[
                { icon:"✅", l:"Completos",     v:empleados.filter(e=>getN(e)===DOC_TIPOS_PERS.length).length,                c:"#00C9A7" },
                { icon:"⚠️", l:"Incompletos",   v:empleados.filter(e=>{const n=getN(e);return n>0&&n<DOC_TIPOS_PERS.length;}).length, c:"#F9A826" },
                { icon:"❌", l:"Sin documentos",v:empleados.filter(e=>getN(e)===0).length,                                    c:"#FF6B6B" },
              ].map((k,i)=>(
                <div key={i} style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${k.c}22`, borderRadius:12, padding:"10px 8px", textAlign:"center" }}>
                  <div style={{ fontSize:18 }}>{k.icon}</div>
                  <div style={{ fontSize:18, fontWeight:800, color:k.c, marginTop:2 }}>{k.v}</div>
                  <div style={{ fontSize:8, color:"rgba(255,255,255,0.42)", marginTop:2 }}>{k.l}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:6, marginBottom:10 }}>
              <input value={busqDoc} onChange={e=>setBusqDoc(e.target.value)} placeholder="🔍 Buscar empleado..." style={{...inp, flex:1}} />
              <CustomSelect value={filtroDocEstado} onChange={e=>setFiltroDocEstado(e.target.value)} style={{...inp, width:"auto"}}>
                {["Todos","Completos","Incompletos","Sin documentos"].map(o=><option key={o} style={{background:"#1a1a2e"}}>{o}</option>)}
              </CustomSelect>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:500, overflowY:"auto" }}>
              {empleados.filter(emp=>{
                const n = getN(emp);
                if (!emp.nombre.toLowerCase().includes(busqDoc.toLowerCase())) return false;
                if (filtroDocEstado==="Completos") return n===DOC_TIPOS_PERS.length;
                if (filtroDocEstado==="Incompletos") return n>0&&n<DOC_TIPOS_PERS.length;
                if (filtroDocEstado==="Sin documentos") return n===0;
                return true;
              }).map((emp,i)=>{
                const n   = getN(emp);
                const pct = Math.round(n/DOC_TIPOS_PERS.length*100);
                const col = pct===100?"#00C9A7":pct>0?"#F9A826":"#FF6B6B";
                return (
                  <div key={i} style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${col}18`, borderRadius:10, padding:"10px 12px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:"white" }}>{emp.nombre}</div>
                        <div style={{ fontSize:9, color:"rgba(255,255,255,0.42)" }}>{emp.area} · {n}/{DOC_TIPOS_PERS.length} docs</div>
                      </div>
                      <span style={{ fontSize:10, background:`${col}18`, color:col, borderRadius:6, padding:"2px 8px", fontWeight:700 }}>{pct}%</span>
                    </div>
                    <div style={{ background:"rgba(255,255,255,0.08)", borderRadius:3, height:4, marginBottom:8 }}>
                      <div style={{ width:`${pct}%`, height:"100%", background:col, borderRadius:3, transition:"width 0.3s" }}/>
                    </div>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                      {DOC_TIPOS_PERS.map(t=>(
                        <button key={t.key} onClick={()=>toggleDoc(emp.num,t.key)}
                          style={{ background:docs[emp.num]?.[t.key]?"rgba(0,201,167,0.12)":"rgba(255,255,255,0.04)", border:`1px solid ${docs[emp.num]?.[t.key]?"rgba(0,201,167,0.35)":"rgba(255,255,255,0.1)"}`, borderRadius:6, padding:"3px 7px", fontSize:9, color:docs[emp.num]?.[t.key]?"#00C9A7":"rgba(255,255,255,0.35)", cursor:"pointer", fontWeight:docs[emp.num]?.[t.key]?700:400, display:"flex", alignItems:"center", gap:3 }}>
                          {docs[emp.num]?.[t.key]?"✅":"⬜"} {t.icon} {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ══ TAB 3: DESEMPEÑO ══ */}
      {tabPers===3 && (() => {
        const histDesempRaw = desempeno[empDesempActual] || [];
        const histDesemp    = filtroMesDesemp ? histDesempRaw.filter(ev=>ev.fecha?.startsWith(filtroMesDesemp)) : histDesempRaw;
        const empSelObj  = empleados.find(e=>e.num===empDesempActual);
        const prom = histDesemp.length>0 ? histDesemp.reduce((s,ev)=>s+CRITERIOS_DESEMP.reduce((a,c)=>a+ev[c],0)/CRITERIOS_DESEMP.length,0)/histDesemp.length : null;
        return (
          <div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:4 }}>Empleado</div>
              <CustomSelect value={empDesempActual} onChange={e=>setSelEmpDesemp(e.target.value)}
                style={{ width:"100%", background:"rgba(255,255,255,0.08)", border:"1px solid rgba(249,168,38,0.3)", borderRadius:8, padding:"8px 10px", color:"white", fontSize:11, fontFamily:"inherit" }}>
                {empleados.map(e=><option key={e.num} value={e.num} style={{background:"#1a1a2e"}}>{e.nombre}</option>)}
              </CustomSelect>
            </div>
            <div style={{ display:"flex", gap:6, marginBottom:10, alignItems:"center" }}>
              <input type="month" value={filtroMesDesemp} onChange={e=>setFiltroMesDesemp(e.target.value)} style={{...inp, flex:1}} placeholder="Filtrar por mes" />
              {filtroMesDesemp && <button onClick={()=>setFiltroMesDesemp("")} style={{background:"rgba(255,80,80,0.1)",border:"1px solid rgba(255,80,80,0.2)",borderRadius:8,padding:"6px 10px",fontSize:11,color:"#FF6B6B",cursor:"pointer"}}>✕ Todo</button>}
            </div>
            {prom !== null && (
              <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                <div style={{ flex:1, background:"rgba(249,168,38,0.06)", border:"1px solid rgba(249,168,38,0.18)", borderRadius:12, padding:"12px", textAlign:"center" }}>
                  <div style={{ fontSize:30, fontWeight:800, color:"#F9A826" }}>{prom.toFixed(1)}</div>
                  <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)" }}>promedio / 5</div>
                  <div style={{ fontSize:16, marginTop:3 }}>{"⭐".repeat(Math.round(prom))}</div>
                </div>
                <div style={{ flex:2, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, padding:"12px" }}>
                  {CRITERIOS_DESEMP.map(c=>{
                    const p2 = histDesemp.reduce((s,ev)=>s+ev[c],0)/histDesemp.length;
                    const col = p2>=4?"#00C9A7":p2>=3?"#F9A826":"#FF6B6B";
                    return (
                      <div key={c} style={{ marginBottom:5 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                          <span style={{ fontSize:9, color:"rgba(255,255,255,0.52)", textTransform:"capitalize" }}>{c}</span>
                          <span style={{ fontSize:9, fontWeight:700, color:col }}>{p2.toFixed(1)}</span>
                        </div>
                        <div style={{ background:"rgba(255,255,255,0.08)", borderRadius:3, height:5 }}>
                          <div style={{ width:`${p2/5*100}%`, height:"100%", background:col, borderRadius:3 }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <button onClick={()=>setShowFormDesemp(!showFormDesemp)}
              style={{ marginBottom:10, background:showFormDesemp?"rgba(249,168,38,0.2)":"rgba(249,168,38,0.1)", border:"1px solid rgba(249,168,38,0.35)", borderRadius:8, padding:"6px 14px", fontSize:11, color:"#F9A826", cursor:"pointer", fontWeight:700 }}>
              ➕ Nueva evaluación
            </button>
            {showFormDesemp && (
              <div style={{ background:"rgba(249,168,38,0.05)", border:"1px solid rgba(249,168,38,0.18)", borderRadius:12, padding:14, marginBottom:12 }}>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Fecha *</div>
                    <input type="date" value={formDesemp.fecha} onChange={e=>setFormDesemp(f=>({...f,fecha:e.target.value}))} style={inp} />
                  </div>
                  {CRITERIOS_DESEMP.map(c=>(
                    <div key={c}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                        <span style={{ fontSize:10, color:"rgba(255,255,255,0.68)", textTransform:"capitalize" }}>{c}</span>
                        <div style={{ display:"flex", gap:3, alignItems:"center" }}>
                          {[1,2,3,4,5].map(n=>(
                            <button key={n} onClick={()=>setFormDesemp(f=>({...f,[c]:n}))}
                              style={{ background:formDesemp[c]>=n?"rgba(249,168,38,0.28)":"rgba(255,255,255,0.05)", border:`1px solid ${formDesemp[c]>=n?"rgba(249,168,38,0.5)":"rgba(255,255,255,0.1)"}`, borderRadius:4, width:26, height:24, cursor:"pointer", fontSize:13, color:formDesemp[c]>=n?"#F9A826":"rgba(255,255,255,0.25)" }}>
                              ⭐
                            </button>
                          ))}
                          <span style={{ fontSize:11, color:"#F9A826", fontWeight:700, minWidth:14, marginLeft:4 }}>{formDesemp[c]}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Notas</div>
                    <input placeholder="Observaciones..." value={formDesemp.nota} onChange={e=>setFormDesemp(f=>({...f,nota:e.target.value}))} style={inp} />
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={agregarEval} style={{ flex:1, background:"linear-gradient(135deg,#F9A826,#845EF7)", border:"none", borderRadius:8, padding:"8px", fontSize:12, color:"white", cursor:"pointer", fontWeight:700 }}>✅ Guardar evaluación</button>
                    <button onClick={()=>setShowFormDesemp(false)} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"8px 12px", fontSize:12, color:"rgba(255,255,255,0.58)", cursor:"pointer" }}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}
            {histDesemp.length===0 ? (
              <div style={{ textAlign:"center", padding:"30px", color:"rgba(255,255,255,0.38)", fontSize:12 }}>Sin evaluaciones para {empSelObj?.nombre?.split(" ")[0]}</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {histDesemp.map((ev,i)=>{
                  const p2  = CRITERIOS_DESEMP.reduce((s,c)=>s+ev[c],0)/CRITERIOS_DESEMP.length;
                  const col = p2>=4?"#00C9A7":p2>=3?"#F9A826":"#FF6B6B";
                  return (
                    <div key={ev.id||i} style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${col}22`, borderRadius:10, padding:"10px 14px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                        <div style={{ fontSize:10, color:"rgba(255,255,255,0.58)" }}>{ev.fecha}</div>
                        <div style={{ fontSize:14, fontWeight:800, color:col }}>{p2.toFixed(1)}/5</div>
                      </div>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:ev.nota?5:0 }}>
                        {CRITERIOS_DESEMP.map(c=>(
                          <span key={c} style={{ fontSize:9, background:"rgba(255,255,255,0.07)", borderRadius:4, padding:"2px 7px", color:"rgba(255,255,255,0.52)" }}>
                            {c.charAt(0).toUpperCase()+c.slice(1)}: {ev[c]}/5
                          </span>
                        ))}
                      </div>
                      {ev.nota && <div style={{ fontSize:10, color:"rgba(249,168,38,0.7)", fontStyle:"italic" }}>📝 {ev.nota}</div>}
                      {ev.id && (
                        <button onClick={() => pedir(`¿Eliminar evaluación del ${ev.fecha}?`, async () => {
                          const ok = await eliminarEvalSB(ev.id);
                          if (!ok) alert("Error al eliminar evaluación");
                        })} style={{ marginTop:6, background:"rgba(255,80,80,0.07)", border:"1px solid rgba(255,80,80,0.18)", borderRadius:6, padding:"3px 10px", fontSize:10, color:"rgba(255,110,110,0.6)", cursor:"pointer", fontFamily:"inherit" }}>
                          🗑 Eliminar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ TAB 4: SEGURIDAD SOCIAL ══ */}
      {tabPers===4 && (() => {
        const sinEPS = empleados.filter(e=>!seguridad[e.num]?.eps);
        const sinARL = empleados.filter(e=>!seguridad[e.num]?.arl);
        const ambos  = empleados.filter(e=>seguridad[e.num]?.eps&&seguridad[e.num]?.arl);
        return (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:mob?"repeat(2,1fr)":"repeat(4,1fr)", gap:8, marginBottom:12 }}>
              {[
                { icon:"✅", l:"Con EPS+ARL",   v:ambos.length,                          c:"#00C9A7" },
                { icon:"🏥", l:"Sin EPS",        v:sinEPS.length,                         c:"#FF6B6B" },
                { icon:"🦺", l:"Sin ARL",        v:sinARL.length,                         c:"#F9A826" },
                { icon:"📋", l:"Registrados",    v:Object.keys(seguridad).length,         c:"#845EF7" },
              ].map((k,i)=>(
                <div key={i} style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${k.c}22`, borderRadius:12, padding:"10px 6px", textAlign:"center" }}>
                  <div style={{ fontSize:18 }}>{k.icon}</div>
                  <div style={{ fontSize:18, fontWeight:800, color:k.c, marginTop:2 }}>{k.v}</div>
                  <div style={{ fontSize:8, color:"rgba(255,255,255,0.42)", marginTop:2 }}>{k.l}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:6, marginBottom:10 }}>
              <input value={busqSS} onChange={e=>setBusqSS(e.target.value)} placeholder="🔍 Buscar empleado..." style={{...inp, flex:1}} />
              <CustomSelect value={filtroSS} onChange={e=>setFiltroSS(e.target.value)} style={{...inp, width:"auto"}}>
                {["Todos","Con EPS+ARL","Sin EPS","Sin ARL","Sin registro"].map(o=><option key={o} style={{background:"#1a1a2e"}}>{o}</option>)}
              </CustomSelect>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:500, overflowY:"auto" }}>
              {empleados.filter(emp=>{
                const s = seguridad[emp.num];
                if (!emp.nombre.toLowerCase().includes(busqSS.toLowerCase())) return false;
                if (filtroSS==="Con EPS+ARL") return !!(s?.eps && s?.arl);
                if (filtroSS==="Sin EPS") return !s?.eps;
                if (filtroSS==="Sin ARL") return !s?.arl;
                if (filtroSS==="Sin registro") return !s;
                return true;
              }).map((emp,i)=>{
                const s      = seguridad[emp.num];
                const ok     = s?.eps && s?.arl;
                const parcial= s && (s.eps||s.arl) && !ok;
                const col    = ok?"#00C9A7":parcial?"#F9A826":"rgba(255,255,255,0.25)";
                return (
                  <div key={i} style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${col}22`, borderRadius:10, padding:"10px 12px", display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"white", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{emp.nombre}</div>
                      <div style={{ display:"flex", gap:5, marginTop:4, flexWrap:"wrap" }}>
                        {s?.eps
                          ? <span style={{ fontSize:9, background:"rgba(255,107,107,0.1)", color:"#FF6B6B", borderRadius:4, padding:"1px 7px", fontWeight:700 }}>🏥 {s.eps}{s.fechaEPS?` · ${s.fechaEPS}`:""}</span>
                          : <span style={{ fontSize:9, color:"rgba(255,255,255,0.33)" }}>🏥 Sin EPS</span>}
                        {s?.arl
                          ? <span style={{ fontSize:9, background:"rgba(249,168,38,0.1)", color:"#F9A826", borderRadius:4, padding:"1px 7px", fontWeight:700 }}>🦺 {s.arl}{s.fechaARL?` · ${s.fechaARL}`:""}</span>
                          : <span style={{ fontSize:9, color:"rgba(255,255,255,0.33)" }}>🦺 Sin ARL</span>}
                        {s?.estado && <span style={{ fontSize:9, background:`${ok?"rgba(0,201,167,0.1)":"rgba(249,168,38,0.1)"}`, color:ok?"#00C9A7":"#F9A826", borderRadius:4, padding:"1px 7px", fontWeight:700 }}>{s.estado}</span>}
                      </div>
                    </div>
                    <button onClick={()=>{setEditSeg(emp.num);setFormSeg(s||{eps:"",fechaEPS:"",arl:"",fechaARL:"",estado:"Activo"});}}
                      style={{ background:"rgba(255,107,107,0.1)", border:"1px solid rgba(255,107,107,0.25)", borderRadius:7, padding:"5px 10px", fontSize:10, color:"#FF6B6B", cursor:"pointer", fontWeight:700, flexShrink:0 }}>
                      {s?"✏️ Editar":"➕ Registrar"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── MÓDULO NÓMINA ────────────────────────────────────────────
function NominaDemo() {
  const mob = useM();
  const hoyNom = new Date().toISOString().split("T")[0];
  const mesHoy = hoyNom.slice(0,7);
  const { config: cfgNom } = useConfiguracion();

  const cfgEmpresa    = cfgNom.cfg_empresa || {};
  const nombreEmpresa = cfgEmpresa.nombre || "Tierra Prometida Trading S.A.S";
  const nitEmpresa    = cfgEmpresa.nit    || "";

  // Constantes legales Colombia 2026
  const SMLMV     = 1423500;
  const AUX_TRANSP = 200000;
  const HORAS_MES = 240;

  // ── State ──
  const [tabNom, setTabNom]     = useState(0);
  const [confirm, setConfirm]   = useState(null);
  const pedir = (msg,fn) => setConfirm({msg,fn});
  const [toastNom, setToastNom] = useState(null);
  const showToastNom = (msg, ok = true) => { setToastNom({ msg, ok }); setTimeout(() => setToastNom(null), 3500); };

  // Tab 0 — Liquidador
  const [selEmp,      setSelEmp]      = useState("");
  const [periodo,     setPeriodo]     = useState(mesHoy);
  const [salBase,     setSalBase]     = useState(SALARIO_MINIMO);
  const [auxTransp,   setAuxTransp]   = useState(true);
  const [extras,      setExtras]      = useState({hed:0,hen:0,hrn:0,hedd:0,hedn:0,hrd:0});
  const [diasAus,     setDiasAus]     = useState(0);
  const [anticipo,    setAnticipo]    = useState(0);
  const [retencion,   setRetencion]   = useState(0);
  const [otrosDesc,   setOtrosDesc]   = useState(0);
  const [otrosDescLbl,setOtrosDescLbl]= useState("");
  // Tab 0 — Contenedor
  const [numConts,      setNumConts]      = useState(1);
  const [valorCont,     setValorCont]     = useState(VALOR_CONTENEDOR);
  const [metodoPago,    setMetodoPago]    = useState("Nequi");
  const [selectedConts, setSelectedConts] = useState([]);

  // Tab 2 — Contenedores (mostrar/ocultar personal por contenedor)
  const [personalVisible, setPersonalVisible] = useState({});
  const togglePersonal = (id) => setPersonalVisible(prev => ({ ...prev, [id]: !prev[id] }));

  // Tab 2 — Historial
  const [histFiltEmp,   setHistFiltEmp]   = useState("");
  const [histFiltDesde, setHistFiltDesde] = useState("");
  const [histFiltHasta, setHistFiltHasta] = useState("");

  // Vista previa de documentos
  const [previewData, setPreviewData] = useState(null);
  const verPrevia = (html, filename) => setPreviewData({url:URL.createObjectURL(new Blob([html],{type:"text/html"})), filename});
  useEffect(() => () => { if (previewData?.url) URL.revokeObjectURL(previewData.url); }, [previewData]);

  // Tab 3 — Contador
  const [periodoCtad, setPeriodoCtad] = useState(mesHoy);

  // Tab 5 — Pagos por trabajador (estadísticas derivadas de liquidaciones)
  const [selEmpPago, setSelEmpPago] = useState(null);

  // Tab 1 — Empleados / Tipos de pago
  const [tabEmpBusq, setTabEmpBusq] = useState("");
  const {
    liquidaciones, tiposPago, loading: loadingLiq,
    agregarLiquidacion, limpiarHistorial, setTipo, setTodosTipos,
  } = useLiquidaciones();
  const getTipo = (num) => tiposPago[num] || "contenedor";
  // Datos de contenedores y grupos para Tab Contenedores
  const { procesos, grupos } = useContenedores();
  // Empleados reales desde Supabase
  const { empleados, loading: loadingEmp } = usePersonal();

  const inp = {background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.13)",borderRadius:8,padding:"7px 10px",color:"white",fontSize:11,fontFamily:"inherit",width:"100%",boxSizing:"border-box"};
  const lbl = {fontSize:9,color:"rgba(255,255,255,0.48)",marginBottom:3};

  if (loadingLiq || loadingEmp) return <LimonLoader texto="Cargando nómina" />;

  // ── Empleado seleccionado ──
  const empSel = empleados.find(e=>e.num===selEmp) || null;

  // ── Leer ausencias de asistencia (desde Supabase) ──
  const readAusencias = async (nombreEmp, per) => {
    try {
      const inicio = `${per}-01`;
      const [y, m] = per.split("-").map(Number);
      const fin = `${per}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
      const { data } = await supabase.from("asistencia")
        .select("estado")
        .eq("emp_nombre", nombreEmp)
        .eq("estado", "A")
        .gte("fecha", inicio)
        .lte("fecha", fin);
      return data?.length || 0;
    } catch { return 0; }
  };

  // ── Cálculo liquidación ──
  const horaOrd = salBase / HORAS_MES;
  const HED  = extras.hed  * horaOrd * 1.25;
  const HEN  = extras.hen  * horaOrd * 1.75;
  const HRN  = extras.hrn  * horaOrd * 0.35;
  const HEDD = extras.hedd * horaOrd * 1.75;
  const HEDN = extras.hedn * horaOrd * 2.10;
  const HRD  = extras.hrd  * horaOrd * 0.75;
  const descAus    = (salBase / 30) * diasAus;
  const auxT       = auxTransp && salBase <= 2*SMLMV ? AUX_TRANSP : 0;
  const totalExtras= HED+HEN+HRN+HEDD+HEDN+HRD;
  const devengado  = salBase - descAus + auxT + totalExtras;
  const saludEmp   = salBase * 0.04;
  const pensionEmp = salBase * 0.04;
  const totalDeduc = saludEmp + pensionEmp + Number(retencion) + Number(anticipo) + Number(otrosDesc);
  const neto       = devengado - totalDeduc;

  // Provisiones empleador
  const cesantias  = salBase / 12;
  const intCes     = cesantias * 0.12;
  const prima      = salBase / 12;
  const vacaciones = (salBase * 15) / 360;
  const saludEmpr  = salBase * 0.085;
  const pensionEmpr= salBase * 0.12;
  const arl        = salBase * 0.00522;
  const caja       = salBase * 0.04;
  const senaIcbf   = salBase > 10*SMLMV ? salBase*0.05 : 0;
  const totalEmpr  = saludEmpr+pensionEmpr+arl+caja+senaIcbf;
  const totalProv  = cesantias+intCes+prima+vacaciones;

  // ── Generar colilla HTML ──
  const buildHtmlColilla = async () => {
    if (!empSel) return "";
    const logoSrc = await cargarLogoBase64();
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Colilla ${empSel.nombre} ${periodo}</title>
<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:24px;background:#f0f2f5;color:#1a1a1a}
.card{background:white;border-radius:12px;padding:24px;max-width:620px;margin:0 auto;box-shadow:0 2px 12px rgba(0,0,0,0.1)}
.hdr{text-align:center;border-bottom:3px solid #1D6F42;padding-bottom:16px;margin-bottom:20px}
.logo{font-size:32px}.logo img{width:34px;height:34px;object-fit:contain;display:block;margin:0 auto}.emp{font-size:18px;font-weight:800;color:#1D6F42}
.sub{font-size:12px;color:#666;margin-top:4px}
.chip{display:inline-block;background:#1D6F42;color:white;padding:2px 12px;border-radius:20px;font-size:11px;margin-top:6px}
.empbox{background:#f8fafb;border-radius:8px;padding:12px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px}
.empbox span{color:#888}.empbox b{display:block;color:#1a1a1a;margin-top:2px;font-size:12px}
.st{background:#1D6F42;color:white;padding:6px 12px;font-size:12px;font-weight:700;margin-top:14px;border-radius:6px 6px 0 0}
table{width:100%;border-collapse:collapse;font-size:11px}
td{padding:7px 10px;border:1px solid #e8e8e8}
.lbl{color:#555}.val{text-align:right;font-weight:600;color:#1a1a1a}
.ded{text-align:right;font-weight:600;color:#c62828}
tr:nth-child(even) td{background:#fafafa}
.tot td{background:#e8f5e9;font-weight:800;font-size:13px;color:#1D6F42}
.netbox{background:#1D6F42;color:white;border-radius:8px;padding:18px;text-align:center;margin-top:16px}
.netlbl{font-size:12px;opacity:0.85}.netval{font-size:28px;font-weight:800;margin:4px 0}
.netbco{font-size:10px;opacity:0.7}
.prov{background:#f3f4f6;border-radius:8px;padding:12px;margin-top:12px;font-size:10px;color:#666;line-height:1.8}
.footer{text-align:center;margin-top:14px;font-size:10px;color:#aaa}
</style></head><body><div class="card">
<div class="hdr"><div class="logo">${logoSrc ? `<img src="${logoSrc}"/>` : "🍋"}</div><div class="emp">${nombreEmpresa}</div>
<div class="sub">${nitEmpresa ? `NIT: ${nitEmpresa}` : ""} · Colilla de Pago · Periodo: <b>${periodo}</b></div>
<div class="chip">Generado por JARVIS 🤖</div></div>
<div class="empbox">
  <div><span>Empleado</span><b>${empSel.nombre}</b></div>
  <div><span>C.C.</span><b>${empSel.num}</b></div>
  <div><span>Área</span><b>${empSel.area}</b></div>
  <div><span>Banco / Cuenta</span><b>${empSel.banco} ${empSel.cuenta||"—"}</b></div>
</div>
<div class="st">📈 DEVENGADO</div>
<table><tbody>
  <tr><td class="lbl">Salario básico</td><td class="val">${fmtCOP(salBase)}</td></tr>
  ${auxT>0?`<tr><td class="lbl">Auxilio de transporte (Dcto. 2024)</td><td class="val">${fmtCOP(auxT)}</td></tr>`:""}
  ${descAus>0?`<tr><td class="lbl">(-) Descuento por ${diasAus} día(s) de ausencia</td><td class="ded">-${fmtCOP(descAus)}</td></tr>`:""}
  ${HED>0?`<tr><td class="lbl">H. Extra Diurna (${extras.hed}h × 1.25) — Art. 168 CST</td><td class="val">${fmtCOP(HED)}</td></tr>`:""}
  ${HEN>0?`<tr><td class="lbl">H. Extra Nocturna (${extras.hen}h × 1.75) — Art. 168 CST</td><td class="val">${fmtCOP(HEN)}</td></tr>`:""}
  ${HRN>0?`<tr><td class="lbl">Recargo Nocturno Ordinario (${extras.hrn}h × 35%) — Art. 168</td><td class="val">${fmtCOP(HRN)}</td></tr>`:""}
  ${HEDD>0?`<tr><td class="lbl">H. Extra Dom./Festivo Diurna (${extras.hedd}h × 1.75)</td><td class="val">${fmtCOP(HEDD)}</td></tr>`:""}
  ${HEDN>0?`<tr><td class="lbl">H. Extra Dom./Festivo Nocturna (${extras.hedn}h × 2.10)</td><td class="val">${fmtCOP(HEDN)}</td></tr>`:""}
  ${HRD>0?`<tr><td class="lbl">Recargo Dom./Festivo Ordinario (${extras.hrd}h × 75%)</td><td class="val">${fmtCOP(HRD)}</td></tr>`:""}
  <tr class="tot"><td>TOTAL DEVENGADO</td><td style="text-align:right">${fmtCOP(devengado)}</td></tr>
</tbody></table>
<div class="st">📉 DEDUCCIONES</div>
<table><tbody>
  <tr><td class="lbl">Salud empleado — 4% (Ley 100/1993)</td><td class="ded">-${fmtCOP(saludEmp)}</td></tr>
  <tr><td class="lbl">Pensión empleado — 4% (Ley 100/1993)</td><td class="ded">-${fmtCOP(pensionEmp)}</td></tr>
  ${Number(retencion)>0?`<tr><td class="lbl">Retención en la fuente — Art. 383 ET</td><td class="ded">-${fmtCOP(retencion)}</td></tr>`:""}
  ${Number(anticipo)>0?`<tr><td class="lbl">Anticipo descontado</td><td class="ded">-${fmtCOP(anticipo)}</td></tr>`:""}
  ${Number(otrosDesc)>0?`<tr><td class="lbl">${otrosDescLbl||"Otros descuentos"}</td><td class="ded">-${fmtCOP(otrosDesc)}</td></tr>`:""}
  <tr class="tot"><td>TOTAL DEDUCCIONES</td><td style="text-align:right;color:#c62828">-${fmtCOP(totalDeduc)}</td></tr>
</tbody></table>
<div class="netbox">
  <div class="netlbl">NETO A PAGAR</div>
  <div class="netval">${fmtCOP(neto)}</div>
  <div class="netbco">${empSel.banco} · Cta: ${empSel.cuenta||"—"}</div>
</div>
<div class="prov">
  <b>🏢 Aportes y provisiones empleador (informativo — no se descuentan al empleado)</b><br/>
  Cesantías (8.33%): ${fmtCOP(cesantias)} &nbsp;·&nbsp; Intereses cesantías (12% s/ces.): ${fmtCOP(intCes)} &nbsp;·&nbsp; Prima (8.33%): ${fmtCOP(prima)} &nbsp;·&nbsp; Vacaciones (4.17%): ${fmtCOP(vacaciones)}<br/>
  Salud empleador (8.5%): ${fmtCOP(saludEmpr)} &nbsp;·&nbsp; Pensión empleador (12%): ${fmtCOP(pensionEmpr)} &nbsp;·&nbsp; ARL Nivel I (0.522%): ${fmtCOP(arl)} &nbsp;·&nbsp; Caja Comp. Fam. (4%): ${fmtCOP(caja)}${senaIcbf>0?` &nbsp;·&nbsp; SENA+ICBF (5%): ${fmtCOP(senaIcbf)}`:""}
  <br/><b>Costo total empleador este mes: ${fmtCOP(salBase+totalEmpr+totalProv)}</b>
</div>
<div class="footer">Tierra Prometida Trading 🍋 · JARVIS · ${new Date().toLocaleDateString("es-CO")}<br/>
Documento informativo. Para efectos contables y legales, consulte al contador.</div>
</div></body></html>`;
  };
  const generarColilla = async () => {
    if (!empSel) return;
    const html = await buildHtmlColilla();
    const fname = `Colilla_${empSel.nombre.replace(/ /g,"_")}_${periodo}.html`;
    const _u1=URL.createObjectURL(new Blob([html],{type:"text/html"}));
    const a=document.createElement("a");a.href=_u1;a.download=fname;a.click();URL.revokeObjectURL(_u1);
    const reg={id:Date.now(),empNum:empSel.num,nombre:empSel.nombre,area:empSel.area,periodo,salBase,devengado,totalDeduc,neto,ausencias:diasAus,fecha:hoyNom,tipo:"nomina",html};
    agregarLiquidacion(reg);
  };

  const TABS_NOM = ["💰 Liquidador","👤 Empleados","🚢 Contenedores","📜 Historial","📋 Contador","📊 Pagos"];
  return (
    <div>
      {confirm && <ConfirmModal mensaje={confirm.msg} onConfirm={()=>{confirm.fn();setConfirm(null);}} onCancel={()=>setConfirm(null)} />}

      {toastNom && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background: toastNom.ok ? "#064e3b" : "#450a0a", border:`1px solid ${toastNom.ok ? "#059669" : "#dc2626"}`, color: toastNom.ok ? "#6ee7b7" : "#fca5a5", borderRadius:10, padding:"10px 20px", fontSize:12, fontWeight:600, zIndex:9999, pointerEvents:"none", whiteSpace:"nowrap" }}>
          {toastNom.ok ? "✅" : "❌"} {toastNom.msg}
        </div>
      )}

      {previewData && (
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.88)",zIndex:9998,display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",background:"#12121f",borderBottom:"1px solid rgba(255,255,255,0.13)",flexShrink:0}}>
            <span style={{color:"white",fontWeight:700,fontSize:13}}>👁 Vista Previa — {previewData.filename}</span>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{const a=document.createElement("a");a.href=previewData.url;a.download=previewData.filename;a.click();}} style={{background:"linear-gradient(135deg,#1D6F42,#21A366)",border:"none",borderRadius:8,padding:"7px 16px",fontSize:12,color:"white",cursor:"pointer",fontWeight:700}}>📥 Descargar</button>
              <button onClick={()=>setPreviewData(null)} style={{background:"rgba(255,255,255,0.10)",border:"1px solid rgba(255,255,255,0.20)",borderRadius:8,padding:"7px 14px",fontSize:12,color:"rgba(255,255,255,0.78)",cursor:"pointer"}}>✕ Cerrar</button>
            </div>
          </div>
          <iframe src={previewData.url} style={{flex:1,border:"none",background:"white"}} title="Vista previa del documento" />
        </div>
      )}

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:14,borderBottom:"1px solid rgba(255,255,255,0.10)",paddingBottom:10,overflowX:"auto",flexWrap:"nowrap",scrollbarWidth:"none"}}>
        {TABS_NOM.map((t,i)=>(
          <button key={i} onClick={()=>setTabNom(i)}
            style={{background:tabNom===i?"rgba(249,168,38,0.2)":"transparent",border:tabNom===i?"1px solid rgba(249,168,38,0.5)":"1px solid transparent",borderRadius:8,padding:"6px 12px",fontSize:11,color:tabNom===i?"#F9A826":"rgba(255,255,255,0.4)",cursor:"pointer",fontWeight:tabNom===i?700:400,whiteSpace:"nowrap",flexShrink:0}}>
            {t}
          </button>
        ))}
      </div>

      {/* ═══ TAB 0: LIQUIDADOR ═══ */}
      {tabNom === 0 && (
        <div>
          <div style={{display:"flex",flexDirection:mob?"column":"row",gap:6,marginBottom:10}}>
            <div style={{flex:2}}>
              <div style={lbl}>Empleado</div>
              <CustomSelect value={selEmp} onChange={e=>{setSelEmp(e.target.value);setNumConts(1);setValorCont(VALOR_CONTENEDOR);setMetodoPago("Nequi");setSelectedConts([]);const em=empleados.find(x=>x.num===e.target.value);if(em){readAusencias(em.nombre,periodo).then(setDiasAus);}}} style={inp}>
                <option value="" style={{background:"#1a1a2e"}}>— Seleccionar empleado —</option>
                {empleados.map(e=><option key={e.num} value={e.num} style={{background:"#1a1a2e"}}>{e.nombre} · {e.area}</option>)}
              </CustomSelect>
            </div>
            <div style={{flex:1}}>
              <div style={lbl}>Periodo</div>
              <input type="month" value={periodo} onChange={e=>{setPeriodo(e.target.value);if(empSel){readAusencias(empSel.nombre,e.target.value).then(setDiasAus);}}} style={inp} />
            </div>
          </div>

          {empSel && (
            <div style={{background:"rgba(249,168,38,0.07)",border:"1px solid rgba(249,168,38,0.2)",borderRadius:10,padding:"10px 14px",marginBottom:10,fontSize:11}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                {[["CC",empSel.num],["Banco",empSel.banco],["Cuenta",empSel.cuenta||"—"]].map(([k,v])=>(
                  <div key={k}><span style={{color:"rgba(255,255,255,0.42)"}}>{k}: </span><span style={{color:"white",fontWeight:600}}>{v}</span></div>
                ))}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                <span style={{fontSize:9,color:"rgba(255,255,255,0.42)",marginRight:4}}>Tipo de pago:</span>
                {["contenedor","nomina"].map(t=>{
                  const act=getTipo(empSel.num)===t;
                  return (
                    <button key={t} onClick={()=>setTipo(empSel.num,t)}
                      style={{padding:"4px 12px",fontSize:10,borderRadius:7,border:`1px solid ${act?(t==="contenedor"?"#00C9A7":"#a5b4fc"):"rgba(255,255,255,0.1)"}`,background:act?(t==="contenedor"?"rgba(0,201,167,0.18)":"rgba(99,102,241,0.18)"):"transparent",color:act?(t==="contenedor"?"#00C9A7":"#a5b4fc"):"rgba(255,255,255,0.35)",cursor:"pointer",fontWeight:act?700:400,transition:"all .15s"}}>
                      {t==="contenedor"?"🚢 Por Contenedor":"📋 Por Nómina / Contrato"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(!empSel || getTipo(empSel.num) === "nomina") && <>
          {/* Salario y ausencias */}
          <div style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.11)",borderRadius:12,padding:12,marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:"rgba(249,168,38,0.9)",marginBottom:8}}>Configuración salarial</div>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              <div style={{flex:1}}><div style={lbl}>Salario base COP</div><input type="number" value={salBase} onChange={e=>setSalBase(Number(e.target.value)||0)} style={inp} /></div>
              <div style={{flex:1}}>
                <div style={lbl}>Días ausente — auto-asistencia {diasAus>0&&<span style={{color:"#FF6B6B"}}>({diasAus} detectados)</span>}</div>
                <input type="number" min="0" max="30" value={diasAus} onChange={e=>setDiasAus(Number(e.target.value)||0)} style={inp} />
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div onClick={()=>setAuxTransp(v=>!v)}
                style={{width:36,height:20,borderRadius:10,background:auxTransp?"#F9A826":"rgba(255,255,255,0.1)",cursor:"pointer",position:"relative",flexShrink:0}}>
                <div style={{position:"absolute",top:2,left:auxTransp?16:2,width:16,height:16,borderRadius:8,background:"white",transition:"left .15s"}} />
              </div>
              <span style={{fontSize:11,color:salBase>2*SMLMV?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.5)"}}>
                Auxilio de transporte {fmtCOP(AUX_TRANSP)} {salBase>2*SMLMV?"— no aplica (salario > 2 SMLMV)":"— aplica"}
              </span>
            </div>
          </div>

          {/* Horas extras y recargos */}
          <div style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.11)",borderRadius:12,padding:12,marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:"rgba(99,102,241,0.9)",marginBottom:8}}>Horas extras y recargos — Hora ordinaria: {fmtCOP(horaOrd)}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {[
                {k:"hed",  l:"H. Extra Diurna ×1.25",            v:HED},
                {k:"hen",  l:"H. Extra Nocturna ×1.75",          v:HEN},
                {k:"hrn",  l:"Recargo Nocturno Ord. +35%",       v:HRN},
                {k:"hedd", l:"H. Extra Dom/Fest Diurna ×1.75",   v:HEDD},
                {k:"hedn", l:"H. Extra Dom/Fest Noct. ×2.10",    v:HEDN},
                {k:"hrd",  l:"Recargo Dom/Fest Ord. +75%",       v:HRD},
              ].map(({k,l,v})=>(
                <div key={k} style={{background:"rgba(255,255,255,0.05)",borderRadius:8,padding:"8px 10px"}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.48)",marginBottom:4}}>{l}</div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <input type="number" min="0" value={extras[k]} onChange={e=>setExtras(p=>({...p,[k]:Number(e.target.value)||0}))}
                      style={{...inp,width:60,padding:"5px 8px"}} />
                    <span style={{fontSize:10,color:"rgba(255,255,255,0.38)"}}>h</span>
                    {v>0&&<span style={{fontSize:10,color:"#a5b4fc",marginLeft:"auto"}}>{fmtCOP(v)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Deducciones adicionales */}
          <div style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.11)",borderRadius:12,padding:12,marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:"rgba(255,107,107,0.9)",marginBottom:8}}>Deducciones adicionales</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <div><div style={lbl}>Anticipo a descontar</div><input type="number" min="0" value={anticipo} onChange={e=>setAnticipo(Number(e.target.value)||0)} style={inp} /></div>
              <div><div style={lbl}>Retención en la fuente</div><input type="number" min="0" value={retencion} onChange={e=>setRetencion(Number(e.target.value)||0)} style={inp} /></div>
              <div><div style={lbl}>Otros descuentos (COP)</div><input type="number" min="0" value={otrosDesc} onChange={e=>setOtrosDesc(Number(e.target.value)||0)} style={inp} /></div>
              <div><div style={lbl}>Concepto otros descuentos</div><input value={otrosDescLbl} onChange={e=>setOtrosDescLbl(e.target.value)} placeholder="Ej: Libranza, embargo..." style={inp} /></div>
            </div>
          </div>

          {/* Resumen */}
          <div style={{background:"rgba(249,168,38,0.06)",border:"1px solid rgba(249,168,38,0.2)",borderRadius:12,padding:14,marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:"#F9A826",marginBottom:10}}>Resumen de liquidación — {periodo}</div>
            <div style={{marginBottom:8}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.38)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Devengado</div>
              {[
                ["Salario básico", fmtCOP(salBase), "#F9A826"],
                auxT>0 && ["Auxilio de transporte", fmtCOP(auxT), "#F9A826"],
                diasAus>0 && [`Descuento ${diasAus} día(s) ausente`, `-${fmtCOP(descAus)}`, "#FF6B6B"],
                totalExtras>0 && ["Extras y recargos", fmtCOP(totalExtras), "#a5b4fc"],
              ].filter(Boolean).map(([l,v,c],i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
                  <span style={{color:"rgba(255,255,255,0.62)"}}>{l}</span><span style={{color:c,fontWeight:600}}>{v}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:700,color:"#F9A826",padding:"5px 0",marginTop:2}}>
                <span>Total devengado</span><span>{fmtCOP(devengado)}</span>
              </div>
            </div>
            <div style={{marginBottom:8}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.38)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Deducciones</div>
              {[
                ["Salud empleado 4%", fmtCOP(saludEmp)],
                ["Pensión empleado 4%", fmtCOP(pensionEmp)],
                retencion>0 && ["Retención en la fuente", fmtCOP(retencion)],
                anticipo>0 && ["Anticipo descontado", fmtCOP(anticipo)],
                otrosDesc>0 && [otrosDescLbl||"Otros descuentos", fmtCOP(otrosDesc)],
              ].filter(Boolean).map(([l,v],i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
                  <span style={{color:"rgba(255,255,255,0.62)"}}>{l}</span><span style={{color:"#FF6B6B",fontWeight:600}}>-{v}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:700,color:"#FF6B6B",padding:"5px 0",marginTop:2}}>
                <span>Total deducciones</span><span>-{fmtCOP(totalDeduc)}</span>
              </div>
            </div>
            <div style={{background:"rgba(0,201,167,0.15)",border:"1px solid rgba(0,201,167,0.3)",borderRadius:10,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:700,color:"white"}}>NETO A PAGAR</span>
              <span style={{fontSize:20,fontWeight:800,color:"#00C9A7"}}>{fmtCOP(neto)}</span>
            </div>
          </div>

          {/* Provisiones empleador */}
          <div style={{background:"rgba(99,102,241,0.05)",border:"1px solid rgba(99,102,241,0.15)",borderRadius:12,padding:12,marginBottom:12}}>
            <div style={{fontSize:10,color:"rgba(99,102,241,0.8)",fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>Aportes y provisiones empleador — informativo</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:3}}>
              {[
                ["Cesantías 8.33%",fmtCOP(cesantias)],["Int. cesantías 12%",fmtCOP(intCes)],
                ["Prima servicios 8.33%",fmtCOP(prima)],["Vacaciones 4.17%",fmtCOP(vacaciones)],
                ["Salud empl. 8.5%",fmtCOP(saludEmpr)],["Pensión empl. 12%",fmtCOP(pensionEmpr)],
                ["ARL Nivel I 0.52%",fmtCOP(arl)],["Caja Comp. Fam. 4%",fmtCOP(caja)],
              ].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
                  <span style={{color:"rgba(255,255,255,0.42)"}}>{l}</span><span style={{color:"#a5b4fc",fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{marginTop:6,paddingTop:6,borderTop:"1px solid rgba(99,102,241,0.2)"}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:700,color:"white"}}>
                <span>Costo total empleador este mes</span>
                <span>{fmtCOP(salBase+totalEmpr+totalProv)}</span>
              </div>
            </div>
          </div>

          <div style={{display:"flex",gap:8}}>
            <button onClick={async ()=>{if(!empSel){alert("Selecciona un empleado");return;}verPrevia(await buildHtmlColilla(),`Colilla_${empSel.nombre.replace(/ /g,"_")}_${periodo}.html`);}}
              style={{background:"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:10,padding:"11px 14px",fontSize:13,color:"#a5b4fc",cursor:"pointer",fontWeight:700}}>
              👁 Vista Previa
            </button>
            <button onClick={()=>{if(!empSel){alert("Selecciona un empleado");return;}pedir(`¿Generar colilla de ${empSel.nombre} para ${periodo}?`,generarColilla);}}
              style={{flex:1,background:"linear-gradient(135deg,#1D6F42,#21A366)",border:"none",borderRadius:10,padding:"11px",fontSize:13,color:"white",cursor:"pointer",fontWeight:700}}>
              📄 Generar y Descargar Colilla
            </button>
            <button onClick={()=>{setExtras({hed:0,hen:0,hrn:0,hedd:0,hedn:0,hrd:0});setDiasAus(0);setAnticipo(0);setRetencion(0);setOtrosDesc(0);setOtrosDescLbl("");setSalBase(SALARIO_MINIMO);}}
              style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.13)",borderRadius:10,padding:"11px 14px",fontSize:12,color:"rgba(255,255,255,0.48)",cursor:"pointer"}}>
              🔄 Limpiar
            </button>
          </div>
          </>}

          {empSel && getTipo(empSel.num) === "contenedor" && (() => {
            const METODOS = [
              {id:"Nequi",      icon:"📱", color:"#845EF7"},
              {id:"Bancolombia",icon:"🏦", color:"#F9A826"},
              {id:"Efectivo",   icon:"💵", color:"#00C9A7"},
            ];
            // Contenedores del sistema donde participó este empleado
            const contsDisp = procesos.map(p => {
              const gD = grupos.find(g=>g.nombre===p.grupoDia);
              const gN = grupos.find(g=>g.nombre===p.grupoNoche);
              const enDia   = gD?.miembros?.includes(empSel.num);
              const enNoche = gN?.miembros?.includes(empSel.num);
              if (!enDia && !enNoche) return null;
              return { ...p, turno: enDia && enNoche ? "Ambos" : enDia ? "Día" : "Noche" };
            }).filter(Boolean);
            const hayConts = contsDisp.length > 0;
            // Selección: si hay contenedores en sistema, usamos selectedConts; si no, numConts manual
            const contsSel = hayConts
              ? contsDisp.filter(p => selectedConts.includes(p.id))
              : [];
            const cantEfectiva = hayConts ? contsSel.length : numConts;
            const totalCont = cantEfectiva * valorCont;
            const infoPago = metodoPago==="Efectivo"
              ? "Pago en efectivo"
              : `${empSel.banco} · Cta: ${empSel.cuenta && empSel.cuenta!=="-" ? empSel.cuenta : "sin registrar"}`;
            const toggleCont = (id) => setSelectedConts(prev =>
              prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]
            );
            const buildHtmlComprobante = async () => {
              const logoSrc = await cargarLogoBase64();
              const filas = hayConts && contsSel.length > 0
                ? contsSel.map((p,i) => `<tr><td>${i+1}</td><td class="lbl"><b>${p.numContenedor}</b> · ${p.fecha}${p.producto?` · ${p.producto}`:""}</td><td style="text-align:center">${p.turno==="Día"?"☀️ Día":p.turno==="Noche"?"🌙 Noche":"☀️🌙 Ambos"}</td><td class="val">$${Math.round(valorCont).toLocaleString("es-CO")}</td></tr>`).join("")
                : `<tr><td colspan="3" class="lbl">${numConts} contenedor${numConts!==1?"es":""} trabajado${numConts!==1?"s":""}</td><td class="val">$${Math.round(valorCont).toLocaleString("es-CO")} c/u</td></tr>`;
              return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Comprobante ${empSel.nombre}</title>
<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:24px;background:#f0f2f5;color:#1a1a1a}
.card{background:white;border-radius:12px;padding:24px;max-width:620px;margin:0 auto;box-shadow:0 2px 12px rgba(0,0,0,.1)}
.hdr{text-align:center;border-bottom:3px solid #1D6F42;padding-bottom:16px;margin-bottom:20px}
.logo{font-size:32px}.logo img{width:34px;height:34px;object-fit:contain;display:block;margin:0 auto}.emp{font-size:18px;font-weight:800;color:#1D6F42}.sub{font-size:12px;color:#666;margin-top:4px}
.chip{display:inline-block;background:#1D6F42;color:white;padding:2px 12px;border-radius:20px;font-size:11px;margin-top:6px}
.empbox{background:#f8fafb;border-radius:8px;padding:12px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:11px}
.empbox span{color:#888}.empbox b{display:block;color:#1a1a1a;margin-top:2px;font-size:12px}
.st{background:#1D6F42;color:white;padding:6px 12px;font-size:12px;font-weight:700;margin-top:14px;border-radius:6px 6px 0 0}
table{width:100%;border-collapse:collapse;font-size:11px}td{padding:8px 10px;border:1px solid #e8e8e8}
.lbl{color:#555}.val{text-align:right;font-weight:600}tr:nth-child(even) td{background:#fafafa}
.tot td{background:#e8f5e9;font-weight:800;font-size:13px;color:#1D6F42}
.netbox{background:#1D6F42;color:white;border-radius:8px;padding:20px;text-align:center;margin-top:16px}
.netlbl{font-size:12px;opacity:.85}.netval{font-size:32px;font-weight:800;margin:6px 0}
.metodo{font-size:11px;opacity:.8;margin-top:4px}
.footer{text-align:center;margin-top:14px;font-size:10px;color:#aaa}</style></head>
<body><div class="card">
<div class="hdr"><div class="logo">${logoSrc ? `<img src="${logoSrc}"/>` : "🍋"}</div><div class="emp">${nombreEmpresa}</div>
<div class="sub">${nitEmpresa ? `NIT: ${nitEmpresa} · ` : ""}Comprobante de Pago por Contenedor · Periodo: <b>${periodo}</b></div>
<div class="chip">Generado por JARVIS 🤖</div></div>
<div class="empbox">
  <div><span>Nombre completo</span><b>${empSel.nombre}</b></div>
  <div><span>Identificación</span><b>${empSel.doc} ${empSel.num}</b></div>
  <div><span>Área</span><b>${empSel.area}</b></div>
  <div><span>Banco</span><b>${empSel.banco}</b></div>
  <div><span>Cuenta / Cel.</span><b>${empSel.cuenta && empSel.cuenta!=="-" ? empSel.cuenta : "—"}</b></div>
  <div><span>Método de pago</span><b>${metodoPago}</b></div>
</div>
<div class="st">🚢 CONTENEDORES TRABAJADOS</div>
<table><thead><tr style="background:#1D6F42;color:white"><th style="padding:7px 10px;text-align:left">#</th><th style="padding:7px 10px;text-align:left">Contenedor · Fecha · Producto</th><th style="padding:7px 10px;text-align:center">Turno</th><th style="padding:7px 10px;text-align:right">Valor</th></tr></thead>
<tbody>${filas}
<tr class="tot"><td colspan="3">TOTAL (${cantEfectiva} contenedor${cantEfectiva!==1?"es":""})</td><td style="text-align:right">$${Math.round(totalCont).toLocaleString("es-CO")}</td></tr>
</tbody></table>
<div class="netbox">
  <div class="netlbl">TOTAL A PAGAR</div>
  <div class="netval">$${Math.round(totalCont).toLocaleString("es-CO")}</div>
  <div class="metodo">${metodoPago==="Efectivo"?"💵 Pago en efectivo":`${metodoPago==="Nequi"?"📱":"🏦"} ${empSel.banco} · Cta: ${empSel.cuenta && empSel.cuenta!=="-" ? empSel.cuenta : "—"}`}</div>
</div>
<div class="footer">Tierra Prometida Trading 🍋 · JARVIS · ${new Date().toLocaleDateString("es-CO")}<br/>Documento informativo — No válido como soporte contable.</div>
</div></body></html>`;
            };
            const guardarPagoContenedor = async (descargar) => {
              const html = await buildHtmlComprobante();
              if (descargar) {
                const fname = `Comprobante_${empSel.nombre.replace(/ /g,"_")}_${periodo}.html`;
                const _u2=URL.createObjectURL(new Blob([html],{type:"text/html"}));
                const a=document.createElement("a");a.href=_u2;a.download=fname;a.click();URL.revokeObjectURL(_u2);
              }
              const reg={id:Date.now(),empNum:empSel.num,nombre:empSel.nombre,area:empSel.area,periodo,salBase:0,devengado:totalCont,totalDeduc:0,neto:totalCont,ausencias:0,fecha:hoyNom,tipo:"contenedor",contenedores:cantEfectiva,metodoPago,html};
              const ok = await agregarLiquidacion(reg);
              showToastNom(ok ? "Pago guardado en el historial ✓" : "Error al guardar — verifica la conexión", ok);
            };
            const guardarPago = () => guardarPagoContenedor(false);
            const generarComprobante = () => guardarPagoContenedor(true);
            return (
              <div>
                <div style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.11)",borderRadius:12,padding:12,marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:700,color:"rgba(0,201,167,0.9)",marginBottom:10}}>
                    Pago por contenedor — {periodo}
                  </div>

                  {/* Selector de contenedores del sistema */}
                  {hayConts ? (
                    <div style={{marginBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <div style={lbl}>Contenedores registrados — selecciona los que pagará</div>
                        <button onClick={()=>setSelectedConts(selectedConts.length===contsDisp.length?[]:contsDisp.map(p=>p.id))}
                          style={{fontSize:9,padding:"2px 8px",borderRadius:5,border:"1px solid rgba(0,201,167,0.3)",background:"rgba(0,201,167,0.1)",color:"#00C9A7",cursor:"pointer"}}>
                          {selectedConts.length===contsDisp.length?"Quitar todos":"Selec. todos"}
                        </button>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:200,overflowY:"auto"}}>
                        {contsDisp.map(p=>{
                          const sel=selectedConts.includes(p.id);
                          const tCol=p.turno==="Día"?"#F9A826":p.turno==="Noche"?"#845EF7":"#00C9A7";
                          return (
                            <div key={p.id} onClick={()=>toggleCont(p.id)}
                              style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,border:`1px solid ${sel?"rgba(0,201,167,0.4)":"rgba(255,255,255,0.07)"}`,background:sel?"rgba(0,201,167,0.08)":"rgba(255,255,255,0.02)",cursor:"pointer"}}>
                              <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${sel?"#00C9A7":"rgba(255,255,255,0.2)"}`,background:sel?"#00C9A7":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                                {sel&&<span style={{color:"white",fontSize:10,fontWeight:900}}>✓</span>}
                              </div>
                              <div style={{flex:1,minWidth:0}}>
                                <span style={{fontSize:11,fontWeight:700,color:"white"}}>🚢 {p.numContenedor}</span>
                                <span style={{fontSize:10,color:"rgba(255,255,255,0.42)",marginLeft:6}}>📅 {p.fecha}</span>
                                {p.producto&&<span style={{fontSize:10,color:"rgba(255,255,255,0.38)",marginLeft:6}}>{p.producto}</span>}
                              </div>
                              <span style={{fontSize:10,fontWeight:700,color:tCol,background:`${tCol}18`,borderRadius:5,padding:"2px 7px",flexShrink:0}}>
                                {p.turno==="Día"?"☀️ Día":p.turno==="Noche"?"🌙 Noche":"☀️🌙 Ambos"}
                              </span>
                              <span style={{fontSize:11,fontWeight:700,color:"#00C9A7",flexShrink:0}}>{fmtCOP(valorCont)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div style={{marginBottom:12}}>
                      <div style={lbl}>Contenedores trabajados</div>
                      <input type="number" min="0" value={numConts} onChange={e=>setNumConts(Number(e.target.value)||0)}
                        style={{...inp,fontSize:18,fontWeight:700,textAlign:"center",color:"#00C9A7"}} />
                      <div style={{fontSize:9,color:"rgba(255,255,255,0.33)",marginTop:4}}>Sin contenedores registrados en el sistema — entrada manual</div>
                    </div>
                  )}

                  {/* Valor y método */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                    <div>
                      <div style={lbl}>Valor por contenedor (COP)</div>
                      <input type="number" min="0" value={valorCont} onChange={e=>setValorCont(Number(e.target.value)||0)} style={inp} />
                    </div>
                    <div>
                      <div style={lbl}>Método de pago</div>
                      <div style={{display:"flex",gap:4,marginTop:4}}>
                        {METODOS.map(m=>{
                          const act=metodoPago===m.id;
                          return (
                            <button key={m.id} onClick={()=>setMetodoPago(m.id)}
                              style={{flex:1,padding:"6px 2px",borderRadius:7,border:`1px solid ${act?m.color:"rgba(255,255,255,0.15)"}`,background:act?`${m.color}22`:"transparent",color:act?m.color:"rgba(255,255,255,0.38)",cursor:"pointer",fontSize:10,fontWeight:act?700:400}}>
                              {m.icon} {m.id}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {metodoPago!=="Efectivo"&&(
                    <div style={{padding:"6px 10px",background:"rgba(255,255,255,0.05)",borderRadius:7,fontSize:10,color:"rgba(255,255,255,0.48)"}}>
                      {empSel.banco} · Cuenta: <span style={{color:"white",fontWeight:600}}>{empSel.cuenta && empSel.cuenta!=="-" ? empSel.cuenta : "sin registrar"}</span>
                    </div>
                  )}
                </div>

                {/* Total */}
                <div style={{background:"rgba(0,201,167,0.09)",border:"1px solid rgba(0,201,167,0.3)",borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.48)"}}>{cantEfectiva} contenedor{cantEfectiva!==1?"es":""} × {fmtCOP(valorCont)}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.42)",marginTop:2}}>{infoPago}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:9,color:"rgba(0,201,167,0.6)",textTransform:"uppercase",letterSpacing:0.5}}>Total a pagar</div>
                    <div style={{fontSize:24,fontWeight:800,color:"#00C9A7"}}>{fmtCOP(totalCont)}</div>
                  </div>
                </div>

                <div style={{display:"flex",gap:8,flexWrap:mob?"wrap":"nowrap"}}>
                  <button onClick={async ()=>{
                    if(cantEfectiva===0){alert(hayConts?"Selecciona al menos un contenedor":"Ingresa al menos 1 contenedor");return;}
                    verPrevia(await buildHtmlComprobante(),`Comprobante_${empSel.nombre.replace(/ /g,"_")}_${periodo}.html`);
                  }} style={{flex:mob?"1 1 auto":"0 0 auto",background:"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:10,padding:"11px 14px",fontSize:13,color:"#a5b4fc",cursor:"pointer",fontWeight:700}}>
                    👁 Vista Previa
                  </button>
                  <button onClick={()=>{
                    if(cantEfectiva===0){alert(hayConts?"Selecciona al menos un contenedor":"Ingresa al menos 1 contenedor");return;}
                    pedir(`¿Guardar el pago de ${empSel.nombre} sin descargar el comprobante ahora?\n${cantEfectiva} contenedor${cantEfectiva!==1?"es":""} · ${fmtCOP(totalCont)} · ${metodoPago}\nPodrás descargarlo después desde Historial.`,guardarPago);
                  }} style={{flex:mob?"1 1 auto":"0 0 auto",background:"rgba(0,201,167,0.12)",border:"1px solid rgba(0,201,167,0.35)",borderRadius:10,padding:"11px 14px",fontSize:13,color:"#00C9A7",cursor:"pointer",fontWeight:700}}>
                    💾 Guardar Pago
                  </button>
                  <button onClick={()=>{
                    if(cantEfectiva===0){alert(hayConts?"Selecciona al menos un contenedor":"Ingresa al menos 1 contenedor");return;}
                    pedir(`¿Generar comprobante de ${empSel.nombre}?\n${cantEfectiva} contenedor${cantEfectiva!==1?"es":""} · ${fmtCOP(totalCont)} · ${metodoPago}`,generarComprobante);
                  }} style={{flex:mob?"1 1 100%":1,background:"linear-gradient(135deg,#6d28d9,#845EF7)",border:"none",borderRadius:10,padding:"11px",fontSize:13,color:"white",cursor:"pointer",fontWeight:700}}>
                    📄 Generar Comprobante
                  </button>
                  <button onClick={()=>{setSelectedConts([]);setNumConts(1);setValorCont(VALOR_CONTENEDOR);setMetodoPago("Nequi");}}
                    style={{flex:"0 0 auto",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.13)",borderRadius:10,padding:"11px 14px",fontSize:12,color:"rgba(255,255,255,0.48)",cursor:"pointer"}}>
                    🔄
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══ TAB 1: EMPLEADOS ═══ */}
      {tabNom === 1 && (
        <div>
          <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"flex-end",flexWrap:"wrap"}}>
            <div style={{flex:2}}>
              <div style={lbl}>Buscar empleado</div>
              <input value={tabEmpBusq} onChange={e=>setTabEmpBusq(e.target.value)} placeholder="Nombre o área..." style={inp} />
            </div>
            <button onClick={()=>setTodosTipos("contenedor", empleados)}
              style={{padding:"7px 11px",fontSize:10,background:"rgba(0,201,167,0.12)",border:"1px solid rgba(0,201,167,0.25)",borderRadius:8,color:"#00C9A7",cursor:"pointer",flexShrink:0}}>
              Todos → 🚢 Contenedor
            </button>
            <button onClick={()=>setTodosTipos("nomina", empleados)}
              style={{padding:"7px 11px",fontSize:10,background:"rgba(99,102,241,0.12)",border:"1px solid rgba(99,102,241,0.25)",borderRadius:8,color:"#a5b4fc",cursor:"pointer",flexShrink:0}}>
              Todos → 📋 Nómina
            </button>
          </div>
          <div style={{display:"flex",gap:10,marginBottom:10,fontSize:10}}>
            {[["contenedor","🚢","#00C9A7"],["nomina","📋","#a5b4fc"]].map(([t,ic,c])=>{
              const cnt=empleados.filter(e=>getTipo(e.num)===t).length;
              return <span key={t} style={{color:c,fontWeight:600}}>{ic} {cnt} por {t==="contenedor"?"contenedor":"nómina"}</span>;
            })}
          </div>
          <div style={{maxHeight:440,overflowY:"auto"}}>
            {empleados.filter(e=>!tabEmpBusq||(e.nombre+e.area).toLowerCase().includes(tabEmpBusq.toLowerCase())).map(e=>{
              const t=getTipo(e.num);
              return (
                <div key={e.num} style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${t==="contenedor"?"rgba(0,201,167,0.12)":"rgba(99,102,241,0.12)"}`,borderRadius:10,padding:"8px 12px",marginBottom:5,display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:600,color:"white",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.nombre}</div>
                    <div style={{fontSize:9,color:"rgba(255,255,255,0.42)"}}>{e.area} · {e.doc} {e.num}</div>
                  </div>
                  <div style={{display:"flex",gap:3,flexShrink:0}}>
                    {["contenedor","nomina"].map(tipo=>{
                      const act=t===tipo;
                      return (
                        <button key={tipo} onClick={()=>setTipo(e.num,tipo)}
                          style={{padding:"4px 10px",fontSize:10,borderRadius:6,border:`1px solid ${act?(tipo==="contenedor"?"#00C9A7":"#a5b4fc"):"rgba(255,255,255,0.1)"}`,background:act?(tipo==="contenedor"?"rgba(0,201,167,0.2)":"rgba(99,102,241,0.2)"):"transparent",color:act?(tipo==="contenedor"?"#00C9A7":"#a5b4fc"):"rgba(255,255,255,0.3)",cursor:"pointer",fontWeight:act?700:400}}>
                          {tipo==="contenedor"?"🚢 Contenedor":"📋 Nómina"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{marginTop:10,padding:"8px 12px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8,fontSize:10,color:"rgba(255,255,255,0.38)",lineHeight:1.7}}>
            <b style={{color:"rgba(0,201,167,0.7)"}}>🚢 Por Contenedor:</b> Pago de {fmtCOP(VALOR_CONTENEDOR)} por cada contenedor trabajado. Se genera comprobante por periodo.&nbsp;
            <b style={{color:"rgba(99,102,241,0.7)"}}>📋 Por Nómina:</b> Salario base + prestaciones + horas extras + deducciones legales. Se genera colilla oficial.
          </div>
        </div>
      )}

      {/* ═══ TAB 2: CONTENEDOR ═══ */}
      {tabNom === 2 && (() => {
        const VALOR = 180000;
        const totalGlobal = procesos.reduce((s,p)=>{
          const gD=grupos.find(g=>g.nombre===p.grupoDia);
          const gN=grupos.find(g=>g.nombre===p.grupoNoche);
          return s+new Set([...(gD?gD.miembros:[]),...(gN?gN.miembros:[])]).size*VALOR;
        },0);
        return (
          <div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.48)",marginBottom:12}}>
              Pago por contenedor: <span style={{color:"#00C9A7",fontWeight:700}}>{fmtCOP(VALOR)} / persona</span>
            </div>
            {procesos.length===0?(
              <div style={{textAlign:"center",padding:"36px 0",color:"rgba(255,255,255,0.33)"}}>
                <div style={{fontSize:36,marginBottom:10}}>🚢</div>
                <div style={{fontSize:13}}>Sin contenedores — ve al módulo Contenedores y crea grupos de trabajo</div>
              </div>
            ):procesos.map(p=>{
              const gDia=grupos.find(g=>g.nombre===p.grupoDia);
              const gNoche=grupos.find(g=>g.nombre===p.grupoNoche);
              const nums=[...new Set([...(gDia?gDia.miembros:[]),...(gNoche?gNoche.miembros:[])])];
              const miembros=nums.map(n=>empleados.find(e=>e.num===n)).filter(Boolean);
              const col={"En proceso":"#F9A826","Completado":"#00C9A7","Pausado":"#845EF7","Cancelado":"#FF6B6B"}[p.estado]||"#6366F1";
              return (
                <div key={p.id} style={{background:`${col}06`,border:`1px solid ${col}20`,borderRadius:12,marginBottom:10,overflow:"hidden"}}>
                  <div style={{padding:"10px 14px",borderBottom:`1px solid ${col}15`,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontWeight:800,color:"white"}}>🚢 {p.numContenedor}</span>
                    <span style={{fontSize:10,color:"rgba(255,255,255,0.48)"}}>📅 {p.fecha}</span>
                    <span style={{fontSize:10,background:`${col}22`,color:col,borderRadius:6,padding:"2px 7px",fontWeight:700}}>{p.estado}</span>
                    {p.grupoDia&&<span style={{fontSize:10,background:"rgba(249,168,38,0.15)",color:"#F9A826",borderRadius:6,padding:"2px 7px"}}>☀️ {p.grupoDia}</span>}
                    {p.grupoNoche&&<span style={{fontSize:10,background:"rgba(132,94,247,0.15)",color:"#a78bfa",borderRadius:6,padding:"2px 7px"}}>🌙 {p.grupoNoche}</span>}
                    <span style={{marginLeft:"auto",fontSize:13,fontWeight:800,color:"#00C9A7"}}>{fmtCOP(miembros.length*VALOR)}</span>
                  </div>
                  {miembros.length===0?(
                    <div style={{padding:"10px 14px",fontSize:11,color:"rgba(255,255,255,0.33)"}}>Sin grupo asignado</div>
                  ):(
                    <>
                      <button onClick={()=>togglePersonal(p.id)}
                        style={{width:"100%",background:"transparent",border:"none",borderTop:personalVisible[p.id]?`1px solid ${col}15`:"none",padding:"7px 14px",fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.55)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                        👤 {personalVisible[p.id]?"Ocultar":"Mostrar"} personal ({miembros.length}) {personalVisible[p.id]?"▲":"▼"}
                      </button>
                      {personalVisible[p.id] && (
                        <div style={{padding:"0 14px 10px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                          {miembros.map(e=>(
                            <div key={e.num} style={{background:"rgba(255,255,255,0.05)",borderRadius:7,padding:"5px 9px",display:"flex",justifyContent:"space-between"}}>
                              <span style={{fontSize:11,color:"white"}}>{e.nombre}</span>
                              <span style={{fontSize:11,color:"#00C9A7",fontWeight:700}}>{fmtCOP(VALOR)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            {procesos.length>0&&(
              <div style={{background:"rgba(0,201,167,0.08)",border:"1px solid rgba(0,201,167,0.25)",borderRadius:12,padding:"12px 16px",textAlign:"center"}}>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.48)",marginBottom:4}}>Total nómina acumulada contenedores</div>
                <div style={{fontSize:20,fontWeight:800,color:"#00C9A7"}}>{fmtCOP(totalGlobal)}</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══ TAB 3: HISTORIAL ═══ */}
      {tabNom === 3 && (
        <div>
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            <CustomSelect value={histFiltEmp} onChange={e=>setHistFiltEmp(e.target.value)} style={{...inp,flex:2,minWidth:120}}>
              <option value="" style={{background:"#1a1a2e"}}>— Todos los empleados —</option>
              {empleados.map(e=><option key={e.num} value={e.num} style={{background:"#1a1a2e"}}>{e.nombre}</option>)}
            </CustomSelect>
            <input type="month" value={histFiltDesde} onChange={e=>setHistFiltDesde(e.target.value)} title="Desde" style={{...inp,flex:1,minWidth:100}} />
            <input type="month" value={histFiltHasta} onChange={e=>setHistFiltHasta(e.target.value)} title="Hasta" style={{...inp,flex:1,minWidth:100}} />
            {(histFiltEmp||histFiltDesde||histFiltHasta) && <button onClick={()=>{setHistFiltEmp("");setHistFiltDesde("");setHistFiltHasta("");}} style={{background:"rgba(255,80,80,0.1)",border:"1px solid rgba(255,80,80,0.2)",borderRadius:8,padding:"6px 10px",fontSize:11,color:"#FF6B6B",cursor:"pointer"}}>✕</button>}
          </div>
          {(() => {
            const hist = liquidaciones.filter(l=>{
              if (histFiltEmp && l.empNum!==histFiltEmp) return false;
              if (histFiltDesde && l.periodo < histFiltDesde) return false;
              if (histFiltHasta && l.periodo > histFiltHasta) return false;
              return true;
            });
            return hist.length===0?(
              <div style={{textAlign:"center",padding:"36px 0",color:"rgba(255,255,255,0.33)"}}>
                <div style={{fontSize:36,marginBottom:10}}>📜</div>
                <div style={{fontSize:13}}>Sin colillas generadas — ve a Liquidador y genera una</div>
              </div>
            ):hist.map((l,i)=>(
              <div key={l.id||i} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.11)",borderRadius:12,padding:"10px 14px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"white"}}>{l.nombre}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.48)"}}>{l.area} · {l.periodo} · Generado {l.fecha}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:14,fontWeight:800,color:"#00C9A7"}}>{fmtCOP(l.neto)}</div>
                    {l.ausencias>0&&<div style={{fontSize:9,color:"#FF6B6B"}}>{l.ausencias} día(s) ausente</div>}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,marginBottom:8}}>
                  {[["Devengado",fmtCOP(l.devengado),"#F9A826"],["Deducciones",`-${fmtCOP(l.totalDeduc)}`,"#FF6B6B"],["Neto",fmtCOP(l.neto),"#00C9A7"]].map(([k,v,c])=>(
                    <div key={k} style={{background:"rgba(255,255,255,0.05)",borderRadius:6,padding:"4px 8px",textAlign:"center"}}>
                      <div style={{fontSize:9,color:"rgba(255,255,255,0.38)"}}>{k}</div>
                      <div style={{fontSize:11,fontWeight:700,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>
                {l.html ? (
                  <button onClick={()=>verPrevia(l.html,`${l.tipo==="contenedor"?"Comprobante":"Colilla"}_${l.nombre.replace(/ /g,"_")}_${l.periodo}.html`)}
                    style={{width:"100%",background:"rgba(0,201,167,0.1)",border:"1px solid rgba(0,201,167,0.3)",borderRadius:7,padding:"6px",fontSize:11,fontWeight:700,color:"#00C9A7",cursor:"pointer"}}>
                    📄 Descargar {l.tipo==="contenedor"?"comprobante":"colilla"}
                  </button>
                ) : (
                  <div style={{width:"100%",textAlign:"center",fontSize:9,color:"rgba(255,255,255,0.28)",padding:"4px 0"}}>
                    Generado antes de esta función — no se guardó el documento
                  </div>
                )}
              </div>
            ));
          })()}
          {liquidaciones.length>0&&(
            <button onClick={()=>pedir("¿Borrar todo el historial de colillas?",limpiarHistorial)}
              style={{width:"100%",marginTop:4,background:"rgba(255,80,80,0.06)",border:"1px solid rgba(255,80,80,0.15)",borderRadius:8,padding:"8px",fontSize:11,color:"rgba(255,100,100,0.6)",cursor:"pointer"}}>
              🗑 Limpiar historial
            </button>
          )}
        </div>
      )}

      {/* ═══ TAB 4: CONTADOR ═══ */}
      {tabNom === 4 && (() => {
        const histMes = liquidaciones.filter(l=>l.periodo===periodoCtad);
        const totales = histMes.reduce((a,l)=>({dev:a.dev+l.devengado,ded:a.ded+l.totalDeduc,net:a.net+l.neto}),{dev:0,ded:0,net:0});
        const buildHtmlReporte = async () => {
          const logoSrc = await cargarLogoBase64();
          const nominaRows = histMes.filter(l=>l.tipo!=="contenedor");
          const contRows   = histMes.filter(l=>l.tipo==="contenedor");
          const tabNomina  = nominaRows.length>0?`
<h2 style="color:#1D6F42;font-size:14px;margin-top:20px">📋 Empleados por Nómina / Contrato</h2>
<table><thead><tr><th>Empleado</th><th>Cédula</th><th>Área</th><th>Sal. Base</th><th>Devengado</th><th>Salud 4%</th><th>Pensión 4%</th><th>Otros Desc.</th><th>Neto Pagado</th><th>Días Aus.</th></tr></thead><tbody>
${nominaRows.map(l=>{const sal=l.salBase||SALARIO_MINIMO;return`<tr><td><b>${l.nombre}</b></td><td>${l.empNum}</td><td>${l.area}</td><td>$${Math.round(sal).toLocaleString("es-CO")}</td><td>$${Math.round(l.devengado).toLocaleString("es-CO")}</td><td>$${Math.round(sal*0.04).toLocaleString("es-CO")}</td><td>$${Math.round(sal*0.04).toLocaleString("es-CO")}</td><td>$${Math.round(Math.max(0,l.totalDeduc-sal*0.08)).toLocaleString("es-CO")}</td><td><b>$${Math.round(l.neto).toLocaleString("es-CO")}</b></td><td>${l.ausencias||0}</td></tr>`;}).join("")}
<tr class="tot"><td colspan="4">SUBTOTAL NÓMINA</td><td>$${Math.round(nominaRows.reduce((s,l)=>s+l.devengado,0)).toLocaleString("es-CO")}</td><td colspan="3"></td><td>$${Math.round(nominaRows.reduce((s,l)=>s+l.neto,0)).toLocaleString("es-CO")}</td><td></td></tr>
</tbody></table>`:"";
          const tabCont = contRows.length>0?`
<h2 style="color:#0369a1;font-size:14px;margin-top:20px">🚢 Empleados por Contenedor</h2>
<table><thead><tr><th>Empleado</th><th>Cédula</th><th>Área</th><th>Contenedores</th><th>Método de Pago</th><th>Neto Pagado</th></tr></thead><tbody>
${contRows.map(l=>`<tr><td><b>${l.nombre}</b></td><td>${l.empNum}</td><td>${l.area}</td><td style="text-align:center">${l.contenedores||1}</td><td>${l.metodoPago||"—"}</td><td><b>$${Math.round(l.neto).toLocaleString("es-CO")}</b></td></tr>`).join("")}
<tr class="tot"><td colspan="5">SUBTOTAL CONTENEDOR</td><td>$${Math.round(contRows.reduce((s,l)=>s+l.neto,0)).toLocaleString("es-CO")}</td></tr>
</tbody></table>`:"";
          const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Contador ${periodoCtad}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;color:#1a1a1a}h1{color:#1D6F42;font-size:18px;margin:0}.sub{color:#666;font-size:12px;margin-bottom:16px}
.hdr-row{display:flex;align-items:center;gap:12px;margin-bottom:4px}.hdr-row img{width:40px;height:40px;object-fit:contain}
table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px}th{background:#1D6F42;color:white;padding:8px 10px;text-align:left}
td{padding:7px 10px;border:1px solid #e0e0e0}tr:nth-child(even) td{background:#f9f9f9}
.tot td{background:#e8f5e9;font-weight:700;color:#1D6F42}.footer{text-align:center;color:#aaa;margin-top:16px;font-size:10px}</style></head>
<body><div class="hdr-row">${logoSrc ? `<img src="${logoSrc}"/>` : ""}<h1>🍋 Tierra Prometida Trading — Reporte Nómina Contador</h1></div>
<div class="sub">Periodo: ${periodoCtad} · Generado: ${new Date().toLocaleDateString("es-CO")} por JARVIS</div>
${tabNomina}${tabCont}
<p style="font-weight:700;color:#1D6F42;margin-top:16px">TOTAL GENERAL NETO: $${Math.round(totales.net).toLocaleString("es-CO")}</p>
<div class="footer">Tierra Prometida Trading 🍋 · JARVIS · Documento informativo. Consulte al contador para efectos legales.</div></body></html>`;
          return html;
        };
        const descargarReporte = async () => {
          const html = await buildHtmlReporte();
          const _u3=URL.createObjectURL(new Blob([html],{type:"text/html"}));const a=document.createElement("a");a.href=_u3;a.download=`ReporteContador_${periodoCtad}.html`;a.click();URL.revokeObjectURL(_u3);
        };
        return (
          <div>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              <div style={{flex:1}}>
                <div style={lbl}>Periodo a reportar</div>
                <input type="month" value={periodoCtad} onChange={e=>setPeriodoCtad(e.target.value)} style={inp} />
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:mob?"repeat(2,1fr)":"repeat(3,1fr)",gap:8,marginBottom:12}}>
              {[{l:"Colillas",v:histMes.length,c:"#6366F1"},{l:"Total devengado",v:fmtCOP(totales.dev),c:"#F9A826"},{l:"Total neto",v:fmtCOP(totales.net),c:"#00C9A7"}].map((s,i)=>(
                <div key={i} style={{background:`${s.c}12`,border:`1px solid ${s.c}30`,borderRadius:10,padding:"10px 6px",textAlign:"center"}}>
                  <div style={{fontSize:14,fontWeight:800,color:s.c}}>{s.v}</div>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.48)"}}>{s.l}</div>
                </div>
              ))}
            </div>
            {histMes.length===0?(
              <div style={{textAlign:"center",padding:"24px 0",color:"rgba(255,255,255,0.33)",fontSize:12}}>
                Sin colillas para {periodoCtad} — genera colillas en la pestaña Liquidador
              </div>
            ):(
              <div style={{maxHeight:300,overflowY:"auto",marginBottom:10}}>
                {histMes.map((l,i)=>{
                  const esCont = l.tipo==="contenedor";
                  const sal = esCont ? 0 : (l.salBase||SALARIO_MINIMO);
                  const badge = esCont
                    ? {label:"🚢 Contenedor",c:"#0369a1",bg:"rgba(3,105,161,0.15)"}
                    : {label:"📋 Nómina",c:"#6366F1",bg:"rgba(99,102,241,0.15)"};
                  const detalles = esCont
                    ? [["Contenedores",l.contenedores||1],["Método",l.metodoPago||"—"],["Total",fmtCOP(l.neto)]]
                    : [["Devengado",fmtCOP(l.devengado)],["Salud 4%",fmtCOP(sal*0.04)],["Pensión 4%",fmtCOP(sal*0.04)],["Ausencias",`${l.ausencias||0}d`]];
                  return (
                    <div key={l.id||i} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:10,padding:"8px 12px",marginBottom:6}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:12,fontWeight:700,color:"white"}}>{l.nombre}</span>
                          <span style={{fontSize:9,background:badge.bg,color:badge.c,borderRadius:5,padding:"2px 6px",fontWeight:700}}>{badge.label}</span>
                        </div>
                        <span style={{fontSize:12,fontWeight:800,color:"#00C9A7"}}>{fmtCOP(l.neto)}</span>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:`repeat(${detalles.length},1fr)`,gap:4,fontSize:10}}>
                        {detalles.map(([k,v])=>(
                          <div key={k} style={{color:"rgba(255,255,255,0.42)"}}>{k}: <span style={{color:"rgba(255,255,255,0.72)"}}>{v}</span></div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={async ()=>{if(histMes.length===0){alert("Sin colillas para este periodo");return;}verPrevia(await buildHtmlReporte(),`ReporteContador_${periodoCtad}.html`);}}
                style={{background:"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:10,padding:"11px 14px",fontSize:13,color:"#a5b4fc",cursor:"pointer",fontWeight:700}}>
                👁 Vista Previa
              </button>
              <button onClick={()=>{if(histMes.length===0){alert("Sin colillas para este periodo");return;}pedir(`¿Descargar reporte contador para ${periodoCtad}?`,descargarReporte);}}
                style={{flex:1,background:"linear-gradient(135deg,#1D6F42,#21A366)",border:"none",borderRadius:10,padding:"11px",fontSize:13,color:"white",cursor:"pointer",fontWeight:700}}>
                📊 Descargar Reporte para Contador
              </button>
            </div>
          </div>
        );
      })()}

      {/* ═══ TAB 5: PAGOS POR TRABAJADOR ═══ */}
      {tabNom === 5 && (() => {
        const empPagoActual = selEmpPago || empleados[0]?.num || "";
        const empSelObj  = empleados.find(e=>e.num===empPagoActual);
        const histEmp    = liquidaciones.filter(l=>l.empNum===empPagoActual);
        const totalPag   = histEmp.reduce((s,l)=>s+Number(l.neto||0),0);
        return (
          <div>
            <div style={{ marginBottom:10 }}>
              <div style={lbl}>Empleado</div>
              <CustomSelect value={empPagoActual} onChange={e=>setSelEmpPago(e.target.value)}
                style={{ width:"100%", background:"rgba(255,255,255,0.08)", border:"1px solid rgba(249,168,38,0.3)", borderRadius:8, padding:"8px 10px", color:"white", fontSize:11, fontFamily:"inherit" }}>
                {empleados.map(e=><option key={e.num} value={e.num} style={{background:"#1a1a2e"}}>{e.nombre}</option>)}
              </CustomSelect>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:mob?"repeat(2,1fr)":"repeat(3,1fr)", gap:8, marginBottom:10 }}>
              {[
                { icon:"💰", l:"Total pagado",   v:fmtCOP(totalPag), c:"#00C9A7" },
                { icon:"🧾", l:"Pagos registr.", v:histEmp.length,   c:"#845EF7" },
                { icon:"📅", l:"Último pago",    v:histEmp[0]?.fecha||"—", c:"#F9A826" },
              ].map((k,i)=>(
                <div key={i} style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${k.c}22`, borderRadius:10, padding:"8px 6px", textAlign:"center" }}>
                  <div style={{ fontSize:15 }}>{k.icon}</div>
                  <div style={{ fontSize:12, fontWeight:800, color:k.c, marginTop:1 }}>{k.v}</div>
                  <div style={{ fontSize:8, color:"rgba(255,255,255,0.42)", marginTop:1, lineHeight:1.3 }}>{k.l}</div>
                </div>
              ))}
            </div>
            {histEmp.length===0 && (
              <div style={{ textAlign:"center", padding:"30px", color:"rgba(255,255,255,0.38)", fontSize:12 }}>Sin pagos registrados para {empSelObj?.nombre?.split(" ")[0]} — genera colillas en el Liquidador</div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── MÓDULO INFORMES ──────────────────────────────────────────
function InformesDemo() {
  const [archivo, setArchivo] = useState(null);
  const [analisis, setAnalisis] = useState("");
  const [loading, setLoading] = useState(false);
  const [archivoTexto, setArchivoTexto] = useState("");
  const [historial, setHistorial] = useState([]);
  const fileRef = useRef(null);

  const leerArchivo = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = () => reject(new Error("Error leyendo archivo"));
    file.name.endsWith(".csv")||file.name.endsWith(".txt") ? r.readAsText(file) : r.readAsDataURL(file);
  });

  const handleFile = async (file) => { if (!file) return; setArchivo(file); setAnalisis(""); try { const c = await leerArchivo(file); setArchivoTexto(c); } catch { setAnalisis("❌ Error leyendo el archivo."); } };

  const analizar = async () => {
    if (!archivo) return;
    setLoading(true); setAnalisis("");
    try {
      const esPDF = archivo.type==="application/pdf";
      const esImg = archivo.type.startsWith("image/");
      let messages;
      if (esPDF) {
        messages = [{ role:"user", content:[{ type:"document", source:{ type:"base64", media_type:"application/pdf", data:(archivoTexto.includes(",")?archivoTexto.split(",")[1]:archivoTexto) }},{ type:"text", text:"Analiza este documento como JARVIS de Tierra Prometida Trading 🍋. Genera un informe ejecutivo con resumen, hallazgos y recomendaciones para los socios." }]}];
      } else if (esImg) {
        messages = [{ role:"user", content:[{ type:"image", source:{ type:"base64", media_type:archivo.type, data:(archivoTexto.includes(",")?archivoTexto.split(",")[1]:archivoTexto) }},{ type:"text", text:"Analiza esta imagen como JARVIS de Tierra Prometida Trading 🍋. Genera un informe ejecutivo." }]}];
      } else {
        messages = [{ role:"user", content:`Analiza este archivo como JARVIS de Tierra Prometida Trading 🍋. Genera informe ejecutivo con resumen, hallazgos y recomendaciones.\n\nContenido:\n${archivoTexto.slice(0,8000)}` }];
      }
      const res = await fetch("/api/informe-analisis", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:2000, system:"Eres JARVIS, asistente de Tierra Prometida Trading 🍋, empresa colombiana de procesamiento y exportación de frutas en Lebrija y Girón, Santander. Generas informes ejecutivos claros, profesionales y en español. Incluye resumen ejecutivo, hallazgos clave, métricas importantes y recomendaciones accionables para los socios.", messages }) });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message||`Error ${res.status}`); }
      const data = await res.json();
      const result = data.content?.map(b=>b.text||"").join("")||"No se pudo analizar.";
      setAnalisis(result);
      setHistorial(prev => [{ nombre:archivo.name, fecha:new Date().toLocaleDateString("es-CO") }, ...prev.slice(0,4)]);
    } catch { setAnalisis("❌ Error al analizar."); }
    setLoading(false);
  };

  return (
    <div>
      <div onClick={() => fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0]);}} style={{ border:`2px dashed ${archivo?"#FF6B6B":"rgba(255,107,107,0.3)"}`, borderRadius:12, padding:16, textAlign:"center", cursor:"pointer", background:archivo?"rgba(255,107,107,0.06)":"rgba(255,255,255,0.02)", marginBottom:10 }}>
        <input ref={fileRef} type="file" accept=".csv,.txt,.pdf,.png,.jpg,.jpeg" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])} />
        {archivo ? <div><div style={{fontSize:20,marginBottom:4}}>📄</div><div style={{fontSize:12,color:"#FF6B6B",fontWeight:700}}>{archivo.name}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.48)"}}>{(archivo.size/1024).toFixed(1)} KB · Listo</div></div>
        : <div><div style={{fontSize:24,marginBottom:6}}>📂</div><div style={{fontSize:12,color:"rgba(255,255,255,0.58)",fontWeight:600}}>Toca para subir archivo</div><div style={{fontSize:10,color:"rgba(255,255,255,0.38)",marginTop:4}}>Excel, CSV, PDF, imágenes</div></div>}
      </div>
      {archivo && !analisis && <button onClick={analizar} disabled={loading} style={{ width:"100%", background:loading?"rgba(255,107,107,0.2)":"linear-gradient(135deg,#FF6B6B,#845EF7)", border:"none", borderRadius:10, padding:10, fontSize:13, color:"white", cursor:loading?"default":"pointer", fontWeight:700, marginBottom:10 }}>{loading?"🤖 Analizando...":"🔍 Analizar con JARVIS"}</button>}
      {analisis && (
        <div style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,107,107,0.2)", borderRadius:10, padding:12, marginBottom:10 }}>
          <div style={{ fontSize:11, color:"#FF6B6B", fontWeight:700, marginBottom:8 }}>📋 Informe JARVIS</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.88)", lineHeight:1.6, maxHeight:140, overflowY:"auto", whiteSpace:"pre-wrap" }}>{analisis}</div>
          <button onClick={() => { setArchivo(null); setAnalisis(""); setArchivoTexto(""); }} style={{ marginTop:10, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"6px 12px", fontSize:11, color:"rgba(255,255,255,0.48)", cursor:"pointer" }}>🔄 Nuevo análisis</button>
        </div>
      )}
      {historial.length > 0 && <div><div style={{fontSize:11,color:"rgba(255,255,255,0.38)",marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Recientes</div>{historial.map((h,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.07)"}}><div style={{fontSize:11,color:"rgba(255,255,255,0.68)"}}>📄 {h.nombre}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.38)"}}>{h.fecha}</div></div>)}</div>}
    </div>
  );
}

// ─── PHONE ACTIONS ────────────────────────────────────────────
// ─── MÓDULO INVENTARIO ────────────────────────────────────────
const INVENTARIO_BASE = [
  // INSUMOS
  { id:1,  nombre:"CANASTILLAS",                  cant:4000,  unidad:"UNIDADES",   minimo:500, categoria:"Insumos",      obs:"Tres canastillas no son de Tierra Prometida", costo:0 },
  { id:2,  nombre:"ESTIBAS PLÁSTICAS",             cant:188,   unidad:"UNIDADES",   minimo:50,  categoria:"Insumos",      obs:"", costo:0 },
  { id:3,  nombre:"CAJAS PRINCESSES",              cant:6123,  unidad:"UNIDADES",   minimo:500, categoria:"Insumos",      obs:"", costo:6113 },
  { id:4,  nombre:"CAJAS DEL MONTE",               cant:2569,  unidad:"UNIDADES",   minimo:500, categoria:"Insumos",      obs:"", costo:7112 },
  { id:5,  nombre:"CERA",                          cant:60,    unidad:"LITROS",     minimo:50,  categoria:"Insumos",      obs:"", costo:13090 },
  { id:6,  nombre:"PATAGONIA",                     cant:1100,  unidad:"ML",         minimo:300, categoria:"Insumos",      obs:"", costo:100 },
  { id:7,  nombre:"ZUNCHOS",                       cant:5,     unidad:"METROS",     minimo:3,   categoria:"Insumos",      obs:"Comprar 10 rollos", costo:116620 },
  { id:8,  nombre:"DESENGRASANTE",                 cant:0,     unidad:"LITROS",     minimo:2,   categoria:"Insumos",      obs:"", costo:0 },
  { id:9,  nombre:"ESQUINEROS",                    cant:620,   unidad:"UNIDADES",   minimo:200, categoria:"Insumos",      obs:"Comprar 1000 esquineros", costo:4641 },
  { id:10, nombre:"ESTIBA EXPORTACIÓN MADERA",     cant:63,    unidad:"UNIDADES",   minimo:20,  categoria:"Insumos",      obs:"Llegan 120 estibas", costo:80325 },
  { id:11, nombre:"GAS",                           cant:1.5,   unidad:"CILINDROS",  minimo:1,   categoria:"Insumos",      obs:"", costo:267800 },
  { id:12, nombre:"TERMOREGISTROS",                cant:22,    unidad:"UNIDADES",   minimo:5,   categoria:"Insumos",      obs:"", costo:63070 },
  { id:13, nombre:"PEGANTE PARA CAJAS (HOTMELT)",  cant:14.5,  unidad:"BULTOS",     minimo:5,   categoria:"Insumos",      obs:"", costo:17850 },
  { id:14, nombre:"GRAPAS PARA CAJAS",             cant:4,     unidad:"CAJAS x10",  minimo:2,   categoria:"Insumos",      obs:"Comprar 10 bolsas", costo:42840 },
  { id:15, nombre:"JABÓN NEUTRO",                  cant:0,     unidad:"LITROS",     minimo:2,   categoria:"Insumos",      obs:"No hay, se requiere de 1.5 pulgadas", costo:0 },
  { id:16, nombre:"PUNTILLAS",                     cant:0,     unidad:"CAJAS",      minimo:1,   categoria:"Insumos",      obs:"", costo:0 },
  { id:17, nombre:"ÁCIDO PERACÉTICO",              cant:6,     unidad:"LITROS",     minimo:3,   categoria:"Insumos",      obs:"", costo:16196 },
  { id:44, nombre:"MERTEC (PROVITEC 30)",          cant:0,     unidad:"ML",         minimo:30,  categoria:"Insumos",      obs:"", costo:168 },
  { id:45, nombre:"COFIAS",                        cant:0,     unidad:"UNIDADES",   minimo:20,  categoria:"Insumos",      obs:"", costo:50 },
  { id:46, nombre:"MARCA PALLET",                  cant:0,     unidad:"UNIDADES",   minimo:30,  categoria:"Insumos",      obs:"", costo:41 },
  { id:47, nombre:"GUANTES OPERARIOS",             cant:0,     unidad:"PARES",      minimo:10,  categoria:"Insumos",      obs:"", costo:4760 },
  // HERRAMIENTAS
  { id:18, nombre:"DESTORNILLADOR ESTRELLA",       cant:2, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:19, nombre:"JUEGO DE 75 PIEZAS",            cant:1, unidad:"JUEGO",    minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:20, nombre:"JUEGO DE LLAVES TORX",          cant:1, unidad:"JUEGO",    minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:21, nombre:"ALICATE",                       cant:1, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:22, nombre:"LLAVE DE EXPANSIÓN 12\"",       cant:1, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:23, nombre:"JUEGO DE LLAVES 20 UNIDADES",   cant:1, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:24, nombre:"MARTILLO",                      cant:1, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:25, nombre:"PINZAS",                        cant:1, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:26, nombre:"ALICATE DE CORTE",              cant:1, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:27, nombre:"NIVEL",                         cant:1, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:28, nombre:"JUEGO LLAVE HEXAGONAL",         cant:1, unidad:"JUEGO",    minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:29, nombre:"PULIDORA",                      cant:1, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:30, nombre:"TALADRO",                       cant:1, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:31, nombre:"CAJA DE HERRAMIENTAS",          cant:1, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:32, nombre:"JUEGO DE PERILLEROS",           cant:1, unidad:"JUEGO",    minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:33, nombre:"JUEGO DE BROCAS",               cant:1, unidad:"JUEGO",    minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:34, nombre:"DISCO FLAB",                    cant:2, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:35, nombre:"METRO",                         cant:1, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:36, nombre:"DESTORNILLADOR PALA",           cant:2, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:37, nombre:"GUANTES CARNAZA",               cant:2, unidad:"UNIDADES", minimo:2, categoria:"Herramientas", obs:"", costo:0 },
  { id:38, nombre:"ESPÁTULA",                      cant:2, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:39, nombre:"BOMBA ASPERSIÓN ESPALDA",       cant:1, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:40, nombre:"AIRE PORTÁTIL",                 cant:1, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:41, nombre:"CARROS PARA ZUNCHOS",           cant:3, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:42, nombre:"GRAPA PARA ZUNCHO",             cant:3, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
  { id:43, nombre:"BÁSCULA",                       cant:4, unidad:"UNIDADES", minimo:1, categoria:"Herramientas", obs:"", costo:0 },
];

// ─── PLANTILLAS CENTRO DE COSTOS ─────────────────────────────
const EXTRAS_BASE = [
  { id:"mo_op",   nombre:"MO Operarios",  unidad:"personas", cant:18, costoUnit:180000 },
  { id:"mo_arm",  nombre:"MO Armadora",   unidad:"personas", cant:2,  costoUnit:180000 },
  { id:"mo_desc", nombre:"MO Descargue",  unidad:"personas", cant:4,  costoUnit:100000 },
  { id:"varios",  nombre:"Varios",         unidad:"global",   cant:1,  costoUnit:500000 },
];

const PLANTILLAS_CC = [
  {
    id:"princess_1400", label:"Princesses · 1400 cajas", color:"#845EF7",
    totalRef: 16312222,
    items:{
      3:{cant:1400, costoUnit:6113}, 4:{cant:0, costoUnit:7112},
      5:{cant:20, costoUnit:13090}, 6:{cant:200, costoUnit:100},
      7:{cant:1, costoUnit:116620}, 9:{cant:100, costoUnit:4641},
      10:{cant:20, costoUnit:80325}, 11:{cant:1, costoUnit:267800},
      12:{cant:1, costoUnit:63070}, 13:{cant:12.6, costoUnit:17850},
      14:{cant:0.33, costoUnit:42840}, 16:{cant:0, costoUnit:0},
      17:{cant:10.33, costoUnit:16196},
      44:{cant:60, costoUnit:168}, 45:{cant:20, costoUnit:50},
      46:{cant:80, costoUnit:41},  47:{cant:7, costoUnit:4760},
    },
    extras: EXTRAS_BASE,
  },
  {
    id:"princess_1600", label:"Princesses · 1600 cajas", color:"#6366F1",
    totalRef: 17632427,
    items:{
      3:{cant:1600, costoUnit:6113}, 4:{cant:0, costoUnit:7112},
      5:{cant:22.8, costoUnit:13090}, 6:{cant:228, costoUnit:100},
      7:{cant:1, costoUnit:116620}, 9:{cant:100, costoUnit:4641},
      10:{cant:20, costoUnit:80325}, 11:{cant:1, costoUnit:267800},
      12:{cant:1, costoUnit:63070}, 13:{cant:14.4, costoUnit:17850},
      14:{cant:0.377, costoUnit:42840}, 16:{cant:0, costoUnit:0},
      17:{cant:10.377, costoUnit:18358},
      44:{cant:60, costoUnit:168}, 45:{cant:20, costoUnit:50},
      46:{cant:80, costoUnit:41},  47:{cant:7, costoUnit:4760},
    },
    extras: EXTRAS_BASE,
  },
  {
    id:"del_monte_1400", label:"Del Monte · 1400 cajas", color:"#00C9A7",
    totalRef: 17741915,
    items:{
      3:{cant:0, costoUnit:6113}, 4:{cant:1400, costoUnit:7112},
      5:{cant:21.4, costoUnit:13090}, 6:{cant:214, costoUnit:100},
      7:{cant:1, costoUnit:116620}, 9:{cant:100, costoUnit:4641},
      10:{cant:20, costoUnit:80325}, 11:{cant:1, costoUnit:267800},
      12:{cant:1, costoUnit:63070}, 13:{cant:12.6, costoUnit:17850},
      14:{cant:0.33, costoUnit:42840}, 16:{cant:0, costoUnit:0},
      17:{cant:10.353, costoUnit:17256},
      44:{cant:60, costoUnit:168}, 45:{cant:20, costoUnit:50},
      46:{cant:80, costoUnit:41},  47:{cant:7, costoUnit:4760},
    },
    extras: EXTRAS_BASE,
  },
];

function InventarioDemo() {
  const { items, historial, loading: loadingInv, actualizarItem, registrarMovimiento, agregarItem, eliminarItem } = useInventario(INVENTARIO_BASE);

  const mob = useM();
  const [tabInv, setTabInv] = useState(0);
  const TAB_INV = ["📦 Inventario General", "🔖 Canastillas"];

  const [filtro, setFiltro] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [movModal, setMovModal] = useState(null); // { item, tipo: "entrada"|"salida" }
  const [movCant, setMovCant] = useState("");
  const [movObs, setMovObs] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [nuevoItem, setNuevoItem] = useState({ nombre:"", cant:0, unidad:"UNIDADES", minimo:1, categoria:"Insumos", obs:"", costo:0 });
  // Si está oculto, el historial de movimientos no se muestra en pantalla NI se incluye en el informe descargable.
  const [mostrarHistorial, setMostrarHistorial] = useState(() => localStorage.getItem("inv_mostrar_historial") !== "0");
  const toggleHistorial = () => setMostrarHistorial(v => { localStorage.setItem("inv_mostrar_historial", v ? "0" : "1"); return !v; });
  // Si está oculto, la sección de stock faltante/bajo no se muestra en pantalla NI se incluye en el informe descargable.
  const [mostrarFaltante, setMostrarFaltante] = useState(() => localStorage.getItem("inv_mostrar_faltante") !== "0");
  const toggleFaltante = () => setMostrarFaltante(v => { localStorage.setItem("inv_mostrar_faltante", v ? "0" : "1"); return !v; });

  const pedir = (msg, fn) => setConfirm({ msg, fn });

  if (loadingInv) return <LimonLoader texto="Cargando inventario" />;

  const categorias = ["Todos", "Insumos", "Herramientas"];
  const filtrados = items.filter(i => {
    const mc = filtro === "Todos" || i.categoria === filtro;
    const mb = i.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return mc && mb;
  });

  const bajoStock = items.filter(i =>
    i.categoria === "Herramientas" ? i.cant === 0 : i.cant <= i.minimo
  );
  const totalInsumos = items.filter(i => i.categoria === "Insumos").length;
  const totalHerramientas = items.filter(i => i.categoria === "Herramientas").length;

  const confirmarMovimiento = () => {
    if (!movCant || isNaN(movCant) || Number(movCant) <= 0) return;
    const cant = Number(movCant);
    const item = movModal.item;
    const tipo = movModal.tipo;
    const despues = tipo === "entrada" ? item.cant + cant : Math.max(0, item.cant - cant);
    registrarMovimiento(item.id, item.nombre, tipo, cant, movObs, item.cant, despues);
    setMovModal(null); setMovCant(""); setMovObs("");
  };

  const guardarEdicion = () => {
    actualizarItem(editando, editForm);
    setEditando(null);
  };

  const confirmarAgregarItem = () => {
    if (!nuevoItem.nombre.trim()) return;
    agregarItem({ ...nuevoItem, id: Date.now() });
    setNuevoItem({ nombre:"", cant:0, unidad:"UNIDADES", minimo:1, categoria:"Insumos", obs:"", costo:0 });
    setShowAdd(false);
  };

  const inp = { background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:6, padding:"6px 8px", color:"white", fontSize:11, fontFamily:"inherit" };

  return (
    <div>
      <div style={{ display:"flex", gap:4, marginBottom:14, flexWrap:"wrap" }}>
        {TAB_INV.map((t, i) => (
          <button key={i} onClick={() => setTabInv(i)}
            style={{ background: tabInv===i ? "rgba(132,94,247,0.2)" : "rgba(255,255,255,0.04)", border:`1px solid ${tabInv===i ? "rgba(132,94,247,0.5)" : "rgba(255,255,255,0.08)"}`, borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:11, color: tabInv===i ? "#a78bfa" : "rgba(255,255,255,0.4)", fontWeight: tabInv===i ? 700 : 400 }}>
            {t}
          </button>
        ))}
      </div>

      {tabInv === 1 && <CanastillasTab mob={mob} />}

      {tabInv === 0 && <>
      {confirm && <ConfirmModal mensaje={confirm.msg} onConfirm={() => { confirm.fn(); setConfirm(null); }} onCancel={() => setConfirm(null)} />}

      {/* Modal edición */}
      {editando && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.85)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"#1a1a2e", border:"1px solid rgba(132,94,247,0.4)", borderRadius:16, padding:22, maxWidth:340, width:"100%", maxHeight:"calc(100vh - 40px)", overflowY:"auto" }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#845EF7", marginBottom:14 }}>✏️ Editar producto</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <input value={editForm.nombre||""} onChange={e=>setEditForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre" style={{...inp,width:"100%"}} />
              <div style={{ display:"flex", gap:6 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Cantidad</div>
                  <input type="number" value={editForm.cant||0} onChange={e=>setEditForm(f=>({...f,cant:e.target.value}))} style={{...inp,width:"100%"}} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Mínimo</div>
                  <input type="number" value={editForm.minimo||0} onChange={e=>setEditForm(f=>({...f,minimo:e.target.value}))} style={{...inp,width:"100%"}} />
                </div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Unidad</div>
                  <input value={editForm.unidad||""} onChange={e=>setEditForm(f=>({...f,unidad:e.target.value}))} style={{...inp,width:"100%"}} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Costo unit.</div>
                  <input type="number" value={editForm.costo||0} onChange={e=>setEditForm(f=>({...f,costo:e.target.value}))} style={{...inp,width:"100%"}} />
                </div>
              </div>
              <div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Observaciones</div>
                <input value={editForm.obs||""} onChange={e=>setEditForm(f=>({...f,obs:e.target.value}))} style={{...inp,width:"100%"}} />
              </div>
              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                <button onClick={() => pedir("¿Guardar cambios?", guardarEdicion)} style={{ flex:1, background:"linear-gradient(135deg,#845EF7,#6366F1)", border:"none", borderRadius:8, padding:"9px", fontSize:12, color:"white", cursor:"pointer", fontWeight:700 }}>✅ Guardar</button>
                <button onClick={() => setEditando(null)} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"9px 14px", fontSize:12, color:"rgba(255,255,255,0.48)", cursor:"pointer" }}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal movimiento */}
      {movModal && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.85)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"#1a1a2e", border:`1px solid ${movModal.tipo==="entrada"?"rgba(0,201,167,0.4)":"rgba(255,107,107,0.4)"}`, borderRadius:16, padding:22, maxWidth:300, width:"100%", maxHeight:"calc(100vh - 40px)", overflowY:"auto" }}>
            <div style={{ fontSize:13, fontWeight:700, color:movModal.tipo==="entrada"?"#00C9A7":"#FF6B6B", marginBottom:6 }}>
              {movModal.tipo==="entrada"?"📥 Registrar Entrada":"📤 Registrar Salida"}
            </div>
            <div style={{ fontSize:12, color:"white", fontWeight:600, marginBottom:14 }}>{movModal.item.nombre}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.48)", marginBottom:12 }}>Stock actual: <b style={{color:"white"}}>{movModal.item.cant} {movModal.item.unidad}</b></div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Cantidad *</div>
                <input type="number" min="1" value={movCant} onChange={e=>setMovCant(e.target.value)} placeholder="0" style={{...inp,width:"100%"}} autoFocus />
              </div>
              <div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Observación</div>
                <input value={movObs} onChange={e=>setMovObs(e.target.value)} placeholder="Opcional..." style={{...inp,width:"100%"}} />
              </div>
              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                <button onClick={confirmarMovimiento} style={{ flex:1, background:movModal.tipo==="entrada"?"linear-gradient(135deg,#845EF7,#6366F1)":"linear-gradient(135deg,#FF6B6B,#F9A826)", border:"none", borderRadius:8, padding:"9px", fontSize:12, color:"white", cursor:"pointer", fontWeight:700 }}>
                  {movModal.tipo==="entrada"?"📥 Confirmar entrada":"📤 Confirmar salida"}
                </button>
                <button onClick={() => { setMovModal(null); setMovCant(""); setMovObs(""); }} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"9px 12px", fontSize:12, color:"rgba(255,255,255,0.48)", cursor:"pointer" }}>✕</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        {[
          { l:"Total items", v:items.length, c:"rgba(255,255,255,0.6)", i:"📦" },
          { l:"Insumos", v:totalInsumos, c:"#845EF7", i:"🧴" },
          { l:"Herramientas", v:totalHerramientas, c:"#F9A826", i:"🔧" },
          { l:"⚠️ Stock bajo", v:bajoStock.length, c:"#FF6B6B", i:"🚨" },
        ].map((s,i) => (
          <div key={i} style={{ flex:1, background:"rgba(255,255,255,0.06)", borderRadius:8, padding:"8px 6px", textAlign:"center", border:s.l==="⚠️ Stock bajo"&&bajoStock.length>0?"1px solid rgba(255,107,107,0.3)":"1px solid transparent" }}>
            <div style={{ fontSize:14 }}>{s.i}</div>
            <div style={{ fontSize:16, fontWeight:700, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.48)" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Alertas stock bajo */}
      {mostrarFaltante && bajoStock.length > 0 && (
        <div style={{ background:"rgba(255,107,107,0.08)", border:"1px solid rgba(255,107,107,0.25)", borderRadius:10, padding:"8px 12px", marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#FF6B6B", marginBottom:5 }}>🚨 Productos bajo stock mínimo</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
            {bajoStock.map((item,i) => (
              <span key={i} style={{ background:"rgba(255,107,107,0.15)", color:"#FF6B6B", borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:600 }}>
                {item.nombre} ({item.cant} {item.unidad})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Controles */}
      <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
        <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="🔍 Buscar producto..." style={{...inp, flex:"1 1 160px", minWidth:0}} />
        <CustomSelect value={filtro} onChange={e=>setFiltro(e.target.value)} style={{...inp, minWidth:100, flex:"1 1 100px"}}>
          {categorias.map(c => <option key={c} style={{background:"#1a1a2e"}}>{c}</option>)}
        </CustomSelect>
        <button onClick={() => setShowAdd(!showAdd)} style={{ background:"rgba(132,94,247,0.2)", border:"1px solid rgba(132,94,247,0.4)", borderRadius:6, padding:"5px 10px", fontSize:11, color:"#845EF7", cursor:"pointer", fontWeight:700, whiteSpace:"nowrap" }}>➕ Nuevo</button>
        <button onClick={toggleHistorial} title={mostrarHistorial ? "Ocultar historial de movimientos (tampoco saldrá en el informe)" : "Mostrar historial de movimientos"}
          style={{ background: mostrarHistorial ? "rgba(255,255,255,0.06)" : "rgba(255,107,107,0.1)", border:`1px solid ${mostrarHistorial ? "rgba(255,255,255,0.13)" : "rgba(255,107,107,0.3)"}`, borderRadius:6, padding:"5px 10px", fontSize:11, color: mostrarHistorial ? "rgba(255,255,255,0.55)" : "#FF6B6B", cursor:"pointer", fontWeight:700, whiteSpace:"nowrap" }}>
          {mostrarHistorial ? "👁 Movimientos" : "🙈 Movimientos"}
        </button>
        <button onClick={toggleFaltante} title={mostrarFaltante ? "Ocultar stock faltante (tampoco saldrá en el informe)" : "Mostrar stock faltante"}
          style={{ background: mostrarFaltante ? "rgba(255,255,255,0.06)" : "rgba(255,107,107,0.1)", border:`1px solid ${mostrarFaltante ? "rgba(255,255,255,0.13)" : "rgba(255,107,107,0.3)"}`, borderRadius:6, padding:"5px 10px", fontSize:11, color: mostrarFaltante ? "rgba(255,255,255,0.55)" : "#FF6B6B", cursor:"pointer", fontWeight:700, whiteSpace:"nowrap" }}>
          {mostrarFaltante ? "👁 Faltante" : "🙈 Faltante"}
        </button>
      </div>

      {/* Formulario nuevo item */}
      {showAdd && (
        <div style={{ background:"rgba(132,94,247,0.06)", border:"1px solid rgba(132,94,247,0.2)", borderRadius:10, padding:12, marginBottom:10 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#845EF7", marginBottom:8 }}>📦 Agregar nuevo producto</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Nombre del producto *</div>
              <input placeholder='Ej: "Cajas Princesses", "Cera", "Martillo"...' value={nuevoItem.nombre} onChange={e=>setNuevoItem(p=>({...p,nombre:e.target.value}))} style={{...inp,width:"100%"}} />
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Cantidad actual</div>
                <input type="number" placeholder="Ej: 100" value={nuevoItem.cant} onChange={e=>setNuevoItem(p=>({...p,cant:e.target.value}))} style={{...inp,width:"100%"}} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Unidad de medida</div>
                <input placeholder="UNIDADES, LITROS, KILOS..." value={nuevoItem.unidad} onChange={e=>setNuevoItem(p=>({...p,unidad:e.target.value}))} style={{...inp,width:"100%"}} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Stock mínimo</div>
                <input type="number" placeholder="Ej: 10" value={nuevoItem.minimo} onChange={e=>setNuevoItem(p=>({...p,minimo:e.target.value}))} style={{...inp,width:"100%"}} />
              </div>
            </div>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.32)", marginTop:-4 }}>El "Stock mínimo" es la cantidad por debajo de la cual el sistema marca el producto como "⚠️ Stock bajo" en las alertas.</div>
            <div style={{ display:"flex", gap:6 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Categoría</div>
                <CustomSelect value={nuevoItem.categoria} onChange={e=>setNuevoItem(p=>({...p,categoria:e.target.value}))} style={{...inp,width:"100%"}}>
                  <option style={{background:"#1a1a2e"}}>Insumos</option>
                  <option style={{background:"#1a1a2e"}}>Herramientas</option>
                </CustomSelect>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Costo por unidad (opcional)</div>
                <input type="number" placeholder="En pesos, ej: 5000" value={nuevoItem.costo} onChange={e=>setNuevoItem(p=>({...p,costo:e.target.value}))} style={{...inp,width:"100%"}} />
              </div>
            </div>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.32)", marginTop:-4 }}><b>Insumos</b>: se consumen (cajas, cera, zunchos...). <b>Herramientas</b>: se reutilizan (martillo, taladro...). El costo por unidad se usa para calcular el valor total del inventario en el informe.</div>
            <div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:3 }}>Observaciones (opcional)</div>
              <input placeholder='Ej: "Comprar más", proveedor, ubicación...' value={nuevoItem.obs} onChange={e=>setNuevoItem(p=>({...p,obs:e.target.value}))} style={{...inp,width:"100%"}} />
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={() => pedir(`¿Agregar "${nuevoItem.nombre}" al inventario?`, confirmarAgregarItem)} style={{ flex:1, background:"linear-gradient(135deg,#845EF7,#6366F1)", border:"none", borderRadius:7, padding:"7px", fontSize:11, color:"white", cursor:"pointer", fontWeight:700 }}>✅ Agregar</button>
              <button onClick={() => setShowAdd(false)} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:7, padding:"7px 12px", fontSize:11, color:"rgba(255,255,255,0.48)", cursor:"pointer" }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de productos */}
      <div style={{ maxHeight:480, overflowY:"auto" }}>
        {filtrados.length === 0 && <div style={{ textAlign:"center", color:"rgba(255,255,255,0.38)", fontSize:12, padding:20 }}>Sin resultados</div>}
        {filtrados.map((item) => {
          const esHerramienta = item.categoria === "Herramientas";
          const bajo = esHerramienta ? item.cant === 0 : item.cant <= item.minimo;
          const porcentaje = esHerramienta
            ? (item.cant > 0 ? 100 : 0)
            : (item.minimo > 0 ? Math.min(100, (item.cant / (item.minimo * 3)) * 100) : 100);
          const catColor = esHerramienta ? "#F9A826" : "#845EF7";
          return (
            <div key={item.id} style={{
              borderRadius:12, marginBottom:8, overflow:"hidden",
              background: bajo ? "rgba(255,107,107,0.06)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${bajo ? "rgba(255,107,107,0.25)" : "rgba(255,255,255,0.07)"}`,
            }}>
              {/* Info principal */}
              <div style={{ padding:"12px 14px 10px" }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:6 }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:3 }}>
                      <span style={{ fontSize:10, background:`${catColor}22`, color:catColor, borderRadius:5, padding:"2px 7px", fontWeight:700, flexShrink:0, border:`1px solid ${catColor}30` }}>
                        {item.categoria === "Insumos" ? "🧴 Insumo" : "🔧 Herramienta"}
                      </span>
                      {bajo && <span style={{ fontSize:10, background:"rgba(255,107,107,0.15)", color:"#FF6B6B", borderRadius:5, padding:"2px 7px", fontWeight:700 }}>{esHerramienta ? "🚨 Sin unidades" : "⚠️ Stock bajo"}</span>}
                    </div>
                    <div style={{ fontSize:13, color:"white", fontWeight:700, lineHeight:1.3 }}>{item.nombre}</div>
                    {item.obs && <div style={{ fontSize:11, color:"rgba(249,168,38,0.75)", marginTop:3 }}>📌 {item.obs}</div>}
                  </div>
                  {/* Stock actual */}
                  <div style={{ textAlign:"center", background:`${bajo?"#FF6B6B":"#00C9A7"}15`, border:`1px solid ${bajo?"rgba(255,107,107,0.3)":"rgba(0,201,167,0.3)"}`, borderRadius:10, padding:"6px 12px", flexShrink:0 }}>
                    <div style={{ fontSize:20, fontWeight:800, color:bajo?"#FF6B6B":"#00C9A7", lineHeight:1 }}>{item.cant}</div>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.52)", marginTop:2 }}>{item.unidad}</div>
                  </div>
                </div>
                {/* Barra de stock */}
                <div style={{ background:"rgba(255,255,255,0.08)", borderRadius:4, height:5, overflow:"hidden", marginBottom:4 }}>
                  <div style={{ width:`${porcentaje}%`, height:"100%", background:bajo?"#FF6B6B":catColor, borderRadius:4, transition:"width 0.5s ease" }} />
                </div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.38)" }}>
                  {esHerramienta
                    ? `🔧 Herramienta${item.costo > 0 ? ` · ${fmtCOP(item.costo)}/u` : ""}`
                    : `Mínimo: ${item.minimo} ${item.unidad}${item.costo > 0 ? ` · ${fmtCOP(item.costo)}/u` : ""}`
                  }
                </div>
              </div>
              {/* Botones de acción */}
              <div style={{ borderTop:"1px solid rgba(255,255,255,0.09)", display:"flex" }}>
                <button onClick={() => setMovModal({ item, tipo:"entrada" })}
                  style={{ flex:1, background:"rgba(0,201,167,0.1)", border:"none", padding:"10px 6px", fontSize:12, color:"#00C9A7", cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                  📥 <span>Entrada</span>
                </button>
                <div style={{ width:1, background:"rgba(255,255,255,0.08)" }} />
                <button onClick={() => setMovModal({ item, tipo:"salida" })}
                  style={{ flex:1, background:"rgba(255,107,107,0.1)", border:"none", padding:"10px 6px", fontSize:12, color:"#FF6B6B", cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                  📤 <span>Salida</span>
                </button>
                <div style={{ width:1, background:"rgba(255,255,255,0.08)" }} />
                <button onClick={() => { setEditando(item.id); setEditForm({...item}); }}
                  style={{ background:"rgba(255,255,255,0.06)", border:"none", padding:"10px 12px", fontSize:14, cursor:"pointer", color:"rgba(255,255,255,0.58)" }}>✏️</button>
                <button onClick={() => pedir(`¿Eliminar "${item.nombre}"?`, async () => { const ok = await eliminarItem(item.id); if (!ok) alert("Error al eliminar del inventario"); })}
                  style={{ background:"rgba(255,80,80,0.06)", border:"none", padding:"10px 12px", fontSize:14, cursor:"pointer", color:"rgba(255,80,80,0.5)" }}>🗑</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Historial de movimientos */}
      {mostrarHistorial && historial.length > 0 && (
        <div style={{ marginTop:12, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:10, padding:"10px 12px" }}>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.42)", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>📋 Últimos movimientos</div>
          {historial.slice(0,5).map((h,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
              <div>
                <span style={{ fontSize:11, color:h.tipo==="entrada"?"#00C9A7":"#FF6B6B", fontWeight:600 }}>{h.tipo==="entrada"?"📥":"📤"} {h.nombre}</span>
                {h.obs && <span style={{ fontSize:10, color:"rgba(255,255,255,0.42)", marginLeft:6 }}>— {h.obs}</span>}
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:11, fontWeight:700, color:h.tipo==="entrada"?"#00C9A7":"#FF6B6B" }}>{h.tipo==="entrada"?"+":"-"}{h.cant}</div>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.38)" }}>{h.fecha} {h.hora}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Botón informe inventario */}
      <button onClick={async ()=>{
        const logoSrc   = await cargarLogoBase64();
        const fechaHoy  = new Date().toLocaleDateString("es-CO");
        const fechaFile = new Date().toISOString().split("T")[0];

        const insumos      = items.filter(i=>i.categoria==="Insumos");
        const herramientas = items.filter(i=>i.categoria==="Herramientas");
        const agotados     = items.filter(i=>i.cant===0);
        const bajoStock    = items.filter(i=>i.categoria==="Herramientas"?i.cant===0:i.cant<=i.minimo&&i.cant>0);
        const alertas      = items.filter(i=>i.categoria==="Herramientas"?i.cant===0:i.cant<=i.minimo);

        const badge = (txt,bg,col) => `<span style="background:${bg};color:${col};border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap">${txt}</span>`;
        const estadoBadge = (it) => {
          if (it.cant===0)            return badge("⛔ Agotado","#fef2f2","#dc2626");
          if (it.cant<=it.minimo)     return badge("⚠️ Bajo stock","#fffbeb","#d97706");
          if (it.cant<=it.minimo*1.5) return badge("👁 Vigilar","#eff6ff","#2563eb");
          return badge("✅ OK","#f0fdf4","#16a34a");
        };
        const herrBadge = (it) => it.cant===0 ? badge("⛔ Sin stock","#fef2f2","#dc2626") : badge("✅ OK","#f0fdf4","#16a34a");

        const filaInsumo = (it) => {
          const diff   = it.cant - it.minimo;
          const diffCol= diff<0?"#dc2626":diff===0?"#d97706":"#16a34a";
          return `<tr>
            <td><b>${it.nombre}</b>${it.obs?`<br/><span style="font-size:10px;color:#888">📌 ${it.obs}</span>`:""}
            </td>
            <td style="text-align:right;font-weight:700;font-size:13px">${it.cant}</td>
            <td>${it.unidad}</td>
            <td style="text-align:right">${it.minimo}</td>
            <td style="text-align:right;color:${diffCol};font-weight:700">${diff>=0?"+":""}${diff}</td>
            <td style="text-align:center">${estadoBadge(it)}</td>
          </tr>`;
        };
        const filaHerr = (it) => `<tr>
          <td><b>${it.nombre}</b></td>
          <td style="text-align:right;font-weight:700;font-size:13px">${it.cant}</td>
          <td>${it.unidad}</td>
          <td style="text-align:center">${herrBadge(it)}</td>
        </tr>`;

        const movRows = historial.map(h=>`<tr>
          <td style="white-space:nowrap;font-size:11px">${h.fecha}<br/><span style="color:#aaa">${h.hora}</span></td>
          <td><b>${h.nombre}</b></td>
          <td style="text-align:center">${h.tipo==="entrada"?`<span style="color:#16a34a;font-weight:700">📥 Entrada</span>`:`<span style="color:#dc2626;font-weight:700">📤 Salida</span>`}</td>
          <td style="text-align:right;font-weight:700;color:${h.tipo==="entrada"?"#16a34a":"#dc2626"}">${h.tipo==="entrada"?"+":"-"}${h.cant}</td>
          <td style="color:#888;font-size:11px">${h.obs||"—"}</td>
        </tr>`).join("");

        const alertaRows = alertas.map(it=>`<tr>
          <td>${estadoBadge(it)}</td>
          <td><b>${it.nombre}</b></td>
          <td>${it.categoria}</td>
          <td style="text-align:right;font-weight:700">${it.cant}</td>
          <td>${it.unidad}</td>
          <td style="text-align:right">${it.minimo}</td>
          <td style="color:#888;font-size:11px">${it.obs||"—"}</td>
        </tr>`).join("");

        const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Inventario — Tierra Prometida ${fechaFile}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;padding:28px;color:#222;max-width:1100px;margin:0 auto;font-size:12px}
  h1{color:#845EF7;margin-bottom:2px;font-size:22px}
  h2{color:#845EF7;font-size:13px;font-weight:800;margin:22px 0 6px;border-bottom:2px solid #845EF730;padding-bottom:5px;text-transform:uppercase;letter-spacing:0.5px}
  .hdr-row{display:flex;align-items:center;gap:12px;margin-bottom:2px}
  .hdr-row img{width:46px;height:46px;object-fit:contain}
  .meta{font-size:11px;color:#888;margin-bottom:16px}
  .cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
  .card{background:#f7f4ff;border:1px solid #d8d0ff;border-radius:10px;padding:14px 18px;min-width:130px;text-align:center}
  .card-val{font-size:24px;font-weight:800;color:#845EF7;line-height:1}
  .card-lbl{font-size:10px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px}
  .card.warn .card-val{color:#d97706} .card.ok .card-val{color:#16a34a} .card.danger .card-val{color:#dc2626} .card.green .card-val{color:#0d9488}
  table{width:100%;border-collapse:collapse;margin-bottom:4px}
  th{background:#845EF7;color:white;padding:8px 10px;text-align:left;font-size:11px}
  td{padding:7px 10px;border-bottom:1px solid #f0eeff;vertical-align:middle}
  tr:nth-child(even) td{background:#faf8ff}
  tr:hover td{background:#f0ebff}
  .alerta-table th{background:#d97706}
  .herr-table th{background:#6366F1}
  .mov-table th{background:#374151}
  .tot-row td{background:#f0ebff!important;font-weight:700;border-top:2px solid #845EF740}
  .section-note{font-size:11px;color:#888;margin-bottom:8px}
  .footer{text-align:center;color:#bbb;margin-top:28px;font-size:10px;border-top:1px solid #eee;padding-top:14px}
  @media print{body{padding:10px}.footer{position:fixed;bottom:0;width:100%}}
</style></head><body>

<div class="hdr-row">${logoSrc ? `<img src="${logoSrc}"/>` : ""}<h1>📦 Informe de Inventario — Tierra Prometida Trading</h1></div>
<div class="meta">Generado: ${fechaHoy} &nbsp;·&nbsp; ${items.length} ítems registrados${mostrarHistorial ? ` &nbsp;·&nbsp; ${historial.length} movimientos en historial` : ""}</div>

<div class="cards">
  <div class="card ok"><div class="card-val">${insumos.length}</div><div class="card-lbl">Insumos</div></div>
  <div class="card"><div class="card-val">${herramientas.length}</div><div class="card-lbl">Herramientas</div></div>
  <div class="card warn"><div class="card-val">${bajoStock.length}</div><div class="card-lbl">Bajo stock</div></div>
  <div class="card danger"><div class="card-val">${agotados.length}</div><div class="card-lbl">Agotados</div></div>
</div>

${mostrarFaltante && alertas.length>0?`
<h2>⚠️ Alertas de stock (${alertas.length})</h2>
<p class="section-note">Ítems agotados o por debajo del mínimo establecido.</p>
<table class="alerta-table"><thead><tr><th>Estado</th><th>Nombre</th><th>Categoría</th><th>Stock actual</th><th>Unidad</th><th>Mínimo</th><th>Observación</th></tr></thead>
<tbody>${alertaRows}</tbody></table>`:""}

<h2>📦 Insumos (${insumos.length})</h2>
<table><thead><tr><th>Nombre / Obs.</th><th style="text-align:right">Cant. actual</th><th>Unidad</th><th style="text-align:right">Mínimo</th><th style="text-align:right">Diferencia</th><th style="text-align:center">Estado</th></tr></thead>
<tbody>
${insumos.map(filaInsumo).join("")}
</tbody></table>

<h2>🔧 Herramientas (${herramientas.length})</h2>
<table class="herr-table"><thead><tr><th>Nombre</th><th style="text-align:right">Cantidad</th><th>Unidad</th><th style="text-align:center">Estado</th></tr></thead>
<tbody>${herramientas.map(filaHerr).join("")}</tbody></table>

${mostrarHistorial && historial.length>0?`
<h2>📋 Historial completo de movimientos (${historial.length})</h2>
<table class="mov-table"><thead><tr><th>Fecha / Hora</th><th>Ítem</th><th style="text-align:center">Tipo</th><th style="text-align:right">Cantidad</th><th>Observación</th></tr></thead>
<tbody>${movRows}</tbody></table>`:""}

<div class="footer">Tierra Prometida Trading 🍋 · JARVIS · ${fechaHoy} — Documento de uso interno.</div>
</body></html>`;
        const _u4=URL.createObjectURL(new Blob([html],{type:"text/html"}));const a=document.createElement("a");a.href=_u4;a.download=`Inventario_${fechaFile}.html`;a.click();URL.revokeObjectURL(_u4);
      }} style={{width:"100%",background:"linear-gradient(135deg,#845EF7,#6366F1)",border:"none",borderRadius:10,padding:"10px",fontSize:13,color:"white",cursor:"pointer",fontWeight:700,marginTop:14}}>
        📥 Descargar informe de inventario
      </button>
      </>}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// MÓDULO ASISTENCIA — TIERRA PROMETIDA TRADING
// Datos: registros[fecha][nombre] = { estado, contenedor, obs }
//        metaDia[fecha] = { turno, contenedorDia, obsGeneral }
// Persistencia: localStorage
// ─────────────────────────────────────────────────────────────
function AsistenciaDemo() {
  const hoy      = new Date();
  const fechaHoy = hoy.toISOString().split("T")[0];

  const {
    registros, metaDia,
    loading:    loadingAsis,
    cargarMes,
    setEmpField: setEmpFieldSB, toggleEstado: toggleEstadoSB,
    setMetaField: setMetaFieldSB, marcarTodos: marcarTodosSB, limpiarDia,
  } = useAsistencia();
  const { empleados, loading: loadingPersonal } = usePersonal();

  const [fecha,       setFecha]       = useState(fechaHoy);
  const [search,      setSearch]       = useState("");
  const [showReporte, setShowReporte]  = useState(false);
  const [mesReporte,  setMesReporte]   = useState(`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,"0")}`);
  const [confirm,     setConfirm]      = useState(null);
  const [expandedEmp, setExpandedEmp]  = useState(null);

  const pedir = (msg, fn) => setConfirm({ msg, fn });

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

  // ── Helpers de lectura ──
  const getEmpReg = (nombre) => registros[fecha]?.[nombre] || {};
  const getEstado = (nombre) => getEmpReg(nombre).estado || null;
  const getMeta   = ()        => metaDia[fecha] || {};

  // ── Helpers de escritura (delegan al hook) ──
  const setEmpField  = (nombre, field, value) => setEmpFieldSB(fecha, nombre, field, value);
  const toggleEstado = (nombre, nuevoEstado)  => toggleEstadoSB(fecha, nombre, nuevoEstado);
  const setMetaField = (field, value)         => setMetaFieldSB(fecha, field, value);
  const marcarTodos  = (estado)               => marcarTodosSB(fecha, filtrados, estado);

  // ── Stats del día ──
  const diaReg = registros[fecha] || {};
  const stats  = ESTADOS.reduce((acc, s) => {
    acc[s.key] = Object.values(diaReg).filter(v => v?.estado === s.key).length;
    return acc;
  }, {});
  const sinRegistro = empleadosActivos.length -
    Object.values(diaReg).filter(v => v?.estado).length;
  const meta = getMeta();

  // ── Helpers de reporte ──
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

  // ── Carga lazy cuando cambia el mes del reporte ──
  useEffect(() => { cargarMes(mesReporte); }, [mesReporte, cargarMes]);

  // ── Estilos comunes ──
  const inp   = { background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, padding:"7px 10px", color:"white", fontSize:12, fontFamily:"inherit", outline:"none" };
  const inpSm = { ...inp, padding:"5px 8px", fontSize:11 };

  // ── GENERADOR DE INFORME HTML ──
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

    // Solo días con al menos un marcado
    const diasConReg = dias.filter(d =>
      datos.some(row => row.detalleDias[d]?.estado)
    );

    if (diasConReg.length === 0) {
      alert("No se encontraron días con registros de asistencia.");
      return;
    }

    const esc = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

    const DIAS_SEMANA = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

    // ── Tabla 1: Datos del día (turno, contenedor, obs) ──
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

    // ── Tabla 2: Resumen por empleado ──
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

    // ── Tabla 3: Detalle día a día ──
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

    // ── Tabla 4: Observaciones individuales (todas las obs que no estén vacías) ──
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

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  if (loadingAsis || loadingPersonal) return <LimonLoader texto="Cargando asistencia" />;
  return (
    <div>
      {/* Confirmación */}
      {confirm && (
        <ConfirmModal
          mensaje={confirm.msg}
          onConfirm={() => { confirm.fn(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* ══════════════════════════════════════
          MODAL DE REPORTE
      ══════════════════════════════════════ */}
      {showReporte && (
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.9)",zIndex:9999,overflowY:"auto",padding:16}}>
          <div style={{background:"white",borderRadius:16,maxWidth:660,margin:"0 auto",padding:24,color:"#1a1a1a"}}>

            {/* Cabecera modal */}
            <div style={{textAlign:"center",borderBottom:"3px solid #1D6F42",paddingBottom:12,marginBottom:16}}>
              <div style={{fontSize:28}}>🍋</div>
              <div style={{fontSize:17,fontWeight:800,color:"#1D6F42"}}>TIERRA PROMETIDA TRADING</div>
              <div style={{fontSize:11,color:"#666"}}>Vista previa — Informe de Asistencia</div>
              <div style={{display:"inline-block",background:"#1D6F42",color:"white",padding:"2px 14px",borderRadius:20,fontSize:9,marginTop:4}}>JARVIS 🤖</div>
            </div>

            {/* Selector de mes */}
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

            {/* Vista previa dinámica */}
            {(() => {
              const datos = generarReporteData();
              if (datos.length === 0) return (
                <div style={{textAlign:"center",padding:"28px 20px",background:"#fafafa",borderRadius:10,marginBottom:14}}>
                  <div style={{fontSize:32,marginBottom:8}}>📭</div>
                  <div style={{fontSize:13,fontWeight:700,color:"#555"}}>Sin registros para este mes</div>
                  <div style={{fontSize:11,color:"#999",marginTop:4}}>Marca asistencia en el módulo y luego vuelve aquí.</div>
                </div>
              );

              // Preview de metaDia del mes
              const diasMes  = getDiasMes(mesReporte);
              const diasConR = diasMes.filter(d => datos.some(row => row.detalleDias[d]?.estado));
              const diasConMeta = diasConR.filter(d => metaDia[d]?.turno || metaDia[d]?.contenedorDia || metaDia[d]?.obsGeneral);

              return (
                <>
                  {/* Stats */}
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

                  {/* Info de metaDia guardada */}
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

                  {/* Tabla resumen */}
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

            {/* Botones */}
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

      {/* ══════════════════════════════════════
          CABECERA DEL DÍA
      ══════════════════════════════════════ */}
      <div style={{background:"rgba(78,205,196,0.07)",border:"1px solid rgba(78,205,196,0.2)",borderRadius:12,padding:"10px 12px",marginBottom:10}}>
        {/* Fila: fecha + turno */}
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
        {/* Fila: contenedor del día + obs general */}
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

      {/* ══════════════════════════════════════
          STATS DEL DÍA
      ══════════════════════════════════════ */}
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

      {/* ══════════════════════════════════════
          BUSCADOR + ACCIONES MASIVAS
      ══════════════════════════════════════ */}
      <div style={{display:"flex",gap:6,marginBottom:8}}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Filtrar empleados o área..."
          style={{...inp, flex:1}}
        />
        <button
          onClick={() => pedir("¿Marcar a TODOS los empleados visibles como Presente?", () => marcarTodos("P"))}
          style={{background:"rgba(0,201,167,0.15)",border:"1px solid rgba(0,201,167,0.3)",borderRadius:7,padding:"5px 8px",fontSize:10,color:"#00C9A7",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>
          ✅ Todos P
        </button>
        <button
          onClick={() => pedir("¿Limpiar TODOS los registros de este día?", () => limpiarDia(fecha))}
          style={{background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.25)",borderRadius:7,padding:"5px 8px",fontSize:11,color:"#FF6B6B",cursor:"pointer",fontWeight:700}}>
          🗑
        </button>
      </div>

      {/* ══════════════════════════════════════
          LISTA DE EMPLEADOS
      ══════════════════════════════════════ */}
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

              {/* ── Bloque de información ── */}
              <div style={{padding:"12px 14px 10px", display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8}}>
                <div style={{minWidth:0, flex:1}}>
                  {/* Nombre */}
                  <div style={{display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:4}}>
                    <span style={{fontSize:14, color:"white", fontWeight:700, lineHeight:1.2}}>
                      {emp.nombre.split(" ").slice(0,2).join(" ")}
                    </span>
                  </div>
                  {/* Área y documento */}
                  <div style={{fontSize:11, color:"rgba(255,255,255,0.48)", lineHeight:1.4}}>
                    {emp.area}
                    {emp.doc ? <span style={{color:"rgba(255,255,255,0.33)"}}> · </span> : null}
                    {emp.doc ? <span style={{color:"rgba(255,255,255,0.42)"}}>{emp.doc} {emp.num}</span> : null}
                  </div>
                </div>
                {/* Badge de estado actual */}
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

              {/* ── Fila de botones de estado ── */}
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
                {/* Botón expandir — notas y contenedor */}
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

              {/* ── Panel expandible: contenedor + observación ── */}
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

      {/* Leyenda */}
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
        {ESTADOS.map(s => (
          <div key={s.key} style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:"rgba(255,255,255,0.48)"}}>
            <span style={{color:s.color}}>{s.icon}</span>{s.label}
          </div>
        ))}
        <div style={{fontSize:10,color:"rgba(78,205,196,0.5)"}}>⚙ = contenedor y obs. individual</div>
      </div>

      {/* ══════════════════════════════════════
          BOTÓN GENERAR INFORME
      ══════════════════════════════════════ */}
      <button
        onClick={() => setShowReporte(true)}
        style={{width:"100%",background:"linear-gradient(135deg,#1D6F42,#21A366)",border:"none",borderRadius:10,padding:"11px",fontSize:13,color:"white",cursor:"pointer",fontWeight:700,letterSpacing:0.3}}>
        📊 Generar Informe de Asistencia
      </button>
    </div>
  );
}

// ─── MÓDULO CONTENEDORES ─────────────────────────────────────
function ContenedoresDemo() {
  const mob = useM();
  const hoy = new Date().toISOString().split("T")[0];

  const [tabCont, setTabCont]           = useState(0);
  const [plContenedorActivo, setPlContenedorActivo] = useState(null);
  const [plStatuses, setPlStatuses]     = useState({});
  const [confirm, setConfirm]           = useState(null);
  const [toast, setToast]               = useState(null);
  const pedir = (msg, fn) => setConfirm({ msg, fn });
  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  // Vista previa de informes (Rendimientos, etc.)
  const [previewRend, setPreviewRend] = useState(null); // { url, filename }
  useEffect(() => () => { if (previewRend?.url) URL.revokeObjectURL(previewRend.url); }, [previewRend]);
  const inp = { background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"7px 10px", color:"white", fontSize:11, fontFamily:"inherit", width:"100%", boxSizing:"border-box" };
  const lbl = { fontSize:9, color:"rgba(255,255,255,0.48)", marginBottom:3 };

  // ── Hook Supabase ──
  const {
    procesos, grupos, contInsumos, rendimientos, loading: loadingCont,
    guardarContenedor,
    eliminarContenedor,
    agregarTrazabilidad,
    cambiarEstado: cambiarEstadoHook,
    guardarGrupo: guardarGrupoSB,
    eliminarGrupo: eliminarGrupoSB,
    guardarCC: guardarCCSB,
    eliminarCC,
    guardarRendimiento: guardarRendimientoSB,
    eliminarRendimiento: eliminarRendimientoSB,
  } = useContenedores();
  const { cargarTodos: cargarPLTodos } = usePackingList();
  const { items: invItems, ajustarLotes } = useInventario();
  const invActual = invItems.length > 0 ? invItems : INVENTARIO_BASE;
  const { empleados: empleadosCont } = usePersonal();
  const empleadosContReal = empleadosCont.length > 0 ? empleadosCont : EMPLEADOS_DB;

  // ── Tab 0: Contenedores ──
  const formDef = { fecha:hoy, numContenedor:"", proveedor:"", producto:"", cajasSalida:"", turno:"Día", estado:"En proceso", operadores:"", transporte:"", placa:"", trailer:"", obs:"", grupoDia:"", grupoNoche:"", booking:"", naviera:"", vessel:"", destino:"Miami, FL", trazabilidad:[] };
  const [showForm, setShowForm]   = useState(false);
  const [editIdx, setEditIdx]     = useState(null); // container id or null
  const [busqueda, setBusqueda]   = useState("");
  const [filtroMes, setFiltroMes] = useState("");
  const [form, setForm]           = useState(formDef);
  const [nuevoProveedor, setNuevoProveedor] = useState("");

  // ── Tab 1: Grupos de trabajo ──
  const [showFormGrupo, setShowFormGrupo] = useState(false);
  const [editGrupoId, setEditGrupoId] = useState(null);
  const [formGrupo, setFormGrupo]     = useState({ nombre:"", turno:"Día", miembros:[] });
  const [busqGrupo, setBusqGrupo]     = useState("");
  const toggleMiembro = (num) => setFormGrupo(f=>({ ...f, miembros:f.miembros.includes(num)?f.miembros.filter(m=>m!==num):[...f.miembros,num] }));

  // ── Tab 3: Trazabilidad ──
  const [selContTraz, setSelContTraz] = useState(null);
  const [formTraz, setFormTraz]       = useState({ evento:"Carga completada", detalle:"", responsable:"" });
  const [showFormTraz, setShowFormTraz] = useState(false);
  const EVENTOS_TIPO = ["Inicio de proceso","Llenado de caja","Control de calidad","Pre-frío completado","Verificación fitosanitaria","Carga en contenedor","Precinto aplicado","Salida de planta","Entregado en puerto","En tránsito","Descargado en destino","Entregado al cliente","Incidencia","Otro"];
  const ESTADOS_CONT = ["En proceso","Completado","Pausado","Cancelado"];

  // ── Tab 4: Centro de Costos ──
  const INSUMOS_IDS_CONT = [3,4,5,6,7,9,10,11,12,13,14,16,17,44,45,46,47];
  const [selContCC, setSelContCC]     = useState(null);
  const [formCC, setFormCC]           = useState({});
  const [editingRecId, setEditingRecId]       = useState(null);
  const [plantillaActiva, setPlantillaActiva] = useState(null);
  const [formExtras, setFormExtras]           = useState([]);
  const [expandidos, setExpandidos]           = useState({});
  const toggleExpandido = (id) => setExpandidos(prev => ({ ...prev, [id]: !prev[id] }));
  const [busqGrupoList,  setBusqGrupoList]    = useState("");
  const [filtroMesNom,   setFiltroMesNom]     = useState("");

  const filtrados = procesos.filter(p =>
    (p.numContenedor+p.proveedor+p.producto).toLowerCase().includes(busqueda.toLowerCase()) &&
    (filtroMes ? p.fecha.startsWith(filtroMes) : true)
  );
  const stats = { total:procesos.length, comp:procesos.filter(p=>p.estado==="Completado").length, enProc:procesos.filter(p=>p.estado==="En proceso").length, cajas:procesos.reduce((s,p)=>s+Number(p.cajasSalida||0),0) };
  const COL_EST = { "En proceso":"#F9A826","Completado":"#00C9A7","Pausado":"#845EF7","Cancelado":"#FF6B6B" };
  const TAB_CONT = ["🚢 Contenedores","👥 Grupos / Turnos","💰 Nómina","🗺 Trazabilidad","📦 Centro de Costos","📊 Rendimientos","📋 Packing List","🔎 Verificación"];

  // ── Tab 5: Rendimientos ──
  const KG_DEL_MONTE = 16.8;
  const KG_PRINCESS  = 15.7;
  const OBS_OPCIONES = ["Plaga","Sucio","Quemado","Deshidratado","Verde / Inmaduro","Golpeado / Magullado","Pudrición","Tamaño irregular","Exceso de madurez"];
  const rendFormDef  = { contId: null, contNum: "", fecha: hoy, proveedor: "", kilosProcesados: "", kilosRechazados: "", kilosPrimeraDevueltos: "", cajasDelMonte: "", cajasPrincess: "", observaciones: [], obsDetalle: "", calibres: [] };
  const calFormDef   = { nombre: "", tipo: "cajas", cantidad: "", marca: "Del Monte" };
  const parseProveedores = (str) => {
    if (!str) return [];
    try { const p = JSON.parse(str); return Array.isArray(p) ? p.filter(Boolean) : [str]; }
    catch { return str.split(/[,|]/).map(s => s.trim()).filter(Boolean); }
  };
  const [selContRend,   setSelContRend]   = useState(null);
  const [showFormRend,  setShowFormRend]  = useState(false);
  const [editRendId,    setEditRendId]    = useState(null);
  const [formRend,      setFormRend]      = useState(rendFormDef);
  const [calForm,       setCalForm]       = useState(calFormDef);

  const guardar = async () => {
    if (!form.numContenedor.trim()) return;
    let formAGuardar = form;
    if (nuevoProveedor.trim()) {
      const arr = [...parseProveedores(form.proveedor), nuevoProveedor.trim()];
      formAGuardar = { ...form, proveedor: JSON.stringify(arr) };
    }
    const ok = await guardarContenedor(formAGuardar, editIdx);
    if (ok) {
      if (editIdx !== null) setEditIdx(null);
      setForm(formDef); setNuevoProveedor(""); setShowForm(false);
      showToast("Contenedor guardado", true);
    } else {
      showToast("Error al guardar el contenedor", false);
    }
  };

  const descargar = async () => {
    if (!filtrados.length) { alert("Sin registros para exportar."); return; }
    const logoSrc = await cargarLogoBase64();
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Contenedores</title>
<style>body{font-family:Arial,sans-serif;padding:20px}h1{color:#6366F1;margin:0}.hdr-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}.hdr-row img{width:36px;height:36px;object-fit:contain}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#6366F1;color:white;padding:7px}td{padding:6px;border:1px solid #ddd}tr:nth-child(even)td{background:#f9f9f9}.footer{text-align:center;color:#aaa;margin-top:12px;font-size:10px}</style></head>
<body><div class="hdr-row">${logoSrc ? `<img src="${logoSrc}"/>` : ""}<h1>🚢 Tierra Prometida Trading — Contenedores</h1></div>
<p>Total: ${stats.total} · Completados: ${stats.comp} · Cajas: ${stats.cajas.toLocaleString("es-CO")}</p>
<table><thead><tr><th>Fecha</th><th>N° Contenedor</th><th>Prov. Limón</th><th>Tipo Caja</th><th>Cajas</th><th>Booking</th><th>Naviera</th><th>Destino</th><th>Grupo Día</th><th>Grupo Noche</th><th>Supervisores</th><th>Estado</th></tr></thead>
<tbody>${filtrados.map(p=>`<tr><td>${p.fecha}</td><td><b>${p.numContenedor}</b></td><td>${parseProveedores(p.proveedor).join(", ")||"—"}</td><td>${p.producto||"—"}</td><td>${p.cajasSalida||0}</td><td>${p.booking||"—"}</td><td>${p.naviera||"—"}</td><td>${p.destino||"—"}</td><td>${p.grupoDia||"—"}</td><td>${p.grupoNoche||"—"}</td><td>${p.operadores||"—"}</td><td>${p.estado}</td></tr>`).join("")}
</tbody></table><div class="footer">Tierra Prometida Trading 🍋 · JARVIS</div></body></html>`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html],{type:"text/html"})); a.download = `Contenedores_${hoy}.html`; a.click();
  };

  if (loadingCont) return <LimonLoader texto="Cargando contenedores" />;

  return (
    <div>
      {confirm && <ConfirmModal mensaje={confirm.msg} onConfirm={()=>{confirm.fn();setConfirm(null);}} onCancel={()=>setConfirm(null)} />}
      {toast && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background: toast.ok ? "#064e3b" : "#450a0a", border:`1px solid ${toast.ok ? "#059669" : "#dc2626"}`, color: toast.ok ? "#6ee7b7" : "#fca5a5", borderRadius:10, padding:"10px 20px", fontSize:12, fontWeight:600, zIndex:9999, pointerEvents:"none", whiteSpace:"nowrap" }}>
          {toast.ok ? "✅" : "❌"} {toast.msg}
        </div>
      )}

      {previewRend && (
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.88)",zIndex:9998,display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",background:"#12121f",borderBottom:"1px solid rgba(255,255,255,0.13)",flexShrink:0}}>
            <span style={{color:"white",fontWeight:700,fontSize:13}}>👁 Vista Previa — {previewRend.filename}</span>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{const a=document.createElement("a");a.href=previewRend.url;a.download=previewRend.filename;a.click();}} style={{background:"linear-gradient(135deg,#845EF7,#6366F1)",border:"none",borderRadius:8,padding:"7px 16px",fontSize:12,color:"white",cursor:"pointer",fontWeight:700}}>📥 Descargar</button>
              <button onClick={()=>setPreviewRend(null)} style={{background:"rgba(255,255,255,0.10)",border:"1px solid rgba(255,255,255,0.20)",borderRadius:8,padding:"7px 14px",fontSize:12,color:"rgba(255,255,255,0.78)",cursor:"pointer"}}>✕ Cerrar</button>
            </div>
          </div>
          <iframe src={previewRend.url} style={{flex:1,border:"none",background:"white"}} title="Vista previa del informe de rendimiento" />
        </div>
      )}

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:14,borderBottom:"1px solid rgba(255,255,255,0.10)",paddingBottom:10,overflowX:"auto",flexWrap:"nowrap",scrollbarWidth:"none"}}>
        {TAB_CONT.map((t,i)=>(
          <button key={i} onClick={()=>setTabCont(i)}
            style={{background:tabCont===i?"rgba(99,102,241,0.2)":"transparent",border:tabCont===i?"1px solid rgba(99,102,241,0.5)":"1px solid transparent",borderRadius:8,padding:"6px 12px",fontSize:11,color:tabCont===i?"#a5b4fc":"rgba(255,255,255,0.4)",cursor:"pointer",fontWeight:tabCont===i?700:400,whiteSpace:"nowrap",flexShrink:0}}>
            {t}
          </button>
        ))}
      </div>

      {/* ═══ TAB 0: CONTENEDORES ═══ */}
      {tabCont === 0 && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:mob?"repeat(2,1fr)":"repeat(4,1fr)",gap:8,marginBottom:12}}>
            {[{i:"🚢",l:"Total",v:stats.total,c:"#6366F1"},{i:"✅",l:"Completados",v:stats.comp,c:"#00C9A7"},{i:"⏳",l:"En proceso",v:stats.enProc,c:"#F9A826"},{i:"📦",l:"Cajas",v:stats.cajas.toLocaleString("es-CO"),c:"#845EF7"}].map((s,i)=>(
              <div key={i} style={{background:`${s.c}12`,border:`1px solid ${s.c}30`,borderRadius:10,padding:"10px 6px",textAlign:"center"}}>
                <div style={{fontSize:16}}>{s.i}</div><div style={{fontSize:15,fontWeight:800,color:s.c}}>{s.v}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.48)"}}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="🔍 Buscar contenedor..." style={{...inp,flex:1,width:"auto",minWidth:140}} />
            <input type="month" value={filtroMes} onChange={e=>setFiltroMes(e.target.value)} style={{...inp,flex:1,minWidth:0}} />
            <button onClick={()=>{setShowForm(!showForm);setEditIdx(null);setForm(formDef);}}
              style={{background:"rgba(99,102,241,0.2)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:8,padding:"6px 12px",fontSize:11,color:"#6366F1",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>
              {showForm?"✕ Cerrar":"➕ Nuevo"}
            </button>
          </div>
          {showForm && (
            <div style={{background:"rgba(99,102,241,0.07)",border:"1px solid rgba(99,102,241,0.25)",borderRadius:12,padding:14,marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"#6366F1",marginBottom:10}}>🚢 {editIdx!==null?"Editar":"Registrar nuevo"} contenedor</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",flexDirection:mob?"column":"row",gap:6}}>
                  <div style={{flex:1}}><div style={lbl}>Fecha *</div><input type="date" value={form.fecha} onChange={e=>setForm(p=>({...p,fecha:e.target.value}))} style={inp} /></div>
                  <div style={{flex:1}}><div style={lbl}>N° Contenedor *</div><input value={form.numContenedor} onChange={e=>setForm(p=>({...p,numContenedor:e.target.value}))} placeholder="Ej: MNBU3679199" style={inp} /></div>
                </div>
                <div style={{display:"flex",flexDirection:mob?"column":"row",gap:6}}>
                  <div style={{flex:1}}>
                    <div style={lbl}>Proveedores de Limón</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:5}}>
                      {parseProveedores(form.proveedor).map((pv,i)=>(
                        <span key={i} style={{background:"rgba(99,102,241,0.18)",border:"1px solid rgba(99,102,241,0.35)",borderRadius:20,padding:"3px 10px",fontSize:11,color:"#a5b4fc",display:"flex",alignItems:"center",gap:5}}>
                          {pv}
                          <button onClick={()=>{const arr=parseProveedores(form.proveedor).filter((_,j)=>j!==i);setForm(p=>({...p,proveedor:JSON.stringify(arr)}));}} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:12,padding:0,lineHeight:1}}>×</button>
                        </span>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:5}}>
                      <input value={nuevoProveedor} onChange={e=>setNuevoProveedor(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&nuevoProveedor.trim()){const arr=[...parseProveedores(form.proveedor),nuevoProveedor.trim()];setForm(p=>({...p,proveedor:JSON.stringify(arr)}));setNuevoProveedor("");}}} placeholder="Nombre del proveedor..." style={{...inp,flex:1}} />
                      <button onClick={()=>{if(!nuevoProveedor.trim())return;const arr=[...parseProveedores(form.proveedor),nuevoProveedor.trim()];setForm(p=>({...p,proveedor:JSON.stringify(arr)}));setNuevoProveedor("");}} style={{background:"rgba(99,102,241,0.2)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:8,padding:"0 12px",fontSize:12,color:"#a5b4fc",cursor:"pointer",whiteSpace:"nowrap"}}>+ Agregar</button>
                    </div>
                  </div>
                  <div style={{flex:1}}><div style={lbl}>Tipo de caja</div>
                    <CustomSelect value={form.producto} onChange={e=>setForm(p=>({...p,producto:e.target.value}))} style={inp}>
                      <option value="" style={{background:"#1a1a2e"}}>Seleccionar...</option>
                      <option style={{background:"#1a1a2e"}}>Caja Del Monte</option>
                      <option style={{background:"#1a1a2e"}}>Caja Princesses</option>
                      <option style={{background:"#1a1a2e"}}>Caja Del Monte + Princesses</option>
                    </CustomSelect>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:mob?"column":"row",gap:6}}>
                  <div style={{flex:1}}><div style={lbl}>Cajas de salida</div><input type="number" min="0" value={form.cajasSalida} onChange={e=>setForm(p=>({...p,cajasSalida:e.target.value}))} style={inp} /></div>
                  <div style={{flex:1}}><div style={lbl}>Turno</div>
                    <CustomSelect value={form.turno} onChange={e=>setForm(p=>({...p,turno:e.target.value}))} style={inp}>
                      {["Día","Noche","Ambos"].map(t=><option key={t} style={{background:"#1a1a2e"}}>{t}</option>)}
                    </CustomSelect>
                  </div>
                  <div style={{flex:1}}><div style={lbl}>Estado</div>
                    <CustomSelect value={form.estado} onChange={e=>setForm(p=>({...p,estado:e.target.value}))} style={inp}>
                      {ESTADOS_CONT.map(s=><option key={s} style={{background:"#1a1a2e"}}>{s}</option>)}
                    </CustomSelect>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:mob?"column":"row",gap:6}}>
                  <div style={{flex:1}}><div style={lbl}>Grupo Turno Día ☀️</div>
                    <CustomSelect value={form.grupoDia} onChange={e=>setForm(p=>({...p,grupoDia:e.target.value}))} style={inp}>
                      <option value="" style={{background:"#1a1a2e"}}>— Sin asignar —</option>
                      {grupos.filter(g=>g.turno==="Día"||g.turno==="Ambos").map(g=><option key={g.id} value={g.nombre} style={{background:"#1a1a2e"}}>{g.nombre} ({g.miembros.length} personas)</option>)}
                    </CustomSelect>
                  </div>
                  <div style={{flex:1}}><div style={lbl}>Grupo Turno Noche 🌙</div>
                    <CustomSelect value={form.grupoNoche} onChange={e=>setForm(p=>({...p,grupoNoche:e.target.value}))} style={inp}>
                      <option value="" style={{background:"#1a1a2e"}}>— Sin asignar —</option>
                      {grupos.filter(g=>g.turno==="Noche"||g.turno==="Ambos").map(g=><option key={g.id} value={g.nombre} style={{background:"#1a1a2e"}}>{g.nombre} ({g.miembros.length} personas)</option>)}
                    </CustomSelect>
                  </div>
                </div>
                <div style={{fontSize:11,fontWeight:700,color:"rgba(99,102,241,0.8)",marginTop:4,marginBottom:2}}>Datos de exportación</div>
                <div style={{display:"flex",flexDirection:mob?"column":"row",gap:6}}>
                  <div style={{flex:1}}><div style={lbl}>Booking #</div><input value={form.booking} onChange={e=>setForm(p=>({...p,booking:e.target.value}))} placeholder="Ej: BK-20260312-01" style={inp} /></div>
                  <div style={{flex:1}}><div style={lbl}>Naviera</div><input value={form.naviera} onChange={e=>setForm(p=>({...p,naviera:e.target.value}))} placeholder="Ej: Maersk, MSC..." style={inp} /></div>
                  <div style={{flex:1}}><div style={lbl}>Motonave</div><input value={form.vessel} onChange={e=>setForm(p=>({...p,vessel:e.target.value}))} placeholder="Ej: NEWYORKER" style={inp} /></div>
                  <div style={{flex:1}}><div style={lbl}>Destino</div><input value={form.destino} onChange={e=>setForm(p=>({...p,destino:e.target.value}))} placeholder="Miami, FL" style={inp} /></div>
                </div>
                <div><div style={lbl}>Supervisores a cargo</div><input value={form.operadores} onChange={e=>setForm(p=>({...p,operadores:e.target.value}))} placeholder="Ej: Jhair Andres Uribe..." style={inp} /></div>
                <div style={{display:"flex",flexDirection:mob?"column":"row",gap:6}}>
                  <div style={{flex:1}}><div style={lbl}>Empresa transporte</div><input value={form.transporte} onChange={e=>setForm(p=>({...p,transporte:e.target.value}))} placeholder="Ej: Transportes Rápido" style={inp} /></div>
                  <div style={{flex:1}}><div style={lbl}>Placa</div><input value={form.placa} onChange={e=>setForm(p=>({...p,placa:e.target.value.toUpperCase()}))} placeholder="ABC-123" style={inp} /></div>
                  <div style={{flex:1}}><div style={lbl}>Trailer</div><input value={form.trailer} onChange={e=>setForm(p=>({...p,trailer:e.target.value.toUpperCase()}))} placeholder="TRL-456" style={inp} /></div>
                </div>
                <div><div style={lbl}>Observaciones</div><input value={form.obs} onChange={e=>setForm(p=>({...p,obs:e.target.value}))} placeholder="Notas adicionales..." style={inp} /></div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>pedir(editIdx!==null?"¿Guardar cambios?":"¿Registrar este contenedor?",guardar)}
                    style={{flex:1,background:"linear-gradient(135deg,#6366F1,#845EF7)",border:"none",borderRadius:8,padding:"9px",fontSize:12,color:"white",cursor:"pointer",fontWeight:700}}>
                    ✅ {editIdx!==null?"Guardar cambios":"Registrar proceso"}
                  </button>
                  <button onClick={()=>setShowForm(false)} style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.13)",borderRadius:8,padding:"9px 14px",fontSize:12,color:"rgba(255,255,255,0.48)",cursor:"pointer"}}>Cancelar</button>
                </div>
              </div>
            </div>
          )}
          <div style={{maxHeight:480,overflowY:"auto",marginBottom:10}}>
            {filtrados.length === 0 ? (
              <div style={{textAlign:"center",padding:"36px 0",color:"rgba(255,255,255,0.33)"}}>
                <div style={{fontSize:36,marginBottom:10}}>🚢</div>
                <div style={{fontSize:13}}>Sin registros — toca ➕ Nuevo para empezar</div>
              </div>
            ) : filtrados.map((p,i) => {
              const col = COL_EST[p.estado] || "#6366F1";
              const gDia   = grupos.find(g=>g.nombre===p.grupoDia);
              const gNoche = grupos.find(g=>g.nombre===p.grupoNoche);
              return (
                <div key={p.id||i} style={{background:`${col}08`,border:`1px solid ${col}28`,borderRadius:12,marginBottom:8,overflow:"hidden"}}>
                  <div style={{padding:"12px 14px 10px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8}}>
                      <span style={{fontSize:15,fontWeight:800,color:"white"}}>🚢 {p.numContenedor}</span>
                      <span style={{fontSize:10,background:`${col}22`,color:col,borderRadius:6,padding:"3px 8px",fontWeight:700,border:`1px solid ${col}40`}}>{p.estado}</span>
                      <span style={{fontSize:10,background:"rgba(255,255,255,0.09)",color:"rgba(255,255,255,0.58)",borderRadius:6,padding:"3px 8px",fontWeight:600}}>
                        {p.turno==="Día"?"☀️":p.turno==="Noche"?"🌙":"🌗"} {p.turno}
                      </span>
                      <span style={{fontSize:10,color:"rgba(255,255,255,0.42)",marginLeft:"auto"}}>📅 {p.fecha}</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                      {[{l:"Proveedor Limón",v:parseProveedores(p.proveedor).join(", ")||"—"},{l:"Tipo de caja",v:p.producto||"—"},{l:"Cajas salida",v:p.cajasSalida||"0"}].map((d,j)=>(
                        <div key={j} style={{background:"rgba(255,255,255,0.06)",borderRadius:8,padding:"7px 10px"}}>
                          <div style={{fontSize:9,color:"rgba(255,255,255,0.42)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>{d.l}</div>
                          <div style={{fontSize:12,color:"white",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.v}</div>
                        </div>
                      ))}
                    </div>
                    {(p.grupoDia||p.grupoNoche) && (
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                        {p.grupoDia && <span style={{fontSize:10,background:"rgba(249,168,38,0.15)",border:"1px solid rgba(249,168,38,0.3)",color:"#F9A826",borderRadius:6,padding:"3px 8px"}}>☀️ {p.grupoDia}{gDia?` · ${gDia.miembros.length}👤`:""}</span>}
                        {p.grupoNoche && <span style={{fontSize:10,background:"rgba(132,94,247,0.15)",border:"1px solid rgba(132,94,247,0.3)",color:"#a78bfa",borderRadius:6,padding:"3px 8px"}}>🌙 {p.grupoNoche}{gNoche?` · ${gNoche.miembros.length}👤`:""}</span>}
                      </div>
                    )}
                    {(p.booking||p.naviera||p.destino) && (
                      <div style={{fontSize:11,color:"rgba(99,102,241,0.8)",marginBottom:3}}>
                        📋 {[p.booking&&`Booking: ${p.booking}`,p.naviera,p.destino&&`→ ${p.destino}`].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {p.operadores && <div style={{fontSize:11,color:"rgba(255,255,255,0.58)",marginBottom:3}}>🧑‍💼 {p.operadores}</div>}
                    {(p.transporte||p.placa||p.trailer) && <div style={{fontSize:11,color:"rgba(99,102,241,0.8)"}}>🚛 {[p.transporte,p.placa,p.trailer].filter(Boolean).join(" · ")}</div>}
                    {p.obs && <div style={{fontSize:11,color:"rgba(249,168,38,0.7)",marginTop:3}}>📌 {p.obs}</div>}
                  </div>
                  <div style={{borderTop:`1px solid ${col}20`,display:"flex"}}>
                    <button onClick={()=>{setForm({...formDef,...p});setEditIdx(p.id);setShowForm(true);}}
                      style={{flex:1,background:"rgba(255,255,255,0.06)",border:"none",padding:"10px",fontSize:13,color:"rgba(255,255,255,0.58)",cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                      ✏️ <span style={{fontSize:12}}>Editar</span>
                    </button>
                    <div style={{width:1,background:`${col}20`}} />
                    <button onClick={()=>{
                      const recs = contInsumos.filter(r=>r.contId===p.id);
                      const msg = recs.length > 0
                        ? `¿Eliminar ${p.numContenedor}? Se restaurarán los insumos de ${recs.length} registro(s) al inventario.`
                        : `¿Eliminar ${p.numContenedor}?`;
                      pedir(msg, () => {
                        if (recs.length > 0) {
                          const allItems = recs.flatMap(r=>r.items);
                          const lotes = invActual
                            .map(inv => {
                              const totalUsed = allItems.filter(x=>x.id===inv.id).reduce((s,x)=>s+x.cant,0);
                              return totalUsed > 0 ? { id: inv.id, newCant: inv.cant + totalUsed } : null;
                            })
                            .filter(Boolean);
                          if (lotes.length) ajustarLotes(lotes);
                        }
                        eliminarContenedor(p.id);
                      });
                    }}
                      style={{flex:1,background:"rgba(255,80,80,0.06)",border:"none",padding:"10px",fontSize:13,color:"rgba(255,100,100,0.6)",cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                      🗑 <span style={{fontSize:12}}>Eliminar</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={descargar} style={{width:"100%",background:"linear-gradient(135deg,#6366F1,#845EF7)",border:"none",borderRadius:10,padding:"10px",fontSize:13,color:"white",cursor:"pointer",fontWeight:700}}>
            📥 Descargar Informe de Contenedores
          </button>
        </div>
      )}

      {/* ═══ TAB 1: GRUPOS / TURNOS ═══ */}
      {tabCont === 1 && (() => {
        const empFilt = empleadosContReal.filter(e =>
          !busqGrupo || (e.nombre+e.num+e.area).toLowerCase().includes(busqGrupo.toLowerCase())
        );
        const guardarGrupo = () => {
          if (!formGrupo.nombre.trim()) { alert("⚠️ Escribe un nombre para el grupo"); return; }
          if (!formGrupo.miembros.length) { alert("⚠️ Selecciona al menos un miembro del equipo"); return; }
          guardarGrupoSB(formGrupo, editGrupoId);
          if (editGrupoId !== null) setEditGrupoId(null);
          setFormGrupo({nombre:"",turno:"Día",miembros:[]}); setShowFormGrupo(false); setBusqGrupoList("");
        };
        return (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.58)"}}>
                {grupos.length} grupo{grupos.length!==1?"s":""} registrado{grupos.length!==1?"s":""}
              </div>
              <button onClick={()=>{setShowFormGrupo(!showFormGrupo);setEditGrupoId(null);setFormGrupo({nombre:"",turno:"Día",miembros:[]});}}
                style={{background:"rgba(99,102,241,0.2)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:8,padding:"6px 12px",fontSize:11,color:"#6366F1",cursor:"pointer",fontWeight:700}}>
                {showFormGrupo?"✕ Cerrar":"➕ Nuevo grupo"}
              </button>
            </div>
            {showFormGrupo && (
              <div style={{background:"rgba(99,102,241,0.07)",border:"1px solid rgba(99,102,241,0.25)",borderRadius:12,padding:14,marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:700,color:"#6366F1",marginBottom:10}}>👥 {editGrupoId!==null?"Editar":"Crear"} grupo de trabajo</div>
                <div style={{display:"flex",gap:6,marginBottom:8}}>
                  <div style={{flex:2}}><div style={lbl}>Nombre del grupo *</div><input value={formGrupo.nombre} onChange={e=>setFormGrupo(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Equipo Alpha Día" style={inp} /></div>
                  <div style={{flex:1}}><div style={lbl}>Turno</div>
                    <CustomSelect value={formGrupo.turno} onChange={e=>setFormGrupo(f=>({...f,turno:e.target.value}))} style={inp}>
                      {["Día","Noche","Ambos"].map(t=><option key={t} style={{background:"#1a1a2e"}}>{t}</option>)}
                    </CustomSelect>
                  </div>
                </div>
                <div style={lbl}>Buscar empleado</div>
                <input value={busqGrupo} onChange={e=>setBusqGrupo(e.target.value)} placeholder="🔍 Nombre o cédula..." style={{...inp,marginBottom:8}} />
                <div style={{maxHeight:200,overflowY:"auto",display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:8}}>
                  {empFilt.map(e => {
                    const sel = formGrupo.miembros.includes(e.num);
                    return (
                      <div key={e.num} onClick={()=>toggleMiembro(e.num)}
                        style={{background:sel?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",border:`1px solid ${sel?"rgba(99,102,241,0.5)":"rgba(255,255,255,0.08)"}`,borderRadius:8,padding:"6px 9px",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:14}}>{sel?"✅":"⬜"}</span>
                        <div>
                          <div style={{fontSize:11,color:"white",fontWeight:sel?700:400}}>{e.nombre}</div>
                          <div style={{fontSize:9,color:"rgba(255,255,255,0.42)"}}>{e.area} · CC {e.num}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{fontSize:11,color:"rgba(99,102,241,0.7)",marginBottom:8}}>
                  {formGrupo.miembros.length} persona{formGrupo.miembros.length!==1?"s":""} seleccionada{formGrupo.miembros.length!==1?"s":""}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{if(!formGrupo.nombre.trim()){alert("⚠️ Escribe un nombre para el grupo");return;}if(!formGrupo.miembros.length){alert("⚠️ Selecciona al menos un miembro del equipo");return;}guardarGrupo();}}
                    style={{flex:1,background:"linear-gradient(135deg,#6366F1,#845EF7)",border:"none",borderRadius:8,padding:"9px",fontSize:12,color:"white",cursor:"pointer",fontWeight:700}}>
                    ✅ {editGrupoId!==null?"Guardar cambios":"Crear grupo"}
                  </button>
                  <button onClick={()=>{setShowFormGrupo(false);setBusqGrupoList("");}} style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.13)",borderRadius:8,padding:"9px 14px",fontSize:12,color:"rgba(255,255,255,0.48)",cursor:"pointer"}}>Cancelar</button>
                </div>
              </div>
            )}
            <input value={busqGrupoList} onChange={e=>setBusqGrupoList(e.target.value)} placeholder="🔍 Buscar grupo por nombre o turno..." style={{...inp,marginBottom:8}} />
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {grupos.length === 0 ? (
                <div style={{textAlign:"center",padding:"36px 0",color:"rgba(255,255,255,0.33)"}}>
                  <div style={{fontSize:36,marginBottom:10}}>👥</div>
                  <div style={{fontSize:13}}>Sin grupos — crea el primero con ➕ Nuevo grupo</div>
                </div>
              ) : grupos.filter(g=>!busqGrupoList||(g.nombre+g.turno).toLowerCase().includes(busqGrupoList.toLowerCase())).map(g => {
                const turnoCol = g.turno==="Día"?"#F9A826":g.turno==="Noche"?"#845EF7":"#6366F1";
                const miembrosInfo = g.miembros.map(num=>empleadosContReal.find(e=>e.num===num)).filter(Boolean);
                const contsAsig = procesos.filter(p=>p.grupoDia===g.nombre||p.grupoNoche===g.nombre);
                return (
                  <div key={g.id} style={{background:`${turnoCol}08`,border:`1px solid ${turnoCol}28`,borderRadius:12,padding:"12px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:14,fontWeight:800,color:"white"}}>{g.turno==="Día"?"☀️":g.turno==="Noche"?"🌙":"🌗"} {g.nombre}</span>
                      <span style={{fontSize:10,background:`${turnoCol}22`,color:turnoCol,borderRadius:6,padding:"3px 8px",fontWeight:700,border:`1px solid ${turnoCol}40`}}>{g.turno}</span>
                      <span style={{fontSize:10,color:"rgba(255,255,255,0.48)",marginLeft:"auto"}}>👤 {g.miembros.length} personas</span>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
                      {miembrosInfo.map(e=>(
                        <span key={e.num} style={{fontSize:10,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.13)",borderRadius:6,padding:"2px 7px",color:"rgba(255,255,255,0.78)"}}>{e.nombre}</span>
                      ))}
                    </div>
                    {contsAsig.length > 0 && (
                      <div style={{fontSize:10,color:"rgba(99,102,241,0.7)",marginBottom:6}}>
                        🚢 Asignado a: {contsAsig.map(c=>c.numContenedor).join(", ")}
                      </div>
                    )}
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>{setFormGrupo({nombre:g.nombre,turno:g.turno,miembros:[...g.miembros]});setEditGrupoId(g.id);setShowFormGrupo(true);}}
                        style={{fontSize:11,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.13)",borderRadius:6,padding:"5px 10px",color:"rgba(255,255,255,0.58)",cursor:"pointer"}}>
                        ✏️ Editar
                      </button>
                      <button onClick={()=>pedir(`¿Eliminar grupo "${g.nombre}"?`,()=>eliminarGrupoSB(g.id))}
                        style={{fontSize:11,background:"rgba(255,80,80,0.05)",border:"1px solid rgba(255,80,80,0.15)",borderRadius:6,padding:"5px 10px",color:"rgba(255,100,100,0.6)",cursor:"pointer"}}>
                        🗑 Eliminar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ═══ TAB 2: NÓMINA ═══ */}
      {tabCont === 2 && (() => {
        const VALOR = 180000;
        const procesosFilt = filtroMesNom ? procesos.filter(p=>p.fecha.startsWith(filtroMesNom)) : procesos;
        const totalGlobal = procesosFilt.reduce((sum,p)=>{
          const gD = grupos.find(g=>g.nombre===p.grupoDia);
          const gN = grupos.find(g=>g.nombre===p.grupoNoche);
          return sum + new Set([...(gD?gD.miembros:[]),...(gN?gN.miembros:[])]).size * VALOR;
        },0);
        return (
          <div>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:10}}>
              <input type="month" value={filtroMesNom} onChange={e=>setFiltroMesNom(e.target.value)} style={{...inp,flex:1}} placeholder="Filtrar por mes" />
              {filtroMesNom && <button onClick={()=>setFiltroMesNom("")} style={{background:"rgba(255,80,80,0.1)",border:"1px solid rgba(255,80,80,0.2)",borderRadius:8,padding:"6px 10px",fontSize:11,color:"#FF6B6B",cursor:"pointer"}}>✕ Todo</button>}
            </div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.48)",marginBottom:12}}>
              Pago por contenedor procesado: <span style={{color:"#00C9A7",fontWeight:700}}>{fmtCOP(VALOR)} COP / persona</span>
            </div>
            {procesosFilt.length === 0 ? (
              <div style={{textAlign:"center",padding:"36px 0",color:"rgba(255,255,255,0.33)"}}>
                <div style={{fontSize:36,marginBottom:10}}>💰</div>
                <div style={{fontSize:13}}>{procesos.length===0?"Registra contenedores y asigna grupos para ver la nómina":"Sin contenedores para el mes seleccionado"}</div>
              </div>
            ) : procesosFilt.map(p => {
              const gDia   = grupos.find(g=>g.nombre===p.grupoDia);
              const gNoche = grupos.find(g=>g.nombre===p.grupoNoche);
              const allNums = [...new Set([...(gDia?gDia.miembros:[]),...(gNoche?gNoche.miembros:[])])];
              const miembros = allNums.map(num=>empleadosContReal.find(e=>e.num===num)).filter(Boolean);
              const totalNom = miembros.length * VALOR;
              const col = COL_EST[p.estado] || "#6366F1";
              return (
                <div key={p.id} style={{background:`${col}06`,border:`1px solid ${col}20`,borderRadius:12,marginBottom:12,overflow:"hidden"}}>
                  <div style={{padding:"10px 14px",borderBottom:`1px solid ${col}20`,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontWeight:800,color:"white"}}>🚢 {p.numContenedor}</span>
                    <span style={{fontSize:10,color:"rgba(255,255,255,0.48)"}}>📅 {p.fecha}</span>
                    <span style={{fontSize:10,background:`${col}22`,color:col,borderRadius:6,padding:"2px 7px",fontWeight:700}}>{p.estado}</span>
                    {p.grupoDia && <span style={{fontSize:10,background:"rgba(249,168,38,0.15)",color:"#F9A826",borderRadius:6,padding:"2px 7px"}}>☀️ {p.grupoDia}</span>}
                    {p.grupoNoche && <span style={{fontSize:10,background:"rgba(132,94,247,0.15)",color:"#a78bfa",borderRadius:6,padding:"2px 7px"}}>🌙 {p.grupoNoche}</span>}
                    <span style={{marginLeft:"auto",fontSize:12,fontWeight:800,color:"#00C9A7"}}>💰 {fmtCOP(totalNom)}</span>
                  </div>
                  <div style={{padding:"8px 14px",borderBottom:expandidos[p.id]?`1px solid ${col}15`:"none"}}>
                    <button onClick={()=>toggleExpandido(p.id)}
                      style={{background:expandidos[p.id]?"rgba(132,94,247,0.12)":"rgba(255,255,255,0.04)",border:`1px solid ${expandidos[p.id]?"rgba(132,94,247,0.35)":"rgba(255,255,255,0.1)"}`,borderRadius:8,padding:"6px 12px",fontSize:11,color:expandidos[p.id]?"#845EF7":"rgba(255,255,255,0.45)",cursor:"pointer",fontWeight:600,width:"100%",textAlign:"left"}}>
                      {expandidos[p.id]?"▲ Ocultar personal":"👥 Ver Personal del contenedor"}{miembros.length>0?` (${miembros.length} persona${miembros.length!==1?"s":""})`:""}
                    </button>
                  </div>
                  {expandidos[p.id] && (
                    miembros.length === 0 ? (
                      <div style={{padding:"12px 14px",fontSize:11,color:"rgba(255,255,255,0.33)"}}>Sin grupo asignado — ve a Contenedores y asigna un grupo.</div>
                    ) : (
                      <div style={{padding:"10px 14px"}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                          {miembros.map(e=>(
                            <div key={e.num} style={{background:"rgba(255,255,255,0.05)",borderRadius:8,padding:"6px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <div>
                                <div style={{fontSize:11,color:"white",fontWeight:600}}>{e.nombre}</div>
                                <div style={{fontSize:9,color:"rgba(255,255,255,0.42)"}}>{e.area}</div>
                              </div>
                              <span style={{fontSize:11,color:"#00C9A7",fontWeight:700}}>{fmtCOP(VALOR)}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{marginTop:8,textAlign:"right",fontSize:12,color:"rgba(255,255,255,0.58)"}}>
                          {miembros.length} persona{miembros.length!==1?"s":""} · Total: <span style={{color:"#00C9A7",fontWeight:800}}>{fmtCOP(totalNom)}</span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              );
            })}
            {procesos.length > 0 && (
              <div style={{background:"rgba(0,201,167,0.08)",border:"1px solid rgba(0,201,167,0.25)",borderRadius:12,padding:"12px 16px",textAlign:"center"}}>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.58)",marginBottom:4}}>Total nómina acumulada por contenedores</div>
                <div style={{fontSize:20,fontWeight:800,color:"#00C9A7"}}>{fmtCOP(totalGlobal)}</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══ TAB 3: TRAZABILIDAD ═══ */}
      {tabCont === 3 && (() => {
        const contSel = selContTraz !== null ? procesos.find(p=>p.id===selContTraz) : null;
        const agregarEvento = () => {
          if (!contSel || !formTraz.evento) return;
          const ev = { ...formTraz, ts:new Date().toISOString(), id:Date.now() };
          agregarTrazabilidad(selContTraz, ev);
          setShowFormTraz(false); setFormTraz({evento:EVENTOS_TIPO[0],detalle:"",responsable:""});
        };
        const cambiarEstado = (nuevoEstado) => {
          if (!contSel) return;
          cambiarEstadoHook(selContTraz, nuevoEstado);
        };
        return (
          <div>
            <div style={{marginBottom:12}}>
              <div style={lbl}>Seleccionar contenedor</div>
              <CustomSelect value={selContTraz||""} onChange={e=>setSelContTraz(e.target.value?Number(e.target.value):null)} style={inp}>
                <option value="" style={{background:"#1a1a2e"}}>— Elige un contenedor —</option>
                {procesos.map(p=>(
                  <option key={p.id} value={p.id} style={{background:"#1a1a2e"}}>🚢 {p.numContenedor} · {p.fecha} · {p.estado}</option>
                ))}
              </CustomSelect>
            </div>
            {!contSel ? (
              <div style={{textAlign:"center",padding:"36px 0",color:"rgba(255,255,255,0.33)"}}>
                <div style={{fontSize:36,marginBottom:10}}>🗺</div>
                <div style={{fontSize:13}}>Selecciona un contenedor para ver su trazabilidad</div>
              </div>
            ) : (
              <div>
                <button onClick={()=>setSelContTraz(null)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.13)",borderRadius:8,padding:"6px 12px",fontSize:11,color:"rgba(255,255,255,0.6)",cursor:"pointer",marginBottom:10}}>
                  ← Volver
                </button>
                <div style={{background:"rgba(99,102,241,0.07)",border:"1px solid rgba(99,102,241,0.2)",borderRadius:12,padding:"12px 14px",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
                    <span style={{fontSize:15,fontWeight:800,color:"white"}}>🚢 {contSel.numContenedor}</span>
                    <span style={{fontSize:10,background:`${COL_EST[contSel.estado]||"#6366F1"}22`,color:COL_EST[contSel.estado]||"#6366F1",borderRadius:6,padding:"3px 8px",fontWeight:700,border:`1px solid ${COL_EST[contSel.estado]||"#6366F1"}40`}}>{contSel.estado}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:11}}>
                    {[["Fecha",contSel.fecha],["Producto",contSel.producto||"—"],["Cajas",contSel.cajasSalida||"0"],["Booking",contSel.booking||"—"],["Naviera",contSel.naviera||"—"],["Destino",contSel.destino||"—"]].map(([k,v],i)=>(
                      <div key={i}><span style={{color:"rgba(255,255,255,0.42)"}}>{k}: </span><span style={{color:"white",fontWeight:600}}>{v}</span></div>
                    ))}
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.42)",marginBottom:6}}>CAMBIO RÁPIDO DE ESTADO</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {ESTADOS_CONT.map(s=>(
                      <button key={s} onClick={()=>pedir(`¿Cambiar estado a "${s}"?`,()=>cambiarEstado(s))}
                        style={{background:contSel.estado===s?`${COL_EST[s]}25`:"rgba(255,255,255,0.04)",border:`1px solid ${contSel.estado===s?COL_EST[s]:"rgba(255,255,255,0.1)"}`,borderRadius:8,padding:"6px 12px",fontSize:11,color:contSel.estado===s?COL_EST[s]:"rgba(255,255,255,0.5)",cursor:"pointer",fontWeight:contSel.estado===s?700:400}}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={()=>setShowFormTraz(!showFormTraz)}
                  style={{width:"100%",background:"rgba(99,102,241,0.12)",border:"1px dashed rgba(99,102,241,0.4)",borderRadius:8,padding:"9px",fontSize:12,color:"#a5b4fc",cursor:"pointer",fontWeight:600,marginBottom:10}}>
                  {showFormTraz?"✕ Cancelar":"➕ Agregar evento de trazabilidad"}
                </button>
                {showFormTraz && (
                  <div style={{background:"rgba(99,102,241,0.06)",border:"1px solid rgba(99,102,241,0.2)",borderRadius:10,padding:12,marginBottom:12}}>
                    <div style={{display:"flex",flexDirection:"column",gap:7}}>
                      <div><div style={lbl}>Tipo de evento</div>
                        <CustomSelect value={formTraz.evento} onChange={e=>setFormTraz(f=>({...f,evento:e.target.value}))} style={inp}>
                          {EVENTOS_TIPO.map(ev=><option key={ev} value={ev} style={{background:"#1a1a2e"}}>{ev}</option>)}
                        </CustomSelect>
                      </div>
                      <div><div style={lbl}>Detalle</div><input value={formTraz.detalle} onChange={e=>setFormTraz(f=>({...f,detalle:e.target.value}))} placeholder="Descripción del evento..." style={inp} /></div>
                      <div><div style={lbl}>Responsable</div><input value={formTraz.responsable} onChange={e=>setFormTraz(f=>({...f,responsable:e.target.value}))} placeholder="Nombre del responsable..." style={inp} /></div>
                      <button onClick={()=>pedir("¿Registrar este evento?",agregarEvento)}
                        style={{background:"linear-gradient(135deg,#6366F1,#845EF7)",border:"none",borderRadius:8,padding:"9px",fontSize:12,color:"white",cursor:"pointer",fontWeight:700}}>
                        ✅ Registrar evento
                      </button>
                    </div>
                  </div>
                )}
                <div style={{fontSize:10,color:"rgba(255,255,255,0.42)",marginBottom:8}}>LÍNEA DE TRAZABILIDAD — {(contSel.trazabilidad||[]).length} evento{(contSel.trazabilidad||[]).length!==1?"s":""}</div>
                {(!contSel.trazabilidad||contSel.trazabilidad.length===0) ? (
                  <div style={{textAlign:"center",padding:"20px 0",color:"rgba(255,255,255,0.28)",fontSize:12}}>Sin eventos — agrega el primero con ➕</div>
                ) : (
                  <div style={{position:"relative",paddingLeft:24}}>
                    <div style={{position:"absolute",left:8,top:0,bottom:0,width:2,background:"rgba(99,102,241,0.2)"}} />
                    {[...(contSel.trazabilidad||[])].reverse().map((ev,i)=>{
                      const dt = new Date(ev.ts);
                      const fmt = `${dt.getDate().toString().padStart(2,"0")}/${(dt.getMonth()+1).toString().padStart(2,"0")} ${dt.getHours().toString().padStart(2,"0")}:${dt.getMinutes().toString().padStart(2,"0")}`;
                      return (
                        <div key={ev.id||i} style={{position:"relative",marginBottom:14}}>
                          <div style={{position:"absolute",left:-20,top:4,width:10,height:10,borderRadius:"50%",background:"#6366F1",border:"2px solid #1a1a2e",boxShadow:"0 0 6px #6366F180"}} />
                          <div style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.11)",borderRadius:10,padding:"9px 12px"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                              <span style={{fontSize:12,fontWeight:700,color:"white"}}>{ev.evento}</span>
                              <span style={{fontSize:10,color:"rgba(255,255,255,0.42)"}}>{fmt}</span>
                            </div>
                            {ev.detalle && <div style={{fontSize:11,color:"rgba(255,255,255,0.68)",marginBottom:2}}>{ev.detalle}</div>}
                            {ev.responsable && <div style={{fontSize:10,color:"rgba(99,102,241,0.7)"}}>👤 {ev.responsable}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══ TAB 4: CENTRO DE COSTOS ═══ */}
      {tabCont === 4 && (() => {
        const insumosCC = INVENTARIO_BASE
          .filter(i => INSUMOS_IDS_CONT.includes(i.id))
          .map(base => ({ ...base, cantActual: +parseFloat(((invActual.find(x=>x.id===base.id)||base).cant).toFixed(6)) }));

        const selCont     = selContCC !== null ? procesos.find(p=>p.id===selContCC) : null;
        const recsCont    = selCont ? contInsumos.filter(r=>r.contId===selCont.id) : [];
        const totalHist   = recsCont.reduce((s,r)=>s+r.total,0);
        const editingRec  = editingRecId ? contInsumos.find(r=>r.id===editingRecId) : null;

        const totalInsumosCC = insumosCC.reduce((s,ins)=>{
          return s + (parseFloat(formCC[ins.id]?.cant)||0) * (parseFloat(formCC[ins.id]?.costoUnit)||0);
        },0);
        const totalExtrasCC = formExtras.reduce((s,e)=>{
          return s + (parseFloat(e.cant)||0) * (parseFloat(e.costoUnit)||0);
        },0);
        const totalFormCC = totalInsumosCC + totalExtrasCC;

        const initForm = (plantilla = null) => {
          const f = {};
          insumosCC.forEach(ins=>{
            const t = plantilla?.items?.[ins.id];
            f[ins.id] = { cant: t ? t.cant : "", costoUnit: t ? t.costoUnit : ins.costo||0 };
          });
          return f;
        };

        const initExtras = (plantilla = null) =>
          plantilla?.extras ? plantilla.extras.map(e=>({...e}))
          : EXTRAS_BASE.map(e=>({...e, cant:""}));

        const cancelarEdicion = () => { setEditingRecId(null); setFormCC(initForm()); setFormExtras(initExtras()); };

        const guardarCC = () => {
          if (!selCont) return;
          const items = insumosCC
            .map(ins=>({ id:ins.id, nombre:ins.nombre, unidad:ins.unidad, cant:parseFloat(formCC[ins.id]?.cant)||0, costoUnit:parseFloat(formCC[ins.id]?.costoUnit)||0 }))
            .filter(x=>x.cant>0);
          const extras = formExtras
            .filter(e=>parseFloat(e.cant)>0 && String(e.nombre).trim())
            .map(e=>({ ...e, cant:parseFloat(e.cant)||0, costoUnit:parseFloat(e.costoUnit)||0 }));
          if (!items.length && !extras.length) return;
          const total = items.reduce((s,x)=>s+x.cant*x.costoUnit,0) + extras.reduce((s,e)=>s+e.cant*e.costoUnit,0);

          if (editingRec) {
            const lotes = invActual
              .filter(inv => {
                const oldCant = editingRec.items.find(x=>x.id===inv.id)?.cant || 0;
                const newCant = items.find(x=>x.id===inv.id)?.cant || 0;
                return (newCant - oldCant) !== 0;
              })
              .map(inv => {
                const oldCant = editingRec.items.find(x=>x.id===inv.id)?.cant || 0;
                const newCant = items.find(x=>x.id===inv.id)?.cant || 0;
                return { id: inv.id, newCant: +parseFloat(Math.max(0, inv.cant - (newCant - oldCant)).toFixed(6)) };
              });
            if (lotes.length) ajustarLotes(lotes);
          } else {
            const lotes = items
              .filter(x => x.cant > 0)
              .map(x => {
                const inv = invActual.find(i => i.id === x.id);
                return inv ? { id: x.id, newCant: +parseFloat(Math.max(0, inv.cant - x.cant).toFixed(6)) } : null;
              })
              .filter(Boolean);
            if (lotes.length) ajustarLotes(lotes);
          }
          guardarCCSB({ contId:selCont.id, contNum:selCont.numContenedor, items, extras, total, editId:editingRecId });
          setEditingRecId(null);
          setFormCC(initForm());
          setFormExtras(initExtras());
        };



        const generarInformeCC = async (cont, recsForCont, modo = "descargar") => {
          const logoSrc   = await cargarLogoBase64();
          const fechaHoy  = new Date().toLocaleDateString("es-CO");
          const fechaFile = new Date().toISOString().split("T")[0];
          const cop  = (v) => `$ ${Math.round(v).toLocaleString("es-CO")}`;
          const totalHist = recsForCont.reduce((s,r)=>s+r.total,0);

          // Consolidar por insumo
          const consolidado = {};
          recsForCont.forEach(rec => {
            rec.items.forEach(it => {
              if (!consolidado[it.id]) consolidado[it.id] = { nombre:it.nombre, unidad:it.unidad, cant:0, costoUnit:it.costoUnit, subtotal:0 };
              consolidado[it.id].cant     += it.cant;
              consolidado[it.id].subtotal += it.cant * it.costoUnit;
              consolidado[it.id].costoUnit = it.costoUnit;
            });
          });
          const filas     = Object.values(consolidado).sort((a,b)=>b.subtotal-a.subtotal);

          // Consolidar extras
          const extrasConsolidado = {};
          recsForCont.forEach(rec => {
            (rec.extras||[]).forEach(ex => {
              if (!extrasConsolidado[ex.nombre]) extrasConsolidado[ex.nombre] = { nombre:ex.nombre, unidad:ex.unidad, cant:0, costoUnit:ex.costoUnit, subtotal:0 };
              extrasConsolidado[ex.nombre].cant     += ex.cant;
              extrasConsolidado[ex.nombre].subtotal += ex.cant * ex.costoUnit;
            });
          });
          const extrasFilas = Object.values(extrasConsolidado).sort((a,b)=>b.subtotal-a.subtotal);

          const cajas     = parseInt(cont.cajasSalida)||0;
          const costoCaja = cajas>0 ? totalHist/cajas : 0;

          const barHtml = (pct) => `<div style="background:#e0e7ff;border-radius:3px;height:8px;width:100%;min-width:60px"><div style="background:#6366F1;border-radius:3px;height:8px;width:${Math.min(pct,100)}%"></div></div>`;

          const filaInsumo = (f) => {
            const pct = totalHist>0?((f.subtotal/totalHist)*100).toFixed(1):0;
            return `<tr>
              <td><b>${f.nombre}</b></td>
              <td style="text-align:right">${f.cant}</td>
              <td>${f.unidad}</td>
              <td style="text-align:right">$${f.costoUnit.toLocaleString("es-CO")}</td>
              <td style="text-align:right"><b>$${Math.round(f.subtotal).toLocaleString("es-CO")}</b></td>
              <td style="text-align:right;color:#6366F1;font-weight:700">${pct}%</td>
              <td style="min-width:80px">${barHtml(pct)}</td>
            </tr>`;
          };

          const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Centro de Costos · ${cont.numContenedor}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;padding:28px;color:#222;max-width:1050px;margin:0 auto;font-size:12px}
  h1{color:#6366F1;margin-bottom:2px;font-size:22px}
  h2{color:#6366F1;font-size:13px;font-weight:800;margin:22px 0 6px;border-bottom:2px solid #6366F130;padding-bottom:5px;text-transform:uppercase;letter-spacing:0.5px}
  .hdr-row{display:flex;align-items:center;gap:12px;margin-bottom:2px}
  .hdr-row img{width:44px;height:44px;object-fit:contain}
  .meta{font-size:11px;color:#888;margin-bottom:6px}
  .info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;background:#f7f7ff;border:1px solid #e0e7ff;border-radius:10px;padding:14px;margin-bottom:18px}
  .info-item .lbl{font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:0.5px}
  .info-item .val{font-size:12px;font-weight:700;color:#222;margin-top:2px}
  .cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
  .card{background:#f7f7ff;border:1px solid #e0e7ff;border-radius:10px;padding:12px 16px;min-width:130px;text-align:center}
  .card-val{font-size:20px;font-weight:800;color:#6366F1;line-height:1}
  .card-lbl{font-size:10px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:0.4px}
  .card.amber .card-val{color:#d97706} .card.green .card-val{color:#16a34a} .card.red .card-val{color:#dc2626}
  table{width:100%;border-collapse:collapse;margin-bottom:6px}
  th{background:#6366F1;color:white;padding:8px 10px;text-align:left;font-size:11px}
  td{padding:7px 10px;border-bottom:1px solid #eef0ff;vertical-align:middle}
  tr:nth-child(even) td{background:#fafbff}
  tr:hover td{background:#eff0ff}
  .tot-row td{background:#eff0ff!important;font-weight:700;border-top:2px solid #6366F140;font-size:13px}
  .ref-bar{background:#e0fdf4;border:1px solid #a7f3d0;border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:12px}
  .footer{text-align:center;color:#bbb;margin-top:28px;font-size:10px;border-top:1px solid #eee;padding-top:14px}
  @media print{.footer{position:fixed;bottom:0}}
</style></head><body>

<div class="hdr-row">${logoSrc ? `<img src="${logoSrc}"/>` : ""}<h1>🚢 Centro de Costos — ${cont.numContenedor}</h1></div>
<div class="meta">Informe generado: ${fechaHoy}</div>

<div class="info-grid">
  <div class="info-item"><div class="lbl">Estado</div><div class="val">${cont.estado||"—"}</div></div>
  <div class="info-item"><div class="lbl">Tipo de caja</div><div class="val">${cont.producto||"—"}</div></div>
  <div class="info-item"><div class="lbl">Cajas de salida</div><div class="val">${cont.cajasSalida||"—"}</div></div>
  <div class="info-item"><div class="lbl">Proveedor limón</div><div class="val">${parseProveedores(cont.proveedor).join(", ")||"—"}</div></div>
  <div class="info-item"><div class="lbl">Naviera</div><div class="val">${cont.naviera||"—"}</div></div>
  <div class="info-item"><div class="lbl">Destino</div><div class="val">${cont.destino||"—"}</div></div>
  <div class="info-item"><div class="lbl">Booking</div><div class="val">${cont.booking||"—"}</div></div>
  <div class="info-item"><div class="lbl">Supervisores</div><div class="val">${cont.operadores||"—"}</div></div>
  <div class="info-item"><div class="lbl">Transporte · Placa</div><div class="val">${[cont.transporte,cont.placa,cont.trailer].filter(Boolean).join(" · ")||"—"}</div></div>
  ${cont.obs?`<div class="info-item" style="grid-column:1/-1"><div class="lbl">Observaciones</div><div class="val">${cont.obs}</div></div>`:""}
</div>

<div class="cards">
  <div class="card"><div class="card-val">${filas.length}</div><div class="card-lbl">Insumos usados</div></div>
  <div class="card"><div class="card-val">${recsForCont.length}</div><div class="card-lbl">Registros</div></div>
  <div class="card amber"><div class="card-val">${cop(totalHist)}</div><div class="card-lbl">Costo total</div></div>
  ${cajas>0?`<div class="card green"><div class="card-val">${cop(costoCaja)}</div><div class="card-lbl">Costo / caja</div></div>`:""}
</div>

<h2>📦 Insumos consolidados — ${filas.length} ítems</h2>
<table><thead><tr><th>Insumo</th><th style="text-align:right">Cantidad</th><th>Unidad</th><th style="text-align:right">Costo / u</th><th style="text-align:right">Subtotal</th><th style="text-align:right">% del total</th><th>Participación</th></tr></thead>
<tbody>
${filas.map(filaInsumo).join("")}
<tr class="tot-row"><td colspan="4">SUBTOTAL INSUMOS</td><td style="text-align:right;color:#6366F1">${cop(filas.reduce((s,f)=>s+f.subtotal,0))}</td><td colspan="2"></td></tr>
</tbody></table>

${extrasFilas.length>0?`
<h2>💼 Otros costos (MO, varios, etc.)</h2>
<table><thead><tr><th>Concepto</th><th style="text-align:right">Cantidad</th><th>Unidad</th><th style="text-align:right">Costo / u</th><th style="text-align:right">Subtotal</th><th style="text-align:right">% del total</th><th>Participación</th></tr></thead>
<tbody>
${extrasFilas.map(ex=>{
  const pct = totalHist>0?((ex.subtotal/totalHist)*100).toFixed(1):0;
  return `<tr><td><b>${ex.nombre}</b></td><td style="text-align:right">${ex.cant}</td><td>${ex.unidad}</td><td style="text-align:right">$${ex.costoUnit.toLocaleString("es-CO")}</td><td style="text-align:right"><b>$${Math.round(ex.subtotal).toLocaleString("es-CO")}</b></td><td style="text-align:right;color:#6366F1;font-weight:700">${pct}%</td><td style="min-width:80px">${barHtml(pct)}</td></tr>`;
}).join("")}
<tr class="tot-row"><td colspan="4">SUBTOTAL OTROS COSTOS</td><td style="text-align:right;color:#d97706">$${Math.round(extrasFilas.reduce((s,e)=>s+e.subtotal,0)).toLocaleString("es-CO")}</td><td colspan="2"></td></tr>
</tbody></table>`:""}

<div style="background:#f0f0ff;border:1px solid #c7d2fe;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
  <span style="font-size:14px;font-weight:700;color:#4338ca">TOTAL GENERAL CONTENEDOR</span>
  <span style="font-size:20px;font-weight:800;color:#4338ca">$${Math.round(totalHist).toLocaleString("es-CO")}</span>
</div>

<div class="footer">Tierra Prometida Trading 🍋 · JARVIS · ${fechaHoy} — Documento de uso interno.</div>
</body></html>`;
          const _u5      = URL.createObjectURL(new Blob([html],{type:"text/html"}));
          const filename = `CentroCostos_${cont.numContenedor}_${fechaFile}.html`;
          if (modo === "previsualizar") { setPreviewRend({ url:_u5, filename }); return; }
          const a=document.createElement("a");a.href=_u5;a.download=filename;a.click();URL.revokeObjectURL(_u5);
        };

        // Contenedores que ya tienen registros CC
        const contsConCC = procesos.filter(p => contInsumos.some(r => r.contId === p.id));

        return (
          <div>

            {/* ── Resumen: contenedores con registros ── */}
            {contsConCC.length > 0 && (
              <div style={{marginBottom:14}}>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.38)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6,fontWeight:700}}>
                  📦 Contenedores con centro de costos ({contsConCC.length})
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {contsConCC.map(p => {
                    const recs     = contInsumos.filter(r => r.contId === p.id);
                    const total    = recs.reduce((s,r) => s + r.total, 0);
                    const expanded = !!expandidos[p.id];
                    return (
                      <div key={p.id} style={{border:"1px solid rgba(255,255,255,0.11)",borderRadius:10,overflow:"hidden"}}>
                        {/* Cabecera */}
                        <button onClick={() => toggleExpandido(p.id)}
                          style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:expanded?"rgba(99,102,241,0.12)":"rgba(255,255,255,0.03)",padding:"10px 14px",cursor:"pointer",textAlign:"left",width:"100%",border:"none"}}>
                          <div>
                            <div style={{fontSize:12,fontWeight:700,color:expanded?"#a5b4fc":"white"}}>🚢 {p.numContenedor}</div>
                            <div style={{fontSize:10,color:"rgba(255,255,255,0.42)",marginTop:2}}>{p.fecha} · {recs.length} registro{recs.length!==1?"s":""}</div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontSize:9,color:"rgba(255,255,255,0.38)"}}>TOTAL ACUMULADO</div>
                              <div style={{fontSize:13,fontWeight:800,color:"#00C9A7"}}>{fmtCOP(total)}</div>
                            </div>
                            <span style={{fontSize:11,color:"rgba(255,255,255,0.38)"}}>{expanded?"▲":"▼"}</span>
                          </div>
                        </button>

                        {/* Registros expandidos */}
                        {expanded && (
                          <div style={{padding:"8px 12px",background:"rgba(0,0,0,0.2)",display:"flex",flexDirection:"column",gap:6}}>
                            {recs.map(rec => (
                              <div key={rec.id} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:8,padding:"8px 10px"}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                                  <span style={{fontSize:10,color:"rgba(255,255,255,0.48)"}}>📅 {rec.fecha}</span>
                                  <span style={{fontSize:12,fontWeight:800,color:"#F9A826"}}>{fmtCOP(rec.total)}</span>
                                </div>
                                <div style={{fontSize:10,color:"rgba(255,255,255,0.42)",marginBottom:6}}>
                                  {rec.items.length} insumo{rec.items.length!==1?"s":""}{rec.extras?.length>0?` · ${rec.extras.length} extra${rec.extras.length!==1?"s":""}`:""}</div>
                                <div style={{display:"flex",gap:6}}>
                                  <button onClick={() => {
                                    const f = {};
                                    insumosCC.forEach(ins => {
                                      const item = rec.items.find(x => x.id === ins.id);
                                      f[ins.id] = { cant: item ? item.cant : "", costoUnit: item ? item.costoUnit : ins.costo||0 };
                                    });
                                    setFormCC(f);
                                    setFormExtras(rec.extras ? rec.extras.map(e=>({...e})) : initExtras());
                                    setEditingRecId(rec.id);
                                    setSelContCC(p.id);
                                    setPlantillaActiva(null);
                                  }} style={{flex:1,background:"rgba(249,168,38,0.1)",border:"1px solid rgba(249,168,38,0.25)",borderRadius:6,padding:"5px 0",fontSize:10,color:"#F9A826",cursor:"pointer",fontFamily:"inherit"}}>
                                    ✏️ Editar
                                  </button>
                                  <button onClick={() => pedir(
                                    "¿Eliminar este registro? Los insumos se restaurarán al inventario.",
                                    async () => {
                                      const lotes = invActual
                                        .map(inv => { const used = rec.items.find(x => x.id === inv.id); return used ? {id:inv.id, newCant: inv.cant + used.cant} : null; })
                                        .filter(Boolean);
                                      if (lotes.length) await ajustarLotes(lotes);
                                      const ok = await eliminarCC(rec.id);
                                      if (ok) {
                                        showToast("Registro eliminado ✓");
                                        if (editingRecId === rec.id) { setEditingRecId(null); setFormCC(initForm()); }
                                      } else {
                                        showToast("Error al eliminar", false);
                                      }
                                    }
                                  )} style={{flex:1,background:"rgba(255,80,80,0.07)",border:"1px solid rgba(255,80,80,0.18)",borderRadius:6,padding:"5px 0",fontSize:10,color:"rgba(255,110,110,0.7)",cursor:"pointer",fontFamily:"inherit"}}>
                                    🗑 Eliminar
                                  </button>
                                </div>
                              </div>
                            ))}
                            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                              <button onClick={() => generarInformeCC(p, recs, "previsualizar")} style={{flex:1,minWidth:90,background:"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:8,padding:"8px",fontSize:10,color:"#a5b4fc",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>
                                👁 Vista previa
                              </button>
                              <button onClick={() => generarInformeCC(p, recs)} style={{flex:1,background:"linear-gradient(135deg,#6366F1,#845EF7)",border:"none",borderRadius:8,padding:"8px",fontSize:10,color:"white",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>
                                📄 Informe
                              </button>
                              <button onClick={() => {
                                setSelContCC(p.id);
                                setEditingRecId(null);
                                setPlantillaActiva(null);
                                setFormCC(initForm());
                                setFormExtras(initExtras());
                              }} style={{flex:2,background:"rgba(99,102,241,0.1)",border:"1px dashed rgba(99,102,241,0.3)",borderRadius:8,padding:"7px",fontSize:10,color:"rgba(165,180,252,0.7)",cursor:"pointer",fontFamily:"inherit"}}>
                                ➕ Agregar nuevo registro
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selector contenedor */}
            <div style={{marginBottom:12}}>
              <div style={lbl}>Seleccionar contenedor</div>
              <CustomSelect value={selContCC||""} onChange={e=>{
                const id = parseInt(e.target.value)||null;
                setSelContCC(id);
                setEditingRecId(null);
                setPlantillaActiva(null);
                setFormCC(id ? initForm() : {});
                setFormExtras(id ? initExtras() : []);
              }} style={inp}>
                <option value="">— Seleccionar contenedor —</option>
                {procesos.map(p=><option key={p.id} value={p.id} style={{background:"#1a1a2e"}}>{p.numContenedor} · {p.fecha} · {p.estado}</option>)}
              </CustomSelect>
            </div>

            {procesos.length === 0 && (
              <div style={{textAlign:"center",padding:"30px 0",color:"rgba(255,255,255,0.33)",fontSize:12}}>
                Sin contenedores registrados — crea uno en la pestaña 🚢 primero.
              </div>
            )}

            {selCont && (
              <div>
                <button onClick={()=>{setSelContCC(null);setEditingRecId(null);setPlantillaActiva(null);setFormCC({});setFormExtras([]);}} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.13)",borderRadius:8,padding:"6px 12px",fontSize:11,color:"rgba(255,255,255,0.6)",cursor:"pointer",marginBottom:10}}>
                  ← Volver
                </button>
                {/* Header total */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(99,102,241,0.08)",border:"1px solid rgba(99,102,241,0.2)",borderRadius:10,padding:"10px 14px",marginBottom:10}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:"#a5b4fc"}}>🚢 {selCont.numContenedor}</div>
                    {selCont.producto && <div style={{fontSize:10,color:"rgba(255,255,255,0.48)",marginTop:2}}>{selCont.producto} · {selCont.cajasSalida||"?"} cajas</div>}
                  </div>
                  <div>
                    <div style={{fontSize:9,color:"rgba(255,255,255,0.42)",textAlign:"right"}}>COSTO TOTAL ACUMULADO</div>
                    <div style={{fontSize:16,fontWeight:800,color:"#00C9A7"}}>{fmtCOP(totalHist)}</div>
                  </div>
                </div>

                {/* Selector de plantillas */}
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.38)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:5}}>
                    Plantilla predeterminada
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {PLANTILLAS_CC.map(pl=>{
                      const icons = { princess_1400:"👑", princess_1600:"💎", del_monte_1400:"🌿" };
                      const gradients = {
                        princess_1400:"linear-gradient(135deg,#845EF7,#6366F1)",
                        princess_1600:"linear-gradient(135deg,#6366F1,#3b82f6)",
                        del_monte_1400:"linear-gradient(135deg,#00C9A7,#0EA5E9)",
                      };
                      const activa = plantillaActiva === pl.id;
                      return (
                        <button key={pl.id} onClick={()=>{ setFormCC(initForm(pl)); setFormExtras(initExtras(pl)); setEditingRecId(null); setPlantillaActiva(pl.id); }}
                          style={{
                            flex:1, minWidth:110, cursor:"pointer", textAlign:"center", position:"relative", overflow:"hidden",
                            borderRadius:12, padding:"10px 8px", transition:"all 0.2s",
                            background: activa ? gradients[pl.id] : `${pl.color}12`,
                            border: activa ? `2px solid ${pl.color}` : `1px solid ${pl.color}40`,
                            boxShadow: activa ? `0 0 16px ${pl.color}70, 0 4px 12px rgba(0,0,0,0.4)` : "none",
                            transform: activa ? "translateY(-3px) scale(1.03)" : "none",
                          }}>
                          {activa && <div style={{position:"absolute",top:5,right:6,fontSize:9,background:"rgba(255,255,255,0.25)",borderRadius:4,padding:"1px 5px",fontWeight:800,color:"white",letterSpacing:0.3}}>✓ ACTIVA</div>}
                          <div style={{position:"absolute",inset:0,background:gradients[pl.id],opacity:activa?0:0.07,borderRadius:12}} />
                          <div style={{fontSize:20,marginBottom:4}}>{icons[pl.id]}</div>
                          <div style={{fontSize:11,fontWeight:800,color:"white",lineHeight:1.2}}>
                            {pl.label.split("·")[0].trim()}
                          </div>
                          <div style={{fontSize:10,fontWeight:600,color:activa?"rgba(255,255,255,0.85)":pl.color,marginTop:1}}>
                            {pl.label.split("·")[1]?.trim()}
                          </div>
                          <div style={{marginTop:6,background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"3px 0"}}>
                            <div style={{fontSize:9,color:"rgba(255,255,255,0.58)",letterSpacing:0.3}}>REF. TOTAL</div>
                            <div style={{fontSize:11,fontWeight:700,color:activa?"#fff":"#F9A826"}}>{fmtCOP(pl.totalRef)}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Formulario insumos */}
                <div style={{background: editingRec?"rgba(249,168,38,0.05)":"rgba(255,255,255,0.03)", border:`1px solid ${editingRec?"rgba(249,168,38,0.25)":"rgba(255,255,255,0.08)"}`,borderRadius:12,padding:12,marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{fontSize:11,fontWeight:700,color:editingRec?"#F9A826":"rgba(99,102,241,0.8)"}}>
                      {editingRec ? `✏️ Editando registro del ${editingRec.fecha}` : "📦 Registrar insumos usados"}
                    </div>
                    {editingRec && (
                      <button onClick={cancelarEdicion} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:6,padding:"3px 10px",fontSize:10,color:"rgba(255,255,255,0.58)",cursor:"pointer"}}>
                        ✕ Cancelar
                      </button>
                    )}
                  </div>

                  {/* Cabecera tabla */}
                  <div style={{overflowX:mob?"auto":"visible"}}>
                  <div style={{minWidth:mob?400:"auto"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1.8fr 54px 72px 84px 72px",gap:4,marginBottom:4,padding:"0 4px"}}>
                    {["Insumo","Stock","Cantidad","$/Unidad","Subtotal"].map((h,i)=>(
                      <div key={i} style={{fontSize:9,color:"rgba(255,255,255,0.38)",textTransform:"uppercase",letterSpacing:0.5}}>{h}</div>
                    ))}
                  </div>

                  {insumosCC.map(ins=>{
                    const cant = parseFloat(formCC[ins.id]?.cant)||0;
                    const cu   = parseFloat(formCC[ins.id]?.costoUnit)||0;
                    const sub  = cant*cu;
                    const low  = ins.cantActual <= ins.minimo;
                    return (
                      <div key={ins.id} style={{display:"grid",gridTemplateColumns:"1.8fr 54px 72px 84px 72px",gap:4,alignItems:"center",marginBottom:5,padding:"4px",borderRadius:8,background:cant>0?"rgba(99,102,241,0.06)":"transparent"}}>
                        <div>
                          <div style={{fontSize:11,color:"white",fontWeight:600,lineHeight:1.2}}>{ins.nombre}</div>
                          <div style={{fontSize:9,color:"rgba(255,255,255,0.42)"}}>{ins.unidad}</div>
                        </div>
                        <div style={{fontSize:11,fontWeight:700,color:low?"#FF6B6B":"rgba(255,255,255,0.45)",textAlign:"center"}}>{ins.cantActual}</div>
                        <input type="number" min="0" step="any"
                          value={formCC[ins.id]?.cant||""}
                          onChange={e=>setFormCC(f=>({...f,[ins.id]:{...f[ins.id],cant:e.target.value}}))}
                          style={{...inp,padding:"5px 6px",fontSize:11,textAlign:"center"}}
                          placeholder="0"
                        />
                        <input type="number" min="0" step="any"
                          value={formCC[ins.id]?.costoUnit||""}
                          onChange={e=>setFormCC(f=>({...f,[ins.id]:{...f[ins.id],costoUnit:e.target.value}}))}
                          style={{...inp,padding:"5px 6px",fontSize:11,textAlign:"right"}}
                          placeholder="0"
                        />
                        <div style={{fontSize:11,fontWeight:700,color:sub>0?"#F9A826":"rgba(255,255,255,0.2)",textAlign:"right",paddingRight:2}}>
                          {sub>0?fmtCOP(sub):"—"}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                  </div>

                  {/* Otros costos */}
                  <div style={{borderTop:"1px solid rgba(255,255,255,0.09)",marginTop:8,paddingTop:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <div style={{fontSize:9,color:"rgba(255,255,255,0.48)",textTransform:"uppercase",letterSpacing:0.5,fontWeight:700}}>Otros costos (MO, varios, etc.)</div>
                      <button onClick={()=>setFormExtras(f=>[...f,{id:Date.now(),nombre:"",unidad:"global",cant:"",costoUnit:""}])}
                        style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:6,padding:"3px 10px",fontSize:10,color:"rgba(255,255,255,0.58)",cursor:"pointer"}}>
                        + Agregar concepto
                      </button>
                    </div>
                    <div style={{overflowX:mob?"auto":"visible"}}>
                    <div style={{minWidth:mob?400:"auto"}}>
                    <div style={{display:"grid",gridTemplateColumns:"1.8fr 72px 84px 72px 22px",gap:4,marginBottom:4,padding:"0 2px"}}>
                      {["Concepto","Cantidad","$/Unidad","Subtotal",""].map((h,i)=>(
                        <div key={i} style={{fontSize:9,color:"rgba(255,255,255,0.38)",textTransform:"uppercase",letterSpacing:0.5}}>{h}</div>
                      ))}
                    </div>
                    {formExtras.map((ex,i)=>{
                      const cant = parseFloat(ex.cant)||0;
                      const cu   = parseFloat(ex.costoUnit)||0;
                      const sub  = cant*cu;
                      return (
                        <div key={ex.id} style={{display:"grid",gridTemplateColumns:"1.8fr 72px 84px 72px 22px",gap:4,alignItems:"center",marginBottom:4,padding:"3px",borderRadius:7,background:sub>0?"rgba(249,168,38,0.05)":"transparent"}}>
                          <input value={ex.nombre}
                            onChange={e=>setFormExtras(f=>f.map((x,j)=>j===i?{...x,nombre:e.target.value}:x))}
                            style={{...inp,padding:"5px 6px",fontSize:11}} placeholder="Ej: MO Operarios..." />
                          <input type="number" value={ex.cant||""}
                            onChange={e=>setFormExtras(f=>f.map((x,j)=>j===i?{...x,cant:e.target.value}:x))}
                            style={{...inp,padding:"5px 6px",fontSize:11,textAlign:"center"}} placeholder="0" />
                          <input type="number" value={ex.costoUnit||""}
                            onChange={e=>setFormExtras(f=>f.map((x,j)=>j===i?{...x,costoUnit:e.target.value}:x))}
                            style={{...inp,padding:"5px 6px",fontSize:11,textAlign:"right"}} placeholder="0" />
                          <div style={{fontSize:11,fontWeight:700,color:sub>0?"#F9A826":"rgba(255,255,255,0.2)",textAlign:"right"}}>
                            {sub>0?fmtCOP(sub):"—"}
                          </div>
                          <button onClick={()=>setFormExtras(f=>f.filter((_,j)=>j!==i))}
                            style={{background:"rgba(255,60,60,0.1)",border:"none",borderRadius:4,padding:"3px 5px",fontSize:11,color:"rgba(255,100,100,0.5)",cursor:"pointer",lineHeight:1}}>×</button>
                        </div>
                      );
                    })}
                    </div>
                    </div>
                    {totalExtrasCC>0 && (
                      <div style={{display:"flex",justifyContent:"flex-end",fontSize:10,color:"rgba(255,255,255,0.42)",marginTop:4}}>
                        Subtotal otros costos: <span style={{color:"#F9A826",fontWeight:700,marginLeft:6}}>{fmtCOP(totalExtrasCC)}</span>
                      </div>
                    )}
                  </div>

                  {/* Total del registro */}
                  <div style={{borderTop:"1px solid rgba(99,102,241,0.2)",marginTop:8,paddingTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:11,color:"rgba(255,255,255,0.48)"}}>{editingRec?"Nuevo total":"Total este registro"}</span>
                    <span style={{fontSize:14,fontWeight:800,color:"#F9A826"}}>{fmtCOP(totalFormCC)}</span>
                  </div>

                  <button onClick={()=>pedir(editingRec?"¿Guardar cambios? El inventario se ajustará con la diferencia.":"¿Guardar insumos y descontar del inventario?",guardarCC)}
                    style={{width:"100%",background:editingRec?"linear-gradient(135deg,#F9A826,#f97316)":"linear-gradient(135deg,#6366F1,#845EF7)",border:"none",borderRadius:8,padding:"9px",fontSize:12,color:"white",cursor:"pointer",fontWeight:700,marginTop:10}}>
                    {editingRec ? "💾 Actualizar registro" : "✅ Guardar y descontar inventario"}
                  </button>
                </div>

                {/* Historial de registros */}
                {recsCont.length > 0 && (
                  <div>
                    <div style={{fontSize:9,color:"rgba(255,255,255,0.38)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>
                      Historial · {recsCont.length} registro{recsCont.length!==1?"s":""} · Total acumulado: {fmtCOP(totalHist)}
                    </div>
                    {recsCont.map(rec=>(
                      <div key={rec.id} style={{background: editingRecId===rec.id?"rgba(249,168,38,0.07)":"rgba(255,255,255,0.03)",border:`1px solid ${editingRecId===rec.id?"rgba(249,168,38,0.3)":"rgba(255,255,255,0.07)"}`,borderRadius:10,padding:"10px 12px",marginBottom:6}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                          <span style={{fontSize:10,color:"rgba(255,255,255,0.48)"}}>📅 {rec.fecha}</span>
                          <span style={{fontSize:12,fontWeight:800,color:"#F9A826"}}>{fmtCOP(rec.total)}</span>
                        </div>
                        {rec.items.map(it=>(
                          <div key={it.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"rgba(255,255,255,0.62)",marginBottom:2}}>
                            <span>{it.nombre} <span style={{color:"rgba(255,255,255,0.38)"}}>{it.cant} {it.unidad}</span></span>
                            <span style={{color:"white",fontWeight:600}}>{fmtCOP(it.cant*it.costoUnit)}</span>
                          </div>
                        ))}
                        {rec.extras?.length>0 && (
                          <div style={{borderTop:"1px solid rgba(255,255,255,0.08)",marginTop:4,paddingTop:4}}>
                            <div style={{fontSize:9,color:"rgba(255,255,255,0.33)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>Otros costos</div>
                            {rec.extras.map((ex,i)=>(
                              <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"rgba(255,200,100,0.6)",marginBottom:2}}>
                                <span>{ex.nombre} <span style={{color:"rgba(255,255,255,0.33)"}}>{ex.cant} {ex.unidad}</span></span>
                                <span style={{color:"#F9A826",fontWeight:600}}>{fmtCOP(ex.cant*ex.costoUnit)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{display:"flex",gap:6,marginTop:6}}>
                          <button onClick={()=>{
                            const f = {};
                            insumosCC.forEach(ins=>{ const item=rec.items.find(x=>x.id===ins.id); f[ins.id]={ cant: item?item.cant:"", costoUnit: item?item.costoUnit:ins.costo||0 }; });
                            setFormCC(f);
                            setFormExtras(rec.extras ? rec.extras.map(e=>({...e})) : initExtras());
                            setEditingRecId(rec.id);
                          }} style={{background:"rgba(249,168,38,0.1)",border:"1px solid rgba(249,168,38,0.25)",borderRadius:6,padding:"4px 10px",fontSize:10,color:"#F9A826",cursor:"pointer"}}>
                            ✏️ Editar
                          </button>
                          <button onClick={()=>pedir("¿Eliminar este registro? Los insumos se restaurarán al inventario.",()=>{
                            const lotes = invActual
                              .map(inv => { const used=rec.items.find(x=>x.id===inv.id); return used?{id:inv.id,newCant:inv.cant+used.cant}:null; })
                              .filter(Boolean);
                            if (lotes.length) ajustarLotes(lotes);
                            eliminarCC(rec.id);
                            if (editingRecId===rec.id) { setEditingRecId(null); setFormCC(initForm()); }
                          })} style={{background:"rgba(255,80,80,0.07)",border:"1px solid rgba(255,80,80,0.18)",borderRadius:6,padding:"4px 10px",fontSize:10,color:"rgba(255,110,110,0.6)",cursor:"pointer"}}>
                            🗑 Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Informe individual */}
                {recsCont.length > 0 && (
                  <div style={{display:"flex",gap:8,marginTop:8}}>
                    <button onClick={() => generarInformeCC(selCont, recsCont, "previsualizar")} style={{flex:1,background:"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:10,padding:"10px",fontSize:12,color:"#a5b4fc",cursor:"pointer",fontWeight:700}}>
                      👁 Vista previa
                    </button>
                    <button onClick={() => generarInformeCC(selCont, recsCont)} style={{flex:1,background:"linear-gradient(135deg,#6366F1,#845EF7)",border:"none",borderRadius:10,padding:"10px",fontSize:12,color:"white",cursor:"pointer",fontWeight:700}}>
                      📥 Descargar informe
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Informe general */}
            {contInsumos.length > 0 && (() => {
              const descargarGeneral = async () => {
                const logoSrc  = await cargarLogoBase64();
                const fechaHoy = new Date().toLocaleDateString("es-CO");
                // Agrupar por contenedor
                const porCont = {};
                contInsumos.forEach(rec => {
                  if (!porCont[rec.contId]) porCont[rec.contId] = { contNum:rec.contNum, registros:[], total:0 };
                  porCont[rec.contId].registros.push(rec);
                  porCont[rec.contId].total += rec.total;
                });
                const conts = Object.values(porCont).sort((a,b)=>b.total-a.total);
                const totalGeneral = conts.reduce((s,c)=>s+c.total,0);
                const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Centro de Costos General</title>
<style>
  body{font-family:Arial,sans-serif;padding:28px;color:#222;max-width:1000px;margin:0 auto}
  h1{color:#6366F1;margin-bottom:4px}h2{color:#6366F1;font-size:14px;margin:18px 0 6px}
  .hdr-row{display:flex;align-items:center;gap:12px;margin-bottom:2px}
  .hdr-row img{width:42px;height:42px;object-fit:contain}
  .meta{font-size:12px;color:#666;margin-bottom:18px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px}
  th{background:#6366F1;color:white;padding:8px 10px;text-align:left}
  td{padding:7px 10px;border-bottom:1px solid #eee}
  tr:nth-child(even) td{background:#f7f7ff}
  .total-row td{background:#f0f0ff;font-weight:700;font-size:13px}
  .resumen{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px}
  .card{background:#f7f7ff;border:1px solid #e0e0ff;border-radius:8px;padding:12px 16px;min-width:160px}
  .card-val{font-size:20px;font-weight:800;color:#6366F1}
  .card-lbl{font-size:11px;color:#888;margin-top:2px}
  details{margin-bottom:10px} summary{cursor:pointer;font-weight:700;padding:8px 10px;background:#f7f7ff;border-radius:6px;list-style:none;font-size:12px}
  .det-table{margin:6px 0 0 0;font-size:11px}
  .footer{text-align:center;color:#bbb;margin-top:24px;font-size:10px;border-top:1px solid #eee;padding-top:12px}
  .bar-wrap{background:#e0e0ff;border-radius:4px;height:10px;width:100%} .bar{background:#6366F1;border-radius:4px;height:10px}
</style></head><body>
<div class="hdr-row">${logoSrc ? `<img src="${logoSrc}"/>` : ""}<h1>📦 Centro de Costos General — Tierra Prometida</h1></div>
<div class="meta">Generado: ${fechaHoy} &nbsp;·&nbsp; ${conts.length} contenedor(es) con registros</div>
<div class="resumen">
  <div class="card"><div class="card-val">${conts.length}</div><div class="card-lbl">Contenedores</div></div>
  <div class="card"><div class="card-val">${contInsumos.length}</div><div class="card-lbl">Registros totales</div></div>
  <div class="card"><div class="card-val" style="color:#F9A826">${Math.round(totalGeneral).toLocaleString("es-CO")}</div><div class="card-lbl">Costo total ($COP)</div></div>
</div>
<h2>Resumen por contenedor</h2>
<table><thead><tr><th>Contenedor</th><th>Registros</th><th>Costo total</th><th>% del total</th><th style="width:150px">Participación</th></tr></thead><tbody>
${conts.map(c=>{const pct=totalGeneral>0?((c.total/totalGeneral)*100).toFixed(1):0;return`<tr><td><b>${c.contNum}</b></td><td style="text-align:center">${c.registros.length}</td><td style="text-align:right"><b>$${Math.round(c.total).toLocaleString("es-CO")}</b></td><td style="text-align:center">${pct}%</td><td><div class="bar-wrap"><div class="bar" style="width:${pct}%"></div></div></td></tr>`;}).join("")}
<tr class="total-row"><td>TOTAL GENERAL</td><td style="text-align:center">${contInsumos.length}</td><td style="text-align:right;color:#6366F1">$${Math.round(totalGeneral).toLocaleString("es-CO")}</td><td colspan="2"></td></tr>
</tbody></table>
<h2>Detalle por contenedor</h2>
${conts.map(c=>{
  const consolidado={};
  c.registros.forEach(rec=>{rec.items.forEach(it=>{if(!consolidado[it.id])consolidado[it.id]={nombre:it.nombre,unidad:it.unidad,cant:0,subtotal:0};consolidado[it.id].cant+=it.cant;consolidado[it.id].subtotal+=it.cant*it.costoUnit;});});
  const filas=Object.values(consolidado);
  return`<details><summary>🚢 ${c.contNum} &nbsp;—&nbsp; $${Math.round(c.total).toLocaleString("es-CO")} &nbsp;·&nbsp; ${c.registros.length} registro(s)</summary>
<table class="det-table"><thead><tr><th>Insumo</th><th>Unidad</th><th>Cantidad total</th><th>Subtotal</th></tr></thead><tbody>
${filas.map(f=>`<tr><td>${f.nombre}</td><td>${f.unidad}</td><td style="text-align:right">${f.cant}</td><td style="text-align:right"><b>$${Math.round(f.subtotal).toLocaleString("es-CO")}</b></td></tr>`).join("")}
<tr class="total-row"><td colspan="3">TOTAL ${c.contNum}</td><td style="text-align:right">$${Math.round(c.total).toLocaleString("es-CO")}</td></tr>
</tbody></table></details>`;}).join("")}
<div class="footer">Tierra Prometida Trading 🍋 · JARVIS · ${fechaHoy}</div>
</body></html>`;
                const _u6=URL.createObjectURL(new Blob([html],{type:"text/html"}));const a=document.createElement("a");a.href=_u6;a.download=`CentroCostos_General_${new Date().toISOString().split("T")[0]}.html`;a.click();URL.revokeObjectURL(_u6);
              };
              return (
                <button onClick={descargarGeneral} style={{width:"100%",background:"linear-gradient(135deg,#6366F1,#0EA5E9)",border:"none",borderRadius:10,padding:"10px",fontSize:12,color:"white",cursor:"pointer",fontWeight:700,marginTop:10}}>
                  🌐 Descargar informe general — todos los contenedores
                </button>
              );
            })()}
          </div>
        );
      })()}

      {/* ═══ TAB 6: PACKING LIST ═══ */}
      {tabCont === 6 && (() => {
        const COL_EST_PL = { "En proceso":"#F9A826","Completado":"#00C9A7","Pausado":"#845EF7","Cancelado":"#FF6B6B" };
        const FASE_BADGE = { 1:"📦 Fase 1", 2:"🚛 Fase 2", 3:"✅ Completo" };

        // Cargar estados PL cuando entramos al tab
        const handleTabPL = () => {
          if (!procesos.length) return;
          const ids = procesos.map(p => p.id);
          cargarPLTodos(ids).then(({ data }) => {
            const map = {};
            (data || []).forEach(r => { map[r.contenedor_id] = r.fase; });
            setPlStatuses(map);
          });
        };

        // Si hay contenedor activo, mostrar el PL
        if (plContenedorActivo) {
          const contenedorActivoLive = procesos.find(p => p.id === plContenedorActivo.id) || plContenedorActivo;
          return (
            <PackingListTab
              mob={mob}
              contenedor={contenedorActivoLive}
              onClose={() => { setPlContenedorActivo(null); handleTabPL(); }}
            />
          );
        }

        // Si no, mostrar el selector de contenedor
        return (
          <div>
            {/* Encabezado */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <div>
                <div style={{fontSize:mob?15:13,fontWeight:800,color:"white"}}>📋 Packing List</div>
                <div style={{fontSize:mob?11:9,color:"rgba(255,255,255,0.42)",marginTop:2}}>Selecciona un contenedor para crear o continuar su Packing List</div>
              </div>
              <button onClick={handleTabPL} style={{marginLeft:"auto",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.13)",borderRadius:8,padding:"6px 12px",fontSize:11,color:"rgba(255,255,255,0.58)",cursor:"pointer",fontFamily:"inherit"}}>
                🔄 Actualizar
              </button>
            </div>

            {procesos.length === 0 ? (
              <div style={{textAlign:"center",padding:"48px 0",color:"rgba(255,255,255,0.33)"}}>
                <div style={{fontSize:36,marginBottom:10}}>🚢</div>
                <div style={{fontSize:13}}>No hay contenedores registrados</div>
                <button onClick={()=>setTabCont(0)} style={{marginTop:14,background:"rgba(99,102,241,0.2)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:8,padding:"8px 18px",fontSize:12,color:"#a5b4fc",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>
                  ← Ir a Contenedores
                </button>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[...procesos].sort((a,b) => b.fecha.localeCompare(a.fecha)).map(p => {
                  const col   = COL_EST_PL[p.estado] || "#6366F1";
                  const fase  = plStatuses[p.id];
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPlContenedorActivo(p)}
                      style={{
                        width:"100%",textAlign:"left",
                        background:`${col}06`,
                        border:`1px solid ${col}25`,
                        borderRadius:12,padding:"12px 14px",cursor:"pointer",
                        fontFamily:"inherit",color:"white",
                        display:"flex",alignItems:"center",gap:12,
                        transition:"background 0.15s",
                      }}
                    >
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                          <span style={{fontSize:mob?14:13,fontWeight:800}}>🚢 {p.numContenedor}</span>
                          <span style={{fontSize:10,background:`${col}22`,color:col,borderRadius:6,padding:"2px 8px",fontWeight:700,border:`1px solid ${col}40`}}>{p.estado}</span>
                          {fase && (
                            <span style={{fontSize:10,background:"rgba(0,201,167,0.12)",color:"#00C9A7",borderRadius:6,padding:"2px 8px",fontWeight:700,border:"1px solid rgba(0,201,167,0.3)"}}>
                              {FASE_BADGE[fase]}
                            </span>
                          )}
                          <span style={{fontSize:10,color:"rgba(255,255,255,0.38)",marginLeft:"auto"}}>📅 {p.fecha}</span>
                        </div>
                        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                          {p.cajasSalida > 0 && <span style={{fontSize:mob?11:10,color:"rgba(255,255,255,0.52)"}}>📦 {Number(p.cajasSalida).toLocaleString("es-CO")} cajas</span>}
                          {p.transporte  && <span style={{fontSize:mob?11:10,color:"rgba(255,255,255,0.52)"}}>🚛 {p.transporte}</span>}
                          {p.placa       && <span style={{fontSize:mob?11:10,color:"rgba(255,255,255,0.52)"}}>🪧 {p.placa}</span>}
                          {p.destino     && <span style={{fontSize:mob?11:10,color:"rgba(99,102,241,0.8)"}}>→ {p.destino}</span>}
                        </div>
                      </div>
                      <div style={{fontSize:mob?22:18,color:"rgba(255,255,255,0.28)",flexShrink:0}}>›</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══ TAB 7: VERIFICACIÓN ═══ */}
      {tabCont === 7 && <PalletVerificationTab mob={mob} />}

      {/* ═══ TAB 5: RENDIMIENTOS ═══ */}
      {tabCont === 5 && (() => {
        const contSelRend = selContRend !== null ? procesos.find(p => p.id === selContRend) : null;
        const rendsDelCont = selContRend !== null ? rendimientos.filter(r => r.contId === selContRend) : [];

        // El rendimiento se calcula sobre el kilaje bruto procesado.
        // Devolución total = kilos rechazados (no pasó la prueba de
        // calidad) + kilos de primera devueltos (pasó la prueba pero se
        // devolvió por falta de espacio, no por calidad).
        const calcRend = (r) => {
          const kgDM  = r.cajasDelMonte * KG_DEL_MONTE;
          const kgPri = r.cajasPrincess * KG_PRINCESS;
          const kgEmp = kgDM + kgPri;
          const proc  = r.kilosProcesados;
          const rendGen = proc > 0 ? (kgEmp / proc) * 100 : 0;
          const rendDM  = proc > 0 ? (kgDM  / proc) * 100 : 0;
          const rendPri = proc > 0 ? (kgPri / proc) * 100 : 0;
          return { kgDM, kgPri, kgEmp, rendGen, rendDM, rendPri };
        };

        const totales = rendsDelCont.reduce((acc, r) => {
          const c = calcRend(r);
          return {
            kilosProcesados: acc.kilosProcesados + r.kilosProcesados,
            kilosRechazados: acc.kilosRechazados + (r.kilosRechazados || 0),
            kilosDevueltos:  acc.kilosDevueltos  + r.kilosDevueltos,
            kilosPrimeraDevueltos: acc.kilosPrimeraDevueltos + (r.kilosPrimeraDevueltos || 0),
            kgEmp:           acc.kgEmp           + c.kgEmp,
            cajasDelMonte:   acc.cajasDelMonte   + r.cajasDelMonte,
            cajasPrincess:   acc.cajasPrincess   + r.cajasPrincess,
          };
        }, { kilosProcesados: 0, kilosRechazados: 0, kilosDevueltos: 0, kilosPrimeraDevueltos: 0, kgEmp: 0, cajasDelMonte: 0, cajasPrincess: 0 });

        const rendGeneralTotal = totales.kilosProcesados > 0
          ? (totales.kgEmp / totales.kilosProcesados) * 100 : 0;
        const rendDMTotal  = totales.kilosProcesados > 0
          ? ((totales.cajasDelMonte * KG_DEL_MONTE) / totales.kilosProcesados) * 100 : 0;
        const rendPriTotal = totales.kilosProcesados > 0
          ? ((totales.cajasPrincess * KG_PRINCESS)  / totales.kilosProcesados) * 100 : 0;

        const colorRend = (pct) => pct >= 80 ? "#00C9A7" : pct >= 60 ? "#F9A826" : "#FF6B6B";

        const proveedoresCont = parseProveedores(contSelRend?.proveedor);

        // Estadísticas por proveedor
        const statsPorProveedor = proveedoresCont.map(pv => {
          const recs = rendsDelCont.filter(r => r.proveedor === pv);
          const kgProc = recs.reduce((s,r) => s + r.kilosProcesados, 0);
          const kgDev  = recs.reduce((s,r) => s + r.kilosDevueltos,  0);
          const kgDM   = recs.reduce((s,r) => s + r.cajasDelMonte * KG_DEL_MONTE, 0);
          const kgPri  = recs.reduce((s,r) => s + r.cajasPrincess * KG_PRINCESS,  0);
          const kgEmp  = kgDM + kgPri;
          const rdto   = kgProc > 0 ? (kgEmp / kgProc) * 100 : 0;
          const cajDM  = recs.reduce((s,r) => s + r.cajasDelMonte, 0);
          const cajPri = recs.reduce((s,r) => s + r.cajasPrincess, 0);
          return { pv, camiones: recs.length, kgProc, kgDev, kgEmp, rdto, cajDM, cajPri };
        });

        const generarInforme = async (modo = "descargar") => {
          const logoSrc = await cargarLogoBase64();
          const cont = contSelRend;
          const pvsTexto = proveedoresCont.join(", ") || "—";
          const fechaHoy = new Date().toLocaleDateString("es-CO", { day:"2-digit", month:"long", year:"numeric" });

          // ── Colores por rendimiento ────────────────────────────────
          const gColor = rendGeneralTotal >= 80 ? "#16a34a" : rendGeneralTotal >= 60 ? "#ca8a04" : "#dc2626";
          const gLabel = rendGeneralTotal >= 80 ? "Excelente" : rendGeneralTotal >= 60 ? "Regular" : "Bajo";

          // ── Medidor CSS (sin SVG) ──────────────────────────────────
          const gaugeBox = `
<div style="text-align:center;padding:22px 16px 18px;">
  <div style="font-size:9px;color:#6b7280;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">Rendimiento General</div>
  <div style="font-size:60px;font-weight:900;color:${gColor};line-height:1;margin-bottom:6px;font-family:'Segoe UI',Arial,sans-serif;">${rendGeneralTotal.toFixed(1)}<span style="font-size:30px;font-weight:700;">%</span></div>
  <div style="margin-bottom:20px;"></div>
  <div style="background:#f0f0f0;border-radius:999px;height:18px;margin:0 6px 5px;overflow:hidden;">
    <div style="height:100%;width:${Math.min(rendGeneralTotal,100).toFixed(2)}%;background:linear-gradient(90deg,#fbbf24 0%,#22c55e 65%,#16a34a 100%);border-radius:999px;"></div>
  </div>
  <div style="display:flex;justify-content:space-between;padding:0 6px;font-size:8px;color:#d1d5db;margin-bottom:16px;font-family:'Segoe UI',Arial,sans-serif;">
    <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
  </div>
  <div style="display:inline-block;padding:5px 20px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;background:${gColor}15;color:${gColor};border:1.5px solid ${gColor}60;font-family:'Segoe UI',Arial,sans-serif;">${gLabel}</div>
</div>`;

          // ── Mini barra para DM/Princesses ────────────────────────────
          const miniGauge = (pct, color, label) => `
<div style="padding:4px 0;">
  <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">${label}</div>
  <div style="font-size:20px;font-weight:800;color:${color};margin-bottom:6px;font-family:'Segoe UI',Arial,sans-serif;">${pct.toFixed(1)}%</div>
  <div style="background:#f0f0f0;border-radius:999px;height:8px;overflow:hidden;">
    <div style="height:100%;width:${Math.min(pct,100).toFixed(2)}%;background:${color};border-radius:999px;"></div>
  </div>
</div>`;

          // ── Info extra del contenedor ────────────────────────────────
          const infoItems = [
            cont.booking    ? `<span><b>Booking:</b> ${cont.booking}</span>`       : "",
            cont.naviera    ? `<span><b>Naviera:</b> ${cont.naviera}</span>`       : "",
            cont.destino    ? `<span><b>Destino:</b> ${cont.destino}</span>`       : "",
            cont.transporte ? `<span><b>Transporte:</b> ${cont.transporte}</span>` : "",
            cont.placa      ? `<span><b>Placa:</b> ${cont.placa}</span>`           : "",
            cont.turno      ? `<span><b>Turno:</b> ${cont.turno}</span>`           : "",
          ].filter(Boolean).join('<span style="color:#cbd5e1;margin:0 6px;">·</span>');

          // ── Split bar DM vs Princesses ─────────────────────────────────
          const totalCajas = totales.cajasDelMonte + totales.cajasPrincess;
          const pctDMc  = totalCajas > 0 ? (totales.cajasDelMonte / totalCajas * 100) : 50;
          const pctPric = 100 - pctDMc;

          // ── Tabla por proveedor ──────────────────────────────────────
          const providerSection = proveedoresCont.length > 1 ? `
<h2>🚚 Rendimiento por proveedor</h2>
<table>
  <thead><tr><th>Proveedor</th><th>Contenedores</th><th>Kg procesados</th><th>Kg devueltos</th><th>Kg empacados</th><th>Cajas</th><th>Rendimiento</th></tr></thead>
  <tbody>
  ${statsPorProveedor.map(s => {
    const sc = s.rdto >= 80 ? "#15803d" : s.rdto >= 60 ? "#b45309" : "#b91c1c";
    return `<tr>
      <td><span class="pv-badge">${s.pv}</span></td>
      <td>${s.camiones}</td>
      <td>${s.kgProc.toLocaleString("es-CO")} kg</td>
      <td style="color:#b45309;">${s.kgDev.toLocaleString("es-CO")} kg</td>
      <td style="color:#15803d;font-weight:600;">${s.kgEmp.toFixed(1)} kg</td>
      <td>${s.cajDM + s.cajPri} <span class="dim">(${s.cajDM} DM · ${s.cajPri} PRI)</span></td>
      <td><div class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="width:${Math.min(s.rdto,100).toFixed(1)}%;background:${sc};"></div></div><span style="font-weight:700;color:${sc};">${s.rdto.toFixed(1)}%</span></div></td>
    </tr>`;
  }).join("")}
  </tbody>
</table>` : "";

          // ── Gráfico de barras por camión ─────────────────────────────
          const truckBars = rendsDelCont.map((r, i) => {
            const c = calcRend(r);
            const rc = c.rendGen >= 80 ? "#15803d" : c.rendGen >= 60 ? "#b45309" : "#b91c1c";
            return `<div style="display:grid;grid-template-columns:140px 1fr 110px;gap:10px;align-items:center;padding:5px 0;border-bottom:1px solid #f8fafc;">
  <div>
    <span style="font-size:11px;font-weight:600;color:#374151;">Contenedor ${i+1}</span>
    ${r.proveedor ? `<span style="background:#ede9fe;color:#6d28d9;border-radius:10px;padding:1px 7px;font-size:9px;font-weight:700;margin-left:4px;">${r.proveedor}</span>` : ""}
    <div style="font-size:9px;color:#94a3b8;">${r.fecha}</div>
  </div>
  <div style="background:#f1f5f9;border-radius:5px;height:16px;overflow:hidden;position:relative;">
    <div style="background:${rc};width:${Math.min(c.rendGen,100).toFixed(1)}%;height:100%;border-radius:5px;opacity:0.85;"></div>
  </div>
  <div style="text-align:right;">
    <span style="font-size:10px;color:#64748b;">${r.kilosProcesados.toLocaleString("es-CO")} kg &nbsp;</span>
    <span style="font-size:13px;font-weight:700;color:${rc};">${c.rendGen.toFixed(1)}%</span>
  </div>
</div>`;
          }).join("");

          // ── Calibres agregados (todos los camiones) ──────────────────
          const calibreAgg = {};
          rendsDelCont.forEach(r => {
            (r.calibres || []).forEach(cal => {
              const calKg = cal.tipo === "cajas"
                ? cal.cantidad * (cal.marca === "Del Monte" ? KG_DEL_MONTE : KG_PRINCESS)
                : Number(cal.cantidad);
              if (!calibreAgg[cal.nombre]) calibreAgg[cal.nombre] = 0;
              calibreAgg[cal.nombre] += calKg;
            });
          });
          const calibreEntries = Object.entries(calibreAgg).sort(([a],[b]) => a.localeCompare(b));

          const calibreSection = calibreEntries.length > 0 ? `
<h2>🎨 Desglose por calibre</h2>
<div class="chart-wrap">
  <div class="calibre-note">ℹ️ Los dos porcentajes usan bases distintas: <b>% procesado</b> es sobre el total de kg procesados; <b>% empacado</b> es sobre el total de kg que <b>quedaron en caja</b>.</div>
  <div class="calibre-grid">
    ${calibreEntries.map(([nombre, kg]) => {
      const pctPro = totales.kilosProcesados > 0 ? (kg / totales.kilosProcesados) * 100 : 0;
      const pctEmp = totales.kgEmp > 0 ? (kg / totales.kgEmp) * 100 : 0;
      const cc = pctPro >= 80 ? "#15803d" : pctPro >= 60 ? "#b45309" : "#374151";
      return `
    <div class="calibre-card">
      <div class="calibre-head">
        <span class="calibre-name">${nombre}</span>
        <span class="calibre-kg">${kg.toFixed(1)} kg</span>
      </div>
      <div class="bar-cell">
        <div class="bar-bg" style="flex:1;width:auto;height:14px;" title="% sobre el total procesado"><div class="bar-fill" style="width:${Math.min(pctPro,100).toFixed(1)}%;background:${cc};"></div></div>
        <span style="font-weight:800;color:${cc};min-width:46px;text-align:right;flex-shrink:0;" title="% sobre el total procesado">${pctPro.toFixed(1)}%</span>
      </div>
      <div class="calibre-sub"><span title="% sobre el total de kg que entraron">% del total procesado (kg crudo)</span> &nbsp;·&nbsp; <b style="color:#6366f1;" title="% sobre el total de kg que quedaron empacados">${pctEmp.toFixed(1)}%</b> del total empacado (kg en caja)</div>
    </div>`;
    }).join("")}
  </div>
</div>` : "";

          // ── Tabla detalle con observaciones ─────────────────────────
          const truckRows = rendsDelCont.map((r, i) => {
            const c = calcRend(r);
            const rc = c.rendGen >= 80 ? "#15803d" : c.rendGen >= 60 ? "#b45309" : "#b91c1c";
            const obsChips = (r.observaciones || []).map(o => `<span class="obs-chip">${o}</span>`).join(" ");
            const obsDetalle = r.obsDetalle ? `<div style="margin-top:3px;font-style:italic;color:#64748b;font-size:10px;">${r.obsDetalle}</div>` : "";
            const obsCell = (obsChips || obsDetalle) ? `${obsChips}${obsDetalle}` : `<span class="dim">—</span>`;
            const calChips = (r.calibres || []).map(cal => {
              const calKg = cal.tipo === "cajas" ? cal.cantidad * (cal.marca === "Del Monte" ? KG_DEL_MONTE : KG_PRINCESS) : Number(cal.cantidad);
              const pct = r.kilosProcesados > 0 ? (calKg / r.kilosProcesados * 100).toFixed(1) : "0.0";
              return `<span style="background:#ede9fe;color:#4c1d95;border-radius:4px;padding:1px 7px;font-size:9px;font-weight:700;margin-right:3px;display:inline-block;">${cal.nombre}: ${pct}%</span>`;
            }).join("");
            const devDetalle = [
              r.kilosRechazados > 0 ? `rechazado: ${r.kilosRechazados.toLocaleString("es-CO")} kg` : "",
              r.kilosPrimeraDevueltos > 0 ? `de primera: ${r.kilosPrimeraDevueltos.toLocaleString("es-CO")} kg` : "",
            ].filter(Boolean).join(" · ");
            return `<tr>
  <td class="num-cell">${i+1}</td>
  <td>${r.fecha}</td>
  <td>${r.proveedor ? `<span class="pv-badge">${r.proveedor}</span>` : `<span class="dim">—</span>`}</td>
  <td>${r.kilosProcesados.toLocaleString("es-CO")} kg</td>
  <td style="color:#b45309;">${r.kilosDevueltos.toLocaleString("es-CO")} kg${devDetalle ? `<div style="font-size:9px;color:#94a3b8;font-weight:400;">${devDetalle}</div>` : ""}</td>
  <td style="color:#15803d;font-weight:600;">${c.kgEmp.toFixed(1)} kg</td>
  <td>${r.cajasDelMonte > 0 ? `<span class="tag-dm">${r.cajasDelMonte}</span>` : ""}${r.cajasPrincess > 0 ? `<span class="tag-pri">${r.cajasPrincess}</span>` : ""}</td>
  <td><div class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="width:${Math.min(c.rendGen,100).toFixed(1)}%;background:${rc};"></div></div><span style="font-weight:700;color:${rc};">${c.rendGen.toFixed(1)}%</span></div></td>
  <td>${calChips || `<span class="dim">—</span>`}</td>
  <td>${obsCell}</td>
</tr>`;
          }).join("");

          // ── HTML completo ────────────────────────────────────────────
          const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe de Rendimiento — ${cont.numContenedor}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; color:#111; background:#fff; font-size:13px; }
  .hdr { background:linear-gradient(120deg,#173d1a,#2d7a2d 60%,#3fa142); color:#fff; padding:30px 36px 26px; position:relative; overflow:hidden; }
  .hdr::after { content:"📊"; position:absolute; right:-10px; top:-22px; font-size:130px; opacity:0.12; transform:rotate(12deg); }
  .hdr h1 { font-size:26px; font-weight:800; letter-spacing:-.3px; margin-bottom:4px; position:relative; }
  .hdr .sub { font-size:11px; color:rgba(255,255,255,0.75); margin-top:4px; position:relative; }
  .hdr .badge { display:inline-block; background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.28); border-radius:20px; padding:3px 14px; font-size:10px; font-weight:700; letter-spacing:.5px; margin-bottom:10px; }
  .hdr-top { display:flex; justify-content:space-between; align-items:flex-start; position:relative; }
  .hdr-logo { width:112px; height:112px; object-fit:contain; background:#fff; border-radius:12px; padding:6px; flex-shrink:0; box-shadow:0 4px 14px rgba(0,0,0,0.25); }
  .hdr .pv-tag { display:inline-block; background:rgba(255,255,255,0.14); border:1px solid rgba(255,255,255,0.28); border-radius:20px; padding:3px 11px; font-size:10px; font-weight:600; margin-right:4px; position:relative; }
  .infobar { background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:11px 36px; font-size:11.5px; color:#475569; }
  .body { padding:32px 40px; }
  h2 { font-size:14px; font-weight:700; color:#14532d; margin:34px 0 16px; padding-bottom:8px; border-bottom:2px solid #bbf7d0; text-transform:uppercase; letter-spacing:.5px; }
  h2:first-of-type { margin-top:0; }
  .summary-row { display:grid; grid-template-columns:260px 1fr; gap:28px; margin-bottom:30px; align-items:start; }
  .gauge-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:22px 18px 16px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
  .gauge-sub { font-size:10px; color:#64748b; margin-top:6px; }
  .gauge-types { display:flex; justify-content:center; gap:20px; margin-top:12px; }
  .cards { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .card { border:1px solid #e2e8f0; border-left:3px solid #cbd5e1; border-radius:12px; padding:16px 18px; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
  .card .lbl { font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:.5px; margin-bottom:6px; }
  .card .val { font-size:23px; font-weight:800; color:#1e1b4b; }
  .card .sub2 { font-size:10px; color:#94a3b8; margin-top:4px; }
  .split-wrap { margin-bottom:30px; }
  .split-bar { display:flex; gap:2px; height:16px; border-radius:7px; overflow:hidden; margin-top:9px; background:#fff; }
  .split-bar > div { border-radius:3px; }
  .split-legend { display:flex; gap:20px; font-size:11.5px; }
  .split-dot { width:10px; height:10px; border-radius:2px; display:inline-block; margin-right:4px; vertical-align:middle; }
  table { width:100%; border-collapse:collapse; margin-bottom:8px; }
  th { background:#f1f5f9; text-align:left; padding:10px 14px; font-size:10px; color:#475569; font-weight:700; text-transform:uppercase; letter-spacing:.3px; }
  td { padding:11px 14px; border-bottom:1px solid #f8fafc; font-size:12px; vertical-align:top; }
  tbody tr:nth-child(even) td { background:#fafbfc; }
  tr:hover td { background:#f0fdf4; }
  .num-cell { color:#94a3b8; font-size:11px; font-weight:600; }
  .pv-badge { background:#f0fdf4; color:#15803d; border-radius:10px; padding:2px 8px; font-size:10px; font-weight:700; white-space:nowrap; border:1px solid #bbf7d0; }
  .tag-dm  { background:#dcfce7; color:#15803d; border-radius:4px; padding:1px 7px; font-size:10px; font-weight:700; margin-right:3px; display:inline-block; }
  .tag-pri { background:#fef9c3; color:#854d0e; border-radius:4px; padding:1px 7px; font-size:10px; font-weight:700; display:inline-block; }
  .obs-chip { background:#fef3c7; color:#92400e; border-radius:10px; padding:1px 8px; font-size:9px; font-weight:600; margin-right:3px; display:inline-block; margin-bottom:2px; }
  .dim { color:#cbd5e1; }
  .bar-cell { display:flex; align-items:center; gap:10px; }
  .bar-bg { background:#f1f5f9; border-radius:4px; height:10px; width:70px; overflow:hidden; flex-shrink:0; }
  .bar-fill { height:100%; border-radius:4px; }
  .chart-wrap { background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:22px 24px; margin-bottom:26px; }
  .calibre-note { font-size:10.5px; color:#64748b; background:#eef2f7; border:1px solid #dbe3ec; border-radius:8px; padding:9px 12px; margin-bottom:16px; line-height:1.5; }
  .calibre-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px 28px; }
  .calibre-card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px 18px; }
  .calibre-head { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px; }
  .calibre-name { font-size:16px; font-weight:800; color:#1e1b4b; }
  .calibre-kg { font-size:12px; font-weight:600; color:#15803d; }
  .calibre-sub { font-size:10px; color:#94a3b8; margin-top:8px; }
  .footer { margin-top:36px; padding:18px 36px; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:10px; display:flex; justify-content:space-between; background:#f8fafc; }
  @media print {
    .hdr { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    body { font-size:11.5px; }
    .body { padding:20px 28px; }
    .calibre-grid { grid-template-columns:1fr 1fr; }
  }
</style>
</head>
<body>

<div class="hdr">
  <div class="hdr-top">
    <div class="badge">📊 INFORME DE RENDIMIENTO</div>
    ${logoSrc ? `<img class="hdr-logo" src="${logoSrc}"/>` : ""}
  </div>
  <h1>${cont.numContenedor}</h1>
  <div style="margin-top:8px;">
    ${proveedoresCont.map(p => `<span class="pv-tag">${p}</span>`).join("")}
    ${cont.producto ? `<span class="pv-tag">${cont.producto}</span>` : ""}
    ${cont.estado   ? `<span class="pv-tag">${cont.estado}</span>`   : ""}
  </div>
  <div class="sub">Fecha contenedor: ${cont.fecha} &nbsp;·&nbsp; Generado: ${fechaHoy} &nbsp;·&nbsp; ${rendsDelCont.length} contenedor${rendsDelCont.length !== 1 ? "es" : ""} registrado${rendsDelCont.length !== 1 ? "s" : ""}</div>
</div>

${infoItems ? `<div class="infobar">${infoItems}</div>` : ""}

<div class="body">

<h2>📊 Resumen general</h2>
<div class="summary-row">
  <div class="gauge-box">
    ${gaugeBox}
    ${(totales.cajasDelMonte > 0 || totales.cajasPrincess > 0) ? `
    <div style="border-top:1px solid #f0f0f0;padding:14px 16px 6px;display:grid;grid-template-columns:${(totales.cajasDelMonte > 0 && totales.cajasPrincess > 0) ? "1fr 1fr" : "1fr"};gap:16px;">
      ${totales.cajasDelMonte > 0 ? miniGauge(rendDMTotal,  "#16a34a", "Del Monte") : ""}
      ${totales.cajasPrincess > 0 ? miniGauge(rendPriTotal, "#ca8a04", "Princesses") : ""}
    </div>` : ""}
  </div>
  <div class="cards">
    <div class="card" style="border-left-color:#6366f1;"><div class="lbl">Total cajas</div><div class="val">${totales.cajasDelMonte + totales.cajasPrincess}</div><div class="sub2">${[totales.cajasDelMonte > 0 ? `${totales.cajasDelMonte} Del Monte` : "", totales.cajasPrincess > 0 ? `${totales.cajasPrincess} Princesses` : ""].filter(Boolean).join(" · ")}</div></div>
    <div class="card" style="border-left-color:#94a3b8;"><div class="lbl">Kg procesados total</div><div class="val">${totales.kilosProcesados.toLocaleString("es-CO")}</div><div class="sub2">kg entrada</div></div>
    <div class="card" style="border-left-color:#15803d;"><div class="lbl">Kg empacados total</div><div class="val" style="color:#15803d;">${totales.kgEmp.toFixed(1)}</div><div class="sub2">kg salida</div></div>
    <div class="card" style="border-left-color:#b45309;"><div class="lbl">Devolución total</div><div class="val" style="color:#b45309;">${totales.kilosDevueltos.toLocaleString("es-CO")}</div><div class="sub2">rechazado + de primera</div></div>
    ${totales.kilosRechazados > 0 ? `<div class="card" style="border-left-color:#ea580c;"><div class="lbl">Kg rechazados</div><div class="val" style="color:#ea580c;">${totales.kilosRechazados.toLocaleString("es-CO")}</div><div class="sub2">no pasó la prueba de calidad</div></div>` : ""}
    ${totales.kilosPrimeraDevueltos > 0 ? `<div class="card" style="border-left-color:#94a3b8;"><div class="lbl">Kilos de limón de primera devueltos</div><div class="val">${totales.kilosPrimeraDevueltos.toLocaleString("es-CO")}</div><div class="sub2">procesados y aptos, devueltos por espacio</div></div>` : ""}
  </div>
</div>

${(totales.cajasDelMonte > 0 && totales.cajasPrincess > 0) ? `
<div class="split-wrap">
  <div class="split-legend">
    <span><span class="split-dot" style="background:#6366f1;"></span>Del Monte: <b>${totales.cajasDelMonte} cajas</b> (${pctDMc.toFixed(1)}%)</span>
    <span><span class="split-dot" style="background:#a855f7;"></span>Princesses: <b>${totales.cajasPrincess} cajas</b> (${pctPric.toFixed(1)}%)</span>
  </div>
  <div class="split-bar">
    <div style="background:#6366f1;width:${pctDMc.toFixed(1)}%;"></div>
    <div style="background:#a855f7;width:${pctPric.toFixed(1)}%;"></div>
  </div>
</div>` : ""}

${providerSection}

${calibreSection}

<h2>📈 Rendimiento del proceso</h2>
<div class="chart-wrap">
  ${truckBars}
</div>

<h2>📋 Detalle del contenedor</h2>
<table>
  <thead>
    <tr>
      <th>#</th><th>Fecha</th><th>Proveedor</th><th>Kg proc.</th><th>Devueltos</th>
      <th>Kg emp.</th><th>Cajas</th><th>Rdto.</th><th>Calibres</th><th>Observaciones</th>
    </tr>
  </thead>
  <tbody>${truckRows}</tbody>
</table>

</div>

<div class="footer">
  <span>🍋 Tierra Prometida Trading · JARVIS</span>
  <span>Informe generado el ${fechaHoy}</span>
</div>

</body></html>`;

          const blob     = new Blob([html], { type: "text/html;charset=utf-8" });
          const url      = URL.createObjectURL(blob);
          const filename = `Informe_Rendimiento_${cont.numContenedor}_${new Date().toISOString().split("T")[0]}.html`;

          if (modo === "previsualizar") {
            setPreviewRend({ url, filename });
            return;
          }

          const a    = document.createElement("a");
          a.href     = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        };

        const abrirFormRend = (r = null) => {
          if (r) {
            setFormRend({ contId: r.contId, contNum: r.contNum, fecha: r.fecha, proveedor: r.proveedor || "", kilosProcesados: r.kilosProcesados, kilosRechazados: r.kilosRechazados || "", kilosPrimeraDevueltos: r.kilosPrimeraDevueltos || "", cajasDelMonte: r.cajasDelMonte, cajasPrincess: r.cajasPrincess, observaciones: r.observaciones, obsDetalle: r.obsDetalle, calibres: r.calibres || [] });
            setEditRendId(r.id);
          } else {
            setFormRend({ ...rendFormDef, contId: selContRend, contNum: contSelRend?.numContenedor || "", fecha: hoy });
            setEditRendId(null);
          }
          setCalForm(calFormDef);
          setShowFormRend(true);
        };

        const guardarRend = async () => {
          if (!formRend.kilosProcesados) return;
          let formAGuardar = formRend;
          if (calForm.nombre.trim() && calForm.cantidad) {
            formAGuardar = { ...formRend, calibres: [...formRend.calibres, { ...calForm, cantidad: Number(calForm.cantidad) }] };
          }
          const ok = await guardarRendimientoSB(formAGuardar, editRendId);
          if (ok) {
            setShowFormRend(false); setFormRend(rendFormDef); setCalForm(calFormDef); setEditRendId(null);
            showToast("Camión registrado correctamente", true);
          } else {
            showToast("Error al guardar — verifica la conexión", false);
          }
        };

        const toggleObsRend = (obs) => setFormRend(f => ({
          ...f,
          observaciones: f.observaciones.includes(obs)
            ? f.observaciones.filter(o => o !== obs)
            : [...f.observaciones, obs],
        }));

        const card = (label, value, color = "white", sub = null) => (
          <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.48)", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
            {sub && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.42)", marginTop: 2 }}>{sub}</div>}
          </div>
        );

        return (
          <div>
            {/* Selector de contenedor */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.48)", marginBottom: 4 }}>Seleccionar contenedor</div>
              <CustomSelect value={selContRend ?? ""} onChange={e => { setSelContRend(e.target.value ? Number(e.target.value) : null); setShowFormRend(false); }}
                style={{ ...inp, maxWidth: 340 }}>
                <option value="">— Elige un contenedor —</option>
                {procesos.map(p => {
                  const provs = parseProveedores(p.proveedor).join(", ") || "sin proveedor";
                  return (
                    <option key={p.id} value={p.id}>{p.numContenedor} · {provs} · {p.fecha}</option>
                  );
                })}
              </CustomSelect>
            </div>

            {!contSelRend && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.33)", fontSize: 13 }}>
                Selecciona un contenedor para ver o registrar rendimientos
              </div>
            )}

            {contSelRend && (
              <div>
                <button onClick={() => setSelContRend(null)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.13)", borderRadius: 8, padding: "6px 12px", fontSize: 11, color: "rgba(255,255,255,0.6)", cursor: "pointer", marginBottom: 10 }}>
                  ← Volver
                </button>
                {/* Header contenedor */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#a5b4fc" }}>🚢 {contSelRend.numContenedor}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.48)", marginLeft: 10 }}>
                      {proveedoresCont.length > 0 ? proveedoresCont.join(" · ") : contSelRend.proveedor} · {contSelRend.producto}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {rendsDelCont.length > 0 && (
                      <>
                        <button onClick={() => generarInforme("previsualizar")} style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 8, padding: "7px 14px", fontSize: 11, color: "#a5b4fc", cursor: "pointer", fontWeight: 700 }}>
                          👁 Vista previa
                        </button>
                        <button onClick={() => generarInforme("descargar")} style={{ background: "rgba(132,94,247,0.15)", border: "1px solid rgba(132,94,247,0.35)", borderRadius: 8, padding: "7px 14px", fontSize: 11, color: "#845EF7", cursor: "pointer", fontWeight: 700 }}>
                          📄 Informe
                        </button>
                      </>
                    )}
                    <button onClick={() => abrirFormRend()} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 11, color: "white", cursor: "pointer", fontWeight: 700 }}>
                      + Registrar camión
                    </button>
                  </div>
                </div>

                {/* Tarjetas resumen (solo si hay registros) */}
                {rendsDelCont.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: mob ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
                    {card("Kg procesados", `${totales.kilosProcesados.toLocaleString("es-CO")} kg`)}
                    {card("Kg empacados", `${totales.kgEmp.toFixed(1)} kg`, "#00C9A7")}
                    {card("Devolución total", `${totales.kilosDevueltos.toLocaleString("es-CO")} kg`, "#F9A826", "rechazado + de primera")}
                    {totales.kilosRechazados > 0 && card("Kg rechazados", `${totales.kilosRechazados.toLocaleString("es-CO")} kg`, "#fb923c", "no pasó la prueba de calidad")}
                    {totales.kilosPrimeraDevueltos > 0 && card("Kilos de limón de primera devueltos", `${totales.kilosPrimeraDevueltos.toLocaleString("es-CO")} kg`, "white", "procesados y aptos, devueltos por espacio")}
                    {totales.cajasDelMonte > 0 && card("Rdto. Del Monte", `${rendDMTotal.toFixed(1)}%`, "#818CF8",
                      `${totales.cajasDelMonte} cajas · ${(totales.cajasDelMonte * KG_DEL_MONTE).toFixed(0)} kg`)}
                    {totales.cajasPrincess > 0 && card("Rdto. Princesses", `${rendPriTotal.toFixed(1)}%`, "#C084FC",
                      `${totales.cajasPrincess} cajas · ${(totales.cajasPrincess * KG_PRINCESS).toFixed(0)} kg`)}
                  </div>
                )}

                {/* Estadísticas por proveedor (solo si hay 2+ proveedores con datos) */}
                {rendsDelCont.length > 0 && proveedoresCont.length > 1 && statsPorProveedor.some(s => s.camiones > 0) && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.48)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Rendimiento por proveedor</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {statsPorProveedor.map(s => (
                        <div key={s.pv} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 9, padding: "10px 12px", display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "2fr 1fr 1fr 1fr 1fr", gap: 8, alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{s.pv}</div>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.42)", marginTop: 1 }}>{s.camiones} camión{s.camiones !== 1 ? "es" : ""}</div>
                          </div>
                          <div><div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)" }}>Kg procesados</div><div style={{ fontSize: 12, fontWeight: 700 }}>{s.kgProc.toLocaleString("es-CO")}</div></div>
                          <div><div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)" }}>Kg empacados</div><div style={{ fontSize: 12, fontWeight: 700, color: "#00C9A7" }}>{s.kgEmp.toFixed(0)}</div></div>
                          <div><div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)" }}>Cajas</div><div style={{ fontSize: 12, fontWeight: 700 }}>{s.cajDM + s.cajPri}</div></div>
                          <div><div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)" }}>Rendimiento</div><div style={{ fontSize: 14, fontWeight: 700, color: colorRend(s.rdto) }}>{s.rdto.toFixed(1)}%</div></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Formulario nuevo/editar registro */}
                {showFormRend && (
                  <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#a5b4fc", marginBottom: 10 }}>
                      {editRendId ? "✏️ Editar registro" : "🚛 Nuevo camión"}
                    </div>
                    {proveedoresCont.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={lbl}>Proveedor de este camión</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {proveedoresCont.map(pv => (
                            <button key={pv} onClick={() => setFormRend(f => ({ ...f, proveedor: f.proveedor === pv ? "" : pv }))}
                              style={{ background: formRend.proveedor === pv ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.05)", border: `1px solid ${formRend.proveedor === pv ? "rgba(99,102,241,0.6)" : "rgba(255,255,255,0.12)"}`, borderRadius: 20, padding: "5px 14px", fontSize: 11, color: formRend.proveedor === pv ? "#a5b4fc" : "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: formRend.proveedor === pv ? 700 : 400 }}>
                              {pv}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={lbl}>Fecha del camión</div>
                        <input type="date" value={formRend.fecha} onChange={e => setFormRend(f => ({ ...f, fecha: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <div style={lbl}>Kilos procesados (del camión)</div>
                        <input type="number" min="0" step="0.1" value={formRend.kilosProcesados} onChange={e => setFormRend(f => ({ ...f, kilosProcesados: e.target.value }))} placeholder="ej. 24000" style={inp} />
                      </div>
                      <div>
                        <div style={lbl}>Kilos rechazados <span style={{ color: "rgba(255,255,255,0.32)", fontWeight: 400 }}>(no pasó la prueba)</span></div>
                        <input type="number" min="0" step="0.1" value={formRend.kilosRechazados} onChange={e => setFormRend(f => ({ ...f, kilosRechazados: e.target.value }))} placeholder="ej. 200" style={inp} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={lbl}>Kilos de primera devueltos <span style={{ color: "rgba(255,255,255,0.32)", fontWeight: 400 }}>(pasó la prueba, se devuelve por falta de espacio)</span></div>
                      <input type="number" min="0" step="0.1" value={formRend.kilosPrimeraDevueltos} onChange={e => setFormRend(f => ({ ...f, kilosPrimeraDevueltos: e.target.value }))} placeholder="ej. 100 — limón apto para exportación devuelto por falta de espacio" style={inp} />
                    </div>
                    <div style={{ background: "rgba(249,168,38,0.08)", border: "1px solid rgba(249,168,38,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>Devolución total (rechazados + de primera)</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#F9A826" }}>{((Number(formRend.kilosRechazados) || 0) + (Number(formRend.kilosPrimeraDevueltos) || 0)).toLocaleString("es-CO")} kg</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={lbl}>Cajas Del Monte (16.8 kg)</div>
                        <input type="number" min="0" value={formRend.cajasDelMonte} onChange={e => setFormRend(f => ({ ...f, cajasDelMonte: e.target.value }))} placeholder="0" style={inp} />
                      </div>
                      <div>
                        <div style={lbl}>Cajas Princesses (15.7 kg)</div>
                        <input type="number" min="0" value={formRend.cajasPrincess} onChange={e => setFormRend(f => ({ ...f, cajasPrincess: e.target.value }))} placeholder="0" style={inp} />
                      </div>
                    </div>

                    {/* Preview en tiempo real — kg empacados + rdto % + rdto por calibre */}
                    {(() => {
                      const kgDM  = Number(formRend.cajasDelMonte || 0) * KG_DEL_MONTE;
                      const kgPri = Number(formRend.cajasPrincess || 0) * KG_PRINCESS;
                      const kgEmp = kgDM + kgPri;
                      const proc  = Number(formRend.kilosProcesados) || 0;
                      const hayKgEmp = kgEmp > 0;
                      const hayProc  = proc > 0 && hayKgEmp;
                      const rg   = hayProc ? ((kgEmp / proc) * 100).toFixed(1) : null;
                      const rdm  = hayProc ? ((kgDM  / proc) * 100).toFixed(1) : null;
                      const rpri = hayProc ? ((kgPri / proc) * 100).toFixed(1) : null;
                      if (!hayKgEmp) return null;
                      return (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : hayProc ? "1fr 1fr 1fr 1fr" : "1fr", gap: 8, marginBottom: 8 }}>
                            <div style={{ background: "rgba(0,201,167,0.08)", border: "1px solid rgba(0,201,167,0.2)", borderRadius: 8, padding: "7px 10px" }}>
                              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.48)" }}>Kg empacados</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: "#00C9A7" }}>{kgEmp.toFixed(1)} kg</div>
                              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.38)", marginTop: 1 }}>DM: {kgDM.toFixed(0)} kg · Pri: {kgPri.toFixed(0)} kg</div>
                            </div>
                            {hayProc && (
                              <>
                                <div style={{ background: `rgba(${Number(rg) >= 80 ? "0,201,167" : Number(rg) >= 60 ? "249,168,38" : "255,107,107"},0.08)`, border: `1px solid rgba(${Number(rg) >= 80 ? "0,201,167" : Number(rg) >= 60 ? "249,168,38" : "255,107,107"},0.2)`, borderRadius: 8, padding: "7px 10px" }}>
                                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.48)" }}>Rdto. general</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: colorRend(Number(rg)) }}>{rg}%</div>
                                </div>
                                <div style={{ background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.2)", borderRadius: 8, padding: "7px 10px" }}>
                                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.48)" }}>Rdto. Del Monte</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: "#818CF8" }}>{rdm}%</div>
                                </div>
                                <div style={{ background: "rgba(192,132,252,0.08)", border: "1px solid rgba(192,132,252,0.2)", borderRadius: 8, padding: "7px 10px" }}>
                                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.48)" }}>Rdto. Princesses</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: "#C084FC" }}>{rpri}%</div>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Rendimiento por calibre en tiempo real */}
                          {hayProc && formRend.calibres.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(129,140,248,0.8)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>📐 Rdto. por calibre</div>
                              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : `repeat(${Math.min(formRend.calibres.length, 4)}, 1fr)`, gap: 6 }}>
                                {formRend.calibres.map((cal, i) => {
                                  const calKg  = cal.tipo === "cajas" ? cal.cantidad * (cal.marca === "Del Monte" ? KG_DEL_MONTE : KG_PRINCESS) : Number(cal.cantidad);
                                  const pctPro = proc > 0 ? (calKg / proc) * 100 : 0;
                                  const pctEmp = kgEmp > 0 ? (calKg / kgEmp) * 100 : 0;
                                  return (
                                    <div key={i} style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 8, padding: "6px 10px" }}>
                                      <div style={{ fontSize: 13, fontWeight: 800, color: "#a5b4fc", marginBottom: 2 }}>{cal.nombre}</div>
                                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.42)" }}>{calKg.toFixed(0)} kg</div>
                                      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                                        <div>
                                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.38)" }}>% procesado</div>
                                          <div style={{ fontSize: 12, fontWeight: 700, color: colorRend(pctPro) }}>{pctPro.toFixed(1)}%</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.38)" }}>% empacado</div>
                                          <div style={{ fontSize: 12, fontWeight: 700, color: "#818CF8" }}>{pctEmp.toFixed(1)}%</div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {/* Observaciones tipo chips */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={lbl}>Estado del limón (selecciona los que aplican)</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                        {OBS_OPCIONES.map(o => {
                          const activo = formRend.observaciones.includes(o);
                          return (
                            <button key={o} onClick={() => toggleObsRend(o)}
                              style={{ background: activo ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)", border: `1px solid ${activo ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: 20, padding: "4px 10px", fontSize: 10, color: activo ? "#fca5a5" : "rgba(255,255,255,0.5)", cursor: "pointer" }}>
                              {o}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <div style={lbl}>Observaciones adicionales</div>
                      <textarea value={formRend.obsDetalle} onChange={e => setFormRend(f => ({ ...f, obsDetalle: e.target.value }))} rows={2} placeholder="Ej: El limón venía muy mojado, tuvimos que limpiar la máquina a mitad del proceso..." style={{ ...inp, resize: "vertical" }} />
                    </div>

                    {/* ── Calibres (opcional) ── */}
                    <div style={{ marginBottom: 12, background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(129,140,248,0.9)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                        📐 Desglose por calibre <span style={{ color: "rgba(255,255,255,0.38)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
                      </div>

                      {/* Calibres ya agregados */}
                      {formRend.calibres.length > 0 && (
                        <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                          {formRend.calibres.map((c, i) => {
                            const kg = c.tipo === "cajas" ? c.cantidad * (c.marca === "Del Monte" ? KG_DEL_MONTE : KG_PRINCESS) : Number(c.cantidad);
                            return (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "5px 8px" }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#a5b4fc", minWidth: 40 }}>{c.nombre}</span>
                                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.58)", flex: 1 }}>
                                  {c.tipo === "cajas" ? `${c.cantidad} cajas ${c.marca}` : `${c.cantidad} kg`} → <strong style={{ color: "#00C9A7" }}>{kg.toFixed(1)} kg</strong>
                                </span>
                                <button onClick={() => setFormRend(f => ({ ...f, calibres: f.calibres.filter((_, j) => j !== i) }))}
                                  style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}>×</button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Mini-formulario para agregar calibre */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-end" }}>
                        <div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.42)", marginBottom: 3 }}>Calibre</div>
                          <input type="text" value={calForm.nombre} onChange={e => setCalForm(f => ({ ...f, nombre: e.target.value.toUpperCase() }))}
                            placeholder="C48" style={{ ...inp, width: 56, textAlign: "center", fontWeight: 700 }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.42)", marginBottom: 3 }}>Tipo</div>
                          <div style={{ display: "flex", gap: 4 }}>
                            {["cajas", "kg"].map(t => (
                              <button key={t} onClick={() => setCalForm(f => ({ ...f, tipo: t }))}
                                style={{ background: calForm.tipo === t ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.05)", border: `1px solid ${calForm.tipo === t ? "rgba(99,102,241,0.6)" : "rgba(255,255,255,0.1)"}`, borderRadius: 6, padding: "4px 10px", fontSize: 10, color: calForm.tipo === t ? "#a5b4fc" : "rgba(255,255,255,0.45)", cursor: "pointer", fontWeight: calForm.tipo === t ? 700 : 400 }}>
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.42)", marginBottom: 3 }}>Cantidad</div>
                          <input type="number" min="0" value={calForm.cantidad} onChange={e => setCalForm(f => ({ ...f, cantidad: e.target.value }))}
                            placeholder={calForm.tipo === "cajas" ? "ej. 300" : "ej. 4800"} style={{ ...inp, width: 90 }} />
                        </div>
                        {calForm.tipo === "cajas" && (
                          <div>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.42)", marginBottom: 3 }}>Marca</div>
                            <CustomSelect value={calForm.marca} onChange={e => setCalForm(f => ({ ...f, marca: e.target.value }))} style={{ ...inp }}>
                              <option>Del Monte</option>
                              <option>Princesses</option>
                            </CustomSelect>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            if (!calForm.nombre.trim() || !calForm.cantidad) return;
                            setFormRend(f => ({ ...f, calibres: [...f.calibres, { ...calForm, cantidad: Number(calForm.cantidad) }] }));
                            setCalForm(calFormDef);
                          }}
                          style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 7, padding: "6px 14px", fontSize: 11, color: "#a5b4fc", cursor: "pointer", fontWeight: 700 }}>
                          + Agregar
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={guardarRend} style={{ flex: 1, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", border: "none", borderRadius: 8, padding: "8px", fontSize: 11, color: "white", cursor: "pointer", fontWeight: 700 }}>
                        {editRendId ? "Guardar cambios" : "Registrar camión"}
                      </button>
                      <button onClick={() => { setShowFormRend(false); setEditRendId(null); setFormRend(rendFormDef); }} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.13)", borderRadius: 8, padding: "8px 14px", fontSize: 11, color: "rgba(255,255,255,0.68)", cursor: "pointer" }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista de registros */}
                {rendsDelCont.length === 0 && !showFormRend && (
                  <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(255,255,255,0.33)", fontSize: 12 }}>
                    Sin registros de rendimiento para este contenedor. Presiona "+ Registrar camión" para comenzar.
                  </div>
                )}

                {rendsDelCont.map((r, idx) => {
                  const c = calcRend(r);
                  return (
                    <div key={r.id} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: 12, marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 6 }}>
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "white" }}>🚛 Camión {idx + 1}</span>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.48)", marginLeft: 8 }}>{r.fecha}</span>
                          {r.proveedor && <span style={{ fontSize: 9, background: "rgba(99,102,241,0.18)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 10, padding: "1px 8px", color: "#a5b4fc", marginLeft: 6 }}>{r.proveedor}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => abrirFormRend(r)} style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 6, padding: "3px 8px", fontSize: 10, color: "#a5b4fc", cursor: "pointer" }}>✏️</button>
                          <button onClick={() => pedir("¿Eliminar este registro de rendimiento?", async () => { const ok = await eliminarRendimientoSB(r.id); showToast(ok ? "Camión eliminado ✓" : "Error al eliminar", ok); })}
                            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "3px 8px", fontSize: 10, color: "#fca5a5", cursor: "pointer" }}>🗑</button>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: mob ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: 6, marginTop: 8 }}>
                        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "6px 8px" }}>
                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)" }}>Kg procesados</div>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{r.kilosProcesados.toLocaleString("es-CO")} kg</div>
                        </div>
                        {r.kilosRechazados > 0 && (
                          <div style={{ background: "rgba(251,146,60,0.08)", borderRadius: 7, padding: "6px 8px" }}>
                            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)" }}>Rechazados</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#fb923c" }}>{r.kilosRechazados.toLocaleString("es-CO")} kg</div>
                          </div>
                        )}
                        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "6px 8px" }}>
                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)" }}>Kg empacados</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#00C9A7" }}>{c.kgEmp.toFixed(1)} kg</div>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "6px 8px" }}>
                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)" }}>Devueltos</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#F9A826" }}>{r.kilosDevueltos.toLocaleString("es-CO")} kg</div>
                        </div>
                        {r.kilosPrimeraDevueltos > 0 && (
                          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "6px 8px" }}>
                            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)" }}>Limón de primera devuelto</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>{r.kilosPrimeraDevueltos.toLocaleString("es-CO")} kg</div>
                          </div>
                        )}
                        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "6px 8px" }}>
                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)" }}>Rdto. general</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: colorRend(c.rendGen) }}>{c.rendGen.toFixed(1)}%</div>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "6px 8px" }}>
                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)" }}>Del Monte ({r.cajasDelMonte} cajas)</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#818CF8" }}>{c.rendDM.toFixed(1)}%</div>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "6px 8px" }}>
                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)" }}>Princesses ({r.cajasPrincess} cajas)</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#C084FC" }}>{c.rendPri.toFixed(1)}%</div>
                        </div>
                      </div>

                      {(r.observaciones.length > 0 || r.obsDetalle) && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.09)" }}>
                          {r.observaciones.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: r.obsDetalle ? 4 : 0 }}>
                              {r.observaciones.map(o => (
                                <span key={o} style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "2px 8px", fontSize: 9, color: "#fca5a5" }}>{o}</span>
                              ))}
                            </div>
                          )}
                          {r.obsDetalle && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.52)", fontStyle: "italic" }}>{r.obsDetalle}</div>}
                        </div>
                      )}

                      {/* Desglose por calibre */}
                      {r.calibres && r.calibres.length > 0 && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(99,102,241,0.15)" }}>
                          <div style={{ fontSize: 9, color: "rgba(129,140,248,0.7)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>📐 Calibres</div>
                          <div style={{ display: "grid", gridTemplateColumns: mob ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 4 }}>
                            {r.calibres.map((cal, i) => {
                              const calKg  = cal.tipo === "cajas" ? cal.cantidad * (cal.marca === "Del Monte" ? KG_DEL_MONTE : KG_PRINCESS) : Number(cal.cantidad);
                              const pctPro = r.kilosProcesados > 0 ? (calKg / r.kilosProcesados) * 100 : 0;
                              const pctEmp = c.kgEmp > 0 ? (calKg / c.kgEmp) * 100 : 0;
                              return (
                                <div key={i} style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.14)", borderRadius: 7, padding: "5px 8px" }}>
                                  <div style={{ fontSize: 11, fontWeight: 800, color: "#a5b4fc" }}>{cal.nombre}</div>
                                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.48)", marginTop: 1 }}>
                                    {cal.tipo === "cajas" ? `${cal.cantidad} cajas · ${calKg.toFixed(0)} kg` : `${calKg.toFixed(0)} kg`}
                                  </div>
                                  <div style={{ marginTop: 3, display: "flex", gap: 8 }}>
                                    <div>
                                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.38)" }}>% procesado</div>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: colorRend(pctPro) }}>{pctPro.toFixed(1)}%</div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.38)" }}>% empacado</div>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: "#818CF8" }}>{pctEmp.toFixed(1)}%</div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── MÓDULO DOCUMENTOS DE EXPORTACIÓN ────────────────────────
function DocumentosDemo() {
  const mob = useM();
  const hoy = new Date();
  const p2  = (n) => String(n).padStart(2,"0");
  const hoyStr  = `${hoy.getFullYear()}-${p2(hoy.getMonth()+1)}-${p2(hoy.getDate())}`;
  const venc    = new Date(hoy.getTime() + 30*24*60*60*1000);
  const vencStr = `${venc.getFullYear()}-${p2(venc.getMonth()+1)}-${p2(venc.getDate())}`;

  const DESTINOS = [
    { key:"philadelphia", icon:"🏭", label:"Philadelphia", sub:"Parker Ave Marine Terminal C095", molde:"713" },
    { key:"miami",        icon:"🌴", label:"Miami, FL",    sub:"Estados Unidos",                  molde:"706" },
    { key:"san_juan",     icon:"🇵🇷", label:"San Juan",    sub:"Puerto Rico",                     molde:"709" },
  ];

  const { config: cfgDocs, guardar: guardarCfgDocs } = useConfiguracion();
  const [destino, setDestino]     = useState(null);
  const [facturaNum, setFacturaNum] = useState(693);

  // Cargar consecutivo desde Supabase cuando el config esté listo
  useEffect(() => {
    const num = cfgDocs.factura_num;
    if (num !== undefined) setFacturaNum(Number(num));
  }, [cfgDocs.factura_num]);
  const [generado, setGenerado]   = useState(false);
  const [loading, setLoading]     = useState({ carta:false, proforma:false, isf:false });
  const [backendErr, setBackendErr] = useState("");
  const [form, setForm]           = useState({
    fecha:hoyStr, booking:"", motonave:"", naviera:"", contenedor:"",
    fechaExpedicion:hoyStr, fechaVencimiento:vencStr,
    loadingDate:"", arrivalDate:"", houseBL:"", oceanBL:"",
  });

  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const inp = {
    background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)",
    borderRadius:8, padding:"8px 10px", color:"white", fontSize:12,
    fontFamily:"inherit", width:"100%", boxSizing:"border-box",
  };
  const lbl = (t) => (
    <div style={{fontSize:10,color:"rgba(255,255,255,0.48)",fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>{t}</div>
  );

  return (
    <div>
      <div style={{fontSize:11,color:"rgba(255,255,255,0.48)",marginBottom:12,lineHeight:1.7}}>
        Completa los datos del embarque y genera los 3 documentos de exportación listos para descargar e imprimir.
      </div>

      {/* CAMPOS COMUNES */}
      <div style={{background:"rgba(14,165,233,0.07)",border:"1px solid rgba(14,165,233,0.22)",borderRadius:12,padding:14,marginBottom:10}}>
        <div style={{fontSize:11,color:"#0EA5E9",fontWeight:700,marginBottom:10,textTransform:"uppercase",letterSpacing:0.5}}>📋 Campos comunes — los 3 documentos</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div>
            {lbl("Fecha")}
            <input type="date" value={form.fecha} onChange={e=>set("fecha",e.target.value)} style={inp} />
          </div>
          <div>
            {lbl("Número de Booking")}
            <input value={form.booking} onChange={e=>set("booking",e.target.value)} placeholder="Ej: KKLUE1234567" style={inp} />
          </div>
          <div>
            {lbl("Motonave")}
            <input value={form.motonave} onChange={e=>set("motonave",e.target.value)} placeholder="Ej: MSC SERENA" style={inp} />
          </div>
          <div>
            {lbl("Naviera")}
            <input value={form.naviera} onChange={e=>set("naviera",e.target.value)} placeholder="Ej: MSC, Hapag-Lloyd..." style={inp} />
          </div>
          <div style={{gridColumn:"1/-1"}}>
            {lbl("Número de Contenedor")}
            <input value={form.contenedor} onChange={e=>set("contenedor",e.target.value)} placeholder="Ej: MSCU1234567" style={inp} />
          </div>
        </div>
      </div>

      {/* PROFORMA */}
      <div style={{background:"rgba(14,165,233,0.03)",border:"1px solid rgba(14,165,233,0.12)",borderRadius:12,padding:14,marginBottom:10}}>
        <div style={{fontSize:11,color:"rgba(14,165,233,0.8)",fontWeight:700,marginBottom:10,textTransform:"uppercase",letterSpacing:0.5}}>📊 Factura Proforma</div>

        {/* ── Selector de destino ── */}
        <div style={{marginBottom:12}}>
          {lbl("🚢 Puerto de Descargue")}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:6}}>
            {DESTINOS.map(d => (
              <button key={d.key} onClick={() => setDestino(d.key)} style={{
                background: destino===d.key ? "rgba(14,165,233,0.18)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${destino===d.key ? "#0EA5E9" : "rgba(255,255,255,0.10)"}`,
                borderRadius:10, padding:"10px 6px", cursor:"pointer", textAlign:"center",
                transition:"all 0.15s", outline:"none",
                boxShadow: destino===d.key ? "0 0 0 2px rgba(14,165,233,0.25)" : "none",
              }}>
                <div style={{fontSize:22}}>{d.icon}</div>
                <div style={{fontSize:11,color:destino===d.key?"#38bdf8":"rgba(255,255,255,0.7)",fontWeight:700,marginTop:5,lineHeight:1.3}}>{d.label}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.42)",marginTop:3,lineHeight:1.4}}>{d.sub}</div>
                {destino===d.key && <div style={{fontSize:9,color:"#0EA5E9",fontWeight:700,marginTop:4}}>✓ Seleccionado</div>}
              </button>
            ))}
          </div>
          {!destino && (
            <div style={{fontSize:10,color:"rgba(255,200,0,0.7)",marginTop:6,display:"flex",alignItems:"center",gap:4}}>
              ⚠️ Selecciona el puerto de descargue para habilitar la Proforma
            </div>
          )}
        </div>

        <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"1fr 1fr 1fr",gap:8}}>
          <div>
            {lbl("N° Factura (auto)")}
            <input type="number" value={facturaNum} onChange={e=>setFacturaNum(parseInt(e.target.value)||693)} style={{...inp,color:"#38bdf8",fontWeight:700}} />
          </div>
          <div>
            {lbl("Fecha Expedición")}
            <input type="date" value={form.fechaExpedicion} readOnly style={{...inp,opacity:0.55,cursor:"default"}} />
          </div>
          <div>
            {lbl("Fecha Vencimiento (+30d)")}
            <input type="date" value={form.fechaVencimiento} readOnly style={{...inp,opacity:0.55,cursor:"default"}} />
          </div>
        </div>
      </div>

      {/* ISF */}
      <div style={{background:"rgba(14,165,233,0.03)",border:"1px solid rgba(14,165,233,0.12)",borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{fontSize:11,color:"rgba(14,165,233,0.8)",fontWeight:700,marginBottom:10,textTransform:"uppercase",letterSpacing:0.5}}>📋 ISF Template</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div>
            {lbl("Est. Loading Date")}
            <input type="date" value={form.loadingDate} onChange={e=>set("loadingDate",e.target.value)} style={inp} />
          </div>
          <div>
            {lbl("Est. Arrival — First U.S. Port")}
            <input type="date" value={form.arrivalDate} onChange={e=>set("arrivalDate",e.target.value)} style={inp} />
          </div>
          <div>
            {lbl("House B/L")}
            <input value={form.houseBL} onChange={e=>set("houseBL",e.target.value)} placeholder="Ej: MSCU1234567BQ" style={inp} />
          </div>
          <div>
            {lbl("Ocean B/L / Master B/L")}
            <input value={form.oceanBL} onChange={e=>set("oceanBL",e.target.value)} placeholder="Ej: MSC123456789" style={inp} />
          </div>
        </div>
      </div>

      {/* GENERAR */}
      <button
        onClick={() => { setGenerado(true); setBackendErr(""); }}
        style={{width:"100%",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",border:"none",borderRadius:10,padding:"11px",fontSize:13,color:"white",cursor:"pointer",fontWeight:700,marginBottom:generado?12:0}}
      >
        🚀 Generar Documentos
      </button>

      {/* DESCARGAS */}
      {generado && (() => {
        // ── Payload común para el backend ──────────────────────────────
        const payload = {
          ...form,
          numFactura: String(facturaNum),
          destino: destino || "philadelphia",
        };

        // ── Función genérica de descarga desde el backend ──────────────
        const descargarDoc = async (endpoint, filename, key, onSuccess) => {
          setLoading(p => ({...p, [key]:true}));
          setBackendErr("");
          try {
            const res = await fetch(endpoint, {
              method:"POST",
              headers:{"Content-Type":"application/json"},
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              const e = await res.json().catch(() => ({}));
              throw new Error(e.error || `HTTP ${res.status}`);
            }
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href = url; a.download = filename; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            if (onSuccess) onSuccess();
          } catch(e) {
            setBackendErr(`Error: ${e.message}`);
          } finally {
            setLoading(p => ({...p, [key]:false}));
          }
        };

        const docs = [
          {
            key:"carta", icon:"📄",
            title:"Carta de Temperatura",
            sub:"carta-temperatura.docx · Molde Word editado",
            fn: () => descargarDoc("/api/carta-temp", `carta-temp-${form.booking||"export"}.docx`, "carta"),
          },
          {
            key:"proforma", icon:"📊",
            title:`Factura Proforma #${String(facturaNum).padStart(4,"0")}`,
            sub: destino
              ? `${DESTINOS.find(d=>d.key===destino)?.label} · Molde ${DESTINOS.find(d=>d.key===destino)?.molde}.xlsx`
              : "⚠️ Selecciona el puerto de descargue primero",
            disabled: !destino,
            fn: () => destino && descargarDoc("/api/proforma", `proforma-${facturaNum}-${form.booking||"export"}.xlsx`, "proforma", () => {
              const next = facturaNum + 1;
              setFacturaNum(next);
              guardarCfgDocs("factura_num", next);
            }),
          },
          {
            key:"isf", icon:"📋",
            title:"ISF Template",
            sub:"isf.xlsx · Molde Excel editado (Sheet1)",
            fn: () => descargarDoc("/api/isf", `isf-${form.booking||"export"}.xlsx`, "isf"),
          },
        ];

        return (
          <div style={{background:"rgba(14,165,233,0.08)",border:"1px solid rgba(14,165,233,0.28)",borderRadius:12,padding:14}}>
            <div style={{fontSize:12,color:"#38bdf8",fontWeight:700,marginBottom:10}}>
              ✅ Toca para descargar el molde editado
            </div>
            {backendErr && (
              <div style={{background:"rgba(255,80,80,0.12)",border:"1px solid rgba(255,80,80,0.3)",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#ff8080",marginBottom:10}}>
                ⚠️ {backendErr}
                <div style={{fontSize:10,opacity:0.7,marginTop:3}}>Asegúrate de que el backend esté corriendo en puerto 3001</div>
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {docs.map(d => {
                const isDisabled = loading[d.key] || d.disabled;
                return (
                  <button key={d.key} onClick={d.fn} disabled={isDisabled}
                    style={{
                      width:"100%",
                      background: d.disabled ? "rgba(255,255,255,0.03)" : loading[d.key] ? "rgba(14,165,233,0.05)" : "rgba(14,165,233,0.1)",
                      border: `1px solid ${d.disabled ? "rgba(255,255,255,0.08)" : "rgba(14,165,233,0.3)"}`,
                      borderRadius:10, padding:"12px 16px", fontSize:13,
                      color: d.disabled ? "rgba(255,255,255,0.3)" : loading[d.key] ? "rgba(56,189,248,0.5)" : "#38bdf8",
                      cursor: isDisabled ? "default" : "pointer",
                      fontWeight:700, display:"flex", alignItems:"center", gap:12, textAlign:"left", transition:"all 0.15s",
                    }}>
                    <span style={{fontSize:22,flexShrink:0}}>{loading[d.key] ? "⏳" : d.icon}</span>
                    <div style={{minWidth:0}}>
                      <div>{loading[d.key] ? "Generando..." : d.title}</div>
                      <div style={{fontSize:10,opacity:0.65,fontWeight:400,marginTop:2}}>{d.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── WIDGET TASA USD/COP (sidebar) ───────────────────────────
function TasaCambioWidget() {
  const [historial, setHistorial] = useState([]); // sin datos falsos — solo valores reales
  const [editando, setEditando]   = useState(false);
  const [inputVal, setInputVal]   = useState("");
  const [cargando, setCargando]   = useState(false);
  const [errorApi, setErrorApi]   = useState(false);
  const [ultimaAct, setUltimaAct] = useState(null);
  const [exito, setExito]         = useState(false);

  const fetchTasa = async () => {
    if (cargando) return;
    setCargando(true); setErrorApi(false); setExito(false);
    const t0 = Date.now();
    try {
      let tasa = null;

      // API 1: open.er-api.com — muy confiable, sin clave, CORS abierto
      try {
        const r = await fetch("https://open.er-api.com/v6/latest/USD", { cache:"no-store" });
        if (r.ok) { const d = await r.json(); if (d.result === "success") tasa = Math.round(d.rates.COP); }
      } catch { /* ignore */ }

      // API 2: fawazahmed0 CDN (fallback)
      if (!tasa) {
        try {
          const r = await fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", { cache:"no-store" });
          if (r.ok) { const d = await r.json(); tasa = Math.round(d.usd?.cop); }
        } catch { /* ignore */ }
      }

      // API 3: pages.dev (segundo fallback)
      if (!tasa) {
        try {
          const r = await fetch("https://latest.currency-api.pages.dev/v1/currencies/usd.json", { cache:"no-store" });
          if (r.ok) { const d = await r.json(); tasa = Math.round(d.usd?.cop); }
        } catch { /* ignore */ }
      }

      // Spinner mínimo 700ms para que sea visible
      const espera = 700 - (Date.now() - t0);
      if (espera > 0) await new Promise(res => setTimeout(res, espera));

      if (tasa && tasa > 500) {
        const ahora = new Date();
        const label = ahora.toLocaleTimeString("es-CO", { hour:"2-digit", minute:"2-digit" });
        setHistorial(prev => [...prev.slice(-9), { label, tasa }]); // hasta 10 puntos reales
        try { localStorage.setItem("tp_tasa_usd", String(tasa)); } catch { /* ignore */ }
        setUltimaAct(ahora);
        setExito(true);
        setTimeout(() => setExito(false), 2500);
      } else {
        setErrorApi(true);
      }
    } catch { setErrorApi(true); }
    setCargando(false);
  };

  // Cargar al montar y refrescar cada 5 min
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTasa();
    const id = setInterval(fetchTasa, 5 * 60 * 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lineColor = "#38bdf8";
  const tieneData = historial.length > 0;
  const tasas     = historial.map(h => h.tasa);
  const actual    = tieneData ? tasas[tasas.length - 1] : null;
  const anterior  = tasas.length > 1 ? tasas[tasas.length - 2] : actual;
  const diff      = tieneData ? actual - anterior : 0;
  const pct       = anterior ? ((Math.abs(diff) / anterior) * 100).toFixed(2) : "0.00";
  const trend     = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const trendColor = trend==="up" ? "#FF6B6B" : trend==="down" ? "#00C9A7" : "rgba(255,255,255,0.4)";

  // Sparkline — solo si hay ≥ 2 puntos
  const W = 142, H = 46;
  let pts = "", lx = W.toFixed(1), ly = (H/2).toFixed(1);
  if (tasas.length >= 2) {
    const mn = Math.min(...tasas), mx = Math.max(...tasas), rng = mx - mn || 1;
    pts = tasas.map((v, i) => {
      const x = (i / (tasas.length - 1)) * W;
      const y = H - 4 - ((v - mn) / rng) * (H - 10);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const lastV = tasas[tasas.length - 1];
    lx = W.toFixed(1);
    ly = (H - 4 - ((lastV - mn) / rng) * (H - 10)).toFixed(1);
  }

  const guardar = () => {
    const val = parseInt(inputVal);
    if (!val || val < 500) return;
    const ahora = new Date();
    const label = ahora.toLocaleTimeString("es-CO", { hour:"2-digit", minute:"2-digit" });
    setHistorial(prev => [...prev.slice(-9), { label, tasa: val }]);
    setUltimaAct(ahora);
    setEditando(false); setInputVal("");
  };

  return (
    <div style={{ background:"rgba(56,189,248,0.05)", border:"1px solid rgba(56,189,248,0.2)", borderRadius:12, padding:"10px 10px 8px", marginTop:6 }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.38)", textTransform:"uppercase", letterSpacing:1 }}>💵 USD / COP</div>
        <button onClick={fetchTasa} disabled={cargando} title="Actualizar tasa"
          style={{ background:cargando?"rgba(56,189,248,0.12)":"rgba(56,189,248,0.07)", border:"1px solid rgba(56,189,248,0.25)", borderRadius:6, cursor:cargando?"default":"pointer", fontSize:11, color:exito?"#00C9A7":errorApi?"#FF6B6B":"rgba(56,189,248,0.8)", padding:"3px 7px", display:"flex", alignItems:"center", gap:4, fontWeight:700, transition:"color 0.3s" }}>
          <span style={{ display:"inline-block", animation:cargando?"spin 0.7s linear infinite":"none" }}>🔄</span>
          <span style={{ fontSize:9 }}>{cargando?"Actualizando…":exito?"✓ Listo":errorApi?"Error":"Actualizar"}</span>
        </button>
      </div>

      {/* Valor principal */}
      <div style={{ display:"flex", alignItems:"baseline", gap:4, marginBottom:6, minHeight:26 }}>
        {cargando && !tieneData ? (
          <span style={{ fontSize:13, color:"rgba(56,189,248,0.45)", fontWeight:700 }}>Conectando…</span>
        ) : tieneData ? (
          <>
            <span style={{ fontSize:19, fontWeight:800, color:lineColor, lineHeight:1 }}>{fmtCOP(actual)}</span>
            <span style={{ fontSize:9, color:"rgba(255,255,255,0.42)" }}>COP</span>
            {tasas.length > 1 && (
              <span style={{ marginLeft:"auto", fontSize:10, fontWeight:700, color:trendColor }}>
                {trend==="up"?"▲":trend==="down"?"▼":"─"} {pct}%
              </span>
            )}
          </>
        ) : (
          <span style={{ fontSize:11, color:"rgba(255,255,255,0.38)" }}>—</span>
        )}
      </div>

      {/* Sparkline — solo si hay ≥ 2 puntos */}
      {tasas.length >= 2 && (
        <svg width={W} height={H} style={{ display:"block", overflow:"visible", marginBottom:5 }}>
          <defs>
            <linearGradient id="tasaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.25"/>
              <stop offset="100%" stopColor={lineColor} stopOpacity="0.02"/>
            </linearGradient>
          </defs>
          <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#tasaGrad)" />
          <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx={lx} cy={ly} r="3" fill={lineColor} />
        </svg>
      )}

      {/* Timestamps */}
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
        {tasas.length >= 2
          ? <span style={{ fontSize:8, color:"rgba(255,255,255,0.28)" }}>{historial[0].label}</span>
          : <span style={{ fontSize:8, color:"rgba(255,255,255,0.2)" }}>La gráfica se forma con actualizaciones</span>
        }
        {ultimaAct && (
          <span style={{ fontSize:8, color:exito?"#00C9A7":"rgba(56,189,248,0.55)" }}>
            ⚡ {ultimaAct.toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}
          </span>
        )}
      </div>

      {/* Error */}
      {errorApi && !tieneData && (
        <div style={{ fontSize:9, color:"rgba(255,107,107,0.8)", marginBottom:6, textAlign:"center", background:"rgba(255,107,107,0.08)", borderRadius:5, padding:"4px 6px" }}>
          ⚠️ Sin conexión — ingresa la tasa manualmente
        </div>
      )}

      {/* Input manual */}
      {editando ? (
        <div style={{ display:"flex", gap:4 }}>
          <input autoFocus type="number" placeholder="Ej: 4200" value={inputVal}
            onChange={e=>setInputVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&guardar()}
            style={{ flex:1, background:"rgba(255,255,255,0.10)", border:"1px solid rgba(56,189,248,0.4)", borderRadius:6, padding:"4px 6px", color:"white", fontSize:10, fontFamily:"inherit" }} />
          <button onClick={guardar} style={{ background:"rgba(56,189,248,0.2)", border:"none", borderRadius:6, padding:"4px 8px", color:lineColor, cursor:"pointer", fontSize:11, fontWeight:700 }}>✓</button>
          <button onClick={()=>setEditando(false)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.38)", cursor:"pointer" }}>✕</button>
        </div>
      ) : (
        <button onClick={()=>setEditando(true)} style={{ width:"100%", background:"rgba(56,189,248,0.07)", border:"1px solid rgba(56,189,248,0.18)", borderRadius:6, padding:"5px", fontSize:9, color:"rgba(56,189,248,0.65)", cursor:"pointer", fontWeight:700 }}>
          ✏️ Ingresar manual
        </button>
      )}
    </div>
  );
}

// ─── MÓDULO ESTADÍSTICAS ──────────────────────────────────────
// ── Datos históricos para estadísticas ───────────────────────
const GASTOS_OP_EST = [
  { cat:"Empaque (cajas/esquineras)", cop:1200000 },
  { cat:"Transporte interno",         cop:800000  },
  { cat:"Refrigeración / frío",       cop:600000  },
  { cat:"Etiquetas y PLU",            cop:280000  },
  { cat:"Varios operativos",          cop:320000  },
];

function EstadisticasDemo() {
  const mob = useM();
  const [tab, setTab] = useState(0);
  const hoy = new Date();
  const mesActual = hoy.toISOString().slice(0,7);
  const { procesos: contsStats } = useContenedores();
  const { liquidaciones: liqStats } = useLiquidaciones();
  const { config: estCfg } = useConfiguracion();
  const { registros: asistRegs } = useAsistencia();

  // Asistencia del mes desde Supabase
  const asistMes = (() => {
    const dias = Object.keys(asistRegs).filter(k => k.startsWith(mesActual));
    const mapa = {};
    for (const dia of dias) {
      for (const [nombre, v] of Object.entries(asistRegs[dia] || {})) {
        if (!v?.estado) continue;
        if (!mapa[nombre]) mapa[nombre] = { nombre, P:0, A:0, T:0, LP:0 };
        mapa[nombre][v.estado] = (mapa[nombre][v.estado] || 0) + 1;
      }
    }
    return { datos: Object.values(mapa).sort((a,b) => b.P-a.P), dias: dias.length };
  })();

  // Historial REAL desde Supabase (via useContenedores) — agrupado por mes
  const histConFinal = (() => {
    try {
      const conts = contsStats;
      if (conts.length === 0) return [];
      const porMes = {};
      conts.forEach(c => {
        const fecha = c.fecha || "";
        if (!fecha) return;
        const mes = fecha.slice(0, 7);
        if (!porMes[mes]) porMes[mes] = { num: 0, cajas: 0 };
        porMes[mes].num   += 1;
        porMes[mes].cajas += parseInt(c.cajasSalida) || 0;
      });
      return Object.entries(porMes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, v]) => {
          const [y, m] = mes.split("-");
          const nombreMes = new Date(Number(y), Number(m)-1, 1)
            .toLocaleDateString("es-CO", { month:"short", year:"2-digit" })
            .replace(". ", " '");
          return { mes: nombreMes, num: v.num, cajas: v.cajas, esReal: true, esActual: mes === mesActual };
        });
    } catch { return []; }
  })();

  const contRealesMes = histConFinal.find(h => h.esActual) || null;

  // Parámetros configurados desde Supabase
  const nominaCfgEst = estCfg.cfg_nomina      || {};
  const valCont      = nominaCfgEst.valorContenedor ?? VALOR_CONTENEDOR;
  const salMin       = nominaCfgEst.salarioMinimo   ?? SALARIO_MINIMO;
  const valQuin      = nominaCfgEst.valorQuincena   ?? QUINCENA_DESCARGUE;

  // Nómina real desde Supabase (via useLiquidaciones) — agrupada por periodo (YYYY-MM)
  const nominaMeses = (() => {
    try {
      const liqs = liqStats;
      if (liqs.length === 0) return [];
      const porPeriodo = {};
      liqs.forEach(l => {
        const p = l.periodo || l.fecha?.slice(0, 7) || "";
        if (!p) return;
        if (!porPeriodo[p]) porPeriodo[p] = { nomina:0, proc:0, total:0 };
        const monto = Number(l.neto) || 0;
        if (l.tipo === "contenedor") porPeriodo[p].proc   += monto;
        else                         porPeriodo[p].nomina += monto;
        porPeriodo[p].total += monto;
      });
      return Object.entries(porPeriodo)
        .sort(([a],[b]) => a.localeCompare(b))
        .map(([per, v]) => {
          const [y, m] = per.split("-");
          const mes = new Date(Number(y), Number(m)-1, 1)
            .toLocaleDateString("es-CO", { month:"short", year:"2-digit" })
            .replace(". ", " '");
          return { mes, num:1, cajas:0, ...v };
        });
    } catch { return []; }
  })();

  // Gastos — basado en contenedores reales + parámetros configurados
  const gastosFijosTotal = GASTOS_OP_EST.reduce((s,g)=>s+g.cop,0);
  const finMeses = histConFinal.map(h => {
    const nom    = salMin + valQuin*2*3 + h.num*PROCESO_BASE.length*valCont;
    const op     = gastosFijosTotal * h.num;
    const gastos = nom + op;
    return { ...h, gastos };
  });

  // Descarga CSV
  const descargarCSV = (headers, rows, filename) => {
    const csv  = [headers.join(","), ...rows.map(r=>r.map(v=>`"${v}"`).join(","))].join("\n");
    const blob = new Blob(["﻿"+csv], {type:"text/csv;charset=utf-8"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href=url; a.download=filename; a.click();
    URL.revokeObjectURL(url);
  };

  const TABS_EST = [
    { icon:"📦", label:"Producción"    },
    { icon:"💰", label:"Nómina"        },
    { icon:"📅", label:"Asistencia"    },
    { icon:"💸", label:"Gastos"        },
  ];

  const btnCSV = (label, onClick) => (
    <button onClick={onClick} style={{ background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:6, padding:"3px 9px", fontSize:9, color:"#6366F1", cursor:"pointer", fontWeight:700 }}>⬇ {label}</button>
  );

  return (
    <div>
      {/* ── Tabs ── */}
      <div style={{ display:"flex", gap:4, marginBottom:14, flexWrap:"wrap" }}>
        {TABS_EST.map((t,i)=>(
          <button key={i} onClick={()=>setTab(i)}
            style={{ background:tab===i?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.04)", border:`1px solid ${tab===i?"rgba(99,102,241,0.55)":"rgba(255,255,255,0.08)"}`, borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:11, color:tab===i?"#6366F1":"rgba(255,255,255,0.4)", fontWeight:tab===i?700:400 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══ TAB 0: PRODUCCIÓN ══ */}
      {tab===0 && (() => {
        const totalCont = histConFinal.reduce((s,h)=>s+h.num,0);
        const totalCaj  = histConFinal.reduce((s,h)=>s+h.cajas,0);
        const maxN = Math.max(...histConFinal.map(x=>x.num), 1);
        const maxC = Math.max(...histConFinal.map(x=>x.cajas), 1);
        return (
          <div>
            {contRealesMes && contRealesMes.num > 0 && (
              <div style={{ background:"rgba(0,201,167,0.08)", border:"1px solid rgba(0,201,167,0.25)", borderRadius:8, padding:"7px 12px", marginBottom:10, fontSize:10, color:"#00C9A7", display:"flex", alignItems:"center", gap:6 }}>
                ✅ <strong>Mes actual:</strong> {contRealesMes.num} contenedor{contRealesMes.num!==1?"es":""} · {contRealesMes.cajas.toLocaleString("es-CO")} cajas — datos reales del sistema
              </div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:mob?"repeat(2,1fr)":"repeat(4,1fr)", gap:8, marginBottom:12 }}>
              {[
                { icon:"🚢", l:"Contenedores totales",  v:totalCont,                                                                         c:"#6366F1" },
                { icon:"📦", l:"Cajas procesadas",      v:totalCaj.toLocaleString("es-CO"),                                                  c:"#00C9A7" },
                { icon:"📊", l:"Prom. cajas/contenedor",v:Math.round(totalCaj/(totalCont||1)).toLocaleString("es-CO"),                        c:"#F9A826" },
                { icon:"🏆", l:"Mejor mes",             v:histConFinal.slice().sort((a,b)=>b.num-a.num)[0]?.mes || "—",                      c:"#845EF7" },
              ].map((k,i)=>(
                <div key={i} style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${k.c}22`, borderRadius:12, padding:"10px 6px", textAlign:"center" }}>
                  <div style={{ fontSize:18 }}>{k.icon}</div>
                  <div style={{ fontSize:15, fontWeight:800, color:k.c, marginTop:2 }}>{k.v}</div>
                  <div style={{ fontSize:8, color:"rgba(255,255,255,0.42)", marginTop:2, lineHeight:1.3 }}>{k.l}</div>
                </div>
              ))}
            </div>

            {/* Gráfica contenedores */}
            <div style={{ background:"rgba(99,102,241,0.04)", border:"1px solid rgba(99,102,241,0.12)", borderRadius:12, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.58)" }}>🚢 Contenedores por mes</div>
                {btnCSV("CSV", ()=>descargarCSV(["Mes","Contenedores","Cajas","Kg estimados","Costo proceso COP"],histConFinal.map(h=>[h.mes,h.num,h.cajas,h.cajas*10,(h.num*PROCESO_BASE.length*VALOR_CONTENEDOR)]),"produccion_contenedores.csv"))}
              </div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:5, height:90 }}>
                {histConFinal.map((h,i)=>{
                  const barH  = ((h.num/maxN)*68).toFixed(1);
                  const esAct = i===histConFinal.length-1;
                  const color = h.esReal ? "#00C9A7" : "#6366F1";
                  return (
                    <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                      <div style={{ fontSize:7, color:esAct?color:"rgba(255,255,255,0.42)", fontWeight:esAct?700:400 }}>{h.num}</div>
                      <div style={{ width:"80%", height:`${barH}px`, background:esAct?color:`rgba(99,102,241,0.35)`, borderRadius:"3px 3px 0 0" }}/>
                      <div style={{ fontSize:7, color:esAct?color:"rgba(255,255,255,0.36)", textAlign:"center", lineHeight:1.2 }}>{h.mes}{h.esReal?" ✓":""}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Gráfica cajas */}
            <div style={{ background:"rgba(0,201,167,0.04)", border:"1px solid rgba(0,201,167,0.12)", borderRadius:12, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.58)", marginBottom:10 }}>📦 Cajas procesadas por mes</div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:5, height:80 }}>
                {histConFinal.map((h,i)=>{
                  const barH  = ((h.cajas/maxC)*60).toFixed(1);
                  const esAct = i===histConFinal.length-1;
                  const color = h.esReal ? "#00C9A7" : "#6366F1";
                  return (
                    <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                      <div style={{ fontSize:7, color:esAct?color:"rgba(255,255,255,0.38)" }}>{h.cajas >= 1000 ? `${(h.cajas/1000).toFixed(1)}k` : h.cajas}</div>
                      <div style={{ width:"80%", height:`${barH}px`, background:esAct?color:"rgba(0,201,167,0.3)", borderRadius:"3px 3px 0 0" }}/>
                      <div style={{ fontSize:7, color:esAct?color:"rgba(255,255,255,0.36)", textAlign:"center" }}>{h.mes}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tabla detalle */}
            <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, padding:"12px 14px" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.48)", marginBottom:8 }}>Detalle histórico</div>
              <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.11)", paddingBottom:5, marginBottom:4, gap:0 }}>
                {["Mes","Cont.","Cajas","Kg est.","Costo proceso"].map((h,i)=>(
                  <div key={i} style={{ flex:i===0?2:1, fontSize:8, color:"rgba(255,255,255,0.38)", fontWeight:700, textAlign:i===0?"left":"right" }}>{h}</div>
                ))}
              </div>
              {histConFinal.map((h,i)=>{
                const proc  = h.num*PROCESO_BASE.length*VALOR_CONTENEDOR;
                const esAct = i===histConFinal.length-1;
                const color = h.esReal ? "#00C9A7" : "#6366F1";
                return (
                  <div key={i} style={{ display:"flex", padding:"4px 0", borderBottom:"1px solid rgba(255,255,255,0.07)", background:esAct?`${color}08`:"transparent" }}>
                    <div style={{ flex:2, fontSize:10, color:esAct?color:"rgba(255,255,255,0.68)", fontWeight:esAct?700:400 }}>
                      {h.mes}{esAct?(h.esReal?" ✅ Real":" ●"):""}
                    </div>
                    <div style={{ flex:1, fontSize:10, color:"rgba(255,255,255,0.58)", textAlign:"right" }}>{h.num}</div>
                    <div style={{ flex:1, fontSize:10, color:"rgba(255,255,255,0.58)", textAlign:"right" }}>{h.cajas.toLocaleString()}</div>
                    <div style={{ flex:1, fontSize:10, color:"rgba(255,255,255,0.58)", textAlign:"right" }}>{(h.cajas*10).toLocaleString()}</div>
                    <div style={{ flex:1, fontSize:10, color:"#F9A826", textAlign:"right", fontWeight:700 }}>{h.cajas>0?`$${(proc/1000000).toFixed(2)}M`:"—"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ══ TAB 1: NÓMINA ══ */}
      {tab===1 && (() => {
        if (nominaMeses.length === 0) return (
          <div style={{ textAlign:"center", padding:"50px 20px" }}>
            <div style={{ fontSize:32, marginBottom:10 }}>💰</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.58)", marginBottom:6 }}>Sin liquidaciones registradas aún</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.33)" }}>Genera nóminas en el módulo "Nómina" para ver el historial aquí</div>
          </div>
        );
        const totalNom  = nominaMeses.reduce((s,m)=>s+m.total,0);
        const promTotal = totalNom / nominaMeses.length;
        const maxT = Math.max(...nominaMeses.map(x=>x.total), 1);
        return (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:mob?"repeat(2,1fr)":"repeat(3,1fr)", gap:8, marginBottom:12 }}>
              {[
                { icon:"💰", l:"Promedio mensual",       v:`$${(promTotal/1000000).toFixed(2)}M`,              c:"#F9A826" },
                { icon:"📊", l:`Total ${nominaMeses.length} mes${nominaMeses.length!==1?"es":""}`, v:`$${(totalNom/1000000).toFixed(1)}M`, c:"#00C9A7" },
                { icon:"💜", l:"Fija/mes (salario+desc)", v:`$${((salMin+valQuin*6)/1000000).toFixed(2)}M`,    c:"#845EF7" },
              ].map((k,i)=>(
                <div key={i} style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${k.c}22`, borderRadius:12, padding:"10px 8px", textAlign:"center" }}>
                  <div style={{ fontSize:20 }}>{k.icon}</div>
                  <div style={{ fontSize:16, fontWeight:800, color:k.c, marginTop:2 }}>{k.v}</div>
                  <div style={{ fontSize:8, color:"rgba(255,255,255,0.42)", marginTop:2, lineHeight:1.3 }}>{k.l}</div>
                </div>
              ))}
            </div>

            {/* Stacked bar chart nómina */}
            <div style={{ background:"rgba(249,168,38,0.04)", border:"1px solid rgba(249,168,38,0.12)", borderRadius:12, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.58)" }}>💰 Nómina mensual — comparativo</div>
                <div style={{ display:"flex", gap:8 }}>
                  {[["Nómina","#845EF7"],["Proceso","#6366F1"]].map(([l,c])=>(
                    <div key={l} style={{ display:"flex", alignItems:"center", gap:3, fontSize:8, color:"rgba(255,255,255,0.42)" }}>
                      <div style={{ width:7, height:7, borderRadius:1, background:c }}/>{l}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:5, height:90 }}>
                {nominaMeses.map((m,i)=>{
                  const scale = 68/maxT;
                  const hn = (m.nomina*scale).toFixed(1);
                  const hp = (m.proc*scale).toFixed(1);
                  const esAct = i===nominaMeses.length-1;
                  return (
                    <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"stretch", width:"80%", gap:1 }}>
                        <div style={{ height:`${hp}px`, background:"#6366F1", borderRadius:"3px 3px 0 0", opacity:esAct?1:0.45 }}/>
                        <div style={{ height:`${hn}px`, background:"#845EF7", borderRadius:0, opacity:esAct?1:0.45 }}/>
                      </div>
                      <div style={{ fontSize:7, color:esAct?"#F9A826":"rgba(255,255,255,0.28)", textAlign:"center" }}>{m.mes}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tabla nómina */}
            <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, padding:"12px 14px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.48)" }}>Detalle mensual</div>
                {btnCSV("CSV nómina", ()=>descargarCSV(
                  ["Mes","Nómina COP","Proceso COP","Total COP"],
                  nominaMeses.map(m=>[m.mes,m.nomina,m.proc,m.total]),
                  "nomina_mensual.csv"
                ))}
              </div>
              <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.11)", paddingBottom:5, marginBottom:4 }}>
                {["Mes","Nómina","Proceso","Total"].map((h,i)=>(
                  <div key={i} style={{ flex:i===0?2:1.4, fontSize:8, color:"rgba(255,255,255,0.38)", fontWeight:700, textAlign:i===0?"left":"right" }}>{h}</div>
                ))}
              </div>
              {nominaMeses.map((m,i)=>{
                const esAct = i===nominaMeses.length-1;
                return (
                  <div key={i} style={{ display:"flex", padding:"4px 0", borderBottom:"1px solid rgba(255,255,255,0.07)", background:esAct?"rgba(249,168,38,0.05)":"transparent" }}>
                    <div style={{ flex:2, fontSize:10, color:esAct?"#F9A826":"rgba(255,255,255,0.6)", fontWeight:esAct?700:400 }}>{m.mes}{esAct?" ●":""}</div>
                    <div style={{ flex:1.4, fontSize:9, color:"#845EF7", textAlign:"right" }}>${(m.nomina/1e6).toFixed(2)}M</div>
                    <div style={{ flex:1.4, fontSize:9, color:"#6366F1", textAlign:"right" }}>${(m.proc/1e6).toFixed(2)}M</div>
                    <div style={{ flex:1.4, fontSize:10, color:"#00C9A7", textAlign:"right", fontWeight:700 }}>${(m.total/1e6).toFixed(2)}M</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ══ TAB 2: ASISTENCIA POR EMPLEADO ══ */}
      {tab===2 && (
        <div>
          {asistMes.datos.length === 0 ? (
            <div style={{ textAlign:"center", padding:"50px 20px" }}>
              <div style={{ fontSize:32, marginBottom:10 }}>📅</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.58)", marginBottom:6 }}>Sin datos de asistencia para {hoy.toLocaleDateString("es-CO",{month:"long",year:"numeric"})}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.33)" }}>Registra asistencia en el módulo "Asistencia" para ver estadísticas aquí</div>
            </div>
          ) : (
            <>
              <div style={{ display:"grid", gridTemplateColumns:mob?"repeat(2,1fr)":"repeat(4,1fr)", gap:8, marginBottom:12 }}>
                {[
                  { icon:"📅", l:"Días registrados",  v:asistMes.dias,                                                                                                      c:"#4ECDC4" },
                  { icon:"👥", l:"Empleados activos",  v:asistMes.datos.length,                                                                                              c:"#00C9A7" },
                  { icon:"✅", l:"Total presencias",   v:asistMes.datos.reduce((s,e)=>s+e.P,0),                                                                              c:"#00C9A7" },
                  { icon:"📊", l:"% asistencia",       v:`${Math.round(asistMes.datos.reduce((s,e)=>s+e.P,0)/(asistMes.datos.reduce((s,e)=>s+e.P+e.A+e.T+e.LP,0)||1)*100)}%`, c:"#F9A826" },
                ].map((k,i)=>(
                  <div key={i} style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${k.c}22`, borderRadius:12, padding:"10px 6px", textAlign:"center" }}>
                    <div style={{ fontSize:18 }}>{k.icon}</div>
                    <div style={{ fontSize:16, fontWeight:800, color:k.c, marginTop:2 }}>{k.v}</div>
                    <div style={{ fontSize:8, color:"rgba(255,255,255,0.42)", marginTop:2, lineHeight:1.3 }}>{k.l}</div>
                  </div>
                ))}
              </div>

              <div style={{ background:"rgba(78,205,196,0.04)", border:"1px solid rgba(78,205,196,0.12)", borderRadius:12, padding:"12px 14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.52)" }}>
                    Asistencia por empleado — {hoy.toLocaleDateString("es-CO",{month:"long",year:"numeric"})}
                  </div>
                  {btnCSV("CSV asistencia", ()=>descargarCSV(
                    ["Empleado","Presentes","Ausentes","Tardanzas","Lic. Permiso","% Asistencia"],
                    asistMes.datos.map(e=>[e.nombre,e.P,e.A,e.T,e.LP,`${Math.round(e.P/(e.P+e.A+e.T+e.LP||1)*100)}%`]),
                    "asistencia_mensual.csv"
                  ))}
                </div>
                <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.11)", paddingBottom:5, marginBottom:4 }}>
                  {["Empleado","P","A","T","LP","%"].map((h,i)=>(
                    <div key={i} style={{ flex:i===0?5:1, fontSize:8, color:"rgba(255,255,255,0.38)", fontWeight:700, textAlign:i===0?"left":"center" }}>{h}</div>
                  ))}
                </div>
                <div style={{ maxHeight:320, overflowY:"auto" }}>
                  {asistMes.datos.map((e,i)=>{
                    const tot = e.P+e.A+e.T+e.LP || 1;
                    const pct = Math.round(e.P/tot*100);
                    const col = pct>=90?"#00C9A7":pct>=70?"#F9A826":"#FF6B6B";
                    return (
                      <div key={i} style={{ display:"flex", alignItems:"center", padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
                        <div style={{ flex:5, fontSize:10, color:"rgba(255,255,255,0.78)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.nombre}</div>
                        <div style={{ flex:1, fontSize:10, color:"#00C9A7", textAlign:"center", fontWeight:700 }}>{e.P}</div>
                        <div style={{ flex:1, fontSize:10, color:"#FF6B6B", textAlign:"center" }}>{e.A}</div>
                        <div style={{ flex:1, fontSize:10, color:"#F9A826", textAlign:"center" }}>{e.T}</div>
                        <div style={{ flex:1, fontSize:10, color:"#845EF7", textAlign:"center" }}>{e.LP}</div>
                        <div style={{ flex:1, textAlign:"center" }}>
                          <span style={{ fontSize:9, background:`${col}18`, color:col, borderRadius:4, padding:"1px 5px", fontWeight:700 }}>{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ TAB 3: GASTOS ══ */}
      {tab===3 && (() => {
        if (finMeses.length === 0) return (
          <div style={{ textAlign:"center", padding:"50px 20px" }}>
            <div style={{ fontSize:32, marginBottom:10 }}>💸</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.58)", marginBottom:6 }}>Sin datos de contenedores aún</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.33)" }}>Registra contenedores en el módulo "Contenedores" para ver el análisis de gastos</div>
          </div>
        );
        const totalGas  = finMeses.reduce((s,m)=>s+m.gastos,0);
        const promGas   = totalGas / finMeses.length;
        const peorMes   = finMeses.slice().sort((a,b)=>b.gastos-a.gastos)[0];
        const maxFin    = Math.max(...finMeses.map(x=>x.gastos), 1);
        return (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
              {[
                { icon:"💸", l:`Gastos totales ${finMeses.length} mes${finMeses.length!==1?"es":""}`, v:`$${(totalGas/1e6).toFixed(0)}M COP`, c:"#FF6B6B" },
                { icon:"📊", l:"Gasto promedio mensual",  v:`$${(promGas/1e6).toFixed(1)}M COP`,      c:"#F9A826" },
                { icon:"🏆", l:"Mes de mayor gasto",       v:peorMes?.mes || "—",                       c:"#845EF7" },
                { icon:"🚢", l:"Nómina+operativos incl.",  v:"Sin materia prima",                       c:"#6366F1" },
              ].map((k,i)=>(
                <div key={i} style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${k.c}22`, borderRadius:12, padding:"10px 12px", display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ fontSize:22 }}>{k.icon}</div>
                  <div>
                    <div style={{ fontSize:15, fontWeight:800, color:k.c }}>{k.v}</div>
                    <div style={{ fontSize:8, color:"rgba(255,255,255,0.42)", lineHeight:1.3 }}>{k.l}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Chart gastos */}
            <div style={{ background:"rgba(255,107,107,0.04)", border:"1px solid rgba(255,107,107,0.12)", borderRadius:12, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.58)", marginBottom:8 }}>💸 Gastos por mes</div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:5, height:90 }}>
                {finMeses.map((m,i)=>{
                  const hg   = ((m.gastos/maxFin)*68).toFixed(1);
                  const esAct = i===finMeses.length-1;
                  return (
                    <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                      <div style={{ width:"80%", height:`${hg}px`, background:"#FF6B6B", borderRadius:"3px 3px 0 0", opacity:esAct?1:0.4 }}/>
                      <div style={{ fontSize:7, color:esAct?"#FF6B6B":"rgba(255,255,255,0.28)", textAlign:"center" }}>{m.mes}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Desglose + notas */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, padding:"12px 14px" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.48)", marginBottom:8 }}>💸 Desglose gastos (prom. mensual)</div>
                {[
                  ["Nómina fija", salMin+valQuin*6, "#845EF7"],
                  ["Proceso (4 cont.)", 4*PROCESO_BASE.length*valCont, "#6366F1"],
                  ...GASTOS_OP_EST.map(g=>[g.cat, g.cop*4, "#F9A826"]),
                ].map(([l,v,c],i)=>(
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
                    <span style={{ fontSize:9, color:"rgba(255,255,255,0.48)", maxWidth:"60%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l}</span>
                    <span style={{ fontSize:9, color:c, fontWeight:700 }}>${(v/1e6).toFixed(2)}M</span>
                  </div>
                ))}
              </div>
              <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, padding:"12px 14px" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.48)", marginBottom:8 }}>📌 Supuestos del cálculo</div>
                {[
                  "No incluye costo de materia prima",
                  "No incluye ingresos — la empresa aún no los maneja",
                  "Gastos operativos estimados (editable en Configuración)",
                ].map((n,i)=>(
                  <div key={i} style={{ display:"flex", gap:5, alignItems:"flex-start", marginBottom:4 }}>
                    <span style={{ fontSize:9, color:"rgba(255,255,255,0.28)", flexShrink:0, marginTop:1 }}>•</span>
                    <span style={{ fontSize:9, color:"rgba(255,255,255,0.42)", lineHeight:1.4 }}>{n}</span>
                  </div>
                ))}
                <button onClick={()=>descargarCSV(
                  ["Mes","Gastos COP"],
                  finMeses.map(m=>[m.mes,Math.round(m.gastos)]),
                  "gastos_mensual.csv"
                )} style={{ marginTop:10, width:"100%", background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:6, padding:"5px", fontSize:9, color:"#6366F1", cursor:"pointer", fontWeight:700 }}>⬇ Exportar CSV gastos</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Botón PDF / imprimir ── */}
      <div style={{ marginTop:16, display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
        <button onClick={()=>window.print()}
          style={{ background:"linear-gradient(135deg,rgba(99,102,241,0.12),rgba(132,94,247,0.12))", border:"1px solid rgba(99,102,241,0.28)", borderRadius:10, padding:"8px 22px", fontSize:11, color:"#6366F1", cursor:"pointer", fontWeight:700 }}>
          🖨 Imprimir / Guardar como PDF
        </button>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)" }}>En el diálogo de impresión selecciona "Guardar como PDF" para compartir con socios</div>
      </div>
    </div>
  );
}

// ─── MÓDULO INICIO — DASHBOARD EJECUTIVO ─────────────────────
function InicioDemo({ usuario, onNavigate, puedeAcceder }) {
  const mob   = useM();
  const small = useS();
  const [hora,  setHora]  = useState(new Date());
  const [clima, setClima] = useState(null);
  const { items: invInicio, loading: loadingInvInicio } = useInventario();
  const { registros: asistRegs, loading: loadingAsistInicio } = useAsistencia();
  const { empleados: empleadosInicio, loading: loadingPersonalInicio } = usePersonal();
  const empleadosReal = empleadosInicio.length > 0 ? empleadosInicio : EMPLEADOS_DB;

  useEffect(() => {
    const id = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Clima en tiempo real — Open-Meteo (gratis, sin API key, CORS abierto)
  // Coordenadas: Girón, Santander, Colombia
  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=7.0731&longitude=-73.1686&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=America%2FBogota&forecast_days=1")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.current) setClima(d.current); })
      .catch(() => {});
  }, []);

  const hoy = hora.toISOString().split("T")[0];

  // Asistencia hoy — desde Supabase via useAsistencia
  const asistHoy = (() => {
    const vals = Object.values(asistRegs[hoy] || {});
    return {
      p:     vals.filter(v => v?.estado === "P").length,
      a:     vals.filter(v => v?.estado === "A").length,
      t:     vals.filter(v => v?.estado === "T").length,
      lp:    vals.filter(v => v?.estado === "LP").length,
      total: vals.filter(v => v?.estado).length,
    };
  })();

  // Tendencia asistencia — últimos 7 días desde Supabase
  const tendencia = Array.from({ length:7 }, (_, i) => {
    const d = new Date(hora); d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().split("T")[0];
    const vals = Object.values(asistRegs[key] || {});
    return {
      label: ["D","L","M","X","J","V","S"][d.getDay()],
      p: vals.filter(v => v?.estado === "P").length,
      a: vals.filter(v => v?.estado === "A").length,
      esHoy: i === 6,
    };
  });

  // Actividad reciente desde Supabase
  const actividadReciente = (() => {
    const items = [];
    for (let i = 0; i <= 7 && items.length < 3; i++) {
      const d = new Date(hora); d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const vals = Object.values(asistRegs[key] || {});
      const total = vals.filter(v => v?.estado).length;
      if (total > 0) {
        const p = vals.filter(v => v?.estado === "P").length;
        const label = key === hoy ? "Hoy" : key.split("-").slice(1).join("/");
        items.push({ icon:"📅", text:`Asistencia ${label}: ${p} presentes de ${total}`, time:label, color:"#4ECDC4" });
      }
    }
    return items;
  })();

  const inventarioReal = invInicio.length > 0 ? invInicio : INVENTARIO_BASE;

  // Stats
  const bajoStock   = inventarioReal.filter(i => i.categoria === "Herramientas" ? i.cant === 0 : i.cant <= i.minimo);
  const sinCuenta   = empleadosReal.filter(e => !e.cuenta || e.cuenta === "-").length;
  const sinTel      = empleadosReal.filter(e => !e.tel    || e.tel    === "-").length;
  const alertaCount = bajoStock.length + (sinCuenta > 0 ? 1 : 0) + (sinTel > 0 ? 1 : 0);
  const nominaFija  = SALARIO_MINIMO + QUINCENA_DESCARGUE * 2 * 3;

  // Clima — mapeo de código WMO a emoji/descripción
  const wDesc = (code) => {
    if (code == null) return { icon:"🌡️", desc:"Cargando…" };
    if (code === 0)   return { icon:"☀️",  desc:"Despejado" };
    if (code <= 3)    return { icon:"⛅",   desc:"Parcialmente nublado" };
    if (code <= 48)   return { icon:"🌫️",  desc:"Niebla" };
    if (code <= 67)   return { icon:"🌧️",  desc:"Lluvia" };
    if (code <= 82)   return { icon:"🌦️",  desc:"Chubascos" };
    return { icon:"⛈️", desc:"Tormenta" };
  };
  const w = wDesc(clima?.weather_code);

  const quickMods = [
    { icon:"👥", label:"Personal",     color:"#00C9A7", id:"personal"     },
    { icon:"💰", label:"Nómina",       color:"#F9A826", id:"nomina"       },
    { icon:"📦", label:"Inventario",   color:"#845EF7", id:"inventario"   },
    { icon:"📅", label:"Asistencia",   color:"#4ECDC4", id:"asistencia"   },
    { icon:"🚢", label:"Contenedores", color:"#6366F1", id:"contenedores" },
    { icon:"🍋", label:"Recepción",    color:"#00C9A7", id:"recepciones"  },
    { icon:"📊", label:"Informes",     color:"#FF6B6B", id:"informes"     },
    { icon:"🚢", label:"Exportación",  color:"#0EA5E9", id:"documentos"   },
  ];

  const hayTendencia = tendencia.some(d => d.p > 0 || d.a > 0);

  if (loadingInvInicio || loadingAsistInicio || loadingPersonalInicio) {
    return <LimonLoader texto="Cargando panel" />;
  }

  const primerNombre = usuario?.nombre?.split(" ")[0] || "";

  return (
    <div>
      {/* ── SALUDO al usuario actual ── */}
      {primerNombre && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize: mob ? 18 : 22, fontWeight:800, fontFamily:"'Syne',sans-serif", color:"white", letterSpacing:-0.5 }}>
            Hola, {primerNombre} 👋
          </div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.52)", marginTop:2 }}>
            Sistema en línea y listo para el proceso, ¡éxitos!
          </div>
        </div>
      )}

      {/* ── HEADER: Fecha/Hora + Clima ── */}
      <div style={{ display:"grid", gridTemplateColumns: mob ? "1fr" : "1fr auto", gap:10, marginBottom:14 }}>
        <div style={{ background:"linear-gradient(135deg,rgba(0,201,167,0.07),rgba(132,94,247,0.07))", border:"1px solid rgba(255,255,255,0.10)", borderRadius:14, padding: mob ? "10px 14px" : "14px 18px" }}>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", marginBottom:2, textTransform:"capitalize" }}>
            {mob
              ? hora.toLocaleDateString("es-CO",{weekday:"short",month:"short",day:"numeric"})
              : hora.toLocaleDateString("es-CO",{weekday:"long",year:"numeric",month:"long",day:"numeric"})
            }
          </div>
          <div style={{ fontSize: mob ? 30 : 36, fontWeight:800, fontFamily:"'Syne',sans-serif", color:"white", letterSpacing:-1, lineHeight:1 }}>
            {hora.toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}
            <span style={{ fontSize: mob ? 13 : 16, color:"rgba(255,255,255,0.38)", marginLeft:6, fontFamily:"'DM Sans',sans-serif", fontWeight:400 }}>:{String(hora.getSeconds()).padStart(2,"0")}</span>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:6, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ fontSize:9, background:"rgba(0,201,167,0.15)", color:"#00C9A7", borderRadius:20, padding:"2px 10px", fontWeight:700 }}>● En línea</span>
            {alertaCount > 0 && <span style={{ fontSize:9, background:"rgba(255,107,107,0.15)", color:"#FF6B6B", borderRadius:20, padding:"2px 10px", fontWeight:700 }}>⚠️ {alertaCount} alertas</span>}
            {mob && clima && <span style={{ fontSize:9, color:"rgba(56,189,248,0.8)", fontWeight:600 }}>{w.icon} {Math.round(clima.temperature_2m)}°C · Girón</span>}
            {!mob && <span style={{ fontSize:9, color:"rgba(255,255,255,0.38)" }}>🍋 Girón, Santander</span>}
          </div>
        </div>

        {/* Widget de clima — oculto en móvil */}
        {!mob && <div style={{ background:"rgba(56,189,248,0.06)", border:"1px solid rgba(56,189,248,0.2)", borderRadius:14, padding:"14px 16px", minWidth:120, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", textAlign:"center", gap:3 }}>
          <div style={{ fontSize:26 }}>{w.icon}</div>
          {clima ? (
            <>
              <div style={{ fontSize:22, fontWeight:800, color:"#38bdf8", lineHeight:1 }}>{Math.round(clima.temperature_2m)}°C</div>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.52)" }}>{w.desc}</div>
              <div style={{ fontSize:8, color:"rgba(255,255,255,0.38)", marginTop:2 }}>💧{clima.relative_humidity_2m}% · 💨{Math.round(clima.wind_speed_10m)}km/h</div>
            </>
          ) : (
            <div style={{ fontSize:9, color:"rgba(56,189,248,0.4)" }}>Conectando…</div>
          )}
        </div>}
      </div>

      {/* ── KPIs — 3 col desktop / 2 col móvil / 1 col < 480px ── */}
      <div style={{ display:"grid", gridTemplateColumns: small ? "1fr" : mob ? "repeat(2,1fr)" : "repeat(3,1fr)", gap:8, marginBottom:14 }}>

        {/* Asistencia hoy */}
        <div style={{ background:"rgba(78,205,196,0.06)", border:`1px solid rgba(78,205,196,${asistHoy.total>0?0.28:0.1})`, borderRadius:12, padding:"12px 14px" }}>
          <div style={{ fontSize:9, color:"rgba(78,205,196,0.7)", textTransform:"uppercase", letterSpacing:0.8, fontWeight:700, marginBottom:5 }}>📅 Asistencia hoy</div>
          <div style={{ display:"flex", alignItems:"baseline", gap:5, marginBottom:4 }}>
            <span style={{ fontSize:28, fontWeight:800, color:"#4ECDC4", lineHeight:1 }}>{asistHoy.total > 0 ? asistHoy.p : "—"}</span>
            {asistHoy.total > 0 && <span style={{ fontSize:10, color:"rgba(255,255,255,0.48)" }}>presentes</span>}
          </div>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.42)", marginBottom:8 }}>
            {asistHoy.total > 0 ? `${asistHoy.a} ausentes · ${asistHoy.t} tardanzas` : "Sin registros aún — ve a Asistencia"}
          </div>
          <div style={{ display:"flex", gap:4 }}>
            {[["✅",asistHoy.p,"#00C9A7"],["❌",asistHoy.a,"#FF6B6B"],["⏰",asistHoy.t,"#F9A826"],["📋",asistHoy.lp,"#845EF7"]].map(([ic,v,c])=>(
              <div key={ic} style={{ flex:1, background:`${c}12`, borderRadius:6, padding:"3px 2px", textAlign:"center" }}>
                <div style={{ fontSize:8 }}>{ic}</div>
                <div style={{ fontSize:11, fontWeight:800, color:c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Personal */}
        <div style={{ background:"rgba(0,201,167,0.05)", border:"1px solid rgba(0,201,167,0.14)", borderRadius:12, padding:"12px 14px" }}>
          <div style={{ fontSize:9, color:"rgba(0,201,167,0.7)", textTransform:"uppercase", letterSpacing:0.8, fontWeight:700, marginBottom:5 }}>👥 Personal</div>
          <div style={{ fontSize:28, fontWeight:800, color:"#00C9A7", lineHeight:1, marginBottom:4 }}>{empleadosReal.length}</div>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.42)", marginBottom:8 }}>empleados registrados</div>
          <div style={{ display:"flex", gap:4 }}>
            {[["CC Col",empleadosReal.filter(e=>e.doc==="CC Nacional").length,"#00C9A7"],
              ["Venezuela",empleadosReal.filter(e=>e.doc==="CC Venezuela").length,"#F9A826"],
              ["PPT",empleadosReal.filter(e=>e.doc==="PPT").length,"#845EF7"]].map(([l,v,c])=>(
              <div key={l} style={{ flex:1, textAlign:"center", background:`${c}10`, borderRadius:6, padding:"3px 2px" }}>
                <div style={{ fontSize:11, fontWeight:800, color:c }}>{v}</div>
                <div style={{ fontSize:7, color:"rgba(255,255,255,0.38)", lineHeight:1.3 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Nómina */}
        <div style={{ background:"rgba(249,168,38,0.05)", border:"1px solid rgba(249,168,38,0.14)", borderRadius:12, padding:"12px 14px" }}>
          <div style={{ fontSize:9, color:"rgba(249,168,38,0.7)", textTransform:"uppercase", letterSpacing:0.8, fontWeight:700, marginBottom:5 }}>💰 Nómina fija/mes</div>
          <div style={{ fontSize:22, fontWeight:800, color:"#F9A826", lineHeight:1, marginBottom:4 }}>${(nominaFija/1000000).toFixed(2)}M</div>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.42)", marginBottom:6 }}>COP · base mensual estimada</div>
          <div style={{ fontSize:9, color:"rgba(249,168,38,0.5)", lineHeight:1.7 }}>
            Salario base: ${SALARIO_MINIMO.toLocaleString("es-CO")}<br/>
            Desc. ×3: ${(QUINCENA_DESCARGUE*6).toLocaleString("es-CO")}
          </div>
        </div>

        {/* Inventario */}
        <div onClick={()=>onNavigate("inventario")} style={{ background:bajoStock.length>0?"rgba(255,107,107,0.06)":"rgba(0,201,167,0.04)", border:`1px solid ${bajoStock.length>0?"rgba(255,107,107,0.22)":"rgba(0,201,167,0.14)"}`, borderRadius:12, padding:"12px 14px", cursor:"pointer" }}>
          <div style={{ fontSize:9, color:bajoStock.length>0?"rgba(255,107,107,0.8)":"rgba(0,201,167,0.7)", textTransform:"uppercase", letterSpacing:0.8, fontWeight:700, marginBottom:5 }}>📦 Inventario</div>
          <div style={{ fontSize:28, fontWeight:800, color:bajoStock.length>0?"#FF6B6B":"#00C9A7", lineHeight:1, marginBottom:4 }}>{bajoStock.length}</div>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.42)", marginBottom:4 }}>productos bajo mínimo</div>
          {bajoStock.length > 0
            ? <div style={{ fontSize:9, color:"rgba(255,107,107,0.6)", lineHeight:1.4 }}>{bajoStock.slice(0,2).map(i=>i.nombre).join(", ")}{bajoStock.length>2?` +${bajoStock.length-2}`:""}</div>
            : <div style={{ fontSize:9, color:"rgba(0,201,167,0.55)" }}>✓ Stock en niveles normales</div>
          }
        </div>

        {/* Proceso */}
        <div onClick={()=>onNavigate("nomina")} style={{ background:"rgba(132,94,247,0.05)", border:"1px solid rgba(132,94,247,0.14)", borderRadius:12, padding:"12px 14px", cursor:"pointer" }}>
          <div style={{ fontSize:9, color:"rgba(132,94,247,0.7)", textTransform:"uppercase", letterSpacing:0.8, fontWeight:700, marginBottom:5 }}>🏭 Proceso</div>
          <div style={{ fontSize:28, fontWeight:800, color:"#845EF7", lineHeight:1, marginBottom:4 }}>{PROCESO_BASE.length}</div>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.42)", marginBottom:4 }}>personas en proceso hoy</div>
          <div style={{ fontSize:9, color:"rgba(132,94,247,0.6)" }}>📦 ${VALOR_CONTENEDOR.toLocaleString("es-CO")} por contenedor</div>
        </div>
      </div>

      {/* ── ALERTAS + ACTIVIDAD RECIENTE ── */}
      <div style={{ display:"grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap:10, marginBottom:14 }}>

        {/* Alertas */}
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${alertaCount>0?"rgba(255,107,107,0.18)":"rgba(255,255,255,0.06)"}`, borderRadius:12, padding:"12px 14px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:alertaCount>0?"#FF6B6B":"rgba(255,255,255,0.45)", marginBottom:10 }}>
            🔔 {alertaCount>0?`Alertas activas (${alertaCount})`:"Sin alertas"}
          </div>
          {alertaCount === 0
            ? <div style={{ fontSize:11, color:"rgba(0,201,167,0.65)", textAlign:"center", padding:"14px 0" }}>✅ Todo en orden</div>
            : <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {bajoStock.slice(0,3).map((item,i)=>(
                  <div key={i} onClick={()=>onNavigate("inventario")} style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer", padding:"6px 8px", borderRadius:8, background:"rgba(249,168,38,0.07)", border:"1px solid rgba(249,168,38,0.15)" }}>
                    <span style={{ fontSize:13 }}>⚠️</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:10, color:"#F9A826", fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.nombre}</div>
                      <div style={{ fontSize:8, color:"rgba(255,255,255,0.38)" }}>{item.cant} {item.unidad} — mín: {item.minimo}</div>
                    </div>
                  </div>
                ))}
                {bajoStock.length > 3 && <div style={{ fontSize:9, color:"rgba(255,255,255,0.38)", textAlign:"center" }}>+{bajoStock.length-3} productos más en inventario</div>}
                {sinCuenta>0 && (
                  <div onClick={()=>onNavigate("personal")} style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer", padding:"6px 8px", borderRadius:8, background:"rgba(255,107,107,0.07)", border:"1px solid rgba(255,107,107,0.15)" }}>
                    <span style={{ fontSize:13 }}>🏦</span>
                    <div>
                      <div style={{ fontSize:10, color:"#FF6B6B", fontWeight:700 }}>{sinCuenta} sin cuenta bancaria</div>
                      <div style={{ fontSize:8, color:"rgba(255,255,255,0.38)" }}>No pueden recibir nómina digital</div>
                    </div>
                  </div>
                )}
                {sinTel>0 && (
                  <div onClick={()=>onNavigate("personal")} style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer", padding:"6px 8px", borderRadius:8, background:"rgba(132,94,247,0.07)", border:"1px solid rgba(132,94,247,0.15)" }}>
                    <span style={{ fontSize:13 }}>📵</span>
                    <div>
                      <div style={{ fontSize:10, color:"#845EF7", fontWeight:700 }}>{sinTel} sin teléfono registrado</div>
                      <div style={{ fontSize:8, color:"rgba(255,255,255,0.38)" }}>No reciben notificaciones WhatsApp</div>
                    </div>
                  </div>
                )}
              </div>
          }
        </div>

        {/* Actividad reciente */}
        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, padding:"12px 14px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.52)", marginBottom:10 }}>🕐 Actividad reciente</div>
          <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
            {actividadReciente.length === 0 && (
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.33)", textAlign:"center", padding:"10px 0" }}>Sin actividad reciente registrada</div>
            )}
            {actividadReciente.slice(0,4).map((a,i)=>(
              <div key={i} style={{ display:"flex", gap:8, alignItems:"center", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ fontSize:13, flexShrink:0 }}>{a.icon}</span>
                <span style={{ flex:1, fontSize:10, color:"rgba(255,255,255,0.68)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.text}</span>
                <span style={{ fontSize:8, color:"rgba(255,255,255,0.33)", flexShrink:0 }}>{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── GRÁFICA TENDENCIA ASISTENCIA 7 DÍAS ── */}
      {hayTendencia && (
        <div style={{ background:"rgba(78,205,196,0.04)", border:"1px solid rgba(78,205,196,0.12)", borderRadius:12, padding:"12px 14px", marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.58)" }}>📊 Tendencia asistencia — últimos 7 días</div>
            <div style={{ display:"flex", gap:10 }}>
              {[["Presentes","#4ECDC4"],["Ausentes","rgba(255,107,107,0.6)"]].map(([l,c])=>(
                <div key={l} style={{ display:"flex", alignItems:"center", gap:4, fontSize:8, color:"rgba(255,255,255,0.38)" }}>
                  <div style={{ width:8, height:8, borderRadius:2, background:c }}/>{l}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:5, height:60 }}>
            {tendencia.map((d,i) => {
              const maxVal = Math.max(...tendencia.map(x=>x.p+x.a), 1);
              const hp = ((d.p / maxVal) * 46).toFixed(1);
              const ha = ((d.a / maxVal) * 46).toFixed(1);
              return (
                <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                  <div style={{ display:"flex", flexDirection:"column-reverse", alignItems:"center", height:50, justifyContent:"flex-start", gap:1 }}>
                    {d.p > 0 && <div style={{ width:"100%", height:`${hp}px`, background:d.esHoy?"#4ECDC4":"rgba(78,205,196,0.4)", borderRadius:"2px 2px 0 0", transition:"height 0.4s" }}/>}
                    {d.a > 0 && <div style={{ width:"100%", height:`${ha}px`, background:"rgba(255,107,107,0.55)", borderRadius:"2px 2px 0 0" }}/>}
                    {d.p === 0 && d.a === 0 && <div style={{ width:"70%", height:2, background:"rgba(255,255,255,0.08)", borderRadius:1 }}/>}
                  </div>
                  <div style={{ fontSize:8, color:d.esHoy?"#4ECDC4":"rgba(255,255,255,0.28)", fontWeight:d.esHoy?700:400 }}>{d.label}</div>
                  {(d.p>0||d.a>0) && <div style={{ fontSize:7, color:"rgba(255,255,255,0.42)" }}>{d.p+d.a}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ACCESO RÁPIDO ── */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.38)", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>⚡ Acceso rápido</div>
        <div style={{ display:"grid", gridTemplateColumns:mob?"repeat(2,1fr)":"repeat(4,1fr)", gap:6 }}>
          {quickMods.map((m,i)=>{
            const acceso = !puedeAcceder || puedeAcceder(m.id);
            return (
              <button key={i} onClick={()=>{ if (acceso) onNavigate(m.id); }} style={{ background: acceso ? `${m.color}0e` : "rgba(255,255,255,0.02)", border:`1px solid ${acceso ? m.color+"30" : "rgba(255,255,255,0.08)"}`, borderRadius:10, padding:"10px 6px", cursor: acceso ? "pointer" : "not-allowed", textAlign:"center", transition:"all 0.15s", opacity: acceso ? 1 : 0.45 }}>
                <div style={{ fontSize:20 }}>{acceso ? m.icon : "🔒"}</div>
                <div style={{ fontSize:9, color: acceso ? m.color : "rgba(255,255,255,0.35)", fontWeight:700, marginTop:4, lineHeight:1.2 }}>{m.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── INFO EMPRESA + TARIFAS ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:10, padding:12 }}>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", fontWeight:700, marginBottom:8 }}>🏢 Empresa</div>
          {[["Nombre","Tierra Prometida Trading"],["Ubicación","Lebrija & Girón, Stder."],["Actividad","Proc. y exp. de frutas"],["Producto","Limón Tahití"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"3px 0", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ fontSize:10, color:"rgba(255,255,255,0.38)" }}>{l}</span>
              <span style={{ fontSize:10, color:"rgba(255,255,255,0.78)", fontWeight:600 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:10, padding:12 }}>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.48)", fontWeight:700, marginBottom:8 }}>💼 Tarifas activas</div>
          {[["Por contenedor",`$${VALOR_CONTENEDOR.toLocaleString("es-CO")}`],["Salario mínimo",`$${SALARIO_MINIMO.toLocaleString("es-CO")}`],["Quincena desc.",`$${QUINCENA_DESCARGUE.toLocaleString("es-CO")}`],["Personal proceso",`${PROCESO_BASE.length} personas`]].map(([l,v])=>(
            <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"3px 0", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ fontSize:10, color:"rgba(255,255,255,0.38)" }}>{l}</span>
              <span style={{ fontSize:10, color:"#F9A826", fontWeight:700 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── HELPERS CONFIGURACIÓN ────────────────────────────────────
function SaveBtn({ onClick, label = "Guardar cambios" }) {
  return (
    <button onClick={onClick} style={{ background:"linear-gradient(135deg,#64748B,#475569)", border:"none", borderRadius:10, padding:"10px 22px", color:"white", fontSize:13, fontWeight:700, cursor:"pointer", marginTop:4, letterSpacing:0.2 }}>
      💾 {label}
    </button>
  );
}

function Toggle({ value, onChange, label }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 0", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
      <span style={{ fontSize:13, color:"rgba(255,255,255,0.85)" }}>{label}</span>
      <div onClick={() => onChange(!value)} style={{ width:44, height:25, borderRadius:13, background:value?"#00C9A7":"rgba(255,255,255,0.12)", cursor:"pointer", position:"relative", transition:"background 0.22s", flexShrink:0 }}>
        <div style={{ position:"absolute", top:3, left:value?21:3, width:19, height:19, borderRadius:"50%", background:"white", transition:"left 0.22s", boxShadow:"0 2px 5px rgba(0,0,0,0.35)" }} />
      </div>
    </div>
  );
}

// ─── MÓDULO CONFIGURACIÓN ─────────────────────────────────────
function ConfiguracionDemo() {
  const { config, loading, guardar } = useConfiguracion();
  if (loading) return <div style={{ textAlign:"center", padding:40, color:"rgba(255,255,255,0.38)", fontSize:13 }}>Cargando configuración...</div>;
  return <ConfigForm config={config} guardar={guardar} />;
}

function ConfigForm({ config, guardar }) {
  const mob = useM();
  const [tabIdx,     setTabIdx]     = useState(0);
  const [toast,      setToast]      = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const logoRef = useRef(null);

  const load = (k, def) => config[k] ?? def;
  const save = async (k, data, msg) => {
    const { error } = await guardar(k, data);
    if (error) { showToast("Error al guardar: " + error.message, false); return; }
    showToast(msg || "Cambios guardados ✓");
  };
  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  // ── State por tab ──
  const [empresa, setEmpresa] = useState(() => load("cfg_empresa", {
    nombre:"Tierra Prometida Trading", nit:"", direccion:"Lebrija, Santander", ciudad:"Lebrija",
    telefono:"", email:"operaciones@tierraprometidat.com", web:"tierraprometidat.com",
    representante:"Juan Abuchaibe", banco:"", tipoCuenta:"Corriente", numeroCuenta:"", titular:"", logo:"",
  }));

  const [cfgUsuarios, setCfgUsuarios] = useState(() => load("cfg_usuarios", [
    { id:1, nombre:"Juan Abuchaibe", cedula:"123456789", rol:"Owner",         avatar:"JA", permisos:[] },
    { id:2, nombre:"Lennix Vega",    cedula:"63557421",  rol:"Administración", avatar:"LV", permisos:[] },
  ]));
  const [nuevoUsr, setNuevoUsr] = useState({ nombre:"", cedula:"", rol:"Operario" });
  const [editandoUsr, setEditandoUsr] = useState(null);
  const [editUsrForm, setEditUsrForm] = useState({ nombre:"", cedula:"", rol:"Operario" });

  const [correos, setCorreos] = useState(() => load("cfg_correos", {
    temperatura: { para:"", cc:"", bcc:"", asunto:"Carta de Temperatura — {fecha}", firma:"" },
    proforma:    { para:"", cc:"", bcc:"", asunto:"Proforma #{consecutivo} — Tierra Prometida Trading", firma:"" },
    isf:         { para:"", cc:"", bcc:"", asunto:"ISF 10+2 — Contenedor {contenedor}", firma:"" },
  }));

  const [expData, setExpData] = useState(() => load("cfg_exportacion", {
    clientes:    [{ id:1, nombre:"Princesses Kingdom Corp", ciudad:"Miami", pais:"USA", email:"", tel:"+17867102522" }],
    navieras:    [{ id:1, nombre:"MSC", codigo:"MSC", contacto:"", diasLibres:null, diasLibresDesde:"" }],
    puertos:       ["Miami, FL", "Port Everglades, FL"],
    puertosOrigen: [],
    transportadoras: [],
    consignees:  [],
    brokers:     [],
    kgPorCaja:   10,
    precioUSDkg: 0.45,
  }));

  const [nominaCfg, setNominaCfg] = useState(() => load("cfg_nomina", {
    valorContenedor:180000, salarioMinimo:1750000, valorQuincena:1000000,
    areas:["Alimentador","Selección","Empaque","Pesador","Cajas","Paletizador","Descargador","PLU","Administración"],
    nuevoArea:"",
  }));

  const [notifCfg, setNotifCfg] = useState(() => load("cfg_notif", {
    pagoQuincenal:true, docsExport:true, stockBajo:true, sinAsistencia:false, whatsapp:"",
  }));

  const [apariencia, setApariencia] = useState(() => load("cfg_apariencia", {
    tema:"oscuro", colorPrincipal:"#00C9A7", animaciones:true,
  }));

  const [seguridad, setSeguridad] = useState(() => load("cfg_seguridad", {
    tiempoSesion:"8h",
    historial: [], // No hay mecanismo real que registre accesos todavía — no inventar entradas.
  }));
  const [pw, setPw] = useState({ actual:"", nuevo:"", confirmar:"" });

  const ACCIONES_PROTEGIBLES = [
    { id:"paso1_packing", nombre:"Paso 1 — Packing List", desc:"Calibres y checklist de Control de Calidad y Cargue" },
  ];
  const [clavesAcceso, setClavesAcceso] = useState(() => load("cfg_claves_acceso", {}));
  const [clavesVisibles, setClavesVisibles] = useState({});

  const [fiscal, setFiscal] = useState(() => load("cfg_fiscal", {
    regimen:"Régimen Ordinario", responsabilidades:"",
    ciudadExpedicion:"Lebrija", prefijoFactura:"FPE", consecutivo:1,
    resolucionDIAN:"", fechaResolucion:"",
  }));

  // ── Estilo helpers ──
  const iS = (extra) => ({ width:"100%", background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"9px 12px", color:"white", fontSize:13, fontFamily:"inherit", boxSizing:"border-box", outline:"none", ...extra });
  const lS = { fontSize:10, color:"rgba(255,255,255,0.5)", fontWeight:700, textTransform:"uppercase", letterSpacing:0.6, marginBottom:5, display:"block" };
  const secS = { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.10)", borderRadius:12, padding:"18px 20px", marginBottom:16 };
  const secH = { fontWeight:700, fontSize:13, marginBottom:14, color:"rgba(255,255,255,0.92)" };

  const ROL_COLORS = { Owner:"#F9A826", Administrador:"#845EF7", Administración:"#845EF7", Supervisor:"#0EA5E9", Operario:"#00C9A7" };
  const MOD_NAMES  = ["Inicio","Estadísticas","Personal","Contenedores","Recepción","Inventario","Nómina","Informes","Asistencia","Exportación","Logística","Control Expo","Configuración"];
  const TABS = [
    {icon:"🏢",label:"Empresa"},{icon:"👤",label:"Usuarios"},{icon:"📧",label:"Correos"},
    {icon:"🚢",label:"Exportación"},{icon:"💰",label:"Nómina"},{icon:"🔔",label:"Notific."},
    {icon:"🎨",label:"Apariencia"},{icon:"🔒",label:"Seguridad"},{icon:"📋",label:"Fiscal"},
  ];
  const COLORES_PRESET = ["#00C9A7","#845EF7","#F9A826","#FF6B6B","#0EA5E9","#6366F1","#25D366","#E11D48"];

  return (
    <div style={{ position:"relative", maxWidth:860, margin:"0 auto" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:20, right:20, zIndex:9999, background:toast.ok?"#1e3a34":"#3a1e1e", border:`1px solid ${toast.ok?"#00C9A7":"#FF6B6B"}`, color:toast.ok?"#00C9A7":"#FF6B6B", padding:"12px 20px", borderRadius:12, fontSize:13, fontWeight:700, boxShadow:"0 8px 28px rgba(0,0,0,0.55)", display:"flex", alignItems:"center", gap:8 }}>
          <span>{toast.ok?"✅":"❌"}</span> {toast.msg}
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDel && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.72)", zIndex:8888, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"#181a26", border:"1px solid rgba(255,107,107,0.3)", borderRadius:16, padding:28, maxWidth:320, width:"100%", textAlign:"center" }}>
            <div style={{ fontSize:30, marginBottom:10 }}>⚠️</div>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>¿Eliminar este registro?</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.52)", marginBottom:22 }}>Esta acción no se puede deshacer.</div>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button onClick={() => { confirmDel.action(); setConfirmDel(null); }} style={{ background:"rgba(255,107,107,0.18)", border:"1px solid #FF6B6B", borderRadius:9, padding:"9px 22px", color:"#FF6B6B", cursor:"pointer", fontWeight:700, fontSize:13, fontFamily:"inherit" }}>Eliminar</button>
              <button onClick={() => setConfirmDel(null)} style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:9, padding:"9px 22px", color:"white", cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Tab strip */}
      <div style={{ display:"flex", gap:4, overflowX:"auto", marginBottom:20, paddingBottom:2, scrollbarWidth:"none" }}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTabIdx(i)} style={{
            background: tabIdx===i ? "rgba(100,116,139,0.22)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${tabIdx===i ? "#64748B90" : "rgba(255,255,255,0.07)"}`,
            borderTop: `2px solid ${tabIdx===i ? "#64748B" : "transparent"}`,
            borderRadius:8, padding:"8px 13px", cursor:"pointer",
            color: tabIdx===i ? "#94a3b8" : "rgba(255,255,255,0.42)",
            fontWeight:700, fontSize:12, whiteSpace:"nowrap", flexShrink:0,
            transition:"all 0.18s", fontFamily:"inherit",
            display:"flex", alignItems:"center", gap:5,
          }}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── TAB 1: EMPRESA ── */}
      {tabIdx === 0 && (
        <div>
          <div style={secS}>
            <div style={secH}>🖼️ Identidad Corporativa</div>
            <div style={{ display:"flex", gap:16, alignItems:"flex-start", flexWrap:"wrap" }}>
              <div onClick={() => logoRef.current?.click()} style={{ width:88, height:88, borderRadius:14, border:"2px dashed rgba(255,255,255,0.14)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0, overflow:"hidden", background:"rgba(255,255,255,0.05)", transition:"border-color 0.2s" }}>
                {empresa.logo ? <img src={empresa.logo} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="logo" /> : <div style={{ textAlign:"center", fontSize:11, color:"rgba(255,255,255,0.36)", lineHeight:1.6 }}>📷<br/>Logo</div>}
              </div>
              <input ref={logoRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => {
                const f = e.target.files[0]; if (!f) return;
                const r = new FileReader(); r.onload = ev => setEmpresa(p => ({...p, logo:ev.target.result})); r.readAsDataURL(f);
              }} />
              <div style={{ flex:1, minWidth:180 }}>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.58)", marginBottom:6, lineHeight:1.5 }}>Haz clic en el recuadro para subir tu logo.<br/>PNG, JPG o SVG · Máx. 2 MB</div>
                {empresa.logo && <button onClick={() => setEmpresa(p=>({...p,logo:""}))} style={{ marginTop:8, background:"rgba(255,107,107,0.1)", border:"1px solid #FF6B6B50", borderRadius:6, padding:"5px 12px", fontSize:11, color:"#FF6B6B", cursor:"pointer", fontFamily:"inherit" }}>✕ Quitar logo</button>}
              </div>
            </div>
          </div>

          <div style={secS}>
            <div style={secH}>📄 Datos Generales</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              {[["nombre","Razón Social"],["nit","NIT"],["representante","Representante Legal"],["ciudad","Ciudad / Municipio"],["telefono","Teléfono"],["email","Email corporativo"],["web","Sitio Web"]].map(([k,l]) => (
                <div key={k}>
                  <label style={lS}>{l}</label>
                  <input style={iS()} value={empresa[k]||""} onChange={e=>setEmpresa(p=>({...p,[k]:e.target.value}))} placeholder={l} />
                </div>
              ))}
              <div style={{ gridColumn:"1 / -1" }}>
                <label style={lS}>Dirección</label>
                <input style={iS()} value={empresa.direccion||""} onChange={e=>setEmpresa(p=>({...p,direccion:e.target.value}))} placeholder="Dirección completa" />
              </div>
            </div>
          </div>

          <div style={secS}>
            <div style={secH}>🏦 Datos Bancarios</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              {[["banco","Banco"],["tipoCuenta","Tipo de Cuenta"],["numeroCuenta","Número de Cuenta"],["titular","Titular"]].map(([k,l]) => (
                <div key={k}>
                  <label style={lS}>{l}</label>
                  <input style={iS()} value={empresa[k]||""} onChange={e=>setEmpresa(p=>({...p,[k]:e.target.value}))} placeholder={l} />
                </div>
              ))}
            </div>
          </div>
          <SaveBtn onClick={() => save("cfg_empresa", empresa)} />
        </div>
      )}

      {/* ── TAB 2: USUARIOS ── */}
      {tabIdx === 1 && (
        <div>
          <div style={secS}>
            <div style={secH}>👥 Usuarios del Sistema</div>
            {cfgUsuarios.map(u => editandoUsr === u.id ? (
              <div key={u.id} style={{ padding:"13px 0", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                  <div>
                    <label style={lS}>Nombre completo</label>
                    <input style={iS()} value={editUsrForm.nombre} onChange={e=>setEditUsrForm(p=>({...p,nombre:e.target.value}))} placeholder="Nombre completo" />
                  </div>
                  <div>
                    <label style={lS}>Cédula</label>
                    <input style={iS()} value={editUsrForm.cedula} onChange={e=>setEditUsrForm(p=>({...p,cedula:e.target.value}))} placeholder="Número de cédula" />
                  </div>
                  <div>
                    <label style={lS}>Rol</label>
                    <CustomSelect style={iS()} value={editUsrForm.rol} onChange={e=>setEditUsrForm(p=>({...p,rol:e.target.value}))}>
                      {["Owner","Administrador","Supervisor","Operario"].map(r=><option key={r} value={r} style={{ background:"#1a1c26" }}>{r}</option>)}
                    </CustomSelect>
                  </div>
                </div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginTop:8 }}>Nombre y cédula son lo que la persona escribe para entrar — si los cambias, avísale.</div>
                <div style={{ display:"flex", gap:8, marginTop:10 }}>
                  <button onClick={() => {
                    if (!editUsrForm.nombre.trim() || !editUsrForm.cedula.trim()) { showToast("Completa nombre y cédula", false); return; }
                    const avatar = editUsrForm.nombre.trim().split(" ").slice(0,2).map(x=>x[0]).join("").toUpperCase();
                    setCfgUsuarios(prev => {
                      const next = prev.map(x => x.id===u.id ? { ...x, nombre:editUsrForm.nombre.trim(), cedula:editUsrForm.cedula.trim(), rol:editUsrForm.rol, avatar } : x);
                      save("cfg_usuarios", next, "Usuario actualizado ✓");
                      return next;
                    });
                    setEditandoUsr(null);
                  }} style={{ background:"linear-gradient(135deg,#6366F1,#0891b2)", border:"none", borderRadius:8, padding:"8px 16px", color:"white", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>✅ Guardar</button>
                  <button onClick={() => setEditandoUsr(null)} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"8px 14px", color:"rgba(255,255,255,0.58)", cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div key={u.id} style={{ display:"flex", gap:12, alignItems:"flex-start", padding:"13px 0", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ width:38, height:38, borderRadius:10, background:`${ROL_COLORS[u.rol]||"#64748B"}22`, border:`1px solid ${ROL_COLORS[u.rol]||"#64748B"}50`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:ROL_COLORS[u.rol]||"#94a3b8", flexShrink:0 }}>{u.avatar||u.nombre[0]}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{u.nombre}</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", marginTop:1 }}>Cédula: {u.cedula}</div>
                  <span style={{ display:"inline-block", marginTop:5, fontSize:10, fontWeight:700, color:ROL_COLORS[u.rol]||"#94a3b8", background:`${ROL_COLORS[u.rol]||"#64748B"}20`, padding:"2px 9px", borderRadius:5 }}>{u.rol}</span>
                  <div style={{ marginTop:9, display:"flex", flexWrap:"wrap", gap:4 }}>
                    {MOD_NAMES.map(mn => {
                      const hasP = !u.permisos?.length || u.permisos.includes(mn);
                      return (
                        <div key={mn} onClick={() => {
                          const cur = u.permisos?.length ? u.permisos : [...MOD_NAMES];
                          const next = cur.includes(mn) ? cur.filter(x=>x!==mn) : [...cur, mn];
                          setCfgUsuarios(prev => prev.map(x => x.id===u.id ? {...x,permisos:next} : x));
                        }} style={{ fontSize:10, padding:"2px 7px", borderRadius:5, cursor:"pointer", fontWeight:600, transition:"all 0.15s",
                          background: hasP ? "rgba(132,94,247,0.12)" : "rgba(255,255,255,0.04)",
                          color: hasP ? "#845EF7" : "rgba(255,255,255,0.28)",
                          border: `1px solid ${hasP?"#845EF740":"rgba(255,255,255,0.06)"}`,
                        }}>{mn}</div>
                      );
                    })}
                  </div>
                </div>
                <button onClick={() => { setEditandoUsr(u.id); setEditUsrForm({ nombre:u.nombre, cedula:u.cedula, rol:u.rol }); }} style={{ background:"rgba(132,94,247,0.1)", border:"1px solid rgba(132,94,247,0.3)", borderRadius:7, padding:"6px 10px", color:"#845EF7", cursor:"pointer", fontSize:12, flexShrink:0, fontFamily:"inherit" }}>✏️</button>
                {u.rol !== "Owner" && (
                  <button onClick={() => setConfirmDel({ action:() => setCfgUsuarios(prev=>prev.filter(x=>x.id!==u.id)) })} style={{ background:"rgba(255,107,107,0.08)", border:"1px solid #FF6B6B30", borderRadius:7, padding:"6px 10px", color:"#FF6B6B", cursor:"pointer", fontSize:12, flexShrink:0, fontFamily:"inherit" }}>✕</button>
                )}
              </div>
            ))}
          </div>

          <div style={secS}>
            <div style={secH}>➕ Agregar Usuario</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
              <div>
                <label style={lS}>Nombre completo</label>
                <input style={iS()} value={nuevoUsr.nombre} onChange={e=>setNuevoUsr(p=>({...p,nombre:e.target.value}))} placeholder="Nombre completo" />
              </div>
              <div>
                <label style={lS}>Cédula</label>
                <input style={iS()} value={nuevoUsr.cedula} onChange={e=>setNuevoUsr(p=>({...p,cedula:e.target.value}))} placeholder="Número de cédula" />
              </div>
              <div>
                <label style={lS}>Rol</label>
                <CustomSelect style={iS()} value={nuevoUsr.rol} onChange={e=>setNuevoUsr(p=>({...p,rol:e.target.value}))}>
                  {["Owner","Administrador","Supervisor","Operario"].map(r=><option key={r} value={r} style={{ background:"#1a1c26" }}>{r}</option>)}
                </CustomSelect>
              </div>
            </div>
            <button onClick={() => {
              if (!nuevoUsr.nombre.trim() || !nuevoUsr.cedula.trim()) { showToast("Completa nombre y cédula", false); return; }
              const n = { id:Date.now(), nombre:nuevoUsr.nombre.trim(), cedula:nuevoUsr.cedula.trim(), rol:nuevoUsr.rol, avatar:nuevoUsr.nombre.trim().split(" ").slice(0,2).map(x=>x[0]).join("").toUpperCase(), permisos:[] };
              setCfgUsuarios(prev => { const next=[...prev,n]; save("cfg_usuarios",next,"Usuario agregado ✓"); return next; });
              setNuevoUsr({nombre:"",cedula:"",rol:"Operario"});
            }} style={{ marginTop:14, background:"linear-gradient(135deg,#6366F1,#0891b2)", border:"none", borderRadius:10, padding:"10px 22px", color:"white", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              ➕ Agregar usuario
            </button>
          </div>
          <SaveBtn onClick={() => save("cfg_usuarios", cfgUsuarios)} />
        </div>
      )}

      {/* ── TAB 3: CORREOS ── */}
      {tabIdx === 2 && (
        <div>
          {[
            { key:"temperatura", titulo:"🌡️ Carta de Temperatura" },
            { key:"proforma",    titulo:"📄 Factura Proforma" },
            { key:"isf",         titulo:"🚢 ISF 10+2" },
          ].map(({ key, titulo }) => (
            <div key={key} style={secS}>
              <div style={secH}>{titulo}</div>
              {[["para","Para (To)"],["cc","CC"],["bcc","BCC — Copia oculta"],["asunto","Asunto  ·  variables: {fecha} {cliente} {consecutivo} {contenedor}"]].map(([f,l]) => (
                <div key={f} style={{ marginBottom:12 }}>
                  <label style={lS}>{l}</label>
                  <input style={iS()} value={correos[key][f]} onChange={e=>setCorreos(p=>({...p,[key]:{...p[key],[f]:e.target.value}}))} placeholder={l} />
                </div>
              ))}
              <div style={{ marginBottom:12 }}>
                <label style={lS}>Firma corporativa</label>
                <textarea style={iS({ height:76, resize:"vertical", lineHeight:1.55 })} value={correos[key].firma} onChange={e=>setCorreos(p=>({...p,[key]:{...p[key],firma:e.target.value}}))} placeholder="Firma que aparecerá al final del email…" />
              </div>
              <button onClick={() => save("cfg_correos", correos, `${titulo} guardado ✓`)} style={{ background:"rgba(100,116,139,0.18)", border:"1px solid #64748B70", borderRadius:8, padding:"8px 16px", color:"#94a3b8", cursor:"pointer", fontWeight:700, fontSize:12, fontFamily:"inherit" }}>💾 Guardar sección</button>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB 4: EXPORTACIÓN ── */}
      {tabIdx === 3 && (
        <div>
          {/* Clientes */}
          <div style={secS}>
            <div style={secH}>🏢 Clientes Frecuentes</div>
            {expData.clientes.map((c, ci) => (
              <div key={c.id} style={{ padding:"12px 0", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                  {[["nombre","Nombre"],["ciudad","Ciudad"],["pais","País"],["email","Email"],["tel","Teléfono"]].map(([f,l]) => (
                    <div key={f}>
                      <label style={lS}>{l}</label>
                      <input style={iS()} value={c[f]||""} onChange={e=>setExpData(p=>({...p,clientes:p.clientes.map((x,xi)=>xi===ci?{...x,[f]:e.target.value}:x)}))} placeholder={l} />
                    </div>
                  ))}
                  <div style={{ display:"flex", alignItems:"flex-end" }}>
                    <button onClick={()=>setConfirmDel({action:()=>setExpData(p=>({...p,clientes:p.clientes.filter((_,xi)=>xi!==ci)}))})} style={{ background:"rgba(255,107,107,0.08)", border:"1px solid #FF6B6B35", borderRadius:7, padding:"9px 14px", color:"#FF6B6B", cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>✕ Eliminar</button>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={()=>setExpData(p=>({...p,clientes:[...p.clientes,{id:Date.now(),nombre:"",ciudad:"",pais:"",email:"",tel:""}]}))} style={{ marginTop:10, background:"rgba(132,94,247,0.1)", border:"1px solid #845EF740", borderRadius:8, padding:"8px 16px", color:"#845EF7", cursor:"pointer", fontWeight:700, fontSize:12, fontFamily:"inherit" }}>➕ Agregar cliente</button>
          </div>

          {/* Navieras */}
          <div style={secS}>
            <div style={secH}>⚓ Navieras Frecuentes</div>
            {expData.navieras.map((n, ni) => (
              <div key={n.id} style={{ display:"grid", gridTemplateColumns: mob ? "1fr 1fr" : "1fr 1fr 1fr 0.7fr 1.1fr auto", gap:10, marginBottom:10 }}>
                {[["nombre","Naviera"],["codigo","Código SCAC"],["contacto","Contacto"]].map(([f,l]) => (
                  <div key={f}>
                    <label style={lS}>{l}</label>
                    <input style={iS()} value={n[f]||""} onChange={e=>setExpData(p=>({...p,navieras:p.navieras.map((x,xi)=>xi===ni?{...x,[f]:e.target.value}:x)}))} placeholder={l} />
                  </div>
                ))}
                <div>
                  <label style={lS}>Días libres</label>
                  <input type="number" style={iS()} value={n.diasLibres ?? ""} onChange={e=>{const v=e.target.value; setExpData(p=>({...p,navieras:p.navieras.map((x,xi)=>xi===ni?{...x,diasLibres:v===""?null:Number(v)}:x)}));}} placeholder="Ej: 10" />
                </div>
                <div>
                  <label style={lS}>Días libres desde</label>
                  <CustomSelect value={n.diasLibresDesde || ""} onChange={e=>setExpData(p=>({...p,navieras:p.navieras.map((x,xi)=>xi===ni?{...x,diasLibresDesde:e.target.value}:x)}))} style={iS()}>
                    <option value="">No aplica</option>
                    <option value="ingreso_puerto">Ingreso a puerto</option>
                    <option value="asignacion">Asignación</option>
                  </CustomSelect>
                </div>
                <div style={{ display:"flex", alignItems:"flex-end" }}>
                  <button onClick={()=>setConfirmDel({action:()=>setExpData(p=>({...p,navieras:p.navieras.filter((_,xi)=>xi!==ni)}))})} style={{ background:"rgba(255,107,107,0.08)", border:"1px solid #FF6B6B35", borderRadius:7, padding:"9px 11px", color:"#FF6B6B", cursor:"pointer", fontFamily:"inherit" }}>✕</button>
                </div>
              </div>
            ))}
            <button onClick={()=>setExpData(p=>({...p,navieras:[...p.navieras,{id:Date.now(),nombre:"",codigo:"",contacto:"",diasLibres:null,diasLibresDesde:""}]}))} style={{ marginTop:4, background:"rgba(132,94,247,0.1)", border:"1px solid #845EF740", borderRadius:8, padding:"8px 16px", color:"#845EF7", cursor:"pointer", fontWeight:700, fontSize:12, fontFamily:"inherit" }}>➕ Agregar naviera</button>
          </div>

          {/* Puertos */}
          <div style={secS}>
            <div style={secH}>🗺️ Puertos Destino Favoritos</div>
            {expData.puertos.map((p, pi) => (
              <div key={pi} style={{ display:"flex", gap:8, marginBottom:8 }}>
                <input style={iS({ flex:1 })} value={p} onChange={e=>setExpData(prev=>({...prev,puertos:prev.puertos.map((x,xi)=>xi===pi?e.target.value:x)}))} placeholder="Ej: Miami, FL" />
                <button onClick={()=>setExpData(prev=>({...prev,puertos:prev.puertos.filter((_,xi)=>xi!==pi)}))} style={{ background:"rgba(255,107,107,0.08)", border:"1px solid #FF6B6B35", borderRadius:7, padding:"9px 11px", color:"#FF6B6B", cursor:"pointer", flexShrink:0, fontFamily:"inherit" }}>✕</button>
              </div>
            ))}
            <button onClick={()=>setExpData(p=>({...p,puertos:[...p.puertos,""]}))} style={{ marginTop:4, background:"rgba(132,94,247,0.1)", border:"1px solid #845EF740", borderRadius:8, padding:"8px 16px", color:"#845EF7", cursor:"pointer", fontWeight:700, fontSize:12, fontFamily:"inherit" }}>➕ Agregar puerto</button>
          </div>

          {/* Puertos de origen (Logística) */}
          <div style={secS}>
            <div style={secH}>⛴️ Puertos de Origen (Colombia)</div>
            {(expData.puertosOrigen||[]).map((p, pi) => (
              <div key={pi} style={{ display:"flex", gap:8, marginBottom:8 }}>
                <input style={iS({ flex:1 })} value={p} onChange={e=>setExpData(prev=>({...prev,puertosOrigen:prev.puertosOrigen.map((x,xi)=>xi===pi?e.target.value:x)}))} placeholder="Ej: Sociedad Portuaria Regional de Cartagena (SPRC)" />
                <button onClick={()=>setExpData(prev=>({...prev,puertosOrigen:prev.puertosOrigen.filter((_,xi)=>xi!==pi)}))} style={{ background:"rgba(255,107,107,0.08)", border:"1px solid #FF6B6B35", borderRadius:7, padding:"9px 11px", color:"#FF6B6B", cursor:"pointer", flexShrink:0, fontFamily:"inherit" }}>✕</button>
              </div>
            ))}
            <button onClick={()=>setExpData(p=>({...p,puertosOrigen:[...(p.puertosOrigen||[]),""]}))} style={{ marginTop:4, background:"rgba(132,94,247,0.1)", border:"1px solid #845EF740", borderRadius:8, padding:"8px 16px", color:"#845EF7", cursor:"pointer", fontWeight:700, fontSize:12, fontFamily:"inherit" }}>➕ Agregar puerto de origen</button>
          </div>

          {/* Transportadoras (Logística) */}
          <div style={secS}>
            <div style={secH}>🚛 Transportadoras</div>
            {(expData.transportadoras||[]).map((t, ti) => (
              <div key={ti} style={{ display:"flex", gap:8, marginBottom:8 }}>
                <input style={iS({ flex:1 })} value={t} onChange={e=>setExpData(prev=>({...prev,transportadoras:prev.transportadoras.map((x,xi)=>xi===ti?e.target.value:x)}))} placeholder="Ej: Copetran" />
                <button onClick={()=>setExpData(prev=>({...prev,transportadoras:prev.transportadoras.filter((_,xi)=>xi!==ti)}))} style={{ background:"rgba(255,107,107,0.08)", border:"1px solid #FF6B6B35", borderRadius:7, padding:"9px 11px", color:"#FF6B6B", cursor:"pointer", flexShrink:0, fontFamily:"inherit" }}>✕</button>
              </div>
            ))}
            <button onClick={()=>setExpData(p=>({...p,transportadoras:[...(p.transportadoras||[]),""]}))} style={{ marginTop:4, background:"rgba(132,94,247,0.1)", border:"1px solid #845EF740", borderRadius:8, padding:"8px 16px", color:"#845EF7", cursor:"pointer", fontWeight:700, fontSize:12, fontFamily:"inherit" }}>➕ Agregar transportadora</button>
          </div>

          {/* Consignees (Logística) */}
          <div style={secS}>
            <div style={secH}>📦 Consignees Predefinidos</div>
            {(expData.consignees||[]).map((c, ci) => (
              <div key={c.id} style={{ marginBottom:12 }}>
                <div style={{ display:"grid", gridTemplateColumns: mob?"1fr":"1fr auto", gap:10, marginBottom:6 }}>
                  <div>
                    <label style={lS}>Nombre corto (para el selector)</label>
                    <input style={iS()} value={c.nombre} onChange={e=>setExpData(p=>({...p,consignees:p.consignees.map((x,xi)=>xi===ci?{...x,nombre:e.target.value}:x)}))} placeholder="Ej: HAR Products Inc (Puerto Rico)" />
                  </div>
                  <div style={{ display:"flex", alignItems:"flex-end" }}>
                    <button onClick={()=>setConfirmDel({action:()=>setExpData(p=>({...p,consignees:p.consignees.filter((_,xi)=>xi!==ci)}))})} style={{ background:"rgba(255,107,107,0.08)", border:"1px solid #FF6B6B35", borderRadius:7, padding:"9px 14px", color:"#FF6B6B", cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>✕ Eliminar</button>
                  </div>
                </div>
                <label style={lS}>Datos completos (nombre, tax ID, dirección, contacto)</label>
                <textarea style={{ ...iS(), minHeight:80, resize:"vertical", fontFamily:"inherit" }} value={c.texto} onChange={e=>setExpData(p=>({...p,consignees:p.consignees.map((x,xi)=>xi===ci?{...x,texto:e.target.value}:x)}))} placeholder="Nombre&#10;Tax ID&#10;Dirección&#10;Teléfono / email" />
              </div>
            ))}
            <button onClick={()=>setExpData(p=>({...p,consignees:[...(p.consignees||[]),{id:Date.now(),nombre:"",texto:""}]}))} style={{ marginTop:4, background:"rgba(132,94,247,0.1)", border:"1px solid #845EF740", borderRadius:8, padding:"8px 16px", color:"#845EF7", cursor:"pointer", fontWeight:700, fontSize:12, fontFamily:"inherit" }}>➕ Agregar consignee</button>
          </div>

          {/* Brokers */}
          <div style={secS}>
            <div style={secH}>🤝 Brokers / Agentes de Aduana</div>
            {expData.brokers.map((b, bi) => (
              <div key={b.id} style={{ marginBottom:12 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr auto", gap:10 }}>
                  {[["nombre","Nombre"],["empresa","Empresa"],["email","Email"],["tel","Teléfono"]].map(([f,l]) => (
                    <div key={f}>
                      <label style={lS}>{l}</label>
                      <input style={iS()} value={b[f]||""} onChange={e=>setExpData(p=>({...p,brokers:p.brokers.map((x,xi)=>xi===bi?{...x,[f]:e.target.value}:x)}))} placeholder={l} />
                    </div>
                  ))}
                  <div style={{ display:"flex", alignItems:"flex-end" }}>
                    <button onClick={()=>setConfirmDel({action:()=>setExpData(p=>({...p,brokers:p.brokers.filter((_,xi)=>xi!==bi)}))})} style={{ background:"rgba(255,107,107,0.08)", border:"1px solid #FF6B6B35", borderRadius:7, padding:"9px 11px", color:"#FF6B6B", cursor:"pointer", fontFamily:"inherit" }}>✕</button>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={()=>setExpData(p=>({...p,brokers:[...p.brokers,{id:Date.now(),nombre:"",empresa:"",email:"",tel:""}]}))} style={{ background:"rgba(132,94,247,0.1)", border:"1px solid #845EF740", borderRadius:8, padding:"8px 16px", color:"#845EF7", cursor:"pointer", fontWeight:700, fontSize:12, fontFamily:"inherit" }}>➕ Agregar broker</button>
          </div>

          <div style={secS}>
            <div style={secH}>📊 Parámetros financieros</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                <label style={lS}>Kg por caja</label>
                <input type="number" value={expData.kgPorCaja ?? 10} onChange={e=>setExpData(p=>({...p,kgPorCaja:Number(e.target.value)||10}))} style={iS({})} />
              </div>
              <div>
                <label style={lS}>Precio USD / kg</label>
                <input type="number" step="0.01" value={expData.precioUSDkg ?? 0.45} onChange={e=>setExpData(p=>({...p,precioUSDkg:Number(e.target.value)||0.45}))} style={iS({})} />
              </div>
            </div>
          </div>

          <SaveBtn onClick={() => save("cfg_exportacion", expData)} />
        </div>
      )}

      {/* ── TAB 5: NÓMINA ── */}
      {tabIdx === 4 && (
        <div>
          <div style={secS}>
            <div style={secH}>💰 Valores de Liquidación</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
              {[
                ["valorContenedor","Valor por Contenedor"],
                ["salarioMinimo","Salario Mínimo Vigente"],
                ["valorQuincena","Valor Quincena Descargue"],
              ].map(([k,l]) => (
                <div key={k}>
                  <label style={lS}>{l}</label>
                  <div style={{ position:"relative" }}>
                    <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", color:"rgba(255,255,255,0.45)", fontSize:13, pointerEvents:"none" }}>$</span>
                    <input type="number" style={iS({ paddingLeft:22 })} value={nominaCfg[k]} onChange={e=>setNominaCfg(p=>({...p,[k]:Number(e.target.value)}))} />
                  </div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:4 }}>{(nominaCfg[k]||0).toLocaleString("es-CO")} COP</div>
                </div>
              ))}
            </div>
          </div>

          <div style={secS}>
            <div style={secH}>🏭 Áreas y Cargos</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:14 }}>
              {nominaCfg.areas.map((a, ai) => (
                <div key={ai} style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding:"5px 10px" }}>
                  <span style={{ fontSize:12, color:"rgba(255,255,255,0.8)" }}>{a}</span>
                  <button onClick={()=>setConfirmDel({action:()=>setNominaCfg(p=>({...p,areas:p.areas.filter((_,xi)=>xi!==ai)}))})} style={{ background:"none", border:"none", color:"rgba(255,107,107,0.65)", cursor:"pointer", fontSize:14, lineHeight:1, padding:0, fontFamily:"inherit" }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input style={iS({ flex:1 })} value={nominaCfg.nuevoArea||""} onChange={e=>setNominaCfg(p=>({...p,nuevoArea:e.target.value}))} placeholder="Nueva área o cargo…" onKeyDown={e=>{ if (e.key==="Enter" && nominaCfg.nuevoArea?.trim()) setNominaCfg(p=>({...p,areas:[...p.areas,p.nuevoArea.trim()],nuevoArea:""})); }} />
              <button onClick={()=>{ if (nominaCfg.nuevoArea?.trim()) setNominaCfg(p=>({...p,areas:[...p.areas,p.nuevoArea.trim()],nuevoArea:""})); }} style={{ background:"rgba(132,94,247,0.14)", border:"1px solid #845EF740", borderRadius:8, padding:"9px 18px", color:"#845EF7", cursor:"pointer", fontWeight:700, fontSize:12, flexShrink:0, fontFamily:"inherit" }}>Agregar</button>
            </div>
          </div>
          <SaveBtn onClick={() => {
            const cfg = nominaCfg.nuevoArea?.trim()
              ? { ...nominaCfg, areas:[...nominaCfg.areas, nominaCfg.nuevoArea.trim()], nuevoArea:"" }
              : nominaCfg;
            if (cfg !== nominaCfg) setNominaCfg(cfg);
            save("cfg_nomina", cfg);
          }} />
        </div>
      )}

      {/* ── TAB 6: NOTIFICACIONES ── */}
      {tabIdx === 5 && (
        <div>
          <div style={secS}>
            <div style={secH}>🔔 Alertas Automáticas</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.42)", marginBottom:14 }}>Activa o desactiva las notificaciones del sistema JARVIS</div>
            <Toggle value={notifCfg.pagoQuincenal} onChange={v=>setNotifCfg(p=>({...p,pagoQuincenal:v}))} label="💰 Recordatorio pago quincenal — cada viernes" />
            <Toggle value={notifCfg.docsExport}    onChange={v=>setNotifCfg(p=>({...p,docsExport:v}))}    label="🚢 Recordatorio documentos de exportación pendientes" />
            <Toggle value={notifCfg.stockBajo}     onChange={v=>setNotifCfg(p=>({...p,stockBajo:v}))}     label="📦 Alertas de stock bajo en inventario" />
            <Toggle value={notifCfg.sinAsistencia} onChange={v=>setNotifCfg(p=>({...p,sinAsistencia:v}))} label="📅 Alertas de empleados sin registrar asistencia" />
          </div>
          <div style={secS}>
            <div style={secH}>📱 WhatsApp para Alertas Críticas</div>
            <label style={lS}>Número de WhatsApp (incluye código de país)</label>
            <input style={iS()} value={notifCfg.whatsapp} onChange={e=>setNotifCfg(p=>({...p,whatsapp:e.target.value}))} placeholder="+57 300 000 0000" />
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.36)", marginTop:7 }}>Las alertas críticas se enviarán a este número vía WhatsApp Business API</div>
          </div>
          <SaveBtn onClick={() => save("cfg_notif", notifCfg)} />
        </div>
      )}

      {/* ── TAB 7: APARIENCIA ── */}
      {tabIdx === 6 && (
        <div>
          <div style={secS}>
            <div style={secH}>🌙 Tema del Sistema</div>
            <div style={{ display:"flex", gap:10 }}>
              {[["oscuro","🌙 Oscuro"],["claro","☀️ Claro"],["auto","💻 Auto"]].map(([t,l]) => (
                <button key={t} onClick={()=>setApariencia(p=>({...p,tema:t}))} style={{ flex:1, padding:"14px 10px", borderRadius:10, cursor:"pointer", fontFamily:"inherit",
                  background: apariencia.tema===t ? "rgba(100,116,139,0.22)" : "rgba(255,255,255,0.04)",
                  border: `2px solid ${apariencia.tema===t ? "#64748B" : "rgba(255,255,255,0.07)"}`,
                  color: apariencia.tema===t ? "#94a3b8" : "rgba(255,255,255,0.42)",
                  fontWeight:700, fontSize:13,
                }}>{l}</button>
              ))}
            </div>
          </div>

          <div style={secS}>
            <div style={secH}>🌈 Color Principal del Sistema</div>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:14 }}>
              {COLORES_PRESET.map(c => (
                <div key={c} onClick={()=>setApariencia(p=>({...p,colorPrincipal:c}))} style={{ width:40, height:40, borderRadius:"50%", background:c, cursor:"pointer", transition:"all 0.2s",
                  border: apariencia.colorPrincipal===c ? "3px solid white" : "3px solid transparent",
                  boxShadow: apariencia.colorPrincipal===c ? `0 0 0 3px ${c}80, 0 0 20px ${c}90` : "none",
                }} />
              ))}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:24, height:24, borderRadius:6, background:apariencia.colorPrincipal, boxShadow:`0 0 8px ${apariencia.colorPrincipal}80` }} />
              <span style={{ fontSize:12, color:"rgba(255,255,255,0.62)" }}>Seleccionado: <span style={{ color:apariencia.colorPrincipal, fontWeight:700 }}>{apariencia.colorPrincipal}</span></span>
            </div>
          </div>

          <div style={secS}>
            <div style={secH}>⚡ Rendimiento Visual</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.42)", marginBottom:12 }}>Desactiva en dispositivos lentos o con batería baja</div>
            <Toggle value={apariencia.animaciones} onChange={v=>setApariencia(p=>({...p,animaciones:v}))} label="✨ Animaciones, transiciones y efectos de hover" />
          </div>
          <SaveBtn onClick={() => save("cfg_apariencia", apariencia)} />
        </div>
      )}

      {/* ── TAB 8: SEGURIDAD ── */}
      {tabIdx === 7 && (
        <div>
          <div style={secS}>
            <div style={secH}>🔑 Cambiar Contraseña</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
              {[["actual","Contraseña actual"],["nuevo","Nueva contraseña"],["confirmar","Confirmar nueva"]].map(([f,l]) => (
                <div key={f}>
                  <label style={lS}>{l}</label>
                  <input type="password" style={iS()} value={pw[f]} onChange={e=>setPw(p=>({...p,[f]:e.target.value}))} placeholder="••••••••" />
                </div>
              ))}
            </div>
            <button onClick={async () => {
              if (!pw.actual) { showToast("Ingresa tu contraseña actual", false); return; }
              if (pw.nuevo !== pw.confirmar) { showToast("Las contraseñas no coinciden", false); return; }
              if (pw.nuevo.length < 6) { showToast("Mínimo 6 caracteres", false); return; }
              const { error } = await supabase.auth.updateUser({ password: pw.nuevo });
              if (error) { showToast(`Error: ${error.message}`, false); return; }
              setPw({actual:"",nuevo:"",confirmar:""});
              showToast("Contraseña actualizada ✓");
            }} style={{ marginTop:16, background:"linear-gradient(135deg,#845EF7,#6366F1)", border:"none", borderRadius:10, padding:"10px 22px", color:"white", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              🔒 Actualizar contraseña
            </button>
          </div>

          <div style={secS}>
            <div style={secH}>🔑 Claves de Acceso a Pasos Sensibles</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", marginBottom:14, lineHeight:1.6 }}>
              Define una clave para proteger pasos específicos del sistema. Si dejas la clave vacía, ese paso queda abierto sin restricción.
            </div>
            {ACCIONES_PROTEGIBLES.map(accion => (
              <div key={accion.id} style={{ display:"flex", alignItems:"flex-end", gap:12, marginBottom:12, flexWrap:"wrap" }}>
                <div style={{ flex:"1 1 220px" }}>
                  <label style={lS}>{accion.nombre}</label>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.38)", marginBottom:5 }}>{accion.desc}</div>
                </div>
                <div style={{ flex:"0 1 200px", display:"flex", gap:6 }}>
                  <input
                    type={clavesVisibles[accion.id] ? "text" : "password"}
                    style={iS()}
                    value={clavesAcceso[accion.id] || ""}
                    onChange={e => setClavesAcceso(p => ({ ...p, [accion.id]: e.target.value }))}
                    placeholder="Sin clave — acceso libre"
                  />
                  <button
                    onClick={() => setClavesVisibles(p => ({ ...p, [accion.id]: !p[accion.id] }))}
                    style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:8, padding:"0 10px", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:13 }}
                  >{clavesVisibles[accion.id] ? "🙈" : "👁️"}</button>
                </div>
              </div>
            ))}
            <SaveBtn onClick={() => save("cfg_claves_acceso", clavesAcceso)} />
          </div>

          <div style={secS}>
            <div style={secH}>⏱️ Tiempo de Sesión Automático</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {["1h","4h","8h","24h","Siempre activo"].map(t => (
                <button key={t} onClick={()=>setSeguridad(p=>({...p,tiempoSesion:t}))} style={{ padding:"9px 18px", borderRadius:8, cursor:"pointer", fontFamily:"inherit",
                  background: seguridad.tiempoSesion===t ? "rgba(100,116,139,0.28)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${seguridad.tiempoSesion===t ? "#64748B" : "rgba(255,255,255,0.08)"}`,
                  color: seguridad.tiempoSesion===t ? "#94a3b8" : "rgba(255,255,255,0.42)",
                  fontWeight:700, fontSize:12,
                }}>{t}</button>
              ))}
            </div>
          </div>

          <div style={secS}>
            <div style={secH}>📋 Últimos 10 Accesos</div>
            {seguridad.historial.length === 0 && <div style={{ fontSize:13, color:"rgba(255,255,255,0.38)", textAlign:"center", padding:"16px 0" }}>Aún no hay registro de accesos — esta función no está activa todavía</div>}
            {seguridad.historial.slice(0,10).map((h, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600 }}>{h.usuario}</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>IP: {h.ip}</div>
                </div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontVariantNumeric:"tabular-nums" }}>{h.fecha}</div>
              </div>
            ))}
          </div>

          <div style={secS}>
            <div style={secH}>💾 Backup Completo del Sistema</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", marginBottom:14, lineHeight:1.6 }}>
              Exporta toda la configuración guardada en Supabase a un archivo JSON.<br/>
              Guárdalo en un lugar seguro — puedes restaurarlo en cualquier dispositivo.
            </div>
            <button onClick={() => {
              const data = { ...config, _exportado: new Date().toISOString() };
              const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
              const url  = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href=url; a.download=`jarvis-backup-${new Date().toISOString().split("T")[0]}.json`; a.click(); URL.revokeObjectURL(url);
              showToast("Backup exportado ✓");
            }} style={{ background:"rgba(99,102,241,0.14)", border:"1px solid #6366F155", borderRadius:10, padding:"10px 22px", color:"#818cf8", cursor:"pointer", fontWeight:700, fontSize:13, fontFamily:"inherit" }}>
              ⬇️ Exportar backup JSON
            </button>
          </div>
          <SaveBtn onClick={() => save("cfg_seguridad", { tiempoSesion:seguridad.tiempoSesion, historial:seguridad.historial })} />
        </div>
      )}

      {/* ── TAB 9: FISCAL ── */}
      {tabIdx === 8 && (
        <div>
          <div style={secS}>
            <div style={secH}>📋 Régimen Tributario</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <div>
                <label style={lS}>Régimen</label>
                <CustomSelect style={iS()} value={fiscal.regimen} onChange={e=>setFiscal(p=>({...p,regimen:e.target.value}))}>
                  {["Régimen Ordinario","Régimen Especial","Gran Contribuyente","Autoretenedor"].map(r=><option key={r} value={r} style={{ background:"#1a1c26" }}>{r}</option>)}
                </CustomSelect>
              </div>
              <div>
                <label style={lS}>Responsabilidades DIAN</label>
                <input style={iS()} value={fiscal.responsabilidades} onChange={e=>setFiscal(p=>({...p,responsabilidades:e.target.value}))} placeholder="Ej: 05 - IVA, 07 - Retención en la Fuente" />
              </div>
            </div>
          </div>

          <div style={secS}>
            <div style={secH}>🧾 Datos para Facturación Electrónica</div>
            <div style={{ display:"grid", gridTemplateColumns:mob?"1fr 1fr":"1fr 1fr 1fr", gap:14 }}>
              <div>
                <label style={lS}>Ciudad de Expedición</label>
                <input style={iS()} value={fiscal.ciudadExpedicion} onChange={e=>setFiscal(p=>({...p,ciudadExpedicion:e.target.value}))} placeholder="Ej: Bucaramanga" />
              </div>
              <div>
                <label style={lS}>Prefijo de Factura</label>
                <input style={iS()} value={fiscal.prefijoFactura} onChange={e=>setFiscal(p=>({...p,prefijoFactura:e.target.value}))} placeholder="Ej: FPE" />
              </div>
              <div>
                <label style={lS}>Consecutivo Actual</label>
                <input type="number" style={iS()} value={fiscal.consecutivo} onChange={e=>setFiscal(p=>({...p,consecutivo:Number(e.target.value)}))} min={1} />
              </div>
              <div>
                <label style={lS}>N° Resolución DIAN</label>
                <input style={iS()} value={fiscal.resolucionDIAN} onChange={e=>setFiscal(p=>({...p,resolucionDIAN:e.target.value}))} placeholder="Ej: 18760000001" />
              </div>
              <div>
                <label style={lS}>Fecha Resolución</label>
                <input type="date" style={iS()} value={fiscal.fechaResolucion} onChange={e=>setFiscal(p=>({...p,fechaResolucion:e.target.value}))} />
              </div>
            </div>
          </div>

          <div style={{ background:"rgba(100,116,139,0.08)", border:"1px solid #64748B40", borderRadius:10, padding:"14px 16px", marginBottom:16 }}>
            <div style={{ fontSize:12, color:"#94a3b8", lineHeight:1.6 }}>
              ⚠️ <strong>Nota:</strong> Los datos fiscales se usan para pre-llenar los documentos de exportación y facturas. Verifica con tu contador que la información esté actualizada según la resolución DIAN vigente.
            </div>
          </div>
          <SaveBtn onClick={() => save("cfg_fiscal", fiscal)} />
        </div>
      )}

    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────
const MODULES = [
  { id:"inicio",        icon:"🏠", title:"Inicio",        color:"#845EF7", demo:{ type:"inicio_live" },        capabilities:["Dashboard ejecutivo","KPIs en tiempo real","Acceso rápido a módulos","Alertas inteligentes","Reloj en vivo","Resumen del negocio"] },
  { id:"estadisticas",  icon:"📈", title:"Estadísticas",  color:"#FF6B6B", demo:{ type:"estadisticas_live" }, capabilities:["KPIs en tiempo real","Distribución de documentos","Empleados por área","Gastos operativos","Nómina base estimada","Observaciones y alertas"] },
  { id:"personal",      icon:"👥", title:"Personal",      color:"#a78bfa", demo:{ type:"personal_live" },     capabilities:["Base de datos 50+ empleados","Búsqueda y filtros","Agregar empleados","Broadcast WhatsApp","Editar fichas","Documentos: CC, PPT, Venezuela"] },
  { id:"contenedores",  icon:"🚢", title:"Contenedores",  color:"#6366F1", demo:{ type:"contenedores_live" }, capabilities:["Registro por fecha y proceso","N° contenedor y proveedor","Tipo de caja Del Monte / Princesses","Supervisores a cargo","Empresa, placa y trailer","Informe descargable"] },
  { id:"recepciones",   icon:"🍋", title:"Recepción",     color:"#00C9A7", demo:{ type:"recepciones_live" },  capabilities:["Entrada y salida de fruta","Remisión, placa, conductor y proveedor","Estibas por remisión con peso bruto/neto","Descuento de peso de estiba y canastilla","Total de peso neto calculado","Historial editable"] },
  { id:"inventario",    icon:"📦", title:"Inventario",    color:"#845EF7", demo:{ type:"inventario_live" },   capabilities:["39 productos y herramientas reales","Control de entradas y salidas","Alertas de stock bajo","Costos por contenedor","Notas y observaciones","Historial de movimientos"] },
  { id:"nomina",        icon:"💰", title:"Nómina",        color:"#F9A826", demo:{ type:"nomina_live" },       capabilities:["$180.000 por contenedor","Salario mínimo cajas $1.750.000","Descargue 2 quincenas $1.000.000 c/u","Pago Nequi y Bancolombia directo","Turnos día y noche editables","Reporte completo descargable"] },
  { id:"informes",      icon:"📊", title:"Informes",      color:"#FF6B6B", demo:{ type:"informes_live" },     capabilities:["Sube Excel, PDF o CSV","JARVIS analiza con IA real","Informe ejecutivo para socios","Historial de análisis","Comparativos con IA","Resumen ejecutivo en segundos"] },
  { id:"asistencia",    icon:"📅", title:"Asistencia",    color:"#4ECDC4", demo:{ type:"asistencia_live" },   capabilities:["Registro diario de asistencia","✅ Presente · ❌ Ausente · ⏰ Tardanza","📋 Licencias y permisos · 🎉 Festivos","Marcar todos en un click","Filtro por nombre y área","Informe mensual descargable"] },
  { id:"documentos",    icon:"🚢", title:"Exportación",   color:"#0EA5E9", demo:{ type:"documentos_live" },   capabilities:["Carta de Temperatura oficial","Factura Proforma consecutiva","ISF Template 10+2 para USA","Datos pre-llenados automáticamente","Princesses Kingdom Corp pre-configurado","HTML listo para imprimir o PDF"] },
  { id:"logistica",     icon:"🚛", title:"Logística",     color:"#F97316", demo:{ type:"logistica_live" },     capabilities:["Gestión de bookings","Estado de contenedores por naviera","Transporte terrestre","Novedades e inspecciones portuarias","Línea de tiempo de 12 hitos","Alertas de días libres y cutoffs"] },
  { id:"control_expo",  icon:"🛃", title:"Control Expo",  color:"#059669", demo:{ type:"control_expo_live" },  capabilities:["Seguimiento de documentos DEX","Estado Pendiente/Radicado/Cancelado","Verificación con un clic","Filtro y orden por fecha","Valor del DEX en USD","Informe descargable"] },
  { id:"configuracion", icon:"⚙️", title:"Config.",      color:"#64748B", demo:{ type:"configuracion_live" }, capabilities:["Datos empresa y logo","Usuarios y permisos","Correos por documento","Clientes y navieras","Parámetros de nómina","Seguridad y backup"] },
];

// ─── USUARIOS ─────────────────────────────────────────────────
const USUARIOS = [
  { nombre: "Juan Abuchaibe", cedula: "123456789", rol: "Administrador", avatar: "JA" },
  { nombre: "Lennix Vega", cedula: "63557421", rol: "Administración", avatar: "LV" },
];

// ─── PANTALLA DE LOGIN ─────────────────────────────────────────
function LoginScreen({ onLogin, usuarios = USUARIOS }) {
  const [cedula, setCedula] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  const intentarLogin = () => {
    const user = usuarios.find(u =>
      u.nombre.toLowerCase().trim() === nombre.toLowerCase().trim() &&
      u.cedula === cedula.trim()
    );
    if (user) {
      setError("");
      onLogin(user);
    } else {
      setError("Nombre o cédula incorrectos. Intenta de nuevo.");
    }
  };

  const inp = {
    width: "100%", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 10, padding: "12px 14px", color: "white", fontSize: 14, fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight:"100dvh", background:"#020203", display:"flex", alignItems:"center", justifyContent:"center", padding:"20px 16px", fontFamily:"'DM Sans',system-ui,sans-serif", overflowY:"auto" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        input:focus { outline: none; }
        .login-wrap { width: 100%; max-width: 400px; }
        .login-logo { text-align: center; margin-bottom: 36px; }
        .login-logo-icon { width: 72px; height: 72px; border-radius: 20px; background: linear-gradient(135deg,#845EF7,#6366F1); display: flex; align-items: center; justify-content: center; font-size: 36px; margin: 0 auto 14px; box-shadow: 0 8px 32px rgba(132,94,247,0.35), 0 0 0 1px rgba(255,255,255,0.06); }
        .login-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.09); border-radius: 20px; padding: 28px 28px 24px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 24px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06); }
        .login-btn { width: 100%; background: linear-gradient(135deg,#845EF7,#6366F1); border: none; border-radius: 12px; padding: 15px; font-size: 15px; color: white; cursor: pointer; font-weight: 700; margin-top: 4px; font-family: inherit; transition: opacity 0.18s, transform 0.18s; box-shadow: 0 8px 24px rgba(132,94,247,0.3); }
        .login-btn:hover { opacity: 0.92; transform: translateY(-1px); }
        .login-btn:active { transform: scale(0.97); }
        /* Landscape: layout horizontal logo + card */
        @media (max-height: 500px) and (orientation: landscape) {
          .login-wrap { max-width: 680px; display: grid; grid-template-columns: 200px 1fr; gap: 20px; align-items: center; }
          .login-logo { margin-bottom: 0; }
          .login-logo-icon { width: 56px; height: 56px; font-size: 28px; border-radius: 16px; }
          .login-logo h1 { font-size: 18px !important; }
          .login-logo p { font-size: 11px !important; }
          .login-card { padding: 20px 22px; border-radius: 16px; }
          .login-footer { display: none; }
        }
        /* Pantallas muy pequeñas */
        @media (max-width: 360px) {
          .login-card { padding: 20px 16px; }
          .login-logo { margin-bottom: 24px; }
        }
      `}</style>

      <div className="login-wrap">
        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-icon">🍋</div>
          <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:"white", letterSpacing:-0.5, margin:0 }}>Tierra Prometida Trading</h1>
          <p style={{ fontSize:12, color:"rgba(255,255,255,0.48)", marginTop:5, margin:"5px 0 0" }}>Sistema de gestión — JARVIS</p>
        </div>

        {/* Card */}
        <div className="login-card">
          <div style={{ fontSize:16, fontWeight:700, color:"white", marginBottom:4 }}>Bienvenido 👋</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.48)", marginBottom:20 }}>Ingresa tus datos para continuar</div>

          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.58)", marginBottom:6, fontWeight:600, textTransform:"uppercase", letterSpacing:0.5 }}>Nombre completo</div>
              <input
                value={nombre}
                onChange={e => { setNombre(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && intentarLogin()}
                placeholder="Tu nombre completo"
                autoComplete="name"
                style={inp}
              />
            </div>
            <div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.58)", marginBottom:6, fontWeight:600, textTransform:"uppercase", letterSpacing:0.5 }}>Cédula (contraseña)</div>
              <div style={{ position:"relative" }}>
                <input
                  type={showPass ? "text" : "password"}
                  value={cedula}
                  onChange={e => { setCedula(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && intentarLogin()}
                  placeholder="Tu número de cédula"
                  autoComplete="current-password"
                  inputMode="numeric"
                  style={{ ...inp, paddingRight: 46 }}
                />
                <button
                  onClick={() => setShowPass(!showPass)}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"rgba(255,255,255,0.48)", cursor:"pointer", fontSize:18, lineHeight:1, padding:4, minWidth:32, minHeight:32, display:"flex", alignItems:"center", justifyContent:"center" }}
                >
                  {showPass ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background:"rgba(255,107,107,0.1)", border:"1px solid rgba(255,107,107,0.3)", borderRadius:9, padding:"10px 12px", fontSize:13, color:"#FF6B6B", display:"flex", alignItems:"center", gap:8 }}>
                <span>⚠️</span> {error}
              </div>
            )}

            <button onClick={intentarLogin} className="login-btn">
              Ingresar al sistema →
            </button>
          </div>
        </div>

        <div className="login-footer" style={{ textAlign:"center", marginTop:18, fontSize:11, color:"rgba(255,255,255,0.28)" }}>
          Powered by JARVIS 🤖 · Tierra Prometida Trading
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [usuario, setUsuario] = useState(() => {
    try { const s = localStorage.getItem("tp_session"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const login  = (u) => { setUsuario(u); try { localStorage.setItem("tp_session", JSON.stringify(u)); } catch {} };
  const logout = ()  => { setUsuario(null); try { localStorage.removeItem("tp_session"); } catch {} };
  const [activeModule, setActiveModule] = useState(0);
  const [showNotif,    setShowNotif]    = useState(false);
  const [showSearch,   setShowSearch]   = useState(false);
  const [searchQ,      setSearchQ]      = useState("");
  const { items: invApp } = useInventario();
  const logisticaApp = useLogistica();

  const { config: cfgApp, loading: cfgLoading, guardar: guardarCfgApp } = useConfiguracion();
  const apariencia = cfgApp.cfg_apariencia || {};

  // El módulo "Recepciones" se renombró a "Recepción" (singular). El nombre
  // queda guardado tal cual dentro de los permisos por usuario en Supabase,
  // así que sin esta migración los usuarios con el permiso viejo lo perderían
  // (aparecería desmarcado) hasta que alguien lo volviera a marcar a mano.
  useEffect(() => {
    if (cfgLoading) return;
    const lista = cfgApp.cfg_usuarios;
    if (!Array.isArray(lista) || !lista.length) return;
    let cambio = false;
    const migrado = lista.map(u => {
      if (!u.permisos?.includes("Recepciones")) return u;
      cambio = true;
      return { ...u, permisos: u.permisos.map(p => p === "Recepciones" ? "Recepción" : p) };
    });
    if (cambio) guardarCfgApp("cfg_usuarios", migrado);
  }, [cfgLoading, cfgApp.cfg_usuarios]);

  // Memoizado: sin esto, el escaneo de stock bajo + alertas de logística se
  // recalculaba en CADA render de App (incluida cada tecla del buscador global).
  const notifs = useMemo(() => {
    const lista = [];
    const invNotif = invApp.length > 0 ? invApp : INVENTARIO_BASE;
    invNotif.forEach(item => {
      const esHerramienta = item.categoria === "Herramientas";
      const bajo = esHerramienta ? item.cant === 0 : item.cant <= item.minimo;
      if (bajo) lista.push({ tipo:"stock", icon:"📦", color:"#F9A826", titulo:`Stock bajo: ${item.nombre}`, detalle: esHerramienta ? "Sin unidades disponibles" : `${item.cant} ${item.unidad} (mín: ${item.minimo})` });
    });
    const hoy = new Date();
    if (hoy.getDay() === 5) lista.push({ tipo:"nomina", icon:"💰", color:"#00C9A7", titulo:"Hoy es viernes — ¿generaste la nómina?", detalle:"Recuerda liquidar la quincena si aplica" });
    const alertasLog = calcularAlertasLogistica(logisticaApp.bookings, logisticaApp.transporte, cfgApp.cfg_exportacion?.navieras || [], logisticaApp.contratos);
    alertasLog.forEach(a => lista.push({ tipo:"logistica", icon:a.icon, color:a.color, titulo:a.titulo, detalle:a.detalle }));
    lista.push({ tipo:"info", icon:"🍋", color:"#845EF7", titulo:`${EMPLEADOS_DB.length} empleados en sistema`, detalle:`${EMPLEADOS_DB.filter(e=>e.area!=="Owner / Propietario").length} operativos activos` });
    return lista;
  }, [invApp, logisticaApp.bookings, logisticaApp.transporte, logisticaApp.contratos, cfgApp.cfg_exportacion]);

  // La sesión guarda un snapshot de permisos al hacer login — si un admin
  // cambia permisos en Configuración mientras el usuario ya está logueado,
  // sin esto tendría que cerrar sesión y volver a entrar para que aplique.
  useEffect(() => {
    if (!usuario) return;
    const lista = cfgApp.cfg_usuarios?.length ? cfgApp.cfg_usuarios : USUARIOS;
    const actualizado = lista.find(u => u.cedula === usuario.cedula);
    if (!actualizado) return;
    if (JSON.stringify(actualizado.permisos || []) !== JSON.stringify(usuario.permisos || [])) {
      const nuevo = { ...usuario, permisos: actualizado.permisos };
      setUsuario(nuevo);
      try { localStorage.setItem("tp_session", JSON.stringify(nuevo)); } catch {}
    }
  }, [cfgApp.cfg_usuarios]);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [isSmall,  setIsSmall]  = useState(() => window.innerWidth < 480);
  useEffect(() => {
    const h = () => {
      setIsMobile(window.innerWidth < 768);
      setIsSmall(window.innerWidth < 480);
    };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const colorPrincipal = apariencia.colorPrincipal || "#00C9A7";
  const sinAnimaciones = apariencia.animaciones === false;
  const searchRef  = useRef(null);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [ripples,     setRipples]     = useState([]);
  const triggerRipple = (cardIdx, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now();
    setRipples(prev => [...prev, { id, cardIdx, x, y }]);
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 600);
  };

  // Esperar config antes de mostrar login (para que cfg_usuarios esté disponible)
  if (cfgLoading && !usuario) return (
    <div style={{ minHeight:"100vh", background:"#020203", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"rgba(255,255,255,0.48)", fontSize:14, fontFamily:"DM Sans,sans-serif" }}>Cargando...</div>
    </div>
  );

  // Mostrar login si no hay sesión
  const usuariosLogin = cfgApp.cfg_usuarios?.length ? cfgApp.cfg_usuarios : USUARIOS;
  if (!usuario) return <LoginScreen onLogin={login} usuarios={usuariosLogin} />;

  // Verificar si el usuario tiene acceso a un módulo ([] = acceso total)
  const tieneAcceso = (m) => {
    if (!usuario.permisos?.length) return true;
    const title = m.title === "Config." ? "Configuración" : m.title;
    return usuario.permisos.includes(title);
  };
  const modulosVisibles = MODULES;

  // Navegar a módulo por id (usado desde InicioDemo, búsqueda global, etc.)
  // Respeta los mismos permisos que el sidebar — evita saltarse módulos bloqueados.
  const navigateToModule = (moduleId) => {
    const idx = MODULES.findIndex(m => m.id === moduleId);
    if (idx >= 0 && tieneAcceso(MODULES[idx])) setActiveModule(idx);
  };

  const mod = MODULES[activeModule];

  const renderDemo = (demo) => {
    if (demo.type === "configuracion_live") return <ConfiguracionDemo />;
    if (demo.type === "inicio_live")      return <InicioDemo usuario={usuario} onNavigate={navigateToModule} puedeAcceder={(id) => { const m = MODULES.find(x=>x.id===id); return m ? tieneAcceso(m) : true; }} />;
    if (demo.type === "personal_live")    return <PersonalDemo />;
    if (demo.type === "nomina_live")      return <NominaDemo />;
    if (demo.type === "informes_live")    return <InformesDemo />;
    if (demo.type === "inventario_live")  return <InventarioDemo />;
    if (demo.type === "asistencia_live")  return <AsistenciaDemo />;
    if (demo.type === "contenedores_live") return <ContenedoresDemo />;
    if (demo.type === "recepciones_live") return <RecepcionesTab mob={isMobile} />;
    if (demo.type === "logistica_live")   return <LogisticaTab mob={isMobile} logistica={logisticaApp} />;
    if (demo.type === "control_expo_live") return <ControlExpoTab mob={isMobile} />;
    if (demo.type === "documentos_live")  return <DocumentosDemo />;
    if (demo.type === "estadisticas_live") return <EstadisticasDemo />;
    if (demo.type === "bars") return (
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {demo.items.map((item,i) => (
          <div key={i}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:13 }}>
              <span style={{ color:"rgba(255,255,255,0.88)" }}>{item.label}</span>
              <span style={{ color:item.stock<item.min?"#FF6B6B":"#00C9A7", fontWeight:700 }}>{item.stock} uds {item.stock<item.min?"⚠️":""}</span>
            </div>
            <div style={{ background:"rgba(255,255,255,0.10)", borderRadius:4, height:8, overflow:"hidden" }}>
              <div style={{ width:`${Math.min(100,(item.stock/100)*100)}%`, height:"100%", background:item.color, borderRadius:4 }} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <MobCtx.Provider value={isMobile}>
    <SmallCtx.Provider value={isSmall}>
    <div className="tp-app" style={{ minHeight:"100vh", background:"#020203", fontFamily:"'DM Sans',system-ui,sans-serif", color:"white", "--cp":colorPrincipal }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');
        :root { --cp: ${colorPrincipal}; }
        ${sinAnimaciones ? "*, *::before, *::after { transition: none !important; animation: none !important; }" : ""}
        @keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes rippleOut{0%{transform:scale(0);opacity:0.75}100%{transform:scale(5);opacity:0}}
        @keyframes borderFlow{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}

        @keyframes tp-dropdown-in {
          from { opacity:0; transform:scale(0.93) translateY(-10px); }
          to   { opacity:1; transform:scale(1)    translateY(0);     }
        }
        @keyframes tp-search-open {
          from { opacity:0; transform:scaleX(0.5) translateX(10px); }
          to   { opacity:1; transform:scaleX(1)   translateX(0);    }
        }
        @keyframes tp-bell-ring {
          0%  { transform:rotate(0deg);  }
          15% { transform:rotate(18deg); }
          30% { transform:rotate(-14deg);}
          45% { transform:rotate(10deg); }
          60% { transform:rotate(-6deg); }
          75% { transform:rotate(4deg);  }
          90% { transform:rotate(-2deg); }
          100%{ transform:rotate(0deg);  }
        }
        @keyframes tp-avatar-in {
          from { opacity:0; transform:scale(0.7); }
          to   { opacity:1; transform:scale(1);   }
        }

        .tp-hdr-btn {
          transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1),
                      background 0.18s ease, box-shadow 0.18s ease,
                      border-color 0.18s ease;
        }
        .tp-hdr-btn:hover {
          transform: scale(1.13) translateY(-2px);
          box-shadow: 0 6px 20px rgba(255,255,255,0.09);
        }
        .tp-hdr-notif:hover {
          transform: scale(1.13) translateY(-2px);
          box-shadow: 0 6px 20px rgba(132,94,247,0.45) !important;
          border-color: rgba(132,94,247,0.55) !important;
          background: rgba(132,94,247,0.18) !important;
        }
        .tp-bell-anim { animation: tp-bell-ring 0.7s ease; }
        .tp-hdr-avatar {
          transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s ease;
          animation: tp-avatar-in 0.35s cubic-bezier(0.34,1.56,0.64,1);
        }
        .tp-hdr-avatar:hover {
          transform: scale(1.12) translateY(-3px);
          box-shadow: 0 8px 24px rgba(132,94,247,0.55) !important;
        }
        .tp-hdr-exit {
          transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1),
                      background 0.18s ease, box-shadow 0.18s ease;
        }
        .tp-hdr-exit:hover {
          transform: scale(1.07) translateY(-1px);
          background: rgba(255,107,107,0.2) !important;
          box-shadow: 0 5px 16px rgba(255,107,107,0.4) !important;
          border-color: rgba(255,107,107,0.5) !important;
        }
        .tp-dropdown {
          animation: tp-dropdown-in 0.2s cubic-bezier(0.16,1,0.3,1);
          transform-origin: top right;
        }
        .tp-search-open {
          animation: tp-search-open 0.22s cubic-bezier(0.34,1.56,0.64,1);
          transform-origin: right center;
        }

        /* ── Layout base (desktop ≥ 1100px) ── */
        .tp-app { padding: 16px 20px 20px; zoom: 1.15; }
        .tp-header { width: 100%; margin: 0 0 16px; }
        .tp-grid { width: 100%; display: grid; grid-template-columns: 214px 1fr; gap: 16px; align-items: start; }
        .tp-sidebar { display: flex; flex-direction: column; align-items: stretch; align-self: start; }
        .tp-mob-nav { display: none; }

        /* ── Stacked card system ── */
        .tp-stack-card {
          position: relative; height: 48px; border-radius: 10px; cursor: pointer;
          overflow: hidden; display: flex; align-items: center; gap: 10px; padding: 0 13px;
          transition:
            transform   0.35s cubic-bezier(0.34,1.56,0.64,1),
            box-shadow  0.35s cubic-bezier(0.34,1.56,0.64,1),
            opacity     0.22s ease,
            border-color 0.22s ease;
          will-change: transform, box-shadow;
        }
        /* Shimmer sweep */
        .tp-card-shimmer {
          position: absolute; top:0; left:0; bottom:0; width: 55%;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.07) 50%, transparent 100%);
          transform: translateX(-220%);
          pointer-events: none;
          transition: none;
        }
        .tp-stack-card:hover .tp-card-shimmer {
          transform: translateX(400%);
          transition: transform 0.65s ease;
        }
        /* Click ripple */
        .tp-card-ripple {
          position: absolute; border-radius: 50%;
          width: 28px; height: 28px; margin-left: -14px; margin-top: -14px;
          animation: rippleOut 0.55s ease-out forwards;
          pointer-events: none;
        }
        /* Active card animated gradient wrapper */
        .tp-card-active-wrap {
          position: absolute; inset: -2px; border-radius: 11px; z-index: -1;
          background: linear-gradient(270deg, var(--card-c1), var(--card-c2), var(--card-c1));
          background-size: 300% 300%;
          animation: borderFlow 3s ease infinite;
          opacity: 0.7;
        }

        /* ── Mobile premium card strip ── */
        .tp-mob-card {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 8px 14px 13px; border-radius: 10px;
          cursor: pointer; font-size: 14px; font-weight: 700;
          flex-shrink: 0; position: relative; overflow: hidden;
          transition: transform 0.32s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.28s ease;
          font-family: inherit;
          -webkit-tap-highlight-color: transparent;
        }
        .tp-mob-card:active { transform: scale(0.91) !important; transition-duration: 0.1s !important; }

        /* ── Tablet (768px – 1099px) ── */
        @media (min-width: 768px) and (max-width: 1099px) {
          .tp-app { padding: 12px 14px; }
          .tp-app { zoom: 1; }
          .tp-header { width: 100%; margin-bottom: 12px; }
          .tp-grid { grid-template-columns: 172px 1fr; width: 100%; gap: 12px; }
          .tp-stack-card { height: 44px; padding: 0 10px; gap: 8px; }
        }

        /* ── Móvil (< 768px) ── */
        @media (max-width: 767px) {
          .tp-app { padding: 0 0 32px 0; zoom: 1; }

          /* Header pegajoso compacto */
          .tp-header {
            width: 100%; margin: 0;
            padding: 10px 14px;
            border-bottom: 1px solid rgba(255,255,255,0.07);
            background: rgba(13,15,20,0.95);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            position: sticky; top: 0; z-index: 200;
          }
          .tp-header-sub { display: none !important; }
          .tp-header-title { font-size: 15px !important; }

          /* Nav de módulos — scroll horizontal */
          .tp-mob-nav {
            display: flex !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            gap: 6px !important;
            padding: 10px 12px !important;
            border-bottom: 1px solid rgba(255,255,255,0.06) !important;
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
            background: rgba(13,15,20,0.6) !important;
          }
          .tp-mob-nav::-webkit-scrollbar { display: none; }

          /* Cards de navegación más compactos */
          .tp-mob-card {
            padding: 7px 12px 10px !important;
            font-size: 12px !important;
            border-radius: 9px !important;
          }
          /* Quitar el scale del active en móvil para evitar clipping */
          .tp-mob-card[data-active="true"],
          .tp-mob-card:focus { transform: none !important; }

          /* Ocultar sidebar y activar layout de bloque */
          .tp-sidebar { display: none !important; }
          .tp-grid { display: block !important; padding: 0 !important; }

          /* Módulo: sin borde ni border-radius, va edge-to-edge */
          .tp-mod-container {
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: transparent !important;
          }

          /* Header del módulo compacto */
          .tp-mod-header {
            padding: 10px 14px !important;
            border-radius: 0 !important;
          }
          .tp-mod-header > div > div:last-child { display: none; }

          /* Cuerpo del módulo con padding cómodo */
          .tp-module-body { padding: 14px !important; }

          /* Tasa cambio en móvil */
          .tp-mob-tasa { display: block; padding: 8px 14px 0; }

          /* Dropdown búsqueda global */
          .tp-dropdown {
            right: 0 !important;
            width: min(calc(100vw - 28px), 380px) !important;
            min-width: unset !important;
          }

          /* Inputs de fecha/mes en filtros */
          .tp-module-body input[type="date"],
          .tp-module-body input[type="month"] {
            min-width: 148px !important;
            flex: 1 !important;
          }

          /* Modales: ancho completo */
          .tp-modal-inner {
            max-width: calc(100vw - 28px) !important;
            width: calc(100vw - 28px) !important;
          }
        }
        .tp-mob-tasa { display: none; }

        /* ── Pantallas muy pequeñas (< 380px) ── */
        @media (max-width: 379px) {
          .tp-header-title { font-size: 12px !important; }
          .tp-hdr-exit { display: none !important; }
          .tp-mob-card { padding: 6px 9px 9px !important; font-size: 11px !important; }
        }

        /* ── Landscape móvil (altura < 500px) ── */
        @media (max-height: 500px) and (orientation: landscape) {
          .tp-app { padding: 0 0 8px 0 !important; }

          .tp-header {
            padding: 5px 12px !important;
            position: sticky;
            top: 0;
            z-index: 200;
          }
          .tp-header-title { font-size: 13px !important; }
          .tp-header-sub   { display: none !important; }

          /* Nav horizontal más compacto */
          .tp-mob-nav {
            padding: 4px 10px !important;
            gap: 4px !important;
          }
          .tp-mob-card {
            padding: 4px 10px 6px !important;
            font-size: 11px !important;
            border-radius: 7px !important;
          }

          /* Módulo */
          .tp-mod-header  { padding: 7px 12px !important; }
          .tp-module-body { padding: 8px 12px !important; }

          /* Tasa de cambio en landscape: ocultar para ahorrar espacio */
          .tp-mob-tasa { display: none !important; }
        }

        /* ── Safe area (iPhone notch / home indicator) ── */
        @supports (padding: max(0px)) {
          .tp-mob-nav {
            padding-left:  max(12px, env(safe-area-inset-left))  !important;
            padding-right: max(12px, env(safe-area-inset-right)) !important;
          }
          @media (max-width: 767px) {
            .tp-app {
              padding-bottom: max(32px, calc(32px + env(safe-area-inset-bottom))) !important;
            }
          }
        }
      `}</style>

      {/* ── HEADER ── */}
      {(() => {
        const nNotif = notifs.length;

        // Búsqueda global — resultados
        const searchResults = searchQ.trim().length >= 2 ? [
          ...EMPLEADOS_DB.filter(e => e.nombre.toLowerCase().includes(searchQ.toLowerCase())).slice(0,5).map(e => ({ icon:"👤", label:e.nombre, sub:`${e.area} · Doc: ${e.num}`, action:() => { navigateToModule("personal"); setShowSearch(false); setSearchQ(""); } })),
          ...INVENTARIO_BASE.filter(i => i.nombre.toLowerCase().includes(searchQ.toLowerCase())).slice(0,4).map(i => ({ icon:"📦", label:i.nombre, sub:`${i.cant} ${i.unidad}`, action:() => { navigateToModule("inventario"); setShowSearch(false); setSearchQ(""); } })),
          ...MODULES.filter(m => m.title.toLowerCase().includes(searchQ.toLowerCase())).slice(0,3).map((m) => ({ icon:m.icon, label:m.title, sub:"Módulo", action:() => { navigateToModule(m.id); setShowSearch(false); setSearchQ(""); } })),
        ] : [];

        return (
          <div className="tp-header" style={{ position:"relative" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:10, background:`linear-gradient(135deg,${colorPrincipal},#845EF7)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0, boxShadow:`0 4px 12px ${colorPrincipal}40` }}>🍋</div>
              <div style={{ minWidth:0, flex:1 }}>
                <div className="tp-header-title" style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, letterSpacing:-0.5, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {isSmall ? "JARVIS 🍋" : "Tierra Prometida Trading"}
                </div>
                <div className="tp-header-sub" style={{ fontSize:11, color:"rgba(255,255,255,0.48)" }}>Sistema de gestión — JARVIS</div>
              </div>
              <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>

                {/* Búsqueda */}
                <div style={{ position:"relative" }}>
                  {showSearch ? (
                    <input
                      ref={searchRef}
                      autoFocus
                      value={searchQ}
                      onChange={e => setSearchQ(e.target.value)}
                      onKeyDown={e => e.key==="Escape" && (setShowSearch(false), setSearchQ(""))}
                      placeholder="Buscar empleados, inventario, módulos…"
                      className="tp-search-open"
                      style={{ background:"rgba(255,255,255,0.09)", border:"1px solid rgba(255,255,255,0.20)", borderRadius:10, padding:"7px 12px", color:"white", fontSize:13, width:220, fontFamily:"inherit", outline:"none" }}
                    />
                  ) : (
                    <button onClick={() => setShowSearch(true)} title="Búsqueda global" className="tp-hdr-btn" style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:9, width:34, height:34, cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>🔍</button>
                  )}
                  {showSearch && searchResults.length > 0 && (
                    <div className="tp-dropdown" style={{ position:"absolute", top:"calc(100% + 6px)", right:0, background:"#1a1c26", border:"1px solid rgba(255,255,255,0.15)", borderRadius:12, minWidth:300, zIndex:500, overflow:"hidden", boxShadow:"0 8px 32px rgba(0,0,0,0.6)" }}>
                      {searchResults.map((r,i) => (
                        <button key={i} onClick={r.action} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", width:"100%", background:"none", border:"none", color:"white", cursor:"pointer", textAlign:"left", borderBottom:"1px solid rgba(255,255,255,0.09)", transition:"background 0.15s" }}
                          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.07)"}
                          onMouseLeave={e=>e.currentTarget.style.background="none"}>
                          <span style={{ fontSize:16 }}>{r.icon}</span>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600 }}>{r.label}</div>
                            <div style={{ fontSize:11, color:"rgba(255,255,255,0.48)" }}>{r.sub}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {showSearch && searchQ.trim().length >= 2 && searchResults.length === 0 && (
                    <div className="tp-dropdown" style={{ position:"absolute", top:"calc(100% + 6px)", right:0, background:"#1a1c26", border:"1px solid rgba(255,255,255,0.15)", borderRadius:12, minWidth:260, zIndex:500, padding:"14px 16px", fontSize:13, color:"rgba(255,255,255,0.48)", boxShadow:"0 8px 32px rgba(0,0,0,0.6)" }}>
                      Sin resultados para "{searchQ}"
                    </div>
                  )}
                </div>

                {/* Notificaciones */}
                <div style={{ position:"relative" }}>
                  <button
                    onClick={() => { setShowNotif(v=>!v); setShowSearch(false); }}
                    title="Notificaciones"
                    className={`tp-hdr-btn tp-hdr-notif${nNotif > 0 ? " tp-bell-anim" : ""}`}
                    style={{ position:"relative", background:showNotif?"rgba(132,94,247,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${showNotif?"#845EF7":"rgba(255,255,255,0.12)"}`, borderRadius:9, width:34, height:34, cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}
                  >
                    🔔
                    {nNotif > 0 && <span style={{ position:"absolute", top:-4, right:-4, background:"#FF6B6B", color:"white", fontSize:9, fontWeight:800, borderRadius:"50%", width:16, height:16, display:"flex", alignItems:"center", justifyContent:"center", border:"2px solid #020203" }}>{nNotif > 9 ? "9+" : nNotif}</span>}
                  </button>
                  {showNotif && (
                    <div className="tp-dropdown" style={{ position:"absolute", top:"calc(100% + 8px)", right:0, background:"#1a1c26", border:"1px solid rgba(255,255,255,0.15)", borderRadius:14, width:300, zIndex:500, overflow:"hidden", boxShadow:"0 8px 32px rgba(0,0,0,0.7)" }}>
                      <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,0.11)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontWeight:700, fontSize:13 }}>Notificaciones</span>
                        <button onClick={() => setShowNotif(false)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.48)", cursor:"pointer", fontSize:16, lineHeight:1 }}>×</button>
                      </div>
                      {notifs.length === 0 && <div style={{ padding:"20px 16px", fontSize:13, color:"rgba(255,255,255,0.48)", textAlign:"center" }}>Todo en orden ✅</div>}
                      {notifs.map((n,i) => (
                        <div key={i} style={{ display:"flex", gap:10, padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,0.08)", alignItems:"flex-start", transition:"background 0.15s" }}
                          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}
                          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <div style={{ width:32, height:32, borderRadius:8, background:`${n.color}20`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, flexShrink:0 }}>{n.icon}</div>
                          <div>
                            <div style={{ fontSize:12, fontWeight:700, color:"white", lineHeight:1.3 }}>{n.titulo}</div>
                            <div style={{ fontSize:11, color:"rgba(255,255,255,0.48)", marginTop:2 }}>{n.detalle}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="tp-header-sub" style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ textAlign:"right", transition:"opacity 0.2s" }}>
                    <div style={{ fontSize:12, color:"white", fontWeight:600 }}>{usuario.nombre.split(" ")[0]} {usuario.nombre.split(" ")[1]}</div>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.42)" }}>{usuario.rol}</div>
                  </div>
                </div>
                <div className="tp-hdr-avatar" style={{ width:32, height:32, borderRadius:9, background:`linear-gradient(135deg,#845EF7,${colorPrincipal})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"white", flexShrink:0 }}>{usuario.avatar}</div>
                <button onClick={logout} className="tp-hdr-exit" style={{ background:"rgba(255,107,107,0.1)", border:"1px solid rgba(255,107,107,0.25)", borderRadius:8, padding:"5px 10px", fontSize:11, color:"#FF6B6B", cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" }}>Salir</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── NAVEGACIÓN MÓVIL — premium spring cards ── */}
      <div className="tp-mob-nav">
        {modulosVisibles.map((m) => {
          const i = MODULES.indexOf(m);
          const isActive = activeModule === i;
          const acceso = tieneAcceso(m);
          return (
            <button
              key={i}
              className="tp-mob-card"
              onClick={() => { if (acceso) setActiveModule(i); }}
              style={{
                background: !acceso ? "rgba(255,255,255,0.02)" : isActive
                  ? `linear-gradient(145deg, ${m.color}35 0%, ${m.color}18 100%)`
                  : "rgba(255,255,255,0.04)",
                border: `1px solid ${isActive && acceso ? m.color+"60" : "rgba(255,255,255,0.07)"}`,
                borderTop: `2px solid ${isActive && acceso ? m.color : m.color+"35"}`,
                color: !acceso ? "rgba(255,255,255,0.2)" : isActive ? m.color : "rgba(255,255,255,0.45)",
                boxShadow: isActive && acceso
                  ? `0 8px 24px ${m.color}35, 0 0 0 1px ${m.color}20, inset 0 1px 0 ${m.color}20`
                  : "0 2px 8px rgba(0,0,0,0.35)",
                transform: isActive && !isMobile && acceso ? "translateY(-3.5px) scale(1.06)" : "none",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                cursor: acceso ? "pointer" : "not-allowed",
                opacity: acceso ? 1 : 0.45,
                position: "relative",
              }}
            >
              <span style={{ fontSize: isMobile ? 15 : 17 }}>{acceso ? m.icon : "🔒"}</span>
              <span>{m.title}</span>
              {isActive && acceso && (
                <div style={{
                  position:"absolute", bottom:4, left:"50%", transform:"translateX(-50%)",
                  width:18, height:3, borderRadius:2,
                  background:m.color,
                  boxShadow:`0 0 8px ${m.color}, 0 0 16px ${m.color}70`,
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tasa USD/COP en móvil (sidebar oculto) ── */}
      <div className="tp-mob-tasa" style={{ padding:"8px 12px 0" }}>
        <TasaCambioWidget />
      </div>

      {/* ── GRID PRINCIPAL ── */}
      <div className="tp-grid">

        {/* Columna 1 — Stacked folder cards */}
        <div className="tp-sidebar" onMouseLeave={() => setHoveredCard(null)}>
          {modulosVisibles.map((m) => {
            const i = MODULES.indexOf(m);
            const isActive  = activeModule === i;
            const isHov     = hoveredCard  === i;
            const isDim     = hoveredCard !== null && hoveredCard !== i && !isActive;
            const depth     = i / Math.max(1, MODULES.length - 1); // 0 → 1
            // Cascade: each successive card sits 1px further right (physical stack illusion)
            const cascadeX  = i * 1.2;
            const transform = (isActive || isHov)
              ? `perspective(900px) translateY(-14px) translateX(${cascadeX}px) scale(1.028) rotateX(-2deg)`
              : `translateX(${cascadeX}px)`;
            // Depth-layered base shadow — deeper cards cast more shadow
            const depthShadow = `0 ${2 + depth*10}px ${10 + depth*22}px rgba(0,0,0,${0.28 + depth*0.38}), 0 1px 0 rgba(255,255,255,${0.04 - depth*0.03})`;
            const boxShadow = isActive
              ? `0 18px 52px ${m.color}55, 0 0 0 1px ${m.color}65, 0 0 90px ${m.color}18, ${depthShadow}`
              : isHov
              ? `0 22px 64px ${m.color}42, 0 8px 28px rgba(0,0,0,0.65), ${depthShadow}`
              : depthShadow;

            const acceso = tieneAcceso(m);
            return (
              <div
                key={i}
                className="tp-stack-card"
                style={{
                  background: acceso
                    ? `linear-gradient(140deg, rgba(14,16,26,0.96) 0%, ${m.color}20 100%)`
                    : `linear-gradient(140deg, rgba(14,16,26,0.96) 0%, rgba(60,60,80,0.18) 100%)`,
                  backdropFilter:       "blur(14px)",
                  WebkitBackdropFilter: "blur(14px)",
                  border:    `1px solid rgba(255,255,255,${isActive ? 0.10 : 0.04})`,
                  borderTop: `2px solid ${acceso ? (isActive ? m.color : m.color+"70") : "rgba(255,255,255,0.12)"}`,
                  boxShadow: acceso ? boxShadow : depthShadow,
                  transform,
                  opacity: acceso ? (isDim ? 0.60 : 1) : 0.45,
                  zIndex:  isActive || isHov ? 50 : MODULES.length - i,
                  marginBottom: 4,
                  cursor: acceso ? "pointer" : "not-allowed",
                  "--card-c1": m.color,
                  "--card-c2": m.color + "66",
                }}
                onMouseEnter={() => setHoveredCard(i)}
                onClick={e => { if (acceso) { setActiveModule(i); triggerRipple(i, e); } }}
              >
                {/* Animated gradient border ring (active only) */}
                {isActive && acceso && <div className="tp-card-active-wrap" />}

                {/* Shimmer sweep on hover */}
                {acceso && <div className="tp-card-shimmer" />}

                {/* Click ripple particles */}
                {acceso && ripples.filter(r => r.cardIdx === i).map(r => (
                  <div key={r.id} className="tp-card-ripple" style={{ left:r.x, top:r.y, background:`${m.color}55` }} />
                ))}

                {/* Overlay bloqueado */}
                {!acceso && (
                  <div style={{ position:"absolute", inset:0, borderRadius:"inherit", background:"rgba(0,0,0,0.35)", display:"flex", alignItems:"center", justifyContent:"center", gap:5, zIndex:2 }}>
                    <span style={{ fontSize:11 }}>🔒</span>
                    <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.52)", letterSpacing:0.5 }}>BLOQUEADO</span>
                  </div>
                )}

                {/* Content */}
                <span style={{ fontSize:21, flexShrink:0, filter: acceso && (isActive || isHov) ? `drop-shadow(0 0 6px ${m.color})` : "none", transition:"filter 0.3s" }}>{m.icon}</span>
                <span style={{
                  fontSize:13, fontWeight:700, lineHeight:1.2,
                  color: !acceso ? "rgba(255,255,255,0.25)" : isActive ? m.color : isHov ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.62)",
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                  flex:1, letterSpacing:0.2,
                  transition:"color 0.2s ease",
                  textShadow: isActive && acceso ? `0 0 12px ${m.color}80` : "none",
                }}>{m.title}</span>

                {/* Active pulse dot */}
                {isActive && acceso && (
                  <div style={{
                    width:7, height:7, borderRadius:"50%", flexShrink:0,
                    background: m.color,
                    boxShadow: `0 0 0 2px ${m.color}40, 0 0 10px ${m.color}, 0 0 20px ${m.color}60`,
                    animation: "pulse 2s ease-in-out infinite",
                  }} />
                )}
              </div>
            );
          })}
          <div style={{ marginTop:8 }}>
            <TasaCambioWidget />
          </div>
        </div>

        {/* Columna 2 — Área de trabajo */}
        <div className="tp-mod-container" style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${mod.color}30`, borderRadius:16, overflow: isMobile ? "visible" : "hidden", boxShadow:`0 0 30px ${mod.color}10`, minWidth:0 }}>
          <div className="tp-mod-header" style={{ padding:"12px 16px", borderBottom:`1px solid ${mod.color}20`, display:"flex", alignItems:"center", gap:10, background:`${mod.color}08` }}>
            <span style={{ fontSize:20 }}>{mod.icon}</span>
            <div style={{ minWidth:0, flex:1 }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15, color:"white", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{mod.title}</div>
              {!isMobile && <div style={{ fontSize:11, color:"rgba(255,255,255,0.48)" }}>Tierra Prometida Trading 🍋</div>}
            </div>
            <div style={{ width:8, height:8, borderRadius:"50%", flexShrink:0, background:mod.color, boxShadow:`0 0 8px ${mod.color}` }} />
          </div>
          <div className="tp-module-body" style={{ padding: isMobile ? 12 : 18, overflowX:"hidden" }}>
            {renderDemo(mod.demo)}
          </div>
        </div>

      </div>
    </div>
    </SmallCtx.Provider>
    </MobCtx.Provider>
  );
}
