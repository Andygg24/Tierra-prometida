import QRCode from "qrcode";

// Logo embebido como base64 para que el informe/tirilla funcione sin servidor.
export async function cargarLogoBase64() {
  try {
    const res  = await fetch("/logo-tp.png");
    const blob = await res.blob();
    return await new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  } catch { return ""; }
}

// ── QR de asistencia: "TPAS|FIJO|<num>" o "TPAS|TEMP|<num>" (num = documento) ──
export const QR_ASIS_PREFIX = "TPAS";
export const textoQrAsistencia = (tipo, num) => `${QR_ASIS_PREFIX}|${tipo}|${num}`;

// Tirilla individual (100x50mm) — para el registro rápido de un temporal o
// para reimprimir el QR fijo de una sola persona.
export async function buildTirillaEmpleado({ nombre, num, tipo, contenedor, fecha }) {
  const logoSrc   = await cargarLogoBase64();
  // Corrección de errores "H" (máxima) y buen tamaño en píxeles — así el QR
  // sigue siendo legible aunque WhatsApp lo recomprima al enviarlo como foto.
  const qrDataUrl = await QRCode.toDataURL(textoQrAsistencia(tipo, num), { errorCorrectionLevel: "H", margin: 2, width: 400 });
  const fechaFmt  = fecha ? new Date(fecha + "T12:00:00").toLocaleDateString("es-CO", { day:"2-digit", month:"short", year:"numeric" }) : "";
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>QR ${nombre}</title>
<style>
  *{box-sizing:border-box}
  @page{size:100mm 50mm;margin:0}
  html,body{margin:0;padding:0}
  body{font-family:Arial,sans-serif;color:#111;width:100mm;height:50mm}
  .box{width:100mm;height:50mm;padding:2mm;display:flex;gap:3mm;align-items:center}
  .left{flex:1;min-width:0}
  .brand{display:flex;align-items:center;gap:1.5mm;margin-bottom:2mm}
  .brand img{width:7mm;height:7mm;object-fit:contain}
  .brand .nom{font-size:3mm;font-weight:800}
  .nombre{font-size:5.2mm;font-weight:900;line-height:1.1;margin-bottom:1.5mm;word-break:break-word}
  .doc{font-size:3.2mm;color:#444;font-weight:700}
  .badge{display:inline-block;margin-top:2mm;padding:0.8mm 2.5mm;border-radius:2mm;font-size:2.6mm;font-weight:800;letter-spacing:0.3mm}
  .badge.fijo{background:#ede9fe;color:#6d28d9}
  .badge.temp{background:#fee2e2;color:#b91c1c}
  .proceso{margin-top:1.8mm;font-size:2.5mm;color:#333;font-weight:700;line-height:1.5}
  .proceso b{color:#111}
  .right{width:30mm;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1mm}
  .right img{width:28mm;height:28mm}
  .qr-lbl{font-size:1.9mm;color:#777;text-align:center;line-height:1.2;font-weight:600}
  @media print{ body{padding:0} }
</style></head>
<body>
  <div class="box">
    <div class="left">
      <div class="brand">${logoSrc ? `<img src="${logoSrc}"/>` : ""}<span class="nom">TIERRA PROMETIDA</span></div>
      <div class="nombre">${nombre}</div>
      <div class="doc">Doc. ${num}</div>
      <div class="badge ${tipo === "TEMP" ? "temp" : "fijo"}">${tipo === "TEMP" ? "TEMPORAL" : "TRABAJADOR AUTORIZADO"}</div>
      ${(contenedor || fechaFmt) ? `<div class="proceso">${contenedor ? `📦 Contenedor <b>${contenedor}</b>` : ""}${contenedor && fechaFmt ? " · " : ""}${fechaFmt ? `📅 <b>${fechaFmt}</b>` : ""}</div>` : ""}
    </div>
    <div class="right">
      <img src="${qrDataUrl}" alt="QR ${nombre}"/>
      <div class="qr-lbl">Escanear para asistencia</div>
    </div>
  </div>
</body></html>`;
}

// Link de WhatsApp con el chat de esa persona ya abierto y el mensaje
// escrito. WhatsApp no permite adjuntar una imagen por link (limitación de
// su click-to-chat, no del navegador) — por eso `compartirQR` intenta primero
// el "compartir" nativo del sistema (sí adjunta el archivo, en celular).
function linkWhatsAppTexto(tel, mensaje) {
  const limpio = String(tel || "").replace(/\D/g, "");
  if (limpio.length < 7) return null;
  const conCodigo = limpio.length <= 10 ? `57${limpio}` : limpio;
  return `https://wa.me/${conCodigo}?text=${encodeURIComponent(mensaje)}`;
}

export async function compartirQR({ emp, tipo, contenedor, fecha }) {
  const mensaje = `Hola ${emp.nombre.split(" ")[0]}, este es tu código QR de asistencia${contenedor ? ` para el contenedor ${contenedor}` : ""}${fecha ? ` del ${fecha}` : ""}. Preséntalo al llegar 🍋`;
  try {
    if (navigator.share && navigator.canShare) {
      const qrDataUrl = await QRCode.toDataURL(textoQrAsistencia(tipo, emp.num), { errorCorrectionLevel:"H", margin:2, width:500 });
      const blob = await (await fetch(qrDataUrl)).blob();
      const file = new File([blob], `QR_${emp.nombre.replace(/\s+/g,"_")}.png`, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: mensaje });
        return { ok: true };
      }
    }
  } catch (err) {
    if (err?.name === "AbortError") return { ok: true }; // el usuario canceló el share, no es un error
  }
  const link = linkWhatsAppTexto(emp.tel, mensaje);
  if (!link) return { ok: false, msg: `${emp.nombre} no tiene celular registrado en Personal.` };
  window.open(link, "_blank");
  return { ok: true };
}

// Devuelve el documento de un QR de asistencia ("TPAS|FIJO|<num>"), o null
// si el texto no es un QR de asistencia.
export function numDeQrAsistencia(texto) {
  const partes = String(texto || "").split("\n")[0].trim().split("|");
  if (partes[0] !== QR_ASIS_PREFIX || partes.length < 3 || !partes[2]) return null;
  return partes[2];
}
