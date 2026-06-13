"""
packing_list.py — Genera Packing List usando el molde .xlsx de la empresa.
Estrategia: copia binaria exacta del molde + edición quirúrgica del XML.
Preserva 100%: logo, colores, bordes, estilos, merges del encabezado.

JSON esperado por stdin:
{
  "plNo":               "2026-174",
  "destino":            "Philadelphia",
  "fechaCargue":        "2026-05-15",
  "empresaTransporte":  "Transportando Express",
  "placa":              "QJN678",
  "tempRecorder":       "V1-0041573",
  "finalStamps":        "005743-SQ83066",
  "totalCajas":         1400,
  "pallets": [
    {"id": 1, "calibres": [{"size": 200, "cajas": 70, "predio": "Las Brisas", "ica": "980005905"}]},
    {"id": 15, "calibres": [
        {"size": 110, "cajas": 60, "predio": "La Esperanza", "ica": "430003503"},
        {"size": 230, "cajas": 10, "predio": "San Pedro",    "ica": "590004304"}
    ]},
    ...
  ]
}
"""
import sys, json, os, tempfile, zipfile, shutil, io, re
from datetime import datetime
from xml.etree import ElementTree as ET
from lxml import etree

data = json.load(sys.stdin)

pl_no          = str(data.get("plNo", ""))
destino        = str(data.get("destino", "PHILADELPHIA")).upper()
fecha_cargue   = data.get("fechaCargue", "")
empresa        = str(data.get("empresaTransporte", ""))
placa          = str(data.get("placa", ""))
temp_rec       = str(data.get("tempRecorder", ""))
final_stamps   = str(data.get("finalStamps", ""))
total_cajas    = int(data.get("totalCajas", 1400))
pallets        = data.get("pallets", [])

PESO_KG = 16.2
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
R_NS    = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_NS  = "http://schemas.openxmlformats.org/package/2006/relationships"
XML_NS  = "http://www.w3.org/XML/1998/namespace"

BASE   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOLDES = os.path.join(os.path.dirname(BASE), "Moldes")
TMPL   = os.path.join(MOLDES, "Packing List 271169365.xlsx")

# ── Estilos de celda por tipo de fila (indices del styles.xml del molde) ─
#    Primera fila de datos, filas medias, última fila, fila continuación (mixta)
STYLE = {
    "first": {"A":15,"B":13,"C":8, "D":7,"E":2,"F":9, "G":12,"H":2, "I":10},
    "mid":   {"A":1, "B":8, "C":8, "D":7,"E":2,"F":9, "G":12,"H":2, "I":10},
    "last":  {"A":16,"B":17,"C":7, "D":7,"E":2,"F":9, "G":12,"H":9, "I":10},
    "cont":  {                "C":55,"D":7,"E":2,"F":9, "G":12,"H":2, "I":10},
}

def excel_serial(dt):
    return (dt - datetime(1899, 12, 30)).days

def parse_date(s):
    try:
        return datetime.strptime(s, "%Y-%m-%d") if s else None
    except Exception:
        return None

def find_sheet_path(z, sheet_name):
    wb_root = ET.fromstring(z.read("xl/workbook.xml"))
    rid = None
    for s in wb_root.iter(f"{{{MAIN_NS}}}sheet"):
        if s.get("name") == sheet_name:
            rid = s.get(f"{{{R_NS}}}id")
            break
    if not rid:
        raise ValueError(f"Hoja '{sheet_name}' no encontrada")
    rels_root = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    for rel in rels_root.iter(f"{{{PKG_NS}}}Relationship"):
        if rel.get("Id") == rid:
            t = rel.get("Target")
            return t if t.startswith("xl/") else "xl/" + t
    raise ValueError(f"Relación {rid} no encontrada")

def make_cell(row_el, ref, style_idx, kind, value):
    """Crea o reemplaza una celda en row_el preservando nada del original."""
    tag = f"{{{MAIN_NS}}}"
    c = etree.SubElement(row_el, f"{tag}c")
    c.set("r", ref)
    if style_idx is not None:
        c.set("s", str(style_idx))
    if kind == "str":
        c.set("t", "inlineStr")
        is_el = etree.SubElement(c, f"{tag}is")
        t_el  = etree.SubElement(is_el, f"{tag}t")
        t_el.text = str(value)
        t_el.set(f"{{{XML_NS}}}space", "preserve")
    elif kind == "num":
        v = etree.SubElement(c, f"{tag}v")
        v.text = str(value)
    elif kind == "date":
        v = etree.SubElement(c, f"{tag}v")
        v.text = str(excel_serial(value))
    return c

def col_letter(n):
    """0-indexed: 0→A, 1→B, … 8→I"""
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return letters[n]

def modify_sheet(xml_bytes):
    parser = etree.XMLParser(remove_blank_text=False)
    root   = etree.fromstring(xml_bytes, parser)
    ns     = {"m": MAIN_NS}
    tag    = f"{{{MAIN_NS}}}"

    def get_row(r_num):
        row = root.find(f".//m:sheetData/m:row[@r='{r_num}']", ns)
        return row

    def set_cell(row_num, col_ref, style_idx, kind, value):
        """Modifica una celda existente preservando su s= (estilo)."""
        row_el = get_row(row_num)
        if row_el is None:
            return
        cell_el = row_el.find(f"m:c[@r='{col_ref}{row_num}']", ns)
        if cell_el is None:
            cell_el = etree.SubElement(row_el, f"{tag}c")
            cell_el.set("r", f"{col_ref}{row_num}")
        # Preservar estilo original
        s = cell_el.get("s", str(style_idx) if style_idx else "")
        # Limpiar
        for ch in list(cell_el):
            cell_el.remove(ch)
        for at in ("t",):
            if at in cell_el.attrib:
                del cell_el.attrib[at]
        if s:
            cell_el.set("s", s)
        if kind == "str":
            cell_el.set("t", "inlineStr")
            is_el = etree.SubElement(cell_el, f"{tag}is")
            t_el  = etree.SubElement(is_el,  f"{tag}t")
            t_el.text = str(value)
            t_el.set(f"{{{XML_NS}}}space", "preserve")
        elif kind == "num":
            v = etree.SubElement(cell_el, f"{tag}v")
            v.text = str(value)
        elif kind == "date":
            v = etree.SubElement(cell_el, f"{tag}v")
            v.text = str(excel_serial(value))

    # ── Encabezado ──────────────────────────────────────────────────────
    peso = round(total_cajas * PESO_KG, 2)

    set_cell(5, "D", 38, "str",  destino)
    set_cell(5, "F", 50, "num",  total_cajas)
    set_cell(7, "A", 41, "num",  peso)
    set_cell(7, "D", 41, "num",  peso)
    set_cell(7, "F", 38, "str",  empresa)
    set_cell(7, "H", 38, "str",  placa)
    set_cell(9, "A", 30, "str",  pl_no)
    set_cell(9, "D", 30, "str",  temp_rec)
    set_cell(9, "H", 30, "str",  f"Packing List No. {pl_no}")

    d = parse_date(fecha_cargue)
    if d:
        set_cell(9, "F", 53, "date", d)

    # ── Construir lista plana de filas de pallets ────────────────────────
    # Ordenar pallets por id
    sorted_pallets = sorted(pallets, key=lambda p: p.get("id", 0))

    rows = []   # cada entry: (pallet_id_or_None, size, cajas, predio, ica)
    merges_new = []   # (start_row, end_row) de merges A:A B:B para pallets mixtos

    for p in sorted_pallets:
        pid = p.get("id", 0)
        calibres = p.get("calibres", [])
        if not calibres:
            calibres = [{"size": "", "cajas": 0, "predio": "", "ica": ""}]
        first_data_row = len(rows) + 11      # fila Excel donde empieza este pallet
        for ci, c in enumerate(calibres):
            rows.append({
                "pid":    pid if ci == 0 else None,
                "size":   c.get("size", ""),
                "cajas":  c.get("cajas", 0),
                "predio": c.get("predio", ""),
                "ica":    c.get("ica", ""),
                "is_cont": ci > 0,
            })
        if len(calibres) > 1:
            end_data_row = len(rows) + 11 - 1
            merges_new.append((first_data_row, end_data_row))

    total_data_rows = len(rows)

    # ── Eliminar filas de datos existentes (11+) del sheetData ──────────
    sd = root.find("m:sheetData", ns)
    for row_el in list(sd):
        r = int(row_el.get("r", 0))
        if r >= 11:
            sd.remove(row_el)

    # ── Insertar nuevas filas ────────────────────────────────────────────
    COLS = ["A","B","C","D","E","F","G","H","I"]

    for i, rd in enumerate(rows):
        excel_row = 11 + i
        is_first = (excel_row == 11)
        is_last  = (excel_row == 10 + total_data_rows)
        is_cont  = rd["is_cont"]

        if is_first:
            stype = "first"
        elif is_last:
            stype = "last"
        else:
            stype = "mid"

        row_el = etree.SubElement(sd, f"{tag}row")
        row_el.set("r", str(excel_row))
        row_el.set("ht", "12")
        row_el.set("customHeight", "1")

        if is_cont:
            # Fila continuación de pallet mixto: A y B vacíos, resto con datos
            smap = STYLE["cont"]
            for col in ["C","D","E","F","G","H","I"]:
                s = smap.get(col)
                ref = f"{col}{excel_row}"
                c_el = etree.SubElement(row_el, f"{tag}c")
                c_el.set("r", ref)
                if s is not None:
                    c_el.set("s", str(s))
                if col == "C":
                    v = etree.SubElement(c_el, f"{tag}v")
                    v.text = str(rd["size"])
                elif col == "D":
                    c_el.set("t", "inlineStr")
                    is_el = etree.SubElement(c_el, f"{tag}is")
                    t_el  = etree.SubElement(is_el, f"{tag}t")
                    t_el.text = "LIMON TAHITI"
                elif col == "E":
                    v = etree.SubElement(c_el, f"{tag}v")
                    v.text = "1"
                elif col == "F":
                    v = etree.SubElement(c_el, f"{tag}v")
                    v.text = str(rd["cajas"])
                elif col == "G":
                    c_el.set("t", "inlineStr")
                    is_el = etree.SubElement(c_el, f"{tag}is")
                    t_el  = etree.SubElement(is_el, f"{tag}t")
                    t_el.text = rd["predio"]
                    t_el.set(f"{{{XML_NS}}}space", "preserve")
                elif col == "H":
                    v = etree.SubElement(c_el, f"{tag}v")
                    v.text = str(rd["cajas"])
                elif col == "I":
                    c_el.set("t", "inlineStr")
                    is_el = etree.SubElement(c_el, f"{tag}is")
                    t_el  = etree.SubElement(is_el, f"{tag}t")
                    t_el.text = str(rd["ica"])
        else:
            smap = STYLE[stype]
            for col in COLS:
                s = smap.get(col)
                ref = f"{col}{excel_row}"
                c_el = etree.SubElement(row_el, f"{tag}c")
                c_el.set("r", ref)
                if s is not None:
                    c_el.set("s", str(s))
                if col == "A":
                    v = etree.SubElement(c_el, f"{tag}v")
                    v.text = str(rd["pid"])
                elif col == "B":
                    c_el.set("t", "inlineStr")
                    is_el = etree.SubElement(c_el, f"{tag}is")
                    t_el  = etree.SubElement(is_el, f"{tag}t")
                    t_el.text = "16.2 KG"
                elif col == "C":
                    v = etree.SubElement(c_el, f"{tag}v")
                    v.text = str(rd["size"])
                elif col == "D":
                    c_el.set("t", "inlineStr")
                    is_el = etree.SubElement(c_el, f"{tag}is")
                    t_el  = etree.SubElement(is_el, f"{tag}t")
                    t_el.text = "LIMON TAHITI"
                elif col == "E":
                    v = etree.SubElement(c_el, f"{tag}v")
                    v.text = "1"
                elif col == "F":
                    v = etree.SubElement(c_el, f"{tag}v")
                    v.text = str(rd["cajas"])
                elif col == "G":
                    c_el.set("t", "inlineStr")
                    is_el = etree.SubElement(c_el, f"{tag}is")
                    t_el  = etree.SubElement(is_el, f"{tag}t")
                    t_el.text = rd["predio"]
                    t_el.set(f"{{{XML_NS}}}space", "preserve")
                elif col == "H":
                    v = etree.SubElement(c_el, f"{tag}v")
                    v.text = str(rd["cajas"])
                elif col == "I":
                    c_el.set("t", "inlineStr")
                    is_el = etree.SubElement(c_el, f"{tag}is")
                    t_el  = etree.SubElement(is_el, f"{tag}t")
                    t_el.text = str(rd["ica"])

    # ── Actualizar mergeCells: quitar merges de datos, añadir los nuevos ─
    mc_el = root.find("m:mergeCells", ns)
    if mc_el is None:
        mc_el = etree.Element(f"{tag}mergeCells")
        root.append(mc_el)

    # Eliminar merges que caen en filas >= 11 (sección de datos)
    for m in list(mc_el):
        ref = m.get("ref", "")
        start = re.match(r"[A-Z]+(\d+)", ref)
        if start and int(start.group(1)) >= 11:
            mc_el.remove(m)

    # Añadir merges A:A y B:B para pallets mixtos
    for (r1, r2) in merges_new:
        for col in ("A", "B"):
            m = etree.SubElement(mc_el, f"{tag}mergeCell")
            m.set("ref", f"{col}{r1}:{col}{r2}")

    mc_el.set("count", str(len(mc_el)))

    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)

# ── Edición quirúrgica del ZIP ─────────────────────────────────────────
tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
tmp_path = tmp.name
tmp.close()

try:
    buf = io.BytesIO()
    with zipfile.ZipFile(TMPL, "r") as zin:
        sheet_path     = find_sheet_path(zin, "Table 1")
        modified_sheet = modify_sheet(zin.read(sheet_path))

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
