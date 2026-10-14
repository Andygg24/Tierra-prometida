import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase.js";

const inicioDelDia = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fechaLocalISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const nombreUsuarioSesion = () => {
  try { return JSON.parse(localStorage.getItem("tp_session"))?.nombre || ""; } catch { return ""; }
};

const rowToEvento = (r) => ({
  id: r.id, sesionId: r.sesion_id || null, empNum: r.emp_num, tipo: r.tipo, hora: r.hora, via: r.via || "qr",
});

// Inicio de la jornada actual del Biométrico, guardado en `configuracion`
// (clave/valor jsonb) para que todos los dispositivos usen el mismo corte.
// "Cerrar día" lo mueve a ahora. Si nunca se ha cerrado un día, la jornada
// arranca a la medianoche de hoy.
const CLAVE_JORNADA = "biometrico_jornada";

// Biométrico: registro de entradas/salidas de la jornada por rostro o QR,
// haya o no un proceso abierto. Si hay sesión activa, el registro pasa por
// `registrarEscaneo` de la sesión (para que cuente en el grupo y el pago del
// contenedor); si no, queda como movimiento de la jornada sin contenedor.
export function useBiometrico({ asisQR }) {
  const [eventosHoy, setEventosHoy] = useState([]);
  const [sesionesHoy, setSesionesHoy] = useState({}); // id → { contenedorId, turno }
  const [error, setError] = useState("");
  const [inicioJornada, setInicioJornada] = useState(() => inicioDelDia().toISOString());
  const inicioRef = useRef(inicioJornada);

  const leerInicioJornada = async () => {
    const { data } = await supabase.from("configuracion").select("valor").eq("clave", CLAVE_JORNADA).maybeSingle();
    const inicio = data?.valor?.inicio || inicioDelDia().toISOString();
    inicioRef.current = inicio;
    setInicioJornada(inicio);
    return inicio;
  };

  const cargar = useCallback(async () => {
    const inicio = await leerInicioJornada();
    const { data, error: err } = await supabase.from("asistencia_eventos").select("*")
      .gte("hora", inicio).order("hora", { ascending: true });
    if (err) { setError(`No se pudieron cargar los movimientos: ${err.message}`); return; }
    const evs = (data || []).map(rowToEvento);
    setEventosHoy(evs);
    setError("");
    const ids = [...new Set(evs.map(e => e.sesionId).filter(Boolean))];
    if (ids.length) {
      const { data: ses } = await supabase.from("asistencia_sesiones").select("id,contenedor_id,turno").in("id", ids);
      setSesionesHoy(Object.fromEntries((ses || []).map(s => [s.id, { contenedorId: s.contenedor_id, turno: s.turno }])));
    }
  }, []);

  useEffect(() => {
    cargar();
    const ch = supabase.channel(`biometrico-eventos-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "asistencia_eventos" }, cargar)
      // Si otro dispositivo cierra el día, este también arranca de cero.
      .on("postgres_changes", { event: "*", schema: "public", table: "configuracion", filter: `clave=eq.${CLAVE_JORNADA}` }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cargar]);

  const { sesionActiva, registrarEscaneo } = asisQR;

  const registrar = useCallback(async (num, via = "rostro") => {
    if (sesionActiva) {
      const r = await registrarEscaneo(num, via);
      if (r.ok) cargar();
      return r;
    }

    const { data: emp } = await supabase.from("empleados").select("num,nombre,activo").eq("num", num).maybeSingle();
    if (!emp) return { ok: false, msg: "Persona no encontrada en Personal" };
    if (!emp.activo) return { ok: false, msg: `${emp.nombre} está inactivo` };

    const ahora = new Date();
    const { data: ultimo, error: errUlt } = await supabase.from("asistencia_eventos").select("tipo")
      .eq("emp_num", num).gte("hora", inicioRef.current)
      .order("hora", { ascending: false }).limit(1).maybeSingle();
    if (errUlt) return { ok: false, msg: errUlt.message };
    const esPrimeraVez = !ultimo;
    const tipo = (esPrimeraVez || ultimo.tipo === "salida") ? "entrada" : "salida";

    const nuevo = { id: Date.now(), sesion_id: null, emp_num: num, tipo, hora: ahora.toISOString(), via };
    const { error: errIns } = await supabase.from("asistencia_eventos").insert(nuevo);
    if (errIns) {
      return { ok: false, msg: `No se pudo guardar el movimiento (¿corriste supabase-asistencia-rostros-migration.sql?): ${errIns.message}` };
    }
    setEventosHoy(prev => [...prev, rowToEvento(nuevo)]);

    // Primera entrada de la jornada → queda "Presente" en la Asistencia Manual.
    if (esPrimeraVez) {
      await supabase.from("asistencia").upsert({
        fecha: fechaLocalISO(ahora), emp_nombre: emp.nombre, estado: "P", hora_registro: ahora.toISOString(),
      }, { onConflict: "fecha,emp_nombre", ignoreDuplicates: true }); // no pisa lo que ya se marcó a mano
    }
    return { ok: true, nombre: emp.nombre, hora: ahora, tipo, yaEstaba: !esPrimeraVez };
  }, [sesionActiva, registrarEscaneo, cargar]);

  // Cierra la jornada: desde ahora el Biométrico arranca un registro nuevo
  // (lista vacía, y el próximo escaneo de cada persona vuelve a ser entrada).
  const cerrarDia = useCallback(async () => {
    const ahora = new Date().toISOString();
    const { error: err } = await supabase.from("configuracion").upsert({
      clave: CLAVE_JORNADA,
      valor: { inicio: ahora, abiertaPor: nombreUsuarioSesion(), anterior: { inicio: inicioRef.current, cierre: ahora } },
      updated_at: ahora,
    }, { onConflict: "clave" });
    if (err) return { ok: false, msg: err.message };
    setSesionesHoy({});
    await cargar();
    return { ok: true };
  }, [cargar]);

  return { eventosHoy, sesionesHoy, inicioJornada, error, registrar, cerrarDia, recargar: cargar };
}
