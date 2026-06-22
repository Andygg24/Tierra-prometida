import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const rowToItem = (r) => ({
  id:        r.id,
  nombre:    r.nombre,
  cant:      Number(r.cant),
  unidad:    r.unidad    || "UNIDADES",
  minimo:    Number(r.minimo || 0),
  categoria: r.categoria || "Insumos",
  obs:       r.obs       || "",
  costo:     Number(r.costo || 0),
});

const rowToMov = (r) => {
  const ts = new Date(r.created_at);
  return {
    id:      r.id,
    fecha:   ts.toLocaleDateString("es-CO"),
    hora:    ts.toLocaleTimeString("es-CO", { hour:"2-digit", minute:"2-digit" }),
    nombre:  r.item_nombre || "",
    tipo:    r.tipo,
    cant:    Number(r.cant),
    obs:     r.obs || "",
    antes:   Number(r.antes),
    despues: Number(r.despues),
  };
};

export function useInventario(seedData = []) {
  const [items,    setItems]    = useState([]);
  const [historial, setHistorial] = useState([]);
  const [loading,  setLoading]  = useState(true);

  // ── Carga inicial ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const [{ data: inv }, { data: hist }] = await Promise.all([
        supabase.from("inventario").select("*").order("id"),
        supabase.from("inventario_movimientos").select("*")
          .order("created_at", { ascending: false }).limit(100),
      ]);

      if (cancelled) return;

      if (!inv || inv.length === 0) {
        // Auto-seed si se pasó base y la tabla está vacía
        if (seedData.length > 0) {
          const rows = seedData.map(i => ({
            id: i.id, nombre: i.nombre, cant: i.cant, unidad: i.unidad,
            minimo: i.minimo, categoria: i.categoria, obs: i.obs || "", costo: i.costo || 0,
          }));
          await supabase.from("inventario").insert(rows);
          setItems(seedData.map(rowToItem));
        }
      } else {
        setItems(inv.map(rowToItem));
      }

      setHistorial((hist || []).map(rowToMov));
      setLoading(false);
    }
    fetchAll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Suscripciones en tiempo real ─────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`inventario-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventario" }, ({ new: row, old, eventType }) => {
        if (eventType === "DELETE") {
          setItems(prev => prev.filter(i => i.id !== old.id));
        } else if (row) {
          setItems(prev => {
            const idx = prev.findIndex(i => i.id === row.id);
            const mapped = rowToItem(row);
            return idx >= 0 ? prev.map(i => i.id === row.id ? mapped : i) : [...prev, mapped];
          });
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "inventario_movimientos" }, ({ new: row }) => {
        if (row) setHistorial(prev => [rowToMov(row), ...prev.slice(0, 99)]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Mutaciones ───────────────────────────────────────────────

  const actualizarItem = useCallback(async (id, campos) => {
    const row = {
      nombre:    campos.nombre,
      cant:      Number(campos.cant),
      minimo:    Number(campos.minimo),
      unidad:    campos.unidad,
      costo:     Number(campos.costo || 0),
      obs:       campos.obs || null,
      updated_at: new Date().toISOString(),
    };
    // Optimistic update
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...campos, cant: Number(campos.cant), minimo: Number(campos.minimo), costo: Number(campos.costo || 0) } : i));
    const { error } = await supabase.from("inventario").update(row).eq("id", id);
    if (error) {
      supabase.from("inventario").select("*").order("id")
        .then(({ data }) => data && setItems(data.map(rowToItem)));
    }
    return !error;
  }, []);

  const registrarMovimiento = useCallback(async (itemId, itemNombre, tipo, cant, obs, antes, despues) => {
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("inventario").update({ cant: despues, updated_at: new Date().toISOString() }).eq("id", itemId),
      supabase.from("inventario_movimientos").insert({ item_nombre: itemNombre, tipo, cant, obs: obs || null, antes, despues }),
    ]);
    return !e1 && !e2;
  }, []);

  const agregarItem = useCallback(async (nuevoItem) => {
    const row = {
      nombre:    nuevoItem.nombre,
      cant:      Number(nuevoItem.cant || 0),
      unidad:    nuevoItem.unidad || "UNIDADES",
      minimo:    Number(nuevoItem.minimo || 1),
      categoria: nuevoItem.categoria || "Insumos",
      obs:       nuevoItem.obs || null,
      costo:     Number(nuevoItem.costo || 0),
    };
    const { data, error } = await supabase.from("inventario").insert(row).select().single();
    // Insertar con ID real devuelto por la DB
    if (!error && data) setItems(prev => [...prev, rowToItem(data)]);
    return !error;
  }, []);

  // Ajuste masivo de cantidades — [{id, newCant}]
  const ajustarLotes = useCallback(async (lotes) => {
    const cambios = lotes.filter(l => l.newCant !== undefined && l.id !== undefined);
    if (!cambios.length) return true;
    const ts = new Date().toISOString();
    const upserts = cambios.map(l => ({ id: l.id, cant: l.newCant, updated_at: ts }));
    const { error } = await supabase.from("inventario").upsert(upserts, { onConflict: "id" });
    return !error;
  }, []);

  const eliminarItem = useCallback(async (id) => {
    const removed = items.find(i => i.id === id);
    // Optimistic remove
    setItems(prev => prev.filter(i => i.id !== id));
    const { error } = await supabase.from("inventario").delete().eq("id", id);
    if (error && removed) setItems(prev => [...prev, removed].sort((a, b) => a.id - b.id));
    return !error;
  }, [items]);

  return { items, historial, loading, actualizarItem, registrarMovimiento, agregarItem, ajustarLotes, eliminarItem };
}
