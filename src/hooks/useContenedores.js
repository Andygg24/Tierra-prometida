import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const rowToCont = (r) => ({
  id:            r.id,
  fecha:         r.fecha,
  numContenedor: r.num_contenedor  || "",
  proveedor:     r.proveedor       || "",
  producto:      r.producto        || "",
  cajasSalida:   r.cajas_salida    || "",
  turno:         r.turno           || "Día",
  estado:        r.estado          || "En proceso",
  operadores:    r.operadores      || "",
  transporte:    r.transporte      || "",
  placa:         r.placa           || "",
  trailer:       r.trailer         || "",
  obs:           r.obs             || "",
  grupoDia:      r.grupo_dia       || "",
  grupoNoche:    r.grupo_noche     || "",
  booking:       r.booking         || "",
  naviera:       r.naviera         || "",
  vessel:        r.vessel          || "",
  destino:       r.destino         || "",
  logisticaBookingId: r.logistica_booking_id != null ? r.logistica_booking_id : null,
  trazabilidad:  Array.isArray(r.trazabilidad) ? r.trazabilidad : [],
});

const rowToGrupo = (r) => ({
  id:       r.id,
  nombre:   r.nombre,
  turno:    r.turno,
  miembros: Array.isArray(r.miembros) ? r.miembros : [],
});

const rowToInsumo = (r) => ({
  id:       r.id,
  contId:   r.cont_id,
  contNum:  r.cont_num  || "",
  items:    Array.isArray(r.items)  ? r.items  : [],
  extras:   Array.isArray(r.extras) ? r.extras : [],
  fecha:    r.fecha     || "",
  total:    r.total     || 0,
});

const rowToRendimiento = (r) => ({
  id:              r.id,
  contId:          r.cont_id,
  contNum:         r.cont_num          || "",
  fecha:           r.fecha             || "",
  proveedor:       r.proveedor         || "",
  kilosProcesados:   Number(r.kilos_procesados)    || 0,
  kilosDevueltos:  Number(r.kilos_devueltos)  || 0,
  kilosPrimeraDevueltos: Number(r.kilos_primera_devueltos) || 0,
  cajasDelMonte:   Number(r.cajas_del_monte)  || 0,
  cajasPrincess:   Number(r.cajas_princess)   || 0,
  observaciones:   Array.isArray(r.observaciones) ? r.observaciones : [],
  obsDetalle:      r.obs_detalle || "",
  calibres:        Array.isArray(r.calibres) ? r.calibres : [],
});

export function useContenedores() {
  const [procesos,      setProcesos]      = useState([]);
  const [grupos,        setGrupos]        = useState([]);
  const [contInsumos,   setContInsumos]   = useState([]);
  const [rendimientos,  setRendimientos]  = useState([]);
  const [loading,       setLoading]       = useState(true);

  // ── Carga inicial ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const [
        { data: conts,   error: e1 },
        { data: grups,   error: e2 },
        { data: insumos, error: e3 },
        { data: rends,   error: e4 },
      ] = await Promise.all([
        supabase.from("contenedores").select("*").order("fecha", { ascending: false }),
        supabase.from("grupos_trabajo").select("*").order("nombre"),
        supabase.from("contenedor_insumos").select("*").order("fecha", { ascending: false }),
        supabase.from("contenedor_rendimientos").select("*").order("fecha", { ascending: false }),
      ]);
      if (cancelled) return;
      if (!e1) setProcesos((conts   || []).map(rowToCont));
      if (!e2) setGrupos(  (grups   || []).map(rowToGrupo));
      if (!e3) setContInsumos((insumos || []).map(rowToInsumo));
      if (!e4) setRendimientos((rends  || []).map(rowToRendimiento));
      if (e1) console.error("[contenedores]", e1.message);
      if (e2) console.error("[grupos_trabajo]", e2.message);
      if (e3) console.error("[contenedor_insumos]", e3.message);
      if (e4) console.error("[contenedor_rendimientos]", e4.message);
      setLoading(false);
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // ── Suscripciones en tiempo real (sync con otros usuarios) ──
  useEffect(() => {
    const refetch = (table, setter, mapper) => () => {
      const q = supabase.from(table).select("*");
      if (table === "contenedores")              q.order("fecha", { ascending: false });
      if (table === "grupos_trabajo")            q.order("nombre");
      if (table === "contenedor_insumos")        q.order("fecha", { ascending: false });
      if (table === "contenedor_rendimientos")   q.order("fecha", { ascending: false });
      q.then(({ data }) => data && setter(data.map(mapper)));
    };

    const ch = supabase.channel(`contenedores-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "contenedores" },
          refetch("contenedores", setProcesos, rowToCont))
      .on("postgres_changes", { event: "*", schema: "public", table: "grupos_trabajo" },
          refetch("grupos_trabajo", setGrupos, rowToGrupo))
      .on("postgres_changes", { event: "*", schema: "public", table: "contenedor_insumos" },
          refetch("contenedor_insumos", setContInsumos, rowToInsumo))
      .on("postgres_changes", { event: "*", schema: "public", table: "contenedor_rendimientos" },
          refetch("contenedor_rendimientos", setRendimientos, rowToRendimiento))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── CONTENEDORES ─────────────────────────────────────────────

  const guardarContenedor = useCallback(async (form, id = null) => {
    const row = {
      fecha:          form.fecha,
      num_contenedor: form.numContenedor,
      proveedor:      form.proveedor      || null,
      producto:       form.producto       || null,
      cajas_salida:   form.cajasSalida    ? Number(form.cajasSalida) : null,
      turno:          form.turno,
      estado:         form.estado,
      operadores:     form.operadores     || null,
      transporte:     form.transporte     || null,
      placa:          form.placa          || null,
      trailer:        form.trailer        || null,
      obs:            form.obs            || null,
      grupo_dia:      form.grupoDia       || null,
      grupo_noche:    form.grupoNoche     || null,
      booking:        form.booking        || null,
      naviera:        form.naviera        || null,
      vessel:         form.vessel         || null,
      destino:        form.destino        || null,
      logistica_booking_id: form.logisticaBookingId || null,
      trazabilidad:   form.trazabilidad   || [],
    };

    if (id) {
      // Optimistic update
      setProcesos(prev => prev.map(p => p.id === id ? rowToCont({ ...row, id }) : p));
      const { error } = await supabase.from("contenedores").update(row).eq("id", id);
      if (error) {
        // Revertir — recargar desde DB
        supabase.from("contenedores").select("*").order("fecha", { ascending: false })
          .then(({ data }) => data && setProcesos(data.map(rowToCont)));
      }
      return !error;
    } else {
      row.id = Date.now();
      // Optimistic insert
      setProcesos(prev => [rowToCont(row), ...prev]);
      const { error } = await supabase.from("contenedores").insert(row);
      if (error) setProcesos(prev => prev.filter(p => p.id !== row.id));
      return !error;
    }
  }, []);

  const eliminarContenedor = useCallback(async (id) => {
    const removed = procesos.find(p => p.id === id);
    const removedInsumos = contInsumos.filter(c => c.contId === id);
    // Optimistic remove
    setProcesos(prev => prev.filter(p => p.id !== id));
    setContInsumos(prev => prev.filter(c => c.contId !== id));
    const { error: errorInsumos } = await supabase.from("contenedor_insumos").delete().eq("cont_id", id);
    const { error } = await supabase.from("contenedores").delete().eq("id", id);
    if (error && removed) setProcesos(prev => [removed, ...prev]);
    if (errorInsumos && removedInsumos.length) setContInsumos(prev => [...removedInsumos, ...prev]);
    return !error && !errorInsumos;
  }, [procesos, contInsumos]);

  const agregarTrazabilidad = useCallback(async (contId, evento) => {
    const cont = procesos.find(p => p.id === contId);
    if (!cont) return false;
    const nuevaTraz = [...(cont.trazabilidad || []), evento];
    setProcesos(prev => prev.map(p => p.id === contId ? { ...p, trazabilidad: nuevaTraz } : p));
    const { error } = await supabase.from("contenedores")
      .update({ trazabilidad: nuevaTraz })
      .eq("id", contId);
    if (error) setProcesos(prev => prev.map(p => p.id === contId ? cont : p));
    return !error;
  }, [procesos]);

  const cambiarEstado = useCallback(async (contId, nuevoEstado) => {
    const cont = procesos.find(p => p.id === contId);
    if (!cont) return false;
    const ev = { evento: `Estado cambiado a: ${nuevoEstado}`, detalle: "", responsable: "JARVIS", fecha: new Date().toISOString() };
    const nuevaTraz = [...(cont.trazabilidad || []), ev];
    // Optimistic update
    setProcesos(prev => prev.map(p => p.id === contId ? { ...p, estado: nuevoEstado, trazabilidad: nuevaTraz } : p));
    const { error } = await supabase.from("contenedores")
      .update({ estado: nuevoEstado, trazabilidad: nuevaTraz })
      .eq("id", contId);
    if (error) setProcesos(prev => prev.map(p => p.id === contId ? cont : p));
    return !error;
  }, [procesos]);

  // ── GRUPOS ───────────────────────────────────────────────────

  const guardarGrupo = useCallback(async (form, id = null) => {
    const row = { nombre: form.nombre, turno: form.turno, miembros: form.miembros };
    if (id) {
      // Optimistic update
      setGrupos(prev => prev.map(g => g.id === id ? rowToGrupo({ ...row, id }) : g));
      const { error } = await supabase.from("grupos_trabajo").update(row).eq("id", id);
      if (error) {
        supabase.from("grupos_trabajo").select("*").order("nombre")
          .then(({ data }) => data && setGrupos(data.map(rowToGrupo)));
      }
      return !error;
    } else {
      row.id = Date.now();
      // Optimistic insert
      setGrupos(prev => [...prev, rowToGrupo(row)].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      const { error } = await supabase.from("grupos_trabajo").insert(row);
      if (error) setGrupos(prev => prev.filter(g => g.id !== row.id));
      return !error;
    }
  }, []);

  const eliminarGrupo = useCallback(async (id) => {
    const removed = grupos.find(g => g.id === id);
    // Optimistic remove
    setGrupos(prev => prev.filter(g => g.id !== id));
    const { error } = await supabase.from("grupos_trabajo").delete().eq("id", id);
    if (error && removed) setGrupos(prev => [...prev, removed].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    return !error;
  }, [grupos]);

  // ── CENTRO DE COSTOS ─────────────────────────────────────────

  const guardarCC = useCallback(async ({ contId, contNum, items, extras, total, editId = null }) => {
    const row = {
      cont_id:  contId,
      cont_num: contNum,
      items:    items  || [],
      extras:   extras || [],
      fecha:    new Date().toISOString().split("T")[0],
      total:    total  || 0,
    };
    if (editId) {
      // Optimistic update
      setContInsumos(prev => prev.map(c => c.id === editId ? rowToInsumo({ ...row, id: editId }) : c));
      const { error } = await supabase.from("contenedor_insumos").update(row).eq("id", editId);
      if (error) {
        supabase.from("contenedor_insumos").select("*").order("fecha", { ascending: false })
          .then(({ data }) => data && setContInsumos(data.map(rowToInsumo)));
      }
      return !error;
    } else {
      row.id = Date.now();
      // Optimistic insert
      setContInsumos(prev => [rowToInsumo(row), ...prev]);
      const { error } = await supabase.from("contenedor_insumos").insert(row);
      if (error) setContInsumos(prev => prev.filter(c => c.id !== row.id));
      return !error;
    }
  }, []);

  const eliminarCC = useCallback(async (id) => {
    const removed = contInsumos.find(c => c.id === id);
    // Optimistic remove
    setContInsumos(prev => prev.filter(c => c.id !== id));
    const { error } = await supabase.from("contenedor_insumos").delete().eq("id", id);
    if (error && removed) setContInsumos(prev => [removed, ...prev]);
    return !error;
  }, [contInsumos]);

  // ── RENDIMIENTOS ─────────────────────────────────────────────

  const guardarRendimiento = useCallback(async (form, editId = null) => {
    const newId = editId || Date.now();
    const row = {
      id:               newId,
      cont_id:          form.contId,
      cont_num:         form.contNum         || null,
      fecha:            form.fecha,
      proveedor:        form.proveedor        || null,
      kilos_procesados:    Number(form.kilosProcesados)    || 0,
      kilos_devueltos:  Number(form.kilosDevueltos)  || 0,
      kilos_primera_devueltos: Number(form.kilosPrimeraDevueltos) || 0,
      cajas_del_monte:  Number(form.cajasDelMonte)   || 0,
      cajas_princess:   Number(form.cajasPrincess)   || 0,
      observaciones:    form.observaciones   || [],
      obs_detalle:      form.obsDetalle      || null,
      calibres:         form.calibres        || [],
    };

    const newRend = rowToRendimiento(row);

    // Optimistic update
    if (editId) {
      setRendimientos(prev => prev.map(r => r.id === editId ? newRend : r));
    } else {
      setRendimientos(prev => [newRend, ...prev]);
    }

    const tryUpsert = async (r) => {
      if (editId) {
        const { error } = await supabase.from("contenedor_rendimientos").update(r).eq("id", editId);
        return error || null;
      } else {
        const { error } = await supabase.from("contenedor_rendimientos").insert(r);
        return error || null;
      }
    };

    let error = await tryUpsert({ ...row });
    if (error) {
      const isColError = error.message?.includes("proveedor") || error.code === "42703";
      if (isColError) {
        const { proveedor: _, ...rowSinProv } = row;
        error = await tryUpsert(rowSinProv);
      }
    }

    if (error) {
      // Revertir
      if (editId) {
        supabase.from("contenedor_rendimientos").select("*").order("fecha", { ascending: false })
          .then(({ data }) => data && setRendimientos(data.map(rowToRendimiento)));
      } else {
        setRendimientos(prev => prev.filter(r => r.id !== newId));
      }
    }

    return !error;
  }, []);

  const eliminarRendimiento = useCallback(async (id) => {
    const removed = rendimientos.find(r => r.id === id);
    // Optimistic remove
    setRendimientos(prev => prev.filter(r => r.id !== id));
    const { error } = await supabase.from("contenedor_rendimientos").delete().eq("id", id);
    if (error && removed) setRendimientos(prev => [removed, ...prev]);
    return !error;
  }, [rendimientos]);

  return {
    procesos, grupos, contInsumos, rendimientos, loading,
    guardarContenedor, eliminarContenedor, agregarTrazabilidad, cambiarEstado,
    guardarGrupo, eliminarGrupo,
    guardarCC, eliminarCC,
    guardarRendimiento, eliminarRendimiento,
  };
}
