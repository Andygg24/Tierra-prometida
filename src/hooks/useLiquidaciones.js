import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const rowToLiq = (r) => ({
  id:          r.id,
  empNum:      r.emp_num,
  nombre:      r.nombre      || "",
  area:        r.area        || "",
  periodo:     r.periodo     || "",
  salBase:     Number(r.sal_base    || 0),
  devengado:   Number(r.devengado   || 0),
  totalDeduc:  Number(r.total_deduc || 0),
  neto:        Number(r.neto        || 0),
  ausencias:   Number(r.ausencias   || 0),
  fecha:       r.fecha       || "",
  tipo:        r.tipo        || "nomina",
  contenedores: r.contenedores ? Number(r.contenedores) : undefined,
  metodoPago:   r.metodo_pago || undefined,
  html:         r.html || "",
});

export function useLiquidaciones() {
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [tiposPago,     setTiposPago]     = useState({});
  const [loading,       setLoading]       = useState(true);

  // ── Carga inicial ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const [{ data: liqs }, { data: tipos }] = await Promise.all([
        supabase.from("liquidaciones").select("*")
          .order("created_at", { ascending: false }).limit(200),
        supabase.from("tipos_pago").select("*"),
      ]);
      if (cancelled) return;
      setLiquidaciones((liqs  || []).map(rowToLiq));
      const mapa = {};
      (tipos || []).forEach(t => { mapa[t.emp_num] = t.tipo; });
      setTiposPago(mapa);
      setLoading(false);
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // ── Suscripciones en tiempo real ─────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`liquidaciones-changes-${Date.now()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "liquidaciones" }, ({ new: row }) => {
        if (row) setLiquidaciones(prev => [rowToLiq(row), ...prev.slice(0, 199)]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "liquidaciones" }, () => {
        supabase.from("liquidaciones").select("*")
          .order("created_at", { ascending: false }).limit(200)
          .then(({ data }) => data && setLiquidaciones(data.map(rowToLiq)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tipos_pago" }, () => {
        supabase.from("tipos_pago").select("*").then(({ data }) => {
          if (!data) return;
          const m = {};
          data.forEach(t => { m[t.emp_num] = t.tipo; });
          setTiposPago(m);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Mutaciones ───────────────────────────────────────────────

  const agregarLiquidacion = useCallback(async (reg) => {
    const row = {
      id:           reg.id,
      emp_num:      reg.empNum,
      nombre:       reg.nombre,
      area:         reg.area,
      periodo:      reg.periodo,
      sal_base:     reg.salBase,
      devengado:    reg.devengado,
      total_deduc:  reg.totalDeduc,
      neto:         reg.neto,
      ausencias:    reg.ausencias || 0,
      fecha:        reg.fecha,
      tipo:         reg.tipo,
      contenedores: reg.contenedores ?? null,
      metodo_pago:  reg.metodoPago  ?? null,
      html:         reg.html        ?? null,
    };
    // Optimistic insert — no depender solo del roundtrip de tiempo real
    setLiquidaciones(prev => [rowToLiq(row), ...prev.slice(0, 199)]);
    const { error } = await supabase.from("liquidaciones").insert(row);
    if (error) setLiquidaciones(prev => prev.filter(l => l.id !== row.id));
    return !error;
  }, []);

  const limpiarHistorial = useCallback(async () => {
    await supabase.from("liquidaciones").delete().neq("id", 0);
    setLiquidaciones([]);
  }, []);

  const setTipo = useCallback(async (empNum, tipo) => {
    setTiposPago(prev => ({ ...prev, [empNum]: tipo }));
    await supabase.from("tipos_pago").upsert(
      { emp_num: empNum, tipo },
      { onConflict: "emp_num" }
    );
  }, []);

  const setTodosTipos = useCallback(async (tipoStr, empleadosList) => {
    const mapa = {};
    empleadosList.forEach(e => { mapa[e.num] = tipoStr; });
    setTiposPago(mapa);
    const rows = empleadosList.map(e => ({
      emp_num: e.num, tipo: tipoStr,
    }));
    await supabase.from("tipos_pago").upsert(rows, { onConflict: "emp_num" });
  }, []);

  return {
    liquidaciones, tiposPago, loading,
    agregarLiquidacion, limpiarHistorial, setTipo, setTodosTipos,
  };
}
