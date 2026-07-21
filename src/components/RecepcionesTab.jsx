import { useState, useEffect, useMemo } from "react";
import CustomSelect from "./CustomSelect.jsx";
import LimonLoader from "./LimonLoader.jsx";
import { btnSecundario, btnPrimario, btnTablaEditar, btnTablaEliminar } from "./buttonStyles.js";
import { useRecepciones } from "../hooks/useRecepciones.js";

const TIPOS = [
  { value: "entrada", label: "Entrada de fruta" },
  { value: "salida",  label: "Salida de fruta"  },
];

const TIPOS_CANASTILLA = [
  { value: "2",   label: "2 kg"   },
  { value: "2.4", label: "2.4 kg" },
];

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function pesoCanastillasEstiba(e) {
  return num(e.cantCanastillas) * num(e.tipoCanastilla);
}

// El descuento de la estiba es el resultado de sumar peso canastillas + peso estiba
function descuentoEstiba(e) {
  return pesoCanastillasEstiba(e) + num(e.pesoEstiba);
}

function pesoNetoEstiba(e) {
  return num(e.pesoBruto) - descuentoEstiba(e);
}

function nuevaEstiba(numero) {
  return {
    numero,
    pesoBruto: "",
    estibaPlastica: "no",
    tipoCanastilla: "2",
    cantCanastillas: "",
    pesoEstiba: "",
  };
}

function formVacio() {
  const hoy = new Date().toISOString().split("T")[0];
  return {
    remision: "", fecha: hoy, tipo: "entrada",
    placa: "", conductor: "", cedulaConductor: "", origen: "", proveedor: "", supervisor: "",
    horaInicio: "", horaFin: "", observaciones: "",
    estibas: [nuevaEstiba(1)],
  };
}

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c])); }

function generarInformeHTML(r) {
  const fmtFecha = r.fecha ? new Date(r.fecha + "T12:00:00").toLocaleDateString("es-CO", { day:"2-digit", month:"long", year:"numeric" }) : "—";
  const filasEstibas = r.estibas.map(e => `
    <tr>
      <td style="text-align:center;font-weight:700">${esc(e.numero)}</td>
      <td style="text-align:right">${num(e.pesoBruto).toLocaleString("es-CO",{maximumFractionDigits:2})}</td>
      <td style="text-align:center">${e.estibaPlastica==="si" ? "Sí" : "No"}</td>
      <td style="text-align:center">${num(e.tipoCanastilla).toLocaleString("es-CO",{maximumFractionDigits:1})} kg</td>
      <td style="text-align:center">${num(e.cantCanastillas)}</td>
      <td style="text-align:right">${num(e.pesoEstiba).toLocaleString("es-CO",{maximumFractionDigits:2})}</td>
      <td style="text-align:right">${descuentoEstiba(e).toLocaleString("es-CO",{maximumFractionDigits:2})}</td>
      <td style="text-align:right;font-weight:700;color:#1D6F42">${pesoNetoEstiba(e).toLocaleString("es-CO",{maximumFractionDigits:2})}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recepción ${esc(r.remision || r.id)} - Tierra Prometida</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#1a1a1a;padding:24px;font-size:12px}
  .header{text-align:center;border-bottom:3px solid #1D6F42;padding-bottom:14px;margin-bottom:18px}
  .logo{font-size:36px;margin-bottom:4px}
  .htitle{color:#1D6F42;font-size:21px;font-weight:800;letter-spacing:-0.5px}
  .sub{color:#666;font-size:12px;margin-top:3px}
  .badge{display:inline-block;background:${r.tipo==="entrada" ? "#1D6F42" : "#c2410c"};color:#fff;padding:4px 18px;border-radius:20px;font-size:10px;margin-top:8px;letter-spacing:0.5px;font-weight:700}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}
  .campo{background:#f5f5f5;border-radius:8px;padding:8px 10px}
  .campo .l{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:2px}
  .campo .v{font-size:13px;font-weight:700;color:#1a1a1a}
  .sec{font-size:13px;font-weight:800;color:#1D6F42;background:#e8f5e9;border-left:4px solid #1D6F42;padding:7px 12px;margin:20px 0 10px;border-radius:0 6px 6px 0}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#1D6F42;color:#fff;padding:7px 8px;text-align:left;border:1px solid #145a32}
  td{padding:6px 8px;border:1px solid #e0e0e0}
  tr:nth-child(even) td{background:#fafafa}
  .total{display:flex;justify-content:flex-end;margin-top:14px}
  .totalbox{background:#e8f5e9;border:2px solid #1D6F42;border-radius:10px;padding:12px 22px;text-align:right}
  .totalbox .l{font-size:10px;color:#1D6F42;text-transform:uppercase;letter-spacing:0.5px}
  .totalbox .v{font-size:26px;font-weight:800;color:#1D6F42}
  .footer{text-align:center;font-size:9px;color:#bbb;margin-top:24px;border-top:1px solid #f0f0f0;padding-top:10px}
  @media print{body{padding:10px}}
</style>
</head>
<body>

<div class="header">
  <div class="logo">🍋</div>
  <div class="htitle">TIERRA PROMETIDA TRADING</div>
  <div class="sub">Informe de Recepción de Fruta</div>
  <div class="badge">${r.tipo === "entrada" ? "ENTRADA DE FRUTA" : "SALIDA DE FRUTA"}</div>
</div>

<div class="grid">
  <div class="campo"><div class="l">Remisión #</div><div class="v">${esc(r.remision) || "—"}</div></div>
  <div class="campo"><div class="l">Fecha</div><div class="v">${fmtFecha}</div></div>
  <div class="campo"><div class="l">Placa</div><div class="v">${esc(r.placa) || "—"}</div></div>
  <div class="campo"><div class="l">Conductor</div><div class="v">${esc(r.conductor) || "—"}</div></div>
  <div class="campo"><div class="l">Cédula conductor</div><div class="v">${esc(r.cedulaConductor) || "—"}</div></div>
  <div class="campo"><div class="l">Origen</div><div class="v">${esc(r.origen) || "—"}</div></div>
  <div class="campo"><div class="l">Proveedor</div><div class="v">${esc(r.proveedor) || "—"}</div></div>
  <div class="campo"><div class="l">Supervisor</div><div class="v">${esc(r.supervisor) || "—"}</div></div>
  <div class="campo"><div class="l">Hora inicio</div><div class="v">${esc(r.horaInicio) || "—"}</div></div>
  <div class="campo"><div class="l">Hora fin</div><div class="v">${esc(r.horaFin) || "—"}</div></div>
</div>

<div class="sec">Detalle de estibas</div>
<table>
  <thead>
    <tr>
      <th style="text-align:center">#</th>
      <th style="text-align:right">Peso bruto</th>
      <th style="text-align:center">Est. plástica</th>
      <th style="text-align:center">Tipo canastilla</th>
      <th style="text-align:center">Cant.</th>
      <th style="text-align:right">Peso estiba</th>
      <th style="text-align:right">Descuento</th>
      <th style="text-align:right">Peso neto</th>
    </tr>
  </thead>
  <tbody>
    ${filasEstibas}
  </tbody>
</table>

<div class="total">
  <div class="totalbox">
    <div class="l">Total peso neto</div>
    <div class="v">${num(r.total).toLocaleString("es-CO",{maximumFractionDigits:2})} kg</div>
  </div>
</div>

${r.observaciones ? `
<div class="sec">Observaciones</div>
<div class="campo" style="background:#f5f5f5">${esc(r.observaciones).replace(/\n/g,"<br>")}</div>
` : ""}

<div class="footer">
  Generado el ${new Date().toLocaleDateString("es-CO")} a las ${new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}
  &bull; JARVIS &bull; Tierra Prometida Trading
</div>

</body>
</html>`;
}

function generarInformeGeneralHTML(recs, desde, hasta) {
  const fmt = (f) => f ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day:"2-digit", month:"long", year:"numeric" }) : "";
  const totalNeto = recs.reduce((a, r) => a + num(r.total), 0);
  const entradas  = recs.filter(r => r.tipo === "entrada").length;
  const salidas   = recs.filter(r => r.tipo === "salida").length;

  const filas = recs.map(r => `
    <tr>
      <td>${esc(r.remision) || "—"}</td>
      <td>${esc(r.fecha) || "—"}</td>
      <td style="text-align:center"><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:9px;font-weight:700;background:${r.tipo==="entrada"?"#ede9fe":"#fef3c7"};color:${r.tipo==="entrada"?"#6d28d9":"#b45309"}">${r.tipo === "entrada" ? "ENTRADA" : "SALIDA"}</span></td>
      <td>${esc(r.placa) || "—"}</td>
      <td>${esc(r.proveedor) || "—"}</td>
      <td>${esc(r.supervisor) || "—"}</td>
      <td style="text-align:center">${r.estibas?.length || 0}</td>
      <td style="text-align:right;font-weight:700;color:#1D6F42">${num(r.total).toLocaleString("es-CO",{maximumFractionDigits:2})}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe General de Recepciones - Tierra Prometida</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#1a1a1a;padding:24px;font-size:12px}
  .header{text-align:center;border-bottom:3px solid #1D6F42;padding-bottom:14px;margin-bottom:18px}
  .logo{font-size:36px;margin-bottom:4px}
  .htitle{color:#1D6F42;font-size:21px;font-weight:800;letter-spacing:-0.5px}
  .sub{color:#666;font-size:12px;margin-top:3px}
  .rango{display:inline-block;background:#1D6F42;color:#fff;padding:4px 18px;border-radius:20px;font-size:10px;margin-top:8px;letter-spacing:0.5px;font-weight:700}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}
  .campo{background:#f5f5f5;border-radius:8px;padding:10px 12px;text-align:center}
  .campo .l{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px}
  .campo .v{font-size:20px;font-weight:800;color:#1D6F42}
  .sec{font-size:13px;font-weight:800;color:#1D6F42;background:#e8f5e9;border-left:4px solid #1D6F42;padding:7px 12px;margin:20px 0 10px;border-radius:0 6px 6px 0}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#1D6F42;color:#fff;padding:7px 8px;text-align:left;border:1px solid #145a32}
  td{padding:6px 8px;border:1px solid #e0e0e0}
  tr:nth-child(even) td{background:#fafafa}
  tfoot td{background:#e8f5e9;font-weight:800;border-top:2px solid #1D6F42}
  .footer{text-align:center;font-size:9px;color:#bbb;margin-top:24px;border-top:1px solid #f0f0f0;padding-top:10px}
  @media print{body{padding:10px}}
</style>
</head>
<body>

<div class="header">
  <div class="logo">🍋</div>
  <div class="htitle">TIERRA PROMETIDA TRADING</div>
  <div class="sub">Informe General de Recepciones</div>
  <div class="rango">${desde || hasta ? `${fmt(desde) || "Inicio"} — ${fmt(hasta) || "Hoy"}` : "Todas las fechas"}</div>
</div>

<div class="grid">
  <div class="campo"><div class="l">Recepciones</div><div class="v">${recs.length}</div></div>
  <div class="campo"><div class="l">Entradas</div><div class="v">${entradas}</div></div>
  <div class="campo"><div class="l">Salidas</div><div class="v">${salidas}</div></div>
  <div class="campo"><div class="l">Kg netos totales</div><div class="v">${totalNeto.toLocaleString("es-CO",{maximumFractionDigits:1})}</div></div>
</div>

<div class="sec">Detalle de recepciones</div>
<table>
  <thead>
    <tr>
      <th>Remisión</th><th>Fecha</th><th style="text-align:center">Tipo</th><th>Placa</th><th>Proveedor</th><th>Supervisor</th><th style="text-align:center">Estibas</th><th style="text-align:right">Peso neto</th>
    </tr>
  </thead>
  <tbody>
    ${filas || `<tr><td colspan="8" style="text-align:center;color:#999;padding:16px">Sin recepciones en el rango seleccionado</td></tr>`}
  </tbody>
  ${recs.length ? `<tfoot><tr><td colspan="7" style="text-align:right">TOTAL</td><td style="text-align:right;color:#1D6F42">${totalNeto.toLocaleString("es-CO",{maximumFractionDigits:2})} kg</td></tr></tfoot>` : ""}
</table>

<div class="footer">
  Generado el ${new Date().toLocaleDateString("es-CO")} a las ${new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}
  &bull; JARVIS &bull; Tierra Prometida Trading
</div>

</body>
</html>`;
}

export default function RecepcionesTab({ mob }) {
  const [isMobLocal, setIsMobLocal] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 680
  );
  const [isLandscape, setIsLandscape] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-height: 500px) and (orientation: landscape)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-height: 500px) and (orientation: landscape)");
    const h = () => {
      setIsMobLocal(window.innerWidth < 680);
      setIsLandscape(mq.matches);
    };
    window.addEventListener("resize", h);
    mq.addEventListener ? mq.addEventListener("change", h) : mq.addListener(h);
    return () => {
      window.removeEventListener("resize", h);
      mq.removeEventListener ? mq.removeEventListener("change", h) : mq.removeListener(h);
    };
  }, []);
  const m = mob || isMobLocal;

  const { recepciones, loading, guardarRecepcion, eliminarRecepcion } = useRecepciones();

  const [form,       setForm]       = useState(formVacio);
  const [editId,     setEditId]     = useState(null);
  const [guardando,  setGuardando]  = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [preview,    setPreview]    = useState(null); // { url, filename }
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");

  // ── Estilos ───────────────────────────────────────────────────
  const inp = {
    background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)",
    borderRadius:8, padding: isLandscape ? "7px 10px" : (m ? "10px 11px" : "7px 10px"), color:"white",
    fontSize: m ? 16 : 12, fontFamily:"inherit", width:"100%", minWidth:0,
    boxSizing:"border-box", minHeight: isLandscape ? 36 : (m ? 44 : 32),
  };
  const lbl = {
    fontSize: m ? 11 : 9, color:"rgba(255,255,255,0.45)",
    marginBottom:4, fontWeight:600, letterSpacing:0.3,
  };
  const cardS = {
    background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
    borderRadius:10, padding: isLandscape ? 10 : (m ? 14 : 16),
  };
  // minWidth:0 en los items del grid: por defecto un <input>/<select> le da a su
  // celda un tamaño mínimo automático basado en su ancho intrínseco, que en
  // landscape (4 columnas angostas) hace que las celdas se desborden y los
  // bordes de los campos se superpongan.
  const campoBox = { minWidth: 0 };
  // En landscape mobile hay mucho ancho pero poca altura: usar grid de 4
  // columnas (igual que desktop) en vez del de 2 columnas de portrait.
  // minmax(132px,1fr) evita que input[type=time] se achique más de lo que
  // Safari/iOS necesita para su control nativo (hora + AM/PM); por debajo de
  // ese piso Safari no lo encoge y termina dibujándolo fuera de su celda,
  // "pegando" visualmente los dos campos de hora.
  const camposCols = isLandscape ? "repeat(4, minmax(132px, 1fr))" : (m ? "1fr 1fr" : "repeat(4,1fr)");

  const totalNeto = useMemo(
    () => form.estibas.reduce((acc, e) => acc + pesoNetoEstiba(e), 0),
    [form.estibas]
  );

  const setCampo = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const setEstiba = (idx, campo, valor) => {
    setForm(f => ({
      ...f,
      estibas: f.estibas.map((e, i) => i === idx ? { ...e, [campo]: valor } : e),
    }));
  };

  const agregarEstiba = () => {
    setForm(f => ({ ...f, estibas: [...f.estibas, nuevaEstiba(f.estibas.length + 1)] }));
  };

  const quitarEstiba = (idx) => {
    setForm(f => {
      const restantes = f.estibas.filter((_, i) => i !== idx);
      return { ...f, estibas: restantes.length ? restantes : [nuevaEstiba(1)] };
    });
  };

  const cancelarEdicion = () => { setForm(formVacio()); setEditId(null); };

  const editarRecepcion = (r) => {
    setForm({
      remision: r.remision, fecha: r.fecha, tipo: r.tipo,
      placa: r.placa, conductor: r.conductor, cedulaConductor: r.cedulaConductor || "", origen: r.origen || "",
      proveedor: r.proveedor, supervisor: r.supervisor,
      horaInicio: r.horaInicio, horaFin: r.horaFin, observaciones: r.observaciones || "",
      estibas: r.estibas.length ? r.estibas : [nuevaEstiba(1)],
    });
    setEditId(r.id);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const verInforme = (r) => {
    const html = generarInformeHTML(r);
    const url  = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    setPreview({ url, filename: `Recepcion_${r.remision || r.id}.html` });
  };

  const recepcionesFiltradas = useMemo(() => {
    return recepciones.filter(r => {
      if (filtroDesde && r.fecha < filtroDesde) return false;
      if (filtroHasta && r.fecha > filtroHasta) return false;
      return true;
    });
  }, [recepciones, filtroDesde, filtroHasta]);

  const verInformeGeneral = () => {
    const html = generarInformeGeneralHTML(recepcionesFiltradas, filtroDesde, filtroHasta);
    const url  = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const sufijo = filtroDesde || filtroHasta ? `${filtroDesde || "inicio"}_a_${filtroHasta || "hoy"}` : "todas";
    setPreview({ url, filename: `Informe_General_Recepciones_${sufijo}.html` });
  };

  const descargarInforme = () => {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview.url;
    a.download = preview.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const cerrarPreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const guardar = async () => {
    if (!form.fecha) return;
    setGuardando(true);
    const estibasCalc = form.estibas.map(e => ({ ...e, descuentoEstiba: descuentoEstiba(e), pesoNeto: pesoNetoEstiba(e) }));
    const ok = await guardarRecepcion({ ...form, estibas: estibasCalc, total: totalNeto }, editId);
    setGuardando(false);
    if (ok) {
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2000);
      cancelarEdicion();
    }
  };

  if (loading) return <LimonLoader texto="Cargando recepciones" />;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* ── KPIs ── */}
      <div style={{ display:"grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(4,1fr)", gap:10 }}>
        {[
          { l:"Recepciones", v:recepciones.length, c:"#00C9A7", i:"🍋" },
          { l:"Entradas",    v:recepciones.filter(r=>r.tipo==="entrada").length, c:"#845EF7", i:"⬇️" },
          { l:"Salidas",     v:recepciones.filter(r=>r.tipo==="salida").length,  c:"#F9A826", i:"⬆️" },
          { l:"Kg netos totales", v:recepciones.reduce((a,r)=>a+num(r.total),0).toLocaleString("es-CO",{maximumFractionDigits:1}), c:"#6366F1", i:"⚖️" },
        ].map((s,i)=>(
          <div key={i} style={{...cardS, display:"flex", alignItems:"center", gap:10}}>
            <div style={{ fontSize:20 }}>{s.i}</div>
            <div>
              <div style={{ fontSize: m?18:20, fontWeight:800, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)" }}>{s.l}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Formulario ── */}
      <div style={cardS}>
        <div style={{ fontSize:13, fontWeight:700, color:"white", marginBottom:12 }}>
          {editId ? "✏️ Editar recepción" : "🍋 Nueva recepción"}
        </div>

        <div style={{ display:"grid", gridTemplateColumns: camposCols, gap:10, marginBottom:12 }}>
          <div style={campoBox}>
            <div style={lbl}>Remisión #</div>
            <input style={inp} value={form.remision} onChange={e=>setCampo("remision", e.target.value)} placeholder="Ej: 00123" />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Fecha</div>
            <input type="date" style={inp} value={form.fecha} onChange={e=>setCampo("fecha", e.target.value)} />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Tipo</div>
            <CustomSelect value={form.tipo} onChange={e=>setCampo("tipo", e.target.value)} style={inp}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </CustomSelect>
          </div>
          <div style={campoBox}>
            <div style={lbl}>Placa</div>
            <input style={inp} value={form.placa} onChange={e=>setCampo("placa", e.target.value.toUpperCase())} placeholder="ABC123" />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Conductor</div>
            <input style={inp} value={form.conductor} onChange={e=>setCampo("conductor", e.target.value)} placeholder="Nombre del conductor" />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Cédula conductor</div>
            <input style={inp} value={form.cedulaConductor} onChange={e=>setCampo("cedulaConductor", e.target.value)} placeholder="N° de cédula" />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Origen</div>
            <input style={inp} value={form.origen} onChange={e=>setCampo("origen", e.target.value)} placeholder="Lugar de origen" />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Proveedor</div>
            <input style={inp} value={form.proveedor} onChange={e=>setCampo("proveedor", e.target.value)} placeholder="Predio / proveedor" />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Supervisor</div>
            <input style={inp} value={form.supervisor} onChange={e=>setCampo("supervisor", e.target.value)} placeholder="Quién recibió / despachó" />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Hora inicio</div>
            <input type="time" style={inp} value={form.horaInicio} onChange={e=>setCampo("horaInicio", e.target.value)} />
          </div>
          <div style={campoBox}>
            <div style={lbl}>Hora fin</div>
            <input type="time" style={inp} value={form.horaFin} onChange={e=>setCampo("horaFin", e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom:12 }}>
          <div style={lbl}>Observaciones</div>
          <textarea
            style={{ ...inp, minHeight: isLandscape ? 44 : (m ? 70 : 56), resize:"vertical", fontFamily:"inherit" }}
            value={form.observaciones}
            onChange={e=>setCampo("observaciones", e.target.value)}
            placeholder="Notas adicionales sobre la recepción..."
          />
        </div>

        {/* ── Estibas ── */}
        <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.6)", marginBottom:8 }}>Estibas</div>

        {m ? (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {form.estibas.map((e, idx) => (
              <div key={idx} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#845EF7" }}>Estiba #{e.numero}</div>
                  <button onClick={()=>quitarEstiba(idx)} style={btnTablaEliminar}>Quitar</button>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div><div style={lbl}>Peso bruto</div><input type="number" style={inp} value={e.pesoBruto} onChange={ev=>setEstiba(idx,"pesoBruto",ev.target.value)} /></div>
                  <div><div style={lbl}>Estiba plástica</div>
                    <CustomSelect value={e.estibaPlastica} onChange={ev=>setEstiba(idx,"estibaPlastica",ev.target.value)} style={inp}>
                      <option value="si">Sí</option><option value="no">No</option>
                    </CustomSelect>
                  </div>
                  <div><div style={lbl}>Tipo canastilla</div>
                    <CustomSelect value={e.tipoCanastilla} onChange={ev=>setEstiba(idx,"tipoCanastilla",ev.target.value)} style={inp}>
                      {TIPOS_CANASTILLA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </CustomSelect>
                  </div>
                  <div><div style={lbl}>Cant. canastillas</div><input type="number" style={inp} value={e.cantCanastillas} onChange={ev=>setEstiba(idx,"cantCanastillas",ev.target.value)} /></div>
                  <div><div style={lbl}>Peso canastillas</div><div style={{...inp, background:"rgba(255,255,255,0.04)", color:"rgba(255,255,255,0.7)", display:"flex", alignItems:"center"}}>{pesoCanastillasEstiba(e).toLocaleString("es-CO",{maximumFractionDigits:2})}</div></div>
                  <div><div style={lbl}>Peso estiba</div><input type="number" style={inp} value={e.pesoEstiba} onChange={ev=>setEstiba(idx,"pesoEstiba",ev.target.value)} /></div>
                  <div><div style={lbl}>Descuento estiba</div><div style={{...inp, background:"rgba(255,255,255,0.04)", color:"rgba(255,255,255,0.7)", display:"flex", alignItems:"center"}}>{descuentoEstiba(e).toLocaleString("es-CO",{maximumFractionDigits:2})}</div></div>
                  <div><div style={lbl}>Peso neto</div><div style={{...inp, background:"rgba(0,201,167,0.1)", color:"#00C9A7", fontWeight:700, display:"flex", alignItems:"center"}}>{pesoNetoEstiba(e).toLocaleString("es-CO",{maximumFractionDigits:2})}</div></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11.5 }}>
              <thead>
                <tr style={{ color:"rgba(255,255,255,0.45)", textAlign:"left" }}>
                  <th style={{ padding:"4px 6px" }}>#</th>
                  <th style={{ padding:"4px 6px" }}>Peso bruto</th>
                  <th style={{ padding:"4px 6px" }}>Estiba plástica</th>
                  <th style={{ padding:"4px 6px" }}>Tipo canastilla</th>
                  <th style={{ padding:"4px 6px" }}>Cant. canastillas</th>
                  <th style={{ padding:"4px 6px" }}>Peso canastillas</th>
                  <th style={{ padding:"4px 6px" }}>Peso estiba</th>
                  <th style={{ padding:"4px 6px" }}>Descuento estiba</th>
                  <th style={{ padding:"4px 6px" }}>Peso neto</th>
                  <th style={{ padding:"4px 6px" }}></th>
                </tr>
              </thead>
              <tbody>
                {form.estibas.map((e, idx) => (
                  <tr key={idx} style={{ borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding:"6px", color:"white", fontWeight:700 }}>{e.numero}</td>
                    <td style={{ padding:"6px" }}><input type="number" style={inp} value={e.pesoBruto} onChange={ev=>setEstiba(idx,"pesoBruto",ev.target.value)} /></td>
                    <td style={{ padding:"6px", minWidth:100 }}>
                      <CustomSelect value={e.estibaPlastica} onChange={ev=>setEstiba(idx,"estibaPlastica",ev.target.value)} style={inp}>
                        <option value="si">Sí</option><option value="no">No</option>
                      </CustomSelect>
                    </td>
                    <td style={{ padding:"6px", minWidth:90 }}>
                      <CustomSelect value={e.tipoCanastilla} onChange={ev=>setEstiba(idx,"tipoCanastilla",ev.target.value)} style={inp}>
                        {TIPOS_CANASTILLA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </CustomSelect>
                    </td>
                    <td style={{ padding:"6px" }}><input type="number" style={inp} value={e.cantCanastillas} onChange={ev=>setEstiba(idx,"cantCanastillas",ev.target.value)} /></td>
                    <td style={{ padding:"6px", color:"rgba(255,255,255,0.7)" }}>{pesoCanastillasEstiba(e).toLocaleString("es-CO",{maximumFractionDigits:2})}</td>
                    <td style={{ padding:"6px" }}><input type="number" style={inp} value={e.pesoEstiba} onChange={ev=>setEstiba(idx,"pesoEstiba",ev.target.value)} /></td>
                    <td style={{ padding:"6px", color:"rgba(255,255,255,0.7)" }}>{descuentoEstiba(e).toLocaleString("es-CO",{maximumFractionDigits:2})}</td>
                    <td style={{ padding:"6px", color:"#00C9A7", fontWeight:700 }}>{pesoNetoEstiba(e).toLocaleString("es-CO",{maximumFractionDigits:2})}</td>
                    <td style={{ padding:"6px" }}>
                      <button onClick={()=>quitarEstiba(idx)} style={btnTablaEliminar}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button onClick={agregarEstiba} style={{ marginTop:10, background:"rgba(132,94,247,0.12)", border:"1px solid rgba(132,94,247,0.35)", borderRadius:8, color:"#a78bfa", padding:"7px 12px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
          + Agregar estiba
        </button>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:16, paddingTop:12, borderTop:"1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)" }}>Total peso neto</div>
            <div style={{ fontSize: m?20:22, fontWeight:800, color:"#00C9A7" }}>{totalNeto.toLocaleString("es-CO",{maximumFractionDigits:2})} kg</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {editId && (
              <button onClick={cancelarEdicion} style={btnSecundario}>
                Cancelar
              </button>
            )}
            <button onClick={()=>verInforme({ ...form, id: editId || "preview", total: totalNeto })} style={{ background:"rgba(0,201,167,0.12)", border:"1px solid rgba(0,201,167,0.35)", borderRadius:8, color:"#00C9A7", padding:"9px 16px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              📄 Vista previa
            </button>
            <button onClick={guardar} disabled={guardando} style={btnPrimario(guardadoOk, guardando)}>
              {guardadoOk ? "✓ Guardado" : guardando ? "Guardando..." : editId ? "Guardar cambios" : "Guardar recepción"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Historial ── */}
      <div style={cardS}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, flexWrap:"wrap", gap:8 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"white" }}>📋 Recepciones registradas</div>
        </div>

        <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"flex-end", marginBottom:14 }}>
          <div style={{ flex: m ? "1 1 100%" : "0 1 160px" }}>
            <div style={lbl}>Desde</div>
            <input type="date" style={inp} value={filtroDesde} onChange={e=>setFiltroDesde(e.target.value)} />
          </div>
          <div style={{ flex: m ? "1 1 100%" : "0 1 160px" }}>
            <div style={lbl}>Hasta</div>
            <input type="date" style={inp} value={filtroHasta} onChange={e=>setFiltroHasta(e.target.value)} />
          </div>
          {(filtroDesde || filtroHasta) && (
            <button onClick={()=>{setFiltroDesde("");setFiltroHasta("");}} style={{ ...btnSecundario, padding:"0 14px", height: isLandscape?36:(m?44:32), display:"flex", alignItems:"center", justifyContent:"center" }}>
              ✕ Limpiar
            </button>
          )}
          <button onClick={verInformeGeneral} disabled={recepcionesFiltradas.length===0} style={{ marginLeft: m ? 0 : "auto", background:"rgba(0,201,167,0.12)", border:"1px solid rgba(0,201,167,0.35)", borderRadius:8, color: recepcionesFiltradas.length===0 ? "rgba(0,201,167,0.4)" : "#00C9A7", padding:"0 16px", fontSize:12, fontWeight:700, cursor: recepcionesFiltradas.length===0 ? "default" : "pointer", height: isLandscape?36:(m?44:32), display:"flex", alignItems:"center", justifyContent:"center" }}>
            📄 Informe general ({recepcionesFiltradas.length})
          </button>
        </div>

        {recepcionesFiltradas.length === 0 ? (
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", padding:"12px 0" }}>
            {recepciones.length === 0 ? "Sin recepciones registradas todavía." : "Ninguna recepción cae en el rango de fechas seleccionado."}
          </div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ color:"rgba(255,255,255,0.45)", textAlign:"left" }}>
                  <th style={{ padding:"6px" }}>Remisión</th>
                  <th style={{ padding:"6px" }}>Fecha</th>
                  <th style={{ padding:"6px" }}>Tipo</th>
                  <th style={{ padding:"6px" }}>Placa</th>
                  <th style={{ padding:"6px" }}>Proveedor</th>
                  <th style={{ padding:"6px" }}>Supervisor</th>
                  <th style={{ padding:"6px" }}>Estibas</th>
                  <th style={{ padding:"6px" }}>Total neto</th>
                  <th style={{ padding:"6px" }}></th>
                </tr>
              </thead>
              <tbody>
                {recepcionesFiltradas.map(r => (
                  <tr key={r.id} style={{ borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding:"6px", color:"white", fontWeight:600 }}>{r.remision || "—"}</td>
                    <td style={{ padding:"6px" }}>{r.fecha}</td>
                    <td style={{ padding:"6px" }}>
                      <span style={{ padding:"2px 8px", borderRadius:6, fontSize:10, fontWeight:700, background: r.tipo==="entrada" ? "rgba(132,94,247,0.15)" : "rgba(249,168,38,0.15)", color: r.tipo==="entrada" ? "#a78bfa" : "#F9A826" }}>
                        {r.tipo === "entrada" ? "Entrada" : "Salida"}
                      </span>
                    </td>
                    <td style={{ padding:"6px" }}>{r.placa || "—"}</td>
                    <td style={{ padding:"6px" }}>{r.proveedor || "—"}</td>
                    <td style={{ padding:"6px" }}>{r.supervisor || "—"}</td>
                    <td style={{ padding:"6px", textAlign:"center" }}>{r.estibas.length}</td>
                    <td style={{ padding:"6px", color:"#00C9A7", fontWeight:700 }}>{num(r.total).toLocaleString("es-CO",{maximumFractionDigits:2})} kg</td>
                    <td style={{ padding:"6px", whiteSpace:"nowrap" }}>
                      <button onClick={()=>verInforme(r)} style={{ background:"rgba(0,201,167,0.12)", border:"1px solid rgba(0,201,167,0.3)", borderRadius:6, color:"#00C9A7", padding:"4px 8px", fontSize:11, cursor:"pointer", marginRight:6 }}>📄 Informe</button>
                      <button onClick={()=>editarRecepcion(r)} style={btnTablaEditar}>Editar</button>
                      <button onClick={()=>eliminarRecepcion(r.id)} style={btnTablaEliminar}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal vista previa del informe ── */}
      {preview && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.75)", zIndex:9999, display:"flex", flexDirection:"column", padding: m ? 8 : 24 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ color:"white", fontSize:13, fontWeight:700 }}>📄 Vista previa — Informe de Recepción</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={descargarInforme} style={{ background:"linear-gradient(135deg,#845EF7,#6366F1)", border:"none", borderRadius:8, color:"white", padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                ⬇ Descargar
              </button>
              <button onClick={cerrarPreview} style={{ background:"rgba(255,255,255,0.10)", border:"1px solid rgba(255,255,255,0.20)", borderRadius:8, padding:"8px 14px", fontSize:12, color:"rgba(255,255,255,0.78)", cursor:"pointer" }}>
                ✕ Cerrar
              </button>
            </div>
          </div>
          <iframe src={preview.url} style={{ flex:1, border:"none", borderRadius:10, background:"white" }} title="Vista previa del informe" />
        </div>
      )}
    </div>
  );
}
