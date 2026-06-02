/**
 * server.js — Backend Express para documentos de exportación
 * Tierra Prometida Trading S.A.S.
 *
 * Endpoints:
 *   POST /api/carta-temp   → descarga .docx
 *   POST /api/proforma     → descarga .xlsx
 *   POST /api/isf          → descarga .xls
 *   POST /api/exportar-zip → descarga .zip con los 3 archivos
 */

const express  = require("express");
const cors     = require("cors");
const path     = require("path");
const { execFile } = require("child_process");

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ─────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());

// ── Python interpreter ─────────────────────────────────────────────────
// Ruta completa para evitar dependencia de PATH en Windows
const PYTHON = process.platform === "win32"
  ? "C:\\Users\\Andy Garcia\\AppData\\Local\\Programs\\Python\\Python312\\python.exe"
  : "python3";

// ── Ruta a los scripts ─────────────────────────────────────────────────
const SCRIPTS = path.join(__dirname, "scripts");

// ── Helper: ejecutar script Python y devolver buffer ──────────────────
// Los scripts leen el JSON por stdin y escriben el archivo binario a stdout.
function runPython(scriptName, data) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS, scriptName);

    const child = execFile(
      PYTHON,
      [scriptPath],
      { maxBuffer: 20 * 1024 * 1024, encoding: "buffer" },
      (err, stdout, stderr) => {
        if (err) {
          const msg = stderr ? stderr.toString() : err.message;
          return reject(new Error(msg));
        }
        resolve(stdout);
      }
    );

    // Escribir JSON al stdin del proceso Python y cerrarlo
    child.stdin.write(JSON.stringify(data), "utf8");
    child.stdin.end();
  });
}

// ── Validar campos requeridos ──────────────────────────────────────────
function validate(body, fields) {
  const missing = fields.filter(f => !body[f]);
  return missing.length ? `Campos requeridos: ${missing.join(", ")}` : null;
}

// ── POST /api/carta-temp ───────────────────────────────────────────────
app.post("/api/carta-temp", async (req, res) => {
  const err = validate(req.body, ["fecha", "booking", "motonave", "naviera", "contenedor"]);
  if (err) return res.status(400).json({ error: err });

  try {
    const buffer   = await runPython("carta_temp.py", req.body);
    const filename = `carta-temperatura-${req.body.booking || "export"}.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (e) {
    console.error("[carta-temp]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/proforma ────────────────────────────────────────────────
app.post("/api/proforma", async (req, res) => {
  const err = validate(req.body, ["numFactura", "fechaExpedicion", "fechaVencimiento"]);
  if (err) return res.status(400).json({ error: err });

  try {
    const buffer   = await runPython("proforma.py", req.body);
    const filename = `proforma-${req.body.numFactura}-${req.body.booking || "export"}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (e) {
    console.error("[proforma]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/isf ─────────────────────────────────────────────────────
app.post("/api/isf", async (req, res) => {
  const err = validate(req.body, ["loadingDate", "arrivalDate", "houseBL", "oceanBL"]);
  if (err) return res.status(400).json({ error: err });

  try {
    const buffer   = await runPython("isf.py", req.body);
    const filename = `isf-${req.body.booking || "export"}.xls`;
    res.setHeader("Content-Type", "application/vnd.ms-excel");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (e) {
    console.error("[isf]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/exportar-zip — devuelve ZIP con los 3 archivos ──────────
app.post("/api/exportar-zip", async (req, res) => {
  try {
    // Ejecutar los 3 scripts en paralelo
    const [carta, proforma, isf] = await Promise.all([
      runPython("carta_temp.py", req.body),
      runPython("proforma.py",   req.body),
      runPython("isf.py",        req.body),
    ]);

    // Construir ZIP manual (sin dependencias extra)
    const booking = req.body.booking || "export";
    const archivos = [
      { nombre: `carta-temperatura-${booking}.docx`,  buf: carta },
      { nombre: `proforma-${req.body.numFactura || "706"}-${booking}.xlsx`, buf: proforma },
      { nombre: `isf-${booking}.xls`,                 buf: isf   },
    ];

    // Usar el módulo nativo 'node:zlib' + construcción manual de ZIP es complejo
    // → Enviar multipart o simplemente informar al cliente para descargar por separado
    // Por simplicidad enviamos los archivos como JSON base64 si no hay librería zip
    const payload = archivos.map(a => ({
      nombre: a.nombre,
      datos:  a.buf.toString("base64"),
    }));

    res.json({ archivos: payload });
  } catch (e) {
    console.error("[exportar-zip]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "1.0.0", service: "Tierra Prometida Export Docs" });
});

// ── Iniciar servidor ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🍋 Tierra Prometida — Export Docs Backend`);
  console.log(`   Servidor en http://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`     POST /api/carta-temp`);
  console.log(`     POST /api/proforma`);
  console.log(`     POST /api/isf`);
  console.log(`     POST /api/exportar-zip\n`);
});
