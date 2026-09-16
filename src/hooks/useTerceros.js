import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const rowToTercero = (r) => ({
  id:            r.id,
  nombre:        r.nombre         || "",
  nit:           r.nit            || "",
  tipo:          r.tipo           || "Persona",
  telefono:      r.telefono       || "",
  obs:           r.obs            || "",
  activo:        r.activo !== false,
  registradoPor: r.registrado_por || "",
  createdAt:     r.created_at     || "",
});

// Catálogo de personas/empresas ("Terceros") de Caja Menor — antes el
// proveedor de una factura era solo texto libre; esto permite un registro
// editable de verdad, con baja lógica (activo:false) en vez de borrado real,
// para no perder la referencia de facturas ya guardadas con ese tercero.
export function useTerceros() {
  const [terceros, setTerceros] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.from("caja_menor_terceros").select("*").order("nombre")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setTerceros((data || []).map(rowToTercero));
        else console.error("[caja_menor_terceros]", error.message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const ch = supabase.channel(`caja-menor-terceros-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "caja_menor_terceros" }, () => {
        supabase.from("caja_menor_terceros").select("*").order("nombre")
          .then(({ data }) => data && setTerceros(data.map(rowToTercero)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const guardarTercero = useCallback(async (form, id = null) => {
    const row = {
      nombre:         form.nombre    || "",
      nit:            form.nit       || null,
      tipo:           form.tipo      || "Persona",
      telefono:       form.telefono  || null,
      obs:            form.obs       || null,
      registrado_por: form.registradoPor || null,
      updated_at:     new Date().toISOString(),
    };

    if (id) {
      // `activo` no viaja en este guardado (lo maneja toggleActivo aparte) —
      // se conserva el que ya tenía para no pisarlo por accidente.
      setTerceros(prev => prev.map(t => t.id === id ? rowToTercero({ ...row, id, activo: t.activo }) : t));
      const { error } = await supabase.from("caja_menor_terceros").update(row).eq("id", id);
      if (error) {
        supabase.from("caja_menor_terceros").select("*").order("nombre")
          .then(({ data }) => data && setTerceros(data.map(rowToTercero)));
        return { ok: false, id };
      }
      return { ok: true, id };
    } else {
      row.id = Date.now();
      row.activo = true;
      setTerceros(prev => [rowToTercero(row), ...prev]);
      const { error } = await supabase.from("caja_menor_terceros").insert(row);
      if (error) { setTerceros(prev => prev.filter(t => t.id !== row.id)); return { ok: false, id: null }; }
      return { ok: true, id: row.id };
    }
  }, []);

  // Baja lógica — no se borra de verdad para no dejar huérfanas las
  // facturas históricas que ya lo referencian por nombre.
  const toggleActivo = useCallback(async (id, activo) => {
    const anterior = terceros;
    setTerceros(prev => prev.map(t => t.id === id ? { ...t, activo } : t));
    const { error } = await supabase.from("caja_menor_terceros")
      .update({ activo, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) setTerceros(anterior);
    return !error;
  }, [terceros]);

  const eliminarTercero = useCallback(async (id) => {
    const removed = terceros.find(t => t.id === id);
    setTerceros(prev => prev.filter(t => t.id !== id));
    const { error } = await supabase.from("caja_menor_terceros").delete().eq("id", id);
    if (error && removed) setTerceros(prev => [removed, ...prev]);
    return !error;
  }, [terceros]);

  return { terceros, loading, guardarTercero, toggleActivo, eliminarTercero };
}
