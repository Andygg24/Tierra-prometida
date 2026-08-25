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
  useEffect(() => {
    const ch = supabase.channel(`solicitudes-planta-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitudes_planta" }, () => {
        supabase.from("solicitudes_planta").select("*").order("created_at", { ascending: false })
          .then(({ data }) => data && setSolicitudes(data.map(rowToSolicitud)));
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
    if (error) { setSolicitudes(prev => prev.filter(s => s.id !== row.id)); return false; }
    // Avisar al Jefe por correo — si falla el envío, la solicitud ya quedó
    // guardada de todos modos (no se le muestra error al usuario por esto).
    fetch("/api/notificar-pedido", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: row.items, area: row.area, prioridad: row.prioridad, obs: row.obs, solicitadoPor: row.solicitado_por }),
    }).catch(e => console.error("[notificar-pedido]", e.message));
    return true;
  }, []);

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

  return { solicitudes, loading, crear, cambiarEstado, eliminar };
}
