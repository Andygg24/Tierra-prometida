import { useState, useEffect, useRef } from "react";
import LimonLoader from "./LimonLoader.jsx";
import { btnSecundario, btnPrimario } from "./buttonStyles.js";
import { usePackingList } from "../hooks/usePackingList.js";
import { QR_PALLET_PREFIX } from "./PackingListTab.jsx";

// Mismos helpers que usa Canastillas para su escáner — se duplican aquí
// (son pequeños y sin dependencias) en vez de exportarlos, para no acoplar
// este módulo al de Canastillas.
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
  } catch {}
}

const nombreUsuarioSesion = () => {
  try { return JSON.parse(localStorage.getItem("tp_session"))?.nombre || ""; } catch { return ""; }
};

function fmtDate(d) {
  if (!d) return "—";
  const [y, mo, dd] = d.split("-");
  return `${mo}-${dd}-${y}`;
}

function fmtFechaHora(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
  } catch { return iso; }
}

const PESO_STR = "16.2 KG";

const lbl = { fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 3, fontWeight: 600, letterSpacing: 0.3 };
const val = { fontSize: 13, color: "white", fontWeight: 700 };
const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16 };

export default function PalletVerificationTab({ mob }) {
  const m = mob;
  const { cargarPorIdConContenedor, actualizarPallets } = usePackingList();

  const [camActiva, setCamActiva] = useState(false);
  const [camError,  setCamError]  = useState("");
  const [resultado, setResultado] = useState(null); // null | {estado:"buscando"|"no-encontrado"|"invalido"|"ok", ...}
  const [verificando, setVerificando] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3200); };

  const html5QrRef   = useRef(null);
  const procesandoRef = useRef(false);
  const READER_ID = "qr-reader-pallet-verification";

  const detenerCamara = async () => {
    try { await html5QrRef.current?.stop(); html5QrRef.current?.clear(); } catch {}
    html5QrRef.current = null;
    setCamActiva(false);
  };

  useEffect(() => () => { html5QrRef.current?.stop().then(() => html5QrRef.current?.clear()).catch(() => {}); }, []);

  const buscarPallet = async (plIdRaw, palletIdRaw) => {
    setResultado({ estado: "buscando" });
    const plIdNum = Number(plIdRaw);
    const { data, error } = await cargarPorIdConContenedor(Number.isFinite(plIdNum) ? plIdNum : plIdRaw);
    if (error || !data) { setResultado({ estado: "no-encontrado" }); return; }
    const palletIdNum = Number(palletIdRaw);
    const pallet = (data.pallets || []).find(x => x.id === palletIdNum);
    if (!pallet) { setResultado({ estado: "no-encontrado" }); return; }
    setResultado({ estado: "ok", pl: data, pallet });
  };

  const onScan = async (decodedText) => {
    if (procesandoRef.current) return;
    const primeraLinea = (decodedText || "").split("\n")[0].trim();
    const partes = primeraLinea.split("|");
    // No es un QR de tirilla de pallet (puede ser cualquier otro código
    // captado sin querer, ej. el de Canastillas) — se ignora en silencio.
    if (partes[0] !== QR_PALLET_PREFIX || partes.length < 3) return;

    procesandoRef.current = true;
    playBeep();
    await detenerCamara();
    await buscarPallet(partes[1], partes[2]);
    procesandoRef.current = false;
  };

  const iniciarCamara = async () => {
    setCamError("");
    setResultado(null);
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

  const marcarVerificado = async (verificado) => {
    if (resultado?.estado !== "ok") return;
    setVerificando(true);
    const pallets = resultado.pl.pallets.map(x => x.id !== resultado.pallet.id ? x : {
      ...x,
      verificado,
      verificadoPor: verificado ? (nombreUsuarioSesion() || "Sin nombre") : "",
      verificadoEn:  verificado ? new Date().toISOString() : "",
    });
    const { error } = await actualizarPallets(resultado.pl.id, pallets);
    setVerificando(false);
    if (error) { showToast("No se pudo guardar — intenta de nuevo", false); return; }
    setResultado(prev => ({ ...prev, pl: { ...prev.pl, pallets }, pallet: pallets.find(x => x.id === resultado.pallet.id) }));
    showToast(verificado ? "✓ Pallet verificado" : "Verificación retirada");
  };

  const escanearOtro = () => { setResultado(null); iniciarCamara(); };

  return (
    <div>
      {toast && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background: toast.ok ? "#064e3b" : "#450a0a", border:`1px solid ${toast.ok ? "#059669" : "#dc2626"}`, color: toast.ok ? "#6ee7b7" : "#fca5a5", borderRadius:10, padding:"10px 20px", fontSize:12, fontWeight:600, zIndex:9999, pointerEvents:"none", whiteSpace:"nowrap" }}>
          {toast.ok ? "✅" : "❌"} {toast.msg}
        </div>
      )}

      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 16, lineHeight: 1.5 }}>
          🏷️ Escanea el QR de la tirilla de un pallet (Packing List → Paso 1) para ver su información en vivo y marcarlo como verificado.
        </div>

        {!resultado && (
          <div style={card}>
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

        {resultado?.estado === "buscando" && <LimonLoader texto="Buscando pallet" />}

        {resultado?.estado === "no-encontrado" && (
          <div style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>❓</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#F9A826", marginBottom: 4 }}>Pallet no encontrado</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 16 }}>
              El QR no corresponde a ningún packing list guardado, o ese pallet ya no existe en el sistema.
            </div>
            <button onClick={escanearOtro} style={{ ...btnPrimario(false, false), width: "100%" }}>🔄 Escanear otro</button>
          </div>
        )}

        {resultado?.estado === "ok" && (() => {
          const { pl, pallet } = resultado;
          const sumaCajas = pallet.calibres.reduce((s, c) => s + Number(c.cajas || 0), 0);
          const pesoTotal = (parseFloat(PESO_STR) || 0) * sumaCajas;
          return (
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={lbl}>CONTENEDOR</div>
                  <div style={{ ...val, fontSize: 16 }}>{pl.numContenedor || "—"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={lbl}>PALLET</div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: "#a5b4fc", lineHeight: 1 }}>{pallet.id}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div><div style={lbl}>Fecha de empaque</div><div style={val}>{fmtDate(pl.admin_data?.packingDate)}</div></div>
                <div><div style={lbl}>Producto</div><div style={val}>Limón Tahití · Cat 1</div></div>
                <div><div style={lbl}>Peso por caja</div><div style={val}>{PESO_STR}</div></div>
                <div><div style={lbl}>Peso total</div><div style={val}>{pesoTotal.toFixed(1)} KG</div></div>
              </div>

              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, marginBottom: 6, letterSpacing: 0.3 }}>CALIBRES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {pallet.calibres.map((c, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 14, fontWeight: 800 }}>{c.plu ? `${c.size}PLU` : c.size}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{Number(c.cajas || 0).toLocaleString("es-CO")} cajas</span>
                    </div>
                    {(c.predio || c.ica) && (
                      <div style={{ display: "flex", gap: 14, marginTop: 5, fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
                        {c.predio && <span>📝 {c.predio}</span>}
                        {c.ica && <span>🪪 ICA: {c.ica}</span>}
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.5)" }}>TOTAL</span>
                  <span style={{ fontSize: 13, fontWeight: 900 }}>{sumaCajas.toLocaleString("es-CO")} cajas</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1, textAlign: "center", padding: "6px 8px", borderRadius: 7, fontSize: 11, fontWeight: 700, background: pallet.listo ? "rgba(0,201,167,0.12)" : "rgba(249,168,38,0.12)", color: pallet.listo ? "#00C9A7" : "#F9A826" }}>
                  {pallet.listo ? "✓ Listo para cargar" : "⚠ Pendiente por revisar"}
                </div>
              </div>

              {pallet.verificado ? (
                <div style={{ background: "rgba(0,201,167,0.1)", border: "1px solid rgba(0,201,167,0.35)", borderRadius: 9, padding: "10px 12px", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#00C9A7", marginBottom: 2 }}>✓ Verificado</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
                    {pallet.verificadoPor ? `Por ${pallet.verificadoPor} · ` : ""}{fmtFechaHora(pallet.verificadoEn)}
                  </div>
                  <button onClick={() => marcarVerificado(false)} disabled={verificando} style={{ marginTop: 8, background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 10, textDecoration: "underline", cursor: verificando ? "wait" : "pointer", padding: 0, fontFamily: "inherit" }}>
                    Deshacer verificación
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => marcarVerificado(true)}
                  disabled={verificando}
                  style={{ width: "100%", background: "linear-gradient(135deg,#0f766e,#14b8a6)", border: "none", borderRadius: 9, padding: m ? "14px" : "11px", fontSize: m ? 14 : 12, color: "white", cursor: verificando ? "wait" : "pointer", fontWeight: 700, opacity: verificando ? 0.7 : 1, marginBottom: 10, fontFamily: "inherit" }}
                >
                  {verificando ? "Guardando..." : "✓ Marcar como Verificado"}
                </button>
              )}

              <button onClick={escanearOtro} style={{ ...btnSecundario, width: "100%" }}>🔄 Escanear otro pallet</button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
