import { useState, useEffect, useRef } from "react";
import {
  cargarModelosRostro, detectarCara, detectarHuella,
  identificar, distanciaHuellas, abrirCamaraFrontal, cerrarCamara, leerQrDeVideo, poseCara, UMBRAL_RECONOCIMIENTO,
} from "../utils/rostro.js";
import { numDeQrAsistencia } from "../utils/qrAsistencia.js";
import { btnPrimario, btnSecundario, btnTablaEliminar } from "./buttonStyles.js";

// Tras marcar a alguien, esa misma persona se ignora este tiempo — si se
// queda frente a la cámara no debe marcarse la salida justo después de la entrada.
const ESPERA_MISMA_PERSONA_MS = 60_000;
// Identificaciones seguidas de la misma persona antes de marcarla.
const COINCIDENCIAS_PARA_MARCAR = 3;


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
// REGISTRO DE ROSTRO — ventana que se abre desde Personal, para un empleado.
// Registro guiado tipo Nequi / Face ID: la cámara sigue la cara en vivo
// dentro de un óvalo, va pidiendo posiciones y toma cada muestra sola
// cuando la cara está quieta en la posición pedida.
// ═══════════════════════════════════════════════════════════════
const PASOS = [
  { id:"frente",  texto:"Mira de frente a la cámara" },
  // Los pasos 2 y 4 aceptan cualquier dirección; el 3 y el 5 piden la
  // contraria. Con el texto se guía a una dirección concreta para que sea claro.
  { id:"lado1",   texto:"Gira despacio la cabeza hacia tu derecha" },
  { id:"lado2",   texto:"Ahora gírala hacia tu izquierda" },
  { id:"vert1",   texto:"Sube un poco la cabeza, mira hacia arriba" },
  { id:"vert2",   texto:"Ahora baja la cabeza, mira hacia abajo" },
  { id:"frente2", texto:"De frente otra vez" },
];
const UMBRAL_GIRO  = 0.09;  // cuánto debe girar a los lados (ver poseCara)
const UMBRAL_VERT  = 0.05;  // cuánto debe subir/bajar
const CUADROS_QUIETO = 3;   // cuadros seguidos en posición antes de tomar la muestra
const MS_AYUDA_MANUAL = 12_000; // si un paso no avanza, se ofrece tomarla a mano
// Las muestras de lado se alejan más de la de frente que dos fotos de frente;
// por encima de esto ya no parece la misma persona.
const MAX_DIST_MISMA_PERSONA = 0.65;

// Foto pequeña de la cara (JPEG) para que quien aprueba un registro en línea
// vea quién es. Se recorta al cuadro de la cara con algo de margen.
// Primero se copia el cuadro completo y luego se recorta de esa copia: en
// algunos celulares (iPhone) recortar directo del video da una imagen negra.
// Si aun así sale negra se devuelve null y se intenta en otra muestra.
function fotoDeCara(video, box) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const completo = document.createElement("canvas");
  completo.width = vw; completo.height = vh;
  completo.getContext("2d").drawImage(video, 0, 0, vw, vh);
  const m = box.width * 0.35;
  const x = Math.max(0, Math.round(box.x - m)), y = Math.max(0, Math.round(box.y - m * 1.3));
  const lw = Math.round(Math.min(vw - x, box.width + m * 2)), lh = Math.round(Math.min(vh - y, box.height + m * 2.3));
  if (lw < 10 || lh < 10) return null;
  const c = document.createElement("canvas");
  c.width = 200; c.height = Math.round(200 * lh / lw);
  const ctx = c.getContext("2d");
  ctx.drawImage(completo, x, y, lw, lh, 0, 0, c.width, c.height);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  let suma = 0;
  for (let i = 0; i < px.length; i += 16) suma += px[i] + px[i + 1] + px[i + 2];
  if (suma / (px.length / 16) / 3 < 10) return null; // negra
  return c.toDataURL("image/jpeg", 0.75);
}

// `publico`: modo de la página /registro (el propio trabajador desde su
// celular). No compara con otros rostros (no se muestran nombres de otras
// personas) y guarda con `guardar(muestras, foto)`, que deja el registro
// pendiente de aprobación.
export function RegistrarRostroModal({ emp, rostros, empleados, onClose, publico = false, guardar }) {
  const { registrados, error: errorRostros, guardarRostro, borrarRostro } = rostros;
  const fotoRef = useRef(null);
  const cam = useCamaraRostro();
  const { videoRef, faceapiRef, iniciar, detener, estado: estadoCam } = cam;
  const [paso,        setPaso]        = useState(0);      // PASOS.length = terminado
  const [aviso,       setAviso]       = useState("");
  const [enPosicion,  setEnPosicion]  = useState(false);
  const [ayudaManual, setAyudaManual] = useState(false);
  const [guardando,   setGuardando]   = useState(false);
  const [msg,         setMsg]         = useState(null);   // { ok, texto }
  const [dim,         setDim]         = useState({ w: 640, h: 480 });
  const [intento,     setIntento]     = useState(0);      // reinicia el recorrido
  const manualRef = useRef(false);

  const yaTiene  = !publico && registrados.some(r => r.num === emp.num);
  const nombreDe = (num) => empleados.find(e => e.num === num)?.nombre || num;

  // La cámara se prende sola al abrir la ventana.
  const yaIniciado = useRef(false);
  useEffect(() => { if (!yaIniciado.current) { yaIniciado.current = true; iniciar(); } }, [iniciar]);

  // Guardar al terminar el recorrido (ref para que el ciclo use lo último).
  const finalizarRef = useRef(null);
  const finalizar = async (muestras) => {
    // ¿Se parece a alguien ya registrado? Se compara solo con las muestras de
    // frente (primera y última), las más confiables. Familiares (padre/hijo,
    // hermanos) pueden quedar muy cerca — por eso no se bloquea: se pregunta.
    const deFrente = [muestras[0], muestras[muestras.length - 1]];
    let parecido = null;
    if (!publico) for (const r of registrados) {
      if (r.num === emp.num) continue;
      let d = Infinity;
      for (const m of deFrente) for (const x of r.descriptores) d = Math.min(d, distanciaHuellas(m, x));
      if (d < UMBRAL_RECONOCIMIENTO && (!parecido || d < parecido.distancia)) parecido = { num: r.num, distancia: d };
    }
    if (parecido) {
      const casiIgual = parecido.distancia < 0.35;
      const ok = window.confirm(
        `Esta cara se parece ${casiIgual ? "muchísimo" : "mucho"} a la de ${nombreDe(parecido.num)}` +
        `${casiIgual ? " — podría ser la misma persona" : " (pueden ser familiares)"}.\n\n` +
        `¿Confirmas que es ${emp.nombre}, una persona distinta?`
      );
      if (!ok) { setMsg({ ok:false, texto:"No se guardó." }); return; }
    }
    if (muestras.some(m => distanciaHuellas(muestras[0], m) > MAX_DIST_MISMA_PERSONA)) {
      setMsg({ ok:false, texto:"Parece que cambió la persona frente a la cámara a mitad del registro. Inténtalo de nuevo." });
      return;
    }
    setGuardando(true);
    const r = publico ? await guardar(muestras, fotoRef.current) : await guardarRostro(emp.num, muestras);
    setGuardando(false);
    setMsg(r.ok
      ? { ok:true, texto: publico ? "¡Rostro registrado!" : "Rostro registrado. El Biométrico ya reconoce a esta persona." }
      : { ok:false, texto:`No se pudo guardar: ${r.msg}` });
  };
  useEffect(() => { finalizarRef.current = finalizar; });

  useEffect(() => {
    if (estadoCam !== "lista") return;
    let vivo = true;
    const faceapi = faceapiRef.current;
    const video   = videoRef.current;
    const muestras = [];
    let pasoActual = 0, base = null, signoGiro = 1, signoVert = 1, quieto = 0, inicioPaso = Date.now();

    const cumple = (pose) => {
      const dy = base ? pose.yaw - base.yaw : 0;
      const dp = base ? pose.pitch - base.pitch : 0;
      switch (PASOS[pasoActual].id) {
        case "frente":  return Math.abs(pose.yaw) < 0.08;
        case "lado1":   return Math.abs(dy) > UMBRAL_GIRO;
        case "lado2":   return dy * signoGiro < -UMBRAL_GIRO;
        case "vert1":   return Math.abs(dp) > UMBRAL_VERT && Math.abs(dy) < UMBRAL_GIRO;
        case "vert2":   return dp * signoVert < -UMBRAL_VERT && Math.abs(dy) < UMBRAL_GIRO;
        case "frente2": return Math.abs(dy) < 0.05 && Math.abs(dp) < 0.03;
        default:        return false;
      }
    };

    // Toma la muestra del paso actual (huella completa del cuadro de ahora).
    const tomar = async () => {
      const r = await detectarHuella(faceapi, video);
      if (!r || r.varias || r.detection.score < 0.6) return;
      const pose = poseCara(r.landmarks);
      const id = PASOS[pasoActual].id;
      if (id === "frente") base = pose;
      // Foto para quien aprueba: en la primera muestra que salga bien.
      if (publico && !fotoRef.current) { try { fotoRef.current = fotoDeCara(video, r.detection.box); } catch { /* sin foto */ } }
      if (id === "lado1")  signoGiro = Math.sign(pose.yaw - base.yaw) || 1;
      if (id === "vert1")  signoVert = Math.sign(pose.pitch - base.pitch) || 1;
      muestras.push(r.descriptor);
      pasoActual++; quieto = 0; inicioPaso = Date.now();
      setPaso(pasoActual); setEnPosicion(false); setAyudaManual(false);
    };

    const ciclo = async () => {
      if (!vivo) return;
      try {
        if (pasoActual >= PASOS.length) { vivo = false; await finalizarRef.current(muestras); return; }
        if (manualRef.current) { manualRef.current = false; await tomar(); return; }

        const r = await detectarCara(faceapi, video);
        if (!r)       { quieto = 0; setEnPosicion(false); setAviso("Pon tu cara dentro del óvalo"); return; }
        if (r.varias) { quieto = 0; setEnPosicion(false); setAviso("Solo una persona frente a la cámara"); return; }
        const box = r.detection.box, vw = video.videoWidth || 640, vh = video.videoHeight || 480;
        const tam = box.width / vw;
        const cx = (box.x + box.width / 2) / vw, cy = (box.y + box.height / 2) / vh;
        let problema = "";
        if (tam < 0.2)       problema = "Acércate un poco";
        else if (tam > 0.75) problema = "Aléjate un poco";
        else if (Math.abs(cx - 0.5) > 0.15 || Math.abs(cy - 0.5) > 0.2) problema = "Centra tu cara en el óvalo";
        setAviso(problema);
        if (problema) { quieto = 0; setEnPosicion(false); return; }

        if (cumple(poseCara(r.landmarks))) {
          setEnPosicion(true);
          if (++quieto >= CUADROS_QUIETO) await tomar();
        } else {
          quieto = 0; setEnPosicion(false);
          if (Date.now() - inicioPaso > MS_AYUDA_MANUAL) setAyudaManual(true);
        }
      } catch (err) {
        console.error("[Registro rostro]", err);
      } finally {
        if (vivo) setTimeout(ciclo, 80);
      }
    };
    ciclo();
    return () => { vivo = false; };
  }, [estadoCam, intento, faceapiRef, videoRef]);

  const repetir = () => {
    fotoRef.current = null;
    setMsg(null); setPaso(0); setAviso(""); setEnPosicion(false); setAyudaManual(false);
    setIntento(i => i + 1);
  };

  const borrar = async () => {
    if (!window.confirm(`¿Borrar el rostro registrado de ${emp.nombre}? Tendrá que marcar con QR hasta que se registre de nuevo.`)) return;
    const r = await borrarRostro(emp.num);
    setMsg(r.ok ? { ok:true, texto:"Rostro borrado." } : { ok:false, texto:`No se pudo borrar: ${r.msg}` });
  };

  const cerrar = () => { detener(); onClose(!!msg?.ok); };

  const terminado = paso >= PASOS.length;
  const { w, h } = dim;
  const rx = w * 0.24, ry = h * 0.40;
  const progreso = (paso / PASOS.length) * 100;
  const colorAnillo = msg && !msg.ok ? "#FF6B6B" : terminado || enPosicion ? "#00C9A7" : "#845EF7";
  const instruccion = msg ? "" : terminado ? (guardando ? "Guardando…" : "") : (aviso || PASOS[paso].texto);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#1a1a2e", border:"1px solid rgba(132,94,247,0.35)", borderRadius:16, padding:20, maxWidth:440, width:"100%", maxHeight:"calc(100vh - 32px)", overflowY:"auto" }}>
        <div style={{ fontSize:14, fontWeight:800, color:"#a5b4fc", marginBottom:2 }}>🙂 Registrar rostro</div>
        <div style={{ fontSize:13, color:"white", fontWeight:700 }}>{emp.nombre}</div>
        <div style={{ fontSize:11, color: yaTiene ? "#00C9A7" : "rgba(255,255,255,0.45)", marginBottom:10 }}>
          {publico ? "Sigue las instrucciones: la cámara toma las fotos sola."
            : yaTiene ? "✓ Ya tiene rostro registrado — al terminar se reemplaza." : "Todavía no tiene rostro registrado."}
        </div>

        {errorRostros && <div style={{ fontSize:12, color:"#FF6B6B", marginBottom:10 }}>{errorRostros}</div>}
        {estadoCam === "cargando" && <div style={{ fontSize:12, color:"rgba(255,255,255,0.6)", marginBottom:10 }}>Cargando cámara y reconocimiento… (la primera vez tarda un poco)</div>}
        {cam.error && <div style={{ fontSize:12, color:"#FF6B6B", marginBottom:10 }}>{cam.error}</div>}

        <div style={{ position:"relative", maxWidth:420, margin:"0 auto", display: estadoCam === "lista" ? "block" : "none" }}>
          <video ref={videoRef} onLoadedMetadata={e => setDim({ w: e.target.videoWidth || 640, h: e.target.videoHeight || 480 })} style={estiloVideo} />
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ position:"absolute", inset:0, width:"100%", height:"100%", borderRadius:14, pointerEvents:"none" }}>
            <defs>
              <mask id="mascara-ovalo-rostro">
                <rect width={w} height={h} fill="white" />
                <ellipse cx={w/2} cy={h/2} rx={rx} ry={ry} fill="black" />
              </mask>
            </defs>
            <rect width={w} height={h} fill="rgba(12,12,30,0.62)" mask="url(#mascara-ovalo-rostro)" />
            <ellipse cx={w/2} cy={h/2} rx={rx + 8} ry={ry + 8} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={7} />
            {/* Anillo de progreso: arranca arriba (elipse con radios cruzados, rotada -90°) */}
            <ellipse cx={w/2} cy={h/2} rx={ry + 8} ry={rx + 8} fill="none" stroke={colorAnillo} strokeWidth={9}
              strokeLinecap="round" pathLength={100} strokeDasharray={`${progreso} 100`}
              transform={`rotate(-90 ${w/2} ${h/2})`} style={{ transition:"stroke-dasharray 0.35s ease, stroke 0.2s" }} />
          </svg>
        </div>

        {estadoCam === "lista" && (
          <div style={{ textAlign:"center", marginTop:12, minHeight:44 }}>
            {instruccion && <div style={{ fontSize:16, fontWeight:800, color: enPosicion ? "#00C9A7" : "white" }}>{instruccion}</div>}
            {!terminado && !msg && <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", marginTop:3 }}>Paso {paso + 1} de {PASOS.length} · sin gorra ni tapabocas, con buena luz</div>}
          </div>
        )}

        {msg && <div style={{ fontSize:13, fontWeight:700, textAlign:"center", marginTop:10, color: msg.ok ? "#00C9A7" : "#FF6B6B" }}>{msg.ok ? "✓ " : ""}{msg.texto}</div>}

        <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
          {estadoCam === "apagada" && <button onClick={iniciar} style={btnPrimario(false,false)}>📷 Activar cámara</button>}
          {ayudaManual && !terminado && !msg && (
            <button onClick={() => { manualRef.current = true; }} style={btnSecundario}>📸 No avanza — tomar esta foto</button>
          )}
          {msg && estadoCam === "lista" && !(publico && msg.ok) && <button onClick={repetir} style={btnSecundario}>🔄 {msg.ok ? "Registrar de nuevo" : "Intentar de nuevo"}</button>}
          {yaTiene && <button onClick={borrar} style={{ ...btnTablaEliminar, padding:"7px 12px" }}>🗑 Borrar rostro</button>}
          <button onClick={cerrar} style={{ ...btnSecundario, marginLeft:"auto" }}>{msg?.ok ? "Listo" : publico ? "Volver" : "Cerrar"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// KIOSCO POR ROSTRO — reconoce la cara (o el QR) y marca entrada/salida
// ═══════════════════════════════════════════════════════════════
export function KioscoRostro({ empleados, rostros, registrarEscaneo, onResultado, autoIniciar = false, onEstadoCamara }) {
  const cam = useCamaraRostro();
  const { videoRef, faceapiRef, estado: estadoCam, iniciar } = cam;
  useEffect(() => { onEstadoCamara?.(estadoCam); }, [estadoCam, onEstadoCamara]);
  // El Biométrico prende la cámara apenas se abre, como un aparato de pared.
  const yaAutoIniciado = useRef(false);
  useEffect(() => {
    if (autoIniciar && !yaAutoIniciado.current) { yaAutoIniciado.current = true; iniciar(); }
  }, [autoIniciar, iniciar]);
  const [aviso, setAviso] = useState("");       // instrucción en pantalla

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
    const canvasQr = document.createElement("canvas");
    const ultimaMarca = new Map(); // num → hora en que se marcó
    let previoNum = null;       // última identificación, aún sin confirmar
    let coincidencias = 0;      // identificaciones seguidas de la misma persona
    let pausaHasta = 0;

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

        // Primero se busca un QR de asistencia en el cuadro.
        const texto = await leerQrDeVideo(video, canvasQr);
        if (texto) {
          const num = numDeQrAsistencia(texto);
          if (!num) { setAviso("Ese QR no es de asistencia"); pausaHasta = Date.now() + 1500; return; }
          const espera = ultimaMarca.get(num);
          if (espera && Date.now() - espera < ESPERA_MISMA_PERSONA_MS) { setAviso("Ya quedaste marcado hace un momento"); return; }
          await marcar(num, "qr");
          return;
        }

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
        // Se marca apenas la misma persona sale reconocida varias veces
        // seguidas (menos de un segundo) — así un cuadro borroso o una cara
        // de paso no marca a nadie por error.
        coincidencias = previoNum === id.num ? coincidencias + 1 : 1;
        previoNum = id.num;
        if (coincidencias < COINCIDENCIAS_PARA_MARCAR) { setAviso("Reconociendo…"); return; }
        previoNum = null; coincidencias = 0;
        await marcar(id.num, "rostro");
      } catch (err) {
        console.error("[Asistencia rostro]", err);
      } finally {
        if (vivo) setTimeout(paso, previoNum ? 60 : 200);
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
        <div style={{ marginTop:12, fontSize:15, fontWeight:800, color:"rgba(255,255,255,0.75)" }}>{aviso}</div>
      )}
    </div>
  );
}
