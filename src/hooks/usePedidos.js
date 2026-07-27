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
    const ch = supabase.channel(`pedidos-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, refetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Mutaciones

  const agregarPedido = useCallback(async (p) => {
    const row = {
      id:          p.id,
      cliente:     p.cliente,
      producto:    p.producto,
      cantidad_kg: p.cantidadKg,
      precio_usd:  p.precioUSD,
      estado:      p.estado,
      fecha:       p.fecha,
      contenedor:  p.contenedor || null,
      obs:         p.notas      || null,
    };
    // Optimistic insert — antes dependía solo del roundtrip de tiempo real,
    // así que el pedido nuevo no se veía en el Pipeline hasta que llegara.
    setPedidos(prev => [rowToPedido(row), ...prev]);
    const { error } = await supabase.from("pedidos").insert(row);
    if (error) setPedidos(prev => prev.filter(x => x.id !== row.id));
    return !error;
  }, []);

  const avanzarEstado = useCallback(async (id, nuevoEstado) => {
    let estadoAnterior;
    setPedidos(prev => { estadoAnterior = prev.find(p => p.id === id)?.estado; return prev.map(p => p.id === id ? { ...p, estado: nuevoEstado } : p); });
    const { error } = await supabase.from("pedidos").update({ estado: nuevoEstado }).eq("id", id);
    if (error) setPedidos(prev => prev.map(p => p.id === id ? { ...p, estado: estadoAnterior } : p));
  }, []);

  const eliminarPedido = useCallback(async (id) => {
    let removed;
    setPedidos(prev => { removed = prev.find(p => p.id === id); return prev.filter(p => p.id !== id); });
    const { error } = await supabase.from("pedidos").delete().eq("id", id);
    if (error && removed) setPedidos(prev => [...prev, removed]);
  }, []);

  const editarPedido = useCallback(async (id, campos) => {
    let anterior;
    setPedidos(prev => {
      anterior = prev.find(p => p.id === id);
      return prev.map(p => p.id === id ? { ...p, ...campos } : p);
    });
    const { error } = await supabase.from("pedidos").update({
      cliente:     campos.cliente,
      producto:    campos.producto,
      cantidad_kg: campos.cantidadKg,
      precio_usd:  campos.precioUSD,
      contenedor:  campos.contenedor || null,
      obs:         campos.notas      || null,
    }).eq("id", id);
    if (error && anterior) setPedidos(prev => prev.map(p => p.id === id ? anterior : p));
    return !error;
  }, []);

  return { pedidos, loading, agregarPedido, avanzarEstado, eliminarPedido, editarPedido };
}
