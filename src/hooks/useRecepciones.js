import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const rowToRecepcion = (r) => ({
  id:         r.id,
  remision:   r.remision   || "",
  fecha:      r.fecha      || "",
  tipo:       r.tipo       || "entrada",
  placa:      r.placa      || "",
  conductor:  r.conductor  || "",
  cedulaConductor: r.cedula_conductor || "",
  origen:     r.origen     || "",
  proveedor:  r.proveedor  || "",
  supervisor: r.supervisor || "",
  horaInicio: r.hora_inicio || "",
  horaFin:    r.hora_fin    || "",
  observaciones: r.observaciones || "",
  estibas:    Array.isArray(r.estibas) ? r.estibas : [],
  total:      Number(r.total || 0),
});

const rowToAsignacion = (r) => ({
  id:                  r.id,
  recepcionId:         r.recepcion_id,
  numeroEstiba:        r.numero_estiba,
  contenedorId:        r.contenedor_id,
  cantidadCanastillas: r.cantidad_canastillas != null ? Number(r.cantidad_canastillas) : 0,
  obs:                 r.obs             || "",
  registradoPor:       r.registrado_por  || "",
  createdAt:           r.created_at      || "",
});

export function useRecepciones() {
  const [recepciones,   setRecepciones]   = useState([]);
  const [asignaciones,  setAsignaciones]  = useState([]);
  const [loading,       setLoading]       = useState(true);

  // ── Carga inicial ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const [{ data, error }, { data: asigs, error: e2 }] = await Promise.all([
        supabase.from("recepciones").select("*")
          .order("fecha", { ascending: false }).order("id", { ascending: false }),
        supabase.from("recepciones_asignaciones").select("*"),
      ]);
      if (cancelled) return;
      if (!error) setRecepciones((data || []).map(rowToRecepcion));
      else console.error("[recepciones]", error.message);
      if (!e2) setAsignaciones((asigs || []).map(rowToAsignacion));
      else console.error("[recepciones_asignaciones]", e2.message);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "recepciones_asignaciones" }, () => {
        supabase.from("recepciones_asignaciones").select("*")
          .then(({ data }) => data && setAsignaciones(data.map(rowToAsignacion)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Mutaciones — recepciones ───────────────────────────────────

  const guardarRecepcion = useCallback(async (form, id = null) => {
    const row = {
      remision:    form.remision    || null,
      fecha:       form.fecha,
      tipo:        form.tipo        || "entrada",
      placa:       form.placa       || null,
      conductor:   form.conductor   || null,
      cedula_conductor: form.cedulaConductor || null,
      origen:      form.origen      || null,
      proveedor:   form.proveedor   || null,
      supervisor:  form.supervisor  || null,
      hora_inicio: form.horaInicio  || null,
      hora_fin:    form.horaFin     || null,
      observaciones: form.observaciones || null,
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

  // Actualiza solo el arreglo de estibas — usado por Verificación de Estibas
  // para marcar una estiba como "usada" al escanear su tirilla, sin tener
  // que reenviar el resto de la recepción.
  const actualizarEstibas = useCallback(async (id, estibas) => {
    const { error } = await supabase.from("recepciones")
      .update({ estibas, updated_at: new Date().toISOString() }).eq("id", id);
    if (!error) setRecepciones(prev => prev.map(r => r.id === id ? { ...r, estibas } : r));
    return !error;
  }, []);

  // ── Mutaciones — asignaciones a contenedor (Asociar Contenedor) ────────
  // Una estiba puede repartirse entre varios contenedores — cada asignación
  // guarda cuántas canastillas de esa estiba fueron para ese contenedor.

  const guardarAsignacion = useCallback(async (form) => {
    const row = {
      id:                   Date.now(),
      recepcion_id:         form.recepcionId,
      numero_estiba:        Number(form.numeroEstiba),
      contenedor_id:        form.contenedorId,
      cantidad_canastillas: Number(form.cantidadCanastillas) || 0,
      obs:                  form.obs || null,
      registrado_por:       form.registradoPor || null,
    };
    setAsignaciones(prev => [rowToAsignacion(row), ...prev]);
    const { error } = await supabase.from("recepciones_asignaciones").insert(row);
    if (error) setAsignaciones(prev => prev.filter(a => a.id !== row.id));
    return !error;
  }, []);

  const eliminarAsignacion = useCallback(async (id) => {
    const removed = asignaciones.find(a => a.id === id);
    setAsignaciones(prev => prev.filter(a => a.id !== id));
    const { error } = await supabase.from("recepciones_asignaciones").delete().eq("id", id);
    if (error && removed) setAsignaciones(prev => [removed, ...prev]);
    return !error;
  }, [asignaciones]);

  return {
    recepciones, asignaciones, loading,
    guardarRecepcion, eliminarRecepcion, actualizarEstibas,
    guardarAsignacion, eliminarAsignacion,
  };
}
