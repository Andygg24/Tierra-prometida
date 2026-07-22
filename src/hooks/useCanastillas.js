import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase.js";

const CHUNK = 500;

const rowToCanastilla = (r) => ({
  id:                     r.id,
  codigo:                 r.codigo,
  estado:                 r.estado || "disponible", // disponible|prestada|faltante|perdida|baja
  proveedorActual:        r.proveedor_actual || null,
  fechaUltimoMovimiento:  r.fecha_ultimo_movimiento || null,
  obs:                    r.obs || "",
});

// tipo de movimiento -> nuevo estado/proveedor de la canastilla
const efectoTipo = (tipo, proveedor) => {
  if (tipo === "prestamo")   return { estado: "prestada", proveedor_actual: proveedor || null };
  if (tipo === "devolucion") return { estado: "disponible", proveedor_actual: null };
  if (tipo === "perdida")    return { estado: "perdida", proveedor_actual: null };
  if (tipo === "baja")       return { estado: "baja", proveedor_actual: null };
  return { estado: "disponible", proveedor_actual: null };
};

const rowToRonda = (r) => ({
  id:                r.id,
  fecha:             r.fecha,
  obs:               r.obs || "",
  totalEsperadas:    r.total_esperadas || 0,
  totalEncontradas:  r.total_encontradas || 0,
  cerrada:           !!r.cerrada,
});

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export function useCanastillas() {
  const [canastillas, setCanastillas] = useState([]);
  const [rondaActiva, setRondaActiva] = useState(null);
  const [rondas, setRondas] = useState([]); // rondas cerradas, más reciente primero
  const [loading, setLoading] = useState(true);

  const pendingRef    = useRef([]);
  const flushTimerRef = useRef(null);

  // ── Carga inicial ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from("canastillas").select("*").order("codigo"),
      supabase.from("canastilla_rondas").select("*").order("created_at", { ascending: false }),
    ]).then(([{ data: cs }, { data: rondasData }]) => {
      if (cancelled) return;
      setCanastillas((cs || []).map(rowToCanastilla));
      const activa  = (rondasData || []).find(r => !r.cerrada);
      const cerradas = (rondasData || []).filter(r => r.cerrada);
      setRondaActiva(activa ? rowToRonda(activa) : null);
      setRondas(cerradas.map(rowToRonda));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Realtime canastillas — merge por id + debounce (evita tormenta en cargas masivas) ──
  useEffect(() => {
    const mergeById = (prev, eventos) => {
      const mapa = new Map(prev.map(c => [c.id, c]));
      eventos.forEach(({ eventType, row, oldId }) => {
        if (eventType === "DELETE") mapa.delete(oldId);
        else if (row) mapa.set(row.id, rowToCanastilla(row));
      });
      return Array.from(mapa.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
    };

    const flush = () => {
      if (!pendingRef.current.length) return;
      const eventos = pendingRef.current;
      pendingRef.current = [];
      setCanastillas(prev => mergeById(prev, eventos));
    };

    const schedule = (evento) => {
      pendingRef.current.push(evento);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(flush, 180);
    };

    const ch = supabase.channel(`canastillas-changes-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "canastillas" }, ({ new: row, old, eventType }) => {
        schedule({ eventType, row, oldId: old?.id });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "canastilla_rondas" }, ({ new: row, eventType }) => {
        if (eventType !== "DELETE" && row) {
          if (row.cerrada) {
            setRondaActiva(prev => (prev?.id === row.id ? null : prev));
            setRondas(prev => prev.some(r => r.id === row.id) ? prev : [rowToRonda(row), ...prev]);
          } else {
            setRondaActiva(rowToRonda(row));
          }
        }
      })
      .subscribe();

    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      supabase.removeChannel(ch);
    };
  }, []);

  // ── Mutaciones — canastillas ─────────────────────────────────

  const crearLote = useCallback(async ({ prefijo, cantidad, obs }) => {
    const pref = (prefijo || "TP-").trim();
    const { data: ultimos } = await supabase.from("canastillas")
      .select("codigo").ilike("codigo", `${pref}%`)
      .order("codigo", { ascending: false }).limit(1);

    let start = 1;
    if (ultimos?.[0]?.codigo) {
      const m = ultimos[0].codigo.slice(pref.length).match(/\d+/);
      if (m) start = parseInt(m[0], 10) + 1;
    }

    const base = Date.now();
    const codigos = [];
    const filasCanastillas = [];
    const filasMovimientos = [];
    for (let i = 0; i < cantidad; i++) {
      const codigo = `${pref}${String(start + i).padStart(6, "0")}`;
      codigos.push(codigo);
      filasCanastillas.push({
        id: base + i,
        codigo,
        estado: "disponible",
        fecha_ultimo_movimiento: null,
        obs: obs || null,
      });
      filasMovimientos.push({
        id: base + 1_000_000 + i,
        canastilla_id: base + i,
        codigo,
        tipo: "alta",
        fecha: new Date().toISOString().split("T")[0],
        obs: obs || null,
      });
    }

    for (const parte of chunk(filasCanastillas, CHUNK)) {
      const { error } = await supabase.from("canastillas").insert(parte);
      if (error) return { ok: false, codigos: [] };
    }
    for (const parte of chunk(filasMovimientos, CHUNK)) {
      await supabase.from("canastilla_movimientos").insert(parte);
    }

    setCanastillas(prev => {
      const mapa = new Map(prev.map(c => [c.id, c]));
      filasCanastillas.forEach(f => mapa.set(f.id, rowToCanastilla(f)));
      return Array.from(mapa.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
    });

    return { ok: true, codigos };
  }, []);

  // Reporte puntual de un solo código (pérdida / baja / marcar disponible), fuera de una ronda.
  const reportarEstado = useCallback(async (codigo, { tipo, obs, fecha }) => {
    const actual = canastillas.find(c => c.codigo.toUpperCase() === codigo.toUpperCase());
    const fechaMov = fecha || new Date().toISOString().split("T")[0];
    if (!actual) return false;

    const efecto = tipo === "perdida" || tipo === "baja" ? efectoTipo(tipo) : { estado: tipo, proveedor_actual: null };
    const { error } = await supabase.from("canastillas")
      .update({ ...efecto, fecha_ultimo_movimiento: fechaMov, obs: obs || null })
      .eq("id", actual.id);
    if (error) return false;

    await supabase.from("canastilla_movimientos").insert({
      id: Date.now(), canastilla_id: actual.id, codigo: actual.codigo,
      tipo, fecha: fechaMov, obs: obs || null,
    });

    setCanastillas(prev => prev.map(c => c.id === actual.id
      ? { ...c, estado: efecto.estado, proveedorActual: efecto.proveedor_actual, fechaUltimoMovimiento: fechaMov, obs: obs || c.obs }
      : c));
    return true;
  }, [canastillas]);

  // Préstamo / devolución en lote (con proveedor) — desde la pestaña Escanear.
  const confirmarLotePrestamo = useCallback(async ({ codigos, tipo, proveedor, fecha, obs }) => {
    const fechaMov = fecha || new Date().toISOString().split("T")[0];
    const efecto   = efectoTipo(tipo, proveedor);

    const existentesMap = new Map(canastillas.map(c => [c.codigo, c]));
    const existentes = codigos.filter(c => existentesMap.has(c));
    const nuevos      = codigos.filter(c => !existentesMap.has(c));

    if (existentes.length) {
      for (const parte of chunk(existentes, CHUNK)) {
        await supabase.from("canastillas")
          .update({ ...efecto, fecha_ultimo_movimiento: fechaMov, obs: obs || null })
          .in("codigo", parte);
      }
    }

    let filasNuevas = [];
    if (nuevos.length) {
      const base = Date.now();
      filasNuevas = nuevos.map((codigo, i) => ({
        id: base + i, codigo, ...efecto, fecha_ultimo_movimiento: fechaMov, obs: obs || null,
      }));
      for (const parte of chunk(filasNuevas, CHUNK)) {
        await supabase.from("canastillas").insert(parte);
      }
    }

    setCanastillas(prev => {
      const mapa = new Map(prev.map(c => [c.id, c]));
      existentes.forEach(codigo => {
        const c = existentesMap.get(codigo);
        mapa.set(c.id, { ...c, estado: efecto.estado, proveedorActual: efecto.proveedor_actual, fechaUltimoMovimiento: fechaMov, obs: obs || c.obs });
      });
      filasNuevas.forEach(f => mapa.set(f.id, rowToCanastilla(f)));
      return Array.from(mapa.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
    });

    const idsPorCodigo = new Map();
    existentes.forEach(codigo => idsPorCodigo.set(codigo, existentesMap.get(codigo).id));
    filasNuevas.forEach(f => idsPorCodigo.set(f.codigo, f.id));

    const baseMov = Date.now() + 2_000_000;
    const filasMovimientos = codigos.map((codigo, i) => ({
      id: baseMov + i, canastilla_id: idsPorCodigo.get(codigo), codigo, tipo,
      proveedor: proveedor || null, fecha: fechaMov, obs: obs || null,
    }));
    for (const parte of chunk(filasMovimientos, CHUNK)) {
      await supabase.from("canastilla_movimientos").insert(parte);
    }

    return { actualizados: existentes.length, creados: filasNuevas.length };
  }, [canastillas]);

  const obtenerHistorial = useCallback(async (codigo) => {
    const { data } = await supabase.from("canastilla_movimientos")
      .select("*").eq("codigo", codigo)
      .order("created_at", { ascending: false });
    return (data || []).map(m => ({ id: m.id, tipo: m.tipo, proveedor: m.proveedor || null, fecha: m.fecha, obs: m.obs || "" }));
  }, []);

  const buscarPorCodigo = useCallback((codigo) => {
    const c = (codigo || "").trim().toUpperCase();
    return canastillas.find(x => x.codigo.toUpperCase() === c) || null;
  }, [canastillas]);

  // Actividad reciente de TODAS las canastillas (no una en particular) — para
  // un vistazo general de qué se ha estado haciendo.
  const obtenerMovimientosRecientes = useCallback(async (limit = 60) => {
    const { data } = await supabase.from("canastilla_movimientos")
      .select("*").order("created_at", { ascending: false }).limit(limit);
    return (data || []).map(m => ({
      id: m.id, codigo: m.codigo, tipo: m.tipo, proveedor: m.proveedor || null, fecha: m.fecha, obs: m.obs || "",
    }));
  }, []);

  // Elimina una sola canastilla (borrado real, no "baja" — también borra su historial por cascada).
  const eliminarCanastilla = useCallback(async (codigo) => {
    const actual = buscarPorCodigo(codigo);
    if (!actual) return false;
    const { error } = await supabase.from("canastillas").delete().eq("id", actual.id);
    if (error) return false;
    setCanastillas(prev => prev.filter(c => c.id !== actual.id));
    return true;
  }, [buscarPorCodigo]);

  // Reinicia por completo el registro de canastillas — borra TODOS los seriales creados.
  const eliminarTodasCanastillas = useCallback(async () => {
    const { error } = await supabase.from("canastillas").delete().gt("id", 0);
    if (error) return false;
    setCanastillas([]);
    return true;
  }, []);

  // ── Mutaciones — rondas de conteo ────────────────────────────

  const iniciarRonda = useCallback(async ({ fecha, obs }) => {
    const esperadas = canastillas.filter(c => c.estado === "disponible" || c.estado === "faltante").length;
    const row = {
      id: Date.now(), fecha: fecha || new Date().toISOString().split("T")[0],
      obs: obs || null, total_esperadas: esperadas, total_encontradas: 0, cerrada: false,
    };
    const { error } = await supabase.from("canastilla_rondas").insert(row);
    if (error) return null;
    const ronda = rowToRonda(row);
    setRondaActiva(ronda);
    return ronda;
  }, [canastillas]);

  // Registra que una canastilla fue vista físicamente en la ronda activa.
  const registrarConteo = useCallback(async (codigo, rondaId) => {
    const actual = buscarPorCodigo(codigo);
    const fechaHoy = new Date().toISOString().split("T")[0];

    if (!actual) {
      // No existía — se registra como nueva y ya contada.
      const id = Date.now();
      const nueva = { id, codigo: codigo.trim().toUpperCase(), estado: "disponible", fecha_ultimo_movimiento: fechaHoy, obs: null };
      const { error } = await supabase.from("canastillas").insert(nueva);
      if (error) return { ok: false, nueva: false };
      await supabase.from("canastilla_movimientos").insert({
        id: id + 1, canastilla_id: id, codigo: nueva.codigo, tipo: "conteo", ronda_id: rondaId, fecha: fechaHoy,
      });
      setCanastillas(prev => [...prev, rowToCanastilla(nueva)].sort((a, b) => a.codigo.localeCompare(b.codigo)));
      return { ok: true, nueva: true };
    }

    if (actual.estado !== "baja") {
      await supabase.from("canastillas")
        .update({ estado: "disponible", proveedor_actual: null, fecha_ultimo_movimiento: fechaHoy })
        .eq("id", actual.id);
      setCanastillas(prev => prev.map(c => c.id === actual.id ? { ...c, estado: "disponible", proveedorActual: null, fechaUltimoMovimiento: fechaHoy } : c));
    }
    await supabase.from("canastilla_movimientos").insert({
      id: Date.now(), canastilla_id: actual.id, codigo: actual.codigo, tipo: "conteo", ronda_id: rondaId, fecha: fechaHoy,
    });
    return { ok: true, nueva: false };
  }, [buscarPorCodigo]);

  // Cierra la ronda: todo lo esperado que no fue escaneado pasa a "faltante".
  const cerrarRonda = useCallback(async (rondaId) => {
    const { data: encontradasRows } = await supabase.from("canastilla_movimientos")
      .select("canastilla_id").eq("ronda_id", rondaId).eq("tipo", "conteo");
    const encontradasIds = new Set((encontradasRows || []).map(r => r.canastilla_id));

    const esperadas = canastillas.filter(c => c.estado === "disponible" || c.estado === "faltante");
    const faltantes = esperadas.filter(c => !encontradasIds.has(c.id));
    const faltantesIds = faltantes.map(c => c.id);
    const fechaHoy = new Date().toISOString().split("T")[0];

    for (const parte of chunk(faltantesIds, CHUNK)) {
      if (!parte.length) continue;
      await supabase.from("canastillas")
        .update({ estado: "faltante", fecha_ultimo_movimiento: fechaHoy })
        .in("id", parte);
    }

    const baseMov = Date.now();
    const filasFaltante = faltantes.map((c, i) => ({
      id: baseMov + i, canastilla_id: c.id, codigo: c.codigo, tipo: "faltante", ronda_id: rondaId, fecha: fechaHoy,
    }));
    for (const parte of chunk(filasFaltante, CHUNK)) {
      await supabase.from("canastilla_movimientos").insert(parte);
    }

    const { error } = await supabase.from("canastilla_rondas").update({
      cerrada: true, closed_at: new Date().toISOString(), total_encontradas: encontradasIds.size,
    }).eq("id", rondaId);
    if (error) return { ok: false };

    setCanastillas(prev => prev.map(c => faltantesIds.includes(c.id) ? { ...c, estado: "faltante" } : c));
    const rondaCerrada = rondaActiva?.id === rondaId
      ? { ...rondaActiva, cerrada: true, totalEncontradas: encontradasIds.size }
      : null;
    setRondaActiva(null);
    if (rondaCerrada) setRondas(rs => [rondaCerrada, ...rs]);
    return { ok: true, encontradas: encontradasIds.size, faltantes: faltantesIds.length };
  }, [canastillas, rondaActiva]);

  // Reconstruye el detalle de una ronda (encontradas / faltantes) para el informe.
  const obtenerInformeRonda = useCallback(async (ronda) => {
    const { data } = await supabase.from("canastilla_movimientos")
      .select("codigo, tipo, fecha").eq("ronda_id", ronda.id).in("tipo", ["conteo", "faltante"]);
    const encontradas = (data || []).filter(m => m.tipo === "conteo").map(m => m.codigo).sort();
    const faltantes   = (data || []).filter(m => m.tipo === "faltante").map(m => m.codigo).sort();
    return { ronda, encontradas, faltantes };
  }, []);

  // Elimina una ronda cerrada del historial y deshace su efecto: las
  // canastillas que quedaron "faltante" por esta ronda (y que nadie marcó
  // manualmente como perdida/baja después) vuelven a "disponible" — la idea
  // de borrar una ronda es poder arrancar un conteo nuevo sin arrastrar
  // faltantes viejos. El historial de movimientos de cada canastilla no se
  // pierde, solo queda sin ronda asociada.
  const eliminarRonda = useCallback(async (rondaId) => {
    const { data: faltanteRows } = await supabase.from("canastilla_movimientos")
      .select("canastilla_id").eq("ronda_id", rondaId).eq("tipo", "faltante");
    const idsFaltantes = [...new Set((faltanteRows || []).map(r => r.canastilla_id))];

    if (idsFaltantes.length) {
      for (const parte of chunk(idsFaltantes, CHUNK)) {
        await supabase.from("canastillas")
          .update({ estado: "disponible" })
          .in("id", parte)
          .eq("estado", "faltante");
      }
    }

    const { error } = await supabase.from("canastilla_rondas").delete().eq("id", rondaId);
    if (error) return false;

    setRondas(prev => prev.filter(r => r.id !== rondaId));
    if (idsFaltantes.length) {
      setCanastillas(prev => prev.map(c => idsFaltantes.includes(c.id) && c.estado === "faltante" ? { ...c, estado: "disponible" } : c));
    }
    return true;
  }, []);

  return {
    canastillas, rondaActiva, rondas, loading,
    crearLote, reportarEstado, obtenerHistorial, buscarPorCodigo, confirmarLotePrestamo,
    iniciarRonda, registrarConteo, cerrarRonda, obtenerInformeRonda, eliminarRonda,
    eliminarCanastilla, eliminarTodasCanastillas, obtenerMovimientosRecientes,
  };
}
