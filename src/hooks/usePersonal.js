import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

// Convierte fila de Supabase → formato que usa PersonalDemo
const rowToEmp = (r) => ({
  no: r.no, nombre: r.nombre, doc: r.doc, num: r.num,
  tel: r.tel || "-", area: r.area || "", banco: r.banco || "", cuenta: r.cuenta || "",
});

export function usePersonal() {
  const [empleados,  setEmpleados]  = useState([]);
  const [contratos,  setContratos]  = useState({});  // {empNum: {tipo,fechaInicio,fechaFin,notas}}
  const [pagosHist,  setPagosHist]  = useState({});  // {empNum: [{id,fecha,monto,tipo,ref}]}
  const [docs,       setDocs]       = useState({});  // {empNum: {cedula,contrato,foto,eps,arl}}
  const [desempeno,  setDesempeno]  = useState({});  // {empNum: [{id,fecha,...criterios,nota}]}
  const [seguridad,  setSeguridad]  = useState({});  // {empNum: {eps,fechaEPS,arl,fechaARL,estado}}
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  // ── Carga inicial paralela ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      const [
        { data: emps,  error: e1 },
        { data: conts, error: e2 },
        { data: pagos, error: e3 },
        { data: docsR, error: e4 },
        { data: evals, error: e5 },
        { data: segs,  error: e6 },
      ] = await Promise.all([
        supabase.from("empleados").select("*").eq("activo", true).order("no"),
        supabase.from("contratos").select("*"),
        supabase.from("pagos").select("*").order("fecha", { ascending: false }),
        supabase.from("documentos").select("*"),
        supabase.from("evaluaciones").select("*").order("fecha", { ascending: false }),
        supabase.from("seguridad_social").select("*"),
      ]);

      const err = e1 || e2 || e3 || e4 || e5 || e6;
      if (err) { setError(err.message); setLoading(false); return; }
      if (cancelled) return;

      setEmpleados((emps || []).map(rowToEmp));

      // contratos: último contrato por empleado como objeto plano {empNum: {...}}
      const contMap = {};
      (conts || []).forEach(c => {
        contMap[c.emp_num] = { tipo: c.tipo, fechaInicio: c.fecha_inicio || "", fechaFin: c.fecha_fin || "", notas: c.notas || "" };
      });
      setContratos(contMap);

      // pagos: agrupados por empNum
      const pagMap = {};
      (pagos || []).forEach(p => {
        if (!pagMap[p.emp_num]) pagMap[p.emp_num] = [];
        pagMap[p.emp_num].push({ id: p.id, fecha: p.fecha, monto: Number(p.monto), tipo: p.tipo, ref: p.ref || "" });
      });
      setPagosHist(pagMap);

      // docs: {empNum: {cedula, contrato, foto, eps, arl}}
      const docMap = {};
      (docsR || []).forEach(d => {
        docMap[d.emp_num] = { cedula: d.cedula, contrato: d.contrato, foto: d.foto, eps: d.eps, arl: d.arl };
      });
      setDocs(docMap);

      // desempeño: agrupado por empNum
      const evalMap = {};
      (evals || []).forEach(ev => {
        if (!evalMap[ev.emp_num]) evalMap[ev.emp_num] = [];
        evalMap[ev.emp_num].push({ id: ev.id, fecha: ev.fecha, puntualidad: ev.puntualidad, calidad: ev.calidad, actitud: ev.actitud, productividad: ev.productividad, nota: ev.nota || "" });
      });
      setDesempeno(evalMap);

      // seguridad social
      const segMap = {};
      (segs || []).forEach(s => {
        segMap[s.emp_num] = { eps: s.eps || "", fechaEPS: s.fecha_eps || "", arl: s.arl || "", fechaARL: s.fecha_arl || "", estado: s.estado || "Activo" };
      });
      setSeguridad(segMap);

      setLoading(false);
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // ── Suscripciones en tiempo real ─────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`personal-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "empleados" }, () => {
        supabase.from("empleados").select("*").eq("activo", true).order("no")
          .then(({ data }) => data && setEmpleados(data.map(rowToEmp)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "contratos" }, () => {
        supabase.from("contratos").select("*").then(({ data }) => {
          if (!data) return;
          const m = {};
          data.forEach(c => { m[c.emp_num] = { tipo: c.tipo, fechaInicio: c.fecha_inicio || "", fechaFin: c.fecha_fin || "", notas: c.notas || "" }; });
          setContratos(m);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pagos" }, () => {
        supabase.from("pagos").select("*").order("fecha", { ascending: false }).then(({ data }) => {
          if (!data) return;
          const m = {};
          data.forEach(p => { if (!m[p.emp_num]) m[p.emp_num] = []; m[p.emp_num].push({ id: p.id, fecha: p.fecha, monto: Number(p.monto), tipo: p.tipo, ref: p.ref || "" }); });
          setPagosHist(m);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "documentos" }, () => {
        supabase.from("documentos").select("*").then(({ data }) => {
          if (!data) return;
          const m = {};
          data.forEach(d => { m[d.emp_num] = { cedula: d.cedula, contrato: d.contrato, foto: d.foto, eps: d.eps, arl: d.arl }; });
          setDocs(m);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "evaluaciones" }, () => {
        supabase.from("evaluaciones").select("*").order("fecha", { ascending: false }).then(({ data }) => {
          if (!data) return;
          const m = {};
          data.forEach(ev => { if (!m[ev.emp_num]) m[ev.emp_num] = []; m[ev.emp_num].push({ id: ev.id, fecha: ev.fecha, puntualidad: ev.puntualidad, calidad: ev.calidad, actitud: ev.actitud, productividad: ev.productividad, nota: ev.nota || "" }); });
          setDesempeno(m);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "seguridad_social" }, () => {
        supabase.from("seguridad_social").select("*").then(({ data }) => {
          if (!data) return;
          const m = {};
          data.forEach(s => { m[s.emp_num] = { eps: s.eps || "", fechaEPS: s.fecha_eps || "", arl: s.arl || "", fechaARL: s.fecha_arl || "", estado: s.estado || "Activo" }; });
          setSeguridad(m);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Mutaciones ───────────────────────────────────────────────

  const agregarEmpleado = useCallback(async (emp) => {
    const { error } = await supabase.from("empleados").insert({
      no: emp.no, nombre: emp.nombre, doc: emp.doc, num: emp.num,
      tel: emp.tel, area: emp.area, banco: emp.banco || "Nequi", cuenta: emp.cuenta || "",
    });
    return !error;
  }, []);

  const editarEmpleado = useCallback(async (num, campos) => {
    const { error } = await supabase.from("empleados").update({
      nombre: campos.nombre, doc: campos.doc, tel: campos.tel, area: campos.area,
    }).eq("num", num);
    return !error;
  }, []);

  const eliminarEmpleado = useCallback(async (num) => {
    const { error } = await supabase.from("empleados").update({ activo: false }).eq("num", num);
    return !error;
  }, []);

  const upsertContrato = useCallback(async (empNum, form) => {
    const { error } = await supabase.from("contratos").upsert({
      emp_num: empNum, tipo: form.tipo,
      fecha_inicio: form.fechaInicio || null, fecha_fin: form.fechaFin || null, notas: form.notas || null,
    }, { onConflict: "emp_num" });
    return !error;
  }, []);

  const agregarPago = useCallback(async (empNum, form) => {
    const { error } = await supabase.from("pagos").insert({
      emp_num: empNum, fecha: form.fecha, monto: Number(form.monto), tipo: form.tipo, ref: form.ref || null,
    });
    return !error;
  }, []);

  const eliminarPago = useCallback(async (id) => {
    const { error } = await supabase.from("pagos").delete().eq("id", id);
    return !error;
  }, []);

  const toggleDoc = useCallback(async (empNum, key) => {
    const actual = docs[empNum]?.[key] ?? false;
    const { error } = await supabase.from("documentos").upsert(
      { emp_num: empNum, [key]: !actual, updated_at: new Date().toISOString() },
      { onConflict: "emp_num" }
    );
    return !error;
  }, [docs]);

  const agregarEval = useCallback(async (empNum, form) => {
    const { error } = await supabase.from("evaluaciones").insert({
      emp_num: empNum, fecha: form.fecha,
      puntualidad: form.puntualidad, calidad: form.calidad, actitud: form.actitud, productividad: form.productividad,
      nota: form.nota || null,
    });
    return !error;
  }, []);

  const eliminarEval = useCallback(async (id) => {
    const { error } = await supabase.from("evaluaciones").delete().eq("id", id);
    return !error;
  }, []);

  const upsertSeguridad = useCallback(async (empNum, form) => {
    const { error } = await supabase.from("seguridad_social").upsert({
      emp_num: empNum, eps: form.eps || null, fecha_eps: form.fechaEPS || null,
      arl: form.arl || null, fecha_arl: form.fechaARL || null, estado: form.estado,
      updated_at: new Date().toISOString(),
    }, { onConflict: "emp_num" });
    return !error;
  }, []);

  return {
    empleados, contratos, pagosHist, docs, desempeno, seguridad,
    loading, error,
    agregarEmpleado, editarEmpleado, eliminarEmpleado,
    upsertContrato, agregarPago, eliminarPago,
    toggleDoc, agregarEval, eliminarEval, upsertSeguridad,
  };
}
