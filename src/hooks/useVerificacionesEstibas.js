import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const rowToVerificacion = (r) => ({
  id:                  r.id,
  fecha:               r.fecha || "",
  nota:                r.nota  || "",
  estibasMarcadas:     Number(r.estibas_marcadas || 0),
  canastillasUsadas:   Number(r.canastillas_usadas || 0),
  canastillasFaltantes: Number(r.canastillas_faltantes || 0),
  kgUsados:            Number(r.kg_usados || 0),
  kgFaltantes:         Number(r.kg_faltantes || 0),
  registradoPor:       r.registrado_por || "",
  createdAt:           r.created_at || "",
});

export function useVerificacionesEstibas() {
  const [verificaciones, setVerificaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.from("verificaciones_estibas").select("*")
      .order("fecha", { ascending: false }).order("id", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setVerificaciones((data || []).map(rowToVerificacion));
        else console.error("[verificaciones_estibas]", error.message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const ch = supabase.channel(`verificaciones-estibas-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "verificaciones_estibas" }, () => {
        supabase.from("verificaciones_estibas").select("*")
          .order("fecha", { ascending: false }).order("id", { ascending: false })
          .then(({ data }) => data && setVerificaciones(data.map(rowToVerificacion)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const guardarVerificacion = useCallback(async (form, id = null) => {
    const row = {
      fecha:                 form.fecha,
      nota:                  form.nota || null,
      estibas_marcadas:      Number(form.estibasMarcadas) || 0,
      canastillas_usadas:    Number(form.canastillasUsadas) || 0,
      canastillas_faltantes: Number(form.canastillasFaltantes) || 0,
      kg_usados:             Number(form.kgUsados) || 0,
      kg_faltantes:          Number(form.kgFaltantes) || 0,
      registrado_por:        form.registradoPor || null,
      updated_at:            new Date().toISOString(),
    };

    if (id) {
      setVerificaciones(prev => prev.map(v => v.id === id ? rowToVerificacion({ ...row, id }) : v));
      const { error } = await supabase.from("verificaciones_estibas").update(row).eq("id", id);
      if (error) {
        supabase.from("verificaciones_estibas").select("*")
          .order("fecha", { ascending: false }).order("id", { ascending: false })
          .then(({ data }) => data && setVerificaciones(data.map(rowToVerificacion)));
        return { ok: false, id };
      }
      return { ok: true, id };
    } else {
      row.id = Date.now();
      setVerificaciones(prev => [rowToVerificacion(row), ...prev]);
      const { error } = await supabase.from("verificaciones_estibas").insert(row);
      if (error) { setVerificaciones(prev => prev.filter(v => v.id !== row.id)); return { ok: false, id: null }; }
      return { ok: true, id: row.id };
    }
  }, []);

  const eliminarVerificacion = useCallback(async (id) => {
    const removed = verificaciones.find(v => v.id === id);
    setVerificaciones(prev => prev.filter(v => v.id !== id));
    const { error } = await supabase.from("verificaciones_estibas").delete().eq("id", id);
    if (error && removed) setVerificaciones(prev => [removed, ...prev]);
    return !error;
  }, [verificaciones]);

  return { verificaciones, loading, guardarVerificacion, eliminarVerificacion };
}
