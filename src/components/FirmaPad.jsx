import { useEffect, useRef } from "react";

// Firma dibujada con el dedo o el mouse. Se guarda sola al terminar cada
// trazo (sin botón de "confirmar firma" que se pueda olvidar); el formulario
// que la usa la persiste al darle Guardar.
export default function FirmaPad({ value, onChange, m }) {
  const canvasRef  = useRef(null);
  const dibujando  = useRef(false);
  const huboTrazo  = useRef(false);

  // Al montar: fondo blanco y, si ya había firma guardada, se pinta encima.
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = value;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const iniciar = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dibujando.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const mover = (e) => {
    if (!dibujando.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
    huboTrazo.current = true;
  };
  const soltar = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    if (huboTrazo.current) onChange(canvasRef.current.toDataURL("image/png"));
    huboTrazo.current = false;
  };
  const borrar = () => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    onChange("");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400} height={160}
        style={{ width: "100%", height: m ? 130 : 110, background: "#fff", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", touchAction: "none", cursor: "crosshair", display: "block" }}
        onPointerDown={iniciar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} onPointerLeave={soltar}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5, gap: 6 }}>
        <span style={{ fontSize: m ? 10 : 9, color: value ? "#00C9A7" : "rgba(255,255,255,0.3)", fontWeight: value ? 700 : 400 }}>
          {value ? "✓ Firmado" : "Firma aquí con el dedo o el mouse"}
        </span>
        {value && (
          <button onClick={borrar} style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 6, color: "#FF6B6B", padding: m ? "6px 10px" : "3px 8px", fontSize: 10.5, cursor: "pointer", fontFamily: "inherit" }}>🧹 Borrar</button>
        )}
      </div>
    </div>
  );
}
