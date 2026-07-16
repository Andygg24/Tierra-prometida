"""
isf.py — Edita ISF Template .xlsx
Estrategia: copia binaria exacta del molde + edita SOLO las celdas en el XML.
Preserva 100%: logos, imágenes, VML, estilos, fórmulas — todo intacto.
(Igual que proforma.py — el molde antiguo era .xls y se editaba con
xlrd/xlutils/xlwt, que no soportan imágenes: el logo se perdía en cada
generación. El molde se convirtió una sola vez a .xlsx para poder usar
esta misma estrategia quirúrgica.)

Hoja "Sheet1":
  B13 → Est Loading Date  (fecha)
  F13 → Est Arrival Date  (fecha)
  E63 → House B/L         (texto)
  F63 → Ocean B/L         (texto)
"""
import sys, json, os, tempfile, zipfile, shutil, re, io
from datetime import datetime
from xml.etree import ElementTree as ET
from lxml import etree

data         = json.load(io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8-sig"))
loading_date = data.get("loadingDate", "")
arrival_date = data.get("arrivalDate", "")
house_bl     = data.get("houseBL", "")
ocean_bl     = data.get("oceanBL", "")

BASE   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOLDES = os.path.join(os.path.dirname(BASE), "Moldes")
TMPL   = os.path.abspath(os.path.join(MOLDES, "ISF Template - JKFE AND PRINCESSES KINGDOM 270711823.xlsx"))

# Namespaces del formato OOXML
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
R_NS    = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_NS  = "http://schemas.openxmlformats.org/package/2006/relationships"
XML_NS  = "http://www.w3.org/XML/1998/namespace"

def parse_date(s):
    try:
        return datetime.strptime(s, "%Y-%m-%d") if s else None
    except Exception:
        return None

def excel_serial(dt):
    return (dt - datetime(1899, 12, 30)).days

def find_sheet_path(z, sheet_name):
    """Devuelve la ruta interna del ZIP para la hoja con ese nombre."""
    wb_root = ET.fromstring(z.read("xl/workbook.xml"))
    rid = None
    for sheet in wb_root.iter(f"{{{MAIN_NS}}}sheet"):
        if sheet.get("name") == sheet_name:
            rid = sheet.get(f"{{{R_NS}}}id")
            break
    if not rid:
        raise ValueError(f"Hoja '{sheet_name}' no encontrada en el workbook")

    rels_root = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    for rel in rels_root.iter(f"{{{PKG_NS}}}Relationship"):
        if rel.get("Id") == rid:
            tgt = rel.get("Target")
            return tgt if tgt.startswith("xl/") else "xl/" + tgt

    raise ValueError(f"Relación {rid} no encontrada en workbook.xml.rels")

def modify_sheet_xml(xml_bytes, changes):
    """
    changes: { "B13": ("date", datetime), "E63": ("str", valor), ... }
    Preserva todos los atributos de las celdas (especialmente s= para el estilo).
    """
    parser = etree.XMLParser(remove_blank_text=False)
    root   = etree.fromstring(xml_bytes, parser)
    ns     = {"m": MAIN_NS}

    for cell_ref, (kind, value) in changes.items():
        row_num = int(re.match(r"[A-Z]+(\d+)", cell_ref).group(1))

        row_el = root.find(f".//m:sheetData/m:row[@r='{row_num}']", ns)
        if row_el is None:
            sd = root.find("m:sheetData", ns)
            row_el = etree.SubElement(sd, f"{{{MAIN_NS}}}row")
            row_el.set("r", str(row_num))

        cell_el = row_el.find(f"m:c[@r='{cell_ref}']", ns)
        if cell_el is None:
            cell_el = etree.SubElement(row_el, f"{{{MAIN_NS}}}c")
            cell_el.set("r", cell_ref)

        style = cell_el.get("s", "")

        for child in list(cell_el):
            cell_el.remove(child)

        if kind == "str":
            cell_el.set("t", "inlineStr")
            if style:
                cell_el.set("s", style)
            is_el = etree.SubElement(cell_el, f"{{{MAIN_NS}}}is")
            t_el  = etree.SubElement(is_el,  f"{{{MAIN_NS}}}t")
            t_el.text = str(value)
            t_el.set(f"{{{XML_NS}}}space", "preserve")

        elif kind == "date":
            for attr in ("t",):
                if attr in cell_el.attrib:
                    del cell_el.attrib[attr]
            if style:
                cell_el.set("s", style)
            v_el = etree.SubElement(cell_el, f"{{{MAIN_NS}}}v")
            v_el.text = str(excel_serial(value))

    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)

# ── Armar dict de cambios ──────────────────────────────────────────────
changes = {}
d = parse_date(loading_date)
if d:
    changes["B13"] = ("date", d)
d = parse_date(arrival_date)
if d:
    changes["F13"] = ("date", d)
if house_bl:
    changes["E63"] = ("str", str(house_bl))
if ocean_bl:
    changes["F63"] = ("str", str(ocean_bl))

# ── Edición quirúrgica del ZIP ─────────────────────────────────────────
tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
tmp_path = tmp.name
tmp.close()

try:
    shutil.copy2(TMPL, tmp_path)

    if changes:
        buf = io.BytesIO()
        with zipfile.ZipFile(TMPL, "r") as zin:
            sheet_path     = find_sheet_path(zin, "Sheet1")
            modified_sheet = modify_sheet_xml(zin.read(sheet_path), changes)

            with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    if item.filename == sheet_path:
                        zout.writestr(item, modified_sheet)
                    else:
                        zout.writestr(item, zin.read(item.filename))

        with open(tmp_path, "wb") as f:
            f.write(buf.getvalue())

    with open(tmp_path, "rb") as f:
        sys.stdout.buffer.write(f.read())

finally:
    try:
        os.unlink(tmp_path)
    except Exception:
        pass
