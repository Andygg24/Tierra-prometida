import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const nombreUsuarioSesion = () => {
  try { return JSON.parse(localStorage.getItem("tp_session"))?.nombre || ""; } catch { return ""; }
};

// Huellas faciales registradas (tabla empleados_rostros), agrupadas por
// empleado: [{ num, descriptores: [number[]] }].
export function useRostros() {
  const [registrados, setRegistrados] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.from("empleados_rostros").select("emp_num,descriptor");
    if (err) {
      setError(`No se pudieron cargar los rostros (¿corriste supabase-asistencia-rostros-migration.sql?): ${err.message}`);
      setLoading(false);
      return;
    }
    const porEmp = new Map();
    (data || []).forEach(r => {
      if (!Array.isArray(r.descriptor) || r.descriptor.length !== 128) return;
      if (!porEmp.has(r.emp_num)) porEmp.set(r.emp_num, []);
      porEmp.get(r.emp_num).push(r.descriptor);
    });
    setRegistrados(Array.from(porEmp, ([num, descriptores]) => ({ num, descriptores })));
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
    const ch = supabase.channel(`empleados-rostros-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "empleados_rostros" }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cargar]);

  // Reemplaza las muestras de un empleado por las nuevas.
  const guardarRostro = useCallback(async (num, descriptores) => {
    const base = Date.now();
    const rows = descriptores.map((d, i) => ({
      id: base + i, emp_num: num,
      descriptor: Array.from(d, v => Math.round(v * 1e5) / 1e5),
      creado_por: nombreUsuarioSesion(),
    }));
    const { error: errDel } = await supabase.from("empleados_rostros").delete().eq("emp_num", num);
    if (errDel) return { ok: false, msg: errDel.message };
    const { error: errIns } = await supabase.from("empleados_rostros").insert(rows);
    if (errIns) return { ok: false, msg: errIns.message };
    await cargar();
    return { ok: true };
  }, [cargar]);

  const borrarRostro = useCallback(async (num) => {
    const { error: err } = await supabase.from("empleados_rostros").delete().eq("emp_num", num);
    if (err) return { ok: false, msg: err.message };
    await cargar();
    return { ok: true };
  }, [cargar]);

  return { registrados, loading, error, guardarRostro, borrarRostro };
}
