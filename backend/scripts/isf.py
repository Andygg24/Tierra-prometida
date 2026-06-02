"""
isf.py — Edita ISF Template .xls con Excel COM (preserva logos y formato exacto)
Lee JSON por stdin, escribe el .xls editado a stdout (binario).

Celdas a editar (Sheet1, referencias Excel):
  B13 → Est Loading Date
  F13 → Est Arrival Date
  E63 → House B/L
  F63 → Ocean B/L / Master B/L
"""
import sys, json, os, tempfile
from datetime import datetime
import win32com.client

data         = json.load(sys.stdin)
loading_date = data.get("loadingDate", "")
arrival_date = data.get("arrivalDate", "")
house_bl     = data.get("houseBL", "")
ocean_bl     = data.get("oceanBL", "")

# ── Ruta del molde ────────────────────────────────────────────────────
BASE   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOLDES = os.path.join(os.path.dirname(BASE), "Moldes")
TMPL   = os.path.abspath(os.path.join(MOLDES, "ISF Template - JKFE AND PRINCESSES KINGDOM 270711823.xls"))

def parse_date(date_str):
    """Convierte "YYYY-MM-DD" a objeto datetime para Excel COM."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        return None

# ── Archivo de salida temporal ────────────────────────────────────────
tmp = tempfile.NamedTemporaryFile(suffix=".xls", delete=False)
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
    ws = wb.Sheets(1)

    # B13 → Est Loading Date
    d = parse_date(loading_date)
    if d:
        ws.Cells(13, 2).Value = d

    # F13 → Est Arrival Date
    d = parse_date(arrival_date)
    if d:
        ws.Cells(13, 6).Value = d

    # E63 → House B/L (string)
    if house_bl:
        ws.Cells(63, 5).Value = str(house_bl)

    # F63 → Ocean B/L / Master B/L
    if ocean_bl:
        try:
            ws.Cells(63, 6).Value = float(ocean_bl)
        except (ValueError, TypeError):
            ws.Cells(63, 6).Value = str(ocean_bl)

    # Guardar como .xls (FileFormat 56 = xlExcel8)
    wb.SaveAs(tmp_path, FileFormat=56)
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
