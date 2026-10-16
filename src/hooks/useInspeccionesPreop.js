import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";
import { conReintentos } from "../utils/consultas.js";

// Registro de Inspección Pre-Operacional Diario (TP-DOP-FOR-001). Una fila por
// semana; son livianas (sin fotos), así que se traen las últimas LIMITE de una vez.
const LIMITE = 300;
const TABLA  = "operaciones_inspeccion_preop";

// La lista NO trae las firmas (imágenes en base64): se piden aparte con
// `cargarFirmas` al abrir una semana.
const COLS_LISTA = [
  "id", "semana_inicio", "marcas", "iniciales", "observaciones",
  "realizo_nombre", "realizo_cargo", "realizo_fecha",
  "inocuidad_nombre", "inocuidad_cargo", "inocuidad_fecha",
  "jefe_nombre", "jefe_cargo", "jefe_fecha",
  "registrado_por", "created_at",
].join(",");

const sinFirmas = ({ firma_realizo, firma_inocuidad, firma_jefe, ...resto }) => resto; // eslint-disable-line no-unused-vars

const rowToInspeccion = (r) => ({
  id:              r.id,
  semanaInicio:    r.semana_inicio    || "",
  marcas:          r.marcas && typeof r.marcas === "object" ? r.marcas : {},
  iniciales:       Array.isArray(r.iniciales) ? r.iniciales : [],
  observaciones:   r.observaciones    || "",
  realizoNombre:   r.realizo_nombre   || "",
  realizoCargo:    r.realizo_cargo    || "",
  realizoFecha:    r.realizo_fecha    || "",
  inocuidadNombre: r.inocuidad_nombre || "",
  inocuidadCargo:  r.inocuidad_cargo  || "",
  inocuidadFecha:  r.inocuidad_fecha  || "",
  jefeNombre:      r.jefe_nombre      || "",
  jefeCargo:       r.jefe_cargo       || "",
  jefeFecha:       r.jefe_fecha       || "",
  firmaRealizo:    r.firma_realizo    || "",
  firmaInocuidad:  r.firma_inocuidad  || "",
  firmaJefe:       r.firma_jefe       || "",
  registradoPor:   r.registrado_por   || "",
  createdAt:       r.created_at       || "",
});

const porSemanaDesc = (a, b) => (b.semanaInicio || "").localeCompare(a.semanaInicio || "") || b.id - a.id;

export function useInspeccionesPreop() {
  const [inspecciones, setInspecciones] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [errorCarga, setErrorCarga]     = useState("");
  const [tick, setTick]                 = useState(0);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const { data, error } = await conReintentos(() =>
        supabase.from(TABLA).select(COLS_LISTA)
          .order("semana_inicio", { ascending: false }).limit(LIMITE));
      if (!vigente) return;
      if (error) setErrorCarga(error.message || "error de conexión");
      else { setInspecciones((data || []).map(rowToInspeccion).sort(porSemanaDesc)); setErrorCarga(""); }
      setLoading(false);
    })();
    return () => { vigente = false; };
  }, [tick]);

  useEffect(() => {
    const ch = supabase.channel(`inspeccion-preop-changes-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: TABLA }, () => setTick(t => t + 1))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const recargar = useCallback(() => setTick(t => t + 1), []);

  // Devuelve { ok, id, duplicada } — duplicada = ya existe un registro de esa semana.
  const guardarInspeccion = useCallback(async (form, id = null) => {
    const row = {
      semana_inicio:    form.semanaInicio    || null,
      marcas:           form.marcas          || {},
      iniciales:        Array.isArray(form.iniciales) ? form.iniciales : [],
      observaciones:    form.observaciones   || null,
      realizo_nombre:   form.realizoNombre   || null,
      realizo_cargo:    form.realizoCargo    || null,
      realizo_fecha:    form.realizoFecha    || null,
      inocuidad_nombre: form.inocuidadNombre || null,
      inocuidad_cargo:  form.inocuidadCargo  || null,
      inocuidad_fecha:  form.inocuidadFecha  || null,
      jefe_nombre:      form.jefeNombre      || null,
      jefe_cargo:       form.jefeCargo       || null,
      jefe_fecha:       form.jefeFecha       || null,
      firma_realizo:    form.firmaRealizo    || null,
      firma_inocuidad:  form.firmaInocuidad  || null,
      firma_jefe:       form.firmaJefe       || null,
      registrado_por:   form.registradoPor   || null,
      updated_at:       new Date().toISOString(),
    };

    if (id) {
      const { error } = await supabase.from(TABLA).update(row).eq("id", id);
      if (error) { console.error("[inspeccion-preop]", error.message); return { ok: false, id, duplicada: error.code === "23505" }; }
      setInspecciones(prev => prev.map(x => x.id === id ? rowToInspeccion({ ...sinFirmas(row), id }) : x).sort(porSemanaDesc));
      return { ok: true, id };
    }
    row.id = Date.now();
    const { error } = await supabase.from(TABLA).insert(row);
    if (error) { console.error("[inspeccion-preop]", error.message); return { ok: false, id: null, duplicada: error.code === "23505" }; }
    setInspecciones(prev => [rowToInspeccion(sinFirmas(row)), ...prev].sort(porSemanaDesc));
    return { ok: true, id: row.id };
  }, []);

  const cargarFirmas = useCallback(async (id) => {
    const { data, error } = await conReintentos(() =>
      supabase.from(TABLA).select("firma_realizo,firma_inocuidad,firma_jefe").eq("id", id).single());
    if (error) { console.error("[inspeccion-preop]", error.message); return { ok: false }; }
    return {
      ok: true,
      firmas: {
        firmaRealizo:   data.firma_realizo   || "",
        firmaInocuidad: data.firma_inocuidad || "",
        firmaJefe:      data.firma_jefe      || "",
      },
    };
  }, []);

  const eliminarInspeccion = useCallback(async (id) => {
    const { error } = await supabase.from(TABLA).delete().eq("id", id);
    if (error) { console.error("[inspeccion-preop]", error.message); return false; }
    setInspecciones(prev => prev.filter(x => x.id !== id));
    return true;
  }, []);

  return { inspecciones, loading, errorCarga, recargar, guardarInspeccion, cargarFirmas, eliminarInspeccion };
}
