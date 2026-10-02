"""One-off: give the flagship demo shops a face (logo tile + cover banner).
Generates flat, brand-colored JPEGs with PIL — deliberately simple, matching
Duuka's deep-green/warm palette. Written straight to the sandbox SQLite store
as data URLs, same pipeline the app validates against."""
import base64
import io
import sqlite3

from PIL import Image, ImageDraw, ImageFont

DB = "/home/z/my-project/db/custom.db"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# (cover bg, accent, logo bg, letter) — flat colors from the design system
SHOPS = {
    "Nakato Fresh Produce": {  # Uganda — farm produce
        "bg": (45, 89, 66), "accent": (74, 124, 96), "logo": (45, 89, 66),
        "letter": "N", "tag": "FARM PRODUCE · KAMPALA",
    },
    "Jomo Scrap Traders": {  # Kenya — scrap metal
        "bg": (128, 74, 40), "accent": (158, 100, 60), "logo": (128, 74, 40),
        "letter": "J", "tag": "SCRAP & RECYCLABLES · NAIROBI",
    },
    "Neema Dagaa Traders": {  # Tanzania — dagaa & grains
        "bg": (26, 98, 104), "accent": (52, 124, 130), "logo": (26, 98, 104),
        "letter": "N", "tag": "DAGAA & GRAINS · DAR ES SALAAM",
    },
}


def darken(c, amount=26):
    return tuple(max(0, v - amount) for v in c)


def make_cover(name: str, theme: dict) -> str:
    # Clean patterned banner — deliberately text-free: the UI already shows the
    # shop name right under the cover, and real sellers upload photos, not ads.
    img = Image.new("RGB", (960, 410), theme["bg"])
    d = ImageDraw.Draw(img)
    # Calm geometric rhythm: three flat discs bleeding off the edges.
    d.ellipse([640, -160, 1120, 320], fill=theme["accent"])
    d.ellipse([-120, 240, 260, 620], fill=darken(theme["bg"], 18))
    d.ellipse([440, 300, 700, 560], fill=darken(theme["bg"], 10))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=78)
    b = buf.getvalue()
    print(f"cover {name}: {len(b)} bytes")
    return "data:image/jpeg;base64," + base64.b64encode(b).decode()


def make_logo(letter: str, theme: dict) -> str:
    img = Image.new("RGB", (480, 480), theme["logo"])
    d = ImageDraw.Draw(img)
    d.ellipse([312, 312, 560, 560], fill=theme["accent"])
    f = ImageFont.truetype(FONT_BOLD, 260)
    box = d.textbbox((0, 0), letter, font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((480 - w) / 2 - box[0], (480 - h) / 2 - box[1] - 10), letter, font=f, fill=(250, 248, 243))
    d.rectangle([140, 396, 340, 412], fill=(250, 248, 243))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    b = buf.getvalue()
    print(f"logo {letter}: {len(b)} bytes")
    return "data:image/jpeg;base64," + base64.b64encode(b).decode()


def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    for name, theme in SHOPS.items():
        cover = make_cover(name, theme)
        logo = make_logo(theme["letter"], theme)
        cur.execute(
            "UPDATE BusinessProfile SET cover = ?, logo = ? WHERE businessName = ?",
            (cover, logo, name),
        )
        print(f"{cur.rowcount} row(s): {name}")
    con.commit()
    con.close()


if __name__ == "__main__":
    main()
