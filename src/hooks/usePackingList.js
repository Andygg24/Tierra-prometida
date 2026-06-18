import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

export function usePackingList() {
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

  // Real-time: notifica cuando alguien guarda un packing list
  useEffect(() => {
    const ch = supabase.channel(`packing-lists-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "packing_lists" }, ({ new: row }) => {
        setUltimaActualizacion(row?.updated_at || new Date().toISOString());
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const cargarPorContenedor = useCallback(async (contenedorId) => {
    const { data, error } = await supabase
      .from("packing_lists")
      .select("*")
      .eq("contenedor_id", contenedorId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { data, error };
  }, []);

  const cargarTodos = useCallback(async (contenedorIds) => {
    if (!contenedorIds?.length) return { data: [], error: null };
    const { data, error } = await supabase
      .from("packing_lists")
      .select("id, contenedor_id, fase, updated_at")
      .in("contenedor_id", contenedorIds);
    return { data: data || [], error };
  }, []);

  const guardar = useCallback(async (pl) => {
    const row = {
      ...pl,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("packing_lists")
      .upsert(row, { onConflict: "id" })
      .select()
      .single();
    return { data, error };
  }, []);

  return { cargarPorContenedor, cargarTodos, guardar, ultimaActualizacion };
}
