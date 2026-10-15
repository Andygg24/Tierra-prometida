import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

// Registro en línea (página pública /registro): el trabajador busca su
// documento y registra su rostro desde su celular; si no está en Personal,
// llena sus datos. Todo queda pendiente hasta que se aprueba en Personal
// (ver supabase-registro-en-linea-migration.sql).

const FALTA_SQL = "El registro en línea todavía no está habilitado. Avísale a la oficina.";
const esFaltaColumna = (err) => /column|does not exist|schema cache/i.test(err?.message || "");

export const limpiarDocumento = (txt) => (txt || "").replace(/[\s.,-]/g, "").toUpperCase();

// ── Página pública ──────────────────────────────────────────────

// → { ok, emp: { num, nombre, activo, solicitud } | null }
export async function buscarDocumento(num) {
  const { data, error } = await supabase.from("empleados")
    .select("num,nombre,activo,solicitud_registro").eq("num", num).maybeSingle();
  if (error) return { ok: false, msg: esFaltaColumna(error) ? FALTA_SQL : error.message };
  return { ok: true, emp: data ? { num: data.num, nombre: data.nombre, activo: data.activo, solicitud: data.solicitud_registro } : null };
}

// Persona que no está en Personal: queda inactiva con solicitud 'nuevo'.
export async function crearSolicitudNuevo({ nombre, doc, num, tel }) {
  const { error } = await supabase.from("empleados").insert({
    nombre, doc, num, tel, area: "", banco: "Nequi", cuenta: "",
    activo: false, solicitud_registro: "nuevo", solicitud_fecha: new Date().toISOString(),
  });
  if (error) {
    if (error.code === "23505") return { ok: false, msg: "Ese documento ya está registrado. Vuelve atrás y búscalo." };
    return { ok: false, msg: esFaltaColumna(error) ? FALTA_SQL : error.message };
  }
  return { ok: true };
}

// Persona que estuvo y está inactiva: pide volver (se aprueba en Personal).
export async function crearSolicitudReingreso(num, tel) {
  const { error } = await supabase.from("empleados").update({
    solicitud_registro: "reingreso", solicitud_fecha: new Date().toISOString(), ...(tel ? { tel } : {}),
  }).eq("num", num).eq("activo", false);
  if (error) return { ok: false, msg: esFaltaColumna(error) ? FALTA_SQL : error.message };
  return { ok: true };
}

// Guarda el rostro como pendiente (reemplaza un pendiente anterior; el
// aprobado, si hay, sigue funcionando hasta que se apruebe el nuevo).
export async function guardarRostroPendiente(num, descriptores, foto) {
  const { error: errDel } = await supabase.from("empleados_rostros").delete().eq("emp_num", num).eq("aprobado", false);
  if (errDel) return { ok: false, msg: esFaltaColumna(errDel) ? FALTA_SQL : errDel.message };
  const base = Date.now();
  const rows = descriptores.map((d, i) => ({
    id: base + i, emp_num: num, aprobado: false, foto: i === 0 ? foto : null,
    descriptor: Array.from(d, v => Math.round(v * 1e5) / 1e5),
    creado_por: "Registro en línea",
  }));
  const { error } = await supabase.from("empleados_rostros").insert(rows);
  if (error) return { ok: false, msg: error.message };
  return { ok: true };
}

// ── Personal: solicitudes pendientes ────────────────────────────

const nombreUsuarioSesion = () => {
  try { return JSON.parse(localStorage.getItem("tp_session"))?.nombre || ""; } catch { return ""; }
};

// [{ num, nombre, doc, tel, tipo: 'nuevo'|'reingreso'|'rostro', fecha, foto, descriptores }]
export function useSolicitudesRegistro() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const [{ data: emps, error: e1 }, { data: ros, error: e2 }] = await Promise.all([
      supabase.from("empleados").select("num,nombre,doc,tel,solicitud_registro,solicitud_fecha").not("solicitud_registro", "is", null),
      supabase.from("empleados_rostros").select("id,emp_num,descriptor,foto,created_at").eq("aprobado", false).order("id"),
    ]);
    const err = e1 || e2;
    if (err) {
      // Sin la migración no hay solicitudes posibles: no se muestra nada.
      setSolicitudes([]); setError(esFaltaColumna(err) ? "" : err.message); return;
    }
    const porNum = new Map((emps || []).map(e => [e.num, {
      num: e.num, nombre: e.nombre, doc: e.doc, tel: e.tel, tipo: e.solicitud_registro, fecha: e.solicitud_fecha, foto: null, descriptores: [],
    }]));
    const faltan = [...new Set((ros || []).map(r => r.emp_num).filter(n => !porNum.has(n)))];
    if (faltan.length) {
      const { data: otros } = await supabase.from("empleados").select("num,nombre,doc,tel").in("num", faltan);
      (otros || []).forEach(e => porNum.set(e.num, { num: e.num, nombre: e.nombre, doc: e.doc, tel: e.tel, tipo: "rostro", fecha: null, foto: null, descriptores: [] }));
    }
    (ros || []).forEach(r => {
      const s = porNum.get(r.emp_num);
      if (!s) return;
      if (r.foto) s.foto = r.foto;
      if (Array.isArray(r.descriptor)) s.descriptores.push(r.descriptor);
      if (!s.fecha || r.created_at > s.fecha) s.fecha = r.created_at;
    });
    setSolicitudes([...porNum.values()].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")));
    setError("");
  }, []);

  useEffect(() => {
    cargar();
    const ch = supabase.channel(`solicitudes-registro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "empleados" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "empleados_rostros" }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cargar]);

  // Aprobar: la persona queda activa y su rostro nuevo reemplaza al anterior.
  // `no`: número de orden en Personal para quien entra (nuevo o reingreso).
  const aprobar = useCallback(async (sol, no) => {
    if (sol.descriptores.length) {
      const { error: e1 } = await supabase.from("empleados_rostros").delete().eq("emp_num", sol.num).eq("aprobado", true);
      if (e1) return { ok: false, msg: e1.message };
      const { error: e2 } = await supabase.from("empleados_rostros")
        .update({ aprobado: true, foto: null, creado_por: `Registro en línea · aprobó ${nombreUsuarioSesion()}` })
        .eq("emp_num", sol.num).eq("aprobado", false);
      if (e2) return { ok: false, msg: e2.message };
    }
    if (sol.tipo !== "rostro") {
      const { error: e3 } = await supabase.from("empleados").update({
        activo: true, es_temporal: false, solicitud_registro: null, solicitud_fecha: null, no,
      }).eq("num", sol.num);
      if (e3) return { ok: false, msg: e3.message };
    }
    await cargar();
    return { ok: true };
  }, [cargar]);

  // Rechazar: se borra el rostro pendiente; si era alguien nuevo, también su
  // ficha (nunca llegó a estar en Personal). Un reingreso vuelve a inactivo.
  const rechazar = useCallback(async (sol) => {
    const { error: e1 } = await supabase.from("empleados_rostros").delete().eq("emp_num", sol.num).eq("aprobado", false);
    if (e1) return { ok: false, msg: e1.message };
    const q = sol.tipo === "nuevo"
      ? supabase.from("empleados").delete().eq("num", sol.num).eq("activo", false)
      : sol.tipo === "reingreso"
        ? supabase.from("empleados").update({ solicitud_registro: null, solicitud_fecha: null }).eq("num", sol.num)
        : null;
    if (q) { const { error: e2 } = await q; if (e2) return { ok: false, msg: e2.message }; }
    await cargar();
    return { ok: true };
  }, [cargar]);

  return { solicitudes, error, aprobar, rechazar };
}
