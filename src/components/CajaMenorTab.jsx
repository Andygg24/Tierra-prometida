import { useState, useEffect, useRef, useMemo } from "react";
import QRCode from "qrcode";
import LimonLoader from "./LimonLoader.jsx";
import CustomSelect from "./CustomSelect.jsx";
import { btnSecundario, btnPrimario, btnTablaEditar, btnTablaEliminar } from "./buttonStyles.js";
import { useCajaMenor } from "../hooks/useCajaMenor.js";
import { fechaLocalISO } from "../utils/dates.js";

// Prefijo propio (distinto al "TPQR" de las tirillas de pallet) para que el
// escáner sepa a qué módulo pertenece el código leído.
export const QR_FACTURA_PREFIX = "TPCM";
function textoQrFactura(id) { return `${QR_FACTURA_PREFIX}|${id}`; }

const TIPOS_DOCUMENTO = ["Factura", "Cuenta de cobro", "N/A"];

function facturaVacia() {
  return {
    fecha: fechaLocalISO(), nit: "", nombre: "", tipoDocumento: "Factura", numeroDocumento: "",
    concepto: "", monto: "", foto: "", obs: "", registradoPor: "",
  };
}

function abonoVacio() {
  return { fecha: fechaLocalISO(), monto: "", concepto: "", obs: "", registradoPor: "" };
}

function fmtCOP(v) { return `$${Math.round(Number(v) || 0).toLocaleString("es-CO")}`; }
function fmtFechaCorta(f) {
  return f ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

function mensajeErrorCamara(err) {
  if (!window.isSecureContext) {
    return "El navegador solo permite usar la cámara en sitios seguros (https://). Esta página se está abriendo sin HTTPS.";
  }
  const nombre = err?.name || "";
  if (nombre === "NotAllowedError" || nombre === "PermissionDeniedError") {
    return "El navegador bloqueó el permiso de cámara. Revisa los permisos del sitio (ícono de candado o ajustes del navegador) y vuelve a intentar.";
  }
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
    return "No se encontró una cámara trasera en este dispositivo.";
  }
  if (nombre === "NotReadableError" || nombre === "TrackStartError") {
    return "La cámara está siendo usada por otra app o pestaña. Ciérrala e intenta de nuevo.";
  }
  return "No se pudo acceder a la cámara.";
}

function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close();
  } catch { /* beep opcional — si el navegador bloquea audio, seguimos sin sonido */ }
}

const nombreUsuarioSesion = () => {
  try { return JSON.parse(localStorage.getItem("tp_session"))?.nombre || ""; } catch { return ""; }
};

// Redimensiona/comprime la foto antes de guardarla como base64 — una foto de
// cámara sin comprimir puede pesar varios MB, esto la deja liviana (~200KB).
function comprimirImagen(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1280;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function CajaMenorTab({ mob }) {
  const [isMobLocal, setIsMobLocal] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 680
  );
  useEffect(() => {
    const h = () => setIsMobLocal(window.innerWidth < 680);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  const m = mob || isMobLocal;

  const { facturas, abonos, loading, guardarFactura, eliminarFactura, guardarAbono, eliminarAbono } = useCajaMenor();

  const [tabCM, setTabCM] = useState(0);
  const TAB_CM = ["📋 Facturas", "💵 Abonos", "📷 Escanear QR"];
  const TAB_ESCANEAR_IDX = 2;

  const inp = {
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8, padding: m ? "10px 11px" : "7px 10px", color: "white",
    fontSize: m ? 16 : 12, fontFamily: "inherit", width: "100%", minWidth: 0,
    boxSizing: "border-box", minHeight: m ? 44 : 32,
  };
  const lbl = { fontSize: m ? 11 : 9, color: "rgba(255,255,255,0.45)", marginBottom: 4, fontWeight: 600, letterSpacing: 0.3 };
  const cardS = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: m ? 14 : 16 };
  const campoBox = { minWidth: 0 };
  const camposCols = m ? "1fr 1fr" : "repeat(4,1fr)";

  // Ver foto en grande (lightbox) — desde la lista, el formulario o un escaneo.
  const [imagenAmpliada, setImagenAmpliada] = useState(null);
  const verImagen = (url) => { if (url) setImagenAmpliada(url); };

  // ══════════════ FACTURAS: lista / detalle ══════════════
  const [facturaSel, setFacturaSel] = useState(null); // null = lista | "new" | id
  const [form, setForm]             = useState(facturaVacia);
  const [guardando, setGuardando]   = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState("");
  const [busqueda, setBusqueda]     = useState("");
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [qrDataUrl, setQrDataUrl]   = useState("");

  const setCampo = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const generarQr = async (id) => {
    try {
      const url = await QRCode.toDataURL(textoQrFactura(id), { errorCorrectionLevel: "M", margin: 1, width: 220 });
      setQrDataUrl(url);
    } catch { setQrDataUrl(""); }
  };

  const nuevaFactura = () => {
    setForm(facturaVacia());
    setFacturaSel("new");
    setQrDataUrl("");
    setErrorGuardado("");
  };
  const abrirFactura = (f) => {
    setForm({ ...facturaVacia(), ...f });
    setFacturaSel(f.id);
    setErrorGuardado("");
    generarQr(f.id);
  };
  const volverLista = () => {
    setFacturaSel(null);
    setForm(facturaVacia());
    setQrDataUrl("");
  };

  const guardar = async () => {
    setErrorGuardado("");
    if (!form.concepto.trim()) { setErrorGuardado("Falta el concepto de la factura."); return; }
    if (!form.monto) { setErrorGuardado("Falta el monto de la factura."); return; }
    setGuardando(true);
    const esNueva = facturaSel === "new";
    const { ok, id } = await guardarFactura(
      { ...form, registradoPor: form.registradoPor || nombreUsuarioSesion() },
      esNueva ? null : facturaSel
    );
    setGuardando(false);
    if (ok) {
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2000);
      if (esNueva && id) { setFacturaSel(id); generarQr(id); }
    } else {
      setErrorGuardado("No se pudo guardar la factura. Revisa tu conexión e intenta de nuevo.");
    }
  };

  const eliminar = (f) => {
    if (window.confirm(`¿Eliminar la factura "${f.concepto || f.id}"? Esta acción no se puede deshacer.`)) {
      eliminarFactura(f.id);
      if (facturaSel === f.id) volverLista();
    }
  };

  const onFotoSeleccionada = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendoFoto(true);
    try {
      const dataUrl = await comprimirImagen(file);
      setCampo("foto", dataUrl);
    } catch {
      setErrorGuardado("No se pudo procesar la foto — intenta con otra imagen.");
    }
    setSubiendoFoto(false);
  };

  const facturasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return facturas.filter(f => {
      if (!q) return true;
      return [f.concepto, f.nombre, f.nit, f.numeroDocumento].some(v => (v || "").toLowerCase().includes(q));
    });
  }, [facturas, busqueda]);

  const totalFacturasFiltradas = useMemo(
    () => facturasFiltradas.reduce((a, f) => a + (Number(f.monto) || 0), 0),
    [facturasFiltradas]
  );

  // ── Saldo de Caja (siempre sobre el total, no sobre lo filtrado por búsqueda) ──
  const saldoCaja = useMemo(() => {
    const totalAbonos   = abonos.reduce((a, x) => a + (Number(x.monto) || 0), 0);
    const totalFacturas = facturas.reduce((a, x) => a + (Number(x.monto) || 0), 0);
    return { totalAbonos, totalFacturas, saldo: totalAbonos - totalFacturas };
  }, [abonos, facturas]);

  // ══════════════ ABONOS: lista / detalle ══════════════
  const [abonoSel, setAbonoSel]         = useState(null); // null = lista | "new" | id
  const [abonoForm, setAbonoForm]       = useState(abonoVacio);
  const [guardandoAbono, setGuardandoAbono] = useState(false);
  const [guardadoOkAbono, setGuardadoOkAbono] = useState(false);
  const [errorAbono, setErrorAbono]     = useState("");
  const [busquedaAbono, setBusquedaAbono] = useState("");

  const setCampoAbono = (campo, valor) => setAbonoForm(f => ({ ...f, [campo]: valor }));

  const nuevoAbono = () => {
    setAbonoForm(abonoVacio());
    setAbonoSel("new");
    setErrorAbono("");
  };
  const abrirAbono = (a) => {
    setAbonoForm({ ...abonoVacio(), ...a });
    setAbonoSel(a.id);
    setErrorAbono("");
  };
  const volverListaAbonos = () => {
    setAbonoSel(null);
    setAbonoForm(abonoVacio());
  };

  const guardarAbonoForm = async () => {
    setErrorAbono("");
    if (!abonoForm.concepto.trim()) { setErrorAbono("Falta el motivo del abono."); return; }
    if (!abonoForm.monto) { setErrorAbono("Falta el monto del abono."); return; }
    setGuardandoAbono(true);
    const esNuevo = abonoSel === "new";
    const ok = await guardarAbono(
      { ...abonoForm, registradoPor: abonoForm.registradoPor || nombreUsuarioSesion() },
      esNuevo ? null : abonoSel
    );
    setGuardandoAbono(false);
    if (ok) {
      setGuardadoOkAbono(true);
      setTimeout(() => setGuardadoOkAbono(false), 2000);
      if (esNuevo) volverListaAbonos();
    } else {
      setErrorAbono("No se pudo guardar el abono. Revisa tu conexión e intenta de nuevo.");
    }
  };

  const eliminarAbonoForm = (a) => {
    if (window.confirm(`¿Eliminar el abono "${a.concepto || a.id}"? Esta acción no se puede deshacer.`)) {
      eliminarAbono(a.id);
      if (abonoSel === a.id) volverListaAbonos();
    }
  };

  const abonosFiltrados = useMemo(() => {
    const q = busquedaAbono.trim().toLowerCase();
    return abonos.filter(a => !q || (a.concepto || "").toLowerCase().includes(q));
  }, [abonos, busquedaAbono]);

  // ══════════════ ESCANEAR QR ══════════════
  const [camActiva, setCamActiva] = useState(false);
  const [camError, setCamError]   = useState("");
  const [resultadoScan, setResultadoScan] = useState(null); // null | {estado:"no-encontrado"|"ok", factura}
  const html5QrRef    = useRef(null);
  const procesandoRef = useRef(false);
  const ignoradoRef   = useRef(null);
  const READER_ID = "qr-reader-caja-menor";

  const detenerCamara = async () => {
    try { await html5QrRef.current?.stop(); html5QrRef.current?.clear(); } catch { /* ya se había detenido */ }
    html5QrRef.current = null;
    setCamActiva(false);
  };
  useEffect(() => () => { html5QrRef.current?.stop().then(() => html5QrRef.current?.clear()).catch(() => { /* ya se había detenido */ }); }, []);

  const onScan = async (decodedText) => {
    if (procesandoRef.current) return;
    const primeraLinea = (decodedText || "").split("\n")[0].trim();
    const partes = primeraLinea.split("|");
    if (partes[0] !== QR_FACTURA_PREFIX || partes.length < 2) {
      ignoradoRef.current = primeraLinea;
      return;
    }
    ignoradoRef.current = null;
    procesandoRef.current = true;
    playBeep();
    await detenerCamara();
    const factura = facturas.find(f => f.id === Number(partes[1]));
    setResultadoScan(factura ? { estado: "ok", factura } : { estado: "no-encontrado" });
    procesandoRef.current = false;
  };

  const iniciarCamara = async () => {
    setCamError("");
    setResultadoScan(null);
    ignoradoRef.current = null;
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const inst = new Html5Qrcode(READER_ID);
      html5QrRef.current = inst;
      await inst.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (decoded) => onScan(decoded),
        () => {}
      );
      setCamActiva(true);
    } catch (err) {
      setCamError(mensajeErrorCamara(err));
    }
  };
  const escanearOtra = () => { setResultadoScan(null); iniciarCamara(); };

  if (loading) return <LimonLoader texto="Cargando Caja Menor" />;

  return (
    <div>
      {/* ── Saldo de Caja ── */}
      <div style={{ display: "grid", gridTemplateColumns: m ? "1fr 1fr" : "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        <div style={{ ...cardS, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#00C9A7" }}>{fmtCOP(saldoCaja.totalAbonos)}</div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>↓ Total Abonos</div>
        </div>
        <div style={{ ...cardS, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#F9A826" }}>{fmtCOP(saldoCaja.totalFacturas)}</div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>↑ Total Gastado</div>
        </div>
        <div style={{ ...cardS, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: saldoCaja.saldo >= 0 ? "#00C9A7" : "#FF6B6B" }}>{fmtCOP(saldoCaja.saldo)}</div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>💰 Saldo de Caja</div>
        </div>
      </div>

      {/* ── Tab strip ── */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 16, paddingBottom: 2 }}>
        {TAB_CM.map((t, i) => (
          <button key={i} onClick={() => { setTabCM(i); if (i !== TAB_ESCANEAR_IDX) detenerCamara(); }} style={{
            background: tabCM === i ? "rgba(249,168,38,0.15)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${tabCM === i ? "#F9A82690" : "rgba(255,255,255,0.07)"}`,
            borderTop: `2px solid ${tabCM === i ? "#F9A826" : "transparent"}`,
            borderRadius: 8, padding: "8px 13px", cursor: "pointer",
            color: tabCM === i ? "#F9A826" : "rgba(255,255,255,0.42)",
            fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", flexShrink: 0,
            fontFamily: "inherit",
          }}>{t}</button>
        ))}
      </div>

      {/* ═══ TAB 0 — FACTURAS ═══ */}
      {tabCM === 0 && (
        facturaSel === null ? (
          /* ── Lista maestra ── */
          <div style={cardS}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>🧾 Facturas de Caja Menor</div>
              <button onClick={nuevaFactura} style={btnPrimario(false, false)}>+ Nueva Factura</button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="🔍 Buscar por concepto, nombre, NIT o N° de documento..." style={{ ...inp, flex: 1, minWidth: 160 }} />
            </div>
            {facturasFiltradas.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>Sin facturas registradas todavía.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
                      <th style={{ padding: "6px" }}>Fecha</th><th style={{ padding: "6px" }}>Concepto</th>
                      <th style={{ padding: "6px" }}>Nombre</th>
                      <th style={{ padding: "6px" }}>Foto</th>
                      <th style={{ padding: "6px" }}>Valor</th><th style={{ padding: "6px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturasFiltradas.map(f => (
                      <tr key={f.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }} onClick={() => abrirFactura(f)}>
                        <td style={{ padding: "6px", whiteSpace: "nowrap" }}>{fmtFechaCorta(f.fecha)}</td>
                        <td style={{ padding: "6px", color: "white", fontWeight: 600 }}>{f.concepto || "—"}</td>
                        <td style={{ padding: "6px" }}>{f.nombre || "—"}</td>
                        <td style={{ padding: "6px", textAlign: "center" }}>{f.foto ? "📷" : "—"}</td>
                        <td style={{ padding: "6px", fontWeight: 700, color: "#F9A826" }}>{fmtCOP(f.monto)}</td>
                        <td style={{ padding: "6px", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => abrirFactura(f)} style={btnTablaEditar}>Ver</button>
                          {f.foto && <button onClick={() => verImagen(f.foto)} style={btnTablaEditar}>👁 Imagen</button>}
                          <button onClick={() => eliminar(f)} style={btnTablaEliminar}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid rgba(255,255,255,0.12)" }}>
                      <td colSpan={4} style={{ padding: "8px 6px", fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>Total gastado ({facturasFiltradas.length})</td>
                      <td style={{ padding: "8px 6px", fontWeight: 800, color: "#F9A826" }}>{fmtCOP(totalFacturasFiltradas)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* ── Detalle / formulario ── */
          <div style={cardS}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>
                🧾 {facturaSel === "new" ? "Nueva factura" : `Factura #${facturaSel}`}
              </div>
              <button onClick={volverLista} style={btnSecundario}>← Volver a la lista</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 14 }}>
              <div style={campoBox}><div style={lbl}>Fecha</div><input type="date" style={inp} value={form.fecha} onChange={e => setCampo("fecha", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>Tipo de documento</div>
                <CustomSelect value={form.tipoDocumento} onChange={e => setCampo("tipoDocumento", e.target.value)} style={inp}>
                  {TIPOS_DOCUMENTO.map(t => <option key={t} value={t}>{t}</option>)}
                </CustomSelect>
              </div>
              <div style={campoBox}><div style={lbl}>N° de documento</div><input style={inp} value={form.numeroDocumento} onChange={e => setCampo("numeroDocumento", e.target.value)} placeholder="Ej: 4521" /></div>
              <div style={campoBox}><div style={lbl}>NIT o Cédula</div><input style={inp} value={form.nit} onChange={e => setCampo("nit", e.target.value)} placeholder="Ej: 900123456-1" /></div>
              <div style={campoBox}><div style={lbl}>Nombre</div><input style={inp} value={form.nombre} onChange={e => setCampo("nombre", e.target.value)} placeholder="Nombre o razón social" /></div>
              <div style={campoBox}><div style={lbl}>Concepto</div><input style={inp} value={form.concepto} onChange={e => setCampo("concepto", e.target.value)} placeholder="Ej: Almuerzo, repuestos..." /></div>
              <div style={campoBox}><div style={lbl}>Valor total (COP)</div><input type="number" style={inp} value={form.monto} onChange={e => setCampo("monto", e.target.value)} placeholder="0" /></div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={lbl}>Observaciones</div>
              <textarea style={{ ...inp, minHeight: m ? 70 : 56, resize: "vertical", fontFamily: "inherit" }} value={form.obs} onChange={e => setCampo("obs", e.target.value)} placeholder="Notas sobre esta factura..." />
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Foto de la factura</div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap" }}>
              {form.foto && (
                <img src={form.foto} alt="Factura" onClick={() => verImagen(form.foto)} style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer" }} />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ ...btnSecundario, display: "inline-block", cursor: subiendoFoto ? "wait" : "pointer", opacity: subiendoFoto ? 0.6 : 1 }}>
                  {subiendoFoto ? "Procesando..." : form.foto ? "📷 Cambiar foto" : "📷 Tomar / subir foto"}
                  <input type="file" accept="image/*" capture="environment" onChange={onFotoSeleccionada} disabled={subiendoFoto} style={{ display: "none" }} />
                </label>
                {form.foto && (
                  <button onClick={() => verImagen(form.foto)} style={btnSecundario}>👁 Ver imagen</button>
                )}
                {form.foto && (
                  <button onClick={() => setCampo("foto", "")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 11, textDecoration: "underline", cursor: "pointer", padding: 0, fontFamily: "inherit", textAlign: "left" }}>
                    Quitar foto
                  </button>
                )}
              </div>
            </div>

            {facturaSel !== "new" && qrDataUrl && (
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, flexWrap: "wrap" }}>
                <img src={qrDataUrl} alt="QR de la factura" style={{ width: 90, height: 90, background: "white", borderRadius: 6, padding: 4 }} />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 4 }}>QR de consulta</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Escanéalo desde "📷 Escanear QR" (en este PC o en otro celular) para ver esta factura y su foto al instante.</div>
                </div>
              </div>
            )}

            {errorGuardado && (
              <div style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: "#FF6B6B" }}>
                ⚠️ {errorGuardado}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {facturaSel !== "new" ? (
                <button onClick={() => eliminar({ id: facturaSel, concepto: form.concepto })} style={btnTablaEliminar}>Eliminar factura</button>
              ) : <span />}
              <button onClick={guardar} disabled={guardando} style={btnPrimario(guardadoOk, guardando)}>
                {guardadoOk ? "✓ Guardado" : guardando ? "Guardando..." : "Guardar Factura"}
              </button>
            </div>
          </div>
        )
      )}

      {/* ═══ TAB 1 — ABONOS ═══ */}
      {tabCM === 1 && (
        abonoSel === null ? (
          /* ── Lista maestra ── */
          <div style={cardS}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>💵 Abonos a Caja Menor</div>
              <button onClick={nuevoAbono} style={btnPrimario(false, false)}>+ Nuevo Abono</button>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Recargas o reembolsos que la empresa hace a la caja — dinero que entra al fondo, distinto de las facturas.</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              <input value={busquedaAbono} onChange={e => setBusquedaAbono(e.target.value)} placeholder="🔍 Buscar por motivo..." style={{ ...inp, flex: 1, minWidth: 160 }} />
            </div>
            {abonosFiltrados.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>Sin abonos registrados todavía.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "rgba(255,255,255,0.45)", textAlign: "left" }}>
                      <th style={{ padding: "6px" }}>Fecha</th><th style={{ padding: "6px" }}>Motivo</th>
                      <th style={{ padding: "6px" }}>Registrado por</th>
                      <th style={{ padding: "6px" }}>Monto</th><th style={{ padding: "6px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {abonosFiltrados.map(a => (
                      <tr key={a.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }} onClick={() => abrirAbono(a)}>
                        <td style={{ padding: "6px", whiteSpace: "nowrap" }}>{fmtFechaCorta(a.fecha)}</td>
                        <td style={{ padding: "6px", color: "white", fontWeight: 600 }}>{a.concepto || "—"}</td>
                        <td style={{ padding: "6px" }}>{a.registradoPor || "—"}</td>
                        <td style={{ padding: "6px", fontWeight: 700, color: "#00C9A7" }}>{fmtCOP(a.monto)}</td>
                        <td style={{ padding: "6px", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => abrirAbono(a)} style={btnTablaEditar}>Ver</button>
                          <button onClick={() => eliminarAbonoForm(a)} style={btnTablaEliminar}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid rgba(255,255,255,0.12)" }}>
                      <td colSpan={3} style={{ padding: "8px 6px", fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>Total ({abonosFiltrados.length})</td>
                      <td style={{ padding: "8px 6px", fontWeight: 800, color: "#00C9A7" }}>{fmtCOP(abonosFiltrados.reduce((a, x) => a + (Number(x.monto) || 0), 0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* ── Detalle / formulario ── */
          <div style={cardS}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>
                💵 {abonoSel === "new" ? "Nuevo abono" : `Abono #${abonoSel}`}
              </div>
              <button onClick={volverListaAbonos} style={btnSecundario}>← Volver a la lista</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: camposCols, gap: 10, marginBottom: 14 }}>
              <div style={campoBox}><div style={lbl}>Fecha</div><input type="date" style={inp} value={abonoForm.fecha} onChange={e => setCampoAbono("fecha", e.target.value)} /></div>
              <div style={campoBox}><div style={lbl}>Motivo</div><input style={inp} value={abonoForm.concepto} onChange={e => setCampoAbono("concepto", e.target.value)} placeholder="Ej: Reembolso mensual" /></div>
              <div style={campoBox}><div style={lbl}>Monto (COP)</div><input type="number" style={inp} value={abonoForm.monto} onChange={e => setCampoAbono("monto", e.target.value)} placeholder="0" /></div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={lbl}>Observaciones</div>
              <textarea style={{ ...inp, minHeight: m ? 70 : 56, resize: "vertical", fontFamily: "inherit" }} value={abonoForm.obs} onChange={e => setCampoAbono("obs", e.target.value)} placeholder="Notas sobre este abono..." />
            </div>

            {errorAbono && (
              <div style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: "#FF6B6B" }}>
                ⚠️ {errorAbono}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {abonoSel !== "new" ? (
                <button onClick={() => eliminarAbonoForm({ id: abonoSel, concepto: abonoForm.concepto })} style={btnTablaEliminar}>Eliminar abono</button>
              ) : <span />}
              <button onClick={guardarAbonoForm} disabled={guardandoAbono} style={btnPrimario(guardadoOkAbono, guardandoAbono)}>
                {guardadoOkAbono ? "✓ Guardado" : guardandoAbono ? "Guardando..." : "Guardar Abono"}
              </button>
            </div>
          </div>
        )
      )}

      {/* ═══ TAB 2 — ESCANEAR QR ═══ */}
      {tabCM === TAB_ESCANEAR_IDX && (
        <div style={{ maxWidth: 460, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 16, lineHeight: 1.5 }}>
            🧾 Escanea el QR de una factura de Caja Menor para ver sus datos y la foto al instante.
          </div>

          {!resultadoScan && (
            <div style={cardS}>
              {!camActiva && (
                <button onClick={iniciarCamara} style={{ ...btnPrimario(false, false), width: "100%", padding: m ? "14px" : "10px", fontSize: m ? 14 : 12 }}>
                  ▶️ Iniciar cámara
                </button>
              )}
              {camActiva && (
                <button onClick={detenerCamara} style={{ ...btnSecundario, width: "100%", padding: m ? "14px" : "10px", fontSize: m ? 14 : 12 }}>
                  ⏹ Detener cámara
                </button>
              )}
              {camError && (
                <div style={{ marginTop: 10, fontSize: 11, color: "#fca5a5", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: 10 }}>
                  {camError}
                </div>
              )}
              <div id={READER_ID} style={{ marginTop: 10, borderRadius: 10, overflow: "hidden", background: camActiva ? "black" : "transparent" }} />
            </div>
          )}

          {resultadoScan?.estado === "no-encontrado" && (
            <div style={{ ...cardS, textAlign: "center" }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>❓</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#F9A826", marginBottom: 4 }}>Factura no encontrada</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 16 }}>
                El QR no corresponde a ninguna factura guardada en el sistema.
              </div>
              <button onClick={escanearOtra} style={{ ...btnPrimario(false, false), width: "100%" }}>🔄 Escanear otra</button>
            </div>
          )}

          {resultadoScan?.estado === "ok" && (() => {
            const f = resultadoScan.factura;
            return (
              <div style={cardS}>
                {f.foto && (
                  <img src={f.foto} alt="Factura" onClick={() => verImagen(f.foto)} style={{ width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 8, marginBottom: 14, background: "black", cursor: "pointer" }} />
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div><div style={lbl}>Fecha</div><div style={{ fontSize: 13, color: "white", fontWeight: 700 }}>{fmtFechaCorta(f.fecha)}</div></div>
                  <div><div style={lbl}>Valor total</div><div style={{ fontSize: 13, color: "#F9A826", fontWeight: 800 }}>{fmtCOP(f.monto)}</div></div>
                  <div><div style={lbl}>Nombre</div><div style={{ fontSize: 13, color: "white", fontWeight: 700 }}>{f.nombre || "—"}</div></div>
                  <div><div style={lbl}>NIT o Cédula</div><div style={{ fontSize: 13, color: "white", fontWeight: 700 }}>{f.nit || "—"}</div></div>
                  <div><div style={lbl}>Tipo de documento</div><div style={{ fontSize: 13, color: "white", fontWeight: 700 }}>{f.tipoDocumento || "—"}</div></div>
                  <div><div style={lbl}>N° de documento</div><div style={{ fontSize: 13, color: "white", fontWeight: 700 }}>{f.numeroDocumento || "—"}</div></div>
                  <div><div style={lbl}>Registrado por</div><div style={{ fontSize: 13, color: "white", fontWeight: 700 }}>{f.registradoPor || "—"}</div></div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={lbl}>Concepto</div>
                  <div style={{ fontSize: 13, color: "white" }}>{f.concepto || "—"}</div>
                </div>
                {f.obs && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={lbl}>Observaciones</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{f.obs}</div>
                  </div>
                )}
                <button onClick={escanearOtra} style={{ ...btnSecundario, width: "100%" }}>🔄 Escanear otra factura</button>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Visor de imagen ampliada ── */}
      {imagenAmpliada && (
        <div onClick={() => setImagenAmpliada(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}>
          <img src={imagenAmpliada} alt="Factura ampliada" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }} />
          <button onClick={() => setImagenAmpliada(null)} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, color: "white", fontSize: 20, width: 36, height: 36, cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}
