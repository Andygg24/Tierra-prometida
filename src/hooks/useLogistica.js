import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";
import { fechaLocalISO, diferenciaDiasLocal } from "../utils/dates.js";

const rowToBooking = (r) => ({
  id:                    r.id,
  numeroBooking:         r.numero_booking         || "",
  numeroContenedor:      r.numero_contenedor       || "",
  numeroExportacion:     r.numero_exportacion != null ? r.numero_exportacion : "",
  numeroProforma:        r.numero_proforma    != null ? r.numero_proforma    : "",
  historialContenedores: Array.isArray(r.historial_contenedores) ? r.historial_contenedores : [],
  estado:                r.estado                  || "Pendiente",
  planta:                r.planta                  || "",
  fechaConfirmado:       r.fecha_confirmado        || "",
  puertoOrigen:          r.puerto_origen           || "",
  puertoDestino:         r.puerto_destino          || "",
  naviera:               r.naviera                 || "",
  motonave:              r.motonave                || "",
  consignee:             r.consignee               || "",
  numeroCajas:           r.numero_cajas != null ? r.numero_cajas : "",
  siCutoffFecha:         r.si_cutoff_fecha         || "",
  siCutoffHora:          r.si_cutoff_hora          || "",
  cyCutoffFecha:         r.cy_cutoff_fecha         || "",
  cyCutoffHora:          r.cy_cutoff_hora          || "",
  documentosCompletos:   !!r.documentos_completos,
  etaActual:             r.eta_actual              || "",
  etaAnterior:           r.eta_anterior            || "",
  etaCambioVisto:        r.eta_cambio_visto !== false,
  estadoContenedor:      r.estado_contenedor       || "Posicionado",
  fechaIngresoPuerto:    r.fecha_ingreso_puerto    || "",
  fechaAsignacion:       r.fecha_asignacion        || "",
  fechaOrdenRecibida:    r.fecha_orden_recibida    || "",
  fechaProduccion:       r.fecha_produccion        || "",
  fechaPackingTerminado: r.fecha_packing_terminado || "",
  fechaZarpe:            r.fecha_zarpe             || "",
  fechaLlegadaDestino:   r.fecha_llegada_destino   || "",
  fechaEntregaFinal:     r.fecha_entrega_final     || "",
  obs:                   r.obs                     || "",
  createdAt:             r.created_at              || "",
});

const rowToTransporte = (r) => ({
  id:              r.id,
  bookingId:       r.booking_id,
  placa:           r.placa           || "",
  conductor:       r.conductor       || "",
  transportadora:  r.transportadora  || "",
  trailer:         r.trailer         || "",
  fechaCargue:     r.fecha_cargue    || "",
  fechaDescargue:  r.fecha_descargue || "",
  standBy:         !!r.stand_by,
  costoAdicional:  r.costo_adicional != null ? Number(r.costo_adicional) : null,
  comentarios:     r.comentarios     || "",
});

const rowToNovedad = (r) => ({
  id:          r.id,
  bookingId:   r.booking_id,
  fecha:       r.fecha       || "",
  descripcion: r.descripcion || "",
  responsable: r.responsable || "",
});

const rowToInspeccion = (r) => ({
  id:            r.id,
  bookingId:     r.booking_id,
  fecha:         r.fecha         || "",
  entidad:       r.entidad       || "",
  resultado:     r.resultado     || "",
  observaciones: r.observaciones || "",
});

const rowToContrato = (r) => ({
  id:             r.id,
  naviera:        r.naviera         || "",
  numeroContrato: r.numero_contrato || "",
  fechaInicio:    r.fecha_inicio    || "",
  fechaFin:       r.fecha_fin       || "",
  destinos:       Array.isArray(r.destinos) ? r.destinos : [],
  obs:            r.obs             || "",
});

const rowToCostoVenta = (r) => ({
  id:              r.id,
  bookingId:       r.booking_id,
  tmr:             r.tmr             != null ? Number(r.tmr)             : "",
  kilos:           r.kilos           != null ? Number(r.kilos)           : "",
  precioKg:        r.precio_kg       != null ? Number(r.precio_kg)       : "",
  tipoCaja:        r.tipo_caja       || "",
  precioCaja:      r.precio_caja     != null ? Number(r.precio_caja)     : "",
  costoTransporte: r.costo_transporte != null ? Number(r.costo_transporte) : "",
  costoPuerto:     r.costo_puerto    != null ? Number(r.costo_puerto)    : "",
  costoAgencia:    r.costo_agencia   != null ? Number(r.costo_agencia)   : "",
  margen:          r.margen          != null ? Number(r.margen)          : 1.5,
  obs:             r.obs             || "",
});

export function useLogistica() {
  const [bookings,     setBookings]     = useState([]);
  const [transporte,   setTransporte]   = useState([]);
  const [novedades,    setNovedades]    = useState([]);
  const [inspecciones, setInspecciones] = useState([]);
  const [contratos,    setContratos]    = useState([]);
  const [costoVenta,   setCostoVenta]   = useState([]);
  const [loading,      setLoading]      = useState(true);

  // ── Carga inicial ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const [
        { data: bks,   error: e1 },
        { data: trs,   error: e2 },
        { data: novs,  error: e3 },
        { data: insps, error: e4 },
        { data: cons,  error: e5 },
        { data: cvs,   error: e6 },
      ] = await Promise.all([
        supabase.from("logistica_bookings").select("*").order("created_at", { ascending: false }),
        supabase.from("logistica_transporte").select("*").order("created_at", { ascending: false }),
        supabase.from("logistica_novedades").select("*").order("fecha", { ascending: false }),
        supabase.from("logistica_inspecciones").select("*").order("fecha", { ascending: false }),
        supabase.from("logistica_contratos").select("*").order("fecha_fin", { ascending: true }),
        supabase.from("logistica_costo_venta").select("*"),
      ]);
      if (cancelled) return;
      if (!e1) setBookings((bks || []).map(rowToBooking));
      if (!e2) setTransporte((trs || []).map(rowToTransporte));
      if (!e3) setNovedades((novs || []).map(rowToNovedad));
      if (!e4) setInspecciones((insps || []).map(rowToInspeccion));
      if (!e5) setContratos((cons || []).map(rowToContrato));
      if (!e6) setCostoVenta((cvs || []).map(rowToCostoVenta));
      if (e1) console.error("[logistica_bookings]", e1.message);
      if (e2) console.error("[logistica_transporte]", e2.message);
      if (e3) console.error("[logistica_novedades]", e3.message);
      if (e4) console.error("[logistica_inspecciones]", e4.message);
      if (e5) console.error("[logistica_contratos]", e5.message);
      if (e6) console.error("[logistica_costo_venta]", e6.message);
      setLoading(false);
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // ── Suscripciones en tiempo real ────────────────────────────
  useEffect(() => {
    const refetch = (table, setter, mapper, orderCol, ascending = false) => () => {
      const q = supabase.from(table).select("*");
      if (orderCol) q.order(orderCol, { ascending });
      q.then(({ data }) => data && setter(data.map(mapper)));
    };

    const ch = supabase.channel(`logistica-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "logistica_bookings" },
          refetch("logistica_bookings", setBookings, rowToBooking, "created_at"))
      .on("postgres_changes", { event: "*", schema: "public", table: "logistica_transporte" },
          refetch("logistica_transporte", setTransporte, rowToTransporte, "created_at"))
      .on("postgres_changes", { event: "*", schema: "public", table: "logistica_novedades" },
          refetch("logistica_novedades", setNovedades, rowToNovedad, "fecha"))
      .on("postgres_changes", { event: "*", schema: "public", table: "logistica_inspecciones" },
          refetch("logistica_inspecciones", setInspecciones, rowToInspeccion, "fecha"))
      .on("postgres_changes", { event: "*", schema: "public", table: "logistica_contratos" },
          refetch("logistica_contratos", setContratos, rowToContrato, "fecha_fin", true))
      .on("postgres_changes", { event: "*", schema: "public", table: "logistica_costo_venta" },
          refetch("logistica_costo_venta", setCostoVenta, rowToCostoVenta, null))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── BOOKINGS ─────────────────────────────────────────────────

  const guardarBooking = useCallback(async (form, id = null) => {
    const previo = id ? bookings.find(b => b.id === id) : null;

    const row = {
      numero_booking:          form.numeroBooking          || null,
      numero_contenedor:       form.numeroContenedor        || null,
      numero_exportacion:      form.numeroExportacion !== "" && form.numeroExportacion != null ? Number(form.numeroExportacion) : null,
      numero_proforma:         form.numeroProforma    !== "" && form.numeroProforma    != null ? Number(form.numeroProforma)    : null,
      historial_contenedores:  previo?.historialContenedores || [],
      estado:                  form.estado                  || "Pendiente",
      planta:                  form.planta                  || null,
      fecha_confirmado:        previo?.fechaConfirmado       || null,
      puerto_origen:           form.puertoOrigen             || null,
      puerto_destino:          form.puertoDestino            || null,
      naviera:                 form.naviera                  || null,
      motonave:                form.motonave                 || null,
      consignee:               form.consignee                || null,
      numero_cajas:            form.numeroCajas !== "" && form.numeroCajas != null ? Number(form.numeroCajas) : null,
      si_cutoff_fecha:         form.siCutoffFecha            || null,
      si_cutoff_hora:          form.siCutoffHora             || null,
      cy_cutoff_fecha:         form.cyCutoffFecha            || null,
      cy_cutoff_hora:          form.cyCutoffHora             || null,
      documentos_completos:    !!form.documentosCompletos,
      eta_actual:              form.etaActual                || null,
      eta_anterior:            previo?.etaAnterior           || null,
      eta_cambio_visto:        previo ? previo.etaCambioVisto : true,
      estado_contenedor:       form.estadoContenedor         || "Posicionado",
      fecha_ingreso_puerto:    form.fechaIngresoPuerto       || null,
      fecha_asignacion:        form.fechaAsignacion          || null,
      fecha_orden_recibida:    form.fechaOrdenRecibida       || null,
      fecha_produccion:        form.fechaProduccion          || null,
      fecha_packing_terminado: form.fechaPackingTerminado    || null,
      fecha_zarpe:             form.fechaZarpe               || null,
      fecha_llegada_destino:   form.fechaLlegadaDestino      || null,
      fecha_entrega_final:     form.fechaEntregaFinal        || null,
      obs:                     form.obs                      || null,
      updated_at:              new Date().toISOString(),
    };

    // Booking pasa a Confirmado por primera vez (incluye el caso de crearlo
    // ya directamente en Confirmado, sin pasar antes por Pendiente) → registrar cuándo
    if (previo?.estado !== "Confirmado" && form.estado === "Confirmado") {
      row.fecha_confirmado = new Date().toISOString();
    }

    // Cambio de ETA → guardar el valor anterior y marcar la alerta como no vista
    if (previo && previo.etaActual && form.etaActual && form.etaActual !== previo.etaActual) {
      row.eta_anterior = previo.etaActual;
      row.eta_cambio_visto = false;
    }

    // Reasignación de número de contenedor (p.ej. Roll Over) → dejar rastro en el historial
    // y limpiar los datos de gestión del contenedor anterior: si no, el Seguimiento
    // seguiría mostrando "Contenedor asignado"/"Ingresó al puerto" ya completos con
    // fechas que en realidad pertenecen al contenedor viejo, no al reasignado.
    if (previo && previo.numeroContenedor && form.numeroContenedor && form.numeroContenedor !== previo.numeroContenedor) {
      row.historial_contenedores = [
        ...(previo.historialContenedores || []),
        { numeroAnterior: previo.numeroContenedor, fecha: new Date().toISOString(), motivo: form.estado },
      ];
      row.estado_contenedor = "Posicionado";
      row.fecha_ingreso_puerto = null;
      row.fecha_asignacion = null;
    }

    if (id) {
      setBookings(prev => prev.map(b => b.id === id ? rowToBooking({ ...row, id }) : b));
      const { error } = await supabase.from("logistica_bookings").update(row).eq("id", id);
      if (error) {
        console.error("[logistica_bookings.update]", error.message);
        supabase.from("logistica_bookings").select("*").order("created_at", { ascending: false })
          .then(({ data }) => data && setBookings(data.map(rowToBooking)));
      }
      return !error;
    } else {
      row.id = Date.now();
      setBookings(prev => [rowToBooking(row), ...prev]);
      const { error } = await supabase.from("logistica_bookings").insert(row);
      if (error) {
        console.error("[logistica_bookings.insert]", error.message);
        setBookings(prev => prev.filter(b => b.id !== row.id));
      }
      return !error;
    }
  }, [bookings]);

  const eliminarBooking = useCallback(async (id) => {
    const removed           = bookings.find(b => b.id === id);
    const removedTransporte = transporte.filter(t => t.bookingId === id);
    const removedNovedades  = novedades.filter(n => n.bookingId === id);
    const removedInspecciones = inspecciones.filter(i => i.bookingId === id);
    setBookings(prev => prev.filter(b => b.id !== id));
    setTransporte(prev => prev.filter(t => t.bookingId !== id));
    setNovedades(prev => prev.filter(n => n.bookingId !== id));
    setInspecciones(prev => prev.filter(i => i.bookingId !== id));
    const { error } = await supabase.from("logistica_bookings").delete().eq("id", id);
    if (error) {
      if (removed) setBookings(prev => [removed, ...prev]);
      if (removedTransporte.length) setTransporte(prev => [...removedTransporte, ...prev]);
      if (removedNovedades.length) setNovedades(prev => [...removedNovedades, ...prev]);
      if (removedInspecciones.length) setInspecciones(prev => [...removedInspecciones, ...prev]);
    }
    return !error;
  }, [bookings, transporte, novedades, inspecciones]);

  const marcarEtaVista = useCallback(async (id) => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, etaCambioVisto: true } : b));
    const { error } = await supabase.from("logistica_bookings").update({ eta_cambio_visto: true }).eq("id", id);
    return !error;
  }, []);

  // Enlaza el N° de Proforma generado en el módulo Exportación con su booking de origen.
  const guardarNumeroProforma = useCallback(async (id, numeroProforma) => {
    if (!id) return false;
    setBookings(prev => prev.map(b => b.id === id ? { ...b, numeroProforma } : b));
    const { error } = await supabase.from("logistica_bookings")
      .update({ numero_proforma: numeroProforma, updated_at: new Date().toISOString() }).eq("id", id);
    return !error;
  }, []);

  // ── TRANSPORTE TERRESTRE ─────────────────────────────────────

  const guardarTransporte = useCallback(async (form, id = null) => {
    const row = {
      booking_id:      form.bookingId,
      placa:           form.placa          || null,
      conductor:       form.conductor      || null,
      transportadora:  form.transportadora || null,
      trailer:         form.trailer        || null,
      fecha_cargue:    form.fechaCargue    || null,
      fecha_descargue: form.fechaDescargue || null,
      stand_by:        !!form.standBy,
      costo_adicional: form.costoAdicional !== "" && form.costoAdicional != null ? Number(form.costoAdicional) : null,
      comentarios:     form.comentarios    || null,
      updated_at:      new Date().toISOString(),
    };
    if (id) {
      setTransporte(prev => prev.map(t => t.id === id ? rowToTransporte({ ...row, id }) : t));
      const { error } = await supabase.from("logistica_transporte").update(row).eq("id", id);
      if (error) {
        supabase.from("logistica_transporte").select("*").order("created_at", { ascending: false })
          .then(({ data }) => data && setTransporte(data.map(rowToTransporte)));
      }
      return !error;
    } else {
      row.id = Date.now();
      setTransporte(prev => [rowToTransporte(row), ...prev]);
      const { error } = await supabase.from("logistica_transporte").insert(row);
      if (error) setTransporte(prev => prev.filter(t => t.id !== row.id));
      return !error;
    }
  }, []);

  const eliminarTransporte = useCallback(async (id) => {
    const removed = transporte.find(t => t.id === id);
    setTransporte(prev => prev.filter(t => t.id !== id));
    const { error } = await supabase.from("logistica_transporte").delete().eq("id", id);
    if (error && removed) setTransporte(prev => [removed, ...prev]);
    return !error;
  }, [transporte]);

  // ── OPERACIÓN PORTUARIA: NOVEDADES ───────────────────────────

  const guardarNovedad = useCallback(async (form, id = null) => {
    const row = {
      booking_id:  form.bookingId,
      fecha:       form.fecha || fechaLocalISO(),
      descripcion: form.descripcion || "",
      responsable: form.responsable || null,
    };
    if (id) {
      setNovedades(prev => prev.map(n => n.id === id ? rowToNovedad({ ...row, id }) : n));
      const { error } = await supabase.from("logistica_novedades").update(row).eq("id", id);
      if (error) {
        supabase.from("logistica_novedades").select("*").order("fecha", { ascending: false })
          .then(({ data }) => data && setNovedades(data.map(rowToNovedad)));
      }
      return !error;
    } else {
      row.id = Date.now();
      setNovedades(prev => [rowToNovedad(row), ...prev]);
      const { error } = await supabase.from("logistica_novedades").insert(row);
      if (error) setNovedades(prev => prev.filter(n => n.id !== row.id));
      return !error;
    }
  }, []);

  const eliminarNovedad = useCallback(async (id) => {
    const removed = novedades.find(n => n.id === id);
    setNovedades(prev => prev.filter(n => n.id !== id));
    const { error } = await supabase.from("logistica_novedades").delete().eq("id", id);
    if (error && removed) setNovedades(prev => [removed, ...prev]);
    return !error;
  }, [novedades]);

  // ── OPERACIÓN PORTUARIA: INSPECCIONES ────────────────────────

  const guardarInspeccion = useCallback(async (form, id = null) => {
    const row = {
      booking_id:     form.bookingId,
      fecha:          form.fecha || fechaLocalISO(),
      entidad:        form.entidad || "",
      resultado:      form.resultado || "",
      observaciones:  form.observaciones || null,
    };
    if (id) {
      setInspecciones(prev => prev.map(i => i.id === id ? rowToInspeccion({ ...row, id }) : i));
      const { error } = await supabase.from("logistica_inspecciones").update(row).eq("id", id);
      if (error) {
        supabase.from("logistica_inspecciones").select("*").order("fecha", { ascending: false })
          .then(({ data }) => data && setInspecciones(data.map(rowToInspeccion)));
      }
      return !error;
    } else {
      row.id = Date.now();
      setInspecciones(prev => [rowToInspeccion(row), ...prev]);
      const { error } = await supabase.from("logistica_inspecciones").insert(row);
      if (error) setInspecciones(prev => prev.filter(i => i.id !== row.id));
      return !error;
    }
  }, []);

  const eliminarInspeccion = useCallback(async (id) => {
    const removed = inspecciones.find(i => i.id === id);
    setInspecciones(prev => prev.filter(i => i.id !== id));
    const { error } = await supabase.from("logistica_inspecciones").delete().eq("id", id);
    if (error && removed) setInspecciones(prev => [removed, ...prev]);
    return !error;
  }, [inspecciones]);

  // ── CONTRATOS CON NAVIERAS ────────────────────────────────────

  const guardarContrato = useCallback(async (form, id = null) => {
    const row = {
      naviera:         form.naviera         || "",
      numero_contrato: form.numeroContrato  || null,
      fecha_inicio:    form.fechaInicio     || null,
      fecha_fin:       form.fechaFin        || null,
      destinos:        form.destinos        || [],
      obs:             form.obs             || null,
      updated_at:      new Date().toISOString(),
    };
    if (id) {
      setContratos(prev => prev.map(c => c.id === id ? rowToContrato({ ...row, id }) : c));
      const { error } = await supabase.from("logistica_contratos").update(row).eq("id", id);
      if (error) {
        supabase.from("logistica_contratos").select("*").order("fecha_fin", { ascending: true })
          .then(({ data }) => data && setContratos(data.map(rowToContrato)));
      }
      return !error;
    } else {
      row.id = Date.now();
      setContratos(prev => [rowToContrato(row), ...prev]);
      const { error } = await supabase.from("logistica_contratos").insert(row);
      if (error) setContratos(prev => prev.filter(c => c.id !== row.id));
      return !error;
    }
  }, []);

  const eliminarContrato = useCallback(async (id) => {
    const removed = contratos.find(c => c.id === id);
    setContratos(prev => prev.filter(c => c.id !== id));
    const { error } = await supabase.from("logistica_contratos").delete().eq("id", id);
    if (error && removed) setContratos(prev => [removed, ...prev]);
    return !error;
  }, [contratos]);

  // ── COSTO DE VENTA (1 por booking/contenedor — upsert por booking_id) ──

  const guardarCostoVenta = useCallback(async (bookingId, form) => {
    const numOrNull = (v) => v !== "" && v != null ? Number(v) : null;
    const previo = costoVenta.find(c => c.bookingId === bookingId);
    const row = {
      booking_id:       bookingId,
      tmr:              numOrNull(form.tmr),
      kilos:            numOrNull(form.kilos),
      precio_kg:        numOrNull(form.precioKg),
      tipo_caja:        form.tipoCaja || null,
      precio_caja:      numOrNull(form.precioCaja),
      costo_transporte: numOrNull(form.costoTransporte),
      costo_puerto:     numOrNull(form.costoPuerto),
      costo_agencia:    numOrNull(form.costoAgencia),
      margen:           numOrNull(form.margen) ?? 1.5,
      obs:              form.obs || null,
      updated_at:       new Date().toISOString(),
    };

    if (previo) {
      setCostoVenta(prev => prev.map(c => c.bookingId === bookingId ? rowToCostoVenta({ ...row, id: previo.id }) : c));
    } else {
      row.id = Date.now();
      setCostoVenta(prev => [...prev, rowToCostoVenta(row)]);
    }

    const { error } = await supabase.from("logistica_costo_venta").upsert(row, { onConflict: "booking_id" });
    if (error) {
      supabase.from("logistica_costo_venta").select("*")
        .then(({ data }) => data && setCostoVenta(data.map(rowToCostoVenta)));
    }
    return !error;
  }, [costoVenta]);

  return {
    bookings, transporte, novedades, inspecciones, contratos, costoVenta, loading,
    guardarBooking, eliminarBooking, marcarEtaVista, guardarNumeroProforma,
    guardarTransporte, eliminarTransporte,
    guardarNovedad, eliminarNovedad,
    guardarInspeccion, eliminarInspeccion,
    guardarContrato, eliminarContrato,
    guardarCostoVenta,
  };
}

// ── Cálculos puros (compartidos entre LogisticaTab y la campanita de alertas de App.jsx) ──

const ETIQUETAS_HITOS = [
  "Orden recibida", "Producción", "Packing terminado", "Booking confirmado",
  "Contenedor asignado", "Contenedor cargado", "Salió de planta", "Llegó al puerto",
  "Ingresó al puerto", "Zarpe", "Llegó a destino", "Entrega final",
];

export function calcularHitos(booking, transporteRows = []) {
  if (!booking) return ETIQUETAS_HITOS.map(label => ({ label, fecha: "", completado: false }));

  const delBooking = transporteRows.filter(t => t.bookingId === booking.id);
  const fechaCargue    = delBooking.map(t => t.fechaCargue).filter(Boolean).sort().slice(-1)[0]    || "";
  const fechaDescargue = delBooking.map(t => t.fechaDescargue).filter(Boolean).sort().slice(-1)[0] || "";

  const fechas = [
    booking.fechaOrdenRecibida,
    booking.fechaProduccion,
    booking.fechaPackingTerminado,
    booking.fechaConfirmado ? booking.fechaConfirmado.split("T")[0] : "",
    booking.fechaAsignacion,
    fechaCargue,
    fechaCargue,
    fechaDescargue,
    booking.fechaIngresoPuerto,
    booking.fechaZarpe,
    booking.fechaLlegadaDestino,
    booking.fechaEntregaFinal,
  ];

  return ETIQUETAS_HITOS.map((label, i) => ({ label, fecha: fechas[i] || "", completado: !!fechas[i] }));
}

export function diasEntre(fechaISO, ahora = new Date()) {
  if (!fechaISO) return null;
  return diferenciaDiasLocal(fechaISO, fechaLocalISO(ahora));
}

export function diferenciaDias(fechaDesdeISO, fechaHastaISO) {
  return diferenciaDiasLocal(fechaDesdeISO, fechaHastaISO);
}

export function buscarNaviera(navierasCfg, nombre) {
  if (!nombre) return null;
  return navierasCfg.find(n => (n.nombre || "").trim().toLowerCase() === nombre.trim().toLowerCase()) || null;
}

// Días restantes de free time para un booking (null si la naviera no tiene regla, falta la fecha base, o la operación ya terminó)
export function diasLibresRestantes(booking, navierasCfg) {
  if (booking.estado === "Finalizado" || booking.estado === "Cancelado") return null;
  const naviera = buscarNaviera(navierasCfg, booking.naviera);
  if (!naviera || naviera.diasLibres == null) return null;
  const fechaBase = naviera.diasLibresDesde === "ingreso_puerto" ? booking.fechaIngresoPuerto
    : naviera.diasLibresDesde === "asignacion" ? booking.fechaAsignacion
    : null;
  if (!fechaBase) return null;
  return naviera.diasLibres - diasEntre(fechaBase);
}

const ID_OPERACION = (b) => b.numeroBooking || b.numeroContenedor || `#${b.id}`;

export function calcularAlertasLogistica(bookings = [], transporte = [], navierasCfg = [], contratos = []) {
  const alertas = [];
  const ahora = new Date();

  bookings.forEach(b => {
    if (b.estado === "Cancelado" || b.estado === "Finalizado") return;
    if (calcularHitos(b, transporte).every(h => h.completado)) return;

    if (b.siCutoffFecha) {
      const cutoff = new Date(`${b.siCutoffFecha}T${b.siCutoffHora || "23:59"}`);
      const horas = (cutoff - ahora) / 3600000;
      if (horas <= 48) {
        alertas.push({
          tipo: "si_cutoff", icon: "⏰", color: horas < 0 ? "#FF6B6B" : "#F9A826",
          titulo: horas < 0 ? "SI Cut Off vencido" : "SI Cut Off próximo",
          detalle: `${ID_OPERACION(b)} — ${b.siCutoffFecha} ${b.siCutoffHora || ""}`.trim(),
          bookingId: b.id,
        });
      }
    }

    if (b.cyCutoffFecha) {
      const cutoff = new Date(`${b.cyCutoffFecha}T${b.cyCutoffHora || "23:59"}`);
      const horas = (cutoff - ahora) / 3600000;
      if (horas <= 48) {
        alertas.push({
          tipo: "cy_cutoff", icon: "⏰", color: horas < 0 ? "#FF6B6B" : "#F9A826",
          titulo: horas < 0 ? "CY Cut Off vencido" : "CY Cut Off próximo",
          detalle: `${ID_OPERACION(b)} — ${b.cyCutoffFecha} ${b.cyCutoffHora || ""}`.trim(),
          bookingId: b.id,
        });
      }
    }

    if (b.estado === "Confirmado" && !b.documentosCompletos) {
      alertas.push({
        tipo: "documentacion", icon: "📄", color: "#F9A826", titulo: "Falta documentación",
        detalle: `${ID_OPERACION(b)} — confirmado sin marcar documentos completos`, bookingId: b.id,
      });
    }

    if (b.estado === "Roll Over") {
      alertas.push({
        tipo: "roll_over", icon: "🔄", color: "#845EF7", titulo: "Roll Over",
        detalle: `${ID_OPERACION(b)} está en Roll Over`, bookingId: b.id,
      });
    }

    const naviera = buscarNaviera(navierasCfg, b.naviera);
    const transDelBooking = transporte.filter(t => t.bookingId === b.id);
    const fechaDescargue = transDelBooking.map(t => t.fechaDescargue).filter(Boolean).sort().slice(-1)[0];

    if (naviera?.diasLibresDesde === "ingreso_puerto" && fechaDescargue && !b.fechaIngresoPuerto) {
      const horasDesde = (ahora - new Date(fechaDescargue + "T00:00:00")) / 3600000;
      if (horasDesde >= 24) {
        alertas.push({
          tipo: "sin_ingreso_puerto", icon: "🚢", color: "#FF6B6B", titulo: "Contenedor sin ingresar a puerto",
          detalle: `${ID_OPERACION(b)} — camión descargó el ${fechaDescargue} y el contenedor aún no registra ingreso a puerto`,
          bookingId: b.id,
        });
      }
    }

    if (b.etaAnterior && b.etaActual && b.etaActual !== b.etaAnterior && !b.etaCambioVisto) {
      alertas.push({
        tipo: "eta_cambio", icon: "🛳️", color: "#0EA5E9", titulo: "El buque cambió de itinerario",
        detalle: `${ID_OPERACION(b)} — ETA cambió de ${b.etaAnterior} a ${b.etaActual}`,
        bookingId: b.id, accion: "marcarEtaVista",
      });
    }

    if (naviera && naviera.diasLibres != null) {
      const fechaBase = naviera.diasLibresDesde === "ingreso_puerto" ? b.fechaIngresoPuerto
        : naviera.diasLibresDesde === "asignacion" ? b.fechaAsignacion
        : null;
      if (fechaBase) {
        const transcurridos = diasEntre(fechaBase, ahora);
        const restantes = naviera.diasLibres - transcurridos;
        if (restantes <= 3) {
          alertas.push({
            tipo: "dias_libres", icon: "📦", color: restantes < 0 ? "#FF6B6B" : "#F9A826",
            titulo: restantes < 0 ? "Días libres vencidos" : `Días libres por vencer (${restantes}d)`,
            detalle: `${ID_OPERACION(b)} — ${b.naviera} — ${restantes < 0 ? `vencido hace ${Math.abs(restantes)} día(s)` : `${restantes} día(s) restantes`}`,
            bookingId: b.id,
          });
        }
      }
    }
  });

  const hoyStr = fechaLocalISO(ahora);
  contratos.forEach(c => {
    if (!c.fechaFin) return;
    const restantes = diferenciaDias(hoyStr, c.fechaFin);
    if (restantes <= 30) {
      alertas.push({
        tipo: "contrato_vencimiento", icon: "📄", color: restantes < 0 ? "#FF6B6B" : "#F9A826",
        titulo: restantes < 0 ? "Contrato vencido" : "Contrato por vencer",
        detalle: `${c.naviera}${c.numeroContrato ? ` — contrato ${c.numeroContrato}` : ""} — ${restantes < 0 ? `vencido hace ${Math.abs(restantes)} día(s)` : `vence en ${restantes} día(s) (${c.fechaFin})`}`,
        contratoId: c.id,
      });
    }
  });

  return alertas;
}

// ── Estadísticas operativas por período (Mes/Trimestre/Semestre/Año) ──────
// Pedido del jefe: reservas/exportaciones, puertos, transportadores,
// inspecciones, navieras y destinos, consultables por período.
//
// El "período" de una reserva siempre se define por la fecha en que se creó
// el booking (createdAt) — es la única fecha que existe siempre, incluso en
// una reserva cancelada el mismo día que se creó. Cualquier otra fecha
// (zarpe, confirmación) falta en las canceladas/pendientes y dejaría mal
// el conteo de "total gestionadas" vs "canceladas" que pide el punto 1.

// Calendario: mes 0-indexado (0=enero). Devuelve el rango [desde,hasta] en
// milisegundos (hora local) más una etiqueta legible para mostrar.
export function rangoPeriodoOperativo(tipo, anio, sub) {
  let mesDesde, mesHasta;
  if (tipo === "año") { mesDesde = 0; mesHasta = 11; }
  else if (tipo === "semestre") { mesDesde = (sub - 1) * 6; mesHasta = mesDesde + 5; }
  else if (tipo === "trimestre") { mesDesde = (sub - 1) * 3; mesHasta = mesDesde + 2; }
  else { mesDesde = sub - 1; mesHasta = sub - 1; } // mes

  const desde = new Date(anio, mesDesde, 1, 0, 0, 0, 0);
  const hasta = new Date(anio, mesHasta + 1, 0, 23, 59, 59, 999);
  const fmtMes = (m) => new Date(anio, m, 1).toLocaleDateString("es-CO", { month: "long" });

  let label;
  if (tipo === "año")        label = `Año ${anio}`;
  else if (tipo === "semestre")  label = `Semestre ${sub} de ${anio} (${fmtMes(mesDesde)} – ${fmtMes(mesHasta)})`;
  else if (tipo === "trimestre") label = `Trimestre ${sub} de ${anio} (${fmtMes(mesDesde)} – ${fmtMes(mesHasta)})`;
  else label = `${fmtMes(mesDesde)[0].toUpperCase()}${fmtMes(mesDesde).slice(1)} de ${anio}`;

  return { desdeMs: desde.getTime(), hastaMs: hasta.getTime(), mesDesde, mesHasta, label };
}

function enRango(fechaISO, desdeMs, hastaMs) {
  if (!fechaISO) return false;
  const t = new Date(fechaISO).getTime();
  return !Number.isNaN(t) && t >= desdeMs && t <= hastaMs;
}

// items: array de strings (pueden venir vacíos) ya recortado al período.
// totalRef: denominador para el % de participación (se pasa explícito
// porque a veces es el total de reservas del período y otras el total de
// registros de otra tabla, p.ej. transporte o inspecciones).
function rankearPorValor(items, totalRef) {
  const counts = {};
  items.forEach(v => { if (v) counts[v] = (counts[v] || 0) + 1; });
  return Object.entries(counts)
    .map(([nombre, cantidad]) => ({
      nombre, cantidad,
      pct: totalRef > 0 ? Math.round((cantidad / totalRef) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

export function calcularEstadisticasPeriodo(bookings, transporte, inspecciones, { desdeMs, hastaMs, mesDesde, mesHasta }, anio) {
  const bkPeriodo = bookings.filter(b => enRango(b.createdAt, desdeMs, hastaMs));
  const idsPeriodo = new Set(bkPeriodo.map(b => b.id));
  const totalReservas = bkPeriodo.length;

  const llenadas   = bkPeriodo.filter(b => b.estadoContenedor === "Lleno" || b.estadoContenedor === "Embarcado").length;
  const canceladas = bkPeriodo.filter(b => b.estado === "Cancelado").length;

  const puertos   = rankearPorValor(bkPeriodo.map(b => b.puertoOrigen), totalReservas);
  const destinos  = rankearPorValor(bkPeriodo.map(b => b.puertoDestino), totalReservas);
  const navieras  = rankearPorValor(bkPeriodo.map(b => b.naviera), totalReservas);

  const transportePeriodo = transporte.filter(t => idsPeriodo.has(t.bookingId));
  const transportadores = rankearPorValor(transportePeriodo.map(t => t.transportadora), transportePeriodo.length);

  const inspeccionesPeriodo = inspecciones.filter(i => idsPeriodo.has(i.bookingId));
  const bookingPorId = new Map(bkPeriodo.map(b => [b.id, b]));
  const contenedoresInspeccionados = new Set(inspeccionesPeriodo.map(i => i.bookingId)).size;
  const inspeccionesPorPuerto = rankearPorValor(
    inspeccionesPeriodo.map(i => bookingPorId.get(i.bookingId)?.puertoOrigen),
    inspeccionesPeriodo.length
  );

  // Evolución mensual de inspecciones dentro del rango elegido (según la
  // fecha propia de cada inspección, no la del booking).
  const evolucionInspecciones = [];
  for (let m = mesDesde; m <= mesHasta; m++) {
    const key = `${anio}-${String(m + 1).padStart(2, "0")}`;
    const label = new Date(anio, m, 1).toLocaleDateString("es-CO", { month: "short" }).replace(".", "");
    evolucionInspecciones.push({
      key, label,
      cantidad: inspeccionesPeriodo.filter(i => (i.fecha || "").slice(0, 7) === key).length,
    });
  }

  return {
    totalReservas, llenadas, canceladas,
    pctLlenadas:   totalReservas ? Math.round((llenadas   / totalReservas) * 1000) / 10 : 0,
    pctCanceladas: totalReservas ? Math.round((canceladas / totalReservas) * 1000) / 10 : 0,
    puertos, destinos, navieras, transportadores,
    inspecciones: {
      total: inspeccionesPeriodo.length,
      contenedoresInspeccionados,
      porPuerto: inspeccionesPorPuerto,
      evolucion: evolucionInspecciones,
    },
    // Para las secciones que siguen usando el formato {label,value,color} (BarraLista)
    bkPeriodo,
  };
}
