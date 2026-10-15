import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";

const nombreUsuarioSesion = () => {
  try { return JSON.parse(localStorage.getItem("tp_session"))?.nombre || ""; } catch { return ""; }
};

const rowToSesion = (r) => ({
  id: r.id, contenedorId: r.contenedor_id, turno: r.turno,
  grupoTrabajoId: r.grupo_trabajo_id, fecha: r.fecha,
  valorBase: Number(r.valor_base || 0), fotos: Array.isArray(r.fotos) ? r.fotos : [],
  asignados: Array.isArray(r.asignados) ? r.asignados : [],
  abiertaPor: r.abierta_por || "", abiertaEn: r.abierta_en, cerradaEn: r.cerrada_en,
  activa: !!r.activa,
});

const rowToAjuste = (r) => ({
  id: r.id, contenedorId: r.contenedor_id, empNum: r.emp_num || null,
  concepto: r.concepto || "", monto: Number(r.monto || 0),
  creadoPor: r.creado_por || "", createdAt: r.created_at,
});

const rowToEvento = (r) => ({
  id: r.id, sesionId: r.sesion_id, empNum: r.emp_num, tipo: r.tipo, hora: r.hora,
  via: r.via || "qr",
});

// Puentea el check-in por QR con la tubería de pago que ya existe
// (grupos_trabajo.miembros + contenedores.grupo_dia/grupo_noche), para que el
// Liquidador ("Pago por Contenedor") detecte automáticamente a quien escaneó,
// sin duplicar esa lógica. `contenedoresApi` es la instancia ya montada de
// useContenedores() en el componente, para no abrir una segunda suscripción
// realtime a las mismas tablas.
export function useAsistenciaQR({ procesos, grupos, guardarGrupo, guardarContenedor }) {
  const [sesionActiva, setSesionActiva] = useState(null);
  const [ajustes,      setAjustes]      = useState([]);
  const [eventos,      setEventos]      = useState([]);
  const [loading,      setLoading]      = useState(true);

  // ── Sesión activa (si alguien la dejó abierta en otro dispositivo) ──
  useEffect(() => {
    let cancelled = false;
    supabase.from("asistencia_sesiones").select("*").eq("activa", true)
      .order("abierta_en", { ascending: false }).limit(1)
      .then(({ data }) => {
        if (cancelled) return;
        setSesionActiva(data && data[0] ? rowToSesion(data[0]) : null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const ch = supabase.channel(`asistencia-sesiones-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "asistencia_sesiones" }, ({ new: row, old, eventType }) => {
        if (eventType === "DELETE") {
          setSesionActiva(prev => (prev?.id === old?.id ? null : prev));
          return;
        }
        if (row?.activa) setSesionActiva(rowToSesion(row));
        else setSesionActiva(prev => (prev?.id === row?.id ? null : prev));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Ajustes del contenedor de la sesión activa ──
  // (si no hay sesión activa, `ajustes` simplemente conserva su último valor
  // — no se renderiza en ningún lado sin una sesión activa que lo acompañe)
  useEffect(() => {
    if (!sesionActiva) return;
    let cancelled = false;
    const cargar = () => supabase.from("contenedor_ajustes").select("*")
      .eq("contenedor_id", sesionActiva.contenedorId).order("created_at", { ascending: true })
      .then(({ data }) => { if (!cancelled) setAjustes((data || []).map(rowToAjuste)); });
    cargar();
    const ch = supabase.channel(`contenedor-ajustes-${sesionActiva.contenedorId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "contenedor_ajustes", filter: `contenedor_id=eq.${sesionActiva.contenedorId}` }, cargar)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [sesionActiva?.contenedorId]);

  // ── Eventos de entrada/salida de la sesión activa ─────────────
  useEffect(() => {
    if (!sesionActiva) return;
    let cancelled = false;
    const cargar = () => supabase.from("asistencia_eventos").select("*")
      .eq("sesion_id", sesionActiva.id).order("hora", { ascending: true })
      .then(({ data }) => { if (!cancelled) setEventos((data || []).map(rowToEvento)); });
    cargar();
    const ch = supabase.channel(`asistencia-eventos-${sesionActiva.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "asistencia_eventos", filter: `sesion_id=eq.${sesionActiva.id}` }, cargar)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [sesionActiva?.id]);

  // Grupo de trabajo del contenedor para ese turno (lo crea si no existe).
  const grupoDeContenedor = useCallback(async (contenedor, turno) => {
    const campoGrupo    = turno === "Noche" ? "grupoNoche" : "grupoDia";
    const nombreActual  = contenedor[campoGrupo];
    const grupo = nombreActual ? grupos.find(g => g.nombre === nombreActual) : null;
    if (grupo) return grupo;
    const nombreGrupo = `C${contenedor.numContenedor || contenedor.id}-${turno}`;
    let { data } = await supabase.from("grupos_trabajo").select("*").eq("nombre", nombreGrupo).maybeSingle();
    if (!data) {
      await guardarGrupo({ nombre: nombreGrupo, turno, miembros: [] });
      ({ data } = await supabase.from("grupos_trabajo").select("*").eq("nombre", nombreGrupo).maybeSingle());
    }
    if (!data) return null;
    await guardarContenedor({ ...contenedor, [campoGrupo]: nombreGrupo }, contenedor.id);
    return { id: data.id, nombre: data.nombre, turno: data.turno, miembros: data.miembros || [] };
  }, [grupos, guardarGrupo, guardarContenedor]);

  const agregarAlGrupo = async (grupoId, nums) => {
    if (!grupoId || !nums.length) return;
    const { data } = await supabase.from("grupos_trabajo").select("miembros").eq("id", grupoId).maybeSingle();
    const actuales = Array.isArray(data?.miembros) ? data.miembros : [];
    const nuevos = Array.from(new Set([...actuales, ...nums]));
    if (nuevos.length !== actuales.length) await supabase.from("grupos_trabajo").update({ miembros: nuevos }).eq("id", grupoId);
  };

  const recargarEventos = async (sesionId) => {
    const { data } = await supabase.from("asistencia_eventos").select("*").eq("sesion_id", sesionId).order("hora", { ascending: true });
    setEventos((data || []).map(rowToEvento));
  };

  // ── Abrir sesión de escaneo ──────────────────────────────────
  const abrirSesion = useCallback(async ({ contenedorId, turno, valorBase }) => {
    const contenedor = procesos.find(p => p.id === contenedorId);
    if (!contenedor) return { ok: false, msg: "Contenedor no encontrado" };

    const grupo = await grupoDeContenedor(contenedor, turno);
    if (!grupo) return { ok: false, msg: "No se pudo crear el grupo de trabajo" };

    const row = {
      id: Date.now(),
      contenedor_id: contenedorId,
      turno,
      grupo_trabajo_id: grupo.id,
      fecha: new Date().toISOString().split("T")[0],
      valor_base: valorBase || 180000,
      asignados: [],
      fotos: [],
      abierta_por: nombreUsuarioSesion(),
      activa: true,
    };
    setSesionActiva(rowToSesion(row));
    const { error } = await supabase.from("asistencia_sesiones").insert(row);
    if (error) { setSesionActiva(null); return { ok: false, msg: error.message }; }
    return { ok: true };
  }, [procesos, grupoDeContenedor]);

  // ── Cambiar el contenedor del proceso abierto (p. ej. se abrió con uno
  // provisional). Se mueve todo lo del proceso: quienes marcaron pasan al
  // grupo del nuevo contenedor, los ajustes hechos en este proceso y el
  // contenedor que aparece en la Asistencia Manual. ──
  const cambiarContenedor = useCallback(async (nuevoId) => {
    if (!sesionActiva) return { ok: false, msg: "No hay proceso abierto" };
    if (nuevoId === sesionActiva.contenedorId) return { ok: true };
    const nuevo = procesos.find(p => p.id === nuevoId);
    if (!nuevo) return { ok: false, msg: "Contenedor no encontrado" };
    const grupo = await grupoDeContenedor(nuevo, sesionActiva.turno);
    if (!grupo) return { ok: false, msg: "No se pudo crear el grupo de trabajo del contenedor" };

    const { data: evs } = await supabase.from("asistencia_eventos").select("emp_num").eq("sesion_id", sesionActiva.id).eq("tipo", "entrada");
    const entrantes = [...new Set((evs || []).map(e => e.emp_num))];
    await agregarAlGrupo(grupo.id, entrantes);

    // Del grupo anterior se sacan solo los que entraron por este proceso (no
    // los que trabajaron ese contenedor otros días).
    if (sesionActiva.grupoTrabajoId && sesionActiva.grupoTrabajoId !== grupo.id && entrantes.length) {
      const { data: otras } = await supabase.from("asistencia_sesiones").select("id")
        .eq("grupo_trabajo_id", sesionActiva.grupoTrabajoId).neq("id", sesionActiva.id);
      let mantener = new Set();
      if (otras?.length) {
        const { data: ev2 } = await supabase.from("asistencia_eventos").select("emp_num")
          .in("sesion_id", otras.map(o => o.id)).eq("tipo", "entrada");
        mantener = new Set((ev2 || []).map(e => e.emp_num));
      }
      const { data: gViejo } = await supabase.from("grupos_trabajo").select("miembros").eq("id", sesionActiva.grupoTrabajoId).maybeSingle();
      const viejos = Array.isArray(gViejo?.miembros) ? gViejo.miembros : [];
      await supabase.from("grupos_trabajo").update({ miembros: viejos.filter(n => !entrantes.includes(n) || mantener.has(n)) }).eq("id", sesionActiva.grupoTrabajoId);
    }

    await supabase.from("contenedor_ajustes").update({ contenedor_id: nuevoId })
      .eq("contenedor_id", sesionActiva.contenedorId).gte("created_at", sesionActiva.abiertaEn);
    await supabase.from("asistencia").update({ contenedor: nuevo.numContenedor || null }).eq("sesion_id", sesionActiva.id);

    const { error } = await supabase.from("asistencia_sesiones")
      .update({ contenedor_id: nuevoId, grupo_trabajo_id: grupo.id }).eq("id", sesionActiva.id);
    if (error) return { ok: false, msg: error.message };
    setSesionActiva(prev => prev ? { ...prev, contenedorId: nuevoId, grupoTrabajoId: grupo.id } : prev);
    return { ok: true };
  }, [sesionActiva, procesos, grupoDeContenedor]);

  // ── Movimientos de hoy marcados sin proceso abierto (sin contenedor).
  // Desde el inicio de la jornada del Biométrico, pero nunca antes de hoy. ──
  const movimientosSinContenedor = useCallback(async () => {
    const { data: cfg } = await supabase.from("configuracion").select("valor").eq("clave", "biometrico_jornada").maybeSingle();
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const inicio = cfg?.valor?.inicio && new Date(cfg.valor.inicio) > hoy ? cfg.valor.inicio : hoy.toISOString();
    const { data, error } = await supabase.from("asistencia_eventos").select("*")
      .is("sesion_id", null).gte("hora", inicio).order("hora", { ascending: true });
    if (error) return [];
    return (data || []).map(rowToEvento);
  }, []);

  // Asigna esos movimientos al proceso abierto: cuentan para su asistencia y pago.
  const asignarSinContenedor = useCallback(async () => {
    if (!sesionActiva) return { ok: false, msg: "No hay proceso abierto" };
    const evs = await movimientosSinContenedor();
    if (!evs.length) return { ok: true, n: 0, personas: 0 };
    const { error } = await supabase.from("asistencia_eventos").update({ sesion_id: sesionActiva.id }).in("id", evs.map(e => e.id));
    if (error) return { ok: false, msg: error.message };
    const entrantes = [...new Set(evs.filter(e => e.tipo === "entrada").map(e => e.empNum))];
    await agregarAlGrupo(sesionActiva.grupoTrabajoId, entrantes);
    const contenedor = procesos.find(p => p.id === sesionActiva.contenedorId);
    if (entrantes.length) {
      const { data: emps } = await supabase.from("empleados").select("nombre").in("num", entrantes);
      const nombres = (emps || []).map(e => e.nombre);
      const hoy = new Date();
      const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
      if (nombres.length) {
        await supabase.from("asistencia").update({ contenedor: contenedor?.numContenedor || null, sesion_id: sesionActiva.id })
          .eq("fecha", fecha).in("emp_nombre", nombres).not("hora_registro", "is", null);
      }
    }
    await recargarEventos(sesionActiva.id);
    return { ok: true, n: evs.length, personas: new Set(evs.map(e => e.empNum)).size };
  }, [sesionActiva, procesos, movimientosSinContenedor]);

  // ── Registrar un escaneo válido (empleado ya existente) — el mismo QR
  // alterna entre entrada y salida según el último evento de esa persona
  // en esta sesión, para poder reconstruir idas y vueltas durante el proceso ─
  // `via`: "qr" (por defecto) o "rostro" — queda en el evento para saber
  // cómo se marcó cada entrada/salida.
  const registrarEscaneo = useCallback(async (num, via = "qr") => {
    if (!sesionActiva) return { ok: false, msg: "No hay proceso abierto" };

    const { data: emp } = await supabase.from("empleados").select("num,nombre,activo").eq("num", num).maybeSingle();
    if (!emp) return { ok: false, msg: "QR no reconocido" };
    if (!emp.activo) return { ok: false, msg: `${emp.nombre} está inactivo` };

    const { data: ultimoEvento } = await supabase.from("asistencia_eventos").select("tipo")
      .eq("sesion_id", sesionActiva.id).eq("emp_num", num)
      .order("hora", { ascending: false }).limit(1).maybeSingle();
    const esPrimeraVez = !ultimoEvento;
    const tipo = (esPrimeraVez || ultimoEvento.tipo === "salida") ? "entrada" : "salida";
    const ahora = new Date();

    const nuevoEvento = { id: Date.now(), sesion_id: sesionActiva.id, emp_num: num, tipo, hora: ahora.toISOString() };
    // Solo se manda `via` cuando no es QR, para que el QR siga funcionando
    // aunque la migración de rostros todavía no se haya corrido.
    if (via !== "qr") nuevoEvento.via = via;
    const { error: errorEvento } = await supabase.from("asistencia_eventos").insert(nuevoEvento);
    if (errorEvento) {
      return { ok: false, msg: `No se pudo guardar el movimiento (¿corriste la migración SQL más reciente?): ${errorEvento.message}` };
    }
    // Actualiza el estado local de una vez — no depende de que la tabla tenga
    // Realtime habilitado en Supabase para que ESTE dispositivo vea el cambio.
    setEventos(prev => [...prev, rowToEvento(nuevoEvento)]);

    if (tipo === "entrada") {
      const { data: grupoRow } = await supabase.from("grupos_trabajo").select("miembros").eq("id", sesionActiva.grupoTrabajoId).maybeSingle();
      const miembrosActuales = Array.isArray(grupoRow?.miembros) ? grupoRow.miembros : [];
      if (!miembrosActuales.includes(num)) {
        await supabase.from("grupos_trabajo").update({ miembros: [...miembrosActuales, num] }).eq("id", sesionActiva.grupoTrabajoId);
      }
      if (esPrimeraVez) {
        const contenedor = procesos.find(p => p.id === sesionActiva.contenedorId);
        await supabase.from("asistencia").upsert({
          fecha: ahora.toISOString().split("T")[0],
          emp_nombre: emp.nombre,
          estado: "P",
          contenedor: contenedor?.numContenedor || null,
          hora_registro: ahora.toISOString(),
          sesion_id: sesionActiva.id,
          via_qr: true,
        }, { onConflict: "fecha,emp_nombre" });
      }
    }

    return { ok: true, nombre: emp.nombre, hora: ahora, tipo, yaEstaba: !esPrimeraVez };
  }, [sesionActiva, procesos]);

  // ── Registro rápido de personal temporal (nombre + documento) ─
  const registrarTemporal = useCallback(async ({ nombre, num, doc }) => {
    if (!sesionActiva) return { ok: false, msg: "No hay proceso abierto" };
    const nombreLimpio = nombre?.trim();
    const numLimpio    = num?.trim();
    if (!nombreLimpio || !numLimpio) return { ok: false, msg: "Nombre y documento son obligatorios" };

    const { data: existente } = await supabase.from("empleados").select("*").eq("num", numLimpio).maybeSingle();
    if (existente && existente.es_temporal && !existente.activo) {
      await supabase.from("empleados").update({ activo: true, nombre: nombreLimpio }).eq("num", numLimpio);
    } else if (!existente) {
      const { error } = await supabase.from("empleados").insert({
        no: null, nombre: nombreLimpio, doc: doc?.trim() || "CC Nacional", num: numLimpio,
        activo: true, es_temporal: true,
      });
      if (error) return { ok: false, msg: error.message };
    }
    // Si ya existía activo (fijo o temporal en curso), simplemente se registra su llegada.

    return registrarEscaneo(numLimpio);
  }, [sesionActiva, registrarEscaneo]);

  // ── Personas asignadas al contenedor (lista planeada, distinta de quién
  // ya escaneó) — sirve para saber a quién generarle/enviarle el QR y, en
  // el informe final, comparar asignados vs. asistencia real ─────
  const asignarPersona = useCallback(async (num) => {
    if (!sesionActiva) return false;
    if (sesionActiva.asignados.includes(num)) return true;
    const nuevos = [...sesionActiva.asignados, num];
    setSesionActiva(prev => prev ? { ...prev, asignados: nuevos } : prev);
    const { error } = await supabase.from("asistencia_sesiones").update({ asignados: nuevos }).eq("id", sesionActiva.id);
    return !error;
  }, [sesionActiva]);

  const quitarAsignado = useCallback(async (num) => {
    if (!sesionActiva) return false;
    const nuevos = sesionActiva.asignados.filter(n => n !== num);
    setSesionActiva(prev => prev ? { ...prev, asignados: nuevos } : prev);
    const { error } = await supabase.from("asistencia_sesiones").update({ asignados: nuevos }).eq("id", sesionActiva.id);
    return !error;
  }, [sesionActiva]);

  // ── Cerrar sesión ──────────────────────────────────────────────
  const cerrarSesion = useCallback(async () => {
    if (!sesionActiva) return { ok: false };
    const { data: grupoRow } = await supabase.from("grupos_trabajo").select("miembros").eq("id", sesionActiva.grupoTrabajoId).maybeSingle();
    const miembros = Array.isArray(grupoRow?.miembros) ? grupoRow.miembros : [];
    if (miembros.length) {
      await supabase.from("empleados").update({ activo: false }).in("num", miembros).eq("es_temporal", true);
    }
    const cerradaEn = new Date().toISOString();
    await supabase.from("asistencia_sesiones")
      .update({ activa: false, cerrada_en: cerradaEn })
      .eq("id", sesionActiva.id);
    setSesionActiva(null);
    return { ok: true, cerradaEn };
  }, [sesionActiva]);

  // ── Foto de evidencia (se van acumulando en la sesión) ─────────
  const subirFoto = useCallback(async (dataUrl) => {
    if (!sesionActiva) return false;
    const nuevasFotos = [...sesionActiva.fotos, dataUrl];
    setSesionActiva(prev => prev ? { ...prev, fotos: nuevasFotos } : prev);
    const { error } = await supabase.from("asistencia_sesiones").update({ fotos: nuevasFotos }).eq("id", sesionActiva.id);
    return !error;
  }, [sesionActiva]);

  // ── Ajustes de pago (contenedor si empNum es null, individual si no) ──
  const agregarAjuste = useCallback(async ({ contenedorId, empNum, concepto, monto }) => {
    const row = { id: Date.now(), contenedor_id: contenedorId, emp_num: empNum || null, concepto, monto: Number(monto), creado_por: nombreUsuarioSesion() };
    setAjustes(prev => [...prev, rowToAjuste(row)]);
    const { error } = await supabase.from("contenedor_ajustes").insert(row);
    if (error) setAjustes(prev => prev.filter(a => a.id !== row.id));
    return !error;
  }, []);

  const eliminarAjuste = useCallback(async (id) => {
    const anterior = ajustes;
    setAjustes(prev => prev.filter(a => a.id !== id));
    const { error } = await supabase.from("contenedor_ajustes").delete().eq("id", id);
    if (error) setAjustes(anterior);
    return !error;
  }, [ajustes]);

  // ── Cálculo de pago: cada persona gana el valor base completo (igual que
  // "Pago por Contenedor" en Nómina: valor × contenedores, por persona), más
  // su parte de los ajustes generales del contenedor (se reparten entre
  // todos) y sus ajustes propios ──
  const calcularPago = useCallback((contenedorId) => {
    const contenedor = procesos.find(p => p.id === contenedorId);
    if (!contenedor) return null;
    const gDia   = grupos.find(g => g.nombre === contenedor.grupoDia);
    const gNoche = grupos.find(g => g.nombre === contenedor.grupoNoche);
    // Proceso abierto: se le paga solo a quien marcó entrada en ESTE proceso.
    // El grupo del contenedor acumula a todos los que han trabajado en él
    // (un contenedor puede procesarse varios días), así que no sirve para
    // saber quién vino hoy.
    const esSesionAbierta = sesionActiva?.contenedorId === contenedorId;
    const miembros = esSesionAbierta
      ? Array.from(new Set(eventos.filter(e => e.sesionId === sesionActiva.id && e.tipo === "entrada").map(e => e.empNum)))
      : Array.from(new Set([...(gDia?.miembros || []), ...(gNoche?.miembros || [])]));

    const valorBase = (sesionActiva?.contenedorId === contenedorId) ? sesionActiva.valorBase : 180000;
    const ajustesContenedor = ajustes.filter(a => !a.empNum).reduce((s, a) => s + a.monto, 0);
    const n = miembros.length || 1;
    const ajusteGeneralPorPersona = ajustesContenedor / n;
    const porPersonaBase = valorBase + ajusteGeneralPorPersona;
    const totalBase = valorBase * miembros.length + ajustesContenedor;

    const detalle = miembros.map(num => {
      const propios = ajustes.filter(a => a.empNum === num).reduce((s, a) => s + a.monto, 0);
      return { num, base: porPersonaBase, ajustesPropios: propios, total: porPersonaBase + propios };
    });

    return { contenedor, miembros, valorBase, ajustesContenedor, ajusteGeneralPorPersona, totalBase, porPersonaBase, detalle };
  }, [procesos, grupos, ajustes, sesionActiva, eventos]);

  return {
    sesionActiva, ajustes, eventos, loading,
    abrirSesion, cerrarSesion, registrarEscaneo, registrarTemporal,
    cambiarContenedor, movimientosSinContenedor, asignarSinContenedor,
    asignarPersona, quitarAsignado,
    subirFoto, agregarAjuste, eliminarAjuste, calcularPago,
  };
}
