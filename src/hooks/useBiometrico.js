import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase.js";

const inicioDelDia = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fechaLocalISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const rowToEvento = (r) => ({
  id: r.id, sesionId: r.sesion_id || null, empNum: r.emp_num, tipo: r.tipo, hora: r.hora, via: r.via || "qr",
});

// Biométrico: registro de entradas/salidas del día por rostro, haya o no un
// proceso abierto. Si hay sesión activa, el registro pasa por
// `registrarEscaneo` de la sesión (para que cuente en el grupo y el pago del
// contenedor); si no, queda como movimiento del día sin contenedor.
export function useBiometrico({ asisQR }) {
  const [eventosHoy, setEventosHoy] = useState([]);
  const [sesionesHoy, setSesionesHoy] = useState({}); // id → { contenedorId, turno }
  const [error, setError] = useState("");
  const [dia, setDia] = useState(() => fechaLocalISO());
  const diaRef = useRef(dia);

  const cargar = useCallback(async () => {
    const hoy = fechaLocalISO();
    if (hoy !== diaRef.current) { diaRef.current = hoy; setDia(hoy); }
    const { data, error: err } = await supabase.from("asistencia_eventos").select("*")
      .gte("hora", inicioDelDia().toISOString()).order("hora", { ascending: true });
    if (err) { setError(`No se pudieron cargar los movimientos de hoy: ${err.message}`); return; }
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
      .subscribe();
    // Al pasar la medianoche la lista arranca de cero.
    const t = setInterval(() => { if (fechaLocalISO() !== diaRef.current) cargar(); }, 60_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
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
      .eq("emp_num", num).gte("hora", inicioDelDia(ahora).toISOString())
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

    // Primera entrada del día → queda "Presente" en la Asistencia Manual.
    if (esPrimeraVez) {
      await supabase.from("asistencia").upsert({
        fecha: fechaLocalISO(ahora), emp_nombre: emp.nombre, estado: "P", hora_registro: ahora.toISOString(),
      }, { onConflict: "fecha,emp_nombre", ignoreDuplicates: true }); // no pisa lo que ya se marcó a mano
    }
    return { ok: true, nombre: emp.nombre, hora: ahora, tipo, yaEstaba: !esPrimeraVez };
  }, [sesionActiva, registrarEscaneo, cargar]);

  return { eventosHoy, sesionesHoy, dia, error, registrar, recargar: cargar };
}
