import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const rowToSolicitud = (r) => ({
  id:            r.id,
  items:         Array.isArray(r.items) ? r.items : [],
  area:          r.area || "",
  prioridad:     r.prioridad || "Media",
  obs:           r.obs || "",
  estado:        r.estado || "Pendiente",
  solicitadoPor: r.solicitado_por || "",
  trazabilidad:  Array.isArray(r.trazabilidad) ? r.trazabilidad : [],
  createdAt:     r.created_at || "",
});

export function useSolicitudesPlanta() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    supabase.from("solicitudes_planta").select("*").order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelado) return;
        if (!error) setSolicitudes((data || []).map(rowToSolicitud));
        else console.error("[solicitudes_planta]", error.message);
        setLoading(false);
      });
    return () => { cancelado = true; };
  }, []);

  // ── Tiempo real (sync con otros usuarios) ──
  // Aplica el payload del evento directo, sin volver a leer la tabla entera
  // — un refetch aparte puede, por el pool de conexiones, alcanzar a leer
  // la fila todavía sin confirmar y pisar un cambio recién hecho (mismo bug
  // que ya se vio en Control Expo con las Declaraciones de Cambio).
  useEffect(() => {
    const ch = supabase.channel(`solicitudes-planta-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitudes_planta" }, ({ new: row, old, eventType }) => {
        if (eventType === "DELETE") {
          setSolicitudes(prev => prev.filter(s => s.id !== old.id));
          return;
        }
        if (!row) return;
        const nuevo = rowToSolicitud(row);
        setSolicitudes(prev => prev.some(s => s.id === nuevo.id) ? prev.map(s => s.id === nuevo.id ? nuevo : s) : [nuevo, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const crear = useCallback(async ({ items, area, prioridad, obs, solicitadoPor }) => {
    const ev = { evento: "Solicitud creada", responsable: solicitadoPor || "", fecha: new Date().toISOString() };
    const row = {
      id:             Date.now(),
      items:          items.map(it => ({
        item:    it.item.trim(),
        cantidad: it.cantidad !== "" && it.cantidad != null ? Number(it.cantidad) : null,
        unidad:  it.unidad || null,
      })),
      area:           area || null,
      prioridad:      prioridad || "Media",
      obs:            obs || null,
      estado:         "Pendiente",
      solicitado_por: solicitadoPor || null,
      trazabilidad:   [ev],
    };
    // Optimistic insert
    setSolicitudes(prev => [rowToSolicitud(row), ...prev]);
    const { error } = await supabase.from("solicitudes_planta").insert(row);
    if (error) setSolicitudes(prev => prev.filter(s => s.id !== row.id));
    return !error;
  }, []);

  // Edita los datos de la solicitud (ítems, área, prioridad, obs) sin
  // tocar su estado — para corregir errores (ej. cantidad mal escrita).
  const actualizar = useCallback(async (id, { items, area, prioridad, obs, responsable }) => {
    const actual = solicitudes.find(s => s.id === id);
    if (!actual) return false;
    const ev = { evento: "Solicitud editada", responsable: responsable || "", fecha: new Date().toISOString() };
    const nuevaTraz = [...(actual.trazabilidad || []), ev];
    const itemsLimpios = items.map(it => ({
      item:     it.item.trim(),
      cantidad: it.cantidad !== "" && it.cantidad != null ? Number(it.cantidad) : null,
      unidad:   it.unidad || null,
    }));
    const nuevo = { ...actual, items: itemsLimpios, area: area || "", prioridad: prioridad || "Media", obs: obs || "", trazabilidad: nuevaTraz };
    setSolicitudes(prev => prev.map(s => s.id === id ? nuevo : s));
    const { error } = await supabase.from("solicitudes_planta")
      .update({ items: itemsLimpios, area: area || null, prioridad: prioridad || "Media", obs: obs || null, trazabilidad: nuevaTraz })
      .eq("id", id);
    if (error) setSolicitudes(prev => prev.map(s => s.id === id ? actual : s));
    return !error;
  }, [solicitudes]);

  // nuevoEstado: "Aprobado" | "Rechazado" | "Comprado" | "Entregado"
  const cambiarEstado = useCallback(async (id, nuevoEstado, { responsable, nota } = {}) => {
    const actual = solicitudes.find(s => s.id === id);
    if (!actual) return false;
    const ev = { evento: `Estado cambiado a: ${nuevoEstado}`, detalle: nota || "", responsable: responsable || "", fecha: new Date().toISOString() };
    const nuevaTraz = [...(actual.trazabilidad || []), ev];
    // Optimistic update
    setSolicitudes(prev => prev.map(s => s.id === id ? { ...s, estado: nuevoEstado, trazabilidad: nuevaTraz } : s));
    const { error } = await supabase.from("solicitudes_planta")
      .update({ estado: nuevoEstado, trazabilidad: nuevaTraz })
      .eq("id", id);
    if (error) setSolicitudes(prev => prev.map(s => s.id === id ? actual : s));
    return !error;
  }, [solicitudes]);

  const eliminar = useCallback(async (id) => {
    const removido = solicitudes.find(s => s.id === id);
    setSolicitudes(prev => prev.filter(s => s.id !== id));
    const { error } = await supabase.from("solicitudes_planta").delete().eq("id", id);
    if (error && removido) setSolicitudes(prev => [removido, ...prev].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
    return !error;
  }, [solicitudes]);

  return { solicitudes, loading, crear, actualizar, cambiarEstado, eliminar };
}
