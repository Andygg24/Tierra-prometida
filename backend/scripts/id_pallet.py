"""
id_pallet.py — Edita FORMATO ID PALLET .xlsx
Estrategia: copia binaria exacta del molde + edita SOLO las celdas en el XML.
Preserva 100%: logos, imágenes, VML, estilos — todo intacto (misma técnica
que proforma.py / isf.py).

Hoja "Hoja1" — celdas confirmadas contra el molde real:
  C5  → Date                                  (fecha)
  F5  → Port                                  (texto)
  I5  → Vessel                                (texto)
  K5  → Destination                           (texto)
  B6  → "CONTAINER: {valor}"                  (combinado — solo si hay valor)
  F6  → "TEMPERATURE: {valor}"                (combinado — solo si hay valor)
  I6  → "THERMOS REGISTRATION: {valor}"       (combinado — solo si hay valor)
  L5  → "FINAL STAMPS: {valor}"               (combinado — solo si hay valor)
  M5  → "MOVIAD: {valor}"                     (combinado — solo si hay valor)
  M6  → "PUERTO: {valor}"                     (combinado — solo si hay valor)
  D9,G9 .. D18,G18 → tamaño del pallet 1-20, o "Mixto" si el pallet tiene
                     más de un calibre con cajas.

Los campos combinados (B6/F6/I6/L5/M5/M6) solo se tocan si llega un valor —
si no, se deja intacto el texto/línea en blanco del molde (regla confirmada
por el usuario: "lo que está en blanco se deja en blanco").
"""
import sys, json, os, tempfile, zipfile, shutil, re, io
from datetime import datetime
from xml.etree import ElementTree as ET
from lxml import etree

data = json.load(io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8-sig"))

fecha        = data.get("fechaCargue", "")
port         = data.get("port", "")
vessel       = data.get("vessel", "")
destino      = data.get("destino", "")
container    = data.get("container", "")
temperatura  = data.get("temperatura", "")
temp_recorder= data.get("tempRecorder", "")
final_stamps = data.get("finalStamps", "")
moviad       = data.get("moviad", "")
puerto       = data.get("puertoManual", "")
pallets      = data.get("pallets", [])

BASE   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOLDES = os.path.join(os.path.dirname(BASE), "Moldes")
TMPL   = os.path.join(MOLDES, "Formato ID Pallet MMAU1100544.xlsx")

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
    """changes: { "C5": ("date", datetime), "F5": ("str", valor), "D9": ("num", 200), ... }"""
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

        if kind in ("str",):
            cell_el.set("t", "inlineStr")
            if style:
                cell_el.set("s", style)
            is_el = etree.SubElement(cell_el, f"{{{MAIN_NS}}}is")
            t_el  = etree.SubElement(is_el,  f"{{{MAIN_NS}}}t")
            t_el.text = str(value)
            t_el.set(f"{{{XML_NS}}}space", "preserve")

        elif kind == "date":
            if "t" in cell_el.attrib:
                del cell_el.attrib["t"]
            if style:
                cell_el.set("s", style)
            v_el = etree.SubElement(cell_el, f"{{{MAIN_NS}}}v")
            v_el.text = str(excel_serial(value))

        elif kind == "num":
            if "t" in cell_el.attrib:
                del cell_el.attrib["t"]
            if style:
                cell_el.set("s", style)
            v_el = etree.SubElement(cell_el, f"{{{MAIN_NS}}}v")
            v_el.text = str(value)

    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)

# ── Armar dict de cambios ────────────────────────────────────────────────
changes = {}

d = parse_date(fecha)
if d:
    changes["C5"] = ("date", d)
if port:
    changes["F5"] = ("str", port)
if vessel:
    changes["I5"] = ("str", vessel)
if destino:
    changes["K5"] = ("str", destino)
if container:
    changes["B6"] = ("str", f"CONTAINER: {container}")
if temperatura:
    changes["F6"] = ("str", f"TEMPERATURE: {temperatura}")
if temp_recorder:
    changes["I6"] = ("str", f"THERMOS REGISTRATION: {temp_recorder}")
if final_stamps:
    changes["L5"] = ("str", f"FINAL STAMPS: {final_stamps}")
if moviad:
    changes["M5"] = ("str", f"MOVIAD: {moviad}")
if puerto:
    changes["M6"] = ("str", f"PUERTO: {puerto}")

# ── Pallets 1-20: tamaño o "Mixto" ────────────────────────────────────────
PALLET_CELLS = {
    1:"D9",  2:"G9",  3:"D10", 4:"G10", 5:"D11", 6:"G11", 7:"D12", 8:"G12",
    9:"D13", 10:"G13", 11:"D14", 12:"G14", 13:"D15", 14:"G15", 15:"D16", 16:"G16",
    17:"D17", 18:"G17", 19:"D18", 20:"G18",
}
by_id = {p.get("id"): p for p in pallets}
for pid, cell_ref in PALLET_CELLS.items():
    p = by_id.get(pid)
    if not p:
        continue
    con_cajas = [c for c in p.get("calibres", []) if int(c.get("cajas", 0) or 0) > 0]
    if len(con_cajas) == 1:
        unico = con_cajas[0]
        size  = int(unico.get("size", 0) or 0)
        if unico.get("plu"):
            changes[cell_ref] = ("str", f"{size}PLU")
        else:
            changes[cell_ref] = ("num", size)
    elif len(con_cajas) > 1:
        changes[cell_ref] = ("str", "Mixto")
    # sin calibres con cajas → se deja el valor del molde tal cual

# ── Edición quirúrgica del ZIP ─────────────────────────────────────────────
tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
tmp_path = tmp.name
tmp.close()

try:
    shutil.copy2(TMPL, tmp_path)

    if changes:
        buf = io.BytesIO()
        with zipfile.ZipFile(TMPL, "r") as zin:
            sheet_path     = find_sheet_path(zin, "Hoja1")
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
