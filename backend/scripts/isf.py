"""
isf.py — Edita ISF Template .xls con xlrd + xlutils + xlwt
Multiplataforma: no requiere Excel instalado.

El molde es .xls (Excel 97-2003). openpyxl no soporta .xls,
por eso se usa el stack xlrd/xlutils/xlwt para este archivo.

Celdas a editar (Sheet1, referencias Excel 1-indexed):
  B13 → Est Loading Date  (row=12, col=1 en 0-indexed)
  F13 → Est Arrival Date  (row=12, col=5)
  E63 → House B/L         (row=62, col=4)
  F63 → Ocean B/L         (row=62, col=5)
"""
import sys, json, os, tempfile, io
from datetime import datetime
import xlrd
from xlutils.copy import copy as xl_copy
import xlwt

data         = json.load(io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8-sig"))
loading_date = data.get("loadingDate", "")
arrival_date = data.get("arrivalDate", "")
house_bl     = data.get("houseBL", "")
ocean_bl     = data.get("oceanBL", "")

BASE   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOLDES = os.path.join(os.path.dirname(BASE), "Moldes")
TMPL   = os.path.abspath(os.path.join(MOLDES, "ISF Template - JKFE AND PRINCESSES KINGDOM 270711823.xls"))

def parse_date(date_str):
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        return None

def to_excel_serial(dt):
    """Convierte datetime a número serial de Excel (epoch: 30-dic-1899)."""
    epoch = datetime(1899, 12, 30)
    return (dt - epoch).days

tmp = tempfile.NamedTemporaryFile(suffix=".xls", delete=False)
tmp_path = tmp.name
tmp.close()

try:
    rb = xlrd.open_workbook(TMPL, formatting_info=True)
    wb = xl_copy(rb)
    ws = wb.get_sheet(0)

    date_style = xlwt.XFStyle()
    date_style.num_format_str = "MM/DD/YYYY"

    # B13 → Est Loading Date (0-indexed: row=12, col=1)
    d = parse_date(loading_date)
    if d:
        ws.write(12, 1, to_excel_serial(d), date_style)

    # F13 → Est Arrival Date (0-indexed: row=12, col=5)
    d = parse_date(arrival_date)
    if d:
        ws.write(12, 5, to_excel_serial(d), date_style)

    # E63 → House B/L (0-indexed: row=62, col=4)
    if house_bl:
        ws.write(62, 4, str(house_bl))

    # F63 → Ocean B/L (0-indexed: row=62, col=5) — siempre string; los B/L son identificadores
    if ocean_bl:
        ws.write(62, 5, str(ocean_bl))

    wb.save(tmp_path)

    with open(tmp_path, "rb") as f:
        sys.stdout.buffer.write(f.read())

finally:
    try:
        os.unlink(tmp_path)
    except Exception:
        pass
