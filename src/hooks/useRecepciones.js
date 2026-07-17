import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const rowToRecepcion = (r) => ({
  id:         r.id,
  remision:   r.remision   || "",
  fecha:      r.fecha      || "",
  tipo:       r.tipo       || "entrada",
  placa:      r.placa      || "",
  conductor:  r.conductor  || "",
  proveedor:  r.proveedor  || "",
  supervisor: r.supervisor || "",
  horaInicio: r.hora_inicio || "",
  horaFin:    r.hora_fin    || "",
  estibas:    Array.isArray(r.estibas) ? r.estibas : [],
  total:      Number(r.total || 0),
});

export function useRecepciones() {
  const [recepciones, setRecepciones] = useState([]);
  const [loading,     setLoading]     = useState(true);

  // ── Carga inicial ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const { data, error } = await supabase
        .from("recepciones").select("*")
        .order("fecha", { ascending: false })
        .order("id",    { ascending: false });
      if (cancelled) return;
      if (!error) setRecepciones((data || []).map(rowToRecepcion));
      else console.error("[recepciones]", error.message);
      setLoading(false);
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // ── Suscripción en tiempo real ────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`recepciones-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "recepciones" }, () => {
        supabase.from("recepciones").select("*")
          .order("fecha", { ascending: false }).order("id", { ascending: false })
          .then(({ data }) => data && setRecepciones(data.map(rowToRecepcion)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Mutaciones ───────────────────────────────────────────────

  const guardarRecepcion = useCallback(async (form, id = null) => {
    const row = {
      remision:    form.remision    || null,
      fecha:       form.fecha,
      tipo:        form.tipo        || "entrada",
      placa:       form.placa       || null,
      conductor:   form.conductor   || null,
      proveedor:   form.proveedor   || null,
      supervisor:  form.supervisor  || null,
      hora_inicio: form.horaInicio  || null,
      hora_fin:    form.horaFin     || null,
      estibas:     form.estibas     || [],
      total:       Number(form.total || 0),
      updated_at:  new Date().toISOString(),
    };

    if (id) {
      setRecepciones(prev => prev.map(r => r.id === id ? rowToRecepcion({ ...row, id }) : r));
      const { error } = await supabase.from("recepciones").update(row).eq("id", id);
      if (error) {
        supabase.from("recepciones").select("*")
          .order("fecha", { ascending: false }).order("id", { ascending: false })
          .then(({ data }) => data && setRecepciones(data.map(rowToRecepcion)));
      }
      return !error;
    } else {
      row.id = Date.now();
      setRecepciones(prev => [rowToRecepcion(row), ...prev]);
      const { error } = await supabase.from("recepciones").insert(row);
      if (error) setRecepciones(prev => prev.filter(r => r.id !== row.id));
      return !error;
    }
  }, []);

  const eliminarRecepcion = useCallback(async (id) => {
    const removed = recepciones.find(r => r.id === id);
    setRecepciones(prev => prev.filter(r => r.id !== id));
    const { error } = await supabase.from("recepciones").delete().eq("id", id);
    if (error && removed) setRecepciones(prev => [removed, ...prev]);
    return !error;
  }, [recepciones]);

  return { recepciones, loading, guardarRecepcion, eliminarRecepcion };
}
