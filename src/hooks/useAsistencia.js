import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase.js";

// Carga todos los registros de un mes: devuelve {fecha: {nombre: row}}
async function fetchMes(mes) {
  const inicio = `${mes}-01`;
  const [y, m]  = mes.split("-").map(Number);
  const fin     = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  const [{ data: regs, error: e1 }, { data: metas, error: e2 }] = await Promise.all([
    supabase.from("asistencia").select("*").gte("fecha", inicio).lte("fecha", fin),
    supabase.from("asistencia_meta").select("*").gte("fecha", inicio).lte("fecha", fin),
  ]);

  if (e1 || e2) return null;

  const regMap = {};
  (regs || []).forEach(r => {
    if (!regMap[r.fecha]) regMap[r.fecha] = {};
    regMap[r.fecha][r.emp_nombre] = { estado: r.estado || null, contenedor: r.contenedor || "", obs: r.obs || "" };
  });

  const metaMap = {};
  (metas || []).forEach(m => {
    metaMap[m.fecha] = { turno: m.turno || "", contenedorDia: m.contenedor_dia || "", rogerContenedor: m.roger_contenedor || "", obsGeneral: m.obs_general || "" };
  });

  return { regMap, metaMap };
}

export function useAsistencia() {
  const mesActual = () => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`;
  };

  const [registros, setRegistros] = useState({});
  const [metaDia,   setMetaDia]   = useState({});
  const [loading,   setLoading]   = useState(true);
  const mesesCargados = useRef(new Set());

  // ── Carga inicial ────────────────────────────────────────────
  useEffect(() => {
    const mes = mesActual();
    fetchMes(mes).then(data => {
      if (!data) return;
      setRegistros(prev => ({ ...prev, ...data.regMap }));
      setMetaDia(prev   => ({ ...prev, ...data.metaMap }));
      mesesCargados.current.add(mes);
      setLoading(false);
    });
  }, []);

  // ── Carga lazy de un mes (para reportes) ─────────────────────
  const cargarMes = useCallback(async (mes) => {
    if (mesesCargados.current.has(mes)) return;
    const data = await fetchMes(mes);
    if (!data) return;
    setRegistros(prev => ({ ...prev, ...data.regMap }));
    setMetaDia(prev   => ({ ...prev, ...data.metaMap }));
    mesesCargados.current.add(mes);
  }, []);

  // ── Suscripciones en tiempo real ─────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`asistencia-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "asistencia" }, ({ new: row, old, eventType }) => {
        if (eventType === "DELETE") {
          setRegistros(prev => {
            const copia = { ...prev };
            if (copia[old.fecha]) {
              copia[old.fecha] = { ...copia[old.fecha] };
              delete copia[old.fecha][old.emp_nombre];
            }
            return copia;
          });
        } else if (row) {
          setRegistros(prev => ({
            ...prev,
            [row.fecha]: {
              ...(prev[row.fecha] || {}),
              [row.emp_nombre]: { estado: row.estado || null, contenedor: row.contenedor || "", obs: row.obs || "" },
            },
          }));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "asistencia_meta" }, ({ new: row, old, eventType }) => {
        if (eventType === "DELETE") {
          setMetaDia(prev => { const c = { ...prev }; delete c[old.fecha]; return c; });
        } else if (row) {
          setMetaDia(prev => ({
            ...prev,
            [row.fecha]: { turno: row.turno || "", contenedorDia: row.contenedor_dia || "", rogerContenedor: row.roger_contenedor || "", obsGeneral: row.obs_general || "" },
          }));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Mutaciones ───────────────────────────────────────────────

  const setEmpField = useCallback(async (fecha, nombre, field, value) => {
    let anterior;
    setRegistros(prev => {
      anterior = prev[fecha]?.[nombre]?.[field];
      return { ...prev, [fecha]: { ...(prev[fecha] || {}), [nombre]: { ...(prev[fecha]?.[nombre] || {}), [field]: value } } };
    });
    const { error } = await supabase.from("asistencia").upsert(
      { fecha, emp_nombre: nombre, [field]: value || null },
      { onConflict: "fecha,emp_nombre" }
    );
    if (error) setRegistros(prev => ({ ...prev, [fecha]: { ...(prev[fecha] || {}), [nombre]: { ...(prev[fecha]?.[nombre] || {}), [field]: anterior } } }));
  }, []);

  const toggleEstado = useCallback(async (fecha, nombre, nuevoEstado) => {
    const actual = registros[fecha]?.[nombre]?.estado || null;
    const next   = actual === nuevoEstado ? null : nuevoEstado;
    setRegistros(prev => ({
      ...prev,
      [fecha]: { ...(prev[fecha] || {}), [nombre]: { ...(prev[fecha]?.[nombre] || {}), estado: next } },
    }));
    let error;
    if (next) {
      ({ error } = await supabase.from("asistencia").upsert({ fecha, emp_nombre: nombre, estado: next }, { onConflict: "fecha,emp_nombre" }));
    } else {
      const reg = registros[fecha]?.[nombre] || {};
      if (!reg.contenedor && !reg.obs) {
        ({ error } = await supabase.from("asistencia").delete().eq("fecha", fecha).eq("emp_nombre", nombre));
      } else {
        // estado queda vacío pero hay contenedor u obs — se borra el registro y se re-inserta sin estado
        ({ error } = await supabase.from("asistencia").delete().eq("fecha", fecha).eq("emp_nombre", nombre));
        if (!error) {
          const reg = registros[fecha]?.[nombre] || {};
          ({ error } = await supabase.from("asistencia").insert({ fecha, emp_nombre: nombre, contenedor: reg.contenedor || null, obs: reg.obs || null }));
        }
      }
    }
    if (error) setRegistros(prev => ({ ...prev, [fecha]: { ...(prev[fecha] || {}), [nombre]: { ...(prev[fecha]?.[nombre] || {}), estado: actual } } }));
  }, [registros]);

  const setMetaField = useCallback(async (fecha, field, value) => {
    const camposDB = { turno:"turno", contenedorDia:"contenedor_dia", rogerContenedor:"roger_contenedor", obsGeneral:"obs_general" };
    setMetaDia(prev => ({
      ...prev,
      [fecha]: { ...(prev[fecha] || {}), [field]: value },
    }));
    await supabase.from("asistencia_meta").upsert(
      { fecha, [camposDB[field] || field]: value || null },
      { onConflict: "fecha" }
    );
  }, []);

  const marcarTodos = useCallback(async (fecha, empleadosList, estado) => {
    const batch = {};
    empleadosList.forEach(e => { batch[e.nombre] = { ...(registros[fecha]?.[e.nombre] || {}), estado }; });
    setRegistros(prev => ({ ...prev, [fecha]: { ...(prev[fecha] || {}), ...batch } }));
    const filas = empleadosList.map(e => ({ fecha, emp_nombre: e.nombre, estado }));
    await supabase.from("asistencia").upsert(filas, { onConflict: "fecha,emp_nombre" });
  }, [registros]);

  const limpiarDia = useCallback(async (fecha) => {
    let snapRegs, snapMeta;
    setRegistros(prev => { snapRegs = prev; const c = { ...prev }; c[fecha] = {}; return c; });
    setMetaDia(prev   => { snapMeta = prev; const c = { ...prev }; delete c[fecha]; return c; });
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("asistencia").delete().eq("fecha", fecha),
      supabase.from("asistencia_meta").delete().eq("fecha", fecha),
    ]);
    if (e1 || e2) { setRegistros(snapRegs); setMetaDia(snapMeta); }
  }, []);

  return {
    registros, metaDia, loading,
    cargarMes,
    setEmpField, toggleEstado, setMetaField, marcarTodos, limpiarDia,
  };
}
