import { useState } from "react";
import * as XLSX from "xlsx";
import CustomSelect from "./CustomSelect.jsx";

const CALIBRES  = [110, 150, 175, 200, 230, 250];
const DESTINOS  = ["Philadelphia", "Miami, FL", "San Juan"];
const PESO_KG   = 16.2;
const PESO_STR  = "16.2 KG";

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
    left:  [1,3,5,7,9,11,13,15,17,19],
    right: [2,4,6,8,10,12,14,16,18,20],
  };
}
function fmtDate(d) {
  if (!d) return "";
  const [y,m,dd] = d.split("-");
  return `${m}-${dd}-${y}`;
}

export default function PackingListTab({ mob }) {
  const hoy = new Date().toISOString().split("T")[0];
  const inp = { background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:7, padding:"6px 9px", color:"white", fontSize:11, fontFamily:"inherit", width:"100%", boxSizing:"border-box" };
  const lbl = { fontSize:9, color:"rgba(255,255,255,0.4)", marginBottom:3 };

  const [totalCajas, setTotalCajas] = useState(1400);
  const [pallets,    setPallets]    = useState(() => initPallets(1400));
  const [layout,     setLayout]     = useState(initLayout);
  const [dragPid,    setDragPid]    = useState(null);
  const [selPid,     setSelPid]     = useState(null);
  const [admin, setAdmin] = useState({
    plNo:"", fechaCargue:hoy, container:"", destino:"Philadelphia",
    vessel:"", palletCertICA:"", palletCertPalletNo:"",
    tempRecorder:"", tempRecorderPalletNo:"", finalStamps:"",
    packingDate:hoy, empresaTransporte:"", placa:"",
  });
  const sa = (k,v) => setAdmin(a=>({...a,[k]:v}));

  const cpp = Math.floor(totalCajas / 20);

  const changeTotalCajas = (v) => {
    setTotalCajas(Number(v));
    setPallets(initPallets(Number(v)));
    setLayout(initLayout());
    setSelPid(null);
  };

  const setPF = (pi, ci, field, val) =>
    setPallets(prev => prev.map((p,i) => i!==pi ? p : {
      ...p, calibres: p.calibres.map((c,j) => j!==ci ? c : {...c,[field]:val}),
    }));

  const addCal = (pi) =>
    setPallets(prev => prev.map((p,i) => i!==pi ? p : {
      ...p, calibres:[...p.calibres,{size:200,cajas:0,predio:"",ica:""}],
    }));

  const removeCal = (pi, ci) =>
    setPallets(prev => prev.map((p,i) => (i!==pi||p.calibres.length<=1) ? p : {
      ...p, calibres:p.calibres.filter((_,j)=>j!==ci),
    }));

  const palletSum = (p) => p.calibres.reduce((s,c)=>s+Number(c.cajas||0),0);
  const palletById = (pid) => pallets.find(p=>p.id===pid);
  const selPalletIdx = selPid!==null ? pallets.findIndex(p=>p.id===selPid) : -1;

  const resumen = CALIBRES.map(size=>({
    size,
    cajas: pallets.reduce((s,p)=>s+p.calibres.filter(c=>Number(c.size)===size).reduce((ss,c)=>ss+Number(c.cajas||0),0),0),
  }));

  const onDrop = (col, idx) => {
    if (dragPid===null) return;
    setLayout(prev=>{
      const next={left:[...prev.left],right:[...prev.right]};
      const li=next.left.indexOf(dragPid), ri=next.right.indexOf(dragPid);
      const fc=li>=0?"left":"right", fi=li>=0?li:ri;
      if(fc===col&&fi===idx) return prev;
      const d=next[col][idx];
      next[col][idx]=dragPid; next[fc][fi]=d;
      return next;
    });
    setDragPid(null);
  };

  // ── Pallet card (función auxiliar, no componente React) ──────
  const renderPallet = (pid, idx, col) => {
    const p = palletById(pid);
    if (!p) return null;
    const isMixed = p.calibres.length > 1;
    const mainCal = COL_CAL[p.calibres[0].size] || COL_CAL[200];
    const isSel   = selPid === pid;
    const isDrag  = dragPid === pid;
    const sum     = palletSum(p);
    const ok      = sum === cpp;

    let bg, border;
    if (isMixed) {
      const stops = p.calibres.map((c,i)=>`${COL_CAL[c.size]?.bg||"#888"}${i===0?"55":"33"}`);
      bg = `linear-gradient(135deg,${stops.join(",")})`;
      border = isSel ? "2px solid white" : "1px solid rgba(255,255,255,0.25)";
    } else {
      bg     = isSel ? mainCal.light : "rgba(255,255,255,0.05)";
      border = isSel ? `2px solid ${mainCal.bg}` : `1px solid ${mainCal.border}`;
    }

    return (
      <div key={pid}
        draggable
        onDragStart={()=>setDragPid(pid)}
        onDragOver={e=>e.preventDefault()}
        onDrop={()=>onDrop(col,idx)}
        onClick={()=>setSelPid(isSel?null:pid)}
        style={{
          background:bg, border, borderRadius:6,
          padding:"5px 6px", cursor:"pointer", position:"relative",
          opacity:isDrag?0.35:1, transition:"all 0.15s",
          minHeight:54, display:"flex", flexDirection:"column", justifyContent:"space-between",
          boxShadow: isSel?"0 0 0 1px rgba(255,255,255,0.3) inset":"none",
        }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.5)"}}>P{pid}</span>
          {!ok && <span title={`Suma ${sum}, esperado ${cpp}`} style={{fontSize:8,color:"#F9A826"}}>⚠</span>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:1}}>
          {p.calibres.map((c,ci)=>(
            <div key={ci} style={{display:"flex",alignItems:"center",gap:3}}>
              <span style={{fontSize:8,fontWeight:700,color:COL_CAL[c.size]?.bg||"#fff",lineHeight:1}}>{c.size}</span>
              <span style={{fontSize:8,color:"rgba(255,255,255,0.5)",lineHeight:1}}>{c.cajas}cj</span>
            </div>
          ))}
        </div>
        {p.calibres[0].predio && (
          <div style={{fontSize:7,color:"rgba(255,255,255,0.3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {p.calibres[0].predio}
          </div>
        )}
        {isSel && (
          <div style={{position:"absolute",bottom:-1,left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"5px solid transparent",borderRight:"5px solid transparent",borderBottom:"5px solid white"}}/>
        )}
      </div>
    );
  };

  // ── Excel — usa molde de la empresa vía backend ──────────────
  const [generandoExcel, setGenerandoExcel] = useState(false);

  const generarExcel = async () => {
    setGenerandoExcel(true);
    try {
      const payload = {
        plNo:              admin.plNo,
        destino:           admin.destino,
        fechaCargue:       admin.fechaCargue,
        empresaTransporte: admin.empresaTransporte,
        placa:             admin.placa,
        tempRecorder:      admin.tempRecorder,
        finalStamps:       admin.finalStamps,
        totalCajas,
        pallets: pallets.map(p => ({
          id:       p.id,
          calibres: p.calibres.map(c => ({
            size:   Number(c.size),
            cajas:  Number(c.cajas || 0),
            predio: c.predio || "",
            ica:    String(c.ica || ""),
          })),
        })),
      };

      const res = await fetch("http://localhost:3001/api/packing-list", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        alert("Error generando Excel: " + (err.error || res.statusText));
        return;
      }

      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement("a");
      a.href         = url;
      a.download     = `Packing-List-${admin.plNo || admin.container || "export"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("No se pudo conectar al servidor backend: " + e.message);
    } finally {
      setGenerandoExcel(false);
    }
  };

  // ── HTML/PDF ─────────────────────────────────────────────────
  const generarPDF = () => {
    const resHtml=["250","230","200","175","150","110"].map(s=>{
      const tot=pallets.reduce((sum,p)=>sum+p.calibres.filter(c=>String(c.size)===s).reduce((ss,c)=>ss+Number(c.cajas||0),0),0);
      return `<tr><td>${s}</td><td style="text-align:right">${tot.toLocaleString("es-CO")}</td></tr>`;
    }).join("")+`<tr class="tot"><td>TOTAL</td><td style="text-align:right">${totalCajas.toLocaleString("es-CO")}</td></tr>`;

    const pcell=(pid)=>{
      const p=pallets.find(pp=>pp.id===pid);
      if(!p) return{id:pid,size:""};
      return{id:pid,size:p.calibres.length>1?p.calibres.map(c=>`${c.cajas}/${c.size}`).join("<br>"):String(p.calibres[0].size)};
    };
    const rows=Array.from({length:10},(_,i)=>{
      const pl=pcell(layout.left[i]),pr=pcell(layout.right[i]);
      return `<tr><td><b>Pallet ${pl.id}</b></td><td><b>${pl.size}</b></td><td>CO-68-001<br>HT</td><td>${fmtDate(admin.packingDate)}</td><td style="border-left:3px solid #1a5c1a"><b>Pallet ${pr.id}</b></td><td><b>${pr.size}</b></td><td>CO-68-001<br>HT</td><td>${fmtDate(admin.packingDate)}</td></tr>`;
    }).join("");

    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>PL ${admin.container}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:24px;font-size:11px;background:#fff}h2{text-align:center;font-size:20px;font-weight:800;margin-bottom:16px}.hdr{display:grid;grid-template-columns:auto 1fr auto 1fr auto 1fr auto 1fr;border:2px solid #1a5c1a;margin-bottom:16px}.hl{background:#1a5c1a;color:#fff;font-weight:700;padding:7px 10px}.hv{padding:7px 10px;font-weight:700}.wrap{display:grid;grid-template-columns:130px 1fr;gap:14px}.sum{border:2px solid #1a5c1a;border-collapse:collapse;width:100%}.sum th{background:#1a5c1a;color:#fff;padding:6px 8px;text-align:left}.sum td{padding:6px 8px;border-top:1px solid #c8e6c9;font-size:14px;font-weight:700}.sum tr.tot td{border-top:2px solid #1a5c1a}.ctitle{background:#1a5c1a;color:#fff;padding:7px 12px;font-weight:700;display:flex;justify-content:space-between;margin-bottom:4px}.pt{width:100%;border-collapse:collapse}.pt th{background:#f1f8e9;padding:5px 6px;font-size:10px;border:1px solid #a5d6a7;font-weight:700}.pt td{padding:5px 6px;font-size:10px;border:1px solid #c8e6c9;text-align:center}.door{text-align:center;font-weight:700;background:#1a5c1a;color:#fff;padding:4px;font-size:10px}.footer{text-align:center;margin-top:20px;font-size:10px;color:#555;border-top:1px solid #eee;padding-top:12px}</style></head><body>
<h2>Pallet Distribution Inside Container</h2>
<div class="hdr"><div class="hl">DATE:</div><div class="hv">${fmtDate(admin.fechaCargue)}</div><div class="hl">PORT:</div><div class="hv">SP CARTAGENA</div><div class="hl">PALLET CERTIFICATE:</div><div class="hv">${admin.palletCertICA}<br>in Pallet # ${admin.palletCertPalletNo}</div><div class="hl">VESSEL:</div><div class="hv">${admin.vessel}</div><div class="hl">CONTAINER:</div><div class="hv">${admin.container}</div><div class="hl">DESTINATION:</div><div class="hv">${admin.destino.toUpperCase()}</div><div class="hl">TEMP RECORDER:</div><div class="hv">${admin.tempRecorder}<br>In Pallet # ${admin.tempRecorderPalletNo}</div><div class="hl">FINAL STAMPS:</div><div class="hv">${admin.finalStamps}</div></div>
<div class="wrap"><table class="sum"><tr><th>PACKING LIST</th><th></th></tr>${resHtml}</table><div><div class="ctitle"><span>CONTAINER ←- - - - - - - →</span><span>🚛</span></div><table class="pt"><thead><tr><th>Pallet ID #</th><th>Size</th><th>Pallet ISPM-15</th><th>Packing Date</th><th style="border-left:3px solid #1a5c1a">Pallet ID #</th><th>Size</th><th>Pallet ISPM-15</th><th>Packing Date</th></tr></thead><tbody>${rows}</tbody><tr><td colspan="4" class="door">LEFT CONTAINER DOOR</td><td colspan="4" class="door">RIGHT CONTAINER DOOR</td></tr></table></div></div>
<div class="footer"><p>1001 S. Dairy Ashford, Suite 100-163 Houston, TX 77077</p><p>gerencia@princesseskingdom.com</p></div></body></html>`;

    const blob=new Blob([html],{type:"text/html"});
    const u=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=u; a.download=`PL_${admin.container||"XXXX"}.html`; a.click();
    URL.revokeObjectURL(u);
  };

  // ── Render ───────────────────────────────────────────────────
  const totalConf = pallets.reduce((s,p)=>s+palletSum(p),0);
  const todoCuadra = totalConf === totalCajas;

  return (
    <div>
      {/* ── Header rápido ── */}
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(4,1fr)",gap:8,marginBottom:14}}>
        {[
          {l:"Packing List No.",v:admin.plNo,k:"plNo",ph:"2026-174"},
          {l:"N° Container",v:admin.container,k:"container",ph:"TLLU1194289"},
          {l:"Vessel / Motonave",v:admin.vessel,k:"vessel",ph:"SPIRIT OF MELBOURNE V617"},
          {l:"Final Stamps / Seals",v:admin.finalStamps,k:"finalStamps",ph:"005743– SQ83066"},
        ].map(f=>(
          <div key={f.k}>
            <div style={lbl}>{f.l}</div>
            <input value={f.v} onChange={e=>sa(f.k,e.target.value)} placeholder={f.ph} style={inp}/>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(4,1fr)",gap:8,marginBottom:14}}>
        <div>
          <div style={lbl}>Puerto destino</div>
          <CustomSelect value={admin.destino} onChange={e=>sa("destino",e.target.value)} style={{...inp,cursor:"pointer"}}>
            {DESTINOS.map(d=><option key={d} value={d}>{d}</option>)}
          </CustomSelect>
        </div>
        <div>
          <div style={lbl}>Fecha de cargue</div>
          <input type="date" value={admin.fechaCargue} onChange={e=>sa("fechaCargue",e.target.value)} style={inp}/>
        </div>
        <div>
          <div style={lbl}>Empresa transporte</div>
          <input value={admin.empresaTransporte} onChange={e=>sa("empresaTransporte",e.target.value)} placeholder="Transportando Express" style={inp}/>
        </div>
        <div>
          <div style={lbl}>Placa</div>
          <input value={admin.placa} onChange={e=>sa("placa",e.target.value)} placeholder="QJN678 / S93178" style={inp}/>
        </div>
      </div>

      {/* ── Datos especiales ── */}
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(3,1fr)",gap:8,marginBottom:16}}>
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:9,padding:10}}>
          <div style={{fontSize:9,color:"rgba(255,255,255,0.4)",marginBottom:6,fontWeight:700}}>🏷 PALLET CERTIFICATE ICA</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 70px",gap:6}}>
            <div><div style={lbl}>Número ICA</div><input value={admin.palletCertICA} onChange={e=>sa("palletCertICA",e.target.value)} placeholder="ICA 05-007-26" style={inp}/></div>
            <div><div style={lbl}>En pallet #</div><input type="number" min={1} max={20} value={admin.palletCertPalletNo} onChange={e=>sa("palletCertPalletNo",e.target.value)} style={inp}/></div>
          </div>
        </div>
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:9,padding:10}}>
          <div style={{fontSize:9,color:"rgba(255,255,255,0.4)",marginBottom:6,fontWeight:700}}>🌡 TEMP RECORDER</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 70px",gap:6}}>
            <div><div style={lbl}>Número</div><input value={admin.tempRecorder} onChange={e=>sa("tempRecorder",e.target.value)} placeholder="V1-0041573" style={inp}/></div>
            <div><div style={lbl}>En pallet #</div><input type="number" min={1} max={20} value={admin.tempRecorderPalletNo} onChange={e=>sa("tempRecorderPalletNo",e.target.value)} style={inp}/></div>
          </div>
        </div>
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:9,padding:10}}>
          <div style={{fontSize:9,color:"rgba(255,255,255,0.4)",marginBottom:6,fontWeight:700}}>📦 PROCESO</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            <div>
              <div style={lbl}>Total cajas</div>
              <CustomSelect value={totalCajas} onChange={e=>changeTotalCajas(e.target.value)} style={{...inp,cursor:"pointer"}}>
                <option value={1400}>1400 → 70/plt</option>
                <option value={1500}>1500 → 75/plt</option>
                <option value={1600}>1600 → 80/plt</option>
              </CustomSelect>
            </div>
            <div>
              <div style={lbl}>Packing Date</div>
              <input type="date" value={admin.packingDate} onChange={e=>sa("packingDate",e.target.value)} style={inp}/>
            </div>
          </div>
        </div>
      </div>

      {/* ── CAMIÓN VISUAL ── */}
      <div style={{background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:14,padding:14,marginBottom:12}}>

        {/* Leyenda calibres + contador */}
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12,alignItems:"center"}}>
          {resumen.filter(r=>r.cajas>0).map(r=>(
            <div key={r.size} style={{background:COL_CAL[r.size].light,border:`1px solid ${COL_CAL[r.size].border}`,borderRadius:6,padding:"3px 9px",fontSize:10,fontWeight:700,display:"flex",gap:5,alignItems:"center"}}>
              <span style={{color:COL_CAL[r.size].bg}}>{r.size}</span>
              <span style={{color:"rgba(255,255,255,0.6)"}}>{r.cajas.toLocaleString("es-CO")}</span>
            </div>
          ))}
          <div style={{marginLeft:"auto",fontSize:11,fontWeight:700,color:todoCuadra?"#00C9A7":"#F9A826"}}>
            {todoCuadra ? `✓ ${totalCajas.toLocaleString("es-CO")} cajas` : `⚠️ ${totalConf}/${totalCajas}`}
          </div>
        </div>

        {/* Truck body */}
        <div style={{display:"flex",gap:0,alignItems:"stretch"}}>

          {/* CAB */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",marginRight:6}}>
            {/* Top tires */}
            <div style={{display:"flex",gap:3,marginBottom:4}}>
              <div style={{width:8,height:14,background:"#333",borderRadius:3,border:"1px solid #555"}}/>
              <div style={{width:8,height:14,background:"#333",borderRadius:3,border:"1px solid #555"}}/>
            </div>
            {/* Cab box */}
            <div style={{
              width:52, background:"linear-gradient(180deg,#3a3a3a,#1f1f1f)",
              border:"2px solid #555", borderRadius:"8px 4px 4px 8px",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              padding:"8px 4px", flex:1, gap:4,
            }}>
              <div style={{fontSize:18}}>🚛</div>
              <div style={{fontSize:7,color:"rgba(255,255,255,0.4)",textAlign:"center",lineHeight:1.2}}>TIERRA<br/>PROM.</div>
            </div>
            {/* Bottom tires */}
            <div style={{display:"flex",gap:3,marginTop:4}}>
              <div style={{width:8,height:14,background:"#333",borderRadius:3,border:"1px solid #555"}}/>
              <div style={{width:8,height:14,background:"#333",borderRadius:3,border:"1px solid #555"}}/>
            </div>
          </div>

          {/* Container body */}
          <div style={{flex:1,display:"flex",flexDirection:"column"}}>
            {/* Top tires row */}
            <div style={{display:"flex",justifyContent:"space-around",marginBottom:4,paddingLeft:20,paddingRight:20}}>
              {[0,1,2,3,4].map(i=>(
                <div key={i} style={{display:"flex",gap:2}}>
                  <div style={{width:8,height:12,background:"#333",borderRadius:"3px 3px 0 0",border:"1px solid #555"}}/>
                  <div style={{width:8,height:12,background:"#333",borderRadius:"3px 3px 0 0",border:"1px solid #555"}}/>
                </div>
              ))}
            </div>

            {/* Container walls + pallets */}
            <div style={{
              flex:1,
              background:"linear-gradient(180deg,#1a1a2e 0%,#16213e 100%)",
              border:"3px solid #4a4a6a",
              borderRadius:"0 6px 6px 0",
              position:"relative",
              overflow:"hidden",
            }}>
              {/* Metal ribs (decorative) */}
              {[...Array(9)].map((_,i)=>(
                <div key={i} style={{position:"absolute",left:`${(i+1)*10}%`,top:0,bottom:0,width:1,background:"rgba(255,255,255,0.04)",pointerEvents:"none"}}/>
              ))}

              <div style={{padding:"8px 10px",display:"flex",flexDirection:"column",gap:4}}>
                {/* Label izquierda */}
                <div style={{fontSize:8,color:"rgba(255,255,255,0.25)",marginBottom:2,letterSpacing:1}}>◀ FONDO DEL CONTENEDOR</div>

                {/* LEFT ROW */}
                <div style={{display:"flex",gap:4}}>
                  <div style={{fontSize:8,color:"rgba(255,255,255,0.3)",writingMode:"vertical-rl",transform:"rotate(180deg)",display:"flex",alignItems:"center",minWidth:12}}>IZQ</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:4,flex:1}}>
                    {layout.left.map((pid,idx)=>renderPallet(pid,idx,"left"))}
                  </div>
                </div>

                {/* Divider */}
                <div style={{height:6,background:"rgba(255,255,255,0.03)",borderRadius:2,margin:"0 12px",border:"1px solid rgba(255,255,255,0.05)"}}/>

                {/* RIGHT ROW */}
                <div style={{display:"flex",gap:4}}>
                  <div style={{fontSize:8,color:"rgba(255,255,255,0.3)",writingMode:"vertical-rl",transform:"rotate(180deg)",display:"flex",alignItems:"center",minWidth:12}}>DER</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:4,flex:1}}>
                    {layout.right.map((pid,idx)=>renderPallet(pid,idx,"right"))}
                  </div>
                </div>

                {/* Label derecha */}
                <div style={{fontSize:8,color:"rgba(255,255,255,0.25)",textAlign:"right",marginTop:2,letterSpacing:1}}>PUERTA DEL CONTENEDOR ▶</div>
              </div>
            </div>

            {/* Bottom tires row */}
            <div style={{display:"flex",justifyContent:"space-around",marginTop:4,paddingLeft:20,paddingRight:20}}>
              {[0,1,2,3,4].map(i=>(
                <div key={i} style={{display:"flex",gap:2}}>
                  <div style={{width:8,height:12,background:"#333",borderRadius:"0 0 3px 3px",border:"1px solid #555"}}/>
                  <div style={{width:8,height:12,background:"#333",borderRadius:"0 0 3px 3px",border:"1px solid #555"}}/>
                </div>
              ))}
            </div>
          </div>

          {/* DOOR */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",marginLeft:6}}>
            <div style={{
              width:18, background:"linear-gradient(180deg,#2a2a2a,#1a1a1a)",
              border:"2px solid #555", borderRadius:"2px 6px 6px 2px",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              padding:"6px 2px", flex:1, gap:6,
            }}>
              {[...Array(6)].map((_,i)=>(
                <div key={i} style={{width:4,height:4,background:"#666",borderRadius:"50%"}}/>
              ))}
            </div>
          </div>
        </div>

        <div style={{fontSize:8,color:"rgba(255,255,255,0.2)",textAlign:"center",marginTop:8}}>
          Haz clic en un pallet para editarlo · Arrastra para cambiar posición
        </div>
      </div>

      {/* ── Panel de edición del pallet seleccionado ── */}
      {selPid !== null && selPalletIdx >= 0 && (() => {
        const p = pallets[selPalletIdx];
        const sum = palletSum(p);
        const ok  = sum === cpp;
        return (
          <div style={{background:"rgba(99,102,241,0.08)",border:"1px solid rgba(99,102,241,0.3)",borderRadius:12,padding:14,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"#a5b4fc"}}>
                ✏️ Pallet {selPid}
                {!ok && <span style={{color:"#F9A826",fontSize:10,marginLeft:8}}>⚠️ Suma {sum} / esperado {cpp}</span>}
                {ok  && <span style={{color:"#00C9A7",fontSize:10,marginLeft:8}}>✓ Cuadra</span>}
              </div>
              <button onClick={()=>setSelPid(null)} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:16}}>✕</button>
            </div>

            {p.calibres.map((c, ci) => (
              <div key={ci} style={{
                background:"rgba(255,255,255,0.03)",border:`1px solid ${COL_CAL[c.size]?.border||"rgba(255,255,255,0.1)"}`,
                borderRadius:9,padding:10,marginBottom:8,
              }}>
                <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"1fr 80px 1fr 1fr auto",gap:8,alignItems:"end"}}>
                  <div>
                    <div style={lbl}>Calibre / Size</div>
                    <CustomSelect value={c.size} onChange={e=>setPF(selPalletIdx,ci,"size",Number(e.target.value))}
                      style={{...inp,background:COL_CAL[c.size]?.light||"rgba(255,255,255,0.07)",cursor:"pointer"}}>
                      {CALIBRES.map(cal=><option key={cal} value={cal}>{cal}</option>)}
                    </CustomSelect>
                  </div>
                  <div>
                    <div style={lbl}>N° Cajas</div>
                    <input type="number" min={0} value={c.cajas}
                      onChange={e=>setPF(selPalletIdx,ci,"cajas",e.target.value)} style={inp}/>
                  </div>
                  <div>
                    <div style={lbl}>Predio</div>
                    <input value={c.predio} onChange={e=>setPF(selPalletIdx,ci,"predio",e.target.value)}
                      placeholder="Nombre del predio" style={inp}/>
                  </div>
                  <div>
                    <div style={lbl}>Registro ICA</div>
                    <input value={c.ica} onChange={e=>setPF(selPalletIdx,ci,"ica",e.target.value)}
                      placeholder="Ej. 980005905" style={inp}/>
                  </div>
                  <div style={{paddingBottom:1}}>
                    {ci===0
                      ? <button onClick={()=>addCal(selPalletIdx)} title="Agregar calibre mixto"
                          style={{background:"rgba(99,102,241,0.2)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:7,padding:"6px 10px",color:"#a5b4fc",cursor:"pointer",fontSize:12,width:"100%"}}>➕</button>
                      : <button onClick={()=>removeCal(selPalletIdx,ci)}
                          style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:7,padding:"6px 10px",color:"#fca5a5",cursor:"pointer",fontSize:12,width:"100%"}}>✕</button>
                    }
                  </div>
                </div>
              </div>
            ))}

            {/* Peso/caja siempre 16.2 */}
            <div style={{fontSize:9,color:"rgba(255,255,255,0.25)",marginTop:4}}>
              Peso/caja: {PESO_STR} (fijo) · Producto: LIMON TAHITI · Categoría: 1
            </div>
          </div>
        );
      })()}

      {/* ── Botones ── */}
      <div style={{display:"flex",gap:8,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
        <button onClick={generarExcel} disabled={generandoExcel}
          style={{flex:1,background:"linear-gradient(135deg,#22C55E,#16A34A)",border:"none",borderRadius:10,padding:"11px",fontSize:12,color:"white",cursor:generandoExcel?"wait":"pointer",fontWeight:700,opacity:generandoExcel?0.7:1}}>
          {generandoExcel ? "⏳ Generando..." : "📊 Descargar Excel (Planta)"}
        </button>
        <button onClick={generarPDF}
          style={{flex:1,background:"linear-gradient(135deg,#1a5c1a,#2d8a2d)",border:"none",borderRadius:10,padding:"11px",fontSize:12,color:"white",cursor:"pointer",fontWeight:700}}>
          📄 Descargar PDF (Administrativo)
        </button>
      </div>
    </div>
  );
}
