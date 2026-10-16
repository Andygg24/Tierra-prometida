import { useState, useMemo, useRef } from "react";
import LimonLoader from "./LimonLoader.jsx";
import FirmaPad from "./FirmaPad.jsx";
import { btnSecundario, btnPrimario, btnTablaEditar, btnTablaEliminar } from "./buttonStyles.js";
import { useInspeccionesPreop } from "../hooks/useInspeccionesPreop.js";
import { registrarActividad } from "../hooks/useActividad.js";
import { fechaLocalISO } from "../utils/dates.js";
import {
  FORMATO_PREOP, FIRMAS_FORMATO_PREOP, AREAS_PREOP, DIAS_PREOP, TOTAL_ITEMS_PREOP,
  lunesDe, fechasSemana, textoSemana, resumenPreop, generarInformePreopHtml, nombreArchivoPreop,
} from "../reportes/informeInspeccionPreop.js";

const VERDE = "#00C9A7";
const ROJO  = "#FF6B6B";

const nombreUsuarioSesion = () => {
  try { return JSON.parse(localStorage.getItem("tp_session"))?.nombre || ""; } catch { return ""; }
};

function inspeccionVacia() {
  return {
    semanaInicio: lunesDe(fechaLocalISO()),
    marcas: {}, iniciales: ["", "", "", "", "", "", ""], observaciones: "",
    realizoNombre: nombreUsuarioSesion(), realizoCargo: "", realizoFecha: "",
    inocuidadNombre: FIRMAS_FORMATO_PREOP.inocuidadNombre, inocuidadCargo: FIRMAS_FORMATO_PREOP.inocuidadCargo, inocuidadFecha: "",
    jefeNombre: FIRMAS_FORMATO_PREOP.jefeNombre, jefeCargo: FIRMAS_FORMATO_PREOP.jefeCargo, jefeFecha: "",
    firmaRealizo: "", firmaInocuidad: "", firmaJefe: "",
    registradoPor: "",
  };
}

const estaAprobada = (insp) => !!insp.jefeFecha;
const diaCorto = (iso) => iso ? new Date(iso + "T12:00:00").getDate() : "";

// Ciclo de una casilla en escritorio: vacía → ✓ → ✗ → vacía.
const siguienteMarca = (v) => v === "C" ? "NC" : v === "NC" ? "" : "C";

export default function InspeccionPreopTab({ m, estilos, COLOR, onPreview }) {
  const { inp, area, lbl, cardS, seccion, ayuda } = estilos;
  const { inspecciones, loading, errorCarga, recargar, guardarInspeccion, cargarFirmas, eliminarInspeccion } = useInspeccionesPreop();

  const [sel, setSel]               = useState(null); // null = lista | "new" | id
  const [form, setForm]             = useState(inspeccionVacia);
  const [guardando, setGuardando]   = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState("");
  // Firmas de un registro existente: "cargando" | "ok" | "error". Mientras no
  // estén en "ok" no se deja guardar, para no pisar las firmas con vacío.
  const [firmasEstado, setFirmasEstado] = useState("ok");
  const selRef = useRef(null);
  // Día que se está diligenciando en la vista "Por día" (0 = Lun).
  const [diaMovil, setDiaMovil] = useState(() => (new Date().getDay() + 6) % 7);
  // En escritorio se puede elegir planilla de la semana completa o un día a la
  // vez; en celular siempre es por día.
  const [vista, setVista] = useState(() => { try { return localStorage.getItem("tp_preop_vista") || "semana"; } catch { return "semana"; } });
  const cambiarVista = (v) => { setVista(v); try { localStorage.setItem("tp_preop_vista", v); } catch { /* sin almacenamiento */ } };
  const porDia = m || vista === "dia";
  const [generando, setGenerando] = useState(false);

  const setCampo = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));
  const marca = (id, dia) => form.marcas[id]?.[dia] || "";
  const setMarca = (id, dia, valor) => setForm(f => {
    const fila = [...(f.marcas[id] || ["", "", "", "", "", "", ""])];
    fila[dia] = valor;
    return { ...f, marcas: { ...f.marcas, [id]: fila } };
  });
  // Solo llena las casillas vacías de ese día; no toca las que ya están en ✗.
  const marcarDiaCumple = (dia) => setForm(f => {
    const marcas = { ...f.marcas };
    AREAS_PREOP.forEach(a => a.items.forEach(([id]) => {
      const fila = [...(marcas[id] || ["", "", "", "", "", "", ""])];
      if (!fila[dia]) { fila[dia] = "C"; marcas[id] = fila; }
    }));
    return { ...f, marcas };
  });
  const setInicial = (dia, valor) => setForm(f => {
    const ini = [...(f.iniciales || [])];
    while (ini.length < 7) ini.push("");
    ini[dia] = valor;
    return { ...f, iniciales: ini };
  });

  const fechas = fechasSemana(form.semanaInicio);
  const resumen = resumenPreop(form.marcas);
  const conteoDia = (dia) => AREAS_PREOP.reduce((s, a) => s + a.items.filter(([id]) => marca(id, dia)).length, 0);

  // Otra fila guardada con la misma semana (la tabla no deja guardar dos).
  const semanaRepetida = useMemo(
    () => inspecciones.find(i => i.semanaInicio === form.semanaInicio && i.id !== sel),
    [inspecciones, form.semanaInicio, sel]
  );

  const nuevo = () => { selRef.current = "new"; setForm(inspeccionVacia()); setSel("new"); setFirmasEstado("ok"); setErrorGuardado(""); setGuardadoOk(false); };
  const traerFirmas = async (id) => {
    setFirmasEstado("cargando");
    const r = await cargarFirmas(id);
    if (selRef.current !== id) return; // ya se abrió otro registro
    if (r.ok) { setForm(f => ({ ...f, ...r.firmas })); setFirmasEstado("ok"); }
    else setFirmasEstado("error");
  };
  const abrir = (insp) => {
    selRef.current = insp.id;
    setForm({ ...inspeccionVacia(), ...insp });
    setSel(insp.id); setErrorGuardado(""); setGuardadoOk(false);
    traerFirmas(insp.id);
  };
  const volverLista = () => { selRef.current = null; setSel(null); setErrorGuardado(""); setForm(inspeccionVacia()); };

  const guardar = async () => {
    setErrorGuardado("");
    if (!form.semanaInicio) { setErrorGuardado("Falta la semana de la inspección."); return; }
    if (semanaRepetida) { setErrorGuardado(`Ya existe un registro de la ${textoSemana(form.semanaInicio).toLowerCase()}. Ábrelo desde la lista para seguir llenándolo.`); return; }
    if (firmasEstado !== "ok") { setErrorGuardado("Las firmas de este registro no han terminado de cargar."); return; }
    setGuardando(true);
    const esNuevo = sel === "new";
    const usuario = nombreUsuarioSesion();
    const { ok, id, duplicada } = await guardarInspeccion(
      { ...form, registradoPor: form.registradoPor || usuario },
      esNuevo ? null : sel
    );
    setGuardando(false);
    if (!ok) {
      setErrorGuardado(duplicada
        ? `Ya existe un registro de la ${textoSemana(form.semanaInicio).toLowerCase()}. Ábrelo desde la lista para seguir llenándolo.`
        : "No se pudo guardar la inspección. Revisa tu conexión e intenta de nuevo.");
      return;
    }
    registrarActividad({
      usuario, modulo: "Operaciones",
      accion: esNuevo ? "nueva_inspeccion_preop" : "editar_inspeccion_preop",
      detalle: `${esNuevo ? "Creó" : "Editó"} inspección pre-operacional: ${textoSemana(form.semanaInicio)}`,
      referencia: String(id),
    });
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2000);
    if (esNuevo && id) { selRef.current = id; setSel(id); }
  };

  const eliminar = async (insp) => {
    if (!window.confirm(`¿Eliminar la inspección de la ${textoSemana(insp.semanaInicio).toLowerCase()}? Esta acción no se puede deshacer.`)) return;
    const ok = await eliminarInspeccion(insp.id);
    if (!ok) { window.alert("No se pudo eliminar la inspección. Revisa tu conexión."); return; }
    if (sel === insp.id) volverLista();
  };

  // Se arma con lo que hay en pantalla en ese momento, aunque no se haya guardado.
  const informe = async (modo) => {
    if (firmasEstado !== "ok") { setErrorGuardado("Las firmas de este registro no han terminado de cargar."); return; }
    setGenerando(true);
    try {
      const html = await generarInformePreopHtml(form);
      const r = { url: URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })), filename: nombreArchivoPreop(form) };
      if (modo === "previa") { onPreview(r); return; }
      const a = document.createElement("a");
      a.href = r.url; a.download = r.filename; a.click();
      setTimeout(() => URL.revokeObjectURL(r.url), 4000);
      registrarActividad({
        usuario: nombreUsuarioSesion(), modulo: "Operaciones", accion: "informe_inspeccion_preop",
        detalle: `Generó informe ${FORMATO_PREOP.codigo}: ${textoSemana(form.semanaInicio)}`,
        referencia: String(sel),
      });
    } finally {
      setGenerando(false);
    }
  };

  if (loading) return <LimonLoader texto="Cargando inspecciones" />;

  const chipEstado = (aprobada) => (
    <span style={{
      fontSize: 10, fontWeight: 800, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap",
      background: aprobada ? "rgba(0,201,167,0.12)" : "rgba(255,255,255,0.06)",
      color: aprobada ? VERDE : "rgba(255,255,255,0.6)",
      border: `1px solid ${aprobada ? "rgba(0,201,167,0.35)" : "rgba(255,255,255,0.15)"}`,
    }}>{aprobada ? "Aprobada" : "Pendiente"}</span>
  );

  const errorBanner = errorCarga && (
    <div style={{ fontSize: 12, color: "#ff8a8a", background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span>No se pudieron cargar las inspecciones ({errorCarga}).</span>
      <button onClick={recargar} style={btnSecundario}>↻ Reintentar</button>
    </div>
  );

  /* ── Lista ── */
  if (sel === null) return (
    <div>
      {errorBanner}
      <div style={cardS}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>🧹 Registro de Inspección Pre-Operacional Diario</div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{FORMATO_PREOP.codigo} · Versión {FORMATO_PREOP.version} · Un registro por semana</div>
          </div>
          <button onClick={nuevo} style={btnPrimario(false, false)}>+ Nueva semana</button>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "8px 0 12px" }}>
          {inspecciones.length} semana{inspecciones.length === 1 ? "" : "s"} registrada{inspecciones.length === 1 ? "" : "s"}
        </div>
        {inspecciones.length === 0 ? (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>Sin inspecciones registradas todavía.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
                  <th style={{ padding: "6px" }}>Semana</th>
                  <th style={{ padding: "6px" }}>Días</th>
                  <th style={{ padding: "6px" }}>No cumple</th>
                  {!m && <th style={{ padding: "6px" }}>Realizó</th>}
                  <th style={{ padding: "6px" }}>Estado</th>
                  <th style={{ padding: "6px" }}></th>
                </tr>
              </thead>
              <tbody>
                {inspecciones.map(insp => {
                  const r = resumenPreop(insp.marcas);
                  return (
                    <tr key={insp.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }} onClick={() => abrir(insp)}>
                      <td style={{ padding: "6px", color: "white", fontWeight: 600 }}>{textoSemana(insp.semanaInicio).replace("Semana del ", "")}</td>
                      <td style={{ padding: "6px", whiteSpace: "nowrap" }}>{r.diasInspeccionados}/7</td>
                      <td style={{ padding: "6px", color: r.noCumple ? ROJO : "rgba(255,255,255,0.45)", fontWeight: r.noCumple ? 700 : 400 }}>{r.noCumple}</td>
                      {!m && <td style={{ padding: "6px" }}>{insp.realizoNombre || "—"}</td>}
                      <td style={{ padding: "6px" }}>{chipEstado(estaAprobada(insp))}</td>
                      <td style={{ padding: "6px", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => abrir(insp)} style={btnTablaEditar}>Abrir</button>
                        <button onClick={() => eliminar(insp)} style={btnTablaEliminar}>Eliminar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  /* ── Formulario ── */
  const btnMarca = (on, color) => ({
    flex: 1, minHeight: m ? 40 : 30, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 900, fontSize: 16,
    background: on ? `${color}26` : "rgba(255,255,255,0.04)",
    border: `1px solid ${on ? color : "rgba(255,255,255,0.12)"}`,
    color: on ? color : "rgba(255,255,255,0.35)",
  });
  const celdaMarca = (v) => ({
    width: "100%", height: 28, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 900, fontSize: 14,
    background: v === "C" ? "rgba(0,201,167,0.15)" : v === "NC" ? "rgba(255,107,107,0.18)" : "rgba(255,255,255,0.03)",
    border: `1px solid ${v === "C" ? "rgba(0,201,167,0.45)" : v === "NC" ? "rgba(255,107,107,0.5)" : "rgba(255,255,255,0.1)"}`,
    color: v === "C" ? VERDE : v === "NC" ? ROJO : "transparent",
  });

  return (
    <div>
      {errorBanner}
      <div style={cardS}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>🧹 {sel === "new" ? "Nueva inspección pre-operacional" : textoSemana(form.semanaInicio)}</div>
            {sel !== "new" && chipEstado(estaAprobada(form))}
          </div>
          <button onClick={volverLista} style={btnSecundario}>← Volver a la lista</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "220px 1fr", gap: 10, alignItems: "end" }}>
          <div>
            <div style={lbl}>Semana (elige cualquier día de esa semana) *</div>
            <input type="date" style={inp} value={form.semanaInicio} onChange={e => setCampo("semanaInicio", lunesDe(e.target.value))} />
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", paddingBottom: m ? 0 : 8 }}>
            {textoSemana(form.semanaInicio)}
            {semanaRepetida && <span style={{ color: ROJO, fontWeight: 700 }}> · ya existe un registro de esta semana</span>}
          </div>
        </div>

        <div style={{ ...seccion, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>INSPECCIÓN POR ÁREA</span>
          {!m && (
            <div style={{ display: "flex", gap: 4 }}>
              {[["semana", "📋 Semana completa"], ["dia", "📅 Por día"]].map(([k, t]) => (
                <button key={k} onClick={() => cambiarVista(k)} style={{
                  borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, letterSpacing: 0,
                  background: vista === k ? `${COLOR}26` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${vista === k ? COLOR : "rgba(255,255,255,0.1)"}`,
                  color: vista === k ? "white" : "rgba(255,255,255,0.55)",
                }}>{t}</button>
              ))}
            </div>
          )}
        </div>
        <div style={ayuda}>
          <b style={{ color: VERDE }}>✓</b> Cumple · <b style={{ color: ROJO }}>✗</b> No cumple · casilla vacía = no se inspeccionó ese día.
          {!porDia && " Toca una casilla para cambiarla."}
          {" "}{resumen.noCumple > 0 && <b style={{ color: ROJO }}>{resumen.noCumple} no cumple{resumen.noCumple === 1 ? "" : "n"} — anota en Observaciones la acción tomada.</b>}
        </div>

        {porDia ? (
          <>
            {/* Por día (siempre en celular): se llena un día a la vez */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, margin: "8px 0 10px" }}>
              {DIAS_PREOP.map((d, i) => {
                const on = diaMovil === i;
                const n = conteoDia(i);
                return (
                  <button key={d} onClick={() => setDiaMovil(i)} style={{
                    borderRadius: 8, padding: "6px 0", cursor: "pointer", fontFamily: "inherit",
                    background: on ? `${COLOR}26` : "rgba(255,255,255,0.04)",
                    border: `1px solid ${on ? COLOR : "rgba(255,255,255,0.1)"}`,
                    color: on ? "white" : "rgba(255,255,255,0.55)", lineHeight: 1.25,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 800 }}>{d}</div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{diaCorto(fechas[i])}</div>
                    <div style={{ fontSize: 9, color: n === TOTAL_ITEMS_PREOP ? VERDE : "rgba(255,255,255,0.4)" }}>{n}/{TOTAL_ITEMS_PREOP}</div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => marcarDiaCumple(diaMovil)} style={{ ...btnSecundario, width: m ? "100%" : "auto", marginBottom: 10 }}>✓ Marcar los pendientes del {DIAS_PREOP[diaMovil]} como Cumple</button>
            {AREAS_PREOP.map(a => (
              <div key={a.area} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: COLOR, margin: "6px 0" }}>{a.area}</div>
                {a.items.map(([id, texto]) => {
                  const v = marca(id, diaMovil);
                  return (
                    <div key={id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: m ? "8px 0" : "5px 0", ...(m ? {} : { display: "flex", alignItems: "center", gap: 12 }) }}>
                      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", marginBottom: m ? 6 : 0, lineHeight: 1.35, flex: 1 }}>{texto}</div>
                      <div style={{ display: "flex", gap: 8, ...(m ? {} : { width: 150, flexShrink: 0 }) }}>
                        <button onClick={() => setMarca(id, diaMovil, v === "C" ? "" : "C")} style={btnMarca(v === "C", VERDE)}>✓</button>
                        <button onClick={() => setMarca(id, diaMovil, v === "NC" ? "" : "NC")} style={btnMarca(v === "NC", ROJO)}>✗</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div style={lbl}>Iniciales del encargado — {DIAS_PREOP[diaMovil]} {diaCorto(fechas[diaMovil])}</div>
            <input style={{ ...inp, ...(m ? {} : { maxWidth: 220 }) }} maxLength={8} value={form.iniciales?.[diaMovil] || ""} onChange={e => setInicial(diaMovil, e.target.value.toUpperCase())} />
          </>
        ) : (
          /* Escritorio: la planilla completa como en el formato */
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "rgba(255,255,255,0.55)" }}>
                  <th style={{ padding: "6px", textAlign: "left" }}>Área / ítem</th>
                  {DIAS_PREOP.map((d, i) => (
                    <th key={d} style={{ padding: "4px 3px", width: 58, textAlign: "center" }}>
                      <div style={{ fontWeight: 800 }}>{d} {diaCorto(fechas[i])}</div>
                      <button onClick={() => marcarDiaCumple(i)} title={`Marcar como Cumple las casillas vacías del ${d}`} style={{ marginTop: 3, fontSize: 9.5, padding: "2px 5px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit", background: "rgba(0,201,167,0.08)", border: "1px solid rgba(0,201,167,0.3)", color: VERDE }}>✓ día</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {AREAS_PREOP.map(a => [
                  <tr key={a.area}><td colSpan={8} style={{ padding: "10px 6px 4px", fontSize: 11, fontWeight: 800, color: COLOR, letterSpacing: 0.3 }}>{a.area}</td></tr>,
                  ...a.items.map(([id, texto]) => (
                    <tr key={id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "4px 6px", color: "rgba(255,255,255,0.8)", lineHeight: 1.3 }}>{texto}</td>
                      {DIAS_PREOP.map((d, i) => {
                        const v = marca(id, i);
                        return (
                          <td key={d} style={{ padding: "2px 3px" }}>
                            <button onClick={() => setMarca(id, i, siguienteMarca(v))} style={celdaMarca(v)}>{v === "C" ? "✓" : v === "NC" ? "✗" : "·"}</button>
                          </td>
                        );
                      })}
                    </tr>
                  )),
                ])}
                <tr style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                  <td style={{ padding: "8px 6px", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.75)" }}>INICIALES DEL ENCARGADO</td>
                  {DIAS_PREOP.map((d, i) => (
                    <td key={d} style={{ padding: "4px 3px" }}>
                      <input maxLength={8} value={form.iniciales?.[i] || ""} onChange={e => setInicial(i, e.target.value.toUpperCase())} style={{ ...inp, padding: "5px 4px", textAlign: "center", minHeight: 28 }} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div style={seccion}>OBSERVACIONES</div>
        <textarea style={area} value={form.observaciones} onChange={e => setCampo("observaciones", e.target.value)} placeholder="Hallazgos, acciones tomadas en los ítems que no cumplen..." />

        <div style={seccion}>FIRMAS</div>
        <div style={ayuda}>Cada persona firma en su casilla (queda guardada al darle Guardar). Al poner la fecha de aprobación del Jefe de Planta la semana queda <b style={{ color: VERDE }}>Aprobada</b>.</div>
        {firmasEstado === "cargando" && <div style={{ ...ayuda, color: "#a5b4fc" }}>Cargando firmas…</div>}
        {firmasEstado === "error" && (
          <div style={{ fontSize: 12, color: "#ff8a8a", background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>No se pudieron cargar las firmas de este registro.</span>
            <button onClick={() => traerFirmas(sel)} style={btnSecundario}>↻ Reintentar</button>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "repeat(3,1fr)", gap: 10, opacity: firmasEstado === "ok" ? 1 : 0.5, pointerEvents: firmasEstado === "ok" ? "auto" : "none" }}>
          {[
            { titulo: "Realizó la actividad (Operario / Inspector)", firma: "firmaRealizo", k: "rea", campos: [
              { label: "Nombre", campo: "realizoNombre" }, { label: "Cargo", campo: "realizoCargo" }, { label: "Fecha", campo: "realizoFecha", type: "date" },
            ] },
            { titulo: "Visto bueno de Inocuidad y Calidad", firma: "firmaInocuidad", k: "ino", campos: [
              { label: "Nombre", campo: "inocuidadNombre" }, { label: "Cargo", campo: "inocuidadCargo" }, { label: "Fecha", campo: "inocuidadFecha", type: "date" },
            ] },
            { titulo: "Aprobación Jefe de Planta / Operaciones", firma: "firmaJefe", k: "jef", campos: [
              { label: "Nombre", campo: "jefeNombre" }, { label: "Cargo", campo: "jefeCargo" }, { label: "Fecha de aprobación", campo: "jefeFecha", type: "date" },
            ] },
          ].map(caja => (
            <div key={caja.k} style={{ ...cardS, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.75)", minHeight: m ? 0 : 30, lineHeight: 1.35 }}>{caja.titulo}</div>
              {caja.campos.map(c => (
                <div key={c.label}>
                  <div style={lbl}>{c.label}</div>
                  <input type={c.type || "text"} style={inp} value={form[c.campo]} onChange={e => setCampo(c.campo, e.target.value)} />
                </div>
              ))}
              <div style={{ marginTop: "auto", paddingTop: 2 }}>
                <div style={lbl}>Firma</div>
                <FirmaPad key={`${sel}-${caja.k}-${firmasEstado}`} m={m} value={form[caja.firma]} onChange={v => setCampo(caja.firma, v)} />
              </div>
            </div>
          ))}
        </div>

        {form.registradoPor && sel !== "new" && (
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", marginTop: 12 }}>Registrado en el sistema por {form.registradoPor}</div>
        )}

        {errorGuardado && (
          <div style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 8, padding: "10px 12px", marginTop: 14, fontSize: 12, color: ROJO }}>
            ⚠️ {errorGuardado}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, paddingTop: 12, marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          {sel !== "new" ? (
            <button onClick={() => eliminar({ ...form, id: sel })} style={btnTablaEliminar}>Eliminar semana</button>
          ) : <span />}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => informe("previa")} disabled={generando} style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 8, color: "#a5b4fc", padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: generando ? "wait" : "pointer" }}>👁 Vista previa</button>
            <button onClick={() => informe("descargar")} disabled={generando} style={btnSecundario}>📄 Generar informe</button>
            <button onClick={guardar} disabled={guardando} style={btnPrimario(guardadoOk, guardando)}>
              {guardadoOk ? "✓ Guardado" : guardando ? "Guardando..." : "Guardar inspección"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
