// Reconocimiento de rostro para Asistencia, 100% en el navegador.
// Usa @vladmandic/face-api (TensorFlow.js): detecta la cara, sus 68 puntos y
// calcula una "huella" de 128 números. Las huellas se comparan por distancia
// — no se guardan ni se envían fotos.
//
// La librería (~1 MB) y los modelos (~7 MB, en /public/models/rostro) se
// cargan solo la primera vez que se abre la cámara de rostro, no al abrir la app.

let faceapiPromise = null;

export function cargarModelosRostro() {
  if (!faceapiPromise) {
    faceapiPromise = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      await faceapi.tf.ready();
      const url = `${import.meta.env.BASE_URL}models/rostro`;
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.faceLandmark68Net.loadFromUri(url),
        faceapi.nets.faceRecognitionNet.loadFromUri(url),
      ]);
      return faceapi;
    })().catch(err => { faceapiPromise = null; throw err; });
  }
  return faceapiPromise;
}

const opcionesDetector = (faceapi) =>
  new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

// Solo cara + puntos (rápido) — se usa en cada cuadro del registro guiado. Devuelve null si no hay exactamente una cara clara.
export async function detectarCara(faceapi, video) {
  const caras = await faceapi.detectAllFaces(video, opcionesDetector(faceapi)).withFaceLandmarks();
  if (caras.length !== 1) return caras.length > 1 ? { varias: true } : null;
  return caras[0];
}

// Cara + puntos + huella (más pesado) — solo cuando hace falta identificar.
export async function detectarHuella(faceapi, video) {
  const caras = await faceapi.detectAllFaces(video, opcionesDetector(faceapi)).withFaceLandmarks().withFaceDescriptors();
  if (caras.length !== 1) return caras.length > 1 ? { varias: true } : null;
  return caras[0];
}

// ── Comparar huellas ────────────────────────────────────────────
// Distancia euclidiana entre huellas: misma persona suele dar < 0.45,
// personas distintas > 0.55. Se usa 0.5 (más estricto que el 0.6 que trae la
// librería por defecto) para preferir "no te reconocí" antes que marcar a otro.
export const UMBRAL_RECONOCIMIENTO = 0.5;
// Si la segunda persona más parecida está casi igual de cerca, no se decide.
const MARGEN_MINIMO = 0.06;

export function distanciaHuellas(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

// `registrados`: [{ num, descriptores: [Float32Array|number[]] }]
// Devuelve { num, distancia } o null si nadie es lo bastante parecido.
export function identificar(huella, registrados) {
  let mejor = null, segunda = Infinity;
  for (const r of registrados) {
    let d = Infinity;
    for (const desc of r.descriptores) d = Math.min(d, distanciaHuellas(huella, desc));
    if (!mejor || d < mejor.distancia) {
      if (mejor) segunda = Math.min(segunda, mejor.distancia);
      mejor = { num: r.num, distancia: d };
    } else {
      segunda = Math.min(segunda, d);
    }
  }
  if (!mejor || mejor.distancia > UMBRAL_RECONOCIMIENTO) return null;
  if (segunda - mejor.distancia < MARGEN_MINIMO) return null;
  return mejor;
}

// ── Cámara frontal ──────────────────────────────────────────────
export async function abrirCamaraFrontal(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  video.muted = true;
  video.setAttribute("playsinline", "true");
  await video.play();
  return stream;
}

export function cerrarCamara(stream) {
  stream?.getTracks().forEach(t => t.stop());
}

// ── QR con la misma cámara ──────────────────────────────────────
// jsQR (~130 KB) se carga solo cuando se abre el Biométrico. Se analiza el
// cuadro a máx. 640 px de ancho: suficiente para un QR en papel o en pantalla
// de celular a 15–40 cm, y rápido incluso en celulares modestos.
let jsqrPromise = null;
const cargarJsQR = () => (jsqrPromise ||= import("jsqr").then(m => m.default));

export async function leerQrDeVideo(video, canvas) {
  const jsQR = await cargarJsQR();
  const w0 = video.videoWidth, h0 = video.videoHeight;
  if (!w0 || !h0) return null;
  const escala = Math.min(1, 640 / w0);
  const w = Math.round(w0 * escala), h = Math.round(h0 * escala);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  return jsQR(img.data, w, h, { inversionAttempts: "dontInvert" })?.data || null;
}

// ── Hacia dónde mira la cabeza (para el registro guiado) ────────
// Aproximación con los 68 puntos, sin 3D:
// - yaw (giro a los lados): qué tan corrida está la punta de la nariz (30)
//   respecto al centro entre los bordes de la mandíbula (0 y 16),
//   normalizado por el ancho de la cara. ~0 de frente.
// - pitch (arriba/abajo): dónde cae la punta de la nariz entre la línea de
//   los ojos y la barbilla (8). Cambia al subir o bajar la cabeza.
// No importa el signo exacto: el registro compara contra la postura de
// frente de esa misma persona.
export function poseCara(landmarks) {
  const p = landmarks.positions;
  const nariz = p[30], mandIzq = p[0], mandDer = p[16], barbilla = p[8];
  let ojoY = 0;
  for (let i = 36; i <= 47; i++) ojoY += p[i].y;
  ojoY /= 12;
  const ancho = mandDer.x - mandIzq.x || 1;
  const alto  = barbilla.y - ojoY || 1;
  return {
    yaw:   (nariz.x - (mandIzq.x + mandDer.x) / 2) / ancho,
    pitch: (nariz.y - ojoY) / alto,
  };
}
