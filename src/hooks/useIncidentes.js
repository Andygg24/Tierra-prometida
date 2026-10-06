import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";
import { conReintentos } from "../utils/consultas.js";

// Registros NUOCA (TP-DOP-REG-021). Son filas livianas (sin fotos), así que
// se traen las últimas LIMITE de una vez y la búsqueda se hace en memoria.
const LIMITE = 500;
const TABLA  = "operaciones_incidentes";

// La lista NO trae las firmas (cada una es una imagen en base64): se piden
// aparte con `cargarFirmas` al abrir un incidente.
const COLS_LISTA = [
  "id", "fecha", "hora", "lugar", "reporta_nombre", "reporta_cargo", "lote_afectado", "linea_maquinaria",
  "tipos", "tipo_otro", "descripcion", "acciones_correctivas", "acciones_preventivas",
  "supervision_nombre", "supervision_cargo", "supervision_fecha",
  "verificacion_nombre", "verificacion_cargo", "verificacion_fecha",
  "registrado_por", "created_at",
].join(",");

const sinFirmas = ({ firma_reporta, firma_supervision, firma_verificacion, ...resto }) => resto; // eslint-disable-line no-unused-vars

const rowToIncidente = (r) => ({
  id:                  r.id,
  fecha:               r.fecha                || "",
  hora:                r.hora                 || "",
  lugar:               r.lugar                || "",
  reportaNombre:       r.reporta_nombre       || "",
  reportaCargo:        r.reporta_cargo        || "",
  loteAfectado:        r.lote_afectado        || "",
  lineaMaquinaria:     r.linea_maquinaria     || "",
  tipos:               Array.isArray(r.tipos) ? r.tipos : [],
  tipoOtro:            r.tipo_otro            || "",
  descripcion:         r.descripcion          || "",
  accionesCorrectivas: r.acciones_correctivas || "",
  accionesPreventivas: r.acciones_preventivas || "",
  supervisionNombre:   r.supervision_nombre   || "",
  supervisionCargo:    r.supervision_cargo    || "",
  supervisionFecha:    r.supervision_fecha    || "",
  verificacionNombre:  r.verificacion_nombre  || "",
  verificacionCargo:   r.verificacion_cargo   || "",
  verificacionFecha:   r.verificacion_fecha   || "",
  firmaReporta:        r.firma_reporta        || "",
  firmaSupervision:    r.firma_supervision    || "",
  firmaVerificacion:   r.firma_verificacion   || "",
  registradoPor:       r.registrado_por       || "",
  createdAt:           r.created_at           || "",
});

const porFechaDesc = (a, b) =>
  (b.fecha || "").localeCompare(a.fecha || "") || (b.hora || "").localeCompare(a.hora || "") || b.id - a.id;

export function useIncidentes() {
  const [incidentes, setIncidentes] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [tick, setTick]             = useState(0);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const { data, error } = await conReintentos(() =>
        supabase.from(TABLA).select(COLS_LISTA)
          .order("fecha", { ascending: false }).order("id", { ascending: false }).limit(LIMITE));
      if (!vigente) return;
      if (error) setErrorCarga(error.message || "error de conexión");
      else { setIncidentes((data || []).map(rowToIncidente).sort(porFechaDesc)); setErrorCarga(""); }
      setLoading(false);
    })();
    return () => { vigente = false; };
  }, [tick]);

  useEffect(() => {
    const ch = supabase.channel(`incidentes-changes-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: TABLA }, () => setTick(t => t + 1))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const recargar = useCallback(() => setTick(t => t + 1), []);

  const guardarIncidente = useCallback(async (form, id = null) => {
    const row = {
      fecha:                form.fecha               || null,
      hora:                 form.hora                || null,
      lugar:                form.lugar               || null,
      reporta_nombre:       form.reportaNombre       || null,
      reporta_cargo:        form.reportaCargo        || null,
      lote_afectado:        form.loteAfectado        || null,
      linea_maquinaria:     form.lineaMaquinaria     || null,
      tipos:                Array.isArray(form.tipos) ? form.tipos : [],
      tipo_otro:            form.tipos?.includes("Otro") ? (form.tipoOtro || null) : null,
      descripcion:          form.descripcion         || null,
      acciones_correctivas: form.accionesCorrectivas || null,
      acciones_preventivas: form.accionesPreventivas || null,
      supervision_nombre:   form.supervisionNombre   || null,
      supervision_cargo:    form.supervisionCargo    || null,
      supervision_fecha:    form.supervisionFecha    || null,
      verificacion_nombre:  form.verificacionNombre  || null,
      verificacion_cargo:   form.verificacionCargo   || null,
      verificacion_fecha:   form.verificacionFecha   || null,
      firma_reporta:        form.firmaReporta        || null,
      firma_supervision:    form.firmaSupervision    || null,
      firma_verificacion:   form.firmaVerificacion   || null,
      registrado_por:       form.registradoPor       || null,
      updated_at:           new Date().toISOString(),
    };

    if (id) {
      const { error } = await supabase.from(TABLA).update(row).eq("id", id);
      if (error) { console.error("[incidentes]", error.message); return { ok: false, id }; }
      setIncidentes(prev => prev.map(x => x.id === id ? rowToIncidente({ ...sinFirmas(row), id }) : x).sort(porFechaDesc));
      return { ok: true, id };
    }
    row.id = Date.now();
    const { error } = await supabase.from(TABLA).insert(row);
    if (error) { console.error("[incidentes]", error.message); return { ok: false, id: null }; }
    setIncidentes(prev => [rowToIncidente(sinFirmas(row)), ...prev].sort(porFechaDesc));
    return { ok: true, id: row.id };
  }, []);

  const cargarFirmas = useCallback(async (id) => {
    const { data, error } = await conReintentos(() =>
      supabase.from(TABLA).select("firma_reporta,firma_supervision,firma_verificacion").eq("id", id).single());
    if (error) { console.error("[incidentes]", error.message); return { ok: false }; }
    return {
      ok: true,
      firmas: {
        firmaReporta:      data.firma_reporta      || "",
        firmaSupervision:  data.firma_supervision  || "",
        firmaVerificacion: data.firma_verificacion || "",
      },
    };
  }, []);

  const eliminarIncidente = useCallback(async (id) => {
    const { error } = await supabase.from(TABLA).delete().eq("id", id);
    if (error) { console.error("[incidentes]", error.message); return false; }
    setIncidentes(prev => prev.filter(x => x.id !== id));
    return true;
  }, []);

  return { incidentes, loading, errorCarga, recargar, guardarIncidente, cargarFirmas, eliminarIncidente };
}
