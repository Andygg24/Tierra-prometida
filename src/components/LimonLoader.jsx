import { useState, useEffect } from "react";

const CSS = `
@keyframes lm-bounce {
  0%   { transform: translate(-50%,-50%) scaleX(1)   scaleY(1);   }
  30%  { transform: translate(-50%,-80%) scaleX(0.93) scaleY(1.07); }
  50%  { transform: translate(-50%,-85%) scaleX(0.93) scaleY(1.07); }
  75%  { transform: translate(-50%,-50%) scaleX(1.12) scaleY(0.88); }
  85%  { transform: translate(-50%,-50%) scaleX(0.97) scaleY(1.03); }
  100% { transform: translate(-50%,-50%) scaleX(1)   scaleY(1);   }
}
@keyframes lm-shadow {
  0%,100% { transform: translateX(-50%) scaleX(1);   opacity:.25; }
  30%,50% { transform: translateX(-50%) scaleX(.45); opacity:.08; }
  75%     { transform: translateX(-50%) scaleX(1.18); opacity:.35; }
}
@keyframes lm-glow {
  0%,100% { transform: translate(-50%,-50%) scale(1);    opacity:.45; }
  50%     { transform: translate(-50%,-50%) scale(1.22); opacity:.8;  }
}
@keyframes lm-orbit-a {
  from { transform: rotate(0deg)   translateX(62px) rotate(0deg); }
  to   { transform: rotate(360deg) translateX(62px) rotate(-360deg); }
}
@keyframes lm-orbit-b {
  from { transform: rotate(120deg)  translateX(58px) rotate(-120deg); }
  to   { transform: rotate(480deg)  translateX(58px) rotate(-480deg); }
}
@keyframes lm-orbit-c {
  from { transform: rotate(240deg)  translateX(60px) rotate(-240deg); }
  to   { transform: rotate(600deg)  translateX(60px) rotate(-600deg); }
}
@keyframes lm-orbit-d {
  from { transform: rotate(60deg)   translateX(50px) rotate(-60deg); }
  to   { transform: rotate(420deg)  translateX(50px) rotate(-420deg); }
}
@keyframes lm-drop1 {
  0%        { opacity:0; transform:translateY(0) scale(.6);  }
  15%       { opacity:1; }
  60%,100%  { opacity:0; transform:translateY(34px) scale(1); }
}
@keyframes lm-drop2 {
  0%,30%    { opacity:0; transform:translateY(0) scale(.5);  }
  45%       { opacity:1; }
  90%,100%  { opacity:0; transform:translateY(28px) scale(.9); }
}
@keyframes lm-txt {
  0%,100% { opacity:.5; letter-spacing:2px; }
  50%     { opacity:1;  letter-spacing:4px; }
}
@keyframes lm-ring {
  0%   { transform:translate(-50%,-50%) scale(.7); opacity:.6; }
  100% { transform:translate(-50%,-50%) scale(1.7); opacity:0; }
}
`;

const FRASES = [
  "Exprimiendo datos",
  "Cargando limones",
  "Preparando el jugo",
  "Un momento...",
  "Conectando con JARVIS",
  "Casi listo",
];

export default function LimonLoader({ texto, fullscreen = false }) {
  const [frase,  setFrase]  = useState(0);
  const [puntos, setPuntos] = useState(0);

  useEffect(() => {
    const t1 = setInterval(() => setPuntos(p => (p + 1) % 4), 380);
    const t2 = setInterval(() => setFrase(f => (f + 1) % FRASES.length), 2200);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  const label = texto ?? FRASES[frase];
  const dots  = ".".repeat(puntos);

  const wrap = fullscreen ? {
    position: "fixed", inset: 0, zIndex: 9999,
    background: "rgba(10,10,20,.88)",
    backdropFilter: "blur(6px)",
    display: "flex", alignItems: "center", justifyContent: "center",
  } : {
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "60px 20px",
  };

  return (
    <>
      <style>{CSS}</style>
      <div style={wrap}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:0 }}>

          {/* ── Escena principal ── */}
          <div style={{ position:"relative", width:130, height:130 }}>

            {/* Anillo pulsante de fondo */}
            <div style={{
              position:"absolute", top:"50%", left:"50%",
              width:90, height:90, borderRadius:"50%",
              border:"2px solid rgba(253,224,71,.4)",
              animation:"lm-ring 1.4s ease-out infinite",
            }}/>
            <div style={{
              position:"absolute", top:"50%", left:"50%",
              width:90, height:90, borderRadius:"50%",
              border:"2px solid rgba(253,224,71,.25)",
              animation:"lm-ring 1.4s ease-out infinite .7s",
            }}/>

            {/* Glow suave */}
            <div style={{
              position:"absolute", top:"50%", left:"50%",
              width:78, height:78, borderRadius:"50%",
              background:"radial-gradient(circle, rgba(253,224,71,.55) 0%, transparent 70%)",
              animation:"lm-glow 1.4s ease-in-out infinite",
            }}/>

            {/* Órbita A — hoja */}
            <div style={{
              position:"absolute", top:"50%", left:"50%",
              width:0, height:0,
              animation:"lm-orbit-a 2.6s linear infinite",
            }}>
              <span style={{ fontSize:15, lineHeight:1, display:"block",
                filter:"drop-shadow(0 0 4px rgba(34,197,94,.8))" }}>🌿</span>
            </div>

            {/* Órbita B — chispa */}
            <div style={{
              position:"absolute", top:"50%", left:"50%",
              width:0, height:0,
              animation:"lm-orbit-b 2.2s linear infinite",
            }}>
              <span style={{ fontSize:13, lineHeight:1, display:"block",
                filter:"drop-shadow(0 0 5px rgba(253,224,71,1))" }}>✨</span>
            </div>

            {/* Órbita C — gota */}
            <div style={{
              position:"absolute", top:"50%", left:"50%",
              width:0, height:0,
              animation:"lm-orbit-c 3s linear infinite",
            }}>
              <span style={{ fontSize:12, lineHeight:1, display:"block",
                filter:"drop-shadow(0 0 3px rgba(99,210,255,.9))" }}>💧</span>
            </div>

            {/* Órbita D — mini limón */}
            <div style={{
              position:"absolute", top:"50%", left:"50%",
              width:0, height:0,
              animation:"lm-orbit-d 1.9s linear infinite",
            }}>
              <span style={{ fontSize:10, lineHeight:1, display:"block" }}>🍋</span>
            </div>

            {/* Gotas de jugo cayendo */}
            <div style={{
              position:"absolute", top:"62%", left:"52%",
              fontSize:9, lineHeight:1,
              animation:"lm-drop1 1.4s ease-in infinite",
            }}>💛</div>
            <div style={{
              position:"absolute", top:"60%", left:"44%",
              fontSize:8, lineHeight:1,
              animation:"lm-drop2 1.4s ease-in infinite .5s",
            }}>💛</div>

            {/* 🍋 principal — rebota */}
            <div style={{
              position:"absolute", top:"50%", left:"50%",
              fontSize:58, lineHeight:1,
              animation:"lm-bounce 1.15s cubic-bezier(.36,.07,.19,.97) infinite",
              filter:"drop-shadow(0 6px 18px rgba(253,224,71,.6))",
              userSelect:"none",
            }}>🍋</div>
          </div>

          {/* Sombra en el suelo */}
          <div style={{
            position:"relative", left:"50%",
            width:44, height:9, borderRadius:"50%",
            background:"rgba(0,0,0,.35)",
            marginTop:-6,
            animation:"lm-shadow 1.15s cubic-bezier(.36,.07,.19,.97) infinite",
          }}/>

          {/* Barra de progreso animada */}
          <div style={{
            marginTop:22, width:140, height:3, borderRadius:99,
            background:"rgba(255,255,255,.08)", overflow:"hidden",
          }}>
            <div style={{
              height:"100%", borderRadius:99,
              background:"linear-gradient(90deg, #FDE047, #86EFAC, #FDE047)",
              backgroundSize:"200% 100%",
              animation:"lm-txt 1.6s ease-in-out infinite",
              width:"60%",
            }}/>
          </div>

          {/* Texto */}
          <div style={{
            marginTop:14,
            fontSize:12, fontWeight:700, letterSpacing:2,
            color:"rgba(253,224,71,.9)",
            animation:"lm-txt 2.2s ease-in-out infinite",
            textTransform:"uppercase",
            textShadow:"0 0 12px rgba(253,224,71,.4)",
          }}>
            {label}{dots}
          </div>

        </div>
      </div>
    </>
  );
}
