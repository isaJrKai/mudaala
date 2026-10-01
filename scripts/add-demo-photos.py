"""One-off: attach small demo photos (data URLs) to seeded listings so the
photo-first UI has real imagery in the sandbox. Generates simple themed JPEGs
with PIL — visibly distinct per category, tiny enough for the data-URL cap."""
import base64
import io
import json
import sqlite3

from PIL import Image, ImageDraw

DB = "/home/z/my-project/db/custom.db"

THEMES = {
    "copper": ((184, 115, 51), (94, 56, 20), "COPPER"),
    "eggs": ((240, 219, 168), (146, 116, 62), "FRESH EGGS"),
    "milk": ((214, 230, 240), (70, 105, 130), "RAW MILK"),
    "flour": ((238, 232, 220), (150, 130, 100), "FLOUR 50KG"),
    "maize": ((226, 205, 120), (120, 96, 30), "DRY MAIZE"),
    "steel": ((120, 130, 140), (50, 56, 62), "STEEL BARS"),
    "matooke": ((168, 196, 120), (74, 110, 52), "MATOOKE"),
    "tray-eggs": ((244, 226, 180), (150, 118, 60), "EGGS TRAY"),
    "dagaa": ((196, 176, 140), (110, 88, 58), "DAGAA"),
    "charcoal": ((70, 70, 74), (24, 24, 26), "MAKAA"),
    "sorghum": ((190, 150, 96), (104, 76, 40), "SORGHUM"),
}


def make_photo(label: str, bg, fg) -> str:
    img = Image.new("RGB", (640, 480), bg)
    d = ImageDraw.Draw(img)
    # Simple goods-like composition: band + circle + label bar.
    d.rectangle([0, 330, 640, 480], fill=tuple(max(0, c - 28) for c in bg))
    d.ellipse([220, 90, 420, 290], fill=fg)
    d.rectangle([60, 396, 580, 452], fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=68)
    b = buf.getvalue()
    print(f"{label}: {len(b)} bytes")
    return "data:image/jpeg;base64," + base64.b64encode(b).decode()


def main():
    photos = {k: make_photo(k, bg, fg) for k, (bg, fg, _t) in THEMES.items()}
    # Single "cover" per listing keeps rows light; two photos for copper to
    # exercise the multi-photo UI.
    double_copper = json.dumps([photos["copper"], photos["steel"]])
    singles = {k: json.dumps([v]) for k, v in photos.items()}

    con = sqlite3.connect(DB)
    cur = con.cursor()
    updates = [
        ("Copper scrap, 99.5% clean", double_copper),
        ("Fresh eggs in crates", singles["eggs"]),
        ("Raw milk, chilled same-day", singles["milk"]),
        ("Wheat flour premium, 50kg bags", singles["flour"]),
        ("Dry maize, grade 1 Ahero", singles["maize"]),
        ("Y12 deformed steel bars, 12mm", singles["steel"]),
        ("Matooke bunches, fresh from Mbarara", singles["matooke"]),
        ("Fresh eggs in trays of 30", singles["tray-eggs"]),
        ("Sorghum wanted — brewing grade", singles["sorghum"]),
        ("Dagaa (sardines), premium grade A", singles["dagaa"]),
        ("Coconut charcoal, long-burning", singles["charcoal"]),
    ]
    for title, photos_json in updates:
        cur.execute("UPDATE Listing SET photos = ? WHERE title = ?", (photos_json, title))
        print(f"{cur.rowcount} row(s): {title}")
    con.commit()
    con.close()


if __name__ == "__main__":
    main()
