import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase.js";

const CHUNK = 500;

const rowToCanastilla = (r) => ({
  id:                     r.id,
  codigo:                 r.codigo,
  estado:                 r.estado || "disponible",
  proveedorActual:        r.proveedor_actual || null,
  fechaUltimoMovimiento:  r.fecha_ultimo_movimiento || null,
  obs:                    r.obs || "",
});

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// tipo de movimiento -> nuevo estado/proveedor de la canastilla
const efectoTipo = (tipo, proveedor) => {
  if (tipo === "alta" || tipo === "prestamo") return { estado: "prestada", proveedor_actual: proveedor || null };
  if (tipo === "devolucion")                 return { estado: "disponible", proveedor_actual: null };
  if (tipo === "perdida")                    return { estado: "perdida", proveedor_actual: null };
  if (tipo === "baja")                       return { estado: "baja", proveedor_actual: null };
  return { estado: "disponible", proveedor_actual: null };
};

export function useCanastillas() {
  const [canastillas, setCanastillas] = useState([]);
  const [loading, setLoading] = useState(true);

  const pendingRef   = useRef([]);
  const flushTimerRef = useRef(null);

  // ── Carga inicial ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    supabase.from("canastillas").select("*").order("codigo")
      .then(({ data }) => {
        if (cancelled) return;
        setCanastillas((data || []).map(rowToCanastilla));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Realtime — merge por id + debounce (evita tormenta en cargas masivas) ──
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
      .subscribe();

    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      supabase.removeChannel(ch);
    };
  }, []);

  // ── Mutaciones ───────────────────────────────────────────────

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
        proveedor_actual: null,
        fecha_ultimo_movimiento: null,
        obs: obs || null,
      });
      filasMovimientos.push({
        id: base + 1_000_000 + i,
        canastilla_id: base + i,
        codigo,
        tipo: "alta",
        proveedor: null,
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

  const confirmarLoteEscaneo = useCallback(async ({ codigos, tipo, proveedor, fecha, obs }) => {
    const fechaMov = fecha || new Date().toISOString().split("T")[0];
    const efecto   = efectoTipo(tipo, proveedor);

    const existentesMap = new Map(canastillas.map(c => [c.codigo, c]));
    const existentes = codigos.filter(c => existentesMap.has(c));
    const nuevos      = codigos.filter(c => !existentesMap.has(c));

    if (existentes.length) {
      await supabase.from("canastillas")
        .update({ ...efecto, fecha_ultimo_movimiento: fechaMov, obs: obs || null })
        .in("codigo", existentes);
    }

    let filasNuevas = [];
    if (nuevos.length) {
      const base = Date.now();
      filasNuevas = nuevos.map((codigo, i) => ({
        id: base + i,
        codigo,
        ...efecto,
        fecha_ultimo_movimiento: fechaMov,
        obs: obs || null,
      }));
      for (const parte of chunk(filasNuevas, CHUNK)) {
        await supabase.from("canastillas").insert(parte);
      }
    }

    setCanastillas(prev => {
      const mapa = new Map(prev.map(c => [c.id, c]));
      existentes.forEach(codigo => {
        const actual = existentesMap.get(codigo);
        mapa.set(actual.id, {
          ...actual,
          estado: efecto.estado,
          proveedorActual: efecto.proveedor_actual,
          fechaUltimoMovimiento: fechaMov,
          obs: obs || actual.obs,
        });
      });
      filasNuevas.forEach(f => mapa.set(f.id, rowToCanastilla(f)));
      return Array.from(mapa.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
    });

    const idsPorCodigo = new Map();
    existentes.forEach(codigo => idsPorCodigo.set(codigo, existentesMap.get(codigo).id));
    filasNuevas.forEach(f => idsPorCodigo.set(f.codigo, f.id));

    const baseMov = Date.now() + 2_000_000;
    const filasMovimientos = codigos.map((codigo, i) => ({
      id: baseMov + i,
      canastilla_id: idsPorCodigo.get(codigo),
      codigo,
      tipo,
      proveedor: proveedor || null,
      fecha: fechaMov,
      obs: obs || null,
    }));
    for (const parte of chunk(filasMovimientos, CHUNK)) {
      await supabase.from("canastilla_movimientos").insert(parte);
    }

    return { actualizados: existentes.length, creados: filasNuevas.length };
  }, [canastillas]);

  const reportarEstado = useCallback(async (codigo, { tipo, obs, fecha }) => {
    const res = await confirmarLoteEscaneo({ codigos: [codigo], tipo, proveedor: null, fecha, obs });
    return res.actualizados > 0 || res.creados > 0;
  }, [confirmarLoteEscaneo]);

  const obtenerHistorial = useCallback(async (codigo) => {
    const { data } = await supabase.from("canastilla_movimientos")
      .select("*").eq("codigo", codigo)
      .order("created_at", { ascending: false });
    return (data || []).map(m => ({
      id: m.id, tipo: m.tipo, proveedor: m.proveedor || null, fecha: m.fecha, obs: m.obs || "",
    }));
  }, []);

  const buscarPorCodigo = useCallback((codigo) => {
    const c = (codigo || "").trim().toUpperCase();
    return canastillas.find(x => x.codigo.toUpperCase() === c) || null;
  }, [canastillas]);

  return {
    canastillas, loading,
    crearLote, confirmarLoteEscaneo, reportarEstado, obtenerHistorial, buscarPorCodigo,
  };
}
