import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

export function useConfiguracion() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);

  // ── Carga inicial
  useEffect(() => {
    let cancelled = false;
    supabase.from("configuracion").select("clave, valor")
      .then(({ data }) => {
        if (cancelled) return;
        const map = {};
        (data || []).forEach(r => { map[r.clave] = r.valor; });
        setConfig(map);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Real-time
  useEffect(() => {
    const ch = supabase.channel(`configuracion-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "configuracion" }, ({ new: row, old, eventType }) => {
        if (eventType === "DELETE") {
          setConfig(prev => { const c = { ...prev }; delete c[old.clave]; return c; });
        } else if (row) {
          setConfig(prev => ({ ...prev, [row.clave]: row.valor }));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Mutación
  const guardar = useCallback(async (clave, valor) => {
    return await supabase.from("configuracion").upsert(
      { clave, valor, updated_at: new Date().toISOString() },
      { onConflict: "clave" }
    );
  }, []);

  return { config, loading, guardar };
}
