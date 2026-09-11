import { useState, useRef, useEffect } from "react";
import { supabase } from "../supabase.js";

// Chat flotante de Jarvis — icono abajo a la derecha, disponible en toda la
// app. Responde preguntas frecuentes de forma 100% local (sin IA externa, sin
// costo ni API key): un motor de reglas por palabras clave que combina datos
// reales de Supabase (nunca inventa cifras) con respuestas fijas sobre cómo
// usar el sistema.

let _jarvisEstiloInyectado = false;
function inyectarEstiloJarvis() {
  if (_jarvisEstiloInyectado) return;
  _jarvisEstiloInyectado = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes jarvisPulse { 0%,100%{ box-shadow:0 8px 24px rgba(99,102,241,0.5), 0 0 0 0 rgba(132,94,247,0.5) } 50%{ box-shadow:0 8px 24px rgba(99,102,241,0.5), 0 0 0 10px rgba(132,94,247,0) } }
    @keyframes jarvisOpen  { 0%{ opacity:0; transform:translateY(14px) scale(0.96) } 100%{ opacity:1; transform:translateY(0) scale(1) } }
    @keyframes jarvisDot   { 0%,80%,100%{ opacity:0.25 } 40%{ opacity:1 } }
  `;
  document.head.appendChild(s);
}

// Trae un resumen liviano y ACTUAL de Supabase — todo lo que Jarvis puede
// citar sale de aquí. Si algo no está en este objeto, Jarvis debe decir que
// no lo sabe en vez de inventarlo (regla estricta del negocio).
async function construirContextoNegocio() {
  const [conts, receps, inv, bookings] = await Promise.all([
    supabase.from("contenedores").select("num_contenedor, fecha, fecha_programacion, estado, proveedor, producto")
      .order("fecha", { ascending: false }).limit(15),
    supabase.from("recepciones").select("fecha, tipo, proveedor, total")
      .order("fecha", { ascending: false }).limit(20),
    supabase.from("inventario").select("nombre, cant, unidad, minimo, categoria").limit(300),
    supabase.from("logistica_bookings")
      .select("numero_booking, numero_contenedor, naviera, estado, fecha_zarpe, fecha_llegada_destino")
      .order("id", { ascending: false }).limit(20),
  ]);

  const inventarioBajoStock = (inv.data || []).filter(i =>
    i.categoria === "Herramientas" ? Number(i.cant) === 0 : Number(i.cant) <= Number(i.minimo || 0)
  );

  return {
    fechaHoraConsulta: new Date().toISOString(),
    contenedoresRecientes: conts.data || [],
    recepcionesRecientes: receps.data || [],
    inventarioBajoStock,
    bookingsRecientes: bookings.data || [],
  };
}

const norm = (s) => (s || "")
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, ""); // quita tildes para comparar

const kg = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");

function fechaLocalISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const fechaLocalHoy = () => fechaLocalISO();

// ── Reglas de respuesta — la primera que haga match (por palabras clave)
// gana. Las que usan `ctx` responden con datos reales de Supabase; el resto
// son respuestas fijas sobre cómo usar el sistema.
// Palabras que delatan una pregunta de "cómo se hace X" — cuando aparecen,
// las reglas de guía de uso deben ganarle a las de datos en vivo (si no,
// "¿cómo creo un booking?" caería en la regla de "bookings activos" solo
// porque menciona la palabra "booking").
const ES_ACCION = /(como|cómo|donde|dónde|forma de|manera de|registr|crear|creo|agregar|agrego|nuevo|nueva|generar|marcar|verific|calcul|cambiar|funciona|para que|para qué)/;

const REGLAS = [
  {
    test: (q) => /(hola|buenas|buenos dias|buenas tardes|buenas noches|quien eres|que eres)/.test(q),
    responder: () => "👋 ¡Hola! Soy Jarvis, el asistente del sistema de Tierra Prometida. Puedo ayudarte con datos rápidos (contenedores, recepciones, inventario, bookings) o explicarte cómo usar alguna sección. ¿Qué necesitas?",
  },

  // ── Guías de uso (van primero: si la pregunta trae un verbo de acción,
  // gana la explicación de "cómo se hace" sobre la de datos en vivo) ──
  {
    test: (q) => /pedido/.test(q) && ES_ACCION.test(q),
    responder: () => "Para registrar un pedido ve a Inventario → pestaña Pedidos → '+ Nuevo Pedido', elige el ítem, la cantidad y la prioridad, y guarda.",
  },
  {
    test: (q) => /estiba/.test(q) && /(verific|escane|usad)/.test(q),
    responder: () => "En Recepción → pestaña 'Verificación de Estibas' puedes escanear con la cámara el QR de la tirilla de cada estiba cuando se use, y así se marca automáticamente como usada.",
  },
  {
    test: (q) => /recepcion/.test(q) && ES_ACCION.test(q),
    responder: () => "Para registrar una recepción ve al módulo Recepción → '+ Nueva' → completa los datos del transporte y agrega cada estiba con su peso bruto (recuerda tomar la foto de evidencia del peso si eres Operario) → Guardar.",
  },
  {
    test: (q) => /(caja menor|abono)/.test(q) && /abono/.test(q),
    responder: () => "Los abonos (recargas de la empresa a la caja) se registran en Caja Menor → pestaña Abonos → '+ Nuevo Abono'.",
  },
  {
    test: (q) => /(caja menor|factura)/.test(q) && ES_ACCION.test(q),
    responder: () => "Para registrar un gasto ve a Caja Menor → pestaña Facturas → '+ Nueva Factura' → llena los datos y adjunta la(s) foto(s) de la factura.",
  },
  {
    test: (q) => /canastilla/.test(q) && (ES_ACCION.test(q) || /(ronda|movimiento)/.test(q)),
    responder: () => "Las canastillas se controlan en Inventario → pestaña Canastillas, donde se registran las rondas y movimientos de entrada/salida por lote.",
  },
  {
    test: (q) => /contenedor/.test(q) && ES_ACCION.test(q) && /(registr|crear|creo|agregar|agrego|nuevo|nueva)/.test(q),
    responder: () => "Para registrar un contenedor ve a Contenedores → '➕ Nuevo' → llena N° de contenedor, proveedor y demás datos → Guardar. También puedes cambiar el número después con el ✏️ junto al número en la tarjeta.",
  },
  {
    test: (q) => /booking/.test(q) && ES_ACCION.test(q),
    responder: () => "Para crear un booking ve a Logística → '+ Nuevo' → llena número de booking o contenedor, naviera y las fechas clave. Desde ahí también se ve la línea de tiempo de hitos y las alertas de días libres/cutoffs.",
  },
  {
    test: (q) => /(empleado|personal)/.test(q) && ES_ACCION.test(q),
    responder: () => "Para agregar un empleado ve al módulo Personal → '+ Agregar' → llena sus datos (documento, contacto, área) → Guardar. Ahí también puedes editar fichas o enviar un mensaje por WhatsApp.",
  },
  {
    test: (q) => /informe/.test(q) && ES_ACCION.test(q),
    responder: () => "Los informes se generan desde cada módulo (Contenedores, Recepción, Rendimiento, etc.) con su botón de informe/descargar — se abre una vista previa en HTML que puedes descargar o imprimir. El módulo Informes además permite subir y guardar archivos (Word, PDF, HTML, CSV) en la nube.",
  },
  {
    test: (q) => /asistencia/.test(q) && ES_ACCION.test(q),
    responder: () => "La asistencia se marca desde el módulo Asistencia, eligiendo el día y el estado de cada empleado (✅ Presente, ❌ Ausente, ⏰ Tardanza, 📋 Licencia, 🎉 Festivo). Hay un botón para marcar a todos igual de una vez.",
  },
  {
    test: (q) => /(carta.*temperatura|proforma|isf|documento.*exportacion|exportacion.*documento)/.test(q),
    responder: () => "Esos documentos de exportación (Carta de Temperatura, Factura Proforma, ISF Template) se generan desde el módulo Exportación — llenas el formulario una vez y se pre-llenan automáticamente, listos para imprimir o descargar en PDF.",
  },
  {
    test: (q) => /dex/.test(q) || (/control expo/.test(q) && ES_ACCION.test(q)),
    responder: () => "En Control Expo puedes ver el estado de cada documento DEX (Pendiente, Radicado, Cancelado) y marcarlo como verificado con un clic; también filtra por fecha y ve el valor en USD.",
  },
  {
    test: (q) => /nomina/.test(q) && ES_ACCION.test(q),
    responder: () => "La nómina se calcula por contenedor descargado y por turnos día/noche, según los parámetros configurados en Configuración → Nómina. Desde el módulo Nómina puedes ver y descargar el reporte completo con los pagos por Nequi/Bancolombia.",
  },
  {
    test: (q) => /(usuario|permiso)/.test(q) && ES_ACCION.test(q),
    responder: () => "Los usuarios y sus permisos por módulo se administran en Configuración → Usuarios: ahí agregas una persona con su cédula y rol (Owner, Administrador, Supervisor u Operario) y eliges a qué módulos tiene acceso.",
  },
  {
    test: (q) => /estadistica/.test(q) && ES_ACCION.test(q),
    responder: () => "El módulo Estadísticas muestra KPIs en tiempo real: distribución de documentos, empleados por área, gastos operativos y una nómina base estimada, para tener una vista general rápida del negocio.",
  },
  {
    test: (q) => /(modulo|seccion)/.test(q) && /(hay|tiene|existe|cuales)/.test(q),
    responder: () => "El sistema tiene estos módulos: Inicio, Logística, Personal, Contenedores, Recepción, Inventario (con Canastillas y Pedidos), Nómina, Informes, Asistencia, Exportación, Estadísticas, Control Expo, Caja Menor y Configuración.",
  },

  // ── Datos en vivo (Supabase) ──
  {
    test: (q) => /contenedor/.test(q) && /(proceso|activo|cuant)/.test(q),
    responder: (ctx) => {
      const enProceso = ctx.contenedoresRecientes.filter(c => c.estado === "En proceso");
      if (!enProceso.length) return "No tengo ningún contenedor marcado como 'En proceso' en este momento (según los últimos registros que veo).";
      return `Ahora mismo hay ${enProceso.length} contenedor${enProceso.length > 1 ? "es" : ""} en proceso: ${enProceso.map(c => c.num_contenedor).join(", ")}.`;
    },
  },
  {
    test: (q) => /contenedor/.test(q) && /(hoy|programad)/.test(q),
    responder: (ctx) => {
      const hoy = fechaLocalHoy();
      // Usa la fecha de programación si se llenó; si no, cae a la fecha
      // general del contenedor (así no se rompe para contenedores viejos
      // que nunca tuvieron ese campo).
      const deHoy = ctx.contenedoresRecientes.filter(c => (c.fecha_programacion || c.fecha) === hoy);
      if (!deHoy.length) return "No veo ningún contenedor programado para hoy en el sistema.";
      return `Para hoy tienes programado: ${deHoy.map(c => c.num_contenedor).join(", ")}.`;
    },
  },
  {
    test: (q) => /contenedor/.test(q) && /(ultimo|reciente)/.test(q),
    responder: (ctx) => {
      const ult = ctx.contenedoresRecientes[0];
      if (!ult) return "No tengo contenedores registrados todavía.";
      return `El contenedor más reciente es ${ult.num_contenedor} (${ult.fecha}), estado: ${ult.estado}.`;
    },
  },
  {
    // Los kilos de limón ahora solo se consultan por rango de fechas (más
    // flexible que preguntas fijas de "ayer"/"hoy") — se redirige a esa opción.
    test: (q) => /(recepcion|limon|fruta)/.test(q) && !ES_ACCION.test(q),
    responder: () => 'Para ver los kilos de limón recibidos, usa la opción "📅 Kilos de limón en un rango de fechas..." de las preguntas sugeridas — ahí eliges el rango exacto que necesites (aunque sea de varios días).',
  },
  {
    test: (q) => /(inventario|insumo|stock)/.test(q) && /(bajo|falta|comprar|agotad)/.test(q),
    responder: (ctx) => {
      if (!ctx.inventarioBajoStock.length) return "No hay ningún ítem de inventario bajo el mínimo en este momento. 👌";
      const lista = ctx.inventarioBajoStock.slice(0, 8).map(i => `${i.nombre} (${i.cant} ${i.unidad})`).join(", ");
      return `Tienes ${ctx.inventarioBajoStock.length} ítem${ctx.inventarioBajoStock.length > 1 ? "s" : ""} en stock bajo: ${lista}${ctx.inventarioBajoStock.length > 8 ? "…" : ""}.`;
    },
  },
  {
    test: (q) => /(booking|naviera|logistica)/.test(q),
    responder: (ctx) => {
      if (!ctx.bookingsRecientes.length) return "No tengo bookings registrados en este momento.";
      const pendientes = ctx.bookingsRecientes.filter(b => b.estado !== "Finalizado" && b.estado !== "Cancelado");
      if (!pendientes.length) return "Todos los bookings recientes están Finalizados o Cancelados.";
      const lista = pendientes.slice(0, 6).map(b => `${b.numero_contenedor || b.numero_booking || "(sin número)"} — ${b.estado}`).join(", ");
      return `Bookings activos: ${lista}${pendientes.length > 6 ? "…" : ""}.`;
    },
  },

  {
    test: (q) => /(gracias|thank)/.test(q),
    responder: () => "¡Con gusto! Aquí estoy si necesitas algo más. 🍋",
  },
];

function responderLocal(pregunta, contexto) {
  const q = norm(pregunta);
  const regla = REGLAS.find(r => r.test(q));
  if (regla) return regla.responder(contexto || {});
  return "No tengo una respuesta preparada para eso todavía. Puedo ayudarte con datos en vivo (contenedores, recepciones, inventario, bookings) o con cómo usar cualquier módulo: Personal, Contenedores, Recepción, Inventario, Nómina, Informes, Asistencia, Exportación, Logística, Control Expo o Caja Menor.";
}

// Preguntas listas para tocar — cada una calza con una regla real de arriba,
// así siempre dan una respuesta útil (nunca caen en el mensaje de "no sé").
const PREGUNTAS_SUGERIDAS = [
  "¿Cuántos contenedores hay en proceso?",
  "¿Qué contenedor está programado para hoy?",
  "¿Qué hay bajo en inventario?",
  "¿Qué bookings están activos?",
  "¿Cómo registro una recepción?",
  "¿Cómo registro un pedido?",
  "¿Cómo agrego un contenedor nuevo?",
  "¿Cómo registro un gasto en Caja Menor?",
  "¿Qué módulos tiene el sistema?",
];

const fmtFechaCorta = (f) => new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

export default function JarvisChat({ usuario }) {
  const [abierto,   setAbierto]   = useState(false);
  const [mensajes,  setMensajes]  = useState([]);
  const [input,     setInput]     = useState("");
  const [cargando,  setCargando]  = useState(false);
  const [error,     setError]     = useState("");
  const [contexto,  setContexto]  = useState(null);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(true);
  const [mostrarRango, setMostrarRango] = useState(false);
  const [rangoDesde, setRangoDesde] = useState("");
  const [rangoHasta, setRangoHasta] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => { inyectarEstiloJarvis(); }, []);

  // Refresca el contexto de datos cada vez que se abre el chat, para que
  // las respuestas reflejen lo más reciente posible sin consultar Supabase
  // en cada mensaje.
  useEffect(() => {
    if (!abierto) return;
    construirContextoNegocio().then(setContexto).catch(() => setContexto(null));
  }, [abierto]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [mensajes, cargando]);

  if (!usuario) return null;

  const preguntar = async (pregunta) => {
    if (!pregunta.trim() || cargando) return;
    setError("");
    setMostrarSugerencias(false);
    setMensajes(m => [...m, { role: "user", content: pregunta }]);
    setCargando(true);
    try {
      const ctx = contexto || await construirContextoNegocio();
      if (!contexto) setContexto(ctx);
      const respuesta = responderLocal(pregunta, ctx);
      // Pequeña pausa artificial — sin ella la respuesta instantánea se ve
      // más como un formulario que como una conversación.
      await new Promise(r => setTimeout(r, 350));
      setMensajes(m => [...m, { role: "assistant", content: respuesta }]);
    } catch {
      setError("No pude consultar los datos en este momento. Intenta de nuevo.");
    }
    setCargando(false);
  };

  const enviar = () => {
    const pregunta = input.trim();
    if (!pregunta) return;
    setInput("");
    preguntar(pregunta);
  };

  const abrirRango = () => {
    setMostrarSugerencias(false);
    setMostrarRango(true);
  };
  const cancelarRango = () => {
    setMostrarRango(false);
    setRangoDesde(""); setRangoHasta("");
    setMostrarSugerencias(true);
  };

  // Consulta directa a Supabase (no usa el contexto de los últimos 20
  // registros) — así el rango funciona sin importar cuántos días abarque.
  const consultarRango = async () => {
    if (!rangoDesde || !rangoHasta || cargando) return;
    if (rangoDesde > rangoHasta) { setError("La fecha 'desde' no puede ser posterior a la fecha 'hasta'."); return; }
    setError("");
    const desde = rangoDesde, hasta = rangoHasta;
    setMostrarRango(false);
    setMostrarSugerencias(false);
    setMensajes(m => [...m, { role: "user", content: `¿Cuántos kilos de limón se recibieron entre ${fmtFechaCorta(desde)} y ${fmtFechaCorta(hasta)}?` }]);
    setCargando(true);
    try {
      const { data, error: errSb } = await supabase
        .from("recepciones").select("fecha, total")
        .eq("tipo", "entrada").gte("fecha", desde).lte("fecha", hasta);
      if (errSb) throw errSb;
      const total = (data || []).reduce((s, r) => s + (Number(r.total) || 0), 0);
      await new Promise(r => setTimeout(r, 350));
      const respuesta = data && data.length
        ? `Entre ${fmtFechaCorta(desde)} y ${fmtFechaCorta(hasta)} se recibieron ${kg(total)} kg de limón, en ${data.length} recepción${data.length > 1 ? "es" : ""}.`
        : `No tengo recepciones de entrada registradas entre ${fmtFechaCorta(desde)} y ${fmtFechaCorta(hasta)}.`;
      setMensajes(m => [...m, { role: "assistant", content: respuesta }]);
    } catch {
      setError("No pude consultar ese rango de fechas. Intenta de nuevo.");
    }
    setRangoDesde(""); setRangoHasta("");
    setCargando(false);
  };

  return (
    <>
      {/* ── Panel del chat ── */}
      {abierto && (
        <div style={{
          position: "fixed", bottom: 88, right: 16, width: "min(360px, calc(100vw - 32px))", height: "min(500px, calc(100vh - 140px))",
          background: "linear-gradient(180deg,#1b1730,#13111f)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16, boxShadow: "0 16px 48px rgba(0,0,0,0.55)", display: "flex", flexDirection: "column",
          overflow: "hidden", zIndex: 99999, animation: "jarvisOpen 0.22s ease-out",
        }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.03)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🤖</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "white" }}>Jarvis</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Asistente de Tierra Prometida</div>
              </div>
            </div>
            <button onClick={() => setAbierto(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 16, padding: 4 }}>✕</button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {mensajes.length === 0 && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", textAlign: "center", margin: "16px 0 4px", lineHeight: 1.5 }}>
                👋 Hola{usuario?.nombre ? `, ${usuario.nombre.split(" ")[0]}` : ""}. Soy Jarvis.<br />
                Toca una pregunta o escribe la tuya.
              </div>
            )}
            {mensajes.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%",
                background: m.role === "user" ? "linear-gradient(135deg,#845EF7,#6366F1)" : "rgba(255,255,255,0.07)",
                color: "white", borderRadius: 12, padding: "8px 12px", fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap",
              }}>
                {m.content}
              </div>
            ))}
            {cargando && (
              <div style={{ alignSelf: "flex-start", fontSize: 14, color: "rgba(255,255,255,0.4)", padding: "4px 12px" }}>
                <span style={{ animation: "jarvisDot 1.4s infinite" }}>●</span>{" "}
                <span style={{ animation: "jarvisDot 1.4s infinite 0.2s" }}>●</span>{" "}
                <span style={{ animation: "jarvisDot 1.4s infinite 0.4s" }}>●</span>
              </div>
            )}
            {error && (
              <div style={{ alignSelf: "flex-start", maxWidth: "90%", fontSize: 11, color: "#FF6B6B", background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.25)", borderRadius: 8, padding: "6px 10px" }}>
                ⚠️ {error}
              </div>
            )}

            {/* Preguntas sugeridas — verticales, se muestran al abrir el chat
                y cada vez que se toca "Hacer otra pregunta" ── */}
            {mostrarSugerencias && !cargando && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {PREGUNTAS_SUGERIDAS.map((p, i) => (
                  <button key={i} onClick={() => preguntar(p)} style={{
                    textAlign: "left", background: "rgba(132,94,247,0.08)", border: "1px solid rgba(132,94,247,0.25)",
                    borderRadius: 10, padding: "8px 12px", color: "#c9c0f5", fontSize: 11.5, cursor: "pointer",
                    fontFamily: "inherit",
                  }}>
                    {p}
                  </button>
                ))}
                <button onClick={abrirRango} style={{
                  textAlign: "left", background: "rgba(0,201,167,0.08)", border: "1px solid rgba(0,201,167,0.3)",
                  borderRadius: 10, padding: "8px 12px", color: "#5eead4", fontSize: 11.5, cursor: "pointer",
                  fontFamily: "inherit", fontWeight: 700,
                }}>
                  📅 Kilos de limón en un rango de fechas...
                </button>
              </div>
            )}

            {/* Mini-formulario de rango de fechas — para consultas de más de
                un par de días (ayer/hoy no alcanzan) ── */}
            {mostrarRango && (
              <div style={{ background: "rgba(0,201,167,0.06)", border: "1px solid rgba(0,201,167,0.25)", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                <div style={{ fontSize: 11, color: "#5eead4", fontWeight: 700 }}>📅 Kilos de limón entre dos fechas</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="date" value={rangoDesde} onChange={e => setRangoDesde(e.target.value)}
                    style={{ flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7, padding: "6px 8px", color: "white", fontSize: 11, fontFamily: "inherit", minWidth: 0 }} />
                  <input type="date" value={rangoHasta} onChange={e => setRangoHasta(e.target.value)}
                    style={{ flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7, padding: "6px 8px", color: "white", fontSize: 11, fontFamily: "inherit", minWidth: 0 }} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={consultarRango} disabled={!rangoDesde || !rangoHasta} style={{
                    flex: 1, background: "linear-gradient(135deg,#00C9A7,#0EA5E9)", border: "none", borderRadius: 7, color: "white",
                    padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: !rangoDesde || !rangoHasta ? "default" : "pointer",
                    opacity: !rangoDesde || !rangoHasta ? 0.5 : 1, fontFamily: "inherit",
                  }}>Consultar</button>
                  <button onClick={cancelarRango} style={{
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7,
                    color: "rgba(255,255,255,0.6)", padding: "6px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                  }}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Botón para volver a ver las preguntas sugeridas — reemplaza la
                lista mientras hay una respuesta reciente en pantalla ── */}
            {!mostrarSugerencias && !mostrarRango && !cargando && mensajes.length > 0 && (
              <button onClick={() => setMostrarSugerencias(true)} style={{
                alignSelf: "center", marginTop: 4, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 20, padding: "6px 14px", color: "rgba(255,255,255,0.6)", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
              }}>
                💬 Hacer otra pregunta
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !cargando) enviar(); }}
              placeholder="Escribe tu pregunta..." disabled={cargando}
              style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 10px", color: "white", fontSize: 12, fontFamily: "inherit", minWidth: 0 }}
            />
            <button onClick={enviar} disabled={cargando || !input.trim()} style={{
              background: "linear-gradient(135deg,#845EF7,#6366F1)", border: "none", borderRadius: 8, color: "white",
              padding: "0 14px", cursor: cargando || !input.trim() ? "default" : "pointer", fontSize: 15,
              opacity: cargando || !input.trim() ? 0.5 : 1, flexShrink: 0,
            }}>➤</button>
          </div>
        </div>
      )}

      {/* ── Botón flotante ── */}
      <button
        onClick={() => setAbierto(o => !o)}
        title="Jarvis"
        style={{
          position: "fixed", bottom: 20, right: 20, width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg,#845EF7,#6366F1)", border: "none", color: "white",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, cursor: "pointer",
          zIndex: 99998, animation: abierto ? "none" : "jarvisPulse 2.6s ease-in-out infinite",
        }}
      >
        {abierto ? "✕" : "🤖"}
      </button>
    </>
  );
}
