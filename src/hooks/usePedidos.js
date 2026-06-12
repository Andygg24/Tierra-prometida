import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const rowToPedido = (r) => ({
  id:         r.id,
  cliente:    r.cliente    || "",
  producto:   r.producto   || "",
  cantidadKg: Number(r.cantidad_kg || 0),
  precioUSD:  Number(r.precio_usd  || 0),
  estado:     r.estado     || "cotizacion",
  fecha:      r.fecha      || "",
  contenedor: r.contenedor || "",
  notas:      r.obs        || "",
});

export function usePedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Carga inicial
  useEffect(() => {
    let cancelled = false;
    supabase.from("pedidos").select("*").order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setPedidos((data || []).map(rowToPedido));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Real-time
  useEffect(() => {
    const refetch = () => {
      supabase.from("pedidos").select("*").order("created_at", { ascending: false })
        .then(({ data }) => data && setPedidos(data.map(rowToPedido)));
    };
    const ch = supabase.channel("pedidos-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, refetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Mutaciones

  const agregarPedido = useCallback(async (p) => {
    const { error } = await supabase.from("pedidos").insert({
      id:          p.id,
      cliente:     p.cliente,
      producto:    p.producto,
      cantidad_kg: p.cantidadKg,
      precio_usd:  p.precioUSD,
      estado:      p.estado,
      fecha:       p.fecha,
      contenedor:  p.contenedor || null,
      obs:         p.notas      || null,
    });
    return !error;
  }, []);

  const avanzarEstado = useCallback(async (id, nuevoEstado) => {
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, estado: nuevoEstado } : p));
    await supabase.from("pedidos").update({ estado: nuevoEstado }).eq("id", id);
  }, []);

  const eliminarPedido = useCallback(async (id) => {
    setPedidos(prev => prev.filter(p => p.id !== id));
    await supabase.from("pedidos").delete().eq("id", id);
  }, []);

  return { pedidos, loading, agregarPedido, avanzarEstado, eliminarPedido };
}
