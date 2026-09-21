import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase.js";
import { conReintentos } from "../utils/consultas.js";

// La lista de facturas NO carga todo el historial: por defecto trae las
// últimas N, y si el usuario elige un rango de fechas o busca algo, la
// consulta se hace en la base con ese filtro. Se lee de a páginas chicas
// porque cada factura trae sus fotos en base64 y una consulta grande se pasa
// del timeout de Supabase (~3 s).
//
// El saldo de caja, el autocompletado de proveedores y la importación de
// terceros SÍ necesitan todas las facturas, pero no sus fotos: eso sale de
// una consulta aparte y liviana (`resumenFacturas`: id, fecha, nit, nombre,
// monto), así el saldo nunca depende de cuántas facturas se estén mostrando.
const TAM_PAGINA   = 10;
const MAX_RANGO    = 500;
const MAX_BUSQUEDA = 50;
const TAM_LOTE     = 1000; // límite de filas por respuesta de Supabase

const limpiarBusqueda = (s) => String(s || "").replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();
const porFechaDesc = (a, b) => (b.fecha || "").localeCompare(a.fecha || "") || b.id - a.id;

const rowToFactura = (r) => ({
  id:               r.id,
  fecha:            r.fecha             || "",
  nit:              r.nit               || "",
  nombre:           r.nombre            || "",
  tipoDocumento:    r.tipo_documento    || "",
  numeroDocumento:  r.numero_documento  || "",
  concepto:         r.concepto          || "",
  monto:            r.monto != null ? Number(r.monto) : 0,
  fotos:            Array.isArray(r.fotos) && r.fotos.length ? r.fotos : (r.foto ? [r.foto] : []),
  obs:              r.obs               || "",
  registradoPor:    r.registrado_por    || "",
  createdAt:        r.created_at        || "",
});

const rowToResumen = (r) => ({
  id:     r.id,
  fecha:  r.fecha  || "",
  nit:    r.nit    || "",
  nombre: r.nombre || "",
  monto:  r.monto != null ? Number(r.monto) : 0,
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

// Trae TODAS las filas de una tabla (sin fotos) en lotes, para no toparse con
// el tope de filas por respuesta y que un total salga silenciosamente corto.
async function leerTodo(tabla, columnas) {
  const filas = [];
  for (let desde = 0; ; desde += TAM_LOTE) {
    const { data, error } = await conReintentos(() =>
      supabase.from(tabla).select(columnas)
        .order("fecha", { ascending: false, nullsFirst: false }).order("id", { ascending: false })
        .range(desde, desde + TAM_LOTE - 1));
    if (error) return { error };
    filas.push(...(data || []));
    if ((data || []).length < TAM_LOTE) return { data: filas };
  }
}

const paginaFacturas = ({ desde, hasta, busqueda }, cursor, n) => {
  let q = supabase.from("caja_menor_facturas").select("*")
    .order("fecha", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(n);
  if (desde) q = q.gte("fecha", desde);
  if (hasta) q = q.lte("fecha", hasta);
  if (busqueda) {
    const b = `*${busqueda}*`;
    q = q.or(`concepto.ilike.${b},nombre.ilike.${b},nit.ilike.${b},numero_documento.ilike.${b}`);
  }
  if (cursor) {
    // Las facturas sin fecha quedan al final (nullsFirst: false).
    q = cursor.fecha
      ? q.or(`fecha.lt.${cursor.fecha},fecha.is.null,and(fecha.eq.${cursor.fecha},id.lt.${cursor.id})`)
      : q.is("fecha", null).lt("id", cursor.id);
  }
  return q;
};

// Opciones:
//  ultimas    cuántas facturas traer cuando NO hay rango ni búsqueda
//  desde/hasta rango de fechas (YYYY-MM-DD); si hay alguno, manda sobre `ultimas`
//  busqueda   texto: concepto, nombre, NIT o N° de documento (se busca en toda la base)
export function useCajaMenor(opciones = {}) {
  const { ultimas = 15, desde = "", hasta = "", busqueda = "" } = opciones;
  const busquedaLimpia = limpiarBusqueda(busqueda);
  const [busquedaDeb, setBusquedaDeb] = useState(busquedaLimpia);
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDeb(busquedaLimpia), 350);
    return () => clearTimeout(t);
  }, [busquedaLimpia]);

  const [facturas,   setFacturas]   = useState([]); // la ventana visible (con fotos)
  const [resumenFacturas, setResumenFacturas] = useState([]); // TODAS, sin fotos
  const [abonos,     setAbonos]     = useState([]);
  const [listoVentana, setListoVentana] = useState(false);
  const [listoResumen, setListoResumen] = useState(false);
  const [listoAbonos,  setListoAbonos]  = useState(false);
  const [errVentana, setErrVentana] = useState("");
  const [errResumen, setErrResumen] = useState("");
  const [errAbonos,  setErrAbonos]  = useState("");
  // Contadores: subirlos vuelve a disparar la carga (tiempo real, Reintentar, error al guardar).
  const [tickVentana, setTickVentana] = useState(0);
  const [tickResumen, setTickResumen] = useState(0);
  const [tickAbonos,  setTickAbonos]  = useState(0);
  const paramsCargadosRef = useRef("");

  // ── Ventana de facturas (últimas N, o rango, o búsqueda) ──
  const claveParams  = `${Number(ultimas) || 0}|${desde}|${hasta}|${busquedaDeb}`;
  const claveVentana = `${claveParams}|${tickVentana}`;
  const [claveCargada, setClaveCargada] = useState("");
  const refrescando = claveCargada !== claveVentana;

  useEffect(() => {
    let vigente = true;
    // Con filtros nuevos se va pintando por páginas; una recarga de lo mismo
    // (tiempo real) cambia de golpe al final, sin que la lista se encoja.
    const progresivo = paramsCargadosRef.current !== claveParams;
    paramsCargadosRef.current = claveParams;

    const hayFiltro = !!(desde || hasta || busquedaDeb);
    const max = hayFiltro ? (busquedaDeb && !desde && !hasta ? MAX_BUSQUEDA : MAX_RANGO) : (Number(ultimas) || 0);
    const filtros = { desde, hasta, busqueda: busquedaDeb };
    const acumulado = [];
    let fallo = "";

    (async () => {
      let cursor = null;
      while (acumulado.length < max) {
        const tam = Math.min(TAM_PAGINA, max - acumulado.length);
        const { data, error } = await conReintentos(() => paginaFacturas(filtros, cursor, tam));
        if (!vigente) return;
        if (error) { fallo = error.message; break; }
        acumulado.push(...(data || []).map(rowToFactura));
        if (progresivo) setFacturas([...acumulado].sort(porFechaDesc));
        if ((data || []).length < tam) break;
        const ult = acumulado[acumulado.length - 1];
        cursor = { fecha: ult.fecha, id: ult.id };
      }
      if (!vigente) return;
      // Si falló y era una recarga, se conserva lo que ya se veía.
      if (!fallo || progresivo) setFacturas([...acumulado].sort(porFechaDesc));
      if (fallo) console.error("[caja_menor_facturas]", fallo);
      setErrVentana(fallo);
      setClaveCargada(claveVentana);
      setListoVentana(true);
    })();
    return () => { vigente = false; };
  }, [ultimas, desde, hasta, busquedaDeb, claveParams, claveVentana]);

  // ── Resumen de TODAS las facturas (sin fotos) — saldo, proveedores ──
  useEffect(() => {
    let vigente = true;
    (async () => {
      const { data, error } = await leerTodo("caja_menor_facturas", "id, fecha, nit, nombre, monto");
      if (!vigente) return;
      if (error) { console.error("[caja_menor_facturas resumen]", error.message); setErrResumen(error.message); }
      else { setResumenFacturas(data.map(rowToResumen)); setErrResumen(""); }
      setListoResumen(true);
    })();
    return () => { vigente = false; };
  }, [tickResumen]);

  // ── Abonos (pocos y sin fotos: se cargan todos, el saldo los necesita) ──
  useEffect(() => {
    let vigente = true;
    (async () => {
      const { data, error } = await leerTodo("caja_menor_abonos", "*");
      if (!vigente) return;
      if (error) { console.error("[caja_menor_abonos]", error.message); setErrAbonos(error.message); }
      else { setAbonos(data.map(rowToAbono)); setErrAbonos(""); }
      setListoAbonos(true);
    })();
    return () => { vigente = false; };
  }, [tickAbonos]);

  useEffect(() => {
    const ch = supabase.channel(`caja-menor-changes-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "caja_menor_facturas" }, () => {
        setTickVentana(t => t + 1);
        setTickResumen(t => t + 1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "caja_menor_abonos" }, () => {
        setTickAbonos(t => t + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const recargar = useCallback(() => {
    setTickVentana(t => t + 1);
    setTickResumen(t => t + 1);
    setTickAbonos(t => t + 1);
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
      fotos:            Array.isArray(form.fotos) ? form.fotos : (form.foto ? [form.foto] : []),
      obs:              form.obs              || null,
      registrado_por:   form.registradoPor    || null,
      updated_at:       new Date().toISOString(),
    };

    if (id) {
      setFacturas(prev => prev.map(f => f.id === id ? rowToFactura({ ...row, id }) : f));
      setResumenFacturas(prev => prev.map(f => f.id === id ? rowToResumen({ ...row, id }) : f));
      const { error } = await supabase.from("caja_menor_facturas").update(row).eq("id", id);
      if (error) {
        setTickVentana(t => t + 1);
        setTickResumen(t => t + 1);
        return { ok: false, id };
      }
      return { ok: true, id };
    } else {
      row.id = Date.now();
      setFacturas(prev => [rowToFactura(row), ...prev]);
      setResumenFacturas(prev => [rowToResumen(row), ...prev]);
      const { error } = await supabase.from("caja_menor_facturas").insert(row);
      if (error) {
        setFacturas(prev => prev.filter(f => f.id !== row.id));
        setResumenFacturas(prev => prev.filter(f => f.id !== row.id));
        return { ok: false, id: null };
      }
      return { ok: true, id: row.id };
    }
  }, []);

  const eliminarFactura = useCallback(async (id) => {
    setFacturas(prev => prev.filter(f => f.id !== id));
    setResumenFacturas(prev => prev.filter(f => f.id !== id));
    const { error } = await supabase.from("caja_menor_facturas").delete().eq("id", id);
    if (error) {
      setTickVentana(t => t + 1);
      setTickResumen(t => t + 1);
    }
    return !error;
  }, []);

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
      if (error) { setTickAbonos(t => t + 1); return false; }
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

  return {
    facturas, resumenFacturas, abonos,
    loading: !(listoVentana && listoResumen && listoAbonos), // solo la primera carga
    refrescando,
    errorCarga: errResumen || errAbonos || errVentana,
    saldoConfiable: !errResumen && !errAbonos, // false = el saldo puede estar incompleto
    recargar,
    guardarFactura, eliminarFactura, guardarAbono, eliminarAbono,
  };
}
