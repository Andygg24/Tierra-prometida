import { useState } from "react";
import { useSolicitudesRegistro } from "../hooks/useRegistroEnLinea.js";
import { distanciaHuellas, UMBRAL_RECONOCIMIENTO } from "../utils/rostro.js";

// Personal → Directorio: enlace del registro en línea (/registro) y las
// solicitudes que llegan de ahí, para aprobarlas o rechazarlas.

const TIPOS = {
  nuevo:     { l:"Nuevo ingreso", c:"#00C9A7" },
  reingreso: { l:"Reingreso",     c:"#a78bfa" },
  rostro:    { l:"Rostro nuevo",  c:"#60a5fa" },
};

// Distancia mínima entre las muestras de frente (primera y última) de la
// solicitud y las huellas de una persona.
const distanciaA = (descs, huellas) => {
  const deFrente = [descs[0], descs[descs.length - 1]];
  let d = Infinity;
  for (const m of deFrente) for (const x of huellas) d = Math.min(d, distanciaHuellas(m, x));
  return d;
};

const fechaFmt = (iso) => iso ? new Date(iso).toLocaleString("es-CO", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }) : "";

// `onCambio`: recarga la lista de Personal después de aprobar.
export default function SolicitudesRegistro({ empleados, rostros, onCambio }) {
  const { solicitudes, error, aprobar, rechazar } = useSolicitudesRegistro();
  const [ocupado, setOcupado] = useState(null);
  const [msg, setMsg] = useState(null);
  const [copiado, setCopiado] = useState(false);

  const enlace = `${window.location.origin}/registro`;
  const textoInvitacion = `Hola 👋 Registra tu rostro para marcar la asistencia en Tierra Prometida. Entra aquí desde tu celular: ${enlace}`;
  const compartir = async () => {
    if (navigator.share) { try { await navigator.share({ title: "Registro de rostro", text: textoInvitacion }); return; } catch { /* cancelado */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(textoInvitacion)}`, "_blank");
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(enlace); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { window.prompt("Copia el enlace:", enlace); }
  };

  const nombreDe = (num) => empleados.find(e => e.num === num)?.nombre || `documento ${num}`;

  const avisos = (sol) => {
    const out = [];
    if (!sol.descriptores.length) { out.push("Todavía no registró el rostro."); return out; }
    const propio = rostros.registrados.find(r => r.num === sol.num);
    if (propio && distanciaA(sol.descriptores, propio.descriptores) > UMBRAL_RECONOCIMIENTO)
      out.push("No se parece al rostro que ya tenía registrado — confirma que sea la misma persona.");
    let parecido = null;
    for (const r of rostros.registrados) {
      if (r.num === sol.num) continue;
      const d = distanciaA(sol.descriptores, r.descriptores);
      if (d < UMBRAL_RECONOCIMIENTO && (!parecido || d < parecido.d)) parecido = { num: r.num, d };
    }
    if (parecido) out.push(`Se parece ${parecido.d < 0.35 ? "muchísimo" : "mucho"} a ${nombreDe(parecido.num)}${parecido.d < 0.35 ? " — podría ser la misma persona" : " (pueden ser familiares)"}.`);
    return out;
  };

  const onAprobar = async (sol) => {
    if (!window.confirm(sol.tipo === "rostro"
      ? `¿Aprobar el rostro nuevo de ${sol.nombre}? Reemplaza al que tenía.`
      : `¿Aprobar el ${TIPOS[sol.tipo].l.toLowerCase()} de ${sol.nombre}? Queda activo en Personal${sol.descriptores.length ? " y el Biométrico ya lo reconoce" : ""}.`)) return;
    setOcupado(sol.num);
    const r = await aprobar(sol);
    setOcupado(null);
    if (r.ok) onCambio?.();
    setMsg(r.ok ? { ok:true, t:`✓ ${sol.nombre} aprobado.` } : { ok:false, t:`No se pudo aprobar: ${r.msg}` });
    setTimeout(() => setMsg(null), 4000);
  };
  const onRechazar = async (sol) => {
    if (!window.confirm(`¿Rechazar la solicitud de ${sol.nombre}?${sol.tipo === "nuevo" ? " Se borran sus datos." : ""}`)) return;
    setOcupado(sol.num);
    const r = await rechazar(sol);
    setOcupado(null);
    setMsg(r.ok ? { ok:true, t:"Solicitud rechazada." } : { ok:false, t:`No se pudo rechazar: ${r.msg}` });
    setTimeout(() => setMsg(null), 4000);
  };

  const btn = (c) => ({ background:`${c}1a`, border:`1px solid ${c}66`, borderRadius:8, padding:"5px 11px", fontSize:11, color:c, cursor:"pointer", fontWeight:700, fontFamily:"inherit" });

  return (
    <div style={{ background:"rgba(96,165,250,0.05)", border:"1px solid rgba(96,165,250,0.22)", borderRadius:12, padding:12, marginBottom:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#60a5fa", flex:"1 1 180px" }}>
          📲 Registro en línea {solicitudes.length > 0 && <span style={{ background:"#60a5fa", color:"#0b1020", borderRadius:10, padding:"1px 7px", fontSize:10, marginLeft:4 }}>{solicitudes.length} pendiente{solicitudes.length > 1 ? "s" : ""}</span>}
          <div style={{ fontSize:10, fontWeight:400, color:"rgba(255,255,255,0.45)", marginTop:2 }}>Cada quien busca su documento y registra su rostro desde el celular. Si es nuevo, llena sus datos.</div>
        </div>
        <button onClick={compartir} style={btn("#25D366")}>📤 Compartir enlace</button>
        <button onClick={copiar} style={btn("#60a5fa")}>{copiado ? "✓ Copiado" : "🔗 Copiar"}</button>
      </div>

      {error && <div style={{ fontSize:11, color:"#FF6B6B", marginTop:8 }}>{error}</div>}
      {msg && <div style={{ fontSize:11, fontWeight:700, color: msg.ok ? "#00C9A7" : "#FF6B6B", marginTop:8 }}>{msg.t}</div>}

      {solicitudes.map(sol => {
        const t = TIPOS[sol.tipo] || TIPOS.rostro;
        const av = avisos(sol);
        return (
          <div key={sol.num} style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:10, marginTop:8 }}>
            {sol.foto
              ? <img src={sol.foto} alt="" style={{ width:52, height:60, objectFit:"cover", borderRadius:8, flexShrink:0 }} />
              : <div style={{ width:52, height:60, borderRadius:8, background:"rgba(255,255,255,0.06)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>👤</div>}
            <div style={{ flex:"1 1 160px", minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"white" }}>{sol.nombre}</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)" }}>{sol.doc} {sol.num}{sol.tel && sol.tel !== "-" ? ` · 📞 ${sol.tel}` : ""}{sol.cuenta ? ` · 🏦 ${sol.banco} ${sol.cuenta}` : ""}</div>
              {sol.titular && <div style={{ fontSize:10, color:"#a5b4fc" }}>Cuenta a nombre de {sol.titular}</div>}
              <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:3, flexWrap:"wrap" }}>
                <span style={{ fontSize:9, fontWeight:700, color:t.c, background:`${t.c}1f`, borderRadius:4, padding:"1px 6px" }}>{t.l}</span>
                <span style={{ fontSize:9, color:"rgba(255,255,255,0.4)" }}>{fechaFmt(sol.fecha)}</span>
              </div>
              {av.map((a, i) => <div key={i} style={{ fontSize:10, color:"#F9A826", marginTop:3 }}>⚠️ {a}</div>)}
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <button disabled={ocupado === sol.num} onClick={() => onAprobar(sol)} style={btn("#00C9A7")}>✅ Aprobar</button>
              <button disabled={ocupado === sol.num} onClick={() => onRechazar(sol)} style={btn("#FF6B6B")}>✕ Rechazar</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
