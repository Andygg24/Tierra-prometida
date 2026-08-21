import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const COLUMNAS_LISTA = "id, nombre, tipo, tamano_kb, subido_por, created_at";

const rowToArchivo = (r) => ({
  id:        r.id,
  nombre:    r.nombre     || "",
  tipo:      r.tipo       || "",
  tamanoKb:  r.tamano_kb != null ? Number(r.tamano_kb) : 0,
  subidoPor: r.subido_por || "",
  createdAt: r.created_at || "",
});

// El contenido (base64 del archivo completo) se deja fuera del listado a
// propósito — puede pesar varios MB por archivo, y no hace falta traerlo
// para mostrar la lista. Solo se pide con `descargar(id)` cuando el
// usuario realmente quiere abrir/descargar ese archivo puntual.
export function useInformes() {
  const [archivos, setArchivos] = useState([]);
  const [loading, setLoading] = useState(true);

  const recargar = useCallback(() => {
    supabase.from("informes_archivos").select(COLUMNAS_LISTA).order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error) setArchivos((data || []).map(rowToArchivo));
        else console.error("[informes_archivos]", error.message);
      });
  }, []);

  useEffect(() => {
    let cancelado = false;
    supabase.from("informes_archivos").select(COLUMNAS_LISTA).order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelado) return;
        if (!error) setArchivos((data || []).map(rowToArchivo));
        setLoading(false);
      });
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    const ch = supabase.channel(`informes-archivos-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "informes_archivos" }, recargar)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [recargar]);

  const guardar = useCallback(async ({ nombre, tipo, tamanoKb, contenido, subidoPor }) => {
    const row = {
      id: Date.now(),
      nombre, tipo: tipo || null,
      tamano_kb: tamanoKb || 0,
      contenido,
      subido_por: subidoPor || null,
    };
    setArchivos(prev => [rowToArchivo(row), ...prev]);
    const { error } = await supabase.from("informes_archivos").insert(row);
    if (error) { setArchivos(prev => prev.filter(a => a.id !== row.id)); return false; }
    return true;
  }, []);

  const eliminar = useCallback(async (id) => {
    const removido = archivos.find(a => a.id === id);
    setArchivos(prev => prev.filter(a => a.id !== id));
    const { error } = await supabase.from("informes_archivos").delete().eq("id", id);
    if (error && removido) setArchivos(prev => [removido, ...prev].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
    return !error;
  }, [archivos]);

  const descargar = useCallback(async (id) => {
    const { data, error } = await supabase.from("informes_archivos").select("contenido").eq("id", id).maybeSingle();
    if (error || !data) return null;
    return data.contenido;
  }, []);

  return { archivos, loading, guardar, eliminar, descargar };
}
