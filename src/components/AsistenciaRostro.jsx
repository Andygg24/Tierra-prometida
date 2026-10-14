import { useState, useEffect, useRef } from "react";
import {
  cargarModelosRostro, detectarCara, detectarHuella, aperturaOjos, crearDetectorParpadeo,
  identificar, distanciaHuellas, abrirCamaraFrontal, cerrarCamara, leerQrDeVideo,
} from "../utils/rostro.js";
import { numDeQrAsistencia } from "../utils/qrAsistencia.js";
import { btnPrimario, btnSecundario, btnTablaEliminar } from "./buttonStyles.js";

const MUESTRAS_POR_EMPLEADO = 3;
// Tras marcar a alguien, esa misma persona se ignora este tiempo — si se
// queda frente a la cámara no debe marcarse la salida justo después de la entrada.
const ESPERA_MISMA_PERSONA_MS = 60_000;


function mensajeErrorCamaraFrontal(err) {
  if (!window.isSecureContext) return "El navegador solo permite usar la cámara en sitios seguros (https://).";
  const n = err?.name || "";
  if (n === "NotAllowedError" || n === "PermissionDeniedError") return "El navegador bloqueó el permiso de cámara. Revisa los permisos del sitio y vuelve a intentar.";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "No se encontró una cámara en este dispositivo.";
  if (n === "NotReadableError" || n === "TrackStartError") return "La cámara está siendo usada por otra app o pestaña. Ciérrala e intenta de nuevo.";
  return `No se pudo iniciar la cámara: ${err?.message || n || "error desconocido"}`;
}

// Cámara frontal + modelos, compartido por el registro y el kiosco.
function useCamaraRostro() {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const faceapiRef = useRef(null);
  const [estado, setEstado] = useState("apagada"); // apagada | cargando | lista
  const [error,  setError]  = useState("");

  const iniciar = async () => {
    setError(""); setEstado("cargando");
    try {
      faceapiRef.current = await cargarModelosRostro();
      streamRef.current  = await abrirCamaraFrontal(videoRef.current);
      setEstado("lista");
    } catch (err) {
      cerrarCamara(streamRef.current); streamRef.current = null;
      setError(err?.name ? mensajeErrorCamaraFrontal(err) : `No se pudo cargar el reconocimiento de rostro: ${err?.message || err}`);
      setEstado("apagada");
    }
  };
  const detener = () => {
    cerrarCamara(streamRef.current); streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setEstado("apagada");
  };
  useEffect(() => () => cerrarCamara(streamRef.current), []);
  return { videoRef, faceapiRef, estado, error, iniciar, detener };
}

const estiloVideo = { width:"100%", maxWidth:420, borderRadius:14, transform:"scaleX(-1)", background:"#000", display:"block", margin:"0 auto" };

// ═══════════════════════════════════════════════════════════════
// REGISTRO DE ROSTRO — ventana que se abre desde Personal, para un empleado
// ═══════════════════════════════════════════════════════════════
export function RegistrarRostroModal({ emp, rostros, empleados, onClose }) {
  const { registrados, error: errorRostros, guardarRostro, borrarRostro } = rostros;
  const cam = useCamaraRostro();
  const { videoRef, faceapiRef, iniciar, detener } = cam;
  const [muestras,  setMuestras]  = useState([]);
  const [tomando,   setTomando]   = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg,       setMsg]       = useState(null); // { ok, texto }

  const yaTiene  = registrados.some(r => r.num === emp.num);
  const nombreDe = (num) => empleados.find(e => e.num === num)?.nombre || num;

  // La cámara se prende sola al abrir la ventana.
  const yaIniciado = useRef(false);
  useEffect(() => { if (!yaIniciado.current) { yaIniciado.current = true; iniciar(); } }, [iniciar]);

  const tomarMuestra = async () => {
    if (!faceapiRef.current || tomando) return;
    setTomando(true); setMsg(null);
    try {
      const r = await detectarHuella(faceapiRef.current, videoRef.current);
      if (!r) { setMsg({ ok:false, texto:"No se ve ninguna cara. Acércate y mira a la cámara." }); return; }
      if (r.varias) { setMsg({ ok:false, texto:"Hay más de una cara en la cámara — que quede solo la persona." }); return; }
      if (r.detection.score < 0.7) { setMsg({ ok:false, texto:"La cara no se ve clara. Busca mejor luz." }); return; }
      setMuestras(m => [...m, r.descriptor]);
    } finally {
      setTomando(false);
    }
  };

  const guardar = async () => {
    if (muestras.length < MUESTRAS_POR_EMPLEADO) return;
    // Evita registrar la cara de alguien bajo el nombre de otra persona.
    const otros = registrados.filter(r => r.num !== emp.num);
    for (const m of muestras) {
      const parecido = identificar(m, otros);
      if (parecido) { setMsg({ ok:false, texto:`Esta cara ya está registrada como ${nombreDe(parecido.num)}. No se guardó.` }); return; }
    }
    // Las muestras deben ser de la misma persona entre sí.
    for (let i = 1; i < muestras.length; i++) {
      if (distanciaHuellas(muestras[0], muestras[i]) > 0.55) {
        setMsg({ ok:false, texto:"Las fotos no parecen ser de la misma persona. Vuelve a tomarlas." });
        setMuestras([]);
        return;
      }
    }
    setGuardando(true);
    const r = await guardarRostro(emp.num, muestras);
    setGuardando(false);
    if (r.ok) { setMuestras([]); setMsg({ ok:true, texto:"Rostro guardado. El Biométrico ya reconoce a esta persona." }); }
    else setMsg({ ok:false, texto:`No se pudo guardar: ${r.msg}` });
  };

  const borrar = async () => {
    if (!window.confirm(`¿Borrar el rostro registrado de ${emp.nombre}? Tendrá que marcar con QR hasta que se registre de nuevo.`)) return;
    const r = await borrarRostro(emp.num);
    setMsg(r.ok ? { ok:true, texto:"Rostro borrado." } : { ok:false, texto:`No se pudo borrar: ${r.msg}` });
  };

  const cerrar = () => { detener(); onClose(); };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#1a1a2e", border:"1px solid rgba(132,94,247,0.35)", borderRadius:16, padding:20, maxWidth:440, width:"100%", maxHeight:"calc(100vh - 32px)", overflowY:"auto" }}>
        <div style={{ fontSize:14, fontWeight:800, color:"#a5b4fc", marginBottom:2 }}>🙂 Registrar rostro</div>
        <div style={{ fontSize:13, color:"white", fontWeight:700 }}>{emp.nombre}</div>
        <div style={{ fontSize:11, color: yaTiene ? "#00C9A7" : "rgba(255,255,255,0.45)", marginBottom:10 }}>
          {yaTiene ? "✓ Ya tiene rostro registrado — si tomas fotos nuevas, se reemplaza." : "Todavía no tiene rostro registrado."}
        </div>
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.55)", marginBottom:10 }}>
          Toma {MUESTRAS_POR_EMPLEADO} fotos: de frente, un poco de lado y otra vez de frente. Sin gorra ni tapabocas, con buena luz.
        </div>

        {errorRostros && <div style={{ fontSize:12, color:"#FF6B6B", marginBottom:10 }}>{errorRostros}</div>}
        {cam.estado === "cargando" && <div style={{ fontSize:12, color:"rgba(255,255,255,0.6)", marginBottom:10 }}>Cargando cámara y reconocimiento… (la primera vez tarda un poco)</div>}
        {cam.error && <div style={{ fontSize:12, color:"#FF6B6B", marginBottom:10 }}>{cam.error}</div>}
        <video ref={videoRef} style={{ ...estiloVideo, display: cam.estado === "lista" ? "block" : "none" }} />

        {cam.estado === "lista" && (
          <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:10 }}>
            {Array.from({ length: MUESTRAS_POR_EMPLEADO }, (_, i) => (
              <span key={i} style={{ width:12, height:12, borderRadius:99, background: i < muestras.length ? "#00C9A7" : "rgba(255,255,255,0.15)" }} />
            ))}
          </div>
        )}

        {msg && <div style={{ fontSize:12, marginTop:10, color: msg.ok ? "#00C9A7" : "#FF6B6B" }}>{msg.texto}</div>}

        <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
          {cam.estado === "apagada" && <button onClick={iniciar} style={btnPrimario(false,false)}>📷 Activar cámara</button>}
          {cam.estado === "lista" && muestras.length < MUESTRAS_POR_EMPLEADO && (
            <button onClick={tomarMuestra} disabled={tomando} style={btnPrimario(false, tomando)}>
              {tomando ? "Analizando…" : `📸 Tomar foto ${muestras.length + 1} de ${MUESTRAS_POR_EMPLEADO}`}
            </button>
          )}
          {muestras.length >= MUESTRAS_POR_EMPLEADO && (
            <button onClick={guardar} disabled={guardando} style={btnPrimario(false, guardando)}>
              {guardando ? "Guardando…" : "💾 Guardar rostro"}
            </button>
          )}
          {muestras.length > 0 && <button onClick={() => setMuestras([])} style={btnSecundario}>Repetir fotos</button>}
          {yaTiene && <button onClick={borrar} style={{ ...btnTablaEliminar, padding:"7px 12px" }}>🗑 Borrar rostro</button>}
          <button onClick={cerrar} style={{ ...btnSecundario, marginLeft:"auto" }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// KIOSCO POR ROSTRO — reconoce, pide parpadear y marca entrada/salida
// ═══════════════════════════════════════════════════════════════
export function KioscoRostro({ empleados, rostros, registrarEscaneo, onResultado, autoIniciar = false }) {
  const cam = useCamaraRostro();
  const { videoRef, faceapiRef, estado: estadoCam, iniciar } = cam;
  // El Biométrico prende la cámara apenas se abre, como un aparato de pared.
  const yaAutoIniciado = useRef(false);
  useEffect(() => {
    if (autoIniciar && !yaAutoIniciado.current) { yaAutoIniciado.current = true; iniciar(); }
  }, [autoIniciar, iniciar]);
  const [aviso, setAviso] = useState("");       // instrucción en pantalla
  const [candidato, setCandidato] = useState(null); // { num, nombre }

  // Refs para que el ciclo de detección siempre vea lo último sin reiniciarse.
  const registradosRef = useRef([]);
  const empleadosRef   = useRef(empleados);
  const registrarRef   = useRef(registrarEscaneo);
  const onResultadoRef = useRef(onResultado);
  useEffect(() => {
    const activos = new Set(empleados.map(e => e.num));
    registradosRef.current = rostros.registrados.filter(r => activos.has(r.num));
    empleadosRef.current = empleados;
  }, [rostros.registrados, empleados]);
  useEffect(() => { registrarRef.current = registrarEscaneo; }, [registrarEscaneo]);
  useEffect(() => { onResultadoRef.current = onResultado; }, [onResultado]);

  useEffect(() => {
    if (estadoCam !== "lista") return;
    let vivo = true;
    const faceapi = faceapiRef.current;
    const video   = videoRef.current;
    const parpadeo = crearDetectorParpadeo();
    const canvasQr = document.createElement("canvas");
    const ultimaMarca = new Map(); // num → hora en que se marcó
    let actual = null;          // { num, nombre } identificado y siguiendo
    let previoNum = null;       // última identificación, aún sin confirmar
    let coincidencias = 0;      // identificaciones seguidas de la misma persona
    let sinCara = 0;
    let pausaHasta = 0;

    const soltar = () => { actual = null; previoNum = null; coincidencias = 0; parpadeo.reiniciar(); setCandidato(null); };

    const marcar = async (num, via) => {
      pausaHasta = Date.now() + 2500;
      const res = await registrarRef.current(num, via);
      if (res.ok) ultimaMarca.set(num, Date.now());
      onResultadoRef.current?.(res);
      setAviso("");
    };

    const paso = async () => {
      if (!vivo) return;
      try {
        if (Date.now() < pausaHasta || video.readyState < 2) return;

        // Primero se busca un QR de asistencia en el cuadro (no necesita
        // parpadeo: el QR ya identifica a la persona).
        if (!actual) {
          const texto = await leerQrDeVideo(video, canvasQr);
          if (texto) {
            const num = numDeQrAsistencia(texto);
            if (!num) { setAviso("Ese QR no es de asistencia"); pausaHasta = Date.now() + 1500; return; }
            const espera = ultimaMarca.get(num);
            if (espera && Date.now() - espera < ESPERA_MISMA_PERSONA_MS) { setAviso("Ya quedaste marcado hace un momento"); return; }
            await marcar(num, "qr");
            return;
          }
        }

        if (!actual) {
          const r = await detectarHuella(faceapi, video);
          if (!r) { previoNum = null; setAviso("Mira a la cámara o muestra tu QR"); return; }
          if (r.varias) { previoNum = null; setAviso("Solo una persona a la vez"); return; }
          const id = identificar(r.descriptor, registradosRef.current);
          if (!id) { previoNum = null; setAviso("No te reconozco — usa tu QR o pide que registren tu rostro"); return; }
          const espera = ultimaMarca.get(id.num);
          if (espera && Date.now() - espera < ESPERA_MISMA_PERSONA_MS) {
            setAviso("Ya quedaste marcado hace un momento");
            return;
          }
          // Se exigen 2 identificaciones seguidas de la misma persona.
          coincidencias = previoNum === id.num ? coincidencias + 1 : 1;
          previoNum = id.num;
          if (coincidencias < 2) return;
          const nombre = empleadosRef.current.find(e => e.num === id.num)?.nombre || id.num;
          actual = { num: id.num, nombre };
          parpadeo.reiniciar();
          setCandidato(actual);
          setAviso("Parpadea para confirmar");
          return;
        }

        // Ya identificada: se sigue la cara (rápido) esperando el parpadeo.
        const r = await detectarCara(faceapi, video);
        if (!r || r.varias) {
          if (++sinCara > 4) { sinCara = 0; soltar(); }
          return;
        }
        sinCara = 0;
        if (!parpadeo.actualizar(aperturaOjos(r.landmarks))) return;

        // Antes de marcar se confirma que sigue siendo la misma persona.
        const confirma = await detectarHuella(faceapi, video);
        const id2 = confirma && !confirma.varias ? identificar(confirma.descriptor, registradosRef.current) : null;
        if (!id2 || id2.num !== actual.num) { soltar(); return; }

        const marcado = actual;
        soltar();
        await marcar(marcado.num, "rostro");
      } catch (err) {
        console.error("[Asistencia rostro]", err);
      } finally {
        if (vivo) setTimeout(paso, actual ? 60 : 250);
      }
    };
    paso();
    return () => { vivo = false; };
  }, [estadoCam, faceapiRef, videoRef]);

  const sinRegistrados = !rostros.loading && rostros.registrados.length === 0;

  return (
    <div>
      {rostros.error && <div style={{ fontSize:12, color:"#FF6B6B", marginBottom:12 }}>{rostros.error}</div>}
      {sinRegistrados && !rostros.error && (
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.6)", marginBottom:12 }}>
          Todavía no hay rostros registrados. Regístralos en Personal → botón "🙂 Rostro" de cada empleado.
        </div>
      )}

      {cam.estado === "apagada" && (
        <button onClick={cam.iniciar} style={{ ...btnPrimario(false,false), padding:"14px 24px", fontSize:14, marginBottom:12 }}>🙂 Activar reconocimiento</button>
      )}
      {cam.estado === "cargando" && <div style={{ fontSize:12, color:"rgba(255,255,255,0.6)", marginBottom:12 }}>Cargando cámara y reconocimiento… (la primera vez tarda un poco)</div>}
      {cam.estado === "lista" && <button onClick={cam.detener} style={{ ...btnSecundario, marginBottom:12 }}>Detener cámara</button>}
      {cam.error && <div style={{ fontSize:12, color:"#FF6B6B", marginBottom:12, padding:"0 10px" }}>{cam.error}</div>}

      <video ref={videoRef} style={{ ...estiloVideo, display: cam.estado === "lista" ? "block" : "none" }} />

      {cam.estado === "lista" && (
        <div style={{ marginTop:12, fontSize:15, fontWeight:800, color: candidato ? "#00C9A7" : "rgba(255,255,255,0.75)" }}>
          {candidato ? `👋 ${candidato.nombre} — parpadea para confirmar` : aviso}
        </div>
      )}
    </div>
  );
}
