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

  // Busca un packing list por su id (el que va codificado en el QR de la
  // tirilla de pallet) y le suma el N° de contenedor real desde la tabla
  // contenedores, para poder mostrarlo en Pallet Verification sin depender
  // de que admin_data.container ya se haya guardado en ese paso.
  const cargarPorIdConContenedor = useCallback(async (id) => {
    const { data: pl, error } = await supabase
      .from("packing_lists")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !pl) return { data: null, error: error || new Error("No encontrado") };
    const { data: cont } = await supabase
      .from("contenedores")
      .select("num_contenedor")
      .eq("id", pl.contenedor_id)
      .maybeSingle();
    return { data: { ...pl, numContenedor: cont?.num_contenedor || "" }, error: null };
  }, []);

  // Actualiza solo la columna `pallets` — así marcar un pallet como
  // verificado no pisa admin_data ni ningún otro campo que otra persona
  // pueda estar guardando al mismo tiempo desde otro paso.
  const actualizarPallets = useCallback(async (id, pallets) => {
    const { data, error } = await supabase
      .from("packing_lists")
      .update({ pallets, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    return { data, error };
  }, []);

  // Actualiza solo la columna `fase` — usado al volver manualmente a un
  // paso anterior. A diferencia de guardarParcial (que nunca retrocede la
  // fase para no pisar el avance de otra persona), esto sí retrocede a
  // propósito: es una acción explícita del usuario, no un guardado normal.
  const actualizarFase = useCallback(async (id, fase) => {
    const { data, error } = await supabase
      .from("packing_lists")
      .update({ fase, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    return { data, error };
  }, []);

  return { cargarPorContenedor, cargarTodos, guardar, cargarPorIdConContenedor, actualizarPallets, actualizarFase, ultimaActualizacion };
}
