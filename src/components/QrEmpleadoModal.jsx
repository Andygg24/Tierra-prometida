import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { buildTirillaEmpleado, compartirQR, textoQrAsistencia } from "../utils/qrAsistencia.js";
import { btnPrimario, btnSecundario } from "./buttonStyles.js";

// QR personal de asistencia (el mismo que lee el Biométrico y Escanear QR):
// se muestra el QR en grande y se puede imprimir (tirilla 100x50mm) o enviar.
export default function QrEmpleadoModal({ emp, onClose }) {
  const [url, setUrl] = useState(null);
  const [qrImg, setQrImg] = useState(null);
  const [msg, setMsg] = useState(null);
  const iframeRef = useRef(null);
  const tipo = emp.esTemporal ? "TEMP" : "FIJO";

  useEffect(() => {
    QRCode.toDataURL(textoQrAsistencia(tipo, emp.num), { errorCorrectionLevel: "H", margin: 2, width: 400 }).then(setQrImg);
  }, [emp.num, tipo]);

  useEffect(() => {
    let vivo = true, creada = null;
    buildTirillaEmpleado({ nombre: emp.nombre, num: emp.num, tipo }).then(html => {
      if (!vivo) return;
      creada = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      setUrl(creada);
    });
    return () => { vivo = false; if (creada) URL.revokeObjectURL(creada); };
  }, [emp.nombre, emp.num, tipo]);

  const enviar = async () => {
    setMsg(null);
    const r = await compartirQR({ emp, tipo });
    if (!r.ok) setMsg(r.msg);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#1a1a2e", border:"1px solid rgba(132,94,247,0.35)", borderRadius:16, padding:20, maxWidth:440, width:"100%" }}>
        <div style={{ fontSize:14, fontWeight:800, color:"#a5b4fc", marginBottom:2 }}>🔳 QR de asistencia</div>
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginBottom:12 }}>
          Sirve en el Biométrico y en Escanear QR. Es fijo: no cambia, se puede imprimir una vez y reutilizar.
        </div>
        <div style={{ background:"white", borderRadius:12, padding:14, textAlign:"center" }}>
          {qrImg
            ? <img src={qrImg} alt={`QR ${emp.nombre}`} style={{ width:"100%", maxWidth:240, display:"block", margin:"0 auto" }} />
            : <div style={{ color:"#666", fontSize:12, padding:20 }}>Generando…</div>}
          <div style={{ color:"#111", fontSize:14, fontWeight:800, marginTop:6 }}>{emp.nombre}</div>
          <div style={{ color:"#555", fontSize:11 }}>Doc. {emp.num}</div>
        </div>
        {/* La tirilla 100x50mm que se imprime — oculta, solo para "Imprimir" */}
        {url && <iframe ref={iframeRef} src={url} title={`Tirilla ${emp.nombre}`} style={{ position:"absolute", width:0, height:0, border:"none", visibility:"hidden" }} />}
        {msg && <div style={{ fontSize:12, color:"#FF6B6B", marginTop:10 }}>{msg}</div>}
        <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
          <button onClick={() => iframeRef.current?.contentWindow?.print()} disabled={!url} style={btnPrimario(false, !url)}>🖨 Imprimir</button>
          <button onClick={enviar} style={btnSecundario}>📲 Enviar por WhatsApp</button>
          <button onClick={onClose} style={{ ...btnSecundario, marginLeft:"auto" }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
