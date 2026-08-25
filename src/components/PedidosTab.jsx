import { useState } from "react";
import LimonLoader from "./LimonLoader.jsx";
import CustomSelect from "./CustomSelect.jsx";
import { btnSecundario, btnPrimario, btnTablaEliminar } from "./buttonStyles.js";
import { useSolicitudesPlanta } from "../hooks/useSolicitudesPlanta.js";
import { registrarActividad } from "../hooks/useActividad.js";

// Mismos roles que ya tratan como "nivel administrador" en el resto de la
// app (ROL_COLORS en App.jsx trata "Administración" como alias viejo de
// "Administrador").
const PUEDE_APROBAR = ["Owner", "Administrador", "Administración"];

const ESTADO_COLOR = {
  Pendiente:  "#F9A826",
  Aprobado:   "#0EA5E9",
  Rechazado:  "#FF6B6B",
  Comprado:   "#845EF7",
  Entregado:  "#00C9A7",
};
const PRIORIDAD_COLOR = { Baja: "#64748B", Media: "#F9A826", Alta: "#FF6B6B" };

const FILA_VACIA = () => ({ item: "", cantidad: "", unidad: "" });

const nombreUsuarioSesion = () => {
  try { return JSON.parse(localStorage.getItem("tp_session"))?.nombre || ""; } catch { return ""; }
};

const inp = { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.13)", borderRadius: 8, padding: "9px 12px", color: "white", fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5, display: "block" };

function fmtFecha(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }); } catch { return iso; }
}

const nombresItems = (s) => s.items.map(it => it.item).join(", ");

export default function PedidosTab({ mob, usuario }) {
  const { solicitudes, loading, crear, cambiarEstado, eliminar } = useSolicitudesPlanta();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ items: [FILA_VACIA()], area: "", prioridad: "Media", obs: "" });
  const [filtro, setFiltro] = useState("Todas");
  const [expandidoId, setExpandidoId] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const rol = usuario?.rol || "";
  const puedeAprobar = PUEDE_APROBAR.includes(rol);

  if (loading) return <LimonLoader texto="Cargando pedidos" />;

  const FILTROS = ["Todas", "Pendiente", "Aprobado", "Rechazado", "Comprado", "Entregado"];
  const visibles = filtro === "Todas" ? solicitudes : solicitudes.filter(s => s.estado === filtro);
  const hayItemValido = form.items.some(it => it.item.trim());

  const actualizarFila = (idx, campo, valor) => {
    setForm(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, [campo]: valor } : it) }));
  };
  const agregarFila = () => setForm(p => ({ ...p, items: [...p.items, FILA_VACIA()] }));
  const quitarFila = (idx) => setForm(p => ({ ...p, items: p.items.length === 1 ? [FILA_VACIA()] : p.items.filter((_, i) => i !== idx) }));

  const crearSolicitud = async () => {
    const itemsValidos = form.items.filter(it => it.item.trim());
    if (!itemsValidos.length) return;
    setGuardando(true);
    const solicitadoPor = nombreUsuarioSesion();
    const ok = await crear({ items: itemsValidos, area: form.area, prioridad: form.prioridad, obs: form.obs, solicitadoPor });
    if (ok) {
      registrarActividad({
        usuario: solicitadoPor, modulo: "Inventario", accion: "pedido_creado",
        detalle: `${solicitadoPor || "Alguien"} solicitó ${itemsValidos.length} ítem${itemsValidos.length !== 1 ? "s" : ""}: ${itemsValidos.map(it => it.item).join(", ")}`,
        referencia: itemsValidos.map(it => it.item).join(", "),
      });
      setForm({ items: [FILA_VACIA()], area: "", prioridad: "Media", obs: "" });
      setShowForm(false);
    }
    setGuardando(false);
  };

  const avanzar = async (s, nuevoEstado, notaOpcional) => {
    const responsable = nombreUsuarioSesion();
    const ok = await cambiarEstado(s.id, nuevoEstado, { responsable, nota: notaOpcional });
    if (ok) {
      registrarActividad({
        usuario: responsable, modulo: "Inventario", accion: "pedido_" + nuevoEstado.toLowerCase(),
        detalle: `${responsable || "Alguien"} marcó "${nombresItems(s)}" como ${nuevoEstado}`,
        referencia: nombresItems(s),
      });
    }
  };

  const rechazar = (s) => {
    const motivo = window.prompt(`¿Por qué se rechaza "${nombresItems(s)}"? (opcional)`, "");
    if (motivo === null) return; // canceló el prompt
    avanzar(s, "Rechazado", motivo);
  };

  const confirmarEliminar = (s) => {
    if (window.confirm(`¿Eliminar la solicitud "${nombresItems(s)}"? Esta acción no se puede deshacer.`)) eliminar(s.id);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "white" }}>📝 Pedidos a Planta</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", marginTop: 2 }}>Solicitudes de insumos: Pendiente → Aprobado/Rechazado → Comprado → Entregado</div>
        </div>
        <button onClick={() => setShowForm(v => !v)} style={btnPrimario(false, false)}>
          {showForm ? "✕ Cancelar" : "➕ Nueva solicitud"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            {form.items.map((it, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr auto" : "2fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                <div style={{ gridColumn: mob ? "1 / -1" : "auto" }}>
                  {idx === 0 && <label style={lbl}>¿Qué se necesita?</label>}
                  <input style={inp} value={it.item} onChange={e => actualizarFila(idx, "item", e.target.value)} placeholder="Ej. Guantes de nitrilo talla M" />
                </div>
                <div>
                  {idx === 0 && <label style={lbl}>Cantidad</label>}
                  <input style={inp} type="number" value={it.cantidad} onChange={e => actualizarFila(idx, "cantidad", e.target.value)} placeholder="0" />
                </div>
                <div>
                  {idx === 0 && <label style={lbl}>Unidad</label>}
                  <input style={inp} value={it.unidad} onChange={e => actualizarFila(idx, "unidad", e.target.value)} placeholder="cajas, kg..." />
                </div>
                <button onClick={() => quitarFila(idx)} title="Quitar ítem" style={{ ...btnTablaEliminar, opacity: (form.items.length === 1 && !it.item && !it.cantidad && !it.unidad) ? 0.35 : 1 }}>✕</button>
              </div>
            ))}
          </div>
          <button onClick={agregarFila} style={{ ...btnSecundario, marginBottom: 14 }}>➕ Agregar otro ítem</button>

          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Área que lo solicita</label>
              <input style={inp} value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))} placeholder="Ej. Empaque" />
            </div>
            <div>
              <label style={lbl}>Prioridad</label>
              <CustomSelect style={inp} value={form.prioridad} onChange={e => setForm(p => ({ ...p, prioridad: e.target.value }))}>
                {["Baja", "Media", "Alta"].map(p => <option key={p} value={p} style={{ background: "#1a1c26" }}>{p}</option>)}
              </CustomSelect>
            </div>
            <div style={{ gridColumn: mob ? "1" : "1 / -1" }}>
              <label style={lbl}>Observaciones</label>
              <input style={inp} value={form.obs} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} placeholder="Detalles adicionales (opcional)" />
            </div>
          </div>
          <button onClick={crearSolicitud} disabled={guardando || !hayItemValido} style={{ ...btnPrimario(false, guardando), marginTop: 14 }}>
            {guardando ? "Guardando..." : "✅ Enviar solicitud"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {FILTROS.map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            background: filtro === f ? `${ESTADO_COLOR[f] || "#845EF7"}22` : "rgba(255,255,255,0.04)",
            border: `1px solid ${filtro === f ? (ESTADO_COLOR[f] || "#845EF7") + "60" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700,
            color: filtro === f ? (ESTADO_COLOR[f] || "#a78bfa") : "rgba(255,255,255,0.4)",
          }}>
            {f} {f !== "Todas" ? `(${solicitudes.filter(s => s.estado === f).length})` : `(${solicitudes.length})`}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.33)", fontSize: 13 }}>
          {filtro === "Todas" ? "Todavía no hay pedidos registrados." : `No hay pedidos en estado "${filtro}".`}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibles.map(s => (
            <div key={s.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderLeft: `3px solid ${ESTADO_COLOR[s.estado] || "#64748B"}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "white", display: "flex", flexDirection: "column", gap: 2 }}>
                    {s.items.map((it, i) => (
                      <div key={i}>
                        {it.item}{it.cantidad != null ? <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500 }}> — {it.cantidad.toLocaleString("es-CO")} {it.unidad}</span> : null}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.42)", marginTop: 5, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {s.solicitadoPor && <span>👤 {s.solicitadoPor}</span>}
                    {s.area && <span>🏭 {s.area}</span>}
                    <span>🕐 {fmtFecha(s.createdAt)}</span>
                  </div>
                  {s.obs && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 5, fontStyle: "italic" }}>{s.obs}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: PRIORIDAD_COLOR[s.prioridad] || "#94a3b8", background: `${PRIORIDAD_COLOR[s.prioridad] || "#64748B"}20`, padding: "2px 8px", borderRadius: 5 }}>{s.prioridad}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: ESTADO_COLOR[s.estado] || "#94a3b8", background: `${ESTADO_COLOR[s.estado] || "#64748B"}20`, padding: "2px 8px", borderRadius: 5 }}>{s.estado}</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
                {s.estado === "Pendiente" && puedeAprobar && (
                  <>
                    <button onClick={() => avanzar(s, "Aprobado")} style={{ ...btnSecundario, color: "#0EA5E9", borderColor: "#0EA5E960" }}>✅ Aprobar</button>
                    <button onClick={() => rechazar(s)} style={{ ...btnSecundario, color: "#FF6B6B", borderColor: "#FF6B6B60" }}>❌ Rechazar</button>
                  </>
                )}
                {s.estado === "Pendiente" && !puedeAprobar && (
                  <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)" }}>Esperando aprobación de un administrador</span>
                )}
                {s.estado === "Aprobado" && (
                  <button onClick={() => avanzar(s, "Comprado")} style={{ ...btnSecundario, color: "#845EF7", borderColor: "#845EF760" }}>🛒 Marcar comprado</button>
                )}
                {s.estado === "Comprado" && (
                  <button onClick={() => avanzar(s, "Entregado")} style={{ ...btnSecundario, color: "#00C9A7", borderColor: "#00C9A760" }}>📦 Marcar entregado</button>
                )}
                <button onClick={() => setExpandidoId(v => v === s.id ? null : s.id)} style={{ ...btnSecundario, marginLeft: "auto" }}>
                  {expandidoId === s.id ? "▲ Ocultar historial" : `▼ Historial (${s.trazabilidad.length})`}
                </button>
                {puedeAprobar && <button onClick={() => confirmarEliminar(s)} style={btnTablaEliminar}>🗑</button>}
              </div>

              {expandidoId === s.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 6 }}>
                  {s.trazabilidad.map((ev, i) => (
                    <div key={i} style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)" }}>
                      <span style={{ color: "rgba(255,255,255,0.32)" }}>{fmtFecha(ev.fecha)}</span> — {ev.evento}{ev.responsable ? ` · ${ev.responsable}` : ""}{ev.detalle ? ` · "${ev.detalle}"` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
