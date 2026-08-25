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

const rowToDeclaracion = (r) => ({
  id:        r.id,
  numero:    r.numero    || "",
  banco:     r.banco     || "",
  valorUsd:  r.valor_usd != null ? Number(r.valor_usd) : 0,
  fecha:     r.fecha     || "",
  obs:       r.obs       || "",
  createdAt: r.created_at || "",
});

const rowToAsignacion = (r) => ({
  id:                  r.id,
  declaracionCambioId: r.declaracion_cambio_id,
  dexId:               r.dex_id,
  valorUsd:            Number(r.valor_usd) || 0,
  createdAt:           r.created_at || "",
});

export function useControlExpo() {
  const [registros, setRegistros] = useState([]);
  const [pagos,     setPagos]     = useState([]);
  const [declaraciones, setDeclaraciones] = useState([]);
  const [asignaciones, setAsignaciones]   = useState([]); // relación DEX <-> declaración (un DEX puede repetirse en varias)
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const [{ data, error }, { data: dataPagos, error: errorPagos }, { data: dataDecl, error: errorDecl }, { data: dataAsig, error: errorAsig }] = await Promise.all([
        supabase.from("control_expo").select("*").order("numero_expo", { ascending: false }),
        supabase.from("control_expo_pagos").select("*").order("fecha", { ascending: false }),
        supabase.from("declaraciones_cambio").select("*").order("created_at", { ascending: false }),
        supabase.from("declaraciones_cambio_dex").select("*").order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      if (!error) setRegistros((data || []).map(rowToDex));
      if (error) console.error("[control_expo]", error.message);
      if (!errorPagos) setPagos((dataPagos || []).map(rowToPago));
      if (errorPagos) console.error("[control_expo_pagos]", errorPagos.message);
      if (!errorDecl) setDeclaraciones((dataDecl || []).map(rowToDeclaracion));
      if (errorDecl) console.error("[declaraciones_cambio]", errorDecl.message);
      if (!errorAsig) setAsignaciones((dataAsig || []).map(rowToAsignacion));
      if (errorAsig) console.error("[declaraciones_cambio_dex]", errorAsig.message);
      setLoading(false);
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // Aplica cada evento con el payload que ya trae el mensaje realtime, en
  // vez de refrescar la tabla entera con un SELECT aparte — ese refetch
  // corre en una conexión distinta a la del insert/update que lo disparó,
  // y a veces (por el pool de conexiones) alcanza a leer el dato TODAVÍA
  // no confirmado, pisando el cambio recién hecho con la versión vieja
  // (ej. una asignación que "se hacía y se quitaba sola" al toque).
  const aplicarEvento = (setter, mapper) => ({ new: row, old, eventType }) => {
    if (eventType === "DELETE") {
      setter(prev => prev.filter(x => x.id !== old.id));
      return;
    }
    if (!row) return;
    const nuevo = mapper(row);
    setter(prev => prev.some(x => x.id === nuevo.id) ? prev.map(x => x.id === nuevo.id ? nuevo : x) : [nuevo, ...prev]);
  };

  useEffect(() => {
    const ch = supabase.channel(`control-expo-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "control_expo" }, aplicarEvento(setRegistros, rowToDex))
      .on("postgres_changes", { event: "*", schema: "public", table: "control_expo_pagos" }, aplicarEvento(setPagos, rowToPago))
      .on("postgres_changes", { event: "*", schema: "public", table: "declaraciones_cambio" }, aplicarEvento(setDeclaraciones, rowToDeclaracion))
      .on("postgres_changes", { event: "*", schema: "public", table: "declaraciones_cambio_dex" }, aplicarEvento(setAsignaciones, rowToAsignacion))
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
    // Al marcar el chulito, el estado pasa a "Verificado"; al desmarcarlo
    // vuelve a "Pendiente" — pero solo si seguía en "Verificado" (si
    // mientras tanto lo cambiaron a mano a Radicado/Cancelado, no se pisa).
    const nuevoEstado = nuevo ? "Verificado" : (actual.estado === "Verificado" ? "Pendiente" : actual.estado);
    setRegistros(prev => prev.map(r => r.id === id ? { ...r, verificado: nuevo, estado: nuevoEstado } : r));
    const { error } = await supabase.from("control_expo").update({ verificado: nuevo, estado: nuevoEstado, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) setRegistros(prev => prev.map(r => r.id === id ? actual : r));
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

  // ── Declaraciones de cambio ──
  // Un mismo DEX se puede repartir entre varias declaraciones — cada fila
  // de declaraciones_cambio_dex es "este DEX aporta tanto USD a esta
  // declaración" (no siempre su valor completo).

  const crearDeclaracion = useCallback(async ({ numero, banco, valorUsd, fecha, obs }) => {
    const row = {
      id:        Date.now(),
      numero:    numero || null,
      banco:     banco  || null,
      valor_usd: Number(valorUsd) || 0,
      fecha:     fecha  || null,
      obs:       obs    || null,
    };
    setDeclaraciones(prev => [rowToDeclaracion(row), ...prev]);
    const { error } = await supabase.from("declaraciones_cambio").insert(row);
    if (error) setDeclaraciones(prev => prev.filter(d => d.id !== row.id));
    return !error;
  }, []);

  const eliminarDeclaracion = useCallback(async (id) => {
    const removida = declaraciones.find(d => d.id === id);
    const asigRemovidas = asignaciones.filter(a => a.declaracionCambioId === id);
    setDeclaraciones(prev => prev.filter(d => d.id !== id));
    // El ON DELETE CASCADE de la base borra las asignaciones de esa
    // declaración — se refleja local de una vez para evitar parpadeo.
    setAsignaciones(prev => prev.filter(a => a.declaracionCambioId !== id));
    const { error } = await supabase.from("declaraciones_cambio").delete().eq("id", id);
    if (error) {
      if (removida) setDeclaraciones(prev => [removida, ...prev]);
      if (asigRemovidas.length) setAsignaciones(prev => [...asigRemovidas, ...prev]);
    }
    return !error;
  }, [declaraciones, asignaciones]);

  // Crea una nueva asignación (fila) DEX -> declaración. Como es una tabla
  // de relación, el mismo DEX puede tener varias asignaciones a distintas
  // declaraciones — o incluso más de una a la misma, si hiciera falta.
  const asignarDexADeclaracion = useCallback(async (dexId, declaracionId, valorUsado) => {
    const dex = registros.find(r => r.id === dexId);
    const valor = valorUsado != null && valorUsado !== "" ? Number(valorUsado) : (dex ? Number(dex.valorDexUsd) || 0 : 0);
    const row = { id: Date.now(), declaracion_cambio_id: declaracionId, dex_id: dexId, valor_usd: valor };
    setAsignaciones(prev => [rowToAsignacion(row), ...prev]);
    const { error } = await supabase.from("declaraciones_cambio_dex").insert(row);
    if (error) setAsignaciones(prev => prev.filter(a => a.id !== row.id));
    return !error;
  }, [registros]);

  const quitarAsignacion = useCallback(async (asignacionId) => {
    const removida = asignaciones.find(a => a.id === asignacionId);
    setAsignaciones(prev => prev.filter(a => a.id !== asignacionId));
    const { error } = await supabase.from("declaraciones_cambio_dex").delete().eq("id", asignacionId);
    if (error && removida) setAsignaciones(prev => [removida, ...prev]);
    return !error;
  }, [asignaciones]);

  // Ajusta el valor usado de una asignación existente, sin tocar el DEX ni
  // la declaración a la que pertenece.
  const actualizarValorAsignacion = useCallback(async (asignacionId, nuevoValor) => {
    const previa = asignaciones.find(a => a.id === asignacionId);
    if (!previa) return false;
    const valor = Number(nuevoValor) || 0;
    setAsignaciones(prev => prev.map(a => a.id === asignacionId ? { ...a, valorUsd: valor } : a));
    const { error } = await supabase.from("declaraciones_cambio_dex").update({ valor_usd: valor }).eq("id", asignacionId);
    if (error) setAsignaciones(prev => prev.map(a => a.id === asignacionId ? previa : a));
    return !error;
  }, [asignaciones]);

  return {
    registros, pagos, declaraciones, asignaciones, loading,
    guardarDex, eliminarDex, toggleVerificado, agregarPago, eliminarPago, actualizarPago,
    crearDeclaracion, eliminarDeclaracion, asignarDexADeclaracion, quitarAsignacion, actualizarValorAsignacion,
  };
}
