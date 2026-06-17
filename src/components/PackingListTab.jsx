import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import CustomSelect from "./CustomSelect.jsx";
import { usePackingList } from "../hooks/usePackingList.js";

const CALIBRES = [110, 150, 175, 200, 230, 250];
const DESTINOS = ["Philadelphia", "Miami, FL", "San Juan"];
const PESO_STR = "16.2 KG";

const COL_CAL = {
  110: { bg:"#3B82F6", light:"rgba(59,130,246,0.18)", border:"rgba(59,130,246,0.5)" },
  150: { bg:"#22C55E", light:"rgba(34,197,94,0.18)",  border:"rgba(34,197,94,0.5)"  },
  175: { bg:"#EAB308", light:"rgba(234,179,8,0.18)",  border:"rgba(234,179,8,0.5)"  },
  200: { bg:"#F97316", light:"rgba(249,115,22,0.18)", border:"rgba(249,115,22,0.5)" },
  230: { bg:"#EF4444", light:"rgba(239,68,68,0.18)",  border:"rgba(239,68,68,0.5)"  },
  250: { bg:"#8B5CF6", light:"rgba(139,92,246,0.18)", border:"rgba(139,92,246,0.5)" },
};

function initPallets(total) {
  const cpp = Math.floor(total / 20);
  return Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    calibres: [{ size: 200, cajas: cpp, predio: "", ica: "" }],
  }));
}
function initLayout() {
  return {
    left:  [1, 3, 5, 7, 9, 11, 13, 15, 17, 19],
    right: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  };
}
function fmtDate(d) {
  if (!d) return "";
  const [y, mo, dd] = d.split("-");
  return `${mo}-${dd}-${y}`;
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
  const [dragPidCamion, setDragPidCamion] = useState(null);

  // ── Fase 3 ────────────────────────────────────────────────────
  const [layout,  setLayout]  = useState(initLayout);
  const [dragPid, setDragPid] = useState(null);

  // ── Touch drag ────────────────────────────────────────────────
  const tRef = useRef({ pid:null, startX:0, startY:0, dragging:false, overPid:null });
  const [touchDragPid, setTouchDragPid] = useState(null);
  const [touchOverPid, setTouchOverPid] = useState(null);

  // ── Admin ─────────────────────────────────────────────────────
  const adminInicial = {
    plNo:"", fechaCargue:hoy, container:"", destino:"Philadelphia",
    vessel:"", palletCerts:[{ ica:"", palletNo:"" }],
    tempRecorder:"", tempRecorderPalletNo:"", finalStamps:"",
    packingDate:hoy, empresaTransporte:"", placa:"", trailer:"",
    conductor:"", horaCargue:"", horaSalida:"", supervisorCargue:"",
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
        if (data.layout_camion?.left) setLayoutCamion(data.layout_camion);
        if (data.layout_cont?.left)   setLayout(data.layout_cont);
        if (data.admin_data)
          setAdmin(prev => ({ ...prev, ...data.admin_data }));
      }
      setCargando(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenedor?.id]);

  // ── Guardar progreso ─────────────────────────────────────────
  const guardarProgreso = async (faseFinal, extraState = {}) => {
    if (!contenedor?.id) return;
    setGuardando(true);
    const row = {
      id:            plId || Date.now(),
      contenedor_id: contenedor.id,
      fase:          faseFinal,
      total_cajas:   totalCajas,
      cajas_input:   cajasInput,
      pallets:       extraState.pallets    ?? pallets,
      layout_camion: extraState.layoutCamion ?? layoutCamion,
      layout_cont:   extraState.layout     ?? layout,
      admin_data:    extraState.admin      ?? admin,
    };
    const { data, error } = await guardar(row);
    if (!error && data?.id) setPlId(data.id);
    setGuardando(false);
    if (!error) {
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2500);
    }
  };

  const cpp = Math.floor(totalCajas / 20);

  const changeTotalCajas = (v) => {
    const n = Number(v);
    if (!n || n <= 0) return;
    setTotalCajas(n);
    setCajasInput(String(n));
    setPallets(initPallets(n));
    setLayoutCamion(initLayout());
    setLayout(initLayout());
    setSelPid(null);
  };

  const setPF = (pi, ci, field, val) =>
    setPallets(prev => prev.map((p, i) => i !== pi ? p : {
      ...p, calibres: p.calibres.map((c, j) => j !== ci ? c : { ...c, [field]: val }),
    }));
  const addCal = (pi) =>
    setPallets(prev => prev.map((p, i) => i !== pi ? p : {
      ...p, calibres: [...p.calibres, { size:200, cajas:0, predio:"", ica:"" }],
    }));
  const removeCal = (pi, ci) =>
    setPallets(prev => prev.map((p, i) => (i !== pi || p.calibres.length <= 1) ? p : {
      ...p, calibres: p.calibres.filter((_, j) => j !== ci),
    }));

  const palletSum  = (p)   => p.calibres.reduce((s, c) => s + Number(c.cajas || 0), 0);
  const palletById = (pid) => pallets.find(p => p.id === pid);
  const selPalletIdx = selPid !== null ? pallets.findIndex(p => p.id === selPid) : -1;

  const makeSwap = (setFn) => (pidA, pidB) =>
    setFn(prev => {
      const next = { left:[...prev.left], right:[...prev.right] };
      const find = pid => {
        const li = next.left.indexOf(pid);  if (li >= 0) return { col:"left",  idx:li };
        const ri = next.right.indexOf(pid); if (ri >= 0) return { col:"right", idx:ri };
        return null;
      };
      const a = find(pidA), b = find(pidB);
      if (!a || !b) return prev;
      next[a.col][a.idx] = pidB;
      next[b.col][b.idx] = pidA;
      return next;
    });
  const swapCamion    = makeSwap(setLayoutCamion);
  const swapContainer = makeSwap(setLayout);

  const makeDrop = (setFn, dragState, setDragState) => (col, idx) => {
    if (dragState === null) return;
    setFn(prev => {
      const next = { left:[...prev.left], right:[...prev.right] };
      const li = next.left.indexOf(dragState), ri = next.right.indexOf(dragState);
      const fc = li >= 0 ? "left" : "right", fi = li >= 0 ? li : ri;
      if (fc === col && fi === idx) return prev;
      const d = next[col][idx];
      next[col][idx] = dragState; next[fc][fi] = d;
      return next;
    });
    setDragState(null);
  };
  const dropCamion    = makeDrop(setLayoutCamion, dragPidCamion, setDragPidCamion);
  const dropContainer = makeDrop(setLayout, dragPid, setDragPid);

  const onTouchStartPallet = (e, pid) => {
    const t = e.touches[0];
    tRef.current = { pid, startX:t.clientX, startY:t.clientY, dragging:false, overPid:null };
  };
  const onTouchMovePallet = (e, pid) => {
    const r = tRef.current;
    if (r.pid !== pid) return;
    const t = e.touches[0];
    const dist = Math.hypot(t.clientX - r.startX, t.clientY - r.startY);
    if (!r.dragging && dist > 8) {
      r.dragging = true; setTouchDragPid(pid); navigator.vibrate?.([20]);
    }
    if (r.dragging) {
      e.preventDefault();
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const pidEl = el?.closest("[data-pid]");
      const over  = pidEl ? Number(pidEl.getAttribute("data-pid")) : null;
      const overPid = (over && over !== pid) ? over : null;
      if (r.overPid !== overPid) { r.overPid = overPid; setTouchOverPid(overPid); }
    }
  };
  const onTouchEndPallet = (e, pid) => {
    const r = tRef.current;
    if (r.pid !== pid) return;
    if (r.dragging) {
      e.preventDefault();
      if (r.overPid) { if (fase === 2) swapCamion(pid, r.overPid); else swapContainer(pid, r.overPid); }
    } else {
      if (fase === 1) setSelPid(prev => prev === pid ? null : pid);
    }
    tRef.current = { pid:null, startX:0, startY:0, dragging:false, overPid:null };
    setTouchDragPid(null); setTouchOverPid(null);
  };

  const resumen = CALIBRES.map(size => ({
    size,
    cajas: pallets.reduce((s, p) =>
      s + p.calibres.filter(c => Number(c.size) === size)
                    .reduce((ss, c) => ss + Number(c.cajas || 0), 0), 0),
  }));
  const totalConf  = pallets.reduce((s, p) => s + palletSum(p), 0);
  const todoCuadra = totalConf === totalCajas;

  // ── Tarjeta de pallet (layout) ───────────────────────────────
  const renderPalletCard = (pid, idx, col, dragState, setDragState, onDrop) => {
    const p = palletById(pid); if (!p) return null;
    const isMixed    = p.calibres.length > 1;
    const mainCal    = COL_CAL[p.calibres[0].size] || COL_CAL[200];
    const isDragDsk  = dragState === pid;
    const isTouchDrg = touchDragPid === pid;
    const isTouchTgt = touchOverPid === pid;
    const sum = palletSum(p);
    const ok  = sum === cpp;
    let bg = "rgba(255,255,255,0.05)";
    let border = `1px solid ${mainCal.border}`;
    if (isMixed) {
      bg = `linear-gradient(135deg,${p.calibres.map((c, i) => `${COL_CAL[c.size]?.bg||"#888"}${i===0?"55":"33"}`).join(",")})`;
      border = "1px solid rgba(255,255,255,0.25)";
    }
    if (isTouchDrg) border = "2px solid rgba(255,255,255,0.7)";
    else if (isTouchTgt) { bg = "rgba(34,197,94,0.15)"; border = "2px dashed #22C55E"; }
    return (
      <div
        key={pid} data-pid={pid}
        draggable={!m}
        onDragStart={() => !m && setDragState(pid)}
        onDragOver={e => e.preventDefault()}
        onDrop={() => !m && onDrop(col, idx)}
        onTouchStart={m ? e => onTouchStartPallet(e, pid) : undefined}
        onTouchMove={m  ? e => onTouchMovePallet(e, pid)  : undefined}
        onTouchEnd={m   ? e => onTouchEndPallet(e, pid)   : undefined}
        style={{
          background:bg, border, borderRadius: m ? 8 : 6, padding: m ? "8px 7px" : "5px 6px",
          cursor: touchDragPid ? (isTouchTgt ? "copy" : "grabbing") : "grab",
          position:"relative", opacity: isDragDsk || isTouchDrg ? 0.4 : 1,
          transition: isTouchDrg || isTouchTgt ? "none" : "all 0.12s",
          minHeight: m ? 64 : 54, display:"flex", flexDirection:"column", justifyContent:"space-between",
          boxShadow: isTouchTgt ? "0 0 0 3px rgba(34,197,94,0.35)" : "none",
          transform: isTouchDrg ? "scale(0.94)" : isTouchTgt ? "scale(1.04)" : "none",
          WebkitTapHighlightColor:"transparent", userSelect:"none", touchAction:"none",
        }}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize: m ? 10 : 9, fontWeight:800, color:"rgba(255,255,255,0.55)" }}>P{pid}</span>
          {!ok && <span style={{ fontSize: m ? 9 : 8, color:"#F9A826" }}>⚠</span>}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
          {p.calibres.map((c, ci) => (
            <div key={ci} style={{ display:"flex", alignItems:"center", gap:3 }}>
              <span style={{ fontSize: m ? 11 : 8, fontWeight:700, color:COL_CAL[c.size]?.bg||"#fff", lineHeight:1 }}>{c.size}</span>
              <span style={{ fontSize: m ? 9 : 8, color:"rgba(255,255,255,0.5)", lineHeight:1 }}>{c.cajas}cj</span>
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
  const renderVehicleGrid = (currentLayout, dragState, setDragState, onDrop, vehicleIcon, vehicleLabel, hint) => (
    <div style={{ background:"rgba(0,0,0,0.3)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding: m ? 12 : 14, marginBottom: m ? 14 : 12 }}>
      <div style={{ display:"flex", flexWrap:"wrap", gap: m ? 8 : 6, marginBottom: m ? 12 : 10, alignItems:"center" }}>
        {resumen.filter(r => r.cajas > 0).map(r => (
          <div key={r.size} style={{ background:COL_CAL[r.size].light, border:`1px solid ${COL_CAL[r.size].border}`, borderRadius:6, padding: m ? "5px 11px" : "3px 9px", fontSize: m ? 12 : 10, fontWeight:700, display:"flex", gap:5, alignItems:"center" }}>
            <span style={{ color:COL_CAL[r.size].bg }}>{r.size}</span>
            <span style={{ color:"rgba(255,255,255,0.6)" }}>{r.cajas.toLocaleString("es-CO")}</span>
          </div>
        ))}
        <div style={{ marginLeft:"auto", fontSize: m ? 13 : 11, fontWeight:700, color: todoCuadra ? "#00C9A7" : "#F9A826" }}>
          {todoCuadra ? `✓ ${totalCajas.toLocaleString("es-CO")}` : `⚠ ${totalConf}/${totalCajas}`}
        </div>
      </div>
      {touchDragPid !== null && (
        <div style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, padding:"7px 12px", marginBottom:10, fontSize:12, color:"rgba(255,255,255,0.7)", textAlign:"center" }}>
          Arrastrando P{touchDragPid} — suelta sobre otro pallet para intercambiar
        </div>
      )}
      {m ? (
        <div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginBottom:6 }}>◀ FONDO — LADO IZQUIERDO</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6, marginBottom:6 }}>
            {currentLayout.left.map((pid, idx) => renderPalletCard(pid, idx, "left", dragState, setDragState, onDrop))}
          </div>
          <div style={{ height:5, background:"rgba(255,255,255,0.04)", borderRadius:3, margin:"2px 0 6px", border:"1px solid rgba(255,255,255,0.06)" }} />
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6 }}>
            {currentLayout.right.map((pid, idx) => renderPalletCard(pid, idx, "right", dragState, setDragState, onDrop))}
          </div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", textAlign:"right", marginTop:6 }}>LADO DERECHO — PUERTA ▶</div>
        </div>
      ) : (
        <div style={{ display:"flex", gap:0, alignItems:"stretch" }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", marginRight:6 }}>
            <div style={{ display:"flex", gap:3, marginBottom:4 }}>
              {[0,1].map(i => <div key={i} style={{ width:8, height:14, background:"#333", borderRadius:3, border:"1px solid #555" }} />)}
            </div>
            <div style={{ width:52, background:"linear-gradient(180deg,#3a3a3a,#1f1f1f)", border:"2px solid #555", borderRadius:"8px 4px 4px 8px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"8px 4px", flex:1, gap:4 }}>
              <div style={{ fontSize:18 }}>{vehicleIcon}</div>
              <div style={{ fontSize:7, color:"rgba(255,255,255,0.4)", textAlign:"center", lineHeight:1.2 }}>{vehicleLabel}</div>
            </div>
            <div style={{ display:"flex", gap:3, marginTop:4 }}>
              {[0,1].map(i => <div key={i} style={{ width:8, height:14, background:"#333", borderRadius:3, border:"1px solid #555" }} />)}
            </div>
          </div>
          <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
            <div style={{ display:"flex", justifyContent:"space-around", marginBottom:4, paddingLeft:20, paddingRight:20 }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ display:"flex", gap:2 }}>
                  {[0,1].map(j => <div key={j} style={{ width:8, height:12, background:"#333", borderRadius:"3px 3px 0 0", border:"1px solid #555" }} />)}
                </div>
              ))}
            </div>
            <div style={{ flex:1, background:"linear-gradient(180deg,#1a1a2e 0%,#16213e 100%)", border:"3px solid #4a4a6a", borderRadius:"0 6px 6px 0", position:"relative", overflow:"hidden" }}>
              {[...Array(9)].map((_, i) => (
                <div key={i} style={{ position:"absolute", left:`${(i+1)*10}%`, top:0, bottom:0, width:1, background:"rgba(255,255,255,0.04)", pointerEvents:"none" }} />
              ))}
              <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:4 }}>
                <div style={{ fontSize:8, color:"rgba(255,255,255,0.25)", marginBottom:2, letterSpacing:1 }}>◀ FONDO</div>
                <div style={{ display:"flex", gap:4 }}>
                  <div style={{ fontSize:8, color:"rgba(255,255,255,0.3)", writingMode:"vertical-rl", transform:"rotate(180deg)", display:"flex", alignItems:"center", minWidth:12 }}>IZQ</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(10,1fr)", gap:4, flex:1 }}>
                    {currentLayout.left.map((pid, idx) => renderPalletCard(pid, idx, "left", dragState, setDragState, onDrop))}
                  </div>
                </div>
                <div style={{ height:6, background:"rgba(255,255,255,0.03)", borderRadius:2, margin:"0 12px", border:"1px solid rgba(255,255,255,0.05)" }} />
                <div style={{ display:"flex", gap:4 }}>
                  <div style={{ fontSize:8, color:"rgba(255,255,255,0.3)", writingMode:"vertical-rl", transform:"rotate(180deg)", display:"flex", alignItems:"center", minWidth:12 }}>DER</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(10,1fr)", gap:4, flex:1 }}>
                    {currentLayout.right.map((pid, idx) => renderPalletCard(pid, idx, "right", dragState, setDragState, onDrop))}
                  </div>
                </div>
                <div style={{ fontSize:8, color:"rgba(255,255,255,0.25)", textAlign:"right", marginTop:2, letterSpacing:1 }}>PUERTA ▶</div>
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"space-around", marginTop:4, paddingLeft:20, paddingRight:20 }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ display:"flex", gap:2 }}>
                  {[0,1].map(j => <div key={j} style={{ width:8, height:12, background:"#333", borderRadius:"0 0 3px 3px", border:"1px solid #555" }} />)}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", marginLeft:6 }}>
            <div style={{ width:18, background:"linear-gradient(180deg,#2a2a2a,#1a1a1a)", border:"2px solid #555", borderRadius:"2px 6px 6px 2px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"6px 2px", flex:1, gap:6 }}>
              {[...Array(6)].map((_, i) => <div key={i} style={{ width:4, height:4, background:"#666", borderRadius:"50%" }} />)}
            </div>
          </div>
        </div>
      )}
      <div style={{ fontSize: m ? 11 : 8, color:"rgba(255,255,255,0.2)", textAlign:"center", marginTop: m ? 10 : 8 }}>{hint}</div>
    </div>
  );

  // ── Excel / PDF ───────────────────────────────────────────────
  const [generandoExcel, setGenerandoExcel] = useState(false);
  const generarExcel = async () => {
    setGenerandoExcel(true);
    try {
      // Cargar plantilla desde public/
      const res = await fetch("/plantilla-packing-list.xlsx");
      if (!res.ok) throw new Error("No se encontró la plantilla Excel");
      const ab  = await res.arrayBuffer();
      const wb  = XLSX.read(ab, { type: "array", cellStyles: true });
      const ws  = wb.Sheets[wb.SheetNames[0]];

      const sv = (addr, val, type) => {
        if (!ws[addr]) ws[addr] = {};
        ws[addr].v = val;
        ws[addr].t = type || (typeof val === "number" ? "n" : "s");
        if (ws[addr].f) delete ws[addr].f; // quitar fórmulas si las hay
      };

      // ── Encabezado ──────────────────────────────────────────────
      sv("A2", `TIERRA PROMETIDA TRADING SAS.\r\nBARRANQUILLA - ATLANTICO\r\noperaciones@tierraprometidat.com\r\nPacking List No. ${admin.plNo || ""}`);
      sv("A5", "CARTAGENA");
      sv("D5", (admin.destino || "MIAMI").toUpperCase());
      sv("F5", totalCajas, "n");
      sv("H5", 20, "n");

      const pesoTotal = Math.round(totalCajas * 16.2 * 100) / 100;
      sv("A7", pesoTotal, "n");
      sv("D7", pesoTotal, "n");
      sv("F7", admin.empresaTransporte || "");
      sv("H7", admin.placa || "");

      sv("A9", admin.plNo || "");
      sv("D9", admin.tempRecorder || "");

      // Fecha como número Excel
      if (admin.fechaCargue) {
        const [y, mo, d] = admin.fechaCargue.split("-").map(Number);
        const excelDate = Math.floor((new Date(y, mo - 1, d) - new Date(1899, 11, 30)) / 86400000);
        ws["F9"] = { t: "n", v: excelDate, z: "mm/dd/yyyy" };
      }
      sv("H9", admin.finalStamps || "");

      // ── Limpiar filas de pallets anteriores (filas 11–60) ───────
      for (let r = 11; r <= 60; r++) {
        ["A","B","C","D","E","F","G","H","I"].forEach(col => { delete ws[`${col}${r}`]; });
      }

      // ── Escribir datos de pallets ────────────────────────────────
      let rowNum = 11;
      pallets.forEach((pallet) => {
        pallet.calibres.forEach((cal, ci) => {
          if (ci === 0) {
            sv(`A${rowNum}`, pallet.id, "n");
            sv(`B${rowNum}`, "16.2 KG");
          }
          sv(`C${rowNum}`, Number(cal.size), "n");
          sv(`D${rowNum}`, "LIMON TAHITI");
          sv(`E${rowNum}`, 1, "n");
          sv(`F${rowNum}`, Number(cal.cajas || 0), "n");
          sv(`G${rowNum}`, cal.predio || "");
          sv(`H${rowNum}`, Number(cal.cajas || 0), "n");
          sv(`I${rowNum}`, String(cal.ica || ""));
          rowNum++;
        });
      });

      // Actualizar rango
      ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowNum, c: 8 } });

      // ── Descargar ────────────────────────────────────────────────
      const out  = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `Packing-List-${admin.plNo || admin.container || "export"}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Error generando Excel: " + e.message);
    } finally {
      setGenerandoExcel(false);
    }
  };

  const generarPDF = () => {
    const G   = "#1a5c1a";
    const GL  = "#e8f5e9";
    const peso = Math.round(totalCajas * 16.2 * 100) / 100;

    // Filas de pallets — misma lógica que generarExcel
    const palletRows = pallets.flatMap((pallet) =>
      pallet.calibres.map((cal, ci) => `
      <tr>
        <td class="num">${ci === 0 ? pallet.id : ""}</td>
        <td>${ci === 0 ? "16.2 KG" : ""}</td>
        <td class="num">${cal.size}</td>
        <td>LIMON TAHITI</td>
        <td class="num">1</td>
        <td class="num">${Number(cal.cajas || 0)}</td>
        <td>${cal.predio || ""}</td>
        <td class="num">${Number(cal.cajas || 0)}</td>
        <td>${cal.ica || ""}</td>
      </tr>`)
    ).join("");

    // Fecha formateada igual que el Excel (mm/dd/yyyy)
    let fechaFmt = "";
    if (admin.fechaCargue) {
      const [y, mo, d] = admin.fechaCargue.split("-");
      fechaFmt = `${mo}/${d}/${y}`;
    }

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Packing List ${admin.plNo || ""}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:10px;color:#111;background:#fff;padding:18px 22px}
/* ── Cabecera empresa (equivale a A2 del Excel) ── */
.hdr-empresa{
  width:100%;border:1.5px solid ${G};border-collapse:collapse;margin-bottom:0
}
.hdr-empresa td{
  padding:10px 14px;font-size:13px;font-weight:900;color:${G};
  white-space:pre-line;line-height:1.5;border:none
}
/* ── Tabla de metadatos (filas 4-9 del Excel) ── */
.meta{width:100%;border-collapse:collapse;border:1.5px solid ${G};border-top:none;margin-bottom:8px}
.meta td{border:1px solid ${G};padding:4px 7px}
.meta .lbl{background:${G};color:#fff;font-weight:700;font-size:8.5px;text-transform:uppercase;white-space:nowrap}
.meta .val{font-weight:700;font-size:10px;background:#fff}
/* ── Tabla de pallets (fila 10+ del Excel) ── */
.pal{width:100%;border-collapse:collapse;border:1.5px solid ${G}}
.pal th{background:${G};color:#fff;padding:5px 6px;font-size:8.5px;font-weight:700;text-align:center;border:1px solid ${G}}
.pal td{padding:4px 6px;border:1px solid #b2dfb2;font-size:9px}
.pal td.num{text-align:right}
.pal tr:nth-child(even) td{background:${GL}}
@media print{body{padding:8px 12px}@page{size:A4 landscape;margin:8mm}}
</style>
</head><body>

<!-- A2: empresa (celda combinada A2:I2 del Excel) -->
<table class="hdr-empresa"><tr><td>TIERRA PROMETIDA TRADING SAS.
BARRANQUILLA - ATLANTICO
operaciones@tierraprometidat.com
Packing List No. ${admin.plNo || ""}</td></tr></table>

<!-- Filas 4-9: metadatos en 4 columnas (A-C | D-E | F-G | H-I) -->
<table class="meta">
  <tr>
    <td class="lbl" style="width:14%">PUERTO DE SALIDA</td>
    <td class="val" style="width:11%">CARTAGENA</td>
    <td class="lbl" style="width:14%">PUERTO DE DESTINO</td>
    <td class="val" style="width:11%">${(admin.destino || "").toUpperCase()}</td>
    <td class="lbl" style="width:14%">TOTAL CAJAS</td>
    <td class="val" style="width:11%">${totalCajas}</td>
    <td class="lbl" style="width:14%">TOTAL PALLETS</td>
    <td class="val" style="width:11%">20</td>
  </tr>
  <tr>
    <td class="lbl">PESO BRUTO</td>
    <td class="val">${peso} KG</td>
    <td class="lbl">PESO NETO</td>
    <td class="val">${peso} KG</td>
    <td class="lbl">EMPRESA TRANSPOR</td>
    <td class="val">${admin.empresaTransporte || ""}</td>
    <td class="lbl">PLACA</td>
    <td class="val">${admin.placa || ""}</td>
  </tr>
  <tr>
    <td class="lbl">DEAL</td>
    <td class="val">${admin.plNo || ""}</td>
    <td class="lbl">DATALLOGERS 1</td>
    <td class="val">${admin.tempRecorder || ""}</td>
    <td class="lbl">FECHA DE CARGUE</td>
    <td class="val">${fechaFmt}</td>
    <td class="lbl">SEALS</td>
    <td class="val">${admin.finalStamps || ""}</td>
  </tr>
</table>

<!-- Fila 10: encabezados + filas 11+: pallets -->
<table class="pal">
  <thead><tr>
    <th>Pallet No.</th>
    <th>Peso / caja</th>
    <th>Size</th>
    <th>Product</th>
    <th>Category</th>
    <th>No. Boxes</th>
    <th>Predio</th>
    <th>Cantidad</th>
    <th>Registro</th>
  </tr></thead>
  <tbody>${palletRows}</tbody>
</table>
</body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `Packing-List-${admin.plNo || admin.container || "XXXX"}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(u);
  };

  // ── Botones nav ───────────────────────────────────────────────
  const SaveIndicator = () => (
    <div style={{ display:"flex", alignItems:"center", gap:6, fontSize: m ? 12 : 10, color: guardadoOk ? "#00C9A7" : guardando ? "#F9A826" : "rgba(255,255,255,0.3)" }}>
      {guardando ? "💾 Guardando..." : guardadoOk ? "✅ Guardado" : plId ? "☁️ Guardado en la nube" : "Sin guardar"}
    </div>
  );

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
      {fase === 1 && (() => {
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
              <div style={{ display:"flex", alignItems:"flex-end", gridColumn: m ? "1 / -1" : "auto" }}>
                <div style={{ flex:1, background: todoCuadra ? "rgba(0,201,167,0.08)" : "rgba(249,115,22,0.08)", border:`1px solid ${todoCuadra ? "rgba(0,201,167,0.3)" : "rgba(249,115,22,0.3)"}`, borderRadius:8, padding:"7px 14px", display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize: m ? 18 : 15 }}>{todoCuadra ? "✅" : "⚠️"}</span>
                  <div>
                    <div style={{ fontSize: m ? 12 : 10, fontWeight:700, color: todoCuadra ? "#00C9A7" : "#F9A826" }}>
                      {todoCuadra ? "Cuadra perfecto" : `Faltan ${totalCajas - totalConf} cajas`}
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
              <div style={{ display:"grid", gridTemplateColumns: m ? "repeat(4,1fr)" : "repeat(10,1fr)", gap: m ? 8 : 6 }}>
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
                            <span style={{ fontSize: m ? 12 : 9, fontWeight:700, color:COL_CAL[c.size]?.bg||"#fff", lineHeight:1 }}>{c.size}</span>
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
                {selP.calibres.map((c, ci) => (
                  <div key={ci} style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${COL_CAL[c.size]?.border||"rgba(255,255,255,0.1)"}`, borderRadius:10, padding: m ? 14 : 10, marginBottom:10 }}>
                    {m ? (
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                          <div><div style={lbl}>Calibre / Size</div>
                            <CustomSelect value={c.size} onChange={e => setPF(selPalletIdx, ci, "size", Number(e.target.value))} style={{ ...inp, background:COL_CAL[c.size]?.light||"rgba(255,255,255,0.07)", cursor:"pointer" }}>
                              {CALIBRES.map(cal => <option key={cal} value={cal}>{cal}</option>)}
                            </CustomSelect>
                          </div>
                          <div><div style={lbl}>N° Cajas</div><input type="number" inputMode="numeric" min={0} value={c.cajas} onChange={e => setPF(selPalletIdx, ci, "cajas", e.target.value)} style={inp} /></div>
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                          <div><div style={lbl}>Predio</div><input value={c.predio} onChange={e => setPF(selPalletIdx, ci, "predio", e.target.value)} placeholder="Nombre del predio" style={inp} /></div>
                          <div><div style={lbl}>Registro ICA</div><input value={c.ica} onChange={e => setPF(selPalletIdx, ci, "ica", e.target.value)} placeholder="980005905" style={inp} /></div>
                        </div>
                        <div>{ci === 0
                          ? <button onClick={() => addCal(selPalletIdx)} style={{ width:"100%", background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.4)", borderRadius:8, padding:"12px", color:"#a5b4fc", cursor:"pointer", fontSize:14, fontWeight:600, minHeight:44 }}>➕ Agregar calibre mixto</button>
                          : <button onClick={() => removeCal(selPalletIdx, ci)} style={{ width:"100%", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"12px", color:"#fca5a5", cursor:"pointer", fontSize:14, fontWeight:600, minHeight:44 }}>✕ Quitar calibre</button>
                        }</div>
                      </div>
                    ) : (
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 1fr 1fr auto", gap:8, alignItems:"end" }}>
                        <div><div style={lbl}>Calibre / Size</div>
                          <CustomSelect value={c.size} onChange={e => setPF(selPalletIdx, ci, "size", Number(e.target.value))} style={{ ...inp, background:COL_CAL[c.size]?.light||"rgba(255,255,255,0.07)", cursor:"pointer" }}>
                            {CALIBRES.map(cal => <option key={cal} value={cal}>{cal}</option>)}
                          </CustomSelect>
                        </div>
                        <div><div style={lbl}>N° Cajas</div><input type="number" min={0} value={c.cajas} onChange={e => setPF(selPalletIdx, ci, "cajas", e.target.value)} style={inp} /></div>
                        <div><div style={lbl}>Predio</div><input value={c.predio} onChange={e => setPF(selPalletIdx, ci, "predio", e.target.value)} placeholder="Nombre del predio" style={inp} /></div>
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

            <div style={{ display:"flex", gap:8, paddingTop: m ? 14 : 10, alignItems:"center" }}>
              <SaveIndicator />
              <div style={{ flex:1, display:"flex", gap:8 }}>
                <NavBtn onClick={() => guardarProgreso(1)}>💾 Guardar</NavBtn>
                <NavBtn primary onClick={async () => { setSelPid(null); await guardarProgreso(2); setFase(2); }}>
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

          <div style={{ background:"rgba(249,115,22,0.07)", border:"1px solid rgba(249,115,22,0.25)", borderRadius:10, padding: m ? "10px 14px" : "8px 14px", marginBottom: m ? 12 : 10, fontSize: m ? 12 : 11, color:"rgba(249,115,22,0.9)" }}>
            🚛 Arrastra los pallets para reflejar cómo quedaron físicamente dentro del camión (fondo → puerta trasera).
          </div>

          {renderVehicleGrid(layoutCamion, dragPidCamion, setDragPidCamion, dropCamion, "🚛", "CAMIÓN",
            m ? "Mantén presionado y arrastra para cambiar posición" : "Arrastra para cambiar posición"
          )}

          <div style={{ display:"flex", gap:8, paddingTop: m ? 14 : 10, alignItems:"center" }}>
            <SaveIndicator />
            <div style={{ flex:1, display:"flex", gap:8 }}>
              <NavBtn onClick={() => setFase(1)}>← Volver</NavBtn>
              <NavBtn onClick={() => guardarProgreso(2)}>💾 Guardar</NavBtn>
              <NavBtn primary onClick={async () => { await guardarProgreso(3); setFase(3); }}>
                Continuar a Contenedor →
              </NavBtn>
            </div>
          </div>
        </div>
      )}

      {/* ══ FASE 3 — PACKING CONTENEDOR ══ */}
      {fase === 3 && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(4,1fr)", gap: m ? 10 : 8, marginBottom: m ? 12 : 10 }}>
            {[
              { l:"Packing List No.", v:admin.plNo,        k:"plNo",        ph:"2026-174"            },
              { l:"N° Container",     v:admin.container,   k:"container",   ph:"TLLU1194289"         },
              { l:"Vessel / Motonave",v:admin.vessel,      k:"vessel",      ph:"SPIRIT OF MELBOURNE" },
              { l:"Final Stamps",     v:admin.finalStamps, k:"finalStamps", ph:"005743–SQ83066"      },
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
              <div style={{ fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.4)", marginBottom: m ? 10 : 6, fontWeight:700 }}>🌡 TEMP RECORDER (DATALOGGER)</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 90px", gap: m ? 10 : 6 }}>
                <div><div style={lbl}>Número</div><input value={admin.tempRecorder} onChange={e => sa("tempRecorder", e.target.value)} placeholder="V1-0041573" style={inp} /></div>
                <div><div style={lbl}>En pallet #</div><input type="number" inputMode="numeric" min={1} max={20} value={admin.tempRecorderPalletNo} onChange={e => sa("tempRecorderPalletNo", e.target.value)} style={inp} /></div>
              </div>
            </div>
          </div>

          <div style={{ background:"rgba(14,165,233,0.07)", border:"1px solid rgba(14,165,233,0.25)", borderRadius:10, padding: m ? "10px 14px" : "8px 14px", marginBottom: m ? 12 : 10, fontSize: m ? 12 : 11, color:"rgba(14,165,233,0.9)" }}>
            🚢 Ajusta el orden final de los pallets tal como quedaron cargados dentro del contenedor.
          </div>

          {renderVehicleGrid(layout, dragPid, setDragPid, dropContainer, "🚢", "CONT.",
            m ? "Mantén presionado y arrastra para cambiar posición" : "Arrastra para cambiar posición"
          )}

          <div style={{ display:"flex", flexDirection: m ? "column" : "row", gap: m ? 10 : 8, paddingTop: m ? 14 : 12, borderTop:"1px solid rgba(255,255,255,0.06)", marginBottom: m ? 10 : 8 }}>
            <button onClick={generarExcel} disabled={generandoExcel} style={{ flex:1, background:"linear-gradient(135deg,#22C55E,#16A34A)", border:"none", borderRadius:10, padding: m ? "15px" : "11px", fontSize: m ? 15 : 12, color:"white", cursor: generandoExcel ? "wait" : "pointer", fontWeight:700, opacity: generandoExcel ? 0.7 : 1, minHeight: m ? 52 : 38 }}>
              {generandoExcel ? "⏳ Generando..." : "📊 Descargar Excel (Planta)"}
            </button>
            <button onClick={generarPDF} style={{ flex:1, background:"linear-gradient(135deg,#1a5c1a,#2d8a2d)", border:"none", borderRadius:10, padding: m ? "15px" : "11px", fontSize: m ? 15 : 12, color:"white", cursor:"pointer", fontWeight:700, minHeight: m ? 52 : 38 }}>
              📄 Descargar PDF (Administrativo)
            </button>
          </div>

          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <SaveIndicator />
            <div style={{ flex:1, display:"flex", gap:8 }}>
              <NavBtn onClick={() => setFase(2)}>← Volver a Camión</NavBtn>
              <NavBtn onClick={() => guardarProgreso(3)}>💾 Guardar</NavBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
