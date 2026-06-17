import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

// ── Conversor Supabase → formato que usa el frontend ────────────
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
  destino:       r.destino         || "",
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
  kilosProcesados: Number(r.kilos_procesados) || 0,
  kilosDevueltos:  Number(r.kilos_devueltos)  || 0,
  cajasDelMonte:   Number(r.cajas_del_monte)  || 0,
  cajasPrincess:   Number(r.cajas_princess)   || 0,
  observaciones:   Array.isArray(r.observaciones) ? r.observaciones : [],
  obsDetalle:      r.obs_detalle || "",
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
      if (e1 || e2 || e3 || e4) { setLoading(false); return; }
      if (cancelled) return;
      setProcesos((conts   || []).map(rowToCont));
      setGrupos(  (grups   || []).map(rowToGrupo));
      setContInsumos((insumos || []).map(rowToInsumo));
      setRendimientos((rends  || []).map(rowToRendimiento));
      setLoading(false);
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // ── Suscripciones en tiempo real ─────────────────────────────
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
      destino:        form.destino        || null,
      trazabilidad:   form.trazabilidad   || [],
    };
    if (id) {
      const { error } = await supabase.from("contenedores").update(row).eq("id", id);
      return !error;
    } else {
      row.id = Date.now();
      const { error } = await supabase.from("contenedores").insert(row);
      return !error;
    }
  }, []);

  const eliminarContenedor = useCallback(async (id) => {
    await supabase.from("contenedor_insumos").delete().eq("cont_id", id);
    const { error } = await supabase.from("contenedores").delete().eq("id", id);
    return !error;
  }, []);

  const agregarTrazabilidad = useCallback(async (contId, evento) => {
    const cont = procesos.find(p => p.id === contId);
    if (!cont) return false;
    const nuevaTraz = [...(cont.trazabilidad || []), evento];
    setProcesos(prev => prev.map(p => p.id === contId ? { ...p, trazabilidad: nuevaTraz } : p));
    const { error } = await supabase.from("contenedores")
      .update({ trazabilidad: nuevaTraz })
      .eq("id", contId);
    return !error;
  }, [procesos]);

  const cambiarEstado = useCallback(async (contId, nuevoEstado) => {
    const cont = procesos.find(p => p.id === contId);
    if (!cont) return false;
    const ev = { evento: `Estado cambiado a: ${nuevoEstado}`, detalle: "", responsable: "JARVIS", fecha: new Date().toISOString() };
    const nuevaTraz = [...(cont.trazabilidad || []), ev];
    setProcesos(prev => prev.map(p => p.id === contId ? { ...p, estado: nuevoEstado, trazabilidad: nuevaTraz } : p));
    const { error } = await supabase.from("contenedores")
      .update({ estado: nuevoEstado, trazabilidad: nuevaTraz })
      .eq("id", contId);
    return !error;
  }, [procesos]);

  // ── GRUPOS ───────────────────────────────────────────────────

  const guardarGrupo = useCallback(async (form, id = null) => {
    const row = { nombre: form.nombre, turno: form.turno, miembros: form.miembros };
    if (id) {
      const { error } = await supabase.from("grupos_trabajo").update(row).eq("id", id);
      return !error;
    } else {
      row.id = Date.now();
      const { error } = await supabase.from("grupos_trabajo").insert(row);
      return !error;
    }
  }, []);

  const eliminarGrupo = useCallback(async (id) => {
    const { error } = await supabase.from("grupos_trabajo").delete().eq("id", id);
    return !error;
  }, []);

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
      const { error } = await supabase.from("contenedor_insumos").update(row).eq("id", editId);
      return !error;
    } else {
      row.id = Date.now();
      const { error } = await supabase.from("contenedor_insumos").insert(row);
      return !error;
    }
  }, []);

  const eliminarCC = useCallback(async (id) => {
    const { error } = await supabase.from("contenedor_insumos").delete().eq("id", id);
    return !error;
  }, []);

  // ── RENDIMIENTOS ─────────────────────────────────────────────

  const guardarRendimiento = useCallback(async (form, editId = null) => {
    const row = {
      cont_id:          form.contId,
      cont_num:         form.contNum         || null,
      fecha:            form.fecha,
      proveedor:        form.proveedor        || null,
      kilos_procesados: Number(form.kilosProcesados) || 0,
      kilos_devueltos:  Number(form.kilosDevueltos)  || 0,
      cajas_del_monte:  Number(form.cajasDelMonte)   || 0,
      cajas_princess:   Number(form.cajasPrincess)   || 0,
      observaciones:    form.observaciones   || [],
      obs_detalle:      form.obsDetalle      || null,
    };

    const tryUpsert = async (r) => {
      if (editId) {
        const { error } = await supabase.from("contenedor_rendimientos").update(r).eq("id", editId);
        return error || null;
      } else {
        r.id = r.id || Date.now();
        const { error } = await supabase.from("contenedor_rendimientos").insert(r);
        return error || null;
      }
    };

    let error = await tryUpsert({ ...row });
    if (error) {
      // Si falla por columna proveedor inexistente, reintentar sin ella
      const isColError = error.message?.includes("proveedor") || error.code === "42703";
      if (isColError) {
        const { proveedor: _, ...rowSinProv } = row;
        error = await tryUpsert(rowSinProv);
      }
    }
    return !error;
  }, []);

  const eliminarRendimiento = useCallback(async (id) => {
    const { error } = await supabase.from("contenedor_rendimientos").delete().eq("id", id);
    return !error;
  }, []);

  return {
    procesos, grupos, contInsumos, rendimientos, loading,
    guardarContenedor, eliminarContenedor, agregarTrazabilidad, cambiarEstado,
    guardarGrupo, eliminarGrupo,
    guardarCC, eliminarCC,
    guardarRendimiento, eliminarRendimiento,
  };
}
