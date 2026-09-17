import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const hoyISO = () => new Date().toISOString().split("T")[0];

const rowToArea = (r) => ({
  id: r.id, nombre: r.nombre, orden: r.orden || 0,
  icono: r.icono || "⚙️", color: r.color || "#00C9A7", foto: r.foto || "",
  activo: r.activo !== false,
});

const rowToMov = (r) => ({
  id: r.id, empNum: r.emp_num, areaId: r.area_id, fecha: r.fecha,
  hora: r.hora, origen: r.origen || "manual", registradoPor: r.registrado_por || "",
});

// Bitácora de "quién entró a qué área y cuándo" — mismo patrón que
// asistencia_eventos. La ubicación actual de cada persona y su tiempo en el
// área son derivados en el componente a partir del último movimiento del día
// (no se guarda un "estado actual" aparte para no tener dos fuentes de verdad).
export function useMaquina() {
  const [areas,       setAreas]       = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    let cancelled = false;
    const hoy = hoyISO();
    Promise.all([
      supabase.from("maquina_areas").select("*").eq("activo", true).order("orden"),
      supabase.from("maquina_movimientos").select("*").eq("fecha", hoy).order("hora"),
    ]).then(([{ data: a }, { data: m }]) => {
      if (cancelled) return;
      setAreas((a || []).map(rowToArea));
      setMovimientos((m || []).map(rowToMov));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const hoy = hoyISO();
    const ch = supabase.channel(`maquina-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "maquina_areas" }, () => {
        supabase.from("maquina_areas").select("*").eq("activo", true).order("orden")
          .then(({ data }) => data && setAreas(data.map(rowToArea)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "maquina_movimientos", filter: `fecha=eq.${hoy}` }, ({ new: row, eventType }) => {
        if (eventType === "DELETE") return;
        if (!row) return;
        setMovimientos(prev => prev.some(m => m.id === row.id) ? prev : [...prev, rowToMov(row)].sort((x, y) => new Date(x.hora) - new Date(y.hora)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Registra que `empNum` entró a `areaId` ahora mismo (queda como el
  // movimiento vigente hasta que se registre otro para la misma persona).
  const moverPersona = useCallback(async (empNum, areaId, { origen = "manual", registradoPor = "" } = {}) => {
    const row = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      emp_num: empNum, area_id: areaId, fecha: hoyISO(),
      hora: new Date().toISOString(), origen, registrado_por: registradoPor,
    };
    setMovimientos(prev => [...prev, rowToMov(row)]);
    const { error } = await supabase.from("maquina_movimientos").insert(row);
    if (error) setMovimientos(prev => prev.filter(m => m.id !== row.id));
    return !error;
  }, []);

  return { areas, movimientos, loading, moverPersona };
}
