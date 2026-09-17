import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const VACIO = { calibCfg: {}, posCustom: {}, posPersonas: {}, objetos: [], rutasPersonas: {} };

const rowToDiseno = (r) => ({
  calibCfg: r?.calib_cfg || {},
  posCustom: r?.pos_custom || {},
  posPersonas: r?.pos_personas || {},
  objetos: r?.objetos || [],
  rutasPersonas: r?.rutas_personas || {},
});

// El diseño del plano de Máquina (posiciones, objetos, calibradora, rutas
// de caminata) vive en una sola fila (id=1) de `maquina_diseno`, así se ve
// igual para cualquiera que entre al módulo, no solo en un navegador.
export function useMaquinaDiseno() {
  const [diseno, setDiseno] = useState(VACIO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.from("maquina_diseno").select("*").eq("id", 1).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error("[maquina_diseno]", error.message);
      setDiseno(rowToDiseno(data));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const ch = supabase.channel(`maquina-diseno-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "maquina_diseno", filter: "id=eq.1" }, ({ new: row }) => {
        if (row) setDiseno(rowToDiseno(row));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const guardarDiseno = useCallback(async (parcial, registradoPor = "") => {
    const row = {
      id: 1,
      calib_cfg: parcial.calibCfg,
      pos_custom: parcial.posCustom,
      pos_personas: parcial.posPersonas,
      objetos: parcial.objetos,
      rutas_personas: parcial.rutasPersonas,
      actualizado_por: registradoPor || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("maquina_diseno").upsert(row);
    if (error) { console.error("[maquina_diseno.guardar]", error.message); return false; }
    // Aplica el guardado de una vez en local, sin esperar a que llegue el
    // eco por realtime — evita un parpadeo si se sale de edición justo
    // después de guardar.
    setDiseno({
      calibCfg: parcial.calibCfg, posCustom: parcial.posCustom, posPersonas: parcial.posPersonas,
      objetos: parcial.objetos, rutasPersonas: parcial.rutasPersonas,
    });
    return true;
  }, []);

  return { diseno, loading, guardarDiseno };
}
