import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const rowToDex = (r) => ({
  id:                r.id,
  numeroExpo:        r.numero_expo != null ? r.numero_expo : "",
  numeroDex:         r.numero_dex         || "",
  estado:            r.estado             || "Pendiente",
  valorDexUsd:       r.valor_dex_usd != null ? Number(r.valor_dex_usd) : "",
  facturaComercial:  r.factura_comercial  || "",
  fecha:             r.fecha              || "",
  verificado:        !!r.verificado,
  obs:               r.obs                || "",
  createdAt:         r.created_at         || "",
});

const rowToPago = (r) => ({
  id:        r.id,
  dexId:     r.dex_id,
  fecha:     r.fecha || "",
  montoUsd:  r.monto_usd != null ? Number(r.monto_usd) : 0,
  obs:       r.obs || "",
  createdAt: r.created_at || "",
});

export function useControlExpo() {
  const [registros, setRegistros] = useState([]);
  const [pagos,     setPagos]     = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const [{ data, error }, { data: dataPagos, error: errorPagos }] = await Promise.all([
        supabase.from("control_expo").select("*").order("numero_expo", { ascending: false }),
        supabase.from("control_expo_pagos").select("*").order("fecha", { ascending: false }),
      ]);
      if (cancelled) return;
      if (!error) setRegistros((data || []).map(rowToDex));
      if (error) console.error("[control_expo]", error.message);
      if (!errorPagos) setPagos((dataPagos || []).map(rowToPago));
      if (errorPagos) console.error("[control_expo_pagos]", errorPagos.message);
      setLoading(false);
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const ch = supabase.channel(`control-expo-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "control_expo" }, () => {
        supabase.from("control_expo").select("*").order("numero_expo", { ascending: false })
          .then(({ data }) => data && setRegistros(data.map(rowToDex)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "control_expo_pagos" }, () => {
        supabase.from("control_expo_pagos").select("*").order("fecha", { ascending: false })
          .then(({ data }) => data && setPagos(data.map(rowToPago)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const guardarDex = useCallback(async (form, id = null) => {
    const previo = id ? registros.find(r => r.id === id) : null;

    const row = {
      numero_expo:       form.numeroExpo !== "" && form.numeroExpo != null ? Number(form.numeroExpo) : null,
      numero_dex:        form.numeroDex        || null,
      estado:            form.estado           || "Pendiente",
      valor_dex_usd:     form.valorDexUsd !== "" && form.valorDexUsd != null ? Number(form.valorDexUsd) : null,
      factura_comercial: form.facturaComercial || null,
      fecha:             form.fecha            || null,
      verificado:        previo ? previo.verificado : !!form.verificado,
      obs:               form.obs              || null,
      updated_at:        new Date().toISOString(),
    };

    if (id) {
      setRegistros(prev => prev.map(r => r.id === id ? rowToDex({ ...row, id }) : r));
      const { error } = await supabase.from("control_expo").update(row).eq("id", id);
      if (error) {
        supabase.from("control_expo").select("*").order("numero_expo", { ascending: false })
          .then(({ data }) => data && setRegistros(data.map(rowToDex)));
      }
      return !error;
    } else {
      row.id = Date.now();
      setRegistros(prev => [rowToDex(row), ...prev]);
      const { error } = await supabase.from("control_expo").insert(row);
      if (error) setRegistros(prev => prev.filter(r => r.id !== row.id));
      return !error;
    }
  }, [registros]);

  const eliminarDex = useCallback(async (id) => {
    const removed = registros.find(r => r.id === id);
    setRegistros(prev => prev.filter(r => r.id !== id));
    const { error } = await supabase.from("control_expo").delete().eq("id", id);
    if (error && removed) setRegistros(prev => [removed, ...prev]);
    return !error;
  }, [registros]);

  const toggleVerificado = useCallback(async (id) => {
    const actual = registros.find(r => r.id === id);
    if (!actual) return;
    const nuevo = !actual.verificado;
    setRegistros(prev => prev.map(r => r.id === id ? { ...r, verificado: nuevo } : r));
    const { error } = await supabase.from("control_expo").update({ verificado: nuevo, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) setRegistros(prev => prev.map(r => r.id === id ? { ...r, verificado: actual.verificado } : r));
  }, [registros]);

  const agregarPago = useCallback(async (dexId, { fecha, montoUsd, obs }) => {
    const row = {
      id:        Date.now(),
      dex_id:    dexId,
      fecha:     fecha || null,
      monto_usd: Number(montoUsd) || 0,
      obs:       obs || null,
    };
    setPagos(prev => [rowToPago(row), ...prev]);
    const { error } = await supabase.from("control_expo_pagos").insert(row);
    if (error) setPagos(prev => prev.filter(p => p.id !== row.id));
    return !error;
  }, []);

  const eliminarPago = useCallback(async (id) => {
    const removed = pagos.find(p => p.id === id);
    setPagos(prev => prev.filter(p => p.id !== id));
    const { error } = await supabase.from("control_expo_pagos").delete().eq("id", id);
    if (error && removed) setPagos(prev => [removed, ...prev]);
    return !error;
  }, [pagos]);

  const actualizarPago = useCallback(async (id, { fecha, montoUsd, obs }) => {
    const previo = pagos.find(p => p.id === id);
    const row = { fecha: fecha || null, monto_usd: Number(montoUsd) || 0, obs: obs || null };
    setPagos(prev => prev.map(p => p.id === id ? rowToPago({ ...p, dex_id: p.dexId, ...row, id }) : p));
    const { error } = await supabase.from("control_expo_pagos").update(row).eq("id", id);
    if (error && previo) setPagos(prev => prev.map(p => p.id === id ? previo : p));
    return !error;
  }, [pagos]);

  return { registros, pagos, loading, guardarDex, eliminarDex, toggleVerificado, agregarPago, eliminarPago, actualizarPago };
}
