import { useState } from "react";
import { RegistrarRostroModal } from "./AsistenciaRostro.jsx";
import {
  buscarDocumento, crearSolicitudNuevo, crearSolicitudReingreso, guardarRostroPendiente, limpiarDocumento,
} from "../hooks/useRegistroEnLinea.js";
import { btnPrimario, btnSecundario } from "./buttonStyles.js";

// Página pública /registro — sin login. El trabajador registra su rostro
// desde su celular; nada cuenta hasta que se aprueba en Personal.

const SIN_ROSTROS = { registrados: [], error: "" };

// "JOSE LUIS GARCIA" → "JOSE L. G." — confirma que es la persona sin
// mostrar el nombre completo de nadie a quien solo sepa un documento.
const nombreParcial = (n) => {
  const [primero, ...resto] = (n || "").trim().split(/\s+/);
  return [primero, ...resto.map(p => `${p[0]}.`)].join(" ");
};
const primerNombre = (n) => (n || "").trim().split(/\s+/)[0] || "";

const TIPOS_DOC = [["CC Nacional", "Cédula colombiana"], ["CC Venezuela", "Cédula venezolana"], ["PPT", "PPT"]];
const tipoDoc = (v) => TIPOS_DOC.find(t => t[0] === v)?.[1] || v;

const inp = { background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.18)", borderRadius:10, padding:"12px 14px", color:"white", fontSize:16, fontFamily:"inherit", width:"100%", boxSizing:"border-box" };
const etiqueta = { fontSize:12, color:"rgba(255,255,255,0.6)", marginBottom:5, display:"block" };
const btnGrande = (extra) => ({ ...btnPrimario(false, false), width:"100%", padding:"13px 18px", fontSize:15, ...extra });

export default function RegistroEnLinea() {
  // buscar → encontrado | nuevo | inactivo → rostro → listo
  const [paso, setPaso] = useState("buscar");
  const [doc,  setDoc]  = useState("");
  const [emp,  setEmp]  = useState(null);
  const [form, setForm] = useState({ nombre:"", doc:"CC Nacional", tel:"" });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  // Vuelve a la búsqueda conservando el tipo de documento elegido.
  const reiniciar = () => { setPaso("buscar"); setEmp(null); setError(""); setForm(f => ({ nombre:"", doc: f.doc, tel:"" })); };

  const buscar = async (e) => {
    e?.preventDefault();
    const num = limpiarDocumento(doc);
    if (num.length < 5) { setError("Escribe tu número de documento completo."); return; }
    setError(""); setCargando(true);
    const r = await buscarDocumento(num);
    setCargando(false);
    if (!r.ok) { setError(r.msg); return; }
    setDoc(num);
    if (!r.emp) { setPaso("nuevo"); return; }
    setEmp(r.emp);
    setPaso(r.emp.activo || r.emp.solicitud ? "encontrado" : "inactivo");
  };

  const enviarNuevo = async (e) => {
    e.preventDefault();
    const nombre = form.nombre.trim().replace(/\s+/g, " ").toUpperCase();
    const tel = form.tel.replace(/\D/g, "");
    if (nombre.split(" ").length < 2) { setError("Escribe tu nombre completo (nombre y apellido)."); return; }
    if (tel.length < 10) { setError("Escribe tu número de celular completo (10 dígitos)."); return; }
    setError(""); setCargando(true);
    const r = await crearSolicitudNuevo({ nombre, doc: form.doc, num: doc, tel });
    setCargando(false);
    if (!r.ok) { setError(r.msg); return; }
    setEmp({ num: doc, nombre, activo: false, solicitud: "nuevo", propio: true });
    setPaso("rostro");
  };

  const enviarReingreso = async (e) => {
    e.preventDefault();
    const tel = form.tel.replace(/\D/g, "");
    if (tel.length < 10) { setError("Escribe tu número de celular completo (10 dígitos)."); return; }
    setError(""); setCargando(true);
    const r = await crearSolicitudReingreso(emp.num, tel);
    setCargando(false);
    if (!r.ok) { setError(r.msg); return; }
    setEmp(p => ({ ...p, solicitud: "reingreso" }));
    setPaso("rostro");
  };

  const pendiente = emp && !emp.activo;

  return (
    <div style={{ minHeight:"100vh", width:"100%", display:"flex", justifyContent:"center", padding:"28px 16px", boxSizing:"border-box",
      background:"radial-gradient(ellipse at top, rgba(132,94,247,0.18), transparent 60%), #020203" }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <img src="/logo-tp.png" alt="" style={{ height:64, objectFit:"contain", marginBottom:8 }} onError={e => { e.currentTarget.style.display = "none"; }} />
          <div style={{ fontSize:20, fontWeight:800, color:"white" }}>Registro de rostro</div>
          <div style={{ fontSize:13, color:"rgba(255,255,255,0.55)", marginTop:4 }}>Tierra Prometida · Asistencia</div>
        </div>

        <div style={{ background:"#12121f", border:"1px solid rgba(132,94,247,0.3)", borderRadius:16, padding:20 }}>
          {paso === "buscar" && (
            <form onSubmit={buscar}>
              <div style={{ fontSize:14, color:"rgba(255,255,255,0.8)", marginBottom:14, lineHeight:1.45 }}>
                Registra tu cara para marcar la entrada y la salida en la planta. Para empezar, escoge tu tipo de documento y escribe el número.
              </div>
              <label style={etiqueta}>Tipo de documento</label>
              <select value={form.doc} onChange={e => setForm(f => ({ ...f, doc: e.target.value }))} style={{ ...inp, marginBottom:12, colorScheme:"dark" }}>
                {TIPOS_DOC.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label style={etiqueta}>Número de documento</label>
              <input value={doc} onChange={e => setDoc(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="Ej: 1045678901" style={inp} autoFocus />
              <button type="submit" disabled={cargando} style={btnGrande({ marginTop:14, opacity: cargando ? 0.6 : 1 })}>
                {cargando ? "Buscando…" : "🔍 Buscar"}
              </button>
            </form>
          )}

          {paso === "encontrado" && (
            <div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.6)" }}>Documento {doc}</div>
              <div style={{ fontSize:18, fontWeight:800, color:"white", margin:"4px 0 10px" }}>¿Eres {nombreParcial(emp.nombre)}?</div>
              {pendiente && (
                <div style={{ fontSize:13, color:"#c4b5fd", background:"rgba(132,94,247,0.12)", borderRadius:10, padding:"10px 12px", marginBottom:12, lineHeight:1.4 }}>
                  ⏳ Ya enviaste tu solicitud y está pendiente de aprobación. Si quieres, puedes tomar tu rostro otra vez.
                </div>
              )}
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.7)", marginBottom:14, lineHeight:1.45 }}>
                Busca un lugar con buena luz, sin gorra ni tapabocas. La cámara te va a pedir que muevas un poco la cabeza.
              </div>
              <button onClick={() => setPaso("rostro")} style={btnGrande()}>🙂 Sí, registrar mi rostro</button>
              <button onClick={reiniciar} style={{ ...btnSecundario, width:"100%", marginTop:8, padding:"11px" }}>No soy yo</button>
            </div>
          )}

          {paso === "inactivo" && (
            <form onSubmit={enviarReingreso}>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.6)" }}>Documento {doc}</div>
              <div style={{ fontSize:18, fontWeight:800, color:"white", margin:"4px 0 10px" }}>¡Hola de nuevo, {primerNombre(emp.nombre)}!</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.7)", marginBottom:14, lineHeight:1.45 }}>
                Ya trabajaste con nosotros. Si vas a volver, confirma tu celular y registra tu rostro. Tu regreso queda pendiente de aprobación.
              </div>
              <label style={etiqueta}>Celular</label>
              <input value={form.tel} onChange={e => setForm(f => ({ ...f, tel: e.target.value }))} inputMode="tel" placeholder="Ej: 3001234567" style={inp} />
              <button type="submit" disabled={cargando} style={btnGrande({ marginTop:14, opacity: cargando ? 0.6 : 1 })}>
                {cargando ? "Enviando…" : "Continuar"}
              </button>
              <button type="button" onClick={reiniciar} style={{ ...btnSecundario, width:"100%", marginTop:8, padding:"11px" }}>No soy yo</button>
            </form>
          )}

          {paso === "nuevo" && (
            <form onSubmit={enviarNuevo}>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.6)" }}>{tipoDoc(form.doc)} {doc}</div>
              <div style={{ fontSize:16, fontWeight:800, color:"white", margin:"4px 0" }}>No encontramos tu documento</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.7)", marginBottom:14, lineHeight:1.45 }}>
                Si eres nuevo, llena tus datos y registra tu rostro. Tu ingreso queda pendiente de aprobación. Si te equivocaste de número, vuelve atrás.
              </div>
              <label style={etiqueta}>Nombre completo</label>
              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoComplete="name" placeholder="Nombres y apellidos" style={{ ...inp, marginBottom:12 }} />
              <label style={etiqueta}>Celular</label>
              <input value={form.tel} onChange={e => setForm(f => ({ ...f, tel: e.target.value }))} inputMode="tel" autoComplete="tel" placeholder="Ej: 3001234567" style={inp} />
              <button type="submit" disabled={cargando} style={btnGrande({ marginTop:14, opacity: cargando ? 0.6 : 1 })}>
                {cargando ? "Enviando…" : "Continuar"}
              </button>
              <button type="button" onClick={reiniciar} style={{ ...btnSecundario, width:"100%", marginTop:8, padding:"11px" }}>← Volver</button>
            </form>
          )}

          {paso === "listo" && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:44, marginBottom:6 }}>✅</div>
              <div style={{ fontSize:18, fontWeight:800, color:"white", marginBottom:8 }}>¡Listo, {primerNombre(emp.nombre)}!</div>
              <div style={{ fontSize:14, color:"rgba(255,255,255,0.75)", lineHeight:1.5 }}>
                Tu registro quedó enviado. Cuando lo aprueben en la planta ya podrás marcar tu entrada y salida con tu cara.
              </div>
              <button onClick={reiniciar} style={{ ...btnSecundario, width:"100%", marginTop:16, padding:"11px" }}>Registrar a otra persona</button>
            </div>
          )}

          {error && <div style={{ fontSize:13, color:"#FF6B6B", marginTop:12, lineHeight:1.4 }}>{error}</div>}
        </div>
      </div>

      {paso === "rostro" && (
        <RegistrarRostroModal
          publico emp={{ ...emp, nombre: emp.propio ? emp.nombre : nombreParcial(emp.nombre) }} rostros={SIN_ROSTROS} empleados={[]}
          guardar={(muestras, foto) => guardarRostroPendiente(emp.num, muestras, foto)}
          onClose={(ok) => setPaso(ok ? "listo" : "encontrado")}
        />
      )}
    </div>
  );
}
