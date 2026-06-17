"""
packing_list.py — Genera Packing List preservando el molde original.
Usa openpyxl load_workbook() para conservar logo, AutoFilter, estilos,
bordes, merges, anchos y altos de fila.

Pallets mixtos (multi-calibre): genera filas de continuación con A y B
vacíos. Si el total de filas supera las del molde, copia el estilo de la
fila de referencia del molde para que no queden sin formato.

JSON esperado por stdin:
{
  "plNo":              "2026-174",
  "destino":           "Philadelphia",
  "fechaCargue":       "2026-05-15",
  "empresaTransporte": "Transportando Express",
  "placa":             "QJN678",
  "tempRecorder":      "V1-0041573",
  "finalStamps":       "005743-SQ83066",
  "totalCajas":        1400,
  "pallets": [
    {"id": 1,  "calibres": [{"size": 200, "cajas": 70, "predio": "Las Brisas", "ica": "980005905"}]},
    {"id": 15, "calibres": [
        {"size": 110, "cajas": 60, "predio": "La Esperanza", "ica": "430003503"},
        {"size": 230, "cajas": 10, "predio": "San Pedro",    "ica": "590004304"}
    ]}
  ]
}
"""
import sys, json, os, io
from copy import copy as copy_obj
from datetime import date as date_cls
from openpyxl import load_workbook
from openpyxl.utils import column_index_from_string

# ── Leer JSON de stdin ────────────────────────────────────────────────────
data = json.load(sys.stdin)

pl_no        = str(data.get("plNo", ""))
destino      = str(data.get("destino", "PHILADELPHIA")).upper()
fecha_str    = data.get("fechaCargue", "")
empresa      = str(data.get("empresaTransporte", ""))
placa        = str(data.get("placa", ""))
temp_rec     = str(data.get("tempRecorder", ""))
final_stamps = str(data.get("finalStamps", ""))
total_cajas  = int(data.get("totalCajas", 1400))
pallets      = data.get("pallets", [])

PESO_KG      = 16.2
DATA_START   = 11        # primera fila de datos de pallets en el molde
COLS         = ["A", "B", "C", "D", "E", "F", "G", "H", "I"]

BASE   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOLDES = os.path.join(os.path.dirname(BASE), "Moldes")
TMPL   = os.path.join(MOLDES, "Packing List 271169365.xlsx")

# ── Cargar molde — preserva logo, AutoFilter, estilos, merges ────────────
wb = load_workbook(TMPL, keep_vba=False)
ws = wb.active   # hoja "Table 1"

# Guardar límite de filas del molde ANTES de tocar nada
TMPL_LAST_ROW = ws.max_row   # 31 en el molde actual

# Fila de referencia para copiar estilo en filas extra (fila intermedia,
# sin bordes especiales de primera/última fila)
STYLE_REF_ROW  = 15
STYLE_CONT_ROW = 15   # mismo estilo para filas de continuación extra

# ── Verificar preservación antes de modificar ─────────────────────────────
try:
    n_img = len(ws._images)
except Exception:
    n_img = "N/A"
print(f"Imágenes en el workbook: {n_img}", file=sys.stderr)
print(f"AutoFilter: {ws.auto_filter.ref}", file=sys.stderr)
print(f"Última fila del molde: {TMPL_LAST_ROW}", file=sys.stderr)

# ── Encabezado — solo .value ──────────────────────────────────────────────
peso = round(total_cajas * PESO_KG, 2)

ws["A2"].value = (
    f"TIERRA PROMETIDA TRADING SAS.\n"
    f"BARRANQUILLA - ATLANTICO\n"
    f"operaciones@tierraprometidat.com\n"
    f"Packing List No. {pl_no}"
)
ws["D5"].value = destino
ws["F5"].value = total_cajas
ws["H5"].value = 20
ws["A7"].value = peso
ws["D7"].value = peso
ws["F7"].value = empresa
ws["H7"].value = placa
ws["A9"].value = pl_no
ws["D9"].value = temp_rec
ws["H9"].value = final_stamps

if fecha_str:
    try:
        y, mo, d = [int(x) for x in fecha_str.split("-")]
        ws["F9"].value = date_cls(y, mo, d)
    except Exception:
        ws["F9"].value = fecha_str

# ── Construir lista plana de filas (pallets simples y mixtos) ────────────
sorted_pallets = sorted(pallets, key=lambda p: p.get("id", 0))
rows = []
merges_to_add = []   # (col, r1, r2) para pallets mixtos

for p in sorted_pallets:
    pid      = p.get("id", 0)
    calibres = p.get("calibres") or [{"size": "", "cajas": 0, "predio": "", "ica": ""}]
    r_start  = DATA_START + len(rows)

    for ci, c in enumerate(calibres):
        rows.append({
            "pid":     pid if ci == 0 else None,
            "size":    c.get("size", ""),
            "cajas":   int(c.get("cajas", 0)),
            "predio":  c.get("predio", ""),
            "ica":     str(c.get("ica", "")),
            "is_cont": ci > 0,
        })

    # Si tiene más de un calibre → merge de A y B para las filas que ocupa
    if len(calibres) > 1:
        r_end = DATA_START + len(rows) - 1
        for col in ("A", "B"):
            merges_to_add.append((col, r_start, r_end))

# ── Limpiar área de datos del molde — solo .value = None ─────────────────
for r in range(DATA_START, TMPL_LAST_ROW + 1):
    for col in COLS:
        ws[f"{col}{r}"].value = None

# ── Función auxiliar: copiar estilo completo de una celda a otra ──────────
def copy_style(src_row, dst_row, col):
    src = ws.cell(row=src_row, column=column_index_from_string(col))
    dst = ws.cell(row=dst_row, column=column_index_from_string(col))
    if src.has_style:
        dst._style = copy_obj(src._style)
    # Copiar alto de fila si la fila destino no existe aún en row_dimensions
    src_ht = ws.row_dimensions[src_row].height
    if src_ht and dst_row not in ws.row_dimensions:
        ws.row_dimensions[dst_row].height = src_ht

# ── Escribir datos de pallets ─────────────────────────────────────────────
for i, rd in enumerate(rows):
    excel_row = DATA_START + i

    # Si la fila está fuera del molde → copiar estilo de fila de referencia
    if excel_row > TMPL_LAST_ROW:
        ref_row = STYLE_CONT_ROW if rd["is_cont"] else STYLE_REF_ROW
        for col in COLS:
            copy_style(ref_row, excel_row, col)

    # Escribir valores — solo .value
    if not rd["is_cont"]:
        ws[f"A{excel_row}"].value = rd["pid"]
        ws[f"B{excel_row}"].value = "16.2 KG"
    # Filas de continuación: A y B quedan None

    ws[f"C{excel_row}"].value = rd["size"] if rd["size"] != "" else None
    ws[f"D{excel_row}"].value = "LIMON TAHITI"
    ws[f"E{excel_row}"].value = 1
    ws[f"F{excel_row}"].value = rd["cajas"]
    ws[f"G{excel_row}"].value = rd["predio"] or None
    ws[f"H{excel_row}"].value = rd["cajas"]
    ws[f"I{excel_row}"].value = rd["ica"] or None

# ── Agregar merges para pallets mixtos (A y B agrupados) ─────────────────
for col, r1, r2 in merges_to_add:
    try:
        ws.merge_cells(f"{col}{r1}:{col}{r2}")
    except Exception as e:
        print(f"Merge {col}{r1}:{col}{r2} omitido: {e}", file=sys.stderr)

# ── Verificar estado final antes de guardar ───────────────────────────────
try:
    n_img_post = len(ws._images)
except Exception:
    n_img_post = "N/A"
print(f"Imágenes en el workbook (post): {n_img_post}", file=sys.stderr)
print(f"AutoFilter (post): {ws.auto_filter.ref}", file=sys.stderr)
print(f"Pallets: {len(sorted_pallets)} | Filas de datos: {len(rows)} | "
      f"Filas extra fuera del molde: {max(0, len(rows) - (TMPL_LAST_ROW - DATA_START + 1))}",
      file=sys.stderr)

# ── Guardar en stdout ─────────────────────────────────────────────────────
out_buf = io.BytesIO()
wb.save(out_buf)
out_buf.seek(0)
sys.stdout.buffer.write(out_buf.read())
