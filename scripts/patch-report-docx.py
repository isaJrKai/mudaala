#!/usr/bin/env python3
"""Post-process the report docx for WPS/Word page-number compatibility (toc.md rules):
1. Remove empty <w:pgNumType/> elements (docx-js emits them on sections without pageNumbers).
2. Patch footer PAGE fields with explicit format switches:
   - the footer referenced by the section whose pgNumType fmt="upperRoman" -> PAGE \\* ROMAN \\* MERGEFORMAT
   - the footer referenced by the section whose pgNumType fmt="decimal"    -> PAGE \\* arabic \\* MERGEFORMAT
"""
import re, shutil, sys, zipfile, os

path = sys.argv[1]
tmp = path + ".patch"

with zipfile.ZipFile(path, "r") as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

doc = data["word/document.xml"].decode("utf-8")

# 0. compress injected TOC 1/2/3 styles so a 25-entry TOC + hint fits one page
styles = data.get("word/styles.xml", b"").decode("utf-8")
def compress_toc_style(xml, name, before, after):
    pat = re.compile(r'(<w:style [^>]*>(?:(?!</w:style>).)*?<w:name w:val="' + name + r'"/>(?:(?!</w:style>).)*?)<w:spacing[^/]*/>', re.S)
    repl = r'\1<w:spacing w:before="%d" w:after="%d" w:line="240" w:lineRule="auto"/>' % (before, after)
    return pat.sub(repl, xml, count=1)
if styles:
    styles = compress_toc_style(styles, "toc 1", 100, 40)
    styles = compress_toc_style(styles, "toc 2", 20, 20)
    styles = compress_toc_style(styles, "toc 3", 0, 0)
    data["word/styles.xml"] = styles.encode("utf-8")

# 1. strip empty pgNumType
doc_before = doc
doc = re.sub(r"<w:pgNumType\s*/>", "", doc)

# 2. map sectPr -> footer rIds by fmt
rels = data["word/_rels/document.xml.rels"].decode("utf-8")
rid_to_target = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))

roman_footers, arabic_footers = set(), set()
for sect in re.findall(r"<w:sectPr[^>]*>.*?</w:sectPr>", doc, flags=re.S):
    fmt_m = re.search(r'<w:pgNumType[^>]*w:fmt="([^"]+)"', sect)
    refs = re.findall(r'<w:footerReference[^>]*r:id="([^"]+)"', sect)
    for rid in refs:
        target = rid_to_target.get(rid, "")
        fname = "word/" + target.lstrip("/") if not target.startswith("word/") else target
        if fmt_m and fmt_m.group(1) == "upperRoman":
            roman_footers.add(fname)
        elif fmt_m and fmt_m.group(1) in ("decimal", "arabic"):
            arabic_footers.add(fname)

def patch_footer(xml, switch):
    return re.sub(
        r"(<w:instrText[^>]*>)([^<]*\bPAGE\b[^<]*)(</w:instrText>)",
        lambda m: m.group(1) + " PAGE \\* " + switch + " \\* MERGEFORMAT " + m.group(3),
        xml,
    )

patched = []
for fname in list(data.keys()):
    if fname in roman_footers:
        data[fname] = patch_footer(data[fname].decode("utf-8"), "ROMAN").encode("utf-8")
        patched.append((fname, "ROMAN"))
    elif fname in arabic_footers:
        data[fname] = patch_footer(data[fname].decode("utf-8"), "arabic").encode("utf-8")
        patched.append((fname, "arabic"))

data["word/document.xml"] = doc.encode("utf-8")

with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(tmp, path)
print("pgNumType removed:", doc_before != doc, "| footers patched:", patched)
