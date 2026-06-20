"""
proforma.py — Edita PROFORMA PRINCESSES KINGDOM .xlsx
Estrategia: copia binaria exacta del molde + edita SOLO las celdas en el XML.
Preserva 100%: logos, imágenes, VML, estilos, fórmulas — todo intacto.

Hoja "FACTURA FINAL":
  H12 → N° Factura        (texto)
  C14 → Fecha Expedición  (fecha)
  H14 → Fecha Vencimiento (fecha)
"""
import sys, json, os, tempfile, zipfile, shutil, re, io
from datetime import datetime
from xml.etree import ElementTree as ET
from lxml import etree

data        = json.load(io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8-sig"))
num_factura = str(data.get("numFactura", ""))
fecha_exp   = data.get("fechaExpedicion", "")
fecha_venc  = data.get("fechaVencimiento", "")
destino     = data.get("destino", "philadelphia")

BASE   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOLDES = os.path.join(os.path.dirname(BASE), "Moldes")
MOLDE_POR_DESTINO = {
    "philadelphia": "PROFORMA PRINCESSES KINGDOM 713.xlsx",
    "miami":        "PROFORMA PRINCESSES KINGDOM 706.xlsx",
    "san_juan":     "PROFORMA PRINCESSES KINGDOM 709.xlsx",
}
molde_file = MOLDE_POR_DESTINO.get(destino, "PROFORMA PRINCESSES KINGDOM 713.xlsx")
TMPL = os.path.abspath(os.path.join(MOLDES, molde_file))

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
    # 1. Buscar r:id del sheet en workbook.xml
    wb_root = ET.fromstring(z.read("xl/workbook.xml"))
    rid = None
    for sheet in wb_root.iter(f"{{{MAIN_NS}}}sheet"):
        if sheet.get("name") == sheet_name:
            rid = sheet.get(f"{{{R_NS}}}id")
            break
    if not rid:
        raise ValueError(f"Hoja '{sheet_name}' no encontrada en el workbook")

    # 2. Resolver Target en workbook.xml.rels
    rels_root = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    for rel in rels_root.iter(f"{{{PKG_NS}}}Relationship"):
        if rel.get("Id") == rid:
            tgt = rel.get("Target")
            return tgt if tgt.startswith("xl/") else "xl/" + tgt

    raise ValueError(f"Relación {rid} no encontrada en workbook.xml.rels")

def modify_sheet_xml(xml_bytes, changes):
    """
    changes: { "H12": ("str", valor), "C14": ("date", datetime), ... }
    Preserva todos los atributos de las celdas (especialmente s= para el estilo).
    """
    parser = etree.XMLParser(remove_blank_text=False)
    root   = etree.fromstring(xml_bytes, parser)
    ns     = {"m": MAIN_NS}

    for cell_ref, (kind, value) in changes.items():
        row_num = int(re.match(r"[A-Z]+(\d+)", cell_ref).group(1))

        # Buscar o crear la fila
        row_el = root.find(f".//m:sheetData/m:row[@r='{row_num}']", ns)
        if row_el is None:
            sd = root.find("m:sheetData", ns)
            row_el = etree.SubElement(sd, f"{{{MAIN_NS}}}row")
            row_el.set("r", str(row_num))

        # Buscar o crear la celda
        cell_el = row_el.find(f"m:c[@r='{cell_ref}']", ns)
        if cell_el is None:
            cell_el = etree.SubElement(row_el, f"{{{MAIN_NS}}}c")
            cell_el.set("r", cell_ref)

        # Conservar s= (índice de estilo) que controla formato visual y de fecha
        style = cell_el.get("s", "")

        # Limpiar contenido existente
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
            for attr in ("t",):                        # quitar t="s" o similar
                if attr in cell_el.attrib:
                    del cell_el.attrib[attr]
            if style:
                cell_el.set("s", style)
            v_el = etree.SubElement(cell_el, f"{{{MAIN_NS}}}v")
            v_el.text = str(excel_serial(value))

    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)

# ── Armar dict de cambios ──────────────────────────────────────────────
changes = {}
if num_factura:
    changes["H12"] = ("str", num_factura)
d = parse_date(fecha_exp)
if d:
    changes["C14"] = ("date", d)
d = parse_date(fecha_venc)
if d:
    changes["H14"] = ("date", d)

# ── Edición quirúrgica del ZIP ─────────────────────────────────────────
tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
tmp_path = tmp.name
tmp.close()

try:
    # Copia binaria exacta → logos y todo queda intacto
    shutil.copy2(TMPL, tmp_path)

    if changes:
        # Leer el molde, reemplazar solo el sheet XML, reescribir el ZIP limpio
        buf = io.BytesIO()
        with zipfile.ZipFile(TMPL, "r") as zin:
            sheet_path     = find_sheet_path(zin, "FACTURA FINAL")
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
