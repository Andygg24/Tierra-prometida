"""
proforma.py — Edita PROFORMA PRINCESSES KINGDOM .xlsx con Excel COM
Preserva logos, imágenes y formato exacto del molde original.

Hoja "FACTURA FINAL":
  H12 → N° Factura
  C14 → Fecha Expedición
  H14 → Fecha Vencimiento
"""
import sys, json, os, tempfile
from datetime import datetime
import win32com.client

data        = json.load(sys.stdin)
num_factura = str(data.get("numFactura", ""))
fecha_exp   = data.get("fechaExpedicion", "")   # "YYYY-MM-DD"
fecha_venc  = data.get("fechaVencimiento", "")  # "YYYY-MM-DD"
destino     = data.get("destino", "philadelphia")

# ── Ruta del molde ────────────────────────────────────────────────────
BASE   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOLDES = os.path.join(os.path.dirname(BASE), "Moldes")

MOLDE_POR_DESTINO = {
    "philadelphia": "PROFORMA PRINCESSES KINGDOM 713.xlsx",
    "miami":        "PROFORMA PRINCESSES KINGDOM 706.xlsx",
    "san_juan":     "PROFORMA PRINCESSES KINGDOM 709.xlsx",
}
molde_file = MOLDE_POR_DESTINO.get(destino, "PROFORMA PRINCESSES KINGDOM 713.xlsx")
TMPL = os.path.abspath(os.path.join(MOLDES, molde_file))

def parse_date(date_str):
    """Convierte "YYYY-MM-DD" a objeto datetime para Excel COM."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        return None

# ── Archivo de salida temporal ────────────────────────────────────────
tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
tmp_path = tmp.name
tmp.close()

excel = None
wb    = None

try:
    excel = win32com.client.Dispatch("Excel.Application")
    excel.Visible          = False
    excel.DisplayAlerts    = False
    excel.AskToUpdateLinks = False

    wb = excel.Workbooks.Open(TMPL, UpdateLinks=0, ReadOnly=False)
    ws = wb.Worksheets("FACTURA FINAL")

    # H12 → Número de factura
    if num_factura:
        ws.Range("H12").Value = num_factura

    # C14 → Fecha expedición
    d = parse_date(fecha_exp)
    if d:
        ws.Range("C14").Value = d

    # H14 → Fecha vencimiento
    d = parse_date(fecha_venc)
    if d:
        ws.Range("H14").Value = d

    # Guardar como .xlsx (FileFormat 51 = xlOpenXMLWorkbook)
    wb.SaveAs(tmp_path, FileFormat=51)
    wb.Close(False)
    wb = None
    excel.Quit()
    excel = None

    with open(tmp_path, "rb") as f:
        sys.stdout.buffer.write(f.read())

finally:
    if wb:
        try: wb.Close(False)
        except: pass
    if excel:
        try: excel.Quit()
        except: pass
    try: os.unlink(tmp_path)
    except: pass
