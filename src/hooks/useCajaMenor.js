import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const rowToFactura = (r) => ({
  id:               r.id,
  fecha:            r.fecha             || "",
  nit:              r.nit               || "",
  nombre:           r.nombre            || "",
  tipoDocumento:    r.tipo_documento    || "",
  numeroDocumento:  r.numero_documento  || "",
  concepto:         r.concepto          || "",
  monto:            r.monto != null ? Number(r.monto) : 0,
  foto:             r.foto              || "",
  obs:              r.obs               || "",
  registradoPor:    r.registrado_por    || "",
  createdAt:        r.created_at        || "",
});

const rowToAbono = (r) => ({
  id:            r.id,
  fecha:         r.fecha          || "",
  monto:         r.monto != null ? Number(r.monto) : 0,
  concepto:      r.concepto       || "",
  obs:           r.obs            || "",
  registradoPor: r.registrado_por || "",
  createdAt:     r.created_at     || "",
});

export function useCajaMenor() {
  const [facturas, setFacturas] = useState([]);
  const [abonos,   setAbonos]   = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from("caja_menor_facturas").select("*").order("fecha", { ascending: false }),
      supabase.from("caja_menor_abonos").select("*").order("fecha", { ascending: false }),
    ]).then(([{ data: facs, error: e1 }, { data: abs, error: e2 }]) => {
      if (cancelled) return;
      if (!e1) setFacturas((facs || []).map(rowToFactura));
      if (e1) console.error("[caja_menor_facturas]", e1.message);
      if (!e2) setAbonos((abs || []).map(rowToAbono));
      if (e2) console.error("[caja_menor_abonos]", e2.message);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const ch = supabase.channel(`caja-menor-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "caja_menor_facturas" }, () => {
        supabase.from("caja_menor_facturas").select("*").order("fecha", { ascending: false })
          .then(({ data }) => data && setFacturas(data.map(rowToFactura)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "caja_menor_abonos" }, () => {
        supabase.from("caja_menor_abonos").select("*").order("fecha", { ascending: false })
          .then(({ data }) => data && setAbonos(data.map(rowToAbono)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const guardarFactura = useCallback(async (form, id = null) => {
    const row = {
      fecha:            form.fecha            || null,
      nit:              form.nit              || null,
      nombre:           form.nombre           || null,
      tipo_documento:   form.tipoDocumento    || null,
      numero_documento: form.numeroDocumento  || null,
      concepto:         form.concepto         || "",
      monto:            form.monto !== "" && form.monto != null ? Number(form.monto) : 0,
      foto:             form.foto             || null,
      obs:              form.obs              || null,
      registrado_por:   form.registradoPor    || null,
      updated_at:       new Date().toISOString(),
    };

    if (id) {
      setFacturas(prev => prev.map(f => f.id === id ? rowToFactura({ ...row, id }) : f));
      const { error } = await supabase.from("caja_menor_facturas").update(row).eq("id", id);
      if (error) {
        supabase.from("caja_menor_facturas").select("*").order("fecha", { ascending: false })
          .then(({ data }) => data && setFacturas(data.map(rowToFactura)));
        return { ok: false, id };
      }
      return { ok: true, id };
    } else {
      row.id = Date.now();
      setFacturas(prev => [rowToFactura(row), ...prev]);
      const { error } = await supabase.from("caja_menor_facturas").insert(row);
      if (error) { setFacturas(prev => prev.filter(f => f.id !== row.id)); return { ok: false, id: null }; }
      return { ok: true, id: row.id };
    }
  }, []);

  const eliminarFactura = useCallback(async (id) => {
    const removed = facturas.find(f => f.id === id);
    setFacturas(prev => prev.filter(f => f.id !== id));
    const { error } = await supabase.from("caja_menor_facturas").delete().eq("id", id);
    if (error && removed) setFacturas(prev => [removed, ...prev]);
    return !error;
  }, [facturas]);

  const guardarAbono = useCallback(async (form, id = null) => {
    const row = {
      fecha:          form.fecha       || null,
      monto:          form.monto !== "" && form.monto != null ? Number(form.monto) : 0,
      concepto:       form.concepto    || "",
      obs:            form.obs         || null,
      registrado_por: form.registradoPor || null,
      updated_at:     new Date().toISOString(),
    };

    if (id) {
      setAbonos(prev => prev.map(a => a.id === id ? rowToAbono({ ...row, id }) : a));
      const { error } = await supabase.from("caja_menor_abonos").update(row).eq("id", id);
      if (error) {
        supabase.from("caja_menor_abonos").select("*").order("fecha", { ascending: false })
          .then(({ data }) => data && setAbonos(data.map(rowToAbono)));
        return false;
      }
      return true;
    } else {
      row.id = Date.now();
      setAbonos(prev => [rowToAbono(row), ...prev]);
      const { error } = await supabase.from("caja_menor_abonos").insert(row);
      if (error) setAbonos(prev => prev.filter(a => a.id !== row.id));
      return !error;
    }
  }, []);

  const eliminarAbono = useCallback(async (id) => {
    const removed = abonos.find(a => a.id === id);
    setAbonos(prev => prev.filter(a => a.id !== id));
    const { error } = await supabase.from("caja_menor_abonos").delete().eq("id", id);
    if (error && removed) setAbonos(prev => [removed, ...prev]);
    return !error;
  }, [abonos]);

  return { facturas, abonos, loading, guardarFactura, eliminarFactura, guardarAbono, eliminarAbono };
}
