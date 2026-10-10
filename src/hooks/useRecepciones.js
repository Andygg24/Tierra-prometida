import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../supabase.js";
import { conReintentos } from "../utils/consultas.js";

// La lista NO carga todo el historial: por defecto trae solo las últimas N de
// cada tipo (entrada/salida), y si el usuario elige un rango de fechas o busca
// algo, la consulta se hace en la base con ese filtro. Se lee de a páginas
// chicas porque lo que cuesta es Postgres leyendo las fotos guardadas dentro
// de `estibas` (~250 KB por fila): una consulta grande se pasa del timeout de
// Supabase (~3 s) y varias chicas no.
const TAM_PAGINA   = 10;
const MAX_RANGO    = 500;
const MAX_BUSQUEDA = 50;

const porFechaDesc = (a, b) => (b.fecha || "").localeCompare(a.fecha || "") || b.id - a.id;
// Los filtros `or` de PostgREST se rompen con estos caracteres.
const limpiarBusqueda = (s) => String(s || "").replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();

const paginaLista = ({ tipo, desde, hasta, busqueda }, cursor, n) => {
  let q = supabase.from("recepciones_lista").select("*")
    .order("fecha", { ascending: false }).order("id", { ascending: false }).limit(n);
  if (tipo)   q = q.eq("tipo", tipo);
  if (desde)  q = q.gte("fecha", desde);
  if (hasta)  q = q.lte("fecha", hasta);
  if (busqueda) {
    const b = `*${busqueda}*`;
    q = q.or(`remision.ilike.${b},proveedor.ilike.${b},placa.ilike.${b},lote.ilike.${b}`);
  }
  if (cursor) q = q.or(`fecha.lt.${cursor.fecha},and(fecha.eq.${cursor.fecha},id.lt.${cursor.id})`);
  return q;
};

const rowToRecepcion = (r) => ({
  id:         r.id,
  remision:   r.remision   || "",
  fecha:      r.fecha      || "",
  tipo:       r.tipo       || "entrada",
  placa:      r.placa      || "",
  conductor:  r.conductor  || "",
  cedulaConductor: r.cedula_conductor || "",
  origen:     r.origen     || "",
  proveedor:  r.proveedor  || "",
  lote:       r.lote       || "",
  codigoLote: r.codigo_lote || "",
  cajasLote:  r.cajas_lote != null ? Number(r.cajas_lote) : null,
  supervisor: r.supervisor || "",
  horaInicio: r.hora_inicio || "",
  horaFin:    r.hora_fin    || "",
  observaciones: r.observaciones || "",
  fotosComparacionProveedor: Array.isArray(r.fotos_comparacion_proveedor) ? r.fotos_comparacion_proveedor : [],
  estibas:    Array.isArray(r.estibas) ? r.estibas : [],
  total:      Number(r.total || 0),
});

const rowToAsignacion = (r) => ({
  id:                  r.id,
  recepcionId:         r.recepcion_id,
  numeroEstiba:        r.numero_estiba,
  contenedorId:        r.contenedor_id,
  cantidadCanastillas: r.cantidad_canastillas != null ? Number(r.cantidad_canastillas) : 0,
  obs:                 r.obs             || "",
  registradoPor:       r.registrado_por  || "",
  createdAt:           r.created_at      || "",
});

// Prefijo del código de lote de hoy: "MP-MEN01-AA-JJJ-" (AA = año, JJJ = día
// juliano). El consecutivo NN se agrega al generar.
export function prefijoLoteHoy() {
  const ahora   = new Date();
  const juliano = Math.round((new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()) - new Date(ahora.getFullYear(), 0, 0)) / 86400000);
  return `MP-MEN01-${String(ahora.getFullYear()).slice(-2)}-${String(juliano).padStart(3, "0")}-`;
}

// Opciones:
//  ultimas             cuántas de cada tipo traer cuando NO hay rango ni búsqueda (0 = ninguna)
//  desde / hasta        rango de fechas (YYYY-MM-DD); si hay alguno, manda sobre `ultimas`
//  busqueda             texto: remisión, proveedor, placa o lote (se busca en toda la base)
//  conAsignaciones      también trae las asignaciones a contenedor
//  traerReferenciadas   trae aparte las recepciones a las que apuntan las asignaciones,
//                       aunque estén fuera de la ventana (quedan en `conocidas`)
//  conLotes             trae id+lote de TODAS las recepciones (consulta liviana, sin estibas)
//  activo               false = no carga nada (pestaña oculta)
export function useRecepciones(opciones = {}) {
  const {
    ultimas = 5, desde = "", hasta = "", busqueda = "",
    conAsignaciones = true, traerReferenciadas = conAsignaciones,
    conLotes = false, activo = true,
  } = opciones;
  const busquedaLimpia = limpiarBusqueda(busqueda);
  const [busquedaDeb, setBusquedaDeb] = useState(busquedaLimpia);
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDeb(busquedaLimpia), 350);
    return () => clearTimeout(t);
  }, [busquedaLimpia]);

  const [recepciones,   setRecepciones]   = useState([]);
  const [extras,        setExtras]        = useState([]); // recepciones traídas por id, fuera de la ventana
  const [asignaciones,  setAsignaciones]  = useState([]);
  const [lotesPorRecepcion, setLotesPorRecepcion] = useState([]);
  const [loading,       setLoading]       = useState(true);  // solo la primera carga
  const [errorCarga,    setErrorCarga]    = useState("");
  // Contadores: subirlos vuelve a disparar la carga correspondiente (tiempo
  // real, botón Reintentar, error al guardar).
  const [tickVentana, setTickVentana] = useState(0);
  const [tickAsig,    setTickAsig]    = useState(0);
  const [tickLotes,   setTickLotes]   = useState(0);

  const extrasRef  = useRef([]);
  const pedidosRef = useRef(new Set()); // ids ya pedidos por id — no se repiten
  const flagsRef   = useRef({});
  const paramsCargadosRef = useRef("");
  useEffect(() => {
    extrasRef.current = extras;
    flagsRef.current = { conAsignaciones, traerReferenciadas, conLotes, activo };
  });

  const agregarExtras = useCallback((filas) => {
    setExtras(prev => {
      const m = new Map(prev.map(r => [r.id, r]));
      filas.forEach(r => m.set(r.id, r));
      return [...m.values()];
    });
  }, []);

  // ── Ventana de recepciones (últimas N por tipo, o rango, o búsqueda) ──
  const claveParams  = `${Number(ultimas) || 0}|${desde}|${hasta}|${busquedaDeb}`;
  const claveVentana = `${activo}|${claveParams}|${tickVentana}`;
  const [claveCargada, setClaveCargada] = useState("");
  const refrescando = activo && claveCargada !== claveVentana;

  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    // Con filtros nuevos la lista se va pintando por páginas; si es solo una
    // recarga de lo mismo (tiempo real), se cambia de golpe al final para que
    // no se encoja y vuelva a crecer.
    const progresivo = paramsCargadosRef.current !== claveParams;
    paramsCargadosRef.current = claveParams;

    const n = Number(ultimas) || 0;
    const hayFiltro = !!(desde || hasta || busquedaDeb);
    const grupos = hayFiltro
      ? [{ filtros: { desde, hasta, busqueda: busquedaDeb }, max: busquedaDeb && !desde && !hasta ? MAX_BUSQUEDA : MAX_RANGO }]
      : n > 0 ? ["entrada", "salida"].map(t => ({ filtros: { tipo: t }, max: n })) : [];
    const acumulado = grupos.map(() => []);
    const publicar = () => setRecepciones(acumulado.flat().sort(porFechaDesc));
    let fallo = "";

    (async () => {
      await Promise.all(grupos.map(async (g, gi) => {
        let cursor = null;
        while (acumulado[gi].length < g.max) {
          const tam = Math.min(TAM_PAGINA, g.max - acumulado[gi].length);
          const { data, error } = await conReintentos(() => paginaLista(g.filtros, cursor, tam));
          if (!vigente) return;
          if (error) { fallo = error.message; return; }
          acumulado[gi].push(...(data || []).map(rowToRecepcion));
          if (progresivo) publicar();
          if ((data || []).length < tam) return;
          const ult = acumulado[gi][acumulado[gi].length - 1];
          if (!ult.fecha) return;
          cursor = { fecha: ult.fecha, id: ult.id };
        }
      }));
      if (!vigente) return;
      // Si falló y era una recarga, se conserva lo que ya se veía en vez de
      // reemplazarlo por una lista a medias.
      if (!fallo || progresivo) publicar();
      if (fallo) console.error("[recepciones]", fallo);
      setErrorCarga(fallo);
      setClaveCargada(claveVentana);
      setLoading(false);
    })();
    return () => { vigente = false; };
  }, [activo, ultimas, desde, hasta, busquedaDeb, claveParams, claveVentana]);

  const recargar = useCallback(() => setTickVentana(t => t + 1), []);

  // ── Asignaciones a contenedor ──
  useEffect(() => {
    if (!conAsignaciones || !activo) return;
    let vigente = true;
    (async () => {
      const { data, error } = await conReintentos(() => supabase.from("recepciones_asignaciones").select("*"));
      if (!vigente) return;
      if (error) { console.error("[recepciones_asignaciones]", error.message); return; }
      setAsignaciones((data || []).map(rowToAsignacion));
    })();
    return () => { vigente = false; };
  }, [conAsignaciones, activo, tickAsig]);

  // ── Lotes de todas las recepciones (liviano: sin estibas ni fotos) ──
  useEffect(() => {
    if (!conLotes || !activo) return;
    let vigente = true;
    (async () => {
      let { data, error } = await conReintentos(() => supabase.from("recepciones").select("id, lote, codigo_lote").or("lote.not.is.null,codigo_lote.not.is.null"));
      // Sin correr supabase-recepciones-codigo-lote-migration.sql la columna
      // no existe — se sigue con los lotes por predio de siempre.
      if (error) ({ data, error } = await conReintentos(() => supabase.from("recepciones").select("id, lote").not("lote", "is", null)));
      if (!vigente) return;
      if (error) { console.error("[recepciones lotes]", error.message); return; }
      setLotesPorRecepcion((data || []).map(r => ({ id: Number(r.id), lote: r.lote || "", codigoLote: r.codigo_lote || "" })).filter(r => r.lote || r.codigoLote));
    })();
    return () => { vigente = false; };
  }, [conLotes, activo, tickLotes]);

  // ── Recepciones referenciadas por las asignaciones (pueden ser viejas) ──
  useEffect(() => {
    if (!traerReferenciadas || !activo) return;
    const conocidos = new Set([...recepciones.map(r => r.id), ...extras.map(r => r.id)]);
    const faltan = [...new Set(asignaciones.map(a => a.recepcionId))]
      .filter(rid => rid != null && !conocidos.has(rid) && !pedidosRef.current.has(rid));
    if (!faltan.length) return;
    faltan.forEach(rid => pedidosRef.current.add(rid));
    (async () => {
      for (let i = 0; i < faltan.length; i += TAM_PAGINA) {
        const tanda = faltan.slice(i, i + TAM_PAGINA);
        const { data, error } = await conReintentos(() => supabase.from("recepciones_lista").select("*").in("id", tanda));
        if (error) {
          console.error("[recepciones referenciadas]", error.message);
          tanda.forEach(rid => pedidosRef.current.delete(rid)); // se reintenta en el próximo cambio
          return;
        }
        agregarExtras((data || []).map(rowToRecepcion));
      }
    })();
  }, [asignaciones, recepciones, extras, traerReferenciadas, activo, agregarExtras]);

  const refrescarExtras = useCallback(async () => {
    const ids = extrasRef.current.map(r => r.id);
    if (!ids.length) return;
    const borrados = new Set();
    for (let i = 0; i < ids.length; i += TAM_PAGINA) {
      const tanda = ids.slice(i, i + TAM_PAGINA);
      const { data, error } = await conReintentos(() => supabase.from("recepciones_lista").select("*").in("id", tanda));
      if (error) return;
      const vistos = new Set((data || []).map(r => r.id));
      tanda.forEach(rid => { if (!vistos.has(rid)) borrados.add(rid); });
      agregarExtras((data || []).map(rowToRecepcion));
    }
    if (borrados.size) setExtras(prev => prev.filter(r => !borrados.has(r.id)));
  }, [agregarExtras]);

  // Trae UNA recepción por id (p. ej. al escanear la tirilla de una estiba
  // de una recepción que no está en la ventana actual).
  const cargarRecepcionPorId = useCallback(async (idRaw) => {
    const id = Number(idRaw);
    if (!Number.isFinite(id)) return null;
    const { data, error } = await conReintentos(() => supabase.from("recepciones_lista").select("*").eq("id", id).maybeSingle());
    if (error || !data) return null;
    const r = rowToRecepcion(data);
    pedidosRef.current.add(id);
    agregarExtras([r]);
    return r;
  }, [agregarExtras]);

  // Ventana + extras, sin duplicados — para buscar por id sin importar
  // si la recepción está en la lista visible o no.
  const conocidas = useMemo(() => {
    const m = new Map(extras.map(r => [r.id, r]));
    recepciones.forEach(r => m.set(r.id, r));
    return [...m.values()];
  }, [recepciones, extras]);

  // ── Suscripción en tiempo real ────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`recepciones-changes-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "recepciones" }, () => {
        const f = flagsRef.current;
        if (!f.activo) return;
        setTickVentana(t => t + 1);
        if (f.traerReferenciadas) refrescarExtras();
        if (f.conLotes) setTickLotes(t => t + 1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "recepciones_asignaciones" }, () => {
        const f = flagsRef.current;
        if (f.conAsignaciones && f.activo) setTickAsig(t => t + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refrescarExtras]);

  // Aplica un cambio local a la recepción en la ventana y en los extras.
  const parchar = useCallback((id, fn) => {
    setRecepciones(prev => prev.map(r => r.id === id ? fn(r) : r));
    setExtras(prev => prev.map(r => r.id === id ? fn(r) : r));
  }, []);

  // ── Mutaciones — recepciones ───────────────────────────────────

  // Devuelve el id de la recepción si se guardó, false si falló.
  const guardarRecepcion = useCallback(async (form, id = null) => {
    const row = {
      remision:    form.remision    || null,
      fecha:       form.fecha,
      tipo:        form.tipo        || "entrada",
      placa:       form.placa       || null,
      conductor:   form.conductor   || null,
      cedula_conductor: form.cedulaConductor || null,
      origen:      form.origen      || null,
      proveedor:   form.proveedor   || null,
      lote:        form.lote        || null,
      supervisor:  form.supervisor  || null,
      hora_inicio: form.horaInicio  || null,
      hora_fin:    form.horaFin     || null,
      observaciones: form.observaciones || null,
      fotos_comparacion_proveedor: Array.isArray(form.fotosComparacionProveedor) ? form.fotosComparacionProveedor : [],
      estibas:     form.estibas     || [],
      total:       Number(form.total || 0),
      updated_at:  new Date().toISOString(),
    };

    if (id) {
      // codigo_lote no va en `row` (se genera aparte) — se conserva el que ya tenía.
      parchar(id, r => ({ ...rowToRecepcion({ ...row, id }), codigoLote: r.codigoLote }));
      const { error } = await supabase.from("recepciones").update(row).eq("id", id);
      if (error) { setTickVentana(t => t + 1); refrescarExtras(); }
      return error ? false : id;
    } else {
      row.id = Date.now();
      setRecepciones(prev => [rowToRecepcion(row), ...prev]);
      const { error } = await supabase.from("recepciones").insert(row);
      if (error) setRecepciones(prev => prev.filter(r => r.id !== row.id));
      return error ? false : row.id; // id guardado (truthy) — para ofrecer el QR del lote
    }
  }, [parchar, refrescarExtras]);

  const eliminarRecepcion = useCallback(async (id) => {
    const removed = conocidas.find(r => r.id === id);
    setRecepciones(prev => prev.filter(r => r.id !== id));
    setExtras(prev => prev.filter(r => r.id !== id));
    const { error } = await supabase.from("recepciones").delete().eq("id", id);
    if (error && removed) setRecepciones(prev => [removed, ...prev]);
    return !error;
  }, [conocidas]);

  // Actualiza solo el arreglo de estibas — usado por Verificación de Estibas
  // para marcar una estiba como "usada" al escanear su tirilla, sin tener
  // que reenviar el resto de la recepción.
  //
  // OJO: las estibas que llegan aquí salen de la lista (recepciones_lista),
  // que no trae `fotoPesoBruto`. Si se escribieran tal cual, el update
  // BORRARÍA las fotos de peso de toda la recepción. Por eso se lee el
  // arreglo guardado (una sola fila) y se conservan sus fotos. Si no se puede
  // leer, no se escribe nada — mejor fallar que perder fotos.
  const actualizarEstibas = useCallback(async (id, estibas) => {
    const { data: actual, error: errLeer } = await conReintentos(() =>
      supabase.from("recepciones").select("estibas").eq("id", id).single());
    if (errLeer) { console.error("[recepciones] actualizarEstibas (leer fotos)", errLeer.message); return false; }
    const fotoPorNumero = new Map(
      (Array.isArray(actual?.estibas) ? actual.estibas : []).filter(e => e?.fotoPesoBruto).map(e => [e.numero, e.fotoPesoBruto])
    );
    const conFotos = estibas.map(e => (e.fotoPesoBruto || !fotoPorNumero.has(e.numero)) ? e : { ...e, fotoPesoBruto: fotoPorNumero.get(e.numero) });
    const { error } = await supabase.from("recepciones")
      .update({ estibas: conFotos, updated_at: new Date().toISOString() }).eq("id", id);
    if (!error) parchar(id, r => ({ ...r, estibas }));
    return !error;
  }, [parchar]);

  // Cajas empacadas de este lote — el supervisor lo escribe a mano en
  // Verificación de Estibas, o lo llena el botón "Calcular" (suma desde
  // Packing List). Update suelto, igual que actualizarEstibas.
  const actualizarCajasLote = useCallback(async (id, cajasLote) => {
    const { error } = await supabase.from("recepciones")
      .update({ cajas_lote: cajasLote, updated_at: new Date().toISOString() }).eq("id", id);
    if (!error) parchar(id, r => ({ ...r, cajasLote }));
    return !error;
  }, [parchar]);

  // Código de lote MP-MEN01-AA-JJJ-NN (AA = año, JJJ = día juliano del
  // momento en que se genera, NN = consecutivo del día). Si la recepción ya
  // tiene uno se devuelve ese — nunca se cambia. El índice único en
  // codigo_lote evita repetir consecutivo si dos personas generan a la vez:
  // se reintenta con el siguiente número.
  const generarCodigoLote = useCallback(async (id) => {
    const { data: actual, error: errLeer } = await conReintentos(() =>
      supabase.from("recepciones").select("codigo_lote").eq("id", id).single());
    if (errLeer) return { error: errLeer.message };
    if (actual?.codigo_lote) return { codigo: actual.codigo_lote };

    const prefijo = prefijoLoteHoy();

    for (let intento = 0; intento < 5; intento++) {
      const { data: delDia, error: errDia } = await conReintentos(() =>
        supabase.from("recepciones").select("codigo_lote").like("codigo_lote", `${prefijo}%`));
      if (errDia) return { error: errDia.message };
      const maxNum = (delDia || []).reduce((mx, r) => Math.max(mx, Number(String(r.codigo_lote).slice(prefijo.length)) || 0), 0);
      const codigo = `${prefijo}${String(maxNum + 1).padStart(2, "0")}`;
      const { data: upd, error } = await supabase.from("recepciones")
        .update({ codigo_lote: codigo }).eq("id", id).is("codigo_lote", null).select("codigo_lote");
      if (error?.code === "23505") continue; // otro lo tomó al mismo tiempo
      if (error) return { error: error.message };
      // 0 filas = alguien le generó código a esta recepción en paralelo — se usa ese.
      if (!upd?.length) return generarCodigoLote(id);
      parchar(id, r => ({ ...r, codigoLote: codigo }));
      setTickLotes(t => t + 1);
      return { codigo };
    }
    return { error: "No se pudo asignar un consecutivo libre. Intenta de nuevo." };
  }, [parchar]);

  // Código escrito a mano — respaldo por si la generación automática falla.
  // Solo se asigna si la recepción aún no tiene código; el índice único
  // impide repetir uno que ya use otra recepción.
  const asignarCodigoLoteManual = useCallback(async (id, codigoRaw) => {
    const codigo = String(codigoRaw || "").trim().toUpperCase();
    if (!codigo) return { error: "Escribe el código del lote." };
    const { data: upd, error } = await supabase.from("recepciones")
      .update({ codigo_lote: codigo }).eq("id", id).is("codigo_lote", null).select("codigo_lote");
    if (error?.code === "23505") return { error: `El código ${codigo} ya lo tiene otra recepción.` };
    if (error) return { error: error.message };
    if (!upd?.length) return { error: "Esta recepción ya tiene un código de lote. Elimínalo primero si quieres cambiarlo." };
    parchar(id, r => ({ ...r, codigoLote: codigo }));
    setTickLotes(t => t + 1);
    return { codigo };
  }, [parchar]);

  // Quita el código de lote de la recepción (p. ej. generado por error). Los
  // pallets que ya lo tenían asignado lo conservan tal cual.
  const eliminarCodigoLote = useCallback(async (id) => {
    const { error } = await supabase.from("recepciones").update({ codigo_lote: null }).eq("id", id);
    if (error) return { error: error.message };
    parchar(id, r => ({ ...r, codigoLote: "" }));
    setTickLotes(t => t + 1);
    return {};
  }, [parchar]);

  // ── Mutaciones — asignaciones a contenedor (Asociar Contenedor) ────────
  // Una estiba puede repartirse entre varios contenedores — cada asignación
  // guarda cuántas canastillas de esa estiba fueron para ese contenedor.

  const guardarAsignacion = useCallback(async (form) => {
    const row = {
      id:                   Date.now(),
      recepcion_id:         form.recepcionId,
      numero_estiba:        Number(form.numeroEstiba),
      contenedor_id:        form.contenedorId != null && form.contenedorId !== "" ? Number(form.contenedorId) : null, // null = reserva, sin contenedor todavía
      cantidad_canastillas: Number(form.cantidadCanastillas) || 0,
      obs:                  form.obs || null,
      registrado_por:       form.registradoPor || null,
    };
    setAsignaciones(prev => [rowToAsignacion(row), ...prev]);
    const { error } = await supabase.from("recepciones_asignaciones").insert(row);
    if (error) {
      console.error("[recepciones_asignaciones.insert]", error.message);
      setAsignaciones(prev => prev.filter(a => a.id !== row.id));
    }
    return { ok: !error, error };
  }, []);

  const eliminarAsignacion = useCallback(async (id) => {
    const removed = asignaciones.find(a => a.id === id);
    setAsignaciones(prev => prev.filter(a => a.id !== id));
    const { error } = await supabase.from("recepciones_asignaciones").delete().eq("id", id);
    if (error && removed) setAsignaciones(prev => [removed, ...prev]);
    return !error;
  }, [asignaciones]);

  // La lista carga desde recepciones_lista (sin fotos, para no repetir el
  // timeout por payload gigante). Para editar una recepción puntual hace
  // falta la fila completa (con fotoPesoBruto y fotos_comparacion_proveedor)
  // — se trae aparte, por id, que al ser una sola fila es rápido.
  const obtenerRecepcionCompleta = useCallback(async (id) => {
    const { data, error } = await conReintentos(() => supabase.from("recepciones").select("*").eq("id", id).single());
    if (error) { console.error("[recepciones] obtenerRecepcionCompleta", error.message); return null; }
    return rowToRecepcion(data);
  }, []);

  return {
    recepciones, conocidas, asignaciones, lotesPorRecepcion,
    loading, refrescando, errorCarga, recargar,
    guardarRecepcion, eliminarRecepcion, actualizarEstibas, actualizarCajasLote, generarCodigoLote, asignarCodigoLoteManual, eliminarCodigoLote,
    guardarAsignacion, eliminarAsignacion, obtenerRecepcionCompleta, cargarRecepcionPorId,
  };
}
