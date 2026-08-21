import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const LIMITE = 300;

const rowToActividad = (r) => ({
  id:         r.id,
  usuario:    r.usuario    || "",
  modulo:     r.modulo     || "",
  accion:     r.accion     || "",
  detalle:    r.detalle    || "",
  referencia: r.referencia || "",
  createdAt:  r.created_at || "",
});

// Función suelta (no-hook) para los lugares que solo necesitan DEJAR un
// registro (Inventario, Recepción, Packing List) sin montar la lista
// completa ni la suscripción realtime — eso lo usan únicamente el widget
// de Inicio y la pestaña de Configuración.
export async function registrarActividad({ usuario, modulo, accion, detalle, referencia }) {
  const row = { id: Date.now(), usuario: usuario || null, modulo, accion, detalle, referencia: referencia || null };
  const { error } = await supabase.from("actividad_log").insert(row);
  if (error) console.error("[actividad_log]", error.message);
  return !error;
}

export function useActividad() {
  const [actividad, setActividad] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    supabase.from("actividad_log").select("*").order("created_at", { ascending: false }).limit(LIMITE)
      .then(({ data, error }) => {
        if (cancelado) return;
        if (!error) setActividad((data || []).map(rowToActividad));
        setLoading(false);
      });
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    const ch = supabase.channel(`actividad-log-changes-${Date.now()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "actividad_log" }, ({ new: row }) => {
        if (row) setActividad(prev => [rowToActividad(row), ...prev.slice(0, LIMITE - 1)]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const registrar = useCallback((datos) => registrarActividad(datos), []);

  return { actividad, loading, registrar };
}
